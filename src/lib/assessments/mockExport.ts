//src/lib/assessments/mockExport.ts
import { prisma } from "@/lib/prisma";
import {
  calculatePlacementMockAggregate,
  calculateSchoolMockAggregate,
  canonicalMockSubject,
  mockGradeFromScore,
  readinessBandFromAggregate,
} from "@/lib/assessments/mock";

type ScoreInput = {
  studentId: string;
  score: unknown;
  comment: string | null;
};

type MockItemExportRow = {
  id: string;
  subject: string;
  title: string;
  maxScore: number;
  status: string;
  scores: ScoreInput[];
};

export type MockExportSubjectCell = {
  itemId: string;
  subject: string;
  canonicalSubject: string;
  score: number | null;
  comment: string | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade: number | null;
  pointsToNextGrade: number | null;
};

export type MockExportStudentRow = {
  studentId: string;
  name: string;
  subjectCells: MockExportSubjectCell[];
  totalRawScore: number | null;
  averageScore: number | null;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  schoolAggregate: ReturnType<typeof calculateSchoolMockAggregate>;
  placementAggregate: ReturnType<typeof calculatePlacementMockAggregate>;
  readiness: ReturnType<typeof readinessBandFromAggregate>;
  strongestSubject: string | null;
  weakestSubject: string | null;
  recommendedAction: string;
};

export type MockExportSubjectSummary = {
  subject: string;
  scoredCount: number;
  missingCount: number;
  averageScore: number | null;
  averageGrade: number | null;
  strongCount: number;
  moderateCount: number;
  riskCount: number;
};

export type MockExportData = {
  tenant: {
    id: string;
    name: string;
  };
  classroom: {
    id: string;
    name: string;
    grade: string | null;
    arm: string | null;
    label: string;
  };
  session: {
    id: string;
    academicYear: string;
    term: string | null;
    mockNumber: number;
    mockLabel: string;
    title: string;
    status: string;
  };
  generatedAt: Date;
  subjects: string[];
  rows: MockExportStudentRow[];
  subjectSummaries: MockExportSubjectSummary[];
  summary: {
    totalStudents: number;
    totalSubjects: number;
    possibleCells: number;
    scoredCells: number;
    missingCells: number;
    completionPercent: number;
    schoolAggregateReadyCount: number;
    placementReadyCount: number;
    classAverageScore: number | null;
    classAveragePlacementAggregate: number | null;
    readyCount: number;
    watchCount: number;
    riskCount: number;
    criticalCount: number;
  };
};

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function scoreToNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function studentName(student: {
  firstName: string | null;
  lastName: string | null;
}) {
  const first = cleanStr(student.firstName);
  const last = cleanStr(student.lastName);
  const name = [last, first].filter(Boolean).join(" ").trim();
  return name || "Unnamed learner";
}

function classroomLabel(c: {
  name: string | null;
  grade: string | null;
  arm: string | null;
}) {
  const name = cleanStr(c.name) || "Classroom";
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade && arm) return `${name} (${grade} ${arm})`;
  if (grade) return `${name} (${grade})`;
  return name;
}

function buildRecommendedAction(row: {
  placementAggregate: ReturnType<typeof calculatePlacementMockAggregate>;
  weakestSubject: string | null;
  missingSubjectCount: number;
}) {
  if (row.missingSubjectCount > 0 || !row.placementAggregate.ok) {
    return "Complete all missing Mock evidence first, then assign targeted correction before the next Mock.";
  }

  const aggregate = row.placementAggregate.aggregate;

  if (typeof aggregate !== "number") {
    return "Review learner evidence and assign subject-specific correction.";
  }

  if (aggregate <= 12) {
    return "Protect this strong position with timed revision, past questions, and consistency checks.";
  }

  if (aggregate <= 18) {
    return `Push for stronger grades, especially in ${row.weakestSubject ?? "the weakest subject"}.`;
  }

  if (aggregate <= 30) {
    return `Urgent intervention needed in ${row.weakestSubject ?? "weak subjects"} before the next Mock.`;
  }

  return `Critical BECE rescue required. Start daily remedial work in ${row.weakestSubject ?? "weak subjects"} immediately.`;
}

