import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseISODateOnly,
  resolveAttendanceDate,
  toISODateOnly,
  type AttendanceAcademicCalendar,
} from "@/lib/attendanceAcademicCalendar";

export type PhysicalRegisterGender = "BOYS" | "GIRLS" | "UNCLASSIFIED";

export type PhysicalRegisterPeriod = {
  label: string;
  startDateISO: string;
  endDateISO: string;
  timesOpened: number;
  boys: { present: number; absent: number };
  girls: { present: number; absent: number };
  unclassified: { present: number; absent: number };
  totalPresent: number;
  totalAbsent: number;
  legacyOtherOccurrences: number;
};

export type PhysicalRegisterLearner = {
  studentId: string;
  name: string;
  gender: PhysicalRegisterGender;
  week: { present: number; timesOpened: number };
  term: { present: number; timesOpened: number };
};

export type PhysicalRegisterAccounting = {
  available: boolean;
  reason: string | null;
  asOfDateISO: string;
  academicYear: string | null;
  term: string | null;
  weekNumber: number | null;
  today: PhysicalRegisterPeriod;
  week: PhysicalRegisterPeriod;
  termToDate: PhysicalRegisterPeriod;
  learners: PhysicalRegisterLearner[];
};

type PeriodAccumulator = {
  timesOpened: number;
  boysPresent: number;
  boysAbsent: number;
  girlsPresent: number;
  girlsAbsent: number;
  unclassifiedPresent: number;
  unclassifiedAbsent: number;
  legacyOtherOccurrences: number;
};

