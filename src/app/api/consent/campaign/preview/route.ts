import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ---- RBAC helper ----
async function hasPermission(tenantId: string, userId: string, permName: string): Promise<boolean> {
  // Does user have a membership on this tenant?
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId },
    select: {
      role: {
        select: {
          rolePerms: {
            select: {
              permission: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  if (!membership || !membership.role) return false
  return membership.role.rolePerms.some(rp => rp.permission?.name === permName)
}

function baseUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
  return String(raw).replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const actorId  = searchParams.get('actorId')?.trim() // required for RBAC until session is wired
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 500)

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    if (!actorId) {
      return new Response(JSON.stringify({ error: 'actorId is required' }), {
        status: 401, headers: { 'content-type': 'application/json' },
      })
    }
    // RBAC: Preview needs CONSENT_EXPORT
    const ok = await hasPermission(tenantId, actorId, 'CONSENT_EXPORT')
    if (!ok) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { 'content-type': 'application/json' },
      })
    }

    const students = await prisma.student.findMany({
      where: { tenantId, guardianPhone: { not: null }, guardianSmsOptIn: false },
      select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
    })

    const origin = baseUrl()
    const items = students.map(s => {
      const link = `${origin}/api/consent/optin/student/link?tenantId=${encodeURIComponent(tenantId)}&studentId=${encodeURIComponent(s.id)}`
      const name = `${s.lastName} ${s.firstName}`.trim()
      const sms = `Ayitikope Basic: Consent & SMS updates for ${name}. Tap to confirm: ${link}`
      return {
        studentId: s.id,
        studentName: name,
        guardianName: s.guardianName ?? '',
        phone: s.guardianPhone ?? '',
        optinUrl: link,
        smsBody: sms,
      }
    })

    return new Response(JSON.stringify({ items }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('campaign/preview error:', err)
    return new Response(JSON.stringify({ error: 'Failed to build preview' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
