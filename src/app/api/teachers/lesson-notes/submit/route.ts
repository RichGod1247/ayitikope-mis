// src/app/api/teachers/lesson-notes/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/teachers/lesson-notes/submit
 *
 * Body:
 * {
 *   "id": "lessonNoteId",
 *   "teacherUserId": "optional-teacher-id-for-safety"
 * }
 *
 * Behaviour:
 * - Only DRAFT or REJECTED notes can be submitted.
 * - Sets status -> SUBMITTED and submittedAt -> now().
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id as string | undefined;
    const teacherUserId = body?.teacherUserId as string | undefined;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Lesson note id is required." },
        { status: 400 }
      );
    }

    // Cast prisma client to any so we don't fight evolving schema
    const client = prisma as any;

    const existing = await client.lessonNote.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Lesson note not found." },
        { status: 404 }
      );
    }

    // Optional: simple safety check
    if (teacherUserId && existing.teacherUserId !== teacherUserId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "You are not allowed to submit this lesson note (teacher mismatch).",
        },
        { status: 403 }
      );
    }

    const currentStatus = (existing.status || "DRAFT").toUpperCase();

    if (currentStatus !== "DRAFT" && currentStatus !== "REJECTED") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only DRAFT or REJECTED lesson notes can be submitted for review.",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    const updated = await client.lessonNote.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        approvedAt: true,
        rejectedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        item: {
          id: updated.id as string,
          status: updated.status as string,
          submittedAt: updated.submittedAt
            ? (updated.submittedAt as Date).toISOString()
            : null,
          reviewedAt: updated.reviewedAt
            ? (updated.reviewedAt as Date).toISOString()
            : null,
          approvedAt: updated.approvedAt
            ? (updated.approvedAt as Date).toISOString()
            : null,
          rejectedAt: updated.rejectedAt
            ? (updated.rejectedAt as Date).toISOString()
            : null,
          updatedAt: (updated.updatedAt as Date).toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_SUBMIT_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to submit lesson note for review. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
