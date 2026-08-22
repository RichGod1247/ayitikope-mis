import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY,
} from "@/lib/appraisals/headteacherDirectorGovernanceReview";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_REVISION_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentRevision";
import {
  loadHeadteacherSupervisoryAssessment,
  type HeadteacherSupervisoryAssessmentView,
  type HeadteacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
import {
  HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewAdmission";
import {
  HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewDecision";

export const HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
  evidenceStream:
    HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredAssessmentStatus: "FINALIZED",
  requiredSourceAssessmentStatus: "SUPERSEDED",
  minimumCorrectionRevision: 2,
  hosReviewerRole: "HEAD_OF_SUPERVISION",
  hosRequiredReviewStage: 1,
  sourceReviewDecision: "RETURNED",
  continuedReviewDecision: "PENDING",
  preserveReturningReviewer: true,
  preserveReviewStage: true,
  preserveVisitContext: true,
  exactReturningAssignmentRequired: true,
  directorContinuationDelegated: true,
  directorContinuationMode: "INDEPENDENT_GOVERNANCE",
  directorReturnCorrectionAssessorRole: "HEAD_OF_SUPERVISION",
  directorReturnHosAuthoredOnly: true,
  staffFeedbackIncludedInHosContinuation: false,
  staffFeedbackIncludedInDirectorContinuation: false,
  respondentIdentitiesIncluded: false,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteVisitEvidence: false,
  scoreMutationAllowed: false,
  assessmentMutationAllowed: false,
  cycleStatusChanges: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 25_000,
  hosCarrierWorkflowIndependent: true,
  hosCarrierGovernanceProofRequired: true,
  directorCarrierStatusMutationRequired: false,
  directorCarrierTimestampMutationRequired: false,
  directorCarrierWorkflowIndependent: true,
  directorCarrierGovernanceProofRequired: true,
} as const;

const HOS_CORRECTION_CONTINUED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_HOS_CORRECTION_REVIEW_CONTINUED";

export type EnsureHeadteacherSupervisoryCorrectionReviewContinuationInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryCorrectionContinuationDatabase;
  dependencies?: HeadteacherSupervisoryCorrectionContinuationDependencies;
};

export type EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult = {
  outcome: "NOT_REQUIRED" | "CREATED" | "EXISTING_REVIEW";
  continuationRequired: boolean;
  continuationReviewerRole: "HEAD_OF_SUPERVISION" | "DISTRICT_DIRECTOR" | null;
  cycleId: string;
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "FINALIZED";
  sourceAssessmentId: string | null;
  sourceReviewId: string | null;
  sourceReviewStage: number | null;
  reviewId: string | null;
  reviewStage: number | null;
  reviewDecision: "PENDING" | null;
  reviewerUserId: string | null;
  reviewerAssignmentId: string | null;
  reviewEvidenceHash: string | null;
  reviewCreated: boolean;
  scoreMutationPerformed: false;
  visitEvidenceMutationPerformed: false;
  staffFeedbackIncluded: false;
  respondentIdentitiesIncluded: false;
  providerCalled: false;
};

export type HeadteacherSupervisoryCorrectionContinuationDependencies = {
  loadAssessment: typeof loadHeadteacherSupervisoryAssessment;
  ensureDirectorContinuation: typeof ensureDirectorGovernanceCorrectionContinuation;
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
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

export type HeadteacherSupervisoryCorrectionContinuationTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    findMany(args: unknown): Promise<ReviewRecord[]>;
    create(args: unknown): Promise<ReviewRecord>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryCorrectionContinuationDatabase = {
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
      tx: HeadteacherSupervisoryCorrectionContinuationTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  status: true,
  revision: true,
  priorAssessmentId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  metadata: true,
} as const;

const CYCLE_SELECT = {
  id: true,
  scopeZoneId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  status: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
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
      zoneType: { select: { level: true } },
    },
  },
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
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_INVALID_TIME", 400);
  }
  return now;
}

function isRetryableConflict(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ["P2002", "P2034"].includes(clean((error as { code?: unknown }).code)),
  );
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait:
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.transactionMaxWaitMs,
    timeout:
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.transactionTimeoutMs,
  };
}

function assertCurrentFinalizedBoundary(
  assessment: AssessmentRecord,
  actorUserId: string,
) {
  if (
    normalized(assessment.status) !== "FINALIZED" ||
    assessment.assessorUserId !== actorUserId ||
    assessment.finalizedByUserId !== actorUserId ||
    !assessment.finalizedAt ||
    !Number.isInteger(assessment.revision) ||
    assessment.revision < 1 ||
    !isSha256(assessment.assessmentHash)
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_FINALIZED_STATE_INVALID", 409);
  }
}

function notRequiredResult(
  assessment: AssessmentRecord,
): EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult {
  return {
    outcome: "NOT_REQUIRED",
    continuationRequired: false,
    continuationReviewerRole: null,
    cycleId: assessment.cycleId,
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentStatus: "FINALIZED",
    sourceAssessmentId: null,
    sourceReviewId: null,
    sourceReviewStage: null,
    reviewId: null,
    reviewStage: null,
    reviewDecision: null,
    reviewerUserId: null,
    reviewerAssignmentId: null,
    reviewEvidenceHash: null,
    reviewCreated: false,
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    providerCalled: false,
  };
}

function correctionReturnEvidenceHash(
  source: AssessmentRecord,
  review: ReviewRecord,
) {
  return hashJson({
    schemaVersion:
      HEADTEACHER_SUPERVISORY_REVISION_POLICY.revisionEvidenceSchemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    assessmentId: source.id,
    assessmentHash: clean(source.assessmentHash).toLowerCase(),
    review: {
      id: review.id,
      stage: review.stage,
      decision: normalized(review.decision),
      note: clean(review.note),
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      decidedAt: review.decidedAt?.toISOString() ?? null,
    },
    reviewerScoreEditsIncluded: false,
  });
}

function hosReviewEvidenceHash(input: {
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
      stage: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.reviewStage,
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

function sourceHosReturnMetadata(source: AssessmentRecord) {
  return objectValue(objectValue(source.metadata).headteacherSupervisoryReturn);
}

function sourceHasDirectorReturn(source: AssessmentRecord) {
  const metadata = objectValue(source.metadata);
  const stage = clean(metadata.returnedByDirectorReviewStage);
  return Boolean(
    clean(metadata.returnedByDirectorReviewId) ||
      (stage && Number.isInteger(Number(stage)) && Number(stage) >= 1),
  );
}

function assertHosCycleBoundary(cycle: CycleRecord) {
  if (
    normalized(cycle.status) !==
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.requiredCycleStatus ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt ||
    cycle.cancelledAt ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    !clean(cycle.targetTenantId) ||
    !clean(cycle.scopeZoneId)
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CYCLE_INVALID", 409);
  }
}

function assertDirectorCarrierBoundary(cycle: CycleRecord) {
  if (
    cycle.cancelledAt ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    !clean(cycle.targetTenantId) ||
    !clean(cycle.scopeZoneId)
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_CARRIER_INVALID",
      409,
      { cycleStatus: normalized(cycle.status) },
    );
  }
}

function assertCorrectionLineage(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
}) {
  const currentMetadata = objectValue(input.current.metadata);
  const sourceMetadata = objectValue(input.source.metadata);
  const currentVisitHash = clean(currentMetadata.visitContextHash).toLowerCase();
  const sourceVisitHash = clean(sourceMetadata.visitContextHash).toLowerCase();
  const sourceAssessmentHash = clean(input.source.assessmentHash).toLowerCase();

  if (
    input.current.revision <
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.minimumCorrectionRevision ||
    input.current.priorAssessmentId !== input.source.id ||
    clean(currentMetadata.sourceAssessmentId) !== input.source.id ||
    input.current.cycleId !== input.source.cycleId ||
    input.current.revision !== input.source.revision + 1 ||
    input.current.assessorUserId !== input.source.assessorUserId ||
    input.current.assessorAssignmentId !== input.source.assessorAssignmentId ||
    normalized(input.source.status) !==
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.requiredSourceAssessmentStatus ||
    clean(sourceMetadata.supersededByAssessmentId) !== input.current.id ||
    !isSha256(sourceAssessmentHash) ||
    clean(currentMetadata.sourceAssessmentHash).toLowerCase() !==
      sourceAssessmentHash ||
    !isSha256(currentVisitHash) ||
    currentVisitHash !== sourceVisitHash ||
    currentMetadata.preserveVisitContext !== true ||
    currentMetadata.reviewerMayRewriteScores !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_LINEAGE_DRIFT", 409);
  }
}

