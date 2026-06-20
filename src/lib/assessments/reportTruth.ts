// src/lib/assessments/reportTruth.ts
import { prisma } from "@/lib/prisma";
import { buildSubjectBroadsheet } from "@/lib/assessments/broadsheet";
import { getTenantAssessmentPolicyLite } from "@/lib/assessments/policy";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function uniqueSorted(xs: string[]) {
  return Array.from(new Set(xs.map(clean).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export type EvidenceBackedRelease = {
  scope: string;
  scopeKey: string;
  releasedAt: Date;
  readinessStatus: string;
  readinessScore: number;
  releaseMode: string | null;
  releaseSnapshotHash: string | null;
};

export async function findEvidenceBackedResultsRelease(args: {
  tenantId: string;
  term: string;
  academicYear: string;
  classroomId?: string | null;
}) {
  const classroomId = clean(args.classroomId);
  const scopeKeys = ["SCHOOL", ...(classroomId ? [classroomId] : [])];

  return prisma.resultsRelease.findFirst({
    where: {
      tenantId: args.tenantId,
      term: args.term,
      academicYear: args.academicYear,
      scopeKey: { in: scopeKeys },
      readinessStatus: { in: ["READY", "OVERRIDE"] },
      releaseSnapshotHash: { not: null },
    },
    select: {
      scope: true,
      scopeKey: true,
      releasedAt: true,
      readinessStatus: true,
      readinessScore: true,
      releaseMode: true,
      releaseSnapshotHash: true,
    },
  });
}

export async function buildClassPolicyReportTruth(args: {
  tenantId: string;
  classroomId: string;
  term: string;
  academicYear: string;
}) {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: args.classroomId,
      tenantId: args.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
    },
  });

  if (!classroom) {
    return {
      ok: false as const,
      error: "CLASSROOM_NOT_FOUND",
    };
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      gender: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
  });

  const policy = await getTenantAssessmentPolicyLite(args.tenantId, {
    classroom,
  });

  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      term: args.term,
      academicYear: args.academicYear,
    },
    select: {
      id: true,
      subject: true,
      title: true,
      type: true,
      maxScore: true,
      weighting: true,
      status: true,
      componentCode: true,
      policyComponentId: true,
      sortOrder: true,
      isRequired: true,
    },
    orderBy: [
      { subject: "asc" },
      { sortOrder: "asc" },
      { title: "asc" },
      { createdAt: "asc" },
    ],
  });

  const itemIds = items.map((item) => item.id);

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: {
          itemId: { in: itemIds },
          studentId: { in: students.map((s) => s.id) },
        },
        select: {
          itemId: true,
          studentId: true,
          score: true,
          comment: true,
        },
      })
    : [];

  const subjects = uniqueSorted(items.map((item) => item.subject));

  const broadsheets = subjects.map((subject) =>
    buildSubjectBroadsheet({
      policy,
      subject,
      students,
      items,
      scores: scores.map((score) => ({
        itemId: score.itemId,
        studentId: score.studentId,
        score: Number(score.score ?? 0),
        comment: score.comment ?? null,
      })),
    })
  );

  const blockedSubjects = broadsheets.filter(
  (sheet) => sheet.readiness.status === "BLOCKED"
);

const broadsheetBlockedReasons = blockedSubjects.flatMap((sheet) =>
  sheet.readiness.blockedReasons.map((reason) => `${sheet.subject}: ${reason}`)
);

const structuralBlockedReasons: string[] = [];

if (students.length > 0 && items.length === 0) {
  structuralBlockedReasons.push(
    "No assessment items found for this class, term, and academic year."
  );
}

if (students.length > 0 && items.length > 0 && broadsheets.length === 0) {
  structuralBlockedReasons.push(
    "Assessment items exist, but no reportable subject broadsheet could be built."
  );
}

const blockedReasons = [...structuralBlockedReasons, ...broadsheetBlockedReasons];

const readiness = {
  status: blockedReasons.length ? "BLOCKED" : "READY",
  score:
    broadsheets.length > 0
      ? Math.round(
          broadsheets.reduce((sum, sheet) => sum + sheet.readiness.score, 0) /
            broadsheets.length
        )
      : 0,
  subjectCount: broadsheets.length,
  blockedSubjectCount: blockedSubjects.length,
  learnerCount: students.length,
  blockedReasons,
};

  return {
    ok: true as const,
    classroom,
    students,
    policy: {
      id: policy.id,
      name: policy.name,
      levelBand: policy.levelBand,
      gradeScale: policy.gradeScale,
      components: policy.components,
    },
    broadsheets,
    readiness,
  };
}

export async function buildStudentPolicyReportTruth(args: {
  tenantId: string;
  studentId: string;
  term: string;
  academicYear: string;
}) {
  const student = await prisma.student.findFirst({
    where: {
      id: args.studentId,
      tenantId: args.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      firstName: true,
      lastName: true,
      sex: true,
      gender: true,
      dob: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      note: true,
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

  if (!student) {
    return {
      ok: false as const,
      error: "STUDENT_NOT_FOUND",
    };
  }

  if (!student.classroomId) {
    return {
      ok: false as const,
      error: "STUDENT_HAS_NO_CLASSROOM",
      student,
    };
  }

  const classTruth = await buildClassPolicyReportTruth({
    tenantId: args.tenantId,
    classroomId: student.classroomId,
    term: args.term,
    academicYear: args.academicYear,
  });

  if (!classTruth.ok) {
    return {
      ok: false as const,
      error: classTruth.error,
      student,
    };
  }

  const subjects = classTruth.broadsheets.map((sheet) => {
    const row = sheet.rows.find((r) => r.studentId === student.id) ?? null;

    return {
      subject: sheet.subject,
      classScore: null,
      examScore: null,
      totalScore: row?.weightedTotal ?? 0,
      rawTotal: row?.rawTotal ?? 0,
      rawMaxTotal: row?.rawMaxTotal ?? 0,
      maxScore: 100,
      percentage: row?.totalPercent ?? null,
      grade: row?.grade ?? null,
      gradeLabel: row?.gradeLabel ?? null,
      remark: row?.remark ?? null,
      position: row?.position ?? null,
      complete: row?.complete ?? false,
      missingRequiredCount: row?.missingRequiredCount ?? sheet.readiness.requiredComponentCount,
      missingOptionalCount: row?.missingOptionalCount ?? 0,
      cells: row?.cells ?? [],
      readiness: sheet.readiness,
    };
  });

  const completePercentages = subjects
    .map((s) => s.percentage)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));

  const overallPercentage =
    completePercentages.length > 0
      ? Math.round(
          (completePercentages.reduce((sum, p) => sum + p, 0) /
            completePercentages.length) *
            100
        ) / 100
      : null;

  return {
    ok: true as const,
    student,
    classroom: student.classroom,
    policy: classTruth.policy,
    subjects,
    overallPercentage,
    classReadiness: classTruth.readiness,
  };
}