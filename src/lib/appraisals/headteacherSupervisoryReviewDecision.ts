import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAppraisalCapability } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewAdmission";
import {
  readHeadteacherSupervisoryReviewPackage,
} from "@/lib/appraisals/headteacherSupervisoryReviewPackage";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
  evidenceStream: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
  reviewerRole: "HEAD_OF_SUPERVISION",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  allowedActions: ["RETURN", "FORWARD"] as const,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredReviewStage: 1,
  requiredCurrentReviewDecision: "PENDING",
  returnReviewDecision: "RETURNED",
  forwardReviewDecision: "ACCEPTED",
  returnAssessmentFromStatus: "FINALIZED",
  returnAssessmentToStatus: "RETURNED",
  forwardAssessmentStatus: "FINALIZED",
  minimumReturnReasonLength: 3,
  maximumReturnReasonLength: 2_000,
  forwardReasonAllowed: false,
  forwardCreatesDirectorStage: false,
  cycleStatusChanges: false,
  returnedAssessmentRequiresRevision: true,
  preserveReturningReviewerForCorrection: true,
  exactDistrictAssignmentRequired: true,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteVisitEvidence: false,
  scoreMutationAllowed: false,
  assessmentEvidenceMutationAllowed: false,
  returnAssessmentStatusTransitionAllowed: true,
  forwardAssessmentMutationAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 25_000,
} as const;

const RETURNED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_RETURNED";
const FORWARDED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_FORWARDED";

export type HeadteacherSupervisoryHosDecision =
  (typeof HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions)[number];

export type ExecuteHeadteacherSupervisoryHosDecisionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  action: unknown;
  reason?: unknown;
  confirm: boolean;
  governanceScope: GovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryHosDecisionDatabase;
  dependencies?: HeadteacherSupervisoryHosDecisionDependencies;
};

export type ExecuteHeadteacherSupervisoryHosDecisionResult = {
  outcome:
    | "RETURNED"
    | "FORWARDED"
    | "EXISTING_RETURNED"
    | "EXISTING_FORWARDED";
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "RETURNED" | "FINALIZED";
  cycleId: string;
  cycleStatus: "UNDER_REVIEW";
  reviewStage: 1;
  reviewDecision: "RETURNED" | "ACCEPTED";
  revisionRequired: boolean;
  nextReviewCreated: false;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  decidedAt: string;
  scoreMutationPerformed: false;
  visitEvidenceMutationPerformed: false;
  providerCalled: false;
};

export type HeadteacherSupervisoryHosDecisionDependencies = {
  readReviewPackage: typeof readHeadteacherSupervisoryReviewPackage;
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  status: string;
  revision: number;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  assessmentHash: string | null;
  metadata: unknown;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetTenantId: string | null;
  status: string;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
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

type AssignmentRecord = {
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
    zoneType: { level: number };
  };
};

type CountResult = { count: number };

export type HeadteacherSupervisoryHosDecisionTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    findMany(args: unknown): Promise<ReviewRecord[]>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryHosDecisionDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  appraisalReview: {
    findMany(args: unknown): Promise<ReviewRecord[]>;
  };
  $transaction<T>(
    operation: (
      tx: HeadteacherSupervisoryHosDecisionTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
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
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_INVALID_CURRENT_TIME", 400);
  }
  return now;
}

function normalizeAction(value: unknown): HeadteacherSupervisoryHosDecision {
  const action = normalized(value);
  if (
    !HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions.includes(
      action as HeadteacherSupervisoryHosDecision,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ACTION_FORBIDDEN", 400, {
      action,
    });
  }
  return action as HeadteacherSupervisoryHosDecision;
}

