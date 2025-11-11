// src/app/api/headteacher/export-csv-range/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * GET /api/headteacher/export-csv-range?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns a CSV covering Mon–Fri (or any range you pass).
 * Columns: Date, Class, Present, Total, %Present, State
 *
 * State:
 *  - OPEN: session exists and not closed
 *  - CLOSED: closed but not certified
 *  - CERTIFIED: certifiedAt not null
 *
 * Note: Uses raw SQL for stability across Prisma client versions.
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

    // Pull sessions + roster + presents for the range
    const rows = await prisma.$queryRaw<
      Array<{
        date: string
        classroomId: string
        grade: string | null
        arm: string | null
        total: number
        present: number
        isClosed: boolean | null
        certifiedAt: string | null
      }>
    >`
      WITH base AS (
        SELECT
          s."date"::date::text AS "date",
          s."id"               AS "sessionId",
          s."isClosed"         AS "isClosed",
          s."certifiedAt"::text AS "certifiedAt",
          c."id"               AS "classroomId",
          c."grade"            AS "grade",
          c."arm"              AS "arm"
        FROM "edulife_os"."AttendanceSession" s
        JOIN "edulife_os"."Classroom" c
          ON c."id" = s."classroomId" AND c."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      totals AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(st."id")::int AS "total"
        FROM base b
        JOIN "edulife_os"."Student" st
          ON st."classroomId" = b."classroomId"
        GROUP BY b."date", b."classroomId"
      ),
      presents AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = b."sessionId"
        GROUP BY b."date", b."classroomId"
      )
      SELECT
        b."date",
        b."classroomId",
        b."grade",
        b."arm",
        COALESCE(t."total", 0) AS "total",
        COALESCE(p."present", 0) AS "present",
        b."isClosed",
        b."certifiedAt"
      FROM base b
      LEFT JOIN totals t USING ("date","classroomId")
      LEFT JOIN presents p USING ("date","classroomId")
      ORDER BY b."date"::date ASC, b."grade" NULLS LAST, b."arm" NULLS LAST
    `

    // Build CSV
    const header = ['Date','Class','Present','Total','%Present','State']
    const lines = [header.map(csvEscape).join(',')]

    for (const r of rows) {
      const label = r.grade ? (r.arm ? `${r.grade}${r.arm}` : r.grade) : (r.arm ?? '')
      const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0
      const state = r.certifiedAt ? 'CERTIFIED' : (r.isClosed ? 'CLOSED' : 'OPEN')
      const row = [
        r.date,
        label,
        String(r.present),
        String(r.total),
        String(pct),
        state,
      ]
      lines.push(row.map(csvEscape).join(','))
    }

    const csv = lines.join('\n')
    const filename = `attendance_${start}_to_${end}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    console.error('export-csv-range error:', err)
    return new Response('Failed to export CSV', { status: 500 })
  }
}
