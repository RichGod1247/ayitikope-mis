// src/app/api/teachers/lesson-notes/generate-from-curriculum/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Generate a NaCCA-aligned LessonNote from a curriculum indicator slice.
 *
 * POST /api/teachers/lesson-notes/generate-from-curriculum
 *
 * Body:
 * {
 *   tenantId: string;
 *   teacherUserId: string;
 *   classroomId?: string | null;
 *
 *   // Where this lesson sits in the school year
 *   phase: string;        // "KG", "PRIMARY", "JHS"
 *   level: string;        // "KG1", "B3", "JHS1"
 *   subject: string;      // "Our World and Our People"
 *   term: string;         // "1st Term"
 *   academicYear: string; // "2025/2026"
 *   weekNumber: number;
 *   lessonDate?: string | null; // ISO date, optional
 *
 *   // NaCCA slice picked from the curriculum explorer
 *   slice: {
 *     indicatorId: string;
 *     curriculumUnitId?: string | null;
 *
 *     strandCode?: string | null;
 *     strandTitle?: string | null;
 *
 *     subStrandCode?: string | null;
 *     subStrandTitle?: string | null;
 *
 *     contentStandardCode?: string | null;
 *     contentStandardDescription?: string | null;
 *
 *     indicatorCode?: string | null;
 *     indicatorDescription?: string | null;
 *   };
 * }
 *
 * Response:
 *  { ok: true, note: LessonNote }
 */

type IndicatorSlice = {
  indicatorId: string;
  curriculumUnitId?: string | null;

  strandCode?: string | null;
  strandTitle?: string | null;

  subStrandCode?: string | null;
  subStrandTitle?: string | null;

  contentStandardCode?: string | null;
  contentStandardDescription?: string | null;

  indicatorCode?: string | null;
  indicatorDescription?: string | null;
};

type GenerateLessonNoteBody = {
  tenantId: string;
  teacherUserId: string;
  classroomId?: string | null;

  phase: string;
  level: string;
  subject: string;
  term: string;
  academicYear: string;
  weekNumber: number;
  lessonDate?: string | null;

  slice: IndicatorSlice;
};

async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    const data = (await req.json()) as T;
    return data;
  } catch {
    return null;
  }
}

// Optional: reject non-POST methods explicitly
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Use POST /api/teachers/lesson-notes/generate-from-curriculum to generate lesson notes.",
    },
    { status: 405 }
  );
}

export async function POST(req: NextRequest) {
  const body = await readJson<GenerateLessonNoteBody>(req);

  if (!body) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 }
    );
  }

  const {
    tenantId,
    teacherUserId,
    classroomId,
    phase,
    level,
    subject,
    term,
    academicYear,
    weekNumber,
    lessonDate,
    slice,
  } = body;

  // ------------------------------
  // Basic validation
  // ------------------------------
  if (!tenantId || !teacherUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId and teacherUserId are required.",
      },
      { status: 400 }
    );
  }

  if (!phase || !level || !subject) {
    return NextResponse.json(
      {
        ok: false,
        error: "phase, level and subject are required.",
      },
      { status: 400 }
    );
  }

  if (!term || !academicYear) {
    return NextResponse.json(
      {
        ok: false,
        error: "term and academicYear are required.",
      },
      { status: 400 }
    );
  }

  if (!weekNumber || weekNumber <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "weekNumber must be a positive integer.",
      },
      { status: 400 }
    );
  }

  if (!slice || !slice.indicatorId) {
    return NextResponse.json(
      {
        ok: false,
        error: "slice.indicatorId is required.",
      },
      { status: 400 }
    );
  }

  // Parse lesson date (optional)
  let lessonDateValue: Date | null = null;
  if (lessonDate && lessonDate.trim().length > 0) {
    const d = new Date(lessonDate);
    if (!Number.isNaN(d.getTime())) {
      lessonDateValue = d;
    }
  }

  // ------------------------------
  // Build basic NaCCA-aligned fields
  // ------------------------------
  const strandTitle =
    slice.strandTitle ??
    (slice.strandCode ? `Strand ${slice.strandCode}` : "Strand");
  const subStrandTitle =
    slice.subStrandTitle ??
    (slice.subStrandCode ? `Sub-strand ${slice.subStrandCode}` : null);

  const contentStandardText =
    slice.contentStandardDescription ??
    (slice.contentStandardCode
      ? `${slice.contentStandardCode} – content standard`
      : null);

  const indicatorText =
    slice.indicatorDescription ??
    (slice.indicatorCode
      ? `${slice.indicatorCode} – indicator`
      : "Indicator description");

  // A simple default lesson title (teacher can edit later)
  const lessonTitle =
    indicatorText && indicatorText.length > 120
      ? indicatorText.slice(0, 117) + "…"
      : indicatorText;

  // ------------------------------
  // Simple AI-plan stub (for later real AI)
  // ------------------------------
  const aiPlanStub = {
    generator: "curriculum-indicator-stub",
    createdAt: new Date().toISOString(),
    fromIndicatorId: slice.indicatorId,
    strandTitle,
    subStrandTitle,
    contentStandardText,
    indicatorText,
    notes:
      "In a future phase, this object will be replaced by a real AI-generated lesson structure.",
  };

  // ------------------------------
  // Create the LessonNote
  // ------------------------------
  try {
    const note = await prisma.lessonNote.create({
      data: {
        tenantId,
        teacherUserId,
        headteacherUserId: null,
        classroomId: classroomId ?? null,

        phase,
        level,

        curriculumUnitId: slice.curriculumUnitId ?? null,

        subject,
        term,
        academicYear,
        weekNumber,
        lessonDate: lessonDateValue,

        // NaCCA structure
        strand: strandTitle,
        substrand: subStrandTitle,
        contentStandard: contentStandardText,
        indicator: indicatorText,
        lessonTitle,

        // Core lesson sections – initially empty, teacher will fill
        objectives: null,
        priorKnowledge: null,
        teachingLearningResources: null,
        introduction: null,
        lessonDevelopment: null,
        conclusion: null,
        assessment: null,
        homework: null,
        differentiationNotes: null,
        reflectionNotes: null,

        // Status / review
        status: "DRAFT",
        headteacherComment: null,
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,

        // AI plan
        aiPlanJson: aiPlanStub,
        aiPlanVersion: 1,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        note,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(
      "GENERATE_LESSON_NOTE_FROM_CURRICULUM_ERROR",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate lesson note from curriculum slice. Please try again.",
      },
      { status: 500 }
    );
  }
}
