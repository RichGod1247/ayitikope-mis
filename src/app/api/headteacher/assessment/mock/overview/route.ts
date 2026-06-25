//src/app/api/headteacher/assessment/mock/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  MOCK_CORE_SUBJECTS,
  MOCK_SCHOOL_AGGREGATE_SUBJECTS,
  calculatePlacementMockAggregate,
  calculateSchoolMockAggregate,
  canonicalMockSubject,
  cleanMockStr,
  isJhs3MockClassroom,
  mockGradeFromScore,
  mockSubjectLabel,
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

type MockActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type MockEvidenceActionMode =
  | "NOTIFY_TEACHER"
  | "REMIND_TEACHER"
  | "LEARNER_SUPPORT_REVIEW"
  | "REVIEW_ONLY";

type MockEvidenceAction = {
  code: string;
  mode: MockEvidenceActionMode;
  priority: MockActionPriority;
  title: string;
  detail: string;
  owner: string;
  primaryAction: string;
  lastResortAction?: string;
  href: string;
  subject?: string;
  studentId?: string;
  studentName?: string;
  missingCount?: number;
};

type MockSubjectSummaryLite = {
  itemId: string;
  subject: string;
  canonicalSubject: string;
  scoredCount: number;
  missingCount: number;
  averageScore: number | null;
  averageGrade: number | null;
};

type MockStudentReadinessRow = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  schoolAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  placementAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  readiness: {
    code: string;
    label: string;
    tone: string;
    action: string;
  };
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

function teacherMockHref(args: {
  sessionId: string;
  itemId?: string | null;
  subject?: string | null;
}) {
  const params = new URLSearchParams();

  if (args.sessionId) params.set("sessionId", args.sessionId);
  if (args.itemId) params.set("itemId", args.itemId);
  if (cleanMockStr(args.subject)) params.set("subject", cleanMockStr(args.subject));

  const query = params.toString();
  return query ? `/teacher/assessment/mock?${query}` : "/teacher/assessment/mock";
}

function uniqueLabels(values: string[]) {
  return Array.from(new Set(values.map(cleanMockStr).filter(Boolean)));
}

function actionPriorityRank(priority: MockActionPriority) {
  if (priority === "CRITICAL") return 0;
  if (priority === "HIGH") return 1;
  if (priority === "MEDIUM") return 2;
  return 3;
}

function sortActions(actions: MockEvidenceAction[]) {
  return [...actions].sort((a, b) => {
    const pr = actionPriorityRank(a.priority) - actionPriorityRank(b.priority);
    if (pr !== 0) return pr;
    return a.title.localeCompare(b.title);
  });
}