function normalizeReason(
  action: HeadteacherSupervisoryHosDecision,
  value: unknown,
) {
  const reason = clean(value);

  if (action === "FORWARD") {
    if (reason) {
      fail(
        "HEADTEACHER_SUPERVISORY_HOS_DECISION_FORWARD_REASON_FORBIDDEN",
        400,
      );
    }
    return null;
  }

  if (
    reason.length <
    HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.minimumReturnReasonLength
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_REQUIRED", 400);
  }
  if (
    reason.length >
    HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.maximumReturnReasonLength
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_TOO_LONG", 400);
  }
  return reason;
}

function scopeCarriesAssignment(
  governanceScope: GovernanceScope,
  assignment: AssignmentRecord,
) {
  return governanceScope.assignments.some(
    (candidate) =>
      clean(candidate.id) === assignment.id &&
      normalized(candidate.role) === "HEAD_OF_SUPERVISION" &&
      clean(candidate.zoneId) === assignment.zoneId &&
      candidate.zoneLevel ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel,
  );
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  actorUserId: string;
  districtId: string;
  governanceScope: GovernanceScope;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.userId !== input.actorUserId ||
    normalized(assignment.role) !== "HEAD_OF_SUPERVISION" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtId ||
    assignment.zone.id !== input.districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    !scopeCarriesAssignment(input.governanceScope, assignment)
  ) {
    return false;
  }
  if (assignment.startsAt && assignment.startsAt.getTime() > input.now.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() <= input.now.getTime()) {
    return false;
  }
  return true;
}

function requireExactCurrentAssignment(input: {
  assignments: AssignmentRecord[];
  actorUserId: string;
  districtId: string;
  governanceScope: GovernanceScope;
  now: Date;
  expectedAssignmentId: string;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      actorUserId: input.actorUserId,
      districtId: input.districtId,
      governanceScope: input.governanceScope,
      now: input.now,
    }),
  );

  if (matches.length === 0) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_AMBIGUOUS_ASSIGNMENT", 409);
  }
  if (matches[0].id !== input.expectedAssignmentId) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ASSIGNMENT_DRIFT", 409);
  }
  return matches[0];
}

