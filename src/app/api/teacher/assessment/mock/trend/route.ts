//src/app/api/teacher/assessment/mock/trend/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import {
  canonicalMockSubject,
  cleanMockStr,
  isJhs3MockClassroom,
  mockGradeFromScore,
} from "@/lib/assessments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudentRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
};

function noStore(status: number, payload: unknown) {
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

function studentName(student: StudentRow) {
  return (
    `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Learner"
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function sameSubject(a: unknown, b: unknown) {
  return canonicalMockSubject(a) === canonicalMockSubject(b);
}

function subjectWhereForRole(args: {
  roleName: string | null;
  allowedSubjects: string[] | null;
  subject: string;
}): Prisma.AssessmentItemWhereInput {
  if (isAdminLikeRole(args.roleName)) {
    return {
      subject: { equals: args.subject, mode: "insensitive" },
    };
  }

  const allowed = Array.isArray(args.allowedSubjects)
    ? args.allowedSubjects.map(cleanMockStr).filter(Boolean)
    : [];

  const allowedMatch = allowed.some((s) => sameSubject(s, args.subject));

  if (!allowedMatch) {
    return {
      id: "__SUBJECT_NOT_VISIBLE_TO_TEACHER__",
    };
  }

  return {
    OR: allowed
      .filter((s) => sameSubject(s, args.subject))
      .map((subject) => ({
        subject: { equals: subject, mode: "insensitive" },
      })),
  };
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

  const sessionId = cleanMockStr(searchParams.get("sessionId"));
  const subject = cleanMockStr(searchParams.get("subject"));

  if (!sessionId) {
    return noStore(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  if (!subject) {
    return noStore(400, { ok: false, error: "MISSING_SUBJECT" });
  }

  const selectedSession = await prisma.mockExamSession.findFirst({
    where: {
      id: sessionId,
      tenantId: ctx.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      date: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
        },
      },
    },
  });

  if (!selectedSession) {
    return noStore(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: selectedSession.classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  if (!isJhs3MockClassroom(selectedSession.classroom)) {
    return noStore(400, {
      ok: false,
      error: "MOCK_JHS3_ONLY",
      message: "BECE Mock trend is currently enabled only for JHS 3.",
    });
  }

  const subjectWhere = subjectWhereForRole({
    roleName: ctx.roleName,
    allowedSubjects: access.allowedSubjects,
    subject,
  });

  const visibleSelectedItem = await prisma.assessmentItem.findFirst({
    where: {
      tenantId: ctx.tenantId,
      classroomId: selectedSession.classroomId,
      academicYear: selectedSession.academicYear,
      mockExamSessionId: selectedSession.id,
      type: "MOCK",
      ...subjectWhere,
    },
    select: {
      id: true,
      subject: true,
      status: true,
    },
  });

  if (!visibleSelectedItem) {
    return noStore(403, {
      ok: false,
      error: "MOCK_SUBJECT_NOT_VISIBLE",
      message: "This subject is not visible under your Mock teacher access.",
    });
  }

  if (cleanMockStr(selectedSession.status).toUpperCase() !== "LOCKED") {
    return noStore(200, {
      ok: true,
      available: false,
      reason:
        "Trend opens after this Mock is sealed. This protects teachers from comparing editable scores.",
      subject: visibleSelectedItem.subject,
      selectedSession: {
        id: selectedSession.id,
        mockLabel: selectedSession.mockLabel,
        title: selectedSession.title,
        status: selectedSession.status,
      },
      previousSession: null,
      summary: null,
      learners: [],
    });
  }

  const lockedSessions = await prisma.mockExamSession.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: selectedSession.classroomId,
      academicYear: selectedSession.academicYear,
      status: "LOCKED",
    },
    orderBy: [{ mockNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      date: true,
      createdAt: true,
    },
  });

  const selectedIndex = lockedSessions.findIndex(
    (session) => session.id === selectedSession.id,
  );

  const previousSession =
    selectedIndex > 0 ? lockedSessions[selectedIndex - 1] : null;

  if (!previousSession) {
    return noStore(200, {
      ok: true,
      available: false,
      reason:
        "At least two sealed Mocks are needed before subject trend can be shown.",
      subject: visibleSelectedItem.subject,
      selectedSession: {
        id: selectedSession.id,
        mockLabel: selectedSession.mockLabel,
        title: selectedSession.title,
        status: selectedSession.status,
      },
      previousSession: null,
      summary: null,
      learners: [],
    });
  }

  const [students, items] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: selectedSession.classroomId,
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

    prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: selectedSession.classroomId,
        academicYear: selectedSession.academicYear,
        mockExamSessionId: {
          in: [previousSession.id, selectedSession.id],
        },
        type: "MOCK",
        ...subjectWhere,
      },
      select: {
        id: true,
        subject: true,
        mockExamSessionId: true,
        scores: {
          select: {
            studentId: true,
            score: true,
          },
        },
      },
    }),
  ]);

  const previousItem =
    items.find((item) => item.mockExamSessionId === previousSession.id) ?? null;
  const latestItem =
    items.find((item) => item.mockExamSessionId === selectedSession.id) ?? null;

  if (!previousItem || !latestItem) {
    return noStore(200, {
      ok: true,
      available: false,
      reason:
        "This subject must exist in both sealed Mocks before trend can be calculated.",
      subject: visibleSelectedItem.subject,
      selectedSession: {
        id: selectedSession.id,
        mockLabel: selectedSession.mockLabel,
        title: selectedSession.title,
        status: selectedSession.status,
      },
      previousSession: {
        id: previousSession.id,
        mockLabel: previousSession.mockLabel,
        title: previousSession.title,
        status: previousSession.status,
      },
      summary: null,
      learners: [],
    });
  }

  const previousScores = new Map(
    previousItem.scores.map((score) => [score.studentId, score.score]),
  );
  const latestScores = new Map(
    latestItem.scores.map((score) => [score.studentId, score.score]),
  );

  const learners = students.map((student) => {
    const previousScore = previousScores.get(student.id) ?? null;
    const latestScore = latestScores.get(student.id) ?? null;

    const previousGrade =
      previousScore == null ? null : mockGradeFromScore(previousScore);
    const latestGrade =
      latestScore == null ? null : mockGradeFromScore(latestScore);

    const canCompare = previousScore != null && latestScore != null;
    const scoreMovement = canCompare
      ? round1(Number(latestScore) - Number(previousScore))
      : null;

    const label =
      !canCompare
        ? "INCOMPLETE"
        : Number(scoreMovement) > 0
          ? "IMPROVING"
          : Number(scoreMovement) < 0
            ? "DECLINING"
            : "STABLE";

    return {
      studentId: student.id,
      name: studentName(student),
      label,
      previousScore,
      latestScore,
      scoreMovement,
      previousGrade: previousGrade?.grade ?? null,
      latestGrade: latestGrade?.grade ?? null,
      latestGradeLabel: latestGrade?.label ?? null,
      latestRemark: latestGrade?.remark ?? null,
      pointsToNextGrade: latestGrade?.pointsToNextGrade ?? null,
      nextGrade: latestGrade?.nextGrade ?? null,
    };
  });

  const comparable = learners.filter((learner) => learner.scoreMovement != null);
  const latestScored = learners.filter((learner) => learner.latestScore != null);
  const previousScored = learners.filter(
    (learner) => learner.previousScore != null,
  );

  const averagePreviousScore =
    previousScored.length > 0
      ? round1(
          previousScored.reduce(
            (sum, learner) => sum + Number(learner.previousScore ?? 0),
            0,
          ) / previousScored.length,
        )
      : null;

  const averageLatestScore =
    latestScored.length > 0
      ? round1(
          latestScored.reduce(
            (sum, learner) => sum + Number(learner.latestScore ?? 0),
            0,
          ) / latestScored.length,
        )
      : null;

  const averageScoreMovement =
    averagePreviousScore != null && averageLatestScore != null
      ? round1(averageLatestScore - averagePreviousScore)
      : null;

  return noStore(200, {
    ok: true,
    available: true,
    reason: null,
    subject: latestItem.subject,
    selectedSession: {
      id: selectedSession.id,
      mockLabel: selectedSession.mockLabel,
      title: selectedSession.title,
      status: selectedSession.status,
    },
    previousSession: {
      id: previousSession.id,
      mockLabel: previousSession.mockLabel,
      title: previousSession.title,
      status: previousSession.status,
    },
    summary: {
      totalLearners: students.length,
      comparedCount: comparable.length,
      improvingCount: learners.filter((learner) => learner.label === "IMPROVING")
        .length,
      decliningCount: learners.filter((learner) => learner.label === "DECLINING")
        .length,
      stableCount: learners.filter((learner) => learner.label === "STABLE")
        .length,
      incompleteCount: learners.filter((learner) => learner.label === "INCOMPLETE")
        .length,
      averagePreviousScore,
      averageLatestScore,
      averageScoreMovement,
    },
    learners: learners.sort((a, b) => {
      const aMove = a.scoreMovement ?? 999;
      const bMove = b.scoreMovement ?? 999;
      return aMove - bMove;
    }),
  });
}