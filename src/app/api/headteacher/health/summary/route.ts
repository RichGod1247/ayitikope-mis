// src/app/api/headteacher/health/summary/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/health/summary?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD&fever=37.8
 *
 * Returns:
 * {
 *   tenantId, start, end, fever,
 *   totals: { entries, fevers, symptomatic },
 *   byClass: Array<{ classroomId, classLabel, entries, fevers, symptomatic }>,
 *   symptoms: Array<{ name, count }>,
 *   days: Array<{ date, entries, fevers }>
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))
    const fever = Number.isFinite(Number(searchParams.get('fever')))
      ? Number(searchParams.get('fever'))
      : 37.8

    if (!tenantId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, start, end are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // IMPORTANT: serialize queries to avoid P2024 with connection_limit=1
    const rows = await prisma.$queryRaw<Array<{
      classroomId: string
      classGrade: string | null
      classArm: string | null
      entries: number
      fevers: number
      symptomatic: number
    }>>`
      WITH base AS (
        SELECT
          h."classroomId",
          c."grade" AS "classGrade",
          c."arm"   AS "classArm",
          h."temperatureC",
          h."symptoms"
        FROM "edulife_os"."StudentHealthDaily" h
        JOIN "edulife_os"."Classroom" c ON c."id" = h."classroomId"
        WHERE h."tenantId" = ${tenantId}
          AND h."date"::date BETWEEN ${start}::date AND ${end}::date
      )
      SELECT
        "classroomId",
        "classGrade",
        "classArm",
        COUNT(*)::int AS entries,
        COUNT(CASE WHEN "temperatureC" IS NOT NULL AND "temperatureC" >= ${fever} THEN 1 END)::int AS fevers,
        COUNT(CASE WHEN "symptoms" IS NOT NULL AND length(trim("symptoms")) > 0 THEN 1 END)::int AS symptomatic
      FROM base
      GROUP BY "classroomId", "classGrade", "classArm"
      ORDER BY "classGrade" NULLS LAST, "classArm" NULLS LAST
    `

    const symptomRows = await prisma.$queryRaw<Array<{ symptom: string; count: number }>>`
      WITH base AS (
        SELECT
          regexp_split_to_table(
            COALESCE(h."symptoms", ''),
            E'\\s*,\\s*'
          ) AS symptom
        FROM "edulife_os"."StudentHealthDaily" h
        WHERE h."tenantId" = ${tenantId}
          AND h."date"::date BETWEEN ${start}::date AND ${end}::date
      )
      SELECT lower(trim(symptom)) AS symptom, COUNT(*)::int AS count
      FROM base
      WHERE length(trim(symptom)) > 0
      GROUP BY lower(trim(symptom))
      ORDER BY COUNT(*) DESC, symptom ASC
    `

    const dayRows = await prisma.$queryRaw<Array<{ date: string; entries: number; fevers: number }>>`
      WITH base AS (
        SELECT
          h."date"::date::text AS "date",
          h."temperatureC"
        FROM "edulife_os"."StudentHealthDaily" h
        WHERE h."tenantId" = ${tenantId}
          AND h."date"::date BETWEEN ${start}::date AND ${end}::date
      )
      SELECT
        "date",
        COUNT(*)::int AS entries,
        COUNT(CASE WHEN "temperatureC" IS NOT NULL AND "temperatureC" >= ${fever} THEN 1 END)::int AS fevers
      FROM base
      GROUP BY "date"
      ORDER BY "date"::date ASC
    `

    const totals = rows.reduce(
      (acc, r) => {
        acc.entries += r.entries
        acc.fevers += r.fevers
        acc.symptomatic += r.symptomatic
        return acc
      },
      { entries: 0, fevers: 0, symptomatic: 0 }
    )

    const byClass = rows.map(r => ({
      classroomId: r.classroomId,
      classLabel: r.classGrade ? (r.classArm ? `${r.classGrade}${r.classArm}` : r.classGrade) : (r.classArm ?? ''),
      entries: r.entries,
      fevers: r.fevers,
      symptomatic: r.symptomatic,
    }))

    const symptoms = symptomRows.map(s => ({ name: s.symptom, count: s.count }))
    const days = dayRows.map(d => ({ date: d.date, entries: d.entries, fevers: d.fevers }))

    return new Response(JSON.stringify({
      tenantId, start, end, fever,
      totals, byClass, symptoms, days
    }), { status: 200, headers: { 'content-type': 'application/json' } })

  } catch (err: any) {
    console.error('headteacher/health/summary error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load health summary' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
