// src/app/api/attendance/sessions/certify/route.ts
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
  sessionId?: string;
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

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const role = roleEffective(membership.role?.name ?? "");

  const sessionId = String(body?.sessionId ?? "").trim();
  const classroomId = String(body?.classroomId ?? "").trim();
  const dateStr = String(body?.date ?? "").trim();

  let session:
    | { id: string; classroomId: string; isClosed: boolean; certifiedAt: Date | null; takenByUserId: string | null }
    | null = null;

  if (sessionId) {
    session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: auth.ctx.tenantId },
      select: { id: true, classroomId: true, isClosed: true, certifiedAt: true, takenByUserId: true },
    });
  } else if (classroomId && isIsoDateOnly(dateStr)) {
    const d = dateOnlyUTCFromISO(dateStr);
    session = await prisma.attendanceSession.findFirst({
      where: { tenantId: auth.ctx.tenantId, classroomId, date: d },
      select: { id: true, classroomId: true, isClosed: true, certifiedAt: true, takenByUserId: true },
    });
  } else {
    return json(400, { ok: false, error: "Provide sessionId OR (classroomId, date: YYYY-MM-DD)" });
  }

  if (!session) return json(404, { ok: false, error: "SESSION_NOT_FOUND" });

  // Classroom access + TEACHER ownership gate
  if (isTeacher(role)) {
    await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId: session.classroomId });
    if (session.takenByUserId && session.takenByUserId !== auth.ctx.userId) {
      return json(403, { ok: false, error: "FORBIDDEN_NOT_OWNER" });
    }
  }

  if (!session.isClosed) return json(409, { ok: false, error: "CLOSE_SESSION_BEFORE_CERTIFY" });

  if (session.certifiedAt) {
    return json(200, { ok: true, sessionId: session.id, certifiedAt: session.certifiedAt });
  }

  const now = new Date();

  await prisma.attendanceSession.updateMany({
    where: { id: session.id, tenantId: auth.ctx.tenantId, isClosed: true, certifiedAt: null },
    data: { certifiedAt: now, certifiedByUserId: auth.ctx.userId },
  });

  const updated = await prisma.attendanceSession.findFirst({
    where: { id: session.id, tenantId: auth.ctx.tenantId },
    select: { certifiedAt: true },
  });

  return json(200, { ok: true, sessionId: session.id, certifiedAt: updated?.certifiedAt ?? now });
}
