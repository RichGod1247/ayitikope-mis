// src/app/api/headteacher/day/bulk-certify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionState = "OPEN" | "CLOSED" | "CERTIFIED";

type CertifyCandidate = {
  sessionId: string;
  classroomId: string;
  classLabel: string;
  state: SessionState;
  total: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  eligible: boolean;
  skipReason: null | "NOT_CLOSED" | "ALREADY_CERTIFIED" | "EMPTY_CLASS" | "INCOMPLETE_MARKS";
};

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  note: z.string().trim().max(300).optional(),
});

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function parseYMD(dateISO: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end };
}

function normRole(name: unknown) {
  return clean(name)
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName.includes("OWNER")) return true;
  if (roleName.includes("SUPER")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string, fallbackRoleName?: string | null) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  const roleName = normRole(membership?.role?.name ?? fallbackRoleName ?? "");

  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const, roleName } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

function classLabel(c: { name?: string | null; grade?: string | null; arm?: string | null }) {
  const name = clean(c.name);
  const gradeArm = [clean(c.grade), clean(c.arm)].filter(Boolean).join(" ");
  return name || gradeArm || "Class";
}

function emptyCounts(): Record<AttendanceStatus, number> {
  return {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  };
}

function stateOf(session: { isClosed: boolean; certifiedAt: Date | null }): SessionState {
  if (session.certifiedAt) return "CERTIFIED";
  if (session.isClosed) return "CLOSED";
  return "OPEN";
}

function skipReasonFor(params: {
  state: SessionState;
  total: number;
  unmarked: number;
}): CertifyCandidate["skipReason"] {
  if (params.state === "CERTIFIED") return "ALREADY_CERTIFIED";
  if (params.state !== "CLOSED") return "NOT_CLOSED";
  if (params.total <= 0) return "EMPTY_CLASS";
  if (params.unmarked > 0) return "INCOMPLETE_MARKS";
  return null;
}

