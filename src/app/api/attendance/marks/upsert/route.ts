// src/app/api/attendance/marks/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { AttendanceStatus as PrismaAttendanceStatus, Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const STATUS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
type AttendanceStatus = (typeof STATUS)[number];

function isAttendanceStatus(x: unknown): x is AttendanceStatus {
  return typeof x === "string" && (STATUS as readonly string[]).includes(x);
}

type UpsertItem = {
  studentId: string;
  status: AttendanceStatus;
  note?: string | null;
};

type Body = {
  sessionId?: string;
  items?: UpsertItem[];
  tenantId?: string; // legacy (ignored but can be checked elsewhere if you want)
};

export async function POST(req: Request) {
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
  const sessionId = body?.sessionId?.trim();
  const items = body?.items;

  if (!sessionId) return json(400, { ok: false, error: "Missing sessionId." });
  if (!Array.isArray(items) || items.length === 0) return json(400, { ok: false, error: "Missing items." });

  for (const it of items) {
    if (!it || typeof it.studentId !== "string" || !it.studentId.trim()) {
      return json(400, { ok: false, error: "Each item must include a valid studentId." });
    }
    if (!isAttendanceStatus(it.status)) {
      return json(400, { ok: false, error: `Invalid status for student ${it.studentId}.` });
    }
    if (it.note != null && typeof it.note !== "string") {
      return json(400, { ok: false, error: `Invalid note for student ${it.studentId}.` });
    }
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: auth.ctx.tenantId },
    select: { id: true, classroomId: true, date: true, isClosed: true, certifiedAt: true, isHoliday: true },
  });

  if (!session) return json(404, { ok: false, error: "Session not found." });
  if (session.isHoliday) {
    return json(409, {
      ok: false,
      error: "This day is recorded as a holiday. Learner marks are locked and excluded from the official register.",
    });
  }
  if (session.certifiedAt) return json(409, { ok: false, error: "Session is certified and cannot be edited." });
  if (session.isClosed) return json(409, { ok: false, error: "Session is closed. Reopen it before editing." });

  try {
    await assertCanAccessClassroom({
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
      classroomId: session.classroomId,
    });
    await assertAttendanceDateInCurrentTerm({
      tenantId: auth.ctx.tenantId,
      date: session.date,
    });
  } catch (error: unknown) {
    return json(Number((error as { status?: number })?.status) || 403, {
      ok: false,
      error: error instanceof Error ? error.message : "Forbidden.",
    });
  }

  const studentIds = items.map((i) => i.studentId);

  const valid = await prisma.student.findMany({
    where: { tenantId: auth.ctx.tenantId, classroomId: session.classroomId, id: { in: studentIds } },
    select: { id: true },
    take: studentIds.length,
  });

  if (valid.length !== studentIds.length) {
    return json(400, { ok: false, error: "One or more learners do not belong to this class." });
  }

  const existing = await prisma.attendanceMark.findMany({
    where: { sessionId: session.id, studentId: { in: studentIds } },
    select: { id: true, studentId: true, status: true },
  });
  const existingByStudent = new Map(existing.map((m) => [m.studentId, m]));

  for (const it of items) {
    if (it.status === "PRESENT" || it.status === "ABSENT") continue;
    const existingMark = existingByStudent.get(it.studentId);
    if (existingMark?.status !== it.status) {
      return json(400, {
        ok: false,
        error:
          "Manual attendance accepts only PRESENT or ABSENT. Existing Late/Excused records may be preserved until corrected.",
      });
    }
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const it of items) {
        const note = it.note?.trim() ? it.note.trim() : null;
        const existingMark = existingByStudent.get(it.studentId);

        if (existingMark) {
          await tx.attendanceMark.update({
            where: { id: existingMark.id },
            data: { status: PrismaAttendanceStatus[it.status], note },
          });
        } else {
          await tx.attendanceMark.create({
            data: {
              sessionId: session.id,
              studentId: it.studentId,
              status: PrismaAttendanceStatus[it.status],
              note,
            },
          });
        }
      }
    });
  } catch (error: unknown) {
    if (String((error as { message?: unknown })?.message ?? "").includes("ATTENDANCE_HOLIDAY_MARKS_LOCKED")) {
      return json(409, {
        ok: false,
        error: "This day was changed to a holiday while attendance was being saved. No holiday mark changes are allowed.",
      });
    }
    throw error;
  }

  return json(200, { ok: true, count: items.length });
}
