//src/app/api/headteacher/assessment/mock/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTeacherJhsAssignments } from "@/lib/teacherAccess";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  MOCK_CORE_SUBJECTS,
  MOCK_REQUIRED_FINALIZE_SUBJECTS,
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

type MockOwnerAssignmentRow = {
  assignmentKind: string;
  classroomId: string | null;
  phase: string | null;
  level: string | null;
  subject: string | null;
  subjectNorm: string | null;
  teacher: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
};

type MockLegacyOwnerProfileRow = {
  phase: string | null;
  classLevel: string | null;
  primaryClassroomId: string | null;
  jhsAssignments: unknown;
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
};

type MockSubjectOwnerStatus = {
  subject: string;
  hasOwner: boolean;
  ownerCount: number;
  owners: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }[];
  issue: string | null;
  assignmentHref: string;
};

type MockReminderAudit = {
  sent: boolean;
  noticeId: string | null;
  noticeTitle: string | null;
  sentAt: string | null;
  recipientCount: number;
  readCount: number;
  acknowledgedCount: number;
  recipients: {
    id: string;
    userId: string | null;
    name: string | null;
    readAt: string | null;
    acknowledgedAt: string | null;
  }[];
};

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
  ownerStatus?: MockSubjectOwnerStatus;
  reminderAudit?: MockReminderAudit;
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

