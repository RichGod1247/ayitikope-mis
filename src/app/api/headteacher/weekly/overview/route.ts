// src/app/api/headteacher/weekly/overview/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/weekly/overview?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns per-class Mon–Fri aggregates:
 *  - totalStudents (current roster)
 *  - sessions{ open, closed, certified }
 *  - presentSum (sum of PRESENT marks over the week)
 *  - presentPct = round( presentSum / (totalStudents * sessionsCount) * 100 ) if sessionsCount>0 else 0
 *
 * Notes:
 * - Uses raw SQL for cross-version stability.
 * - Assumes roster is current; if you later add historical rosters, adjust totals join by date.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))

    if (!tenantId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, start, end are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const rows = await prisma.$queryRaw<
      Array<{
        classroomId: string
        grade: string | null
        arm: string | null
        totalStudents: number
        sessions: number
        openCount: number
        closedCount: number
        certifiedCount: number
        presentSum: number
      }>
    >`
      WITH base AS (
        SELECT
          s."id"                 AS "sessionId",
          s."classroomId"        AS "classroomId",
          s."isClosed"           AS "isClosed",
          s."certifiedAt"        AS "certifiedAt"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      per_class AS (
        SELECT
          c."id" AS "classroomId",
          c."grade",
          c."arm",
          COUNT(st."id")::int AS "totalStudents"
        FROM "edulife_os"."Classroom" c
        LEFT JOIN "edulife_os"."Student" st ON st."classroomId" = c."id"
        WHERE c."tenantId" = ${tenantId}
        GROUP BY c."id", c."grade", c."arm"
      ),
      session_counts AS (
        SELECT
          b."classroomId",
          COUNT(*)::int AS "sessions",
          COUNT(CASE WHEN b."certifiedAt" IS NOT NULL THEN 1 END)::int AS "certifiedCount",
          COUNT(CASE WHEN b."certifiedAt" IS NULL AND b."isClosed" = true THEN 1 END)::int AS "closedCount",
          COUNT(CASE WHEN b."isClosed" = false OR b."isClosed" IS NULL THEN 1 END)::int AS "openCount"
        FROM base b
        GROUP BY b."classroomId"
      ),
      present_counts AS (
        SELECT
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "presentSum"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = b."sessionId"
        GROUP BY b."classroomId"
      )
      SELECT
        pc."classroomId",
        pc."grade",
        pc."arm",
        COALESCE(pc."totalStudents", 0) AS "totalStudents",
        COALESCE(sc."sessions", 0) AS "sessions",
        COALESCE(sc."openCount", 0) AS "openCount",
        COALESCE(sc."closedCount", 0) AS "closedCount",
        COALESCE(sc."certifiedCount", 0) AS "certifiedCount",
        COALESCE(pr."presentSum", 0) AS "presentSum"
      FROM per_class pc
      LEFT JOIN session_counts sc ON sc."classroomId" = pc."classroomId"
      LEFT JOIN present_counts pr ON pr."classroomId" = pc."classroomId"
      ORDER BY pc."grade" NULLS LAST, pc."arm" NULLS LAST
    `

    const items = rows.map(r => {
      const label = r.grade ? (r.arm ? `${r.grade}${r.arm}` : r.grade) : (r.arm ?? '')
      const denom = r.totalStudents * r.sessions
      const presentPct = denom > 0 ? Math.round((r.presentSum / denom) * 100) : 0
      return {
        classroomId: r.classroomId,
        label,
        totalStudents: r.totalStudents,
        sessions: r.sessions,
        openCount: r.openCount,
        closedCount: r.closedCount,
        certifiedCount: r.certifiedCount,
        presentSum: r.presentSum,
        presentPct,
      }
    })

    // sort worst -> best by presentPct, then by label
    items.sort((a, b) => (a.presentPct - b.presentPct) || a.label.localeCompare(b.label))

    const summary = {
      classes: items.length,
      sessions: items.reduce((n, x) => n + x.sessions, 0),
      open: items.reduce((n, x) => n + x.openCount, 0),
      closed: items.reduce((n, x) => n + x.closedCount, 0),
      certified: items.reduce((n, x) => n + x.certifiedCount, 0),
      avgPresentPct: items.length
        ? Math.round(items.reduce((n, x) => n + x.presentPct, 0) / items.length)
        : 0,
    }

    return new Response(JSON.stringify({ tenantId, start, end, items, summary }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('weekly/overview error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load weekly overview' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
