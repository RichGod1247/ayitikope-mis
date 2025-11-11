// src/app/api/headteacher/weekly/class-roster/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/weekly/class-roster?tenantId=...&classroomId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns Mon–Fri roll-up per student in the class:
 *  - studentId, fullName, guardian, phone
 *  - counts: present, absent, late, excused, noMark
 *  - sessions (number of sessions that existed for the class in range)
 *  - pctPresent = round(present / sessions * 100) when sessions>0 else 0
 *
 * Notes:
 * - Roster is taken from current Classroom -> Student mapping.
 * - If you implement historical rosters later, join by date accordingly.
 * - Raw SQL for cross-client stability.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const classroomId = String(searchParams.get('classroomId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))

    if (!tenantId || !classroomId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, classroomId, start, end are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const rows = await prisma.$queryRaw<
      Array<{
        studentId: string
        firstName: string
        lastName: string
        guardianName: string | null
        guardianPhone: string | null
        sessions: number
        present: number
        absent: number
        late: number
        excused: number
        noMark: number
      }>
    >`
      WITH class_sessions AS (
        SELECT s."id" AS "sessionId"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."classroomId" = ${classroomId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      roster AS (
        SELECT st."id" AS "studentId",
               st."firstName", st."lastName",
               st."guardianName", st."guardianPhone"
        FROM "edulife_os"."Student" st
        WHERE st."tenantId" = ${tenantId}
          AND st."classroomId" = ${classroomId}
      ),
      marks AS (
        SELECT
          cs."sessionId",
          r."studentId",
          m."status"
        FROM class_sessions cs
        CROSS JOIN roster r
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = cs."sessionId"
         AND m."studentId" = r."studentId"
      )
      SELECT
        r."studentId",
        r."firstName",
        r."lastName",
        r."guardianName",
        r."guardianPhone",
        COUNT(m."sessionId")::int AS "sessions",
        COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present",
        COUNT(CASE WHEN m."status" = 'ABSENT' THEN 1 END)::int AS "absent",
        COUNT(CASE WHEN m."status" = 'LATE' THEN 1 END)::int AS "late",
        COUNT(CASE WHEN m."status" = 'EXCUSED' THEN 1 END)::int AS "excused",
        COUNT(CASE WHEN m."status" IS NULL THEN 1 END)::int AS "noMark"
      FROM roster r
      LEFT JOIN marks m USING ("studentId")
      GROUP BY r."studentId", r."firstName", r."lastName", r."guardianName", r."guardianPhone"
      ORDER BY r."lastName", r."firstName"
    `

    const items = rows.map(r => {
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ')
      const pctPresent = r.sessions > 0 ? Math.round((r.present / r.sessions) * 100) : 0
      return {
        studentId: r.studentId,
        fullName,
        guardianName: r.guardianName ?? '',
        guardianPhone: r.guardianPhone ?? '',
        sessions: r.sessions,
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        noMark: r.noMark,
        pctPresent,
      }
    })

    return new Response(JSON.stringify({ tenantId, classroomId, start, end, items }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('weekly/class-roster error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load class roster' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
