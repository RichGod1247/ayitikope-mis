//src/app/api/headteacher/assessment/mock/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
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

type ClassroomRow = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
  status?: string | null;
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

function studentName(student: StudentRow) {
  return `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Learner";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function classroomLabel(classroom: ClassroomRow) {
  const name = cleanMockStr(classroom.name) || "Classroom";
  const grade = cleanMockStr(classroom.grade);
  const arm = cleanMockStr(classroom.arm);

  if (grade && arm) return `${name} (${grade} ${arm})`;
  if (grade) return `${name} (${grade})`;
  return name;
}

function pickDefaultClassroom(classrooms: ClassroomRow[], requestedId: string | null) {
  if (requestedId && classrooms.some((c) => c.id === requestedId)) {
    return requestedId;
  }

  const singleStream = classrooms.find((c) => !cleanMockStr(c.arm));
  if (singleStream) return singleStream.id;

  return classrooms[0]?.id ?? null;
}

function mapReadinessCounts(rows: { readiness: { code: string } }[]) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const key = cleanMockStr(row.readiness.code) || "UNKNOWN";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
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
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const requestedClassroomId = cleanMockStr(searchParams.get("classroomId")) || null;
  const requestedSessionId = cleanMockStr(searchParams.get("sessionId")) || null;
  const requestedAcademicYear = cleanMockStr(searchParams.get("academicYear")) || null;

  const rawClassrooms = await prisma.classroom.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      OR: [
        { name: { contains: "JHS", mode: "insensitive" } },
        { grade: { contains: "JHS", mode: "insensitive" } },
        { name: { contains: "Basic 9", mode: "insensitive" } },
        { grade: { contains: "Basic 9", mode: "insensitive" } },
        { name: { contains: "B9", mode: "insensitive" } },
        { grade: { contains: "B9", mode: "insensitive" } },
      ],
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
      status: true,
    },
  });

  const classrooms = rawClassrooms.filter((classroom) => isJhs3MockClassroom(classroom));

  const selectedClassroomId = pickDefaultClassroom(classrooms, requestedClassroomId);

  if (!selectedClassroomId) {
    return noStore(200, {
      ok: true,
      classrooms,
      selectedClassroomId: null,
      sessions: [],
      selectedSessionId: null,
      broadsheet: null,
      warning: "NO_JHS3_CLASSROOM_FOUND",
    });
  }

  const selectedClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ?? null;

  const sessionWhere = {
    tenantId: ctx.tenantId,
    classroomId: selectedClassroomId,
    ...(requestedAcademicYear ? { academicYear: requestedAcademicYear } : {}),
  };

  const sessions = await prisma.mockExamSession.findMany({
    where: sessionWhere,
    orderBy: [{ academicYear: "desc" }, { mockNumber: "asc" }, { createdAt: "asc" }],
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
      createdAt: true,
      updatedAt: true,
    },
  });

  const selectedSession =
    (requestedSessionId
      ? sessions.find((session) => session.id === requestedSessionId)
      : null) ??
    sessions[0] ??
    null;

  if (!selectedSession) {
    return noStore(200, {
      ok: true,
      classrooms: classrooms.map((classroom) => ({
        ...classroom,
        label: classroomLabel(classroom),
      })),
      selectedClassroomId,
      selectedClassroom,
      sessions: [],
      selectedSessionId: null,
      broadsheet: null,
      warning: "NO_MOCK_SESSION_FOUND",
    });
  }

  const [students, items] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: selectedSession.classroomId,
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
        classroomId: selectedSession.classroomId,
        academicYear: selectedSession.academicYear,
        mockExamSessionId: selectedSession.id,
        type: "MOCK",
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

  const placementReadyRows = studentRows.filter((row) => row.placementAggregate.ok);
  const schoolAggregateReadyRows = studentRows.filter((row) => row.schoolAggregate.ok);

  const classPlacementAggregates = placementReadyRows
    .map((row) => row.placementAggregate.aggregate)
    .filter((value): value is number => typeof value === "number");

  const classAveragePlacementAggregate =
    classPlacementAggregates.length > 0
      ? round1(
          classPlacementAggregates.reduce((sum, value) => sum + value, 0) /
            classPlacementAggregates.length
        )
      : null;

  const weakestSubjects = subjectSummaries
    .filter((subject) => subject.averageGrade != null)
    .sort((a, b) => Number(b.averageGrade ?? 0) - Number(a.averageGrade ?? 0))
    .slice(0, 3);

  const topSubjects = subjectSummaries
    .filter((subject) => subject.averageGrade != null)
    .sort((a, b) => Number(a.averageGrade ?? 99) - Number(b.averageGrade ?? 99))
    .slice(0, 3);

  return noStore(200, {
    ok: true,
    classrooms: classrooms.map((classroom) => ({
      ...classroom,
      label: classroomLabel(classroom),
    })),
    selectedClassroomId,
    selectedClassroom,
    sessions: sessions.map((session) => ({
      id: session.id,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
      date: session.date ? session.date.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    })),
    selectedSessionId: selectedSession.id,
    broadsheet: {
      session: {
        id: selectedSession.id,
        classroomId: selectedSession.classroomId,
        academicYear: selectedSession.academicYear,
        term: selectedSession.term,
        mockNumber: selectedSession.mockNumber,
        mockLabel: selectedSession.mockLabel,
        title: selectedSession.title,
        status: selectedSession.status,
        date: selectedSession.date ? selectedSession.date.toISOString() : null,
      },
      classroom: selectedClassroom,
      summary: {
        totalStudents: students.length,
        totalSubjects: typedItems.length,
        possibleCells,
        scoredCells,
        missingCells: Math.max(0, possibleCells - scoredCells),
        completionPercent,
        schoolAggregateReadyCount: schoolAggregateReadyRows.length,
        placementReadyCount: placementReadyRows.length,
        classAveragePlacementAggregate,
        classReadiness: readinessBandFromAggregate(classAveragePlacementAggregate),
        readinessCounts: mapReadinessCounts(studentRows),
      },
      subjectSummaries,
      weakestSubjects,
      topSubjects,
      students: studentRows,
      warnings: {
        aggregateMayBeIncomplete: typedItems.length < 6 || placementReadyRows.length < students.length,
        message:
          typedItems.length < 6
            ? "Mock subjects are fewer than required for full BECE aggregate analysis."
            : null,
      },
    },
  });
}