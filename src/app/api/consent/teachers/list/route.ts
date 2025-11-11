// src/app/api/consent/teachers/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/consent/teachers/list?tenantId=...
 * Lists all users who belong to the tenant (via Membership).
 * If you later want to restrict to the Teacher role, add where conditions to memberships/role.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // ORM query — no raw SQL, no parameter typing issues.
    const users = await prisma.user.findMany({
      where: {
        memberships: {
          some: { tenantId },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        smsOptIn: true, // requires the smsOptIn column you added
      },
      orderBy: [
        { name: 'asc' },
        { email: 'asc' },
      ],
    })

    return new Response(JSON.stringify({ tenantId, items: users }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('consent/teachers/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list teachers' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
