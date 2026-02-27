// src/app/api/admin/sms/templates/fees-arrears/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

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

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function getSmsBrandFromSettings(settings: any) {
  return settings?.smsBrand || settings?.smsSenderId || settings?.smsFrom || settings?.hubtelSenderId || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "HEADMASTER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const guard = assertNoTenantOverride(url.searchParams.get("tenantId"), auth.ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.ctx.tenantId },
      select: { id: true, name: true, settingsJson: true, updatedAt: true },
    });

    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const settings = (tenant.settingsJson as any) || {};
    const smsTemplates = (settings.smsTemplates as any) || {};
    const smsTemplatesMeta = (settings.smsTemplatesMeta as any) || {};

    const stored = typeof smsTemplates.feesArrears === "string" ? smsTemplates.feesArrears.trim() : "";
    const template = stored ? stored : DEFAULT_FEES_ARREARS_TEMPLATE;

    const meta = smsTemplatesMeta.feesArrears || {};
    const outMeta = {
      brand: getSmsBrandFromSettings(settings),
      lastUpdatedBy: meta.updatedBy ?? null,
      lastUpdatedAt: meta.updatedAt ?? tenant.updatedAt.toISOString(),
    };

    return jsonNoStore({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name ?? "School",
      template,
      isDefault: !stored,
      meta: outMeta,
    });
  } catch (err) {
    console.error("[SMS_TEMPLATE_FEES_ARREARS_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_TEMPLATE" }, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "HEADMASTER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const guard = assertNoTenantOverride(body?.tenantId ?? null, auth.ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const template = typeof body?.template === "string" ? body.template.trim() : "";
  if (!template) return jsonNoStore({ ok: false, error: "TEMPLATE_EMPTY" }, 400);
  if (template.length > 1200) return jsonNoStore({ ok: false, error: "TEMPLATE_TOO_LONG" }, 400);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.ctx.tenantId },
      select: { id: true, settingsJson: true },
    });
    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const existing = (tenant.settingsJson as any) || {};
    const smsTemplates = (existing.smsTemplates as any) || {};
    const smsTemplatesMeta = (existing.smsTemplatesMeta as any) || {};
    const nowIso = new Date().toISOString();

    const nextSettings = {
      ...existing,
      smsTemplates: { ...smsTemplates, feesArrears: template },
      smsTemplatesMeta: {
        ...smsTemplatesMeta,
        feesArrears: { updatedAt: nowIso, updatedBy: auth.ctx.userId },
      },
    };

    await prisma.tenant.update({
      where: { id: auth.ctx.tenantId },
      data: { settingsJson: nextSettings as any },
      select: { id: true },
    });

    return jsonNoStore({
      ok: true,
      tenantId: auth.ctx.tenantId,
      template,
      meta: { brand: getSmsBrandFromSettings(existing), lastUpdatedBy: auth.ctx.userId, lastUpdatedAt: nowIso },
    });
  } catch (err) {
    console.error("[SMS_TEMPLATE_FEES_ARREARS_SAVE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_SAVE_TEMPLATE" }, 500);
  }
}
