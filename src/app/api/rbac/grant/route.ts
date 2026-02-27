import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { PERMS } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  roleName?: string;
  perms?: string[];
};

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normRoleName(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function knownPermSet(): Set<string> {
  const vals = Array.isArray(PERMS) ? PERMS : Object.values(PERMS as any);
  return new Set(vals.map((x) => String(x)));
}

export async function POST(req: Request) {
  // 🔒 MVP: only SUPERADMIN can mutate RBAC (inside the active tenant session)
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const body = (await req.json().catch(() => ({}))) as Partial<Body>;

  const roleName = normRoleName(body.roleName);
  const permsRaw = Array.isArray(body.perms) ? body.perms : [];
  const perms = Array.from(new Set(permsRaw.map((p) => String(p ?? "").trim()).filter(Boolean)));

  if (!roleName || perms.length === 0) {
    return json(400, { ok: false, error: "roleName and perms[] are required" });
  }

  const known = knownPermSet();
  const unknown = perms.filter((p) => !known.has(p));
  if (unknown.length) {
    return json(400, { ok: false, error: "UNKNOWN_PERMS", unknown });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      // ✅ TENANT-SCOPED ROLE
      const role = await tx.role.upsert({
        where: { tenantId_name: { tenantId: ctx.tenantId, name: roleName } },
        update: {},
        create: {
          tenantId: ctx.tenantId,
          name: roleName,
          description: `Role ${roleName} for tenant ${ctx.tenantId}`,
        },
        select: { id: true, name: true },
      });

      for (const name of perms) {
        const perm = await tx.permission.upsert({
          where: { name },
          update: {},
          create: { name, description: `Permission: ${name}` },
          select: { id: true, name: true },
        });

        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }

      // Best-effort audit
      try {
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: "RBAC_GRANT_PERMS",
            resource: "ROLE",
            resourceId: role.id,
            metadata: { roleName: role.name, granted: perms } as any,
          },
        });
      } catch {}

      return { roleName: role.name, granted: perms };
    });

    return json(200, { ok: true, tenantId: ctx.tenantId, roleName: out.roleName, granted: out.granted });
  } catch (e: any) {
    console.error("rbac/grant error:", e);
    return json(500, { ok: false, error: "grant failed" });
  }
}
