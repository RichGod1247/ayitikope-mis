// src/app/api/attendance/marks/upsert/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/attendance/marks/upsert
 * Body:
 * {
 *   // Option A: provide sessionId directly
 *   sessionId?: string,
 *
 *   // Option B: or let the API resolve/create the session
 *   tenantId?: string,
 *   classroomId?: string,
 *   date?: string,          // YYYY-MM-DD (midnight UTC will be used)
 *
 *   items: Array<{
 *     studentId: string,
 *     status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
 *     note?: string
 *   }>
 * }
 *
 * Behavior:
 * - If sessionId not provided, resolves by (tenantId, classroomId, date).
 *   If none exists, it auto-creates an OPEN session for that date/class.
 * - Refuses to write if the session is CLOSED.
 * - Upserts one AttendanceMark per (sessionId, studentId).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    let sessionId: string | undefined = typeof body?.sessionId === 'string' ? body.sessionId.trim() : undefined
    const tenantId: string | undefined = typeof body?.tenantId === 'string' ? body.tenantId.trim() : undefined
    const classroomId: string | undefined = typeof body?.classroomId === 'string' ? body.classroomId.trim() : undefined
    const dateStr: string | undefined =
      typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined

    const items: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; note?: string }> =
      Array.isArray(body?.items) ? body.items : []

    if (!items.length) {
      return new Response(JSON.stringify({ error: 'No items to upsert' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Resolve/create session if not provided
    let session: {
      id: string
      isClosed: boolean
    } | null = null

    if (!sessionId) {
      if (!tenantId || !classroomId || !dateStr) {
        return new Response(JSON.stringify({ error: 'sessionId is required OR (tenantId, classroomId, date)' }), {
          status: 400, headers: { 'content-type': 'application/json' },
        })
      }
      const dateISO = new Date(`${dateStr}T00:00:00.000Z`)

      // Try to find an existing session for that day/class
      session = await prisma.attendanceSession.findFirst({
        where: { tenantId, classroomId, date: dateISO },
        select: { id: true, isClosed: true },
      })

      // Auto-create an OPEN session if none exists
      if (!session) {
        session = await prisma.attendanceSession.create({
          data: {
            tenantId,
            classroomId,
            date: dateISO,
            isClosed: false,
          },
          select: { id: true, isClosed: true },
        })
      }

      sessionId = session.id
    } else {
      // Load session state if sessionId was provided
      session = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        select: { id: true, isClosed: true },
      })
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404, headers: { 'content-type': 'application/json' },
        })
      }
    }

    // Gate writes if closed
    if (session.isClosed) {
      return new Response(JSON.stringify({ error: 'Session is closed. Reopen the session to edit marks.' }), {
        status: 409, headers: { 'content-type': 'application/json' },
      })
    }

    // Upsert each mark using the named compound unique key from Prisma:
    // @@unique([sessionId, studentId], name: "session_student_unique")
    let upserted = 0
    for (const it of items) {
      const studentId = String(it?.studentId || '').trim()
      const status = String(it?.status || '').toUpperCase()
      if (!studentId) continue
      if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) continue

      await prisma.attendanceMark.upsert({
        where: { session_student_unique: { sessionId, studentId } },
        update: {
          status: status as any,
          note: typeof it.note === 'string' ? it.note : undefined,
        },
        create: {
          sessionId,
          studentId,
          status: status as any,
          note: typeof it.note === 'string' ? it.note : undefined,
        },
        select: { id: true },
      })
      upserted++
    }

    return new Response(JSON.stringify({ ok: true, sessionId, upserted }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('attendance/marks/upsert error:', err)
    return new Response(JSON.stringify({ error: 'Internal error saving marks' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
