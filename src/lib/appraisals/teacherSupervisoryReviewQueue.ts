import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  TEACHER_SUPERVISORY_REVIEW_POLICY,
  decideTeacherSupervisoryReviewAuthority,
  teacherSupervisoryReviewChainForAssessor,
  type TeacherSupervisoryReviewOriginRole,
  type TeacherSupervisoryReviewerRole,
} from "@/lib/appraisals/teacherSupervisoryReview";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY = {
  schemaVersion: 2,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  instrumentCode: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  instrumentVersion: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  targetRole: "TEACHER",
  reviewerRoles: TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles,
  states: [
    "READY_TO_START",
    "READY_TO_REVIEW",
    "READY_TO_RELEASE",
  ] as const,
  nextActions: [
    "START_REVIEW",
    "CONTINUE_REVIEW",
    "DIRECT_RELEASE",
  ] as const,
  initialAssessmentStatus: "FINALIZED",
  initialCycleStatus: "OPEN",
  initialReviewCount: 0,
  activeAssessmentStatus: "FINALIZED",
  activeCycleStatus: "UNDER_REVIEW",
  activeReviewDecision: "PENDING",
  directReleaseAssessorRole: "DISTRICT_DIRECTOR",
  directReleaseActorRole: "DISTRICT_DIRECTOR",
  directReleaseReviewCount: 0,
  directReleaseSelfReviewAllowed: false,
  directReleaseReviewRowsRequired: false,
  activeTargetMembershipRequired: true,
  activeTargetTenantRequired: true,
  activeCircuitRequired: true,
  activeDistrictRequired: true,
  currentReviewerAssignmentRequired: true,
  currentReviewCustodyRequired: true,
  reviewerAuthorityRecheckedPerAssessment: true,
  directReleaseAuthorityRecheckedPerAssessment: true,
  immutableAssessmentHashRequired: true,
  fullAssessmentHashReverificationDeferredToAction: true,
  assessmentEvidenceIncluded: false,
  scoresIncluded: false,
  directReleaseOverallPercentageIncluded: true,
  generalCommentIncluded: false,
  observationDetailsIncluded: false,
  classEnrolmentEvidenceIncluded: false,
  contactDetailsIncluded: false,
  assessorUserIdIncluded: false,
  targetUserIdIncluded: false,
  reviewIdIncluded: false,
  assignmentIdsIncluded: false,
  proofHashesIncluded: false,
  legacyTeacherAppraisalIncluded: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
  backgroundPollingAllowed: false,
} as const;

export type TeacherSupervisoryReviewQueueState =
  (typeof TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.states)[number];

export type TeacherSupervisoryReviewQueueNextAction =
  (typeof TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.nextActions)[number];

export type TeacherSupervisoryReviewQueueItem = {
  cycleId: string;
  assessmentId: string;
  revision: number;
  dateObserved: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  assessorRole: TeacherSupervisoryReviewOriginRole;
  assessorOfficeLabel: string;
  overallPercentage: number | null;
  state: TeacherSupervisoryReviewQueueState;
  nextAction: TeacherSupervisoryReviewQueueNextAction;
  eligible: true;
};

export type TeacherSupervisoryReviewQueue = {
  actorRole: TeacherSupervisoryReviewerRole | string;
  officeLabel: string;
  summary: {
    assessments: number;
    readyToStart: number;
    readyToReview: number;
    readyToRelease: number;
    circuits: number;
    schools: number;
  };
  items: TeacherSupervisoryReviewQueueItem[];
  readOnlyDiscovery: true;
  assessmentEvidenceIncluded: false;
  scoresIncluded: false;
  generalCommentIncluded: false;
  observationDetailsIncluded: false;
  classEnrolmentEvidenceIncluded: false;
  contactDetailsIncluded: false;
  assessorUserIdIncluded: false;
  targetUserIdIncluded: false;
  reviewIdIncluded: false;
  assignmentIdsIncluded: false;
  proofHashesIncluded: false;
  legacyTeacherAppraisalIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

export type ReadTeacherSupervisoryReviewQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: TeacherSupervisoryReviewQueueDatabase;
};

type ScopeAssignment = GovernanceScope["assignments"][number];

