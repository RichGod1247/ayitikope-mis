// src/app/api/teachers/lesson-notes/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  approvedSchemeItemMatchesScope,
  findApprovedSchemeItemForScope,
  loadOwnedSchemeItem,
} from "@/lib/lessonNotes/approvedScheme";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANONICAL_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type CanonicalTerm = (typeof CANONICAL_TERMS)[number];
type TeacherPhase = "KG" | "PRIMARY" | "JHS";
type JhsAssignment = { subject: string; classes: string[] };

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.map((x) => cleanStr(x)).filter(Boolean)));
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeTerm(raw: unknown): CanonicalTerm | null {
  const s = cleanStr(raw);
  if (!s) return null;

  const lc = s.toLowerCase().trim();
  const compact = lc.replace(/[\s._-]+/g, "");

  for (const t of CANONICAL_TERMS) {
    if (t.toLowerCase() === lc) return t;
    if (t.toLowerCase().replace(/\s+/g, "") === compact) return t;
  }

  if (
    compact === "1" ||
    compact === "t1" ||
    compact === "term1" ||
    compact === "firstterm" ||
    compact === "1stterm"
  ) {
    return "1st Term";
  }

  if (
    compact === "2" ||
    compact === "t2" ||
    compact === "term2" ||
    compact === "secondterm" ||
    compact === "2ndterm"
  ) {
    return "2nd Term";
  }

  if (
    compact === "3" ||
    compact === "t3" ||
    compact === "term3" ||
    compact === "thirdterm" ||
    compact === "3rdterm"
  ) {
    return "3rd Term";
  }

  return null;
}

function legacyTerm(term: CanonicalTerm): "Term 1" | "Term 2" | "Term 3" {
  if (term === "1st Term") return "Term 1";
  if (term === "2nd Term") return "Term 2";
  return "Term 3";
}

const TermSchema = z
  .string()
  .transform((s) => cleanStr(s))
  .transform((s) => normalizeTerm(s) ?? s)
  .refine(
    (s): s is CanonicalTerm => CANONICAL_TERMS.includes(s as CanonicalTerm),
    'Invalid term. Use "1st Term", "2nd Term", or "3rd Term".'
  );

const AcademicYearSchema = z
  .string()
  .transform((s) => cleanStr(s))
  .refine((s) => /^\d{4}\/\d{4}$/.test(s), 'Academic year must be like "2025/2026".');

const BodySchema = z
  .object({
    term: TermSchema,
    academicYear: AcademicYearSchema,
    phase: z.string().optional().nullable(),
    level: z.string().optional().nullable(),
    subject: z.string().min(1, "Subject is required.").transform((s) => s.trim()),
    weekNumber: z
      .union([z.number(), z.string()])
      .optional()
      .transform((v) => {
        if (v === undefined) return 1;
        const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
        return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : 1;
      }),
  })
  .strict();

function normalizeLevelToken(raw: unknown): string | null {
  const original = cleanStr(raw);
  if (!original) return null;

  const s = original
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();

  if (s === "KG1") return "KG1";
  if (s === "KG2") return "KG2";

  if (/^B[1-6]$/.test(s)) return s;
  if (/^P[1-6]$/.test(s)) return `B${s.slice(1)}`;
  if (/^PRIMARY[1-6]$/.test(s)) return `B${s.slice("PRIMARY".length)}`;
  if (/^BASIC[1-6]$/.test(s)) return `B${s.slice("BASIC".length)}`;

  if (/^JHS[1-3]$/.test(s)) return s;
  if (/^B[7-9]$/.test(s)) return `JHS${Number(s.slice(1)) - 6}`;
  if (/^BASIC[7-9]$/.test(s)) return `JHS${Number(s.slice("BASIC".length)) - 6}`;

  return null;
}

function canonicalDisplayLevel(raw: unknown): string | null {
  const token = normalizeLevelToken(raw);
  if (!token) {
    const fallback = cleanStr(raw);
    return fallback || null;
  }

  if (token.startsWith("KG")) return `KG ${token.slice(2)}`;
  if (token.startsWith("JHS")) return `JHS ${token.slice(3)}`;
  return token;
}

function normalizeTeacherScopedLevel(phase: TeacherPhase, raw: unknown): string | null {
  const token = normalizeLevelToken(raw);
  if (!token) return null;

  if (phase === "KG" && /^KG[1-2]$/.test(token)) return `KG ${token.slice(2)}`;
  if (phase === "PRIMARY" && /^B[1-6]$/.test(token)) return token;
  if (phase === "JHS" && /^JHS[1-3]$/.test(token)) return `JHS ${token.slice(3)}`;

  return null;
}

