// src/lib/governance/teacherAbsenteeism.ts
import { AttendanceStatus, SchoolSector } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ABSENCE_THRESHOLD_DAYS = 3;
const FALLBACK_DAYS = 90;

export type TeacherAbsenteeismSchoolInput = {
  id: string;
  name: string;
  schoolCode: string | null;
  schoolSector: SchoolSector | string;
  circuit: {
    id: string;
    name: string;
  } | null;
  district: {
    id: string;
    name: string;
  } | null;
};

export type GovernanceAbsenteeTeacher = {
  teacherUserId: string;
  staffId: string | null;
  teacherName: string;
  absentDays: number;
  lastAbsentDate: string | null;
};

export type GovernanceAbsenteeSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: SchoolSector | string;
  circuitId: string | null;
  circuitName: string;
  absentTeacherCount: number;
  totalAbsentDays: number;
  teachers: GovernanceAbsenteeTeacher[];
};

export type GovernanceAbsenteeCircuit = {
  circuitId: string;
  circuitName: string;
  absentTeacherCount: number;
  totalAbsentDays: number;
  schoolsWithCases: number;
  schools: GovernanceAbsenteeSchool[];
};

export type GovernanceTeacherAbsenteeismOverview = {
  thresholdDays: number;
  periodLabel: string;
  fromDate: string;
  toDate: string;
  fallbackUsed: boolean;
  flaggedTeachers: number;
  schoolsWithCases: number;
  circuitsWithCases: number;
  circuits: GovernanceAbsenteeCircuit[];
};

type TermSettingsRow = {
  tenantId: string;
  currentTerm: string | null;
  term1Start: Date | null;
  term1End: Date | null;
  term2Start: Date | null;
  term2End: Date | null;
  term3Start: Date | null;
  term3End: Date | null;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function displayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const fullName = clean(user.name);
  if (fullName) return fullName;

  const parts = [clean(user.firstName), clean(user.lastName)].filter(Boolean);
  if (parts.length) return parts.join(" ");

  return clean(user.email) || "Teacher";
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ),
  );
}

function selectedTermStart(
  settings: TermSettingsRow | undefined,
  todayStart: Date,
) {
  if (!settings) return null;

  const currentTerm = clean(settings.currentTerm).toUpperCase();

  if (currentTerm.includes("FIRST") || currentTerm.includes("1")) {
    return settings.term1Start;
  }

  if (currentTerm.includes("SECOND") || currentTerm.includes("2")) {
    return settings.term2Start;
  }

  if (currentTerm.includes("THIRD") || currentTerm.includes("3")) {
    return settings.term3Start;
  }

  const ranges = [
    { start: settings.term1Start, end: settings.term1End },
    { start: settings.term2Start, end: settings.term2End },
    { start: settings.term3Start, end: settings.term3End },
  ];

  const activeRange = ranges.find(({ start, end }) => {
    if (!start) return false;

    return (
      start.getTime() <= todayStart.getTime() &&
      (!end || end.getTime() >= todayStart.getTime())
    );
  });

  if (activeRange?.start) return activeRange.start;

  return (
    ranges
      .map((range) => range.start)
      .filter((value): value is Date => Boolean(value))
      .filter((value) => value.getTime() <= todayStart.getTime())
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  );
}

export function emptyTeacherAbsenteeismOverview(
  todayStart = startOfUtcDay(new Date()),
): GovernanceTeacherAbsenteeismOverview {
  return {
    thresholdDays: ABSENCE_THRESHOLD_DAYS,
    periodLabel: "Current term",
    fromDate: dateKey(todayStart),
    toDate: dateKey(todayStart),
    fallbackUsed: false,
    flaggedTeachers: 0,
    schoolsWithCases: 0,
    circuitsWithCases: 0,
    circuits: [],
  };
}