function readinessBucket(row: MockExportStudentRow) {
  const code = cleanStr(row.readiness.code).toUpperCase();
  const aggregate = row.placementAggregate.aggregate;

  if (
    code.includes("CRITICAL") ||
    (typeof aggregate === "number" && aggregate > 30)
  ) {
    return "CRITICAL";
  }

  if (
    code.includes("RISK") ||
    (typeof aggregate === "number" && aggregate > 18)
  ) {
    return "RISK";
  }

  if (
    code.includes("WATCH") ||
    code.includes("MONITOR") ||
    code.includes("DEVELOPING")
  ) {
    return "WATCH";
  }

  return "READY";
}

function buildSubjectCell(
  item: MockItemExportRow,
  studentId: string,
): MockExportSubjectCell {
  const scoreRow =
    item.scores.find((row) => row.studentId === studentId) ?? null;
  const score = scoreToNumber(scoreRow?.score);
  const grade = score == null ? null : mockGradeFromScore(score);

  return {
    itemId: item.id,
    subject: item.subject,
    canonicalSubject: canonicalMockSubject(item.subject),
    score,
    comment: scoreRow?.comment ?? null,
    grade: grade?.grade ?? null,
    gradeLabel: grade?.label ?? null,
    remark: grade?.remark ?? null,
    nextGrade: grade?.nextGrade ?? null,
    pointsToNextGrade: grade?.pointsToNextGrade ?? null,
  };
}

function buildSubjectSummary(args: {
  subject: string;
  cells: MockExportSubjectCell[];
  totalStudents: number;
}): MockExportSubjectSummary {
  const scored = args.cells.filter(
    (cell) => cell.score != null && cell.grade != null,
  );
  const averageScore =
    scored.length > 0
      ? round1(
          scored.reduce((sum, cell) => sum + Number(cell.score ?? 0), 0) /
            scored.length,
        )
      : null;

  const averageGrade =
    scored.length > 0
      ? round1(
          scored.reduce((sum, cell) => sum + Number(cell.grade ?? 0), 0) /
            scored.length,
        )
      : null;

  return {
    subject: args.subject,
    scoredCount: scored.length,
    missingCount: Math.max(0, args.totalStudents - scored.length),
    averageScore,
    averageGrade,
    strongCount: scored.filter((cell) => Number(cell.grade) <= 3).length,
    moderateCount: scored.filter(
      (cell) => Number(cell.grade) >= 4 && Number(cell.grade) <= 6,
    ).length,
    riskCount: scored.filter((cell) => Number(cell.grade) >= 7).length,
  };
}

