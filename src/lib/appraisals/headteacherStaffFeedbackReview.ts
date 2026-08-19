import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_DIRECTOR_REVIEW_POLICY } from "@/lib/appraisals/headteacherDirectorReview";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  evidenceStream: "CONFIDENTIAL_STAFF_FEEDBACK",
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  allowedCarrierCycleStatuses: ["CLOSED", "UNDER_REVIEW"] as const,
  requiredSnapshotVersion: 1,
  requiredMinimumResponses: 1,
  allowedDecisions: ["RETURN", "HOLD", "RELEASE"] as const,
  explicitConfirmationRequired: true,
  minimumReasonLength: 3,
  maximumNoteLength: 2_000,
  holdCreatesExactlyOneNextStage: true,
  returnReopensParticipantForms: false,
  returnCreatesNewFeedbackCycle: false,
  returnMeaning: "RETURN_REVIEW_TO_QUEUE",
  releaseMutatesCarrierCycle: false,
  governanceAssessmentRequired: false,
  governanceAssessmentAccessed: false,
  reviewerMayRewriteScores: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  combinedWeightingDefined: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

export type HeadteacherStaffFeedbackReviewDecision =
  (typeof HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.allowedDecisions)[number];

export type HeadteacherStaffFeedbackReviewLifecycleState =
  | "READY_TO_START"
  | "PENDING_DECISION"
  | "RETURNED_TO_QUEUE"
  | "HELD_CONTINUATION"
  | "RELEASED";

export type HeadteacherStaffFeedbackReviewState = {
  cycleId: string;
  snapshotId: string;
  lifecycleState: HeadteacherStaffFeedbackReviewLifecycleState;
  latestReviewId: string | null;
  latestStage: number | null;
  latestDecision: "PENDING" | "RETURNED" | "HELD" | "ACCEPTED" | null;
  canStartReview: boolean;
  canDecide: boolean;
  releasedAt: string | null;
  releaseProofHash: string | null;
  governanceAssessmentRequired: false;
  carrierCycleStatusMutationPerformed: false;
};

export type StartHeadteacherStaffFeedbackReviewInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  confirm: boolean;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherStaffFeedbackReviewDatabase;
};

export type StartHeadteacherStaffFeedbackReviewResult = {
  outcome: "STARTED" | "EXISTING_PENDING";
  state: HeadteacherStaffFeedbackReviewState;
  reviewId: string;
  stage: number;
  snapshotId: string;
  reviewEvidenceHash: string;
  providerCalled: false;
};

export type ExecuteHeadteacherStaffFeedbackReviewDecisionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  reviewId: string;
  decision: unknown;
  note?: unknown;
  confirm: boolean;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherStaffFeedbackReviewDatabase;
};

export type ExecuteHeadteacherStaffFeedbackReviewDecisionResult = {
  outcome:
    | "RETURNED"
    | "HELD"
    | "RELEASED"
    | "EXISTING_RETURNED"
    | "EXISTING_HELD"
    | "EXISTING_RELEASED";
  cycleId: string;
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "HELD" | "ACCEPTED";
  snapshotId: string;
  staffSourceHash: string;
  reviewEvidenceHash: string;
  decisionRequestHash: string;
  nextReviewId: string | null;
  nextReviewStage: number | null;
  releaseProofHash: string | null;
  releasedAt: string | null;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  carrierCycleStatusMutationPerformed: false;
  governanceAssessmentRequired: false;
  governanceAssessmentAccessed: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
  providerCalled: false;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  closedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
};

type DirectorAssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  revokedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  zoneId: string;
  zone: {
    id: string;
    isActive: boolean;
    zoneType: { level: number; countryCode: string };
  };
};

type SnapshotRecord = {
  id: string;
  cycleId: string;
  version: number;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sourceHash: string;
  generatedAt: Date;
  metadata: unknown;
};

