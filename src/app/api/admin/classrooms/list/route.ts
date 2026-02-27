// src/app/api/admin/classrooms/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { ClassroomStatus } from "@prisma/client";

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

function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

function label(c: { name: string; grade: string | null; arm: string | null; status?: ClassroomStatus }) {
  const base = [c.name, c.grade, c.arm].filter(Boolean).join(" • ");
  if (c.status === ClassroomStatus.ARCHIVED) return `${base} (Archived)`;
  return base;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  // Optional tenantId param is allowed only if it matches session tenant (prevents leaks)
  const guard = assertNoTenantOverride(searchParams.get("tenantId"), auth.ctx.tenantId);
  if (!guard.ok) return json(guard.status, { ok: false, error: guard.error });

  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const includeArchived = searchParams.get("includeArchived") === "1";

  const classrooms = await prisma.classroom.findMany({
    where: {
      tenantId: auth.ctx.tenantId,
      ...(includeArchived ? {} : { status: ClassroomStatus.ACTIVE }),
    },
    select: { id: true, name: true, grade: true, arm: true, status: true },
    orderBy: [{ status: "asc" }, { grade: "asc" }, { name: "asc" }, { arm: "asc" }],
    take: 500,
  });

  return json(200, {
    ok: true,
    items: classrooms.map((c) => ({
      id: c.id,
      status: c.status,
      label: label({ name: c.name, grade: c.grade ?? null, arm: c.arm ?? null, status: c.status }),
    })),
  });
}
