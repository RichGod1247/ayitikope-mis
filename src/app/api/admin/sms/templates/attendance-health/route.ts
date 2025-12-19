// src/app/api/admin/sms/templates/attendance-health/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_ATTENDANCE_TEMPLATE = `
Dear Parent/Guardian, this is {{schoolName}}.

{{studentName}}'s attendance for {{classLabel}} on {{date}} was recorded as: {{statusLabel}}. {{temperature}} {{symptoms}}

This message is for your awareness only. Please check on your child and contact the class teacher if you have any questions. Thank you.
`.trim();

async function findTenantFlexible(tenantId: string) {
  // First try as string ID (current schema)
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId as any },
      select: { id: true, name: true, settings: true },
    });
    if (t) return t;
  } catch (err) {
    console.error("[ATT_HEALTH_TEMPLATE_TENANT_STRING_ID_FAIL]", err);
  }

  // Fallback: numeric ID (in case old data ever existed)
  const asNum = Number.parseInt(tenantId, 10);
  if (!Number.isNaN(asNum)) {
    try {
      const t = await prisma.tenant.findUnique({
        where: { id: asNum as any },
        select: { id: true, name: true, settings: true },
      });
      if (t) return t;
    } catch (err) {
      console.error("[ATT_HEALTH_TEMPLATE_TENANT_INT_ID_FAIL]", err);
    }
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId")?.trim() || "";

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId is required to load attendance/health template.",
      },
      { status: 400 }
    );
  }

  try {
    const tenant = await findTenantFlexible(tenantId);
    if (!tenant) {
      console.warn(
        "[ATT_HEALTH_TEMPLATE_GET_WARNING] Tenant not found for tenantId:",
        tenantId
      );
      return NextResponse.json({
        ok: true,
        tenantId,
        tenantName: "School",
        template: DEFAULT_ATTENDANCE_TEMPLATE,
        usesDefault: true,
      });
    }

    const settings = (tenant.settings || {}) as any;
    const stored =
      settings?.smsTemplates?.attendanceHealthAlert?.body ?? null;

    const templateBody =
      typeof stored === "string" && stored.trim().length > 0
        ? stored
        : DEFAULT_ATTENDANCE_TEMPLATE;

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name ?? "School",
      template: templateBody,
      usesDefault: !stored,
    });
  } catch (err: any) {
    console.error("[ATT_HEALTH_TEMPLATE_GET_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Internal error loading attendance/health template. Please contact the system administrator.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tenantId?: string;
      template?: string;
    };

    const tenantId = body.tenantId?.trim() || "";
    const template = (body.template ?? "").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { ok: false, error: "Template body must not be empty." },
        { status: 400 }
      );
    }

    const tenant = await findTenantFlexible(tenantId);
    if (!tenant) {
      console.error(
        "[ATT_HEALTH_TEMPLATE_SAVE_TENANT_NOT_FOUND]",
        tenantId
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tenant not found. Cannot save template. Please verify the tenantId.",
        },
        { status: 404 }
      );
    }

    const existingSettings = (tenant.settings || {}) as any;
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
      where: { id: tenant.id as any },
      data: {
        settings: updatedSettings as any,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      message: "Attendance/health SMS template saved successfully.",
    });
  } catch (err: any) {
    console.error("[ATT_HEALTH_TEMPLATE_SAVE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Internal error saving attendance/health template. Please contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
