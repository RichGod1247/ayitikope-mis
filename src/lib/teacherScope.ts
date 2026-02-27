// src/lib/teacherScope.ts
import type { TeacherPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSubjectSlug } from "@/lib/subjectSlug";

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

// ✅ Returns tokens like KG1, B4, JHS2 (or null if unknown)
// ✅ IMPORTANT: Basic 7–9 MUST map to JHS1–JHS3 (NOT B7–B9)
export function normalizeLevelToken(raw: unknown): string | null {
  const v = cleanStr(raw).toUpperCase();
  if (!v) return null;

  // KG
  let m =
    v.match(/^KG\s*([12])$/) ||
    v.match(/^K\.?G\.?\s*([12])$/) ||
    v.match(/^KG([12])$/);
  if (m) return `KG${m[1]}`;

  // JHS explicit
  m =
    v.match(/^JHS\s*([1-3])$/) ||
    v.match(/^J\.?H\.?S\.?\s*([1-3])$/) ||
    v.match(/^JHS([1-3])$/);
  if (m) return `JHS${m[1]}`;

  // JHS written as Basic 7/8/9 or B7/B8/B9 or BS7
  m =
    v.match(/^BASIC\s*([7-9])$/) ||
    v.match(/^BASIC([7-9])$/) ||
    v.match(/^B\s*([7-9])$/) ||
    v.match(/^B([7-9])$/) ||
    v.match(/^BS\s*([7-9])$/) ||
    v.match(/^BS([7-9])$/);
  if (m) {
    const basic = Number(m[1]);
    const jhs = basic - 6; // 7->1, 8->2, 9->3
    if (jhs >= 1 && jhs <= 3) return `JHS${jhs}`;
  }

  // Primary / Lower / Upper Basic 1–6
  m = v.match(/^BASIC\s*([1-6])$/) || v.match(/^B\s*([1-6])$/) || v.match(/^B([1-6])$/);
  if (m) return `B${m[1]}`;

  m = v.match(/^PRIMARY\s*([1-6])$/) || v.match(/^P\s*([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function stripLeadingLevelPrefixFromName(input: string): string {
  const s = cleanStr(input);
  if (!s) return "";
  // Strip things like: "JHS 1 ", "JHS1 ", "Basic 7 ", "B7 ", "BS7 ", "P4 ", etc.
  return s.replace(
    /^(?:(?:JHS\s*[1-3]|JHS[1-3])|(?:BASIC\s*[1-9]|BASIC[1-9])|(?:BS\s*[1-9]|BS[1-9])|(?:B\s*[1-9]|B[1-9])|(?:P\s*[1-6]|P[1-6])|(?:KG\s*[1-2]|KG[1-2]))\s*[:\-–—]?\s*/i,
    ""
  ).trim();
}

/**
 * Accepts:
 * - "Integrated Science" (name)
 * - "JHS 1 Social Studies" (name with level prefix)
 * - "integrated-science" (slug)
 * - "jhs-2-integrated-science" (level-prefixed slug)
 * - "basic-4-creative-arts" (level-prefixed slug)
 *
 * Returns a normalized SUBJECT key like "INTEGRATED SCIENCE".
 */
function normalizeSubjectKeyFromMaybeSlug(input: string) {
  const raw = cleanStr(input);
  if (!raw) return "";

  const slug = normalizeSubjectSlug(raw);
  if (!slug) {
    // ✅ Bank-grade: also strip level prefixes from plain subject names
    const stripped = stripLeadingLevelPrefixFromName(raw);
    return normalizeSubjectKey(stripped || raw);
  }

  let s = slug;

  // Strip common level prefixes if present (so we can compare subjects consistently)
  s = s.replace(/^kg-?([12])-(.+)$/i, "$2");
  s = s.replace(/^basic-?([1-9])-(.+)$/i, "$2");
  s = s.replace(/^b-?([1-9])-(.+)$/i, "$2");
  s = s.replace(/^primary-?([1-6])-(.+)$/i, "$2");
  s = s.replace(/^p-?([1-6])-(.+)$/i, "$2");
  s = s.replace(/^jhs-?([1-3])-(.+)$/i, "$2");
  s = s.replace(/^jhs([1-3])-(.+)$/i, "$2");

  return normalizeSubjectKey(s.replace(/-/g, " "));
}

function extractAssignedLevels(classes: unknown): string[] {
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

/**
 * jhsAssignments stored in a few shapes:
 * - Array (correct)
 * - Stringified JSON (common bug)
 * - Object wrapper
 */
function coerceJhsAssignments(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[];

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return coerceJhsAssignments(parsed);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.jhsAssignments)) return obj.jhsAssignments as any[];
    if (Array.isArray(obj.assignments)) return obj.assignments as any[];
  }

  return [];
}

type LevelSubjectToSlugMap = Map<string, string>; // `${lvlToken}::${subjectKey}` -> subjectSlug
type SlugToSubjectKeyMap = Map<string, string>; // subjectSlug -> subjectKey

type SlugIndex = {
  levelSubjectToSlug: LevelSubjectToSlugMap;
  slugToSubjectKey: SlugToSubjectKeyMap;
};

let slugIndexCache: { at: number; index: SlugIndex } | null = null;
const SLUG_INDEX_TTL_MS = 5 * 60 * 1000;

async function buildSlugIndex(): Promise<SlugIndex> {
  const rows = await prisma.curriculumSubject.findMany({
    select: { name: true, slug: true, level: true },
  });

  const levelSubjectToSlug: LevelSubjectToSlugMap = new Map();
  const slugToSubjectKey: SlugToSubjectKeyMap = new Map();

  for (const r of rows) {
    const slug = normalizeSubjectSlug(r.slug);
    if (!slug) continue;

    const subjectKey = normalizeSubjectKeyFromMaybeSlug(r.name);
    if (subjectKey) slugToSubjectKey.set(slug, subjectKey);

    const lvl = normalizeLevelToken(r.level);
    if (!lvl || !subjectKey) continue;

    const key = `${lvl}::${subjectKey}`;
    if (!levelSubjectToSlug.has(key)) levelSubjectToSlug.set(key, slug);
  }

  return { levelSubjectToSlug, slugToSubjectKey };
}

async function getSlugIndexCached(): Promise<SlugIndex> {
  const now = Date.now();
  if (slugIndexCache && now - slugIndexCache.at < SLUG_INDEX_TTL_MS) return slugIndexCache.index;
  const index = await buildSlugIndex();
  slugIndexCache = { at: now, index };
  return index;
}

export type TeacherScope = {
  phase: TeacherPhase;
  classLevelToken: string | null;

  // STRICT JHS scope: `${lvlToken}::${subjectSlug}`
  allowedPairs: Set<string>;

  // PLANNING JHS scope: normalized subject identity
  allowedSubjectKeys: Set<string>;
};

export async function getTeacherScopeOrNull(tenantId: string, userId: string): Promise<TeacherScope | null> {
  if (!tenantId || !userId) return null;

  const tp = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
    select: { phase: true, classLevel: true, jhsAssignments: true },
  });
  if (!tp) return null;

  const classLevelToken = normalizeLevelToken(tp.classLevel);
  const allowedPairs = new Set<string>();
  const allowedSubjectKeys = new Set<string>();

  if (tp.phase === "JHS") {
    const { levelSubjectToSlug, slugToSubjectKey } = await getSlugIndexCached();
    const arr = coerceJhsAssignments(tp.jhsAssignments);

    for (const row of arr) {
      const subjectName = cleanStr((row as any)?.subject);

      const explicitSlug = normalizeSubjectSlug((row as any)?.subjectSlug);
      const subjectKeyFromName = subjectName ? normalizeSubjectKeyFromMaybeSlug(subjectName) : "";
      const subjectKeyFromDbSlug = explicitSlug ? slugToSubjectKey.get(explicitSlug) ?? "" : "";
      const subjectKeyFromHeuristic = explicitSlug ? normalizeSubjectKeyFromMaybeSlug(explicitSlug) : "";

      const subjectKey = subjectKeyFromName || subjectKeyFromDbSlug || subjectKeyFromHeuristic;
      if (subjectKey) allowedSubjectKeys.add(subjectKey);

      const levelsRaw = extractAssignedLevels((row as any)?.classes);
      if (!levelsRaw.length) continue;

      for (const lvlRaw of levelsRaw) {
        const lvl = normalizeLevelToken(lvlRaw);
        if (!lvl || !subjectKey) continue;

        const resolvedSlug =
          levelSubjectToSlug.get(`${lvl}::${subjectKey}`) ??
          explicitSlug ??
          null;

        if (!resolvedSlug) continue;
        allowedPairs.add(`${lvl}::${resolvedSlug}`);
      }
    }
  }

  return { phase: tp.phase, classLevelToken, allowedPairs, allowedSubjectKeys };
}

