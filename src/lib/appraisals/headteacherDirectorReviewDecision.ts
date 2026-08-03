//src/lib/appraisals/headteacherDirectorReviewDecision.ts
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_DIRECTOR_REVIEW_POLICY,
} from "@/lib/appraisals/headteacherDirectorReview";
import {
  HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY,
  planHeadteacherDirectorReviewDecision,
  readHeadteacherDirectorReviewPackage,
  type HeadteacherDirectorReviewDecisionPlan,
  type HeadteacherDirectorReviewPackage,
  type HeadteacherDirectorReviewPackageDatabase,
} from "@/lib/appraisals/headteacherDirectorReviewPackage";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  allowedDecisions: ["RETURN", "HOLD"] as const,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredCurrentReviewDecision: "PENDING",
  returnReviewDecision: "RETURNED",
  holdReviewDecision: "HELD",
  returnAssessmentFromStatus: "FINALIZED",
  returnAssessmentToStatus: "RETURNED",
  holdAssessmentStatus: "FINALIZED",
  minimumReasonLength: 3,
  maximumReasonLength:
    HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.maximumNoteLength,
  holdCreatesExactlyOneNextStage: true,
  holdNextReviewDecision: "PENDING",
  releaseAllowed: false,
  cycleStatusChanges: false,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  providerCallsAllowed: false,
  reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

const RETURNED_AUDIT_ACTION =
  "HEADTEACHER_APPRAISAL_DIRECTOR_RETURNED";
const HELD_AUDIT_ACTION = "HEADTEACHER_APPRAISAL_DIRECTOR_HELD";

export type HeadteacherDirectorReturnHoldDecision =
  (typeof HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.allowedDecisions)[number];

export type HeadteacherDirectorReturnHoldRequestMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type HeadteacherDirectorReturnHoldDependencies = {
  readReviewPackage: typeof readHeadteacherDirectorReviewPackage;
  planDecision: typeof planHeadteacherDirectorReviewDecision;
};

export type ExecuteHeadteacherDirectorReturnHoldInput =
  HeadteacherDirectorReturnHoldRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    cycleId: string;
    reviewId: string;
    decision: unknown;
    note: unknown;
    confirm: boolean;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    now?: Date;
    database?: HeadteacherDirectorReturnHoldDatabase;
    dependencies?: HeadteacherDirectorReturnHoldDependencies;
  };