const ZERO_ACCUMULATOR: PeriodAccumulator = {
  timesOpened: 0,
  boysPresent: 0,
  boysAbsent: 0,
  girlsPresent: 0,
  girlsAbsent: 0,
  unclassifiedPresent: 0,
  unclassifiedAbsent: 0,
  legacyOtherOccurrences: 0,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function learnerName(student: {
  firstName: string | null;
  lastName: string | null;
}) {
  return [clean(student.firstName), clean(student.lastName)]
    .filter(Boolean)
    .join(" ") || "Unnamed learner";
}

export function resolvePhysicalRegisterGender(args: {
  sex?: string | null;
  gender?: string | null;
}): PhysicalRegisterGender {
  const raw = clean(args.sex ?? args.gender).toUpperCase();
  if (raw === "MALE") return "BOYS";
  if (raw === "FEMALE") return "GIRLS";
  return "UNCLASSIFIED";
}

function addMark(
  accumulator: PeriodAccumulator,
  gender: PhysicalRegisterGender,
  status: AttendanceStatus,
) {
  if (status === AttendanceStatus.PRESENT) {
    if (gender === "BOYS") accumulator.boysPresent += 1;
    else if (gender === "GIRLS") accumulator.girlsPresent += 1;
    else accumulator.unclassifiedPresent += 1;
    return;
  }

  if (status === AttendanceStatus.ABSENT) {
    if (gender === "BOYS") accumulator.boysAbsent += 1;
    else if (gender === "GIRLS") accumulator.girlsAbsent += 1;
    else accumulator.unclassifiedAbsent += 1;
    return;
  }

  // Historical compatibility only. LATE / EXCUSED are intentionally
  // preserved but are not reclassified as Present or Absent.
  accumulator.legacyOtherOccurrences += 1;
}

function toPeriod(args: {
  label: string;
  startDateISO: string;
  endDateISO: string;
  accumulator: PeriodAccumulator;
}): PhysicalRegisterPeriod {
  const { accumulator } = args;

  return {
    label: args.label,
    startDateISO: args.startDateISO,
    endDateISO: args.endDateISO,
    timesOpened: accumulator.timesOpened,
    boys: {
      present: accumulator.boysPresent,
      absent: accumulator.boysAbsent,
    },
    girls: {
      present: accumulator.girlsPresent,
      absent: accumulator.girlsAbsent,
    },
    unclassified: {
      present: accumulator.unclassifiedPresent,
      absent: accumulator.unclassifiedAbsent,
    },
    totalPresent:
      accumulator.boysPresent +
      accumulator.girlsPresent +
      accumulator.unclassifiedPresent,
    totalAbsent:
      accumulator.boysAbsent +
      accumulator.girlsAbsent +
      accumulator.unclassifiedAbsent,
    legacyOtherOccurrences: accumulator.legacyOtherOccurrences,
  };
}

function emptyAccounting(args: {
  asOfDateISO: string;
  calendar: AttendanceAcademicCalendar;
  reason: string;
}): PhysicalRegisterAccounting {
  const date = args.asOfDateISO;
  const empty = { ...ZERO_ACCUMULATOR };

  return {
    available: false,
    reason: args.reason,
    asOfDateISO: date,
    academicYear: args.calendar.academicYear,
    term: args.calendar.term,
    weekNumber: null,
    today: toPeriod({
      label: "Today",
      startDateISO: date,
      endDateISO: date,
      accumulator: { ...empty },
    }),
    week: toPeriod({
      label: "This week",
      startDateISO: date,
      endDateISO: date,
      accumulator: { ...empty },
    }),
    termToDate: toPeriod({
      label: "Term to date",
      startDateISO: date,
      endDateISO: date,
      accumulator: { ...empty },
    }),
    learners: [],
  };
}

function isWithin(dateISO: string, startISO: string, endISO: string) {
  return dateISO >= startISO && dateISO <= endISO;
}

export async function getPhysicalRegisterAccounting(args: {
  tenantId: string;
  classroomId: string;
  asOfDate: Date;
  calendar: AttendanceAcademicCalendar;
}): Promise<PhysicalRegisterAccounting> {
  const asOfDateISO = toISODateOnly(args.asOfDate) ?? "";
  const resolution = resolveAttendanceDate(args.calendar, asOfDateISO);

  if (
    !asOfDateISO ||
    !args.calendar.configured ||
    !args.calendar.startDateISO ||
    !args.calendar.endDateISO ||
    !resolution.weekStartDateISO ||
    !resolution.weekEndDateISO ||
    (resolution.code !== "OK" && resolution.code !== "WEEKEND")
  ) {
    return emptyAccounting({
      asOfDateISO,
      calendar: args.calendar,
      reason:
        resolution.message ||
        args.calendar.reason ||
        "Physical register totals are unavailable for this historical date.",
    });
  }

  const termStartISO = args.calendar.startDateISO;
  const termEndISO = asOfDateISO <= args.calendar.endDateISO
    ? asOfDateISO
    : args.calendar.endDateISO;
  const weekStartISO = resolution.weekStartDateISO;
  const weekEndISO = resolution.weekEndDateISO;

  const queryStart = parseISODateOnly(termStartISO);
  const queryEnd = parseISODateOnly(
    weekEndISO > termEndISO ? weekEndISO : termEndISO,
  );

  if (!queryStart || !queryEnd) {
    return emptyAccounting({
      asOfDateISO,
      calendar: args.calendar,
      reason: "Physical register totals are unavailable because the academic calendar dates are invalid.",
    });
  }

  const [students, officialSessions] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: args.tenantId,
        classroomId: args.classroomId,
        status: StudentStatus.ACTIVE,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        gender: true,
      },
    }),
    prisma.attendanceSession.findMany({
      where: {
        tenantId: args.tenantId,
        classroomId: args.classroomId,
        certifiedAt: { not: null },
        isHoliday: false,
        date: { gte: queryStart, lte: queryEnd },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        date: true,
        marks: {
          where: {
            student: {
              tenantId: args.tenantId,
            },
          },
          select: {
            studentId: true,
            status: true,
            student: {
              select: {
                sex: true,
                gender: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const todayAcc = { ...ZERO_ACCUMULATOR };
  const weekAcc = { ...ZERO_ACCUMULATOR };
  const termAcc = { ...ZERO_ACCUMULATOR };

  const weekPresentByStudent = new Map<string, number>();
  const termPresentByStudent = new Map<string, number>();

  for (const session of officialSessions) {
    const sessionDateISO = toISODateOnly(session.date);
    if (!sessionDateISO) continue;

    const inToday = sessionDateISO === asOfDateISO;
    const inWeek = isWithin(sessionDateISO, weekStartISO, weekEndISO);
    const inTerm = isWithin(sessionDateISO, termStartISO, termEndISO);

    if (inToday) todayAcc.timesOpened += 1;
    if (inWeek) weekAcc.timesOpened += 1;
    if (inTerm) termAcc.timesOpened += 1;

    for (const mark of session.marks) {
      const gender = resolvePhysicalRegisterGender(mark.student);

      if (inToday) addMark(todayAcc, gender, mark.status);
      if (inWeek) addMark(weekAcc, gender, mark.status);
      if (inTerm) addMark(termAcc, gender, mark.status);

      if (mark.status === AttendanceStatus.PRESENT) {
        if (inWeek) {
          weekPresentByStudent.set(
            mark.studentId,
            (weekPresentByStudent.get(mark.studentId) ?? 0) + 1,
          );
        }

        if (inTerm) {
          termPresentByStudent.set(
            mark.studentId,
            (termPresentByStudent.get(mark.studentId) ?? 0) + 1,
          );
        }
      }
    }
  }

  const learners: PhysicalRegisterLearner[] = students.map((student) => ({
    studentId: student.id,
    name: learnerName(student),
    gender: resolvePhysicalRegisterGender(student),
    week: {
      present: weekPresentByStudent.get(student.id) ?? 0,
      timesOpened: weekAcc.timesOpened,
    },
    term: {
      present: termPresentByStudent.get(student.id) ?? 0,
      timesOpened: termAcc.timesOpened,
    },
  }));

  return {
    available: true,
    reason: null,
    asOfDateISO,
    academicYear: args.calendar.academicYear,
    term: args.calendar.term,
    weekNumber: resolution.weekNumber,
    today: toPeriod({
      label: "Today",
      startDateISO: asOfDateISO,
      endDateISO: asOfDateISO,
      accumulator: todayAcc,
    }),
    week: toPeriod({
      label: resolution.weekNumber
        ? `This week · Week ${resolution.weekNumber}`
        : "This week",
      startDateISO: weekStartISO,
      endDateISO: weekEndISO,
      accumulator: weekAcc,
    }),
    termToDate: toPeriod({
      label: args.calendar.term
        ? `${args.calendar.term} to date`
        : "Term to date",
      startDateISO: termStartISO,
      endDateISO: termEndISO,
      accumulator: termAcc,
    }),
    learners,
  };
}
