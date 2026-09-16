// src/app/api/teachers/lesson-notes/item/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  getCurrentCompletedTranslationFields,
  translationCompletionApplies,
} from "@/lib/lessonNotes/translationCompletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id?: string };

function jsonNoStore(payload: any, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(payload, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function isPlausibleId(id: string) {
  if (!id) return false;
  if (id.length < 5 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

const LESSON_NOTE_SELECT = {
  id: true,
  tenantId: true,
  teacherUserId: true,
  headteacherUserId: true,
  classroomId: true,

  phase: true,
  level: true,

  schemeOfWorkItemId: true,
  curriculumUnitId: true,

  subject: true,
  lessonLanguageCode: true,
  languageRegistryVersion: true,
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
  coreCompetencies: true,
  keywords: true,
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

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}
export async function PUT() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}
export async function DELETE() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(_req: NextRequest, context: { params: Params } | { params: Promise<Params> }) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // ✅ Membership gate (ACTIVE only)
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const { id: rawId } = await Promise.resolve((context as any).params as Params);
  const id = typeof rawId === "string" ? rawId.trim() : "";

  if (!isPlausibleId(id)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lesson note ID." }, { status: 400 });
  }

  try {
    const item = await prisma.lessonNote.findFirst({
      where: { id, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
      select: LESSON_NOTE_SELECT,
    });

    if (!item) return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });

    const completionRequired = translationCompletionApplies({
      subject: item.subject,
      languageCode: item.lessonLanguageCode,
      registryVersion: item.languageRegistryVersion,
    });

    const completionRows = completionRequired
      ? await prisma.lessonTranslationCompletion.findMany({
          where: {
            lessonNoteId: item.id,
            tenantId: ctx.tenantId,
            teacherUserId: ctx.userId,
          },
          select: {
            fieldKey: true,
            finalHash: true,
            receiptId: true,
          },
        })
      : [];

    const completedFields = completionRequired
      ? getCurrentCompletedTranslationFields({
          values: {
            lessonTitle: item.lessonTitle,
            objectives: item.objectives,
            priorKnowledge: item.priorKnowledge,
            coreCompetencies: item.coreCompetencies,
            keywords: item.keywords,
            teachingLearningResources: item.teachingLearningResources,
            introduction: item.introduction,
            lessonDevelopment: item.lessonDevelopment,
            conclusion: item.conclusion,
            assessment: item.assessment,
            homework: item.homework,
            differentiationNotes: item.differentiationNotes,
            reflectionNotes: item.reflectionNotes,
          },
          rows: completionRows,
        })
      : [];

    return jsonNoStore(
      {
        ok: true,
        translationCompletion: {
          required: completionRequired,
          completedFields,
        },
        item: {
          ...item,
          lessonDate: toIso(item.lessonDate),
          submittedAt: toIso(item.submittedAt),
          reviewedAt: toIso(item.reviewedAt),
          approvedAt: toIso(item.approvedAt),
          rejectedAt: toIso(item.rejectedAt),
          createdAt: toIso(item.createdAt),
          updatedAt: toIso(item.updatedAt),
          status: String(item.status ?? "DRAFT").toUpperCase(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_ITEM_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Server error while loading this lesson note." }, { status: 500 });
  }
}