function assertFinalizedViewMatches(
  current: AssessmentRecord,
  view: HeadteacherSupervisoryAssessmentView,
) {
  const metadata = objectValue(current.metadata);
  if (
    view.assessmentId !== current.id ||
    view.cycleId !== current.cycleId ||
    view.revision !== current.revision ||
    view.status !== "FINALIZED" ||
    view.assessorUserId !== current.assessorUserId ||
    view.assessorAssignmentId !== clean(current.assessorAssignmentId) ||
    clean(view.assessmentHash).toLowerCase() !==
      clean(current.assessmentHash).toLowerCase() ||
    clean(view.visitContextHash).toLowerCase() !==
      clean(metadata.visitContextHash).toLowerCase()
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_FINALIZED_EVIDENCE_DRIFT", 409);
  }
}

function assertEligibleHosCorrectionAssessorRole(actorRoleName: unknown) {
  const role = normalized(actorRoleName);
  if (
    !["SISSO", "CIRCUIT_SUPERVISOR", "BASIC_SCHOOL_COORDINATOR"].includes(
      role,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_SOURCE_ROLE_INVALID", 409, {
      actorRole: role,
    });
  }
}

function assertHosSourceReturn(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
}) {
  const currentMetadata = objectValue(input.current.metadata);
  const sourceMetadata = objectValue(input.source.metadata);
  const hosReturn = sourceHosReturnMetadata(input.source);
  const reviewMetadata = objectValue(input.sourceReview.metadata);
  const sourceVisitHash = clean(sourceMetadata.visitContextHash).toLowerCase();
  const sourceAssessmentHash = clean(input.source.assessmentHash).toLowerCase();
  const expectedReturnEvidenceHash = correctionReturnEvidenceHash(
    input.source,
    input.sourceReview,
  );
  const expectedSourceReviewEvidenceHash = hosReviewEvidenceHash({
    assessment: input.source,
    cycle: input.cycle,
    reviewerUserId: input.sourceReview.reviewerUserId,
    reviewerAssignmentId: clean(input.sourceReview.reviewerAssignmentId),
    visitContextHash: sourceVisitHash,
  });
  const reason = clean(input.sourceReview.note);

  if (
    Object.keys(hosReturn).length === 0 ||
    sourceHasDirectorReturn(input.source) ||
    normalized(input.sourceReview.decision) !==
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.returnReviewDecision ||
    !input.sourceReview.decidedAt ||
    input.sourceReview.cycleId !== input.source.cycleId ||
    input.sourceReview.assessmentId !== input.source.id ||
    input.sourceReview.stage !==
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.requiredReviewStage ||
    !clean(input.sourceReview.reviewerAssignmentId) ||
    clean(currentMetadata.returnReviewId) !== input.sourceReview.id ||
    Number(currentMetadata.returnReviewStage) !== input.sourceReview.stage ||
    clean(currentMetadata.returnEvidenceHash).toLowerCase() !==
      expectedReturnEvidenceHash ||
    clean(sourceMetadata.returnEvidenceHash).toLowerCase() !==
      expectedReturnEvidenceHash ||
    clean(hosReturn.returnReviewId) !== input.sourceReview.id ||
    Number(hosReturn.returnReviewStage) !== input.sourceReview.stage ||
    clean(hosReturn.returningReviewerUserId) !== input.sourceReview.reviewerUserId ||
    clean(hosReturn.returningReviewerAssignmentId) !==
      clean(input.sourceReview.reviewerAssignmentId) ||
    normalized(hosReturn.returningReviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(hosReturn.returnReviewEvidenceHash).toLowerCase() !==
      expectedSourceReviewEvidenceHash ||
    clean(hosReturn.visitContextHash).toLowerCase() !== sourceVisitHash ||
    clean(hosReturn.returnDecisionRequestHash).toLowerCase() !==
      clean(reviewMetadata.decisionRequestHash).toLowerCase() ||
    clean(hosReturn.returnDecisionEvidenceHash).toLowerCase() !==
      clean(reviewMetadata.decisionEvidenceHash).toLowerCase() ||
    clean(hosReturn.reasonHash).toLowerCase() !== hashJson(reason) ||
    Number(hosReturn.reasonLength) !== reason.length ||
    hosReturn.preserveReturningReviewerForCorrection !== true ||
    hosReturn.reviewerMayRewriteScores !== false ||
    hosReturn.reviewerMayRewriteVisitEvidence !== false ||
    hosReturn.scoreMutationPerformed !== false ||
    hosReturn.visitEvidenceMutationPerformed !== false ||
    hosReturn.staffFeedbackIncluded !== false ||
    hosReturn.respondentIdentitiesIncluded !== false ||
    hosReturn.providerCalled !== false ||
    clean(reviewMetadata.reviewEvidenceHash).toLowerCase() !==
      expectedSourceReviewEvidenceHash ||
    clean(reviewMetadata.assessmentHash).toLowerCase() !== sourceAssessmentHash ||
    clean(reviewMetadata.reviewType) !== "HOS_SUPERVISORY_REVIEW" ||
    normalized(reviewMetadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(reviewMetadata.decisionAction) !== "RETURN" ||
    clean(reviewMetadata.decidedByRole) !== "HEAD_OF_SUPERVISION" ||
    reviewMetadata.preserveReturningReviewerForCorrection !== true ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.staffFeedbackIncluded !== false ||
    reviewMetadata.respondentIdentitiesIncluded !== false ||
    reviewMetadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_RETURN_PROVENANCE_DRIFT", 409);
  }

  return {
    sourceVisitHash,
    sourceAssessmentHash,
    returnEvidenceHash: expectedReturnEvidenceHash,
    sourceReviewEvidenceHash: expectedSourceReviewEvidenceHash,
    returnDecisionRequestHash: clean(hosReturn.returnDecisionRequestHash).toLowerCase(),
    returnDecisionEvidenceHash: clean(hosReturn.returnDecisionEvidenceHash).toLowerCase(),
  };
}

function assertCycleAwaitingHosCorrection(input: {
  cycle: CycleRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  sourceReviewEvidenceHash: string;
}) {
  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).headteacherSupervisoryReview,
  );
  if (
    clean(cycleReview.state) !== "RETURNED_FOR_CORRECTION" ||
    clean(cycleReview.currentReviewId) !== input.sourceReview.id ||
    Number(cycleReview.currentReviewStage) !== input.sourceReview.stage ||
    normalized(cycleReview.currentReviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(cycleReview.currentReviewerAssignmentId) !==
      clean(input.sourceReview.reviewerAssignmentId) ||
    clean(cycleReview.admittedAssessmentId) !== input.source.id ||
    Number(cycleReview.admittedAssessmentRevision) !== input.source.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      clean(input.source.assessmentHash).toLowerCase() ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !==
      input.sourceReviewEvidenceHash ||
    cycleReview.awaitingRevision !== true ||
    cycleReview.awaitingDirectorAdmission !== false ||
    cycleReview.directorReviewCreated !== false ||
    cycleReview.preserveReturningReviewerForCorrection !== true ||
    cycleReview.staffFeedbackIncluded !== false ||
    cycleReview.respondentIdentitiesIncluded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_CYCLE_PROVENANCE_DRIFT", 409);
  }
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.id !== clean(input.sourceReview.reviewerAssignmentId) ||
    assignment.userId !== input.sourceReview.reviewerUserId ||
    normalized(assignment.role) !== "HEAD_OF_SUPERVISION" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.cycle.scopeZoneId ||
    assignment.zone.id !== input.cycle.scopeZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
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

function requireReturningHosAssignment(input: {
  assignments: AssignmentRecord[];
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
  now: Date;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      sourceReview: input.sourceReview,
      cycle: input.cycle,
      now: input.now,
    }),
  );
  if (matches.length === 0) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_ASSIGNMENT_REQUIRED", 409);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_ASSIGNMENT_AMBIGUOUS", 409);
  }
  return matches[0];
}

