// src/app/api/consent/teachers/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * RBAC rule:
 * - If `userId` is provided, the caller must have CONSENT_VIEW (or EDIT/EXPORT) in this tenant.
 * - If `userId` is omitted, we allow (soft dev fallback) so the UI keeps working while wiring auth.
 */
async function ensureConsentViewIfUserProvided(tenantId: string, maybeUserId?: string | null) {
  const userId = (maybeUserId || '').trim()
  if (!userId) return true // soft dev fallback

  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: 'ACTIVE' },
    select: {
      role: {
        select: {
          rolePerms: { select: { permission: { select: { name: true } } } },
        },
      },
    },
  })
  if (!m?.role) return false
  const names = new Set(m.role.rolePerms.map(rp => rp.permission.name))
  return (
    names.has('CONSENT_VIEW') ||
    names.has('CONSENT_EDIT') ||
    names.has('CONSENT_EXPORT')
  )
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

    const ok = await ensureConsentViewIfUserProvided(tenantId, userId)
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Forbidden: missing CONSENT_VIEW' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Pull active members in this tenant and project their users.
    // (This avoids earlier RAW SQL typing issues.)
    const memberships = await prisma.membership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            smsOptIn: true, // from User model
          },
        },
      },
      take: 2000,
    })

    // De-dup users in case a person holds multiple roles (defensive)
    const dedup = new Map<string, { id: string; name: string | null; email: string | null; smsOptIn: boolean }>()
    for (const m of memberships) {
      if (!m.user) continue
      dedup.set(m.user.id, {
        id: m.user.id,
        name: m.user.name ?? null,
        email: m.user.email ?? null,
        smsOptIn: !!m.user.smsOptIn,
      })
    }

    // Sort by name then email for stable UI
    const items = Array.from(dedup.values()).sort((a, b) => {
      const an = (a.name || '').toLowerCase()
      const bn = (b.name || '').toLowerCase()
      if (an !== bn) return an < bn ? -1 : 1
      const ae = (a.email || '').toLowerCase()
      const be = (b.email || '').toLowerCase()
      if (ae !== be) return ae < be ? -1 : 1
      return 0
    })

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/teachers/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list teachers' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
