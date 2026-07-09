// src/app/api/teacher/appraisals/route.ts
import { NextResponse } from "next/server";
import { TeacherAppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

type EvidenceWarning = {
  code: string;
  title: string;
  detail: string;
  severity: "WARNING";
};

function jsonNoStore(status: number, payload: unknown) {
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
  return /^[a-zA-Z0-9_-]{5,100}$/.test(id);
}

function toIso(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(v: Date | string | null | undefined) {
  const iso = toIso(v);
  return iso ? iso.slice(0, 10) : null;
}

function round1(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function asObject(v: unknown): JsonObject {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as JsonObject;
  return {};
}

function safeText(v: unknown, fallback = "") {
  const s = clean(v);
  return s || fallback;
}

function evidenceWarningsFromMetadata(raw: unknown): EvidenceWarning[] {
  const metadata = asObject(raw);
  const warnings = Array.isArray(metadata.evidenceWarnings) ? metadata.evidenceWarnings : [];

  return warnings
    .map((item) => {
      const o = asObject(item);
      return {
        code: clean(o.code),
        title: clean(o.title),
        detail: clean(o.detail ?? o.message),
        severity: "WARNING" as const,
      };
    })
    .filter((item) => item.code && item.title && item.detail);
}

function safeEvidenceSummary(raw: unknown) {
  const o = asObject(raw);

  const teacher = asObject(o.teacher);
  const scheme = asObject(o.scheme);
  const lessonNote = asObject(o.lessonNote);
  const lessonDelivery = asObject(o.lessonDelivery);
  const assessment = asObject(o.assessment);

  return {
    teacherName: safeText(o.teacherNameSnapshot ?? teacher.name, ""),
    schoolName: safeText(o.schoolNameSnapshot, ""),
    circuit: safeText(o.circuitSnapshot, ""),
    scheme: {
      title: safeText(scheme.title ?? scheme.subject ?? scheme.id, ""),
      status: safeText(scheme.status, ""),
    },
    lessonNote: {
      title: safeText(lessonNote.lessonTitle ?? lessonNote.title ?? lessonNote.id, ""),
      subject: safeText(lessonNote.subject, ""),
      weekNumber: typeof lessonNote.weekNumber === "number" ? lessonNote.weekNumber : null,
    },
    lessonDelivery: {
      dateTaught: safeText(lessonDelivery.dateTaught, ""),
      notes: safeText(lessonDelivery.notes, ""),
    },
    assessment: {
      count: typeof assessment.count === "number" ? assessment.count : null,
    },
  };
}

function appraisalSummary(a: {
  id: string;
  dateObserved: Date;
  classTaught: string | null;
  subject: string | null;
  subStrand: string | null;
  overallPercentage: number | null;
  finalizedAt: Date | null;
  appraiserNameSnapshot: string | null;
  generalComment: string | null;
}) {
  return {
    id: a.id,
    dateObserved: toDateOnly(a.dateObserved),
    classTaught: a.classTaught ?? null,
    subject: a.subject ?? null,
    subStrand: a.subStrand ?? null,
    overallPercentage: round1(a.overallPercentage),
    finalizedAt: toIso(a.finalizedAt),
    appraiserNameSnapshot: a.appraiserNameSnapshot ?? null,
    generalComment: a.generalComment ?? null,
  };
}

function sectionPercentages(a: {
  preparationPercent: number | null;
  lessonDeliveryPercent: number | null;
  classroomCulturePercent: number | null;
  learnerParticipationPercent: number | null;
  understandingStrategiesPercent: number | null;
  evaluationStrategiesPercent: number | null;
}) {
  return {
    preparation: round1(a.preparationPercent),
    lessonDelivery: round1(a.lessonDeliveryPercent),
    classroomCulture: round1(a.classroomCulturePercent),
    learnerParticipation: round1(a.learnerParticipationPercent),
    understandingStrategies: round1(a.understandingStrategiesPercent),
    evaluationStrategies: round1(a.evaluationStrategiesPercent),
  };
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);
  const id = clean(searchParams.get("id"));

  // A15.4C scope lock:
  // This teacher-facing endpoint always returns only the logged-in user's finalized appraisals.
  // Headteachers/admins have a separate headteacher appraisal endpoint for supervision work.
  const baseWhere = {
    tenantId: ctx.tenantId,
    teacherUserId: ctx.userId,
    status: TeacherAppraisalStatus.FINALIZED,
  };

  if (id) {
    if (!isLikelyId(id)) {
      return jsonNoStore(400, { ok: false, error: "INVALID_APPRAISAL_ID" });
    }

    const item = await prisma.teacherAppraisal.findFirst({
      where: { ...baseWhere, id },
      select: {
        id: true,
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
        preparationPercent: true,
        lessonDeliveryPercent: true,
        classroomCulturePercent: true,
        learnerParticipationPercent: true,
        understandingStrategiesPercent: true,
        evaluationStrategiesPercent: true,
        overallPercentage: true,
        generalComment: true,
        finalizedAt: true,
        metadata: true,
        scores: {
          orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
          select: {
            id: true,
            sectionKey: true,
            sectionTitle: true,
            sectionOrder: true,
            sectionMaxScore: true,
            itemKey: true,
            itemLabel: true,
            itemOrder: true,
            score: true,
            notApplicable: true,
          },
        },
      },
    });

    if (!item) return jsonNoStore(404, { ok: false, error: "APPRAISAL_NOT_FOUND" });

    return jsonNoStore(200, {
      ok: true,
      item: {
        ...appraisalSummary(item),
        term: item.term ?? null,
        academicYear: item.academicYear ?? null,
        durationMinutes: item.durationMinutes ?? null,
        yearsInService: item.yearsInService ?? null,
        yearsInPresentSchool: item.yearsInPresentSchool ?? null,
        teacherNameSnapshot: item.teacherNameSnapshot ?? null,
        schoolNameSnapshot: item.schoolNameSnapshot ?? null,
        circuitSnapshot: item.circuitSnapshot ?? null,
        sectionPercentages: sectionPercentages(item),
        evidence: {
          schemeOfWorkId: item.schemeOfWorkId ?? null,
          lessonNoteId: item.lessonNoteId ?? null,
          lessonDeliveryId: item.lessonDeliveryId ?? null,
          summary: safeEvidenceSummary(item.evidenceSnapshotJson),
        },
        evidenceWarnings: evidenceWarningsFromMetadata(item.metadata),
        scores: item.scores.map((s) => ({
          id: s.id,
          sectionKey: s.sectionKey,
          sectionTitle: s.sectionTitle,
          sectionOrder: s.sectionOrder,
          sectionMaxScore: s.sectionMaxScore,
          itemKey: s.itemKey,
          itemLabel: s.itemLabel,
          itemOrder: s.itemOrder,
          score: s.score,
          notApplicable: s.notApplicable,
        })),
      },
    });
  }

  const items = await prisma.teacherAppraisal.findMany({
    where: baseWhere,
    orderBy: [{ dateObserved: "desc" }, { finalizedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      dateObserved: true,
      classTaught: true,
      subject: true,
      subStrand: true,
      overallPercentage: true,
      finalizedAt: true,
      appraiserNameSnapshot: true,
      generalComment: true,
    },
  });

  return jsonNoStore(200, {
    ok: true,
    items: items.map(appraisalSummary),
  });
}

export async function POST() {
  return jsonNoStore(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
}

export async function PATCH() {
  return jsonNoStore(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
}

export async function DELETE() {
  return jsonNoStore(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
}
