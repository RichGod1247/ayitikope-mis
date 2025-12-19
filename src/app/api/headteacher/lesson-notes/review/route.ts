// src/app/api/headteacher/lesson-notes/review/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ReviewBody = {
  tenantId?: string;
  headteacherUserId?: string | null;
  lessonNoteId?: string;
  action?: "APPROVE" | "REJECT";
  comment?: string | null;
};

type ReviewResponse =
  | {
      ok: true;
      item: {
        id: string;
        status: LessonNoteStatus;
        headteacherComment: string | null;
        headteacherUserId: string | null;
        reviewedAt: string | null;
        approvedAt: string | null;
        rejectedAt: string | null;
        updatedAt: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

// We intentionally do NOT use NextResponse<ReviewResponse> as a generic here,
// to avoid TypeScript complaining if the JSON shape changes slightly.
export async function POST(req: NextRequest) {
  let body: ReviewBody;

  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 }
    );
  }

  const tenantId = (body.tenantId ?? "").trim();
  const lessonNoteId = (body.lessonNoteId ?? "").trim();
  const action = body.action;
  const rawHeadteacherUserId = (body.headteacherUserId ?? "").trim();
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0
      ? body.comment.trim()
      : null;

  if (!tenantId) {
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error: "tenantId is required.",
      },
      { status: 400 }
    );
  }

  if (!lessonNoteId) {
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error: "lessonNoteId is required.",
      },
      { status: 400 }
    );
  }

  if (action !== "APPROVE" && action !== "REJECT") {
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error: 'action must be either "APPROVE" or "REJECT".',
      },
      { status: 400 }
    );
  }

  // Make sure the note actually exists and belongs to this tenant
  const existing = await prisma.lessonNote.findFirst({
    where: {
      id: lessonNoteId,
      tenantId,
    },
    select: {
      id: true,
      status: true,
      headteacherUserId: true,
    },
  });

  if (!existing) {
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error: "Lesson note not found for this tenant.",
      },
      { status: 404 }
    );
  }

  // Decide new status + timestamps
  const now = new Date();
  let newStatus: LessonNoteStatus;
  let approvedAt: Date | null = null;
  let rejectedAt: Date | null = null;

  if (action === "APPROVE") {
    newStatus = "APPROVED";
    approvedAt = now;
  } else {
    newStatus = "REJECTED";
    rejectedAt = now;
  }

  /**
   * KEY FIX:
   * Foreign key violation was happening because we were trying to set
   * headteacherUserId to a demo ID ("HEADTEACHER_DEMO_ID") that does not
   * exist in the User table.
   *
   * For now:
   * - If the ID looks like the demo placeholder, we simply DO NOT update
   *   the headteacherUserId field (we leave it as-is in the DB).
   * - When you wire real authentication, you will pass a real user ID here
   *   and this code will happily store it.
   */
  let headteacherUserIdForUpdate: string | null | undefined = undefined;

  if (
    rawHeadteacherUserId &&
    !rawHeadteacherUserId.startsWith("HEADTEACHER_DEMO")
  ) {
    headteacherUserIdForUpdate = rawHeadteacherUserId;
  } else {
    // Do not touch the existing FK field; avoid P2003.
    headteacherUserIdForUpdate = undefined;
  }

  try {
    const data: any = {
      status: newStatus,
      headteacherComment: comment,
      reviewedAt: now,
      approvedAt,
      rejectedAt,
      updatedAt: now,
    };

    // Only include headteacherUserId if we have a "real" ID
    if (headteacherUserIdForUpdate !== undefined) {
      data.headteacherUserId = headteacherUserIdForUpdate;
    }

    const updated = await prisma.lessonNote.update({
      where: { id: lessonNoteId },
      data,
      select: {
        id: true,
        status: true,
        headteacherComment: true,
        headteacherUserId: true,
        reviewedAt: true,
        approvedAt: true,
        rejectedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json<ReviewResponse>({
      ok: true,
      item: {
        id: updated.id,
        status: updated.status as LessonNoteStatus,
        headteacherComment: updated.headteacherComment,
        headteacherUserId: updated.headteacherUserId,
        reviewedAt: updated.reviewedAt
          ? updated.reviewedAt.toISOString()
          : null,
        approvedAt: updated.approvedAt
          ? updated.approvedAt.toISOString()
          : null,
        rejectedAt: updated.rejectedAt
          ? updated.rejectedAt.toISOString()
          : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTE_REVIEW_ERROR", err);
    return NextResponse.json<ReviewResponse>(
      {
        ok: false,
        error:
          "Could not update lesson note status. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