type StaffReviewRecord = {
  id: string;
  cycleId: string;
  snapshotId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string | null;
  stage: number;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

type CountResult = { count: number };

export type HeadteacherStaffFeedbackReviewTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<DirectorAssignmentRecord[]>;
  };
  appraisalAggregateSnapshot: {
    findMany(args: unknown): Promise<SnapshotRecord[]>;
  };
  appraisalStaffFeedbackReview: {
    findUnique(args: unknown): Promise<StaffReviewRecord | null>;
    findMany(args: unknown): Promise<StaffReviewRecord[]>;
    create(args: unknown): Promise<StaffReviewRecord>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherStaffFeedbackReviewDatabase =
  HeadteacherStaffFeedbackReviewTransactionClient & {
    $transaction<T>(
      operation: (
        tx: HeadteacherStaffFeedbackReviewTransactionClient,
      ) => Promise<T>,
      options?: {
        isolationLevel?: Prisma.TransactionIsolationLevel | string;
        maxWait?: number;
        timeout?: number;
      },
    ): Promise<T>;
  };

export class HeadteacherStaffFeedbackReviewError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherStaffFeedbackReviewError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  status: true,
  closedAt: true,
  cancelledAt: true,
  metadata: true,
} as const;

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  tenantId: true,
  status: true,
  role: { select: { name: true } },
  tenant: { select: { id: true, status: true } },
} as const;

const ASSIGNMENT_SELECT = {
  id: true,
  userId: true,
  role: true,
  status: true,
  revokedAt: true,
  startsAt: true,
  endsAt: true,
  zoneId: true,
  zone: {
    select: {
      id: true,
      isActive: true,
      zoneType: { select: { level: true, countryCode: true } },
    },
  },
} as const;

const SNAPSHOT_SELECT = {
  id: true,
  cycleId: true,
  version: true,
  eligibleResponses: true,
  finalizedResponses: true,
  expiredResponses: true,
  minimumResponses: true,
  releaseEligible: true,
  overallPercentage: true,
  sourceHash: true,
  generatedAt: true,
  metadata: true,
} as const;

const REVIEW_SELECT = {
  id: true,
  cycleId: true,
  snapshotId: true,
  reviewerUserId: true,
  reviewerAssignmentId: true,
  stage: true,
  decision: true,
  note: true,
  decidedAt: true,
  metadata: true,
  createdAt: true,
} as const;

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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherStaffFeedbackReviewError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assignmentIsActive(
  assignment: DirectorAssignmentRecord,
  scopeZoneId: string,
  now: Date,
) {
  if (
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== scopeZoneId ||
    assignment.zone.id !== scopeZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !== 2
  ) {
    return false;
  }
  if (assignment.startsAt && assignment.startsAt.getTime() > now.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function resolveDirectorAssignment(input: {
  actorUserId: string;
  scopeZoneId: string;
  assignments: DirectorAssignmentRecord[];
  now: Date;
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actorUserId &&
      assignmentIsActive(assignment, input.scopeZoneId, input.now),
  );
  if (matches.length !== 1) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_ASSIGNMENT_INVALID", 403, {
      activeAssignments: matches.length,
    });
  }
  return matches[0];
}

function assertCycle(cycle: CycleRecord) {
  const workflow = clean(objectValue(cycle.metadata).workflow);
  const status = normalized(cycle.status);
  if (
    workflow !== HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    !clean(cycle.targetTenantId) ||
    !cycle.closedAt ||
    cycle.cancelledAt ||
    !HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.allowedCarrierCycleStatuses.includes(
      status as (typeof HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.allowedCarrierCycleStatuses)[number],
    )
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_CYCLE_NOT_READY", 409, {
      cycleStatus: status,
    });
  }
}

function assertTargetMembership(
  cycle: CycleRecord,
  membership: MembershipRecord | null,
) {
  if (
    !membership ||
    membership.userId !== cycle.targetUserId ||
    membership.tenantId !== cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    membership.tenant.id !== cycle.targetTenantId ||
    normalized(membership.tenant.status) !== "ACTIVE"
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_TARGET_INACTIVE", 409);
  }
}

function snapshotMetadataIsSafe(snapshot: SnapshotRecord) {
  const root = objectValue(snapshot.metadata);
  const privacy = objectValue(root.privacy);
  const sourceIntegrity = objectValue(root.sourceIntegrity);
  return (
    clean(root.workflow) === HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow &&
    Number(root.aggregateSchemaVersion) === 1 &&
    normalized(root.readiness) === "READY" &&
    privacy.respondentIdentitiesIncluded === false &&
    privacy.individualScoresIncluded === false &&
    privacy.responseHashesIncluded === false &&
    privacy.submissionTimestampsIncluded === false &&
    privacy.participantListIncluded === false &&
    sourceIntegrity.finalizedResponsesOnly === true &&
    sourceIntegrity.finalizedResponseHashesVerified === true &&
    sourceIntegrity.storedCalculationsRecomputed === true &&
    Number(sourceIntegrity.immutableSnapshotVersion) === 1
  );
}

