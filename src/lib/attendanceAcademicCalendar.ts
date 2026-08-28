export type AttendanceTermNumber = 1 | 2 | 3;

export type AttendanceAcademicCalendar = {
  configured: boolean;
  academicYear: string | null;
  term: string | null;
  termNumber: AttendanceTermNumber | null;
  startDateISO: string | null;
  endDateISO: string | null;
  reason: string | null;
};

export type AttendanceDateResolution = {
  allowed: boolean;
  code: "OK" | "CALENDAR_NOT_CONFIGURED" | "DATE_OUTSIDE_CURRENT_TERM" | "WEEKEND" | "INVALID_DATE";
  message: string;
  weekNumber: number | null;
  weekStartDateISO: string | null;
  weekEndDateISO: string | null;
  expectedSchoolDays: number;
};

type CalendarSource = {
  currentAcademicYear?: string | null;
  currentTerm?: string | null;
  term1Start?: Date | string | null;
  term1End?: Date | string | null;
  term2Start?: Date | string | null;
  term2End?: Date | string | null;
  term3Start?: Date | string | null;
  term3End?: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeAttendanceTermNumber(raw: unknown): AttendanceTermNumber | null {
  const value = clean(raw).toLowerCase().replace(/\s+/g, " ");

  if (["1", "term1", "term 1", "1st term", "first term"].includes(value)) return 1;
  if (["2", "term2", "term 2", "2nd term", "second term"].includes(value)) return 2;
  if (["3", "term3", "term 3", "3rd term", "third term"].includes(value)) return 3;

  return null;
}

export function attendanceTermLabel(termNumber: AttendanceTermNumber): string {
  if (termNumber === 1) return "1st Term";
  if (termNumber === 2) return "2nd Term";
  return "3rd Term";
}

export function toISODateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseISODateOnly(value);
    return parsed ? value : null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseISODateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function termDates(source: CalendarSource, termNumber: AttendanceTermNumber) {
  if (termNumber === 1) return [source.term1Start, source.term1End] as const;
  if (termNumber === 2) return [source.term2Start, source.term2End] as const;
  return [source.term3Start, source.term3End] as const;
}

export function buildAttendanceAcademicCalendar(source: CalendarSource): AttendanceAcademicCalendar {
  const academicYear = clean(source.currentAcademicYear) || null;
  const termNumber = normalizeAttendanceTermNumber(source.currentTerm);
  const term = termNumber ? attendanceTermLabel(termNumber) : null;

  if (!academicYear || !termNumber) {
    return {
      configured: false,
      academicYear,
      term,
      termNumber,
      startDateISO: null,
      endDateISO: null,
      reason: "Academic calendar needs updating. Ask your Headteacher/Admin to set the current academic year, current term, and term dates before taking attendance.",
    };
  }

  const [rawStart, rawEnd] = termDates(source, termNumber);
  const startDateISO = toISODateOnly(rawStart);
  const endDateISO = toISODateOnly(rawEnd);

  if (!startDateISO || !endDateISO || startDateISO > endDateISO) {
    return {
      configured: false,
      academicYear,
      term,
      termNumber,
      startDateISO,
      endDateISO,
      reason: `Academic calendar needs updating. Ask your Headteacher/Admin to set valid ${term} start and end dates before taking attendance.`,
    };
  }

  return {
    configured: true,
    academicYear,
    term,
    termNumber,
    startDateISO,
    endDateISO,
    reason: null,
  };
}

function mondayOf(date: Date) {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(date.getTime() - offset * DAY_MS);
}

function fridayOf(date: Date) {
  return new Date(mondayOf(date).getTime() + 4 * DAY_MS);
}

function nextWeekday(date: Date) {
  const day = date.getUTCDay();
  if (day === 6) return new Date(date.getTime() + 2 * DAY_MS);
  if (day === 0) return new Date(date.getTime() + DAY_MS);
  return date;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function countWeekdaysInclusive(start: Date, end: Date) {
  if (start.getTime() > end.getTime()) return 0;

  let count = 0;
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += DAY_MS) {
    const day = new Date(cursor).getUTCDay();
    if (day >= 1 && day <= 5) count += 1;
  }
  return count;
}

export function resolveAttendanceDate(
  calendar: AttendanceAcademicCalendar,
  dateISO: string,
): AttendanceDateResolution {
  const date = parseISODateOnly(dateISO);

  if (!date) {
    return {
      allowed: false,
      code: "INVALID_DATE",
      message: "Choose a valid attendance date.",
      weekNumber: null,
      weekStartDateISO: null,
      weekEndDateISO: null,
      expectedSchoolDays: 0,
    };
  }

  if (!calendar.configured || !calendar.startDateISO || !calendar.endDateISO) {
    return {
      allowed: false,
      code: "CALENDAR_NOT_CONFIGURED",
      message:
        calendar.reason ||
        "Academic calendar needs updating. Ask your Headteacher/Admin to configure the current term before taking attendance.",
      weekNumber: null,
      weekStartDateISO: null,
      weekEndDateISO: null,
      expectedSchoolDays: 0,
    };
  }

  const termStart = parseISODateOnly(calendar.startDateISO);
  const termEnd = parseISODateOnly(calendar.endDateISO);

  if (!termStart || !termEnd) {
    return {
      allowed: false,
      code: "CALENDAR_NOT_CONFIGURED",
      message: "Academic calendar needs updating. Ask your Headteacher/Admin to correct the current term dates.",
      weekNumber: null,
      weekStartDateISO: null,
      weekEndDateISO: null,
      expectedSchoolDays: 0,
    };
  }

  if (date.getTime() < termStart.getTime() || date.getTime() > termEnd.getTime()) {
    return {
      allowed: false,
      code: "DATE_OUTSIDE_CURRENT_TERM",
      message: `Attendance cannot be marked outside ${calendar.term ?? "the current term"} (${calendar.startDateISO} to ${calendar.endDateISO}). Ask your Headteacher/Admin to update Academic Settings if the calendar is stale.`,
      weekNumber: null,
      weekStartDateISO: null,
      weekEndDateISO: null,
      expectedSchoolDays: 0,
    };
  }

  const firstSchoolDay = nextWeekday(termStart);
  const firstMonday = mondayOf(firstSchoolDay);
  const currentMonday = mondayOf(date);
  const weekNumber = Math.floor((currentMonday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;

  const weekStart = maxDate(termStart, currentMonday);
  const weekEnd = minDate(termEnd, fridayOf(date));
  const expectedSchoolDays = countWeekdaysInclusive(weekStart, weekEnd);

  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return {
      allowed: false,
      code: "WEEKEND",
      message: "Attendance can be marked only on school weekdays (Monday to Friday).",
      weekNumber: Math.max(1, weekNumber),
      weekStartDateISO: toISODateOnly(weekStart),
      weekEndDateISO: toISODateOnly(weekEnd),
      expectedSchoolDays,
    };
  }

  return {
    allowed: true,
    code: "OK",
    message: `Week ${Math.max(1, weekNumber)} of ${calendar.term ?? "the current term"}.`,
    weekNumber: Math.max(1, weekNumber),
    weekStartDateISO: toISODateOnly(weekStart),
    weekEndDateISO: toISODateOnly(weekEnd),
    expectedSchoolDays,
  };
}
