// app/api/test/tenants/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    })
    return Response.json({ tenants })
  } catch (err: any) {
    console.error('List tenants error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list tenants' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
