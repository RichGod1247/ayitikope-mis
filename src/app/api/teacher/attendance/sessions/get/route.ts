// src/app/api/teacher/attendance/sessions/get/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import type { AttendanceStatus } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z
  .object({
    sessionId: z.string().min(1, "Missing sessionId."),
    // tenantId may be sent by legacy clients; never trust it
    tenantId: z.string().optional(),
  })
  .strict();

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    }
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

// Prisma Decimal-safe to number
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

type StudentDTO = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianSmsOptIn: boolean;
  healthConsentAt: string | null;
};

type MarkDTO = {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
};

type HealthDTO = {
  studentId: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
  sentToParentAt: string | null;
};

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
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "Invalid query.";
    return jsonErr(400, msg);
  }

  if (parsed.data.tenantId && parsed.data.tenantId !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return jsonErr(403, "Forbidden.");

  const sessionId = parsed.data.sessionId;

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      takenByUserId: true,
      isClosed: true,
      closedAt: true,
      certifiedAt: true,
      classroom: { select: { name: true } },
    },
  });

  if (!session) return jsonErr(404, "Attendance session not found.");

  // ✅ classroom access gate (teacher assignment / admin role handled inside helper)
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

  const canEdit =
    !session.certifiedAt &&
    (!session.takenByUserId || session.takenByUserId === safe.userId);

  const [students, marks, health] = await prisma.$transaction([
    prisma.student.findMany({
      where: { tenantId: safe.tenantId, classroomId: session.classroomId },
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
      where: {
        tenantId: safe.tenantId,
        classroomId: session.classroomId,
        date: dayKey,
      },
      select: {
        studentId: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
        sentToParentAt: true,
      },
    }),
  ]);

  const studentsDTO: StudentDTO[] = students.map((s) => ({
    id: s.id,
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
    guardianName: s.guardianName ?? null,
    guardianPhone: s.guardianPhone ?? null,
    guardianSmsOptIn: !!s.guardianSmsOptIn,
    healthConsentAt: s.healthConsentAt ? s.healthConsentAt.toISOString() : null,
  }));

  const marksDTO: MarkDTO[] = marks.map((m) => ({
    studentId: m.studentId,
    status: m.status,
    note: m.note ?? null,
  }));

  const healthDTO: HealthDTO[] = health.map((h) => ({
    studentId: h.studentId,
    temperatureC: toNumber(h.temperatureC),
    symptoms: h.symptoms ?? null,
    notes: h.notes ?? null,
    sentToParentAt: h.sentToParentAt ? h.sentToParentAt.toISOString() : null,
  }));

  return NextResponse.json(
    {
      ok: true,
      session: {
        id: session.id,
        tenantId: session.tenantId,
        classroomId: session.classroomId,
        classroomName: session.classroom?.name ?? "",
        dateISO,
        takenByUserId: session.takenByUserId ?? null,
        isClosed: session.isClosed,
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        certifiedAt: session.certifiedAt ? session.certifiedAt.toISOString() : null,
        canEdit,
      },
      students: studentsDTO,
      marks: marksDTO,
      health: healthDTO,
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}