function resolveSnapshot(cycleId: string, snapshots: SnapshotRecord[]) {
  if (snapshots.length !== 1) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_SNAPSHOT_COUNT_INVALID", 409, {
      snapshots: snapshots.length,
    });
  }
  const snapshot = snapshots[0];
  if (
    snapshot.cycleId !== cycleId ||
    snapshot.version !== HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.requiredSnapshotVersion ||
    snapshot.minimumResponses !== 1 ||
    snapshot.finalizedResponses < 1 ||
    snapshot.releaseEligible !== true ||
    typeof snapshot.overallPercentage !== "number" ||
    !isSha256(snapshot.sourceHash) ||
    Number.isNaN(snapshot.generatedAt.getTime()) ||
    !snapshotMetadataIsSafe(snapshot)
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_SNAPSHOT_INVALID", 409);
  }
  return snapshot;
}

function reviewEvidencePayload(input: {
  cycle: CycleRecord;
  snapshot: SnapshotRecord;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  stage: number;
}) {
  return {
    schemaVersion: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.evidenceStream,
    cycleId: input.cycle.id,
    reviewerUserId: input.reviewerUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    reviewStage: input.stage,
    staffFeedback: {
      snapshotId: input.snapshot.id,
      snapshotVersion: input.snapshot.version,
      sourceHash: input.snapshot.sourceHash.toLowerCase(),
      finalizedResponses: input.snapshot.finalizedResponses,
      minimumResponses: input.snapshot.minimumResponses,
    },
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    carrierCycleStatusMutationPerformed: false,
  };
}

function newReviewMetadata(input: {
  cycle: CycleRecord;
  snapshot: SnapshotRecord;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  stage: number;
  continuedFromReviewId?: string | null;
  continuedFromDecision?: "RETURNED" | "HELD" | null;
}) {
  const evidence = reviewEvidencePayload(input);
  return {
    ...evidence,
    reviewEvidenceHash: hashJson(evidence),
    continuedFromReviewId: input.continuedFromReviewId ?? null,
    continuedFromDecision: input.continuedFromDecision ?? null,
    providerCalled: false,
  };
}

function reviewAnchors(review: StaffReviewRecord) {
  const metadata = objectValue(review.metadata);
  const staff = objectValue(metadata.staffFeedback);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();
  const payload = {
    schemaVersion: Number(metadata.schemaVersion),
    workflow: clean(metadata.workflow),
    evidenceStream: clean(metadata.evidenceStream),
    cycleId: review.cycleId,
    reviewerUserId: review.reviewerUserId,
    reviewerAssignmentId: clean(review.reviewerAssignmentId),
    reviewStage: review.stage,
    staffFeedback: {
      snapshotId: clean(staff.snapshotId),
      snapshotVersion: Number(staff.snapshotVersion),
      sourceHash: clean(staff.sourceHash).toLowerCase(),
      finalizedResponses: Number(staff.finalizedResponses),
      minimumResponses: Number(staff.minimumResponses),
    },
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    carrierCycleStatusMutationPerformed: false,
  };
  if (
    payload.schemaVersion !== 1 ||
    payload.workflow !== HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow ||
    payload.evidenceStream !== HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.evidenceStream ||
    payload.staffFeedback.snapshotId !== review.snapshotId ||
    payload.staffFeedback.snapshotVersion !== 1 ||
    payload.staffFeedback.finalizedResponses < 1 ||
    payload.staffFeedback.minimumResponses !== 1 ||
    !isSha256(payload.staffFeedback.sourceHash) ||
    !payload.reviewerAssignmentId ||
    metadata.governanceAssessmentRequired !== false ||
    metadata.governanceAssessmentAccessed !== false ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.carrierCycleStatusMutationPerformed !== false ||
    reviewEvidenceHash !== hashJson(payload)
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_EVIDENCE_DRIFT", 409);
  }
  return {
    reviewEvidenceHash,
    snapshotId: payload.staffFeedback.snapshotId,
    staffSourceHash: payload.staffFeedback.sourceHash,
  };
}

function normalizeDecision(value: unknown): HeadteacherStaffFeedbackReviewDecision {
  const decision = normalized(value);
  if (
    !HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.allowedDecisions.includes(
      decision as HeadteacherStaffFeedbackReviewDecision,
    )
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_DECISION_INVALID", 400, {
      decision,
    });
  }
  return decision as HeadteacherStaffFeedbackReviewDecision;
}

