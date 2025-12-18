// src/app/api/consent/students/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * RBAC: If `userId` is provided, enforce that user has CONSENT_VIEW in the given tenant.
 * If `userId` is omitted (dev mode / soft fallback), we DO NOT block — this keeps your UI working
 * while you’re wiring user context. In prod, always pass userId from session.
 */
async function ensureConsentViewIfUserProvided(tenantId: string, maybeUserId?: string | null) {
  const userId = (maybeUserId || '').trim()
  if (!userId) return true // soft dev fallback

  // Must have active membership in tenant
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: 'ACTIVE' },
    select: { role: { select: { id: true, rolePerms: { select: { permission: { select: { name: true } } } } } } },
  })
  if (!m?.role) return false

  const names = new Set(m.role.rolePerms.map(rp => rp.permission.name))
  return names.has('CONSENT_VIEW') || names.has('CONSENT_EDIT') || names.has('CONSENT_EXPORT')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const userId = searchParams.get('userId')?.trim() || null // optional (soft dev)

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Enforce RBAC only if userId is provided
    const ok = await ensureConsentViewIfUserProvided(tenantId, userId)
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Forbidden: missing CONSENT_VIEW' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Fetch students for tenant
    const rows = await prisma.student.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        healthConsentAt: true,
        guardianSmsOptIn: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 2000, // safety cap
    })

    // Map to API shape expected by the Consent page
    const items = rows.map(r => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      guardianName: r.guardianName,
      guardianPhone: r.guardianPhone,
      healthConsentAt: r.healthConsentAt ? r.healthConsentAt.toISOString() : null,
      smsOptIn: !!r.guardianSmsOptIn, // UI expects smsOptIn
    }))

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/students/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load students' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
