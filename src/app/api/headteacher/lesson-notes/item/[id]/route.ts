// src/app/api/headteacher/lesson-notes/item/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type LessonNoteDetail = {
  id: string;

  teacherUserId: string;
  classroomId: string | null;

  phase: string | null;
  level: string | null;
  curriculumUnitId: string | null;

  subject: string;
  term: string;
  academicYear: string;
  weekNumber: number | null;
  lessonDate: string | null;

  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  lessonTitle: string | null;

  objectives: string | null;
  priorKnowledge: string | null;
  teachingLearningResources: string | null;
  introduction: string | null;
  lessonDevelopment: string | null;
  conclusion: string | null;
  assessment: string | null;
  homework: string | null;
  differentiationNotes: string | null;
  reflectionNotes: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

type ItemResponse =
  | { ok: true; item: LessonNoteDetail }
  | { ok: false; error: string };

function jsonNoStore(payload: any, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isLikelyId(id: string) {
  return /^[a-zA-Z0-9_-]{5,80}$/.test(id);
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

export async function GET(
  _req: NextRequest,
  ctxRoute: { params: Promise<{ id: string }> }
): Promise<NextResponse<ItemResponse>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) {
    return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies ItemResponse, { status: 401 });
  }

  const { id } = await ctxRoute.params;
  const noteId = String(id ?? "").trim();

  if (!noteId || !isLikelyId(noteId)) {
    return jsonNoStore({ ok: false, error: "Invalid lesson note id." } satisfies ItemResponse, { status: 400 });
  }

  try {
    const note = await prisma.lessonNote.findFirst({
      where: { id: noteId, tenantId: ctx.tenantId },
      select: {
        id: true,
        teacherUserId: true,
        classroomId: true,

        phase: true,
        level: true,
        curriculumUnitId: true,

        subject: true,
        term: true,
        academicYear: true,
        weekNumber: true,
        lessonDate: true,

        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        lessonTitle: true,

        objectives: true,
        priorKnowledge: true,
        teachingLearningResources: true,
        introduction: true,
        lessonDevelopment: true,
        conclusion: true,
        assessment: true,
        homework: true,
        differentiationNotes: true,
        reflectionNotes: true,

        status: true,
        headteacherComment: true,

        submittedAt: true,
        reviewedAt: true,
        approvedAt: true,
        rejectedAt: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!note) {
      return jsonNoStore({ ok: false, error: "Lesson note not found." } satisfies ItemResponse, { status: 404 });
    }

    // Headteacher must not review own note (extra safety)
    if (note.teacherUserId === ctx.userId) {
      return jsonNoStore({ ok: false, error: "Forbidden." } satisfies ItemResponse, { status: 403 });
    }

    return jsonNoStore({
      ok: true,
      item: {
        id: note.id,
        teacherUserId: note.teacherUserId,
        classroomId: note.classroomId,

        phase: note.phase,
        level: note.level,
        curriculumUnitId: note.curriculumUnitId,

        subject: note.subject,
        term: note.term,
        academicYear: note.academicYear,
        weekNumber: note.weekNumber,
        lessonDate: toIso(note.lessonDate),

        strand: note.strand,
        substrand: note.substrand,
        contentStandard: note.contentStandard,
        indicator: note.indicator,
        lessonTitle: note.lessonTitle,

        objectives: note.objectives,
        priorKnowledge: note.priorKnowledge,
        teachingLearningResources: note.teachingLearningResources,
        introduction: note.introduction,
        lessonDevelopment: note.lessonDevelopment,
        conclusion: note.conclusion,
        assessment: note.assessment,
        homework: note.homework,
        differentiationNotes: note.differentiationNotes,
        reflectionNotes: note.reflectionNotes,

        status: note.status as LessonNoteStatus,
        headteacherComment: note.headteacherComment,

        submittedAt: toIso(note.submittedAt),
        reviewedAt: toIso(note.reviewedAt),
        approvedAt: toIso(note.approvedAt),
        rejectedAt: toIso(note.rejectedAt),

        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    } satisfies ItemResponse);
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTE_ITEM_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Could not load this lesson note. Please try again." } satisfies ItemResponse,
      { status: 500 }
    );
  }
}
