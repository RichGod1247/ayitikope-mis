//src/app/api/headteacher/assessment/items/publish/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";

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
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";

  if (!itemId) return noStore(400, { ok: false, error: "ITEM_ID_REQUIRED" });

  const item = await prisma.assessmentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      subject: true,
      status: true,
      publishedAt: true,
      lockedAt: true,
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

  if (item.lockedAt || String(item.status ?? "").toUpperCase() === "LOCKED") {
    return noStore(409, { ok: false, error: "ITEM_LOCKED" });
  }

  const updated = await prisma.assessmentItem.update({
    where: { id: itemId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByUserId: ctx.userId,
    },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      lockedAt: true,
    },
  });

  return noStore(200, { ok: true, item: updated });
}