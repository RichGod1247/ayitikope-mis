// src/app/api/consent/teachers/detail/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = String(searchParams.get('userId') || '').trim()
    if (!userId) return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, smsOptIn: true },
    })
    return new Response(JSON.stringify({ user }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e) {
    console.error('consent/teachers/detail error:', e)
    return new Response(JSON.stringify({ error: 'Failed to load user' }), { status: 500 })
  }
}