function hosContinuationReviewMetadata(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  assignment: AssignmentRecord;
  reviewEvidenceHash: string;
  returnEvidenceHash: string;
  sourceReviewEvidenceHash: string;
  returnDecisionRequestHash: string;
  returnDecisionEvidenceHash: string;
  visitContextHash: string;
}) {
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.evidenceStream,
    reviewType: "HOS_SUPERVISORY_REVIEW",
    continuationType: "CORRECTED_ASSESSMENT",
    reviewStage: input.sourceReview.stage,
    reviewerRole: "HEAD_OF_SUPERVISION",
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.current.id,
    assessmentRevision: input.current.revision,
    assessmentHash: clean(input.current.assessmentHash).toLowerCase(),
    immutableEvidenceReverified: true,
    correctionContinuation: true,
    sourceAssessmentId: input.source.id,
    sourceAssessmentRevision: input.source.revision,
    sourceAssessmentHash: clean(input.source.assessmentHash).toLowerCase(),
    sourceReturnReviewId: input.sourceReview.id,
    sourceReturnReviewStage: input.sourceReview.stage,
    sourceReturnEvidenceHash: input.returnEvidenceHash,
    sourceReturnReviewEvidenceHash: input.sourceReviewEvidenceHash,
    sourceReturnDecisionRequestHash: input.returnDecisionRequestHash,
    sourceReturnDecisionEvidenceHash: input.returnDecisionEvidenceHash,
    continuedFromReviewId: input.sourceReview.id,
    continuedFromStage: input.sourceReview.stage,
    preserveReturningReviewer: true,
    preserveReviewStage: true,
    visitContextHash: input.visitContextHash,
    sourceVisitContextHash: input.visitContextHash,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationAllowed: false,
    assessmentMutationAllowed: false,
    notificationsSeeded: false,
    providerCalled: false,
    reviewerAssignmentZoneId: input.assignment.zoneId,
  };
}

function cycleMetadataForHosContinuation(input: {
  cycleMetadata: unknown;
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  continuedReview: ReviewRecord;
  reviewEvidenceHash: string;
  returnEvidenceHash: string;
  sourceReviewEvidenceHash: string;
  visitContextHash: string;
  continuedAt: Date;
}) {
  const existing = objectValue(
    objectValue(input.cycleMetadata).headteacherSupervisoryReview,
  );
  return {
    ...objectValue(input.cycleMetadata),
    headteacherSupervisoryReview: {
      ...existing,
      schemaVersion: 1,
      state: "HOS_REVIEW_PENDING",
      currentReviewId: input.continuedReview.id,
      currentReviewStage: input.continuedReview.stage,
      currentReviewerRole: "HEAD_OF_SUPERVISION",
      currentReviewerAssignmentId: input.continuedReview.reviewerAssignmentId,
      reviewEvidenceHash: input.reviewEvidenceHash,
      admittedAssessmentId: input.current.id,
      admittedAssessmentRevision: input.current.revision,
      assessmentHash: clean(input.current.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
      correctionContinuation: true,
      sourceAssessmentId: input.source.id,
      sourceAssessmentRevision: input.source.revision,
      sourceReturnReviewId: input.sourceReview.id,
      sourceReturnReviewStage: input.sourceReview.stage,
      sourceReturnEvidenceHash: input.returnEvidenceHash,
      sourceReturnReviewEvidenceHash: input.sourceReviewEvidenceHash,
      sourceReviewDecision: "RETURNED",
      awaitingRevision: false,
      awaitingDirectorAdmission: false,
      directorReviewCreated: false,
      preserveReturningReviewerForCorrection: true,
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      notificationsSeeded: false,
      providerCalled: false,
      continuedAt: input.continuedAt.toISOString(),
    },
  };
}

function assertExistingHosContinuation(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
  existingReview: ReviewRecord;
  expectedReviewEvidenceHash: string;
  returnEvidenceHash: string;
  sourceReviewEvidenceHash: string;
  visitContextHash: string;
}) {
  const metadata = objectValue(input.existingReview.metadata);
  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).headteacherSupervisoryReview,
  );
  if (
    input.existingReview.cycleId !== input.current.cycleId ||
    input.existingReview.assessmentId !== input.current.id ||
    input.existingReview.stage !== input.sourceReview.stage ||
    input.existingReview.reviewerUserId !== input.sourceReview.reviewerUserId ||
    input.existingReview.reviewerAssignmentId !==
      input.sourceReview.reviewerAssignmentId ||
    normalized(input.existingReview.decision) !== "PENDING" ||
    clean(input.existingReview.note) ||
    input.existingReview.decidedAt ||
    clean(metadata.reviewType) !== "HOS_SUPERVISORY_REVIEW" ||
    clean(metadata.continuationType) !== "CORRECTED_ASSESSMENT" ||
    normalized(metadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
    Number(metadata.reviewStage) !== input.sourceReview.stage ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    clean(metadata.assessmentHash).toLowerCase() !==
      clean(input.current.assessmentHash).toLowerCase() ||
    metadata.correctionContinuation !== true ||
    clean(metadata.sourceAssessmentId) !== input.source.id ||
    Number(metadata.sourceAssessmentRevision) !== input.source.revision ||
    clean(metadata.sourceAssessmentHash).toLowerCase() !==
      clean(input.source.assessmentHash).toLowerCase() ||
    clean(metadata.sourceReturnReviewId) !== input.sourceReview.id ||
    Number(metadata.sourceReturnReviewStage) !== input.sourceReview.stage ||
    clean(metadata.sourceReturnEvidenceHash).toLowerCase() !==
      input.returnEvidenceHash ||
    clean(metadata.sourceReturnReviewEvidenceHash).toLowerCase() !==
      input.sourceReviewEvidenceHash ||
    metadata.preserveReturningReviewer !== true ||
    metadata.preserveReviewStage !== true ||
    clean(metadata.visitContextHash).toLowerCase() !== input.visitContextHash ||
    metadata.staffFeedbackIncluded !== false ||
    metadata.respondentIdentitiesIncluded !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteVisitEvidence !== false ||
    metadata.scoreMutationAllowed !== false ||
    metadata.assessmentMutationAllowed !== false ||
    metadata.providerCalled !== false ||
    clean(cycleReview.state) !== "HOS_REVIEW_PENDING" ||
    clean(cycleReview.currentReviewId) !== input.existingReview.id ||
    Number(cycleReview.currentReviewStage) !== input.existingReview.stage ||
    normalized(cycleReview.currentReviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(cycleReview.currentReviewerAssignmentId) !==
      clean(input.existingReview.reviewerAssignmentId) ||
    clean(cycleReview.admittedAssessmentId) !== input.current.id ||
    Number(cycleReview.admittedAssessmentRevision) !== input.current.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      clean(input.current.assessmentHash).toLowerCase() ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    cycleReview.correctionContinuation !== true ||
    clean(cycleReview.sourceReturnReviewId) !== input.sourceReview.id ||
    Number(cycleReview.sourceReturnReviewStage) !== input.sourceReview.stage ||
    cycleReview.awaitingRevision !== false ||
    cycleReview.awaitingDirectorAdmission !== false ||
    cycleReview.directorReviewCreated !== false ||
    cycleReview.preserveReturningReviewerForCorrection !== true ||
    cycleReview.staffFeedbackIncluded !== false ||
    cycleReview.respondentIdentitiesIncluded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_EXISTING_REVIEW_DRIFT", 409);
  }
}

function hosResult(input: {
  outcome: "CREATED" | "EXISTING_REVIEW";
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  review: ReviewRecord;
  reviewEvidenceHash: string;
}): EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult {
  return {
    outcome: input.outcome,
    continuationRequired: true,
    continuationReviewerRole: "HEAD_OF_SUPERVISION",
    cycleId: input.current.cycleId,
    assessmentId: input.current.id,
    assessmentRevision: input.current.revision,
    assessmentStatus: "FINALIZED",
    sourceAssessmentId: input.source.id,
    sourceReviewId: input.sourceReview.id,
    sourceReviewStage: input.sourceReview.stage,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "PENDING",
    reviewerUserId: input.review.reviewerUserId,
    reviewerAssignmentId: input.review.reviewerAssignmentId,
    reviewEvidenceHash: input.reviewEvidenceHash,
    reviewCreated: input.outcome === "CREATED",
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    providerCalled: false,
  };
}

async function readAssessment(
  database: HeadteacherSupervisoryCorrectionContinuationDatabase,
  assessmentId: string,
) {
  const assessment = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: ASSESSMENT_SELECT,
  });
  if (!assessment) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_ASSESSMENT_NOT_FOUND", 404);
  }
  return assessment;
}

