//src/app/api/teacher/assessment/scores/bulk-upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { assertAssessmentItemWritable } from "@/lib/assessments/itemWriteState";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ScoreSchema = z.object({
  studentId: z.string().min(1),
  score: z.number().min(0),
  comment: z.string().nullable().optional(),
});

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  scores: z.array(ScoreSchema),
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

  try {
    const json = await req.json();
    const data = PayloadSchema.parse(json);

    const item = await prisma.assessmentItem.findUnique({
      where: { id: data.itemId },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        subject: true,
        maxScore: true,
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

    assertAssessmentItemWritable(item);

    const uniqueStudentIds = Array.from(
      new Set(data.scores.map((s) => s.studentId.trim()).filter(Boolean))
    );

    if (uniqueStudentIds.length > 0) {
      const validStudents = await prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          classroomId: item.classroomId,
          status: "ACTIVE",
          id: { in: uniqueStudentIds },
        },
        select: { id: true },
      });

      if (validStudents.length !== uniqueStudentIds.length) {
        return noStore(400, { ok: false, error: "INVALID_STUDENT_SCOPE" });
      }
    }

    const maxScore = Number(item.maxScore ?? 0);
    const results = [];

    for (const s of data.scores) {
      let safe = s.score;
      if (maxScore > 0) {
        if (safe < 0) safe = 0;
        if (safe > maxScore) safe = maxScore;
      }

      const row = await prisma.assessmentScore.upsert({
        where: {
          assessment_student_unique: {
            itemId: data.itemId,
            studentId: s.studentId,
          },
        },
        update: {
          score: safe,
          comment: s.comment ?? null,
        },
        create: {
          itemId: data.itemId,
          studentId: s.studentId,
          score: safe,
          comment: s.comment ?? null,
        },
      });

      results.push(row);
    }

    return noStore(200, {
      ok: true,
      itemId: data.itemId,
      count: results.length,
      scores: results,
    });
  } catch (err: any) {
    const msg = String(err?.message || "");

    if (msg === "ITEM_PUBLISHED" || msg === "ITEM_LOCKED") {
      return noStore(409, { ok: false, error: msg });
    }

    if (err instanceof z.ZodError) {
      return noStore(400, {
        ok: false,
        error: "INVALID_DATA",
        details: err.flatten(),
      });
    }

    console.error("[ASSESSMENT_SCORES_BULK_UPSERT_ERROR]", err);
    return noStore(500, {
      ok: false,
      error: "FAILED_TO_SAVE_SCORES",
    });
  }
}