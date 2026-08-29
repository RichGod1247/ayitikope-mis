// src/app/api/teachers/lesson-notes/units/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchemeCandidate = {
  id: string;
  status: string | null;
  classroomId: string | null;
  updatedAt: Date;
};

type SchemeMatchScore = {
  s: SchemeCandidate;
  score: number;
};

type SchemeItemRow = {
  id: string;
  weekNumber: number;
  strandTitle: string | null;
  subStrandTitle: string | null;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;
  indicatorCode: string | null;
  indicatorDescription: string | null;
};

function jsonNoStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseLevelVariants(raw: unknown): string[] {
  const s = normalizeSpaces(cleanStr(raw));
  if (!s) return [];
  const out = new Set<string>();

  let m = s.match(/^JHS\s*([1-3])$/i) || s.match(/^JHS([1-3])$/i);
  if (m) {
    const j = Number(m[1]);
    const basic = 6 + j;
    [`JHS ${j}`, `JHS${j}`, `jhs ${j}`, `jhs${j}`].forEach((x) => out.add(x));
    [
      `Basic ${basic}`,
      `Basic${basic}`,
      `basic ${basic}`,
      `basic${basic}`,
      `B${basic}`,
      `B ${basic}`,
      `b${basic}`,
      `b ${basic}`,
    ].forEach((x) => out.add(x));
    return Array.from(out);
  }

  m = s.match(/^KG\s*([12])$/i) || s.match(/^KG([12])$/i);
  if (m) {
    const n = m[1];
    [`KG ${n}`, `KG${n}`, `kg ${n}`, `kg${n}`].forEach((x) => out.add(x));
    return Array.from(out);
  }

  m =
    s.match(/^Basic\s*([1-9])$/i) ||
    s.match(/^Basic([1-9])$/i) ||
    s.match(/^B\s*([1-9])$/i) ||
    s.match(/^B([1-9])$/i);

  if (m) {
    const b = Number(m[1]);
    [
      `Basic ${b}`,
      `Basic${b}`,
      `basic ${b}`,
      `basic${b}`,
      `B${b}`,
      `B ${b}`,
      `b${b}`,
      `b ${b}`,
    ].forEach((x) => out.add(x));

    if (b >= 7 && b <= 9) {
      const j = b - 6;
      [`JHS ${j}`, `JHS${j}`, `jhs ${j}`, `jhs${j}`].forEach((x) => out.add(x));
    }
    return Array.from(out);
  }

  out.add(s);
  out.add(s.toLowerCase());
  return Array.from(out);
}

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: unknown): Term | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;

  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";

  const exact = VALID_TERMS.find((t) => t.toLowerCase() === v);
  return exact ?? null;
}

function termVariants(term: Term): string[] {
  const n = term.startsWith("1") ? 1 : term.startsWith("2") ? 2 : 3;
  return Array.from(
    new Set([
      term,
      `Term ${n}`,
      `Term${n}`,
      String(n),
      term.toLowerCase(),
      `term ${n}`,
      `term${n}`,
      n === 1 ? "First Term" : n === 2 ? "Second Term" : "Third Term",
    ])
  );
}

function academicYearVariants(raw: unknown): string[] {
  const s = normalizeSpaces(cleanStr(raw));
  if (!s) return [];
  const out = new Set<string>();
  out.add(s);
  out.add(s.toLowerCase());

  const years = s.match(/(19|20)\d{2}/g) ?? [];
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
    ].forEach((x) => out.add(x));
  }

  return Array.from(out).filter(Boolean);
}

function subjectOrFilters(subject: string) {
  const s = normalizeSpaces(cleanStr(subject));
  if (!s) return [];
  return [
    { subject: { equals: s, mode: "insensitive" as const } },
    { subject: { endsWith: s, mode: "insensitive" as const } },
  ];
}

const STATUS_SCORE: Record<string, number> = {
  APPROVED: 400,
  SUBMITTED: 300,
  RETURNED: 200,
  DRAFT: 100,
};

