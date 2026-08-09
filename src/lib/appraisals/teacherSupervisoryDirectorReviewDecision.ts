import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  TEACHER_SUPERVISORY_REVIEW_POLICY,
  decideTeacherSupervisoryReviewAuthority,
  planTeacherSupervisoryReviewAction,
  type TeacherSupervisoryReviewActionPlan,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  readTeacherSupervisoryReviewPackage,
} from "@/lib/appraisals/teacherSupervisoryReviewPackage";
import {
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_REVIEW_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_REVIEW_POLICY.evidenceStream,
  reviewerRole: "DISTRICT_DIRECTOR",
  allowedActions: ["RETURN", "RELEASE"] as const,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredCurrentReviewDecision: "PENDING",
  returnReviewDecision: "RETURNED",
  releaseReviewDecision: "ACCEPTED",
  returnAssessmentFromStatus: "FINALIZED",
  returnAssessmentToStatus: "RETURNED",
  releaseAssessmentStatus: "FINALIZED",
  releasedCycleStatus: "RELEASED",
  proofSchemaVersion: 1,
  minimumReturnReasonLength: 3,
  maximumReturnReasonLength: 2_000,
  returnCycleStatusChanges: false,
  releaseCycleStatusChanges: true,
  returnedAssessmentRequiresRevision: true,
  preserveReturningReviewerForCorrection: true,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  reviewerMayRewriteObservationDetails: false,
  reviewerMayRewriteGovernanceEnrolmentEvidence: false,
  reviewerMayRewriteTeacherAssignmentProvenance: false,
  reviewerMayRewriteCurriculumProvenance: false,
  scoreMutationAllowed: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

export type TeacherSupervisoryDirectorDecision =
  (typeof TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.allowedActions)[number];

const RETURNED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_DIRECTOR_REVIEW_RETURNED";
const RELEASED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_DIRECTOR_REVIEW_RELEASED";
const RELEASE_METADATA_KEY = "teacherSupervisoryRelease";

export type ExecuteTeacherSupervisoryDirectorDecisionInput = {
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
  database?: TeacherSupervisoryDirectorDecisionDatabase;
  dependencies?: TeacherSupervisoryDirectorDecisionDependencies;
};

export type ExecuteTeacherSupervisoryDirectorDecisionResult = {
  outcome:
    | "RETURNED"
    | "RELEASED"
    | "EXISTING_RETURNED"
    | "EXISTING_RELEASED";
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "RETURNED" | "FINALIZED";
  cycleId: string;
  cycleStatus: "UNDER_REVIEW" | "RELEASED";
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "ACCEPTED";
  reviewerRole: "DISTRICT_DIRECTOR";
  revisionRequired: boolean;
  assessmentHash: string;
  observationContextHash: string;
  sourceReviewEvidenceHash: string;
  reviewChainHash: string | null;
  decisionContractHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  releaseProofHash: string | null;
  decidedAt: string;
  releasedAt: string | null;
  scoreMutationPerformed: false;
  commentMutationPerformed: false;
  providerCalled: false;
};

export type TeacherSupervisoryDirectorDecisionDependencies = {
  readReviewPackage: typeof readTeacherSupervisoryReviewPackage;
  verifyFinalizedEvidence: typeof verifyTeacherSupervisoryFinalizedAssessmentEvidence;
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

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
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
    zoneType: {
      level: number;
    };
  };
};

type CountResult = {
  count: number;
};

export type TeacherSupervisoryDirectorDecisionTransactionClient = {
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

export type TeacherSupervisoryDirectorDecisionDatabase = {
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
      tx: TeacherSupervisoryDirectorDecisionTransactionClient,
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
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function normalizeAction(
  value: unknown,
): TeacherSupervisoryDirectorDecision {
  const action = normalized(value);
  if (
    !TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.allowedActions.includes(
      action as TeacherSupervisoryDirectorDecision,
    )
  ) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_ACTION_FORBIDDEN", 400, {
      action,
    });
  }
  return action as TeacherSupervisoryDirectorDecision;
}

function normalizeReason(
  action: TeacherSupervisoryDirectorDecision,
  value: unknown,
) {
  const reason = clean(value);

  if (action === "RELEASE") {
    if (reason) {
      fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_RELEASE_REASON_FORBIDDEN", 400);
    }
    return null;
  }

  if (
    reason.length <
    TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.minimumReturnReasonLength
  ) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_REASON_REQUIRED", 400);
  }
  if (
    reason.length >
    TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.maximumReturnReasonLength
  ) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_REASON_TOO_LONG", 400);
  }
  return reason;
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  userId: string;
  districtId: string;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.userId !== input.userId ||
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtId ||
    assignment.zone.id !== input.districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    return false;
  }
  if (
    assignment.startsAt &&
    assignment.startsAt.getTime() > input.now.getTime()
  ) {
    return false;
  }
  if (
    assignment.endsAt &&
    assignment.endsAt.getTime() <= input.now.getTime()
  ) {
    return false;
  }
  return true;
}

function requireExactCurrentAssignment(input: {
  assignments: AssignmentRecord[];
  userId: string;
  districtId: string;
  now: Date;
  expectedAssignmentId: string | null;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      userId: input.userId,
      districtId: input.districtId,
      now: input.now,
    }),
  );

  if (matches.length === 0) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_ACTIVE_ASSIGNMENT_REQUIRED",
      403,
    );
  }
  if (matches.length !== 1) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_AMBIGUOUS_ASSIGNMENT", 409, {
      activeAssignments: matches.length,
    });
  }
  if (
    input.expectedAssignmentId &&
    matches[0].id !== input.expectedAssignmentId
  ) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_ASSIGNMENT_DRIFT", 409);
  }

  return matches[0];
}

