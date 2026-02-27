// src/app/api/consent/students/update/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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
  if (roleName === "HT") return true;
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
    if (r && typeof r === "object" && "ok" in r) {
      if (r.ok === false) return { res: r.res as Response };
      return { ctx: r.ctx ?? r };
    }
    return { ctx: r };
  } catch (err: any) {
    if (isNextRedirectError(err)) return { res: jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401) };
    console.error("consent/students/update auth error:", err);
    return { res: jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401) };
  }
}

async function ensureConsentEdit(userId: string, tenantId: string, ctx: any) {
  // head/admin can edit in MVP
  const ctxRoles = extractCtxRoleNames(ctx);
  if (ctxRoles.some(looksLikeHeadOrAdmin)) return true;

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
  return perms.has("CONSENT_EDIT");
}

export async function POST(req: NextRequest) {
  const auth = await requireApiCtx();
  if ("res" in auth) return auth.res;

  const ctx = auth.ctx;
  const tenantId = pickTenantId(ctx);
  const actorId = pickUserId(ctx);

  if (!tenantId || !actorId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const allowed = await ensureConsentEdit(actorId, tenantId, ctx);
  if (!allowed) return jsonNoStore({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    const body = await req.json().catch(() => ({} as any));
    const studentId: string | undefined = typeof body?.studentId === "string" ? body.studentId.trim() : undefined;
    if (!studentId) return jsonNoStore({ ok: false, error: "studentId is required" }, 400);

    const hasSmsOptIn = typeof body?.smsOptIn === "boolean";
    const smsOptIn: boolean | undefined = hasSmsOptIn ? Boolean(body.smsOptIn) : undefined;

    let healthConsentAt: Date | null | undefined;
    if (Object.prototype.hasOwnProperty.call(body, "healthConsentAt")) {
      if (body.healthConsentAt === null) {
        healthConsentAt = null;
      } else if (typeof body.healthConsentAt === "string" && body.healthConsentAt.trim()) {
        const d = new Date(body.healthConsentAt);
        healthConsentAt = isNaN(d.getTime()) ? undefined : d;
      } else {
        healthConsentAt = undefined;
      }
    } else {
      healthConsentAt = undefined;
    }

    const current = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tenantId: true, guardianSmsOptIn: true, healthConsentAt: true },
    });

    if (!current) return jsonNoStore({ ok: false, error: "Student not found" }, 404);
    if (current.tenantId !== tenantId) return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, 403);

    const data: Record<string, any> = {};
    if (hasSmsOptIn) data.guardianSmsOptIn = smsOptIn;
    if (healthConsentAt !== undefined) data.healthConsentAt = healthConsentAt;

    if (!Object.keys(data).length) return jsonNoStore({ ok: true, updated: false }, 200);

    const updated = await prisma.student.update({
      where: { id: studentId },
      data,
      select: { id: true, tenantId: true, guardianSmsOptIn: true, healthConsentAt: true },
    });

    // audit best-effort
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: "CONSENT_STUDENT_UPDATE",
          resource: "Student",
          resourceId: updated.id,
          metadata: {
            before: {
              guardianSmsOptIn: current.guardianSmsOptIn,
              healthConsentAt: current.healthConsentAt ? current.healthConsentAt.toISOString() : null,
            },
            after: {
              guardianSmsOptIn: updated.guardianSmsOptIn,
              healthConsentAt: updated.healthConsentAt ? updated.healthConsentAt.toISOString() : null,
            },
          } as any,
        },
      });
    } catch (e) {
      console.warn("audit write failed (non-fatal):", e);
    }

    return jsonNoStore({ ok: true, updated: true }, 200);
  } catch (err) {
    console.error("consent/students/update error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_UPDATE" }, 500);
  }
}