function levelVariants(raw: string): string[] {
  const token = normalizeLevelToken(raw);
  const out = new Set<string>();

  if (!token) {
    const s = cleanStr(raw);
    return s ? [s] : [];
  }

  if (token.startsWith("KG")) {
    const n = token.slice(2);
    [`KG ${n}`, `KG${n}`, `kg ${n}`, `kg${n}`].forEach((x) => out.add(x));
    return Array.from(out);
  }

  if (token.startsWith("JHS")) {
    const n = token.slice(3);
    const basic = Number(n) + 6;
    [
      `JHS ${n}`,
      `JHS${n}`,
      `jhs ${n}`,
      `jhs${n}`,
      `Basic ${basic}`,
      `Basic${basic}`,
      `basic ${basic}`,
      `B${basic}`,
      `B ${basic}`,
    ].forEach((x) => out.add(x));
    return Array.from(out);
  }

  if (/^B[1-6]$/.test(token)) {
    const n = token.slice(1);
    [
      `B${n}`,
      `B ${n}`,
      `Basic ${n}`,
      `Basic${n}`,
      `basic ${n}`,
      `Primary ${n}`,
      `Primary${n}`,
      `primary ${n}`,
      `P${n}`,
      `P ${n}`,
    ].forEach((x) => out.add(x));
    return Array.from(out);
  }

  return [raw];
}

function sameNormalizedLevel(a: unknown, b: unknown): boolean {
  const aa = normalizeLevelToken(a);
  const bb = normalizeLevelToken(b);
  return Boolean(aa && bb && aa === bb);
}

function parseJhsAssignments(v: unknown): JhsAssignment[] {
  if (!Array.isArray(v)) return [];

  const out: JhsAssignment[] = [];

  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;

    const subject = cleanStr(r.subject);
    const classes = Array.isArray(r.classes)
      ? r.classes.map((c) => cleanStr(c)).filter(Boolean)
      : [];

    if (subject && classes.length) {
      out.push({ subject, classes: uniq(classes) });
    }
  }

  const bySubject = new Map<string, Set<string>>();

  for (const a of out) {
    const key = a.subject.toLowerCase();
    const set = bySubject.get(key) ?? new Set<string>();
    for (const c of a.classes) set.add(c);
    bySubject.set(key, set);
  }

  return Array.from(bySubject.entries()).map(([subjectLc, classesSet]) => ({
    subject: out.find((x) => x.subject.toLowerCase() === subjectLc)?.subject ?? subjectLc,
    classes: Array.from(classesSet).sort(),
  }));
}

