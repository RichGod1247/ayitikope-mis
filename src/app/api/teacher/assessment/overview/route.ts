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

    // 1. Get all classrooms for this tenant (with student IDs)
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: {
        students: {
          select: { id: true },
        },
      },
    });

    // 2. Get all assessment items for this tenant/term/year, including scores
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

    // Group items by classroomId
    const itemsByClassroom = new Map<
      string,
      {
        id: string;
        maxScore: number;
        scores: { studentId: string; score: number | null }[];
      }[]
    >();

    for (const item of items) {
      const arr = itemsByClassroom.get(item.classroomId) ?? [];
      arr.push({
        id: item.id,
        maxScore: item.maxScore ?? 0,
        scores: item.scores.map((s) => ({
          studentId: s.studentId,
          score: s.score,
        })),
      });
      itemsByClassroom.set(item.classroomId, arr);
    }

    const classes: HeadteacherOverviewClass[] = [];

    for (const cls of classrooms) {
      const classItems = itemsByClassroom.get(cls.id) ?? [];

      const learnersCount = cls.students.length;
      const itemsCount = classItems.length;

      // If no items or no learners, we still return the class, but with null average
      if (classItems.length === 0 || learnersCount === 0) {
        classes.push({
          classroomId: cls.id,
          classroomName: cls.name,
          grade: cls.grade ?? null,
          arm: cls.arm ?? null,
          learnersCount,
          itemsCount,
          averagePercent: null,
        });
        continue;
      }

      // ---- IMPORTANT PART: make headteacher average match teacher term-dashboard logic ----
      // Teacher term-dashboard classAverage uses:
      //   totalScore = sum of all learners' total scores
      //   totalMax   = sum of all learners' total max
      //   percentage = (totalScore / totalMax) * 100
      //
      // We replicate the same idea at class level:
      let classTotalScore = 0;
      let classTotalMax = 0;

      for (const item of classItems) {
        const maxForItem = item.maxScore || 0;
        if (maxForItem <= 0) continue;

        for (const sc of item.scores) {
          if (sc.score == null) continue;
          const scoreVal = sc.score ?? 0;
          classTotalScore += scoreVal;
          classTotalMax += maxForItem;
        }
      }

      let averagePercent: number | null = null;
      if (classTotalMax > 0) {
        averagePercent = (classTotalScore / classTotalMax) * 100;
        // round to 2 dp like the teacher dashboard
        averagePercent = Number(averagePercent.toFixed(2));
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