function decisionContractHash(
  plan: Extract<TeacherSupervisoryReviewActionPlan, { ok: true }>["value"],
) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.workflow,
    action: plan.action,
    reviewDecision: plan.reviewDecision,
    assessmentNextStatus: plan.assessmentNextStatus,
    cycleNextStatus: plan.cycleNextStatus,
    revisionRequired: plan.revisionRequired,
    nextReviewStageRequired: plan.nextReviewStageRequired,
    nextReviewerRole: plan.nextReviewerRole,
    reviewerMayRewriteScores: plan.reviewerMayRewriteScores,
    reviewerMayRewriteComment: plan.reviewerMayRewriteComment,
    assessmentMutationAllowed: plan.assessmentMutationAllowed,
    scoreMutationAllowed: plan.scoreMutationAllowed,
  });
}

function decisionRequestHash(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  review: ReviewRecord;
  reviewerAssignmentId: string;
  action: TeacherSupervisoryDirectorDecision;
  reason: string | null;
  sourceReviewEvidenceHash: string;
  contractHash: string;
}) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.evidenceStream,
    assessment: {
      id: input.evidence.assessmentId,
      cycleId: input.evidence.cycleId,
      revision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
    },
    review: {
      id: input.review.id,
      stage: input.review.stage,
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
    },
    reviewer: {
      userId: input.review.reviewerUserId,
      assignmentId: input.reviewerAssignmentId,
      role: "DISTRICT_DIRECTOR",
    },
    action: input.action,
    reason: input.reason,
    decisionContractHash: input.contractHash,
  });
}

function decisionEvidenceHash(input: {
  decisionRequestHash: string;
  sourceReviewEvidenceHash: string;
}) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.schemaVersion,
    decisionRequestHash: input.decisionRequestHash,
    sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
    nextReviewEvidenceHash: null,
  });
}

function sourceDecisionMetadata(input: {
  sourceMetadata: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  action: TeacherSupervisoryDirectorDecision;
  reason: string | null;
  reviewerAssignmentId: string;
  decisionContractHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  releaseProofHash: string | null;
  reviewChainHash: string | null;
  decidedAt: Date;
}) {
  return {
    ...objectValue(input.sourceMetadata),
    decisionSchemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.schemaVersion,
    decisionAction: input.action,
    decisionContractHash: input.decisionContractHash,
    decisionRequestHash: input.decisionRequestHash,
    decisionEvidenceHash: input.decisionEvidenceHash,
    assessorRole: input.evidence.assessorRole,
    decidedByUserId: input.sourceReview.reviewerUserId,
    decidedByAssignmentId: input.reviewerAssignmentId,
    decidedByRole: "DISTRICT_DIRECTOR",
    decidedAt: input.decidedAt.toISOString(),
    reasonHash: input.reason ? hashJson(input.reason) : null,
    reasonLength: input.reason?.length ?? 0,
    revisionRequired: input.action === "RETURN",
    nextReviewId: null,
    nextReviewStage: null,
    nextReviewerRole: null,
    forwardedReviewEvidenceHash: null,
    preserveReturningReviewerForCorrection: input.action === "RETURN",
    releaseProofHash: input.releaseProofHash,
    reviewChainHash: input.reviewChainHash,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
}

function cycleMetadataForReturn(input: {
  cycleMetadata: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  reviewerAssignmentId: string;
  sourceReviewEvidenceHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  returnedAt: Date;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      ...objectValue(
        objectValue(input.cycleMetadata).teacherSupervisoryReview,
      ),
      schemaVersion: 1,
      state: "RETURNED_FOR_CORRECTION",
      currentReviewId: input.sourceReview.id,
      currentReviewStage: input.sourceReview.stage,
      currentReviewerRole: "DISTRICT_DIRECTOR",
      currentReviewerAssignmentId: input.reviewerAssignmentId,
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
      admittedAssessmentId: input.evidence.assessmentId,
      admittedAssessmentRevision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      preserveReturningReviewerForCorrection: true,
      awaitingRevision: true,
      returnDecisionRequestHash: input.decisionRequestHash,
      returnDecisionEvidenceHash: input.decisionEvidenceHash,
      returnedAt: input.returnedAt.toISOString(),
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
    },
  };
}

