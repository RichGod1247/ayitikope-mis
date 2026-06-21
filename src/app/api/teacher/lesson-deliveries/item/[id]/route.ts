// src/app/api/teacher/lesson-deliveries/item/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id?: string };

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(_req: Request, context: { params: Params } | { params: Promise<Params> }) {
  const auth = await requireApiUserContext(_req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;

  const { id: rawId } = await Promise.resolve((context as any).params as Params);
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) return noStore(400, { ok: false, error: "MISSING_ID" });

  const item = await prisma.lessonDelivery.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      tenantId: true,
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
  });

  if (!item) return noStore(404, { ok: false, error: "NOT_FOUND" });

  if (!isAdminLikeRole(ctx.roleName) && item.teacherUserId !== ctx.userId) {
    return noStore(403, { ok: false, error: "FORBIDDEN" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: item.classroomId,
    subject: item.subject,
  });

  if (!access.ok) {
    const status = access.reason === "OUT_OF_SCOPE" || access.reason === "SUBJECT_OUT_OF_SCOPE" ? 403 : 404;
    return noStore(status, { ok: false, error: access.reason });
  }

  return noStore(200, {
    ok: true,
    item: {
      ...item,
      dateTaught: item.dateTaught ? new Date(item.dateTaught).toISOString() : null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
assessmentItems: item.assessmentItems.map((a) => ({
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
    },
  });
}
