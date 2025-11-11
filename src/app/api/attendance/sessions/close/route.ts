// src/app/api/attendance/sessions/close/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toUtcMidnight(yyyyMmDd: string): Date {
  // expects YYYY-MM-DD
  return new Date(`${yyyyMmDd}T00:00:00.000Z`)
}

/**
 * POST /api/attendance/sessions/close
 * Body:
 *  - Either { sessionId }
 *  - Or { tenantId, classroomId, date: 'YYYY-MM-DD' }
 *
 * Effect:
 *  - Sets isClosed = true (if not certified already)
 *  - Returns { ok, sessionId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const sessionIdRaw = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const tenantIdRaw  = typeof body?.tenantId === 'string' ? body.tenantId.trim() : ''
    const classIdRaw   = typeof body?.classroomId === 'string' ? body.classroomId.trim() : ''
    const dateRaw      = typeof body?.date === 'string' ? body.date.trim() : ''

    let session:
      | { id: string; isClosed: boolean; certifiedAt: Date | null }
      | null = null

    if (sessionIdRaw) {
      session = await prisma.attendanceSession.findUnique({
        where: { id: sessionIdRaw },
        select: { id: true, isClosed: true, certifiedAt: true },
      })
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404, headers: { 'content-type': 'application/json' },
        })
      }
    } else {
      if (!tenantIdRaw || !classIdRaw || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        return new Response(JSON.stringify({ error: 'Provide sessionId OR (tenantId, classroomId, date: YYYY-MM-DD)' }), {
          status: 400, headers: { 'content-type': 'application/json' },
        })
      }
      const day = toUtcMidnight(dateRaw)
      session = await prisma.attendanceSession.findFirst({
        where: { tenantId: tenantIdRaw, classroomId: classIdRaw, date: day },
        select: { id: true, isClosed: true, certifiedAt: true },
      })
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found for that date' }), {
          status: 404, headers: { 'content-type': 'application/json' },
        })
      }
    }

    // Already certified? Do not allow closing changes.
    if (session.certifiedAt) {
      return new Response(JSON.stringify({ error: 'Session already certified' }), {
        status: 409, headers: { 'content-type': 'application/json' },
      })
    }

    // If already closed, just return ok to keep idempotent.
    if (!session.isClosed) {
      await prisma.attendanceSession.update({
        where: { id: session.id },
        data: { isClosed: true },
        select: { id: true },
      })
    }

    return new Response(JSON.stringify({ ok: true, sessionId: session.id }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('sessions/close error:', err)
    return new Response(JSON.stringify({ error: 'Failed to close session' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
