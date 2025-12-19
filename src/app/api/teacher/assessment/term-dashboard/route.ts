// src/app/api/teacher/assessment/term-dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Map a percentage to GES BECE grading band + remark.
 *
 * Bands:
 *  1 (Excellent): 90-100%
 *  2 (Very Good): 80-89%
 *  3 (Good): 70-79%
 *  4 (High Average): 60-69%
 *  5 (Average): 55-59%
 *  6 (Low Average): 50-54%
 *  7 (Low Average): 40-49%
 *  8 (Lower): 35-39%
 *  9 (Lowest/Fail): 0-34%
 */
function mapPercentageToGesBand(
  percentage: number | null
): { grade: number; remark: string } {
  if (percentage == null || Number.isNaN(percentage)) {
    return { grade: 9, remark: "No records yet" };
  }

  if (percentage >= 90) return { grade: 1, remark: "Excellent" };
  if (percentage >= 80) return { grade: 2, remark: "Very Good" };
  if (percentage >= 70) return { grade: 3, remark: "Good" };
  if (percentage >= 60) return { grade: 4, remark: "High Average" };
  if (percentage >= 55) return { grade: 5, remark: "Average" };
  if (percentage >= 50) return { grade: 6, remark: "Low Average" };
  if (percentage >= 40) return { grade: 7, remark: "Low Average" };
  if (percentage >= 35) return { grade: 8, remark: "Lower" };
  return { grade: 9, remark: "Lowest / Fail" };
}

