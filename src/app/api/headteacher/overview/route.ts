// src/app/api/headteacher/overview/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD or ISO
  term: z.string().optional(),
  academicYear: z.string().optional(),
});

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
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

// Normalise a date string to UTC day [start, end)
function getDayRange(dateStr?: string) {
  let base: Date;
  if (!dateStr) base = new Date();
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) base = dateAtUtcMidnight(dateStr);
  else base = new Date(dateStr);

  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Week start (Monday) in UTC
function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getUTCDay(); // 0..6, Sunday=0
  const diff = (day + 6) % 7; // Monday -> 0
  weekStart.setUTCDate(weekStart.getUTCDate() - diff);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;
  const ctx = auth.ctx;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    term: searchParams.get("term") ?? undefined,
    academicYear: searchParams.get("academicYear") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore({ ok: false, error: "INVALID_FILTERS", details: parsed.error.flatten() }, 400);
  }

  const { start: dayStart, end: dayEnd } = getDayRange(parsed.data.date);
  const weekStart = getWeekStart(dayStart);

  // Prefer tenant settings if query not provided
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true, feverThreshold: true },
  });

  const term = parsed.data.term ?? settings?.currentTerm ?? "1st Term";
  const academicYear = parsed.data.academicYear ?? settings?.currentAcademicYear ?? "2025/2026";
  const feverThreshold = toNumber(settings?.feverThreshold) ?? 37.5;

  try {
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: { name: "asc" },
    });

    const healthRows = await prisma.studentHealthDaily.findMany({
      where: { tenantId: ctx.tenantId, date: { gte: dayStart, lt: dayEnd } },
      select: { classroomId: true, studentId: true, temperatureC: true, symptoms: true },
    });

    type HealthAgg = { total: number; highTemp: number; symptomatic: number };
    const healthByClass = new Map<string, HealthAgg>();

    for (const row of healthRows) {
      const existing = healthByClass.get(row.classroomId) ?? { total: 0, highTemp: 0, symptomatic: 0 };
      existing.total += 1;

      const t = toNumber(row.temperatureC);
      if (t != null && t >= feverThreshold) existing.highTemp += 1;

      if (row.symptoms && row.symptoms.trim() !== "") existing.symptomatic += 1;

      healthByClass.set(row.classroomId, existing);
    }

    const assessmentItems = await prisma.assessmentItem.findMany({
      where: { tenantId: ctx.tenantId, term, academicYear },
      select: { classroomId: true, date: true, createdAt: true },
      orderBy: { createdAt: "asc" as any },
    });

    type AssessAgg = { totalItems: number; lastDate: Date | null };
    const assessByClass = new Map<string, AssessAgg>();

    for (const item of assessmentItems) {
      const existing = assessByClass.get(item.classroomId) ?? { totalItems: 0, lastDate: null };
      existing.totalItems += 1;
      const effectiveDate = item.date ?? item.createdAt;
      if (!existing.lastDate || effectiveDate > existing.lastDate) existing.lastDate = effectiveDate;
      assessByClass.set(item.classroomId, existing);
    }

    const wellbeingRows = await prisma.teacherHealthWeekly.findMany({
      where: { tenantId: ctx.tenantId, weekStart },
      select: {
        id: true,
        userId: true,
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: { select: { name: true } },
      },
      orderBy: { stressLevel: "desc" },
    });

    const classes = classrooms.map((c) => {
      const health = healthByClass.get(c.id) ?? { total: 0, highTemp: 0, symptomatic: 0 };
      const assess = assessByClass.get(c.id) ?? { totalItems: 0, lastDate: null };

      return {
        classroomId: c.id,
        name: c.name,
        grade: c.grade,
        arm: c.arm,
        studentHealth: {
          totalRecords: health.total,
          highTempCount: health.highTemp,
          symptomaticCount: health.symptomatic,
          feverThreshold,
        },
        assessments: {
          totalItems: assess.totalItems,
          lastAssessmentDate: assess.lastDate ? assess.lastDate.toISOString() : null,
        },
      };
    });

    const teacherWellbeing = wellbeingRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      teacherName: r.user?.name ?? null,
      weekStart: r.weekStart.toISOString(),
      stressLevel: r.stressLevel,
      workload: r.workload,
      comments: r.comments,
    }));

    return jsonNoStore({
      ok: true,
      filters: { date: dayStart.toISOString(), term, academicYear },
      tenantId: ctx.tenantId,
      classes,
      teacherWellbeing,
    });
  } catch (err) {
    console.error("[HEADTEACHER_OVERVIEW_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_OVERVIEW" }, 500);
  }
}