function normalizeDecisionNote(
  decision: HeadteacherStaffFeedbackReviewDecision,
  value: unknown,
) {
  const note = clean(value);
  if (note.length > HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.maximumNoteLength) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_NOTE_TOO_LONG", 400);
  }
  if (
    decision !== "RELEASE" &&
    note.length < HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.minimumReasonLength
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_REASON_REQUIRED", 400);
  }
  return note;
}

function decisionRequestHash(input: {
  cycleId: string;
  review: StaffReviewRecord;
  decision: HeadteacherStaffFeedbackReviewDecision;
  note: string;
  assignmentId: string;
  reviewEvidenceHash: string;
  snapshotId: string;
  staffSourceHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.evidenceStream,
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewerUserId: input.review.reviewerUserId,
    reviewerAssignmentId: input.assignmentId,
    reviewEvidenceHash: input.reviewEvidenceHash,
    snapshotId: input.snapshotId,
    staffSourceHash: input.staffSourceHash,
    decision: input.decision,
    note: input.note || null,
    carrierCycleStatusMutationPerformed: false,
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    providerCalled: false,
  });
}

function releaseProofPayload(input: {
  cycleId: string;
  review: StaffReviewRecord;
  assignmentId: string;
  releasedAt: Date;
  note: string;
  reviewEvidenceHash: string;
  snapshotId: string;
  staffSourceHash: string;
  decisionRequestHash: string;
}) {
  return {
    proofSchemaVersion: 1,
    workflow: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.evidenceStream,
    releaseMode: "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "ACCEPTED",
    snapshotId: input.snapshotId,
    staffSourceHash: input.staffSourceHash,
    reviewEvidenceHash: input.reviewEvidenceHash,
    decisionRequestHash: input.decisionRequestHash,
    reviewerUserId: input.review.reviewerUserId,
    reviewerAssignmentId: input.assignmentId,
    releasedAt: input.releasedAt.toISOString(),
    releaseNoteIncluded: Boolean(input.note),
    releaseNoteHash: input.note ? hashJson({ note: input.note }) : null,
    carrierCycleStatusMutationPerformed: false,
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    providerCalled: false,
  } as const;
}

function releaseProofFromReview(review: StaffReviewRecord) {
  return objectValue(objectValue(review.metadata).staffFeedbackRelease);
}

function reviewStateFromRecords(input: {
  cycleId: string;
  snapshotId: string;
  reviews: StaffReviewRecord[];
}): HeadteacherStaffFeedbackReviewState {
  const ordered = [...input.reviews].sort((left, right) => left.stage - right.stage);
  const latest = ordered.at(-1) ?? null;
  if (!latest) {
    return {
      cycleId: input.cycleId,
      snapshotId: input.snapshotId,
      lifecycleState: "READY_TO_START",
      latestReviewId: null,
      latestStage: null,
      latestDecision: null,
      canStartReview: true,
      canDecide: false,
      releasedAt: null,
      releaseProofHash: null,
      governanceAssessmentRequired: false,
      carrierCycleStatusMutationPerformed: false,
    };
  }
  const decision = normalized(latest.decision) as
    | "PENDING"
    | "RETURNED"
    | "HELD"
    | "ACCEPTED";
  const release = releaseProofFromReview(latest);
  const lifecycleState =
    decision === "ACCEPTED"
      ? "RELEASED"
      : decision === "RETURNED"
        ? "RETURNED_TO_QUEUE"
        : decision === "HELD"
          ? "HELD_CONTINUATION"
          : "PENDING_DECISION";
  return {
    cycleId: input.cycleId,
    snapshotId: input.snapshotId,
    lifecycleState,
    latestReviewId: latest.id,
    latestStage: latest.stage,
    latestDecision: decision,
    canStartReview: decision === "RETURNED",
    canDecide: decision === "PENDING",
    releasedAt:
      decision === "ACCEPTED" ? clean(release.releasedAt) || null : null,
    releaseProofHash:
      decision === "ACCEPTED"
        ? clean(release.releaseProofHash).toLowerCase() || null
        : null,
    governanceAssessmentRequired: false,
    carrierCycleStatusMutationPerformed: false,
  };
}

