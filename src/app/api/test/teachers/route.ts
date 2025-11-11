// src/app/api/test/teachers/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // Return users who have a Membership in this tenant.
    // (Later we can filter by Role=TEACHER if you formalize roles.)
    const rows = await prisma.membership.findMany({
      where: { tenantId },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // De-duplicate just in case
    const teachers: Array<{ id: string; name: string | null; email: string | null }> = []
    for (const r of rows) {
      if (r.user && !teachers.find(t => t.id === r.user!.id)) {
        teachers.push(r.user as any)
      }
    }

    return new Response(JSON.stringify({ tenantId, teachers }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('test/teachers error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load teachers' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
