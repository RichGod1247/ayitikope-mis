import { FinanceOutboxEventType, FinanceOutboxStatus, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getGuardianEssentialAlertEligibilityMap } from "@/lib/essentialAlerts/enrollment";
import { loadCurrentFeeArrears } from "@/lib/finance/core";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEE_ACCOUNT_NOTICE_PURPOSE = "FEE_ACCOUNT_NOTICE" as const;
const ESSENTIAL_ALERT_AUTHORITY = "ESSENTIAL_ALERT_ENROLLMENT" as const;

const DEFAULT_FEES_ARREARS_TEMPLATE = [
  "Dear Parent/Guardian of {{studentName}},",
  "",
  "Our records show that fees of GHS {{amountDue}} for {{className}} ({{term}})",
  "are still outstanding as of {{dueDate}}.",
  "",
  "If you have already paid, kindly disregard this message.",
  "Otherwise, we encourage you to settle at your earliest convenience.",
  "",
  "Thank you,",
  "{{schoolName}}",
].join("\n");

const ItemSchema = z
  .object({
    invoiceId: z.string().min(5),
  })
  .passthrough();

const BodySchema = z.object({
  arrears: z.array(ItemSchema).min(1).max(250),
});

function jsonNoStore(payload: unknown, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normRole(value: unknown) {
  return clean(value).toUpperCase().replace(/\s+/g, "_");
}

function effectiveRole(value: unknown) {
  const role = normRole(value);
  if (role === "ADMIN") return "SCHOOL_ADMIN";
  if (role === "HEADMASTER") return "HEADTEACHER";
  return role;
}

async function requireAdminLike(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  if (!membership) return { ok: false as const, status: 403, error: "Forbidden." };

  const role = effectiveRole(membership.role?.name);
  if (!["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"].includes(role)) {
    return { ok: false as const, status: 403, error: "Forbidden." };
  }

  return { ok: true as const };
}

function renderTemplate(template: string, ctx: Record<string, string>) {
  let body = template;
  for (const [key, value] of Object.entries(ctx)) {
    body = body.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  }
  return body.trim();
}

function cedisFromPesewas(value: number) {
  return (Math.max(0, Math.floor(value)) / 100).toFixed(2);
}

function noticeDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function settingsRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

export async function POST(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };

  try {
    const current = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: current.tenantId, userId: current.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) {
    return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonNoStore(
      { ok: false, error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: parsed.error.issues[0]?.message || "Invalid request body." },
      { status: 400 },
    );
  }

  const invoiceIds = [
    ...new Set(parsed.data.arrears.map((item) => clean(item.invoiceId)).filter(Boolean)),
  ];

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { id: true, name: true, settingsJson: true, status: true },
        });

        if (!tenant || tenant.status !== "ACTIVE") {
          return { ok: false as const, status: 409, error: "TENANT_INACTIVE" };
        }

        const currentRows = await loadCurrentFeeArrears({
          tx,
          tenantId: ctx.tenantId,
          invoiceIds,
          limit: 250,
        });
        const rowByInvoiceId = new Map(currentRows.map((row) => [row.invoiceId, row]));

        const eligibilityMap = await getGuardianEssentialAlertEligibilityMap({
          tx,
          tenantId: ctx.tenantId,
          purpose: FEE_ACCOUNT_NOTICE_PURPOSE,
          students: currentRows.map((row) => ({
            id: row.studentId,
            guardianPhone: row.guardianPhone,
            guardianPhoneNorm: row.guardianPhoneNorm,
          })),
        });

        const settings = settingsRecord(tenant.settingsJson);
        const smsTemplates = settingsRecord(settings.smsTemplates as Prisma.JsonValue);
        const storedTemplate = smsTemplates.feesArrears;
        const template =
          typeof storedTemplate === "string" && storedTemplate.trim()
            ? storedTemplate.trim()
            : DEFAULT_FEES_ARREARS_TEMPLATE;

        const dayKey = new Date().toISOString().slice(0, 10);
        let eligibleCount = 0;
        let queuedCount = 0;
        let alreadyHandledCount = 0;
        let skippedCount = 0;
        let blockedCount = 0;
        const results: Array<Record<string, unknown>> = [];

        for (const invoiceId of invoiceIds) {
          const row = rowByInvoiceId.get(invoiceId);
          if (!row) {
            skippedCount += 1;
            results.push({ invoiceId, ok: false, status: "SKIPPED", reason: "CURRENT_ARREARS_NOT_FOUND" });
            continue;
          }

          const eligibility = eligibilityMap.get(row.studentId);
          const authorizedPhone = eligibility?.eligible ? eligibility.phoneNorm : null;

          if (!authorizedPhone) {
            skippedCount += 1;
            await tx.auditLog.create({
              data: {
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                action: "FINANCE_SMS_ESSENTIAL_ALERT_SKIPPED",
                resource: "FeeInvoice",
                resourceId: row.invoiceId,
                metadata: {
                  eventType: "SMS_ARREARS_NOTICE",
                  studentId: row.studentId,
                  essentialAlertPurpose: FEE_ACCOUNT_NOTICE_PURPOSE,
                  eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
                  eligibilityReason: eligibility?.reason ?? "NOT_ENROLLED",
                  providerCalled: false,
                  rawPhoneIncluded: false,
                },
              },
            });
            results.push({
              invoiceId,
              studentId: row.studentId,
              ok: false,
              status: "SKIPPED",
              reason: eligibility?.reason ?? "NOT_ENROLLED",
            });
            continue;
          }

          eligibleCount += 1;
          const dueDate = noticeDate(row.dueDate);
          const message = renderTemplate(template, {
            studentName: row.studentName,
            amountDue: cedisFromPesewas(row.balancePesewas),
            className: row.className || "Class",
            term: row.term || "Term",
            dueDate,
            schoolName: tenant.name,
          });
          const idempotencyKey = `arrears-sms:${row.invoiceId}:${dayKey}`;

          const event = await tx.financeOutboxEvent.upsert({
            where: {
              type_idempotencyKey: {
                type: FinanceOutboxEventType.SMS_ARREARS_NOTICE,
                idempotencyKey,
              },
            },
            create: {
              tenantId: ctx.tenantId,
              type: FinanceOutboxEventType.SMS_ARREARS_NOTICE,
              status: FinanceOutboxStatus.PENDING,
              idempotencyKey,
              aggregateType: "FeeInvoice",
              aggregateId: row.invoiceId,
              payload: {
                tenantId: ctx.tenantId,
                actorId: ctx.userId,
                to: authorizedPhone,
                message,
                template: "FEES_ARREARS",
                invoiceId: row.invoiceId,
                studentId: row.studentId,
                balancePesewas: row.balancePesewas,
                term: row.term,
                academicYear: row.academicYear,
                dueDate,
                className: row.className,
                noticeDateKey: dayKey,
                essentialAlertPurpose: FEE_ACCOUNT_NOTICE_PURPOSE,
                eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
              },
              priority: 4,
              maxAttempts: 5,
              nextAttemptAt: new Date(),
            },
            update: {},
            select: { id: true, status: true },
          });

          if (event.status === FinanceOutboxStatus.COMPLETED) {
            alreadyHandledCount += 1;
          } else if (
            event.status === FinanceOutboxStatus.DEAD ||
            event.status === FinanceOutboxStatus.CANCELLED
          ) {
            blockedCount += 1;
          } else {
            queuedCount += 1;
          }

          results.push({
            invoiceId: row.invoiceId,
            studentId: row.studentId,
            ok: true,
            status: event.status,
            outboxEventId: event.id,
          });
        }

        return {
          ok: true as const,
          requested: invoiceIds.length,
          eligibleCount,
          queuedCount,
          alreadyHandledCount,
          skippedCount,
          blockedCount,
          results,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    if (!result.ok) {
      return jsonNoStore({ ok: false, error: result.error }, { status: result.status });
    }

    return jsonNoStore(result, { status: 200 });
  } catch (error) {
    console.error("[FEES_NOTIFY_ARREARS_ERROR]", error);
    return jsonNoStore({ ok: false, error: "FAILED_TO_QUEUE_ARREARS_REMINDERS" }, { status: 500 });
  }
}
