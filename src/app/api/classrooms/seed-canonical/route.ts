// src/app/api/classrooms/seed-canonical/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GRADES, ARMS, labelOf } from '@/lib/canonical-classes'

/**
 * POST /api/classrooms/seed-canonical
 * Body: { tenantId: string, mode: 'single' | 'multi' }
 *
 * - SINGLE: ensures one class per grade (no arm). Creates missing only.
 * - MULTI : ensures arms A..D per grade. Creates missing only.
 * - Never blindly deletes to avoid FK violations.
 * - Also normalizes the "name" field to canonical label for any touched rows.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || '').trim()
    const mode = String(body?.mode || 'single').toLowerCase()

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }
    if (!['single','multi'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'mode must be single|multi' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const existing = await prisma.classroom.findMany({
      where: { tenantId },
      select: { id: true, grade: true, arm: true, name: true },
    })

    // Build lookup by composite key grade|arm (arm may be '')
    const key = (g: string, a?: string | null) => `${g.toUpperCase()}|${(a || '').toUpperCase()}`
    const idx = new Map<string, { id: string, grade: string, arm: string | null, name: string | null }>()
    for (const c of existing) {
      if (!c.grade) continue
      idx.set(key(c.grade, c.arm), { id: c.id, grade: c.grade, arm: c.arm, name: c.name })
    }

    const toCreate: Array<{ grade: string; arm?: string | null; name: string }> = []
    const toNormalize: Array<{ id: string; name: string }> = []

    if (mode === 'single') {
      for (const g of GRADES) {
        const k = key(g, null)
        const found = idx.get(k)
        if (found) {
          const wantName = labelOf(g, null)
          if ((found.name || '').trim() !== wantName) {
            toNormalize.push({ id: found.id, name: wantName })
          }
        } else {
          // If an arm exists for this grade, do NOT delete it; we still create a no-arm canonical row.
          toCreate.push({ grade: g, arm: null, name: labelOf(g, null) })
        }
      }
    } else {
      for (const g of GRADES) {
        for (const a of ARMS) {
          const k = key(g, a)
          const found = idx.get(k)
          if (found) {
            const wantName = labelOf(g, a)
            if ((found.name || '').trim() !== wantName) {
              toNormalize.push({ id: found.id, name: wantName })
            }
          } else {
            toCreate.push({ grade: g, arm: a, name: labelOf(g, a) })
          }
        }
      }
    }

    // Apply changes (safe & incremental)
    for (const row of toCreate) {
      await prisma.classroom.create({
        data: {
          tenantId,
          grade: row.grade,
          arm: row.arm ?? null,
          name: row.name,
        },
        select: { id: true },
      })
    }
    for (const row of toNormalize) {
      await prisma.classroom.update({
        where: { id: row.id },
        data: { name: row.name },
        select: { id: true },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      created: toCreate.length,
      normalized: toNormalize.length,
      mode,
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('seed-canonical error:', err)
    return new Response(JSON.stringify({ error: 'Failed to seed classrooms' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
