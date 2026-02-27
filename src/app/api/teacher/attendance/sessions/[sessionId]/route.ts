// src/app/api/teacher/attendance/sessions/[sessionId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TEACHER_ROLES = new Set(["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN"]);
const ALLOWED_STATUSES = new Set(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

function nameOf(s: { firstName: string | null; lastName: string | null }) {
  return [s.firstName ?? "", s.lastName ?? ""].map((x) => x.trim()).filter(Boolean).join(" ") || "Learner";
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function assertTeacherCanAccessSession(opts: { sessionId: string; tenantId: string; userId: string; roleName?: string | null }) {
  const role = (opts.roleName ?? "").trim();
  if (!ALLOWED_TEACHER_ROLES.has(role)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN_ROLE" };
  }

  const profile = await prisma.teacherProfile.findFirst({
    where: { tenantId: opts.tenantId, userId: opts.userId },
    select: { primaryClassroomId: true },
  });

  if (!profile?.primaryClassroomId) {
    return { ok: false as const, status: 403, error: "NO_PRIMARY_CLASS_ASSIGNED" };
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
  if (session.classroomId !== profile.primaryClassroomId) {
    return { ok: false as const, status: 403, error: "FORBIDDEN_CLASSROOM" };
  }

  return { ok: true as const, session };
}

export async function GET(_req: Request, ctxRoute: { params: { sessionId: string } }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const sessionId = (ctxRoute.params.sessionId ?? "").trim();
  if (!sessionId) return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 400 });

  const guard = await assertTeacherCanAccessSession({
    sessionId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
  });

  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const session = guard.session;

  const [students, marks] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: ctx.tenantId, classroomId: session.classroomId },
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
  for (const m of marks) marksByStudent[m.studentId] = { status: m.status, note: m.note ?? null };

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const s of students) {
    const st = marksByStudent[s.id]?.status ?? "ABSENT"; // shippable: missing mark => absent
    if (st in counts) (counts as any)[st] += 1;
  }

  const state = session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      dateISO: toISODate(session.date),
      state,
      isClosed: session.isClosed,
      certifiedAt: session.certifiedAt,
      classroom: session.classroom,
    },
    students: students.map((s) => ({ id: s.id, name: nameOf(s) })),
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
  if (!ctx) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const sessionId = (ctxRoute.params.sessionId ?? "").trim();
  if (!sessionId) return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 400 });

  const guard = await assertTeacherCanAccessSession({
    sessionId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
  });

  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  if (guard.session.certifiedAt) {
    return NextResponse.json({ ok: false, error: "SESSION_CERTIFIED_LOCKED" }, { status: 400 });
  }
  if (guard.session.isClosed) {
    return NextResponse.json({ ok: false, error: "SESSION_CLOSED_LOCKED" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { marks?: Array<{ studentId: string; status: string; note?: string | null }> }
    | null;

  const marks = body?.marks ?? [];
  if (!Array.isArray(marks) || marks.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_MARKS" }, { status: 400 });
  }

  // Validate
  for (const m of marks) {
    if (!m?.studentId || typeof m.studentId !== "string") {
      return NextResponse.json({ ok: false, error: "INVALID_STUDENT_ID" }, { status: 400 });
    }
    const st = String(m.status ?? "").toUpperCase();
    if (!ALLOWED_STATUSES.has(st)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
  }

  // Upsert marks (relies on @@unique([sessionId, studentId]) => sessionId_studentId in Prisma client)
  await prisma.$transaction(
    marks.map((m) =>
      prisma.attendanceMark.upsert({
        where: { sessionId_studentId: { sessionId: guard.session.id, studentId: m.studentId } },
        create: {
          sessionId: guard.session.id,
          studentId: m.studentId,
          status: String(m.status).toUpperCase() as any,
          note: m.note ?? null,
        },
        update: {
          status: String(m.status).toUpperCase() as any,
          note: m.note ?? null,
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
