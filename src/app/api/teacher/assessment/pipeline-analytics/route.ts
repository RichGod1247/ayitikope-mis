// src/app/api/teacher/assessment/pipeline-analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { subjectAllowedInTeachingScope } from "@/lib/teachingSubjectScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) return `JHS${Number(m[1]) - 6}`;

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function classroomLevelToken(classroom: any): string | null {
  return normalizeLevelToken(classroom?.grade) ?? normalizeLevelToken(classroom?.name);
}

function noteMatchesClassroomScope(note: { classroomId: string | null; level: string | null }, classroomId: string, classroom: any) {
  if (note.classroomId === classroomId) return true;
  if (note.classroomId !== null) return false;

  const noteLevel = normalizeLevelToken(note.level);
  const classLevel = classroomLevelToken(classroom);

  return !!noteLevel && !!classLevel && noteLevel === classLevel;
}

function filterNotesByTruthScope<T extends { classroomId: string | null; level: string | null; subject: string | null }>(
  rows: T[],
  args: {
    classroomId: string;
    classroom: any;
    allowedSubjects: string[] | null;
    scopeLevel: string | null;
  }
) {
  return rows
    .filter((r) => noteMatchesClassroomScope(r, args.classroomId, args.classroom))
    .filter((r) =>
      subjectAllowedInTeachingScope(r.subject, args.allowedSubjects, args.scopeLevel)
    );
}

