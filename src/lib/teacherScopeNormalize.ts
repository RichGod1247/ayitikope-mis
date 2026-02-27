// src/lib/teacherScopeNormalize.ts
export type CanonicalJhsClass = "JHS 1" | "JHS 2" | "JHS 3";

export type NormalizedJhsAssignment = {
  subject: string;          // canonical display name (no "JHS 1 " prefix)
  subjectKey: string;       // normalized key for comparisons
  subjectSlug: string | null;
  classes: CanonicalJhsClass[];
};

export function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeSubjectKey(name: string) {
  return cleanStr(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove leading level prefix from subject names:
 * "JHS 1 Mathematics" -> "Mathematics"
 * "J.H.S.2 Science" -> "Science"
 * "Basic 7 Career Technology" -> "Career Technology"
 */
export function stripJhsLevelPrefixFromSubject(raw: string) {
  const s = cleanStr(raw);
  if (!s) return "";

  // Matches common prefixes at the beginning only.
  const re =
    /^(?:JHS|J\.?H\.?S\.?|JUNIOR\s+HIGH\s+SCHOOL)\s*([1-3])\s+|^(?:BASIC|B)\s*([7-9])\s+/i;

  const m = s.match(re);
  if (!m) return s;

  // Remove the matched prefix
  const stripped = s.replace(re, "").trim();
  return stripped || s;
}

/**
 * Accept BOTH UI tokens and DB tokens:
 * - "JHS 1" / "JHS1" / "J.H.S. 1"
 * - "Basic 7" / "B7"
 */
export function normalizeJhsClass(raw: unknown): CanonicalJhsClass | null {
  const v = cleanStr(raw).toUpperCase();
  if (!v) return null;

  // UI patterns
  let m =
    v.match(/^JHS\s*([1-3])$/) ||
    v.match(/^J\.?H\.?S\.?\s*([1-3])$/) ||
    v.match(/^JHS([1-3])$/) ||
    v.match(/^JUNIOR\s+HIGH\s+SCHOOL\s*([1-3])$/);
  if (m) return `JHS ${m[1]}` as CanonicalJhsClass;

  // DB patterns
  m = v.match(/^BASIC\s*([7-9])$/) || v.match(/^B\s*([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  return null;
}

function uniq<T>(xs: T[]) {
  return Array.from(new Set(xs));
}

function sortJhsClasses(xs: CanonicalJhsClass[]) {
  const order: CanonicalJhsClass[] = ["JHS 1", "JHS 2", "JHS 3"];
  const s = new Set(xs);
  return order.filter((c) => s.has(c));
}

/**
 * Robustly parse TeacherProfile.jhsAssignments (unknown JSON) into canonical assignments:
 * - subjects stripped of level prefixes
 * - class tokens normalized to "JHS 1/2/3"
 * - merged by subjectKey
 */
export function normalizeTeacherJhsAssignments(raw: unknown): NormalizedJhsAssignment[] {
  if (!Array.isArray(raw)) return [];

  const merged = new Map<
    string,
    { subject: string; subjectKey: string; subjectSlug: string | null; classes: Set<CanonicalJhsClass> }
  >();

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as any;

    const subjectRaw = cleanStr(r.subject);
    const subject = stripJhsLevelPrefixFromSubject(subjectRaw);
    const subjectKey = normalizeSubjectKey(subject);
    if (!subjectKey) continue;

    const slug = cleanStr(r.subjectSlug) || null;

    const classesRaw = Array.isArray(r.classes) ? r.classes : [];
    const classes = classesRaw
      .map((c: any) => normalizeJhsClass(c))
      .filter(Boolean) as CanonicalJhsClass[];

    if (!classes.length) continue;

    const existing = merged.get(subjectKey);
    if (!existing) {
      merged.set(subjectKey, {
        subject,
        subjectKey,
        subjectSlug: slug,
        classes: new Set(classes),
      });
    } else {
      classes.forEach((c) => existing.classes.add(c));
      // Prefer a non-null slug if one appears
      if (!existing.subjectSlug && slug) existing.subjectSlug = slug;
      // Prefer the longer “nicer” subject casing if it differs
      if (subject.length > existing.subject.length) existing.subject = subject;
    }
  }

  const out: NormalizedJhsAssignment[] = Array.from(merged.values()).map((x) => ({
    subject: x.subject,
    subjectKey: x.subjectKey,
    subjectSlug: x.subjectSlug,
    classes: sortJhsClasses(Array.from(x.classes)),
  }));

  // stable order
  out.sort((a, b) => a.subjectKey.localeCompare(b.subjectKey));
  return out;
}

/**
 * Build quick lookup for validation:
 * byClass["JHS 1"] -> Set(subjectKey)
 * nameByKey -> canonical display name
 */
export function buildJhsScopeIndex(assignments: NormalizedJhsAssignment[]) {
  const byClass: Record<CanonicalJhsClass, Set<string>> = {
    "JHS 1": new Set(),
    "JHS 2": new Set(),
    "JHS 3": new Set(),
  };

  const nameByKey = new Map<string, string>();

  for (const a of assignments) {
    nameByKey.set(a.subjectKey, a.subject);
    for (const cls of a.classes) {
      byClass[cls].add(a.subjectKey);
    }
  }

  return { byClass, nameByKey };
}