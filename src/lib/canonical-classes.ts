// src/lib/canonical-classes.ts

// Canonical grade order
export const GRADES = [
  'KG1','KG2',
  'B1','B2','B3','B4','B5','B6',
  'JHS1','JHS2','JHS3',
] as const
export type Grade = typeof GRADES[number]

export const ARMS = ['A','B','C','D'] as const
export type Arm = typeof ARMS[number]

/**
 * Normalize free-text grade strings into canonical values:
 *  - Trims spaces, removes internal spaces (e.g., "JHS 1" -> "JHS1")
 *  - Unifies BS/B into B (e.g., "BS3", "Bs 3", "B3" -> "B3")
 *  - Upper-cases and matches KG/JHS patterns
 */
export function normalizeGrade(input?: string | null): Grade | string {
  if (!input) return ''
  let g = String(input).toUpperCase().trim().replace(/\s+/g, '')
  // Map BS* => B*
  g = g.replace(/^BS([1-6])$/, 'B$1')
  // Allow B 1, B-1 variants
  g = g.replace(/^B\-?([1-6])$/, 'B$1')
  // Allow KG 1
  g = g.replace(/^KG\-?([12])$/, 'KG$1')
  // Allow JHS 1..3
  g = g.replace(/^JHS\-?([1-3])$/, 'JHS$1')

  // If still something like 'JHS01', trim leading zero
  g = g.replace(/^JHS0([1-3])$/, 'JHS$1')

  // If matched canonical, return it
  if ((GRADES as readonly string[]).includes(g)) return g as Grade
  return g // unknown stays as-is but will sort to bottom
}

/** Normalize arm to A/B/C/D or null */
export function normalizeArm(input?: string | null): Arm | null {
  if (!input) return null
  const a = String(input).toUpperCase().trim().replace(/\s+/g, '')
  if (ARMS.includes(a as Arm)) return a as Arm
  return null
}

export function labelOf(grade: string, arm?: string | null) {
  return arm ? `${grade}${arm}` : grade
}

export function orderOf(grade: string): number {
  const g = normalizeGrade(grade)
  const idx = GRADES.indexOf(g as Grade)
  return idx >= 0 ? idx : 999 // unknown grades sink to the bottom
}
