// src/app/api/headteacher/attendance/weekly/csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client' // <-- needed for Prisma.join

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

type ClassRow = { classroomId: string; classGrade: string | null; classArm: string | null }
type EnrolledRow = { classroomId: string; enrolled: number }
type StatRow = {
  classroomId: string
  marks: number
  present: number
  absent: number
  late: number
  excused: number
}

/**
 * GET /api/headteacher/attendance/weekly/csv?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns text/csv with per-class weekly totals.
 * Columns: Class, Total Enrolled, Marks Taken, Present, Absent, Late, Excused, Present %
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))

    if (!tenantId || !start || !end) {
      return new Response('tenantId, start, end are required', { status: 400 })
    }

    // 1) Classrooms for this tenant (serialized call)
    const classes = await prisma.$queryRaw<ClassRow[]>`
      SELECT c."id" AS "classroomId", c."grade" AS "classGrade", c."arm" AS "classArm"
      FROM "edulife_os"."Classroom" c
      WHERE c."tenantId" = ${tenantId}
      ORDER BY c."grade" NULLS LAST, c."arm" NULLS LAST
    `

    const header = [
      'Class',
      'Total Enrolled',
      'Marks Taken',
      'Present',
      'Absent',
      'Late',
      'Excused',
      'Present %',
    ].join(',')

    // Safety: if no classes, return empty CSV with header
    if (classes.length === 0) {
      return new Response(header + '\n', {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'cache-control': 'no-store',
          'content-disposition': `attachment; filename="attendance_week_${start}_to_${end}.csv"`
        }
      })
    }

    // 2) Enrolled counts by classroom (serialized call)
    const enrolledRows = await prisma.$queryRaw<EnrolledRow[]>`
      SELECT st."classroomId", COUNT(st."id")::int AS enrolled
      FROM "edulife_os"."Student" st
      WHERE st."classroomId" IN (${Prisma.join(classes.map(c => c.classroomId))})
      GROUP BY st."classroomId"
    `
    const enrolledMap = new Map<string, number>()
    for (const r of enrolledRows) enrolledMap.set(r.classroomId, r.enrolled)

    // 3) Mark stats in range by classroom (serialized call)
    const statsRows = await prisma.$queryRaw<StatRow[]>`
      WITH range_sessions AS (
        SELECT s."id" AS "sessionId", s."classroomId"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
          AND s."classroomId" IN (${Prisma.join(classes.map(c => c.classroomId))})
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
    `
    const statsMap = new Map<string, StatRow>()
    for (const r of statsRows) statsMap.set(r.classroomId, r)

    // Compose CSV lines
    const lines: string[] = []
    for (const c of classes) {
      const label = c.classGrade ? (c.classArm ? `${c.classGrade}${c.classArm}` : c.classGrade) : (c.classArm ?? '')
      const enrolled = enrolledMap.get(c.classroomId) ?? 0
      const st = statsMap.get(c.classroomId) ?? { classroomId: c.classroomId, marks: 0, present: 0, absent: 0, late: 0, excused: 0 }
      const pct = st.marks > 0 ? (Math.round((st.present / st.marks) * 1000) / 10).toFixed(1) : '0.0'
      lines.push([
        label,
        String(enrolled),
        String(st.marks),
        String(st.present),
        String(st.absent),
        String(st.late),
        String(st.excused),
        pct,
      ].join(','))
    }

    const csv = [header, ...lines].join('\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="attendance_week_${start}_to_${end}.csv"`
      }
    })
  } catch (err) {
    console.error('weekly csv error:', err)
    return new Response('Failed to generate CSV', { status: 500 })
  }
}
