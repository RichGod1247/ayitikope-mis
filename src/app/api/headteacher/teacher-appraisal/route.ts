//src/app/api/headteacher/teacher-appraisal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { TeacherAppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppraisalStatus = "DRAFT" | "FINALIZED";
type ScoreInput = { itemKey?: string | null; score?: number | null; notApplicable?: boolean | null };

type SaveBody = {
  action?: string | null;
  id?: string | null;
  teacherUserId?: string | null;
  classroomId?: string | null;
  dateObserved?: string | null;
  classTaught?: string | null;
  term?: string | null;
  academicYear?: string | null;
  subject?: string | null;
  subStrand?: string | null;
  durationMinutes?: number | string | null;
  yearsInService?: number | string | null;
  yearsInPresentSchool?: number | string | null;
  schemeOfWorkId?: string | null;
  lessonNoteId?: string | null;
  lessonDeliveryId?: string | null;
  generalComment?: string | null;
  scores?: ScoreInput[] | null;
};

type AppraisalSection = {
  key: string;
  title: string;
  order: number;
  maxScore: number;
  items: Array<{ key: string; label: string; order: number }>;
};

const APPRAISAL_SECTIONS: AppraisalSection[] = [
  {
    key: "PREPARATION",
    title: "Measurement of Preparation of Lesson Plan",
    order: 1,
    maxScore: 35,
    items: [
      { key: "1.1", order: 1, label: "Preparation of Scheme of work (vetted and covers the term)" },
      { key: "1.2", order: 2, label: "Preparation of Learner notes (vetted, detailed, appropriate and up-to-date)" },
      { key: "1.3", order: 3, label: "Originality of Learner Notes (No signs of downloaded learner notes)" },
      { key: "1.4", order: 4, label: "Statement of adequate and appropriate core competencies" },
      { key: "1.5", order: 5, label: "Statement of appropriate/relevant TLMs in the lesson plan" },
      { key: "1.6", order: 6, label: "Statement of interactive activities in the lesson plan" },
      { key: "1.7", order: 7, label: "Coherence of stages of learner plan (well-arranged and well-paced)" },
    ],
  },
  {
    key: "LESSON_DELIVERY",
    title: "Measurement of Lesson Delivery/Instruction",
    order: 2,
    maxScore: 25,
    items: [
      { key: "2.1", order: 1, label: "Articulation of the Performance Indicators (PI) at the beginning of the lesson" },
      { key: "2.2", order: 2, label: "Clarity of explanation of content (logically sequenced, use of illustrations, use of examples to aid understanding)" },
      { key: "2.3", order: 3, label: "Linkage of pupils daily life or cultural orientation to the content of the lesson" },
      { key: "2.4", order: 4, label: "Deployment of TLMs during lesson delivery" },
      { key: "2.5", order: 5, label: "Teacher's confidence level during lesson delivery" },
    ],
  },
  {
    key: "CLASSROOM_CULTURE",
    title: "Measurement of Classroom Culture",
    order: 3,
    maxScore: 25,
    items: [
      { key: "3.1", order: 1, label: "The teacher treats all pupils with respect (e.g. teacher does not shout on pupils)" },
      { key: "3.2", order: 2, label: "The teacher uses positive language (e.g. good attempt, well done)" },
      { key: "3.3", order: 3, label: "The teacher rephrases language to promote understanding" },
      { key: "3.4", order: 4, label: "The teacher focuses on expected behaviour and redirects misbehavior" },
      { key: "3.5", order: 5, label: "The teacher recognizes learners with special needs and provides them with relevant support" },
    ],
  },
  {
    key: "LEARNER_PARTICIPATION",
    title: "Measurement of Learners' Participation During Lesson Delivery",
    order: 4,
    maxScore: 30,
    items: [
      { key: "4.1", order: 1, label: "Pupils volunteer to participate in the lesson without the teacher's prompt" },
      { key: "4.2", order: 2, label: "Learners ask questions during lesson" },
      { key: "4.3", order: 3, label: "Learners work collaboratively with each other during lesson" },
      { key: "4.4", order: 4, label: "Learners accept feedback from peers and teachers and work with them" },
      { key: "4.5", order: 5, label: "Learners have adequate learning materials (textbooks, notebooks, exercise books, pens, pencils, etc)" },
      { key: "4.6", order: 6, label: "The teacher provides learners with choices when it comes to activities" },
    ],
  },
  {
    key: "UNDERSTANDING_STRATEGIES",
    title: "Measurement of Strategies to Improve Pupils' Understanding",
    order: 5,
    maxScore: 30,
    items: [
      { key: "5.1", order: 1, label: "The teacher uses questions, prompts or other strategies to determine pupils' level of understanding" },
      { key: "5.2", order: 2, label: "The teacher distributes questions/learning task to all pupils in the class" },
      { key: "5.3", order: 3, label: "The teacher monitors pupils/students during independent/group work" },
      { key: "5.4", order: 4, label: "The teacher provides positive reinforcement (nodding, good, okay but...)" },
      { key: "5.5", order: 5, label: "The teacher links current lessons to previous lessons or knowledge in other subjects" },
      { key: "5.6", order: 6, label: "The teacher provides guidance to pupils before handing exercises/assignments" },
    ],
  },
  {
    key: "EVALUATION_STRATEGIES",
    title: "Measurement of Evaluation Strategies",
    order: 6,
    maxScore: 25,
    items: [
      { key: "6.1", order: 1, label: "Set tasks on relevant performance indicators/core competencies" },
      { key: "6.2", order: 2, label: "Marks learner's work promptly and accurately" },
      { key: "6.3", order: 3, label: "Provides feedback on learners performance (good/poor is not a good feedback)" },
      { key: "6.4", order: 4, label: "Records learner's marks in continuous assessment books/record" },
      { key: "6.5", order: 5, label: "Corrections have been done and marked" },
    ],
  },
];

