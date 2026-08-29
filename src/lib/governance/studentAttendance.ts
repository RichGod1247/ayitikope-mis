import {
  AttendanceStatus,
  ClassroomStatus,
  StudentStatus,
  TenantStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildAttendanceAcademicCalendar,
  parseISODateOnly,
  resolveAttendanceDate,
  toISODateOnly,
  type AttendanceAcademicCalendar,
} from "@/lib/attendanceAcademicCalendar";
import type { GovernanceScope } from "@/lib/governance/scope";

export type GovernanceStudentAttendanceView = "SCHOOL" | "CIRCUIT";
export type GovernanceAttendanceEvidenceState =
  | "COMPLETE"
  | "PARTIAL"
  | "NONE"
  | "HOLIDAY"
  | "NO_OPERATIONAL_CLASSES";

export type GovernanceAttendanceWeek = {
  weekNumber: number;
  presentPct: number | null;
  present: number;
  marked: number;
  current: boolean;
};

export type GovernanceStudentAttendanceSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  population: number;
  present: number;
  absent: number;
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
  evidenceState: GovernanceAttendanceEvidenceState;
  termLabel: string | null;
  currentWeek: number | null;
  weeks: GovernanceAttendanceWeek[];
};

export type GovernanceStudentAttendanceCircuit = {
  circuitId: string;
  circuitName: string;
  population: number;
  present: number;
  absent: number;
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
  evidenceState: GovernanceAttendanceEvidenceState;
};

export type GovernanceAttendanceFollowUp = {
  id: string;
  name: string;
  circuitName: string | null;
  missingRegisters: number;
  openRegisters: number;
  unmarkedLearners: number;
  uncertifiedRegisters: number;
  absentLearners: number;
  reason: string;
};

export type GovernanceStudentAttendanceResult =
  | {
      view: "SCHOOL";
      date: string;
      schools: GovernanceStudentAttendanceSchool[];
      schoolsNeedingFollowUp: GovernanceAttendanceFollowUp[];
    }
  | {
      view: "CIRCUIT";
      date: string;
      circuits: GovernanceStudentAttendanceCircuit[];
      circuitsNeedingFollowUp: GovernanceAttendanceFollowUp[];
    };

type SchoolBase = {
  id: string;
  name: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
};

type FollowUpCounts = {
  missingRegisters: number;
  openRegisters: number;
  unmarkedLearners: number;
  uncertifiedRegisters: number;
  absentLearners: number;
};

type DailySchoolTruth = FollowUpCounts & {
  population: number;
  present: number;
  absent: number;
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
  evidenceState: GovernanceAttendanceEvidenceState;
};

type SessionRow = {
  id: string;
  tenantId: string;
  classroomId: string;
  isClosed: boolean;
  certifiedAt: Date | null;
  isHoliday: boolean;
};

