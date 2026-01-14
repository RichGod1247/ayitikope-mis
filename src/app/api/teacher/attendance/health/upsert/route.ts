// src/app/api/teacher/attendance/health/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseISODateOnly(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type HealthItem = {
  studentId: string;
  temperatureC?: number | null;
  symptoms?: string | null;
  notes?: string | null;
};

type Body = {
  sessionId?: string;
  items?: HealthItem[];
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
    if (it.temperatureC != null && typeof it.temperatureC !== "number") {
      return jsonError(400, `Invalid temperatureC for student ${it.studentId}.`);
    }
    if (it.symptoms != null && typeof it.symptoms !== "string") {
      return jsonError(400, `Invalid symptoms for student ${it.studentId}.`);
    }
    if (it.notes != null && typeof it.notes !== "string") {
      return jsonError(400, `Invalid notes for student ${it.studentId}.`);
    }
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: { id: true, classroomId: true, date: true },
  });
  if (!session) return jsonError(404, "Session not found.");

  const dateISO = session.date.toISOString().slice(0, 10);
  const dateObj = parseISODateOnly(dateISO);
  if (!dateObj) return jsonError(500, "Invalid session date stored.");

  const studentIds = items.map((i) => i.studentId);

  // Typed select ensures healthConsentAt exists and is safe to use.
  const students = await prisma.student.findMany({
    where: { tenantId: safe.tenantId, classroomId: session.classroomId, id: { in: studentIds } },
    select: { id: true, healthConsentAt: true },
  });
  if (students.length !== studentIds.length) {
    return jsonError(400, "One or more learners do not belong to this class.");
  }

  const consentMap = new Map(students.map((s) => [s.id, s.healthConsentAt]));
  const blockedStudentIds = students.filter((s) => !s.healthConsentAt).map((s) => s.id);

  // ✅ Production-grade: avoid upsert compound WhereUniqueInput name dependence.
  const existing = await prisma.studentHealthDaily.findMany({
    where: {
      tenantId: safe.tenantId,
      classroomId: session.classroomId,
      date: dateObj,
      studentId: { in: studentIds },
    },
    select: { id: true, studentId: true },
  });
  const existingByStudent = new Map(existing.map((h) => [h.studentId, h.id]));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const it of items) {
      const consentAt = consentMap.get(it.studentId) ?? null;
      const allowHealth = !!consentAt;

      const temperatureC = allowHealth ? (it.temperatureC ?? null) : null;
      const symptoms = allowHealth ? (it.symptoms?.trim() || null) : null;
      const notes = allowHealth ? (it.notes?.trim() || null) : null;

      const existingId = existingByStudent.get(it.studentId);

      if (existingId) {
        await tx.studentHealthDaily.update({
          where: { id: existingId },
          data: { temperatureC, symptoms, notes },
        });
      } else {
        await tx.studentHealthDaily.create({
          data: {
            tenantId: safe.tenantId,
            classroomId: session.classroomId,
            studentId: it.studentId,
            date: dateObj,
            temperatureC,
            symptoms,
            notes,
          },
        });
      }
    }
  });

  return NextResponse.json({
    ok: true,
    count: items.length,
    blockedStudentIds,
    note:
      blockedStudentIds.length > 0
        ? "Some learners have no health consent; health fields were stored as null."
        : undefined,
  });
}