function assertReviewChain(reviews: StaffReviewRecord[]) {
  const ordered = [...reviews].sort((left, right) => left.stage - right.stage);
  ordered.forEach((review, index) => {
    if (review.stage !== index + 1) {
      fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_STAGE_DRIFT", 409);
    }
    if (index < ordered.length - 1) {
      const decision = normalized(review.decision);
      if (decision !== "HELD" && decision !== "RETURNED") {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_CHAIN_DRIFT", 409);
      }
    }
  });
}

function isUniqueViolation(error: unknown) {
  return clean((error as { code?: unknown })?.code) === "P2002";
}

async function loadBoundary(
  tx: HeadteacherStaffFeedbackReviewTransactionClient,
  input: {
    actorUserId: string;
    cycleId: string;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    now: Date;
  },
) {
  const cycle = await tx.appraisalCycle.findUnique({
    where: { id: input.cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_CYCLE_NOT_FOUND", 404);
  }
  assertCycle(cycle);
  const targetTenantId = requireIdentifier(cycle.targetTenantId, "targetTenantId");
  assertHeadteacherFeedbackTargetInGovernanceScope({
    governanceScope: input.governanceScope,
    targetTenantId,
  });

  const membership = await tx.membership.findFirst({
    where: {
      userId: cycle.targetUserId,
      tenantId: targetTenantId,
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
      tenant: { status: "ACTIVE" },
    },
    select: MEMBERSHIP_SELECT,
  });
  assertTargetMembership(cycle, membership);

  const assignments = await tx.governanceOfficerAssignment.findMany({
    where: { userId: input.actorUserId },
    select: ASSIGNMENT_SELECT,
  });
  const assignment = resolveDirectorAssignment({
    actorUserId: input.actorUserId,
    scopeZoneId: cycle.scopeZoneId,
    assignments,
    now: input.now,
  });

  const snapshots = await tx.appraisalAggregateSnapshot.findMany({
    where: { cycleId: input.cycleId },
    orderBy: { version: "desc" },
    take: 2,
    select: SNAPSHOT_SELECT,
  });
  const snapshot = resolveSnapshot(input.cycleId, snapshots);

  return { cycle, targetTenantId, assignment, snapshot };
}

function prepareActor(input: {
  actorUserId: string;
  actorRoleName: unknown;
  confirm: boolean;
  now?: Date;
}) {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_TIME_INVALID", 400);
  }
  if (input.confirm !== true) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_CONFIRMATION_REQUIRED", 400);
  }
  if (actorRole !== HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.reviewerRole) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.requiredCapability,
  );
  return { actorUserId, actorRole, now };
}

