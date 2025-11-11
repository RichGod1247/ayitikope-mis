// src/app/api/classrooms/list/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  labelOf,
  orderOf,
  ARMS,
  normalizeGrade,
  normalizeArm,
} from '@/lib/canonical-classes'

/**
 * GET /api/classrooms/list?tenantId=...&mode=single|multi
 * - single: one representative per grade (prefers no-arm; else first by id)
 * - multi : ONLY arm'd rows (A..D) per grade; EXCLUDES no-arm rows entirely
 * Always: normalize labels, dedupe, and order KG1, KG2, B1..B6, JHS1..JHS3; arms A..D.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const mode = (searchParams.get('mode') || 'single').toLowerCase() as
      | 'single'
      | 'multi'

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const classes = await prisma.classroom.findMany({
      where: { tenantId },
      select: { id: true, grade: true, arm: true, name: true },
    })

    // Bucket by normalized grade
    const byGrade: Record<
      string,
      Array<{ id: string; grade: string; arm: string | null }>
    > = {}

    for (const c of classes) {
      const g = normalizeGrade(c.grade)
      if (!g) continue
      const a = normalizeArm(c.arm) // null or A/B/C/D
      if (!byGrade[g]) byGrade[g] = []
      byGrade[g].push({ id: c.id, grade: g, arm: a })
    }

    let items: Array<{ id: string; grade: string; arm?: string | null; label: string }> = []

    if (mode === 'multi') {
      // MULTI: strictly arm'd rows; EXCLUDE null-arm rows
      for (const g of Object.keys(byGrade)) {
        const rows = byGrade[g]
        // Deduplicate by arm key; pick first by id per arm
        const byArm = new Map<string, { id: string; grade: string; arm: string }>()
        for (const r of rows) {
          if (!r.arm) continue // exclude no-arm reps in multi mode
          const a = r.arm
          if (!byArm.has(a)) byArm.set(a, { id: r.id, grade: g, arm: a })
        }
        // Output in A..D order if present
        for (const a of ARMS) {
          const hit = byArm.get(a)
          if (hit) {
            items.push({
              id: hit.id,
              grade: g,
              arm: a,
              label: labelOf(g, a),
            })
          }
        }
      }
    } else {
      // SINGLE: choose one no-arm representative; else smallest id
      for (const g of Object.keys(byGrade)) {
        const group = byGrade[g]
        // prefer no-arm
        const noArm = group.filter(x => !x.arm)
        let rep =
          noArm.sort((a, b) => a.id.localeCompare(b.id))[0] ||
          group.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
        if (rep) {
          items.push({
            id: rep.id,
            grade: g,
            arm: null,
            label: labelOf(g, null),
          })
        }
      }
    }

    // Canonical ordering
    items.sort((a, b) => {
      const og = orderOf(a.grade) - orderOf(b.grade)
      if (og !== 0) return og
      const aa = a.arm || ''
      const bb = b.arm || ''
      return aa.localeCompare(bb)
    })

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('classrooms/list error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load classrooms' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