export async function GET(req: NextRequest) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx?.userId || !ctx.tenantId) return jsonNoStore(401, { ok: false, error: "Unauthorized." });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore(403, { ok: false, error: "Forbidden (membership inactive)." });
  }

  const { searchParams } = new URL(req.url);

  const lessonNoteId = cleanStr(searchParams.get("lessonNoteId"));
  if (!lessonNoteId) return jsonNoStore(400, { ok: false, error: "lessonNoteId is required." });

  const take = clamp(Number(searchParams.get("take") ?? "80") || 80, 1, 200);
  const q = normalizeSpaces(cleanStr(searchParams.get("q")));
  const ignoreWeek = cleanStr(searchParams.get("ignoreWeek")) === "1";
  const weekOverride = parsePositiveInt(searchParams.get("weekNumber"));

  const note = await prisma.lessonNote.findFirst({
    where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
    select: {
      id: true,
      subject: true,
      level: true,
      term: true,
      academicYear: true,
      weekNumber: true,
      classroomId: true,
    },
  });
  if (!note) return jsonNoStore(404, { ok: false, error: "Lesson note not found." });

  let levelRaw = cleanStr(note.level);
  if (!levelRaw && note.classroomId) {
    const cls = await prisma.classroom.findUnique({
      where: { id: note.classroomId },
      select: { grade: true },
    });
    if (cls?.grade) levelRaw = cleanStr(cls.grade);
  }

  const subject = normalizeSpaces(cleanStr(note.subject));
  const termN = normalizeTerm(note.term);
  const academicYear = normalizeSpaces(cleanStr(note.academicYear));
  const levelV = parseLevelVariants(levelRaw);
  const termV = termN ? termVariants(termN) : [];
  const yearV = academicYearVariants(academicYear);

  const debug: any = {
    noteScope: {
      subject,
      levelRaw,
      levelVariants: levelV,
      termRaw: cleanStr(note.term),
      termNormalized: termN,
      academicYearRaw: academicYear,
      weekNumber: note.weekNumber ?? null,
    },
  };

  if (!subject || !termN || !academicYear || !levelV.length) {
    return jsonNoStore(400, { ok: false, error: "Lesson note missing scope (term/year/subject/level).", debug });
  }

  const effectiveWeek =
    ignoreWeek
      ? null
      : typeof weekOverride === "number"
        ? weekOverride
        : typeof note.weekNumber === "number"
          ? note.weekNumber
          : null;

  const subjOr = subjectOrFilters(subject);
  const levelOr = levelV.map((v) => ({ level: { equals: v, mode: "insensitive" as const } }));
  const termOr = termV.map((v) => ({ term: { equals: v, mode: "insensitive" as const } }));
  const yearOr = yearV.map((v) => ({ academicYear: { equals: v, mode: "insensitive" as const } }));

  const schemeWhere: any = {
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
    status: "APPROVED",
    AND: [{ OR: subjOr }, { OR: yearOr }, { OR: levelOr }, { OR: termOr }],
  };

  const candidates = await prisma.schemeOfWork.findMany({
    where: schemeWhere,
    take: 10,
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, classroomId: true, updatedAt: true },
  });

  debug.schemeCandidates = candidates;

  const bestScheme =
    candidates
      .map((s: SchemeCandidate) => {
        const st = String(s.status ?? "").toUpperCase();
        const statusScore = STATUS_SCORE[st] ?? 0;
        const classroomBonus =
          note.classroomId && s.classroomId && note.classroomId === s.classroomId ? 50 : 0;
        const recency = s.updatedAt ? Math.floor(s.updatedAt.getTime() / 1000) : 0;
        return { s, score: statusScore + classroomBonus + recency / 1_000_000 };
      })
      .sort((a: SchemeMatchScore, b: SchemeMatchScore) => b.score - a.score)[0]?.s ?? null;

  if (bestScheme?.id) {
    const whereItems: any = {
      schemeOfWorkId: bestScheme.id,
      ...(typeof effectiveWeek === "number" ? { weekNumber: effectiveWeek } : {}),
    };

    if (q) {
      whereItems.OR = [
        { indicatorCode: { contains: q, mode: "insensitive" } },
        { indicatorDescription: { contains: q, mode: "insensitive" } },
        { contentStandardCode: { contains: q, mode: "insensitive" } },
        { contentStandardDescription: { contains: q, mode: "insensitive" } },
        { strandTitle: { contains: q, mode: "insensitive" } },
        { subStrandTitle: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.schemeOfWorkItem.findMany({
      where: whereItems,
      take,
      orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }, { indicatorCode: "asc" }, { id: "asc" }],
      select: {
        id: true,
        weekNumber: true,
        strandTitle: true,
        subStrandTitle: true,
        contentStandardCode: true,
        contentStandardDescription: true,
        indicatorCode: true,
        indicatorDescription: true,
      },
    });

    return jsonNoStore(200, {
      ok: true,
      widened: ignoreWeek,
      schemeApplied: true,
      schemeId: bestScheme.id,
      schemeStatus: bestScheme.status,
      items: rows.map((r: SchemeItemRow) => ({
        kind: "SCHEME_ITEM",
        schemeItemId: r.id,
        schemeOfWorkItemId: r.id,
        curriculumUnitId: null,
        weekNumber: r.weekNumber,
        strandTitle: r.strandTitle ?? null,
        subStrandTitle: r.subStrandTitle ?? null,
        contentStandardCode: r.contentStandardCode ?? null,
        contentStandardDescription: r.contentStandardDescription ?? null,
        indicatorCode: r.indicatorCode ?? null,
        indicatorDescription: r.indicatorDescription ?? null,
      })),
      debug,
    });
  }

  return jsonNoStore(200, {
    ok: true,
    widened: ignoreWeek,
    schemeApplied: false,
    reason: "NO_APPROVED_SCHEME_MATCH",
    items: [],
    debug,
  });
}