type MockStudentSubjectScore = {
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

type MockStudentReadinessRow = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  subjects: MockStudentSubjectScore[];
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

type CandidateRescuePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type CandidateSubjectSignal = {
  subject: string;
  canonicalSubject: string;
  score: number | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade: number | null;
  pointsToNextGrade: number | null;
  ownerStatus?: MockSubjectOwnerStatus;
};

type CandidateRescueProfile = {
  studentId: string;
  name: string;
  priority: CandidateRescuePriority;
  priorityLabel: string;
  reason: string;
  nextAction: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  schoolAggregate: MockStudentReadinessRow["schoolAggregate"];
  placementAggregate: MockStudentReadinessRow["placementAggregate"];
  readiness: MockStudentReadinessRow["readiness"];
  missingSubjects: string[];
  weakSubjects: CandidateSubjectSignal[];
  strongSubjects: CandidateSubjectSignal[];
  nearGradeOpportunities: CandidateSubjectSignal[];
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
  return (
    `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Learner"
  );
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

function pickDefaultClassroom(
  classrooms: ClassroomRow[],
  requestedId: string | null,
) {
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
      ? round1(
          validScores.reduce((sum, score) => sum + score.score, 0) /
            scoredCount,
        )
      : null;

  const averageGrade =
    scoredCount > 0
      ? round1(
          validScores.reduce(
            (sum, score) => sum + Number(score.grade?.grade ?? 0),
            0,
          ) / scoredCount,
        )
      : null;

  const gradeDistribution = Array.from({ length: 9 }, (_, i) => i + 1).map(
    (grade) => ({
      grade,
      count: validScores.filter((score) => score.grade?.grade === grade).length,
    }),
  );

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
  if (cleanMockStr(args.subject))
    params.set("subject", cleanMockStr(args.subject));

  const query = params.toString();
  return query
    ? `/teacher/assessment/mock?${query}`
    : "/teacher/assessment/mock";
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

type MockReminderNoticeRow = {
  id: string;
  title: string;
  sentAt: Date | null;
  createdAt: Date;
  metadata: unknown;
  recipients: {
    id: string;
    recipientUserId: string | null;
    displayName: string | null;
    readAt: Date | null;
    acknowledgedAt: Date | null;
  }[];
};

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function reminderAuditKey(args: {
  actionCode: string;
  subject?: string | null;
}) {
  return `${cleanMockStr(args.actionCode).toUpperCase()}:${cleanMockStr(args.subject).toUpperCase()}`;
}

function buildReminderAuditMap(rows: MockReminderNoticeRow[]) {
  const map = new Map<string, MockReminderAudit>();

  for (const row of rows) {
    const metadata = metadataRecord(row.metadata);
    const actionCode = cleanMockStr(metadata.actionCode);
    const subject = cleanMockStr(metadata.subject);
    const key = reminderAuditKey({ actionCode, subject });

    if (!actionCode || !subject) continue;

    const existing = map.get(key);
    const existingTime = existing?.sentAt
      ? new Date(existing.sentAt).getTime()
      : 0;
    const rowTime = (row.sentAt ?? row.createdAt).getTime();

    if (existing && existingTime >= rowTime) continue;

    const recipients = row.recipients.map((recipient) => ({
      id: recipient.id,
      userId: recipient.recipientUserId,
      name: recipient.displayName,
      readAt: recipient.readAt ? recipient.readAt.toISOString() : null,
      acknowledgedAt: recipient.acknowledgedAt
        ? recipient.acknowledgedAt.toISOString()
        : null,
    }));

    map.set(key, {
      sent: true,
      noticeId: row.id,
      noticeTitle: row.title,
      sentAt: (row.sentAt ?? row.createdAt).toISOString(),
      recipientCount: recipients.length,
      readCount: recipients.filter((recipient) => Boolean(recipient.readAt))
        .length,
      acknowledgedCount: recipients.filter((recipient) =>
        Boolean(recipient.acknowledgedAt),
      ).length,
      recipients,
    });
  }

  return map;
}

function emptyReminderAudit(): MockReminderAudit {
  return {
    sent: false,
    noticeId: null,
    noticeTitle: null,
    sentAt: null,
    recipientCount: 0,
    readCount: 0,
    acknowledgedCount: 0,
    recipients: [],
  };
}

function attachReminderAudit(
  actions: MockEvidenceAction[],
  auditMap: Map<string, MockReminderAudit>,
) {
  return actions.map((action) => {
    if (action.mode !== "NOTIFY_TEACHER" && action.mode !== "REMIND_TEACHER") {
      return action;
    }

    const key = reminderAuditKey({
      actionCode: action.code,
      subject: action.subject ?? null,
    });

    return {
      ...action,
      reminderAudit: auditMap.get(key) ?? emptyReminderAudit(),
    };
  });
}

function ownerSubjectKey(value: unknown) {
  return canonicalMockSubject(value);
}

function ownerNormalizeKey(value: unknown) {
  return cleanMockStr(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isTeacherMembershipRole(value: unknown) {
  return ownerNormalizeKey(value) === "TEACHER";
}

function ownerDisplayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  const name = cleanMockStr(user.name);
  if (name) return name;

  const full =
    `${cleanMockStr(user.firstName)} ${cleanMockStr(user.lastName)}`.trim();
  if (full) return full;

  return cleanMockStr(user.email) || "Teacher";
}

function classroomOwnerLevelKey(classroom: ClassroomRow | null) {
  const text = `${cleanMockStr(classroom?.name)} ${cleanMockStr(classroom?.grade)}`;
  const key = ownerNormalizeKey(text);

  if (key.includes("JHS3") || key.includes("BASIC9") || key === "B9")
    return "JHS3";
  if (key.includes("JHS2") || key.includes("BASIC8") || key === "B8")
    return "JHS2";
  if (key.includes("JHS1") || key.includes("BASIC7") || key === "B7")
    return "JHS1";

  return key;
}

function ownerAssignmentMatchesClass(
  assignment: Pick<MockOwnerAssignmentRow, "classroomId" | "phase" | "level">,
  classroom: ClassroomRow | null,
) {
  if (!classroom) return false;

  if (assignment.classroomId) {
    return assignment.classroomId === classroom.id;
  }

  const assignmentLevel = ownerNormalizeKey(assignment.level);
  const classroomLevel = classroomOwnerLevelKey(classroom);

  if (assignmentLevel && classroomLevel && assignmentLevel === classroomLevel) {
    return true;
  }

  const phase = ownerNormalizeKey(assignment.phase);
  if (phase === "JHS" && isJhs3MockClassroom(classroom)) {
    return true;
  }

  return false;
}

function addOwnerToSubjectMap(args: {
  ownerMap: Map<string, MockSubjectOwnerStatus>;
  subject: string;
  owner: MockOwnerAssignmentRow["teacher"];
  classroomId: string;
  sessionId: string;
}) {
  const subject = cleanMockStr(args.subject);
  if (!subject) return;

  const key = ownerSubjectKey(subject);

  const current =
    args.ownerMap.get(key) ??
    ({
      subject,
      hasOwner: false,
      ownerCount: 0,
      owners: [],
      issue: "NO_ASSIGNED_TEACHER_FOUND",
      assignmentHref: mockOwnerAssignmentHref({
        subject,
        classroomId: args.classroomId,
        sessionId: args.sessionId,
      }),
    } satisfies MockSubjectOwnerStatus);

  if (!current.owners.some((owner) => owner.id === args.owner.id)) {
    current.owners.push({
      id: args.owner.id,
      name: ownerDisplayName(args.owner),
      email: args.owner.email,
      phone: args.owner.phone,
    });
  }

  current.hasOwner = current.owners.length > 0;
  current.ownerCount = current.owners.length;
  current.issue = current.ownerCount > 0 ? null : "NO_ASSIGNED_TEACHER_FOUND";

  args.ownerMap.set(key, current);
}

function mockOwnerAssignmentHref(args: {
  subject: string;
  classroomId: string;
  sessionId: string;
}) {
  const params = new URLSearchParams();

  params.set("focus", "mock-subject-owner");
  params.set("subject", args.subject);
  params.set("level", "JHS3");
  params.set("classroomId", args.classroomId);
  params.set("sessionId", args.sessionId);
  params.set("returnTo", "/headteacher/assessment/mock");

  return `/admin/teachers?${params.toString()}`;
}

async function resolveMockSubjectOwnerMap(args: {
  tenantId: string;
  classroomId: string;
  sessionId: string;
  subjects: string[];
}) {
  const subjects = Array.from(
    new Set(args.subjects.map(cleanMockStr).filter(Boolean)),
  );
  const subjectKeys = new Set(subjects.map(ownerSubjectKey).filter(Boolean));
  const subjectNorms = Array.from(
    new Set(
      subjects
        .flatMap((subject) => [
          ownerNormalizeKey(subject),
          ownerSubjectKey(subject),
        ])
        .filter(Boolean),
    ),
  );

  const ownerMap = new Map<string, MockSubjectOwnerStatus>();

  for (const subject of subjects) {
    ownerMap.set(ownerSubjectKey(subject), {
      subject,
      hasOwner: false,
      ownerCount: 0,
      owners: [],
      issue: "NO_ASSIGNED_TEACHER_FOUND",
      assignmentHref: mockOwnerAssignmentHref({
        subject,
        classroomId: args.classroomId,
        sessionId: args.sessionId,
      }),
    });
  }

  if (!subjects.length) return ownerMap;

  const now = new Date();

  const [classroom, assignments, legacyProfiles] = await Promise.all([
    prisma.classroom.findFirst({
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
        status: true,
      },
    }),

    prisma.teacherAssessmentAssignment.findMany({
      where: {
        tenantId: args.tenantId,
        status: "ACTIVE",
        revokedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
        assignmentKind: {
          in: ["CLASS_ALL_SUBJECTS", "SUBJECT"],
        },
      },
      select: {
        assignmentKind: true,
        classroomId: true,
        phase: true,
        level: true,
        subject: true,
        subjectNorm: true,
        teacher: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),

    prisma.teacherProfile.findMany({
      where: {
        tenantId: args.tenantId,
        user: {
          memberships: {
            some: {
              tenantId: args.tenantId,
              status: "ACTIVE",
              role: {
                name: {
                  equals: "TEACHER",
                  mode: "insensitive",
                },
              },
            },
          },
        },
      },
      select: {
        phase: true,
        classLevel: true,
        primaryClassroomId: true,
        jhsAssignments: true,
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const typedAssignments: MockOwnerAssignmentRow[] = assignments.map(
    (assignment) => ({
      assignmentKind: assignment.assignmentKind,
      classroomId: assignment.classroomId,
      phase: assignment.phase,
      level: assignment.level,
      subject: assignment.subject,
      subjectNorm: assignment.subjectNorm,
      teacher: assignment.teacher,
    }),
  );

  for (const assignment of typedAssignments) {
    if (!ownerAssignmentMatchesClass(assignment, classroom)) continue;

    const kind = ownerNormalizeKey(assignment.assignmentKind);

    if (kind === "CLASSALLSUBJECTS") {
      for (const subject of subjects) {
        addOwnerToSubjectMap({
          ownerMap,
          subject,
          owner: assignment.teacher,
          classroomId: args.classroomId,
          sessionId: args.sessionId,
        });
      }

      continue;
    }

    if (kind !== "SUBJECT") continue;

    const assignmentSubjectKeys = new Set(
      [
        ownerSubjectKey(assignment.subject),
        ownerSubjectKey(assignment.subjectNorm),
      ].filter(Boolean),
    );
    const assignmentSubjectNorms = new Set(
      [
        ownerNormalizeKey(assignment.subject),
        ownerNormalizeKey(assignment.subjectNorm),
      ].filter(Boolean),
    );

    const resolvedSubject =
      subjects.find((candidate) =>
        assignmentSubjectKeys.has(ownerSubjectKey(candidate)),
      ) ??
      subjects.find((candidate) =>
        assignmentSubjectNorms.has(ownerNormalizeKey(candidate)),
      );

    if (
      !resolvedSubject ||
      !subjectKeys.has(ownerSubjectKey(resolvedSubject))
    ) {
      continue;
    }

    addOwnerToSubjectMap({
      ownerMap,
      subject: resolvedSubject,
      owner: assignment.teacher,
      classroomId: args.classroomId,
      sessionId: args.sessionId,
    });
  }

  const classroomLevel = classroomOwnerLevelKey(classroom);

  for (const profile of legacyProfiles as MockLegacyOwnerProfileRow[]) {
    if (ownerNormalizeKey(profile.phase) !== "JHS") continue;

    const legacyAssignments = parseTeacherJhsAssignments(
      profile.jhsAssignments,
    );

    for (const legacy of legacyAssignments) {
      const classHit = legacy.classes.some(
        (level) => ownerNormalizeKey(level) === classroomLevel,
      );

      if (!classHit) continue;

      const legacySubjectKey = ownerSubjectKey(legacy.subject);
      const legacySubjectNorm = ownerNormalizeKey(legacy.subject);

      const resolvedSubject =
        subjects.find(
          (candidate) => ownerSubjectKey(candidate) === legacySubjectKey,
        ) ??
        subjects.find(
          (candidate) => ownerNormalizeKey(candidate) === legacySubjectNorm,
        );

      if (
        !resolvedSubject ||
        !subjectKeys.has(ownerSubjectKey(resolvedSubject))
      ) {
        continue;
      }

      addOwnerToSubjectMap({
        ownerMap,
        subject: resolvedSubject,
        owner: profile.user,
        classroomId: args.classroomId,
        sessionId: args.sessionId,
      });
    }
  }

  return ownerMap;
}

function getOwnerStatus(
  ownerMap: Map<string, MockSubjectOwnerStatus>,
  subject: string | null | undefined,
) {
  const key = ownerSubjectKey(subject);
  if (!key) return undefined;

  return ownerMap.get(key);
}

function buildMockEvidenceActions(args: {
  sessionId: string;
  classroomId: string;
  totalStudents: number;
  subjectSummaries: MockSubjectSummaryLite[];
  students: MockStudentReadinessRow[];
  reminderAuditMap: Map<string, MockReminderAudit>;
  ownerStatusMap: Map<string, MockSubjectOwnerStatus>;
}) {
  const createdCanonicalSubjects = new Set(
    args.subjectSummaries.map((subject) => subject.canonicalSubject),
  );

  const coreSubjectSet = new Set<string>(
    MOCK_CORE_SUBJECTS as readonly string[],
  );

  const missingRequiredMockSubjectColumns =
    MOCK_REQUIRED_FINALIZE_SUBJECTS.filter(
      (subject) => !createdCanonicalSubjects.has(subject),
    ).map((subject) => mockSubjectLabel(subject));

  const missingCoreSubjectColumns = MOCK_CORE_SUBJECTS.filter(
    (subject) => !createdCanonicalSubjects.has(subject),
  ).map((subject) => mockSubjectLabel(subject));

  const missingSchoolAggregateColumns = MOCK_SCHOOL_AGGREGATE_SUBJECTS.filter(
    (subject) => !createdCanonicalSubjects.has(subject),
  ).map((subject) => mockSubjectLabel(subject));

  const electiveColumns = args.subjectSummaries.filter(
    (subject) => !coreSubjectSet.has(subject.canonicalSubject),
  );

  const missingElectiveColumnCount = Math.max(0, 2 - electiveColumns.length);

  const subjectScoreGaps = args.subjectSummaries
    .filter((subject) => subject.missingCount > 0)
    .sort((a, b) => {
      if (b.missingCount !== a.missingCount)
        return b.missingCount - a.missingCount;
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
    .filter(
      (student) =>
        student.averageScore != null && Number(student.averageScore) < 50,
    )
    .sort(
      (a, b) => Number(a.averageScore ?? 999) - Number(b.averageScore ?? 999),
    )
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

  const missingRequiredNonCoreSubjectColumns =
    missingRequiredMockSubjectColumns.filter(
      (subject) => !missingCoreSubjectColumns.includes(subject),
    );

  for (const subject of missingRequiredNonCoreSubjectColumns) {
    headlineActions.push({
      code: "NOTIFY_MISSING_REQUIRED_MOCK_SUBJECT_TEACHERS",
      mode: "NOTIFY_TEACHER",
      priority: "HIGH",
      title: `Notify ${subject} teacher to open Mock column`,
      detail: `${subject} Mock column is missing. This subject blocks finalization because the Mock session must contain all required JHS3 Mock subjects.`,
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
      ownerStatus: getOwnerStatus(args.ownerStatusMap, subject),
    });
  }

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
      ownerStatus: getOwnerStatus(args.ownerStatusMap, subject),
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
      lastResortAction:
        "Open teacher Mock cockpit only as last-resort administrative support",
      href: teacherMockHref({ sessionId: args.sessionId }),
      missingCount: missingElectiveColumnCount,
    });
  }

  const emptySubjectColumns = subjectScoreGaps.filter(
    (subject) => subject.scoredCount === 0,
  );

  for (const subject of emptySubjectColumns.slice(0, 5)) {
    headlineActions.push({
      code: "REMIND_EMPTY_SUBJECT_SCORE_ENTRY",
      mode: "REMIND_TEACHER",
      priority: "HIGH",
      title: `Remind ${subject.subject} teacher to enter Mock scores`,
      detail: `${subject.subject} has 0/${args.totalStudents} learner scores entered.`,
      owner: `${subject.subject} teacher`,
      primaryAction: "Send teacher reminder with deadline",
      lastResortAction:
        "Open score-entry cockpit only if delegated to the headteacher",
      href: subject.href,
      subject: subject.subject,
      missingCount: subject.missingCount,
      ownerStatus: getOwnerStatus(args.ownerStatusMap, subject.subject),
    });
  }

  const partialSubjectColumns = subjectScoreGaps.filter(
    (subject) => subject.scoredCount > 0,
  );

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
      ownerStatus: getOwnerStatus(args.ownerStatusMap, subject.subject),
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
      lastResortAction:
        "Open learner profile for attendance, fee, and background context",
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
      detail:
        "Required Mock evidence is sufficiently complete for leadership review.",
      owner: "Headteacher",
      primaryAction: "Review readiness and plan intervention",
      href: "/headteacher/assessment/mock",
    });
  }

  return {
    requiredSubjectColumns: {
      placementCore: MOCK_CORE_SUBJECTS.map((subject) =>
        mockSubjectLabel(subject),
      ),
      schoolAggregate: MOCK_SCHOOL_AGGREGATE_SUBJECTS.map((subject) =>
        mockSubjectLabel(subject),
      ),
      allRequiredForFinalization: MOCK_REQUIRED_FINALIZE_SUBJECTS.map(
        (subject) => mockSubjectLabel(subject),
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
    missingRequiredMockSubjectColumns: uniqueLabels(
      missingRequiredMockSubjectColumns,
    ),
    missingCoreSubjectColumns: uniqueLabels(missingCoreSubjectColumns),
    missingSchoolAggregateColumns: uniqueLabels(missingSchoolAggregateColumns),
    missingElectiveColumnCount,
    subjectScoreGaps,
    learnerScoreGaps,
    learnerRiskSignals,
    headlineActions: attachReminderAudit(
      sortActions(headlineActions),
      args.reminderAuditMap,
    ),
  };
}

function candidatePriorityRank(priority: CandidateRescuePriority) {
  if (priority === "CRITICAL") return 0;
  if (priority === "HIGH") return 1;
  if (priority === "MEDIUM") return 2;
  return 3;
}

function candidateSubjectSignal(
  subject: MockStudentSubjectScore,
  ownerStatusMap: Map<string, MockSubjectOwnerStatus>,
): CandidateSubjectSignal {
  return {
    subject: subject.subject,
    canonicalSubject: subject.canonicalSubject,
    score: subject.score,
    grade: subject.grade,
    gradeLabel: subject.gradeLabel,
    remark: subject.remark,
    nextGrade: subject.nextGrade,
    pointsToNextGrade: subject.pointsToNextGrade,
    ownerStatus: getOwnerStatus(ownerStatusMap, subject.subject),
  };
}

function buildCandidateRescueProfiles(args: {
  students: MockStudentReadinessRow[];
  ownerStatusMap: Map<string, MockSubjectOwnerStatus>;
}) {
  const profiles: CandidateRescueProfile[] = args.students.map((student) => {
    const missingSubjects = uniqueLabels([
      ...(student.placementAggregate.missingSubjects ?? []),
      ...(student.schoolAggregate.missingSubjects ?? []),
    ]);

    const scoredSubjects = student.subjects.filter(
      (subject) => subject.score != null,
    );

    const weakSubjects = scoredSubjects
      .filter(
        (subject) => typeof subject.score === "number" && subject.score < 50,
      )
      .sort((a, b) => Number(a.score ?? 999) - Number(b.score ?? 999))
      .map((subject) => candidateSubjectSignal(subject, args.ownerStatusMap));

    const strongSubjects = scoredSubjects
      .filter(
        (subject) => typeof subject.grade === "number" && subject.grade <= 3,
      )
      .sort((a, b) => {
        if (Number(a.grade ?? 99) !== Number(b.grade ?? 99)) {
          return Number(a.grade ?? 99) - Number(b.grade ?? 99);
        }

        return Number(b.score ?? 0) - Number(a.score ?? 0);
      })
      .slice(0, 4)
      .map((subject) => candidateSubjectSignal(subject, args.ownerStatusMap));

    const nearGradeOpportunities = scoredSubjects
      .filter(
        (subject) =>
          typeof subject.pointsToNextGrade === "number" &&
          subject.pointsToNextGrade > 0 &&
          subject.pointsToNextGrade <= 5,
      )
      .sort(
        (a, b) =>
          Number(a.pointsToNextGrade ?? 999) -
          Number(b.pointsToNextGrade ?? 999),
      )
      .map((subject) => candidateSubjectSignal(subject, args.ownerStatusMap));

    const priority: CandidateRescuePriority =
      missingSubjects.length > 0
        ? "CRITICAL"
        : weakSubjects.length >= 2
          ? "CRITICAL"
          : weakSubjects.length === 1
            ? "HIGH"
            : nearGradeOpportunities.length >= 2
              ? "MEDIUM"
              : "LOW";

    const priorityLabel =
      priority === "CRITICAL"
        ? "Critical rescue"
        : priority === "HIGH"
          ? "High rescue"
          : priority === "MEDIUM"
            ? "Improvement opportunity"
            : "Stable monitor";

    const reason =
      missingSubjects.length > 0
        ? `Missing evidence blocks full aggregate: ${missingSubjects.join(", ")}.`
        : weakSubjects.length > 0
          ? `${weakSubjects.length} weak subject(s) below 50 are dragging readiness.`
          : nearGradeOpportunities.length > 0
            ? `${nearGradeOpportunities.length} subject(s) are within 5 marks of the next grade.`
            : "No urgent rescue signal from current Mock evidence.";

    const firstMissing = missingSubjects[0] ?? null;
    const firstWeak = weakSubjects[0] ?? null;
    const firstNear = nearGradeOpportunities[0] ?? null;

    const nextAction = firstMissing
      ? `Complete missing ${firstMissing} evidence first; aggregate judgment is unreliable until this is fixed.`
      : firstWeak
        ? `Assign immediate remedial work in ${firstWeak.subject}; responsible teacher should review the learner's mistakes before the next Mock.`
        : firstNear
          ? `Push ${firstNear.subject}: only ${firstNear.pointsToNextGrade} mark(s) needed to reach Grade ${firstNear.nextGrade}.`
          : "Maintain monitoring and protect consistency.";

    return {
      studentId: student.studentId,
      name: student.name,
      priority,
      priorityLabel,
      reason,
      nextAction,
      scoredSubjectCount: student.scoredSubjectCount,
      missingSubjectCount: student.missingSubjectCount,
      averageScore: student.averageScore,
      schoolAggregate: student.schoolAggregate,
      placementAggregate: student.placementAggregate,
      readiness: student.readiness,
      missingSubjects,
      weakSubjects: weakSubjects.slice(0, 5),
      strongSubjects,
      nearGradeOpportunities: nearGradeOpportunities.slice(0, 5),
    };
  });

  return profiles.sort((a, b) => {
    const priorityDiff =
      candidatePriorityRank(a.priority) - candidatePriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const aAgg = a.placementAggregate.aggregate ?? 999;
    const bAgg = b.placementAggregate.aggregate ?? 999;
    if (aAgg !== bAgg) return aAgg - bAgg;

    return Number(a.averageScore ?? 999) - Number(b.averageScore ?? 999);
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const requestedClassroomId =
    cleanMockStr(searchParams.get("classroomId")) || null;
  const requestedSessionId =
    cleanMockStr(searchParams.get("sessionId")) || null;
  const requestedAcademicYear =
    cleanMockStr(searchParams.get("academicYear")) || null;

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

  const classrooms = rawClassrooms.filter((classroom) =>
    isJhs3MockClassroom(classroom),
  );

  const selectedClassroomId = pickDefaultClassroom(
    classrooms,
    requestedClassroomId,
  );

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
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    null;

  const sessionWhere = {
    tenantId: ctx.tenantId,
    classroomId: selectedClassroomId,
    ...(requestedAcademicYear ? { academicYear: requestedAcademicYear } : {}),
  };

  const sessions = await prisma.mockExamSession.findMany({
    where: sessionWhere,
    orderBy: [
      { academicYear: "desc" },
      { mockNumber: "asc" },
      { createdAt: "asc" },
    ],
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
    buildSubjectSummary(item, students.length),
  );

  const studentRows: MockStudentReadinessRow[] = students.map((student) => {
    const subjectScores = typedItems.map((item) => {
      const score =
        item.scores.find((row) => row.studentId === student.id) ?? null;
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

    const scoredSubjects = subjectScores.filter(
      (subject) => subject.score != null,
    );

    const averageScore =
      scoredSubjects.length > 0
        ? round1(
            scoredSubjects.reduce(
              (sum, subject) => sum + Number(subject.score ?? 0),
              0,
            ) / scoredSubjects.length,
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
      missingSubjectCount: Math.max(
        0,
        typedItems.length - scoredSubjects.length,
      ),
      averageScore,
      subjects: subjectScores,
      schoolAggregate,
      placementAggregate,
      readiness,
    };
  });

  const possibleCells = students.length * typedItems.length;
  const scoredCells = typedItems.reduce(
    (sum, item) => sum + item.scores.length,
    0,
  );

  const completionPercent =
    possibleCells > 0 ? round1((scoredCells / possibleCells) * 100) : 0;

  const placementReadyRows = studentRows.filter(
    (row) => row.placementAggregate.ok,
  );
  const schoolAggregateReadyRows = studentRows.filter(
    (row) => row.schoolAggregate.ok,
  );

  const classPlacementAggregates = placementReadyRows
    .map((row) => row.placementAggregate.aggregate)
    .filter((value): value is number => typeof value === "number");

  const classAveragePlacementAggregate =
    classPlacementAggregates.length > 0
      ? round1(
          classPlacementAggregates.reduce((sum, value) => sum + value, 0) /
            classPlacementAggregates.length,
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

  const subjectsForOwnerCheck = Array.from(
    new Set(
      [
        ...MOCK_CORE_SUBJECTS.map((subject) => mockSubjectLabel(subject)),
        ...MOCK_SCHOOL_AGGREGATE_SUBJECTS.map((subject) =>
          mockSubjectLabel(subject),
        ),
        ...MOCK_REQUIRED_FINALIZE_SUBJECTS.map((subject) =>
          mockSubjectLabel(subject),
        ),
        ...subjectSummaries.map((subject) => subject.subject),
      ]
        .map(cleanMockStr)
        .filter(Boolean),
    ),
  );

  const ownerStatusMap = await resolveMockSubjectOwnerMap({
    tenantId: ctx.tenantId,
    classroomId: selectedSession.classroomId,
    sessionId: selectedSession.id,
    subjects: subjectsForOwnerCheck,
  });

  const reminderNoticeRows = await prisma.governanceOfficialNotice.findMany({
    where: {
      tenantId: ctx.tenantId,
      idempotencyScope: "HEADTEACHER_MOCK_REMINDER",
      metadata: {
        path: ["sessionId"],
        equals: selectedSession.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
    select: {
      id: true,
      title: true,
      sentAt: true,
      createdAt: true,
      metadata: true,
      recipients: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          recipientUserId: true,
          displayName: true,
          readAt: true,
          acknowledgedAt: true,
        },
      },
    },
  });

  const evidenceActions = buildMockEvidenceActions({
    sessionId: selectedSession.id,
    classroomId: selectedSession.classroomId,
    totalStudents: students.length,
    subjectSummaries,
    students: studentRows,
    reminderAuditMap: buildReminderAuditMap(reminderNoticeRows),
    ownerStatusMap,
  });

  const candidateRescueProfiles = buildCandidateRescueProfiles({
    students: studentRows,
    ownerStatusMap,
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
        classReadiness: readinessBandFromAggregate(
          classAveragePlacementAggregate,
        ),
        readinessCounts: mapReadinessCounts(studentRows),
      },
      subjectSummaries,
      weakestSubjects,
      topSubjects,
      students: studentRows,
      candidateRescueProfiles,
      evidenceActions,
      warnings: {
        aggregateMayBeIncomplete:
          typedItems.length < 6 || placementReadyRows.length < students.length,
        message:
          typedItems.length < 6
            ? "Mock subjects are fewer than required for full BECE aggregate analysis."
            : null,
      },
    },
  });
}
