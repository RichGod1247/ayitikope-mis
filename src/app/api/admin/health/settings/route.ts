// src/app/api/admin/health/settings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthSettings = {
  feverThresholdC: number;
  notifyParentsOnFever: boolean;
  notifyHealthCenterOnFever: boolean;
  healthCenterName: string;
  healthCenterPhone: string;
};

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

function getDefaultHealthSettings(): HealthSettings {
  return {
    feverThresholdC: 38.0,
    notifyParentsOnFever: true,
    notifyHealthCenterOnFever: false,
    healthCenterName: "",
    healthCenterPhone: "",
  };
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
  // sane human range
  if (n <= 30 || n >= 45) return null;
  return Math.round(n * 10) / 10;
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

function readHealthFromSettingsJson(settingsJson: any): HealthSettings {
  const defaults = getDefaultHealthSettings();
  const health = settingsJson?.health;

  if (!health || typeof health !== "object") return defaults;

  const fever = parseFeverThreshold(health.feverThresholdC) ?? defaults.feverThresholdC;

  return {
    feverThresholdC: fever,
    notifyParentsOnFever: asBoolean(health.notifyParentsOnFever, defaults.notifyParentsOnFever),
    notifyHealthCenterOnFever: asBoolean(
      health.notifyHealthCenterOnFever,
      defaults.notifyHealthCenterOnFever
    ),
    healthCenterName: clampString(health.healthCenterName, 120),
    healthCenterPhone: clampString(health.healthCenterPhone, 40),
  };
}

export async function GET() {
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

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const settingsJson = (tenant.settingsJson as any) || {};
    const healthSettings = readHealthFromSettingsJson(settingsJson);

    return jsonNoStore({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      healthSettings,
    });
  } catch (err) {
    console.error("[admin/health/settings] GET error", err);
    return jsonNoStore({ ok: false, error: "Failed to load health settings." }, { status: 500 });
  }
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
      return jsonNoStore({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const incoming = (body.healthSettings ?? body) as Partial<HealthSettings>;
    const defaults = getDefaultHealthSettings();

    const fever = parseFeverThreshold(incoming.feverThresholdC);
    if (fever == null) {
      return jsonNoStore(
        { ok: false, error: "Invalid feverThresholdC; please choose between 30 and 45 °C." },
        { status: 400 }
      );
    }

    const healthSettings: HealthSettings = {
      feverThresholdC: fever,
      notifyParentsOnFever: asBoolean(incoming.notifyParentsOnFever, defaults.notifyParentsOnFever),
      notifyHealthCenterOnFever: asBoolean(
        incoming.notifyHealthCenterOnFever,
        defaults.notifyHealthCenterOnFever
      ),
      healthCenterName: clampString(incoming.healthCenterName, 120),
      healthCenterPhone: clampString(incoming.healthCenterPhone, 40),
    };

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const existingSettings = (tenant.settingsJson as any) || {};
    const newSettings = {
      ...existingSettings,
      health: healthSettings,
    };

    const updated = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { settingsJson: newSettings as any },
      select: { id: true },
    });

    return jsonNoStore({
      ok: true,
      tenantId: updated.id,
      healthSettings,
    });
  } catch (err) {
    console.error("[admin/health/settings] POST error", err);
    return jsonNoStore({ ok: false, error: "Failed to save health settings." }, { status: 500 });
  }
}
