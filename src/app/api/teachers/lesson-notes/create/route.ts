// src/app/api/teachers/lesson-notes/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANONICAL_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type CanonicalTerm = (typeof CANONICAL_TERMS)[number];

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeTerm(raw: unknown): CanonicalTerm | null {
  const s = cleanStr(raw);
  if (!s) return null;

  const lc = s.toLowerCase().trim();

  // Normalize “Term 1”, “term1”, “Term-1”, “term 1”, etc.
  const compact = lc.replace(/[\s._-]+/g, "");

  // Already canonical?
  for (const t of CANONICAL_TERMS) {
    if (t.toLowerCase() === lc) return t;
    if (t.toLowerCase().replace(/\s+/g, "") === compact) return t;
  }

  // Common variants
  if (
    compact === "1" ||
    compact === "t1" ||
    compact === "term1" ||
    compact === "firstterm" ||
    compact === "1stterm"
  )
    return "1st Term";

  if (
    compact === "2" ||
    compact === "t2" ||
    compact === "term2" ||
    compact === "secondterm" ||
    compact === "2ndterm"
  )
    return "2nd Term";

  if (
    compact === "3" ||
    compact === "t3" ||
    compact === "term3" ||
    compact === "thirdterm" ||
    compact === "3rdterm"
  )
    return "3rd Term";

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

    // client may send these, but we will enforce scope from TeacherProfile
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

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function uniq(list: string[]) {
  return Array.from(new Set(list.map((x) => cleanStr(x)).filter(Boolean)));
}

type JhsAssignment = { subject: string; classes: string[] };

function parseJhsAssignments(v: unknown): JhsAssignment[] {
  if (!Array.isArray(v)) return [];
  const out: JhsAssignment[] = [];

  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const r = row as any;
    const subject = cleanStr(r.subject);
    const classes = Array.isArray(r.classes)
      ? r.classes.map((c: any) => cleanStr(c).toUpperCase()).filter(Boolean)
      : [];

    if (subject && classes.length) out.push({ subject, classes: uniq(classes) });
  }

  const by = new Map<string, Set<string>>();
  for (const a of out) {
    const key = a.subject.toLowerCase();
    const set = by.get(key) ?? new Set<string>();
    a.classes.forEach((c) => set.add(c));
    by.set(key, set);
  }

  return Array.from(by.entries()).map(([k, set]) => ({
    subject: out.find((x) => x.subject.toLowerCase() === k)?.subject ?? k,
    classes: Array.from(set.values()).sort(),
  }));
}

export async function POST(req: NextRequest) {
  // Auth
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

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid request body.",
    });
  }

  // Membership gate
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "Forbidden (membership inactive)." });
  }

  // TeacherProfile gate + scope
  const tp = await prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: { tenantId: ctx.tenantId, userId: ctx.userId },
    },
    select: {
      phase: true,
      classLevel: true,
      jhsAssignments: true,
      primaryClassroomId: true,
    },
  });

  if (!tp) return json(400, { ok: false, error: "Missing teacher profile." });

  const phase = String(tp.phase); // authoritative
  const subject = parsed.data.subject;
// ✅ safe cast: BodySchema already validated term is canonical
const term = parsed.data.term as CanonicalTerm;
const academicYear = parsed.data.academicYear;
  const weekNumber = parsed.data.weekNumber;

  // Determine level authoritatively
  let level: string | null = null;

  if (phase === "KG" || phase === "PRIMARY") {
    level = cleanStr(tp.classLevel) || null;
    if (!level) return json(400, { ok: false, error: "Teacher class level is not set." });

    const allowed = await prisma.curriculumSubject.findFirst({
      where: { isActive: true, level, name: { equals: subject, mode: "insensitive" } },
      select: { id: true },
    });
    if (!allowed) {
      return json(400, {
        ok: false,
        error: `Subject "${subject}" is not allowed for level "${level}".`,
      });
    }
  } else if (phase === "JHS") {
    const requestedLevel = cleanStr((raw as any)?.level ?? parsed.data.level).toUpperCase();
    if (!requestedLevel) return json(400, { ok: false, error: "Class/level is required for JHS." });

    const assigns = parseJhsAssignments(tp.jhsAssignments);
    const allowedLevels = uniq(assigns.flatMap((a) => a.classes.map((c) => c.toUpperCase())));

    if (!allowedLevels.includes(requestedLevel)) {
      return json(400, { ok: false, error: `Level "${requestedLevel}" is not in your assigned scope.` });
    }

    const subjectsForLevel = uniq(
      assigns
        .filter((a) => a.classes.map((c) => c.toUpperCase()).includes(requestedLevel))
        .map((a) => a.subject)
    );

    const ok = subjectsForLevel.some((s) => s.toLowerCase() === subject.toLowerCase());
    if (!ok) {
      return json(400, {
        ok: false,
        error: `Subject "${subject}" is not assigned for "${requestedLevel}".`,
      });
    }

    level = requestedLevel;
  } else {
    level = cleanStr((raw as any)?.level ?? parsed.data.level) || null;
  }

  // Back-compat: if older rows exist using "Term 2", prevent duplicates.
  const termCandidates = [term, legacyTerm(term)];

  // Basic idempotency: prevent double-click duplicates within 2 minutes
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
    select: { id: true },
  });

  if (existing?.id) {
    return json(200, { ok: true, lessonNoteId: existing.id });
  }

  try {
    const created = await prisma.lessonNote.create({
      data: {
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        classroomId: tp.primaryClassroomId ?? null,

        phase,
        level,
        subject,
        term, // ✅ always store canonical now
        academicYear,
        weekNumber,

        // Required columns in your schema (must NOT be null)
        strand: "",
        substrand: "",

        // Optional fields start empty
        contentStandard: null,
        indicator: null,
        lessonTitle: null,
        objectives: null,
        priorKnowledge: null,
        teachingLearningResources: null,
        introduction: null,
        lessonDevelopment: null,
        conclusion: null,
        assessment: null,
        homework: null,
        differentiationNotes: null,
        reflectionNotes: null,

        status: "DRAFT",
        headteacherComment: null,
      } as any,
      select: { id: true },
    });

    return json(200, { ok: true, lessonNoteId: created.id });
  } catch (e) {
    console.error("[LESSON_NOTE_CREATE_ERROR]", e);
    return json(500, { ok: false, error: "Failed to create lesson note. Please try again." });
  }
}
