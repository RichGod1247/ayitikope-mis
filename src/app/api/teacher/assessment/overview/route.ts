// src/app/api/teacher/assessment/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonNoStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
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

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  const term = (searchParams.get("term") ?? "1st Term").trim();
  const academicYear = (searchParams.get("academicYear") ?? "2025/2026").trim();

  if (!classroomId) {
    return jsonNoStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return jsonNoStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: isForbiddenReason(access.reason) ? access.reason : "CLASSROOM_NOT_FOUND",
    });
  }

  const studentsRaw = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId, classroomId, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true },
  });

  const students = studentsRaw.map((s) => ({
    id: s.id,
    name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Learner",
    guardianName: s.guardianName ?? null,
    guardianPhone: s.guardianPhone ?? null,
  }));

  const subjectWhere = buildSubjectWhere({
    roleName: ctx.roleName,
    allowedSubjects: access.allowedSubjects,
  });

  const assessments = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear, ...subjectWhere } as any,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
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

assessmentPolicyId: true,
policyComponentId: true,
componentCode: true,
templateKey: true,
sortOrder: true,
isRequired: true,
    },
  });

  return jsonNoStore(200, {
    ok: true,
    classroom: access.classroom,
    allowedSubjects: access.allowedSubjects,
    scopeSource: access.scopeSource,
    students,
    assessments: assessments.map((a) => ({
      ...a,
      maxScore: Number(a.maxScore ?? 0),
      weighting: a.weighting == null ? null : Number(a.weighting),
      date: a.date ? new Date(a.date).toISOString() : null,
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
      lockedAt: a.lockedAt ? new Date(a.lockedAt).toISOString() : null,
    })),
  });
}