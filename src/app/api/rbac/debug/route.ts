// src/app/api/rbac/debug/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { PERMS } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function knownPermSet(): Set<string> {
  const vals = Array.isArray(PERMS) ? PERMS : Object.values(PERMS as any);
  return new Set(vals.map((x) => String(x)));
}

export async function GET(req: NextRequest) {
  // 🔒 Debug endpoints must be locked down.
  const auth = await requireApiUserContext(req, { requireTenant: true, requireRoleNames: ["SUPERADMIN"] });
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const { searchParams } = new URL(req.url);
  const userIdParam = String(searchParams.get("userId") ?? "").trim();

  // Tenant comes ONLY from session (ctx.tenantId). Never accept tenantId param.
  if (!userIdParam) return json(400, { ok: false, error: "userId is required" });

  const membership = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: userIdParam, status: "ACTIVE" },
    include: { role: { include: { rolePerms: { include: { permission: true } } } } },
  });

  if (!membership) {
    return json(200, {
      ok: true,
      tenantId: ctx.tenantId,
      userId: userIdParam,
      hasActiveMembership: false,
      permissions: [],
      checks: {},
    });
  }

  const permNames = new Set<string>(membership.role.rolePerms.map((rp) => rp.permission.name));
  const known = knownPermSet();

  return json(200, {
    ok: true,
    tenantId: ctx.tenantId,
    userId: userIdParam,
    hasActiveMembership: true,
    roleName: membership.role.name,
    effectiveRole: effectiveRole(membership.role.name),
    permissions: Array.from(permNames),
    checks: Object.fromEntries(Array.from(known).map((p) => [p, permNames.has(p)])),
  });
}
