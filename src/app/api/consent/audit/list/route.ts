// src/app/api/consent/audit/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/consent/audit/list?tenantId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&q=digits&limit=100
 * Notes:
 * - Schema has only: id, tenantId, toPhone, createdAt
 * - We derive channel="SMS" in the response for UI convenience (not stored)
 * - `q` filters only by toPhone substring (insensitive)
 */
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

    const fromStr = searchParams.get('from') || ''
    const toStr = searchParams.get('to') || ''
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)

    // Build where
    const where: any = { tenantId }

    // Date range on createdAt
    const createdAt: any = {}
    const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(fromStr)
    const toOk = /^\d{4}-\d{2}-\d{2}$/.test(toStr)
    if (fromOk) createdAt.gte = new Date(`${fromStr}T00:00:00.000Z`)
    if (toOk) createdAt.lte = new Date(`${toStr}T23:59:59.999Z`)
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

    // Simple phone filter (number contains)
    if (q) {
      where.toPhone = { contains: q, mode: 'insensitive' }
    }

    const rows = await prisma.sMSSendAudit.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        toPhone: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    })

    // Derive channel for UI
    const items = rows.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      to: r.toPhone,
      createdAt: r.createdAt,
      channel: 'SMS' as const,
    }))

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/audit/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list audit entries' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
