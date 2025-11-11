// app/api/test/classrooms/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Canonical school order:
 * KG1 → KG2 → BS1..BS6 → JHS1..JHS3
 * We rank grades with a fixed map; fallback tries to parse from "name".
 */
const gradeRank: Record<string, number> = {
  'KG1': 1, 'KG 1': 1,
  'KG2': 2, 'KG 2': 2,
  'BS1': 3, 'BS 1': 3, 'B1': 3, 'B 1': 3,
  'BS2': 4, 'BS 2': 4, 'B2': 4, 'B 2': 4,
  'BS3': 5, 'BS 3': 5, 'B3': 5, 'B 3': 5,
  'BS4': 6, 'BS 4': 6, 'B4': 6, 'B 4': 6,
  'BS5': 7, 'BS 5': 7, 'B5': 7, 'B 5': 7,
  'BS6': 8, 'BS 6': 8, 'B6': 8, 'B 6': 8,
  'JHS1': 9, 'JHS 1': 9,
  'JHS2': 10, 'JHS 2': 10,
  'JHS3': 11, 'JHS 3': 11,
}

// Extracts a normalized grade token from either grade or name
function normalizeGradeToken(grade?: string | null, name?: string | null): string | null {
  const source = (grade || name || '').toUpperCase().trim()
  if (!source) return null

  // Direct matches first
  if (gradeRank[source] !== undefined) return source

  // Try compacting spaces (e.g., "KG 1" -> "KG1", "BS 2" -> "BS2", "JHS 3" -> "JHS3")
  const compact = source.replace(/\s+/g, '')
  if (gradeRank[compact] !== undefined) return compact

  // Heuristic: look for KG, BS/B, JHS + digit
  const kg = source.match(/^KG\s*([12])$/)
  if (kg) return `KG${kg[1]}`

  const bs = source.match(/^(?:BS|B)\s*([1-6])$/)
  if (bs) return `BS${bs[1]}`

  const jhs = source.match(/^JHS\s*([1-3])$/)
  if (jhs) return `JHS${jhs[1]}`

  return null
}

function classroomSortKey(c: { grade: string | null; name: string | null; arm: string | null; id: string }): string {
  const token = normalizeGradeToken(c.grade, c.name)
  const rank = token ? gradeRank[token] ?? 999 : 999
  const arm = (c.arm || '').toUpperCase().trim()
  // Sort by rank, then by name, then by arm
  return `${String(rank).padStart(3, '0')}|${(c.name || '').toUpperCase()}|${arm}|${c.id}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const classroomsRaw = await prisma.classroom.findMany({
      where: { tenantId },
      select: { id: true, name: true, grade: true, arm: true },
    })

    const classrooms = classroomsRaw
      .map(c => ({ ...c }))
      .sort((a, b) => classroomSortKey(a).localeCompare(classroomSortKey(b)))

    return Response.json({ classrooms })
  } catch (err: any) {
    console.error('List classrooms error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list classrooms' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
