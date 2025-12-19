// src/app/api/teachers/lesson-notes/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/teachers/lesson-notes/list
 *
 * Query params:
 * - tenantId       (required) -> which school
 * - teacherUserId  (required) -> which teacher (their User.id)
 * - status         (optional) -> DRAFT | SUBMITTED | APPROVED | REJECTED
 * - term           (optional) -> e.g. "1st Term"
 * - academicYear   (optional) -> e.g. "2025/2026"
 * - weekNumber     (optional) -> e.g. "3" (string, converted to number)
 *
 * Mental picture:
 * Each teacher has a box of lesson notes.
 * This endpoint says:
 *  "Show me all the notes in THIS teacher's box for THIS school,
 *   and if I say so, only notes with a certain status/term/year/week."
 */

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tenantId = searchParams.get("tenantId") ?? "";
  const teacherUserId = searchParams.get("teacherUserId") ?? "";

  const statusParam = searchParams.get("status"); // optional
  const term = searchParams.get("term") || undefined;
  const academicYear = searchParams.get("academicYear") || undefined;
  const weekNumberParam = searchParams.get("weekNumber"); // optional

  // -------------------------
  // Basic required checks
  // -------------------------
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }

  if (!teacherUserId) {
    return NextResponse.json(
      { ok: false, error: "teacherUserId is required." },
      { status: 400 }
    );
  }

  // -------------------------
  // Parse / validate status
  // -------------------------
  let status: LessonNoteStatus | undefined = undefined;

  if (statusParam) {
    const candidate = statusParam.toUpperCase();
    const allowed: LessonNoteStatus[] = [
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
    ];

    if (!allowed.includes(candidate as LessonNoteStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid status. Use one of: DRAFT, SUBMITTED, APPROVED, REJECTED.",
        },
        { status: 400 }
      );
    }

    status = candidate as LessonNoteStatus;
  }

  // -------------------------
  // Parse weekNumber (optional)
  // -------------------------
  let weekNumber: number | undefined = undefined;

  if (weekNumberParam) {
    const n = Number(weekNumberParam);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid weekNumber. It should be a positive whole number like 1, 2, 3…",
        },
        { status: 400 }
      );
    }
    weekNumber = n;
  }

  try {
    // Use `any` to stay resilient if the schema evolves
    const client = prisma as any;

    // -------------------------
    // Build WHERE filter
    // -------------------------
    const where: any = {
      tenantId,
      teacherUserId,
    };

    if (status) {
      where.status = status;
    }
    if (term) {
      where.term = term;
    }
    if (academicYear) {
      where.academicYear = academicYear;
    }
    if (typeof weekNumber === "number") {
      where.weekNumber = weekNumber;
    }

    // -------------------------
    // Query DB
    // -------------------------
    // IMPORTANT:
    // Only select fields that we KNOW exist in the current Prisma model
    // *and* current DB. We intentionally avoid `date`, `lessonDate`,
    // old NaCCA fields, and AI JSON fields for now.
    const notes = await client.lessonNote.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        headteacherUserId: true,
        classroomId: true,

        term: true,
        academicYear: true,
        strand: true,
        substrand: true,
        subject: true,
        weekNumber: true,

        status: true,
        headteacherComment: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    // -------------------------
    // Shape response (convert Date to string)
    // -------------------------
    const items = (notes || []).map((n: any) => ({
      id: n.id as string,
      tenantId: n.tenantId as string,
      teacherUserId: n.teacherUserId as string | null,
      headteacherUserId: n.headteacherUserId as string | null,
      classroomId: n.classroomId as string | null,

      term: n.term as string | null,
      academicYear: n.academicYear as string | null,
      strand: n.strand as string | null,
      substrand: n.substrand as string | null,
      subject: n.subject as string | null,
      weekNumber: n.weekNumber as number | null,

      status: n.status as LessonNoteStatus,
      headteacherComment: n.headteacherComment as string | null,

      createdAt: (n.createdAt as Date).toISOString(),
      updatedAt: (n.updatedAt as Date).toISOString(),
    }));

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTES_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load lesson notes for this teacher. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
