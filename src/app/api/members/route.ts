// src/app/api/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function effectiveRole(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = effectiveRole(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "FORBIDDEN" };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  // If legacy tenantId is supplied as a query param, validate ONLY when present.
  const tenantIdParam = req.nextUrl.searchParams.get("tenantId"); // string | null
  if (tenantIdParam) {
    const guard = assertNoTenantOverride(tenantIdParam, ctx.tenantId);
    if (!guard.ok) return json(guard.status, { ok: false, error: guard.error });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return json(roleOk.status, { ok: false, error: roleOk.error });

  const members = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      tenantId: true,
      userId: true,
      status: true,
      staffId: true,
      staffIdNorm: true,
      createdAt: true,
      updatedAt: true,
      role: { select: { id: true, name: true } },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          phoneNorm: true,
        },
      },
    },
  });

  return json(200, { ok: true, items: members });
}
