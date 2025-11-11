// src/app/api/headteacher/day/overview/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/headteacher/day/overview?tenantId=...&date=YYYY-MM-DD
 * Returns all classrooms for the tenant, with their attendance session status for the date.
 * Status: NO_SESSION | OPEN | CLOSED | CERTIFIED
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const dateRaw = String(searchParams.get('date') || '').trim()
    const date = toISODateOnly(dateRaw) ?? new Date().toISOString().slice(0, 10)

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Pull all classrooms for tenant and left-join AttendanceSession for the given date.
    // Using raw SQL keeps us safe when Prisma types lag behind DB columns.
    const rows = await prisma.$queryRaw<
      Array<{
        classroomId: string
        classGrade: string | null
        classArm: string | null
        sessionId: string | null
        isClosed: boolean | null
        closedAt: Date | null
        certifiedAt: Date | null
      }>
    >`
      SELECT
        c."id"         AS "classroomId",
        c."grade"      AS "classGrade",
        c."arm"        AS "classArm",
        s."id"         AS "sessionId",
        s."isClosed"   AS "isClosed",
        s."closedAt"   AS "closedAt",
        s."certifiedAt" AS "certifiedAt"
      FROM "edulife_os"."Classroom" c
      LEFT JOIN "edulife_os"."AttendanceSession" s
        ON s."classroomId" = c."id"
       AND s."tenantId" = c."tenantId"
       AND s."date"::date = ${date}::date
      WHERE c."tenantId" = ${tenantId}
      ORDER BY c."grade" NULLS LAST, c."arm" NULLS LAST
    `

    const items = rows.map(r => {
      const label = r.classGrade ? (r.classArm ? `${r.classGrade}${r.classArm}` : r.classGrade) : (r.classArm ?? '')
      let status: 'NO_SESSION' | 'OPEN' | 'CLOSED' | 'CERTIFIED' = 'NO_SESSION'
      if (r.sessionId) {
        if (r.certifiedAt) status = 'CERTIFIED'
        else if (r.isClosed) status = 'CLOSED'
        else status = 'OPEN'
      }
      return {
        classroomId: r.classroomId,
        label,
        sessionId: r.sessionId,
        status,
        closedAt: r.closedAt,
        certifiedAt: r.certifiedAt
      }
    })

    // Summary counts
    const summary = items.reduce(
      (acc, it) => {
        acc.total++
        acc[it.status]++
        return acc
      },
      { total: 0, NO_SESSION: 0, OPEN: 0, CLOSED: 0, CERTIFIED: 0 }
    )

    return new Response(JSON.stringify({ tenantId, date, items, summary }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('headteacher/day/overview error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load day overview' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}

function toISODateOnly(input?: string): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
