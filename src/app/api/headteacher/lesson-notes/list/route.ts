// src/app/api/headteacher/lesson-notes/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";

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
  | { ok: true; items: LessonNoteListItem[] }
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

const VALID_STATUSES = new Set<LessonNoteStatus>(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

function parseStatus(v: string | null): LessonNoteStatus | "ALL" | null {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return null;
  if (t === "ALL") return "ALL";
  if (VALID_STATUSES.has(t as LessonNoteStatus)) return t as LessonNoteStatus;
  return null;
}

function parseIntBounded(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt((v ?? "").trim(), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest): Promise<NextResponse<ListResponse>> {
  // ✅ Auth + tenant enforcement (never trust query tenantId)
  const ctx = await getHeadteacherApiContext();
  if (!ctx) {
    return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies ListResponse, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // Backwards-compat: accept tenantId param but ignore it completely
  // const ignoredTenantId = (searchParams.get("tenantId") ?? "").trim();

  const statusParam = parseStatus(searchParams.get("status"));
  if (searchParams.get("status") && statusParam === null) {
    return jsonNoStore(
      { ok: false, error: 'Invalid status. Use DRAFT|SUBMITTED|APPROVED|REJECTED|ALL.' } satisfies ListResponse,
      { status: 400 }
    );
  }

  const teacherUserId = (searchParams.get("teacherUserId") ?? "").trim();
  if (teacherUserId && !isLikelyId(teacherUserId)) {
    return jsonNoStore({ ok: false, error: "Invalid teacherUserId." } satisfies ListResponse, { status: 400 });
  }

  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  if (classroomId && !isLikelyId(classroomId)) {
    return jsonNoStore({ ok: false, error: "Invalid classroomId." } satisfies ListResponse, { status: 400 });
  }

  const term = (searchParams.get("term") ?? "").trim();
  const academicYear = (searchParams.get("academicYear") ?? "").trim();
  const subject = (searchParams.get("subject") ?? "").trim();

  const weekNumberRaw = (searchParams.get("weekNumber") ?? "").trim();
  const weekNumber = weekNumberRaw ? Number.parseInt(weekNumberRaw, 10) : null;
  if (weekNumberRaw && (Number.isNaN(weekNumber!) || weekNumber! < 1 || weekNumber! > 60)) {
    return jsonNoStore({ ok: false, error: "Invalid weekNumber." } satisfies ListResponse, { status: 400 });
  }

  // Pagination (safe caps)
  const take = parseIntBounded(searchParams.get("limit"), 50, 1, 200);
  const skip = parseIntBounded(searchParams.get("offset"), 0, 0, 50_000);

  const where: any = { tenantId: ctx.tenantId };

  if (statusParam && statusParam !== "ALL") where.status = statusParam;
  if (teacherUserId) where.teacherUserId = teacherUserId;
  if (classroomId) where.classroomId = classroomId;
  if (term) where.term = term;
  if (academicYear) where.academicYear = academicYear;
  if (subject) where.subject = subject;
  if (weekNumber != null) where.weekNumber = weekNumber;

  try {
    const raw = await prisma.lessonNote.findMany({
      where,
      take,
      skip,
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
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

    const items: LessonNoteListItem[] = raw.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      teacherUserId: r.teacherUserId ?? null,
      headteacherUserId: r.headteacherUserId ?? null,
      classroomId: r.classroomId ?? null,
      phase: r.phase ?? null,
      level: r.level ?? null,
      subject: r.subject ?? null,
      term: r.term ?? null,
      academicYear: r.academicYear ?? null,
      weekNumber: r.weekNumber ?? null,
      strand: r.strand ?? null,
      substrand: r.substrand ?? null,
      status: (r.status as LessonNoteStatus) ?? "DRAFT",
      headteacherComment: r.headteacherComment ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return jsonNoStore({ ok: true, items } satisfies ListResponse, { status: 200 });
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTES_LIST_ERROR", err);
    return jsonNoStore(
      {
        ok: false,
        error: "Could not load lesson notes for review. Please try again.",
      } satisfies ListResponse,
      { status: 500 }
    );
  }
}
