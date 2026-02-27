// src/app/api/attendance/sessions/reopen/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isIsoDateOnly(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function dateOnlyUTCFromISO(dateISO: string) {
  return new Date(Date.UTC(Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7)) - 1, Number(dateISO.slice(8, 10))));
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
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isTeacher(role: string) {
  return roleEffective(role) === "TEACHER";
}

type Body = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
};

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const tenantIdFromClient = String(body?.tenantId ?? "").trim();
  if (tenantIdFromClient && tenantIdFromClient !== auth.ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const classroomId = String(body?.classroomId ?? "").trim();
  const dateStr = String(body?.date ?? "").trim();
  if (!classroomId || !isIsoDateOnly(dateStr)) {
    return json(400, { ok: false, error: "classroomId and date (YYYY-MM-DD) are required" });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const role = roleEffective(membership.role?.name ?? "");

  const session = await prisma.attendanceSession.findFirst({
    where: { tenantId: auth.ctx.tenantId, classroomId, date: dateOnlyUTCFromISO(dateStr) },
    select: { id: true, classroomId: true, isClosed: true, certifiedAt: true, takenByUserId: true },
  });

  if (!session) return json(404, { ok: false, error: "SESSION_NOT_FOUND" });
  if (session.certifiedAt) return json(409, { ok: false, error: "SESSION_CERTIFIED_CANNOT_REOPEN" });

  if (isTeacher(role)) {
    await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId: session.classroomId });
    if (session.takenByUserId && session.takenByUserId !== auth.ctx.userId) {
      return json(403, { ok: false, error: "FORBIDDEN_NOT_OWNER" });
    }
  }

  if (!session.isClosed) {
    return json(200, { ok: true, sessionId: session.id, message: "Session already open" });
  }

  await prisma.attendanceSession.updateMany({
    where: { id: session.id, tenantId: auth.ctx.tenantId, certifiedAt: null, isClosed: true },
    data: { isClosed: false, closedAt: null },
  });

  return json(200, { ok: true, sessionId: session.id });
}
