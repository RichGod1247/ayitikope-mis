// src/app/api/admin/health/settings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthSettings = {
  feverThresholdC: number;
  notifyParentsOnFever: boolean;
  notifyHealthCenterOnFever: boolean;
  healthCenterName: string;
  healthCenterPhone: string;
};

function jsonNoStore(payload: any, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(headers ?? {}),
    },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

// Legacy compat: treat ADMIN as SCHOOL_ADMIN
function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r.includes("HEAD") || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "Forbidden." };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

function clampString(v: unknown, max = 120): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function asBoolean(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function parseFeverThreshold(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 30 || n >= 45) return null;
  return Math.round(n * 10) / 10;
}

function defaults(): HealthSettings {
  return {
    feverThresholdC: 38.0,
    notifyParentsOnFever: true,
    notifyHealthCenterOnFever: false,
    healthCenterName: "",
    healthCenterPhone: "",
  };
}

function readFromSettingsJson(settingsJson: any): HealthSettings {
  const d = defaults();
  const h = settingsJson?.health;
  if (!h || typeof h !== "object") return d;

  const fever = parseFeverThreshold(h.feverThresholdC) ?? parseFeverThreshold(h.feverThreshold) ?? d.feverThresholdC;

  return {
    feverThresholdC: fever,
    notifyParentsOnFever: asBoolean(h.notifyParentsOnFever, d.notifyParentsOnFever),
    notifyHealthCenterOnFever: asBoolean(h.notifyHealthCenterOnFever, d.notifyHealthCenterOnFever),
    healthCenterName: clampString(h.healthCenterName, 120),
    healthCenterPhone: clampString(h.healthCenterPhone, 40),
  };
}

export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  // Back-compat: if tenantId is passed, must match session tenant
  const { searchParams } = new URL(req.url);
  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    });

    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const settingsJson = (tenant.settingsJson as any) || {};
    const healthSettings = readFromSettingsJson(settingsJson);

    return jsonNoStore({ ok: true, tenantId: tenant.id, tenantName: tenant.name, healthSettings }, 200);
  } catch (err) {
    console.error("[ADMIN_HEALTH_SETTINGS_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_HEALTH_SETTINGS" }, 500);
  }
}

export async function POST(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

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

  // Back-compat: body.tenantId may exist, must match session tenant
  const guard = assertNoTenantOverride(body?.tenantId ?? null, ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const incoming = (body?.healthSettings ?? body ?? {}) as Partial<HealthSettings>;
  const fever = parseFeverThreshold(incoming.feverThresholdC);
  if (fever == null) {
    return jsonNoStore({ ok: false, error: "Invalid feverThresholdC (must be between 30 and 45)." }, 400);
  }

  const d = defaults();
  const healthSettings: HealthSettings = {
    feverThresholdC: fever,
    notifyParentsOnFever: asBoolean(incoming.notifyParentsOnFever, d.notifyParentsOnFever),
    notifyHealthCenterOnFever: asBoolean(incoming.notifyHealthCenterOnFever, d.notifyHealthCenterOnFever),
    healthCenterName: clampString(incoming.healthCenterName, 120),
    healthCenterPhone: clampString(incoming.healthCenterPhone, 40),
  };

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, settingsJson: true },
    });

    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const existing = (tenant.settingsJson as any) || {};
    const nextSettings = { ...existing, health: healthSettings };

    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { settingsJson: nextSettings as any },
      select: { id: true },
    });

    return jsonNoStore({ ok: true, tenantId: ctx.tenantId, healthSettings }, 200);
  } catch (err) {
    console.error("[ADMIN_HEALTH_SETTINGS_POST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_SAVE_HEALTH_SETTINGS" }, 500);
  }
}
