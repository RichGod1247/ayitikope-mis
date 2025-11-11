// src/app/api/rbac/seed-basic/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PERMS } from '@/lib/rbac'

/**
 * POST /api/rbac/seed-basic
 * Body: { tenantId: string }
 *
 * Creates baseline permissions (CONSENT_VIEW/EDIT/EXPORT) and assigns them
 * to the "Head Teacher" role in the given tenant (creating the role if needed).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId: string | undefined = typeof body?.tenantId === 'string' ? body.tenantId.trim() : undefined
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // 1) Ensure permissions exist globally
    const permNames = Object.values(PERMS)
    // Upsert each permission by name
    for (const name of permNames) {
      await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: `Permission: ${name}` },
      })
    }

    // 2) Ensure "Head Teacher" role exists in this tenant
    const roleName = 'Head Teacher'
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: roleName } },
      update: {},
      create: { tenantId, name: roleName, description: 'Head Teacher (RBAC baseline)' },
    })

    // 3) Attach permissions to this role (idempotent)
    const perms = await prisma.permission.findMany({
      where: { name: { in: permNames } },
      select: { id: true, name: true },
    })

    // Create missing role-perm links
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        update: {},
        create: { roleId: role.id, permissionId: p.id },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      tenantId,
      role: { id: role.id, name: role.name },
      granted: permNames,
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err: any) {
    console.error('rbac/seed-basic error:', err)
    return new Response(JSON.stringify({ error: 'Failed to seed RBAC' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
