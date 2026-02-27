import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  dateISO: z.string().optional(), // YYYY-MM-DD
  entries: z.array(
    z.object({
      studentId: z.string().min(1),
      temperatureC: z.number().nullable().optional(),
      symptoms: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
  ).min(1),
}).strict();

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnlyUTC(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  // session tenant context
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Option A gate: teacher must have primary class
  const tp = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: { primaryClassroomId: true },
  });
  if (!tp?.primaryClassroomId) {
    return NextResponse.json({ ok: false, error: "No primary class assigned." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateISO = (searchParams.get("dateISO") ?? isoToday()).trim();
  const dateObj = toDateOnlyUTC(dateISO);

  const classroom = await prisma.classroom.findFirst({
    where: { id: tp.primaryClassroomId, tenantId: safe.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) {
    return NextResponse.json({ ok: false, error: "Primary classroom not found." }, { status: 404 });
  }

  const students = await prisma.student.findMany({
    where: { tenantId: safe.tenantId, classroomId: classroom.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 2000,
  });

  const healthRows = await prisma.studentHealthDaily.findMany({
    where: { tenantId: safe.tenantId, classroomId: classroom.id, date: dateObj },
    select: { studentId: true, temperatureC: true, symptoms: true, notes: true },
  });

  const byStudent = new Map(healthRows.map((h) => [h.studentId, h]));
  const classLabel = [classroom.name, classroom.grade, classroom.arm].filter(Boolean).join(" • ");

  return NextResponse.json({
    ok: true,
    dateISO,
    classroom: { id: classroom.id, label: classLabel },
    students: students.map((s) => {
      const h = byStudent.get(s.id);
      return {
        id: s.id,
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhone ?? null,
        guardianSmsOptIn: !!s.guardianSmsOptIn,
        healthConsentAt: s.healthConsentAt ? s.healthConsentAt.toISOString() : null,
        health: {
          temperatureC: toNumber(h?.temperatureC as any),
          symptoms: (h?.symptoms ?? null) as string | null,
          notes: (h?.notes ?? null) as string | null,
        },
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const tp = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: { primaryClassroomId: true },
  });
  if (!tp?.primaryClassroomId) {
    return NextResponse.json({ ok: false, error: "No primary class assigned." }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid body" }, { status: 400 });
  }

  const dateISO = (parsed.data.dateISO ?? isoToday()).trim();
  const dateObj = toDateOnlyUTC(dateISO);

  const classroom = await prisma.classroom.findFirst({
    where: { id: tp.primaryClassroomId, tenantId: safe.tenantId },
    select: { id: true },
  });
  if (!classroom) {
    return NextResponse.json({ ok: false, error: "Primary classroom not found." }, { status: 404 });
  }

  // allow entries only for students in this class
  const students = await prisma.student.findMany({
    where: { tenantId: safe.tenantId, classroomId: classroom.id },
    select: { id: true },
    take: 5000,
  });
  const allowed = new Set(students.map((s) => s.id));

  let saved = 0;
  for (const e of parsed.data.entries) {
    if (!allowed.has(e.studentId)) continue;

    await prisma.studentHealthDaily.upsert({
      where: {
        StudentHealthDaily_unique_student_date: {
          studentId: e.studentId,
          date: dateObj,
        },
      },
      create: {
        tenantId: safe.tenantId,
        classroomId: classroom.id,
        studentId: e.studentId,
        date: dateObj,
        temperatureC: typeof e.temperatureC === "number" ? e.temperatureC : null,
        symptoms: e.symptoms ?? null,
        notes: e.notes ?? null,
      },
      update: {
        temperatureC: typeof e.temperatureC === "number" ? e.temperatureC : null,
        symptoms: e.symptoms ?? null,
        notes: e.notes ?? null,
      },
    });

    saved += 1;
  }

  return NextResponse.json({ ok: true, dateISO, saved });
}
