// src/app/api/admin/sms/templates/attendance-health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ATTENDANCE_TEMPLATE = `
Dear Parent/Guardian, this is {{schoolName}}.

{{studentName}}'s attendance for {{classLabel}} on {{date}} was recorded as: {{statusLabel}}. {{temperature}} {{symptoms}}

This message is for your awareness only. Please check on your child and contact the class teacher if you have any questions. Thank you.
`.trim();

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function readTemplate(settings: any): { template: string; isDefault: boolean; meta: any } {
  const smsTemplates = (settings?.smsTemplates ?? {}) as any;
  const metaStore = (settings?.smsTemplatesMeta ?? {}) as any;

  const nested = smsTemplates?.attendanceHealthAlert?.body;
  const flatA = smsTemplates?.attendanceHealth;
  const flatB = smsTemplates?.attendanceHealthAlert;

  const stored =
    (typeof nested === "string" && nested.trim()) ||
    (typeof flatA === "string" && flatA.trim()) ||
    (typeof flatB === "string" && flatB.trim()) ||
    "";

  const template = stored ? stored : DEFAULT_ATTENDANCE_TEMPLATE;
  const isDefault = !stored;

  const m = metaStore?.attendanceHealthAlert ?? metaStore?.attendanceHealth ?? null;

  return {
    template,
    isDefault,
    meta: {
      lastUpdatedBy: m?.updatedBy ?? null,
      lastUpdatedAt: m?.updatedAt ?? null,
    },
  };
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
      select: { id: true, name: true, settingsJson: true },
    });

    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const settings = (tenant.settingsJson as any) || {};
    const r = readTemplate(settings);

    return jsonNoStore({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name ?? "School",
      template: r.template,
      isDefault: r.isDefault,
      meta: r.meta,
    });
  } catch (err) {
    console.error("[SMS_TEMPLATE_ATT_HEALTH_GET_ERROR]", err);
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
  if (template.length > 2000) return jsonNoStore({ ok: false, error: "TEMPLATE_TOO_LONG" }, 400);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.ctx.tenantId },
      select: { id: true, settingsJson: true, name: true },
    });
    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const existing = (tenant.settingsJson as any) || {};
    const smsTemplates = (existing.smsTemplates as any) || {};
    const smsTemplatesMeta = (existing.smsTemplatesMeta as any) || {};
    const nowIso = new Date().toISOString();

    const nextSettings = {
      ...existing,
      smsTemplates: {
        ...smsTemplates,
        attendanceHealthAlert: { body: template },
        attendanceHealth: template, // legacy readers
      },
      smsTemplatesMeta: {
        ...smsTemplatesMeta,
        attendanceHealthAlert: { updatedAt: nowIso, updatedBy: auth.ctx.userId },
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
      tenantName: tenant.name ?? "School",
      template,
      meta: { lastUpdatedBy: auth.ctx.userId, lastUpdatedAt: nowIso },
    });
  } catch (err) {
    console.error("[SMS_TEMPLATE_ATT_HEALTH_SAVE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_SAVE_TEMPLATE" }, 500);
  }
}