function filterRowsBySubjectScope<T extends { subject: string | null }>(
  rows: T[],
  allowedSubjects: string[] | null,
  scopeLevel: string | null
) {
  return rows.filter((r) =>
    subjectAllowedInTeachingScope(r.subject, allowedSubjects, scopeLevel)
  );
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function percent(part: number, whole: number) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = cleanStr(searchParams.get("classroomId"));
  const term = cleanStr(searchParams.get("term")) || "1st Term";
  const academicYear = cleanStr(searchParams.get("academicYear")) || "2025/2026";

  if (!classroomId) return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: isForbiddenReason(access.reason) ? access.reason : "CLASSROOM_NOT_FOUND",
    });
  }

  const notesWhere: any = {
    tenantId: ctx.tenantId,
    term,
    academicYear,
    status: "APPROVED",
    OR: [{ classroomId }, { classroomId: null }],
  };

  const deliveriesWhere: any = {
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
  };

  const assessmentsWhere: any = {
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
    type: { not: "MOCK" },
  };

  if (!isAdminLikeRole(ctx.roleName)) {
    notesWhere.teacherUserId = ctx.userId;
    deliveriesWhere.teacherUserId = ctx.userId;
  }

  const [approvedNotesRaw, deliveriesRaw, assessmentsRaw] = await Promise.all([
    prisma.lessonNote.findMany({
      where: notesWhere,
      orderBy: [{ lessonDate: "asc" }, { approvedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        classroomId: true,
        phase: true,
        level: true,
        subject: true,
        lessonTitle: true,
        lessonDate: true,
        approvedAt: true,
        curriculumUnitId: true,
      },
    }),
    prisma.lessonDelivery.findMany({
      where: deliveriesWhere,
      orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        subject: true,
        dateTaught: true,
        lessonNoteId: true,
        curriculumUnitId: true,
        notes: true,
      },
    }),
    prisma.assessmentItem.findMany({
      where: assessmentsWhere,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        subject: true,
        type: true,
        date: true,
        status: true,
        lessonDeliveryId: true,
        curriculumUnitId: true,
      },
    }),
  ]);

  const scopeSubjects = isAdminLikeRole(ctx.roleName) ? null : access.allowedSubjects;

  const approvedNotes = filterNotesByTruthScope(approvedNotesRaw, {
    classroomId,
    classroom: access.classroom,
    allowedSubjects: scopeSubjects,
    scopeLevel: access.normalizedClassLevel,
  });

  const deliveries = filterRowsBySubjectScope(
    deliveriesRaw,
    scopeSubjects,
    access.normalizedClassLevel
  );
  const assessments = filterRowsBySubjectScope(
    assessmentsRaw,
    scopeSubjects,
    access.normalizedClassLevel
  );

  const assessmentIds = assessments.map((a) => a.id);

  const scoreGroups =
    assessmentIds.length > 0
      ? await prisma.assessmentScore.groupBy({
          by: ["itemId"],
          where: { itemId: { in: assessmentIds } },
          _count: { _all: true },
        })
      : [];

  const scoredAssessmentIdSet = new Set(scoreGroups.map((g) => g.itemId));
  const deliveryIdSet = new Set(deliveries.map((d) => d.id));
  const deliveredNoteIdSet = new Set(deliveries.map((d) => d.lessonNoteId).filter(Boolean) as string[]);
  const assessmentLinkedDeliveryIdSet = new Set(
    assessments.map((a) => a.lessonDeliveryId).filter(Boolean) as string[]
  );

  const orphanNotes = approvedNotes
    .filter((n) => !deliveredNoteIdSet.has(n.id))
    .map((n) => ({
      id: n.id,
      subject: n.subject,
      lessonTitle: n.lessonTitle ?? null,
      lessonDate: n.lessonDate ? new Date(n.lessonDate).toISOString() : null,
      approvedAt: n.approvedAt ? new Date(n.approvedAt).toISOString() : null,
      curriculumUnitId: n.curriculumUnitId ?? null,
      legacyClassroomMatch: n.classroomId === null,
      reason: "NO_DELIVERY_RECORDED" as const,
    }));

  const orphanDeliveries = deliveries
    .filter((d) => !assessmentLinkedDeliveryIdSet.has(d.id))
    .map((d) => ({
      id: d.id,
      subject: d.subject,
      dateTaught: d.dateTaught ? new Date(d.dateTaught).toISOString() : null,
      lessonNoteId: d.lessonNoteId ?? null,
      curriculumUnitId: d.curriculumUnitId ?? null,
      notes: d.notes ?? null,
      reason: "NO_LINKED_ASSESSMENT" as const,
    }));

  const orphanAssessments = assessments
    .filter((a) => !a.lessonDeliveryId || !deliveryIdSet.has(a.lessonDeliveryId))
    .map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      type: a.type,
      date: a.date ? new Date(a.date).toISOString() : null,
      status: a.status,
      lessonDeliveryId: a.lessonDeliveryId ?? null,
      curriculumUnitId: a.curriculumUnitId ?? null,
      reason: a.lessonDeliveryId
        ? ("LINKED_DELIVERY_NOT_FOUND_IN_SCOPE" as const)
        : ("NO_LINKED_DELIVERY" as const),
    }));

  const linkedAssessmentsCount = assessments.filter(
    (a) => !!a.lessonDeliveryId && deliveryIdSet.has(a.lessonDeliveryId)
  ).length;

  const scoredAssessmentsCount = assessments.filter((a) => scoredAssessmentIdSet.has(a.id)).length;

  return noStore(200, {
    ok: true,
    scope: {
      tenantId: ctx.tenantId,
      classroomId,
      term,
      academicYear,
      roleName: ctx.roleName,
      allowedSubjects: access.allowedSubjects,
      scopeSource: access.scopeSource,
      classroom: access.classroom,
    },
    counts: {
      approvedNotesCount: approvedNotes.length,
      deliveredLessonsCount: deliveries.length,
      assessmentsCount: assessments.length,
      linkedAssessmentsCount,
      scoredAssessmentsCount,
      orphanNotesCount: orphanNotes.length,
      orphanDeliveriesCount: orphanDeliveries.length,
      orphanAssessmentsCount: orphanAssessments.length,
    },
    coverage: {
      deliveryCoveragePercent: percent(deliveries.length, approvedNotes.length),
      assessmentLinkCoveragePercent: percent(linkedAssessmentsCount, deliveries.length),
      scoringCoveragePercent: percent(scoredAssessmentsCount, assessments.length),
    },
    orphanNotes,
    orphanDeliveries,
    orphanAssessments,
  });
}