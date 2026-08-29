function clean(raw: unknown) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function compactAlphaNum(raw: unknown) {
  return clean(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeTeachingLevel(raw: unknown): string {
  const s = clean(raw);
  if (!s) return "";

  let m =
    s.match(/^KG\s*([12])([A-Z])?$/i) ||
    s.match(/^KG([12])([A-Z])?$/i) ||
    s.match(/^K\.?G\.?\s*([12])([A-Z])?$/i);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])([A-Z])?$/i) ||
    s.match(/^JHS([1-3])([A-Z])?$/i) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])([A-Z])?$/i);
  if (m) return `JHS ${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])([A-Z])?$/i) ||
    s.match(/^BASIC([7-9])([A-Z])?$/i) ||
    s.match(/^B\s*([7-9])([A-Z])?$/i) ||
    s.match(/^B([7-9])([A-Z])?$/i) ||
    s.match(/^BS\s*([7-9])([A-Z])?$/i) ||
    s.match(/^BS([7-9])([A-Z])?$/i);
  if (m) {
    const basic = Number(m[1]);
    const jhs = basic - 6;
    if (jhs >= 1 && jhs <= 3) return `JHS ${jhs}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])([A-Z])?$/i) ||
    s.match(/^BASIC([1-6])([A-Z])?$/i) ||
    s.match(/^B\s*([1-6])([A-Z])?$/i) ||
    s.match(/^B([1-6])([A-Z])?$/i) ||
    s.match(/^PRIMARY\s*([1-6])([A-Z])?$/i) ||
    s.match(/^PRIMARY([1-6])([A-Z])?$/i) ||
    s.match(/^P\s*([1-6])([A-Z])?$/i) ||
    s.match(/^P([1-6])([A-Z])?$/i);
  if (m) return `Basic ${m[1]}`;

  return s;
}

const SUBJECT_CANONICAL_KEY: Record<string, string> = {
  MATH: "MATHEMATICS",
  MATHS: "MATHEMATICS",
  MATHEMATICS: "MATHEMATICS",

  SCIENCE: "SCIENCE",
  INTEGRATEDSCIENCE: "SCIENCE",
  INTSCIENCE: "SCIENCE",

  ENGLISH: "ENGLISH",
  ENGLISHLANGUAGE: "ENGLISH",

  OWOP: "OWOP",
  OURWORLDOURPEOPLE: "OWOP",

  RME: "RME",
  RELIGIOUSANDMORALEDUCATION: "RME",

  ICT: "COMPUTING",
  COMPUTING: "COMPUTING",
};

function canonicalSubjectKey(raw: unknown) {
  const key = compactAlphaNum(raw);
  return SUBJECT_CANONICAL_KEY[key] ?? key;
}

type SubjectIdentity = {
  level: string | null;
  subject: string;
  key: string;
};

function splitLevelQualifiedSubject(raw: unknown): SubjectIdentity {
  const value = clean(raw);
  if (!value) return { level: null, subject: "", key: "" };

  const patterns = [
    /^(KG\s*[12]|K\.?G\.?\s*[12])\s*(?:[-:]\s*|\s+)(.+)$/i,
    /^(JHS\s*[1-3]|J\.?H\.?S\.?\s*[1-3])\s*(?:[-:]\s*|\s+)(.+)$/i,
    /^(BASIC\s*[1-9]|BS\s*[1-9]|B\s*[1-9]|PRIMARY\s*[1-6]|P\s*[1-6])\s*(?:[-:]\s*|\s+)(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const level = normalizeTeachingLevel(match[1]);
    const subject = clean(match[2]);

    if (level && subject) {
      return {
        level,
        subject,
        key: canonicalSubjectKey(subject),
      };
    }
  }

  return {
    level: null,
    subject: value,
    key: canonicalSubjectKey(value),
  };
}

/**
 * Compares two subject labels inside one already-authorized teaching level.
 *
 * Examples for scopeLevel = "JHS 1":
 * - "Creative Arts and Design" == "JHS 1 Creative Arts and Design"
 * - "Computing" == "JHS 1 ICT"
 * - "Creative Arts and Design" != "JHS 2 Creative Arts and Design"
 *
 * Level-qualified curriculum names are preserved in storage. This function
 * only reconciles them with generic teacher-assignment labels at the boundary.
 */
export function subjectMatchesTeachingScope(
  a: unknown,
  b: unknown,
  scopeLevel?: unknown
) {
  const left = splitLevelQualifiedSubject(a);
  const right = splitLevelQualifiedSubject(b);

  if (!left.key || !right.key || left.key !== right.key) return false;

  if (left.level && right.level) {
    return left.level === right.level;
  }

  const embeddedLevel = left.level ?? right.level;
  if (!embeddedLevel) return true;

  const normalizedScope = normalizeTeachingLevel(scopeLevel);
  return !!normalizedScope && normalizedScope === embeddedLevel;
}

export function subjectAllowedInTeachingScope(
  subject: unknown,
  allowedSubjects: string[] | null,
  scopeLevel?: unknown
) {
  if (!Array.isArray(allowedSubjects)) return true;
  if (allowedSubjects.length === 0) return false;

  return allowedSubjects.some((allowed) =>
    subjectMatchesTeachingScope(allowed, subject, scopeLevel)
  );
}