type MarkGroup = {
  sessionId: string;
  status: AttendanceStatus;
  _count: { _all: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function todayRangeUtcForGhana() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end, dateISO: start.toISOString().slice(0, 10) };
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

function evidenceState(args: {
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
}): GovernanceAttendanceEvidenceState {
  if (args.operationalClassrooms <= 0) return "NO_OPERATIONAL_CLASSES";
  if (args.holidayClassrooms >= args.operationalClassrooms) return "HOLIDAY";

  const expectedOfficial = Math.max(
    0,
    args.operationalClassrooms - args.holidayClassrooms,
  );

  if (args.officialClassrooms <= 0) return "NONE";
  if (args.officialClassrooms < expectedOfficial) return "PARTIAL";
  return "COMPLETE";
}

function markCountsBySession(groups: MarkGroup[]) {
  const map = new Map<string, Map<AttendanceStatus, number>>();

  for (const group of groups) {
    const statusMap = map.get(group.sessionId) ?? new Map<AttendanceStatus, number>();
    statusMap.set(group.status, group._count._all);
    map.set(group.sessionId, statusMap);
  }

  return map;
}

function totalMarks(statusMap: Map<AttendanceStatus, number> | undefined) {
  if (!statusMap) return 0;
  let total = 0;
  for (const count of statusMap.values()) total += count;
  return total;
}

function followUpReason(counts: FollowUpCounts) {
  if (counts.missingRegisters > 0) {
    return `${counts.missingRegisters} class register(s) missing today.`;
  }
  if (counts.openRegisters > 0) {
    return `${counts.openRegisters} class register(s) still open.`;
  }
  if (counts.unmarkedLearners > 0) {
    return `${counts.unmarkedLearners} learner(s) still unmarked.`;
  }
  if (counts.uncertifiedRegisters > 0) {
    return `${counts.uncertifiedRegisters} closed register(s) awaiting certification.`;
  }
  if (counts.absentLearners > 0) {
    return `${counts.absentLearners} learner absence(s) in certified attendance.`;
  }
  return "No attendance follow-up needed.";
}

function needsFollowUp(counts: FollowUpCounts) {
  return (
    counts.missingRegisters > 0 ||
    counts.openRegisters > 0 ||
    counts.unmarkedLearners > 0 ||
    counts.uncertifiedRegisters > 0 ||
    counts.absentLearners > 0
  );
}

function compareFollowUp(a: GovernanceAttendanceFollowUp, b: GovernanceAttendanceFollowUp) {
  return (
    b.missingRegisters - a.missingRegisters ||
    b.openRegisters - a.openRegisters ||
    b.unmarkedLearners - a.unmarkedLearners ||
    b.uncertifiedRegisters - a.uncertifiedRegisters ||
    b.absentLearners - a.absentLearners ||
    a.name.localeCompare(b.name)
  );
}

function selectSessionForClass(rows: SessionRow[]) {
  if (!rows.length) return null;

  const official = rows.find((row) => !row.isHoliday && Boolean(row.certifiedAt));
  if (official) return official;

  const holiday = rows.find((row) => row.isHoliday);
  if (holiday) return holiday;

  const closed = rows.find((row) => row.isClosed);
  if (closed) return closed;

  return rows[0];
}

async function loadSchoolBases(scope: GovernanceScope): Promise<SchoolBase[]> {
  if (!scope.tenantIds.length) return [];

  const rows = await prisma.tenant.findMany({
    where: {
      id: { in: scope.tenantIds },
      status: TenantStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      schoolSector: true,
      zone: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((school) => ({
    id: school.id,
    name: school.name,
    schoolCode: school.schoolCode,
    schoolSector: String(school.schoolSector),
    circuitId: school.zone?.id ?? null,
    circuitName: school.zone?.name ?? null,
  }));
}

async function loadDailySchoolTruth(args: {
  schools: SchoolBase[];
  todayStart: Date;
  todayEnd: Date;
}): Promise<Map<string, DailySchoolTruth>> {
  const tenantIds = args.schools.map((school) => school.id);
  const result = new Map<string, DailySchoolTruth>();

  for (const school of args.schools) {
    result.set(school.id, {
      population: 0,
      present: 0,
      absent: 0,
      operationalClassrooms: 0,
      officialClassrooms: 0,
      holidayClassrooms: 0,
      evidenceState: "NO_OPERATIONAL_CLASSES",
      missingRegisters: 0,
      openRegisters: 0,
      unmarkedLearners: 0,
      uncertifiedRegisters: 0,
      absentLearners: 0,
    });
  }

  if (!tenantIds.length) return result;

  const populationGroups = await prisma.student.groupBy({
    by: ["tenantId"],
    where: {
      tenantId: { in: tenantIds },
      status: StudentStatus.ACTIVE,
    },
    _count: { _all: true },
  });

  for (const group of populationGroups) {
    const truth = result.get(group.tenantId);
    if (truth) truth.population = group._count._all;
  }

  const classrooms = await prisma.classroom.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: ClassroomStatus.ACTIVE,
    },
    select: {
      id: true,
      tenantId: true,
      _count: {
        select: {
          students: {
            where: { status: StudentStatus.ACTIVE },
          },
        },
      },
    },
  });

  const operationalClassrooms = classrooms.filter(
    (classroom) => classroom._count.students > 0,
  );
  const operationalByTenant = new Map<string, typeof operationalClassrooms>();
  const enrollmentByClassroom = new Map<string, number>();

  for (const classroom of operationalClassrooms) {
    const list = operationalByTenant.get(classroom.tenantId) ?? [];
    list.push(classroom);
    operationalByTenant.set(classroom.tenantId, list);
    enrollmentByClassroom.set(classroom.id, classroom._count.students);
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      tenantId: { in: tenantIds },
      date: { gte: args.todayStart, lt: args.todayEnd },
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      isClosed: true,
      certifiedAt: true,
      isHoliday: true,
    },
  });

  const sessionIds = sessions.map((session) => session.id);
  const markGroups = sessionIds.length
    ? await prisma.attendanceMark.groupBy({
        by: ["sessionId", "status"],
        where: { sessionId: { in: sessionIds } },
        _count: { _all: true },
      })
    : [];

  const countsBySession = markCountsBySession(markGroups);
  const sessionsByClassroom = new Map<string, SessionRow[]>();

  for (const session of sessions) {
    const list = sessionsByClassroom.get(session.classroomId) ?? [];
    list.push(session);
    sessionsByClassroom.set(session.classroomId, list);
  }

  for (const school of args.schools) {
    const truth = result.get(school.id);
    if (!truth) continue;

    const schoolClassrooms = operationalByTenant.get(school.id) ?? [];
    truth.operationalClassrooms = schoolClassrooms.length;

    for (const classroom of schoolClassrooms) {
      const session = selectSessionForClass(
        sessionsByClassroom.get(classroom.id) ?? [],
      );

      if (!session) {
        truth.missingRegisters += 1;
        continue;
      }

      if (session.isHoliday) {
        truth.holidayClassrooms += 1;
        continue;
      }

      const statusMap = countsBySession.get(session.id);
      const marked = totalMarks(statusMap);
      const enrolled = enrollmentByClassroom.get(classroom.id) ?? 0;
      const unmarked = Math.max(0, enrolled - marked);

      truth.unmarkedLearners += unmarked;

      if (session.certifiedAt) {
        truth.officialClassrooms += 1;
        const present = statusMap?.get(AttendanceStatus.PRESENT) ?? 0;
        const absent = statusMap?.get(AttendanceStatus.ABSENT) ?? 0;
        truth.present += present;
        truth.absent += absent;
        truth.absentLearners += absent;
      } else if (session.isClosed) {
        truth.uncertifiedRegisters += 1;
      } else {
        truth.openRegisters += 1;
      }
    }

    truth.evidenceState = evidenceState(truth);
  }

  return result;
}