const APPRAISAL_ITEMS = APPRAISAL_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    sectionKey: section.key,
    sectionTitle: section.title,
    sectionOrder: section.order,
    sectionMaxScore: section.maxScore,
  })),
);

const ITEM_MAP = new Map(APPRAISAL_ITEMS.map((i) => [i.key, i]));

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isLikelyId(id: string) {
  return /^[a-zA-Z0-9_-]{5,128}$/.test(id);
}

function requestMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

function toIsoOrNull(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(v: unknown) {
  const raw = clean(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNullableInt(v: unknown, field: string) {
  if (v == null || clean(v) === "") return { ok: true as const, value: null as number | null };
  const n = typeof v === "number" ? v : Number.parseInt(clean(v), 10);
  if (!Number.isInteger(n)) return { ok: false as const, error: `${field} must be a whole number.` };
  if (n < 0 || n > 80) return { ok: false as const, error: `${field} is outside the allowed range.` };
  return { ok: true as const, value: n };
}

function normalizeScoreInput(input: ScoreInput | undefined) {
  const notApplicable = input?.notApplicable === true;
  if (notApplicable) return { score: null as number | null, notApplicable: true };

  if (input?.score == null || input.score === ("" as any)) {
    return { score: null as number | null, notApplicable: false };
  }

  const n = Number(input.score);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error("INVALID_SCORE");
  }

  return { score: n, notApplicable: false };
}

function userName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) {
  const name = clean(u?.name);
  if (name) return name;
  const full = [clean(u?.firstName), clean(u?.lastName)].filter(Boolean).join(" ");
  if (full) return full;
  return clean(u?.email) || "Unknown user";
}

function classLabel(c: { name?: string | null; grade?: string | null; arm?: string | null } | null | undefined) {
  const name = clean(c?.name);
  const grade = clean(c?.grade);
  const arm = clean(c?.arm);
  if (name && arm && !name.toUpperCase().includes(arm.toUpperCase())) return `${name} ${arm}`;
  return name || [grade, arm].filter(Boolean).join(" ") || null;
}

function calculatePercentages(rows: Array<{ itemKey: string; score: number | null; notApplicable: boolean }>) {
  const byKey = new Map(rows.map((r) => [r.itemKey, r]));
  const sectionPercents: Record<string, number | null> = {};

  for (const section of APPRAISAL_SECTIONS) {
    let total = 0;
    let denominator = 0;

    for (const item of section.items) {
      const row = byKey.get(item.key);
      if (!row || row.notApplicable) continue;
      if (row.score == null) continue;
      total += row.score;
      denominator += 5;
    }

    sectionPercents[section.key] = denominator > 0 ? Number(((total / denominator) * 100).toFixed(2)) : null;
  }

  const valid = Object.values(sectionPercents).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const overall = valid.length ? Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2)) : null;

  return {
    preparationPercent: sectionPercents.PREPARATION,
    lessonDeliveryPercent: sectionPercents.LESSON_DELIVERY,
    classroomCulturePercent: sectionPercents.CLASSROOM_CULTURE,
    learnerParticipationPercent: sectionPercents.LEARNER_PARTICIPATION,
    understandingStrategiesPercent: sectionPercents.UNDERSTANDING_STRATEGIES,
    evaluationStrategiesPercent: sectionPercents.EVALUATION_STRATEGIES,
    overallPercentage: overall,
  };
}

