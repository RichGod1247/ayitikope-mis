// src/lib/lessonNotes/approvedScheme.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ApprovedSchemeScope = {
  tenantId: string;
  teacherUserId: string;
  subject: string;
  level: string;
  term: string;
  academicYear: string;
  weekNumber: number;
  classroomId?: string | null;
  indicatorId?: string | null;
  indicatorCode?: string | null;
};

export type ApprovedSchemeItem = {
  id: string;
  weekNumber: number;
  strandTitle: string | null;
  subStrandTitle: string | null;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;
  indicatorId: string | null;
  indicatorCode: string | null;
  indicatorDescription: string | null;
  scheme: {
    id: string;
    tenantId: string;
    teacherUserId: string;
    status: string;
    subject: string;
    level: string | null;
    term: string;
    academicYear: string;
    classroomId: string | null;
  };
};

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeSpaces(v: unknown): string {
  return cleanStr(v).replace(/\s+/g, " ").trim();
}

function normalizeCode(v: unknown): string {
  return normalizeSpaces(v).toUpperCase().replace(/\s+/g, "");
}

function stripLeadingLevelFromSubject(raw: unknown): string {
  const subject = normalizeSpaces(raw);
  if (!subject) return "";

  return subject
    .replace(
      /^(?:(?:JHS\s*[1-3]|JHS[1-3])|(?:BASIC\s*[1-9]|BASIC[1-9])|(?:BS\s*[1-9]|BS[1-9])|(?:B\s*[1-9]|B[1-9])|(?:P\s*[1-6]|P[1-6])|(?:PRIMARY\s*[1-6]|PRIMARY[1-6])|(?:KG\s*[12]|KG[12]))\s*[:\-–—]?\s*/i,
      ""
    )
    .trim();
}

function canonicalSubject(raw: unknown): string {
  const base = normalizeSpaces(raw);
  if (!base) return "";
  return (stripLeadingLevelFromSubject(base) || base).toLowerCase();
}

function subjectFilters(raw: unknown, level: unknown) {
  const original = normalizeSpaces(raw);
  const canonical = stripLeadingLevelFromSubject(original) || original;
  if (!original || !canonical) return [];

  const values = new Set<string>([original, canonical]);

  for (const levelVariant of levelVariants(level)) {
    const prefix = normalizeSpaces(levelVariant);
    if (!prefix) continue;
    values.add(`${prefix} ${canonical}`);
    values.add(`${prefix}: ${canonical}`);
    values.add(`${prefix} - ${canonical}`);
    values.add(`${prefix} – ${canonical}`);
  }

  return Array.from(values).map((subject) => ({
    subject: { equals: subject, mode: "insensitive" as const },
  }));
}

function termVariants(raw: unknown): string[] {
  const value = normalizeSpaces(raw);
  const lc = value.toLowerCase();
  let n: 1 | 2 | 3 | null = null;

  if (lc === "1" || lc === "term 1" || lc === "term1" || lc === "1st term" || lc === "first term") n = 1;
  if (lc === "2" || lc === "term 2" || lc === "term2" || lc === "2nd term" || lc === "second term") n = 2;
  if (lc === "3" || lc === "term 3" || lc === "term3" || lc === "3rd term" || lc === "third term") n = 3;

  if (!n) return value ? [value] : [];

  return Array.from(
    new Set([
      n === 1 ? "1st Term" : n === 2 ? "2nd Term" : "3rd Term",
      `Term ${n}`,
      `Term${n}`,
      String(n),
      n === 1 ? "First Term" : n === 2 ? "Second Term" : "Third Term",
    ])
  );
}

function academicYearVariants(raw: unknown): string[] {
  const value = normalizeSpaces(raw);
  if (!value) return [];

  const out = new Set<string>([value]);
  const years = value.match(/(19|20)\d{2}/g) ?? [];

  if (years.length >= 2) {
    const y1 = years[0];
    const y2 = years[1];
    [
      `${y1}/${y2}`,
      `${y1}-${y2}`,
      `${y1} / ${y2}`,
      `${y1} - ${y2}`,
      `${y1}/${y2.slice(2)}`,
      `${y1}-${y2.slice(2)}`,
    ].forEach((v) => out.add(v));
  }

  return Array.from(out);
}

