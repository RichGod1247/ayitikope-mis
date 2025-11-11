// src/app/api/headteacher/health/teachers/weekly/missing/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/headteacher/health/teachers/weekly/missing?tenantId=...&weekStart=YYYY-MM-DD
 * Returns teachers (from /api/test/teachers) who have NOT submitted TeacherHealthWeekly for that weekStart (Monday).
 *
 * We trust the "test teachers" source used elsewhere to stay consistent with your seed/demo data.
 * If you later have a real "teachers" table, swap to a prisma query here.
 */

function mondayISO(input: string): string | null {
  if (!input) return null
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  // force to UTC date (no time)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // Ensure it's the Monday for that week (idempotent if already Monday)
  const day = date.getUTCDay() // 0..6, Sun..Sat
  const diff = (day + 6) % 7 // days since Monday
  date.setUTCDate(date.getUTCDate() - diff)
  return date.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const weekStartRaw = String(searchParams.get('weekStart') || '').trim()
    const weekStartISO = mondayISO(weekStartRaw)

    if (!tenantId || !weekStartISO) {
      return new Response(JSON.stringify({ error: 'tenantId and valid weekStart are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Get the teacher roster from the demo/test teachers API (keeps consistent with your seeded “Head Teacher”).
    // Use same-origin so it works in dev without envs.
    const origin = new URL(req.url).origin
    const teachersRes = await fetch(`${origin}/api/test/teachers?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
    if (!teachersRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to load teachers' }), {
        status: 500, headers: { 'content-type': 'application/json' },
      })
    }
    const teachersData = await teachersRes.json()
    const teachers: Array<{ id: string; name?: string; email?: string; phone?: string }> = teachersData?.teachers ?? []

    // Pull already-submitted entries for that exact weekStart (we made weekStart unique per user).
    const submitted = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId,
        weekStart: new Date(`${weekStartISO}T00:00:00.000Z`),
      },
      select: { userId: true },
    })
    const submittedSet = new Set(submitted.map(s => s.userId))

    const missing = teachers.filter(t => !submittedSet.has(t.id))

    return new Response(JSON.stringify({ tenantId, weekStart: weekStartISO, missing }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('weekly/missing error:', err)
    // Always return valid JSON so the UI never sees "Unexpected end of JSON input"
    return new Response(JSON.stringify({ error: 'Failed to compute missing list' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
