// src/app/api/classrooms/route.ts
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

async function requireActiveMember(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "FORBIDDEN" };
  return { ok: true as const, roleName: m.role?.name ?? "" };
}

function normName(value: string) {
  // KG 1, KG-1, K.G.1 -> KG1
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

function normArm(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export async function GET(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  // Legacy tenantId in query: validate only if present (avoid string|null TS error)
  const tenantIdParam = req.nextUrl.searchParams.get("tenantId");
  if (tenantIdParam) {
    const guard = assertNoTenantOverride(tenantIdParam, ctx.tenantId);
    if (!guard.ok) return json(guard.status, { ok: false, error: guard.error });
  }

  const memberOk = await requireActiveMember(ctx.tenantId, ctx.userId);
  if (!memberOk.ok) return json(memberOk.status, { ok: false, error: memberOk.error });

  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ nameNorm: "asc" }, { armNorm: "asc" }],
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
      status: true,
      capacity: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json(200, { ok: true, items: classrooms });
}

export async function POST(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string; // legacy
    name?: string;
    grade?: string | null;
    arm?: string | null;
    capacity?: number | null;
    note?: string | null;
  };

  // Legacy tenantId in body: validate only if present
  if (body.tenantId) {
    const guard = assertNoTenantOverride(String(body.tenantId).trim(), ctx.tenantId);
    if (!guard.ok) return json(guard.status, { ok: false, error: guard.error });
  }

  const memberOk = await requireActiveMember(ctx.tenantId, ctx.userId);
  if (!memberOk.ok) return json(memberOk.status, { ok: false, error: memberOk.error });
  if (!isAdminLike(memberOk.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const name = String(body.name ?? "").trim();
  const grade = body.grade == null ? null : String(body.grade).trim() || null;
  const arm = body.arm == null ? null : String(body.arm).trim() || null;
  const capacity = body.capacity == null ? null : Number(body.capacity);
  const note = body.note == null ? null : String(body.note).trim() || null;

  if (!name) return json(400, { ok: false, error: "NAME_REQUIRED" });
  if (capacity != null && (!Number.isFinite(capacity) || capacity < 0)) {
    return json(400, { ok: false, error: "INVALID_CAPACITY" });
  }

  const nameNorm = normName(name);
  const armNorm = arm ? normArm(arm) : "";

  try {
    const created = await prisma.classroom.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        grade,
        arm,
        nameNorm,
        armNorm,
        capacity,
        note,
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        status: true,
        capacity: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(201, { ok: true, item: created });
  } catch (e: any) {
    // Prisma unique violation
    if (String(e?.code || "") === "P2002") {
      return json(409, { ok: false, error: "CLASSROOM_ALREADY_EXISTS" });
    }
    console.error("[CLASSROOM_CREATE_ERROR]", e);
    return json(500, { ok: false, error: "FAILED_TO_CREATE_CLASSROOM" });
  }
}
