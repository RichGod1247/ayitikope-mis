import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function gesFromPct(pct: number | null) {
  if (pct == null || Number.isNaN(pct)) return null;
  if (pct >= 90 && pct <= 100) return { grade: 1, remark: "Excellent" };
  if (pct >= 80 && pct <= 89) return { grade: 2, remark: "Very Good" };
  if (pct >= 70 && pct <= 79) return { grade: 3, remark: "Good" };
  if (pct >= 60 && pct <= 69) return { grade: 4, remark: "High Average" };
  if (pct >= 55 && pct <= 59) return { grade: 5, remark: "Average" };
  if (pct >= 50 && pct <= 54) return { grade: 6, remark: "Low Average" };
  if (pct >= 40 && pct <= 49) return { grade: 7, remark: "Low Average" };
  if (pct >= 35 && pct <= 39) return { grade: 8, remark: "Lower" };
  if (pct >= 0 && pct <= 34) return { grade: 9, remark: "Lowest / Fail" };
  if (pct > 100) return { grade: 1, remark: "Excellent (scaled)" };
  return { grade: 9, remark: "Lowest / Fail" };
}

/**
 * GET /api/teachers/assessments/term-summary?classroomId=...&term=...&academicYear=...
 *
 * Computes subject-level average % across ALL learners (and overall avg across subjects).
 */
export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "TEACHER"],
  });
  if (!gate.ok) return gate.res;
  const ctx = gate.ctx;

  const { searchParams } = new URL(req.url);
  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim();
  const academicYear = (searchParams.get("academicYear") ?? "").trim();

  if (!classroomId || !term || !academicYear) {
    return jsonNoStore({ ok: false, error: "classroomId, term and academicYear are required." }, { status: 400 });
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) return jsonNoStore({ ok: false, error: "Classroom not found." }, { status: 404 });

  const students = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId, classroomId },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear },
    select: { id: true, subject: true, maxScore: true },
  });
  const itemIds = items.map((i) => i.id);

  const scores =
    itemIds.length > 0
      ? await prisma.assessmentScore.findMany({
          where: {
            itemId: { in: itemIds },
            ...(studentIds.length ? { studentId: { in: studentIds } } : {}),
          },
          select: { itemId: true, studentId: true, score: true },
        })
      : [];

  const scoreMap = new Map<string, number>();
  for (const s of scores) scoreMap.set(`${s.studentId}__${s.itemId}`, Number(s.score) || 0);

  const subjectAgg = new Map<string, { subject: string; itemCount: number; sumPct: number; denom: number }>();

  for (const it of items) {
    const subject = (it.subject ?? "").trim() || "Unknown";
    const agg = subjectAgg.get(subject) ?? { subject, itemCount: 0, sumPct: 0, denom: 0 };
    agg.itemCount += 1;

    for (const st of studentIds) {
      const sc = scoreMap.get(`${st}__${it.id}`) ?? 0;
      const max = Number(it.maxScore) || 0;
      const pct = max > 0 ? (sc / max) * 100 : 0;
      agg.sumPct += pct;
      agg.denom += 1;
    }

    subjectAgg.set(subject, agg);
  }

  const subjects = Array.from(subjectAgg.values())
    .sort((a, b) => a.subject.localeCompare(b.subject))
    .map((s) => {
      const avgPct = s.denom > 0 ? s.sumPct / s.denom : null;
      const ges = gesFromPct(avgPct);
      return {
        subject: s.subject,
        itemCount: s.itemCount,
        averagePercentage: avgPct,
        grade: ges?.grade ?? 9,
        remark: ges?.remark ?? "Lowest / Fail",
      };
    });

  const overallAvg =
    subjects.length > 0
      ? subjects.reduce((sum, s) => sum + (s.averagePercentage ?? 0), 0) / subjects.length
      : null;

  const overallGes = gesFromPct(overallAvg);

  return jsonNoStore(
    {
      ok: true,
      context: { classroomId, term, academicYear },
      classroom,
      summary: {
        subjects,
        overallAveragePercentage: overallAvg,
        grade: overallGes?.grade ?? 9,
        remark: overallGes?.remark ?? "Lowest / Fail",
      },
    },
    { status: 200 }
  );
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405 });
}