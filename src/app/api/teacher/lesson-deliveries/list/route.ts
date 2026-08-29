// src/app/api/teacher/lesson-deliveries/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  subjectAllowedInTeachingScope,
  subjectMatchesTeachingScope,
} from "@/lib/teachingSubjectScope";

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

function filterRowsBySubjectScope<T extends { subject: string | null }>(
  rows: T[],
  allowedSubjects: string[] | null,
  scopeLevel: string | null,
  preferredSubject?: string | null
) {
  const allowedRows = rows.filter((r) =>
    subjectAllowedInTeachingScope(r.subject, allowedSubjects, scopeLevel)
  );

  const preferred = cleanStr(preferredSubject);
  if (!preferred) return allowedRows;

  const preferredRows = allowedRows.filter((r) =>
    subjectMatchesTeachingScope(r.subject, preferred, scopeLevel)
  );

  // The selected subject is a helper filter. It must not create false-zero.
  return preferredRows.length > 0 ? preferredRows : allowedRows;
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
  const term = cleanStr(searchParams.get("term")) || null;
  const academicYear = cleanStr(searchParams.get("academicYear")) || null;
  const subject = cleanStr(searchParams.get("subject")) || null;

  if (!classroomId) return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    const status =
      access.reason === "OUT_OF_SCOPE" || access.reason === "SUBJECT_OUT_OF_SCOPE" ? 403 : 404;
    return noStore(status, { ok: false, error: access.reason });
  }

  const where: any = {
    tenantId: ctx.tenantId,
    classroomId,
    ...(term ? { term } : {}),
    ...(academicYear ? { academicYear } : {}),
  };

  if (!isAdminLikeRole(ctx.roleName)) {
    where.teacherUserId = ctx.userId;
  }

  const rowsRaw = await prisma.lessonDelivery.findMany({
    where,
    orderBy: [{ dateTaught: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      classroomId: true,
      teacherUserId: true,
      term: true,
      academicYear: true,
      subject: true,
      dateTaught: true,
      lessonNoteId: true,
      curriculumUnitId: true,
      contentStandardCode: true,
      indicatorCode: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      assessmentItems: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          type: true,
          maxScore: true,
          weighting: true,
          status: true,
          date: true,
          assessmentPolicyId: true,
          policyComponentId: true,
          componentCode: true,
          templateKey: true,
          sortOrder: true,
          isRequired: true,
          publishedAt: true,
          lockedAt: true,
          _count: {
            select: {
              scores: true,
            },
          },
        },
      },
    },
    take: 200,
  });

  const rows = filterRowsBySubjectScope(
    rowsRaw,
    isAdminLikeRole(ctx.roleName) ? null : access.allowedSubjects,
    access.normalizedClassLevel,
    subject
  );

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    items: rows.map((r) => ({
      ...r,
      dateTaught: r.dateTaught ? new Date(r.dateTaught).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      assessmentItems: r.assessmentItems.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        maxScore: Number(a.maxScore ?? 0),
        weighting: a.weighting == null ? null : Number(a.weighting),
        status: a.status,
        date: a.date ? new Date(a.date).toISOString() : null,
        assessmentPolicyId: a.assessmentPolicyId ?? null,
        policyComponentId: a.policyComponentId ?? null,
        componentCode: a.componentCode ?? null,
        templateKey: a.templateKey ?? null,
        sortOrder: a.sortOrder ?? 0,
        isRequired: a.isRequired ?? true,
        publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
        lockedAt: a.lockedAt ? new Date(a.lockedAt).toISOString() : null,
        scoresCount: a._count.scores,
      })),
    })),
  });
}