type CalendarState = {
  calendar: AttendanceAcademicCalendar;
  currentWeek: number | null;
  asOfDateISO: string | null;
};

async function loadTermWeeks(args: {
  schools: SchoolBase[];
  todayISO: string;
}): Promise<
  Map<
    string,
    {
      termLabel: string | null;
      currentWeek: number | null;
      weeks: GovernanceAttendanceWeek[];
    }
  >
> {
  const tenantIds = args.schools.map((school) => school.id);
  const result = new Map<
    string,
    {
      termLabel: string | null;
      currentWeek: number | null;
      weeks: GovernanceAttendanceWeek[];
    }
  >();

  for (const school of args.schools) {
    result.set(school.id, {
      termLabel: null,
      currentWeek: null,
      weeks: [],
    });
  }

  if (!tenantIds.length) return result;

  const settingsRows = await prisma.tenantSettings.findMany({
    where: { tenantId: { in: tenantIds } },
    select: {
      tenantId: true,
      currentAcademicYear: true,
      currentTerm: true,
      term1Start: true,
      term1End: true,
      term2Start: true,
      term2End: true,
      term3Start: true,
      term3End: true,
    },
  });

  const settingsByTenant = new Map(
    settingsRows.map((row) => [row.tenantId, row] as const),
  );
  const calendarByTenant = new Map<string, CalendarState>();

  let queryStartISO: string | null = null;
  let queryEndISO: string | null = null;

  for (const school of args.schools) {
    const source = settingsByTenant.get(school.id) ?? {};
    const calendar = buildAttendanceAcademicCalendar(source);
    let asOfDateISO: string | null = null;
    let currentWeek: number | null = null;

    if (
      calendar.configured &&
      calendar.startDateISO &&
      calendar.endDateISO &&
      args.todayISO >= calendar.startDateISO
    ) {
      asOfDateISO =
        args.todayISO <= calendar.endDateISO
          ? args.todayISO
          : calendar.endDateISO;

      const resolution = resolveAttendanceDate(calendar, asOfDateISO);
      if (
        (resolution.code === "OK" || resolution.code === "WEEKEND") &&
        resolution.weekNumber
      ) {
        currentWeek = resolution.weekNumber;
      }
    }

    calendarByTenant.set(school.id, {
      calendar,
      currentWeek,
      asOfDateISO,
    });

    result.set(school.id, {
      termLabel: calendar.term,
      currentWeek,
      weeks: currentWeek
        ? Array.from({ length: currentWeek }, (_, index) => ({
            weekNumber: index + 1,
            presentPct: null,
            present: 0,
            marked: 0,
            current: index + 1 === currentWeek,
          }))
        : [],
    });

    if (currentWeek && calendar.startDateISO && asOfDateISO) {
      if (!queryStartISO || calendar.startDateISO < queryStartISO) {
        queryStartISO = calendar.startDateISO;
      }
      if (!queryEndISO || asOfDateISO > queryEndISO) {
        queryEndISO = asOfDateISO;
      }
    }
  }

  if (!queryStartISO || !queryEndISO) return result;

  const queryStart = parseISODateOnly(queryStartISO);
  const queryEnd = parseISODateOnly(queryEndISO);
  if (!queryStart || !queryEnd) return result;

  const officialSessions = await prisma.attendanceSession.findMany({
    where: {
      tenantId: { in: tenantIds },
      certifiedAt: { not: null },
      isHoliday: false,
      date: { gte: queryStart, lte: queryEnd },
    },
    select: {
      id: true,
      tenantId: true,
      date: true,
    },
  });

  const sessionIds = officialSessions.map((session) => session.id);
  const markGroups = sessionIds.length
    ? await prisma.attendanceMark.groupBy({
        by: ["sessionId", "status"],
        where: { sessionId: { in: sessionIds } },
        _count: { _all: true },
      })
    : [];
  const countsBySession = markCountsBySession(markGroups);

  const weekAccumulators = new Map<
    string,
    Map<number, { present: number; marked: number }>
  >();

  for (const session of officialSessions) {
    const state = calendarByTenant.get(session.tenantId);
    if (!state?.currentWeek || !state.asOfDateISO) continue;

    const dateISO = toISODateOnly(session.date);
    if (!dateISO || dateISO > state.asOfDateISO) continue;
    if (
      !state.calendar.startDateISO ||
      !state.calendar.endDateISO ||
      dateISO < state.calendar.startDateISO ||
      dateISO > state.calendar.endDateISO
    ) {
      continue;
    }

    const resolution = resolveAttendanceDate(state.calendar, dateISO);
    if (!resolution.weekNumber || resolution.weekNumber > state.currentWeek) continue;

    const statusMap = countsBySession.get(session.id);
    const tenantWeeks = weekAccumulators.get(session.tenantId) ?? new Map();
    const accumulator = tenantWeeks.get(resolution.weekNumber) ?? {
      present: 0,
      marked: 0,
    };

    accumulator.present += statusMap?.get(AttendanceStatus.PRESENT) ?? 0;
    accumulator.marked += totalMarks(statusMap);
    tenantWeeks.set(resolution.weekNumber, accumulator);
    weekAccumulators.set(session.tenantId, tenantWeeks);
  }

  for (const school of args.schools) {
    const current = result.get(school.id);
    if (!current?.currentWeek) continue;

    const tenantWeeks = weekAccumulators.get(school.id) ?? new Map();
    current.weeks = current.weeks.map((week) => {
      const accumulator = tenantWeeks.get(week.weekNumber);
      if (!accumulator || accumulator.marked <= 0) return week;

      return {
        ...week,
        present: accumulator.present,
        marked: accumulator.marked,
        presentPct: pct(accumulator.present, accumulator.marked),
      };
    });
  }

  return result;
}

