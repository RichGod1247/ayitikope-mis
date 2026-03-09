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
  getTenantAssessmentPolicy,
  isAllowedType,
  normalizeTypeCode,
} from "@/lib/assessments/policy";
import { assertAssessmentItemWritable } from "@/lib/assessments/itemWriteState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
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

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const body = await req.json().catch(() => null);

  const id = typeof body?.id === "string" ? body.id.trim() : "";

  const classroomId =
    typeof body?.classroomId === "string" ? body.classroomId.trim() : "";
  const subject =
    typeof body?.subject === "string" ? body.subject.trim() : "";
  const term = typeof body?.term === "string" ? body.term.trim() : "";
  const academicYear =
    typeof body?.academicYear === "string" ? body.academicYear.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : null;

  const typeRaw = typeof body?.type === "string" ? body.type.trim() : "";
  const type = normalizeTypeCode(typeRaw);

  const lessonDeliveryId =
    typeof body?.lessonDeliveryId === "string" ? body.lessonDeliveryId.trim() : "";

  const maxScoreNum = Number(body?.maxScore ?? 0);
  const weightingNum =
    body?.weighting == null || body.weighting === ""
      ? null
      : Number(body.weighting);
  const date =
    typeof body?.date === "string" && body.date ? new Date(body.date) : null;

  if (!classroomId || !subject || !term || !academicYear || !title || !type) {
    return noStore(400, { ok: false, error: "MISSING_FIELDS" });
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

  const policy = await getTenantAssessmentPolicy(ctx.tenantId);
  if (!isAllowedType(policy, type)) {
    return noStore(400, {
      ok: false,
      error: "TYPE_NOT_ALLOWED",
      allowed: policy.types,
    });
  }

  // ✅ Validate target classroom+subject scope (server-trusted)
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

  let resolvedCurriculumUnitId: string | null = null;

  // ✅ Optional: lesson delivery link scope validation
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
    // -----------------------------
    // UPDATE existing
    // -----------------------------
    if (id) {
      const existing = await prisma.assessmentItem.findUnique({
        where: { id },
        select: {
          id: true,
          tenantId: true,
          classroomId: true,
          subject: true,
          status: true,
          publishedAt: true,
          lockedAt: true,
          curriculumUnitId: true,
          createdByUserId: true, // ✅ ownership
        },
      });

      if (!existing || existing.tenantId !== ctx.tenantId) {
        return noStore(404, { ok: false, error: "ITEM_NOT_FOUND" });
      }

      // ✅ Bank-grade ownership: teachers can edit only what they created
      if (!isAdminLikeRole(ctx.roleName)) {
        if (!existing.createdByUserId) {
          return noStore(403, { ok: false, error: "ITEM_OWNER_MISSING" });
        }
        if (existing.createdByUserId !== ctx.userId) {
          return noStore(403, { ok: false, error: "ITEM_FORBIDDEN" });
        }
      }

      // Existing scope must also be valid (prevents “edit by knowing id”)
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

      // ✅ lifecycle protection
      assertAssessmentItemWritable(existing);

      // If existing already has a unit, delivery can’t conflict with it
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
          lessonDeliveryId: lessonDeliveryId || null,
          curriculumUnitId: existing.curriculumUnitId ?? resolvedCurriculumUnitId,
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
        },
      });

      return noStore(200, { ok: true, item: updated });
    }

    // -----------------------------
    // CREATE new
    // -----------------------------
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
        lessonDeliveryId: lessonDeliveryId || null,
        curriculumUnitId: resolvedCurriculumUnitId,
        createdByUserId: ctx.userId, // ✅ set owner
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
      },
    });

    return noStore(200, { ok: true, item: created });
  } catch (err: any) {
    const msg = String(err?.message || "FAILED_TO_SAVE_ITEM");

    if (msg === "ITEM_PUBLISHED" || msg === "ITEM_LOCKED") {
      return noStore(409, { ok: false, error: msg });
    }

    console.error("[ASSESSMENT_ITEM_UPSERT_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_SAVE_ITEM" });
  }
}