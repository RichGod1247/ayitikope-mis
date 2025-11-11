// src/app/api/headteacher/day/bulk-certify/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function parseYMD(d: string) {
  // returns [start, end) UTC for that calendar day
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3])
  const start = new Date(Date.UTC(y, mo, da, 0, 0, 0))
  const end = new Date(Date.UTC(y, mo, da + 1, 0, 0, 0))
  return { start, end }
}

/**
 * POST /api/headteacher/day/bulk-certify
 * body: { tenantId: string, date: "YYYY-MM-DD" }
 * Marks all CLOSED (but not yet certified) sessions on that day as certified.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, date } = await req.json()
    if (!tenantId || !date) {
      return new Response(JSON.stringify({ error: 'tenantId and date are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    const range = parseYMD(String(date))
    if (!range) {
      return new Response(JSON.stringify({ error: 'date must be YYYY-MM-DD' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Update all sessions for that tenant & day that are CLOSED and not certified.
    const now = new Date()
    const result = await prisma.attendanceSession.updateMany({
      where: {
        tenantId,
        isClosed: true,
        certifiedAt: null,
        date: { gte: range.start, lt: range.end },
      },
      data: { certifiedAt: now },
    })

    return new Response(JSON.stringify({ updatedCount: result.count }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('bulk-certify error:', err)
    return new Response(JSON.stringify({ error: 'Failed to bulk certify' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
