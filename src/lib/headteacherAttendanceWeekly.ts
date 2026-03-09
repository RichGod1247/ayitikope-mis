// src/lib/headteacherAttendanceWeekly.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return input;
}

export function isoDateOnlyFromUtcDate(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function defaultLast7DaysRange(): { start: string; end: string } {
  const now = new Date();
  const end = isoDateOnlyFromUtcDate(now);
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = isoDateOnlyFromUtcDate(startDate);
  return { start, end };
}

type ClassRow = {
  classroomId: string;
  classGrade: string | null;
  classArm: string | null;
  className: string | null;
};

type EnrolledRow = { classroomId: string; enrolled: number };

type StatRow = {
  classroomId: string;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export type WeeklyAttendanceRow = {
  classroomId: string;
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

export type WeeklyAttendanceStats = {
  start: string;
  end: string;
  totals: {
    classes: number;
    enrolled: number;
    marks: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    pctOverall: number;
  };
  rows: WeeklyAttendanceRow[];
};

type CandidateRow = {
  classroomId: string;
  classGrade: string | null;
  classArm: string | null;
  className: string | null;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeStageBucket(raw: unknown): string | null {
  const compact = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let m =
    compact.match(/^KG([12])(?:[A-Z].*)?$/) ||
    compact.match(/^KINDERGARTEN([12])(?:[A-Z].*)?$/);
  if (m) return `KG ${m[1]}`;

  m = compact.match(/^(PRIMARY|PRI|P)([1-6])(?:[A-Z].*)?$/);
  if (m) return `PRIMARY ${m[2]}`;

  m = compact.match(/^(BASIC|B)([1-9])(?:[A-Z].*)?$/);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= 6) return `PRIMARY ${n}`;
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  m = compact.match(/^JHS([1-3])(?:[A-Z].*)?$/);
  if (m) return `JHS ${m[1]}`;

  return null;
}

function getStageBucketForClassRow(row: {
  classGrade: string | null;
  className: string | null;
}) {
  return normalizeStageBucket(row.classGrade) ?? normalizeStageBucket(row.className);
}

function classLabelFromParts(
  grade: string | null,
  arm: string | null,
  name: string | null
) {
  const g = cleanStr(grade);
  const a = cleanStr(arm);
  const n = cleanStr(name);

  if (n) return n;
  if (g && a) return `${g} · Arm ${a}`;
  if (g) return g;
  if (a) return `Arm ${a}`;
  return "Class";
}

function singleStreamLabelFromRow(row: {
  classGrade: string | null;
  className: string | null;
  classArm: string | null;
}) {
  return (
    getStageBucketForClassRow(row) ||
    classLabelFromParts(row.classGrade, null, row.className)
  );
}

function stageBucketOrder(bucket: string | null) {
  const ordered = [
    "KG 1",
    "KG 2",
    "PRIMARY 1",
    "PRIMARY 2",
    "PRIMARY 3",
    "PRIMARY 4",
    "PRIMARY 5",
    "PRIMARY 6",
    "JHS 1",
    "JHS 2",
    "JHS 3",
  ];
  const idx = bucket ? ordered.indexOf(bucket) : -1;
  return idx >= 0 ? idx : 999;
}

function clampPercent(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function isArmEmpty(arm: string | null | undefined) {
  return cleanStr(arm) === "";
}

function candidatePriority(row: CandidateRow) {
  const noArm = isArmEmpty(row.classArm) ? 0 : 1;
  const hasName = cleanStr(row.className) ? 0 : 1;
  const label = classLabelFromParts(row.classGrade, row.classArm, row.className).toUpperCase();
  return { noArm, hasName, label };
}

function pickPreferredSingleStreamRow(group: CandidateRow[]) {
  return [...group].sort((a, b) => {
    const pa = candidatePriority(a);
    const pb = candidatePriority(b);

    if (pa.noArm !== pb.noArm) return pa.noArm - pb.noArm;
    if (pa.hasName !== pb.hasName) return pa.hasName - pb.hasName;
    return pa.label.localeCompare(pb.label);
  })[0];
}

export async function getWeeklyAttendanceStats(params: {
  tenantId: string;
  start: string;
  end: string;
}): Promise<WeeklyAttendanceStats> {
  const { tenantId, start, end } = params;

  const classes = await prisma.$queryRaw<ClassRow[]>`
    SELECT
      c."id" AS "classroomId",
      c."grade" AS "classGrade",
      c."arm" AS "classArm",
      c."name" AS "className"
    FROM "edulife_os"."Classroom" c
    WHERE c."tenantId" = ${tenantId}
    ORDER BY c."grade" NULLS LAST, c."arm" NULLS LAST, c."name" NULLS LAST
  `;

  if (!classes.length) {
    return {
      start,
      end,
      totals: {
        classes: 0,
        enrolled: 0,
        marks: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        pctOverall: 0,
      },
      rows: [],
    };
  }

  const classroomIds = classes.map((c) => c.classroomId);

  const enrolledRows = await prisma.$queryRaw<EnrolledRow[]>`
    SELECT st."classroomId", COUNT(st."id")::int AS enrolled
    FROM "edulife_os"."Student" st
    WHERE st."classroomId" IN (${Prisma.join(classroomIds)})
    GROUP BY st."classroomId"
  `;

  const enrolledMap = new Map<string, number>();
  for (const r of enrolledRows) enrolledMap.set(r.classroomId, r.enrolled);

  const statsRows = await prisma.$queryRaw<StatRow[]>`
    WITH range_sessions AS (
      SELECT s."id" AS "sessionId", s."classroomId"
      FROM "edulife_os"."AttendanceSession" s
      WHERE s."tenantId" = ${tenantId}
        AND s."date"::date BETWEEN ${start}::date AND ${end}::date
        AND s."classroomId" IN (${Prisma.join(classroomIds)})
    )
    SELECT
      rs."classroomId",
      COUNT(m."id")::int AS marks,
      COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS present,
      COUNT(CASE WHEN m."status" = 'ABSENT'  THEN 1 END)::int AS absent,
      COUNT(CASE WHEN m."status" = 'LATE'    THEN 1 END)::int AS late,
      COUNT(CASE WHEN m."status" = 'EXCUSED' THEN 1 END)::int AS excused
    FROM range_sessions rs
    LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = rs."sessionId"
    GROUP BY rs."classroomId"
  `;

  const statsMap = new Map<string, StatRow>();
  for (const r of statsRows) statsMap.set(r.classroomId, r);

  const rawRows: CandidateRow[] = classes.map((c) => {
    const enrolled = enrolledMap.get(c.classroomId) ?? 0;
    const st = statsMap.get(c.classroomId) ?? {
      classroomId: c.classroomId,
      marks: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };

    return {
      classroomId: c.classroomId,
      classGrade: c.classGrade,
      classArm: c.classArm,
      className: c.className,
      enrolled,
      marks: st.marks,
      present: st.present,
      absent: st.absent,
      late: st.late,
      excused: st.excused,
    };
  });

  const grouped = new Map<string, CandidateRow[]>();
  const others: CandidateRow[] = [];

  for (const row of rawRows) {
    const bucket = getStageBucketForClassRow(row);
    if (!bucket) {
      others.push(row);
      continue;
    }
    const arr = grouped.get(bucket) ?? [];
    arr.push(row);
    grouped.set(bucket, arr);
  }

  const pickedRows: WeeklyAttendanceRow[] = [];

  const orderedBuckets = Array.from(grouped.keys()).sort((a, b) => {
    const diff = stageBucketOrder(a) - stageBucketOrder(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;

    const chosen = pickPreferredSingleStreamRow(group);
    const pct =
      chosen.marks > 0
        ? clampPercent((chosen.present / Math.max(chosen.marks, 1)) * 100)
        : 0;

    pickedRows.push({
      classroomId: chosen.classroomId,
      classLabel: singleStreamLabelFromRow(chosen),
      enrolled: chosen.enrolled,
      marks: chosen.marks,
      present: chosen.present,
      absent: chosen.absent,
      late: chosen.late,
      excused: chosen.excused,
      pct,
    });
  }

  for (const row of others) {
    const pct =
      row.marks > 0
        ? clampPercent((row.present / Math.max(row.marks, 1)) * 100)
        : 0;

    pickedRows.push({
      classroomId: row.classroomId,
      classLabel: classLabelFromParts(row.classGrade, row.classArm, row.className),
      enrolled: row.enrolled,
      marks: row.marks,
      present: row.present,
      absent: row.absent,
      late: row.late,
      excused: row.excused,
      pct,
    });
  }

  const totals = pickedRows.reduce(
    (acc, r) => {
      acc.classes += 1;
      acc.enrolled += r.enrolled;
      acc.marks += r.marks;
      acc.present += r.present;
      acc.absent += r.absent;
      acc.late += r.late;
      acc.excused += r.excused;
      return acc;
    },
    {
      classes: 0,
      enrolled: 0,
      marks: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    }
  );

  const pctOverall =
    totals.marks > 0 ? clampPercent((totals.present / totals.marks) * 100) : 0;

  return {
    start,
    end,
    totals: { ...totals, pctOverall },
    rows: pickedRows,
  };
}