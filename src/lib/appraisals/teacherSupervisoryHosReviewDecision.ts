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
  computeTeacherSupervisoryReviewEvidenceHash,
} from "@/lib/appraisals/teacherSupervisoryReviewAdmission";
import {
  readTeacherSupervisoryReviewPackage,
} from "@/lib/appraisals/teacherSupervisoryReviewPackage";
import {
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_HOS_DECISION_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_REVIEW_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_REVIEW_POLICY.evidenceStream,
  reviewerRole: "HEAD_OF_SUPERVISION",
  allowedActions: ["RETURN", "FORWARD"] as const,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredCurrentReviewDecision: "PENDING",
  returnReviewDecision: "RETURNED",
  forwardReviewDecision: "ACCEPTED",
  returnAssessmentFromStatus: "FINALIZED",
  returnAssessmentToStatus: "RETURNED",
  forwardAssessmentStatus: "FINALIZED",
  minimumReturnReasonLength: 3,
  maximumReturnReasonLength: 2_000,
  forwardReasonAllowed: false,
  forwardCreatesDirectorStage: true,
  cycleStatusChanges: false,
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

const RETURNED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_HOS_REVIEW_RETURNED";
const FORWARDED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_HOS_REVIEW_FORWARDED";

export type TeacherSupervisoryHosDecision =
  (typeof TEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions)[number];

export type ExecuteTeacherSupervisoryHosDecisionInput = {
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
  database?: TeacherSupervisoryHosDecisionDatabase;
  dependencies?: TeacherSupervisoryHosDecisionDependencies;
};

export type ExecuteTeacherSupervisoryHosDecisionResult = {
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
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "ACCEPTED";
  nextReviewId: string | null;
  nextReviewStage: number | null;
  nextReviewDecision: "PENDING" | null;
  nextReviewerRole: "DISTRICT_DIRECTOR" | null;
  revisionRequired: boolean;
  assessmentHash: string;
  observationContextHash: string;
  sourceReviewEvidenceHash: string;
  nextReviewEvidenceHash: string | null;
  decisionContractHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  decidedAt: string;
  scoreMutationPerformed: false;
  commentMutationPerformed: false;
  providerCalled: false;
};

export type TeacherSupervisoryHosDecisionDependencies = {
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

export type TeacherSupervisoryHosDecisionTransactionClient = {
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
    create(args: unknown): Promise<ReviewRecord>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type TeacherSupervisoryHosDecisionDatabase = {
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
      tx: TeacherSupervisoryHosDecisionTransactionClient,
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
    fail("TEACHER_SUPERVISORY_HOS_DECISION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function normalizeAction(value: unknown): TeacherSupervisoryHosDecision {
  const action = normalized(value);
  if (
    !TEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions.includes(
      action as TeacherSupervisoryHosDecision,
    )
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_ACTION_FORBIDDEN", 400, {
      action,
    });
  }
  return action as TeacherSupervisoryHosDecision;
}

function normalizeReason(
  action: TeacherSupervisoryHosDecision,
  value: unknown,
) {
  const reason = clean(value);

  if (action === "FORWARD") {
    if (reason) {
      fail("TEACHER_SUPERVISORY_HOS_DECISION_FORWARD_REASON_FORBIDDEN", 400);
    }
    return null;
  }

  if (
    reason.length <
    TEACHER_SUPERVISORY_HOS_DECISION_POLICY.minimumReturnReasonLength
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_REQUIRED", 400);
  }
  if (
    reason.length >
    TEACHER_SUPERVISORY_HOS_DECISION_POLICY.maximumReturnReasonLength
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_TOO_LONG", 400);
  }
  return reason;
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  userId: string;
  role: "HEAD_OF_SUPERVISION" | "DISTRICT_DIRECTOR";
  districtId: string;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.userId !== input.userId ||
    normalized(assignment.role) !== input.role ||
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
  userId: string;
  role: "HEAD_OF_SUPERVISION" | "DISTRICT_DIRECTOR";
  districtId: string;
  now: Date;
  expectedAssignmentId?: string | null;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      userId: input.userId,
      role: input.role,
      districtId: input.districtId,
      now: input.now,
    }),
  );

  if (matches.length === 0) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_ACTIVE_ASSIGNMENT_REQUIRED", 403, {
      role: input.role,
    });
  }
  if (matches.length !== 1) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_AMBIGUOUS_ASSIGNMENT", 409, {
      role: input.role,
      activeAssignments: matches.length,
    });
  }
  if (
    input.expectedAssignmentId &&
    matches[0].id !== input.expectedAssignmentId
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_ASSIGNMENT_DRIFT", 409, {
      role: input.role,
    });
  }

  return matches[0];
}

