// src/lib/teacherScope.ts
import type { TeacherPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeSubjectKey(name: string) {
  return cleanStr(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns tokens like KG1, B4, JHS2 (or null if unknown)
export function normalizeLevelToken(raw: unknown): string | null {
  const v = cleanStr(raw).toUpperCase();
  if (!v) return null;

  let m =
    v.match(/^KG\s*([12])$/) ||
    v.match(/^K\.?G\.?\s*([12])$/) ||
    v.match(/^KG([12])$/);
  if (m) return `KG${m[1]}`;

  m = v.match(/^BASIC\s*([1-6])$/) || v.match(/^B\s*([1-6])$/) || v.match(/^B([1-6])$/);
  if (m) return `B${m[1]}`;

  m = v.match(/^PRIMARY\s*([1-6])$/) || v.match(/^P\s*([1-6])$/);
  if (m) return `B${m[1]}`;

  m =
    v.match(/^JHS\s*([1-3])$/) ||
    v.match(/^J\.?H\.?S\.?\s*([1-3])$/) ||
    v.match(/^JHS([1-3])$/);
  if (m) return `JHS${m[1]}`;

  return null;
}

function extractAssignedLevels(classes: unknown): string[] {
  // Accept: ["JHS 1","JHS 2"] OR { "JHS 1": true, "JHS 2": false }
  if (Array.isArray(classes)) return classes.filter((c) => typeof c === "string") as string[];
  if (classes && typeof classes === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(classes as Record<string, unknown>)) {
      if (v) out.push(k);
    }
    return out;
  }
  return [];
}

export type TeacherScope = {
  phase: TeacherPhase;
  classLevelToken: string | null;
  allowedPairs: Set<string>; // JHS only: `${lvl}::${subjectKey}`
};

export async function getTeacherScopeOrNull(tenantId: string, userId: string): Promise<TeacherScope | null> {
  if (!tenantId || !userId) return null;

  // ✅ use the unique tenant+user key
  const tp = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
    select: { phase: true, classLevel: true, jhsAssignments: true },
  });
  if (!tp) return null;

  const classLevelToken = normalizeLevelToken(tp.classLevel);
  const allowedPairs = new Set<string>();

  if (tp.phase === "JHS") {
    const arr = Array.isArray(tp.jhsAssignments) ? (tp.jhsAssignments as any[]) : [];
    for (const row of arr) {
      const subjectKey = normalizeSubjectKey(row?.subject);
      if (!subjectKey) continue;

      const levelsRaw = extractAssignedLevels(row?.classes);
      for (const lvlRaw of levelsRaw) {
        const lvl = normalizeLevelToken(lvlRaw);
        if (lvl) allowedPairs.add(`${lvl}::${subjectKey}`);
      }
    }
  }

  return { phase: tp.phase, classLevelToken, allowedPairs };
}

export function teacherCanAccess(teacher: TeacherScope, subjectName: string, level: string | null | undefined) {
  const subjKey = normalizeSubjectKey(subjectName);
  const lvl = normalizeLevelToken(level);

  if (!subjKey || !lvl) return false;

  if (teacher.phase === "KG" || teacher.phase === "PRIMARY") {
    return !!teacher.classLevelToken && teacher.classLevelToken === lvl;
  }

  if (teacher.phase === "JHS") {
    return teacher.allowedPairs.has(`${lvl}::${subjKey}`);
  }

  return false;
}
