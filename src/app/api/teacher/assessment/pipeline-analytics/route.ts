// src/app/api/teacher/assessment/pipeline-analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

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

function buildSubjectWhere(args: { roleName: string | null; allowedSubjects: string[] | null }) {
  if (isAdminLikeRole(args.roleName)) return {};
  if (args.allowedSubjects?.length) {
    return {
      OR: args.allowedSubjects.map((s) => ({
        subject: { equals: s, mode: "insensitive" as const },
      })),
    };
  }
  return {};
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

  const subjectWhere = buildSubjectWhere({
    roleName: ctx.roleName,
    allowedSubjects: access.allowedSubjects,
  });

  const notesWhere: any = {
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
    status: "APPROVED",
    ...subjectWhere,
  };

  const deliveriesWhere: any = {
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
    ...subjectWhere,
  };

  const assessmentsWhere: any = {
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
    ...subjectWhere,
  };

  if (!isAdminLikeRole(ctx.roleName)) {
    notesWhere.teacherUserId = ctx.userId;
    deliveriesWhere.teacherUserId = ctx.userId;
  }

  const [approvedNotes, deliveries, assessments] = await Promise.all([
    prisma.lessonNote.findMany({
      where: notesWhere,
      orderBy: [{ lessonDate: "asc" }, { approvedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, subject: true, lessonTitle: true, lessonDate: true, approvedAt: true, curriculumUnitId: true },
    }),
    prisma.lessonDelivery.findMany({
      where: deliveriesWhere,
      orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
      select: { id: true, subject: true, dateTaught: true, lessonNoteId: true, curriculumUnitId: true, notes: true },
    }),
    prisma.assessmentItem.findMany({
      where: assessmentsWhere,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, subject: true, type: true, date: true, status: true, lessonDeliveryId: true, curriculumUnitId: true },
    }),
  ]);

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
  const assessmentLinkedDeliveryIdSet = new Set(assessments.map((a) => a.lessonDeliveryId).filter(Boolean) as string[]);

  const orphanNotes = approvedNotes
    .filter((n) => !deliveredNoteIdSet.has(n.id))
    .map((n) => ({
      id: n.id,
      subject: n.subject,
      lessonTitle: n.lessonTitle ?? null,
      lessonDate: n.lessonDate ? new Date(n.lessonDate).toISOString() : null,
      approvedAt: n.approvedAt ? new Date(n.approvedAt).toISOString() : null,
      curriculumUnitId: n.curriculumUnitId ?? null,
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
      reason: a.lessonDeliveryId ? ("LINKED_DELIVERY_NOT_FOUND_IN_SCOPE" as const) : ("NO_LINKED_DELIVERY" as const),
    }));

  const linkedAssessmentsCount = assessments.filter((a) => !!a.lessonDeliveryId && deliveryIdSet.has(a.lessonDeliveryId)).length;
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