function schoolFollowUps(args: {
  schools: SchoolBase[];
  dailyTruth: Map<string, DailySchoolTruth>;
}) {
  return args.schools
    .map((school): GovernanceAttendanceFollowUp | null => {
      const truth = args.dailyTruth.get(school.id);
      if (!truth || !needsFollowUp(truth)) return null;

      return {
        id: school.id,
        name: school.name,
        circuitName: school.circuitName,
        missingRegisters: truth.missingRegisters,
        openRegisters: truth.openRegisters,
        unmarkedLearners: truth.unmarkedLearners,
        uncertifiedRegisters: truth.uncertifiedRegisters,
        absentLearners: truth.absentLearners,
        reason: followUpReason(truth),
      };
    })
    .filter((row): row is GovernanceAttendanceFollowUp => Boolean(row))
    .sort(compareFollowUp);
}

function buildCircuitResult(args: {
  schools: SchoolBase[];
  dailyTruth: Map<string, DailySchoolTruth>;
  dateISO: string;
}): GovernanceStudentAttendanceResult {
  type CircuitAccumulator = GovernanceStudentAttendanceCircuit & FollowUpCounts;
  const circuitMap = new Map<string, CircuitAccumulator>();

  for (const school of args.schools) {
    const truth = args.dailyTruth.get(school.id);
    if (!truth) continue;

    const circuitId = school.circuitId ?? "UNASSIGNED";
    const circuitName = school.circuitName ?? "Unassigned schools";
    const existing = circuitMap.get(circuitId) ?? {
      circuitId,
      circuitName,
      population: 0,
      present: 0,
      absent: 0,
      operationalClassrooms: 0,
      officialClassrooms: 0,
      holidayClassrooms: 0,
      evidenceState: "NO_OPERATIONAL_CLASSES" as GovernanceAttendanceEvidenceState,
      missingRegisters: 0,
      openRegisters: 0,
      unmarkedLearners: 0,
      uncertifiedRegisters: 0,
      absentLearners: 0,
    };

    existing.population += truth.population;
    existing.present += truth.present;
    existing.absent += truth.absent;
    existing.operationalClassrooms += truth.operationalClassrooms;
    existing.officialClassrooms += truth.officialClassrooms;
    existing.holidayClassrooms += truth.holidayClassrooms;
    existing.missingRegisters += truth.missingRegisters;
    existing.openRegisters += truth.openRegisters;
    existing.unmarkedLearners += truth.unmarkedLearners;
    existing.uncertifiedRegisters += truth.uncertifiedRegisters;
    existing.absentLearners += truth.absentLearners;
    circuitMap.set(circuitId, existing);
  }

  const accumulators = [...circuitMap.values()];
  for (const circuit of accumulators) {
    circuit.evidenceState = evidenceState(circuit);
  }

  const circuits: GovernanceStudentAttendanceCircuit[] = accumulators
    .map((circuit) => ({
      circuitId: circuit.circuitId,
      circuitName: circuit.circuitName,
      population: circuit.population,
      present: circuit.present,
      absent: circuit.absent,
      operationalClassrooms: circuit.operationalClassrooms,
      officialClassrooms: circuit.officialClassrooms,
      holidayClassrooms: circuit.holidayClassrooms,
      evidenceState: circuit.evidenceState,
    }))
    .sort((a, b) => a.circuitName.localeCompare(b.circuitName));

  const circuitsNeedingFollowUp: GovernanceAttendanceFollowUp[] = accumulators
    .filter(needsFollowUp)
    .map((circuit) => ({
      id: circuit.circuitId,
      name: circuit.circuitName,
      circuitName: circuit.circuitName,
      missingRegisters: circuit.missingRegisters,
      openRegisters: circuit.openRegisters,
      unmarkedLearners: circuit.unmarkedLearners,
      uncertifiedRegisters: circuit.uncertifiedRegisters,
      absentLearners: circuit.absentLearners,
      reason: followUpReason(circuit),
    }))
    .sort(compareFollowUp);

  return {
    view: "CIRCUIT",
    date: args.dateISO,
    circuits,
    circuitsNeedingFollowUp,
  };
}

