//src/app/api/consent/export/teachers/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function csvEscape(s: any) {
  const v = s == null ? '' : String(s)
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = (searchParams.get('tenantId') || '').trim()
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Get users via memberships (one row per member)
    const memberships = await prisma.membership.findMany({
      where: { tenantId },
      select: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    // De-duplicate by userId (in case of multiple roles)
    const unique = new Map<string, { id: string; name: string | null; email: string }>()
    for (const m of memberships) {
      if (m.user) unique.set(m.user.id, m.user)
    }
    const users = Array.from(unique.values()).sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '')
    )

    const header = ['userId', 'name', 'email']
    const rows = users.map(u => [u.id, u.name, u.email].map(csvEscape).join(','))

    const csv = [header.join(','), ...rows].join('\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="teachers_${tenantId}.csv"`,
      },
    })
  } catch (err) {
    console.error('export/teachers error:', err)
    return new Response('Failed to export teachers CSV', { status: 500 })
  }
}
