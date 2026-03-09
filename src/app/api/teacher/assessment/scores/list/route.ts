//src/app/api/teacher/assessment/scores/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const itemId = (searchParams.get("itemId") || "").trim();
  if (!itemId) {
    return noStore(400, { ok: false, error: "ITEM_ID_REQUIRED" });
  }

  const item = await prisma.assessmentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      subject: true,
    },
  });

  if (!item || item.tenantId !== ctx.tenantId) {
    return noStore(404, { ok: false, error: "ITEM_NOT_FOUND" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: item.classroomId,
    subject: item.subject,
  });

  if (!access.ok) {
    return noStore(
      isForbiddenReason(access.reason) ? 403 : 404,
      { ok: false, error: access.reason }
    );
  }

  const scores = await prisma.assessmentScore.findMany({
    where: { itemId },
    orderBy: { createdAt: "asc" },
    select: { studentId: true, score: true, comment: true },
  });

  return noStore(200, { ok: true, itemId, scores });
}