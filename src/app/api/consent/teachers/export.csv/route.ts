// src/app/api/consent/teachers/export.csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    if (!tenantId) return new Response('tenantId is required', { status: 400 })

    // Users in tenant (via Memberships)
    const users = await prisma.user.findMany({
      where: { memberships: { some: { tenantId } } },
      select: { id: true, name: true, email: true, smsOptIn: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    })

    const lines: string[] = []
    lines.push(['userId', 'name', 'email', 'smsOptIn'].join(','))
    for (const u of users) {
      lines.push([u.id, u.name ?? '', u.email ?? '', u.smsOptIn ? 'true' : 'false']
        .map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
    }

    const csv = lines.join('\r\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="teachers-consent.csv"`,
      },
    })
  } catch (e) {
    console.error('teachers/export.csv error:', e)
    return new Response('Failed to export teachers', { status: 500 })
  }
}
