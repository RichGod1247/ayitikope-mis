// src/app/api/headteacher/student/detail/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/student/detail?tenantId=...&studentId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns per-day marks for the student across Mon–Fri:
 *  - date, status (PRESENT/ABSENT/LATE/EXCUSED/NO_MARK), note
 * Also returns profile meta (name, guardian) and summary counts/pct.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const studentId = String(searchParams.get('studentId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))

    if (!tenantId || !studentId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, studentId, start, end are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const rows = await prisma.$queryRaw<
      Array<{
        date: string
        status: 'PRESENT'|'ABSENT'|'LATE'|'EXCUSED'|null
        note: string | null
        firstName: string
        lastName: string
        guardianName: string | null
        guardianPhone: string | null
      }>
    >`
      WITH stu AS (
        SELECT st."id" AS "studentId", st."firstName", st."lastName", st."guardianName", st."guardianPhone", st."classroomId"
        FROM "edulife_os"."Student" st
        WHERE st."tenantId" = ${tenantId} AND st."id" = ${studentId}
        LIMIT 1
      ),
      sessions AS (
        SELECT s."id" AS "sessionId", s."date"::date::text AS "date"
        FROM "edulife_os"."AttendanceSession" s
        JOIN stu ON stu."classroomId" = s."classroomId"
        WHERE s."tenantId" = ${tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      )
      SELECT
        se."date",
        m."status"::text::"edulife_os"."AttendanceStatus" AS "status",
        m."note",
        (SELECT "firstName" FROM stu) AS "firstName",
        (SELECT "lastName" FROM stu)  AS "lastName",
        (SELECT "guardianName" FROM stu)  AS "guardianName",
        (SELECT "guardianPhone" FROM stu) AS "guardianPhone"
      FROM sessions se
      LEFT JOIN "edulife_os"."AttendanceMark" m
        ON m."sessionId" = se."sessionId" AND m."studentId" = ${studentId}
      ORDER BY se."date"::date ASC
    `

    const items = rows.map(r => ({
      date: r.date,
      status: (r.status ?? 'NO_MARK') as 'PRESENT'|'ABSENT'|'LATE'|'EXCUSED'|'NO_MARK',
      note: r.note ?? '',
    }))

    const counts = {
      sessions: rows.length,
      present: items.filter(i => i.status === 'PRESENT').length,
      absent: items.filter(i => i.status === 'ABSENT').length,
      late: items.filter(i => i.status === 'LATE').length,
      excused: items.filter(i => i.status === 'EXCUSED').length,
      noMark: items.filter(i => i.status === 'NO_MARK').length,
    }
    const pctPresent = counts.sessions > 0 ? Math.round((counts.present / counts.sessions) * 100) : 0

    const meta = {
      tenantId, studentId, start, end,
      fullName: [rows[0]?.firstName, rows[0]?.lastName].filter(Boolean).join(' ') || '',
      guardianName: rows[0]?.guardianName ?? '',
      guardianPhone: rows[0]?.guardianPhone ?? '',
      ...counts, pctPresent,
    }

    return new Response(JSON.stringify({ meta, items }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('student/detail error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load student detail' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
