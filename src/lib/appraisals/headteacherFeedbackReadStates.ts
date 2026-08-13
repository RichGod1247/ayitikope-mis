//src/lib/appraisals/headteacherFeedbackReadStates.ts
import type {
  AppraisalCycleStatus,
  AppraisalParticipantStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackApprovalAuthority,
  assertHeadteacherFeedbackInstrumentReady,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { readHeadteacherFeedbackDeadlineExtensionMetadata } from "@/lib/appraisals/headteacherFeedbackDeadlineExtension";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES = {
  headteacher: "/headteacher/my-appraisal",
  director: "/district/headteacher-appraisal",
  teacher: "/teacher/headteacher-appraisal",
} as const;

export const HEADTEACHER_OWN_APPRAISAL_STATE_LABELS = {
  REQUEST_APPRAISAL: "Request appraisal",
  REQUEST_PROCESSING: "Request processing",
  AWAITING_DIRECTOR_APPROVAL: "Awaiting Director approval",
  FEEDBACK_PERIOD_OPEN: "Feedback period open",
  RESPONSES_CLOSED_AWAITING_REVIEW:
    "Responses closed — awaiting review",
  DIRECTOR_REVIEWING_APPRAISAL: "Director reviewing appraisal",
  VIEW_RELEASED_APPRAISAL: "View released appraisal",
  REQUEST_CLOSED: "Request closed",
} as const;

export const TEACHER_HEADTEACHER_APPRAISAL_STATE_LABELS = {
  LOCKED: "Locked / Awaiting request",
  AVAILABLE: "Available",
  CONTINUE: "Continue",
  SUBMITTED_READ_ONLY: "Submitted / read-only",
  CLOSED: "Closed",
} as const;

export const DIRECTOR_HEADTEACHER_APPRAISAL_STATE_LABELS = {
  OPENING_IN_PROGRESS: "Opening in progress",
  APPROVAL_REQUIRED: "Approval required",
  FEEDBACK_PERIOD_OPEN: "Feedback period open",
  RESPONSES_CLOSED_AWAITING_REVIEW:
    "Responses closed — awaiting review",
  DIRECTOR_REVIEWING_APPRAISAL: "Director reviewing appraisal",
  RELEASED: "Released",
  REQUEST_CLOSED: "Request closed",
} as const;

export const HEADTEACHER_FEEDBACK_ANONYMITY_NOTICE =
  "Your identity is hidden from the Headteacher and District Director. The Director sees finalized forms only as Respondent 1, Respondent 2, and so on.";

export type HeadteacherOwnAppraisalStateCode =
  keyof typeof HEADTEACHER_OWN_APPRAISAL_STATE_LABELS;

export type TeacherHeadteacherAppraisalStateCode =
  keyof typeof TEACHER_HEADTEACHER_APPRAISAL_STATE_LABELS;

export type DirectorHeadteacherAppraisalStateCode =
  keyof typeof DIRECTOR_HEADTEACHER_APPRAISAL_STATE_LABELS;

export type HeadteacherOwnAppraisalReadState = {
  audience: "HEADTEACHER";
  state: HeadteacherOwnAppraisalStateCode;
  label: string;
  futureRouteTarget: string;
  cycleId: string | null;
  cycleStatus: AppraisalCycleStatus | null;
  requestedAt: string | null;
  approvedAt: string | null;
  openedAt: string | null;
  deadlineAt: string | null;
  closedAt: string | null;
  releasedAt: string | null;
  cancelledAt: string | null;
  canRequestNewCycle: boolean;
  canViewReleasedAppraisal: boolean;
};

export type TeacherHeadteacherAppraisalAssignmentReadState = {
  audience: "TEACHER";
  state: TeacherHeadteacherAppraisalStateCode;
  label: string;
  futureRouteTarget: string;
  anonymityNotice: string;
  assignmentActive: boolean;
  readOnly: boolean;
  cycleId: string | null;
  participantId: string | null;
  cycleStatus: AppraisalCycleStatus | null;
  participantStatus: AppraisalParticipantStatus | null;
  schoolName: string | null;
  openedAt: string | null;
  deadlineAt: string | null;
  finalizedAt: string | null;
};

export type DirectorHeadteacherAppraisalReadItem = {
  audience: "DIRECTOR";
  state: DirectorHeadteacherAppraisalStateCode;
  label: string;
  futureRouteTarget: string;
  cycleId: string;
  cycleStatus: AppraisalCycleStatus;
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitName: string | null;
  requestMode: "HEADTEACHER_REQUEST" | "DIRECT_OPEN" | "UNKNOWN";
  requestedAt: string;
  approvedAt: string | null;
  openedAt: string | null;
  deadlineAt: string | null;
  closedAt: string | null;
  releasedAt: string | null;
  cancelledAt: string | null;
  participantCount: number;
  finalizedResponseCount: number;
  feedbackWindowExpired: boolean;
  feedbackDeadlineExtensionCount: 0 | 1;
  canExtendFeedbackWindow: boolean;
  canDirectReleaseOwnAssessment: boolean;
  directReleaseAssessmentId: string | null;
};

export type DirectorHeadteacherAppraisalReadState = {
  audience: "DIRECTOR";
  futureRouteTarget: string;
  pendingApprovalCount: number;
  openCount: number;
  items: DirectorHeadteacherAppraisalReadItem[];
};

type ActiveMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
  };
  tenant: {
    id: string;
    status: string;
  };
};

