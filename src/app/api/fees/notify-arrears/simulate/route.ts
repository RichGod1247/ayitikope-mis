import { type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getGuardianEssentialAlertEligibilityMap } from "@/lib/essentialAlerts/enrollment";
import { loadCurrentFeeArrears } from "@/lib/finance/core";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEE_ACCOUNT_NOTICE_PURPOSE = "FEE_ACCOUNT_NOTICE" as const;

const DEFAULT_TEMPLATE = [
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
  tenantId: z.string().optional(),
  arrears: z.array(ItemSchema).min(1).max(500),
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

async function requireFeesAdminOrHead(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  if (!membership) return { ok: false as const, status: 403, error: "FORBIDDEN" };

  const role = effectiveRole(membership.role?.name);
  if (!["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"].includes(role)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true as const };
}

function renderTemplate(template: string, vars: Record<string, string>) {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  }
  return output.trim();
}

function settingsRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

function cedisFromPesewas(value: number) {
  return (Math.max(0, Math.floor(value)) / 100).toFixed(2);
}

function noticeDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;
  const roleOk = await requireFeesAdminOrHead(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) {
    return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: parsed.error.issues[0]?.message || "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const bodyTenantId = clean(parsed.data.tenantId);
  if (bodyTenantId && bodyTenantId !== ctx.tenantId) {
    return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, { status: 403 });
  }

  const invoiceIds = [
    ...new Set(parsed.data.arrears.map((item) => clean(item.invoiceId)).filter(Boolean)),
  ];

  const [tenant, currentRows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, settingsJson: true, status: true },
    }),
    loadCurrentFeeArrears({
      tenantId: ctx.tenantId,
      invoiceIds,
      limit: 500,
    }),
  ]);

  if (!tenant || tenant.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "TENANT_INACTIVE" }, { status: 409 });
  }

  const eligibilityMap = await getGuardianEssentialAlertEligibilityMap({
    tenantId: ctx.tenantId,
    purpose: FEE_ACCOUNT_NOTICE_PURPOSE,
    students: currentRows.map((row) => ({
      id: row.studentId,
      guardianPhone: row.guardianPhone,
      guardianPhoneNorm: row.guardianPhoneNorm,
    })),
  });

  const rowByInvoiceId = new Map(currentRows.map((row) => [row.invoiceId, row]));
  const settings = settingsRecord(tenant.settingsJson);
  const smsTemplates = settingsRecord(settings.smsTemplates as Prisma.JsonValue);
  const storedTemplate = smsTemplates.feesArrears;
  const template =
    typeof storedTemplate === "string" && storedTemplate.trim()
      ? storedTemplate.trim()
      : DEFAULT_TEMPLATE;

  const preview: Array<Record<string, unknown>> = [];
  const reasonCounts: Record<string, number> = {};
  let eligibleCount = 0;
  let skippedCount = 0;

  for (const invoiceId of invoiceIds) {
    const row = rowByInvoiceId.get(invoiceId);
    if (!row) {
      skippedCount += 1;
      reasonCounts.CURRENT_ARREARS_NOT_FOUND =
        (reasonCounts.CURRENT_ARREARS_NOT_FOUND ?? 0) + 1;
      continue;
    }

    const eligibility = eligibilityMap.get(row.studentId);
    if (!eligibility?.eligible || !eligibility.phoneNorm) {
      skippedCount += 1;
      const reason = eligibility?.reason ?? "NOT_ENROLLED";
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      continue;
    }

    eligibleCount += 1;
    if (preview.length < 3) {
      preview.push({
        invoiceId: row.invoiceId,
        studentId: row.studentId,
        studentName: row.studentName,
        to: eligibility.phoneNorm,
        amountDue: cedisFromPesewas(row.balancePesewas),
        message: renderTemplate(template, {
          studentName: row.studentName,
          amountDue: cedisFromPesewas(row.balancePesewas),
          className: row.className || "Class",
          term: row.term || "Term",
          dueDate: noticeDate(row.dueDate),
          schoolName: tenant.name,
        }),
      });
    }
  }

  return jsonNoStore({
    ok: true,
    tenantId: ctx.tenantId,
    requested: invoiceIds.length,
    total: eligibleCount,
    eligibleCount,
    skippedCount,
    reasonCounts,
    preview,
    providerCalled: false,
    outboxWritten: false,
  });
}