/**
 * Teacher Assessment Term Dashboard
 *
 * GET /api/teacher/assessment/term-dashboard
 *   ?tenantId=...
 *   &teacherUserId=...
 *   &classroomId=...
 *   &term=...
 *   &academicYear=...
 *
 * Returns:
 *  - classroom info
 *  - learners: per-learner term summary (score, % , GES grade + remark, items count)
 *  - classAverage: overall percentage + GES grade/remark across learners
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const teacherUserId = searchParams.get("teacherUserId");
    const classroomId = searchParams.get("classroomId");
    const term = searchParams.get("term") ?? "1st Term";
    const academicYear =
      searchParams.get("academicYear") ?? "2025/2026";

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required" },
        { status: 400 }
      );
    }

    if (!teacherUserId) {
      return NextResponse.json(
        { ok: false, error: "teacherUserId is required" },
        { status: 400 }
      );
    }

    if (!classroomId) {
      return NextResponse.json(
        { ok: false, error: "classroomId is required" },
        { status: 400 }
      );
    }

    // For safety with any typed prisma issues
    const client = prisma as any;

    // 1) Load classroom
    const classroom = await client.classroom.findFirst({
      where: {
        id: classroomId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    });

    if (!classroom) {
      return NextResponse.json(
        { ok: false, error: "Classroom not found for this tenant." },
        { status: 404 }
      );
    }

    // 2) Load students in this classroom
    const students = await client.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
      },
      orderBy: {
        firstName: "asc",
      },
    });

    if (students.length === 0) {
      return NextResponse.json({
        ok: true,
        context: {
          tenantId,
          teacherUserId,
          classroomId,
          term,
          academicYear,
        },
        classroom,
        learners: [],
        classAverage: {
          totalScore: 0,
          totalMax: 0,
          percentage: null,
          grade: 9,
          remark: "No learners in this classroom yet.",
        },
      });
    }

    // 3) Load assessment items for this class/term/year
    const items = await client.assessmentItem.findMany({
      where: {
        tenantId,
        classroomId,
        term,
        academicYear,
      },
      select: {
        id: true,
        subject: true,
        maxScore: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        context: {
          tenantId,
          teacherUserId,
          classroomId,
          term,
          academicYear,
        },
        classroom,
        learners: students.map((s: any) => ({
          studentId: s.id,
          fullName: `${s.firstName} ${s.lastName}`.trim(),
          guardianPhone: s.guardianPhone ?? null,
          itemsCount: 0,
          totalScore: 0,
          totalMax: 0,
          percentage: null,
          grade: 9,
          remark: "No assessment items yet for this term.",
        })),
        classAverage: {
          totalScore: 0,
          totalMax: 0,
          percentage: null,
          grade: 9,
          remark: "No assessment items yet for this term.",
        },
      });
    }

    const itemIds = items.map((i: any) => i.id);
    const studentIds = students.map((s: any) => s.id);

    // Quick lookup: itemId -> maxScore
    const itemMaxMap = new Map<string, number>();
    for (const it of items) {
      itemMaxMap.set(it.id, it.maxScore ?? 0);
    }

    // 4) Load assessment scores for these items + students
    const scores = await client.assessmentScore.findMany({
      where: {
        itemId: { in: itemIds },
        studentId: { in: studentIds },
      },
      select: {
        id: true,
        itemId: true,
        studentId: true,
        score: true,
      },
    });

    // 5) Summarise per learner
    type LearnerSummary = {
      studentId: string;
      fullName: string;
      guardianPhone: string | null;
      itemsCount: number;
      totalScore: number;
      totalMax: number;
      percentage: number | null;
      grade: number;
      remark: string;
    };

    const learnerMap = new Map<string, LearnerSummary>();

    for (const s of students) {
      const fullName = `${s.firstName} ${s.lastName}`.trim();
      learnerMap.set(s.id, {
        studentId: s.id,
        fullName,
        guardianPhone: s.guardianPhone ?? null,
        itemsCount: 0,
        totalScore: 0,
        totalMax: 0,
        percentage: null,
        grade: 9,
        remark: "No records yet",
      });
    }

    // To count how many distinct items each learner has scores for
    const learnerItemSet = new Map<string, Set<string>>();

    for (const sc of scores) {
      const learner = learnerMap.get(sc.studentId);
      if (!learner) continue;

      const maxForItem = itemMaxMap.get(sc.itemId) ?? 0;
      const scoreVal = sc.score ?? 0;

      learner.totalScore += scoreVal;
      learner.totalMax += maxForItem;

      if (!learnerItemSet.has(sc.studentId)) {
        learnerItemSet.set(sc.studentId, new Set<string>());
      }
      learnerItemSet.get(sc.studentId)!.add(sc.itemId);
    }

    // Finalise percentage + itemsCount + GES band
    const learners: LearnerSummary[] = [];

    for (const [studentId, summary] of learnerMap.entries()) {
      const itemsSet = learnerItemSet.get(studentId);
      const itemsCount = itemsSet ? itemsSet.size : 0;

      let percentage: number | null = null;
      if (summary.totalMax > 0) {
        percentage = (summary.totalScore / summary.totalMax) * 100;
      }

      const { grade, remark } = mapPercentageToGesBand(percentage);

      learners.push({
        ...summary,
        itemsCount,
        percentage,
        grade,
        remark,
      });
    }

    // 6) Compute simple class average (based on learners with a %)
    const learnersWithPercentage = learners.filter(
      (l) => l.percentage != null && !Number.isNaN(l.percentage)
    );

    let classTotalScore = 0;
    let classTotalMax = 0;
    let classPercentage: number | null = null;
    let classGrade = 9;
    let classRemark = "No records yet";

    if (learnersWithPercentage.length > 0) {
      for (const l of learnersWithPercentage) {
        classTotalScore += l.totalScore;
        classTotalMax += l.totalMax;
      }
      if (classTotalMax > 0) {
        classPercentage = (classTotalScore / classTotalMax) * 100;
        const band = mapPercentageToGesBand(classPercentage);
        classGrade = band.grade;
        classRemark = band.remark;
      }
    }

    return NextResponse.json({
      ok: true,
      context: {
        tenantId,
        teacherUserId,
        classroomId,
        term,
        academicYear,
      },
      classroom,
      learners,
      classAverage: {
        totalScore: classTotalScore,
        totalMax: classTotalMax,
        percentage: classPercentage,
        grade: classGrade,
        remark: classRemark,
      },
    });
  } catch (err: any) {
    console.error("[TEACHER_TERM_DASHBOARD_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load teacher term dashboard.",
      },
      { status: 500 }
    );
  }
}
