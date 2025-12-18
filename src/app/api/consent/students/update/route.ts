// src/app/api/consent/students/update/route.ts
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/consent/students/update?actorId=USER_ID (actorId optional; can also be in body.actorId)
 * Body:
 * {
 *   studentId: string,
 *   smsOptIn?: boolean,              // maps to Student.guardianSmsOptIn
 *   healthConsentAt?: string | null, // ISO string to set/clear; if omitted we keep previous
 *   actorId?: string                 // optional duplicate of query param
 * }
 *
 * Behavior:
 * - Loads the student (tenantId, guardianSmsOptIn, healthConsentAt).
 * - Applies provided changes.
 * - Upserts the student fields.
 * - Writes an AuditLog row with before/after snapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const actorIdFromQuery = url.searchParams.get('actorId')?.trim() || undefined

    const body = await req.json().catch(() => ({} as any))

    const studentId: string | undefined = typeof body?.studentId === 'string' ? body.studentId.trim() : undefined
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const actorId: string | undefined =
      (typeof body?.actorId === 'string' ? body.actorId.trim() : undefined) || actorIdFromQuery

    const hasSmsOptIn = typeof body?.smsOptIn === 'boolean'
    const smsOptIn: boolean | undefined = hasSmsOptIn ? Boolean(body.smsOptIn) : undefined

    let healthConsentAt: Date | null | undefined
    if (body?.hasOwnProperty('healthConsentAt')) {
      if (body.healthConsentAt === null) {
        healthConsentAt = null
      } else if (typeof body.healthConsentAt === 'string' && body.healthConsentAt.trim()) {
        const d = new Date(body.healthConsentAt)
        if (!isNaN(d.getTime())) healthConsentAt = d
        else healthConsentAt = undefined // ignore invalid date
      } else {
        healthConsentAt = undefined // no change
      }
    } else {
      healthConsentAt = undefined // no change
    }

    // Load current student
    const current = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    })

    if (!current) {
      return new Response(JSON.stringify({ error: 'Student not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Prepare update data (only set fields provided)
    const data: Record<string, any> = {}
    if (hasSmsOptIn) data.guardianSmsOptIn = smsOptIn
    if (healthConsentAt !== undefined) data.healthConsentAt = healthConsentAt

    // If nothing to update, still return current (and skip audit)
    if (!Object.keys(data).length) {
      return new Response(JSON.stringify({ ok: true, updated: false, student: current }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data,
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    })

    // Write audit (best-effort; don't fail the request if audit fails)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: actorId || null,
          action: 'CONSENT_STUDENT_UPDATE',
          resource: 'Student',
          resourceId: updated.id,
          metadata: {
            actorId: actorId || null,
            before: {
              guardianSmsOptIn: current.guardianSmsOptIn,
              healthConsentAt: current.healthConsentAt,
            },
            after: {
              guardianSmsOptIn: updated.guardianSmsOptIn,
              healthConsentAt: updated.healthConsentAt,
            },
          } as any,
        },
      })
    } catch (e) {
      console.warn('audit write failed (non-fatal):', e)
    }

    return new Response(JSON.stringify({ ok: true, updated: true, student: updated }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/students/update error:', err)
    return new Response(JSON.stringify({ error: 'Failed to update student consent' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
