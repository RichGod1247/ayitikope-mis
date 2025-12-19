import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/consent/optin/student
 * Body:
 * {
 *   tenantId: string,
 *   studentId: string,
 *   actorId?: string,              // optional (who performed the opt-in)
 *   setConsentNow?: boolean        // if true, sets healthConsentAt = now()
 * }
 *
 * Behavior:
 * - Sets Student.guardianSmsOptIn = true
 * - Optionally bumps healthConsentAt to now (if setConsentNow === true)
 * - Writes AuditLog with action="CONSENT_STUDENT_OPTIN" (before/after snapshot)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId: string | undefined = typeof body?.tenantId === 'string' ? body.tenantId.trim() : undefined
    const studentId: string | undefined = typeof body?.studentId === 'string' ? body.studentId.trim() : undefined
    const actorId: string | undefined = typeof body?.actorId === 'string' ? body.actorId.trim() : undefined
    const setConsentNow: boolean = Boolean(body?.setConsentNow)

    if (!tenantId || !studentId) {
      return new Response(JSON.stringify({ error: 'tenantId and studentId are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Load current state for audit "before"
    const before = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    })

    if (!before) {
      return new Response(JSON.stringify({ error: 'Student not found for tenant' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    // Prepare update
    const data: any = { guardianSmsOptIn: true }
    if (setConsentNow) data.healthConsentAt = new Date()

    const updated = await prisma.student.update({
      where: { id: studentId },
      data,
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    })

    // Write audit
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId || null,
        action: 'CONSENT_STUDENT_OPTIN',
        resource: 'STUDENT',
        resourceId: studentId,
        metadata: {
          before: {
            healthConsentAt: before.healthConsentAt,
            guardianSmsOptIn: before.guardianSmsOptIn,
          },
          after: {
            healthConsentAt: updated.healthConsentAt,
            guardianSmsOptIn: updated.guardianSmsOptIn,
          },
        },
      },
    })

    return new Response(JSON.stringify({ ok: true, student: updated }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('optin/student error:', err)
    return new Response(JSON.stringify({ error: 'Failed to opt-in student' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
