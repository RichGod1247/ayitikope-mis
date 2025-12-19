// src/app/api/teacher/assessment/items/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Delete a single assessment item and its scores.
 *
 * POST /api/teacher/assessment/items/delete
 * Body: { itemId: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const itemId = body?.itemId as string | undefined;
    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { ok: false, error: "itemId is required." },
        { status: 400 }
      );
    }

    // Check it exists
    const item = await prisma.assessmentItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Assessment item not found." },
        { status: 404 }
      );
    }

    // First delete linked scores
    await prisma.assessmentScore.deleteMany({
      where: { itemId },
    });

    // Then delete the item itself
    await prisma.assessmentItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TEACHER_ASSESSMENT_ITEM_DELETE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to delete assessment item. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