function assessmentMetadataForReturn(input: {
  assessmentMetadata: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  reviewerAssignmentId: string;
  sourceReviewEvidenceHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  reason: string;
  returnedAt: Date;
}) {
  return {
    ...objectValue(input.assessmentMetadata),
    teacherSupervisoryReturn: {
      schemaVersion: 1,
      sourceReviewId: input.sourceReview.id,
      sourceReviewStage: input.sourceReview.stage,
      returningReviewerUserId: input.sourceReview.reviewerUserId,
      returningReviewerAssignmentId: input.reviewerAssignmentId,
      returningReviewerRole: "DISTRICT_DIRECTOR",
      sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      returnDecisionRequestHash: input.decisionRequestHash,
      returnDecisionEvidenceHash: input.decisionEvidenceHash,
      reasonHash: hashJson(input.reason),
      reasonLength: input.reason.length,
      returnedAt: input.returnedAt.toISOString(),
      preserveReturningReviewerForCorrection: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      scoreMutationPerformed: false,
      commentMutationPerformed: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
  };
}

function releaseReviewChainHash(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();

  if (!isSha256(reviewEvidenceHash)) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_RELEASE_CHAIN_INVALID",
      409,
    );
  }

  return hashJson({
    schemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.proofSchemaVersion,
    reviewId: review.id,
    reviewStage: review.stage,
    reviewEvidenceHash,
    reviewType: clean(metadata.reviewType) || null,
    sourceReviewId: clean(metadata.sourceReviewId) || null,
    sourceReviewStage:
      Number.isInteger(Number(metadata.sourceReviewStage))
        ? Number(metadata.sourceReviewStage)
        : null,
    sourceReviewDecision: clean(metadata.sourceReviewDecision) || null,
    forwardDecisionRequestHash:
      clean(metadata.forwardDecisionRequestHash).toLowerCase() || null,
    forwardDecisionContractHash:
      clean(metadata.forwardDecisionContractHash).toLowerCase() || null,
    forwardedByUserId: clean(metadata.forwardedByUserId) || null,
    forwardedByAssignmentId:
      clean(metadata.forwardedByAssignmentId) || null,
    sourceAssessmentId: clean(metadata.sourceAssessmentId) || null,
    sourceAssessmentHash:
      clean(metadata.sourceAssessmentHash).toLowerCase() || null,
    sourceReviewEvidenceHash:
      clean(metadata.sourceReviewEvidenceHash).toLowerCase() || null,
    sourceReturnDecisionRequestHash:
      clean(metadata.sourceReturnDecisionRequestHash).toLowerCase() || null,
    sourceReturnDecisionEvidenceHash:
      clean(metadata.sourceReturnDecisionEvidenceHash).toLowerCase() || null,
    continuationFromReturnedReview:
      metadata.continuationFromReturnedReview === true,
    preserveReturningReviewer: metadata.preserveReturningReviewer === true,
    preserveReviewStage: metadata.preserveReviewStage === true,
  });
}

function releaseProofPayload(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  reviewerAssignmentId: string;
  sourceReviewEvidenceHash: string;
  reviewChainHash: string;
  decisionContractHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  releasedAt: Date;
}) {
  return {
    proofSchemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.proofSchemaVersion,
    workflow: TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentStatus: "FINALIZED",
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    assessorUserId: input.evidence.assessorUserId,
    assessorAssignmentId: input.evidence.assessorAssignmentId,
    assessorRole: input.evidence.assessorRole,
    reviewId: input.sourceReview.id,
    reviewStage: input.sourceReview.stage,
    reviewDecision: "ACCEPTED",
    reviewEvidenceHash: input.sourceReviewEvidenceHash,
    reviewChainHash: input.reviewChainHash,
    reviewerUserId: input.sourceReview.reviewerUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    reviewerRole: "DISTRICT_DIRECTOR",
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.decisionRequestHash,
    releaseEvidenceHash: input.decisionEvidenceHash,
    releasedAt: input.releasedAt.toISOString(),
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  } as const;
}

function releaseProofHash(
  proof: ReturnType<typeof releaseProofPayload>,
) {
  return hashJson(proof);
}

function cycleMetadataForRelease(input: {
  cycleMetadata: unknown;
  proof: ReturnType<typeof releaseProofPayload>;
  releaseProofHash: string;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      ...objectValue(
        objectValue(input.cycleMetadata).teacherSupervisoryReview,
      ),
      schemaVersion: 1,
      state: "RELEASED",
      currentReviewId: input.proof.reviewId,
      currentReviewStage: input.proof.reviewStage,
      currentReviewerRole: "DISTRICT_DIRECTOR",
      currentReviewerAssignmentId: input.proof.reviewerAssignmentId,
      reviewEvidenceHash: input.proof.reviewEvidenceHash,
      reviewChainHash: input.proof.reviewChainHash,
      admittedAssessmentId: input.proof.assessmentId,
      admittedAssessmentRevision: input.proof.assessmentRevision,
      assessmentHash: input.proof.assessmentHash,
      observationContextHash: input.proof.observationContextHash,
      releaseProofHash: input.releaseProofHash,
      awaitingRevision: false,
      releasedAt: input.proof.releasedAt,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
    },
    [RELEASE_METADATA_KEY]: {
      ...input.proof,
      releaseProofHash: input.releaseProofHash,
    },
  };
}

function extractReleaseProof(value: unknown) {
  return objectValue(objectValue(value)[RELEASE_METADATA_KEY]);
}

function expectedReleaseProofHash(release: Record<string, unknown>) {
  return hashJson({
    proofSchemaVersion: release.proofSchemaVersion,
    workflow: release.workflow,
    evidenceStream: release.evidenceStream,
    cycleId: release.cycleId,
    assessmentId: release.assessmentId,
    assessmentRevision: release.assessmentRevision,
    assessmentStatus: release.assessmentStatus,
    assessmentHash: release.assessmentHash,
    observationContextHash: release.observationContextHash,
    assessorUserId: release.assessorUserId,
    assessorAssignmentId: release.assessorAssignmentId,
    assessorRole: release.assessorRole,
    reviewId: release.reviewId,
    reviewStage: release.reviewStage,
    reviewDecision: release.reviewDecision,
    reviewEvidenceHash: release.reviewEvidenceHash,
    reviewChainHash: release.reviewChainHash,
    reviewerUserId: release.reviewerUserId,
    reviewerAssignmentId: release.reviewerAssignmentId,
    reviewerRole: release.reviewerRole,
    decisionContractHash: release.decisionContractHash,
    releaseRequestHash: release.releaseRequestHash,
    releaseEvidenceHash: release.releaseEvidenceHash,
    releasedAt: release.releasedAt,
    assessmentMutationPerformed: release.assessmentMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    commentMutationPerformed: release.commentMutationPerformed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    reviewerMayRewriteComment: release.reviewerMayRewriteComment,
    reviewerMayRewriteObservationDetails:
      release.reviewerMayRewriteObservationDetails,
    reviewerMayRewriteGovernanceEnrolmentEvidence:
      release.reviewerMayRewriteGovernanceEnrolmentEvidence,
    reviewerMayRewriteTeacherAssignmentProvenance:
      release.reviewerMayRewriteTeacherAssignmentProvenance,
    reviewerMayRewriteCurriculumProvenance:
      release.reviewerMayRewriteCurriculumProvenance,
    legacyTeacherAppraisalIncluded:
      release.legacyTeacherAppraisalIncluded,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    providerCalled: release.providerCalled,
  });
}

