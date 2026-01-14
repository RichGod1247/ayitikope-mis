// src/app/api/teachers/lesson-notes/item/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

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
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
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
    console.error("[TEACHER_LESSON_NOTE_ITEM_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: "Server error while loading this lesson note. Please try again." },
      { status: 500 }
    );
  }
}
