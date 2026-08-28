import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildAttendanceAcademicCalendar,
  resolveAttendanceDate,
  toISODateOnly,
  type AttendanceAcademicCalendar,
  type AttendanceDateResolution,
} from "@/lib/attendanceAcademicCalendar";

type CalendarReader = Pick<Prisma.TransactionClient, "tenantSettings">;

const calendarSelect = {
  currentAcademicYear: true,
  currentTerm: true,
  term1Start: true,
  term1End: true,
  term2Start: true,
  term2End: true,
  term3Start: true,
  term3End: true,
} as const;

export async function loadAttendanceAcademicCalendar(
  tenantId: string,
  db: CalendarReader = prisma,
): Promise<AttendanceAcademicCalendar> {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
    select: calendarSelect,
  });

  return buildAttendanceAcademicCalendar(settings ?? {});
}

export async function resolveAttendanceCalendarDate(args: {
  tenantId: string;
  date: Date;
  db?: CalendarReader;
}): Promise<{
  calendar: AttendanceAcademicCalendar;
  date: AttendanceDateResolution;
}> {
  const calendar = await loadAttendanceAcademicCalendar(args.tenantId, args.db ?? prisma);
  const dateISO = toISODateOnly(args.date);
  const resolution = resolveAttendanceDate(calendar, dateISO ?? "");

  return { calendar, date: resolution };
}

export async function assertAttendanceDateInCurrentTerm(args: {
  tenantId: string;
  date: Date;
  db?: CalendarReader;
}) {
  const resolved = await resolveAttendanceCalendarDate(args);

  if (!resolved.date.allowed) {
    const error = new Error(resolved.date.message);
    (error as { status?: number }).status = 409;
    (error as { code?: string }).code = resolved.date.code;
    throw error;
  }

  return resolved;
}
