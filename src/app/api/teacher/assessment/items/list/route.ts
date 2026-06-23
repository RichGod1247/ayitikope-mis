// src/app/api/teacher/assessment/items/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess, isAdminLikeRole } from "@/lib/teacherAccess";

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

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "TEACHER", "ADMIN"],
  });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const { searchParams } = new URL(req.url);

  const tenantIdParam = cleanStr(searchParams.get("tenantId"));
  if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
    return noStore(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const classroomId = cleanStr(searchParams.get("classroomId"));
  const term = cleanStr(searchParams.get("term")) || null;
  const academicYear = cleanStr(searchParams.get("academicYear")) || null;
  const subject = cleanStr(searchParams.get("subject")) || null;
  const type = cleanStr(searchParams.get("type")) || null;
  const includeMock = cleanStr(searchParams.get("includeMock")).toLowerCase() === "true";

  if (!classroomId) return noStore(400, { ok: false, error: "classroomId is required." });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    subject,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const where: any = {
    tenantId: ctx.tenantId,
    classroomId,
  };

  if (term) where.term = term;
  if (academicYear) where.academicYear = academicYear;

  // Normal assessment list must not accidentally mix BECE Mock into 30/70 evidence.
  // Dedicated mock routes will request type=MOCK or includeMock=true.
  if (type) {
    where.type = { equals: type, mode: "insensitive" as const };
  } else if (!includeMock) {
    where.type = { not: "MOCK" };
  }

  // Subject filter:
  // - Admin-like can query any subject in class
  // - Teachers are restricted by resolveUserClassroomAccess; if subject is out of scope, access fails above
  if (subject) {
    where.subject = { equals: subject, mode: "insensitive" as const };
  } else if (!isAdminLikeRole(ctx.roleName) && access.allowedSubjects?.length) {
    where.OR = access.allowedSubjects.map((s) => ({
      subject: { equals: s, mode: "insensitive" as const },
    }));
  }

  const items = await prisma.assessmentItem.findMany({
    where,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      scores: { select: { id: true, studentId: true, score: true } },
      mockExamSession: {
        select: {
          id: true,
          academicYear: true,
          term: true,
          mockNumber: true,
          mockLabel: true,
          title: true,
          status: true,
          date: true,
        },
      },
    },
  });

  const mapped = items.map((item) => {
    const scores = item.scores || [];
    const total = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
    const averageScore = scores.length > 0 ? total / scores.length : null;

    return {
      id: item.id,
      tenantId: item.tenantId,
      classroomId: item.classroomId,
      subject: item.subject,
      term: item.term,
      academicYear: item.academicYear,
      title: item.title,
      description: item.description,
      type: item.type,
      maxScore: item.maxScore,
      weighting: item.weighting,
      date: item.date,
      status: item.status,
      publishedAt: item.publishedAt,
      lockedAt: item.lockedAt,

      lessonDeliveryId: item.lessonDeliveryId ?? null,
      curriculumUnitId: item.curriculumUnitId ?? null,

      mockExamSessionId: item.mockExamSessionId ?? null,
      mockExamSession: item.mockExamSession ?? null,

      assessmentPolicyId: item.assessmentPolicyId ?? null,
      policyComponentId: item.policyComponentId ?? null,
      componentCode: item.componentCode ?? null,
      templateKey: item.templateKey ?? null,
      sortOrder: item.sortOrder ?? 0,
      isRequired: item.isRequired ?? true,

      scoresCount: scores.length,
      averageScore,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  return noStore(200, {
    ok: true,
    filters: {
      tenantId: ctx.tenantId,
      classroomId,
      term,
      academicYear,
      subject,
      type,
      includeMock,
    },
    count: mapped.length,
    items: mapped,
  });
}