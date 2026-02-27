// src/app/api/attendance/sessions/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function startOfDayUTC(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function defaultFromTo(): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 14);
  return { from, to: today };
}

function isISODateOnly(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// GET /api/attendance/sessions/list?tenantId=...&classroomId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  const tenantIdParam = String(searchParams.get("tenantId") || "").trim(); // back-compat only
  if (tenantIdParam && tenantIdParam !== auth.ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const classroomId = String(searchParams.get("classroomId") || "").trim();
  const fromStr = String(searchParams.get("from") || "").trim();
  const toStr = String(searchParams.get("to") || "").trim();

  if (!classroomId) return json(400, { ok: false, error: "classroomId is required" });

  // Verify classroom belongs to this tenant
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId },
    select: { id: true },
  });
  if (!classroom) return json(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });

  // Teacher classroom access
  // (assertCanAccessClassroom already handles tenant scoping internally)
  await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId });

  let from: Date, to: Date;
  if (fromStr && toStr) {
    if (!isISODateOnly(fromStr) || !isISODateOnly(toStr)) {
      return json(400, { ok: false, error: "from and to must be YYYY-MM-DD" });
    }
    from = startOfDayUTC(fromStr);
    to = startOfDayUTC(toStr);
    if (to < from) [from, to] = [to, from];
  } else {
    const d = defaultFromTo();
    from = d.from;
    to = d.to;
  }

  const toEndInclusive = new Date(to.getTime() + 24 * 3600 * 1000 - 1);

  const sessions = await prisma.attendanceSession.findMany({
    where: { tenantId: auth.ctx.tenantId, classroomId, date: { gte: from, lte: toEndInclusive } },
    select: { id: true, date: true, isClosed: true, certifiedAt: true },
    orderBy: { date: "desc" },
  });

  if (!sessions.length) return json(200, { ok: true, sessions: [] });

  const total = await prisma.student.count({ where: { tenantId: auth.ctx.tenantId, classroomId } });

  const sessionIds = sessions.map((s) => s.id);

  const grouped = await prisma.attendanceMark.groupBy({
    by: ["sessionId", "status"],
    where: { sessionId: { in: sessionIds } },
    _count: { _all: true },
  });

  const bySession = new Map<string, { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number }>();
  for (const g of grouped as any[]) {
    const sid = String(g.sessionId);
    const status = g.status as AttendanceStatus;
    const count = Number(g._count?._all ?? 0);
    if (!bySession.has(sid)) bySession.set(sid, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });
    const bucket = bySession.get(sid)!;
    if (status in bucket) (bucket as any)[status] = count;
  }

  const results = sessions.map((s) => {
    const counts = bySession.get(s.id) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    const pctPresent = total ? Math.round((counts.PRESENT / total) * 100) : 0;

    const state = s.certifiedAt ? "CERTIFIED" : s.isClosed ? "CLOSED" : "OPEN";

    return {
      sessionId: s.id,
      date: s.date.toISOString(),
      state,
      total,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      excused: counts.EXCUSED,
      pctPresent,
    };
  });

  return json(200, { ok: true, sessions: results });
}
