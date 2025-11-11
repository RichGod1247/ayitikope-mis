// src/app/api/headteacher/health/teachers/weekly/remind/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSMS } from '@/lib/sms'

function toMondayUTC(iso: string): Date {
  const d = new Date(iso)
  if (isNaN(d.getTime())) throw new Error('Invalid weekStart')
  // normalize to 00:00:00Z
  const day = new Date(d.toISOString().slice(0,10) + 'T00:00:00.000Z')
  return day
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, weekStart } = await req.json()
    if (!tenantId || !weekStart) {
      return new Response(JSON.stringify({ error: 'tenantId and weekStart are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    const weekStartDate = toMondayUTC(weekStart)

    // 1) All users in tenant (treat them as teachers for now)
    const teachers = await prisma.user.findMany({
      where: { memberships: { some: { tenantId } } },
      select: { id: true, name: true, email: true, smsOptIn: true },
    })

    if (teachers.length === 0) {
      return new Response(JSON.stringify({
        tenantId, weekStart, reminded: 0, skippedNoConsent: 0, missingCount: 0, items: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // 2) Fetch existing weekly submissions for that week
    const existing = await prisma.teacherHealthWeekly.findMany({
      where: { tenantId, weekStart: weekStartDate },
      select: { userId: true },
    })
    const submittedIds = new Set(existing.map(e => e.userId))

    // 3) Filter teachers who haven’t submitted AND have smsOptIn true
    const missing = teachers.filter(t => !submittedIds.has(t.id))
    let reminded = 0
    let skippedNoConsent = 0
    const results: Array<{ userId: string; name: string | null; email: string | null; sent: boolean }> = []

    for (const t of missing) {
      const to = (t.email || '').trim() // using email as routing key for SMS-STUB
      const msg = `Reminder: Please submit your weekly health entry for the week starting ${weekStart}.`
      if (t.smsOptIn && to) {
        try {
          await sendSMS({ to, message: msg, tenantId, /* kind: 'teacher-weekly-reminder' */ })
          reminded += 1
          results.push({ userId: t.id, name: t.name ?? null, email: t.email ?? null, sent: true })
        } catch {
          results.push({ userId: t.id, name: t.name ?? null, email: t.email ?? null, sent: false })
        }
      } else {
        skippedNoConsent += 1
        results.push({ userId: t.id, name: t.name ?? null, email: t.email ?? null, sent: false })
      }
    }

    return new Response(JSON.stringify({
      tenantId,
      weekStart: weekStart,
      missingCount: missing.length,
      reminded,
      skippedNoConsent,
      items: results,
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('weekly/remind error:', err)
    return new Response(JSON.stringify({ error: 'Failed to send reminders' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
