// src/app/api/headteacher/assessment/publish-state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["PUBLISH", "REOPEN", "LOCK"]),
  classroomId: z.string().min(1),
  term: z.string().min(1),
  academicYear: z.string().min(1),
});

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Transitional legacy route.
 *
 * Continuous-assessment items are no longer meant to be published/locked as a normal
 * operational workflow. To avoid trapping old data, we still allow REOPEN so any
 * previously published/locked items can be returned to DRAFT.
 *
 * Allowed:
 *  - REOPEN
 *
 * Retired:
 *  - PUBLISH
 *  - LOCK
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;

  try {
    const raw = await req.json();
    const body = BodySchema.parse(raw);

    const classroom = await prisma.classroom.findFirst({
      where: {
        id: body.classroomId,
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });

    if (!classroom) {
      return noStore(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });
    }

    const baseWhere = {
      tenantId: ctx.tenantId,
      classroomId: body.classroomId,
      term: body.term,
      academicYear: body.academicYear,
    };

    const totalItems = await prisma.assessmentItem.count({
      where: baseWhere,
    });

    if (totalItems === 0) {
      return noStore(404, { ok: false, error: "NO_ITEMS_FOUND" });
    }

    if (body.action !== "REOPEN") {
      return noStore(409, {
        ok: false,
        error: "ASSESSMENT_STATE_CONTROL_RETIRED",
        message:
          "Continuous-assessment publish/lock has been retired. Assessment entry now follows record → verify → analyze. Only REOPEN is kept to recover older readonly items.",
      });
    }

    const res = await prisma.assessmentItem.updateMany({
      where: {
        ...baseWhere,
        OR: [
          { status: "PUBLISHED" },
          { status: "LOCKED" },
          { publishedAt: { not: null } },
          { lockedAt: { not: null } },
        ],
      },
      data: {
        status: "DRAFT",
        publishedAt: null,
        lockedAt: null,
      },
    });

    const [draftItemsCount, publishedItemsCount, lockedItemsCount] =
      await Promise.all([
        prisma.assessmentItem.count({
          where: { ...baseWhere, status: "DRAFT" },
        }),
        prisma.assessmentItem.count({
          where: { ...baseWhere, status: "PUBLISHED" },
        }),
        prisma.assessmentItem.count({
          where: { ...baseWhere, status: "LOCKED" },
        }),
      ]);

    return noStore(200, {
      ok: true,
      action: "REOPEN",
      classroom: {
        id: classroom.id,
        name: classroom.name,
      },
      changedCount: res.count,
      summary: {
        totalItems,
        draftItemsCount,
        publishedItemsCount,
        lockedItemsCount,
      },
      note: "Legacy readonly items reopened to DRAFT.",
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return noStore(400, {
        ok: false,
        error: "INVALID_DATA",
        details: err.flatten(),
      });
    }

    console.error("[HEADTEACHER_ASSESSMENT_PUBLISH_STATE_POST_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_UPDATE_ITEM_STATE" });
  }
}