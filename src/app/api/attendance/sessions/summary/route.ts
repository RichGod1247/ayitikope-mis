import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toUtcMidnight(dateLike: string | Date): Date {
  const d = new Date(dateLike)
  if (isNaN(d.getTime())) throw new Error('Invalid date')
  const iso = d.toISOString().slice(0, 10)
  return new Date(`${iso}T00:00:00.000Z`)
}

/**
 * GET /api/attendance/sessions/summary?tenantId=&classroomId=&date=
 * Returns one-day summary + button flags.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const tenantId = (url.searchParams.get('tenantId') ?? '').trim()
    const classroomId = (url.searchParams.get('classroomId') ?? '').trim()
    const dateParam = (url.searchParams.get('date') ?? '').trim()

    if (!tenantId || !classroomId || !dateParam) {
      return new Response(
        JSON.stringify({ ok: false, error: 'tenantId, classroomId, date are required' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const day = toUtcMidnight(dateParam)

    const session = await prisma.attendanceSession.findFirst({
      where: { tenantId, classroomId, date: day },
      select: { id: true, isClosed: true, certifiedAt: true, date: true },
    })

    // Always compute student total for the class/day UI
    const totalStudents = await prisma.student.count({ where: { tenantId, classroomId } })

    if (!session) {
      // No session yet; nothing marked.
      return new Response(
        JSON.stringify({
          ok: true,
          session: null,
          totals: { students: totalStudents, marked: 0 },
          breakdown: { present: 0, late: 0, excused: 0, absent: 0, pctPresent: 0 },
          canClose: false,
          canCertify: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const [marked, present, late, excused, absent] = await Promise.all([
      prisma.attendanceMark.count({ where: { sessionId: session.id } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: 'PRESENT' } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: 'LATE' } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: 'EXCUSED' } }),
      prisma.attendanceMark.count({ where: { sessionId: session.id, status: 'ABSENT' } }),
    ])

    const pctPresent =
      totalStudents > 0 ? Math.round((present / totalStudents) * 1000) / 10 : 0

    const isClosed = !!session.isClosed
    const certifiedAt = session.certifiedAt ?? null

    const canClose = !isClosed && marked > 0
    const canCertify = isClosed && marked > 0 && !certifiedAt

    return new Response(
      JSON.stringify({
        ok: true,
        session: { id: session.id, isClosed, certifiedAt },
        totals: { students: totalStudents, marked },
        breakdown: { present, late, excused, absent, pctPresent },
        canClose,
        canCertify,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error('sessions/summary error', err)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to get summary' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