function decisionStateFromReviews(
  reviews: ReviewRecord[],
  actorUserId: string,
) {
  const candidates = reviews.filter(
    (review) =>
      review.reviewerUserId === actorUserId &&
      normalized(objectValue(review.metadata).reviewerRole) ===
        "DISTRICT_DIRECTOR",
  );

  if (candidates.length !== 1) {
    return null;
  }
  return candidates[0];
}

async function existingReturnResult(input: {
  database: TeacherSupervisoryDirectorDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  reason: string;
  review: ReviewRecord;
}): Promise<ExecuteTeacherSupervisoryDirectorDecisionResult> {
  const metadata = objectValue(input.review.metadata);

  if (
    clean(metadata.decisionAction) !== "RETURN" ||
    normalized(input.review.decision) !== "RETURNED" ||
    input.review.note !== input.reason ||
    !input.review.decidedAt ||
    !isSha256(metadata.reviewEvidenceHash) ||
    !isSha256(metadata.assessmentHash) ||
    !isSha256(metadata.observationContextHash) ||
    !isSha256(metadata.decisionContractHash) ||
    !isSha256(metadata.decisionRequestHash) ||
    !isSha256(metadata.decisionEvidenceHash) ||
    clean(metadata.decidedByUserId) !== input.actorUserId ||
    clean(metadata.decidedByAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    clean(metadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    metadata.revisionRequired !== true ||
    metadata.preserveReturningReviewerForCorrection !== true ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteComment !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.commentMutationPerformed !== false ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_REVIEW_DRIFT",
      409,
    );
  }

  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: metadata.assessorRole,
    stage: input.review.stage,
    action: "RETURN",
  });
  if (!planned.ok) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_PLAN_INVALID",
      409,
    );
  }

  const expectedContractHash = decisionContractHash(planned.value);
  if (
    expectedContractHash !==
    clean(metadata.decisionContractHash).toLowerCase() ||
    clean(metadata.reasonHash).toLowerCase() !== hashJson(input.reason) ||
    Number(metadata.reasonLength) !== input.reason.length
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_ALREADY_DECIDED_DIFFERENTLY",
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
      assessmentHash: true,
      metadata: true,
    },
  });
  if (
    !assessment ||
    normalized(assessment.status) !== "RETURNED" ||
    clean(assessment.assessmentHash).toLowerCase() !==
      clean(metadata.assessmentHash).toLowerCase()
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_ASSESSMENT_DRIFT",
      409,
    );
  }

  const cycle = await input.database.appraisalCycle.findUnique({
    where: { id: assessment.cycleId },
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
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
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_CYCLE_DRIFT",
      409,
    );
  }

  return {
    outcome: "EXISTING_RETURNED",
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentStatus: "RETURNED",
    cycleId: cycle.id,
    cycleStatus: "UNDER_REVIEW",
    sourceReviewId: input.review.id,
    sourceReviewStage: input.review.stage,
    sourceReviewDecision: "RETURNED",
    reviewerRole: "DISTRICT_DIRECTOR",
    revisionRequired: true,
    assessmentHash: clean(metadata.assessmentHash).toLowerCase(),
    observationContextHash: clean(
      metadata.observationContextHash,
    ).toLowerCase(),
    sourceReviewEvidenceHash: clean(
      metadata.reviewEvidenceHash,
    ).toLowerCase(),
    reviewChainHash: null,
    decisionContractHash: clean(
      metadata.decisionContractHash,
    ).toLowerCase(),
    decisionRequestHash: clean(
      metadata.decisionRequestHash,
    ).toLowerCase(),
    decisionEvidenceHash: clean(
      metadata.decisionEvidenceHash,
    ).toLowerCase(),
    releaseProofHash: null,
    decidedAt: input.review.decidedAt.toISOString(),
    releasedAt: null,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    providerCalled: false,
  };
}