type ReadCycleRecord = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetTenantId: string | null;
  targetNameSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  participants: Array<{
    status: AppraisalParticipantStatus;
  }>;
};

type ReadParticipantRecord = {
  id: string;
  status: AppraisalParticipantStatus;
  respondentUserId: string;
  respondentTenantId: string | null;
  startedAt: Date | null;
  finalizedAt: Date | null;
  expiredAt: Date | null;
  revokedAt: Date | null;
  cycle: ReadCycleRecord;
};

type ReadDirectorAssessmentActionRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
};

export type HeadteacherFeedbackReadOnlyDatabase = {
  membership: {
    findFirst(args: unknown): Promise<ActiveMembershipRecord | null>;
  };
  appraisalCycle: {
    findFirst(args: unknown): Promise<ReadCycleRecord | null>;
    findMany(args: unknown): Promise<ReadCycleRecord[]>;
  };
  appraisalParticipant: {
    findFirst(args: unknown): Promise<ReadParticipantRecord | null>;
  };
  appraisalAssessment?: {
    findMany(args: unknown): Promise<ReadDirectorAssessmentActionRecord[]>;
  };
};

export type ReadHeadteacherOwnAppraisalStateInput = {
  actorUserId: string;
  actorRoleName: unknown;
  tenantId: string;
  database?: HeadteacherFeedbackReadOnlyDatabase;
};

export type ReadTeacherHeadteacherAppraisalAssignmentStateInput = {
  actorUserId: string;
  actorRoleName: unknown;
  tenantId: string;
  now?: Date;
  database?: HeadteacherFeedbackReadOnlyDatabase;
};

