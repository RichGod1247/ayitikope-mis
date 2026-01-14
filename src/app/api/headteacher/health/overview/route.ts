// src/app/api/fees/notify-arrears/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type ArrearsItem = {
  studentId?: string;
  studentName: string;
  guardianPhone: string;
  className?: string;
  term?: string;
  amountDue?: string | number;
  dueDate?: string;
};

// Brand type derived from BrandName tuple in sms/hubtel.ts
type Brand = (typeof BrandName)[number];

// For fees reminders we send via the admin brand
const FEES_BRAND: Brand = "AYITIADMIN";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

// Simple template renderer for {{placeholders}}
function renderTemplate(template: string, ctx: Record<string, string>): string {
  let body = template;
  for (const [key, value] of Object.entries(ctx)) {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    body = body.replace(re, value);
  }
  return body;
}

function safeMoney(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2);
  if (typeof v === "string" && v.trim()) return v.trim();
  return "0.00";
}

async function requireAdminLike(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!membership) return { ok: false as const, status: 403, error: "Forbidden." };
  const roleName = String(membership.role?.name ?? "").toUpperCase();
  const isAdminLike = roleName.includes("ADMIN") || roleName.includes("HEAD");
  if (!isAdminLike) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  // Auth + tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/auth/signin",
      requireTenant: true,
    });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const { tenantId: tenantIdRaw, arrears } = body as { tenantId?: string; arrears?: ArrearsItem[] };

    const tenantId = (tenantIdRaw ?? "").trim() || ctx.tenantId;
    if (tenantId !== ctx.tenantId) {
      return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (!Array.isArray(arrears) || arrears.length === 0) {
      return jsonNoStore({ ok: false, error: "Payload must include a non-empty 'arrears' array." }, { status: 400 });
    }

    // Load tenant + template
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    });

    const schoolName = (tenant?.name ?? "").trim() || "your ward's school";

    const settings = (tenant?.settingsJson as any) || {};
    const smsTemplates = (settings.smsTemplates as any) || {};
    const storedTemplate = smsTemplates.feesArrears;

    const template =
      typeof storedTemplate === "string" && storedTemplate.trim().length > 0
        ? storedTemplate
        : DEFAULT_FEES_ARREARS_TEMPLATE;

    let successCount = 0;
    const results: any[] = [];

    for (const item of arrears) {
      const guardianPhone = (item.guardianPhone || "").trim();
      if (!guardianPhone) {
        results.push({
          studentName: item.studentName,
          guardianPhone,
          ok: false,
          error: "No guardian phone; skipped.",
          to: "",
        });
        continue;
      }

      const amountStr = safeMoney(item.amountDue);

      const ctxTpl = {
        studentName: (item.studentName || "your ward").trim(),
        amountDue: amountStr,
        className: (item.className || "").trim(),
        term: (item.term || "").trim(),
        dueDate: (item.dueDate || "").trim(),
        schoolName,
      };

      const smsBody = renderTemplate(template, ctxTpl);

      try {
        const sendResult = await sendViaHubtel({
          to: guardianPhone,
          body: smsBody,
          brand: FEES_BRAND,
          meta: {
            kind: "fees-arrears",
            tenantId: ctx.tenantId,
            studentId: item.studentId ?? null,
            className: item.className ?? null,
            term: item.term ?? null,
            amountDue: amountStr,
          },
        });

        if (sendResult.ok) successCount++;

        results.push({
          studentName: item.studentName,
          guardianPhone,
          amountDue: amountStr,
          ok: sendResult.ok,
          to: (sendResult as any).to ?? guardianPhone,
          providerResponse: (sendResult as any).providerResponse ?? null,
        });
      } catch (err: any) {
        console.error("[FEES_NOTIFY_ARREARS_ERROR]", err);
        results.push({
          studentName: item.studentName,
          guardianPhone,
          amountDue: amountStr,
          ok: false,
          error: err?.message || "Failed to send SMS",
          to: "",
        });
      }
    }

    const first = arrears[0] ?? {};
    return jsonNoStore({
      ok: true,
      total: arrears.length,
      successCount,
      brand: FEES_BRAND,
      className: first.className ?? "",
      term: first.term ?? "",
      dueDate: first.dueDate ?? "",
      results,
    });
  } catch (err) {
    console.error("[FEES_NOTIFY_ARREARS_FATAL]", err);
    return jsonNoStore({ ok: false, error: "Internal error while sending fee reminders." }, { status: 500 });
  }
}
