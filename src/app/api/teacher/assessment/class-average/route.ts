// src/app/api/teacher/assessment/class-average/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    // 1) All assessment items for this class + term/year
    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId,
        classroomId,
        term,
        academicYear,
      },
      select: {
        id: true,
        maxScore: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        context: { tenantId, classroomId, term, academicYear },
        averagePercent: null,
        learnersCount: 0,
        itemsCount: 0,
      });
    }

    const itemIds = items.map((i) => i.id);

    // 2) All scores for those items
    const scores = await prisma.assessmentScore.findMany({
      where: {
        itemId: { in: itemIds },
      },
      select: {
        score: true,
        studentId: true,
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
        averagePercent: null,
        learnersCount: 0,
        itemsCount: items.length,
      });
    }

    let totalScore = 0;
    let totalMax = 0;
    const learnerIds = new Set<string>();

    for (const s of scores) {
      learnerIds.add(s.studentId);

      const max = s.item.maxScore ?? 0;
      if (max <= 0) continue;

      const actual = s.score ?? 0;

      totalScore += actual;
      totalMax += max;
    }

    const averagePercent =
      totalMax > 0 ? (totalScore / totalMax) * 100 : null;

    return NextResponse.json({
      ok: true,
      context: { tenantId, classroomId, term, academicYear },
      averagePercent,
      learnersCount: learnerIds.size,
      itemsCount: items.length,
    });
  } catch (err) {
    console.error("[TEACHER_CLASS_AVERAGE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to compute class average.",
      },
      { status: 500 }
    );
  }
}
