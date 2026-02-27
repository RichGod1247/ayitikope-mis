// src/app/api/teachers/lesson-notes/from-scheme-item/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    schemeItemId: z.string().min(1, "schemeItemId is required."),
  })
  .strict();

function json(status: number, payload: any) {
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

// ✅ FIX: accept unknown (because scheme.level is string | null)
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
      `${n}st Term`,
      `${n}nd Term`,
      `${n}rd Term`,
      term.toLowerCase(),
      `term ${n}`,
      `term${n}`,
    ])
  );
}

function levelVariants(raw: string): string[] {
  const lv = normalizeLevel(raw);
  if (!lv) return [];
  const out = new Set<string>();
  out.add(lv);

  let m = lv.match(/^JHS\s*([1-3])$/i);
  if (m) {
    out.add(`JHS${m[1]}`);
    out.add(`jhs ${m[1]}`);
    out.add(`jhs${m[1]}`);
  }

  m = lv.match(/^Basic\s*([1-9])$/i);
  if (m) {
    out.add(`Basic${m[1]}`);
    out.add(`B${m[1]}`);
    out.add(`basic ${m[1]}`);
    out.add(`basic${m[1]}`);
  }

  m = lv.match(/^KG([12])$/i);
  if (m) {
    out.add(`KG ${m[1]}`);
    out.add(`kg${m[1]}`);
    out.add(`kg ${m[1]}`);
  }

  return Array.from(out.values());
}

async function findBestCurriculumUnit(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    subject: string;
    level: string;
    term: Term;
    weekNumber: number;
    indicatorCode: string;
    indicatorDescription: string;
  }
) {
  const subject = normalizeSpaces(args.subject);
  const level = normalizeLevel(args.level);

  const levelOr = levelVariants(level).map((v) => ({
    level: { equals: v, mode: "insensitive" as const },
  }));

  const termOr = termVariants(args.term).map((v) => ({
    term: { equals: v, mode: "insensitive" as const },
  }));

  const baseAnd: any[] = [
    { OR: [{ tenantId: args.tenantId }, { tenantId: null }] },
    { subject: { equals: subject, mode: "insensitive" as const } },
    levelOr.length ? { OR: levelOr } : { level: { equals: level, mode: "insensitive" as const } },
    termOr.length ? { OR: termOr } : { term: { equals: args.term, mode: "insensitive" as const } },
  ];

  const withWeek = { AND: [...baseAnd, { weekNumber: args.weekNumber }] };

  const indicatorCode = cleanStr(args.indicatorCode);
  const indicatorDesc = cleanStr(args.indicatorDescription);

  if (indicatorCode) {
    const u1 = await tx.curriculumUnit.findFirst({
      where: { ...withWeek, indicatorCode: { equals: indicatorCode, mode: "insensitive" } },
      select: {
        id: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        strandCode: true,
        substrandCode: true,
        contentStandardCode: true,
        indicatorCode: true,
      },
    });
    if (u1) return u1;
  }

  if (indicatorDesc) {
    const u2 = await tx.curriculumUnit.findFirst({
      where: { ...withWeek, indicator: { contains: indicatorDesc, mode: "insensitive" } },
      select: {
        id: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        strandCode: true,
        substrandCode: true,
        contentStandardCode: true,
        indicatorCode: true,
      },
    });
    if (u2) return u2;
  }

  if (indicatorCode) {
    const u3 = await tx.curriculumUnit.findFirst({
      where: { AND: baseAnd, indicatorCode: { equals: indicatorCode, mode: "insensitive" } },
      select: {
        id: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        strandCode: true,
        substrandCode: true,
        contentStandardCode: true,
        indicatorCode: true,
      },
    });
    if (u3) return u3;
  }

  return null;
}

