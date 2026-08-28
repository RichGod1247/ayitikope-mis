// src/app/api/attendance/sessions/summary/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED" | "HOLIDAY";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid dateISO. Use YYYY-MM-DD.");
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");
  return d;
}

function toState(
  session: { isClosed: boolean; certifiedAt: Date | null; isHoliday: boolean } | null,
): SummaryState {
  if (!session) return "NONE";
  if (session.isHoliday) return "HOLIDAY";
  if (session.certifiedAt) return "CERTIFIED";
  if (session.isClosed) return "CLOSED";
  return "OPEN";
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const tenantIdParam = (url.searchParams.get("tenantId") || "").trim();
  if (tenantIdParam && tenantIdParam !== auth.ctx.tenantId) {
    return json(403, { ok: false, error: "Forbidden (tenant mismatch)." });
  }

  const classroomId = (url.searchParams.get("classroomId") || "").trim();
  const dateISO = (url.searchParams.get("dateISO") || url.searchParams.get("date") || "").trim();
  if (!classroomId || !dateISO) return json(400, { ok: false, error: "classroomId and dateISO are required." });

  let date: Date;
  try {
    date = parseDateISO(dateISO);
  } catch (e: any) {
    return json(400, { ok: false, error: String(e?.message || "Invalid dateISO.") });
  }

  await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId });

  const session = await prisma.attendanceSession.findFirst({
    where: { tenantId: auth.ctx.tenantId, classroomId, date },
    select: { id: true, isClosed: true, certifiedAt: true, isHoliday: true, holidayReason: true },
  });

  const studentCount = await prisma.student.count({ where: { tenantId: auth.ctx.tenantId, classroomId } });

  let absent = 0, late = 0, excused = 0;

  if (session && !session.isHoliday) {
    const grouped = await prisma.attendanceMark.groupBy({
      by: ["status"],
      where: { sessionId: session.id },
      _count: { _all: true },
    });

    for (const g of grouped as any[]) {
      const st = g.status as AttendanceStatus;
      const c = Number(g._count?._all ?? 0);
      if (st === AttendanceStatus.ABSENT) absent = c;
      if (st === AttendanceStatus.LATE) late = c;
      if (st === AttendanceStatus.EXCUSED) excused = c;
    }
  }

  const present = session?.isHoliday
    ? 0
    : Math.max(0, studentCount - absent - late - excused);

  return json(200, {
    ok: true,
    summary: {
      state: toState(
        session
          ? {
              isClosed: session.isClosed,
              certifiedAt: session.certifiedAt,
              isHoliday: session.isHoliday,
            }
          : null,
      ),
      sessionId: session?.id ?? null,
      dateISO,
      classroomId,
      isHoliday: session?.isHoliday ?? false,
      holidayReason: session?.holidayReason ?? null,
      totals: {
        students: studentCount,
        present,
        absent: session?.isHoliday ? 0 : absent,
        late: session?.isHoliday ? 0 : late,
        excused: session?.isHoliday ? 0 : excused,
      },
    },
  });
}
