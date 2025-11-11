import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || '').trim()
    const userId   = String(body?.userId   || '').trim()

    if (!tenantId || !userId) {
      return new Response(JSON.stringify({ error: 'tenantId and userId are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'TEACHER_HEALTH_SMS_OPT_IN',
        resource: 'TeacherHealthWeekly',
        resourceId: 'global',
        metadata: { note: 'Dev helper opt-in' },
      },
    })

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e:any) {
    console.error('opt-in error', e)
    return new Response(JSON.stringify({ error: 'failed to opt-in' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
