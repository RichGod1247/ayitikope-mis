// src/app/api/consent/teachers/update/route.ts
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/consent/teachers/update?actorId=USER_ID (actorId optional; can also be in body.actorId)
 * Body:
 * {
 *   userId: string,
 *   smsOptIn: boolean,
 *   actorId?: string
 * }
 *
 * - Updates User.smsOptIn
 * - Writes AuditLog with before/after (action: CONSENT_TEACHER_UPDATE)
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const actorIdFromQuery = url.searchParams.get('actorId')?.trim() || undefined

    const body = await req.json().catch(() => ({} as any))
    const userId: string | undefined = typeof body?.userId === 'string' ? body.userId.trim() : undefined
    const hasSmsOptIn = typeof body?.smsOptIn === 'boolean'
    const smsOptIn: boolean | undefined = hasSmsOptIn ? Boolean(body.smsOptIn) : undefined
    const actorId: string | undefined =
      (typeof body?.actorId === 'string' ? body.actorId.trim() : undefined) || actorIdFromQuery

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    if (!hasSmsOptIn) {
      return new Response(JSON.stringify({ error: 'smsOptIn (boolean) is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, smsOptIn: true, name: true, email: true },
    })
    if (!current) {
      return new Response(JSON.stringify({ error: 'Teacher not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { smsOptIn },
      select: { id: true, smsOptIn: true, name: true, email: true },
    })

    // Best-effort audit
    try {
      await prisma.auditLog.create({
        data: {
          // teacher belongs to a tenant via Membership, but we may not have tenantId here;
          // leave null to keep schema happy, or extend to look it up if you prefer.
          tenantId: null,
          userId: actorId || null,
          action: 'CONSENT_TEACHER_UPDATE',
          resource: 'User',
          resourceId: updated.id,
          metadata: {
            actorId: actorId || null,
            teacher: { id: updated.id, name: updated.name, email: updated.email },
            before: { smsOptIn: current.smsOptIn },
            after:  { smsOptIn: updated.smsOptIn },
          } as any,
        },
      })
    } catch (e) {
      console.warn('audit write failed (non-fatal):', e)
    }

    return new Response(JSON.stringify({ ok: true, user: updated }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/teachers/update error:', err)
    return new Response(JSON.stringify({ error: 'Failed to update teacher consent' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
