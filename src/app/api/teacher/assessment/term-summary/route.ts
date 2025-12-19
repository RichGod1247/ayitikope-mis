// src/app/api/teacher/assessment/term-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Term Summary for a Classroom
 *
 * GET /api/teacher/assessment/term-summary
 *   ?tenantId=...
 *   &classroomId=...
 *   &term=...
 *   &academicYear=...
 *
 * Response:
 * {
 *   ok: true,
 *   summary: [
 *     {
 *       studentId,
 *       name,
 *       itemsCount,
 *       totalScore,
 *       maxTotal,
 *       percentage
 *     },
 *     ...
 *   ]
 * }
 *
 * If there is an error, we log it and return ok:false with a message.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const classroomId = searchParams.get("classroomId");
    const term = searchParams.get("term") ?? "1st Term";
    const academicYear =
      searchParams.get("academicYear") ?? "2025/2026";

    // Basic validation
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required" },
        { status: 400 }
      );
    }

    if (!classroomId) {
      return NextResponse.json(
        { ok: false, error: "classroomId is required" },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // 1) Load all students in this classroom for this tenant
    const students = await client.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: {
        firstName: "asc",
      },
    });

    // If no students, nothing to summarize
    if (!students || students.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: [],
      });
    }

    // 2) Load assessment items for this classroom / term / academic year
    const items = await client.assessmentItem.findMany({
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
      orderBy: {
        date: "asc",
      },
    });

    // If no assessment items, return 0s for everyone
    if (!items || items.length === 0) {
      const summary = students.map((s: any) => ({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        itemsCount: 0,
        totalScore: 0,
        maxTotal: 0,
        percentage: null as number | null,
      }));

      return NextResponse.json({ ok: true, summary });
    }

    const itemIds = items.map((i: any) => i.id);

    // Map itemId -> maxScore for quick lookup
    const itemById = new Map<string, { id: string; maxScore: number }>();
    for (const i of items) {
      itemById.set(i.id, {
        id: i.id,
        maxScore:
          i.maxScore != null ? Number(i.maxScore) : 0,
      });
    }

    // 3) Load scores for those items
    //    NOTE: we ONLY filter by itemId list here to avoid tenantId field mismatches
    const scores = await client.assessmentScore.findMany({
      where: {
        itemId: { in: itemIds },
      },
      select: {
        studentId: true,
        itemId: true,
        score: true,
      },
    });

    // 4) Prepare aggregation containers per student
    type Agg = {
      itemsCount: number;
      totalScore: number;
      maxTotal: number;
    };

    const aggByStudentId = new Map<string, Agg>();

    for (const s of students) {
      aggByStudentId.set(s.id, {
        itemsCount: 0,
        totalScore: 0,
        maxTotal: 0,
      });
    }

    // 5) Aggregate each score into the right student's totals
    for (const sc of scores as {
      studentId: string;
      itemId: string;
      score: number | null;
    }[]) {
      const item = itemById.get(sc.itemId);
      if (!item) continue; // safety

      const agg = aggByStudentId.get(sc.studentId);
      if (!agg) continue; // safety

      const numericScore =
        sc.score != null ? Number(sc.score) : 0;
      const maxScore =
        item.maxScore != null ? Number(item.maxScore) : 0;

      // Count how many items this learner has a score for
      agg.itemsCount += 1;
      // Add their score
      agg.totalScore += numericScore;
      // Add the maximum possible for that item
      agg.maxTotal += maxScore;
    }

    // 6) Build final summary array
    const summary = students.map((s: any) => {
      const agg = aggByStudentId.get(s.id)!;
      const percentage =
        agg.maxTotal > 0
          ? (agg.totalScore / agg.maxTotal) * 100
          : null;

      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        itemsCount: agg.itemsCount,
        totalScore: agg.totalScore,
        maxTotal: agg.maxTotal,
        percentage,
      };
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    console.error("[TEACHER_TERM_SUMMARY_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load term summary." },
      { status: 500 }
    );
  }
}
