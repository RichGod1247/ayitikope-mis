// src/app/api/teachers/lesson-notes/link-unit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function Notice(status: number, payload: any) {
  return jsonNoStore(status, payload);
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}
function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeLevel(raw: unknown) {
  const s = normalizeSpaces(cleanStr(raw));
  if (!s) return "";

  let m = s.match(/^JHS\s*([1-3])$/i) || s.match(/^JHS([1-3])$/i);
  if (m) return `JHS ${m[1]}`;

  m = s.match(/^KG\s*([12])$/i) || s.match(/^KG([12])$/i);
  if (m) return `KG${m[1]}`;

  m = s.match(/^B\s*([1-9])$/i) || s.match(/^B([1-9])$/i);
  if (m) return `Basic ${m[1]}`;

  m = s.match(/^Basic\s*([1-9])$/i) || s.match(/^Basic([1-9])$/i);
  if (m) return `Basic ${m[1]}`;

  return s;
}

function stripLeadingLevelFromSubject(raw: string) {
  const s = normalizeSpaces(cleanStr(raw));
  if (!s) return "";
  return s
    .replace(/^(JHS\s*[1-3]|JHS[1-3]|Basic\s*\d+|Basic\d+|B\s*\d+|B\d+|KG\s*[12]|KG[12])\s+/i, "")
    .trim();
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

const BodySchema = z
  .object({
    lessonNoteId: z.string().min(5),
    curriculumUnitId: z.string().min(5).optional(),
    schemeOfWorkItemId: z.string().min(5).optional(),
    schemeItemId: z.string().min(5).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const hasUnit = !!v.curriculumUnitId;
    const hasScheme = !!v.schemeOfWorkItemId || !!v.schemeItemId;
    if (!hasUnit && !hasScheme) ctx.addIssue({ code: "custom", message: "Provide curriculumUnitId or schemeOfWorkItemId." });
    if (hasUnit && hasScheme) ctx.addIssue({ code: "custom", message: "Provide only ONE: curriculumUnitId OR schemeOfWorkItemId." });
  });

function subjectOrFilters(subject: string) {
  const s = normalizeSpaces(cleanStr(subject));
  if (!s) return [];
  return [
    { subject: { equals: s, mode: "insensitive" as const } },
    { subject: { endsWith: s, mode: "insensitive" as const } },
  ];
}

async function loadSchemeItem(args: { tenantId: string; userId: string; schemeItemId: string }) {
  return prisma.schemeOfWorkItem.findFirst({
    where: {
      id: args.schemeItemId,
      scheme: { tenantId: args.tenantId, teacherUserId: args.userId },
    } as any,
    select: {
      id: true,
      weekNumber: true,
      strandTitle: true,
      subStrandTitle: true,
      contentStandardCode: true,
      contentStandardDescription: true,
      indicatorCode: true,
      indicatorDescription: true,
      scheme: { select: { subject: true, level: true, term: true } },
    },
  });
}

function normText(v: unknown) {
  return cleanStr(v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string) {
  const stop = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "from", "with", "for", "by", "at", "as"]);
  return new Set(
    normText(s)
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 3 && !stop.has(x))
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// ✅ Build multiple code variants so we don’t “miss” because of spaces/dots formatting.
function codeVariants(raw: unknown): string[] {
  const s = normalizeSpaces(cleanStr(raw));
  if (!s) return [];
  const noSpaces = s.replace(/\s+/g, "");
  const upper = s.toUpperCase();
  const upperNoSpaces = noSpaces.toUpperCase();

  const out = new Set<string>();
  [s, noSpaces, upper, upperNoSpaces].forEach((x) => x && out.add(x));
  return Array.from(out.values());
}

function termNumber(t: Term): 1 | 2 | 3 {
  return t.startsWith("1") ? 1 : t.startsWith("2") ? 2 : 3;
}

async function resolveCurriculumUnitIdFromSchemeItem(args: {
  tenantId: string;
  subject: string;
  level: string;
  term: Term;
  weekNumber: number;
  indicatorCode?: string;
  indicatorDesc?: string;
}) {
  const subjOr = subjectOrFilters(args.subject);
  const levelCanon = normalizeLevel(args.level);

  const levelVariants = new Set<string>();
  levelVariants.add(levelCanon);

  const jhs = levelCanon.match(/^JHS\s*([1-3])$/i);
  if (jhs) {
    const basic = 6 + Number(jhs[1]);
    [`Basic ${basic}`, `Basic${basic}`, `B${basic}`].forEach((x) => levelVariants.add(x));
  }
  const basicM = levelCanon.match(/^Basic\s*([7-9])$/i);
  if (basicM) {
    const j = Number(basicM[1]) - 6;
    [`JHS ${j}`, `JHS${j}`].forEach((x) => levelVariants.add(x));
  }

  const levelOr = Array.from(levelVariants).map((v) => ({ level: { equals: v, mode: "insensitive" as const } }));

  const n = termNumber(args.term);
  const termOr = [
    { term: { equals: args.term, mode: "insensitive" as const } },
    { term: { equals: `Term ${n}`, mode: "insensitive" as const } },
    { term: { equals: `TERM ${n}`, mode: "insensitive" as const } },
    ...(n === 1 ? [{ term: { equals: "First Term", mode: "insensitive" as const } }] : []),
    ...(n === 2 ? [{ term: { equals: "Second Term", mode: "insensitive" as const } }] : []),
    ...(n === 3 ? [{ term: { equals: "Third Term", mode: "insensitive" as const } }] : []),
  ];

  const baseWhere: any = {
    OR: [{ tenantId: args.tenantId }, { tenantId: null }],
    AND: [{ OR: subjOr }, { OR: levelOr }, { OR: termOr }, { weekNumber: args.weekNumber }],
  };

  // ✅ Prefer code match if possible (with variants)
  const codes = codeVariants(args.indicatorCode);
  if (codes.length) {
    const byCode = await prisma.curriculumUnit.findFirst({
      where: {
        ...baseWhere,
        AND: [...baseWhere.AND, { OR: codes.map((c) => ({ indicatorCode: { equals: c, mode: "insensitive" } })) }],
      },
      select: { id: true },
    });
    if (byCode?.id) return byCode.id;
  }

  const desc = cleanStr(args.indicatorDesc);
  if (!desc) return null;

  const candidates = await prisma.curriculumUnit.findMany({
    where: baseWhere,
    select: { id: true, indicator: true, indicatorCode: true },
    take: 120,
  });

  const targetN = normText(desc);
  const targetTokens = tokenSet(desc);

  let best: { id: string; score: number } | null = null;

  for (const c of candidates) {
    const candText = cleanStr(c.indicator) || cleanStr(c.indicatorCode);
    const candN = normText(candText);

    let score = 0;
    if (candN && (candN.includes(targetN) || targetN.includes(candN))) score = 0.95;
    else score = jaccard(targetTokens, tokenSet(candText));

    if (!best || score > best.score) best = { id: c.id, score };
  }

  return best && best.score >= 0.42 ? best.id : null;
}

export async function POST(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return Notice(401, { ok: false, error: "Unauthorized." });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return Notice(415, { ok: false, error: "Content-Type must be application/json." });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return Notice(403, { ok: false, error: "Forbidden." });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Notice(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid request body." });
  }

  const lessonNoteId = parsed.data.lessonNoteId.trim();

  const note = await prisma.lessonNote.findFirst({
    where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
    select: { id: true, status: true },
  });
  if (!note) return Notice(404, { ok: false, error: "Lesson note not found." });

  const st = String(note.status ?? "").toUpperCase();
  if (st === "SUBMITTED" || st === "APPROVED") {
    return Notice(400, { ok: false, error: "Cannot change unit while submitted/approved." });
  }

  const directUnitId = cleanStr(parsed.data.curriculumUnitId);
  if (directUnitId) {
    const unit = await prisma.curriculumUnit.findFirst({
      where: { id: directUnitId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] } as any,
      select: { id: true, strand: true, substrand: true, contentStandard: true, indicator: true },
    });
    if (!unit) return Notice(404, { ok: false, error: "Curriculum unit not found." });

    await prisma.lessonNote.update({
      where: { id: lessonNoteId },
      data: {
        curriculumUnitId: unit.id,
        schemeOfWorkItemId: null,
        strand: cleanStr(unit.strand) || "",
        substrand: cleanStr(unit.substrand) || "",
        contentStandard: cleanStr(unit.contentStandard) || null,
        indicator: cleanStr(unit.indicator) || null,
        status: "DRAFT",
      } as any,
      select: { id: true },
    });

    return Notice(200, { ok: true, lessonNoteId, curriculumUnitId: unit.id });
  }

  const schemeItemId = cleanStr(parsed.data.schemeOfWorkItemId || parsed.data.schemeItemId);
  if (!schemeItemId) return Notice(400, { ok: false, error: "Provide curriculumUnitId or schemeOfWorkItemId." });

  const item = await loadSchemeItem({ tenantId: ctx.tenantId, userId: ctx.userId, schemeItemId });
  if (!item?.scheme) return Notice(404, { ok: false, error: "Scheme item not found." });

  const schemeSubjectRaw = normalizeSpaces(cleanStr(item.scheme.subject));
  const subject = stripLeadingLevelFromSubject(schemeSubjectRaw) || schemeSubjectRaw;

  const level = normalizeLevel(item.scheme.level);
  const term = normalizeTerm(item.scheme.term);

  if (!subject || !level || !term || typeof item.weekNumber !== "number") {
    return Notice(400, { ok: false, error: "Scheme item missing scope fields (subject/level/term/week)." });
  }

  const resolvedUnitId =
    (await resolveCurriculumUnitIdFromSchemeItem({
      tenantId: ctx.tenantId,
      subject,
      level,
      term,
      weekNumber: item.weekNumber,
      indicatorCode: cleanStr(item.indicatorCode) || undefined,
      indicatorDesc: cleanStr(item.indicatorDescription) || undefined,
    })) ?? null;

  if (resolvedUnitId) {
    const unit = await prisma.curriculumUnit.findFirst({
      where: { id: resolvedUnitId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] } as any,
      select: { id: true, strand: true, substrand: true, contentStandard: true, indicator: true },
    });

    if (unit?.id) {
      await prisma.lessonNote.update({
        where: { id: lessonNoteId },
        data: {
          curriculumUnitId: unit.id,
          schemeOfWorkItemId: item.id,
          strand: cleanStr(unit.strand) || cleanStr(item.strandTitle) || "",
          substrand: cleanStr(unit.substrand) || cleanStr(item.subStrandTitle) || "",
          contentStandard: cleanStr(unit.contentStandard) || cleanStr(item.contentStandardDescription) || null,
          indicator: cleanStr(unit.indicator) || cleanStr(item.indicatorDescription) || null,
          status: "DRAFT",
        } as any,
      });

      return Notice(200, {
        ok: true,
        lessonNoteId,
        curriculumUnitId: unit.id,
        schemeOfWorkItemId: item.id,
        resolved: true,
      });
    }
  }

  const cs =
    cleanStr(item.contentStandardDescription) || (cleanStr(item.contentStandardCode) ? cleanStr(item.contentStandardCode) : "");
  const ind = cleanStr(item.indicatorDescription) || (cleanStr(item.indicatorCode) ? cleanStr(item.indicatorCode) : "");

  await prisma.lessonNote.update({
    where: { id: lessonNoteId },
    data: {
      curriculumUnitId: null,
      schemeOfWorkItemId: item.id,
      strand: cleanStr(item.strandTitle) || "",
      substrand: cleanStr(item.subStrandTitle) || "",
      contentStandard: cs || null,
      indicator: ind || null,
      status: "DRAFT",
    } as any,
  });

  return Notice(200, {
    ok: true,
    lessonNoteId,
    curriculumUnitId: null,
    schemeOfWorkItemId: item.id,
    resolved: false,
    warning: "CurriculumUnit not found for this scheme item; linked using scheme item text + schemeOfWorkItemId anchor.",
  });
}