export async function POST(req: Request) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "Forbidden (membership inactive)." });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid request body." });
  }

  const schemeItemId = parsed.data.schemeItemId.trim();

  const tp = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { phase: true },
  });

  const item = await prisma.schemeOfWorkItem.findFirst({
    where: { id: schemeItemId, scheme: { tenantId: ctx.tenantId, teacherUserId: ctx.userId } },
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
      scheme: { select: { id: true, subject: true, level: true, term: true, academicYear: true, classroomId: true } },
    },
  });

  if (!item || !item.scheme) return json(404, { ok: false, error: "Scheme item not found." });

  const scheme = item.scheme;
  const subject = normalizeSpaces(cleanStr(scheme.subject));
  const level = normalizeLevel(scheme.level);
  const termMaybe = normalizeTerm(scheme.term);
  const academicYear = normalizeSpaces(cleanStr(scheme.academicYear));

  if (!subject || !level || !termMaybe || !academicYear) {
    return json(400, { ok: false, error: "Scheme is missing subject/level/term/academicYear." });
  }
  const term: Term = termMaybe;

  let indicatorCode = cleanStr(item.indicatorCode);
  let indicatorDesc = cleanStr(item.indicatorDescription);

  if ((!indicatorCode || !indicatorDesc) && item.indicatorId) {
    const ind = await prisma.curriculumIndicator.findFirst({
      where: { id: item.indicatorId },
      select: { code: true, description: true },
    });
    indicatorCode = indicatorCode || cleanStr(ind?.code);
    indicatorDesc = indicatorDesc || cleanStr(ind?.description);
  }

  const indicatorText = [indicatorCode, indicatorDesc].filter(Boolean).join(" — ").trim();
  const contentStdText = [item.contentStandardCode, item.contentStandardDescription].filter(Boolean).join(" — ").trim();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.lessonNote.findFirst({
        where: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          academicYear,
          subject: { equals: subject, mode: "insensitive" },
          weekNumber: item.weekNumber,
          AND: [
            { OR: termVariants(term).map((v) => ({ term: { equals: v, mode: "insensitive" as const } })) },
            { OR: levelVariants(level).map((v) => ({ level: { equals: v, mode: "insensitive" as const } })) },
          ],
        } as any,
        select: { id: true, curriculumUnitId: true, status: true },
      });

      const bestUnit = await findBestCurriculumUnit(tx, {
        tenantId: ctx.tenantId,
        subject,
        level,
        term,
        weekNumber: item.weekNumber,
        indicatorCode,
        indicatorDescription: indicatorDesc,
      });

      if (existing?.id) {
        const st = String(existing.status ?? "").toUpperCase();
        if (st === "DRAFT" || st === "REJECTED") {
          await tx.lessonNote.update({
            where: { id: existing.id },
            data: {
              curriculumUnitId: existing.curriculumUnitId ?? bestUnit?.id ?? null,
              strand: cleanStr(bestUnit?.strand) || cleanStr(item.strandTitle) || "",
              substrand: cleanStr(bestUnit?.substrand) || cleanStr(item.subStrandTitle) || "",
              contentStandard: cleanStr(bestUnit?.contentStandard) || (contentStdText || null),
              indicator: cleanStr(bestUnit?.indicator) || (indicatorText || indicatorDesc || null),
              term,
              level,
            },
            select: { id: true },
          });
        }
        return { lessonNoteId: existing.id, linkedUnitId: bestUnit?.id ?? existing.curriculumUnitId ?? null };
      }

      const created = await tx.lessonNote.create({
        data: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          classroomId: scheme.classroomId ?? null,

          subject,
          phase: tp?.phase ? String(tp.phase) : null,
          level,
          term,
          academicYear,
          weekNumber: item.weekNumber,

          curriculumUnitId: bestUnit?.id ?? null,

          strand: cleanStr(bestUnit?.strand) || cleanStr(item.strandTitle) || "",
          substrand: cleanStr(bestUnit?.substrand) || cleanStr(item.subStrandTitle) || "",

          contentStandard: cleanStr(bestUnit?.contentStandard) || (contentStdText || null),
          indicator: cleanStr(bestUnit?.indicator) || (indicatorText || indicatorDesc || null),

          status: "DRAFT",
          headteacherComment: null,
        },
        select: { id: true, curriculumUnitId: true },
      });

      return { lessonNoteId: created.id, linkedUnitId: created.curriculumUnitId ?? null };
    });

    return json(200, { ok: true, lessonNoteId: result.lessonNoteId, linkedUnitId: result.linkedUnitId });
  } catch (e) {
    console.error("[LESSON_NOTE_FROM_SCHEME_ITEM_ERROR]", e);
    return json(500, { ok: false, error: "Failed to create lesson note from scheme item. Please try again." });
  }
}
