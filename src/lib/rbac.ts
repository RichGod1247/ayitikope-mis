// src/lib/rbac.ts
import { prisma } from '@/lib/prisma'

export const PERMS = {
  CONSENT_VIEW: 'CONSENT_VIEW',
  CONSENT_EDIT: 'CONSENT_EDIT',
  CONSENT_EXPORT: 'CONSENT_EXPORT',
} as const

/**
 * Resolve a "current user" for testing:
 * - Prefer the 'x-user-id' header
 * - Then ?userId= query param
 * - Finally, fall back to the first ACTIVE membership in this tenant (dev-only)
 */
export async function resolveUserIdForTenant(tenantId: string, opts: { req?: Request } = {}): Promise<string | null> {
  const req = opts.req
  let userId: string | null = null

  if (req) {
    const hdr = req.headers.get('x-user-id')?.trim()
    if (hdr) return hdr
    const url = new URL(req.url)
    const qp = url.searchParams.get('userId')?.trim()
    if (qp) return qp
  }

  // DEV fallback: pick any active member in this tenant
  const m = await prisma.membership.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    select: { userId: true },
  })
  userId = m?.userId || null
  return userId
}

/**
 * Throws 403 if the user doesn't have the required permission in the tenant.
 */
export async function requirePermOrThrow(tenantId: string, userId: string, permName: string) {
  if (!tenantId || !userId) throw Object.assign(new Error('Forbidden'), { status: 403 })

  const has = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: 'ACTIVE',
      role: {
        rolePerms: {
          some: {
            permission: { name: permName },
          },
        },
      },
    },
    select: { id: true },
  })

  if (!has) {
    const err = new Error('Forbidden: missing permission ' + permName) as any
    err.status = 403
    throw err
  }
}