async function runHosContinuation(input: {
  request: EnsureHeadteacherSupervisoryCorrectionReviewContinuationInput;
  database: HeadteacherSupervisoryCorrectionContinuationDatabase;
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  now: Date;
  reqId: string;
}): Promise<EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult> {
  return input.database.$transaction(
    async (tx) => {
      const current = await tx.appraisalAssessment.findUnique({
        where: { id: input.current.id },
        select: ASSESSMENT_SELECT,
      });
      const source = await tx.appraisalAssessment.findUnique({
        where: { id: input.source.id },
        select: ASSESSMENT_SELECT,
      });
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: input.current.cycleId },
        select: CYCLE_SELECT,
      });
      const sourceReview = await tx.appraisalReview.findUnique({
        where: { id: input.sourceReview.id },
        select: REVIEW_SELECT,
      });
      if (!current || !source || !cycle || !sourceReview) {
        fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_TRANSACTION_STATE_MISSING", 409);
      }
      assertCurrentFinalizedBoundary(current, input.request.actorUserId);
      assertCorrectionLineage({ current, source });
      assertHosCycleBoundary(cycle);
      const sourceProof = assertHosSourceReturn({
        current,
        source,
        sourceReview,
        cycle,
      });

      const currentReviews = await tx.appraisalReview.findMany({
        where: { assessmentId: current.id },
        select: REVIEW_SELECT,
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      });

      const expectedReviewEvidenceHash = hosReviewEvidenceHash({
        assessment: current,
        cycle,
        reviewerUserId: sourceReview.reviewerUserId,
        reviewerAssignmentId: clean(sourceReview.reviewerAssignmentId),
        visitContextHash: sourceProof.sourceVisitHash,
      });

      if (currentReviews.length > 0) {
        if (currentReviews.length !== 1) {
          fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_REVIEW_CHAIN_DRIFT", 409);
        }
        const existingReview = currentReviews[0];
        assertExistingHosContinuation({
          current,
          source,
          sourceReview,
          cycle,
          existingReview,
          expectedReviewEvidenceHash,
          returnEvidenceHash: sourceProof.returnEvidenceHash,
          sourceReviewEvidenceHash: sourceProof.sourceReviewEvidenceHash,
          visitContextHash: sourceProof.sourceVisitHash,
        });
        return hosResult({
          outcome: "EXISTING_REVIEW",
          current,
          source,
          sourceReview,
          review: existingReview,
          reviewEvidenceHash: expectedReviewEvidenceHash,
        });
      }

      assertCycleAwaitingHosCorrection({
        cycle,
        source,
        sourceReview,
        sourceReviewEvidenceHash: sourceProof.sourceReviewEvidenceHash,
      });

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: {
          id: clean(sourceReview.reviewerAssignmentId),
          userId: sourceReview.reviewerUserId,
          role: "HEAD_OF_SUPERVISION",
          status: "ACTIVE",
          zoneId: cycle.scopeZoneId,
        },
        select: ASSIGNMENT_SELECT,
      });
      const assignment = requireReturningHosAssignment({
        assignments,
        sourceReview,
        cycle,
        now: input.now,
      });

      const continuedReview = await tx.appraisalReview.create({
        data: {
          cycleId: cycle.id,
          assessmentId: current.id,
          reviewerUserId: sourceReview.reviewerUserId,
          reviewerAssignmentId: assignment.id,
          stage: sourceReview.stage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata: hosContinuationReviewMetadata({
            current,
            source,
            sourceReview,
            assignment,
            reviewEvidenceHash: expectedReviewEvidenceHash,
            returnEvidenceHash: sourceProof.returnEvidenceHash,
            sourceReviewEvidenceHash: sourceProof.sourceReviewEvidenceHash,
            returnDecisionRequestHash: sourceProof.returnDecisionRequestHash,
            returnDecisionEvidenceHash: sourceProof.returnDecisionEvidenceHash,
            visitContextHash: sourceProof.sourceVisitHash,
          }),
        },
        select: REVIEW_SELECT,
      });

      const cycleUpdated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "UNDER_REVIEW",
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          metadata: cycleMetadataForHosContinuation({
            cycleMetadata: cycle.metadata,
            current,
            source,
            sourceReview,
            continuedReview,
            reviewEvidenceHash: expectedReviewEvidenceHash,
            returnEvidenceHash: sourceProof.returnEvidenceHash,
            sourceReviewEvidenceHash: sourceProof.sourceReviewEvidenceHash,
            visitContextHash: sourceProof.sourceVisitHash,
            continuedAt: input.now,
          }),
        },
      });
      if (cycleUpdated.count !== 1) {
        fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CYCLE_WRITE_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: clean(cycle.targetTenantId),
          userId: input.request.actorUserId,
          action: HOS_CORRECTION_CONTINUED_AUDIT_ACTION,
          resource: "AppraisalReview",
          resourceId: continuedReview.id,
          ip: input.request.ip ?? undefined,
          userAgent: input.request.userAgent ?? undefined,
          metadata: {
            reqId: input.reqId,
            action: HOS_CORRECTION_CONTINUED_AUDIT_ACTION,
            workflow:
              HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.workflow,
            evidenceStream:
              HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.evidenceStream,
            cycleId: cycle.id,
            correctedAssessmentId: current.id,
            correctedAssessmentRevision: current.revision,
            correctedAssessmentHash: clean(current.assessmentHash).toLowerCase(),
            sourceAssessmentId: source.id,
            sourceAssessmentRevision: source.revision,
            sourceAssessmentHash: clean(source.assessmentHash).toLowerCase(),
            sourceReturnReviewId: sourceReview.id,
            sourceReturnReviewStage: sourceReview.stage,
            continuedReviewStage: continuedReview.stage,
            returningReviewerRole: "HEAD_OF_SUPERVISION",
            returningReviewerAssignmentId: assignment.id,
            returnEvidenceHash: sourceProof.returnEvidenceHash,
            sourceReturnReviewEvidenceHash: sourceProof.sourceReviewEvidenceHash,
            correctedReviewEvidenceHash: expectedReviewEvidenceHash,
            visitContextHash: sourceProof.sourceVisitHash,
            preserveReturningReviewer: true,
            preserveReviewStage: true,
            reasonTextRecordedInAudit: false,
            scoreValuesRecordedInAudit: false,
            staffFeedbackIncluded: false,
            respondentIdentitiesIncluded: false,
            scoreMutationPerformed: false,
            visitEvidenceMutationPerformed: false,
            assessmentMutationPerformed: false,
            cycleStatusChanged: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return hosResult({
        outcome: "CREATED",
        current,
        source,
        sourceReview,
        review: continuedReview,
        reviewEvidenceHash: expectedReviewEvidenceHash,
      });
    },
    transactionOptions(),
  );
}