type CandidateReviewRecord = {
  id: string;
  cycleId: string;
  assessmentId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string | null;
  stage: number;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

type CandidateAssessmentRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  dateObserved: Date | null;
  overallPercentage: number | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  reviews: CandidateReviewRecord[];
  _count: { reviews: number };
  instrumentVersion: {
    id: string;
    version: number;
    status: string;
    contentHash: string | null;
    instrument: {
      code: string;
      purpose: string;
      subjectType: string;
      isActive: boolean;
    };
  };
  cycle: {
    id: string;
    instrumentVersionId: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    status: string;
    responseWindowDays: number;
    minimumResponses: number;
    openedAt: Date | null;
    deadlineAt: Date | null;
    closedAt: Date | null;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
    _count: { participants: number };
  };
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  tenant: {
    id: string;
    name: string;
    status: string;
    zone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: { level: number };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: { level: number };
      };
    };
  };
};

export type TeacherSupervisoryReviewQueueDatabase = {
  appraisalAssessment: {
    findMany(args: unknown): Promise<CandidateAssessmentRecord[]>;
  };
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
};

type ObservationContext = {
  schemaVersion?: unknown;
  workflow?: unknown;
  evidenceStream?: unknown;
  target?: {
    userId?: unknown;
    role?: unknown;
    tenantId?: unknown;
    name?: unknown;
    schoolName?: unknown;
  };
  assessor?: {
    userId?: unknown;
    role?: unknown;
    assignmentId?: unknown;
  };
  jurisdiction?: {
    districtZoneId?: unknown;
    districtName?: unknown;
    circuitZoneId?: unknown;
    circuitName?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function displayName(user: TargetMembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    null
  );
}

function officeLabel(role: string) {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function canonicalReviewerRole(value: unknown) {
  const role = normalized(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles.includes(
    role as TeacherSupervisoryReviewerRole,
  )
    ? (role as TeacherSupervisoryReviewerRole)
    : null;
}

function emptyQueue(actorRole: string): TeacherSupervisoryReviewQueue {
  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    summary: {
      assessments: 0,
      readyToStart: 0,
      readyToReview: 0,
      readyToRelease: 0,
      circuits: 0,
      schools: 0,
    },
    items: [],
    readOnlyDiscovery: true,
    assessmentEvidenceIncluded: false,
    scoresIncluded: false,
    generalCommentIncluded: false,
    observationDetailsIncluded: false,
    classEnrolmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    assessorUserIdIncluded: false,
    targetUserIdIncluded: false,
    reviewIdIncluded: false,
    assignmentIdsIncluded: false,
    proofHashesIncluded: false,
    legacyTeacherAppraisalIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

function parseObservationContext(
  record: CandidateAssessmentRecord,
): ObservationContext | null {
  const context = objectValue(record.evidenceSnapshotJson) as ObservationContext;
  const metadata = objectValue(record.metadata);
  const schemaVersion = Number(context.schemaVersion);

  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    clean(context.workflow) !== TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow ||
    clean(context.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream ||
    clean(context.target?.userId) !== record.cycle.targetUserId ||
    clean(context.target?.tenantId) !== clean(record.cycle.targetTenantId) ||
    normalized(context.target?.role) !== "TEACHER" ||
    clean(context.assessor?.userId) !== record.assessorUserId ||
    clean(context.assessor?.assignmentId) !== clean(record.assessorAssignmentId) ||
    clean(context.jurisdiction?.districtZoneId) !== record.cycle.scopeZoneId ||
    clean(context.jurisdiction?.circuitZoneId) !== clean(record.cycle.targetZoneId) ||
    !record.dateObserved ||
    clean(context.observation?.dateObserved) !== isoDateOnly(record.dateObserved) ||
    !isSha256(metadata.observationContextHash) ||
    metadata.observationContextImmutable !== true ||
    metadata.separateFromLegacyTeacherAppraisal !== true ||
    metadata.legacyTeacherAppraisalMutationAllowed !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    return null;
  }

  return context;
}

function commonAssessmentContract(record: CandidateAssessmentRecord) {
  const cycleMetadata = objectValue(record.cycle.metadata);

  return Boolean(
    normalized(record.status) === "FINALIZED" &&
      record.cycle.id === record.cycleId &&
      record.cycle.instrumentVersionId === record.instrumentVersion.id &&
      record.cycle.openedAt &&
      record.cycle.deadlineAt === null &&
      record.cycle.releasedAt === null &&
      record.cycle.cancelledAt === null &&
      record.cycle.responseWindowDays === 0 &&
      record.cycle.minimumResponses === 0 &&
      record.cycle._count.participants === 0 &&
      record.finalizedAt &&
      record.finalizedByUserId === record.assessorUserId &&
      isSha256(record.assessmentHash) &&
      clean(cycleMetadata.workflow) ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow &&
      clean(cycleMetadata.evidenceStream) ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream &&
      cycleMetadata.respondentWorkflow === false &&
      clean(cycleMetadata.participantSelection) === "NONE" &&
      cycleMetadata.legacyTeacherAppraisalIncluded === false &&
      cycleMetadata.combinedWeightingDefined === false &&
      cycleMetadata.providerCalled === false &&
      record.instrumentVersion.version ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion &&
      normalized(record.instrumentVersion.status) === "ACTIVE" &&
      record.instrumentVersion.instrument.code ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode &&
      record.instrumentVersion.instrument.purpose === "TEACHER_OBSERVATION" &&
      record.instrumentVersion.instrument.subjectType === "TEACHER" &&
      record.instrumentVersion.instrument.isActive === true &&
      isSha256(record.instrumentVersion.contentHash) &&
      record._count.reviews === record.reviews.length,
  );
}

function cycleReadyForInitialWork(record: CandidateAssessmentRecord) {
  return Boolean(
    commonAssessmentContract(record) &&
      normalized(record.cycle.status) === "OPEN" &&
      record.cycle.closedAt === null &&
      record.cycle.reviewStartedAt === null &&
      record._count.reviews === 0,
  );
}

function cycleReadyForActiveReview(record: CandidateAssessmentRecord) {
  return Boolean(
    commonAssessmentContract(record) &&
      normalized(record.cycle.status) === "UNDER_REVIEW" &&
      record.cycle.closedAt &&
      record.cycle.reviewStartedAt &&
      record.cycle.closedAt.getTime() === record.cycle.reviewStartedAt.getTime(),
  );
}

function membershipKey(userId: string, tenantId: string) {
  return `${tenantId}:${userId}`;
}

function validCurrentTarget(
  membership: TargetMembershipRecord,
  record: CandidateAssessmentRecord,
) {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  return Boolean(
    clean(membership.id) &&
      membership.userId === record.cycle.targetUserId &&
      membership.user.id === membership.userId &&
      membership.tenantId === record.cycle.targetTenantId &&
      membership.tenant.id === membership.tenantId &&
      normalized(membership.status) === "ACTIVE" &&
      normalized(membership.role.name) === "TEACHER" &&
      normalized(membership.tenant.status) === "ACTIVE" &&
      zone &&
      zone.isActive === true &&
      zone.zoneType.level ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel &&
      zone.id === record.cycle.targetZoneId &&
      district &&
      district.isActive === true &&
      district.zoneType.level ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      district.id === record.cycle.scopeZoneId &&
      zone.parentZoneId === district.id,
  );
}

function reviewerAssignmentForDistrict(input: {
  actorRole: TeacherSupervisoryReviewerRole;
  districtId: string;
  assignments: readonly ScopeAssignment[];
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      normalized(assignment.role) === input.actorRole &&
      assignment.zoneLevel ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      clean(assignment.zoneId) === input.districtId &&
      clean(assignment.id),
  );

  return matches.length === 1 ? matches[0] : null;
}

function scopeContainsTarget(input: {
  governanceScope: GovernanceScope;
  tenantId: string;
  circuitId: string;
  districtId: string;
}) {
  const tenantIds = new Set(
    input.governanceScope.tenantIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.has(input.tenantId)) return false;
  if (input.governanceScope.isSuperAdmin) return true;

  const zoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );
  return zoneIds.has(input.circuitId) || zoneIds.has(input.districtId);
}

function currentPendingReviewForActor(input: {
  record: CandidateAssessmentRecord;
  actorUserId: string;
  actorRole: TeacherSupervisoryReviewerRole;
  assessorRole: TeacherSupervisoryReviewOriginRole;
  reviewerAssignment: ScopeAssignment;
}) {
  const pending = input.record.reviews.filter(
    (review) => normalized(review.decision) === "PENDING",
  );

  if (pending.length !== 1) return null;

  const review = pending[0];
  if (
    review.cycleId !== input.record.cycleId ||
    review.assessmentId !== input.record.id ||
    review.reviewerUserId !== input.actorUserId ||
    clean(review.reviewerAssignmentId) !== clean(input.reviewerAssignment.id) ||
    clean(review.note) ||
    review.decidedAt
  ) {
    return null;
  }

  const authority = decideTeacherSupervisoryReviewAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRole,
    assessorUserId: input.record.assessorUserId,
    assessorRoleName: input.assessorRole,
    stage: review.stage,
  });
  if (!authority.allowed) return null;

  const expectedStage = teacherSupervisoryReviewChainForAssessor(
    input.assessorRole,
  )?.stages.find((candidate) => candidate.stage === review.stage);

  if (
    !expectedStage ||
    expectedStage.reviewerRole !== input.actorRole ||
    authority.stage !== review.stage
  ) {
    return null;
  }

  const reviewMetadata = objectValue(review.metadata);
  const cycleReviewMetadata = objectValue(
    objectValue(input.record.cycle.metadata).teacherSupervisoryReview,
  );
  const observationContextHash = clean(
    objectValue(input.record.metadata).observationContextHash,
  ).toLowerCase();
  const reviewEvidenceHash = clean(
    reviewMetadata.reviewEvidenceHash,
  ).toLowerCase();

  if (
    !isSha256(reviewEvidenceHash) ||
    clean(reviewMetadata.workflow) !==
      TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow ||
    clean(reviewMetadata.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream ||
    Number(reviewMetadata.reviewStage) !== review.stage ||
    clean(reviewMetadata.reviewerRole) !== input.actorRole ||
    clean(reviewMetadata.assessmentId) !== input.record.id ||
    Number(reviewMetadata.assessmentRevision) !== input.record.revision ||
    clean(reviewMetadata.assessmentHash).toLowerCase() !==
      clean(input.record.assessmentHash).toLowerCase() ||
    clean(reviewMetadata.observationContextHash).toLowerCase() !==
      observationContextHash ||
    clean(cycleReviewMetadata.currentReviewId) !== review.id ||
    Number(cycleReviewMetadata.currentReviewStage) !== review.stage ||
    clean(cycleReviewMetadata.currentReviewerRole) !== input.actorRole ||
    clean(cycleReviewMetadata.currentReviewerAssignmentId) !==
      clean(input.reviewerAssignment.id) ||
    clean(cycleReviewMetadata.reviewEvidenceHash).toLowerCase() !==
      reviewEvidenceHash ||
    clean(cycleReviewMetadata.admittedAssessmentId) !== input.record.id ||
    Number(cycleReviewMetadata.admittedAssessmentRevision) !==
      input.record.revision ||
    clean(cycleReviewMetadata.assessmentHash).toLowerCase() !==
      clean(input.record.assessmentHash).toLowerCase() ||
    clean(cycleReviewMetadata.observationContextHash).toLowerCase() !==
      observationContextHash
  ) {
    return null;
  }

  return review;
}

function directReleaseReadyForActor(input: {
  record: CandidateAssessmentRecord;
  actorUserId: string;
  actorRole: TeacherSupervisoryReviewerRole;
  assessorRole: TeacherSupervisoryReviewOriginRole;
  reviewerAssignment: ScopeAssignment;
}) {
  if (
    input.actorRole !== "DISTRICT_DIRECTOR" ||
    input.assessorRole !== "DISTRICT_DIRECTOR" ||
    input.record.assessorUserId !== input.actorUserId ||
    clean(input.record.assessorAssignmentId) !==
      clean(input.reviewerAssignment.id) ||
    input.record.revision !== 1 ||
    input.record._count.reviews !== 0
  ) {
    return false;
  }

  const chain = teacherSupervisoryReviewChainForAssessor(input.assessorRole);
  return Boolean(
    chain &&
      chain.assessorRole === "DISTRICT_DIRECTOR" &&
      chain.requiresReviewRows === false &&
      chain.selfReviewAllowed === false &&
      chain.stages.length === 0 &&
      chain.terminalAuthorityRole === "DISTRICT_DIRECTOR",
  );
}

function publicQueueItem(input: {
  record: CandidateAssessmentRecord;
  membership: TargetMembershipRecord;
  context: ObservationContext;
  assessorRole: TeacherSupervisoryReviewOriginRole;
  state: TeacherSupervisoryReviewQueueState;
  nextAction: TeacherSupervisoryReviewQueueNextAction;
}): TeacherSupervisoryReviewQueueItem {
  return {
    cycleId: input.record.cycleId,
    assessmentId: input.record.id,
    revision: input.record.revision,
    dateObserved: isoDateOnly(input.record.dateObserved!),
    targetName:
      clean(input.context.target?.name) || displayName(input.membership.user),
    schoolId: input.membership.tenant.id,
    schoolName: clean(input.context.target?.schoolName),
    circuitId: clean(input.record.cycle.targetZoneId),
    circuitName: clean(input.context.jurisdiction?.circuitName),
    districtId: input.record.cycle.scopeZoneId,
    districtName: clean(input.context.jurisdiction?.districtName),
    assessorRole: input.assessorRole,
    assessorOfficeLabel: officeLabel(input.assessorRole),
    overallPercentage:
      input.state === "READY_TO_RELEASE" ? input.record.overallPercentage : null,
    state: input.state,
    nextAction: input.nextAction,
    eligible: true,
  };
}

function statePriority(state: TeacherSupervisoryReviewQueueState) {
  switch (state) {
    case "READY_TO_REVIEW":
      return 0;
    case "READY_TO_RELEASE":
      return 1;
    case "READY_TO_START":
      return 2;
  }
}

export async function readTeacherSupervisoryReviewQueue(
  input: ReadTeacherSupervisoryReviewQueueInput,
): Promise<TeacherSupervisoryReviewQueue> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = canonicalReviewerRole(input.actorRoleName);
  const empty = () => emptyQueue(actorRole ?? normalized(input.actorRoleName));

  if (!actorUserId || !actorRole) return empty();

  const now = input.now ? new Date(input.now.getTime()) : new Date();
  if (Number.isNaN(now.getTime())) return empty();

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  if (!tenantIds.length) return empty();

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReviewQueueDatabase);

  const assessments = await database.appraisalAssessment.findMany({
    where: {
      status: "FINALIZED",
      cycle: {
        status: { in: ["OPEN", "UNDER_REVIEW"] },
        targetTenantId: { in: tenantIds },
      },
      instrumentVersion: {
        version: TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion,
        status: "ACTIVE",
        instrument: {
          code: TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode,
          purpose: "TEACHER_OBSERVATION",
          subjectType: "TEACHER",
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      cycleId: true,
      assessorUserId: true,
      assessorAssignmentId: true,
      status: true,
      revision: true,
      dateObserved: true,
      overallPercentage: true,
      evidenceSnapshotJson: true,
      assessmentHash: true,
      finalizedByUserId: true,
      finalizedAt: true,
      metadata: true,
      reviews: {
        select: {
          id: true,
          cycleId: true,
          assessmentId: true,
          reviewerUserId: true,
          reviewerAssignmentId: true,
          stage: true,
          decision: true,
          note: true,
          decidedAt: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      },
      _count: { select: { reviews: true } },
      instrumentVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          contentHash: true,
          instrument: {
            select: {
              code: true,
              purpose: true,
              subjectType: true,
              isActive: true,
            },
          },
        },
      },
      cycle: {
        select: {
          id: true,
          instrumentVersionId: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          status: true,
          responseWindowDays: true,
          minimumResponses: true,
          openedAt: true,
          deadlineAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
          _count: { select: { participants: true } },
        },
      },
    },
    orderBy: [{ finalizedAt: "asc" }, { createdAt: "asc" }],
  });

  if (!assessments.length) return empty();

  const targetUserIds = [
    ...new Set(assessments.map((record) => record.cycle.targetUserId)),
  ];
  const memberships = await database.membership.findMany({
    where: {
      userId: { in: targetUserIds },
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
          mode: "insensitive",
        },
      },
      tenant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
          zone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              parentZoneId: true,
              zoneType: { select: { level: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                  zoneType: { select: { level: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const membershipByTarget = new Map<string, TargetMembershipRecord>();
  for (const membership of memberships) {
    const key = membershipKey(membership.userId, membership.tenantId);
    if (!membershipByTarget.has(key)) membershipByTarget.set(key, membership);
  }

  const items: TeacherSupervisoryReviewQueueItem[] = [];

  for (const record of assessments) {
    if (!commonAssessmentContract(record)) continue;

    const context = parseObservationContext(record);
    if (!context) continue;

    const canonicalAssessorRole = canonicalTeacherSupervisoryAssessorRole(
      context.assessor?.role,
    );
    if (!canonicalAssessorRole) continue;
    const assessorRole =
      canonicalAssessorRole as TeacherSupervisoryReviewOriginRole;

    const targetTenantId = clean(record.cycle.targetTenantId);
    const circuitId = clean(record.cycle.targetZoneId);
    const districtId = clean(record.cycle.scopeZoneId);
    if (!targetTenantId || !circuitId || !districtId) continue;

    if (
      !scopeContainsTarget({
        governanceScope: input.governanceScope,
        tenantId: targetTenantId,
        circuitId,
        districtId,
      })
    ) {
      continue;
    }

    const reviewerAssignment = reviewerAssignmentForDistrict({
      actorRole,
      districtId,
      assignments: input.governanceScope.assignments,
    });
    if (!reviewerAssignment) continue;

    const membership = membershipByTarget.get(
      membershipKey(record.cycle.targetUserId, targetTenantId),
    );
    if (!membership || !validCurrentTarget(membership, record)) continue;

    const contextDistrictName = clean(context.jurisdiction?.districtName);
    const contextCircuitName = clean(context.jurisdiction?.circuitName);
    const contextSchoolName = clean(context.target?.schoolName);

    if (
      !contextDistrictName ||
      !contextCircuitName ||
      !contextSchoolName ||
      clean(context.target?.userId) !== membership.userId ||
      clean(context.target?.tenantId) !== membership.tenantId
    ) {
      continue;
    }

    if (cycleReadyForActiveReview(record)) {
      const currentReview = currentPendingReviewForActor({
        record,
        actorUserId,
        actorRole,
        assessorRole,
        reviewerAssignment,
      });
      if (!currentReview) continue;

      items.push(
        publicQueueItem({
          record,
          membership,
          context,
          assessorRole,
          state: "READY_TO_REVIEW",
          nextAction: "CONTINUE_REVIEW",
        }),
      );
      continue;
    }

    if (!cycleReadyForInitialWork(record)) continue;

    if (
      directReleaseReadyForActor({
        record,
        actorUserId,
        actorRole,
        assessorRole,
        reviewerAssignment,
      })
    ) {
      items.push(
        publicQueueItem({
          record,
          membership,
          context,
          assessorRole,
          state: "READY_TO_RELEASE",
          nextAction: "DIRECT_RELEASE",
        }),
      );
      continue;
    }

    const chain = teacherSupervisoryReviewChainForAssessor(assessorRole);
    const firstStage = chain?.stages[0];
    if (!chain || !chain.requiresReviewRows || !firstStage) continue;

    const authority = decideTeacherSupervisoryReviewAuthority({
      actorUserId,
      actorRoleName: actorRole,
      assessorUserId: record.assessorUserId,
      assessorRoleName: assessorRole,
      stage: firstStage.stage,
    });
    if (!authority.allowed) continue;

    items.push(
      publicQueueItem({
        record,
        membership,
        context,
        assessorRole: authority.assessorRole,
        state: "READY_TO_START",
        nextAction: "START_REVIEW",
      }),
    );
  }

  items.sort((left, right) => {
    const stateDifference =
      statePriority(left.state) - statePriority(right.state);
    if (stateDifference !== 0) return stateDifference;

    const districtDifference = left.districtName.localeCompare(
      right.districtName,
    );
    if (districtDifference !== 0) return districtDifference;

    const circuitDifference = left.circuitName.localeCompare(
      right.circuitName,
    );
    if (circuitDifference !== 0) return circuitDifference;

    const schoolDifference = left.schoolName.localeCompare(right.schoolName);
    if (schoolDifference !== 0) return schoolDifference;

    const teacherDifference = (left.targetName ?? "").localeCompare(
      right.targetName ?? "",
    );
    if (teacherDifference !== 0) return teacherDifference;

    const dateDifference = left.dateObserved.localeCompare(right.dateObserved);
    if (dateDifference !== 0) return dateDifference;

    return left.assessmentId.localeCompare(right.assessmentId);
  });

  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    summary: {
      assessments: items.length,
      readyToStart: items.filter((item) => item.state === "READY_TO_START").length,
      readyToReview: items.filter((item) => item.state === "READY_TO_REVIEW").length,
      readyToRelease: items.filter((item) => item.state === "READY_TO_RELEASE").length,
      circuits: new Set(items.map((item) => item.circuitId)).size,
      schools: new Set(items.map((item) => item.schoolId)).size,
    },
    items,
    readOnlyDiscovery: true,
    assessmentEvidenceIncluded: false,
    scoresIncluded: false,
    generalCommentIncluded: false,
    observationDetailsIncluded: false,
    classEnrolmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    assessorUserIdIncluded: false,
    targetUserIdIncluded: false,
    reviewIdIncluded: false,
    assignmentIdsIncluded: false,
    proofHashesIncluded: false,
    legacyTeacherAppraisalIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}
