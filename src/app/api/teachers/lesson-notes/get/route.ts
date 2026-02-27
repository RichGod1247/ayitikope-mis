// src/app/api/teachers/lesson-notes/get/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  subject: true,
  term: true,
  academicYear: true,
  weekNumber: true,
  lessonDate: true,

  curriculumUnitId: true,
  schemeOfWorkItemId: true,

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
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } }
  );
}
export async function PUT() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } }
  );
}
export async function DELETE() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function GET(req: NextRequest) {
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

  // Membership gate (bank-grade)
  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });

  const { searchParams } = new URL(req.url);

  // ✅ Backward-compatible aliases (some clients send ?id=)
  const lessonNoteId = (searchParams.get("lessonNoteId") ?? searchParams.get("id") ?? "").trim();

  if (!isPlausibleId(lessonNoteId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lessonNoteId." }, { status: 400 });
  }

  try {
    const note = await prisma.lessonNote.findFirst({
      where: {
        id: lessonNoteId,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId, // teacher-owned for MVP
      },
      select: LESSON_NOTE_SELECT,
    });

    if (!note) return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });

    return jsonNoStore(
      {
        ok: true,
        item: {
          ...note,
          // ✅ Normalize timestamps (always present keys, never undefined)
          lessonDate: toIso(note.lessonDate),
          submittedAt: toIso(note.submittedAt),
          reviewedAt: toIso(note.reviewedAt),
          approvedAt: toIso(note.approvedAt),
          rejectedAt: toIso(note.rejectedAt),
          createdAt: toIso(note.createdAt),
          updatedAt: toIso(note.updatedAt),
          status: String(note.status ?? "DRAFT").toUpperCase(),

          // ✅ Ensure keys exist (avoid undefined in JSON consumers)
          curriculumUnitId: note.curriculumUnitId ?? null,
          schemeOfWorkItemId: note.schemeOfWorkItemId ?? null,
          aiPlanJson: (note as any).aiPlanJson ?? null,
          aiPlanVersion: (note as any).aiPlanVersion ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load lesson note." }, { status: 500 });
  }
}
