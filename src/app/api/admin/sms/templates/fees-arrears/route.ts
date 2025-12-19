// src/app/api/admin/sms/templates/fees-arrears/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    console.warn("[FEES_TEMPLATE_TENANT_STRING_ID_FAIL]", e);
  }

  // If tenantId looks numeric, try Int form as well
  const asNumber = Number(tenantId);
  if (!Number.isNaN(asNumber)) {
    try {
      const t = await prisma.tenant.findUnique({
        where: { id: asNumber as any },
        select: { id: true, name: true, settings: true },
      });
      if (t) return t;
    } catch (e) {
      console.warn("[FEES_TEMPLATE_TENANT_INT_ID_FAIL]", e);
    }
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    const tenant = await findTenantFlexible(tenantId);

    // If we somehow can't find the tenant, still return a safe default template
    if (!tenant) {
      console.warn(
        "[FEES_TEMPLATE_GET_WARNING] Tenant not found for tenantId:",
        tenantId
      );
      return NextResponse.json({
        ok: true,
        tenantId,
        tenantName: "Unknown school",
        template: DEFAULT_FEES_ARREARS_TEMPLATE,
        isDefault: true,
        note: "Tenant not found; using default template only.",
      });
    }

    const settings = (tenant.settings as any) || {};
    const smsTemplates = (settings.smsTemplates as any) || {};
    const fromSettings = smsTemplates.feesArrears;

    const template =
      typeof fromSettings === "string" && fromSettings.trim().length > 0
        ? fromSettings
        : DEFAULT_FEES_ARREARS_TEMPLATE;

    return NextResponse.json({
      ok: true,
      tenantId,
      tenantName: tenant.name,
      template,
      isDefault: template === DEFAULT_FEES_ARREARS_TEMPLATE,
    });
  } catch (err) {
    console.error("[FEES_TEMPLATE_GET_ERROR]", err);
    // IMPORTANT: still return a safe default so the UI doesn’t flash an error
    return NextResponse.json(
      {
        ok: true,
        tenantId: null,
        tenantName: "Unknown school",
        template: DEFAULT_FEES_ARREARS_TEMPLATE,
        isDefault: true,
        note:
          "An internal error occurred; using default template. Check server logs for details.",
      },
      { status: 200 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { tenantId, template } = body as {
      tenantId?: string;
      template?: string;
    };

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (typeof template !== "string" || !template.trim()) {
      return NextResponse.json(
        { ok: false, error: "Template text cannot be empty." },
        { status: 400 }
      );
    }

    if (template.length > 1200) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Template is too long. Please keep it under 1200 characters for SMS compatibility.",
        },
        { status: 400 }
      );
    }

    // Try to fetch tenant in a flexible way
    const tenant = await findTenantFlexible(tenantId);

    if (!tenant) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tenant not found. Cannot save template. Please verify the tenantId.",
        },
        { status: 404 }
      );
    }

    const existing = (tenant.settings as any) || {};
    const existingSmsTemplates = (existing.smsTemplates as any) || {};

    const nextSettings = {
      ...existing,
      smsTemplates: {
        ...existingSmsTemplates,
        feesArrears: template.trim(),
      },
    };

    // IMPORTANT: use the actual DB id from `tenant`, not the raw string tenantId
    const whereId = (tenant as any).id;

    await prisma.tenant.update({
      where: { id: whereId as any },
      data: { settings: nextSettings },
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      template: template.trim(),
    });
  } catch (err) {
    console.error("[FEES_TEMPLATE_SAVE_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save fees arrears template." },
      { status: 500 }
    );
  }
}
