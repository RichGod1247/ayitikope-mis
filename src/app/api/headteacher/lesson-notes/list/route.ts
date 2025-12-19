// src/app/api/headteacher/lesson-notes/list/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

interface LessonNoteListItem {
  id: string;
  tenantId: string;
  teacherUserId: string | null;
  headteacherUserId: string | null;
  classroomId: string | null;

  phase: string | null;
  level: string | null;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;

  strand: string | null;
  substrand: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  createdAt: Date;
  updatedAt: Date;
}

type ListResponse =
  | {
      ok: true;
      items: LessonNoteListItem[];
    }
  | {
      ok: false;
      error: string;
    };

export async function GET(
  req: NextRequest
): Promise<NextResponse<ListResponse>> {
  const { searchParams } = new URL(req.url);

  const tenantId = (searchParams.get("tenantId") ?? "").trim();
  const statusParam = (searchParams.get("status") ?? "").trim() as
    | LessonNoteStatus
    | "ALL"
    | "";
  const teacherUserId = (searchParams.get("teacherUserId") ?? "").trim();

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId is required to fetch lesson notes for review.",
      },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {
    tenantId,
  };

  if (statusParam && statusParam !== "ALL") {
    where.status = statusParam;
  }

  if (teacherUserId) {
    where.teacherUserId = teacherUserId;
  }

  try {
    const raw = await prisma.lessonNote.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { updatedAt: "desc" },
      ],
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        headteacherUserId: true,
        classroomId: true,
        phase: true,
        level: true,
        subject: true,
        term: true,
        academicYear: true,
        weekNumber: true,
        strand: true,
        substrand: true,
        status: true,
        headteacherComment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Explicitly shape + cast status to LessonNoteStatus to satisfy TS
    const items: LessonNoteListItem[] = raw.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      teacherUserId: r.teacherUserId,
      headteacherUserId: r.headteacherUserId,
      classroomId: r.classroomId,
      phase: r.phase,
      level: r.level,
      subject: r.subject,
      term: r.term,
      academicYear: r.academicYear,
      weekNumber: r.weekNumber,
      strand: r.strand,
      substrand: r.substrand,
      status: r.status as LessonNoteStatus,
      headteacherComment: r.headteacherComment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const payload: ListResponse = { ok: true, items };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTES_LIST_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not load lesson notes for review. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
