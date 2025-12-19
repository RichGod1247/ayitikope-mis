// src/app/api/teacher/assessment/remark-summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GES/BECE grading bands
const BANDS = [
  { grade: 1, label: "Excellent", min: 90, max: 100 },
  { grade: 2, label: "Very Good", min: 80, max: 89 },
  { grade: 3, label: "Good", min: 70, max: 79 },
  { grade: 4, label: "High Average", min: 60, max: 69 },
  { grade: 5, label: "Average", min: 55, max: 59 },
  { grade: 6, label: "Low Average", min: 50, max: 54 },
  { grade: 7, label: "Low Average", min: 40, max: 49 },
  { grade: 8, label: "Lower", min: 35, max: 39 },
  { grade: 9, label: "Fail", min: 0, max: 34 },
];

function mapPercentToBand(percent: number | null) {
  if (percent == null) return null;
  for (const band of BANDS) {
    if (percent >= band.min && percent <= band.max) {
      return band;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const tenantId = searchParams.get("tenantId");
  const classroomId = searchParams.get("classroomId");
  const term = searchParams.get("term");
  const academicYear = searchParams.get("academicYear");

  if (!tenantId || !classroomId || !term || !academicYear) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing required query params: tenantId, classroomId, term, academicYear.",
      },
      { status: 400 }
    );
  }

  try {
    // 1) Pull all scores for this class/term/year
    const scores = await prisma.assessmentScore.findMany({
      where: {
        item: {
          tenantId,
          classroomId,
          term,
          academicYear,
        },
      },
      select: {
        studentId: true,
        score: true,
        item: {
          select: {
            maxScore: true,
          },
        },
      },
    });

    if (scores.length === 0) {
      return NextResponse.json({
        ok: true,
        context: { tenantId, classroomId, term, academicYear },
        totalLearnersEvaluated: 0,
        bands: BANDS.map((b) => ({
          grade: b.grade,
          label: b.label,
          minPercent: b.min,
          maxPercent: b.max,
          learnersCount: 0,
        })),
      });
    }

    // 2) Group totals per learner
    const learnerTotals = new Map<
      string,
      { totalScore: number; totalMax: number }
    >();

    for (const s of scores) {
      const entry =
        learnerTotals.get(s.studentId) || { totalScore: 0, totalMax: 0 };

      const max = s.item.maxScore ?? 0;
      const actual = s.score ?? 0;

      entry.totalScore += actual;
      entry.totalMax += max;

      learnerTotals.set(s.studentId, entry);
    }

    // 3) Compute percentage per learner and assign band
    const bandCounts = new Map<number, number>();
    let evaluatedCount = 0;

    for (const [, totals] of learnerTotals) {
      if (totals.totalMax <= 0) continue;

      evaluatedCount += 1;
      const percent = (totals.totalScore / totals.totalMax) * 100;
      const band = mapPercentToBand(percent);

      if (band) {
        const current = bandCounts.get(band.grade) ?? 0;
        bandCounts.set(band.grade, current + 1);
      }
    }

    return NextResponse.json({
      ok: true,
      context: { tenantId, classroomId, term, academicYear },
      totalLearnersEvaluated: evaluatedCount,
      bands: BANDS.map((b) => ({
        grade: b.grade,
        label: b.label,
        minPercent: b.min,
        maxPercent: b.max,
        learnersCount: bandCounts.get(b.grade) ?? 0,
      })),
    });
  } catch (err) {
    console.error("[TEACHER_REMARK_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to compute remark summary.",
      },
      { status: 500 }
    );
  }
}
