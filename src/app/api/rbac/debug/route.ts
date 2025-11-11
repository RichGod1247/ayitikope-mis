// src/app/api/rbac/debug/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PERMS } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const userId = searchParams.get('userId')?.trim()

    if (!tenantId || !userId) {
      return new Response(JSON.stringify({ error: 'tenantId and userId are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId, status: 'ACTIVE' },
      include: {
        role: { include: { rolePerms: { include: { permission: true } } } },
      },
    })

    if (!membership) {
      return new Response(JSON.stringify({
        tenantId, userId,
        hasActiveMembership: false,
      }), { status: 200, headers: { 'content-type': 'application/json' }})
    }

    const permNames = new Set(
      membership.role.rolePerms.map(rp => rp.permission.name)
    )

    const hasView = permNames.has(PERMS.CONSENT_VIEW)
    const hasEdit = permNames.has(PERMS.CONSENT_EDIT)
    const hasExport = permNames.has(PERMS.CONSENT_EXPORT)

    return new Response(JSON.stringify({
      tenantId, userId,
      roleName: membership.role.name,
      hasActiveMembership: true,
      permissions: Array.from(permNames),
      checks: {
        CONSENT_VIEW: hasView,
        CONSENT_EDIT: hasEdit,
        CONSENT_EXPORT: hasExport,
      }
    }), { status: 200, headers: { 'content-type': 'application/json' }})
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || 'debug failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
