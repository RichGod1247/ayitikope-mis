// src/app/api/teacher/assessment/scores/bulk-upsert/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ScoreSchema = z.object({
  studentId: z.string().min(1),
  score: z.number().min(0),
  comment: z.string().nullable().optional(),
});

const PayloadSchema = z.object({
  tenantId: z.string().min(1),
  itemId: z.string().min(1),
  scores: z.array(ScoreSchema),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const data = PayloadSchema.parse(json);

    // 1) Make sure the item exists and belongs to this tenant
    const item = await prisma.assessmentItem.findUnique({
      where: { id: data.itemId },
      select: {
        id: true,
        tenantId: true,
        maxScore: true,
      },
    });

    if (!item || item.tenantId !== data.tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Assessment item not found for this tenant.",
        },
        { status: 404 }
      );
    }

    const maxScore = item.maxScore;

    // 2) Prepare payload – clamp scores between 0 and maxScore if needed
    const toSave = data.scores.map((s) => {
      let safeScore = s.score;
      if (typeof maxScore === "number") {
        if (safeScore < 0) safeScore = 0;
        if (safeScore > maxScore) safeScore = maxScore;
      }

      return {
        itemId: data.itemId,
        studentId: s.studentId,
        score: safeScore,
        comment: s.comment ?? null,
      };
    });

    // 3) Upsert scores one by one using the composite unique key
    const results = [];
    for (const s of toSave) {
      const result = await prisma.assessmentScore.upsert({
        where: {
          assessment_student_unique: {
            itemId: s.itemId,
            studentId: s.studentId,
          },
        },
        update: {
          score: s.score,
          comment: s.comment,
        },
        create: {
          itemId: s.itemId,
          studentId: s.studentId,
          score: s.score,
          comment: s.comment,
        },
      });

      results.push(result);
    }

    return NextResponse.json({
      ok: true,
      itemId: data.itemId,
      count: results.length,
      scores: results,
    });
  } catch (err: any) {
    console.error(
      "[TEACHER_ASSESSMENT_SCORES_BULK_UPSERT_ERROR]",
      err
    );

    // Zod validation error
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid data. Please check the form and try again.",
          details: err.flatten(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to save scores. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