export function teacherCanAccess(
  teacher: TeacherScope,
  subjectSlug: string | null | undefined,
  level: string | null | undefined
) {
  const lvl = normalizeLevelToken(level);
  if (!lvl) return false;

  if (teacher.phase === "KG" || teacher.phase === "PRIMARY") {
    return !!teacher.classLevelToken && teacher.classLevelToken === lvl;
  }

  if (teacher.phase === "JHS") {
    const slug = normalizeSubjectSlug(subjectSlug);
    if (!slug) return false;
    return teacher.allowedPairs.has(`${lvl}::${slug}`);
  }

  return false;
}

export function teacherCanPlanLessonNotesOrSchemes(
  teacher: TeacherScope,
  subjectNameOrSlug: string | null | undefined,
  level: string | null | undefined
) {
  const lvl = normalizeLevelToken(level);
  if (!lvl) return false;

  if (teacher.phase === "KG" || teacher.phase === "PRIMARY") {
    return !!teacher.classLevelToken && teacher.classLevelToken === lvl;
  }

  if (teacher.phase === "JHS") {
    if (!lvl.startsWith("JHS")) return false;

    const key = normalizeSubjectKeyFromMaybeSlug(subjectNameOrSlug ?? "");
    if (!key) return false;

    return teacher.allowedSubjectKeys.has(key);
  }

  return false;
}
