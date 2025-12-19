// src/app/api/rbac/grant/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PERMS } from '@/lib/rbac'

type Body = {
  tenantId: string
  roleName: string // e.g. "ADMIN" or "Head Teacher"
  perms: string[]  // e.g. ["CONSENT_VIEW","CONSENT_EDIT","CONSENT_EXPORT"]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const tenantId = body.tenantId?.trim()
    const roleName = body.roleName?.trim()
    const perms = Array.isArray(body.perms) ? body.perms : []

    if (!tenantId || !roleName || perms.length === 0) {
      return new Response(JSON.stringify({ error: 'tenantId, roleName, perms[] required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Ensure role exists for this tenant (global roles are allowed too; tie it to tenant for simplicity)
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: roleName } },
      update: {},
      create: { tenantId, name: roleName, description: `Role ${roleName} for tenant ${tenantId}` },
      select: { id: true },
    })

    // Make sure each Permission row exists, then upsert RolePermission
    for (const name of perms) {
      const p = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: `Permission: ${name}` },
        select: { id: true },
      })
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        update: {},
        create: { roleId: role.id, permissionId: p.id },
      })
    }

    return new Response(JSON.stringify({ ok: true, tenantId, roleName, granted: perms }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e: any) {
    console.error('rbac/grant error:', e)
    return new Response(JSON.stringify({ error: 'grant failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
