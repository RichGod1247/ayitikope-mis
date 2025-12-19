// src/app/api/parent/assessment/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/parent/assessment/summary?studentId=...&term=...&academicYear=...
 *
 * Jason rules:
 *  - Always JSON: { ok:boolean, ... }
 *  - 400 when studentId missing
 *  - 200 + ok:true on success (even if no scores → zeros)
 *
 * What this does (for ONE learner, ONE term/year):
 *  1) Finds all AssessmentScores for that learner.
 *  2) Joins with AssessmentItem to get subject, maxScore, term/year.
 *  3) Filters to the requested term + academicYear.
 *  4) Computes:
 *      - Total items
 *      - Sum of scores and max scores
 *      - Overall percentage
 *      - Per-subject breakdown
 *      - GES grade/remark (your new-curriculum scale).
 */

type GesRemark = {
  grade: number;
  label: string;
  band: string;
};

function mapPercentageToGes(percentage: number | null): GesRemark | null {
  if (percentage == null || isNaN(percentage)) return null;

  const p = percentage;

  // GES BECE scale you provided:
  // 1: 90-100 (Excellent)
  // 2: 80-89 (Very Good)
  // 3: 70-79 (Good)
  // 4: 60-69 (High Average)
  // 5: 55-59 (Average)
  // 6: 50-54 (Low Average)
  // 7: 40-49 (Low Average)
  // 8: 35-39 (Lower)
  // 9: 0-34  (Lowest/Fail)

  if (p >= 90 && p <= 100) {
    return { grade: 1, label: "Excellent", band: "A+" };
  }
  if (p >= 80 && p <= 89) {
    return { grade: 2, label: "Very Good", band: "A" };
  }
  if (p >= 70 && p <= 79) {
    return { grade: 3, label: "Good", band: "B+" };
  }
  if (p >= 60 && p <= 69) {
    return { grade: 4, label: "High Average", band: "B" };
  }
  if (p >= 55 && p <= 59) {
    return { grade: 5, label: "Average", band: "C+" };
  }
  if (p >= 50 && p <= 54) {
    return { grade: 6, label: "Low Average", band: "C" };
  }
  if (p >= 40 && p <= 49) {
    return { grade: 7, label: "Low Average", band: "D" };
  }
  if (p >= 35 && p <= 39) {
    return { grade: 8, label: "Lower", band: "E" };
  }
  // 0–34 or anything else drops here
  return { grade: 9, label: "Lowest / Fail", band: "F" };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const studentId = searchParams.get("studentId") || "";
    const term = searchParams.get("term") || "1st Term";
    const academicYear =
      searchParams.get("academicYear") || "2025/2026";

    if (!studentId.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "studentId is required.",
        },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // Load all scores for this learner with their items
    const scores = await client.assessmentScore.findMany({
      where: {
        studentId,
        item: {
          term,
          academicYear,
        },
      },
      select: {
        score: true,
        comment: true,
        item: {
          select: {
            id: true,
            subject: true,
            maxScore: true,
            term: true,
            academicYear: true,
            title: true,
            type: true,
            weighting: true,
            date: true,
          },
        },
      },
    });

    const totalItems = scores.length;

    if (totalItems === 0) {
      // No CA yet for this learner/term/year
      return NextResponse.json(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary: {
            totalItems: 0,
            totalObtained: 0,
            totalMax: 0,
            percentage: null,
            ges: null,
            subjects: [],
            note:
              "No continuous assessment scores recorded yet for this learner in the selected term and academic year.",
          },
        },
        { status: 200 }
      );
    }

    // Overall totals
    let totalObtained = 0;
    let totalMax = 0;

    type SubjectAgg = {
      subject: string;
      itemCount: number;
      totalObtained: number;
      totalMax: number;
    };

    const bySubject = new Map<string, SubjectAgg>();

    for (const row of scores) {
      const rawScore = row.score ?? 0;
      const maxScore = row.item?.maxScore ?? 0;
      const subject = row.item?.subject || "Unknown";

      totalObtained += rawScore;
      totalMax += maxScore;

      const key = subject;
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subject,
          itemCount: 0,
          totalObtained: 0,
          totalMax: 0,
        });
      }
      const agg = bySubject.get(key)!;
      agg.itemCount += 1;
      agg.totalObtained += rawScore;
      agg.totalMax += maxScore;
    }

    const percentage =
      totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
    const gesOverall = mapPercentageToGes(
      percentage != null ? Number(percentage.toFixed(2)) : null
    );

    const subjects = Array.from(bySubject.values()).map((agg) => {
      const subjectPercent =
        agg.totalMax > 0
          ? (agg.totalObtained / agg.totalMax) * 100
          : null;
      const ges = mapPercentageToGes(
        subjectPercent != null ? Number(subjectPercent.toFixed(2)) : null
      );
      return {
        subject: agg.subject,
        itemCount: agg.itemCount,
        totalObtained: agg.totalObtained,
        totalMax: agg.totalMax,
        percentage:
          subjectPercent != null
            ? Number(subjectPercent.toFixed(2))
            : null,
        ges,
      };
    });

    const summary = {
      totalItems,
      totalObtained,
      totalMax,
      percentage:
        percentage != null ? Number(percentage.toFixed(2)) : null,
      ges: gesOverall,
      subjects,
      note:
        "This summary uses recorded continuous assessment scores for this learner in the selected term and academic year, mapped to the GES BECE grading scale.",
    };

    return NextResponse.json(
      {
        ok: true,
        studentId,
        term,
        academicYear,
        summary,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_ASSESSMENT_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load assessment summary for this learner. Please try again.",
      },
      { status: 500 }
    );
  }
}
