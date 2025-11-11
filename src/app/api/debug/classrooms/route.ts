// app/api/debug/classrooms/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const rows = await prisma.classroom.findMany({
      where: { tenantId },
      select: { id: true, name: true, grade: true, arm: true, createdAt: true },
      orderBy: [{ grade: 'asc' }, { arm: 'asc' }, { createdAt: 'asc' }],
    })

    return new Response(JSON.stringify({ count: rows.length, rows }, null, 2), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e: any) {
    console.error('debug/classrooms error:', e)
    return new Response(JSON.stringify({ error: 'debug failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
