// src/app/api/headteacher/assessment/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type HeadteacherOverviewClass = {
  classroomId: string;
  classroomName: string;
  grade: string | null;
  arm: string | null;
  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
};

type HeadteacherOverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  classes: HeadteacherOverviewClass[];
};

/**
 * Headteacher – Whole-school CA overview
 *
 * GET /api/headteacher/assessment/overview
 *   ?tenantId=...
 *   &term=...
 *   &academicYear=...
 *
 * For each classroom, we compute the class average in the
 * SAME WAY as the teacher's term dashboard:
 *
 *   classAverage% = (sum of all scores) / (sum of all max scores) × 100
 *
 * We only use actual recorded scores. If a learner has no
 * recorded score for the term, they simply don't affect the
 * average. This keeps the maths consistent and transparent.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const term = searchParams.get("term");
    const academicYear = searchParams.get("academicYear");

    if (!tenantId || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error: "tenantId, term and academicYear are required.",
        },
        { status: 400 }
      );
    }

    // 1) All classrooms in this tenant, with student IDs
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: {
        students: {
          select: { id: true },
        },
      },
    });

    if (classrooms.length === 0) {
      const emptyResponse: HeadteacherOverviewResponse = {
        ok: true,
        context: { tenantId, term, academicYear },
        classes: [],
      };
      return NextResponse.json(emptyResponse);
    }

    // 2) All assessment items for this tenant + term + year, with scores
    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId,
        term,
        academicYear,
      },
      select: {
        id: true,
        classroomId: true,
        maxScore: true,
        scores: {
          select: {
            studentId: true,
            score: true,
          },
        },
      },
    });

    // Group items by classroom, and prepare per-class per-student totals
    const itemsByClassroom = new Map<
      string,
      {
        id: string;
        maxScore: number;
        scores: { studentId: string; score: number | null }[];
      }[]
    >();

    const studentTotalsByClassroom = new Map<
      string,
      Map<string, { totalScore: number; totalMax: number }>
    >();

    for (const item of items) {
      const classId = item.classroomId;
      if (!classId) continue;

      const maxForItem = item.maxScore ?? 0;
      if (maxForItem <= 0) continue; // avoid division by 0

      // For itemsCount
      const classItemsArr =
        itemsByClassroom.get(classId) ?? [];
      classItemsArr.push({
        id: item.id,
        maxScore: maxForItem,
        scores: item.scores,
      });
      itemsByClassroom.set(classId, classItemsArr);

      // For per-student totals used in class average
      let studentMap = studentTotalsByClassroom.get(classId);
      if (!studentMap) {
        studentMap = new Map();
        studentTotalsByClassroom.set(classId, studentMap);
      }

      for (const sc of item.scores) {
        const scoreVal = sc.score ?? 0;

        const existing =
          studentMap.get(sc.studentId) ?? {
            totalScore: 0,
            totalMax: 0,
          };

        existing.totalScore += scoreVal;
        existing.totalMax += maxForItem;

        studentMap.set(sc.studentId, existing);
      }
    }

    // 3) Build per-class summary
    const classes: HeadteacherOverviewClass[] = [];

    for (const cls of classrooms) {
      const learnersCount = cls.students.length;
      const classItems = itemsByClassroom.get(cls.id) ?? [];
      const studentTotals = studentTotalsByClassroom.get(cls.id);

      const itemsCount = classItems.length;

      let averagePercent: number | null = null;

      if (studentTotals && studentTotals.size > 0) {
        let classTotalScore = 0;
        let classTotalMax = 0;

        for (const totals of studentTotals.values()) {
          classTotalScore += totals.totalScore;
          classTotalMax += totals.totalMax;
        }

        if (classTotalMax > 0) {
          // EXACT SAME FORMULA STYLE as the teacher term-dashboard:
          // classPercentage = (sum scores) / (sum max) * 100
          const pct =
            (classTotalScore / classTotalMax) * 100;
          averagePercent = pct;
        }
      }

      classes.push({
        classroomId: cls.id,
        classroomName: cls.name,
        grade: cls.grade ?? null,
        arm: cls.arm ?? null,
        learnersCount,
        itemsCount,
        averagePercent,
      });
    }

    const response: HeadteacherOverviewResponse = {
      ok: true,
      context: {
        tenantId,
        term,
        academicYear,
      },
      classes,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[HeadteacherAssessmentOverview][GET] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}