export async function buildHeadteacherMockExportData(args: {
  tenantId: string;
  sessionId: string;
}): Promise<MockExportData | null> {
  const [tenant, session] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: {
        id: true,
        name: true,
      },
    }),

    prisma.mockExamSession.findFirst({
      where: {
        id: args.sessionId,
        tenantId: args.tenantId,
      },
      select: {
        id: true,
        classroomId: true,
        academicYear: true,
        term: true,
        mockNumber: true,
        mockLabel: true,
        title: true,
        status: true,
      },
    }),
  ]);

  if (!tenant || !session) return null;

  const [classroom, students, items] = await Promise.all([
    prisma.classroom.findFirst({
      where: {
        id: session.classroomId,
        tenantId: args.tenantId,
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    }),

    prisma.student.findMany({
      where: {
        tenantId: args.tenantId,
        classroomId: session.classroomId,
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
        tenantId: args.tenantId,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        mockExamSessionId: session.id,
        type: "MOCK",
      },
      orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        subject: true,
        title: true,
        maxScore: true,
        status: true,
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

  if (!classroom) return null;

  const typedItems: MockItemExportRow[] = items.map((item) => ({
    id: item.id,
    subject: item.subject,
    title: item.title,
    maxScore: item.maxScore,
    status: item.status,
    scores: item.scores.map((score) => ({
      studentId: score.studentId,
      score: score.score,
      comment: score.comment,
    })),
  }));

  const subjects = typedItems.map((item) => item.subject);

  const rows: MockExportStudentRow[] = students.map((student) => {
    const subjectCells = typedItems.map((item) =>
      buildSubjectCell(item, student.id),
    );
    const scoredCells = subjectCells.filter(
      (cell) => cell.score != null && cell.grade != null,
    );

    const totalRawScore =
      scoredCells.length > 0
        ? scoredCells.reduce((sum, cell) => sum + Number(cell.score ?? 0), 0)
        : null;

    const averageScore =
      scoredCells.length > 0
        ? round1(Number(totalRawScore ?? 0) / scoredCells.length)
        : null;

    const aggregateInputs = subjectCells.map((cell) => ({
      subject: cell.subject,
      score: cell.score,
      grade: cell.grade,
    }));

    const schoolAggregate = calculateSchoolMockAggregate(aggregateInputs);
    const placementAggregate = calculatePlacementMockAggregate(aggregateInputs);

    const readiness = placementAggregate.ok
      ? readinessBandFromAggregate(placementAggregate.aggregate)
      : readinessBandFromAggregate(null);

    const sortedForStrength = [...scoredCells].sort((a, b) => {
      const gradeA = Number(a.grade ?? 99);
      const gradeB = Number(b.grade ?? 99);
      if (gradeA !== gradeB) return gradeA - gradeB;
      return Number(b.score ?? 0) - Number(a.score ?? 0);
    });

    const sortedForWeakness = [...scoredCells].sort((a, b) => {
      const gradeA = Number(a.grade ?? -1);
      const gradeB = Number(b.grade ?? -1);
      if (gradeA !== gradeB) return gradeB - gradeA;
      return Number(a.score ?? 0) - Number(b.score ?? 0);
    });

    const strongestSubject = sortedForStrength[0]?.subject ?? null;
    const weakestSubject = sortedForWeakness[0]?.subject ?? null;

    return {
      studentId: student.id,
      name: studentName(student),
      subjectCells,
      totalRawScore,
      averageScore,
      scoredSubjectCount: scoredCells.length,
      missingSubjectCount: Math.max(0, typedItems.length - scoredCells.length),
      schoolAggregate,
      placementAggregate,
      readiness,
      strongestSubject,
      weakestSubject,
      recommendedAction: buildRecommendedAction({
        placementAggregate,
        weakestSubject,
        missingSubjectCount: Math.max(
          0,
          typedItems.length - scoredCells.length,
        ),
      }),
    };
  });

  const subjectSummaries = typedItems.map((item) =>
    buildSubjectSummary({
      subject: item.subject,
      cells: rows
        .map((row) => row.subjectCells.find((cell) => cell.itemId === item.id))
        .filter(Boolean) as MockExportSubjectCell[],
      totalStudents: students.length,
    }),
  );

  const possibleCells = students.length * typedItems.length;
  const scoredCells = rows.reduce(
    (sum, row) => sum + row.scoredSubjectCount,
    0,
  );
  const missingCells = Math.max(0, possibleCells - scoredCells);
  const completionPercent =
    possibleCells > 0 ? round1((scoredCells / possibleCells) * 100) : 0;

  const averageScores = rows
    .map((row) => row.averageScore)
    .filter((value): value is number => typeof value === "number");

  const placementAggregates = rows
    .map((row) => row.placementAggregate.aggregate)
    .filter((value): value is number => typeof value === "number");

  const buckets = rows.map(readinessBucket);

  return {
    tenant: {
      id: tenant.id,
      name: cleanStr(tenant.name) || "School",
    },
    classroom: {
      id: classroom.id,
      name: cleanStr(classroom.name) || "Classroom",
      grade: classroom.grade,
      arm: classroom.arm,
      label: classroomLabel(classroom),
    },
    session: {
      id: session.id,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
    },
    generatedAt: new Date(),
    subjects,
    rows,
    subjectSummaries,
    summary: {
      totalStudents: students.length,
      totalSubjects: typedItems.length,
      possibleCells,
      scoredCells,
      missingCells,
      completionPercent,
      schoolAggregateReadyCount: rows.filter((row) => row.schoolAggregate.ok)
        .length,
      placementReadyCount: rows.filter((row) => row.placementAggregate.ok)
        .length,
      classAverageScore:
        averageScores.length > 0
          ? round1(
              averageScores.reduce((sum, value) => sum + value, 0) /
                averageScores.length,
            )
          : null,
      classAveragePlacementAggregate:
        placementAggregates.length > 0
          ? round1(
              placementAggregates.reduce((sum, value) => sum + value, 0) /
                placementAggregates.length,
            )
          : null,
      readyCount: buckets.filter((bucket) => bucket === "READY").length,
      watchCount: buckets.filter((bucket) => bucket === "WATCH").length,
      riskCount: buckets.filter((bucket) => bucket === "RISK").length,
      criticalCount: buckets.filter((bucket) => bucket === "CRITICAL").length,
    },
  };
}