function levelVariants(raw: unknown): string[] {
  const value = normalizeSpaces(raw);
  if (!value) return [];

  const out = new Set<string>();
  let match = value.match(/^JHS\s*([1-3])$/i) || value.match(/^JHS([1-3])$/i);

  if (match) {
    const j = Number(match[1]);
    const basic = 6 + j;
    [`JHS ${j}`, `JHS${j}`, `Basic ${basic}`, `Basic${basic}`, `B${basic}`, `B ${basic}`].forEach((v) => out.add(v));
    return Array.from(out);
  }

  match = value.match(/^KG\s*([12])$/i) || value.match(/^KG([12])$/i);
  if (match) {
    const n = match[1];
    [`KG ${n}`, `KG${n}`].forEach((v) => out.add(v));
    return Array.from(out);
  }

  match =
    value.match(/^Basic\s*([1-9])$/i) ||
    value.match(/^Basic([1-9])$/i) ||
    value.match(/^B\s*([1-9])$/i) ||
    value.match(/^B([1-9])$/i) ||
    value.match(/^P\s*([1-6])$/i) ||
    value.match(/^P([1-6])$/i) ||
    value.match(/^Primary\s*([1-6])$/i) ||
    value.match(/^Primary([1-6])$/i);

  if (match) {
    const basic = Number(match[1]);
    [`Basic ${basic}`, `Basic${basic}`, `B${basic}`, `B ${basic}`].forEach((v) => out.add(v));

    if (basic <= 6) {
      [`Primary ${basic}`, `Primary${basic}`, `P${basic}`, `P ${basic}`].forEach((v) => out.add(v));
    }

    if (basic >= 7 && basic <= 9) {
      const j = basic - 6;
      [`JHS ${j}`, `JHS${j}`].forEach((v) => out.add(v));
    }

    return Array.from(out);
  }

  out.add(value);
  return Array.from(out);
}

function sameSubject(a: unknown, b: unknown): boolean {
  const aa = canonicalSubject(a);
  const bb = canonicalSubject(b);
  return Boolean(aa && bb && aa === bb);
}

function sameLevel(a: unknown, b: unknown): boolean {
  const aa = levelVariants(a).map((v) => v.toLowerCase());
  const bb = new Set(levelVariants(b).map((v) => v.toLowerCase()));
  return aa.some((v) => bb.has(v));
}

function sameTerm(a: unknown, b: unknown): boolean {
  const aa = termVariants(a).map((v) => v.toLowerCase());
  const bb = new Set(termVariants(b).map((v) => v.toLowerCase()));
  return aa.some((v) => bb.has(v));
}

function sameAcademicYear(a: unknown, b: unknown): boolean {
  const aa = academicYearVariants(a).map((v) => v.toLowerCase());
  const bb = new Set(academicYearVariants(b).map((v) => v.toLowerCase()));
  return aa.some((v) => bb.has(v));
}

function itemSelect() {
  return {
    id: true,
    weekNumber: true,
    strandTitle: true,
    subStrandTitle: true,
    contentStandardCode: true,
    contentStandardDescription: true,
    indicatorId: true,
    indicatorCode: true,
    indicatorDescription: true,
    scheme: {
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        status: true,
        subject: true,
        level: true,
        term: true,
        academicYear: true,
        classroomId: true,
      },
    },
  } as const;
}

export function approvedSchemeItemMatchesScope(item: ApprovedSchemeItem, scope: ApprovedSchemeScope): boolean {
  if (item.scheme.tenantId !== scope.tenantId) return false;
  if (item.scheme.teacherUserId !== scope.teacherUserId) return false;
  if (String(item.scheme.status ?? "").toUpperCase() !== "APPROVED") return false;
  if (item.weekNumber !== scope.weekNumber) return false;
  if (!sameSubject(item.scheme.subject, scope.subject)) return false;
  if (!sameLevel(item.scheme.level, scope.level)) return false;
  if (!sameTerm(item.scheme.term, scope.term)) return false;
  if (!sameAcademicYear(item.scheme.academicYear, scope.academicYear)) return false;

  // Scheme authority is canonical per teacher + subject + level + term + year.
  // classroomId is a legacy/presentation association and is intentionally not an
  // authorization boundary: the existing Scheme writer can reuse the same Scheme
  // across same-level class sections. Classroom access is enforced separately by
  // the Lesson Note routes before this helper is called.

  const requestedIndicatorId = cleanStr(scope.indicatorId);
  const itemIndicatorId = cleanStr(item.indicatorId);
  if (requestedIndicatorId && requestedIndicatorId !== itemIndicatorId) return false;

  const requestedIndicatorCode = normalizeCode(scope.indicatorCode);
  const itemIndicatorCode = normalizeCode(item.indicatorCode);
  if (requestedIndicatorCode && requestedIndicatorCode !== itemIndicatorCode) return false;

  return true;
}

export async function loadOwnedSchemeItem(args: {
  tenantId: string;
  teacherUserId: string;
  schemeItemId: string;
}): Promise<ApprovedSchemeItem | null> {
  const item = await prisma.schemeOfWorkItem.findFirst({
    where: {
      id: args.schemeItemId,
      scheme: {
        tenantId: args.tenantId,
        teacherUserId: args.teacherUserId,
      },
    },
    select: itemSelect(),
  });

  return item as ApprovedSchemeItem | null;
}