export type ExecuteHeadteacherDirectorReturnHoldResult = {
  outcome:
    | "RETURNED"
    | "HELD"
    | "EXISTING_RETURNED"
    | "EXISTING_HELD";
  cycleId: string;
  cycleStatus: "UNDER_REVIEW";
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "HELD";
  assessmentId: string;
  assessmentStatus: "RETURNED" | "FINALIZED";
  nextReviewId: string | null;
  nextReviewStage: number | null;
  nextReviewDecision: "PENDING" | null;
  revisionRequired: boolean;
  reviewEvidenceHash: string;
  decisionContractHash: string;
  decisionRequestHash: string;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  decidedAt: string;
  releasePerformed: false;
  scoreMutationPerformed: false;
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
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
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

type AssessmentRecord = {
  id: string;
  cycleId: string;
  status: string;
  revision: number;
  assessorUserId: string;
  assessmentHash: string | null;
  metadata: unknown;
};

type ReviewRecord = {
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

type CountResult = { count: number };

export type HeadteacherDirectorReturnHoldTransactionClient =
  HeadteacherDirectorReviewPackageDatabase & {
    appraisalCycle: HeadteacherDirectorReviewPackageDatabase["appraisalCycle"] & {
      updateMany(args: unknown): Promise<CountResult>;
    };
    appraisalAssessment: HeadteacherDirectorReviewPackageDatabase["appraisalAssessment"] & {
      findUnique(args: unknown): Promise<AssessmentRecord | null>;
      updateMany(args: unknown): Promise<CountResult>;
    };
    appraisalReview: HeadteacherDirectorReviewPackageDatabase["appraisalReview"] & {
      findUnique(args: unknown): Promise<ReviewRecord | null>;
      findMany(args: unknown): Promise<ReviewRecord[]>;
      updateMany(args: unknown): Promise<CountResult>;
      create(args: unknown): Promise<ReviewRecord>;
    };
    auditLog: {
      create(args: unknown): Promise<unknown>;
    };
  };

export type HeadteacherDirectorReturnHoldDatabase = {
  appraisalReview: {
    findUnique(args: unknown): Promise<Pick<ReviewRecord, "id" | "decision"> | null>;
  };
  $transaction<T>(
    operation: (
      tx: HeadteacherDirectorReturnHoldTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export class HeadteacherDirectorReturnHoldError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorReturnHoldError";
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
  reviewStartedAt: true,
  releasedAt: true,
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

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  status: true,
  revision: true,
  assessorUserId: true,
  assessmentHash: true,
  metadata: true,
} as const;

const REVIEW_SELECT = {
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

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherDirectorReturnHoldError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function normalizeDecision(value: unknown): HeadteacherDirectorReturnHoldDecision {
  const decision = normalized(value);
  if (
    !HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.allowedDecisions.includes(
      decision as HeadteacherDirectorReturnHoldDecision,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_DECISION_FORBIDDEN", 400, {
      decision,
    });
  }
  return decision as HeadteacherDirectorReturnHoldDecision;
}

function normalizeReason(value: unknown) {
  const reason = clean(value);
  if (
    reason.length < HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.minimumReasonLength
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REASON_REQUIRED", 400);
  }
  if (
    reason.length > HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.maximumReasonLength
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REASON_TOO_LONG", 400);
  }
  return reason;
}

function assertCycleBoundary(cycle: CycleRecord) {
  const metadata = objectValue(cycle.metadata);
  if (
    normalized(cycle.status) !== "UNDER_REVIEW" ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt ||
    cycle.cancelledAt ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    clean(metadata.workflow) !== HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.workflow ||
    !clean(cycle.targetTenantId)
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CYCLE_NOT_UNDER_REVIEW", 409, {
      cycleStatus: normalized(cycle.status),
    });
  }
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
  const active = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actorUserId &&
      assignmentIsActive(assignment, input.scopeZoneId, input.now),
  );
  if (active.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_ASSIGNMENT_INVALID", 403, {
      activeAssignments: active.length,
    });
  }
  return active[0];
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
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_TARGET_INACTIVE", 409);
  }
}

function reviewEvidenceAnchors(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const evidence = objectValue(metadata.evidence);
  const staffFeedback = objectValue(evidence.staffFeedback);
  const supervisoryAssessment = objectValue(evidence.supervisoryAssessment);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();
  const snapshotId = clean(staffFeedback.snapshotId);
  const staffSourceHash = clean(staffFeedback.sourceHash).toLowerCase();
  const assessmentHash = clean(supervisoryAssessment.assessmentHash).toLowerCase();
  if (
    !isSha256(reviewEvidenceHash) ||
    !snapshotId ||
    !isSha256(staffSourceHash) ||
    clean(supervisoryAssessment.assessmentId) !== review.assessmentId ||
    !isSha256(assessmentHash) ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateEvidenceStreams !== true ||
    metadata.combinedWeightingDefined !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_EVIDENCE_DRIFT", 409);
  }
  return {
    evidence,
    reviewEvidenceHash,
    snapshotId,
    staffSourceHash,
    assessmentHash,
  };
}

function decisionRequestHash(input: {
  cycleId: string;
  review: ReviewRecord;
  reviewerAssignmentId: string;
  decision: HeadteacherDirectorReturnHoldDecision;
  note: string;
  reviewEvidenceHash: string;
  snapshotId: string;
  assessmentHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.workflow,
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.review.assessmentId,
    reviewerUserId: input.review.reviewerUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    reviewEvidenceHash: input.reviewEvidenceHash,
    snapshotId: input.snapshotId,
    assessmentHash: input.assessmentHash,
    decision: input.decision,
    note: input.note,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
    releaseAllowed: false,
  });
}

