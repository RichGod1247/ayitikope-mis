// src/app/api/teachers/lesson-notes/generate-from-curriculum/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IndicatorSlice = { indicatorId: string };

type GenerateLessonNoteBody = {
  classroomId?: string | null;

  phase: string;
  level: string;
  subject: string;

  term: string;
  academicYear: string;

  weekNumber: number | string;
  lessonDate?: string | null;

  // ✅ NOW OPTIONAL: step 1 draft doesn’t need this; step 2 links scheme-aligned slice.
  slice?: IndicatorSlice | null;
};

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
type LessonNoteStatus = (typeof VALID_STATUSES)[number];

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asTrimmedString(v: unknown): string | null {
  if (!isNonEmptyString(v)) return null;
  return v.trim();
}

function parsePositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseOptionalDate(v: unknown): Date | null {
  if (!isNonEmptyString(v)) return null;
  const s = v.trim();
  if (!s) return null;

  // Accept "YYYY-MM-DD" or full ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

type JhsAssignmentRow = { subject: string; classes: string[] };

function normalizeKey(s: string) {
  return String(s ?? "")
    .trim()
    .toUpperCase();
}

function normalizeClassKey(s: string) {
  // Compare both "JHS 1" and "JHS1" safely
  return normalizeKey(s).replace(/\s+/g, "");
}

function parseJhsAssignmentRows(j: any): JhsAssignmentRow[] {
  if (!Array.isArray(j)) return [];

  const rows: JhsAssignmentRow[] = [];
  for (const row of j) {
    const subject = typeof row?.subject === "string" ? row.subject.trim() : "";
    const classesRaw = row?.classes;

    const classes = Array.isArray(classesRaw)
      ? classesRaw
          .map((c: any) => (typeof c === "string" ? c.trim() : ""))
          .filter(Boolean)
      : [];

    if (!subject || classes.length === 0) continue;

    // Keep both raw and normalized matching ability later
    rows.push({
      subject,
      classes: uniqStrings(classes),
    });
  }

  return rows;
}

function isPlausibleId(id: string) {
  if (!id) return false;
  if (id.length < 5 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
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

function normalizeAcademicYear(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  if (/^\d{4}\/\d{4}$/.test(v)) return v;
  return null;
}

// ✅ NEW: JHS must match subject + class assignment (not just class)
async function assertTeacherCanAccessClassroomAndSubject(opts: {
  tenantId: string;
  userId: string;
  classroomId: string;
  subject: string;
}) {
  const { tenantId, userId, classroomId, subject } = opts;

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId },
    select: { id: true, name: true, grade: true },
  });
  if (!classroom) return { ok: false as const, status: 404, error: "Classroom not found." };

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!membership) return { ok: false as const, status: 403, error: "Forbidden." };

  const roleName = String(membership.role?.name ?? "").toUpperCase();
  const isAdminLike = roleName.includes("ADMIN") || roleName.includes("HEAD");
  if (isAdminLike) return { ok: true as const, classroom };

  const teacherProfile = await prisma.teacherProfile.findFirst({
    where: { tenantId, userId },
    select: { phase: true, classLevel: true, jhsAssignments: true },
  });
  if (!teacherProfile) return { ok: false as const, status: 403, error: "Teacher profile not found for this tenant." };

  if (teacherProfile.phase === "JHS") {
    const rows = parseJhsAssignmentRows(teacherProfile.jhsAssignments);
    if (rows.length === 0) return { ok: false as const, status: 403, error: "Forbidden." };

    const reqSubjectKey = normalizeKey(subject);

    const gradeRaw = String(classroom.grade ?? "");
    const nameRaw = String(classroom.name ?? "");

    const gradeKeyA = normalizeKey(gradeRaw);
    const nameKeyA = normalizeKey(nameRaw);

    const gradeKeyB = normalizeClassKey(gradeRaw);
    const nameKeyB = normalizeClassKey(nameRaw);

    const ok = rows.some((r) => {
      if (normalizeKey(r.subject) !== reqSubjectKey) return false;

      const clsKeysA = r.classes.map((c) => normalizeKey(c));
      const clsKeysB = r.classes.map((c) => normalizeClassKey(c));

      return (
        clsKeysA.includes(gradeKeyA) ||
        clsKeysA.includes(nameKeyA) ||
        clsKeysB.includes(gradeKeyB) ||
        clsKeysB.includes(nameKeyB)
      );
    });

    if (!ok) return { ok: false as const, status: 403, error: "Forbidden." };
    return { ok: true as const, classroom };
  }

  const classLevel = String(teacherProfile.classLevel ?? "").trim();
  if (!classLevel) return { ok: false as const, status: 403, error: "Forbidden." };

  const match =
    String(classroom.grade ?? "").trim() === classLevel ||
    String(classroom.name ?? "").trim() === classLevel ||
    String(classroom.name ?? "").toLowerCase().includes(classLevel.toLowerCase());

  if (!match) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const, classroom };
}