function directorCorrectionAssessorRole(actorRoleName: unknown) {
  const role = canonicalHeadteacherSupervisoryAssessorRole(actorRoleName);
  if (
    role !==
    HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.directorReturnCorrectionAssessorRole
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_SOURCE_ROLE_INVALID",
      409,
      {
        actorRole: normalized(actorRoleName),
        requiredRole:
          HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.directorReturnCorrectionAssessorRole,
      },
    );
  }
  return "HEAD_OF_SUPERVISION" as const;
}

function directorGovernanceReviewEvidenceHash(input: {
  current: AssessmentRecord;
  cycle: CycleRecord;
  sourceReview: ReviewRecord;
  reviewerAssignmentId: string;
  assessorRole: "HEAD_OF_SUPERVISION";
  visitContextHash: string;
  sourceReviewEvidenceHash: string;
  sourceDecisionRequestHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    assessment: {
      id: input.current.id,
      cycleId: input.current.cycleId,
      revision: input.current.revision,
      assessmentHash: clean(input.current.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
      assessorRole: input.assessorRole,
      assessorAssignmentId: input.current.assessorAssignmentId,
    },
    review: {
      stage: input.sourceReview.stage,
      reviewerUserId: input.sourceReview.reviewerUserId,
      reviewerAssignmentId: input.reviewerAssignmentId,
      reviewerRole: "DISTRICT_DIRECTOR",
    },
    admission: {
      type: "CORRECTED_ASSESSMENT",
      sourceReviewId: input.sourceReview.id,
      sourceReviewStage: input.sourceReview.stage,
      sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
      sourceDecisionRequestHash: input.sourceDecisionRequestHash,
      sourceDecisionEvidenceHash: null,
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
  });
}

function assertDirectorReturnProvenance(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
}) {
  const currentMetadata = objectValue(input.current.metadata);
  const sourceMetadata = objectValue(input.source.metadata);
  const reviewMetadata = objectValue(input.sourceReview.metadata);
  const expectedReturnEvidenceHash = correctionReturnEvidenceHash(
    input.source,
    input.sourceReview,
  );
  const sourceReviewEvidenceHash = clean(
    reviewMetadata.reviewEvidenceHash,
  ).toLowerCase();
  const sourceDecisionRequestHash = clean(
    reviewMetadata.decisionRequestHash,
  ).toLowerCase();
  const sourceDecisionContractHash = clean(
    reviewMetadata.decisionContractHash,
  ).toLowerCase();
  const sourceVisitContextHash = clean(
    objectValue(input.source.metadata).visitContextHash,
  ).toLowerCase();

  if (
    clean(reviewMetadata.reviewType) !== "DIRECTOR_GOVERNANCE_REVIEW" ||
    normalized(reviewMetadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    canonicalHeadteacherSupervisoryAssessorRole(reviewMetadata.assessorRole) !==
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.directorReturnCorrectionAssessorRole ||
    Number(reviewMetadata.reviewStage) !== input.sourceReview.stage ||
    normalized(input.sourceReview.decision) !== "RETURNED" ||
    clean(reviewMetadata.decisionAction) !== "RETURN" ||
    normalized(reviewMetadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    !input.sourceReview.decidedAt ||
    !clean(input.sourceReview.note) ||
    input.sourceReview.cycleId !== input.source.cycleId ||
    input.sourceReview.assessmentId !== input.source.id ||
    !clean(input.sourceReview.reviewerAssignmentId) ||
    !isSha256(sourceReviewEvidenceHash) ||
    !isSha256(sourceDecisionRequestHash) ||
    !isSha256(sourceDecisionContractHash) ||
    !isSha256(sourceVisitContextHash) ||
    clean(sourceMetadata.returnedByDirectorReviewId) !== input.sourceReview.id ||
    Number(sourceMetadata.returnedByDirectorReviewStage) !==
      input.sourceReview.stage ||
    clean(sourceMetadata.returnDecisionContractHash).toLowerCase() !==
      sourceDecisionContractHash ||
    clean(sourceMetadata.returnDecisionRequestHash).toLowerCase() !==
      sourceDecisionRequestHash ||
    clean(currentMetadata.returnReviewId) !== input.sourceReview.id ||
    Number(currentMetadata.returnReviewStage) !== input.sourceReview.stage ||
    clean(currentMetadata.returnEvidenceHash).toLowerCase() !==
      expectedReturnEvidenceHash ||
    reviewMetadata.immutableEvidenceReverified !== true ||
    reviewMetadata.staffFeedbackIncluded !== false ||
    reviewMetadata.respondentIdentitiesIncluded !== false ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.reviewerMayRewriteVisitEvidence !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.visitEvidenceMutationPerformed !== false ||
    reviewMetadata.combinedWeightingDefined !== false ||
    reviewMetadata.providerCalled !== false ||
    sourceMetadata.separateFromStaffFeedback !== true ||
    sourceMetadata.combinedWeightingDefined !== false ||
    sourceMetadata.providerCalled !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_RETURN_PROVENANCE_DRIFT",
      409,
    );
  }

  return {
    returnEvidenceHash: expectedReturnEvidenceHash,
    sourceReviewEvidenceHash,
    sourceDecisionRequestHash,
    sourceDecisionContractHash,
    visitContextHash: sourceVisitContextHash,
  };
}

function assertDirectorCarrierReturnProof(input: {
  cycle: CycleRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  sourceDecisionContractHash: string;
  sourceDecisionRequestHash: string;
}) {
  const carrier = objectValue(
    objectValue(input.cycle.metadata).directorGovernanceReview,
  );

  if (
    Number(carrier.schemaVersion) !== 1 ||
    clean(carrier.state) !== "RETURNED_FOR_CORRECTION" ||
    clean(carrier.assessmentId) !== input.source.id ||
    Number(carrier.assessmentRevision) !== input.source.revision ||
    clean(carrier.sourceReviewId) !== input.sourceReview.id ||
    Number(carrier.sourceReviewStage) !== input.sourceReview.stage ||
    clean(carrier.decision) !== "RETURN" ||
    clean(carrier.decisionContractHash).toLowerCase() !==
      input.sourceDecisionContractHash ||
    clean(carrier.decisionRequestHash).toLowerCase() !==
      input.sourceDecisionRequestHash ||
    clean(carrier.currentReviewId) !== input.sourceReview.id ||
    Number(carrier.currentReviewStage) !== input.sourceReview.stage ||
    carrier.revisionRequired !== true ||
    carrier.staffFeedbackIncluded !== false ||
    carrier.respondentIdentitiesIncluded !== false ||
    carrier.carrierCycleStatusMutationPerformed !== false ||
    carrier.carrierCycleTimestampMutationPerformed !== false ||
    carrier.reviewerMayRewriteScores !== false ||
    carrier.scoreMutationAllowed !== false ||
    carrier.combinedWeightingDefined !== false ||
    carrier.providerCalled !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_CARRIER_RETURN_PROOF_DRIFT",
      409,
    );
  }
}

