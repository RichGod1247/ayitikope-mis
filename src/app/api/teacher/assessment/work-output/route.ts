// src/app/api/teacher/assessment/work-output/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { subjectMatchesTeachingScope } from "@/lib/teachingSubjectScope";
import {
  buildWorkOutputSnapshot,
  normalizeWorkOutputType,
  workOutputTypeLabel,
  type WorkOutputDeliveryInput,
  type WorkOutputItemInput,
} from "@/lib/assessments/workOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: [
      "TEACHER",
      "HEADTEACHER",
      "ADMIN",
      "SCHOOL_ADMIN",
      "SUPERADMIN",
    ],
  });

  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const { searchParams } = new URL(req.url);
  const classroomId = clean(searchParams.get("classroomId"));
  const subject = clean(searchParams.get("subject"));
  const term = clean(searchParams.get("term")) || "1st Term";
  const academicYear =
    clean(searchParams.get("academicYear")) || "2025/2026";
  const lessonDeliveryId = clean(searchParams.get("lessonDeliveryId"));

  if (!classroomId || !subject) {
    return jsonNoStore(400, {
      ok: false,
      error: "classroomId and subject are required.",
    });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    subject,
  });

  if (!access.ok) {
    return jsonNoStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  try {
    const [studentsRaw, deliveriesRaw, legacyUnlinkedRaw] = await Promise.all([
      prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          classroomId,
          status: "ACTIVE",
        },
        orderBy: [
          { lastName: "asc" },
          { firstName: "asc" },
          { createdAt: "asc" },
        ],
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      }),
      prisma.lessonDelivery.findMany({
        where: {
          tenantId: ctx.tenantId,
          classroomId,
          teacherUserId: ctx.userId,
          term,
          academicYear,
        },
        orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          subject: true,
          dateTaught: true,
          lessonNoteId: true,
          lessonNote: {
            select: {
              lessonTitle: true,
            },
          },
          assessmentItems: {
            where: {
              type: { not: "MOCK" },
            },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              subject: true,
              title: true,
              type: true,
              maxScore: true,
              date: true,
              createdAt: true,
              lessonDeliveryId: true,
              scores: {
                select: {
                  studentId: true,
                  score: true,
                },
              },
            },
          },
        },
      }),
      prisma.assessmentItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          classroomId,
          term,
          academicYear,
          createdByUserId: ctx.userId,
          lessonDeliveryId: null,
          type: { not: "MOCK" },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          subject: true,
          title: true,
          type: true,
          maxScore: true,
          date: true,
          createdAt: true,
          lessonDeliveryId: true,
          scores: {
            select: {
              studentId: true,
              score: true,
            },
          },
        },
      }),
    ]);

    const students = studentsRaw.map((student) => ({
      id: student.id,
      name:
        `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() ||
        "Learner",
    }));

    const activeStudentIds = new Set(students.map((student) => student.id));

    const deliveries: WorkOutputDeliveryInput[] = deliveriesRaw
      .filter((delivery) =>
        subjectMatchesTeachingScope(
          delivery.subject,
          subject,
          access.normalizedClassLevel
        )
      )
      .map((delivery) => ({
        id: delivery.id,
        subject: delivery.subject,
        dateTaught: delivery.dateTaught,
        lessonNoteId: delivery.lessonNoteId ?? null,
        lessonTitle: delivery.lessonNote?.lessonTitle ?? null,
        items: delivery.assessmentItems
          .filter((item) =>
            subjectMatchesTeachingScope(
              item.subject,
              subject,
              access.normalizedClassLevel
            )
          )
          .map(
            (item): WorkOutputItemInput => ({
              id: item.id,
              title: item.title,
              type: item.type,
              maxScore: Number(item.maxScore ?? 0),
              date: item.date,
              createdAt: item.createdAt,
              lessonDeliveryId: item.lessonDeliveryId ?? null,
              scores: item.scores
                .filter((score) => activeStudentIds.has(score.studentId))
                .map((score) => ({
                  studentId: score.studentId,
                  score: Number(score.score ?? 0),
                })),
            })
          ),
      }));

    const deliverySummaries = deliveries.map((delivery) => ({
      id: delivery.id,
      subject: delivery.subject,
      lessonNoteId: delivery.lessonNoteId ?? null,
      lessonTitle: delivery.lessonTitle ?? null,
      dateTaught: toIso(delivery.dateTaught),
      assessmentCount: delivery.items.length,
      scoredAssessmentCount: delivery.items.filter(
        (item) => item.scores.length > 0
      ).length,
      items: delivery.items.map((item) => {
        const normalizedType = normalizeWorkOutputType(item.type);

        return {
          id: item.id,
          title: item.title,
          type: normalizedType,
          typeLabel: workOutputTypeLabel(normalizedType),
          maxScore: Number(item.maxScore ?? 0),
          date: toIso(item.date ?? item.createdAt ?? null),
          scoresCount: item.scores.length,
        };
      }),
    }));

    if (
      lessonDeliveryId &&
      !deliveries.some((delivery) => delivery.id === lessonDeliveryId)
    ) {
      return jsonNoStore(404, {
        ok: false,
        error: "LESSON_DELIVERY_NOT_FOUND_IN_SCOPE",
      });
    }

    const legacyUnlinkedItems: WorkOutputItemInput[] = legacyUnlinkedRaw
      .filter((item) =>
        subjectMatchesTeachingScope(
          item.subject,
          subject,
          access.normalizedClassLevel
        )
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        maxScore: Number(item.maxScore ?? 0),
        date: item.date,
        createdAt: item.createdAt,
        lessonDeliveryId: null,
        scores: item.scores
          .filter((score) => activeStudentIds.has(score.studentId))
          .map((score) => ({
            studentId: score.studentId,
            score: Number(score.score ?? 0),
          })),
      }));

    const workOutput = buildWorkOutputSnapshot({
      deliveries,
      legacyUnlinkedItems,
      students,
      lessonDeliveryId: lessonDeliveryId || null,
    });

    return jsonNoStore(200, {
      ok: true,
      classroom: access.classroom,
      scope: {
        teacherUserId: ctx.userId,
        classroomId,
        subject,
        term,
        academicYear,
        normalizedClassLevel: access.normalizedClassLevel,
      },
      deliveries: deliverySummaries,
      workOutput,
      interpretation: {
        purpose: "FORMATIVE_PRACTICE_PROGRESS",
        ranking: false,
        broadsheetAuthority: "EXISTING_ASSESSMENT_POLICY",
      },
    });
  } catch (error: unknown) {
    console.error("[TEACHER_WORK_OUTPUT_ERROR]", error);
    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_WORK_OUTPUT",
    });
  }
}
