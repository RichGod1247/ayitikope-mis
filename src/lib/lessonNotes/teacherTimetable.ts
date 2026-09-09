import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listUserAccessibleClassrooms,
  normalizeSchoolLevel,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import { subjectMatchesTeachingScope } from "@/lib/teachingSubjectScope";

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

export type TeacherTimetableClassOption = ClassroomLite & {
  label: string;
  level: string | null;
};

export type TeacherTimetableSubjectOption = {
  key: string;
  label: string;
  classes: TeacherTimetableClassOption[];
};

export type TeacherTimetableEntryRow = {
  id: string;
  classroomId: string;
  subject: string;
  subjectNorm: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type TeacherTimetablePrintGroup = {
  weekday: number;
  dayLabel: string;
  times: string[];
};

const SUBJECT_ALIASES: Record<string, string> = {
  MATH: "MATHEMATICS",
  MATHS: "MATHEMATICS",
  MATHEMATICS: "MATHEMATICS",
  SCIENCE: "SCIENCE",
  INTEGRATEDSCIENCE: "SCIENCE",
  INTSCIENCE: "SCIENCE",
  ENGLISH: "ENGLISH",
  ENGLISHLANGUAGE: "ENGLISH",
  OWOP: "OWOP",
  OURWORLDOURPEOPLE: "OWOP",
  RME: "RME",
  RELIGIOUSANDMORALEDUCATION: "RME",
  ICT: "COMPUTING",
  COMPUTING: "COMPUTING",

  GHANAIANLANGUAGE: "GHANAIANLANGUAGE",
  GHANAIANLANGUAGES: "GHANAIANLANGUAGE",
};

const DAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function compactAlphaNum(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function stripTimetableLevelPrefix(value: unknown) {
  return clean(value).replace(
    /^(?:(?:JHS\s*[1-3]|JHS[1-3])|(?:JUNIOR\s+HIGH\s+SCHOOL\s*[1-3])|(?:BASIC\s*[1-9]|BASIC[1-9])|(?:BS\s*[1-9]|BS[1-9])|(?:B\s*[1-9]|B[1-9])|(?:P\s*[1-6]|P[1-6])|(?:PRIMARY\s*[1-6])|(?:KG\s*[1-2]|KG[1-2]))\s*[:\-–—]?\s*/i,
    "",
  );
}

export function normalizeTimetableSubjectKey(value: unknown) {
  const stripped = stripTimetableLevelPrefix(value);
  const compact = compactAlphaNum(stripped);
  return SUBJECT_ALIASES[compact] ?? compact;
}

export function timetableDayLabel(weekday: number) {
  return DAY_LABELS[weekday] ?? "Day";
}

export function minuteToTimeInput(totalMinutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.trunc(totalMinutes)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimetableMinute(totalMinutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.trunc(totalMinutes)));
  const hour24 = Math.floor(safe / 60);
  const minute = safe % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatTimetableRange(startMinute: number, endMinute: number) {
  return `${formatTimetableMinute(startMinute)}–${formatTimetableMinute(endMinute)}`;
}

export function groupTimetableEntriesForPrint(entries: TeacherTimetableEntryRow[]) {
  const byDay = new Map<number, string[]>();

  for (const row of [...entries].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)) {
    if (row.weekday < 1 || row.weekday > 5) continue;
    const list = byDay.get(row.weekday) ?? [];
    list.push(formatTimetableRange(row.startMinute, row.endMinute));
    byDay.set(row.weekday, list);
  }

  return Array.from(byDay.entries()).map(([weekday, times]) => ({
    weekday,
    dayLabel: timetableDayLabel(weekday),
    times,
  }));
}

function classroomLabel(classroom: ClassroomLite) {
  const normalized = normalizeSchoolLevel(classroom.grade || classroom.name);
  const base = normalized || clean(classroom.grade) || clean(classroom.name) || "Class";
  const arm = clean(classroom.arm);
  return arm ? `${base} · Arm ${arm}` : base;
}

function levelVariants(raw: unknown) {
  const level = normalizeSchoolLevel(raw);
  if (!level) return [] as string[];

  if (/^KG[12]$/i.test(level)) {
    const n = level.slice(2);
    return [`KG ${n}`, `KG${n}`];
  }

  if (/^Basic [1-6]$/i.test(level)) {
    const n = level.match(/([1-6])$/)?.[1] ?? "";
    return [`Basic ${n}`, `Basic${n}`, `B${n}`, `B ${n}`, `Primary ${n}`, `P${n}`];
  }

  if (/^JHS [1-3]$/i.test(level)) {
    const n = Number(level.match(/([1-3])$/)?.[1] ?? "0");
    const basic = n + 6;
    return [`JHS ${n}`, `JHS${n}`, `Basic ${basic}`, `Basic${basic}`, `B${basic}`, `BS${basic}`];
  }

  return [level];
}

function phaseVariants(raw: unknown) {
  const level = normalizeSchoolLevel(raw);
  if (/^KG[12]$/i.test(level)) return ["KG", "Kindergarten"];
  if (/^Basic [1-6]$/i.test(level)) return ["PRIMARY", "Primary"];
  if (/^JHS [1-3]$/i.test(level)) return ["JHS", "Junior High School"];
  return [] as string[];
}

async function curriculumSubjectsForClass(tenantId: string, classroom: ClassroomLite) {
  const rawLevel = classroom.grade || classroom.name;
  const levels = levelVariants(rawLevel);

  const commonWhere: Prisma.CurriculumSubjectWhereInput = {
    isActive: true,
    OR: [{ tenantId }, { isGlobal: true }],
  };

  let rows = levels.length
    ? await prisma.curriculumSubject.findMany({
        where: {
          ...commonWhere,
          AND: [
            {
              OR: levels.map((level) => ({
                level: { equals: level, mode: "insensitive" as const },
              })),
            },
          ],
        },
        select: { name: true, orderIndex: true },
        orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
        take: 500,
      })
    : [];

  if (!rows.length) {
    const phases = phaseVariants(rawLevel);
    if (phases.length) {
      rows = await prisma.curriculumSubject.findMany({
        where: {
          ...commonWhere,
          AND: [
            {
              OR: phases.map((phase) => ({
                phase: { equals: phase, mode: "insensitive" as const },
              })),
            },
          ],
        },
        select: { name: true, orderIndex: true },
        orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
        take: 500,
      });
    }
  }

  const seen = new Set<string>();
  const labels: string[] = [];

  for (const row of rows) {
    const label = stripTimetableLevelPrefix(row.name);
    const key = normalizeTimetableSubjectKey(label);
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return labels.sort((a, b) => a.localeCompare(b));
}

export async function listTeacherTimetableOptions(args: {
  tenantId: string;
  userId: string;
  roleName?: string | null;
}) {
  const classrooms = await listUserAccessibleClassrooms(args);
  const subjectMap = new Map<
    string,
    { label: string; classes: Map<string, TeacherTimetableClassOption> }
  >();

  for (const classroom of classrooms) {
    const access = await resolveUserClassroomAccess({
      tenantId: args.tenantId,
      userId: args.userId,
      roleName: args.roleName,
      classroomId: classroom.id,
    });

    if (!access.ok) continue;

    const subjectLabels = Array.isArray(access.allowedSubjects)
      ? access.allowedSubjects
      : await curriculumSubjectsForClass(args.tenantId, classroom);

    for (const rawSubject of subjectLabels) {
      const label = stripTimetableLevelPrefix(rawSubject);
      const key = normalizeTimetableSubjectKey(label);
      if (!label || !key) continue;

      const existing = subjectMap.get(key) ?? {
        label,
        classes: new Map<string, TeacherTimetableClassOption>(),
      };

      existing.classes.set(classroom.id, {
        ...classroom,
        label: classroomLabel(classroom),
        level: access.normalizedClassLevel,
      });

      subjectMap.set(key, existing);
    }
  }

  return Array.from(subjectMap.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      classes: Array.from(value.classes.values()).sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function authorizeTeacherTimetableSelection(args: {
  tenantId: string;
  userId: string;
  roleName?: string | null;
  classroomId: string;
  subject: string;
}) {
  const access = await resolveUserClassroomAccess({
    tenantId: args.tenantId,
    userId: args.userId,
    roleName: args.roleName,
    classroomId: args.classroomId,
    subject: args.subject,
  });

  if (!access.ok) return access;

  const candidates = Array.isArray(access.allowedSubjects)
    ? access.allowedSubjects
    : await curriculumSubjectsForClass(args.tenantId, access.classroom);

  const matched = candidates.find((candidate) =>
    subjectMatchesTeachingScope(candidate, args.subject, access.normalizedClassLevel),
  );

  if (!matched) {
    return {
      ok: false as const,
      reason: "SUBJECT_OUT_OF_SCOPE" as const,
    };
  }

  return {
    ok: true as const,
    classroom: access.classroom,
    normalizedClassLevel: access.normalizedClassLevel,
    subject: stripTimetableLevelPrefix(matched),
    subjectNorm: normalizeTimetableSubjectKey(matched),
  };
}

export async function readTeacherTimetableEntries(args: {
  tenantId: string;
  teacherUserId: string;
  classroomId?: string | null;
  asOf?: Date | null;
}) {
  const classroomClause = args.classroomId
    ? Prisma.sql`AND "classroomId" = ${args.classroomId}`
    : Prisma.empty;

  const lifecycleClause = args.asOf
    ? Prisma.sql`
        AND "createdAt" <= ${args.asOf}
        AND ("retiredAt" IS NULL OR "retiredAt" > ${args.asOf})
      `
    : Prisma.sql`AND "isActive" = true`;

  return prisma.$queryRaw<TeacherTimetableEntryRow[]>(Prisma.sql`
    SELECT
      "id"::text AS "id",
      "classroomId" AS "classroomId",
      "subject" AS "subject",
      "subjectNorm" AS "subjectNorm",
      "weekday"::int AS "weekday",
      "startMinute"::int AS "startMinute",
      "endMinute"::int AS "endMinute"
    FROM edulife_os."TeacherLessonTimetableEntry"
    WHERE "tenantId" = ${args.tenantId}
      AND "teacherUserId" = ${args.teacherUserId}
      ${lifecycleClause}
      ${classroomClause}
    ORDER BY "weekday" ASC, "startMinute" ASC, "subject" ASC
  `);
}

export async function readActiveTeacherTimetableEntries(args: {
  tenantId: string;
  teacherUserId: string;
  classroomId?: string | null;
}) {
  return readTeacherTimetableEntries({ ...args, asOf: null });
}
