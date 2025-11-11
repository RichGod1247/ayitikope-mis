// src/app/api/headteacher/anomalies/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/anomalies?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD&threshold=80
 * Returns list of (date, class, present%, counts) where present% < threshold.
 * Notes:
 * - Includes days with a session (computed from marks). If a session exists but no marks, present%=0.
 * - Uses raw SQL for stability across client versions.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))
    const threshold = Math.max(0, Math.min(100, Number(searchParams.get('threshold') ?? 80)))

    if (!tenantId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, start, end are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Pull class/day totals and present counts.
    // present = count of marks with status='PRESENT'
    // total   = enrolled students in the classroom (on that day we use current roster)
    // If you later add historical rosters, swap the total source accordingly.
    const rows = await prisma.$queryRaw<
      Array<{
        date: string
        classroomId: string
        classGrade: string | null
        classArm: string | null
        total: number
        present: number
        isClosed: boolean | null
        certifiedAt: string | null
      }>
    >`
      WITH base AS (
        SELECT
          s."date"::date::text             AS "date",
          c."id"                           AS "classroomId",
          c."grade"                         AS "classGrade",
          c."arm"                           AS "classArm",
          s."id"                            AS "sessionId",
          s."isClosed"                      AS "isClosed",
          s."certifiedAt"::text             AS "certifiedAt"
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
        JOIN "edulife_os"."Student" st ON st."classroomId" = b."classroomId"
        GROUP BY b."date", b."classroomId"
      ),
      presents AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = b."sessionId"
        GROUP BY b."date", b."classroomId"
      )
      SELECT
        b."date",
        b."classroomId",
        b."classGrade",
        b."classArm",
        COALESCE(t."total", 0) AS "total",
        COALESCE(p."present", 0) AS "present",
        b."isClosed",
        b."certifiedAt"
      FROM base b
      LEFT JOIN totals t USING ("date","classroomId")
      LEFT JOIN presents p USING ("date","classroomId")
      ORDER BY b."date"::date ASC, b."classGrade" NULLS LAST, b."classArm" NULLS LAST
    `

    // Filter by threshold and compute pct
    const anomalies = rows
      .map(r => {
        const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0
        return {
          date: r.date,
          classroomId: r.classroomId,
          classLabel: r.classGrade ? (r.classArm ? `${r.classGrade}${r.classArm}` : r.classGrade) : (r.classArm ?? ''),
          total: r.total,
          present: r.present,
          pctPresent: pct,
          state: r.certifiedAt ? 'CERTIFIED' : (r.isClosed ? 'CLOSED' : 'OPEN'),
        }
      })
      .filter(x => x.pctPresent < threshold)

    return new Response(JSON.stringify({ tenantId, start, end, threshold, items: anomalies }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('headteacher/anomalies error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load anomalies' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
