// src/lib/studentImport.ts
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { normalizeArmNorm, normalizeNameNorm } from "@/lib/normalize";

export type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

export type ParsedBulkStudentRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  classLabel: string | null;
  gender: string | null;
  note: string | null;
};

export type PreviewIssue = {
  rowNumber: number;
  reasons: string[];
  row: ParsedBulkStudentRow;
};

export type PreviewResult = {
  headerError: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  rows: ParsedBulkStudentRow[];
  issues: PreviewIssue[];
};

function clean(v: unknown, maxLen = 160) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function optional(v: unknown, maxLen = 160) {
  const s = clean(v, maxLen);
  return s ? s : null;
}

function normalizeHeader(raw: string) {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Minimal CSV parser (handles quotes + commas; enough for paste import)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch === "\r") continue;

    cell += ch;
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);

  return rows;
}

const HEADER_ALIASES: Record<string, keyof ParsedBulkStudentRow | null> = {
  firstname: "firstName",
  first: "firstName",
  givenname: "firstName",

  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",

  guardianname: "guardianName",
  guardian: "guardianName",
  parentname: "guardianName",
  parent: "guardianName",

  guardianphone: "guardianPhone",
  parentphone: "guardianPhone",
  phone: "guardianPhone",
  mobile: "guardianPhone",

  class: "classLabel",
  classroom: "classLabel",
  classlabel: "classLabel",
  classroomlabel: "classLabel",
  grade: "classLabel",

  gender: "gender",
  sex: "gender",

  note: "note",
  notes: "note",
  remarks: "note",
};

export function parseBulkStudentCsv(text: string): {
  headerError: string | null;
  rows: ParsedBulkStudentRow[];
  totalRows: number;
} {
  const matrix = parseCsv(text);
  if (!matrix.length) return { headerError: null, rows: [], totalRows: 0 };

  const header = matrix[0].map((h) => normalizeHeader(h));
  const indexMap: Partial<Record<keyof ParsedBulkStudentRow, number>> = {};

  header.forEach((h, idx) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped) indexMap[mapped] = idx;
  });

  if (indexMap.firstName == null || indexMap.lastName == null) {
    return {
      headerError: "CSV must include header columns for firstName and lastName.",
      rows: [],
      totalRows: Math.max(0, matrix.length - 1),
    };
  }

  const out: ParsedBulkStudentRow[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const r = matrix[i];
    const rowNumber = i + 1;

    const firstName = clean(r[indexMap.firstName] ?? "", 80);
    const lastName = clean(r[indexMap.lastName] ?? "", 80);

    const parsed: ParsedBulkStudentRow = {
      rowNumber,
      firstName,
      lastName,
      guardianName: optional(indexMap.guardianName != null ? r[indexMap.guardianName] : "", 120),
      guardianPhone: optional(indexMap.guardianPhone != null ? r[indexMap.guardianPhone] : "", 32),
      classLabel: optional(indexMap.classLabel != null ? r[indexMap.classLabel] : "", 80),
      gender: optional(indexMap.gender != null ? r[indexMap.gender] : "", 32),
      note: optional(indexMap.note != null ? r[indexMap.note] : "", 500),
    };

    const blank =
      !parsed.firstName &&
      !parsed.lastName &&
      !parsed.guardianName &&
      !parsed.guardianPhone &&
      !parsed.classLabel &&
      !parsed.gender &&
      !parsed.note;

    if (!blank) out.push(parsed);
  }

  return { headerError: null, rows: out, totalRows: out.length };
}

/**
 * Build a token->IDs map.
 * - If token resolves to multiple classroom IDs => ambiguous label.
 */
export function buildClassroomLookup(classes: ClassroomLite[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const add = (token: string, id: string) => {
    if (!token) return;
    const list = map.get(token) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(token, list);
  };

  for (const c of classes) {
    const nameNorm = normalizeNameNorm(c.name ?? "", 32);
    const gradeNorm = normalizeNameNorm(c.grade ?? "", 32);
    const armNorm = normalizeArmNorm(c.arm ?? "", 8);

    // Single token match (e.g., "KG1", "B1", "JHS2")
    add(nameNorm, c.id);
    add(gradeNorm, c.id);

    // Combined match (e.g., "B1A", "B1 A")
    if (armNorm) {
      add(`${nameNorm}${armNorm}`, c.id);
      add(`${gradeNorm}${armNorm}`, c.id);
      add(`${nameNorm}ARM${armNorm}`, c.id);
      add(`${gradeNorm}ARM${armNorm}`, c.id);
    }
  }

  return map;
}

export function resolveClassroomId(
  classLabel: string | null | undefined,
  lookup: Map<string, string[]>
): { classroomId: string | null; error: string | null } {
  const raw = String(classLabel ?? "").trim();
  if (!raw) return { classroomId: null, error: null };

  const token = normalizeNameNorm(raw, 48);
  if (!token) return { classroomId: null, error: "INVALID_CLASS_LABEL" };

  const ids = lookup.get(token) ?? [];
  if (ids.length === 1) return { classroomId: ids[0], error: null };
  if (ids.length > 1) return { classroomId: null, error: "AMBIGUOUS_CLASS_LABEL" };

  return { classroomId: null, error: "UNKNOWN_CLASS_LABEL" };
}

export function buildStudentDuplicateKey(args: {
  firstName: string;
  lastName: string;
  classroomId: string | null;
  guardianName: string | null;
  guardianPhoneNorm: string | null;
}) {
  return [
    normalizeNameNorm(args.firstName, 80),
    normalizeNameNorm(args.lastName, 80),
    args.classroomId ?? "",
    normalizeNameNorm(args.guardianName ?? "", 120),
    args.guardianPhoneNorm ?? "",
  ].join("|");
}

export function previewBulkStudentImport(text: string, classes: ClassroomLite[]): PreviewResult {
  const parsed = parseBulkStudentCsv(text);

  if (parsed.headerError) {
    return {
      headerError: parsed.headerError,
      totalRows: parsed.totalRows,
      validCount: 0,
      invalidCount: parsed.totalRows,
      duplicateCount: 0,
      rows: [],
      issues: [],
    };
  }

  const lookup = buildClassroomLookup(classes);
  const issues: PreviewIssue[] = [];
  const seen = new Set<string>();

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const row of parsed.rows) {
    const reasons: string[] = [];

    if (!row.firstName || !row.lastName) reasons.push("MISSING_NAME");

    const guardianPhoneNorm = row.guardianPhone ? normalizeGhPhoneE164(row.guardianPhone) : null;
    if (row.guardianPhone && !guardianPhoneNorm) reasons.push("INVALID_GUARDIAN_PHONE_GH");

    const classResolved = resolveClassroomId(row.classLabel, lookup);
    if (classResolved.error) reasons.push(classResolved.error);

    const key = buildStudentDuplicateKey({
      firstName: row.firstName,
      lastName: row.lastName,
      classroomId: classResolved.classroomId,
      guardianName: row.guardianName,
      guardianPhoneNorm,
    });

    if (seen.has(key)) {
      reasons.push("DUPLICATE_IN_BATCH");
      duplicateCount += 1;
    } else {
      seen.add(key);
    }

    if (reasons.length) {
      invalidCount += 1;
      issues.push({ rowNumber: row.rowNumber, reasons, row });
    } else {
      validCount += 1;
    }
  }

  return {
    headerError: null,
    totalRows: parsed.totalRows,
    validCount,
    invalidCount,
    duplicateCount,
    rows: parsed.rows,
    issues,
  };
}