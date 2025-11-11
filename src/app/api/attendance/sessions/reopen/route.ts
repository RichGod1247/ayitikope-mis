// src/app/api/attendance/sessions/reopen/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/attendance/sessions/reopen
 * Body: { tenantId: string, classroomId: string, date: 'YYYY-MM-DD' }
 *
 * Reopens a session that is CLOSED but NOT CERTIFIED:
 *   - isClosed -> false
 *   - closedAt -> null
 * Guardrails:
 *   - If no session exists, 404
 *   - If certifiedAt is set, 409 (cannot reopen certified session)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || '').trim()
    const classroomId = String(body?.classroomId || '').trim()
    const dateStr = String(body?.date || '').trim()

    if (!tenantId || !classroomId || !dateStr) {
      return new Response(JSON.stringify({ error: 'tenantId, classroomId, date are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Find the session for that class/day
    const session = await prisma.attendanceSession.findFirst({
      where: {
        tenantId,
        classroomId,
        date: new Date(dateStr),
      },
      select: {
        id: true,
        isClosed: true,
        closedAt: true,
        certifiedAt: true,
      },
    })

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    if (session.certifiedAt) {
      return new Response(JSON.stringify({ error: 'Session is certified and cannot be reopened' }), {
        status: 409, headers: { 'content-type': 'application/json' },
      })
    }

    // If already open, just return id (idempotent)
    if (!session.isClosed) {
      return new Response(JSON.stringify({ ok: true, sessionId: session.id, message: 'Session already open' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }

    const updated = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { isClosed: false, closedAt: null },
      select: { id: true },
    })

    return new Response(JSON.stringify({ ok: true, sessionId: updated.id }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('sessions/reopen error:', err)
    return new Response(JSON.stringify({ error: 'Failed to reopen session' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
