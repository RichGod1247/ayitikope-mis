// src/app/api/teachers/lesson-notes/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
type LessonNoteStatus = (typeof VALID_STATUSES)[number];

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

function isValidStatus(v: string): v is LessonNoteStatus {
  return (VALID_STATUSES as readonly string[]).includes(v);
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

/**
 * GET /api/teachers/lesson-notes/list
 *
 * Identity:
 * - tenantId + teacherUserId are derived from server auth (NOT from query params)
 *
 * Optional filters:
 * - status       -> DRAFT | SUBMITTED | APPROVED | REJECTED
 * - term         -> e.g. "1st Term"
 * - academicYear -> e.g. "2025/2026"
 * - weekNumber   -> positive integer
 *
 * Pagination:
 * - take         -> 1..200 (default 50)
 * - cursor       -> lessonNote.id
 *
 * NOTE: Cursor pagination must order by the cursor field for correctness.
 * We order by id desc to keep it stable.
 */
export async function GET(req: NextRequest) {
  // Auth (server identity)
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

  const { searchParams } = new URL(req.url);

  // Filters
  const statusParamRaw = (searchParams.get("status") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim() || undefined;
  const academicYear = (searchParams.get("academicYear") ?? "").trim() || undefined;

  const weekNumberRaw = searchParams.get("weekNumber");
  const weekNumber = parsePositiveInt(weekNumberRaw);

  if (weekNumberRaw && weekNumber == null) {
    return jsonNoStore(
      { ok: false, error: "Invalid weekNumber. It must be a positive whole number like 1, 2, 3…" },
      { status: 400 }
    );
  }

  let status: LessonNoteStatus | undefined;
  if (statusParamRaw) {
    const candidate = statusParamRaw.toUpperCase();
    if (!isValidStatus(candidate)) {
      return jsonNoStore(
        { ok: false, error: "Invalid status. Use one of: DRAFT, SUBMITTED, APPROVED, REJECTED." },
        { status: 400 }
      );
    }
    status = candidate;
  }

  // Pagination
  const takeRaw = searchParams.get("take");
  const take = clamp(Number(takeRaw ?? 50) || 50, 1, 200);

  const cursorRaw = (searchParams.get("cursor") ?? "").trim();
  const cursor = cursorRaw ? cursorRaw : undefined;

  if (cursor && !isPlausibleId(cursor)) {
    return jsonNoStore({ ok: false, error: "Invalid cursor." }, { status: 400 });
  }

  const where: any = {
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
  };

  if (status) where.status = status;
  if (term) where.term = term;
  if (academicYear) where.academicYear = academicYear;
  if (typeof weekNumber === "number") where.weekNumber = weekNumber;

  try {
    const notes = await prisma.lessonNote.findMany({
      where,
      // ✅ Stable cursor pagination: order by cursor field
      orderBy: [{ id: "desc" }],
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
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
        lessonTitle: true,

        status: true,
        headteacherComment: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = notes.length > take;
    const sliced = hasMore ? notes.slice(0, take) : notes;

    const items = sliced.map((n) => ({
      id: n.id,
      tenantId: n.tenantId,
      teacherUserId: n.teacherUserId,
      headteacherUserId: n.headteacherUserId,
      classroomId: n.classroomId,

      phase: n.phase ?? null,
      level: n.level ?? null,
      subject: n.subject ?? null,
      term: n.term ?? null,
      academicYear: n.academicYear ?? null,
      weekNumber: n.weekNumber ?? null,

      strand: n.strand ?? null,
      substrand: n.substrand ?? null,
      lessonTitle: n.lessonTitle ?? null,

      status: String(n.status).toUpperCase() as LessonNoteStatus,
      headteacherComment: n.headteacherComment ?? null,

      createdAt: toIso(n.createdAt),
      updatedAt: toIso(n.updatedAt),
    }));

    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return jsonNoStore({ ok: true, items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTES_LIST_ERROR]", err);
    return jsonNoStore(
      {
        ok: false,
        error: "Failed to load lesson notes. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