function assertDirectorCarrierPendingProof(input: {
  cycle: CycleRecord;
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  existing: ReviewRecord;
  expectedReviewEvidenceHash: string;
}) {
  const carrier = objectValue(
    objectValue(input.cycle.metadata).directorGovernanceReview,
  );

  if (
    Number(carrier.schemaVersion) !== 1 ||
    clean(carrier.state) !== "PENDING" ||
    clean(carrier.assessmentId) !== input.current.id ||
    Number(carrier.assessmentRevision) !== input.current.revision ||
    clean(carrier.reviewId) !== input.existing.id ||
    Number(carrier.reviewStage) !== input.existing.stage ||
    clean(carrier.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    clean(carrier.admissionType) !== "CORRECTED_ASSESSMENT" ||
    clean(carrier.continuedFromAssessmentId) !== input.source.id ||
    clean(carrier.continuedFromReviewId) !== input.sourceReview.id ||
    carrier.preserveReturningReviewer !== true ||
    carrier.preserveReviewStage !== true ||
    carrier.staffFeedbackIncluded !== false ||
    carrier.respondentIdentitiesIncluded !== false ||
    carrier.carrierCycleStatusMutationPerformed !== false ||
    carrier.carrierCycleTimestampMutationPerformed !== false ||
    carrier.reviewerMayRewriteScores !== false ||
    carrier.scoreMutationAllowed !== false ||
    carrier.combinedWeightingDefined !== false ||
    carrier.providerCalled !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_CARRIER_PENDING_PROOF_DRIFT",
      409,
    );
  }
}

function directorAssignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.id !== clean(input.sourceReview.reviewerAssignmentId) ||
    assignment.userId !== input.sourceReview.reviewerUserId ||
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.cycle.scopeZoneId ||
    assignment.zone.id !== input.cycle.scopeZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
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

function requireReturningDirectorAssignment(input: {
  assignments: AssignmentRecord[];
  sourceReview: ReviewRecord;
  cycle: CycleRecord;
  now: Date;
}) {
  const matches = input.assignments.filter((assignment) =>
    directorAssignmentIsCurrent({
      assignment,
      sourceReview: input.sourceReview,
      cycle: input.cycle,
      now: input.now,
    }),
  );
  if (matches.length === 0) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_ASSIGNMENT_REQUIRED",
      409,
    );
  }
  if (matches.length !== 1) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_ASSIGNMENT_AMBIGUOUS",
      409,
    );
  }
  return matches[0];
}

function directorContinuationMetadata(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  assignment: AssignmentRecord;
  assessorRole: "HEAD_OF_SUPERVISION";
  reviewEvidenceHash: string;
  returnEvidenceHash: string;
  sourceReviewEvidenceHash: string;
  sourceDecisionRequestHash: string;
  visitContextHash: string;
}) {
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    reviewType: "DIRECTOR_GOVERNANCE_REVIEW",
    continuationType: "CORRECTED_ASSESSMENT",
    reviewStage: input.sourceReview.stage,
    reviewerRole: "DISTRICT_DIRECTOR",
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.current.id,
    assessmentRevision: input.current.revision,
    assessmentHash: clean(input.current.assessmentHash).toLowerCase(),
    visitContextHash: input.visitContextHash,
    assessorRole: input.assessorRole,
    admissionType: "CORRECTED_ASSESSMENT",
    admittedFromReviewId: input.sourceReview.id,
    admittedFromReviewStage: input.sourceReview.stage,
    admittedFromReviewEvidenceHash: input.sourceReviewEvidenceHash,
    admittedFromDecisionRequestHash: input.sourceDecisionRequestHash,
    admittedFromDecisionEvidenceHash: null,
    hosForwardVerified: false,
    immutableEvidenceReverified: true,
    sourceAssessmentId: input.source.id,
    sourceAssessmentRevision: input.source.revision,
    sourceAssessmentHash: clean(input.source.assessmentHash).toLowerCase(),
    continuedFromAssessmentId: input.source.id,
    continuedFromAssessmentRevision: input.source.revision,
    continuedFromReviewId: input.sourceReview.id,
    continuedFromStage: input.sourceReview.stage,
    returnEvidenceHash: input.returnEvidenceHash,
    preserveReturningReviewer: true,
    preserveReviewStage: true,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationAllowed: false,
    assessmentMutationAllowed: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
    reviewerAssignmentZoneId: input.assignment.zoneId,
  };
}

