// src/app/api/teacher/health/student-daily/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && typeof (v as any).toNumber === "function") {
    const n = (v as any).toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateISO(input?: string | null) {
  const raw = (input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function dateObjFromISO(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

function classLabel(c: { name: string; grade: string | null; arm: string | null }) {
  const parts = [c.name];
  if (c.grade) parts.push(c.arm ? `${c.grade} ${c.arm}` : c.grade);
  return parts.filter(Boolean).join(" · ");
}

function clampText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

async function getFeverThresholdC(tenantId: string) {
  // Read from Tenant.settingsJson.health.* (matches your admin health settings route)
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settingsJson: true },
  });

  const h = (t?.settingsJson as any)?.health ?? {};
  const raw = h.feverThresholdC ?? h.feverThreshold ?? 37.8;
  const n = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(n)) return 37.8;
  if (n <= 30 || n >= 45) return 37.8;
  return Math.round(n * 10) / 10;
}

const PostSchema = z
  .object({
    studentId: z.string().min(1),
    dateISO: z.string().optional(),
    temperatureC: z.number().min(30).max(45).nullable().optional(),
    symptoms: z.string().max(240).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    clear: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  const url = new URL(req.url);
  const dateISO = normalizeDateISO(url.searchParams.get("date"));
  const date = dateObjFromISO(dateISO);

  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return json(403, { ok: false, error: "Forbidden." });

  const tp = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: { primaryClassroomId: true },
  });
  if (!tp?.primaryClassroomId) return json(403, { ok: false, error: "No primary class assigned." });

  const classroom = await prisma.classroom.findFirst({
    where: { id: tp.primaryClassroomId, tenantId: safe.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) return json(404, { ok: false, error: "Classroom not found." });

  const [feverThresholdC, students, healthRows] = await Promise.all([
    getFeverThresholdC(safe.tenantId),
    prisma.student.findMany({
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
    }),
    prisma.studentHealthDaily.findMany({
      where: { tenantId: safe.tenantId, classroomId: classroom.id, date },
      select: { studentId: true, temperatureC: true, symptoms: true, notes: true, id: true },
    }),
  ]);

  const healthByStudent = new Map(healthRows.map((h) => [h.studentId, h]));

  const items = students.map((s) => {
    const h = healthByStudent.get(s.id);
    const tempN = toNumber(h?.temperatureC as any);
    const isFever = typeof tempN === "number" && tempN >= feverThresholdC;

    return {
      studentId: s.id,
      name: [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Unnamed learner",
      guardianName: s.guardianName ?? null,
      guardianPhone: s.guardianPhone ?? null,
      guardianSmsOptIn: !!s.guardianSmsOptIn,
      healthConsentAt: s.healthConsentAt ? s.healthConsentAt.toISOString() : null,

      recordId: h?.id ?? null,
      temperatureC: tempN,
      symptoms: (h?.symptoms ?? null) as string | null,
      notes: (h?.notes ?? null) as string | null,
      isFever,
    };
  });

  const feverCount = items.filter((x) => x.isFever).length;

  return json(200, {
    ok: true,
    dateISO,
    classroom: { id: classroom.id, label: classLabel(classroom) },
    feverThresholdC,
    feverCount,
    count: items.length,
    items,
  });
}

export async function POST(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  const raw = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid request body." });
  }

  const dateISO = normalizeDateISO(parsed.data.dateISO ?? null);
  const date = dateObjFromISO(dateISO);
  const studentId = parsed.data.studentId.trim();

  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return json(403, { ok: false, error: "Forbidden." });

  const tp = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: { primaryClassroomId: true },
  });
  if (!tp?.primaryClassroomId) return json(403, { ok: false, error: "No primary class assigned." });

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: safe.tenantId,
      classroomId: tp.primaryClassroomId,
    },
    select: { id: true, classroomId: true, healthConsentAt: true },
  });
  if (!student) return json(404, { ok: false, error: "Student not found in your primary class." });

  // ✅ enforce consent (align with attendance health upsert)
  if (!student.healthConsentAt) {
    return json(409, { ok: false, error: "Health consent has not been granted for this student." });
  }

  if (parsed.data.clear) {
    await prisma.studentHealthDaily.deleteMany({
      where: { tenantId: safe.tenantId, studentId: student.id, date },
    });
    return json(200, { ok: true, cleared: true, studentId: student.id, dateISO });
  }

  const temperatureC = typeof parsed.data.temperatureC === "number" ? parsed.data.temperatureC : null;
  const symptoms = clampText(parsed.data.symptoms, 240);
  const notes = clampText(parsed.data.notes, 500);

  const updated = await prisma.studentHealthDaily.upsert({
    where: {
      StudentHealthDaily_unique_student_date: { studentId: student.id, date },
    },
    create: {
      tenantId: safe.tenantId,
      classroomId: student.classroomId!, // safe due to query above
      studentId: student.id,
      date,
      temperatureC: temperatureC == null ? null : temperatureC,
      symptoms,
      notes,
    },
    update: {
      classroomId: student.classroomId!,
      temperatureC: temperatureC == null ? null : temperatureC,
      symptoms,
      notes,
    },
    select: { id: true, studentId: true, date: true, temperatureC: true, symptoms: true, notes: true },
  });

  const feverThresholdC = await getFeverThresholdC(safe.tenantId);
  const tempN = toNumber(updated.temperatureC as any);
  const isFever = typeof tempN === "number" && tempN >= feverThresholdC;

  return json(200, {
    ok: true,
    studentId: updated.studentId,
    dateISO,
    temperatureC: tempN,
    symptoms: updated.symptoms ?? null,
    notes: updated.notes ?? null,
    feverThresholdC,
    isFever,
  });
}