async function requireSchemePrecondition(opts: {
  tenantId: string;
  teacherUserId: string;
  term: string;
  academicYear: string;
}) {
  const { tenantId, teacherUserId, term, academicYear } = opts;

  const scheme = await prisma.schemeOfWork.findFirst({
    where: { tenantId, teacherUserId, term, academicYear },
    select: { id: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  const itemCount = scheme?._count?.items ?? 0;

  if (!scheme || itemCount <= 0) {
    return {
      ok: false as const,
      status: 409,
      error:
        "Scheme of Work is required for this term/year before generating lesson notes. Add at least one indicator to your scheme first.",
    };
  }

  return { ok: true as const, schemeId: scheme.id, itemCount };
}

export async function GET() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(req: NextRequest) {
  // Auth
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body: GenerateLessonNoteBody | null = null;
  try {
    body = (await req.json()) as GenerateLessonNoteBody;
  } catch {
    body = null;
  }
  if (!body) return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const phase = asTrimmedString(body.phase);
  const level = asTrimmedString(body.level);
  const subject = asTrimmedString(body.subject);

  const termNorm = normalizeTerm(body.term);
  const academicYearNorm = normalizeAcademicYear(body.academicYear);

  const weekNumber = parsePositiveInt(body.weekNumber);
  const classroomId = asTrimmedString(body.classroomId) ?? null;

  if (!phase || !level || !subject) {
    return jsonNoStore({ ok: false, error: "phase, level and subject are required." }, { status: 400 });
  }
  if (!termNorm || !academicYearNorm) {
    return jsonNoStore(
      { ok: false, error: "term and academicYear are required (e.g. 1st Term, 2025/2026)." },
      { status: 400 }
    );
  }
  if (!weekNumber) {
    return jsonNoStore({ ok: false, error: "weekNumber must be a positive whole number." }, { status: 400 });
  }

  const lessonDateValue = parseOptionalDate(body.lessonDate);

  // ✅ Classroom + subject access enforcement (if classroomId provided)
  if (classroomId) {
    const access = await assertTeacherCanAccessClassroomAndSubject({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      classroomId,
      subject,
    });
    if (!access.ok) return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  // ✅ Server-enforced scheme gate (precondition)
  const schemeOk = await requireSchemePrecondition({
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
    term: termNorm,
    academicYear: academicYearNorm,
  });
  if (!schemeOk.ok) return jsonNoStore({ ok: false, error: schemeOk.error }, { status: schemeOk.status });

  // ✅ Universal idempotency: one note per teacher+classroom+subject+term+year+week
  const existing = await prisma.lessonNote.findFirst({
    where: {
      tenantId: ctx.tenantId,
      teacherUserId: ctx.userId,
      classroomId,
      subject,
      term: termNorm,
      academicYear: academicYearNorm,
      weekNumber,
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const st = String(existing.status ?? "").toUpperCase() as LessonNoteStatus;

    if (st === "SUBMITTED" || st === "APPROVED") {
      return jsonNoStore(
        {
          ok: false,
          error: `A lesson note already exists for this selection and is ${st}. You cannot generate a new one. Open the existing note instead.`,
          code: "LESSON_NOTE_LOCKED",
          existing: { id: existing.id, status: st },
        },
        { status: 409 }
      );
    }

    return jsonNoStore(
      {
        ok: true,
        reused: true,
        item: { id: existing.id },
        note: { id: existing.id },
        existing: { id: existing.id, status: st || "DRAFT" },
      },
      { status: 200 }
    );
  }

  // ✅ If slice provided, validate it; otherwise create draft without curriculum link.
  const indicatorIdRaw = body.slice?.indicatorId;

  // --- Branch A: NO SLICE (draft only) ---
  if (!isNonEmptyString(indicatorIdRaw)) {
    const aiPlanStub = {
      generator: "draft-no-slice",
      createdAt: new Date().toISOString(),
      phase,
      level,
      subject,
      term: termNorm,
      academicYear: academicYearNorm,
      weekNumber,
      notes: "Draft created without curriculum slice. Step 2 must link scheme-aligned topic/indicator.",
    };

    try {
      const note = await prisma.lessonNote.create({
        data: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          headteacherUserId: null,
          classroomId,

          phase,
          level,
          curriculumUnitId: null,

          subject,
          term: termNorm,
          academicYear: academicYearNorm,
          weekNumber,
          lessonDate: lessonDateValue,

          strand: "",
          substrand: "",
          contentStandard: "",
          indicator: "",
          lessonTitle: `${subject} — Week ${weekNumber}`,

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
          submittedAt: null,
          reviewedAt: null,
          approvedAt: null,
          rejectedAt: null,

          aiPlanJson: aiPlanStub,
          aiPlanVersion: 1,
        },
        select: { id: true, createdAt: true },
      });

      return jsonNoStore(
        {
          ok: true,
          reused: false,
          item: { id: note.id },
          note: { id: note.id, createdAt: toIso(note.createdAt) },
        },
        { status: 201 }
      );
    } catch (err) {
      console.error("[GENERATE_DRAFT_LESSON_NOTE_NO_SLICE_ERROR]", err);
      return jsonNoStore(
        { ok: false, error: "Failed to generate draft lesson note." },
        { status: 500 }
      );
    }
  }

  // --- Branch B: SLICE PRESENT (old flow supported) ---
  if (!isPlausibleId(indicatorIdRaw.trim())) {
    return jsonNoStore({ ok: false, error: "slice.indicatorId is invalid." }, { status: 400 });
  }
  const indicatorId = indicatorIdRaw.trim();

  // Resolve indicator + subject ownership (global OR this tenant)
  const indicator = await prisma.curriculumIndicator.findFirst({
    where: { id: indicatorId },
    select: {
      id: true,
      code: true,
      description: true,
      contentStandard: {
        select: {
          code: true,
          description: true,
          subStrand: {
            select: {
              code: true,
              title: true,
              strand: {
                select: {
                  code: true,
                  title: true,
                  subject: {
                    select: {
                      id: true,
                      tenantId: true,
                      isGlobal: true,
                      isActive: true,
                      phase: true,
                      level: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!indicator) return jsonNoStore({ ok: false, error: "Curriculum indicator not found." }, { status: 404 });

  const owningSubject = indicator.contentStandard.subStrand.strand.subject;

  if (!owningSubject.isActive) return jsonNoStore({ ok: false, error: "Curriculum subject is disabled." }, { status: 400 });

  const allowed = owningSubject.isGlobal === true || owningSubject.tenantId === ctx.tenantId;
  if (!allowed) return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });

  // Integrity: subject metadata must match request if present
  if (owningSubject.phase && owningSubject.phase !== phase) {
    return jsonNoStore({ ok: false, error: "phase mismatch for selected curriculum indicator." }, { status: 400 });
  }
  if (owningSubject.level && owningSubject.level !== level) {
    return jsonNoStore({ ok: false, error: "level mismatch for selected curriculum indicator." }, { status: 400 });
  }
  if (owningSubject.name && owningSubject.name !== subject) {
    return jsonNoStore({ ok: false, error: "subject mismatch for selected curriculum indicator." }, { status: 400 });
  }

  // NaCCA-aligned fields
  const strandCode = indicator.contentStandard.subStrand.strand.code ?? null;
  const strandTitle = indicator.contentStandard.subStrand.strand.title ?? "Strand";

  const subStrandCode = indicator.contentStandard.subStrand.code ?? null;
  const subStrandTitle = indicator.contentStandard.subStrand.title ?? "Sub-strand";

  const contentStandardCode = indicator.contentStandard.code ?? null;
  const contentStandardDescription = indicator.contentStandard.description ?? null;

  const indicatorCode = indicator.code ?? null;
  const indicatorDescription = indicator.description ?? "";

  const lessonTitle =
    indicatorDescription.length > 120 ? `${indicatorDescription.slice(0, 117)}…` : indicatorDescription;

  // FK-correct curriculumUnitId (must reference CurriculumUnit.id)
  const curriculumUnitId = await (async () => {
    const tenantUnit = await prisma.curriculumUnit.findFirst({
      where: {
        tenantId: ctx.tenantId,
        phase,
        level,
        subject,
        term: termNorm,
        weekNumber,
        indicatorCode: indicatorCode ?? "",
      },
      select: { id: true },
    });
    if (tenantUnit) return tenantUnit.id;

    const globalUnit = await prisma.curriculumUnit.findFirst({
      where: {
        tenantId: null,
        phase,
        level,
        subject,
        term: termNorm,
        weekNumber,
        indicatorCode: indicatorCode ?? "",
      },
      select: { id: true },
    });
    if (globalUnit) return globalUnit.id;

    const created = await prisma.curriculumUnit.create({
      data: {
        tenantId: ctx.tenantId,
        phase,
        level,
        subject,
        term: termNorm,
        weekNumber,

        strandCode,
        strand: strandTitle,

        substrandCode: subStrandCode,
        substrand: subStrandTitle,

        contentStandardCode,
        contentStandard: contentStandardDescription ?? "Content standard",

        indicatorCode: indicatorCode ?? "",
        indicator: indicatorDescription,
        notes: null,
      },
      select: { id: true },
    });

    return created.id;
  })();

  const aiPlanStub = {
    generator: "curriculum-indicator-stub",
    createdAt: new Date().toISOString(),
    fromIndicatorId: indicator.id,
    curriculumUnitId,
    strandTitle,
    subStrandTitle,
    contentStandardCode,
    contentStandardDescription,
    indicatorCode,
    indicatorDescription,
    notes: "Stub plan. Replace with real AI generation when pipeline is enabled.",
  };

  try {
    const note = await prisma.lessonNote.create({
      data: {
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        headteacherUserId: null,
        classroomId,

        phase,
        level,
        curriculumUnitId,

        subject,
        term: termNorm,
        academicYear: academicYearNorm,
        weekNumber,
        lessonDate: lessonDateValue,

        strand: strandTitle,
        substrand: subStrandTitle,
        contentStandard: contentStandardDescription,
        indicator: indicatorDescription,
        lessonTitle,

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
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,

        aiPlanJson: aiPlanStub,
        aiPlanVersion: 1,
      },
      select: { id: true, createdAt: true },
    });

    return jsonNoStore(
      {
        ok: true,
        reused: false,
        item: { id: note.id },
        note: { id: note.id, createdAt: toIso(note.createdAt) },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[GENERATE_LESSON_NOTE_FROM_CURRICULUM_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: "Failed to generate lesson note from curriculum indicator." },
      { status: 500 }
    );
  }
}
