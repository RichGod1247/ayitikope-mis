// src/app/api/headteacher/day/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionState = "NO_SESSION" | "OPEN" | "CLOSED" | "CERTIFIED";

const querySchema = z.object({
  date: z.string().optional(),
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

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function parseDate(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
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

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function emptyCounts(): Record<AttendanceStatus, number> {
  return {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  };
}

function stateOf(session: { isClosed: boolean; certifiedAt: Date | null } | null): SessionState {
  if (!session) return "NO_SESSION";
  if (session.certifiedAt) return "CERTIFIED";
  if (session.isClosed) return "CLOSED";
  return "OPEN";
}

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore(
      {
        ok: false,
        error: "INVALID_QUERY",
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const date = toISODateOnly(parsed.data.date ?? null) ?? new Date().toISOString().slice(0, 10);
  const dateObj = parseDate(date);

  try {
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId: safe.tenantId },
      orderBy: [{ grade: "asc" }, { arm: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    });

    const classroomIds = classrooms.map((classroom) => classroom.id);

    const [studentCounts, sessions] = await Promise.all([
      classroomIds.length
        ? prisma.student.groupBy({
            by: ["classroomId"],
            where: {
              tenantId: safe.tenantId,
              classroomId: { in: classroomIds },
              status: StudentStatus.ACTIVE,
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      classroomIds.length
        ? prisma.attendanceSession.findMany({
            where: {
              tenantId: safe.tenantId,
              classroomId: { in: classroomIds },
              date: dateObj,
            },
            select: {
              id: true,
              classroomId: true,
              isClosed: true,
              closedAt: true,
              certifiedAt: true,
              certifiedByUserId: true,
              notifiedAt: true,
              notifiedByUserId: true,
              takenByUserId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const studentCountByClass = new Map(studentCounts.map((row) => [row.classroomId, row._count._all]));
    const sessionByClass = new Map(sessions.map((session) => [session.classroomId, session]));
    const sessionIds = sessions.map((session) => session.id);

    const groupedMarks = sessionIds.length
      ? await prisma.attendanceMark.groupBy({
          by: ["sessionId", "status"],
          where: {
            sessionId: { in: sessionIds },
            student: {
              tenantId: safe.tenantId,
              status: StudentStatus.ACTIVE,
            },
          },
          _count: { _all: true },
        })
      : [];

    const countsBySession = new Map<string, Record<AttendanceStatus, number>>();

    for (const group of groupedMarks) {
      const current = countsBySession.get(group.sessionId) ?? emptyCounts();
      current[group.status] = group._count._all;
      countsBySession.set(group.sessionId, current);
    }

    const rawItems = classrooms.map((classroom) => {
      const session = sessionByClass.get(classroom.id) ?? null;
      const counts = session ? countsBySession.get(session.id) ?? emptyCounts() : emptyCounts();

      const total = studentCountByClass.get(classroom.id) ?? 0;
      const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
      const unmarked = Math.max(0, total - marked);
      const status = stateOf(session);

      return {
        classroomId: classroom.id,
        label: classLabel(classroom),
        classLabel: classLabel(classroom),
        sessionId: session?.id ?? null,
        status,
        state: status,
        total,
        marked,
        unmarked,
        present: counts.PRESENT,
        absent: counts.ABSENT,
        late: counts.LATE,
        excused: counts.EXCUSED,
        completionPct: pct(marked, total),
        presentPct: pct(counts.PRESENT, total),
        closedAt: session?.closedAt ? session.closedAt.toISOString() : null,
        certifiedAt: session?.certifiedAt ? session.certifiedAt.toISOString() : null,
        certifiedByUserId: session?.certifiedByUserId ?? null,
        notifiedAt: session?.notifiedAt ? session.notifiedAt.toISOString() : null,
        notifiedByUserId: session?.notifiedByUserId ?? null,
        takenByUserId: session?.takenByUserId ?? null,
        needsAction:
          status === "NO_SESSION" ||
          status === "OPEN" ||
          unmarked > 0 ||
          (status === "CLOSED" && !session?.certifiedAt),
      };
    });

    // Bank-grade visibility rule:
    // Headteacher command view should show operational classes only:
    // - classes with active learners
    // - OR classes that already have an attendance session for the selected date.
    // Empty legacy classroom shells are counted but hidden from the operational list.
    const items = rawItems.filter((item) => item.total > 0 || !!item.sessionId);
    const hiddenEmptyClassrooms = rawItems.length - items.length;

    const summary = items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;

        acc.learners += item.total;
        acc.marked += item.marked;
        acc.unmarked += item.unmarked;
        acc.present += item.present;
        acc.absent += item.absent;
        acc.late += item.late;
        acc.excused += item.excused;

        if (item.needsAction) acc.needsAction += 1;
        if (item.notifiedAt) acc.notified += 1;

        return acc;
      },
      {
        total: 0,
        NO_SESSION: 0,
        OPEN: 0,
        CLOSED: 0,
        CERTIFIED: 0,
        learners: 0,
        marked: 0,
        unmarked: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        needsAction: 0,
        notified: 0,
      }
    );

    return jsonNoStore(
      {
        ok: true,
        tenantId: safe.tenantId,
        date,
        items,
        summary: {
  ...summary,
  rawClassroomCount: rawItems.length,
  hiddenEmptyClassrooms,
  operationalClassrooms: items.length,
  completionPct: pct(summary.marked, summary.learners),
  presentPct: pct(summary.present, summary.learners),
},
      },
      200
    );
  } catch (err: unknown) {
    console.error("[HEADTEACHER_DAY_OVERVIEW_ERROR]", err);
    return jsonNoStore(
      {
        ok: false,
        error: err instanceof Error ? err.message : "FAILED_TO_LOAD_DAY_OVERVIEW",
      },
      500
    );
  }
}