// src/app/api/teacher/attendance/sessions/get/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import type { AttendanceStatus } from "@prisma/client";
import { StudentStatus } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z
  .object({
    sessionId: z.string().min(1, "Missing sessionId."),
    tenantId: z.string().optional(), // legacy
  })
  .strict();

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function toISODateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateAtUtcMidnight(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid dateISO.");
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");
  return d;
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  const url = new URL(req.url);
  const raw = {
    sessionId: url.searchParams.get("sessionId") ?? "",
    tenantId: url.searchParams.get("tenantId") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return jsonErr(400, parsed.error.issues[0]?.message || "Invalid query.");

  if (parsed.data.tenantId && parsed.data.tenantId !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id: parsed.data.sessionId, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      isClosed: true,
      closedAt: true,
      certifiedAt: true,
      takenByUserId: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
    },
  });

  if (!session) return jsonErr(404, "Attendance session not found.");

  try {
    await assertCanAccessClassroom({ ...safe, classroomId: session.classroomId });
  } catch (e: any) {
    return jsonErr(Number(e?.status) || 403, String(e?.message || "Forbidden."));
  }

  const dateISO = toISODateOnly(session.date);
  let dayKey: Date;
  try {
    dayKey = dateAtUtcMidnight(dateISO);
  } catch {
    return jsonErr(500, "Invalid session date stored.");
  }

  const [students, marks, health] = await prisma.$transaction([
    prisma.student.findMany({
      where: { tenantId: safe.tenantId, classroomId: session.classroomId, status: StudentStatus.ACTIVE },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    }),
    prisma.attendanceMark.findMany({
      where: { sessionId: session.id },
      select: { studentId: true, status: true, note: true },
    }),
    prisma.studentHealthDaily.findMany({
      where: { tenantId: safe.tenantId, classroomId: session.classroomId, date: dayKey },
      select: { studentId: true, temperatureC: true, symptoms: true, notes: true, sentToParentAt: true },
    }),
  ]);

  const marksByStudent = new Map(
    marks.map((m) => [m.studentId, { status: m.status as AttendanceStatus, note: m.note ?? null }])
  );

  const healthByStudent = new Map(
    health.map((h) => [
      h.studentId,
      {
        temperatureC: toNumber(h.temperatureC),
        symptoms: h.symptoms ?? null,
        notes: h.notes ?? null,
        sentToParentAt: h.sentToParentAt ? h.sentToParentAt.toISOString() : null,
      },
    ])
  );

  const classroom = session.classroom
    ? { id: session.classroom.id, name: session.classroom.name, grade: session.classroom.grade, arm: session.classroom.arm }
    : null;

  const classLabel = [
    session.classroom?.name ?? "Class",
    session.classroom?.grade ? `${session.classroom.grade}${session.classroom.arm ? ` ${session.classroom.arm}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return NextResponse.json(
    {
      ok: true,
      session: {
        id: session.id,
        tenantId: session.tenantId,
        classroomId: session.classroomId,
        date: dateISO,
        dateISO,
        isClosed: session.isClosed,
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        certifiedAt: session.certifiedAt ? session.certifiedAt.toISOString() : null,
        takenByUserId: session.takenByUserId ?? null,
      },
      classroom,
      classLabel,
      students: students.map((s) => {
        const m = marksByStudent.get(s.id) ?? { status: "PRESENT" as AttendanceStatus, note: null };
        const h = healthByStudent.get(s.id) ?? { temperatureC: null, symptoms: null, notes: null, sentToParentAt: null };

        return {
          id: s.id,
          firstName: s.firstName ?? "",
          lastName: s.lastName ?? "",
          guardianName: s.guardianName ?? null,
          guardianPhone: s.guardianPhone ?? null,
          guardianSmsOptIn: !!s.guardianSmsOptIn,
          healthConsentAt: s.healthConsentAt ? s.healthConsentAt.toISOString() : null,
          attendance: { status: m.status, note: m.note },
          health: {
            temperatureC: h.temperatureC,
            symptoms: h.symptoms,
            notes: h.notes,
            sentToParentAt: h.sentToParentAt,
          },
        };
      }),
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}