function decisionContractHash(
  plan: Extract<TeacherSupervisoryReviewActionPlan, { ok: true }>["value"],
) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
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
  action: TeacherSupervisoryHosDecision;
  reason: string | null;
  sourceReviewEvidenceHash: string;
  contractHash: string;
}) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
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
      role: "HEAD_OF_SUPERVISION",
    },
    action: input.action,
    reason: input.reason,
    decisionContractHash: input.contractHash,
  });
}

function decisionEvidenceHash(input: {
  decisionRequestHash: string;
  sourceReviewEvidenceHash: string;
  nextReviewEvidenceHash: string | null;
}) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    decisionRequestHash: input.decisionRequestHash,
    sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
    nextReviewEvidenceHash: input.nextReviewEvidenceHash,
  });
}

function nextReviewMetadata(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  nextStage: number;
  reviewerRole: "DISTRICT_DIRECTOR";
  reviewEvidenceHash: string;
  decisionRequestHash: string;
  decisionContractHash: string;
  forwardedByUserId: string;
  forwardedByAssignmentId: string;
  forwardedAt: Date;
}) {
  return {
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
    reviewType: "FORWARDED_UPSTREAM_REVIEW",
    reviewStage: input.nextStage,
    reviewerRole: input.reviewerRole,
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    immutableEvidenceReverified: true,
    generalCommentIncludedInAssessmentHash: true,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
    sourceReviewId: input.sourceReview.id,
    sourceReviewStage: input.sourceReview.stage,
    sourceReviewDecision: "ACCEPTED",
    forwardDecisionRequestHash: input.decisionRequestHash,
    forwardDecisionContractHash: input.decisionContractHash,
    forwardedByUserId: input.forwardedByUserId,
    forwardedByAssignmentId: input.forwardedByAssignmentId,
    forwardedAt: input.forwardedAt.toISOString(),
  };
}

function sourceDecisionMetadata(input: {
  sourceMetadata: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  action: TeacherSupervisoryHosDecision;
  reason: string | null;
  reviewerAssignmentId: string;
  decisionContractHash: string;
  decisionRequestHash: string;
  decisionEvidenceHash: string;
  nextReviewId: string | null;
  nextReviewStage: number | null;
  nextReviewerRole: "DISTRICT_DIRECTOR" | null;
  nextReviewEvidenceHash: string | null;
  decidedAt: Date;
}) {
  return {
    ...objectValue(input.sourceMetadata),
    decisionSchemaVersion:
      TEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    decisionAction: input.action,
    decisionContractHash: input.decisionContractHash,
    decisionRequestHash: input.decisionRequestHash,
    decisionEvidenceHash: input.decisionEvidenceHash,
    assessorRole: input.evidence.assessorRole,
    decidedByUserId: input.sourceReview.reviewerUserId,
    decidedByAssignmentId: input.reviewerAssignmentId,
    decidedByRole: "HEAD_OF_SUPERVISION",
    decidedAt: input.decidedAt.toISOString(),
    reasonHash: input.reason ? hashJson(input.reason) : null,
    reasonLength: input.reason?.length ?? 0,
    revisionRequired: input.action === "RETURN",
    nextReviewId: input.nextReviewId,
    nextReviewStage: input.nextReviewStage,
    nextReviewerRole: input.nextReviewerRole,
    forwardedReviewEvidenceHash: input.nextReviewEvidenceHash,
    preserveReturningReviewerForCorrection: input.action === "RETURN",
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

function cycleMetadataForForward(input: {
  cycleMetadata: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  sourceReview: ReviewRecord;
  sourceReviewerAssignmentId: string;
  nextReview: ReviewRecord;
  nextReviewerAssignmentId: string;
  nextReviewEvidenceHash: string;
  decisionRequestHash: string;
  forwardedAt: Date;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      ...objectValue(
        objectValue(input.cycleMetadata).teacherSupervisoryReview,
      ),
      schemaVersion: 1,
      reviewType: "FORWARDED_UPSTREAM_REVIEW",
      state: "PENDING_DIRECTOR_REVIEW",
      currentReviewId: input.nextReview.id,
      currentReviewStage: input.nextReview.stage,
      currentReviewerRole: "DISTRICT_DIRECTOR",
      currentReviewerAssignmentId: input.nextReviewerAssignmentId,
      reviewEvidenceHash: input.nextReviewEvidenceHash,
      admittedAssessmentId: input.evidence.assessmentId,
      admittedAssessmentRevision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      immutableEvidenceReverified: true,
      generalCommentIncludedInAssessmentHash: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
      forwardedFromReviewId: input.sourceReview.id,
      forwardedFromReviewStage: input.sourceReview.stage,
      forwardedByUserId: input.sourceReview.reviewerUserId,
      forwardedByAssignmentId: input.sourceReviewerAssignmentId,
      forwardDecisionRequestHash: input.decisionRequestHash,
      forwardedAt: input.forwardedAt.toISOString(),
    },
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
      currentReviewerRole: "HEAD_OF_SUPERVISION",
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
      returningReviewerRole: "HEAD_OF_SUPERVISION",
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

function decisionStateFromReviews(
  reviews: ReviewRecord[],
  actorUserId: string,
) {
  const candidates = reviews.filter(
    (review) =>
      review.reviewerUserId === actorUserId &&
      normalized(objectValue(review.metadata).reviewerRole) ===
        "HEAD_OF_SUPERVISION",
  );

  if (candidates.length !== 1) {
    return null;
  }
  return candidates[0];
}

function planForExisting(
  review: ReviewRecord,
): Extract<TeacherSupervisoryReviewActionPlan, { ok: true }>["value"] {
  const metadata = objectValue(review.metadata);
  const action = clean(metadata.decisionAction);
  const assessorRole = clean(metadata.assessorRole);
  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: assessorRole,
    stage: review.stage,
    action,
  });
  if (!planned.ok) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_PLAN_INVALID", 409);
  }
  return planned.value;
}

