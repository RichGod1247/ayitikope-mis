// src/app/api/admin/sms/templates/attendance-health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ATTENDANCE_TEMPLATE = `
Dear Parent/Guardian, this is {{schoolName}}.

{{studentName}}'s attendance for {{classLabel}} on {{date}} was recorded as: {{statusLabel}}. {{temperature}} {{symptoms}}

This message is for your awareness only. Please check on your child and contact the class teacher if you have any questions. Thank you.
`.trim();

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

export async function GET(request: NextRequest) {
  // Auth + tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ redirectTo: "/auth/signin", requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  // Optional tenantId param (must match session tenant)
  const { searchParams } = new URL(request.url);
  const tenantIdParam = (searchParams.get("tenantId") ?? "").trim();
  if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const settings = (tenant.settingsJson as any) || {};
    const stored = settings?.smsTemplates?.attendanceHealthAlert?.body ?? null;

    const templateBody =
      typeof stored === "string" && stored.trim().length > 0 ? stored : DEFAULT_ATTENDANCE_TEMPLATE;

    return jsonNoStore({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name ?? "School",
      template: templateBody,
      usesDefault: !(typeof stored === "string" && stored.trim().length > 0),
    });
  } catch (err: any) {
    console.error("[ATT_HEALTH_TEMPLATE_GET_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Internal error loading attendance/health template." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Auth + tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ redirectTo: "/auth/signin", requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  const ct = request.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  try {
    const body = (await request.json()) as { tenantId?: string; template?: string };

    const tenantId = (body.tenantId ?? "").trim() || ctx.tenantId;
    const template = (body.template ?? "").trim();

    if (tenantId !== ctx.tenantId) {
      return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (!template) {
      return jsonNoStore({ ok: false, error: "Template body must not be empty." }, { status: 400 });
    }

    if (template.length > 2000) {
      return jsonNoStore(
        { ok: false, error: "Template is too long. Keep it under 2000 characters." },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const existingSettings = (tenant.settingsJson as any) || {};
    const smsTemplates = existingSettings.smsTemplates || {};

    const updatedSettings = {
      ...existingSettings,
      smsTemplates: {
        ...smsTemplates,
        attendanceHealthAlert: {
          body: template,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { settingsJson: updatedSettings as any },
      select: { id: true },
    });

    return jsonNoStore({
      ok: true,
      tenantId: ctx.tenantId,
      message: "Attendance/health SMS template saved successfully.",
    });
  } catch (err: any) {
    console.error("[ATT_HEALTH_TEMPLATE_SAVE_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Internal error saving attendance/health template." },
      { status: 500 }
    );
  }
}
