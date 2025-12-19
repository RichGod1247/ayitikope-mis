// src/app/api/teachers/lesson-notes/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
type LessonNoteStatus = (typeof VALID_STATUSES)[number];

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const {
    lessonNoteId,
    objectives,
    priorKnowledge,
    teachingLearningResources,
    introduction,
    lessonDevelopment,
    conclusion,
    assessment,
    homework,
    differentiationNotes,
    reflectionNotes,
    status,
  } = body ?? {};

  if (!lessonNoteId || typeof lessonNoteId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid lessonNoteId." },
      { status: 400 }
    );
  }

  if (status && !VALID_STATUSES.includes(status as LessonNoteStatus)) {
    return NextResponse.json(
      { ok: false, error: "Invalid status value." },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.lessonNote.findUnique({
      where: { id: lessonNoteId },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Lesson note not found." },
        { status: 404 }
      );
    }

    const now = new Date();

    // Preserve previous timestamps unless we are moving to SUBMITTED
    let submittedAt = existing.submittedAt;
    if (status === "SUBMITTED") {
      submittedAt = now;
    }

    const updated = await prisma.lessonNote.update({
      where: { id: lessonNoteId },
      data: {
        objectives:
          typeof objectives === "string"
            ? objectives
            : existing.objectives,
        priorKnowledge:
          typeof priorKnowledge === "string"
            ? priorKnowledge
            : existing.priorKnowledge,
        teachingLearningResources:
          typeof teachingLearningResources === "string"
            ? teachingLearningResources
            : existing.teachingLearningResources,
        introduction:
          typeof introduction === "string"
            ? introduction
            : existing.introduction,
        lessonDevelopment:
          typeof lessonDevelopment === "string"
            ? lessonDevelopment
            : existing.lessonDevelopment,
        conclusion:
          typeof conclusion === "string"
            ? conclusion
            : existing.conclusion,
        assessment:
          typeof assessment === "string"
            ? assessment
            : existing.assessment,
        homework:
          typeof homework === "string"
            ? homework
            : existing.homework,
        differentiationNotes:
          typeof differentiationNotes === "string"
            ? differentiationNotes
            : existing.differentiationNotes,
        reflectionNotes:
          typeof reflectionNotes === "string"
            ? reflectionNotes
            : existing.reflectionNotes,
        status: (status as LessonNoteStatus) ?? (existing.status as LessonNoteStatus),
        submittedAt,
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    console.error("TEACHER_LESSON_NOTE_UPSERT_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to save this lesson note. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