export async function POST(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };

  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "Content-Type must be application/json." });
  }

  const rawBody: unknown = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return json(400, {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid request body.",
    });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "Forbidden (membership inactive)." });
  }

  const tp = await prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
    },
    select: {
      phase: true,
      classLevel: true,
      jhsAssignments: true,
      primaryClassroomId: true,
    },
  });

  if (!tp) {
    return json(400, { ok: false, error: "Missing teacher profile." });
  }

  const phase = String(tp.phase) as TeacherPhase;
  const subject = parsed.data.subject;
  const term = parsed.data.term as CanonicalTerm;
  const academicYear = parsed.data.academicYear;
  const weekNumber = parsed.data.weekNumber;

  const rawLevelFromRequest = cleanStr(
    (rawBody as Record<string, unknown> | null)?.level ?? parsed.data.level
  );
  const rawLevelFallback = rawLevelFromRequest || cleanStr(tp.classLevel);

  let level: string | null = null;
  let classroomIdForCreate: string | null = null;

  if (phase === "KG" || phase === "PRIMARY") {
    level = normalizeTeacherScopedLevel(phase, rawLevelFallback);

    if (!level) {
      const phaseLabel = phase === "KG" ? "KG" : "PRIMARY";
      return json(400, {
        ok: false,
        error: `A valid ${phaseLabel} level is required.`,
      });
    }

    const levelOr = levelVariants(level).map((lv) => ({
      level: { equals: lv, mode: "insensitive" as const },
    }));

    const allowed = await prisma.curriculumSubject.findFirst({
      where: {
        isActive: true,
        name: { equals: subject, mode: "insensitive" },
        OR: levelOr,
      },
      select: { id: true },
    });

    if (!allowed) {
      return json(400, {
        ok: false,
        error: `Subject "${subject}" is not allowed for level "${level}".`,
      });
    }

    if (tp.primaryClassroomId && sameNormalizedLevel(level, tp.classLevel)) {
      classroomIdForCreate = tp.primaryClassroomId;
    }
  } else if (phase === "JHS") {
    const requestedLevel = normalizeTeacherScopedLevel("JHS", rawLevelFallback);

    if (!requestedLevel) {
      return json(400, {
        ok: false,
        error: "A valid JHS class/level is required.",
      });
    }

    const assigns = parseJhsAssignments(tp.jhsAssignments);

    const allowedLevels = uniq(
      assigns
        .flatMap((a) => a.classes)
        .map((c) => normalizeTeacherScopedLevel("JHS", c) ?? canonicalDisplayLevel(c) ?? cleanStr(c))
        .filter(Boolean)
    );

    if (!allowedLevels.includes(requestedLevel)) {
      return json(400, {
        ok: false,
        error: `Level "${requestedLevel}" is not in your assigned scope.`,
      });
    }

    const subjectsForLevel = uniq(
      assigns
        .filter((a) =>
          a.classes.some((c) => {
            const normalized = normalizeTeacherScopedLevel("JHS", c) ?? canonicalDisplayLevel(c);
            return normalized === requestedLevel;
          })
        )
        .map((a) => a.subject)
    );

    const subjectAllowed = subjectsForLevel.some(
      (s) => s.toLowerCase() === subject.toLowerCase()
    );

    if (!subjectAllowed) {
      return json(400, {
        ok: false,
        error: `Subject "${subject}" is not assigned for "${requestedLevel}".`,
      });
    }

    level = requestedLevel;
    classroomIdForCreate = null;
  } else {
    const fallbackLevel = canonicalDisplayLevel(rawLevelFallback);
    level = fallbackLevel ? fallbackLevel : null;
    classroomIdForCreate = null;
  }

  if (!level) {
    return json(409, {
      ok: false,
      code: "APPROVED_SCHEME_REQUIRED",
      error:
        "An approved Scheme of Work is required before preparing lesson notes. Open Scheme of Work and complete the approval step first.",
    });
  }

  const approvedScope = {
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
    classroomId: classroomIdForCreate,
    subject,
    level,
    term,
    academicYear,
    weekNumber,
  };

  const approvedSchemeItem = await findApprovedSchemeItemForScope(approvedScope);

  if (!approvedSchemeItem) {
    return json(409, {
      ok: false,
      code: "APPROVED_SCHEME_REQUIRED",
      error:
        "No approved Scheme of Work covers this subject, class, term and week yet. Submit the Scheme of Work and wait for Headteacher approval before preparing the lesson note.",
    });
  }

  const termCandidates = [term, legacyTerm(term)];
  const now = new Date();
  const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);

  const existing = await prisma.lessonNote.findFirst({
    where: {
      tenantId: ctx.tenantId,
      teacherUserId: ctx.userId,
      term: { in: termCandidates },
      academicYear,
      weekNumber,
      subject,
      level: level ?? undefined,
      status: "DRAFT",
      createdAt: { gte: twoMinAgo },
    } as any,
    select: { id: true, schemeOfWorkItemId: true },
  });

  if (existing?.id) {
    if (existing.schemeOfWorkItemId) {
      const existingSchemeItem = await loadOwnedSchemeItem({
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        schemeItemId: existing.schemeOfWorkItemId,
      });

      if (existingSchemeItem && approvedSchemeItemMatchesScope(existingSchemeItem, approvedScope)) {
        return json(200, { ok: true, lessonNoteId: existing.id });
      }
      // Do not rewrite an existing Scheme relationship. A fresh approved-backed draft
      // is safer than silently changing the evidence anchor of an older draft.
    } else {
      await prisma.lessonNote.update({
        where: { id: existing.id },
        data: { schemeOfWorkItemId: approvedSchemeItem.id },
        select: { id: true },
      });

      return json(200, { ok: true, lessonNoteId: existing.id });
    }
  }

  try {
    const created = await prisma.lessonNote.create({
      data: {
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        ...(classroomIdForCreate ? { classroomId: classroomIdForCreate } : {}),
        phase,
        ...(level ? { level } : {}),
        subject,
        term,
        academicYear,
        weekNumber,
        schemeOfWorkItemId: approvedSchemeItem.id,
        strand: "",
        substrand: "",
        status: "DRAFT",
      },
      select: { id: true },
    });

    return json(200, { ok: true, lessonNoteId: created.id });
  } catch (e) {
    console.error("[LESSON_NOTE_CREATE_ERROR]", e);
    return json(500, {
      ok: false,
      error: "Failed to create lesson note. Please try again.",
    });
  }
}