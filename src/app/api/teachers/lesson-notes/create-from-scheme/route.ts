// src/app/api/teachers/lesson-notes/create-from-scheme/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { normalizeLevelToken } from "@/lib/teacherScope";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { loadOwnedSchemeItem } from "@/lib/lessonNotes/approvedScheme";

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

function canonicalLevelDisplay(raw: unknown) {
  const token = normalizeLevelToken(raw);
  if (!token) return normalizeSpaces(cleanStr(raw));

  if (token.startsWith("JHS")) return `JHS ${token.slice(3)}`;
  if (token.startsWith("KG")) return `KG ${token.slice(2)}`;
  if (/^B[1-6]$/.test(token)) return token;

  return normalizeSpaces(cleanStr(raw));
}

function phaseFromLevel(raw: unknown) {
  const token = normalizeLevelToken(raw);
  if (!token) return null;

  if (token.startsWith("KG")) return "KG";
  if (/^B[1-6]$/.test(token)) return "PRIMARY";
  if (token.startsWith("JHS")) return "JHS";

  return null;
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
  const token = normalizeLevelToken(raw);
  const out = new Set<string>();

  if (!token) {
    const s = cleanStr(raw);
    return s ? [s] : [];
  }

  if (token.startsWith("JHS")) {
    const n = token.slice(3);
    const basic = Number(n) + 6;
    [`JHS ${n}`, `JHS${n}`, `jhs ${n}`, `jhs${n}`, `Basic ${basic}`, `Basic${basic}`, `B${basic}`, `B ${basic}`].forEach((x) =>
      out.add(x)
    );
  } else if (token.startsWith("KG")) {
    const n = token.slice(2);
    [`KG ${n}`, `KG${n}`, `kg ${n}`, `kg${n}`].forEach((x) => out.add(x));
  } else if (/^B[1-6]$/.test(token)) {
    const n = token.slice(1);
    [`B${n}`, `B ${n}`, `Basic ${n}`, `Basic${n}`, `basic ${n}`, `P${n}`, `P ${n}`].forEach((x) => out.add(x));
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
  const level = canonicalLevelDisplay(args.level);

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

function shouldReplaceTitle(existingTitle: string | null | undefined) {
  return !cleanStr(existingTitle);
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
  select: {
    status: true,
    role: { select: { name: true } },
  },
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

  const item = await loadOwnedSchemeItem({
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
    schemeItemId,
  });

  if (!item?.scheme) {
    return json(404, { ok: false, error: "Scheme item not found." });
  }

  if (String(item.scheme.status ?? "").toUpperCase() !== "APPROVED") {
    return json(409, {
      ok: false,
      code: "APPROVED_SCHEME_REQUIRED",
      error:
        "An approved Scheme of Work is required before preparing this lesson note. Submit the Scheme of Work and wait for Headteacher approval first.",
    });
  }

  const scheme = item.scheme;
  const weekNumber = Number(item.weekNumber);
  if (!Number.isFinite(weekNumber) || weekNumber <= 0) {
    return json(400, { ok: false, error: "Scheme item has an invalid weekNumber." });
  }

  const subject = normalizeSpaces(cleanStr(scheme.subject));
  const level = canonicalLevelDisplay(scheme.level);
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

  const classroomId = scheme.classroomId ?? null;

const phase = phaseFromLevel(level);

if (classroomId) {
  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: membership.role?.name ?? null,
    classroomId,
    subject,
  });

  if (!access.ok) {
    return json(access.reason === "CLASSROOM_NOT_FOUND" ? 404 : 403, {
      ok: false,
      error:
        access.reason === "SUBJECT_OUT_OF_SCOPE"
          ? "You are not assigned to create lesson notes for this subject in this class."
          : "You are not assigned to create lesson notes for this class.",
      reason: access.reason,
    });
  }
}

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.lessonNote.findFirst({
        where: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          classroomId,
          academicYear,
          subject: { equals: subject, mode: "insensitive" },
          weekNumber,
          AND: [
            { OR: termVariants(term).map((v) => ({ term: { equals: v, mode: "insensitive" as const } })) },
            { OR: levelVariants(level).map((v) => ({ level: { equals: v, mode: "insensitive" as const } })) },
          ],
        } as any,
        select: { id: true, curriculumUnitId: true, schemeOfWorkItemId: true, lessonTitle: true, status: true },
      });

      const bestUnit = await findBestCurriculumUnit(tx, {
        tenantId: ctx.tenantId,
        subject,
        level,
        term,
        weekNumber,
        indicatorCode,
        indicatorDescription: indicatorDesc,
      });

      const strandText = cleanStr(item.strandTitle) || cleanStr(bestUnit?.strand) || "";
      const subStrandText = cleanStr(item.subStrandTitle) || cleanStr(bestUnit?.substrand) || "";
      const contentStandardText =
        cleanStr(item.contentStandardDescription) || cleanStr(bestUnit?.contentStandard) || null;
      const indicatorText = indicatorDesc || cleanStr(bestUnit?.indicator) || null;
      const lessonTitle = subStrandText || indicatorText || null;

      if (existing?.id) {
        const st = String(existing.status ?? "").toUpperCase();

        if (st === "DRAFT" || st === "REJECTED") {
          await tx.lessonNote.update({
            where: { id: existing.id },
            data: {
              curriculumUnitId: existing.curriculumUnitId ?? bestUnit?.id ?? null,
              schemeOfWorkItemId: item.id,
              strand: strandText,
              substrand: subStrandText,
              contentStandard: contentStandardText,
              indicator: indicatorText,
              lessonTitle: shouldReplaceTitle(existing.lessonTitle) ? lessonTitle : existing.lessonTitle,
              term,
              level,
            },
            select: { id: true },
          });
        }

        return {
          lessonNoteId: existing.id,
          linkedUnitId: bestUnit?.id ?? existing.curriculumUnitId ?? null,
        };
      }

      const created = await tx.lessonNote.create({
        data: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          classroomId,

          subject,
          phase,
          level,
          term,
          academicYear,
          weekNumber,

          curriculumUnitId: bestUnit?.id ?? null,
          schemeOfWorkItemId: item.id,

          strand: strandText,
          substrand: subStrandText,
          contentStandard: contentStandardText,
          indicator: indicatorText,
          lessonTitle,

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