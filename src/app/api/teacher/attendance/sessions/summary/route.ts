// src/app/api/teacher/attendance/sessions/summary/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

function noStoreJson(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error("Invalid dateISO. Use YYYY-MM-DD.");
  }

  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");

  return d;
}

function toState(session: { isClosed: boolean; certifiedAt: Date | null } | null): SummaryState {
  if (!session) return "NONE";
  if (session.certifiedAt) return "CERTIFIED";
  if (session.isClosed) return "CLOSED";
  return "OPEN";
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const url = new URL(req.url);

    const suppliedTenantId = (url.searchParams.get("tenantId") || "").trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const classroomId = (url.searchParams.get("classroomId") || "").trim();
    const dateISO = (url.searchParams.get("dateISO") || url.searchParams.get("date") || "").trim();

    if (!classroomId || !dateISO) {
      return noStoreJson(400, {
        ok: false,
        error: "classroomId and dateISO/date are required.",
      });
    }

    let date: Date;
    try {
      date = parseDateISO(dateISO);
    } catch (e) {
      return noStoreJson(400, {
        ok: false,
        error: e instanceof Error ? e.message : "Invalid dateISO.",
      });
    }

    await assertCanAccessClassroom({
      ...safe,
      classroomId,
    });

    const [studentCount, session] = await Promise.all([
      prisma.student.count({
        where: {
          tenantId: safe.tenantId,
          classroomId,
          status: StudentStatus.ACTIVE,
        },
      }),
      prisma.attendanceSession.findFirst({
        where: {
          tenantId: safe.tenantId,
          classroomId,
          date,
        },
        select: {
          id: true,
          isClosed: true,
          certifiedAt: true,
          takenByUserId: true,
          closedAt: true,
          certifiedByUserId: true,
        },
      }),
    ]);

    const counts: Record<AttendanceStatus, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
    };

    if (session) {
      const grouped = await prisma.attendanceMark.groupBy({
        by: ["status"],
        where: {
          sessionId: session.id,
          student: {
            tenantId: safe.tenantId,
            classroomId,
            status: StudentStatus.ACTIVE,
          },
        },
        _count: { _all: true },
      });

      for (const group of grouped) {
        counts[group.status] = group._count._all;
      }
    }

    const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
    const unmarked = Math.max(0, studentCount - marked);

    return noStoreJson(200, {
      ok: true,
      summary: {
        state: toState(session ? { isClosed: session.isClosed, certifiedAt: session.certifiedAt } : null),
        sessionId: session?.id ?? null,
        date: dateISO,
        dateISO,
        classroomId,
        takenByUserId: session?.takenByUserId ?? null,
        closedAt: session?.closedAt ? session.closedAt.toISOString() : null,
        certifiedAt: session?.certifiedAt ? session.certifiedAt.toISOString() : null,
        certifiedByUserId: session?.certifiedByUserId ?? null,
        totals: {
          students: studentCount,
          total: studentCount,
          marked,
          unmarked,
          present: counts.PRESENT,
          absent: counts.ABSENT,
          late: counts.LATE,
          excused: counts.EXCUSED,
          completionPct: pct(marked, studentCount),
          presentPct: pct(counts.PRESENT, studentCount),
        },
      },
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}