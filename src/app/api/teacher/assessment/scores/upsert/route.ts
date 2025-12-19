// src/app/api/teacher/assessment/scores/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const ScoreSchema = z.object({
  studentId: z.string().min(1, { message: "Student is required" }),
  score: z
    .number()
    .min(0, { message: "Score must be at least 0" }),
  comment: z.string().optional(),
});

const BodySchema = z.object({
  tenantId: z.string().min(1, { message: "Tenant is required" }),
  itemId: z.string().min(1, { message: "Assessment item is required" }),
  scores: z
    .array(ScoreSchema)
    .min(1, { message: "At least one learner score is required" }),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      const zerr = parsed.error.flatten();
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid data. Please check the form and try again.",
          details: {
            fieldErrors: zerr.fieldErrors,
            formErrors: zerr.formErrors,
          },
        },
        { status: 400 }
      );
    }

    const { tenantId, itemId, scores } = parsed.data;

    const client = prisma as any;

    // Ensure the assessment item belongs to this tenant
    const item = await client.assessmentItem.findFirst({
      where: {
        id: itemId,
        tenantId,
      },
      select: { id: true },
    });

    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: "Assessment item not found for this tenant.",
        },
        { status: 404 }
      );
    }

    // Upsert scores inside a transaction
    const savedScores = await client.$transaction(async (tx: any) => {
      const results = [];

      for (const s of scores) {
        const row = await tx.assessmentScore.upsert({
          where: {
            assessment_student_unique: {
              itemId,
              studentId: s.studentId,
            },
          },
          update: {
            score: s.score,
            comment: s.comment ?? null,
          },
          create: {
            itemId,
            studentId: s.studentId,
            score: s.score,
            comment: s.comment ?? null,
          },
        });

        results.push(row);
      }

      return results;
    });

    return NextResponse.json({
      ok: true,
      itemId,
      count: savedScores.length,
      scores: savedScores,
    });
  } catch (err: any) {
    console.error("[TEACHER_ASSESSMENT_SCORES_UPSERT_ERROR]", err);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save assessment scores. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
