// app/api/attendance/sessions/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AttendanceStatus } from '@prisma/client'

function zDate(s: string) {
  const d = new Date(s)
  if (isNaN(d.getTime())) throw new Error('Bad date')
  return d
}

function startOfDayISO(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

function defaultFromTo(): { from: Date; to: Date } {
  // last 14 days window by default
  const now = new Date()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z')
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - 14)
  return { from, to: today }
}

/**
 * GET /api/attendance/sessions/list?tenantId=...&classroomId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns array of sessions with aggregated counts for each day.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const classroomId = String(searchParams.get('classroomId') || '').trim()
    const fromStr = String(searchParams.get('from') || '').trim()
    const toStr = String(searchParams.get('to') || '').trim()

    if (!tenantId || !classroomId) {
      return new Response(JSON.stringify({ error: 'tenantId and classroomId are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    let from: Date, to: Date
    if (fromStr && toStr) {
      from = startOfDayISO(fromStr)
      to = startOfDayISO(toStr)
      if (to < from) [from, to] = [to, from]
    } else {
      const d = defaultFromTo()
      from = d.from
      to = d.to
    }

    // Get sessions in range for class
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId,
        classroomId,
        date: {
          gte: from,
          lte: new Date(to.getTime() + 24 * 3600 * 1000 - 1), // end of 'to' day
        },
      },
      select: { id: true, date: true },
      orderBy: { date: 'desc' },
    })

    if (!sessions.length) {
      return Response.json({ sessions: [] })
    }

    // Count enrolled students (denominator)
    const total = await prisma.student.count({ where: { tenantId, classroomId } })

    // For each session, group marks by status
    const results = []
    for (const s of sessions) {
      const groups = await prisma.attendanceMark.groupBy({
        by: ['status'],
        where: { sessionId: s.id },
        _count: { _all: true },
      })

      const counts: Record<AttendanceStatus, number> = {
        PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0,
      }
      for (const g of groups) {
        counts[g.status as AttendanceStatus] = g._count._all
      }
      const pctPresent = total ? Math.round((counts.PRESENT / total) * 100) : 0

      results.push({
        sessionId: s.id,
        date: s.date.toISOString(),
        total,
        present: counts.PRESENT,
        absent: counts.ABSENT,
        late: counts.LATE,
        excused: counts.EXCUSED,
        pctPresent,
      })
    }

    return Response.json({ sessions: results })
  } catch (err: any) {
    console.error('List sessions error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list sessions' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