export async function startHeadteacherStaffFeedbackReview(
  input: StartHeadteacherStaffFeedbackReviewInput,
): Promise<StartHeadteacherStaffFeedbackReviewResult> {
  const prepared = prepareActor(input);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const database =
    input.database ?? (prisma as unknown as HeadteacherStaffFeedbackReviewDatabase);

  try {
    return await database.$transaction(
      async (tx) => {
        const boundary = await loadBoundary(tx, {
          actorUserId: prepared.actorUserId,
          cycleId,
          governanceScope: input.governanceScope,
          now: prepared.now,
        });
        const reviews = await tx.appraisalStaffFeedbackReview.findMany({
          where: { cycleId },
          orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
          select: REVIEW_SELECT,
        });
        assertReviewChain(reviews);
        const state = reviewStateFromRecords({
          cycleId,
          snapshotId: boundary.snapshot.id,
          reviews,
        });

        if (state.lifecycleState === "RELEASED") {
          fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_ALREADY_RELEASED", 409);
        }
        if (state.canDecide && state.latestReviewId && state.latestStage) {
          const current = reviews.at(-1)!;
          const anchors = reviewAnchors(current);
          return {
            outcome: "EXISTING_PENDING" as const,
            state,
            reviewId: current.id,
            stage: current.stage,
            snapshotId: current.snapshotId,
            reviewEvidenceHash: anchors.reviewEvidenceHash,
            providerCalled: false as const,
          };
        }
        if (!state.canStartReview) {
          fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_START_NOT_ALLOWED", 409, {
            lifecycleState: state.lifecycleState,
          });
        }

        const stage = (reviews.at(-1)?.stage ?? 0) + 1;
        const prior = reviews.at(-1) ?? null;
        const metadata = newReviewMetadata({
          cycle: boundary.cycle,
          snapshot: boundary.snapshot,
          reviewerUserId: prepared.actorUserId,
          reviewerAssignmentId: boundary.assignment.id,
          stage,
          continuedFromReviewId: prior?.id ?? null,
          continuedFromDecision:
            normalized(prior?.decision) === "RETURNED" ? "RETURNED" : null,
        });
        const created = await tx.appraisalStaffFeedbackReview.create({
          data: {
            cycleId,
            snapshotId: boundary.snapshot.id,
            reviewerUserId: prepared.actorUserId,
            reviewerAssignmentId: boundary.assignment.id,
            stage,
            decision: "PENDING",
            note: null,
            decidedAt: null,
            metadata: jsonValue(metadata),
          },
          select: REVIEW_SELECT,
        });

        await tx.auditLog.create({
          data: {
            tenantId: boundary.targetTenantId,
            userId: prepared.actorUserId,
            action: "HEADTEACHER_STAFF_FEEDBACK_REVIEW_STARTED",
            resource: "AppraisalStaffFeedbackReview",
            resourceId: created.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              cycleId,
              snapshotId: boundary.snapshot.id,
              reviewId: created.id,
              reviewStage: created.stage,
              workflow: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.workflow,
              governanceAssessmentRequired: false,
              governanceAssessmentAccessed: false,
              respondentIdentitiesAccessed: false,
              individualStaffResponsesAccessed: false,
              carrierCycleStatusMutationPerformed: false,
              providerCalled: false,
            },
          },
        });

        const anchors = reviewAnchors(created);
        return {
          outcome: "STARTED" as const,
          state: reviewStateFromRecords({
            cycleId,
            snapshotId: boundary.snapshot.id,
            reviews: [...reviews, created],
          }),
          reviewId: created.id,
          stage: created.stage,
          snapshotId: created.snapshotId,
          reviewEvidenceHash: anchors.reviewEvidenceHash,
          providerCalled: false as const,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.transactionMaxWaitMs,
        timeout: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.transactionTimeoutMs,
      },
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const reviews = await database.appraisalStaffFeedbackReview.findMany({
      where: { cycleId },
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      select: REVIEW_SELECT,
    });
    assertReviewChain(reviews);
    const current = reviews.at(-1);
    if (!current || normalized(current.decision) !== "PENDING") throw error;
    const anchors = reviewAnchors(current);
    return {
      outcome: "EXISTING_PENDING",
      state: reviewStateFromRecords({
        cycleId,
        snapshotId: current.snapshotId,
        reviews,
      }),
      reviewId: current.id,
      stage: current.stage,
      snapshotId: current.snapshotId,
      reviewEvidenceHash: anchors.reviewEvidenceHash,
      providerCalled: false,
    };
  }
}

function existingDecisionResult(input: {
  review: StaffReviewRecord;
  reviews: StaffReviewRecord[];
  decision: HeadteacherStaffFeedbackReviewDecision;
  note: string;
  assignmentId: string;
  actorUserId: string;
}): ExecuteHeadteacherStaffFeedbackReviewDecisionResult | null {
  const currentDecision = normalized(input.review.decision);
  const expectedDecision =
    input.decision === "RETURN"
      ? "RETURNED"
      : input.decision === "HOLD"
        ? "HELD"
        : "ACCEPTED";
  if (currentDecision === "PENDING") return null;
  if (
    currentDecision !== expectedDecision ||
    clean(input.review.note) !== input.note ||
    !input.review.decidedAt ||
    input.review.reviewerUserId !== input.actorUserId ||
    input.review.reviewerAssignmentId !== input.assignmentId
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_EXISTING_DECISION_DRIFT", 409);
  }
  const anchors = reviewAnchors(input.review);
  const metadata = objectValue(input.review.metadata);
  const expectedRequestHash = decisionRequestHash({
    cycleId: input.review.cycleId,
    review: input.review,
    decision: input.decision,
    note: input.note,
    assignmentId: input.assignmentId,
    reviewEvidenceHash: anchors.reviewEvidenceHash,
    snapshotId: anchors.snapshotId,
    staffSourceHash: anchors.staffSourceHash,
  });
  if (clean(metadata.decisionRequestHash).toLowerCase() !== expectedRequestHash) {
    fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_EXISTING_HASH_DRIFT", 409);
  }

  let nextReview: StaffReviewRecord | null = null;
  if (input.decision === "HOLD") {
    nextReview = input.reviews.find(
      (candidate) => candidate.stage === input.review.stage + 1,
    ) ?? null;
    if (
      !nextReview ||
      normalized(nextReview.decision) !== "PENDING" ||
      nextReview.snapshotId !== input.review.snapshotId
    ) {
      fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_HOLD_CONTINUATION_DRIFT", 409);
    }
  }

  let releaseProofHash: string | null = null;
  let releasedAt: string | null = null;
  if (input.decision === "RELEASE") {
    const release = releaseProofFromReview(input.review);
    releaseProofHash = clean(release.releaseProofHash).toLowerCase();
    releasedAt = clean(release.releasedAt);
    const payload = { ...release };
    delete payload.releaseProofHash;
    if (
      !isSha256(releaseProofHash) ||
      !releasedAt ||
      hashJson(payload) !== releaseProofHash
    ) {
      fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_RELEASE_PROOF_DRIFT", 409);
    }
  }

  return {
    outcome:
      input.decision === "RETURN"
        ? "EXISTING_RETURNED"
        : input.decision === "HOLD"
          ? "EXISTING_HELD"
          : "EXISTING_RELEASED",
    cycleId: input.review.cycleId,
    sourceReviewId: input.review.id,
    sourceReviewStage: input.review.stage,
    sourceReviewDecision: expectedDecision,
    snapshotId: anchors.snapshotId,
    staffSourceHash: anchors.staffSourceHash,
    reviewEvidenceHash: anchors.reviewEvidenceHash,
    decisionRequestHash: expectedRequestHash,
    nextReviewId: nextReview?.id ?? null,
    nextReviewStage: nextReview?.stage ?? null,
    releaseProofHash,
    releasedAt,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    carrierCycleStatusMutationPerformed: false,
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    providerCalled: false,
  };
}