export async function buildGovernanceTeacherAbsenteeismOverview(args: {
  schools: TeacherAbsenteeismSchoolInput[];
  todayStart: Date;
  todayEnd: Date;
}): Promise<GovernanceTeacherAbsenteeismOverview> {
  const { schools, todayStart, todayEnd } = args;
  const tenantIds = schools.map((school) => school.id);

  if (!tenantIds.length) {
    return emptyTeacherAbsenteeismOverview(todayStart);
  }

  const fallbackStart = new Date(todayStart);
  fallbackStart.setUTCDate(fallbackStart.getUTCDate() - FALLBACK_DAYS);

  // Keep queries sequential for low database connection limits.
  const settingsRows = await prisma.tenantSettings.findMany({
    where: {
      tenantId: { in: tenantIds },
    },
    select: {
      tenantId: true,
      currentTerm: true,
      term1Start: true,
      term1End: true,
      term2Start: true,
      term2End: true,
      term3Start: true,
      term3End: true,
    },
  });

  const settingsByTenantId = new Map(
    settingsRows.map((settings) => [settings.tenantId, settings]),
  );

  const startByTenantId = new Map<string, Date>();
  let fallbackUsed = false;

  for (const tenantId of tenantIds) {
    const configuredStart = selectedTermStart(
      settingsByTenantId.get(tenantId),
      todayStart,
    );

    if (configuredStart) {
      startByTenantId.set(tenantId, startOfUtcDay(configuredStart));
    } else {
      startByTenantId.set(tenantId, fallbackStart);
      fallbackUsed = true;
    }
  }

  const earliestStart = Array.from(startByTenantId.values()).sort(
    (a, b) => a.getTime() - b.getTime(),
  )[0] ?? fallbackStart;

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
          mode: "insensitive",
        },
      },
    },
    select: {
      tenantId: true,
      userId: true,
      staffId: true,
      user: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const membershipByTeacher = new Map(
    memberships.map((membership) => [
      `${membership.tenantId}:${membership.userId}`,
      membership,
    ]),
  );

  const absenceRecords = await prisma.teacherAttendanceRecord.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: AttendanceStatus.ABSENT,
      date: {
        gte: earliestStart,
        lt: todayEnd,
      },
      session: {
        is: {
          isClosed: true,
          certifiedAt: { not: null },
        },
      },
    },
    select: {
      tenantId: true,
      teacherUserId: true,
      date: true,
    },
    orderBy: [{ date: "asc" }],
  });

  const teacherGroups = new Map<
    string,
    {
      tenantId: string;
      teacherUserId: string;
      staffId: string | null;
      teacherName: string;
      dates: Set<string>;
    }
  >();

  for (const record of absenceRecords) {
    const periodStart = startByTenantId.get(record.tenantId) ?? fallbackStart;

    if (record.date.getTime() < periodStart.getTime()) continue;

    const membershipKey = `${record.tenantId}:${record.teacherUserId}`;
    const membership = membershipByTeacher.get(membershipKey);

    // Historical records belonging to inactive/non-teacher accounts do not
    // enter the current governance ranking.
    if (!membership) continue;

    const existing = teacherGroups.get(membershipKey) ?? {
      tenantId: record.tenantId,
      teacherUserId: record.teacherUserId,
      staffId: membership.staffId ?? null,
      teacherName: displayName(membership.user),
      dates: new Set<string>(),
    };

    existing.dates.add(dateKey(record.date));
    teacherGroups.set(membershipKey, existing);
  }

  const schoolByTenantId = new Map(
    schools.map((school) => [school.id, school]),
  );

  const schoolGroups = new Map<string, GovernanceAbsenteeSchool>();

  for (const teacher of teacherGroups.values()) {
    const absentDates = Array.from(teacher.dates).sort();

    if (absentDates.length < ABSENCE_THRESHOLD_DAYS) continue;

    const school = schoolByTenantId.get(teacher.tenantId);
    if (!school) continue;

    const existing = schoolGroups.get(school.id) ?? {
      tenantId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      schoolSector: school.schoolSector,
      circuitId: school.circuit?.id ?? null,
      circuitName: school.circuit?.name ?? "No circuit assigned",
      absentTeacherCount: 0,
      totalAbsentDays: 0,
      teachers: [],
    };

    existing.teachers.push({
      teacherUserId: teacher.teacherUserId,
      staffId: teacher.staffId,
      teacherName: teacher.teacherName,
      absentDays: absentDates.length,
      lastAbsentDate: absentDates[absentDates.length - 1] ?? null,
    });

    schoolGroups.set(school.id, existing);
  }

  for (const school of schoolGroups.values()) {
    school.teachers.sort(
      (a, b) =>
        b.absentDays - a.absentDays ||
        a.teacherName.localeCompare(b.teacherName),
    );

    school.absentTeacherCount = school.teachers.length;
    school.totalAbsentDays = school.teachers.reduce(
      (sum, teacher) => sum + teacher.absentDays,
      0,
    );
  }

  const circuitGroups = new Map<string, GovernanceAbsenteeCircuit>();

  for (const school of schoolGroups.values()) {
    const circuitKey = school.circuitId ?? "UNASSIGNED";

    const existing = circuitGroups.get(circuitKey) ?? {
      circuitId: circuitKey,
      circuitName: school.circuitName,
      absentTeacherCount: 0,
      totalAbsentDays: 0,
      schoolsWithCases: 0,
      schools: [],
    };

    existing.schools.push(school);
    circuitGroups.set(circuitKey, existing);
  }

  for (const circuit of circuitGroups.values()) {
    circuit.schools.sort(
      (a, b) =>
        b.absentTeacherCount - a.absentTeacherCount ||
        b.totalAbsentDays - a.totalAbsentDays ||
        a.schoolName.localeCompare(b.schoolName),
    );

    circuit.absentTeacherCount = circuit.schools.reduce(
      (sum, school) => sum + school.absentTeacherCount,
      0,
    );

    circuit.totalAbsentDays = circuit.schools.reduce(
      (sum, school) => sum + school.totalAbsentDays,
      0,
    );

    circuit.schoolsWithCases = circuit.schools.length;
  }

  const circuits = Array.from(circuitGroups.values()).sort(
    (a, b) =>
      b.absentTeacherCount - a.absentTeacherCount ||
      b.totalAbsentDays - a.totalAbsentDays ||
      a.circuitName.localeCompare(b.circuitName),
  );

  const flaggedTeachers = circuits.reduce(
    (sum, circuit) => sum + circuit.absentTeacherCount,
    0,
  );

  return {
    thresholdDays: ABSENCE_THRESHOLD_DAYS,
    periodLabel: fallbackUsed
      ? "Current term; last 90 days used where term dates are missing"
      : "Current term",
    fromDate: dateKey(earliestStart),
    toDate: dateKey(todayStart),
    fallbackUsed,
    flaggedTeachers,
    schoolsWithCases: schoolGroups.size,
    circuitsWithCases: circuits.length,
    circuits,
  };
}