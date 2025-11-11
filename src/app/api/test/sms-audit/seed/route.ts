// src/app/api/test/sms-audit/seed/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/test/sms-audit/seed?tenantId=...&to=...
 * Inserts a single SMSSendAudit row (id uuid is auto, createdAt defaults to now()).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const to = searchParams.get('to')?.trim() || '+233555000111' // any string is fine for the test

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const row = await prisma.sMSSendAudit.create({
      data: { tenantId, toPhone: to },
      select: { id: true, tenantId: true, toPhone: true, createdAt: true },
    })

    return new Response(JSON.stringify({ ok: true, row }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('test/sms-audit/seed error:', err)
    return new Response(JSON.stringify({ error: 'Seed failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
