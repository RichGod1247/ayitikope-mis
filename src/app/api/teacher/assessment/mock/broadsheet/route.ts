//src/app/api/teacher/assessment/mock/broadsheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import {
  calculatePlacementMockAggregate,
  calculateSchoolMockAggregate,
  canonicalMockSubject,
  cleanMockStr,
  isJhs3MockClassroom,
  mockGradeFromScore,
  readinessBandFromAggregate,
} from "@/lib/assessments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudentRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
};

type ScoreRow = {
  studentId: string;
  score: number;
  comment: string | null;
};

type MockItemRow = {
  id: string;
  subject: string;
  title: string;
  maxScore: number;
  status: string;
  lockedAt: Date | null;
  scores: ScoreRow[];
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
  return `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Learner";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function subjectWhereForRole(args: {
  roleName: string | null;
  allowedSubjects: string[] | null;
}): Prisma.AssessmentItemWhereInput {
  if (isAdminLikeRole(args.roleName)) return {};

  const allowed = Array.isArray(args.allowedSubjects)
    ? args.allowedSubjects.map(cleanMockStr).filter(Boolean)
    : [];

  if (!allowed.length) {
    return {
      id: "__NO_VISIBLE_MOCK_SUBJECTS__",
    };
  }

  return {
    OR: allowed.map((subject) => ({
      subject: { equals: subject, mode: "insensitive" },
    })),
  };
}

function buildSubjectSummary(item: MockItemRow, totalStudents: number) {
  const validScores = item.scores
    .map((score) => ({
      ...score,
      grade: mockGradeFromScore(score.score),
    }))
    .filter((score) => score.grade);

  const scoredCount = validScores.length;
  const averageScore =
    scoredCount > 0
      ? round1(validScores.reduce((sum, score) => sum + score.score, 0) / scoredCount)
      : null;

  const averageGrade =
    scoredCount > 0
      ? round1(
          validScores.reduce((sum, score) => sum + Number(score.grade?.grade ?? 0), 0) /
            scoredCount
        )
      : null;

  const gradeDistribution = Array.from({ length: 9 }, (_, i) => i + 1).map((grade) => ({
    grade,
    count: validScores.filter((score) => score.grade?.grade === grade).length,
  }));

  return {
    itemId: item.id,
    subject: item.subject,
    canonicalSubject: canonicalMockSubject(item.subject),
    title: item.title,
    maxScore: item.maxScore,
    status: item.status,
    lockedAt: item.lockedAt ? item.lockedAt.toISOString() : null,
    scoredCount,
    missingCount: Math.max(0, totalStudents - scoredCount),
    averageScore,
    averageGrade,
    gradeDistribution,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const sessionId = cleanMockStr(searchParams.get("sessionId"));

  if (!sessionId) {
    return noStore(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  const session = await prisma.mockExamSession.findFirst({
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

  if (!session) {
    return noStore(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: session.classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  if (!isJhs3MockClassroom(session.classroom)) {
    return noStore(400, {
      ok: false,
      error: "MOCK_JHS3_ONLY",
      message: "BECE Mock is currently enabled only for JHS 3.",
      classroom: session.classroom,
    });
  }

  const [students, items] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: session.classroomId,
        status: "ACTIVE",
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    }),

    prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        mockExamSessionId: session.id,
        type: "MOCK",
        ...subjectWhereForRole({
          roleName: ctx.roleName,
          allowedSubjects: access.allowedSubjects,
        }),
      },
      orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        subject: true,
        title: true,
        maxScore: true,
        status: true,
        lockedAt: true,
        scores: {
          select: {
            studentId: true,
            score: true,
            comment: true,
          },
        },
      },
    }),
  ]);

  const typedItems: MockItemRow[] = items.map((item) => ({
    id: item.id,
    subject: item.subject,
    title: item.title,
    maxScore: item.maxScore,
    status: item.status,
    lockedAt: item.lockedAt,
    scores: item.scores.map((score) => ({
      studentId: score.studentId,
      score: score.score,
      comment: score.comment,
    })),
  }));

  const subjectSummaries = typedItems.map((item) =>
    buildSubjectSummary(item, students.length)
  );

  const studentRows = students.map((student) => {
    const subjectScores = typedItems.map((item) => {
      const score = item.scores.find((row) => row.studentId === student.id) ?? null;
      const grade = score ? mockGradeFromScore(score.score) : null;

      return {
        itemId: item.id,
        subject: item.subject,
        canonicalSubject: canonicalMockSubject(item.subject),
        score: score?.score ?? null,
        comment: score?.comment ?? null,
        grade: grade?.grade ?? null,
        gradeLabel: grade?.label ?? null,
        remark: grade?.remark ?? null,
        nextGrade: grade?.nextGrade ?? null,
        pointsToNextGrade: grade?.pointsToNextGrade ?? null,
      };
    });

    const scoredSubjects = subjectScores.filter((subject) => subject.score != null);
    const averageScore =
      scoredSubjects.length > 0
        ? round1(
            scoredSubjects.reduce((sum, subject) => sum + Number(subject.score ?? 0), 0) /
              scoredSubjects.length
          )
        : null;

    const aggregateInputs = subjectScores.map((subject) => ({
      subject: subject.subject,
      score: subject.score,
      grade: subject.grade,
    }));

    const schoolAggregate = calculateSchoolMockAggregate(aggregateInputs);
    const placementAggregate = calculatePlacementMockAggregate(aggregateInputs);

    const readiness = placementAggregate.ok
      ? readinessBandFromAggregate(placementAggregate.aggregate)
      : readinessBandFromAggregate(null);

    return {
      studentId: student.id,
      name: studentName(student),
      scoredSubjectCount: scoredSubjects.length,
      missingSubjectCount: Math.max(0, typedItems.length - scoredSubjects.length),
      averageScore,
      subjects: subjectScores,
      schoolAggregate,
      placementAggregate,
      readiness,
    };
  });

  const possibleCells = students.length * typedItems.length;
  const scoredCells = typedItems.reduce((sum, item) => sum + item.scores.length, 0);
  const completionPercent =
    possibleCells > 0 ? round1((scoredCells / possibleCells) * 100) : 0;

  const placementReadyCount = studentRows.filter(
    (row) => row.placementAggregate.ok
  ).length;

  const schoolAggregateReadyCount = studentRows.filter(
    (row) => row.schoolAggregate.ok
  ).length;

  const classPlacementAggregates = studentRows
    .map((row) => row.placementAggregate.aggregate)
    .filter((value): value is number => typeof value === "number");

  const classAveragePlacementAggregate =
    classPlacementAggregates.length > 0
      ? round1(
          classPlacementAggregates.reduce((sum, value) => sum + value, 0) /
            classPlacementAggregates.length
        )
      : null;

  return noStore(200, {
    ok: true,
    session: {
      id: session.id,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
      date: session.date ? session.date.toISOString() : null,
    },
    classroom: session.classroom,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
      visibleSubjectCount: typedItems.length,
    },
    summary: {
      totalStudents: students.length,
      visibleSubjectCount: typedItems.length,
      possibleCells,
      scoredCells,
      missingCells: Math.max(0, possibleCells - scoredCells),
      completionPercent,
      schoolAggregateReadyCount,
      placementReadyCount,
      classAveragePlacementAggregate,
      classReadiness: readinessBandFromAggregate(classAveragePlacementAggregate),
    },
    subjectSummaries,
    students: studentRows,
    warnings: {
      aggregateMayBeIncomplete:
        typedItems.length < 6 || placementReadyCount < students.length,
      message:
        typedItems.length < 6
          ? "Visible mock subjects are fewer than required for full BECE aggregate analysis."
          : null,
    },
  });
}