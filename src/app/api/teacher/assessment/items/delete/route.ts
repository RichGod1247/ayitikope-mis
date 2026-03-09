// src/app/api/teacher/assessment/items/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess, isAdminLikeRole } from "@/lib/teacherAccess";
import { assertAssessmentItemWritable } from "@/lib/assessments/itemWriteState";

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

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";

  if (!itemId) {
    return noStore(400, { ok: false, error: "ITEM_ID_REQUIRED" });
  }

  try {
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
        createdByUserId: true, // ✅ ownership
      },
    });

    if (!item || item.tenantId !== ctx.tenantId) {
      return noStore(404, { ok: false, error: "ITEM_NOT_FOUND" });
    }

    // ✅ Bank-grade ownership
    if (!isAdminLikeRole(ctx.roleName)) {
      if (!item.createdByUserId) {
        return noStore(403, { ok: false, error: "ITEM_OWNER_MISSING" });
      }
      if (item.createdByUserId !== ctx.userId) {
        return noStore(403, { ok: false, error: "ITEM_FORBIDDEN" });
      }
    }

    const access = await resolveUserClassroomAccess({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      classroomId: item.classroomId,
      subject: item.subject,
    });

    if (!access.ok) {
      return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
        ok: false,
        error: access.reason,
      });
    }

    // ✅ lifecycle protection
    assertAssessmentItemWritable(item);

    await prisma.assessmentScore.deleteMany({ where: { itemId } });
    await prisma.assessmentItem.delete({ where: { id: itemId } });

    return noStore(200, { ok: true });
  } catch (err: any) {
    const msg = String(err?.message || "FAILED_TO_DELETE_ITEM");

    if (msg === "ITEM_PUBLISHED" || msg === "ITEM_LOCKED") {
      return noStore(409, { ok: false, error: msg });
    }

    console.error("[ASSESSMENT_ITEM_DELETE_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_DELETE_ITEM" });
  }
}