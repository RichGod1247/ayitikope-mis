// src/app/api/teacher/assessment/scores/list/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const QuerySchema = z.object({
  tenantId: z.string().min(1),
  itemId: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const raw = {
      tenantId: searchParams.get("tenantId") ?? "",
      itemId: searchParams.get("itemId") ?? "",
    };

    const data = QuerySchema.parse(raw);

    // Ensure the item exists and belongs to the tenant
    const item = await prisma.assessmentItem.findUnique({
      where: { id: data.itemId },
      select: { id: true, tenantId: true },
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

    const scores = await prisma.assessmentScore.findMany({
      where: { itemId: data.itemId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        itemId: true,
        studentId: true,
        score: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      itemId: data.itemId,
      count: scores.length,
      scores,
    });
  } catch (err: any) {
    console.error("[TEACHER_ASSESSMENT_SCORES_LIST_ERROR]", err);

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid query parameters.",
          details: err.flatten(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load scores. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