async function existingReleaseResult(input: {
  database: TeacherSupervisoryDirectorDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  review: ReviewRecord;
}): Promise<ExecuteTeacherSupervisoryDirectorDecisionResult> {
  const metadata = objectValue(input.review.metadata);
  const expectedChainHash = releaseReviewChainHash(input.review);

  if (
    clean(metadata.decisionAction) !== "RELEASE" ||
    normalized(input.review.decision) !== "ACCEPTED" ||
    clean(input.review.note) ||
    !input.review.decidedAt ||
    !isSha256(metadata.reviewEvidenceHash) ||
    !isSha256(metadata.assessmentHash) ||
    !isSha256(metadata.observationContextHash) ||
    !isSha256(metadata.decisionContractHash) ||
    !isSha256(metadata.decisionRequestHash) ||
    !isSha256(metadata.decisionEvidenceHash) ||
    !isSha256(metadata.releaseProofHash) ||
    !isSha256(metadata.reviewChainHash) ||
    clean(metadata.reviewChainHash).toLowerCase() !== expectedChainHash ||
    clean(metadata.decidedByUserId) !== input.actorUserId ||
    clean(metadata.decidedByAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    clean(metadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    metadata.revisionRequired !== false ||
    metadata.preserveReturningReviewerForCorrection !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteComment !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.commentMutationPerformed !== false ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.notificationsSeeded !== false ||
    metadata.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RELEASE_REVIEW_DRIFT",
      409,
    );
  }

  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: metadata.assessorRole,
    stage: input.review.stage,
    action: "RELEASE",
  });
  if (!planned.ok) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RELEASE_PLAN_INVALID",
      409,
    );
  }

  const expectedContractHash = decisionContractHash(planned.value);
  if (
    expectedContractHash !==
      clean(metadata.decisionContractHash).toLowerCase() ||
    metadata.reasonHash !== null ||
    Number(metadata.reasonLength) !== 0
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_ALREADY_DECIDED_DIFFERENTLY",
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
      assessmentHash: true,
      metadata: true,
    },
  });
  if (
    !assessment ||
    normalized(assessment.status) !== "FINALIZED" ||
    clean(assessment.assessmentHash).toLowerCase() !==
      clean(metadata.assessmentHash).toLowerCase()
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RELEASE_ASSESSMENT_DRIFT",
      409,
    );
  }

  const cycle = await input.database.appraisalCycle.findUnique({
    where: { id: assessment.cycleId },
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      status: true,
      reviewStartedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
    },
  });

  const release = extractReleaseProof(cycle?.metadata);
  const storedReleaseProofHash = clean(
    release.releaseProofHash,
  ).toLowerCase();
  const actualReleasedAt = cycle?.releasedAt?.toISOString() ?? "";

  if (
    !cycle ||
    normalized(cycle.status) !== "RELEASED" ||
    !cycle.reviewStartedAt ||
    !cycle.releasedAt ||
    cycle.cancelledAt ||
    Number(release.proofSchemaVersion) !==
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.proofSchemaVersion ||
    clean(release.workflow) !==
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.workflow ||
    clean(release.evidenceStream) !==
      TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.evidenceStream ||
    clean(release.cycleId) !== cycle.id ||
    clean(release.assessmentId) !== assessment.id ||
    Number(release.assessmentRevision) !== assessment.revision ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !==
      clean(assessment.assessmentHash).toLowerCase() ||
    clean(release.observationContextHash).toLowerCase() !==
      clean(metadata.observationContextHash).toLowerCase() ||
    clean(release.reviewId) !== input.review.id ||
    Number(release.reviewStage) !== input.review.stage ||
    normalized(release.reviewDecision) !== "ACCEPTED" ||
    clean(release.reviewEvidenceHash).toLowerCase() !==
      clean(metadata.reviewEvidenceHash).toLowerCase() ||
    clean(release.reviewChainHash).toLowerCase() !==
      clean(metadata.reviewChainHash).toLowerCase() ||
    clean(release.reviewerUserId) !== input.actorUserId ||
    clean(release.reviewerAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    clean(release.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    clean(release.decisionContractHash).toLowerCase() !==
      clean(metadata.decisionContractHash).toLowerCase() ||
    clean(release.releaseRequestHash).toLowerCase() !==
      clean(metadata.decisionRequestHash).toLowerCase() ||
    clean(release.releaseEvidenceHash).toLowerCase() !==
      clean(metadata.decisionEvidenceHash).toLowerCase() ||
    clean(release.releasedAt) !== actualReleasedAt ||
    storedReleaseProofHash !==
      clean(metadata.releaseProofHash).toLowerCase() ||
    !isSha256(storedReleaseProofHash) ||
    expectedReleaseProofHash(release) !== storedReleaseProofHash ||
    release.assessmentMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.commentMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.reviewerMayRewriteComment !== false ||
    release.legacyTeacherAppraisalIncluded !== false ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RELEASE_PROOF_DRIFT",
      409,
    );
  }

  return {
    outcome: "EXISTING_RELEASED",
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentStatus: "FINALIZED",
    cycleId: cycle.id,
    cycleStatus: "RELEASED",
    sourceReviewId: input.review.id,
    sourceReviewStage: input.review.stage,
    sourceReviewDecision: "ACCEPTED",
    reviewerRole: "DISTRICT_DIRECTOR",
    revisionRequired: false,
    assessmentHash: clean(metadata.assessmentHash).toLowerCase(),
    observationContextHash: clean(
      metadata.observationContextHash,
    ).toLowerCase(),
    sourceReviewEvidenceHash: clean(
      metadata.reviewEvidenceHash,
    ).toLowerCase(),
    reviewChainHash: clean(metadata.reviewChainHash).toLowerCase(),
    decisionContractHash: clean(
      metadata.decisionContractHash,
    ).toLowerCase(),
    decisionRequestHash: clean(
      metadata.decisionRequestHash,
    ).toLowerCase(),
    decisionEvidenceHash: clean(
      metadata.decisionEvidenceHash,
    ).toLowerCase(),
    releaseProofHash: storedReleaseProofHash,
    decidedAt: input.review.decidedAt.toISOString(),
    releasedAt: actualReleasedAt,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    providerCalled: false,
  };
}