function buildScoreRows(inputScores: ScoreInput[] | null | undefined, requireComplete: boolean) {
  const inputMap = new Map<string, ScoreInput>();

  for (const raw of inputScores ?? []) {
    const key = clean(raw?.itemKey);
    if (!ITEM_MAP.has(key)) throw new Error("UNKNOWN_SCORE_ITEM");
    inputMap.set(key, raw);
  }

  const rows = APPRAISAL_ITEMS.map((item) => {
    const normalized = normalizeScoreInput(inputMap.get(item.key));
    return {
      tenantId: "",
      appraisalId: "",
      sectionKey: item.sectionKey,
      sectionTitle: item.sectionTitle,
      sectionOrder: item.sectionOrder,
      sectionMaxScore: item.sectionMaxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      score: normalized.score,
      notApplicable: normalized.notApplicable,
    };
  });

  if (requireComplete) {
    const missing = rows.filter((r) => !r.notApplicable && r.score == null).map((r) => r.itemKey);
    if (missing.length) {
      const err = new Error("INCOMPLETE_SCORES");
      (err as any).missing = missing;
      throw err;
    }
  }

  return rows;
}

async function getActiveHeadteacherContext() {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") return null;
  return ctx;
}

async function getCurrentTermYear(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  return {
    term: clean(settings?.currentTerm) || null,
    academicYear: clean(settings?.currentAcademicYear) || null,
  };
}

async function loadTeacherForTenant(tenantId: string, teacherUserId: string) {
  return prisma.membership.findFirst({
    where: {
      tenantId,
      userId: teacherUserId,
      status: "ACTIVE",
      role: { name: { equals: "TEACHER", mode: "insensitive" } },
    },
    select: {
      userId: true,
      staffId: true,
      user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
      tenant: { select: { name: true, circuit: true } },
    },
  });
}