function reviewEvidenceHash(input: {
  assessment: AssessmentRecord;
  cycle: CycleRecord;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  visitContextHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
    },
    review: {
      stage: 1,
      reviewerUserId: input.reviewerUserId,
      reviewerAssignmentId: input.reviewerAssignmentId,
      reviewerRole: "HEAD_OF_SUPERVISION",
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function decisionRequestHash(input: {
  assessment: AssessmentRecord;
  cycle: CycleRecord;
  review: ReviewRecord;
  visitContextHash: string;
  sourceReviewEvidenceHash: string;
  action: HeadteacherSupervisoryHosDecision;
  reason: string | null;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
    evidenceStream: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
    },
    review: {
      id: input.review.id,
      stage: input.review.stage,
      reviewerUserId: input.review.reviewerUserId,
      reviewerAssignmentId: input.review.reviewerAssignmentId,
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    action: input.action,
    reason: input.reason,
    returnAssessmentStatus:
      input.action === "RETURN" ? "RETURNED" : "FINALIZED",
    reviewDecision: input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
    nextReviewCreated: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function decisionEvidenceHash(input: {
  decisionRequestHash: string;
  sourceReviewEvidenceHash: string;
  action: HeadteacherSupervisoryHosDecision;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    decisionRequestHash: input.decisionRequestHash,
    sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
    action: input.action,
    nextReviewCreated: false,
  });
}

function sourceDecisionMetadata(input: {
  sourceMetadata: unknown;
  action: HeadteacherSupervisoryHosDecision;
  reason: string | null;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  decidedAt: Date;
}) {
  return {
    ...objectValue(input.sourceMetadata),
    decisionSchemaVersion:
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    decisionAction: input.action,
    decisionRequestHash: input.decisionRequestHash,
    decisionEvidenceHash: input.decisionEvidenceHash,
    decidedByRole: "HEAD_OF_SUPERVISION",
    decidedAt: input.decidedAt.toISOString(),
    reasonHash: input.reason ? hashJson(input.reason) : null,
    reasonLength: input.reason?.length ?? 0,
    revisionRequired: input.action === "RETURN",
    nextReviewCreated: false,
    nextReviewerRole: null,
    preserveReturningReviewerForCorrection: input.action === "RETURN",
    reviewerMayRewriteScores: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
}

function cycleDecisionMetadata(input: {
  cycleMetadata: unknown;
  review: ReviewRecord;
  assessment: AssessmentRecord;
  sourceReviewEvidenceHash: string;
  action: HeadteacherSupervisoryHosDecision;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  decidedAt: Date;
}) {
  const current = objectValue(
    objectValue(input.cycleMetadata).headteacherSupervisoryReview,
  );
  return {
    ...objectValue(input.cycleMetadata),
    headteacherSupervisoryReview: {
      ...current,
      schemaVersion: 1,
      state:
        input.action === "RETURN"
          ? "RETURNED_FOR_CORRECTION"
          : "HOS_REVIEW_ACCEPTED_AWAITING_DIRECTOR",
      currentReviewId: input.review.id,
      currentReviewStage: 1,
      currentReviewerRole: "HEAD_OF_SUPERVISION",
      currentReviewerAssignmentId: input.review.reviewerAssignmentId,
      sourceReviewDecision:
        input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
      admittedAssessmentId: input.assessment.id,
      admittedAssessmentRevision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      decisionRequestHash: input.decisionRequestHash,
      decisionEvidenceHash: input.decisionEvidenceHash,
      awaitingRevision: input.action === "RETURN",
      awaitingDirectorAdmission: input.action === "FORWARD",
      directorReviewCreated: false,
      preserveReturningReviewerForCorrection: input.action === "RETURN",
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      notificationsSeeded: false,
      providerCalled: false,
      decidedAt: input.decidedAt.toISOString(),
    },
  };
}

function assessmentMetadataForReturn(input: {
  assessmentMetadata: unknown;
  review: ReviewRecord;
  reviewEvidenceHash: string;
  visitContextHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  reason: string;
  returnedAt: Date;
}) {
  return {
    ...objectValue(input.assessmentMetadata),
    headteacherSupervisoryReturn: {
      schemaVersion: 1,
      returnReviewId: input.review.id,
      returnReviewStage: input.review.stage,
      returningReviewerUserId: input.review.reviewerUserId,
      returningReviewerAssignmentId: input.review.reviewerAssignmentId,
      returningReviewerRole: "HEAD_OF_SUPERVISION",
      returnReviewEvidenceHash: input.reviewEvidenceHash,
      visitContextHash: input.visitContextHash,
      returnDecisionRequestHash: input.decisionRequestHash,
      returnDecisionEvidenceHash: input.decisionEvidenceHash,
      reasonHash: hashJson(input.reason),
      reasonLength: input.reason.length,
      returnedAt: input.returnedAt.toISOString(),
      preserveReturningReviewerForCorrection: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteVisitEvidence: false,
      scoreMutationPerformed: false,
      visitEvidenceMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      providerCalled: false,
    },
  };
}

function findHosStageOneReview(
  reviews: ReviewRecord[],
  actorUserId: string,
) {
  const matches = reviews.filter(
    (review) =>
      review.stage === 1 &&
      review.reviewerUserId === actorUserId &&
      normalized(objectValue(review.metadata).reviewerRole) ===
        "HEAD_OF_SUPERVISION",
  );
  return matches.length === 1 ? matches[0] : null;
}

async function existingDecisionResult(input: {
  database: HeadteacherSupervisoryHosDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  action: HeadteacherSupervisoryHosDecision;
  reason: string | null;
  review: ReviewRecord;
}): Promise<ExecuteHeadteacherSupervisoryHosDecisionResult> {
  const review = input.review;
  const metadata = objectValue(review.metadata);

  const expectedDecision = input.action === "RETURN" ? "RETURNED" : "ACCEPTED";
  if (
    normalized(review.decision) !== expectedDecision ||
    !review.decidedAt ||
    clean(metadata.decisionAction) !== input.action ||
    clean(metadata.decidedByRole) !== "HEAD_OF_SUPERVISION" ||
    !isSha256(metadata.reviewEvidenceHash) ||
    !isSha256(metadata.assessmentHash) ||
    !isSha256(metadata.decisionRequestHash) ||
    !isSha256(metadata.decisionEvidenceHash) ||
    metadata.nextReviewCreated !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.visitEvidenceMutationPerformed !== false ||
    metadata.staffFeedbackIncluded !== false ||
    metadata.respondentIdentitiesIncluded !== false ||
    metadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_EXISTING_REVIEW_DRIFT", 409);
  }

  const expectedReasonHash = input.reason ? hashJson(input.reason) : null;
  if (
    metadata.reasonHash !== expectedReasonHash ||
    Number(metadata.reasonLength) !== (input.reason?.length ?? 0) ||
    (input.action === "RETURN" && review.note !== input.reason) ||
    (input.action === "FORWARD" && clean(review.note))
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_HOS_DECISION_ALREADY_DECIDED_DIFFERENTLY",
      409,
    );
  }

  const assessment = await input.database.appraisalAssessment.findUnique({
    where: { id: input.assessmentId },
    select: {
      id: true,
      cycleId: true,
      status: true,
      revision: true,
      assessorUserId: true,
      assessorAssignmentId: true,
      assessmentHash: true,
      metadata: true,
    },
  });
  if (!assessment) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ASSESSMENT_NOT_FOUND", 404);
  }

  const cycle = await input.database.appraisalCycle.findUnique({
    where: { id: assessment.cycleId },
    select: {
      id: true,
      scopeZoneId: true,
      targetTenantId: true,
      status: true,
      reviewStartedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
    },
  });
  if (
    !cycle ||
    normalized(cycle.status) !== "UNDER_REVIEW" ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt ||
    cycle.cancelledAt
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_EXISTING_CYCLE_DRIFT", 409);
  }

  const allReviews = await input.database.appraisalReview.findMany({
    where: { assessmentId: input.assessmentId },
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
    orderBy: { stage: "asc" },
  });
  if (allReviews.some((candidate) => candidate.stage > 1)) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_UNEXPECTED_NEXT_REVIEW", 409);
  }

  if (
    (input.action === "RETURN" && normalized(assessment.status) !== "RETURNED") ||
    (input.action === "FORWARD" && normalized(assessment.status) !== "FINALIZED")
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_EXISTING_ASSESSMENT_DRIFT", 409);
  }

  return {
    outcome: input.action === "RETURN" ? "EXISTING_RETURNED" : "EXISTING_FORWARDED",
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentStatus: input.action === "RETURN" ? "RETURNED" : "FINALIZED",
    cycleId: cycle.id,
    cycleStatus: "UNDER_REVIEW",
    reviewStage: 1,
    reviewDecision: expectedDecision,
    revisionRequired: input.action === "RETURN",
    nextReviewCreated: false,
    decisionRequestHash: clean(metadata.decisionRequestHash).toLowerCase(),
    decisionEvidenceHash: clean(metadata.decisionEvidenceHash).toLowerCase(),
    decidedAt: review.decidedAt.toISOString(),
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
    providerCalled: false,
  };
}

function isRetryableRace(error: unknown) {
  const code = clean((error as { code?: unknown })?.code);
  const message = clean((error as { message?: unknown })?.message);
  return (
    code === "P2034" ||
    message === "HEADTEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE"
  );
}

async function executeFreshDecision(input: {
  request: ExecuteHeadteacherSupervisoryHosDecisionInput;
  database: HeadteacherSupervisoryHosDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  action: HeadteacherSupervisoryHosDecision;
  reason: string | null;
  reqId: string;
  now: Date;
}) {
  const reviewPackage = await (
    input.request.dependencies ?? {
      readReviewPackage: readHeadteacherSupervisoryReviewPackage,
    }
  ).readReviewPackage({
    actorUserId: input.actorUserId,
    actorRoleName: "HEAD_OF_SUPERVISION",
    assessmentId: input.assessmentId,
    governanceScope: input.request.governanceScope,
    now: input.now,
  });

  if (
    reviewPackage.lifecycleState !== "READY_TO_REVIEW" ||
    !reviewPackage.review ||
    reviewPackage.review.stage !== 1 ||
    reviewPackage.review.decision !== "PENDING"
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_PACKAGE_STATE_INVALID", 409);
  }

  return input.database.$transaction(
    async (tx) => {
      const sourceReview = await tx.appraisalReview.findUnique({
        where: {
          assessmentId_stage: {
            assessmentId: input.assessmentId,
            stage: 1,
          },
        },
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
      });
      if (!sourceReview) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_REVIEW_NOT_FOUND", 404);
      }
      if (normalized(sourceReview.decision) !== "PENDING") {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
      }

      const assessment = await tx.appraisalAssessment.findUnique({
        where: { id: input.assessmentId },
        select: {
          id: true,
          cycleId: true,
          status: true,
          revision: true,
          assessorUserId: true,
          assessorAssignmentId: true,
          assessmentHash: true,
          metadata: true,
        },
      });
      if (!assessment) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ASSESSMENT_NOT_FOUND", 404);
      }

      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: assessment.cycleId },
        select: {
          id: true,
          scopeZoneId: true,
          targetTenantId: true,
          status: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
        },
      });
      if (!cycle) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_CYCLE_NOT_FOUND", 404);
      }

      const reviewMetadata = objectValue(sourceReview.metadata);
      const cycleReviewMetadata = objectValue(
        objectValue(cycle.metadata).headteacherSupervisoryReview,
      );
      const visitContextHash = clean(
        objectValue(assessment.metadata).visitContextHash,
      ).toLowerCase();
      const assessmentHash = clean(assessment.assessmentHash).toLowerCase();

      if (
        assessment.id !== reviewPackage.assessment.id ||
        assessment.cycleId !== reviewPackage.cycle.id ||
        assessment.revision !== reviewPackage.assessment.revision ||
        normalized(assessment.status) !== "FINALIZED" ||
        normalized(cycle.status) !== "UNDER_REVIEW" ||
        !cycle.reviewStartedAt ||
        cycle.releasedAt ||
        cycle.cancelledAt ||
        sourceReview.assessmentId !== assessment.id ||
        sourceReview.cycleId !== cycle.id ||
        sourceReview.reviewerUserId !== input.actorUserId ||
        sourceReview.stage !== 1 ||
        clean(sourceReview.note) ||
        sourceReview.decidedAt ||
        !clean(sourceReview.reviewerAssignmentId) ||
        !isSha256(assessmentHash) ||
        !isSha256(visitContextHash) ||
        clean(reviewMetadata.reviewType) !== "HOS_SUPERVISORY_REVIEW" ||
        Number(reviewMetadata.reviewStage) !== 1 ||
        clean(reviewMetadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
        clean(reviewMetadata.assessmentId) !== assessment.id ||
        Number(reviewMetadata.assessmentRevision) !== assessment.revision ||
        clean(reviewMetadata.assessmentHash).toLowerCase() !== assessmentHash ||
        reviewMetadata.immutableEvidenceReverified !== true ||
        reviewMetadata.staffFeedbackIncluded !== false ||
        reviewMetadata.respondentIdentitiesIncluded !== false ||
        reviewMetadata.reviewerMayRewriteScores !== false ||
        reviewMetadata.scoreMutationAllowed !== false ||
        reviewMetadata.providerCalled !== false ||
        clean(cycleReviewMetadata.state) !== "HOS_REVIEW_PENDING" ||
        clean(cycleReviewMetadata.currentReviewId) !== sourceReview.id ||
        Number(cycleReviewMetadata.currentReviewStage) !== 1 ||
        clean(cycleReviewMetadata.currentReviewerRole) !== "HEAD_OF_SUPERVISION" ||
        clean(cycleReviewMetadata.currentReviewerAssignmentId) !==
          clean(sourceReview.reviewerAssignmentId) ||
        clean(cycleReviewMetadata.admittedAssessmentId) !== assessment.id ||
        Number(cycleReviewMetadata.admittedAssessmentRevision) !==
          assessment.revision ||
        clean(cycleReviewMetadata.assessmentHash).toLowerCase() !== assessmentHash ||
        cycleReviewMetadata.staffFeedbackIncluded !== false ||
        cycleReviewMetadata.respondentIdentitiesIncluded !== false
      ) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_CURRENT_STATE_DRIFT", 409);
      }

      const expectedReviewEvidenceHash = reviewEvidenceHash({
        assessment,
        cycle,
        reviewerUserId: sourceReview.reviewerUserId,
        reviewerAssignmentId: clean(sourceReview.reviewerAssignmentId),
        visitContextHash,
      });
      if (
        clean(reviewMetadata.reviewEvidenceHash).toLowerCase() !==
          expectedReviewEvidenceHash ||
        clean(cycleReviewMetadata.reviewEvidenceHash).toLowerCase() !==
          expectedReviewEvidenceHash
      ) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_REVIEW_EVIDENCE_DRIFT", 409);
      }

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: {
          userId: input.actorUserId,
          role: "HEAD_OF_SUPERVISION",
          status: "ACTIVE",
          zoneId: cycle.scopeZoneId,
        },
        select: {
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
              zoneType: { select: { level: true } },
            },
          },
        },
      });
      const assignment = requireExactCurrentAssignment({
        assignments,
        actorUserId: input.actorUserId,
        districtId: cycle.scopeZoneId,
        governanceScope: input.request.governanceScope,
        now: input.now,
        expectedAssignmentId: clean(sourceReview.reviewerAssignmentId),
      });

      const requestHash = decisionRequestHash({
        assessment,
        cycle,
        review: sourceReview,
        visitContextHash,
        sourceReviewEvidenceHash: expectedReviewEvidenceHash,
        action: input.action,
        reason: input.reason,
      });
      const evidenceHash = decisionEvidenceHash({
        decisionRequestHash: requestHash,
        sourceReviewEvidenceHash: expectedReviewEvidenceHash,
        action: input.action,
      });

      const reviewUpdated = await tx.appraisalReview.updateMany({
        where: {
          id: sourceReview.id,
          assessmentId: assessment.id,
          cycleId: cycle.id,
          stage: 1,
          decision: "PENDING",
          decidedAt: null,
        },
        data: {
          decision: input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
          note: input.reason,
          decidedAt: input.now,
          metadata: sourceDecisionMetadata({
            sourceMetadata: sourceReview.metadata,
            action: input.action,
            reason: input.reason,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            decidedAt: input.now,
          }),
        },
      });
      if (reviewUpdated.count !== 1) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
      }

      if (input.action === "RETURN") {
        const assessmentUpdated = await tx.appraisalAssessment.updateMany({
          where: {
            id: assessment.id,
            status: "FINALIZED",
            revision: assessment.revision,
          },
          data: {
            status: "RETURNED",
            metadata: assessmentMetadataForReturn({
              assessmentMetadata: assessment.metadata,
              review: sourceReview,
              reviewEvidenceHash: expectedReviewEvidenceHash,
              visitContextHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              reason: input.reason as string,
              returnedAt: input.now,
            }),
          },
        });
        if (assessmentUpdated.count !== 1) {
          fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
        }
      }

      const cycleUpdated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "UNDER_REVIEW",
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          metadata: cycleDecisionMetadata({
            cycleMetadata: cycle.metadata,
            review: sourceReview,
            assessment,
            sourceReviewEvidenceHash: expectedReviewEvidenceHash,
            action: input.action,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            decidedAt: input.now,
          }),
        },
      });
      if (cycleUpdated.count !== 1) {
        fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: clean(cycle.targetTenantId),
          userId: input.actorUserId,
          action:
            input.action === "RETURN"
              ? RETURNED_AUDIT_ACTION
              : FORWARDED_AUDIT_ACTION,
          resource: "AppraisalReview",
          resourceId: sourceReview.id,
          ip: input.request.ip ?? undefined,
          userAgent: input.request.userAgent ?? undefined,
          metadata: {
            reqId: input.reqId,
            action:
              input.action === "RETURN"
                ? RETURNED_AUDIT_ACTION
                : FORWARDED_AUDIT_ACTION,
            workflow: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
            evidenceStream:
              HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            assessmentRevision: assessment.revision,
            reviewStage: 1,
            reviewDecision:
              input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
            reviewerRole: "HEAD_OF_SUPERVISION",
            actorAssignmentId: assignment.id,
            reviewEvidenceHash: expectedReviewEvidenceHash,
            assessmentHash,
            visitContextHash,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            reasonTextRecordedInAudit: false,
            reasonLength: input.reason?.length ?? 0,
            assessmentStatusTransitionPerformed: input.action === "RETURN",
            scoreValuesRecordedInAudit: false,
            staffFeedbackIncluded: false,
            respondentIdentitiesIncluded: false,
            nextReviewCreated: false,
            scoreMutationPerformed: false,
            visitEvidenceMutationPerformed: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: input.action === "RETURN" ? ("RETURNED" as const) : ("FORWARDED" as const),
        assessmentId: assessment.id,
        assessmentRevision: assessment.revision,
        assessmentStatus:
          input.action === "RETURN" ? ("RETURNED" as const) : ("FINALIZED" as const),
        cycleId: cycle.id,
        cycleStatus: "UNDER_REVIEW" as const,
        reviewStage: 1 as const,
        reviewDecision:
          input.action === "RETURN" ? ("RETURNED" as const) : ("ACCEPTED" as const),
        revisionRequired: input.action === "RETURN",
        nextReviewCreated: false as const,
        decisionRequestHash: requestHash,
        decisionEvidenceHash: evidenceHash,
        decidedAt: input.now.toISOString(),
        scoreMutationPerformed: false as const,
        visitEvidenceMutationPerformed: false as const,
        providerCalled: false as const,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeHeadteacherSupervisoryHosDecision(
  input: ExecuteHeadteacherSupervisoryHosDecisionInput,
): Promise<ExecuteHeadteacherSupervisoryHosDecisionResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const actorRole = normalized(input.actorRoleName);
  const action = normalizeAction(input.action);
  const reason = normalizeReason(action, input.reason);

  if (
    actorRole !== HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.reviewerRole ||
    !hasAppraisalCapability(
      actorRole,
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.requiredCapability,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_ROLE_FORBIDDEN", 403);
  }
  if (input.confirm !== true) {
    fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_CONFIRMATION_REQUIRED", 400);
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryHosDecisionDatabase);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reviews = await database.appraisalReview.findMany({
      where: { assessmentId },
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
      orderBy: { stage: "asc" },
    });
    const current = findHosStageOneReview(reviews, actorUserId);

    if (current && normalized(current.decision) !== "PENDING") {
      return existingDecisionResult({
        database,
        actorUserId,
        assessmentId,
        action,
        reason,
        review: current,
      });
    }
    if (!current) {
      fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_REVIEW_NOT_FOUND", 404);
    }

    try {
      return await executeFreshDecision({
        request: input,
        database,
        actorUserId,
        assessmentId,
        action,
        reason,
        reqId,
        now,
      });
    } catch (error) {
      if (attempt === 0 && isRetryableRace(error)) continue;
      throw error;
    }
  }

  fail("HEADTEACHER_SUPERVISORY_HOS_DECISION_CONCURRENT_WRITE_FAILED", 409);
}