function resultFromExisting(input: {
  decision: HeadteacherDirectorReturnHoldDecision;
  cycle: CycleRecord;
  review: ReviewRecord;
  assessment: AssessmentRecord;
  allReviews: ReviewRecord[];
  actorUserId: string;
  assignmentId: string;
  note: string;
}): ExecuteHeadteacherDirectorReturnHoldResult {
  const actualDecision = normalized(input.review.decision);
  const expectedDecision = input.decision === "RETURN" ? "RETURNED" : "HELD";
  if (
    actualDecision !== expectedDecision ||
    clean(input.review.note) !== input.note ||
    !input.review.decidedAt ||
    input.review.reviewerUserId !== input.actorUserId ||
    input.review.reviewerAssignmentId !== input.assignmentId
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_EXISTING_DECISION_DRIFT", 409);
  }
  const anchors = reviewEvidenceAnchors(input.review);
  const metadata = objectValue(input.review.metadata);
  const expectedRequestHash = decisionRequestHash({
    cycleId: input.cycle.id,
    review: input.review,
    reviewerAssignmentId: input.assignmentId,
    decision: input.decision,
    note: input.note,
    reviewEvidenceHash: anchors.reviewEvidenceHash,
    snapshotId: anchors.snapshotId,
    assessmentHash: anchors.assessmentHash,
  });
  if (
    clean(metadata.decisionRequestHash).toLowerCase() !== expectedRequestHash ||
    !isSha256(metadata.decisionContractHash) ||
    metadata.releasePerformed !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_EXISTING_METADATA_DRIFT", 409);
  }

  const laterReviews = input.allReviews.filter(
    (review) => review.stage > input.review.stage,
  );
  if (input.decision === "RETURN") {
    if (
      normalized(input.assessment.status) !== "RETURNED" ||
      laterReviews.length !== 0
    ) {
      fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_EXISTING_RETURN_DRIFT", 409);
    }
    return {
      outcome: "EXISTING_RETURNED",
      cycleId: input.cycle.id,
      cycleStatus: "UNDER_REVIEW",
      sourceReviewId: input.review.id,
      sourceReviewStage: input.review.stage,
      sourceReviewDecision: "RETURNED",
      assessmentId: input.assessment.id,
      assessmentStatus: "RETURNED",
      nextReviewId: null,
      nextReviewStage: null,
      nextReviewDecision: null,
      revisionRequired: true,
      reviewEvidenceHash: anchors.reviewEvidenceHash,
      decisionContractHash: clean(metadata.decisionContractHash).toLowerCase(),
      decisionRequestHash: expectedRequestHash,
      reviewerUserId: input.actorUserId,
      reviewerAssignmentId: input.assignmentId,
      decidedAt: input.review.decidedAt.toISOString(),
      releasePerformed: false,
      scoreMutationPerformed: false,
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      providerCalled: false,
    };
  }

  if (
    normalized(input.assessment.status) !== "FINALIZED" ||
    laterReviews.length !== 1
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_EXISTING_HOLD_DRIFT", 409);
  }
  const nextReview = laterReviews[0];
  const nextMetadata = objectValue(nextReview.metadata);
  if (
    nextReview.stage !== input.review.stage + 1 ||
    normalized(nextReview.decision) !== "PENDING" ||
    clean(nextReview.note) ||
    nextReview.decidedAt ||
    nextReview.cycleId !== input.cycle.id ||
    nextReview.assessmentId !== input.assessment.id ||
    nextReview.reviewerUserId !== input.actorUserId ||
    nextReview.reviewerAssignmentId !== input.assignmentId ||
    clean(nextMetadata.continuedFromReviewId) !== input.review.id ||
    Number(nextMetadata.continuedFromStage) !== input.review.stage ||
    clean(nextMetadata.holdDecisionRequestHash).toLowerCase() !==
      expectedRequestHash ||
    clean(nextMetadata.reviewEvidenceHash).toLowerCase() !==
      anchors.reviewEvidenceHash
  ) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_NEXT_STAGE_DRIFT", 409);
  }

  return {
    outcome: "EXISTING_HELD",
    cycleId: input.cycle.id,
    cycleStatus: "UNDER_REVIEW",
    sourceReviewId: input.review.id,
    sourceReviewStage: input.review.stage,
    sourceReviewDecision: "HELD",
    assessmentId: input.assessment.id,
    assessmentStatus: "FINALIZED",
    nextReviewId: nextReview.id,
    nextReviewStage: nextReview.stage,
    nextReviewDecision: "PENDING",
    revisionRequired: false,
    reviewEvidenceHash: anchors.reviewEvidenceHash,
    decisionContractHash: clean(metadata.decisionContractHash).toLowerCase(),
    decisionRequestHash: expectedRequestHash,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    decidedAt: input.review.decidedAt.toISOString(),
    releasePerformed: false,
    scoreMutationPerformed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    providerCalled: false,
  };
}

