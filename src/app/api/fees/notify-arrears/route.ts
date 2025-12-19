// src/app/api/fees/notify-arrears/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

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

// Helper: try to find tenant whether `id` is String or Int
async function findTenantFlexible(tenantId: string) {
  // First try as-is (works if Prisma id is String)
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId as any },
      select: { id: true, name: true, settings: true },
    });
    if (t) return t;
  } catch (e) {
    console.warn("[FEES_NOTIFY_TENANT_STRING_ID_FAIL]", e);
  }

  // Then try as number if it looks numeric
  const asNumber = Number(tenantId);
  if (!Number.isNaN(asNumber)) {
    try {
      const t = await prisma.tenant.findUnique({
        where: { id: asNumber as any },
        select: { id: true, name: true, settings: true },
      });
      if (t) return t;
    } catch (e) {
      console.warn("[FEES_NOTIFY_TENANT_INT_ID_FAIL]", e);
    }
  }

  return null;
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { tenantId, arrears } = body as {
      tenantId?: string;
      arrears?: ArrearsItem[];
    };

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(arrears) || arrears.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Payload must include a non-empty 'arrears' array." },
        { status: 400 }
      );
    }

    // Load tenant + template
    const tenant = await findTenantFlexible(tenantId);
    const schoolName =
      (tenant && tenant.name) || "your ward's school";

    const settings = (tenant?.settings as any) || {};
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

      const amountStr =
        typeof item.amountDue === "number"
          ? item.amountDue.toFixed(2)
          : (item.amountDue || "0.00");

      const ctx = {
        studentName: item.studentName || "your ward",
        amountDue: amountStr,
        className: item.className || "",
        term: item.term || "",
        dueDate: item.dueDate || "",
        schoolName,
      };

      const smsBody = renderTemplate(template, ctx);

      try {
        const sendResult = await sendViaHubtel({
          to: guardianPhone,
          body: smsBody, // use the correct field name for HubtelSendParams
          brand: FEES_BRAND,
          meta: {
            kind: "fees-arrears",
            tenantId,
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
    const className = first.className ?? "";
    const term = first.term ?? "";
    const dueDate = first.dueDate ?? "";

    return NextResponse.json({
      ok: true,
      total: arrears.length,
      successCount,
      brand: FEES_BRAND,
      className,
      term,
      dueDate,
      results,
    });
  } catch (err) {
    console.error("[FEES_NOTIFY_ARREARS_FATAL]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error while sending fee reminders." },
      { status: 500 }
    );
  }
}
