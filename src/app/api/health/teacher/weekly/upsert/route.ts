// src/app/api/health/teacher/weekly/upsert/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function mondayUtcISO(d: Date): string {
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day // move to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() + diff)
  return m.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || '').trim()
    const userId   = String(body?.userId   || '').trim()   // teacher's User.id
    const week     = String(body?.weekStart || '').trim()  // optional; ISO YYYY-MM-DD
    const stress   = Number(body?.stressLevel ?? 3)        // 1..5
    const work     = Number(body?.workload    ?? 3)        // 1..5
    const comments = typeof body?.comments === 'string' ? body.comments.trim() : null

    if (!tenantId) return new Response(JSON.stringify({ error: 'tenantId is required' }), { status: 400 })
    if (!userId)   return new Response(JSON.stringify({ error: 'userId (teacher) is required' }), { status: 400 })
    if (!(stress >= 1 && stress <= 5)) return new Response(JSON.stringify({ error: 'stressLevel must be 1..5' }), { status: 400 })
    if (!(work >= 1 && work <= 5))     return new Response(JSON.stringify({ error: 'workload must be 1..5' }), { status: 400 })

    // resolve weekStart: default to current Monday UTC if not provided
    const weekStartISO = week && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? week
      : mondayUtcISO(new Date())

    // Optional: sanity check that user belongs to tenant (via membership)
    const mem = await prisma.membership.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    })
    if (!mem) {
      return new Response(JSON.stringify({ error: 'Teacher is not a member of the tenant' }), { status: 400 })
    }

    // Upsert by (userId, weekStart)
    const saved = await prisma.teacherHealthWeekly.upsert({
      where: { TeacherHealthWeekly_unique_user_week: { userId, weekStart: new Date(weekStartISO) } },
      update: { tenantId, stressLevel: stress, workload: work, comments: comments ?? undefined },
      create: { tenantId, userId, weekStart: new Date(weekStartISO), stressLevel: stress, workload: work, comments: comments ?? undefined },
      select: { id: true, userId: true, weekStart: true, stressLevel: true, workload: true },
    })

    return new Response(JSON.stringify({ ok: true, saved }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('teacher/weekly/upsert error:', err)
    return new Response(JSON.stringify({ error: 'Failed to upsert teacher weekly health' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
