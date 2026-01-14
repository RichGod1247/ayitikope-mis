// src/app/api/teacher/attendance/sessions/summary/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid dateISO. Use YYYY-MM-DD.");
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");
  return d;
}

function toState(session: { isClosed: boolean; certifiedAt: Date | null } | null): SummaryState {
  if (!session) return "NONE";
  if (session.certifiedAt) return "CERTIFIED";
  if (session.isClosed) return "CLOSED";
  return "OPEN";
}

export async function GET(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  const url = new URL(req.url);
  const tenantIdParam = (url.searchParams.get("tenantId") || "").trim();
  if (tenantIdParam && tenantIdParam !== safe.tenantId) return jsonErr(403, "Forbidden (tenant mismatch).");

  const classroomId = (url.searchParams.get("classroomId") || "").trim();
  const dateISO = (url.searchParams.get("dateISO") || url.searchParams.get("date") || "").trim();
  if (!classroomId || !dateISO) return jsonErr(400, "classroomId and dateISO/date are required.");

  let date: Date;
  try {
    date = parseDateISO(dateISO);
  } catch (e: any) {
    return jsonErr(400, String(e?.message || "Invalid dateISO."));
  }

  try {
    await assertCanAccessClassroom({ ...safe, classroomId });
  } catch (e: any) {
    return jsonErr(Number(e?.status) || 403, String(e?.message || "Forbidden."));
  }

  const [studentCount, session] = await Promise.all([
    prisma.student.count({ where: { tenantId: safe.tenantId, classroomId } }),
    prisma.attendanceSession.findFirst({
      where: { tenantId: safe.tenantId, classroomId, date },
      select: { id: true, isClosed: true, certifiedAt: true },
    }),
  ]);

  let absent = 0;
  let late = 0;
  let excused = 0;

  if (session) {
    const [abs, lt, exc] = await Promise.all([
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: AttendanceStatus.ABSENT } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: AttendanceStatus.LATE } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: AttendanceStatus.EXCUSED } }),
    ]);
    absent = abs;
    late = lt;
    excused = exc;
  }

  const present = Math.max(0, studentCount - absent - late - excused);

  return NextResponse.json({
    ok: true,
    summary: {
      state: toState(session ? { isClosed: session.isClosed, certifiedAt: session.certifiedAt } : null),
      sessionId: session?.id ?? null,
      dateISO,
      classroomId,
      totals: { students: studentCount, present, absent, late, excused },
    },
  });
}
