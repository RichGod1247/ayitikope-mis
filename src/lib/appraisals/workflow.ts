//src/lib/appraisals/workflow.ts
import type {
  AppraisalAssessmentStatus,
  AppraisalCycleStatus,
  AppraisalParticipantStatus,
  AppraisalResponseStatus,
  AppraisalReviewDecision,
} from "@prisma/client";

const CYCLE_TRANSITIONS = {
  DRAFT: ["PENDING_APPROVAL", "OPEN", "CANCELLED"],
  PENDING_APPROVAL: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["RELEASED", "CANCELLED"],
  RELEASED: [],
  CANCELLED: [],
} as const satisfies Record<AppraisalCycleStatus, readonly AppraisalCycleStatus[]>;

const PARTICIPANT_TRANSITIONS = {
  NOT_STARTED: ["IN_PROGRESS", "FINALIZED", "EXPIRED", "REVOKED"],
  IN_PROGRESS: ["FINALIZED", "EXPIRED", "REVOKED"],
  FINALIZED: [],
  EXPIRED: [],
  REVOKED: [],
} as const satisfies Record<
  AppraisalParticipantStatus,
  readonly AppraisalParticipantStatus[]
>;

const RESPONSE_TRANSITIONS = {
  DRAFT: ["FINALIZED"],
  FINALIZED: [],
} as const satisfies Record<AppraisalResponseStatus, readonly AppraisalResponseStatus[]>;

const ASSESSMENT_TRANSITIONS = {
  DRAFT: ["FINALIZED"],
  FINALIZED: ["RETURNED"],
  RETURNED: ["SUPERSEDED"],
  SUPERSEDED: [],
} as const satisfies Record<
  AppraisalAssessmentStatus,
  readonly AppraisalAssessmentStatus[]
>;

const REVIEW_DECISIONS = {
  PENDING: ["ACCEPTED", "RETURNED", "HELD"],
  ACCEPTED: [],
  RETURNED: [],
  HELD: [],
} as const satisfies Record<AppraisalReviewDecision, readonly AppraisalReviewDecision[]>;

export const APPRAISAL_CYCLE_STATUS_LABELS = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Director approval",
  OPEN: "Open",
  CLOSED: "Closed",
  UNDER_REVIEW: "Under Director review",
  RELEASED: "Released",
  CANCELLED: "Cancelled",
} as const satisfies Record<AppraisalCycleStatus, string>;

function transitionAllowed<T extends string>(
  map: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
) {
  return map[from].includes(to);
}

function transitionError(domain: string, from: string, to: string) {
  const error = new Error(`${domain}_TRANSITION_FORBIDDEN`) as Error & {
    code?: string;
    status?: number;
    from?: string;
    to?: string;
  };
  error.code = `${domain}_TRANSITION_FORBIDDEN`;
  error.status = 409;
  error.from = from;
  error.to = to;
  return error;
}

export function canTransitionAppraisalCycle(
  from: AppraisalCycleStatus,
  to: AppraisalCycleStatus,
) {
  return transitionAllowed(CYCLE_TRANSITIONS, from, to);
}

export function assertAppraisalCycleTransition(
  from: AppraisalCycleStatus,
  to: AppraisalCycleStatus,
) {
  if (!canTransitionAppraisalCycle(from, to)) {
    throw transitionError("APPRAISAL_CYCLE", from, to);
  }
  return true;
}

export function canTransitionAppraisalParticipant(
  from: AppraisalParticipantStatus,
  to: AppraisalParticipantStatus,
) {
  return transitionAllowed(PARTICIPANT_TRANSITIONS, from, to);
}

export function assertAppraisalParticipantTransition(
  from: AppraisalParticipantStatus,
  to: AppraisalParticipantStatus,
) {
  if (!canTransitionAppraisalParticipant(from, to)) {
    throw transitionError("APPRAISAL_PARTICIPANT", from, to);
  }
  return true;
}

export function canTransitionAppraisalResponse(
  from: AppraisalResponseStatus,
  to: AppraisalResponseStatus,
) {
  return transitionAllowed(RESPONSE_TRANSITIONS, from, to);
}

export function assertAppraisalResponseTransition(
  from: AppraisalResponseStatus,
  to: AppraisalResponseStatus,
) {
  if (!canTransitionAppraisalResponse(from, to)) {
    throw transitionError("APPRAISAL_RESPONSE", from, to);
  }
  return true;
}

export function canTransitionAppraisalAssessment(
  from: AppraisalAssessmentStatus,
  to: AppraisalAssessmentStatus,
) {
  return transitionAllowed(ASSESSMENT_TRANSITIONS, from, to);
}

export function assertAppraisalAssessmentTransition(
  from: AppraisalAssessmentStatus,
  to: AppraisalAssessmentStatus,
) {
  if (!canTransitionAppraisalAssessment(from, to)) {
    throw transitionError("APPRAISAL_ASSESSMENT", from, to);
  }
  return true;
}

export function canDecideAppraisalReview(
  from: AppraisalReviewDecision,
  to: AppraisalReviewDecision,
) {
  return transitionAllowed(REVIEW_DECISIONS, from, to);
}

export function assertAppraisalReviewDecision(
  from: AppraisalReviewDecision,
  to: AppraisalReviewDecision,
) {
  if (!canDecideAppraisalReview(from, to)) {
    throw transitionError("APPRAISAL_REVIEW", from, to);
  }
  return true;
}

export function cycleMayBeExtended(status: AppraisalCycleStatus) {
  return status === "OPEN";
}

export function cycleMayAcceptResponses(status: AppraisalCycleStatus) {
  return status === "OPEN";
}

export function cycleMayGenerateAggregate(status: AppraisalCycleStatus) {
  return status === "CLOSED" || status === "UNDER_REVIEW";
}

export function cycleMayBeReleased(status: AppraisalCycleStatus) {
  return status === "UNDER_REVIEW";
}

export type ReleaseReadinessInput = {
  status: AppraisalCycleStatus;
  finalizedResponses: number;
  minimumResponses: number;
  aggregateSnapshotPresent: boolean;
  supervisoryAssessmentRequired: boolean;
  supervisoryAssessmentAccepted: boolean;
};

export type ReleaseReadinessResult = {
  ready: boolean;
  reasons: string[];
};

export function appraisalReleaseReadiness(
  input: ReleaseReadinessInput,
): ReleaseReadinessResult {
  const reasons: string[] = [];

  if (input.status !== "UNDER_REVIEW") {
    reasons.push("CYCLE_NOT_UNDER_REVIEW");
  }
  if (input.finalizedResponses < input.minimumResponses) {
    reasons.push("MINIMUM_RESPONSES_NOT_MET");
  }
  if (!input.aggregateSnapshotPresent) {
    reasons.push("AGGREGATE_SNAPSHOT_MISSING");
  }
  if (
    input.supervisoryAssessmentRequired &&
    !input.supervisoryAssessmentAccepted
  ) {
    reasons.push("SUPERVISORY_ASSESSMENT_NOT_ACCEPTED");
  }

  return { ready: reasons.length === 0, reasons };
}

export const APPRAISAL_WORKFLOW_RULES = {
  standardResponseWindowDays: 7,
  minimumFinalizedResponses: 1,
  directorMayOpenDirectlyFromDraft: true,
  extensionDoesNotChangeOpenStatus: true,
  finalizedResponsesAreImmutable: true,
  finalizedAssessmentsRequireRevisionInsteadOfRewrite: true,
  reviewerCannotRewriteAssessorScores: true,
  releasedAndCancelledCyclesAreTerminal: true,
} as const;
