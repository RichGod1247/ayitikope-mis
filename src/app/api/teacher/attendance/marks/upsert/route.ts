// src/app/api/teacher/attendance/marks/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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
};

export async function POST(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonError(401, "Unauthorized");
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const sessionId = body?.sessionId?.trim();
  const items = body?.items;

  if (!sessionId) return jsonError(400, "Missing sessionId.");
  if (!Array.isArray(items) || items.length === 0) return jsonError(400, "Missing items.");

  for (const it of items) {
    if (!it || typeof it.studentId !== "string" || !it.studentId.trim()) {
      return jsonError(400, "Each item must include a valid studentId.");
    }
    if (!isAttendanceStatus(it.status)) {
      return jsonError(400, `Invalid status for student ${it.studentId}.`);
    }
    if (it.note != null && typeof it.note !== "string") {
      return jsonError(400, `Invalid note for student ${it.studentId}.`);
    }
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: { id: true, classroomId: true, isClosed: true, certifiedAt: true },
  });

  if (!session) return jsonError(404, "Session not found.");
  if (session.certifiedAt) return jsonError(409, "Session is certified and cannot be edited.");
  if (session.isClosed) return jsonError(409, "Session is closed. Reopen it before editing.");

  const studentIds = items.map((i) => i.studentId);
  const validCount = await prisma.student.count({
    where: { tenantId: safe.tenantId, classroomId: session.classroomId, id: { in: studentIds } },
  });
  if (validCount !== studentIds.length) {
    return jsonError(400, "One or more learners do not belong to this class.");
  }

  // ✅ Production-grade: do NOT rely on compound-unique WhereUniqueInput names.
  // Fetch existing rows then update/create by id (stable across Prisma naming differences).
  const existing = await prisma.attendanceMark.findMany({
    where: { sessionId: session.id, studentId: { in: studentIds } },
    select: { id: true, studentId: true },
  });
  const existingByStudent = new Map(existing.map((m) => [m.studentId, m.id]));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const it of items) {
      const note = it.note?.trim() ? it.note.trim() : null;
      const existingId = existingByStudent.get(it.studentId);

      if (existingId) {
        await tx.attendanceMark.update({
          where: { id: existingId },
          data: { status: it.status, note },
        });
      } else {
        await tx.attendanceMark.create({
          data: {
            sessionId: session.id,
            studentId: it.studentId,
            status: it.status,
            note,
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true, count: items.length });
}
