// src/app/api/consent/teachers/export/csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Get users who belong to this tenant via Membership
    // (If you want to restrict to a “Teacher” role only, add a where on Role.name.)
    const memberships = await prisma.membership.findMany({
      where: { tenantId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            smsOptIn: true,   // from your User model
          },
        },
      },
      orderBy: [{ user: { name: 'asc' } }],
    })

    // Deduplicate by user.id (in case a user has multiple memberships)
    const map = new Map<string, { id: string; name: string | null; email: string; smsOptIn: boolean | null }>()
    for (const m of memberships) {
      const u = m.user
      if (!u) continue
      if (!map.has(u.id)) map.set(u.id, {
        id: u.id,
        name: u.name ?? '',
        email: u.email,
        smsOptIn: Boolean(u.smsOptIn),
      })
    }
    const teachers = Array.from(map.values())

    const header = ['userId', 'name', 'email', 'smsOptIn']
    const rows: string[][] = [header]

    for (const t of teachers) {
      rows.push([
        t.id,
        t.name || '',
        t.email || '',
        t.smsOptIn ? 'TRUE' : 'FALSE',
      ])
    }

    const csv = rows.map(r => r.map(toCsvValue).join(',')).join('\n')

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="teachers-consent-${tenantId}.csv"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    console.error('teachers/export/csv error:', err)
    return new Response(JSON.stringify({ error: 'Failed to export teachers CSV' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
