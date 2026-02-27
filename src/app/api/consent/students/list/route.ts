// src/app/api/consent/students/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true; // common shorthand
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

function pickTenantId(ctx: any): string | null {
  const tid =
    ctx?.tenantId ??
    ctx?.activeTenantId ??
    ctx?.membership?.tenantId ??
    ctx?.membership?.tenant?.id ??
    ctx?.tenant?.id ??
    null;
  return typeof tid === "string" && tid.trim() ? tid.trim() : null;
}

function pickUserId(ctx: any): string | null {
  const uid = ctx?.userId ?? ctx?.user?.id ?? null;
  return typeof uid === "string" && uid.trim() ? uid.trim() : null;
}

function extractCtxRoleNames(ctx: any): string[] {
  const roles: any[] = [];
  if (Array.isArray(ctx?.roleNames)) roles.push(...ctx.roleNames);
  if (Array.isArray(ctx?.roles)) roles.push(...ctx.roles);
  if (ctx?.role?.name) roles.push(ctx.role.name);
  if (ctx?.membership?.role?.name) roles.push(ctx.membership.role.name);
  return roles.map(normRole).filter(Boolean);
}

async function requireApiCtx() {
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);

    // Support both shapes:
    // 1) ctx directly
    // 2) { ok:false,res } or { ok:true, ctx }
    if (r && typeof r === "object" && "ok" in r) {
      if (r.ok === false) return { res: r.res as Response };
      return { ctx: r.ctx ?? r };
    }

    return { ctx: r };
  } catch (err: any) {
    if (isNextRedirectError(err)) return { res: jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401) };
    console.error("consent/students/list auth error:", err);
    return { res: jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401) };
  }
}

async function ensureConsentView(userId: string, tenantId: string, ctx: any) {
  // 1) If ctx already indicates head/admin, allow
  const ctxRoles = extractCtxRoleNames(ctx);
  if (ctxRoles.some(looksLikeHeadOrAdmin)) return true;

  // 2) DB permission-first
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: {
      role: {
        select: {
          name: true,
          rolePerms: { select: { permission: { select: { name: true } } } },
        },
      },
    },
  });

  const roleName = normRole(m?.role?.name);
  if (looksLikeHeadOrAdmin(roleName)) return true;

  const perms = new Set((m?.role?.rolePerms ?? []).map((rp) => normRole(rp.permission?.name)));
  return perms.has("CONSENT_VIEW") || perms.has("CONSENT_EDIT") || perms.has("CONSENT_EXPORT");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiCtx();
  if ("res" in auth) return auth.res;

  const ctx = auth.ctx;
  const tenantId = pickTenantId(ctx);
  const userId = pickUserId(ctx);

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  // Back-compat: if someone still passes tenantId, it MUST match session tenant.
  const { searchParams } = new URL(req.url);
  const tenantIdParam = searchParams.get("tenantId")?.trim() || null;
  if (tenantIdParam && tenantIdParam !== tenantId) {
    return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, 403);
  }

  const allowed = await ensureConsentView(userId, tenantId, ctx);
  if (!allowed) return jsonNoStore({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    const rows = await prisma.student.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        healthConsentAt: true,
        guardianSmsOptIn: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
    });

    const items = rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      guardianName: r.guardianName,
      guardianPhone: r.guardianPhone,
      healthConsentAt: r.healthConsentAt ? r.healthConsentAt.toISOString() : null,
      smsOptIn: !!r.guardianSmsOptIn,
    }));

    return jsonNoStore({ ok: true, items }, 200);
  } catch (err) {
    console.error("consent/students/list error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD" }, 500);
  }
}
