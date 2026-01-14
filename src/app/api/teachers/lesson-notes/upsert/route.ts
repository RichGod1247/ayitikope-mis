// src/app/api/teachers/lesson-notes/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
type LessonNoteStatus = (typeof VALID_STATUSES)[number];

type UpsertBody = {
  lessonNoteId?: string;

  phase?: string | null;
  level?: string | null;
  subject?: string | null;
  term?: string | null;
  academicYear?: string | null;
  weekNumber?: number | string | null;
  lessonDate?: string | null;

  curriculumUnitId?: string | null;

  strand?: string | null;
  substrand?: string | null;
  contentStandard?: string | null;
  indicator?: string | null;
  lessonTitle?: string | null;

  objectives?: string | null;
  priorKnowledge?: string | null;
  teachingLearningResources?: string | null;
  introduction?: string | null;
  lessonDevelopment?: string | null;
  conclusion?: string | null;
  assessment?: string | null;
  homework?: string | null;
  differentiationNotes?: string | null;
  reflectionNotes?: string | null;

  status?: LessonNoteStatus; // teacher only: DRAFT | SUBMITTED
};

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isPlausibleId(id: string) {
  if (!id) return false;
  if (id.length < 5 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function asNullableString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return v;
}

function asTrimmedNullableString(v: unknown): string | null | undefined {
  const s = asNullableString(v);
  if (s === undefined) return undefined;
  if (s === null) return null;
  const t = s.trim();
  return t.length ? t : null;
}

function asWeekNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;

  const n =
    typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN;

  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function asNullableDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;

  const t = v.trim();
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function tooLarge(v: unknown, max = 50_000) {
  return typeof v === "string" && v.length > max;
}

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

const LESSON_NOTE_SELECT = {
  id: true,
  tenantId: true,
  teacherUserId: true,
  headteacherUserId: true,
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

  aiPlanJson: true,
  aiPlanVersion: true,

  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}
export async function PUT() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest) {
  // Auth
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const lessonNoteId = typeof body?.lessonNoteId === "string" ? body.lessonNoteId.trim() : "";
  if (!isPlausibleId(lessonNoteId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lessonNoteId." }, { status: 400 });
  }

  // Payload-size guard
  const maybeBig = [
    body.objectives,
    body.priorKnowledge,
    body.teachingLearningResources,
    body.introduction,
    body.lessonDevelopment,
    body.conclusion,
    body.assessment,
    body.homework,
    body.differentiationNotes,
    body.reflectionNotes,
  ];
  if (maybeBig.some((v) => tooLarge(v))) {
    return jsonNoStore({ ok: false, error: "One or more fields are too large." }, { status: 413 });
  }

  const requestedStatus = body.status;
  if (requestedStatus && !VALID_STATUSES.includes(requestedStatus)) {
    return jsonNoStore({ ok: false, error: "Invalid status value." }, { status: 400 });
  }

  // Teachers can ONLY set DRAFT or SUBMITTED
  if (requestedStatus === "APPROVED" || requestedStatus === "REJECTED") {
    return jsonNoStore({ ok: false, error: "You are not allowed to set this status." }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.lessonNote.findFirst({
        where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
        select: {
          id: true,
          status: true,
          submittedAt: true,

          curriculumUnitId: true,
          indicator: true,
          objectives: true,
          lessonDevelopment: true,
          assessment: true,
        },
      });

      if (!existing) {
        return { ok: false as const, status: 404, error: "Lesson note not found." };
      }

      // Lock editing while SUBMITTED or APPROVED
      const currentStatus = String(existing.status ?? "DRAFT").toUpperCase() as LessonNoteStatus;
      if (currentStatus === "SUBMITTED") {
        return {
          ok: false as const,
          status: 400,
          error: "This lesson note has been submitted and cannot be edited until it is returned.",
        };
      }
      if (currentStatus === "APPROVED") {
        return { ok: false as const, status: 400, error: "Approved lesson notes cannot be edited." };
      }

      const now = new Date();

      // Context updates
      const phase = asTrimmedNullableString(body.phase);
      const level = asTrimmedNullableString(body.level);
      const subject = asTrimmedNullableString(body.subject);
      const term = asTrimmedNullableString(body.term);
      const academicYear = asTrimmedNullableString(body.academicYear);
      const weekNumber = asWeekNumber(body.weekNumber);
      const lessonDate = asNullableDate(body.lessonDate);

      const curriculumUnitId = asTrimmedNullableString(body.curriculumUnitId);

      // Lesson fields
      const lessonTitle = asNullableString(body.lessonTitle);
      const objectives = asNullableString(body.objectives);
      const priorKnowledge = asNullableString(body.priorKnowledge);
      const teachingLearningResources = asNullableString(body.teachingLearningResources);
      const introduction = asNullableString(body.introduction);
      const lessonDevelopment = asNullableString(body.lessonDevelopment);
      const conclusion = asNullableString(body.conclusion);
      const assessment = asNullableString(body.assessment);
      const homework = asNullableString(body.homework);
      const differentiationNotes = asNullableString(body.differentiationNotes);
      const reflectionNotes = asNullableString(body.reflectionNotes);

      // Decide curriculumUnitId to use for deriving slice (prefer body, else existing)
      const effectiveUnitId =
        curriculumUnitId !== undefined ? curriculumUnitId : existing.curriculumUnitId ?? null;

      // Derive NaCCA slice from CurriculumUnit safely (tenant or global only)
      let derivedSlice:
        | {
            phase?: string | null;
            level?: string | null;
            subject?: string | null;
            term?: string | null;
            weekNumber?: number | null;
            strand?: string | null;
            substrand?: string | null;
            contentStandard?: string | null;
            indicator?: string | null;
          }
        | null = null;

      if (effectiveUnitId) {
        const unit = await (tx as any).curriculumUnit?.findFirst?.({
          where: {
            id: effectiveUnitId,
            OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
          },
          select: {
            phase: true,
            level: true,
            subject: true,
            term: true,
            weekNumber: true,
            strand: true,
            substrand: true,
            contentStandard: true,
            indicator: true,
          },
        });

        if (!unit) {
          return { ok: false as const, status: 400, error: "Selected curriculum unit not found." };
        }

        derivedSlice = {
          phase: unit.phase ?? null,
          level: unit.level ?? null,
          subject: unit.subject ?? null,
          term: unit.term ?? null,
          weekNumber: unit.weekNumber ?? null,
          strand: unit.strand ?? null,
          substrand: unit.substrand ?? null,
          contentStandard: unit.contentStandard ?? null,
          indicator: unit.indicator ?? null,
        };
      }

      // Status transition handling
      let nextStatus: LessonNoteStatus = currentStatus;
      let submittedAt: Date | null = existing.submittedAt ?? null;

      if (requestedStatus === "DRAFT") {
        nextStatus = "DRAFT";
      }

      if (requestedStatus === "SUBMITTED") {
        // Allow only from DRAFT or REJECTED
        if (currentStatus !== "DRAFT" && currentStatus !== "REJECTED") {
          return { ok: false as const, status: 400, error: "Only draft/returned notes can be submitted." };
        }

        // Server-enforced submit quality
        const effectiveIndicator = (derivedSlice?.indicator ?? safeTrim(body.indicator) ?? "").trim();

        const effObjectives = objectives !== undefined ? safeTrim(objectives) : safeTrim(existing.objectives);
        const effDev = lessonDevelopment !== undefined ? safeTrim(lessonDevelopment) : safeTrim(existing.lessonDevelopment);
        const effAssessment = assessment !== undefined ? safeTrim(assessment) : safeTrim(existing.assessment);

        const unitOk = !!effectiveUnitId && safeTrim(effectiveUnitId).length > 0;
        const indicatorOk = effectiveIndicator.length > 0;

        if (!unitOk || !indicatorOk || !effObjectives || !effDev || !effAssessment) {
          return {
            ok: false as const,
            status: 400,
            error:
              "To submit: select a NaCCA curriculum unit/indicator and fill objectives, lesson development, and assessment.",
          };
        }

        nextStatus = "SUBMITTED";
        submittedAt = submittedAt ?? now;
      }

      const data: any = {
        status: nextStatus,
        submittedAt,
      };

      // Apply optional fields only when present
      if (phase !== undefined) data.phase = phase;
      if (level !== undefined) data.level = level;
      if (subject !== undefined) data.subject = subject;
      if (term !== undefined) data.term = term;
      if (academicYear !== undefined) data.academicYear = academicYear;
      if (weekNumber !== undefined) data.weekNumber = weekNumber;
      if (lessonDate !== undefined) data.lessonDate = lessonDate;

      if (curriculumUnitId !== undefined) data.curriculumUnitId = curriculumUnitId;

      // Derived slice overrides spoofable client fields
      if (derivedSlice) {
        if (derivedSlice.phase !== undefined) data.phase = derivedSlice.phase;
        if (derivedSlice.level !== undefined) data.level = derivedSlice.level;
        if (derivedSlice.subject !== undefined) data.subject = derivedSlice.subject;
        if (derivedSlice.term !== undefined) data.term = derivedSlice.term;
        if (derivedSlice.weekNumber !== undefined && data.weekNumber === undefined) data.weekNumber = derivedSlice.weekNumber;

        data.strand = derivedSlice.strand ?? null;
        data.substrand = derivedSlice.substrand ?? null;
        data.contentStandard = derivedSlice.contentStandard ?? null;
        data.indicator = derivedSlice.indicator ?? null;
      } else {
        const strand = asNullableString(body.strand);
        const substrand = asNullableString(body.substrand);
        const contentStandard = asNullableString(body.contentStandard);
        const indicator = asNullableString(body.indicator);

        if (strand !== undefined) data.strand = strand;
        if (substrand !== undefined) data.substrand = substrand;
        if (contentStandard !== undefined) data.contentStandard = contentStandard;
        if (indicator !== undefined) data.indicator = indicator;
      }

      if (lessonTitle !== undefined) data.lessonTitle = lessonTitle;
      if (objectives !== undefined) data.objectives = objectives;
      if (priorKnowledge !== undefined) data.priorKnowledge = priorKnowledge;
      if (teachingLearningResources !== undefined) data.teachingLearningResources = teachingLearningResources;
      if (introduction !== undefined) data.introduction = introduction;
      if (lessonDevelopment !== undefined) data.lessonDevelopment = lessonDevelopment;
      if (conclusion !== undefined) data.conclusion = conclusion;
      if (assessment !== undefined) data.assessment = assessment;
      if (homework !== undefined) data.homework = homework;
      if (differentiationNotes !== undefined) data.differentiationNotes = differentiationNotes;
      if (reflectionNotes !== undefined) data.reflectionNotes = reflectionNotes;

      // ✅ Race-safe: only update if status unchanged since read
      const updated = await tx.lessonNote.updateMany({
        where: {
          id: lessonNoteId,
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          status: existing.status,
        },
        data,
      });

      if (updated.count !== 1) {
        return { ok: false as const, status: 409, error: "Conflict: lesson note changed. Refresh and try again." };
      }

      const fresh = await tx.lessonNote.findFirst({
        where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
        select: LESSON_NOTE_SELECT,
      });

      if (!fresh) return { ok: false as const, status: 500, error: "Failed to load updated lesson note." };

      return { ok: true as const, item: fresh };
    });

    if (!result.ok) return jsonNoStore({ ok: false, error: result.error }, { status: result.status });

    const item = result.item;
    return jsonNoStore(
      {
        ok: true,
        item: {
          ...item,
          lessonDate: toIso(item.lessonDate),
          submittedAt: toIso(item.submittedAt),
          reviewedAt: toIso(item.reviewedAt),
          approvedAt: toIso(item.approvedAt),
          rejectedAt: toIso(item.rejectedAt),
          createdAt: toIso(item.createdAt),
          updatedAt: toIso(item.updatedAt),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_UPSERT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to save this lesson note. Please try again." }, { status: 500 });
  }
}
