import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);
const ELIGIBLE_STAFF_ROLES = new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const actorMembership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: auth.ctx.userId,
        tenantId: auth.ctx.tenantId,
      },
    },
    select: { status: true, role: { select: { name: true } } },
  });
  const actorRole = effectiveRole(actorMembership?.role?.name ?? auth.ctx.roleName)
    .trim()
    .toUpperCase();
  if (
    !actorMembership ||
    actorMembership.status !== "ACTIVE" ||
    !ALLOWED_ROLES.has(actorRole)
  ) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const userId = String(new URL(req.url).searchParams.get("userId") ?? "").trim();
  if (!userId) return json(400, { ok: false, error: "userId is required" });

  const membership = await prisma.membership.findFirst({
    where: { tenantId: auth.ctx.tenantId, userId, status: "ACTIVE" },
    select: {
      role: { select: { name: true } },
      user: {
        select: { id: true, name: true, email: true, phone: true, phoneNorm: true },
      },
    },
  });
  if (!membership || !ELIGIBLE_STAFF_ROLES.has(normalizeRole(membership.role?.name))) {
    return json(404, { ok: false, error: "Staff member not found" });
  }

  return json(200, {
    ok: true,
    user: {
      ...membership.user,
      role: normalizeRole(membership.role?.name),
    },
  });
}