export async function executeHeadteacherStaffFeedbackReviewDecision(
  input: ExecuteHeadteacherStaffFeedbackReviewDecisionInput,
): Promise<ExecuteHeadteacherStaffFeedbackReviewDecisionResult> {
  const prepared = prepareActor(input);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  const decision = normalizeDecision(input.decision);
  const note = normalizeDecisionNote(decision, input.note);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const database =
    input.database ?? (prisma as unknown as HeadteacherStaffFeedbackReviewDatabase);

  return database.$transaction(
    async (tx) => {
      const boundary = await loadBoundary(tx, {
        actorUserId: prepared.actorUserId,
        cycleId,
        governanceScope: input.governanceScope,
        now: prepared.now,
      });
      const reviews = await tx.appraisalStaffFeedbackReview.findMany({
        where: { cycleId },
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
        select: REVIEW_SELECT,
      });
      assertReviewChain(reviews);
      const review = reviews.find((candidate) => candidate.id === reviewId);
      if (!review) {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_NOT_FOUND", 404);
      }
      if (
        review.cycleId !== cycleId ||
        review.snapshotId !== boundary.snapshot.id ||
        review.reviewerUserId !== prepared.actorUserId ||
        review.reviewerAssignmentId !== boundary.assignment.id
      ) {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_SCOPE_DRIFT", 409);
      }
      if (reviews.at(-1)?.id !== review.id) {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_NOT_CURRENT_STAGE", 409);
      }

      const existing = existingDecisionResult({
        review,
        reviews,
        decision,
        note,
        assignmentId: boundary.assignment.id,
        actorUserId: prepared.actorUserId,
      });
      if (existing) return existing;

      const anchors = reviewAnchors(review);
      if (
        anchors.snapshotId !== boundary.snapshot.id ||
        anchors.staffSourceHash !== boundary.snapshot.sourceHash.toLowerCase()
      ) {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_SNAPSHOT_DRIFT", 409);
      }
      const requestHash = decisionRequestHash({
        cycleId,
        review,
        decision,
        note,
        assignmentId: boundary.assignment.id,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        snapshotId: anchors.snapshotId,
        staffSourceHash: anchors.staffSourceHash,
      });

      const nextDecision =
        decision === "RETURN"
          ? "RETURNED"
          : decision === "HOLD"
            ? "HELD"
            : "ACCEPTED";
      let nextReview: StaffReviewRecord | null = null;
      let releaseProofHash: string | null = null;
      let releaseProof: Record<string, unknown> | null = null;

      if (decision === "RELEASE") {
        const proofWithoutHash = releaseProofPayload({
          cycleId,
          review,
          assignmentId: boundary.assignment.id,
          releasedAt: prepared.now,
          note,
          reviewEvidenceHash: anchors.reviewEvidenceHash,
          snapshotId: anchors.snapshotId,
          staffSourceHash: anchors.staffSourceHash,
          decisionRequestHash: requestHash,
        });
        releaseProofHash = hashJson(proofWithoutHash);
        releaseProof = {
          ...proofWithoutHash,
          releaseProofHash,
        };
      }

      const currentMetadata = objectValue(review.metadata);
      const updatedMetadata = {
        ...currentMetadata,
        decisionSchemaVersion: 1,
        decision,
        decisionRequestHash: requestHash,
        decidedAt: prepared.now.toISOString(),
        reasonHash: note ? hashJson({ note }) : null,
        carrierCycleStatusMutationPerformed: false,
        governanceAssessmentRequired: false,
        governanceAssessmentAccessed: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        reviewerMayRewriteScores: false,
        combinedWeightingDefined: false,
        providerCalled: false,
        ...(releaseProof ? { staffFeedbackRelease: releaseProof } : {}),
      };

      const updated = await tx.appraisalStaffFeedbackReview.updateMany({
        where: {
          id: review.id,
          decision: "PENDING",
          decidedAt: null,
        },
        data: {
          decision: nextDecision,
          note: note || null,
          decidedAt: prepared.now,
          metadata: jsonValue(updatedMetadata),
        },
      });
      if (updated.count !== 1) {
        fail("HEADTEACHER_STAFF_FEEDBACK_REVIEW_CONCURRENT_DECISION", 409);
      }

      if (decision === "HOLD") {
        const stage = review.stage + 1;
        const metadata = newReviewMetadata({
          cycle: boundary.cycle,
          snapshot: boundary.snapshot,
          reviewerUserId: prepared.actorUserId,
          reviewerAssignmentId: boundary.assignment.id,
          stage,
          continuedFromReviewId: review.id,
          continuedFromDecision: "HELD",
        });
        nextReview = await tx.appraisalStaffFeedbackReview.create({
          data: {
            cycleId,
            snapshotId: boundary.snapshot.id,
            reviewerUserId: prepared.actorUserId,
            reviewerAssignmentId: boundary.assignment.id,
            stage,
            decision: "PENDING",
            note: null,
            decidedAt: null,
            metadata: jsonValue(metadata),
          },
          select: REVIEW_SELECT,
        });
      }

      const action =
        decision === "RETURN"
          ? "HEADTEACHER_STAFF_FEEDBACK_REVIEW_RETURNED"
          : decision === "HOLD"
            ? "HEADTEACHER_STAFF_FEEDBACK_REVIEW_HELD"
            : "HEADTEACHER_STAFF_FEEDBACK_RELEASED";
      await tx.auditLog.create({
        data: {
          tenantId: boundary.targetTenantId,
          userId: prepared.actorUserId,
          action,
          resource: "AppraisalStaffFeedbackReview",
          resourceId: review.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            cycleId,
            snapshotId: boundary.snapshot.id,
            reviewId: review.id,
            reviewStage: review.stage,
            decision,
            decisionRequestHash: requestHash,
            releaseProofHash,
            nextReviewId: nextReview?.id ?? null,
            nextReviewStage: nextReview?.stage ?? null,
            noteTextIncluded: false,
            scoreValuesIncluded: false,
            governanceAssessmentRequired: false,
            governanceAssessmentAccessed: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            carrierCycleStatusMutationPerformed: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome:
          decision === "RETURN"
            ? "RETURNED"
            : decision === "HOLD"
              ? "HELD"
              : "RELEASED",
        cycleId,
        sourceReviewId: review.id,
        sourceReviewStage: review.stage,
        sourceReviewDecision: nextDecision,
        snapshotId: anchors.snapshotId,
        staffSourceHash: anchors.staffSourceHash,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        decisionRequestHash: requestHash,
        nextReviewId: nextReview?.id ?? null,
        nextReviewStage: nextReview?.stage ?? null,
        releaseProofHash,
        releasedAt: decision === "RELEASE" ? prepared.now.toISOString() : null,
        reviewerUserId: prepared.actorUserId,
        reviewerAssignmentId: boundary.assignment.id,
        carrierCycleStatusMutationPerformed: false,
        governanceAssessmentRequired: false,
        governanceAssessmentAccessed: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_STAFF_FEEDBACK_REVIEW_POLICY.transactionTimeoutMs,
    },
  );
}
