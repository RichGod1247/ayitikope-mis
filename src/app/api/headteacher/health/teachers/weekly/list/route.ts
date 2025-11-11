// src/app/api/headteacher/health/teachers/weekly/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * GET /api/headteacher/health/teachers/weekly/list?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns TeacherHealthWeekly rows (joined with user display) for a date range.
 * - `weekStart` should be the Monday (UTC). We query inclusive between start..end.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const start = toISODateOnly(searchParams.get('start'))
    const end = toISODateOnly(searchParams.get('end'))

    if (!tenantId || !start || !end) {
      return new Response(JSON.stringify({ error: 'tenantId, start, end are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const rows = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId,
        weekStart: {
          gte: new Date(`${start}T00:00:00.000Z`),
          lte: new Date(`${end}T23:59:59.999Z`),
        },
      },
      orderBy: [{ weekStart: 'desc' }, { userId: 'asc' }],
      select: {
        id: true,
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    return new Response(JSON.stringify({ tenantId, start, end, items: rows }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('teachers/weekly/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load teacher weekly health' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
