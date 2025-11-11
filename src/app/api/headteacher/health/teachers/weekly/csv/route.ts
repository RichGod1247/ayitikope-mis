// src/app/api/headteacher/health/teachers/weekly/csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  const raw = String(s)
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

/**
 * GET /api/headteacher/health/teachers/weekly/csv?tenantId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Streams a CSV of TeacherHealthWeekly entries within [start..end] (inclusive).
 * Columns: weekStart (UTC), teacherName, teacherEmail, stressLevel, workload, comments
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

    const rows = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId,
        weekStart: {
          gte: new Date(`${start}T00:00:00.000Z`),
          lte: new Date(`${end}T23:59:59.999Z`),
        },
      },
      orderBy: [{ weekStart: 'asc' }, { userId: 'asc' }],
      select: {
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: { select: { name: true, email: true } },
      },
    })

    const header = [
      'weekStart(UTC)',
      'teacherName',
      'teacherEmail',
      'stressLevel(1-5)',
      'workload(1-5)',
      'comments',
    ]

    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push([
        csvEscape(r.weekStart.toISOString().slice(0, 10)),
        csvEscape(r.user?.name ?? ''),
        csvEscape(r.user?.email ?? ''),
        csvEscape(r.stressLevel),
        csvEscape(r.workload),
        csvEscape(r.comments ?? ''),
      ].join(','))
    }

    const csv = lines.join('\n')
    const filename = `teachers_weekly_health_${tenantId}_${start}_to_${end}.csv`
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    console.error('teachers/weekly/csv error:', err)
    return new Response('Failed to generate CSV', { status: 500 })
  }
}
