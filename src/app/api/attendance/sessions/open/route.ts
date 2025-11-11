import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toUtcMidnight(dateLike: string | Date): Date {
  const d = new Date(dateLike)
  if (isNaN(d.getTime())) throw new Error('Invalid date')
  const iso = d.toISOString().slice(0, 10)
  return new Date(`${iso}T00:00:00.000Z`)
}

/**
 * Idempotent "open or get" for a classroom's session on a day.
 * Query params:
 *  - tenantId
 *  - classroomId
 *  - date  (yyyy-mm-dd or parseable)
 *
 * Response mirrors summary shape so UI can refresh buttons immediately:
 * {
 *   ok: true,
 *   created: boolean,
 *   session: { id, isClosed, certifiedAt },
 *   totals: { students, marked },
 *   canClose: boolean,
 *   canCertify: boolean
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const url = new URL(req.url)
    const tenantId = (body.tenantId ?? url.searchParams.get('tenantId') ?? '').trim()
    const classroomId = (body.classroomId ?? url.searchParams.get('classroomId') ?? '').trim()
    const dateParam = (body.date ?? url.searchParams.get('date') ?? '').trim()

    if (!tenantId || !classroomId || !dateParam) {
      return new Response(
        JSON.stringify({ ok: false, error: 'tenantId, classroomId, date are required' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    }

    const day = toUtcMidnight(dateParam)

    // 1) Look first (avoid unique-violation noise)
    let session = await prisma.attendanceSession.findFirst({
      where: { tenantId, classroomId, date: day },
      select: { id: true, isClosed: true, certifiedAt: true },
    })

    let created = false

    // 2) Create only if missing
    if (!session) {
      const createdRow = await prisma.attendanceSession.create({
        data: {
          tenantId,
          classroomId,
          date: day,
          // isClosed defaults false; certifiedAt null
        },
        select: { id: true, isClosed: true, certifiedAt: true },
      })
      session = createdRow
      created = true
    }

    // 3) Compute totals + enable flags (same rules as /summary)
    const [totalStudents, marked] = await Promise.all([
      prisma.student.count({ where: { tenantId, classroomId } }),
      prisma.attendanceMark.count({ where: { sessionId: session!.id } }),
    ])

    const isClosed = session!.isClosed ?? false
    const certifiedAt = session!.certifiedAt ?? null
    const canClose = !isClosed && marked > 0
    const canCertify = isClosed && marked > 0 && !certifiedAt

    return new Response(
      JSON.stringify({
        ok: true,
        created,
        session,
        totals: { students: totalStudents, marked },
        canClose,
        canCertify,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    console.error('sessions/open error', err)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to open session' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