function decisionMetadata(input: {
  existingMetadata: unknown;
  decision: HeadteacherDirectorReturnHoldDecision;
  note: string;
  plan: HeadteacherDirectorReviewDecisionPlan;
  decisionRequestHash: string;
  decidedAt: Date;
  nextReviewId: string | null;
  nextReviewStage: number | null;
}) {
  return {
    ...objectValue(input.existingMetadata),
    decisionSchemaVersion:
      HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.schemaVersion,
    decision: input.decision,
    decisionContractHash: input.plan.decisionContractHash,
    decisionRequestHash: input.decisionRequestHash,
    reasonHash: hashJson({ reason: input.note }),
    decidedAt: input.decidedAt.toISOString(),
    nextReviewId: input.nextReviewId,
    nextReviewStage: input.nextReviewStage,
    revisionRequired: input.plan.revisionRequired,
    nextReviewStageRequired: input.plan.nextReviewStageRequired,
    releasePerformed: false,
    scoreMutationPerformed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

function continuedReviewMetadata(input: {
  sourceReview: ReviewRecord;
  plan: HeadteacherDirectorReviewDecisionPlan;
  decisionRequestHash: string;
}) {
  const sourceMetadata = objectValue(input.sourceReview.metadata);
  return {
    schemaVersion: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.workflow,
    reviewStage: input.sourceReview.stage + 1,
    reviewEvidenceHash: clean(sourceMetadata.reviewEvidenceHash).toLowerCase(),
    evidence: sourceMetadata.evidence,
    continuedFromReviewId: input.sourceReview.id,
    continuedFromStage: input.sourceReview.stage,
    priorDecision: "HELD",
    holdDecisionContractHash: input.plan.decisionContractHash,
    holdDecisionRequestHash: input.decisionRequestHash,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

function isUniqueViolation(error: unknown) {
  return clean((error as { code?: unknown })?.code) === "P2002";
}

function isReviewPackageRequired(error: unknown) {
  return (
    clean((error as { code?: unknown })?.code || (error as Error)?.message) ===
    "HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_PACKAGE_REQUIRED"
  );
}

type PreparedReturnHoldRequest = {
  actorUserId: string;
  cycleId: string;
  reviewId: string;
  actorRole: string;
  decision: HeadteacherDirectorReturnHoldDecision;
  note: string;
  now: Date;
  reqId: string;
};

function prepareReturnHoldRequest(
  input: ExecuteHeadteacherDirectorReturnHoldInput,
): PreparedReturnHoldRequest {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  const actorRole = effectiveRole(input.actorRoleName);
  const decision = normalizeDecision(input.decision);
  const note = normalizeReason(input.note);
  const now = input.now ?? new Date();
  const reqId = clean(input.reqId) || randomUUID();

  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CONFIRMATION_REQUIRED", 400);
  }
  if (actorRole !== HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.reviewerRole) {
    fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.requiredCapability,
  );

  return {
    actorUserId,
    cycleId,
    reviewId,
    actorRole,
    decision,
    note,
    now,
    reqId,
  };
}

async function runDecision(
  input: ExecuteHeadteacherDirectorReturnHoldInput,
  database: HeadteacherDirectorReturnHoldDatabase,
  dependencies: HeadteacherDirectorReturnHoldDependencies,
  prepared: PreparedReturnHoldRequest,
  reviewPackage: HeadteacherDirectorReviewPackage | null,
  allowWrite: boolean,
): Promise<ExecuteHeadteacherDirectorReturnHoldResult> {
  const {
    actorUserId,
    cycleId,
    reviewId,
    decision,
    note,
    now,
    reqId,
  } = prepared;

  return database.$transaction(
    async (tx) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: CYCLE_SELECT,
      }) as CycleRecord | null;
      if (!cycle) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CYCLE_NOT_FOUND", 404);
      }
      assertCycleBoundary(cycle);
      const targetTenantId = requireIdentifier(
        cycle.targetTenantId,
        "targetTenantId",
      );
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
      }) as MembershipRecord | null;
      assertTargetMembership(cycle, membership);

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: { userId: actorUserId },
        select: ASSIGNMENT_SELECT,
      }) as DirectorAssignmentRecord[];
      const assignment = resolveDirectorAssignment({
        actorUserId,
        scopeZoneId: cycle.scopeZoneId,
        assignments,
        now,
      });

      const review = await tx.appraisalReview.findUnique({
        where: { id: reviewId },
        select: REVIEW_SELECT,
      });
      if (!review) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_NOT_FOUND", 404);
      }
      if (
        review.cycleId !== cycleId ||
        review.reviewerUserId !== actorUserId ||
        review.reviewerAssignmentId !== assignment.id ||
        !Number.isInteger(review.stage) ||
        review.stage < 1
      ) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_SCOPE_DRIFT", 409);
      }

      const assessment = await tx.appraisalAssessment.findUnique({
        where: { id: review.assessmentId },
        select: ASSESSMENT_SELECT,
      });
      if (!assessment || assessment.cycleId !== cycleId) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_ASSESSMENT_NOT_FOUND", 409);
      }
      const allReviews = await tx.appraisalReview.findMany({
        where: { assessmentId: assessment.id },
        select: REVIEW_SELECT,
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      }) as ReviewRecord[];

      if (normalized(review.decision) !== "PENDING") {
        return resultFromExisting({
          decision,
          cycle,
          review,
          assessment,
          allReviews,
          actorUserId,
          assignmentId: assignment.id,
          note,
        });
      }

      if (!allowWrite) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CONCURRENT_STATE_NOT_VISIBLE", 409);
      }
      if (
        clean(review.note) ||
        review.decidedAt ||
        normalized(assessment.status) !== "FINALIZED"
      ) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_PENDING_STATE_DRIFT", 409);
      }

      if (!reviewPackage) {
        fail(
          "HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_PACKAGE_REQUIRED",
          409,
        );
      }
      if (
        reviewPackage.review.id !== review.id ||
        reviewPackage.review.stage !== review.stage ||
        reviewPackage.supervisoryAssessment.assessmentId !== assessment.id
      ) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CURRENT_REVIEW_DRIFT", 409);
      }

      const plan = dependencies.planDecision({
        reviewPackage,
        decision,
        note,
        confirm: true,
      });
      if (
        plan.decision !== decision ||
        plan.cycleId !== cycleId ||
        plan.reviewId !== review.id ||
        plan.assessmentId !== assessment.id ||
        plan.executionPerformed !== false ||
        plan.releaseRequested !== false ||
        plan.cycleNextStatus !== "UNDER_REVIEW" ||
        plan.reviewerMayRewriteScores !== false ||
        plan.scoreMutationAllowed !== false ||
        plan.combinedWeightingDefined !== false ||
        (decision === "RETURN" &&
          (plan.reviewNextDecision !== "RETURNED" ||
            plan.assessmentNextStatus !== "RETURNED" ||
            plan.revisionRequired !== true ||
            plan.nextReviewStageRequired !== false)) ||
        (decision === "HOLD" &&
          (plan.reviewNextDecision !== "HELD" ||
            plan.assessmentNextStatus !== "FINALIZED" ||
            plan.revisionRequired !== false ||
            plan.nextReviewStageRequired !== true))
      ) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_PLAN_DRIFT", 409);
      }

      const anchors = reviewEvidenceAnchors(review);
      if (
        anchors.reviewEvidenceHash !== reviewPackage.review.reviewEvidenceHash ||
        anchors.snapshotId !== reviewPackage.staffFeedback.snapshotId ||
        anchors.assessmentHash !==
          reviewPackage.supervisoryAssessment.assessmentHash
      ) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_PACKAGE_EVIDENCE_DRIFT", 409);
      }
      const requestHash = decisionRequestHash({
        cycleId,
        review,
        reviewerAssignmentId: assignment.id,
        decision,
        note,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        snapshotId: anchors.snapshotId,
        assessmentHash: anchors.assessmentHash,
      });

      let nextReview: ReviewRecord | null = null;
      if (decision === "HOLD") {
        nextReview = await tx.appraisalReview.create({
          data: {
            cycleId,
            assessmentId: assessment.id,
            reviewerUserId: actorUserId,
            reviewerAssignmentId: assignment.id,
            stage: review.stage + 1,
            decision: "PENDING",
            note: null,
            decidedAt: null,
            metadata: continuedReviewMetadata({
              sourceReview: review,
              plan,
              decisionRequestHash: requestHash,
            }),
          },
          select: REVIEW_SELECT,
        });
      }

      const reviewUpdate = await tx.appraisalReview.updateMany({
        where: {
          id: review.id,
          decision: "PENDING",
          decidedAt: null,
        },
        data: {
          decision: decision === "RETURN" ? "RETURNED" : "HELD",
          note,
          decidedAt: now,
          metadata: decisionMetadata({
            existingMetadata: review.metadata,
            decision,
            note,
            plan,
            decisionRequestHash: requestHash,
            decidedAt: now,
            nextReviewId: nextReview?.id ?? null,
            nextReviewStage: nextReview?.stage ?? null,
          }),
        },
      });
      if (reviewUpdate.count !== 1) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_REVIEW_UPDATE_RACE", 409);
      }

      if (decision === "RETURN") {
        const assessmentUpdate = await tx.appraisalAssessment.updateMany({
          where: { id: assessment.id, status: "FINALIZED" },
          data: {
            status: "RETURNED",
            metadata: {
              ...objectValue(assessment.metadata),
              returnedByDirectorReviewId: review.id,
              returnedByDirectorReviewStage: review.stage,
              returnDecisionContractHash: plan.decisionContractHash,
              returnDecisionRequestHash: requestHash,
              returnedAt: now.toISOString(),
              reviewerMayRewriteScores: false,
              scoreMutationPerformed: false,
              separateFromStaffFeedback: true,
              combinedWeightingDefined: false,
              providerCalled: false,
            },
          },
        });
        if (assessmentUpdate.count !== 1) {
          fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_ASSESSMENT_UPDATE_RACE", 409);
        }
      }

      const cycleUpdate = await tx.appraisalCycle.updateMany({
        where: {
          id: cycleId,
          status: "UNDER_REVIEW",
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          metadata: {
            ...objectValue(cycle.metadata),
            directorReviewDecision: {
              schemaVersion:
                HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.schemaVersion,
              sourceReviewId: review.id,
              sourceReviewStage: review.stage,
              decision,
              decisionContractHash: plan.decisionContractHash,
              decisionRequestHash: requestHash,
              currentReviewId: nextReview?.id ?? review.id,
              currentReviewStage: nextReview?.stage ?? review.stage,
              assessmentId: assessment.id,
              assessmentStatus:
                decision === "RETURN" ? "RETURNED" : "FINALIZED",
              snapshotId: anchors.snapshotId,
              reviewEvidenceHash: anchors.reviewEvidenceHash,
              revisionRequired: decision === "RETURN",
              releasePerformed: false,
              scoreMutationPerformed: false,
              respondentIdentitiesAccessed: false,
              individualStaffResponsesAccessed: false,
              combinedWeightingDefined: false,
              providerCalled: false,
            },
          },
        },
      });
      if (cycleUpdate.count !== 1) {
        fail("HEADTEACHER_DIRECTOR_RETURN_HOLD_CYCLE_UPDATE_RACE", 409);
      }

      const auditAction =
        decision === "RETURN" ? RETURNED_AUDIT_ACTION : HELD_AUDIT_ACTION;
      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: actorUserId,
          action: auditAction,
          resource: "AppraisalReview",
          resourceId: review.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: auditAction,
            workflow: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.workflow,
            cycleId,
            reviewId: review.id,
            reviewStage: review.stage,
            reviewerAssignmentId: assignment.id,
            assessmentId: assessment.id,
            nextReviewId: nextReview?.id ?? null,
            nextReviewStage: nextReview?.stage ?? null,
            decisionContractHash: plan.decisionContractHash,
            decisionRequestHash: requestHash,
            reviewEvidenceHash: anchors.reviewEvidenceHash,
            staffFeedbackSnapshotId: anchors.snapshotId,
            staffFeedbackSourceHash: anchors.staffSourceHash,
            supervisoryAssessmentHash: anchors.assessmentHash,
            revisionRequired: decision === "RETURN",
            reasonIncluded: true,
            reasonTextIncluded: false,
            scoreValuesIncluded: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            reviewerMayRewriteScores: false,
            scoreMutationPerformed: false,
            separateEvidenceStreams: true,
            combinedWeightingDefined: false,
            releasePerformed: false,
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: decision === "RETURN" ? "RETURNED" : "HELD",
        cycleId,
        cycleStatus: "UNDER_REVIEW",
        sourceReviewId: review.id,
        sourceReviewStage: review.stage,
        sourceReviewDecision:
          decision === "RETURN" ? "RETURNED" : "HELD",
        assessmentId: assessment.id,
        assessmentStatus:
          decision === "RETURN" ? "RETURNED" : "FINALIZED",
        nextReviewId: nextReview?.id ?? null,
        nextReviewStage: nextReview?.stage ?? null,
        nextReviewDecision: nextReview ? "PENDING" : null,
        revisionRequired: decision === "RETURN",
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        decisionContractHash: plan.decisionContractHash,
        decisionRequestHash: requestHash,
        reviewerUserId: actorUserId,
        reviewerAssignmentId: assignment.id,
        decidedAt: now.toISOString(),
        releasePerformed: false,
        scoreMutationPerformed: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeHeadteacherDirectorReturnOrHold(
  input: ExecuteHeadteacherDirectorReturnHoldInput,
): Promise<ExecuteHeadteacherDirectorReturnHoldResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorReturnHoldDatabase);
  const dependencies = input.dependencies ?? {
    readReviewPackage: readHeadteacherDirectorReviewPackage,
    planDecision: planHeadteacherDirectorReviewDecision,
  };
  const prepared = prepareReturnHoldRequest(input);

  const sourceReview = await database.appraisalReview.findUnique({
    where: { id: prepared.reviewId },
    select: { id: true, decision: true },
  });

  let reviewPackage: HeadteacherDirectorReviewPackage | null = null;

  if (sourceReview && normalized(sourceReview.decision) === "PENDING") {
    try {
      reviewPackage = await dependencies.readReviewPackage({
        actorUserId: prepared.actorUserId,
        actorRoleName: prepared.actorRole,
        cycleId: prepared.cycleId,
        governanceScope: input.governanceScope,
        now: prepared.now,
        database:
          database as unknown as HeadteacherDirectorReviewPackageDatabase,
      });
    } catch (packageError) {
      try {
        return await runDecision(
          input,
          database,
          dependencies,
          prepared,
          null,
          false,
        );
      } catch (stateError) {
        if (isReviewPackageRequired(stateError)) {
          throw packageError;
        }
        throw stateError;
      }
    }
  }

  try {
    return await runDecision(
      input,
      database,
      dependencies,
      prepared,
      reviewPackage,
      true,
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return runDecision(
      input,
      database,
      dependencies,
      prepared,
      reviewPackage,
      false,
    );
  }
}
