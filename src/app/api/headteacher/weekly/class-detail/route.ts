// src/app/api/headteacher/weekly/class-detail/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/weekly/class-detail?tenantId=...&classroomId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns one row per day in [start..end] where a session exists:
 *  - date, total, present, pctPresent, state (OPEN|CLOSED|CERTIFIED)
 * Notes:
 *  - Uses raw SQL for cross-version stability.
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
        date: string
        total: number
        present: number
        isClosed: boolean | null
        certifiedAt: string | null
        classLabel: string
      }>
    >`
      WITH base AS (
        SELECT
          s."id"                AS "sessionId",
          s."date"::date::text  AS "date",
          s."isClosed"          AS "isClosed",
          s."certifiedAt"::text AS "certifiedAt"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."classroomId" = ${classroomId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      totals AS (
        SELECT COUNT(st."id")::int AS "total"
        FROM "edulife_os"."Student" st
        WHERE st."classroomId" = ${classroomId}
      ),
      presents AS (
        SELECT
          b."date",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = b."sessionId"
        GROUP BY b."date"
      ),
      label AS (
        SELECT
          CASE
            WHEN c."grade" IS NOT NULL AND c."arm" IS NOT NULL THEN (c."grade" || c."arm")
            WHEN c."grade" IS NOT NULL THEN c."grade"
            ELSE COALESCE(c."arm",'')
          END AS "classLabel"
        FROM "edulife_os"."Classroom" c
        WHERE c."id" = ${classroomId} AND c."tenantId" = ${tenantId}
        LIMIT 1
      )
      SELECT
        b."date",
        (SELECT "total" FROM totals)        AS "total",
        COALESCE(p."present", 0)            AS "present",
        b."isClosed",
        b."certifiedAt",
        (SELECT "classLabel" FROM label)    AS "classLabel"
      FROM base b
      LEFT JOIN presents p USING ("date")
      ORDER BY b."date"::date ASC
    `

    const items = rows.map(r => {
      const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0
      const state = r.certifiedAt ? 'CERTIFIED' : (r.isClosed ? 'CLOSED' : 'OPEN')
      return { date: r.date, total: r.total, present: r.present, pctPresent: pct, state }
    })

    const meta = {
      tenantId,
      classroomId,
      classLabel: rows[0]?.classLabel || '',
      start,
      end,
      days: items.length,
      avgPctPresent: items.length ? Math.round(items.reduce((n, x) => n + x.pctPresent, 0) / items.length) : 0,
      certified: items.filter(x => x.state === 'CERTIFIED').length,
      closed: items.filter(x => x.state === 'CLOSED').length,
      open: items.filter(x => x.state === 'OPEN').length,
    }

    return new Response(JSON.stringify({ meta, items }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('weekly/class-detail error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load class detail' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
