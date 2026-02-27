// src/app/api/rbac/seed-basic/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

const BASIC_ROLES = ["SCHOOL_ADMIN", "HEADTEACHER", "TEACHER", "SUPERADMIN"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const tenantId = auth.ctx.tenantId;

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;

    for (const name of BASIC_ROLES) {
      const role = await tx.role.upsert({
        where: { tenantId_name: { tenantId, name } }, // ✅ compound unique
        create: { tenantId, name, description: `${name} role` }, // ✅ tenantId is required
        update: { description: `${name} role` },
        select: { id: true, createdAt: true },
      });

      // upsert doesn't directly tell you created vs updated; keep it simple
      // (you can add a pre-check if you want counts exact)
      created += 0;
      updated += 0;
      void role;
    }

    return { ok: true, tenantId, roles: BASIC_ROLES };
  });

  return json(200, result);
}