function buildMockEvidenceActions(args: {
  sessionId: string;
  totalStudents: number;
  subjectSummaries: MockSubjectSummaryLite[];
  students: MockStudentReadinessRow[];
}) {
  const createdCanonicalSubjects = new Set(
    args.subjectSummaries.map((subject) => subject.canonicalSubject)
  );

  const coreSubjectSet = new Set<string>(MOCK_CORE_SUBJECTS as readonly string[]);

  const missingCoreSubjectColumns = MOCK_CORE_SUBJECTS
    .filter((subject) => !createdCanonicalSubjects.has(subject))
    .map((subject) => mockSubjectLabel(subject));

  const missingSchoolAggregateColumns = MOCK_SCHOOL_AGGREGATE_SUBJECTS
    .filter((subject) => !createdCanonicalSubjects.has(subject))
    .map((subject) => mockSubjectLabel(subject));

  const electiveColumns = args.subjectSummaries.filter(
    (subject) => !coreSubjectSet.has(subject.canonicalSubject)
  );

  const missingElectiveColumnCount = Math.max(0, 2 - electiveColumns.length);

  const subjectScoreGaps = args.subjectSummaries
    .filter((subject) => subject.missingCount > 0)
    .sort((a, b) => {
      if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
      return a.subject.localeCompare(b.subject);
    })
    .map((subject) => ({
      subject: subject.subject,
      canonicalSubject: subject.canonicalSubject,
      itemId: subject.itemId,
      scoredCount: subject.scoredCount,
      missingCount: subject.missingCount,
      completionPercent:
        args.totalStudents > 0
          ? Math.round((subject.scoredCount / args.totalStudents) * 1000) / 10
          : 0,
      href: teacherMockHref({
        sessionId: args.sessionId,
        itemId: subject.itemId,
        subject: subject.subject,
      }),
    }));

  const learnerScoreGaps = args.students
    .filter((student) => student.missingSubjectCount > 0)
    .sort((a, b) => {
      if (b.missingSubjectCount !== a.missingSubjectCount) {
        return b.missingSubjectCount - a.missingSubjectCount;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, 12)
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      scoredSubjectCount: student.scoredSubjectCount,
      missingSubjectCount: student.missingSubjectCount,
      averageScore: student.averageScore,
      missingForPlacement: student.placementAggregate.missingSubjects ?? [],
      readinessCode: student.readiness.code,
    }));

  const learnerRiskSignals = args.students
    .filter((student) => student.averageScore != null && Number(student.averageScore) < 50)
    .sort((a, b) => Number(a.averageScore ?? 999) - Number(b.averageScore ?? 999))
    .slice(0, 12)
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      averageScore: student.averageScore,
      scoredSubjectCount: student.scoredSubjectCount,
      readinessCode: student.readiness.code,
      action: "Review weak subject evidence and assign targeted intervention.",
    }));

  const headlineActions: MockEvidenceAction[] = [];

  for (const subject of missingCoreSubjectColumns) {
  headlineActions.push({
    code: "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS",
    mode: "NOTIFY_TEACHER",
    priority: "CRITICAL",
    title: `Notify ${subject} teacher to open Mock column`,
    detail: `${subject} Mock column is missing. This should be created by the assigned subject teacher before the headteacher intervenes directly.`,
    owner: `${subject} teacher`,
    primaryAction: "Send in-app reminder with deadline",
    lastResortAction:
      "Open teacher Mock cockpit only if the assigned teacher is absent or indisposed",
    href: teacherMockHref({
      sessionId: args.sessionId,
      subject,
    }),
    subject,
    missingCount: 1,
  });
}

  if (missingElectiveColumnCount > 0) {
headlineActions.push({
  code: "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS",
  mode: "NOTIFY_TEACHER",
  priority: "HIGH",
  title: "Notify elective teachers to open enough Mock columns",
  detail: `Placement aggregate needs at least 2 elective subjects. ${missingElectiveColumnCount} more elective column(s) are needed.`,
  owner: "Assigned elective subject teachers",
  primaryAction: "Send in-app reminder with deadline",
  lastResortAction: "Open teacher Mock cockpit only as last-resort administrative support",
  href: teacherMockHref({ sessionId: args.sessionId }),
  missingCount: missingElectiveColumnCount,
});
  }

  const emptySubjectColumns = subjectScoreGaps.filter((subject) => subject.scoredCount === 0);

  for (const subject of emptySubjectColumns.slice(0, 5)) {
headlineActions.push({
  code: "REMIND_EMPTY_SUBJECT_SCORE_ENTRY",
  mode: "REMIND_TEACHER",
  priority: "HIGH",
  title: `Remind ${subject.subject} teacher to enter Mock scores`,
  detail: `${subject.subject} has 0/${args.totalStudents} learner scores entered.`,
  owner: `${subject.subject} teacher`,
  primaryAction: "Send teacher reminder with deadline",
  lastResortAction: "Open score-entry cockpit only if delegated to the headteacher",
  href: subject.href,
  subject: subject.subject,
  missingCount: subject.missingCount,
});
  }

  const partialSubjectColumns = subjectScoreGaps.filter((subject) => subject.scoredCount > 0);

  for (const subject of partialSubjectColumns.slice(0, 5)) {
headlineActions.push({
  code: "REMIND_PARTIAL_SUBJECT_SCORE_COMPLETION",
  mode: "REMIND_TEACHER",
  priority: "MEDIUM",
  title: `Remind ${subject.subject} teacher to complete score evidence`,
  detail: `${subject.subject} is ${subject.completionPercent}% complete; ${subject.missingCount} learner score(s) still missing.`,
  owner: `${subject.subject} teacher`,
  primaryAction: "Send completion reminder with deadline",
  lastResortAction: "Open score-entry cockpit only as last resort",
  href: subject.href,
  subject: subject.subject,
  missingCount: subject.missingCount,
});
  }

  for (const learner of learnerRiskSignals.slice(0, 5)) {
headlineActions.push({
  code: "EARLY_LEARNER_SUPPORT_SIGNAL",
  mode: "LEARNER_SUPPORT_REVIEW",
  priority: "MEDIUM",
  title: `Early support signal: ${learner.name}`,
  detail: `${learner.name} has an available-evidence average of ${learner.averageScore}. This is provisional because full Mock evidence is still incomplete.`,
  owner: "Headteacher + class teacher + relevant subject teachers",
  primaryAction: "Review learner context and assign targeted support",
  lastResortAction: "Open learner profile for attendance, fee, and background context",
  href: `/headteacher/student/${learner.studentId}?focus=mock-readiness`,
  studentId: learner.studentId,
  studentName: learner.name,
});
  }

  if (headlineActions.length === 0) {
headlineActions.push({
  code: "MOCK_EVIDENCE_READY_FOR_REVIEW",
  mode: "REVIEW_ONLY",
  priority: "LOW",
  title: "Mock evidence is ready for review",
  detail: "Required Mock evidence is sufficiently complete for leadership review.",
  owner: "Headteacher",
  primaryAction: "Review readiness and plan intervention",
  href: "/headteacher/assessment/mock",
});
  }

  return {
    requiredSubjectColumns: {
      placementCore: MOCK_CORE_SUBJECTS.map((subject) => mockSubjectLabel(subject)),
      schoolAggregate: MOCK_SCHOOL_AGGREGATE_SUBJECTS.map((subject) =>
        mockSubjectLabel(subject)
      ),
      placementElectiveMinimum: 2,
    },
    createdSubjectColumns: args.subjectSummaries.map((subject) => ({
      itemId: subject.itemId,
      subject: subject.subject,
      canonicalSubject: subject.canonicalSubject,
      scoredCount: subject.scoredCount,
      missingCount: subject.missingCount,
    })),
    missingCoreSubjectColumns: uniqueLabels(missingCoreSubjectColumns),
    missingSchoolAggregateColumns: uniqueLabels(missingSchoolAggregateColumns),
    missingElectiveColumnCount,
    subjectScoreGaps,
    learnerScoreGaps,
    learnerRiskSignals,
    headlineActions: sortActions(headlineActions),
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

  const studentRows: MockStudentReadinessRow[] = students.map((student) => {
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

const evidenceActions = buildMockEvidenceActions({
  sessionId: selectedSession.id,
  totalStudents: students.length,
  subjectSummaries,
  students: studentRows,
});

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
evidenceActions,
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