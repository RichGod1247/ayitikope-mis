// src/app/api/headteacher/lesson-notes/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type StatusFilter = LessonNoteStatus | "ALL";

type LessonNoteListItem = {
  id: string;
  teacherUserId: string | null;
  teacherName: string | null;

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

  createdAt: string;
  updatedAt: string;
};

type ListResponse =
  | { ok: true; items: LessonNoteListItem[]; nextCursor: string | null; pageSize: number }
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function userDisplayName(u: { name: string | null; firstName: string | null; lastName: string | null; email: string | null } | null) {
  if (!u) return null;
  const n = clean(u.name);
  if (n) return n;
  const fn = clean(u.firstName);
  const ln = clean(u.lastName);
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const em = clean(u.email);
  return em || null;
}

const VALID_STATUSES = new Set<LessonNoteStatus>(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

function parseStatus(v: string | null): StatusFilter | null {
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

function encodeCursor(updatedAtIso: string, id: string) {
  const raw = `${updatedAtIso}|${id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 2) return null;
    const d = new Date(parts[0]);
    const id = parts[1];
    if (!id || !isLikelyId(id)) return null;
    if (Number.isNaN(d.getTime())) return null;
    return { updatedAt: d, id };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse<ListResponse>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies ListResponse, { status: 401 });

  // ACTIVE membership gate
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." } satisfies ListResponse, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const statusParam = parseStatus(searchParams.get("status"));
  if (searchParams.get("status") && statusParam === null) {
    return jsonNoStore(
      { ok: false, error: "Invalid status. Use DRAFT|SUBMITTED|APPROVED|REJECTED|ALL." } satisfies ListResponse,
      { status: 400 }
    );
  }

  // Teacher filter: allow name/email search OR direct id
  const teacher = clean(searchParams.get("teacher"));
  const teacherUserId = clean(searchParams.get("teacherUserId"));
  const teacherFilter = teacher || teacherUserId;

  if (teacherFilter && teacherFilter.length > 80) {
    return jsonNoStore({ ok: false, error: "Teacher filter too long." } satisfies ListResponse, { status: 400 });
  }

  const classroomId = clean(searchParams.get("classroomId"));
  if (classroomId && !isLikelyId(classroomId)) {
    return jsonNoStore({ ok: false, error: "Invalid classroomId." } satisfies ListResponse, { status: 400 });
  }

  const term = clean(searchParams.get("term"));
  const academicYear = clean(searchParams.get("academicYear"));
  const subject = clean(searchParams.get("subject"));

  const weekNumberRaw = clean(searchParams.get("weekNumber"));
  const weekNumber = weekNumberRaw ? Number.parseInt(weekNumberRaw, 10) : null;
  if (weekNumberRaw && (Number.isNaN(weekNumber!) || weekNumber! < 1 || weekNumber! > 60)) {
    return jsonNoStore({ ok: false, error: "Invalid weekNumber." } satisfies ListResponse, { status: 400 });
  }

  const cursorRaw = clean(searchParams.get("cursor"));
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    return jsonNoStore({ ok: false, error: "Invalid cursor." } satisfies ListResponse, { status: 400 });
  }

  const offset = parseIntBounded(searchParams.get("offset"), 0, 0, 50_000);
  const take = parseIntBounded(searchParams.get("limit"), 20, 1, 100);

  const where: any = { tenantId: ctx.tenantId };

  if (statusParam && statusParam !== "ALL") where.status = statusParam;
  if (classroomId) where.classroomId = classroomId;
  if (term) where.term = term;
  if (academicYear) where.academicYear = academicYear;
  if (subject) where.subject = subject;
  if (weekNumber != null) where.weekNumber = weekNumber;

  if (teacherFilter) {
    if (isLikelyId(teacherFilter)) {
      where.teacherUserId = teacherFilter;
    } else {
      if (teacherFilter.length < 2) {
        return jsonNoStore({ ok: false, error: "Teacher name filter must be at least 2 characters." } satisfies ListResponse, {
          status: 400,
        });
      }
      where.teacher = {
        OR: [
          { name: { contains: teacherFilter, mode: "insensitive" } },
          { firstName: { contains: teacherFilter, mode: "insensitive" } },
          { lastName: { contains: teacherFilter, mode: "insensitive" } },
          { email: { contains: teacherFilter, mode: "insensitive" } },
        ],
      };
    }
  }

  if (cursor) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { updatedAt: { lt: cursor.updatedAt } },
          { AND: [{ updatedAt: cursor.updatedAt }, { id: { lt: cursor.id } }] },
        ],
      },
    ];
  }

  try {
    const raw = await prisma.lessonNote.findMany({
      where,
      take: take + 1,
      skip: cursor ? 0 : offset,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        teacherUserId: true,
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
        teacher: {
          select: { name: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const hasMore = raw.length > take;
    const page = hasMore ? raw.slice(0, take) : raw;

    const items: LessonNoteListItem[] = page.map((r) => ({
      id: r.id,
      teacherUserId: r.teacherUserId ?? null,
      teacherName: userDisplayName(r.teacher) ?? null,

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

      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.updatedAt, last.id) : null;

    return jsonNoStore({ ok: true, items, nextCursor, pageSize: take } satisfies ListResponse, { status: 200 });
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTES_LIST_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Could not load lesson notes for review. Please try again." } satisfies ListResponse,
      { status: 500 }
    );
  }
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." } satisfies ListResponse, { status: 405 });
}