async function loadEvidence(args: {
  tenantId: string;
  teacherUserId: string;
  schemeOfWorkId: string | null;
  lessonNoteId: string | null;
  lessonDeliveryId: string | null;
}) {
  const [scheme, note, delivery] = await Promise.all([
    args.schemeOfWorkId
      ? prisma.schemeOfWork.findFirst({
          where: { id: args.schemeOfWorkId, tenantId: args.tenantId, teacherUserId: args.teacherUserId },
          select: { id: true, status: true, subject: true, level: true, term: true, academicYear: true, classroomId: true, approvedAt: true },
        })
      : Promise.resolve(null),
    args.lessonNoteId
      ? prisma.lessonNote.findFirst({
          where: { id: args.lessonNoteId, tenantId: args.tenantId, teacherUserId: args.teacherUserId },
          select: {
            id: true,
            status: true,
            subject: true,
            level: true,
            term: true,
            academicYear: true,
            classroomId: true,
            lessonTitle: true,
            substrand: true,
            schemeOfWorkItemId: true,
            approvedAt: true,
          },
        })
      : Promise.resolve(null),
    args.lessonDeliveryId
      ? prisma.lessonDelivery.findFirst({
          where: { id: args.lessonDeliveryId, tenantId: args.tenantId, teacherUserId: args.teacherUserId },
          select: {
            id: true,
            subject: true,
            term: true,
            academicYear: true,
            classroomId: true,
            lessonNoteId: true,
            dateTaught: true,
            contentStandardCode: true,
            indicatorCode: true,
            assessmentItems: {
              select: { id: true, title: true, type: true, status: true, maxScore: true, _count: { select: { scores: true } } },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (args.schemeOfWorkId && !scheme) return { ok: false as const, error: "APPROVED_SCHEME_NOT_FOUND" };
  if (scheme && scheme.status !== "APPROVED") return { ok: false as const, error: "SCHEME_NOT_APPROVED" };

  if (args.lessonNoteId && !note) return { ok: false as const, error: "APPROVED_LESSON_NOTE_NOT_FOUND" };
  if (note && note.status !== "APPROVED") return { ok: false as const, error: "LESSON_NOTE_NOT_APPROVED" };

  if (args.lessonDeliveryId && !delivery) return { ok: false as const, error: "LESSON_DELIVERY_NOT_FOUND" };
  if (delivery && note && delivery.lessonNoteId && delivery.lessonNoteId !== note.id) {
    return { ok: false as const, error: "LESSON_DELIVERY_NOTE_MISMATCH" };
  }

  const snapshot = {
    scheme: scheme
      ? { id: scheme.id, subject: scheme.subject, level: scheme.level, term: scheme.term, academicYear: scheme.academicYear, approvedAt: toIsoOrNull(scheme.approvedAt) }
      : null,
    lessonNote: note
      ? { id: note.id, subject: note.subject, level: note.level, term: note.term, academicYear: note.academicYear, lessonTitle: note.lessonTitle, substrand: note.substrand, approvedAt: toIsoOrNull(note.approvedAt) }
      : null,
    lessonDelivery: delivery
      ? {
          id: delivery.id,
          subject: delivery.subject,
          term: delivery.term,
          academicYear: delivery.academicYear,
          dateTaught: toIsoOrNull(delivery.dateTaught),
          contentStandardCode: delivery.contentStandardCode,
          indicatorCode: delivery.indicatorCode,
          assessmentItems: delivery.assessmentItems.map((a) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            status: a.status,
            maxScore: Number(a.maxScore ?? 0),
            scoresCount: a._count.scores,
          })),
        }
      : null,
  };

  return { ok: true as const, scheme, note, delivery, snapshot };
}

async function serializeAppraisal(id: string, tenantId: string) {
  const appraisal = await prisma.teacherAppraisal.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      appraiserUserId: true,
      finalizedByUserId: true,
      classroomId: true,
      dateObserved: true,
      classTaught: true,
      term: true,
      academicYear: true,
      subject: true,
      subStrand: true,
      durationMinutes: true,
      yearsInService: true,
      yearsInPresentSchool: true,
      teacherNameSnapshot: true,
      schoolNameSnapshot: true,
      circuitSnapshot: true,
      appraiserNameSnapshot: true,
      schemeOfWorkId: true,
      lessonNoteId: true,
      lessonDeliveryId: true,
      evidenceSnapshotJson: true,
      status: true,
      preparationPercent: true,
      lessonDeliveryPercent: true,
      classroomCulturePercent: true,
      learnerParticipationPercent: true,
      understandingStrategiesPercent: true,
      evaluationStrategiesPercent: true,
      overallPercentage: true,
      generalComment: true,
      finalizedAt: true,
      createdAt: true,
      updatedAt: true,
      teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
      appraiser: { select: { name: true, firstName: true, lastName: true, email: true } },
      classroom: { select: { name: true, grade: true, arm: true } },
      scores: { orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }] },
    },
  });

  if (!appraisal) return null;

  return {
    ...appraisal,
    teacherName: userName(appraisal.teacher),
    appraiserName: userName(appraisal.appraiser),
    classroomName: classLabel(appraisal.classroom),
    dateObserved: appraisal.dateObserved.toISOString().slice(0, 10),
    finalizedAt: toIsoOrNull(appraisal.finalizedAt),
    createdAt: appraisal.createdAt.toISOString(),
    updatedAt: appraisal.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const ctx = await getActiveHeadteacherContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, 401);

  const { searchParams } = new URL(req.url);
  const mode = clean(searchParams.get("mode")) || "list";

  try {
    if (mode === "rubric") {
      return jsonNoStore({ ok: true, reqId, sections: APPRAISAL_SECTIONS, scale: { na: "N/A", 1: "Very poor", 2: "Poor", 3: "Acceptable", 4: "Good", 5: "Very good" } });
    }

    if (mode === "teachers") {
      const teachers = await prisma.membership.findMany({
        where: { tenantId: ctx.tenantId, status: "ACTIVE", role: { name: { equals: "TEACHER", mode: "insensitive" } } },
        orderBy: [{ createdAt: "asc" }],
        select: {
          userId: true,
          staffId: true,
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              teacherProfiles: {
                where: { tenantId: ctx.tenantId },
                select: { phone: true, phase: true, classLevel: true, primaryClassroomId: true, primaryClassroom: { select: { id: true, name: true, grade: true, arm: true } } },
                take: 1,
              },
            },
          },
        },
      });

      return jsonNoStore({
        ok: true,
        reqId,
        teachers: teachers
          .map((m) => {
            const profile = m.user.teacherProfiles?.[0] ?? null;
            return {
              teacherUserId: m.userId,
              staffId: m.staffId ?? null,
              name: userName(m.user),
              email: m.user.email,
              phase: profile?.phase ?? null,
              classLevel: profile?.classLevel ?? null,
              primaryClassroomId: profile?.primaryClassroomId ?? null,
              primaryClassroomName: classLabel(profile?.primaryClassroom),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    if (mode === "evidence") {
      const teacherUserId = clean(searchParams.get("teacherUserId"));
      if (!teacherUserId || !isLikelyId(teacherUserId)) return jsonNoStore({ ok: false, error: "Invalid teacherUserId.", reqId }, 400);

      const teacher = await loadTeacherForTenant(ctx.tenantId, teacherUserId);
      if (!teacher) return jsonNoStore({ ok: false, error: "Teacher not found in this school.", reqId }, 404);
      if (teacher.userId === ctx.userId) return jsonNoStore({ ok: false, error: "You cannot appraise yourself.", reqId }, 403);

      const current = await getCurrentTermYear(ctx.tenantId);
      const term = clean(searchParams.get("term")) || current.term || undefined;
      const academicYear = clean(searchParams.get("academicYear")) || current.academicYear || undefined;

      const base: any = { tenantId: ctx.tenantId, teacherUserId };
      if (term) base.term = term;
      if (academicYear) base.academicYear = academicYear;

      const [schemes, notes, deliveries] = await Promise.all([
        prisma.schemeOfWork.findMany({
          where: { ...base, status: "APPROVED" },
          orderBy: [{ updatedAt: "desc" }],
          take: 50,
          select: { id: true, subject: true, level: true, term: true, academicYear: true, classroomId: true, approvedAt: true, updatedAt: true, _count: { select: { items: true } } },
        }),
        prisma.lessonNote.findMany({
          where: { ...base, status: "APPROVED" },
          orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
          take: 50,
          select: { id: true, subject: true, level: true, term: true, academicYear: true, classroomId: true, lessonTitle: true, substrand: true, weekNumber: true, approvedAt: true, updatedAt: true },
        }),
        prisma.lessonDelivery.findMany({
          where: base,
          orderBy: [{ dateTaught: "desc" }, { createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            classroomId: true,
            subject: true,
            term: true,
            academicYear: true,
            lessonNoteId: true,
            dateTaught: true,
            contentStandardCode: true,
            indicatorCode: true,
            assessmentItems: { select: { id: true, status: true, _count: { select: { scores: true } } } },
          },
        }),
      ]);

      return jsonNoStore({
        ok: true,
        reqId,
        current,
        teacher: { teacherUserId: teacher.userId, name: userName(teacher.user), staffId: teacher.staffId ?? null },
        schemes: schemes.map((s) => ({ ...s, approvedAt: toIsoOrNull(s.approvedAt), updatedAt: toIsoOrNull(s.updatedAt), itemCount: s._count.items })),
        lessonNotes: notes.map((n) => ({ ...n, approvedAt: toIsoOrNull(n.approvedAt), updatedAt: toIsoOrNull(n.updatedAt) })),
        lessonDeliveries: deliveries.map((d) => ({
          ...d,
          dateTaught: toIsoOrNull(d.dateTaught),
          assessmentItemCount: d.assessmentItems.length,
          assessmentScoreCount: d.assessmentItems.reduce((sum, a) => sum + a._count.scores, 0),
        })),
      });
    }

    const id = clean(searchParams.get("id"));
    if (id) {
      if (!isLikelyId(id)) return jsonNoStore({ ok: false, error: "Invalid appraisal id.", reqId }, 400);
      const item = await serializeAppraisal(id, ctx.tenantId);
      if (!item) return jsonNoStore({ ok: false, error: "Appraisal not found.", reqId }, 404);
      return jsonNoStore({ ok: true, reqId, item, sections: APPRAISAL_SECTIONS });
    }

    const statusRaw = clean(searchParams.get("status")).toUpperCase();
    const status = statusRaw === "FINALIZED" || statusRaw === "DRAFT" ? (statusRaw as AppraisalStatus) : null;
    const teacherUserId = clean(searchParams.get("teacherUserId"));

    const where: any = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (teacherUserId) where.teacherUserId = teacherUserId;

    const items = await prisma.teacherAppraisal.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        teacherUserId: true,
        appraiserUserId: true,
        classroomId: true,
        dateObserved: true,
        subject: true,
        classTaught: true,
        status: true,
        overallPercentage: true,
        finalizedAt: true,
        updatedAt: true,
        teacherNameSnapshot: true,
        teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
        classroom: { select: { name: true, grade: true, arm: true } },
      },
    });

    return jsonNoStore({
      ok: true,
      reqId,
      items: items.map((a) => ({
        id: a.id,
        teacherUserId: a.teacherUserId,
        teacherName: a.teacherNameSnapshot || userName(a.teacher),
        classroomId: a.classroomId,
        classroomName: classLabel(a.classroom),
        dateObserved: a.dateObserved.toISOString().slice(0, 10),
        subject: a.subject,
        classTaught: a.classTaught,
        status: a.status,
        overallPercentage: a.overallPercentage,
        finalizedAt: toIsoOrNull(a.finalizedAt),
        updatedAt: a.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("HEADTEACHER_TEACHER_APPRAISAL_GET_ERROR", { reqId, err });
    return jsonNoStore({ ok: false, error: "Failed to load teacher appraisal data.", reqId }, 500);
  }
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const ctx = await getActiveHeadteacherContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, 401);

  const raw = (await req.json().catch(() => null)) as SaveBody | null;
  if (!raw) return jsonNoStore({ ok: false, error: "Invalid JSON body.", reqId }, 400);

  const action = clean(raw.action).toLowerCase();
  const finalizing = action === "finalize";
  if (action !== "save" && action !== "finalize") {
    return jsonNoStore({ ok: false, error: "Invalid action. Use save or finalize.", reqId }, 400);
  }

  const id = clean(raw.id) || null;
  if (id && !isLikelyId(id)) return jsonNoStore({ ok: false, error: "Invalid appraisal id.", reqId }, 400);

  const teacherUserId = clean(raw.teacherUserId);
  if (!teacherUserId || !isLikelyId(teacherUserId)) return jsonNoStore({ ok: false, error: "Invalid teacherUserId.", reqId }, 400);
  if (teacherUserId === ctx.userId) return jsonNoStore({ ok: false, error: "You cannot appraise yourself.", reqId }, 403);

  const dateObserved = toDateOnly(raw.dateObserved);
  if (!dateObserved) return jsonNoStore({ ok: false, error: "Invalid dateObserved. Use YYYY-MM-DD.", reqId }, 400);

  const duration = toNullableInt(raw.durationMinutes, "Duration");
  if (!duration.ok) return jsonNoStore({ ok: false, error: duration.error, reqId }, 400);
  const yearsService = toNullableInt(raw.yearsInService, "Years in service");
  if (!yearsService.ok) return jsonNoStore({ ok: false, error: yearsService.error, reqId }, 400);
  const yearsPresent = toNullableInt(raw.yearsInPresentSchool, "Years in present school");
  if (!yearsPresent.ok) return jsonNoStore({ ok: false, error: yearsPresent.error, reqId }, 400);

  const classroomId = clean(raw.classroomId) || null;
  const schemeOfWorkId = clean(raw.schemeOfWorkId) || null;
  const lessonNoteId = clean(raw.lessonNoteId) || null;
  const lessonDeliveryId = clean(raw.lessonDeliveryId) || null;

  for (const [field, value] of Object.entries({ classroomId, schemeOfWorkId, lessonNoteId, lessonDeliveryId })) {
    if (value && !isLikelyId(value)) return jsonNoStore({ ok: false, error: `Invalid ${field}.`, reqId }, 400);
  }

  const meta = requestMeta(req);

  try {
    const teacher = await loadTeacherForTenant(ctx.tenantId, teacherUserId);
    if (!teacher) return jsonNoStore({ ok: false, error: "Teacher not found in this school.", reqId }, 404);

    const [appraiser, tenant, classroom] = await Promise.all([
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, firstName: true, lastName: true, email: true } }),
      prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, circuit: true } }),
      classroomId ? prisma.classroom.findFirst({ where: { id: classroomId, tenantId: ctx.tenantId }, select: { id: true, name: true, grade: true, arm: true } }) : Promise.resolve(null),
    ]);

    if (classroomId && !classroom) return jsonNoStore({ ok: false, error: "Classroom not found in this school.", reqId }, 404);

    const evidence = await loadEvidence({ tenantId: ctx.tenantId, teacherUserId, schemeOfWorkId, lessonNoteId, lessonDeliveryId });
    if (!evidence.ok) return jsonNoStore({ ok: false, error: evidence.error, reqId }, 400);

    const scoreRows = buildScoreRows(raw.scores ?? [], finalizing);
    const percentages = calculatePercentages(scoreRows);

    if (finalizing && percentages.overallPercentage == null) {
      return jsonNoStore({ ok: false, error: "At least one scored appraisal section is required before finalizing.", reqId }, 400);
    }

    const existing = id
      ? await prisma.teacherAppraisal.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, status: true, appraiserUserId: true } })
      : null;

    if (id && !existing) return jsonNoStore({ ok: false, error: "Appraisal not found.", reqId }, 404);
    if (existing?.status === "FINALIZED") return jsonNoStore({ ok: false, error: "Finalized appraisals are locked.", reqId }, 409);

    const saved = await prisma.$transaction(async (tx) => {
      const data = {
        teacherUserId,
        appraiserUserId: ctx.userId,
        classroomId,
        dateObserved,
        classTaught: clean(raw.classTaught) || classLabel(classroom) || null,
        term: clean(raw.term) || evidence.delivery?.term || evidence.note?.term || evidence.scheme?.term || null,
        academicYear: clean(raw.academicYear) || evidence.delivery?.academicYear || evidence.note?.academicYear || evidence.scheme?.academicYear || null,
        subject: clean(raw.subject) || evidence.delivery?.subject || evidence.note?.subject || evidence.scheme?.subject || null,
        subStrand: clean(raw.subStrand) || evidence.note?.substrand || null,
        durationMinutes: duration.value,
        yearsInService: yearsService.value,
        yearsInPresentSchool: yearsPresent.value,
        teacherNameSnapshot: userName(teacher.user),
        schoolNameSnapshot: tenant?.name ?? teacher.tenant.name ?? null,
        circuitSnapshot: tenant?.circuit ?? teacher.tenant.circuit ?? null,
        appraiserNameSnapshot: userName(appraiser),
        schemeOfWorkId,
        lessonNoteId,
        lessonDeliveryId,
        evidenceSnapshotJson: evidence.snapshot,
        status: finalizing
          ? TeacherAppraisalStatus.FINALIZED
          : TeacherAppraisalStatus.DRAFT,
        finalizedAt: finalizing ? new Date() : null,
        finalizedByUserId: finalizing ? ctx.userId : null,
        preparationPercent: percentages.preparationPercent,
        lessonDeliveryPercent: percentages.lessonDeliveryPercent,
        classroomCulturePercent: percentages.classroomCulturePercent,
        learnerParticipationPercent: percentages.learnerParticipationPercent,
        understandingStrategiesPercent: percentages.understandingStrategiesPercent,
        evaluationStrategiesPercent: percentages.evaluationStrategiesPercent,
        overallPercentage: percentages.overallPercentage,
        generalComment: clean(raw.generalComment) || null,
        metadata: { source: "HEADTEACHER_APPRAISAL_V1", reqId },
      };

      const appraisal = existing
        ? await tx.teacherAppraisal.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.teacherAppraisal.create({ data: { tenantId: ctx.tenantId, ...data }, select: { id: true } });

      await tx.teacherAppraisalScore.deleteMany({ where: { appraisalId: appraisal.id } });
      await tx.teacherAppraisalScore.createMany({
        data: scoreRows.map((r) => ({ ...r, tenantId: ctx.tenantId, appraisalId: appraisal.id })),
      });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: finalizing ? "TEACHER_APPRAISAL_FINALIZED" : existing ? "TEACHER_APPRAISAL_UPDATED" : "TEACHER_APPRAISAL_CREATED",
          resource: "TeacherAppraisal",
          resourceId: appraisal.id,
          ip: meta.ip ?? undefined,
          userAgent: meta.userAgent ?? undefined,
          metadata: {
            reqId,
            teacherUserId,
            status: finalizing ? "FINALIZED" : "DRAFT",
            overallPercentage: percentages.overallPercentage,
            schemeOfWorkId,
            lessonNoteId,
            lessonDeliveryId,
          },
        },
      });

      return appraisal;
    });

    const item = await serializeAppraisal(saved.id, ctx.tenantId);
    return jsonNoStore({ ok: true, reqId, item, sections: APPRAISAL_SECTIONS }, finalizing ? 201 : 200);
  } catch (err: any) {
    if (String(err?.message ?? "") === "INVALID_SCORE") {
      return jsonNoStore({ ok: false, error: "Scores must be whole numbers from 1 to 5, or N/A.", reqId }, 400);
    }
    if (String(err?.message ?? "") === "UNKNOWN_SCORE_ITEM") {
      return jsonNoStore({ ok: false, error: "Unknown appraisal score item.", reqId }, 400);
    }
    if (String(err?.message ?? "") === "INCOMPLETE_SCORES") {
      return jsonNoStore({ ok: false, error: "Complete every score row or mark it N/A before finalizing.", missing: err?.missing ?? [], reqId }, 400);
    }

    console.error("HEADTEACHER_TEACHER_APPRAISAL_POST_ERROR", { reqId, err });
    return jsonNoStore({ ok: false, error: "Failed to save teacher appraisal.", reqId }, 500);
  }
}