function assertExistingDirectorContinuation(input: {
  current: AssessmentRecord;
  source: AssessmentRecord;
  sourceReview: ReviewRecord;
  existing: ReviewRecord;
  expectedReviewEvidenceHash: string;
  returnEvidenceHash: string;
  sourceReviewEvidenceHash: string;
  sourceDecisionRequestHash: string;
  visitContextHash: string;
}) {
  const metadata = objectValue(input.existing.metadata);
  if (
    input.existing.cycleId !== input.current.cycleId ||
    input.existing.assessmentId !== input.current.id ||
    input.existing.stage !== input.sourceReview.stage ||
    input.existing.reviewerUserId !== input.sourceReview.reviewerUserId ||
    input.existing.reviewerAssignmentId !== input.sourceReview.reviewerAssignmentId ||
    normalized(input.existing.decision) !== "PENDING" ||
    clean(input.existing.note) ||
    input.existing.decidedAt ||
    clean(metadata.reviewType) !== "DIRECTOR_GOVERNANCE_REVIEW" ||
    clean(metadata.continuationType) !== "CORRECTED_ASSESSMENT" ||
    normalized(metadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    Number(metadata.reviewStage) !== input.sourceReview.stage ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    clean(metadata.assessmentHash).toLowerCase() !==
      clean(input.current.assessmentHash).toLowerCase() ||
    clean(metadata.continuedFromAssessmentId) !== input.source.id ||
    clean(metadata.continuedFromReviewId) !== input.sourceReview.id ||
    Number(metadata.continuedFromStage) !== input.sourceReview.stage ||
    clean(metadata.returnEvidenceHash).toLowerCase() !== input.returnEvidenceHash ||
    clean(metadata.admittedFromReviewEvidenceHash).toLowerCase() !==
      input.sourceReviewEvidenceHash ||
    clean(metadata.admittedFromDecisionRequestHash).toLowerCase() !==
      input.sourceDecisionRequestHash ||
    clean(metadata.visitContextHash).toLowerCase() !== input.visitContextHash ||
    metadata.preserveReturningReviewer !== true ||
    metadata.preserveReviewStage !== true ||
    metadata.staffFeedbackIncluded !== false ||
    metadata.respondentIdentitiesIncluded !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteVisitEvidence !== false ||
    metadata.scoreMutationAllowed !== false ||
    metadata.assessmentMutationAllowed !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_EXISTING_REVIEW_DRIFT",
      409,
    );
  }
}

