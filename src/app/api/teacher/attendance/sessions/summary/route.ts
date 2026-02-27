// src/app/api/teacher/attendance/sessions/summary/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
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

function noStoreJson(status: number, body: any) {
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

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe: { userId: string; tenantId: string } = {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    };

    const url = new URL(req.url);

    // Backward-compat only: if tenantId is supplied, it MUST match session tenant.
    const suppliedTenantId = (url.searchParams.get("tenantId") || "").trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const classroomId = (url.searchParams.get("classroomId") || "").trim();
    const dateISO = (url.searchParams.get("dateISO") || url.searchParams.get("date") || "").trim();
    if (!classroomId || !dateISO) {
      return noStoreJson(400, { ok: false, error: "classroomId and dateISO/date are required." });
    }

    let date: Date;
    try {
      date = parseDateISO(dateISO);
    } catch (e: any) {
      return noStoreJson(400, { ok: false, error: String(e?.message || "Invalid dateISO.") });
    }

    // Classroom access gate (teacher assignments, etc.)
    await assertCanAccessClassroom({ ...safe, classroomId });

    const [studentCount, session] = await Promise.all([
      prisma.student.count({ where: { tenantId: safe.tenantId, classroomId } }),
      prisma.attendanceSession.findFirst({
        where: { tenantId: safe.tenantId, classroomId, date },
        select: { id: true, isClosed: true, certifiedAt: true },
      }),
    ]);

    let absent = 0;
    let late = 0;
    let excused = 0;

    if (session) {
      const [abs, lt, exc] = await Promise.all([
        prisma.attendanceMark.count({
          where: { sessionId: session.id, status: AttendanceStatus.ABSENT },
        }),
        prisma.attendanceMark.count({
          where: { sessionId: session.id, status: AttendanceStatus.LATE },
        }),
        prisma.attendanceMark.count({
          where: { sessionId: session.id, status: AttendanceStatus.EXCUSED },
        }),
      ]);
      absent = abs;
      late = lt;
      excused = exc;
    }

    const present = Math.max(0, studentCount - absent - late - excused);

    return noStoreJson(200, {
      ok: true,
      summary: {
        state: toState(session ? { isClosed: session.isClosed, certifiedAt: session.certifiedAt } : null),
        sessionId: session?.id ?? null,
        date: dateISO,
        dateISO,
        classroomId,
        totals: { students: studentCount, present, absent, late, excused },
      },
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}
