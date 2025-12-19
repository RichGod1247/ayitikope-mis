import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/consent/optin/teacher
 * Body:
 * {
 *   tenantId: string,
 *   userId: string,                 // teacher's user id
 *   actorId?: string                // who performed the opt-in (optional)
 * }
 *
 * Behavior:
 * - Sets User.smsOptIn = true
 * - (Optional) Verifies membership exists for (userId, tenantId) — non-blocking
 * - Writes AuditLog with action="CONSENT_TEACHER_OPTIN" and before/after snapshot
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId: string | undefined = typeof body?.tenantId === 'string' ? body.tenantId.trim() : undefined
    const userId: string | undefined = typeof body?.userId === 'string' ? body.userId.trim() : undefined
    const actorId: string | undefined = typeof body?.actorId === 'string' ? body.actorId.trim() : undefined

    if (!tenantId || !userId) {
      return new Response(JSON.stringify({ error: 'tenantId and userId are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Load current state (for audit "before")
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, smsOptIn: true },
    })

    if (!before) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    // Non-blocking sanity check: membership for tenant (if any)
    // We won't fail the request if missing; just continue.
    await prisma.membership.findFirst({
      where: { userId, tenantId, status: 'ACTIVE' },
      select: { id: true },
    }).catch(() => null)

    // Update user smsOptIn
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { smsOptIn: true },
      select: { id: true, name: true, email: true, smsOptIn: true },
    })

    // Audit
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId || null,
        action: 'CONSENT_TEACHER_OPTIN',
        resource: 'USER',           // teachers are Users
        resourceId: userId,
        metadata: {
          before: { smsOptIn: before.smsOptIn },
          after:  { smsOptIn: updated.smsOptIn },
          target: { id: updated.id, name: updated.name, email: updated.email },
        },
      },
    })

    return new Response(JSON.stringify({ ok: true, user: updated }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('optin/teacher error:', err)
    return new Response(JSON.stringify({ error: 'Failed to opt-in teacher' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