async function ensureDirectorGovernanceCorrectionContinuation(
  input: EnsureHeadteacherSupervisoryCorrectionReviewContinuationInput,
): Promise<EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryCorrectionContinuationDatabase);

  const current = await readAssessment(database, assessmentId);
  assertCurrentFinalizedBoundary(current, actorUserId);
  if (!current.priorAssessmentId || current.revision < 2) {
    return notRequiredResult(current);
  }
  const source = await readAssessment(database, clean(current.priorAssessmentId));
  assertCorrectionLineage({ current, source });
  const cycle = await database.appraisalCycle.findUnique({
    where: { id: current.cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) {
    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CYCLE_NOT_FOUND", 404);
  }
  assertDirectorCarrierBoundary(cycle);

  const currentMetadata = objectValue(current.metadata);
  const sourceReviewId = requireIdentifier(currentMetadata.returnReviewId, "returnReviewId");
  const sourceReviews = await database.appraisalReview.findMany({
    where: { assessmentId: source.id },
    select: REVIEW_SELECT,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const sourceReview = sourceReviews.find((review) => review.id === sourceReviewId);
  if (!sourceReview) {
    fail(
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_SOURCE_REVIEW_NOT_FOUND",
      409,
    );
  }
  const proof = assertDirectorReturnProvenance({
    current,
    source,
    sourceReview,
    cycle,
  });
  const assessorRole = directorCorrectionAssessorRole(input.actorRoleName);
  const expectedReviewEvidenceHash = directorGovernanceReviewEvidenceHash({
    current,
    cycle,
    sourceReview,
    reviewerAssignmentId: clean(sourceReview.reviewerAssignmentId),
    assessorRole,
    visitContextHash: proof.visitContextHash,
    sourceReviewEvidenceHash: proof.sourceReviewEvidenceHash,
    sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
  });

  const currentReviews = await database.appraisalReview.findMany({
    where: { assessmentId: current.id },
    select: REVIEW_SELECT,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  if (currentReviews.length > 0) {
    if (currentReviews.length !== 1) {
      fail(
        "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_REVIEW_CHAIN_DRIFT",
        409,
      );
    }
    const existing = currentReviews[0];
    assertExistingDirectorContinuation({
      current,
      source,
      sourceReview,
      existing,
      expectedReviewEvidenceHash,
      returnEvidenceHash: proof.returnEvidenceHash,
      sourceReviewEvidenceHash: proof.sourceReviewEvidenceHash,
      sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
      visitContextHash: proof.visitContextHash,
    });
    assertDirectorCarrierPendingProof({
      cycle,
      current,
      source,
      sourceReview,
      existing,
      expectedReviewEvidenceHash,
    });
    return {
      outcome: "EXISTING_REVIEW",
      continuationRequired: true,
      continuationReviewerRole: "DISTRICT_DIRECTOR",
      cycleId: current.cycleId,
      assessmentId: current.id,
      assessmentRevision: current.revision,
      assessmentStatus: "FINALIZED",
      sourceAssessmentId: source.id,
      sourceReviewId: sourceReview.id,
      sourceReviewStage: sourceReview.stage,
      reviewId: existing.id,
      reviewStage: existing.stage,
      reviewDecision: "PENDING",
      reviewerUserId: existing.reviewerUserId,
      reviewerAssignmentId: existing.reviewerAssignmentId,
      reviewEvidenceHash: expectedReviewEvidenceHash,
      reviewCreated: false,
      scoreMutationPerformed: false,
      visitEvidenceMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      providerCalled: false,
    };
  }

  assertDirectorCarrierReturnProof({
    cycle,
    source,
    sourceReview,
    sourceDecisionContractHash: proof.sourceDecisionContractHash,
    sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
  });

  return database.$transaction(
    async (tx) => {
      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: {
          id: clean(sourceReview.reviewerAssignmentId),
          userId: sourceReview.reviewerUserId,
          role: "DISTRICT_DIRECTOR",
          status: "ACTIVE",
          zoneId: cycle.scopeZoneId,
        },
        select: ASSIGNMENT_SELECT,
      });
      const assignment = requireReturningDirectorAssignment({
        assignments,
        sourceReview,
        cycle,
        now,
      });

      const existingRace = await tx.appraisalReview.findMany({
        where: { assessmentId: current.id },
        select: REVIEW_SELECT,
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      });
      if (existingRace.length !== 0) {
        fail(
          "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_WRITE_RACE",
          409,
        );
      }

      const created = await tx.appraisalReview.create({
        data: {
          cycleId: current.cycleId,
          assessmentId: current.id,
          reviewerUserId: sourceReview.reviewerUserId,
          reviewerAssignmentId: assignment.id,
          stage: sourceReview.stage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata: directorContinuationMetadata({
            current,
            source,
            sourceReview,
            assignment,
            assessorRole,
            reviewEvidenceHash: expectedReviewEvidenceHash,
            returnEvidenceHash: proof.returnEvidenceHash,
            sourceReviewEvidenceHash: proof.sourceReviewEvidenceHash,
            sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
            visitContextHash: proof.visitContextHash,
          }),
        },
        select: REVIEW_SELECT,
      });

      const freshCycle = await tx.appraisalCycle.findUnique({
        where: { id: current.cycleId },
        select: CYCLE_SELECT,
      });
      if (!freshCycle) {
        fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CYCLE_NOT_FOUND", 404);
      }
      assertDirectorCarrierBoundary(freshCycle);
      assertDirectorCarrierReturnProof({
        cycle: freshCycle,
        source,
        sourceReview,
        sourceDecisionContractHash: proof.sourceDecisionContractHash,
        sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
      });
      const cycleUpdated = await tx.appraisalCycle.updateMany({
        where: {
          id: freshCycle.id,
          cancelledAt: null,
        },
        data: {
          metadata: {
            ...objectValue(freshCycle.metadata),
            directorGovernanceReview: {
              schemaVersion: 1,
              state: "PENDING",
              assessmentId: current.id,
              assessmentRevision: current.revision,
              reviewId: created.id,
              reviewStage: created.stage,
              reviewEvidenceHash: expectedReviewEvidenceHash,
              admissionType: "CORRECTED_ASSESSMENT",
              continuedFromAssessmentId: source.id,
              continuedFromReviewId: sourceReview.id,
              preserveReturningReviewer: true,
              preserveReviewStage: true,
              staffFeedbackIncluded: false,
              respondentIdentitiesIncluded: false,
              carrierCycleStatusMutationPerformed: false,
              carrierCycleTimestampMutationPerformed: false,
              reviewerMayRewriteScores: false,
              scoreMutationAllowed: false,
              combinedWeightingDefined: false,
              providerCalled: false,
              continuedAt: now.toISOString(),
            },
          },
        },
      });
      if (cycleUpdated.count !== 1) {
        fail(
          "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_CYCLE_WRITE_RACE",
          409,
        );
      }

      await tx.auditLog.create({
        data: {
          tenantId: clean(freshCycle.targetTenantId),
          userId: actorUserId,
          action: "HEADTEACHER_GOVERNANCE_DIRECTOR_CORRECTION_REVIEW_CONTINUED",
          resource: "AppraisalReview",
          resourceId: created.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            cycleId: current.cycleId,
            correctedAssessmentId: current.id,
            correctedAssessmentRevision: current.revision,
            correctedAssessmentHash: clean(current.assessmentHash).toLowerCase(),
            sourceAssessmentId: source.id,
            sourceAssessmentRevision: source.revision,
            sourceAssessmentHash: clean(source.assessmentHash).toLowerCase(),
            sourceReturnReviewId: sourceReview.id,
            sourceReturnReviewStage: sourceReview.stage,
            continuedReviewId: created.id,
            continuedReviewStage: created.stage,
            correctedReviewEvidenceHash: expectedReviewEvidenceHash,
            returnEvidenceHash: proof.returnEvidenceHash,
            sourceReviewEvidenceHash: proof.sourceReviewEvidenceHash,
            sourceDecisionRequestHash: proof.sourceDecisionRequestHash,
            preserveReturningReviewer: true,
            preserveReviewStage: true,
            reasonTextRecordedInAudit: false,
            scoreValuesRecordedInAudit: false,
            staffFeedbackIncluded: false,
            respondentIdentitiesIncluded: false,
            scoreMutationPerformed: false,
            visitEvidenceMutationPerformed: false,
            assessmentMutationPerformed: false,
            cycleStatusChanged: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "CREATED" as const,
        continuationRequired: true,
        continuationReviewerRole: "DISTRICT_DIRECTOR" as const,
        cycleId: current.cycleId,
        assessmentId: current.id,
        assessmentRevision: current.revision,
        assessmentStatus: "FINALIZED" as const,
        sourceAssessmentId: source.id,
        sourceReviewId: sourceReview.id,
        sourceReviewStage: sourceReview.stage,
        reviewId: created.id,
        reviewStage: created.stage,
        reviewDecision: "PENDING" as const,
        reviewerUserId: created.reviewerUserId,
        reviewerAssignmentId: created.reviewerAssignmentId,
        reviewEvidenceHash: expectedReviewEvidenceHash,
        reviewCreated: true,
        scoreMutationPerformed: false as const,
        visitEvidenceMutationPerformed: false as const,
        staffFeedbackIncluded: false as const,
        respondentIdentitiesIncluded: false as const,
        providerCalled: false as const,
      };
    },
    transactionOptions(),
  );
}

export async function ensureHeadteacherSupervisoryCorrectionReviewContinuation(
  input: EnsureHeadteacherSupervisoryCorrectionReviewContinuationInput,
): Promise<EnsureHeadteacherSupervisoryCorrectionReviewContinuationResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryCorrectionContinuationDatabase);
  const dependencies = input.dependencies ?? {
    loadAssessment: loadHeadteacherSupervisoryAssessment,
    ensureDirectorContinuation:
      ensureDirectorGovernanceCorrectionContinuation,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readAssessment(database, assessmentId);
    assertCurrentFinalizedBoundary(current, actorUserId);

    if (current.revision === 1 && !current.priorAssessmentId) {
      return notRequiredResult(current);
    }
    if (
      current.revision <
        HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.minimumCorrectionRevision ||
      !clean(current.priorAssessmentId)
    ) {
      fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_REVISION_LINEAGE_INVALID", 409);
    }

    const currentView = await dependencies.loadAssessment({
      actorUserId,
      actorRoleName: input.actorRoleName,
      assessmentId,
      now,
      ...(input.database
        ? {
            database:
              input.database as unknown as HeadteacherSupervisoryScoringDatabase,
          }
        : {}),
    });
    assertFinalizedViewMatches(current, currentView);

    const source = await readAssessment(database, clean(current.priorAssessmentId));
    assertCorrectionLineage({ current, source });
    const cycle = await database.appraisalCycle.findUnique({
      where: { id: current.cycleId },
      select: CYCLE_SELECT,
    });
    if (!cycle) {
      fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CYCLE_NOT_FOUND", 404);
    }

    const currentMetadata = objectValue(current.metadata);
    const returnReviewId = requireIdentifier(
      currentMetadata.returnReviewId,
      "returnReviewId",
    );
    const sourceReviews = await database.appraisalReview.findMany({
      where: { assessmentId: source.id },
      select: REVIEW_SELECT,
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    });
    const sourceReview = sourceReviews.find((review) => review.id === returnReviewId);
    if (!sourceReview) {
      fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_SOURCE_REVIEW_NOT_FOUND", 409);
    }

    const hosReturn = sourceHosReturnMetadata(source);
    const hasHosReturn = Object.keys(hosReturn).length > 0;
    const hasDirectorReturn = sourceHasDirectorReturn(source);
    if (hasHosReturn && hasDirectorReturn) {
      fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_AMBIGUOUS_RETURN_PROVENANCE", 409);
    }

    if (hasHosReturn) {
      assertHosCycleBoundary(cycle);
      assertEligibleHosCorrectionAssessorRole(input.actorRoleName);
      assertHosSourceReturn({
        current,
        source,
        sourceReview,
        cycle,
      });
      try {
        return await runHosContinuation({
          request: { ...input, actorUserId, assessmentId },
          database,
          current,
          source,
          sourceReview,
          now,
          reqId,
        });
      } catch (error) {
        if (attempt === 0 && isRetryableConflict(error)) continue;
        throw error;
      }
    }

    if (hasDirectorReturn) {
      assertDirectorCarrierBoundary(cycle);
      directorCorrectionAssessorRole(input.actorRoleName);
      const directorMetadata = objectValue(source.metadata);
      if (
        clean(directorMetadata.returnedByDirectorReviewId) !== sourceReview.id ||
        Number(directorMetadata.returnedByDirectorReviewStage) !==
          sourceReview.stage ||
        normalized(sourceReview.decision) !== "RETURNED"
      ) {
        fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_RETURN_PROVENANCE_DRIFT", 409);
      }
      const directorResult = await dependencies.ensureDirectorContinuation({
        actorUserId,
        actorRoleName: input.actorRoleName,
        assessmentId,
        reqId,
        ip: input.ip,
        userAgent: input.userAgent,
        now,
        ...(input.database ? { database: input.database } : {}),
      });
      return directorResult;
    }

    fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_RETURN_PROVENANCE_MISSING", 409);
  }

  fail("HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_CONCURRENT_WRITE_FAILED", 409);
}
