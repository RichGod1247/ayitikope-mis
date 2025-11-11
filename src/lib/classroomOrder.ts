// src/lib/classroomOrder.ts
export const gradeRank: Record<string, number> = {
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

const ARM_ORDER = ['A','B','C','D']
export function armRank(arm?: string | null): number {
  if (!arm) return 0
  const idx = ARM_ORDER.indexOf(arm.toUpperCase())
  return idx >= 0 ? idx + 1 : 99
}

export function normalizeGradeToken(grade?: string | null, name?: string | null): string | null {
  const source = (grade || name || '').toUpperCase().trim()
  if (!source) return null
  if (gradeRank[source] !== undefined) return source
  const compact = source.replace(/\s+/g, '')
  if (gradeRank[compact] !== undefined) return compact

  const kg = source.match(/^KG\s*([12])$/)
  if (kg) return `KG${kg[1]}`

  const bs = source.match(/^(?:BS|B)\s*([1-6])$/)
  if (bs) return `BS${bs[1]}`

  const jhs = source.match(/^JHS\s*([1-3])$/)
  if (jhs) return `JHS${jhs[1]}`

  // Handle legacy names like "JHS1A" → "JHS1"
  const legacy = source.match(/^(KG[12]|BS[1-6]|JHS[1-3])[A-D]$/)
  if (legacy) return legacy[1]

  return null
}

export function classroomSortKey(c: { grade: string | null; name: string | null; arm: string | null; id: string }): string {
  const token = normalizeGradeToken(c.grade, c.name)
  const rank = token ? gradeRank[token] ?? 999 : 999
  const ar = armRank(c.arm)
  return `${String(rank).padStart(3, '0')}|${String(ar).padStart(2, '0')}|${c.id}`
}

/** Build a clean display label: "BS1" or "BS1 • A" */
export function classroomLabel(grade?: string | null, arm?: string | null): string {
  const g = (grade || '').toUpperCase().trim()
  const a = (arm || '').toUpperCase().trim()
  return a ? `${g} • ${a}` : g
}