export type ReadDirectorHeadteacherAppraisalStatesInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  limit?: number;
  now?: Date;
  database?: HeadteacherFeedbackReadOnlyDatabase;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };

  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);

  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_FEEDBACK_READ_IDENTIFIER_INVALID", 400, {
      fieldName,
    });
  }

  return id;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function assertActiveSchoolMembership(input: {
  database: HeadteacherFeedbackReadOnlyDatabase;
  actorUserId: string;
  tenantId: string;
  requiredRole: "HEADTEACHER" | "TEACHER";
}) {
  const membership = await input.database.membership.findFirst({
    where: {
      userId: input.actorUserId,
      tenantId: input.tenantId,
      status: "ACTIVE",
      role: {
        name: {
          equals: input.requiredRole,
          mode: "insensitive",
        },
      },
      tenant: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: {
        select: {
          name: true,
        },
      },
      tenant: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!membership) {
    fail("HEADTEACHER_FEEDBACK_READ_ACTIVE_MEMBERSHIP_REQUIRED", 403, {
      requiredRole: input.requiredRole,
      tenantId: input.tenantId,
    });
  }

  if (input.requiredRole === "HEADTEACHER") {
    assertActiveHeadteacherFeedbackTarget({
      target: {
        membershipId: membership.id,
        userId: membership.userId,
        tenantId: membership.tenantId,
        membershipStatus: membership.status,
        roleName: membership.role.name,
        tenantStatus: membership.tenant.status,
      },
      expectedUserId: input.actorUserId,
      expectedTenantId: input.tenantId,
    });
  }

  return membership;
}

function headteacherStateCode(
  status: AppraisalCycleStatus | null,
): HeadteacherOwnAppraisalStateCode {
  switch (status) {
    case null:
      return "REQUEST_APPRAISAL";
    case "DRAFT":
      return "REQUEST_PROCESSING";
    case "PENDING_APPROVAL":
      return "AWAITING_DIRECTOR_APPROVAL";
    case "OPEN":
      return "FEEDBACK_PERIOD_OPEN";
    case "CLOSED":
      return "RESPONSES_CLOSED_AWAITING_REVIEW";
    case "UNDER_REVIEW":
      return "DIRECTOR_REVIEWING_APPRAISAL";
    case "RELEASED":
      return "VIEW_RELEASED_APPRAISAL";
    case "CANCELLED":
      return "REQUEST_CLOSED";
  }
}

function directorStateCode(
  status: AppraisalCycleStatus,
): DirectorHeadteacherAppraisalStateCode {
  switch (status) {
    case "DRAFT":
      return "OPENING_IN_PROGRESS";
    case "PENDING_APPROVAL":
      return "APPROVAL_REQUIRED";
    case "OPEN":
      return "FEEDBACK_PERIOD_OPEN";
    case "CLOSED":
      return "RESPONSES_CLOSED_AWAITING_REVIEW";
    case "UNDER_REVIEW":
      return "DIRECTOR_REVIEWING_APPRAISAL";
    case "RELEASED":
      return "RELEASED";
    case "CANCELLED":
      return "REQUEST_CLOSED";
  }
}

function teacherStateCode(input: {
  participantStatus: AppraisalParticipantStatus;
  cycleStatus: AppraisalCycleStatus;
  deadlineAt: Date | null;
  now: Date;
}): TeacherHeadteacherAppraisalStateCode {
  if (input.participantStatus === "FINALIZED") {
    return "SUBMITTED_READ_ONLY";
  }

  if (
    input.participantStatus === "EXPIRED" ||
    input.participantStatus === "REVOKED" ||
    input.cycleStatus !== "OPEN" ||
    !input.deadlineAt ||
    input.deadlineAt.getTime() <= input.now.getTime()
  ) {
    return "CLOSED";
  }

  if (input.participantStatus === "IN_PROGRESS") {
    return "CONTINUE";
  }

  return "AVAILABLE";
}

export function buildHeadteacherOwnAppraisalReadState(
  cycle: ReadCycleRecord | null,
): HeadteacherOwnAppraisalReadState {
  const state = headteacherStateCode(cycle?.status ?? null);
  const canRequestNewCycle =
    cycle === null ||
    cycle.status === "RELEASED" ||
    cycle.status === "CANCELLED";

  return {
    audience: "HEADTEACHER",
    state,
    label: HEADTEACHER_OWN_APPRAISAL_STATE_LABELS[state],
    futureRouteTarget:
      HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.headteacher,
    cycleId: cycle?.id ?? null,
    cycleStatus: cycle?.status ?? null,
    requestedAt: iso(cycle?.requestedAt),
    approvedAt: iso(cycle?.approvedAt),
    openedAt: iso(cycle?.openedAt),
    deadlineAt: iso(cycle?.deadlineAt),
    closedAt: iso(cycle?.closedAt),
    releasedAt: iso(cycle?.releasedAt),
    cancelledAt: iso(cycle?.cancelledAt),
    canRequestNewCycle,
    canViewReleasedAppraisal: cycle?.status === "RELEASED",
  };
}

export function buildTeacherHeadteacherAppraisalAssignmentReadState(
  participant: ReadParticipantRecord | null,
  now = new Date(),
): TeacherHeadteacherAppraisalAssignmentReadState {
  if (!participant) {
    return {
      audience: "TEACHER",
      state: "LOCKED",
      label: TEACHER_HEADTEACHER_APPRAISAL_STATE_LABELS.LOCKED,
      futureRouteTarget:
        HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.teacher,
      anonymityNotice: HEADTEACHER_FEEDBACK_ANONYMITY_NOTICE,
      assignmentActive: false,
      readOnly: true,
      cycleId: null,
      participantId: null,
      cycleStatus: null,
      participantStatus: null,
      schoolName: null,
      openedAt: null,
      deadlineAt: null,
      finalizedAt: null,
    };
  }

  const state = teacherStateCode({
    participantStatus: participant.status,
    cycleStatus: participant.cycle.status,
    deadlineAt: participant.cycle.deadlineAt,
    now,
  });

  return {
    audience: "TEACHER",
    state,
    label: TEACHER_HEADTEACHER_APPRAISAL_STATE_LABELS[state],
    futureRouteTarget:
      HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.teacher,
    anonymityNotice: HEADTEACHER_FEEDBACK_ANONYMITY_NOTICE,
    assignmentActive: state === "AVAILABLE" || state === "CONTINUE",
    readOnly: state !== "AVAILABLE" && state !== "CONTINUE",
    cycleId: participant.cycle.id,
    participantId: participant.id,
    cycleStatus: participant.cycle.status,
    participantStatus: participant.status,
    schoolName: clean(participant.cycle.targetSchoolNameSnapshot) || null,
    openedAt: iso(participant.cycle.openedAt),
    deadlineAt: iso(participant.cycle.deadlineAt),
    finalizedAt: iso(participant.finalizedAt),
  };
}

export function buildDirectorHeadteacherAppraisalReadItem(
  cycle: ReadCycleRecord,
  now = new Date(),
  directReleaseAssessmentId: string | null = null,
): DirectorHeadteacherAppraisalReadItem {
  const targetTenantId = clean(cycle.targetTenantId);
  const schoolName = clean(cycle.targetSchoolNameSnapshot);

  if (!targetTenantId || !schoolName) {
    fail("HEADTEACHER_FEEDBACK_READ_CYCLE_SNAPSHOT_INCOMPLETE", 409, {
      cycleId: cycle.id,
    });
  }

  const state = directorStateCode(cycle.status);
  const metadata = objectValue(cycle.metadata);
  const openingMode = clean(metadata.openingMode).toUpperCase();
  const requestMode =
    openingMode === "DIRECT_OPEN"
      ? "DIRECT_OPEN"
      : clean(metadata.requestKey)
        ? "HEADTEACHER_REQUEST"
        : "UNKNOWN";
  const deadlineExtension =
    readHeadteacherFeedbackDeadlineExtensionMetadata(cycle.metadata);
  const feedbackWindowExpired =
    cycle.status === "OPEN" &&
    !!cycle.deadlineAt &&
    cycle.deadlineAt.getTime() <= now.getTime();
  const unfinishedParticipantCount = cycle.participants.filter(
    (participant) =>
      participant.status === "NOT_STARTED" ||
      participant.status === "IN_PROGRESS",
  ).length;

  return {
    audience: "DIRECTOR",
    state,
    label: DIRECTOR_HEADTEACHER_APPRAISAL_STATE_LABELS[state],
    futureRouteTarget:
      HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.director,
    cycleId: cycle.id,
    cycleStatus: cycle.status,
    targetHeadteacherUserId: cycle.targetUserId,
    targetHeadteacherName:
      clean(cycle.targetNameSnapshot) || null,
    targetTenantId,
    schoolName,
    circuitName: clean(cycle.targetZoneNameSnapshot) || null,
    requestMode,
    requestedAt: cycle.requestedAt.toISOString(),
    approvedAt: iso(cycle.approvedAt),
    openedAt: iso(cycle.openedAt),
    deadlineAt: iso(cycle.deadlineAt),
    closedAt: iso(cycle.closedAt),
    releasedAt: iso(cycle.releasedAt),
    cancelledAt: iso(cycle.cancelledAt),
    participantCount: cycle.participants.length,
    finalizedResponseCount: cycle.participants.filter(
      (participant) => participant.status === "FINALIZED",
    ).length,
    feedbackWindowExpired,
    feedbackDeadlineExtensionCount: deadlineExtension ? 1 : 0,
    canExtendFeedbackWindow:
      feedbackWindowExpired &&
      !deadlineExtension &&
      unfinishedParticipantCount > 0,
    canDirectReleaseOwnAssessment:
      cycle.status === "CLOSED" && !!clean(directReleaseAssessmentId),
    directReleaseAssessmentId:
      cycle.status === "CLOSED" ? clean(directReleaseAssessmentId) || null : null,
  };
}

export async function readHeadteacherOwnAppraisalState(
  input: ReadHeadteacherOwnAppraisalStateInput,
): Promise<HeadteacherOwnAppraisalReadState> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackReadOnlyDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const tenantId = requireIdentifier(input.tenantId, "tenantId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== "HEADTEACHER") {
    fail("HEADTEACHER_FEEDBACK_READ_HEADTEACHER_ONLY", 403, {
      actorRole,
    });
  }

  assertHeadteacherFeedbackInstrumentReady();

  await assertActiveSchoolMembership({
    database,
    actorUserId,
    tenantId,
    requiredRole: "HEADTEACHER",
  });

  const cycle = await database.appraisalCycle.findFirst({
    where: {
      targetUserId: actorUserId,
      targetTenantId: tenantId,
      targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
      instrumentVersion: {
        instrument: {
          code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
        },
      },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      targetUserId: true,
      targetTenantId: true,
      targetNameSnapshot: true,
      targetSchoolNameSnapshot: true,
      targetZoneNameSnapshot: true,
      requestedAt: true,
      approvedAt: true,
      openedAt: true,
      deadlineAt: true,
      closedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
      participants: {
        select: {
          status: true,
        },
      },
    },
  });

  return buildHeadteacherOwnAppraisalReadState(cycle);
}

export async function readTeacherHeadteacherAppraisalAssignmentState(
  input: ReadTeacherHeadteacherAppraisalAssignmentStateInput,
): Promise<TeacherHeadteacherAppraisalAssignmentReadState> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackReadOnlyDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const tenantId = requireIdentifier(input.tenantId, "tenantId");
  const actorRole = effectiveRole(input.actorRoleName);
  const now = input.now ? new Date(input.now) : new Date();

  if (actorRole !== "TEACHER") {
    fail("HEADTEACHER_FEEDBACK_READ_TEACHER_ONLY", 403, {
      actorRole,
    });
  }

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_READ_TIME_INVALID", 400);
  }

  assertHeadteacherFeedbackInstrumentReady();

  await assertActiveSchoolMembership({
    database,
    actorUserId,
    tenantId,
    requiredRole: "TEACHER",
  });

  const participant = await database.appraisalParticipant.findFirst({
    where: {
      respondentUserId: actorUserId,
      respondentTenantId: tenantId,
      cycle: {
        targetTenantId: tenantId,
        targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
        instrumentVersion: {
          instrument: {
            code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
          },
        },
      },
    },
    orderBy: [{ selectedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      respondentUserId: true,
      respondentTenantId: true,
      startedAt: true,
      finalizedAt: true,
      expiredAt: true,
      revokedAt: true,
      cycle: {
        select: {
          id: true,
          status: true,
          targetUserId: true,
          targetTenantId: true,
          targetNameSnapshot: true,
          targetSchoolNameSnapshot: true,
          targetZoneNameSnapshot: true,
          requestedAt: true,
          approvedAt: true,
          openedAt: true,
          deadlineAt: true,
          closedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
          participants: {
            select: {
              status: true,
            },
          },
        },
      },
    },
  });

  if (
    participant &&
    (participant.respondentUserId !== actorUserId ||
      participant.respondentTenantId !== tenantId ||
      participant.cycle.targetTenantId !== tenantId)
  ) {
    fail("HEADTEACHER_FEEDBACK_READ_ASSIGNMENT_SCOPE_MISMATCH", 403);
  }

  return buildTeacherHeadteacherAppraisalAssignmentReadState(
    participant,
    now,
  );
}

