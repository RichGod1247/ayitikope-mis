//src/app/api/admin/super/tenants/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "ACTIVATE" | "SUSPEND" | "ARCHIVE" | "RESTORE_TO_PENDING";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as any) : {};
}

function actionFrom(v: unknown): Action | null {
  const a = clean(v).toUpperCase();
  if (a === "ACTIVATE") return "ACTIVATE";
  if (a === "SUSPEND") return "SUSPEND";
  if (a === "ARCHIVE") return "ARCHIVE";
  if (a === "RESTORE_TO_PENDING") return "RESTORE_TO_PENDING";
  return null;
}

function nextStatusFor(action: Action): TenantStatus {
  if (action === "ACTIVATE") return TenantStatus.ACTIVE;
  if (action === "SUSPEND") return TenantStatus.SUSPENDED;
  if (action === "ARCHIVE") return TenantStatus.ARCHIVED;
  return TenantStatus.PENDING;
}

function reasonRequired(action: Action) {
  return action === "SUSPEND" || action === "ARCHIVE" || action === "RESTORE_TO_PENDING";
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({} as any));

  const tenantId = clean(body.tenantId);
  const action = actionFrom(body.action);
  const reason = clean(body.reason);

  if (!tenantId) return json({ ok: false, error: "TENANT_ID_REQUIRED" }, 400);
  if (!action) return json({ ok: false, error: "INVALID_ACTION" }, 400);

  if (reasonRequired(action) && reason.length < 10) {
    return json(
      {
        ok: false,
        error: "REASON_REQUIRED",
        message: "Provide a clear reason of at least 10 characters.",
      },
      400
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      status: true,
      schoolSector: true,
      settingsJson: true,
    },
  });

  if (!tenant) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

  const nextStatus = nextStatusFor(action);

  if (tenant.id === auth.ctx.tenantId && nextStatus !== TenantStatus.ACTIVE) {
    return json(
      {
        ok: false,
        error: "CANNOT_RESTRICT_CURRENT_SUPERADMIN_TENANT",
        message:
          "For safety, switch superadmin to another active platform tenant before suspending or archiving this tenant.",
      },
      400
    );
  }

  if (tenant.status === nextStatus) {
    return json({
      ok: true,
      item: {
        id: tenant.id,
        name: tenant.name,
        schoolCode: tenant.schoolCode,
        status: tenant.status,
        unchanged: true,
      },
    });
  }

  const nowIso = new Date().toISOString();
  const previousSettings = asObj(tenant.settingsJson);
  const previousEvents = Array.isArray(previousSettings.lifecycleEvents)
    ? previousSettings.lifecycleEvents.slice(-30)
    : [];

  const lifecycleEvent = {
    at: nowIso,
    action,
    fromStatus: tenant.status,
    toStatus: nextStatus,
    reason: reason || null,
    actorUserId: auth.ctx.userId,
  };

  const nextSettings = {
    ...previousSettings,
    tenantLifecycle: {
      lastAction: action,
      lastReason: reason || null,
      lastStatus: nextStatus,
      previousStatus: tenant.status,
      updatedAt: nowIso,
      updatedByUserId: auth.ctx.userId,
    },
    lifecycleEvents: [...previousEvents, lifecycleEvent],
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        status: nextStatus,
        settingsJson: nextSettings as any,
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        status: true,
        schoolSector: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: auth.ctx.userId,
        tenantId: tenant.id,
        action: `TENANT_${action}`,
        resource: "Tenant",
        resourceId: tenant.id,
        ip: getIpFromHeaders(req.headers),
        userAgent: getUserAgentFromHeaders(req.headers),
        metadata: {
          fromStatus: tenant.status,
          toStatus: nextStatus,
          reason: reason || null,
          schoolCode: tenant.schoolCode,
          schoolSector: tenant.schoolSector,
        } as any,
      },
    });

    return row;
  });

  return json({
    ok: true,
    item: updated,
  });
}