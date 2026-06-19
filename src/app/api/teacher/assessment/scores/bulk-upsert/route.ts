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

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
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
        term: true,
        academicYear: true,
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
      return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
        ok: false,
        error: access.reason,
      });
    }

    assertAssessmentItemWritable(item);

    const maxScore = Number(item.maxScore ?? 0);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      return noStore(400, { ok: false, error: "INVALID_ITEM_MAX_SCORE" });
    }

    const trimmedScores = data.scores.map((s) => ({
      studentId: s.studentId.trim(),
      score: Number(s.score),
      comment: s.comment == null ? null : String(s.comment).trim() || null,
    }));

    const studentIds = trimmedScores.map((s) => s.studentId).filter(Boolean);
    const uniqueStudentIds = Array.from(new Set(studentIds));

    if (uniqueStudentIds.length !== studentIds.length) {
      return noStore(400, { ok: false, error: "DUPLICATE_STUDENT_SCORE" });
    }

    const invalidScore = trimmedScores.find(
      (s) => !Number.isFinite(s.score) || s.score < 0 || s.score > maxScore
    );

    if (invalidScore) {
      return noStore(400, {
        ok: false,
        error: "INVALID_SCORE_RANGE",
        studentId: invalidScore.studentId,
        score: invalidScore.score,
        maxScore,
      });
    }

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

    const existingScores = uniqueStudentIds.length
      ? await prisma.assessmentScore.findMany({
          where: {
            itemId: data.itemId,
            studentId: { in: uniqueStudentIds },
          },
          select: { id: true, studentId: true, score: true, comment: true },
        })
      : [];

    const existingByStudent = new Map(
      existingScores.map((s) => [
        s.studentId,
        {
          id: s.id,
          score: Number(s.score ?? 0),
          comment: s.comment ?? null,
        },
      ])
    );

    const results = await prisma.$transaction(async (tx) => {
      const saved = [];

      for (const s of trimmedScores) {
        const before = existingByStudent.get(s.studentId) ?? null;

        const row = await tx.assessmentScore.upsert({
          where: {
            assessment_student_unique: {
              itemId: data.itemId,
              studentId: s.studentId,
            },
          },
          update: {
            score: s.score,
            comment: s.comment,
          },
          create: {
            itemId: data.itemId,
            studentId: s.studentId,
            score: s.score,
            comment: s.comment,
          },
        });

        saved.push(row);

        const changed =
          !before ||
          before.score !== s.score ||
          String(before.comment ?? "") !== String(s.comment ?? "");

        if (changed) {
          await tx.auditLog.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: before
                ? "ASSESSMENT_SCORE_UPDATED"
                : "ASSESSMENT_SCORE_CREATED",
              resource: "AssessmentScore",
              resourceId: row.id,
              ip: clientIp(req),
              userAgent: userAgent(req),
              metadata: {
                itemId: item.id,
                classroomId: item.classroomId,
                subject: item.subject,
                term: item.term,
                academicYear: item.academicYear,
                studentId: s.studentId,
                maxScore,
                before,
                after: {
                  score: s.score,
                  comment: s.comment,
                },
              },
            },
          });
        }
      }

      return saved;
    });

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