export async function buildGovernanceStudentAttendance(args: {
  scope: GovernanceScope;
  view: GovernanceStudentAttendanceView;
}): Promise<GovernanceStudentAttendanceResult> {
  const { start, end, dateISO } = todayRangeUtcForGhana();
  const schools = await loadSchoolBases(args.scope);
  const dailyTruth = await loadDailySchoolTruth({
    schools,
    todayStart: start,
    todayEnd: end,
  });

  if (args.view === "CIRCUIT") {
    return buildCircuitResult({ schools, dailyTruth, dateISO });
  }

  const termWeeks = await loadTermWeeks({ schools, todayISO: dateISO });

  const schoolRows: GovernanceStudentAttendanceSchool[] = schools.map((school) => {
    const truth = dailyTruth.get(school.id);
    const term = termWeeks.get(school.id);

    return {
      tenantId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      schoolSector: school.schoolSector,
      circuitId: school.circuitId,
      circuitName: school.circuitName,
      population: truth?.population ?? 0,
      present: truth?.present ?? 0,
      absent: truth?.absent ?? 0,
      operationalClassrooms: truth?.operationalClassrooms ?? 0,
      officialClassrooms: truth?.officialClassrooms ?? 0,
      holidayClassrooms: truth?.holidayClassrooms ?? 0,
      evidenceState: truth?.evidenceState ?? "NO_OPERATIONAL_CLASSES",
      termLabel: term?.termLabel ?? null,
      currentWeek: term?.currentWeek ?? null,
      weeks: term?.weeks ?? [],
    };
  });

  return {
    view: "SCHOOL",
    date: dateISO,
    schools: schoolRows,
    schoolsNeedingFollowUp: schoolFollowUps({ schools, dailyTruth }),
  };
}