async function existingDecisionResult(input: {
  database: TeacherSupervisoryHosDecisionDatabase;
  actorUserId: string;
  assessmentId: string;
  action: TeacherSupervisoryHosDecision;
  reason: string | null;
  review: ReviewRecord;
}): Promise<ExecuteTeacherSupervisoryHosDecisionResult> {
  const review = input.review;
  const metadata = objectValue(review.metadata);

  if (
    clean(metadata.decisionAction) !== input.action ||
    !review.decidedAt ||
    !isSha256(metadata.reviewEvidenceHash) ||
    !isSha256(metadata.assessmentHash) ||
    !isSha256(metadata.observationContextHash) ||
    !isSha256(metadata.decisionContractHash) ||
    !isSha256(metadata.decisionRequestHash) ||
    !isSha256(metadata.decisionEvidenceHash) ||
    clean(metadata.decidedByUserId) !== input.actorUserId ||
    clean(metadata.decidedByAssignmentId) !== clean(review.reviewerAssignmentId) ||
    clean(metadata.decidedByRole) !== "HEAD_OF_SUPERVISION" ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteComment !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.commentMutationPerformed !== false ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_REVIEW_DRIFT", 409);
  }

  const plan = planForExisting(review);
  const expectedContractHash = decisionContractHash(plan);
  if (expectedContractHash !== clean(metadata.decisionContractHash).toLowerCase()) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_CONTRACT_DRIFT", 409);
  }

  const expectedReasonHash = input.reason ? hashJson(input.reason) : null;
  if (
    metadata.reasonHash !== expectedReasonHash ||
    Number(metadata.reasonLength) !== (input.reason?.length ?? 0)
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_ALREADY_DECIDED_DIFFERENTLY", 409);
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
  if (!assessment) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_ASSESSMENT_NOT_FOUND", 404);
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
    fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_CYCLE_DRIFT", 409);
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

  const sourceReviewEvidenceHash =
    clean(metadata.reviewEvidenceHash).toLowerCase();
  const assessmentHash = clean(metadata.assessmentHash).toLowerCase();
  const observationContextHash =
    clean(metadata.observationContextHash).toLowerCase();

  if (input.action === "RETURN") {
    if (
      normalized(review.decision) !== "RETURNED" ||
      review.note !== input.reason ||
      normalized(assessment.status) !== "RETURNED" ||
      allReviews.some((candidate) => candidate.stage > review.stage)
    ) {
      fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_RETURN_DRIFT", 409);
    }

    return {
      outcome: "EXISTING_RETURNED",
      assessmentId: assessment.id,
      assessmentRevision: assessment.revision,
      assessmentStatus: "RETURNED",
      cycleId: cycle.id,
      cycleStatus: "UNDER_REVIEW",
      sourceReviewId: review.id,
      sourceReviewStage: review.stage,
      sourceReviewDecision: "RETURNED",
      nextReviewId: null,
      nextReviewStage: null,
      nextReviewDecision: null,
      nextReviewerRole: null,
      revisionRequired: true,
      assessmentHash,
      observationContextHash,
      sourceReviewEvidenceHash,
      nextReviewEvidenceHash: null,
      decisionContractHash: clean(metadata.decisionContractHash).toLowerCase(),
      decisionRequestHash: clean(metadata.decisionRequestHash).toLowerCase(),
      decisionEvidenceHash: clean(metadata.decisionEvidenceHash).toLowerCase(),
      decidedAt: review.decidedAt.toISOString(),
      scoreMutationPerformed: false,
      commentMutationPerformed: false,
      providerCalled: false,
    };
  }

  const nextReviewId = clean(metadata.nextReviewId);
  const nextReview = allReviews.find(
    (candidate) => candidate.id === nextReviewId,
  );
  const nextReviewMetadata = objectValue(nextReview?.metadata);
  const forwardedHash =
    clean(metadata.forwardedReviewEvidenceHash).toLowerCase();

  if (
    normalized(review.decision) !== "ACCEPTED" ||
    clean(review.note) ||
    normalized(assessment.status) !== "FINALIZED" ||
    !nextReview ||
    nextReview.stage !== review.stage + 1 ||
    normalized(nextReview.decision) !== "PENDING" ||
    nextReview.decidedAt ||
    clean(nextReview.note) ||
    clean(nextReviewMetadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    clean(nextReviewMetadata.reviewEvidenceHash).toLowerCase() !== forwardedHash ||
    !isSha256(forwardedHash)
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_EXISTING_FORWARD_DRIFT", 409);
  }

  return {
    outcome: "EXISTING_FORWARDED",
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentStatus: "FINALIZED",
    cycleId: cycle.id,
    cycleStatus: "UNDER_REVIEW",
    sourceReviewId: review.id,
    sourceReviewStage: review.stage,
    sourceReviewDecision: "ACCEPTED",
    nextReviewId: nextReview.id,
    nextReviewStage: nextReview.stage,
    nextReviewDecision: "PENDING",
    nextReviewerRole: "DISTRICT_DIRECTOR",
    revisionRequired: false,
    assessmentHash,
    observationContextHash,
    sourceReviewEvidenceHash,
    nextReviewEvidenceHash: forwardedHash,
    decisionContractHash: clean(metadata.decisionContractHash).toLowerCase(),
    decisionRequestHash: clean(metadata.decisionRequestHash).toLowerCase(),
    decisionEvidenceHash: clean(metadata.decisionEvidenceHash).toLowerCase(),
    decidedAt: review.decidedAt.toISOString(),
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    providerCalled: false,
  };
}

function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

function isWriteRace(error: unknown) {
  return clean((error as { code?: unknown })?.code) ===
    "TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE";
}

async function runDecision(input: {
  request: ExecuteTeacherSupervisoryHosDecisionInput;
  database: TeacherSupervisoryHosDecisionDatabase;
  dependencies: TeacherSupervisoryHosDecisionDependencies;
  actorUserId: string;
  assessmentId: string;
  action: TeacherSupervisoryHosDecision;
  reason: string | null;
  now: Date;
  reqId: string;
  allowWrite: boolean;
}): Promise<ExecuteTeacherSupervisoryHosDecisionResult> {
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

  if (
    initialSource &&
    normalized(initialSource.decision) !== "PENDING"
  ) {
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
    fail("TEACHER_SUPERVISORY_HOS_DECISION_CONCURRENT_STATE_NOT_VISIBLE", 409);
  }

  const reviewPackage = await input.dependencies.readReviewPackage({
    actorUserId: input.actorUserId,
    actorRoleName: "HEAD_OF_SUPERVISION",
    assessmentId: input.assessmentId,
    governanceScope: input.request.governanceScope,
    now: input.now,
  });

  const evidence = await input.dependencies.verifyFinalizedEvidence({
    assessmentId: input.assessmentId,
  });

  if (
    reviewPackage.review.reviewerRole !== "HEAD_OF_SUPERVISION" ||
    reviewPackage.review.decision !== "PENDING" ||
    reviewPackage.assessment.id !== evidence.assessmentId ||
    reviewPackage.assessment.revision !== evidence.revision ||
    reviewPackage.integrity.assessmentHash !== evidence.assessmentHash ||
    reviewPackage.integrity.observationContextHash !==
      evidence.observationContextHash
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_PACKAGE_EVIDENCE_DRIFT", 409);
  }

  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: evidence.assessorRole,
    stage: reviewPackage.review.stage,
    action: input.action,
  });
  if (!planned.ok) {
    fail(`TEACHER_SUPERVISORY_HOS_DECISION_PLAN_${planned.code}`, 409);
  }
  const plan = planned.value;

  if (
    plan.action !== input.action ||
    plan.cycleNextStatus !== "UNDER_REVIEW" ||
    plan.reviewerMayRewriteScores !== false ||
    plan.reviewerMayRewriteComment !== false ||
    plan.scoreMutationAllowed !== false ||
    (input.action === "RETURN" &&
      (plan.reviewDecision !== "RETURNED" ||
        plan.assessmentNextStatus !== "RETURNED" ||
        plan.revisionRequired !== true ||
        plan.nextReviewStageRequired !== false)) ||
    (input.action === "FORWARD" &&
      (plan.reviewDecision !== "ACCEPTED" ||
        plan.assessmentNextStatus !== "FINALIZED" ||
        plan.revisionRequired !== false ||
        plan.nextReviewStageRequired !== true ||
        plan.nextReviewerRole !== "DISTRICT_DIRECTOR"))
  ) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_PLAN_DRIFT", 409);
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
        fail("TEACHER_SUPERVISORY_HOS_DECISION_REVIEW_NOT_FOUND", 404);
      }

      if (normalized(sourceReview.decision) !== "PENDING") {
        return existingDecisionResult({
          database: tx as unknown as TeacherSupervisoryHosDecisionDatabase,
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
        clean(sourceMetadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
        clean(sourceMetadata.reviewEvidenceHash).toLowerCase() !==
          reviewPackage.integrity.reviewEvidenceHash ||
        clean(sourceMetadata.assessmentHash).toLowerCase() !==
          evidence.assessmentHash ||
        clean(sourceMetadata.observationContextHash).toLowerCase() !==
          evidence.observationContextHash
      ) {
        fail("TEACHER_SUPERVISORY_HOS_DECISION_CURRENT_REVIEW_DRIFT", 409);
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
        clean(assessment.assessmentHash).toLowerCase() !== evidence.assessmentHash
      ) {
        fail("TEACHER_SUPERVISORY_HOS_DECISION_ASSESSMENT_DRIFT", 409);
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
        fail("TEACHER_SUPERVISORY_HOS_DECISION_CYCLE_DRIFT", 409);
      }

      const hosAssignments = await tx.governanceOfficerAssignment.findMany({
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
      const hosAssignment = requireExactCurrentAssignment({
        assignments: hosAssignments,
        userId: input.actorUserId,
        role: "HEAD_OF_SUPERVISION",
        districtId: evidence.targetDistrictZoneId,
        now: input.now,
        expectedAssignmentId: sourceReview.reviewerAssignmentId,
      });

      const authority = decideTeacherSupervisoryReviewAuthority({
        actorUserId: input.actorUserId,
        actorRoleName: "HEAD_OF_SUPERVISION",
        assessorUserId: evidence.assessorUserId,
        assessorRoleName: evidence.assessorRole,
        stage: sourceReview.stage,
      });
      if (
        !authority.allowed ||
        !authority.allowedActions.includes(input.action)
      ) {
        fail("TEACHER_SUPERVISORY_HOS_DECISION_AUTHORITY_DRIFT", 403);
      }

      const contractHash = decisionContractHash(plan);
      const requestHash = decisionRequestHash({
        evidence,
        review: sourceReview,
        reviewerAssignmentId: hosAssignment.id,
        action: input.action,
        reason: input.reason,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
        contractHash,
      });

      let nextReview: ReviewRecord | null = null;
      let nextReviewEvidenceHash: string | null = null;
      let nextReviewerAssignmentId: string | null = null;

      if (input.action === "FORWARD") {
        const nextStage = sourceReview.stage + 1;
        const directorAssignments =
          await tx.governanceOfficerAssignment.findMany({
            where: {
              role: "DISTRICT_DIRECTOR",
              zoneId: evidence.targetDistrictZoneId,
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

        const activeDirectors = directorAssignments.filter((assignment) =>
          assignmentIsCurrent({
            assignment,
            userId: assignment.userId,
            role: "DISTRICT_DIRECTOR",
            districtId: evidence.targetDistrictZoneId,
            now: input.now,
          }),
        );

        if (activeDirectors.length === 0) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_DIRECTOR_REQUIRED", 409);
        }
        if (activeDirectors.length !== 1) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_DIRECTOR_AMBIGUOUS", 409, {
            activeDirectors: activeDirectors.length,
          });
        }

        const directorAssignment = activeDirectors[0];
        const directorAuthority = decideTeacherSupervisoryReviewAuthority({
          actorUserId: directorAssignment.userId,
          actorRoleName: "DISTRICT_DIRECTOR",
          assessorUserId: evidence.assessorUserId,
          assessorRoleName: evidence.assessorRole,
          stage: nextStage,
        });
        if (
          !directorAuthority.allowed ||
          directorAuthority.reviewerRole !== "DISTRICT_DIRECTOR"
        ) {
          fail(
            "TEACHER_SUPERVISORY_HOS_DECISION_DIRECTOR_AUTHORITY_INVALID",
            409,
          );
        }

        nextReviewEvidenceHash =
          computeTeacherSupervisoryReviewEvidenceHash({
            evidence,
            reviewerUserId: directorAssignment.userId,
            reviewerAssignmentId: directorAssignment.id,
            reviewerRole: "DISTRICT_DIRECTOR",
            reviewStage: nextStage,
          });
        nextReviewerAssignmentId = directorAssignment.id;

        nextReview = await tx.appraisalReview.create({
          data: {
            cycleId: evidence.cycleId,
            assessmentId: evidence.assessmentId,
            reviewerUserId: directorAssignment.userId,
            reviewerAssignmentId: directorAssignment.id,
            stage: nextStage,
            decision: "PENDING",
            note: null,
            decidedAt: null,
            metadata: nextReviewMetadata({
              evidence,
              sourceReview,
              nextStage,
              reviewerRole: "DISTRICT_DIRECTOR",
              reviewEvidenceHash: nextReviewEvidenceHash,
              decisionRequestHash: requestHash,
              decisionContractHash: contractHash,
              forwardedByUserId: input.actorUserId,
              forwardedByAssignmentId: hosAssignment.id,
              forwardedAt: input.now,
            }),
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
      }

      const evidenceHash = decisionEvidenceHash({
        decisionRequestHash: requestHash,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
        nextReviewEvidenceHash,
      });

      const reviewUpdate = await tx.appraisalReview.updateMany({
        where: {
          id: sourceReview.id,
          assessmentId: evidence.assessmentId,
          reviewerUserId: input.actorUserId,
          reviewerAssignmentId: hosAssignment.id,
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
            reviewerAssignmentId: hosAssignment.id,
            decisionContractHash: contractHash,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
            nextReviewId: nextReview?.id ?? null,
            nextReviewStage: nextReview?.stage ?? null,
            nextReviewerRole:
              input.action === "FORWARD" ? "DISTRICT_DIRECTOR" : null,
            nextReviewEvidenceHash,
            decidedAt: input.now,
          }),
        },
      });

      if (reviewUpdate.count !== 1) {
        fail("TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
      }

      if (input.action === "RETURN") {
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
              reviewerAssignmentId: hosAssignment.id,
              sourceReviewEvidenceHash:
                reviewPackage.integrity.reviewEvidenceHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              reason: input.reason as string,
              returnedAt: input.now,
            }),
          },
        });
        if (assessmentUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
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
              reviewerAssignmentId: hosAssignment.id,
              sourceReviewEvidenceHash:
                reviewPackage.integrity.reviewEvidenceHash,
              decisionRequestHash: requestHash,
              decisionEvidenceHash: evidenceHash,
              returnedAt: input.now,
            }),
          },
        });
        if (cycleUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
        }
      } else {
        if (!nextReview || !nextReviewEvidenceHash || !nextReviewerAssignmentId) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_NEXT_REVIEW_MISSING", 409);
        }

        const cycleUpdate = await tx.appraisalCycle.updateMany({
          where: {
            id: cycle.id,
            status: "UNDER_REVIEW",
            releasedAt: null,
            cancelledAt: null,
          },
          data: {
            metadata: cycleMetadataForForward({
              cycleMetadata: cycle.metadata,
              evidence,
              sourceReview,
              sourceReviewerAssignmentId: hosAssignment.id,
              nextReview,
              nextReviewerAssignmentId,
              nextReviewEvidenceHash,
              decisionRequestHash: requestHash,
              forwardedAt: input.now,
            }),
          },
        });
        if (cycleUpdate.count !== 1) {
          fail("TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE", 409);
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: evidence.targetTenantId,
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
            workflow: TEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
            evidenceStream:
              TEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
            action: input.action,
            cycleId: evidence.cycleId,
            assessmentId: evidence.assessmentId,
            assessmentRevision: evidence.revision,
            assessorUserId: evidence.assessorUserId,
            assessorAssignmentId: evidence.assessorAssignmentId,
            assessorRole: evidence.assessorRole,
            sourceReviewId: sourceReview.id,
            sourceReviewStage: sourceReview.stage,
            sourceReviewDecision: plan.reviewDecision,
            reviewerAssignmentId: hosAssignment.id,
            assessmentHash: evidence.assessmentHash,
            observationContextHash: evidence.observationContextHash,
            sourceReviewEvidenceHash:
              reviewPackage.integrity.reviewEvidenceHash,
            nextReviewId: nextReview?.id ?? null,
            nextReviewStage: nextReview?.stage ?? null,
            nextReviewEvidenceHash,
            decisionContractHash: contractHash,
            decisionRequestHash: requestHash,
            decisionEvidenceHash: evidenceHash,
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
          input.action === "RETURN" ? "RETURNED" : "FORWARDED",
        assessmentId: evidence.assessmentId,
        assessmentRevision: evidence.revision,
        assessmentStatus:
          input.action === "RETURN" ? "RETURNED" : "FINALIZED",
        cycleId: evidence.cycleId,
        cycleStatus: "UNDER_REVIEW",
        sourceReviewId: sourceReview.id,
        sourceReviewStage: sourceReview.stage,
        sourceReviewDecision:
          input.action === "RETURN" ? "RETURNED" : "ACCEPTED",
        nextReviewId: nextReview?.id ?? null,
        nextReviewStage: nextReview?.stage ?? null,
        nextReviewDecision: nextReview ? "PENDING" : null,
        nextReviewerRole: nextReview ? "DISTRICT_DIRECTOR" : null,
        revisionRequired: input.action === "RETURN",
        assessmentHash: evidence.assessmentHash,
        observationContextHash: evidence.observationContextHash,
        sourceReviewEvidenceHash:
          reviewPackage.integrity.reviewEvidenceHash,
        nextReviewEvidenceHash,
        decisionContractHash: contractHash,
        decisionRequestHash: requestHash,
        decisionEvidenceHash: evidenceHash,
        decidedAt: input.now.toISOString(),
        scoreMutationPerformed: false,
        commentMutationPerformed: false,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        TEACHER_SUPERVISORY_HOS_DECISION_POLICY.transactionMaxWaitMs,
      timeout:
        TEACHER_SUPERVISORY_HOS_DECISION_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeTeacherSupervisoryHosDecision(
  input: ExecuteTeacherSupervisoryHosDecisionInput,
): Promise<ExecuteTeacherSupervisoryHosDecisionResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const action = normalizeAction(input.action);
  const reason = normalizeReason(action, input.reason);

  if (normalized(input.actorRoleName) !== "HEAD_OF_SUPERVISION") {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_REVIEWER_ROLE_FORBIDDEN", 403);
  }
  if (input.confirm !== true) {
    fail("TEACHER_SUPERVISORY_HOS_DECISION_CONFIRMATION_REQUIRED", 400);
  }

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryHosDecisionDatabase);
  const dependencies =
    input.dependencies ?? {
      readReviewPackage: readTeacherSupervisoryReviewPackage,
      verifyFinalizedEvidence:
        verifyTeacherSupervisoryFinalizedAssessmentEvidence,
    };

  try {
    return await runDecision({
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
      return runDecision({
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
