// src/app/api/teacher/attendance/sessions/[sessionId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus } from "@prisma/client";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TEACHER_ROLES = new Set(["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN"]);
const INPUT_STATUSES = new Set(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
const MANUAL_STATUSES = new Set(["PRESENT", "ABSENT"]);
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

function nameOf(s: { firstName: string | null; lastName: string | null }) {
  return [s.firstName ?? "", s.lastName ?? ""].map((x) => x.trim()).filter(Boolean).join(" ") || "Learner";
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function assertTeacherCanAccessSession(opts: {
  sessionId: string;
  tenantId: string;
  userId: string;
  roleName?: string | null;
}) {
  const role = (opts.roleName ?? "").trim();
  if (!ALLOWED_TEACHER_ROLES.has(role)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN_ROLE" };
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id: opts.sessionId, tenantId: opts.tenantId },
    select: {
      id: true,
      date: true,
      classroomId: true,
      isClosed: true,
      certifiedAt: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
    },
  });

  if (!session) return { ok: false as const, status: 404, error: "SESSION_NOT_FOUND" };

  try {
    await assertCanAccessClassroom({
      tenantId: opts.tenantId,
      userId: opts.userId,
      classroomId: session.classroomId,
    });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status) || 403;
    return {
      ok: false as const,
      status,
      error: status === 404 ? "SESSION_CLASSROOM_NOT_FOUND" : "FORBIDDEN_CLASSROOM",
    };
  }

  return { ok: true as const, session };
}

export async function GET(_req: Request, ctxRoute: { params: { sessionId: string } }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sessionId = (ctxRoute.params.sessionId ?? "").trim();
  if (!sessionId) return json({ ok: false, error: "MISSING_SESSION" }, 400);

  const guard = await assertTeacherCanAccessSession({
    sessionId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
  });

  if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status);

  const session = guard.session;

  const [students, marks] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: ctx.tenantId, classroomId: session.classroomId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 5000,
    }),
    prisma.attendanceMark.findMany({
      where: { sessionId: session.id },
      select: { studentId: true, status: true, note: true },
    }),
  ]);

  const marksByStudent: Record<string, { status: string; note: string | null }> = {};
  for (const mark of marks) {
    marksByStudent[mark.studentId] = { status: mark.status, note: mark.note ?? null };
  }

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const student of students) {
    const status = marksByStudent[student.id]?.status ?? "ABSENT"; // legacy route: missing mark => absent
    if (status in counts) counts[status as keyof typeof counts] += 1;
  }

  const state = session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";

  return json({
    ok: true,
    session: {
      id: session.id,
      dateISO: toISODate(session.date),
      state,
      isClosed: session.isClosed,
      certifiedAt: session.certifiedAt,
      classroom: session.classroom,
    },
    students: students.map((student) => ({ id: student.id, name: nameOf(student) })),
    marksByStudent,
    totals: {
      students: students.length,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      excused: counts.EXCUSED,
    },
  });
}

export async function POST(req: Request, ctxRoute: { params: { sessionId: string } }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sessionId = (ctxRoute.params.sessionId ?? "").trim();
  if (!sessionId) return json({ ok: false, error: "MISSING_SESSION" }, 400);

  const guard = await assertTeacherCanAccessSession({
    sessionId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
  });

  if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status);

  if (guard.session.certifiedAt) {
    return json({ ok: false, error: "SESSION_CERTIFIED_LOCKED" }, 400);
  }
  if (guard.session.isClosed) {
    return json({ ok: false, error: "SESSION_CLOSED_LOCKED" }, 400);
  }

  try {
    await assertAttendanceDateInCurrentTerm({
      tenantId: ctx.tenantId,
      date: guard.session.date,
    });
  } catch (error: unknown) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Attendance date is outside the current term.",
      },
      Number((error as { status?: number })?.status) || 409,
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { marks?: Array<{ studentId: string; status: string; note?: string | null }> }
    | null;

  const marks = body?.marks ?? [];
  if (!Array.isArray(marks) || marks.length === 0) {
    return json({ ok: false, error: "NO_MARKS" }, 400);
  }

  const studentIds: string[] = [];
  for (const mark of marks) {
    if (!mark?.studentId || typeof mark.studentId !== "string") {
      return json({ ok: false, error: "INVALID_STUDENT_ID" }, 400);
    }

    const status = String(mark.status ?? "").toUpperCase();
    if (!INPUT_STATUSES.has(status)) {
      return json({ ok: false, error: "INVALID_STATUS" }, 400);
    }

    studentIds.push(mark.studentId);
  }

  const uniqueStudentIds = Array.from(new Set(studentIds));
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: uniqueStudentIds },
      tenantId: ctx.tenantId,
      classroomId: guard.session.classroomId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (validStudents.length !== uniqueStudentIds.length) {
    return json({ ok: false, error: "STUDENT_OUTSIDE_SESSION_CLASSROOM" }, 400);
  }

  const existingMarks = await prisma.attendanceMark.findMany({
    where: {
      sessionId: guard.session.id,
      studentId: { in: uniqueStudentIds },
    },
    select: { studentId: true, status: true },
  });
  const existingStatusByStudent = new Map(
    existingMarks.map((row) => [row.studentId, row.status]),
  );

  for (const mark of marks) {
    const status = String(mark.status ?? "").toUpperCase();
    if (MANUAL_STATUSES.has(status)) continue;
    if (existingStatusByStudent.get(mark.studentId) !== status) {
      return json(
        {
          ok: false,
          error:
            "Manual attendance accepts only PRESENT or ABSENT. Existing Late/Excused records may be preserved until corrected.",
        },
        400,
      );
    }
  }

  await prisma.$transaction(
    marks.map((mark) =>
      prisma.attendanceMark.upsert({
        where: { sessionId_studentId: { sessionId: guard.session.id, studentId: mark.studentId } },
        create: {
          sessionId: guard.session.id,
          studentId: mark.studentId,
          status: String(mark.status).toUpperCase() as AttendanceStatus,
          note: mark.note ?? null,
        },
        update: {
          status: String(mark.status).toUpperCase() as AttendanceStatus,
          note: mark.note ?? null,
        },
      })
    )
  );

  return json({ ok: true });
}