export async function POST(req: NextRequest) {
  let safe: { userId: string; tenantId: string; roleName?: string | null };

  try {
    const ctx = await requireServerUserContext({ requireTenant: true });
    safe = {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      roleName: ctx.roleName ?? null,
    };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!safe.userId || !safe.tenantId) {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireHeadOrAdmin(safe.tenantId, safe.userId, safe.roleName ?? null);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, 415);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonNoStore(
      {
        ok: false,
        error: "INVALID_BODY",
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const date = parsed.data.date;
  const range = parseYMD(date);

  if (!range) {
    return jsonNoStore({ ok: false, error: "date must be YYYY-MM-DD" }, 400);
  }

  const note =
    clean(parsed.data.note) ||
    `Bulk certified by headteacher/admin after attendance completion review for ${date}.`;

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId: safe.tenantId,
        date: { gte: range.start, lt: range.end },
        isHoliday: false,
      },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        classroomId: true,
        isClosed: true,
        closedAt: true,
        certifiedAt: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
    });

    if (!sessions.length) {
      return jsonNoStore(
        {
          ok: true,
          tenantId: safe.tenantId,
          date,
          updatedCount: 0,
          eligibleCount: 0,
          skippedCount: 0,
          candidates: [],
          summary: {
            sessionsFound: 0,
            eligible: 0,
            certified: 0,
            skippedNotClosed: 0,
            skippedAlreadyCertified: 0,
            skippedEmptyClass: 0,
            skippedIncompleteMarks: 0,
          },
        },
        200
      );
    }

    const classroomIds = Array.from(new Set(sessions.map((session) => session.classroomId)));
    const sessionIds = sessions.map((session) => session.id);

    const [studentCounts, groupedMarks] = await Promise.all([
      prisma.student.groupBy({
        by: ["classroomId"],
        where: {
          tenantId: safe.tenantId,
          classroomId: { in: classroomIds },
          status: StudentStatus.ACTIVE,
        },
        _count: { _all: true },
      }),

      prisma.attendanceMark.groupBy({
        by: ["sessionId", "status"],
        where: {
          sessionId: { in: sessionIds },
          student: {
            tenantId: safe.tenantId,
            status: StudentStatus.ACTIVE,
          },
        },
        _count: { _all: true },
      }),
    ]);

    const studentCountByClassroom = new Map(studentCounts.map((row) => [row.classroomId, row._count._all]));
    const countsBySession = new Map<string, Record<AttendanceStatus, number>>();

    for (const markGroup of groupedMarks) {
      const current = countsBySession.get(markGroup.sessionId) ?? emptyCounts();
      current[markGroup.status] = markGroup._count._all;
      countsBySession.set(markGroup.sessionId, current);
    }

    const candidates: CertifyCandidate[] = sessions.map((session) => {
      const counts = countsBySession.get(session.id) ?? emptyCounts();

      const total = studentCountByClassroom.get(session.classroomId) ?? 0;
      const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
      const unmarked = Math.max(0, total - marked);
      const state = stateOf(session);
      const skipReason = skipReasonFor({ state, total, unmarked });

      return {
        sessionId: session.id,
        classroomId: session.classroomId,
        classLabel: classLabel(session.classroom),
        state,
        total,
        marked,
        unmarked,
        present: counts.PRESENT,
        absent: counts.ABSENT,
        late: counts.LATE,
        excused: counts.EXCUSED,
        eligible: skipReason === null,
        skipReason,
      };
    });

    const eligibleIds = candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.sessionId);

    const now = new Date();

    const updateResult = eligibleIds.length
      ? await prisma.attendanceSession.updateMany({
          where: {
            tenantId: safe.tenantId,
            id: { in: eligibleIds },
            isClosed: true,
            certifiedAt: null,
            isHoliday: false,
          },
          data: {
            certifiedAt: now,
            certifiedByUserId: safe.userId,
            certifiedNote: note,
          },
        })
      : { count: 0 };

    const summary = candidates.reduce(
      (acc, candidate) => {
        acc.sessionsFound += 1;

        if (candidate.eligible) acc.eligible += 1;
        if (candidate.skipReason === "NOT_CLOSED") acc.skippedNotClosed += 1;
        if (candidate.skipReason === "ALREADY_CERTIFIED") acc.skippedAlreadyCertified += 1;
        if (candidate.skipReason === "EMPTY_CLASS") acc.skippedEmptyClass += 1;
        if (candidate.skipReason === "INCOMPLETE_MARKS") acc.skippedIncompleteMarks += 1;

        return acc;
      },
      {
        sessionsFound: 0,
        eligible: 0,
        certified: updateResult.count,
        skippedNotClosed: 0,
        skippedAlreadyCertified: 0,
        skippedEmptyClass: 0,
        skippedIncompleteMarks: 0,
      }
    );

    try {
      await prisma.auditLog.create({
        data: {
          tenantId: safe.tenantId,
          userId: safe.userId,
          action: "HEADTEACHER_ATTENDANCE_BULK_CERTIFY",
          resource: "AttendanceSession",
          resourceId: date,
          metadata: {
            date,
            note,
            summary,
            eligibleIds,
            candidates: candidates.map((candidate) => ({
              sessionId: candidate.sessionId,
              classroomId: candidate.classroomId,
              classLabel: candidate.classLabel,
              state: candidate.state,
              total: candidate.total,
              marked: candidate.marked,
              unmarked: candidate.unmarked,
              eligible: candidate.eligible,
              skipReason: candidate.skipReason,
            })),
          } satisfies Prisma.JsonObject,
        },
      });
    } catch {
      // Certification has already happened; audit failure should not reverse it here.
    }

    return jsonNoStore(
      {
        ok: true,
        tenantId: safe.tenantId,
        date,
        updatedCount: updateResult.count,
        eligibleCount: eligibleIds.length,
        skippedCount: candidates.length - eligibleIds.length,
        summary,
        candidates,
      },
      200
    );
  } catch (err: unknown) {
    console.error("[HEADTEACHER_BULK_CERTIFY_ERROR]", err);
    return jsonNoStore(
      {
        ok: false,
        error: err instanceof Error ? err.message : "FAILED_TO_BULK_CERTIFY",
      },
      500
    );
  }
}