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
  // returns YYYY-MM-DD in UTC
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function defaultLast7DaysRange(): { start: string; end: string } {
  const now = new Date();
  const end = isoDateOnlyFromUtcDate(now);
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

function classLabelFromParts(grade: string | null, arm: string | null, name: string | null) {
  // Prefer name if present; else grade+arm
  const g = (grade ?? "").trim();
  const a = (arm ?? "").trim();
  const n = (name ?? "").trim();

  if (n) {
    // If name already includes grade/arm, fine.
    return n;
  }

  if (g && a) return `${g} · Arm ${a}`;
  if (g) return g;
  if (a) return `Arm ${a}`;
  return "Class";
}

function clampPercent(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export async function getWeeklyAttendanceStats(params: {
  tenantId: string;
  start: string;
  end: string;
}): Promise<WeeklyAttendanceStats> {
  const { tenantId, start, end } = params;

  // 1) Load classrooms in tenant
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

  // 2) Enrolled counts (students per class)
  const enrolledRows = await prisma.$queryRaw<EnrolledRow[]>`
    SELECT st."classroomId", COUNT(st."id")::int AS enrolled
    FROM "edulife_os"."Student" st
    WHERE st."classroomId" IN (${Prisma.join(classroomIds)})
    GROUP BY st."classroomId"
  `;
  const enrolledMap = new Map<string, number>();
  for (const r of enrolledRows) enrolledMap.set(r.classroomId, r.enrolled);

  // 3) Attendance marks per class within range (by session)
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

  const rows: WeeklyAttendanceRow[] = classes.map((c) => {
    const enrolled = enrolledMap.get(c.classroomId) ?? 0;
    const st = statsMap.get(c.classroomId) ?? {
      classroomId: c.classroomId,
      marks: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };

    const pct = st.marks > 0 ? clampPercent((st.present / Math.max(st.marks, 1)) * 100) : 0;

    return {
      classroomId: c.classroomId,
      classLabel: classLabelFromParts(c.classGrade, c.classArm, c.className),
      enrolled,
      marks: st.marks,
      present: st.present,
      absent: st.absent,
      late: st.late,
      excused: st.excused,
      pct,
    };
  });

  const totals = rows.reduce(
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

  const pctOverall = totals.marks > 0 ? clampPercent((totals.present / totals.marks) * 100) : 0;

  return {
    start,
    end,
    totals: { ...totals, pctOverall },
    rows,
  };
}