export async function readDirectorHeadteacherAppraisalStates(
  input: ReadDirectorHeadteacherAppraisalStatesInput,
): Promise<DirectorHeadteacherAppraisalReadState> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackReadOnlyDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);
  const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 100);
  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_READ_TIME_INVALID", 400);
  }

  if (actorRole !== "DISTRICT_DIRECTOR" && actorRole !== "SUPERADMIN") {
    fail("HEADTEACHER_FEEDBACK_READ_DIRECTOR_ONLY", 403, {
      actorRole,
    });
  }

  assertHeadteacherFeedbackInstrumentReady();

  const tenantIds = [...new Set(input.governanceScope.tenantIds.map(clean))]
    .filter(Boolean)
    .sort();

  if (!input.governanceScope.isSuperAdmin && tenantIds.length === 0) {
    return {
      audience: "DIRECTOR",
      futureRouteTarget:
        HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.director,
      pendingApprovalCount: 0,
      openCount: 0,
      items: [],
    };
  }

  const cycles = await database.appraisalCycle.findMany({
    where: {
      ...(input.governanceScope.isSuperAdmin
        ? {}
        : {
            targetTenantId: {
              in: tenantIds,
            },
          }),
      targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
      instrumentVersion: {
        instrument: {
          code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
        },
      },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      status: true,
      targetUserId: true,
      targetTenantId: true,
      targetNameSnapshot: true,
      targetSchoolNameSnapshot: true,
      targetZoneNameSnapshot: true,
      requestedAt: true,
      approvedAt: true,
      openedAt: true,
      deadlineAt: true,
      closedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
      participants: {
        select: {
          status: true,
        },
      },
    },
  });

  const directReleaseAssessmentIdsByCycle = new Map<string, string>();
  const closedCycleIds =
    actorRole === "DISTRICT_DIRECTOR"
      ? cycles
          .filter((cycle) => cycle.status === "CLOSED")
          .map((cycle) => cycle.id)
      : [];

  const appraisalAssessment = database.appraisalAssessment;
  if (closedCycleIds.length > 0 && appraisalAssessment) {
    const directReleaseCandidates = await appraisalAssessment.findMany({
      where: {
        cycleId: { in: closedCycleIds },
        assessorUserId: actorUserId,
        status: "FINALIZED",
        revision: 1,
        priorAssessmentId: null,
        finalizedByUserId: actorUserId,
      },
      select: {
        id: true,
        cycleId: true,
        assessorUserId: true,
        status: true,
        revision: true,
        priorAssessmentId: true,
        finalizedByUserId: true,
        finalizedAt: true,
      },
    });

    const candidateIdsByCycle = new Map<string, string[]>();
    for (const assessment of directReleaseCandidates) {
      if (
        assessment.assessorUserId !== actorUserId ||
        assessment.status !== "FINALIZED" ||
        assessment.revision !== 1 ||
        assessment.priorAssessmentId !== null ||
        assessment.finalizedByUserId !== actorUserId ||
        !assessment.finalizedAt ||
        !closedCycleIds.includes(assessment.cycleId)
      ) {
        continue;
      }

      const ids = candidateIdsByCycle.get(assessment.cycleId) ?? [];
      ids.push(assessment.id);
      candidateIdsByCycle.set(assessment.cycleId, ids);
    }

    for (const [candidateCycleId, assessmentIds] of candidateIdsByCycle) {
      if (assessmentIds.length === 1) {
        directReleaseAssessmentIdsByCycle.set(
          candidateCycleId,
          assessmentIds[0],
        );
      }
    }
  }

  const items = cycles.map((cycle) => {
    const targetTenantId = clean(cycle.targetTenantId);

    assertHeadteacherFeedbackApprovalAuthority({
      actorUserId,
      actorRoleName: actorRole,
      targetHeadteacherUserId: cycle.targetUserId,
      targetTenantId,
      governanceScope: input.governanceScope,
    });

    return buildDirectorHeadteacherAppraisalReadItem(
      cycle,
      now,
      directReleaseAssessmentIdsByCycle.get(cycle.id) ?? null,
    );
  });

  return {
    audience: "DIRECTOR",
    futureRouteTarget:
      HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.director,
    pendingApprovalCount: items.filter(
      (item) => item.cycleStatus === "PENDING_APPROVAL",
    ).length,
    openCount: items.filter(
      (item) => item.cycleStatus === "OPEN",
    ).length,
    items,
  };
}
