// src/app/api/teacher/assessment/items/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
  subjectEquals,
} from "@/lib/teacherAccess";
import {
  findPolicyComponent,
  getTenantAssessmentPolicyLite as getTenantAssessmentPolicy,
  isAllowedType,
  normalizeTypeCode,
} from "@/lib/assessments/policy";
import { assertAssessmentItemWritable } from "@/lib/assessments/itemWriteState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const rawBody: unknown = await req.json().catch(() => null);
  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as Record<string, unknown>)
      : {};

  const id = clean(body?.id);

  const classroomId = clean(body?.classroomId);
  const subject = clean(body?.subject);
  const term = clean(body?.term);
  const academicYear = clean(body?.academicYear);
  const title = clean(body?.title);
  const description = clean(body?.description) || null;

const requestedType = clean(body?.type).toUpperCase();

const type = normalizeTypeCode(body?.type);
const componentCodeFromBody = clean(body?.componentCode)
  ? normalizeTypeCode(body?.componentCode)
  : "";

  const lessonDeliveryId = clean(body?.lessonDeliveryId);

  const maxScoreNum = Number(body?.maxScore ?? 0);
  const weightingNum =
    body?.weighting == null || body.weighting === ""
      ? null
      : Number(body.weighting);
  const date = typeof body?.date === "string" && body.date ? new Date(body.date) : null;

  if (!classroomId || !subject || !term || !academicYear || !title || !type) {
    return noStore(400, { ok: false, error: "MISSING_FIELDS" });
  }

  // A14.5B:
  // Mock must not be created through the normal assessment item route.
  // Mock items must belong to a MockExamSession and use dedicated mock routes.
  if (requestedType === "MOCK") {
    return noStore(409, {
      ok: false,
      error: "USE_MOCK_ASSESSMENT_ROUTES",
      message: "Create BECE Mock items through the dedicated mock assessment engine.",
    });
  }

  if (!Number.isFinite(maxScoreNum) || maxScoreNum <= 0 || maxScoreNum > 500) {
    return noStore(400, { ok: false, error: "INVALID_MAX_SCORE" });
  }

  if (
    weightingNum != null &&
    (!Number.isFinite(weightingNum) || weightingNum < 0 || weightingNum > 100)
  ) {
    return noStore(400, { ok: false, error: "INVALID_WEIGHTING" });
  }

  if (date && isNaN(date.getTime())) {
    return noStore(400, { ok: false, error: "INVALID_DATE" });
  }

  const targetAccess = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    subject,
  });

  if (!targetAccess.ok) {
    return noStore(isForbiddenReason(targetAccess.reason) ? 403 : 404, {
      ok: false,
      error: targetAccess.reason,
    });
  }

  const policy = await getTenantAssessmentPolicy(ctx.tenantId, {
    classroom: targetAccess.classroom,
  });

  if (!isAllowedType(policy, type)) {
    return noStore(400, {
      ok: false,
      error: "TYPE_NOT_ALLOWED",
      allowed: policy.types,
    });
  }

  const component =
    findPolicyComponent(policy, componentCodeFromBody || type) ??
    findPolicyComponent(policy, type);

  const resolvedComponentCode = component?.code ?? (componentCodeFromBody || type);
  const resolvedPolicyId = component?.policyId ?? policy.id ?? null;
  const resolvedComponentId = component?.id ?? null;

  let resolvedCurriculumUnitId: string | null = null;

  let delivery:
    | {
        id: string;
        classroomId: string;
        teacherUserId: string;
        term: string;
        academicYear: string;
        subject: string;
        curriculumUnitId: string | null;
      }
    | null = null;

  if (lessonDeliveryId) {
    delivery = await prisma.lessonDelivery.findFirst({
      where: {
        id: lessonDeliveryId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        classroomId: true,
        teacherUserId: true,
        term: true,
        academicYear: true,
        subject: true,
        curriculumUnitId: true,
      },
    });

    if (!delivery) {
      return noStore(404, { ok: false, error: "LESSON_DELIVERY_NOT_FOUND" });
    }

    if (!isAdminLikeRole(ctx.roleName) && delivery.teacherUserId !== ctx.userId) {
      return noStore(403, { ok: false, error: "DELIVERY_FORBIDDEN" });
    }

    const deliveryAccess = await resolveUserClassroomAccess({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      classroomId: delivery.classroomId,
      subject: delivery.subject,
    });

    if (!deliveryAccess.ok) {
      return noStore(isForbiddenReason(deliveryAccess.reason) ? 403 : 404, {
        ok: false,
        error: "DELIVERY_FORBIDDEN",
      });
    }

    if (delivery.classroomId !== classroomId) {
      return noStore(400, { ok: false, error: "DELIVERY_CLASSROOM_MISMATCH" });
    }

    if (!subjectEquals(delivery.subject, subject)) {
      return noStore(400, { ok: false, error: "DELIVERY_SUBJECT_MISMATCH" });
    }

    if (delivery.term !== term) {
      return noStore(400, { ok: false, error: "DELIVERY_TERM_MISMATCH" });
    }

    if (delivery.academicYear !== academicYear) {
      return noStore(400, { ok: false, error: "DELIVERY_YEAR_MISMATCH" });
    }

    resolvedCurriculumUnitId = delivery.curriculumUnitId ?? null;
  }

  try {
    if (id) {
      const existing = await prisma.assessmentItem.findUnique({
        where: { id },
        select: {
          id: true,
          tenantId: true,
          classroomId: true,
          subject: true,
          type: true,
          status: true,
          publishedAt: true,
          lockedAt: true,
          curriculumUnitId: true,
          createdByUserId: true,
          mockExamSessionId: true,
        },
      });

      if (!existing || existing.tenantId !== ctx.tenantId) {
        return noStore(404, { ok: false, error: "ITEM_NOT_FOUND" });
      }

      if (String(existing.type ?? "").toUpperCase() === "MOCK" || existing.mockExamSessionId) {
        return noStore(409, {
          ok: false,
          error: "USE_MOCK_ASSESSMENT_ROUTES",
          message: "Edit BECE Mock items through the dedicated mock assessment engine.",
        });
      }

      if (!isAdminLikeRole(ctx.roleName)) {
        if (!existing.createdByUserId) {
          return noStore(403, { ok: false, error: "ITEM_OWNER_MISSING" });
        }
        if (existing.createdByUserId !== ctx.userId) {
          return noStore(403, { ok: false, error: "ITEM_FORBIDDEN" });
        }
      }

      const currentAccess = await resolveUserClassroomAccess({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        roleName: ctx.roleName,
        classroomId: existing.classroomId,
        subject: existing.subject,
      });

      if (!currentAccess.ok) {
        return noStore(isForbiddenReason(currentAccess.reason) ? 403 : 404, {
          ok: false,
          error: currentAccess.reason,
        });
      }

      assertAssessmentItemWritable(existing);

      if (
        resolvedCurriculumUnitId &&
        existing.curriculumUnitId &&
        resolvedCurriculumUnitId !== existing.curriculumUnitId
      ) {
        return noStore(400, { ok: false, error: "DELIVERY_UNIT_MISMATCH" });
      }

      const updated = await prisma.assessmentItem.update({
        where: { id },
        data: {
          classroomId,
          subject,
          term,
          academicYear,
          title,
          description,
          type,
          maxScore: maxScoreNum,
          weighting: weightingNum,
          date,
          assessmentPolicyId: resolvedPolicyId,
          policyComponentId: resolvedComponentId,
          componentCode: resolvedComponentCode,
          templateKey: `${term}:${academicYear}:${subject}:${resolvedComponentCode}`,
          sortOrder: component?.orderIndex ?? 0,
          isRequired: component?.required ?? true,
          lessonDeliveryId: lessonDeliveryId || null,
          curriculumUnitId: existing.curriculumUnitId ?? resolvedCurriculumUnitId,
          mockExamSessionId: null,
        },
        select: {
          id: true,
          classroomId: true,
          subject: true,
          term: true,
          academicYear: true,
          title: true,
          description: true,
          type: true,
          maxScore: true,
          weighting: true,
          date: true,
          status: true,
          publishedAt: true,
          lockedAt: true,
          lessonDeliveryId: true,
          curriculumUnitId: true,
          mockExamSessionId: true,
          assessmentPolicyId: true,
          policyComponentId: true,
          componentCode: true,
          templateKey: true,
          sortOrder: true,
          isRequired: true,
        },
      });

      return noStore(200, { ok: true, item: updated });
    }

    const created = await prisma.assessmentItem.create({
      data: {
        tenantId: ctx.tenantId,
        classroomId,
        subject,
        term,
        academicYear,
        title,
        description,
        type,
        maxScore: maxScoreNum,
        weighting: weightingNum,
        date,
        assessmentPolicyId: resolvedPolicyId,
        policyComponentId: resolvedComponentId,
        componentCode: resolvedComponentCode,
        templateKey: `${term}:${academicYear}:${subject}:${resolvedComponentCode}`,
        sortOrder: component?.orderIndex ?? 0,
        isRequired: component?.required ?? true,
        lessonDeliveryId: lessonDeliveryId || null,
        curriculumUnitId: resolvedCurriculumUnitId,
        mockExamSessionId: null,
        createdByUserId: ctx.userId,
      },
      select: {
        id: true,
        classroomId: true,
        subject: true,
        term: true,
        academicYear: true,
        title: true,
        description: true,
        type: true,
        maxScore: true,
        weighting: true,
        date: true,
        status: true,
        publishedAt: true,
        lockedAt: true,
        lessonDeliveryId: true,
        curriculumUnitId: true,
        mockExamSessionId: true,
        assessmentPolicyId: true,
        policyComponentId: true,
        componentCode: true,
        templateKey: true,
        sortOrder: true,
        isRequired: true,
      },
    });

    return noStore(200, { ok: true, item: created });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "FAILED_TO_SAVE_ITEM";

    if (msg === "ITEM_PUBLISHED" || msg === "ITEM_LOCKED") {
      return noStore(409, { ok: false, error: msg });
    }

    console.error("[ASSESSMENT_ITEM_UPSERT_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_SAVE_ITEM" });
  }
}