async function existingDecisionResult(input: {
  database: TeacherSupervisoryDirectorDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  action: TeacherSupervisoryDirectorDecision;
  reason: string | null;
  review: ReviewRecord;
}) {
  if (input.action === "RETURN") {
    if (!input.reason) {
      fail(
        "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RETURN_REASON_MISSING",
        409,
      );
    }
    return existingReturnResult({
      database: input.database,
      actorUserId: input.actorUserId,
      assessmentId: input.assessmentId,
      reason: input.reason,
      review: input.review,
    });
  }

  if (input.reason) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_EXISTING_RELEASE_REASON_DRIFT",
      409,
    );
  }

  return existingReleaseResult({
    database: input.database,
    actorUserId: input.actorUserId,
    assessmentId: input.assessmentId,
    review: input.review,
  });
}
function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

function isWriteRace(error: unknown) {
  return (
    clean((error as { code?: unknown })?.code) ===
    "TEACHER_SUPERVISORY_DIRECTOR_DECISION_WRITE_RACE"
  );
}

async function runDirectorDecision(input: {
  request: ExecuteTeacherSupervisoryDirectorDecisionInput;
  database: TeacherSupervisoryDirectorDecisionDatabase;
  dependencies: TeacherSupervisoryDirectorDecisionDependencies;
  actorUserId: string;
  assessmentId: string;
  action: TeacherSupervisoryDirectorDecision;
  reason: string | null;
  now: Date;
  reqId: string;
  allowWrite: boolean;
}): Promise<ExecuteTeacherSupervisoryDirectorDecisionResult> {
  const initialReviews = await input.database.appraisalReview.findMany({
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

  const initialSource = decisionStateFromReviews(
    initialReviews,
    input.actorUserId,
  );

  if (initialSource && normalized(initialSource.decision) !== "PENDING") {
    return existingDecisionResult({
      database: input.database,
      actorUserId: input.actorUserId,
      assessmentId: input.assessmentId,
      action: input.action,
      reason: input.reason,
      review: initialSource,
    });
  }

  if (!input.allowWrite) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_CONCURRENT_STATE_NOT_VISIBLE",
      409,
    );
  }

  const reviewPackage = await input.dependencies.readReviewPackage({
    actorUserId: input.actorUserId,
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: input.assessmentId,
    governanceScope: input.request.governanceScope,
    now: input.now,
  });

  const evidence = await input.dependencies.verifyFinalizedEvidence({
    assessmentId: input.assessmentId,
  });

  if (
    reviewPackage.review.reviewerRole !== "DISTRICT_DIRECTOR" ||
    reviewPackage.review.decision !== "PENDING" ||
    reviewPackage.assessment.id !== evidence.assessmentId ||
    reviewPackage.assessment.revision !== evidence.revision ||
    reviewPackage.integrity.assessmentHash !== evidence.assessmentHash ||
    reviewPackage.integrity.observationContextHash !==
      evidence.observationContextHash
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_PACKAGE_EVIDENCE_DRIFT",
      409,
    );
  }

  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: evidence.assessorRole,
    stage: reviewPackage.review.stage,
    action: input.action,
  });
  if (!planned.ok) {
    fail(
      `TEACHER_SUPERVISORY_DIRECTOR_DECISION_PLAN_${planned.code}`,
      409,
    );
  }
  const plan = planned.value;

  if (
    plan.action !== input.action ||
    plan.nextReviewStageRequired !== false ||
    plan.nextReviewerRole !== null ||
    plan.reviewerMayRewriteScores !== false ||
    plan.reviewerMayRewriteComment !== false ||
    plan.scoreMutationAllowed !== false ||
    (input.action === "RETURN" &&
      (plan.reviewDecision !== "RETURNED" ||
        plan.assessmentNextStatus !== "RETURNED" ||
        plan.cycleNextStatus !== "UNDER_REVIEW" ||
        plan.revisionRequired !== true ||
        plan.assessmentMutationAllowed !== true)) ||
    (input.action === "RELEASE" &&
      (plan.reviewDecision !== "ACCEPTED" ||
        plan.assessmentNextStatus !== "FINALIZED" ||
        plan.cycleNextStatus !== "RELEASED" ||
        plan.revisionRequired !== false ||
        plan.assessmentMutationAllowed !== false))
  ) {
    fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_PLAN_DRIFT", 409);
  }

  return input.database.$transaction(
    async (tx) => {
      const sourceReview = await tx.appraisalReview.findUnique({
        where: { id: reviewPackage.review.id },
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
        fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_REVIEW_NOT_FOUND", 404);
      }

      if (normalized(sourceReview.decision) !== "PENDING") {
        return existingDecisionResult({
          database: tx as unknown as TeacherSupervisoryDirectorDecisionDatabase,
          actorUserId: input.actorUserId,
          assessmentId: input.assessmentId,
          action: input.action,
          reason: input.reason,
          review: sourceReview,
        });
      }

      const sourceMetadata = objectValue(sourceReview.metadata);
      if (
        sourceReview.assessmentId !== evidence.assessmentId ||
        sourceReview.cycleId !== evidence.cycleId ||
        sourceReview.reviewerUserId !== input.actorUserId ||
        !clean(sourceReview.reviewerAssignmentId) ||
        sourceReview.stage !== reviewPackage.review.stage ||
        clean(sourceReview.note) ||
        sourceReview.decidedAt ||
        clean(sourceMetadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
        clean(sourceMetadata.reviewEvidenceHash).toLowerCase() !==
          reviewPackage.integrity.reviewEvidenceHash ||
        clean(sourceMetadata.assessmentHash).toLowerCase() !==
          evidence.assessmentHash ||
        clean(sourceMetadata.observationContextHash).toLowerCase() !==
          evidence.observationContextHash
      ) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DECISION_CURRENT_REVIEW_DRIFT",
          409,
        );
      }

      const assessment = await tx.appraisalAssessment.findUnique({
        where: { id: evidence.assessmentId },
        select: {
          id: true,
          cycleId: true,
          status: true,
          revision: true,
          assessorUserId: true,
          assessmentHash: true,
          metadata: true,
        },
      });
      if (
        !assessment ||
        assessment.cycleId !== evidence.cycleId ||
        assessment.revision !== evidence.revision ||
        normalized(assessment.status) !== "FINALIZED" ||
        clean(assessment.assessmentHash).toLowerCase() !==
          evidence.assessmentHash
      ) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DECISION_ASSESSMENT_DRIFT",
          409,
        );
      }

      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: evidence.cycleId },
        select: {
          id: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
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
        cycle.scopeZoneId !== evidence.targetDistrictZoneId ||
        cycle.targetUserId !== evidence.targetUserId ||
        cycle.targetTenantId !== evidence.targetTenantId ||
        cycle.targetZoneId !== evidence.targetCircuitZoneId ||
        !cycle.reviewStartedAt ||
        cycle.releasedAt ||
        cycle.cancelledAt
      ) {
        fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_CYCLE_DRIFT", 409);
      }

      const directorAssignments =
        await tx.governanceOfficerAssignment.findMany({
          where: { userId: input.actorUserId },
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

      const directorAssignment = requireExactCurrentAssignment({
        assignments: directorAssignments,
        userId: input.actorUserId,
        districtId: evidence.targetDistrictZoneId,
        now: input.now,
        expectedAssignmentId: sourceReview.reviewerAssignmentId,
      });

      const authority = decideTeacherSupervisoryReviewAuthority({
        actorUserId: input.actorUserId,
        actorRoleName: "DISTRICT_DIRECTOR",
        assessorUserId: evidence.assessorUserId,
        assessorRoleName: evidence.assessorRole,
        stage: sourceReview.stage,
      });

      if (
        !authority.allowed ||
        authority.reviewerRole !== "DISTRICT_DIRECTOR" ||
        !authority.allowedActions.includes(input.action)
      ) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DECISION_AUTHORITY_DRIFT",
          403,
        );
      }

      const contractHash = decisionContractHash(plan);
      const requestHash = decisionRequestHash({
        evidence,
        review: sourceReview,
        reviewerAssignmentId: directorAssignment.id,
        action: input.action,
        reason: input.reason,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
        contractHash,
      });
      const evidenceHash = decisionEvidenceHash({
        decisionRequestHash: requestHash,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
      });

      const chainHash =
        input.action === "RELEASE"
          ? releaseReviewChainHash(sourceReview)
          : null;
      const releaseProof =
        input.action === "RELEASE" && chainHash
          ? releaseProofPayload({
              evidence,
              sourceReview,
              reviewerAssignmentId: directorAssignment.id,
              sourceReviewEvidenceHash:
                reviewPackage.integrity.reviewEvidenceHash,
              reviewChainHash: chainHash,
              decisionContractHash: contractHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              releasedAt: input.now,
            })
          : null;
      const proofHash = releaseProof
        ? releaseProofHash(releaseProof)
        : null;

      const reviewUpdate = await tx.appraisalReview.updateMany({
        where: {
          id: sourceReview.id,
          assessmentId: evidence.assessmentId,
          reviewerUserId: input.actorUserId,
          reviewerAssignmentId: directorAssignment.id,
          stage: sourceReview.stage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
        },
        data: {
          decision: plan.reviewDecision,
          note: input.action === "RETURN" ? input.reason : null,
          decidedAt: input.now,
          metadata: sourceDecisionMetadata({
            sourceMetadata: sourceReview.metadata,
            evidence,
            sourceReview,
            action: input.action,
            reason: input.reason,
            reviewerAssignmentId: directorAssignment.id,
            decisionContractHash: contractHash,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            releaseProofHash: proofHash,
            reviewChainHash: chainHash,
            decidedAt: input.now,
          }),
        },
      });

      if (reviewUpdate.count !== 1) {
        fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_WRITE_RACE", 409);
      }

      if (input.action === "RETURN") {
        if (!input.reason) {
          fail(
            "TEACHER_SUPERVISORY_DIRECTOR_DECISION_RETURN_REASON_MISSING",
            409,
          );
        }

        const assessmentUpdate = await tx.appraisalAssessment.updateMany({
          where: {
            id: assessment.id,
            cycleId: evidence.cycleId,
            status: "FINALIZED",
            assessmentHash: evidence.assessmentHash,
          },
          data: {
            status: "RETURNED",
            metadata: assessmentMetadataForReturn({
              assessmentMetadata: assessment.metadata,
              evidence,
              sourceReview,
              reviewerAssignmentId: directorAssignment.id,
              sourceReviewEvidenceHash:
                reviewPackage.integrity.reviewEvidenceHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              reason: input.reason,
              returnedAt: input.now,
            }),
          },
        });

        if (assessmentUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_WRITE_RACE", 409);
        }

        const cycleUpdate = await tx.appraisalCycle.updateMany({
          where: {
            id: cycle.id,
            status: "UNDER_REVIEW",
            releasedAt: null,
            cancelledAt: null,
          },
          data: {
            metadata: cycleMetadataForReturn({
              cycleMetadata: cycle.metadata,
              evidence,
              sourceReview,
              reviewerAssignmentId: directorAssignment.id,
              sourceReviewEvidenceHash:
                reviewPackage.integrity.reviewEvidenceHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              returnedAt: input.now,
            }),
          },
        });

        if (cycleUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_WRITE_RACE", 409);
        }
      } else {
        if (!releaseProof || !proofHash || !chainHash) {
          fail(
            "TEACHER_SUPERVISORY_DIRECTOR_DECISION_RELEASE_PROOF_MISSING",
            409,
          );
        }

        const cycleUpdate = await tx.appraisalCycle.updateMany({
          where: {
            id: cycle.id,
            status: "UNDER_REVIEW",
            releasedAt: null,
            cancelledAt: null,
          },
          data: {
            status: "RELEASED",
            releasedAt: input.now,
            metadata: cycleMetadataForRelease({
              cycleMetadata: cycle.metadata,
              proof: releaseProof,
              releaseProofHash: proofHash,
            }),
          },
        });

        if (cycleUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_DIRECTOR_DECISION_WRITE_RACE", 409);
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: evidence.targetTenantId,
          userId: input.actorUserId,
          action:
            input.action === "RETURN"
              ? RETURNED_AUDIT_ACTION
              : RELEASED_AUDIT_ACTION,
          resource: "AppraisalReview",
          resourceId: sourceReview.id,
          ip: input.request.ip ?? undefined,
          userAgent: input.request.userAgent ?? undefined,
          metadata: {
            reqId: input.reqId,
            workflow:
              TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.workflow,
            evidenceStream:
              TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.evidenceStream,
            action: input.action,
            cycleId: evidence.cycleId,
            cycleStatus:
              input.action === "RETURN" ? "UNDER_REVIEW" : "RELEASED",
            assessmentId: evidence.assessmentId,
            assessmentRevision: evidence.revision,
            assessmentStatus:
              input.action === "RETURN" ? "RETURNED" : "FINALIZED",
            assessorUserId: evidence.assessorUserId,
            assessorAssignmentId: evidence.assessorAssignmentId,
            assessorRole: evidence.assessorRole,
            sourceReviewId: sourceReview.id,
            sourceReviewStage: sourceReview.stage,
            sourceReviewDecision: plan.reviewDecision,
            reviewerAssignmentId: directorAssignment.id,
            reviewerRole: "DISTRICT_DIRECTOR",
            assessmentHash: evidence.assessmentHash,
            observationContextHash: evidence.observationContextHash,
            sourceReviewEvidenceHash:
              reviewPackage.integrity.reviewEvidenceHash,
            reviewChainHash: chainHash,
            decisionContractHash: contractHash,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            releaseProofHash: proofHash,
            releasedAt:
              input.action === "RELEASE"
                ? input.now.toISOString()
                : null,
            returnReasonHash:
              input.reason ? hashJson(input.reason) : null,
            returnReasonLength: input.reason?.length ?? 0,
            returnReasonTextRecordedInAudit: false,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            generalCommentRecordedInAudit: false,
            observationDetailsRecordedInAudit: false,
            classEnrolmentRecordedInAudit: false,
            contactFieldsIncluded: false,
            assessmentMutationPerformed:
              input.action === "RETURN",
            scoreMutationPerformed: false,
            commentMutationPerformed: false,
            legacyTeacherAppraisalIncluded: false,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome:
          input.action === "RETURN" ? "RETURNED" : "RELEASED",
        assessmentId: evidence.assessmentId,
        assessmentRevision: evidence.revision,
        assessmentStatus:
          input.action === "RETURN" ? "RETURNED" : "FINALIZED",
        cycleId: evidence.cycleId,
        cycleStatus:
          input.action === "RETURN" ? "UNDER_REVIEW" : "RELEASED",
        sourceReviewId: sourceReview.id,
        sourceReviewStage: sourceReview.stage,
        sourceReviewDecision:
          input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
        reviewerRole: "DISTRICT_DIRECTOR",
        revisionRequired: input.action === "RETURN",
        assessmentHash: evidence.assessmentHash,
        observationContextHash: evidence.observationContextHash,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
        reviewChainHash: chainHash,
        decisionContractHash: contractHash,
        decisionRequestHash: requestHash,
        decisionEvidenceHash: evidenceHash,
        releaseProofHash: proofHash,
        decidedAt: input.now.toISOString(),
        releasedAt:
          input.action === "RELEASE"
            ? input.now.toISOString()
            : null,
        scoreMutationPerformed: false,
        commentMutationPerformed: false,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.transactionMaxWaitMs,
      timeout:
        TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeTeacherSupervisoryDirectorDecision(
  input: ExecuteTeacherSupervisoryDirectorDecisionInput,
): Promise<ExecuteTeacherSupervisoryDirectorDecisionResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const action = normalizeAction(input.action);
  const reason = normalizeReason(action, input.reason);

  if (normalized(input.actorRoleName) !== "DISTRICT_DIRECTOR") {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_REVIEWER_ROLE_FORBIDDEN",
      403,
    );
  }
  if (input.confirm !== true) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_CONFIRMATION_REQUIRED",
      400,
    );
  }

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryDirectorDecisionDatabase);
  const dependencies =
    input.dependencies ?? {
      readReviewPackage: readTeacherSupervisoryReviewPackage,
      verifyFinalizedEvidence:
        verifyTeacherSupervisoryFinalizedAssessmentEvidence,
    };

  try {
    return await runDirectorDecision({
      request: input,
      database,
      dependencies,
      actorUserId,
      assessmentId,
      action,
      reason,
      now,
      reqId,
      allowWrite: true,
    });
  } catch (error) {
    if (
      isPrismaCode(error, "P2002") ||
      isPrismaCode(error, "P2034") ||
      isWriteRace(error)
    ) {
      return runDirectorDecision({
        request: input,
        database,
        dependencies,
        actorUserId,
        assessmentId,
        action,
        reason,
        now,
        reqId,
        allowWrite: false,
      });
    }
    throw error;
  }
}
