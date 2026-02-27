// src/lib/apiAuth.ts
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeRoleName, roleEffective, roleInAllowed } from "@/lib/policy";

export type ApiUserContext = {
  userId: string;
  tenantId: string; // empty string if not selected
  roleName: string | null;
  staffId: string | null;
  email: string;
  name: string | null;
};

type RawSessionUser = {
  id?: string;
  email?: string;
  name?: string | null;
  staffId?: string | null;
  tenantId?: string | null;
  roleName?: string | null;
};

function jsonFail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}) },
    { status }
  );
}

/**
 * API-safe auth: never redirects.
 * - returns { ok:true, ctx } when authenticated
 * - returns { ok:false, res } when unauthenticated/forbidden
 */
export async function requireApiUserContext(opts?: {
  requireTenant?: boolean;
  requireRoleNames?: string[];
}): Promise<{ ok: true; ctx: ApiUserContext } | { ok: false; res: NextResponse }> {
  const requireTenant = opts?.requireTenant ?? true;
  const requireRoleNames = opts?.requireRoleNames ?? null;

  const session = await getServerSession(authOptions);
  const u = (session?.user ?? null) as RawSessionUser | null;

  if (!u?.id || !u?.email) {
    return { ok: false, res: jsonFail(401, "UNAUTHENTICATED") };
  }

  const tenantId = (u.tenantId ?? null) as string | null;

  if (requireTenant && !tenantId) {
    return { ok: false, res: jsonFail(401, "NO_ACTIVE_TENANT") };
  }

  const ctx: ApiUserContext = {
    userId: String(u.id),
    tenantId: String(tenantId ?? ""),
    roleName: u.roleName ? roleEffective(u.roleName) : null,
    staffId: (u.staffId ?? null) as string | null,
    email: String(u.email),
    name: (u.name ?? null) as string | null,
  };

  // Role-gated routes must be verified against DB (ACTIVE membership)
  if (requireRoleNames?.length) {
    const tId = ctx.tenantId;
    if (!tId) return { ok: false, res: jsonFail(401, "NO_ACTIVE_TENANT") };

    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: tId } },
      select: { status: true, role: { select: { name: true } } },
    });

    if (!m || m.status !== "ACTIVE") {
      return { ok: false, res: jsonFail(403, "FORBIDDEN") };
    }

    const dbRole = roleEffective(m.role?.name ?? "");
    if (!roleInAllowed(dbRole, requireRoleNames)) {
      return { ok: false, res: jsonFail(403, "FORBIDDEN") };
    }

    // Align ctx role with DB truth
    ctx.roleName = dbRole || null;
  }

  return { ok: true, ctx };
}

/**
 * Back-compat helper:
 * If a route accepts tenantId in body/query, enforce it matches session tenant.
 */
export function enforceTenantMatchOr403(args: {
  sessionTenantId: string;
  providedTenantId: unknown;
}): { ok: true } | { ok: false; res: NextResponse } {
  const { sessionTenantId, providedTenantId } = args;

  const provided = String(providedTenantId ?? "").trim();
  if (!provided) return { ok: true }; // optional => ignore

  if (!sessionTenantId) return { ok: false, res: jsonFail(401, "NO_ACTIVE_TENANT") };

  if (provided !== sessionTenantId) {
    return { ok: false, res: jsonFail(403, "TENANT_MISMATCH") };
  }

  return { ok: true };
}
