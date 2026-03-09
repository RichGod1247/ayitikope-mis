// src/app/api/teacher/lesson-deliveries/update/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
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

const BodySchema = z
  .object({
    id: z.string().min(5),
    notes: z.string().optional().nullable(),
    // allow relinking (optional)
    lessonNoteId: z.string().min(5).optional().nullable(),
    curriculumUnitId: z.string().min(5).optional().nullable(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return noStore(400, { ok: false, error: parsed.error.issues[0]?.message || "INVALID_BODY" });

  const b = parsed.data;

  const existing = await prisma.lessonDelivery.findFirst({
    where: { id: b.id, tenantId: ctx.tenantId },
    select: { id: true, classroomId: true, subject: true, teacherUserId: true, term: true, academicYear: true },
  });

  if (!existing) return noStore(404, { ok: false, error: "NOT_FOUND" });

  if (!isAdminLikeRole(ctx.roleName) && existing.teacherUserId !== ctx.userId) {
    return noStore(403, { ok: false, error: "FORBIDDEN" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: existing.classroomId,
    subject: existing.subject,
  });

  if (!access.ok) {
    const status = access.reason === "OUT_OF_SCOPE" || access.reason === "SUBJECT_OUT_OF_SCOPE" ? 403 : 404;
    return noStore(status, { ok: false, error: access.reason });
  }

  const data: any = {};
  if (b.notes !== undefined) data.notes = b.notes?.trim() || null;
  if (b.lessonNoteId !== undefined) data.lessonNoteId = b.lessonNoteId?.trim() || null;
  if (b.curriculumUnitId !== undefined) data.curriculumUnitId = b.curriculumUnitId?.trim() || null;

  await prisma.lessonDelivery.update({ where: { id: b.id }, data });

  return noStore(200, { ok: true });
}
