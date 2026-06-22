// src/app/api/teacher/lesson-deliveries/approved-notes/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

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

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = (searchParams.get("classroomId") || "").trim();
  const term = (searchParams.get("term") || "").trim();
  const academicYear = (searchParams.get("academicYear") || "").trim();
  const subject = (searchParams.get("subject") || "").trim();

  if (!classroomId || !term || !academicYear) {
    return noStore(400, {
      ok: false,
      error: "MISSING_REQUIRED_FILTERS",
    });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    subject: subject || null,
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
    term,
    academicYear,
    status: "APPROVED",
    ...(subject ? { subject: { equals: subject, mode: "insensitive" as const } } : {}),
  };

  if (!isAdminLikeRole(ctx.roleName)) {
    where.teacherUserId = ctx.userId;
  }

  if (Array.isArray(access.allowedSubjects) && access.allowedSubjects.length > 0 && !isAdminLikeRole(ctx.roleName)) {
    where.OR = access.allowedSubjects.map((s) => ({
      subject: { equals: s, mode: "insensitive" as const },
    }));
  }

  const rows = await prisma.lessonNote.findMany({
    where,
    orderBy: [{ lessonDate: "asc" }, { approvedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      classroomId: true,
      teacherUserId: true,
      subject: true,
      term: true,
      academicYear: true,
      lessonDate: true,
      lessonTitle: true,
      curriculumUnitId: true,
      contentStandard: true,
      indicator: true,
      approvedAt: true,
    },
    take: 200,
  });

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    items: rows.map((r) => ({
      ...r,
      lessonDate: r.lessonDate ? new Date(r.lessonDate).toISOString() : null,
      approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
    })),
  });
}