export async function findApprovedSchemeItemForScope(scope: ApprovedSchemeScope): Promise<ApprovedSchemeItem | null> {
  const subjects = subjectFilters(scope.subject, scope.level);
  const levels = levelVariants(scope.level).map((v) => ({ level: { equals: v, mode: "insensitive" as const } }));
  const terms = termVariants(scope.term).map((v) => ({ term: { equals: v, mode: "insensitive" as const } }));
  const years = academicYearVariants(scope.academicYear).map((v) => ({
    academicYear: { equals: v, mode: "insensitive" as const },
  }));

  if (
    !subjects.length ||
    !levels.length ||
    !terms.length ||
    !years.length ||
    !Number.isInteger(scope.weekNumber) ||
    scope.weekNumber <= 0
  ) {
    return null;
  }

  const requestedClassroomId = cleanStr(scope.classroomId) || null;
  const requestedIndicatorId = cleanStr(scope.indicatorId);
  const requestedIndicatorCode = normalizeCode(scope.indicatorCode);

  const schemeWhere = {
    tenantId: scope.tenantId,
    teacherUserId: scope.teacherUserId,
    status: "APPROVED",
    AND: [{ OR: subjects }, { OR: levels }, { OR: terms }, { OR: years }],
    items: {
      some: {
        weekNumber: scope.weekNumber,
        ...(requestedIndicatorId ? { indicatorId: requestedIndicatorId } : {}),
      },
    },
  } satisfies Prisma.SchemeOfWorkWhereInput;

  const schemes = await prisma.schemeOfWork.findMany({
    where: schemeWhere,
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      status: true,
      subject: true,
      level: true,
      term: true,
      academicYear: true,
      classroomId: true,
      approvedAt: true,
      updatedAt: true,
      items: {
        where: {
          weekNumber: scope.weekNumber,
          ...(requestedIndicatorId ? { indicatorId: requestedIndicatorId } : {}),
        },
        orderBy: [{ dayNumber: "asc" }, { indicatorCode: "asc" }, { id: "asc" }],
        select: {
          id: true,
          weekNumber: true,
          strandTitle: true,
          subStrandTitle: true,
          contentStandardCode: true,
          contentStandardDescription: true,
          indicatorId: true,
          indicatorCode: true,
          indicatorDescription: true,
        },
      },
    },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });

  const ordered = [...schemes].sort((a, b) => {
    const classroomPreference = (classroomId: string | null) => {
      if (!requestedClassroomId) return 0;
      if (classroomId === requestedClassroomId) return 2;
      if (!classroomId) return 1;
      return 0;
    };

    const aClass = classroomPreference(a.classroomId);
    const bClass = classroomPreference(b.classroomId);
    if (aClass !== bClass) return bClass - aClass;

    const aApprovedAt = a.approvedAt?.getTime() ?? 0;
    const bApprovedAt = b.approvedAt?.getTime() ?? 0;
    if (aApprovedAt !== bApprovedAt) return bApprovedAt - aApprovedAt;

    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  for (const scheme of ordered) {
    if (!sameSubject(scheme.subject, scope.subject)) continue;
    if (!sameLevel(scheme.level, scope.level)) continue;
    if (!sameTerm(scheme.term, scope.term)) continue;
    if (!sameAcademicYear(scheme.academicYear, scope.academicYear)) continue;

    const items = scheme.items ?? [];
    if (!items.length) continue;

    let selected = items[0];

    if (requestedIndicatorId) {
      const exactById = items.find((item) => cleanStr(item.indicatorId) === requestedIndicatorId);
      if (!exactById) continue;
      selected = exactById;
    } else if (requestedIndicatorCode) {
      const exactByCode = items.find((item) => normalizeCode(item.indicatorCode) === requestedIndicatorCode);
      if (exactByCode) {
        selected = exactByCode;
      } else if (items.some((item) => normalizeCode(item.indicatorCode))) {
        continue;
      }
    }

    const result: ApprovedSchemeItem = {
      ...selected,
      scheme: {
        id: scheme.id,
        tenantId: scheme.tenantId,
        teacherUserId: scheme.teacherUserId,
        status: String(scheme.status ?? ""),
        subject: scheme.subject,
        level: scheme.level ?? null,
        term: scheme.term,
        academicYear: scheme.academicYear,
        classroomId: scheme.classroomId ?? null,
      },
    };

    if (approvedSchemeItemMatchesScope(result, scope)) return result;
  }

  return null;
}
