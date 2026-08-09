import type { AppraisalReviewDecision } from "@prisma/client";
import { decideAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
} from "@/lib/appraisals/teacherSupervisoryAssessment";

export const TEACHER_SUPERVISORY_REVIEW_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  requiredCapability: "REVIEW_TEACHER_APPRAISAL",
  reviewCycleIngress: {
    from: "OPEN",
    via: "CLOSED",
    to: "UNDER_REVIEW",
    directOpenToUnderReviewAllowed: false,
  },
  reviewerRoles: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"] as const,
  assessorOriginRoles: [
    "SISSO",
    "BASIC_SCHOOL_COORDINATOR",
    "HEAD_OF_SUPERVISION",
    "DISTRICT_DIRECTOR",
  ] as const,
  hosActions: ["RETURN", "FORWARD"] as const,
  directorActions: ["RETURN", "RELEASE"] as const,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  reviewerMayRewriteObservationDetails: false,
  reviewerMayRewriteGovernanceEnrolmentEvidence: false,
  reviewerMayRewriteTeacherAssignmentProvenance: false,
  reviewerMayRewriteCurriculumProvenance: false,
  returnedAssessmentRequiresRevision: true,
  preserveReturningReviewerForCorrection: true,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  prismaMigrationRequired: false,
} as const;

export type TeacherSupervisoryReviewOriginRole =
  (typeof TEACHER_SUPERVISORY_REVIEW_POLICY.assessorOriginRoles)[number];

export type TeacherSupervisoryReviewerRole =
  (typeof TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles)[number];

export type TeacherSupervisoryReviewAction =
  | (typeof TEACHER_SUPERVISORY_REVIEW_POLICY.hosActions)[number]
  | (typeof TEACHER_SUPERVISORY_REVIEW_POLICY.directorActions)[number];

export type TeacherSupervisoryReviewStage = {
  stage: number;
  reviewerRole: TeacherSupervisoryReviewerRole;
  allowedActions: readonly TeacherSupervisoryReviewAction[];
};

export type TeacherSupervisoryReviewChain = {
  assessorRole: TeacherSupervisoryReviewOriginRole;
  requiresReviewRows: boolean;
  selfReviewAllowed: false;
  stages: readonly TeacherSupervisoryReviewStage[];
  terminalAuthorityRole: "DISTRICT_DIRECTOR";
};

export type TeacherSupervisoryReviewAuthorityFailureReason =
  | "ACTOR_USER_ID_REQUIRED"
  | "ASSESSOR_USER_ID_REQUIRED"
  | "ASSESSOR_ROLE_NOT_SUPPORTED"
  | "REVIEWER_ROLE_NOT_SUPPORTED"
  | "SELF_REVIEW_FORBIDDEN"
  | "REVIEW_STAGE_INVALID"
  | "REVIEWER_ROLE_MISMATCH"
  | "CAPABILITY_NOT_GRANTED";

export type TeacherSupervisoryReviewAuthorityDecision =
  | {
      allowed: true;
      reason: "AUTHORIZED";
      assessorRole: TeacherSupervisoryReviewOriginRole;
      reviewerRole: TeacherSupervisoryReviewerRole;
      stage: number;
      allowedActions: readonly TeacherSupervisoryReviewAction[];
    }
  | {
      allowed: false;
      reason: TeacherSupervisoryReviewAuthorityFailureReason;
      assessorRole: string;
      reviewerRole: string;
    };

export type TeacherSupervisoryReviewActionPlan =
  | {
      ok: true;
      value: {
        action: TeacherSupervisoryReviewAction;
        reviewDecision: AppraisalReviewDecision;
        assessmentNextStatus: "FINALIZED" | "RETURNED";
        cycleNextStatus: "UNDER_REVIEW" | "RELEASED";
        revisionRequired: boolean;
        nextReviewStageRequired: boolean;
        nextReviewerRole: "DISTRICT_DIRECTOR" | null;
        reviewerMayRewriteScores: false;
        reviewerMayRewriteComment: false;
        assessmentMutationAllowed: boolean;
        scoreMutationAllowed: false;
      };
    }
  | {
      ok: false;
      code:
        | "ASSESSOR_ROLE_NOT_SUPPORTED"
        | "REVIEW_STAGE_INVALID"
        | "ACTION_NOT_ALLOWED_FOR_STAGE";
    };

export type TeacherSupervisoryCorrectionContinuationPlan =
  | {
      ok: true;
      value: {
        reviewerRole: TeacherSupervisoryReviewerRole;
        reviewStage: number;
        preserveReturningReviewer: true;
        reviewDecision: "PENDING";
        reviewerMayRewriteScores: false;
        reviewerMayRewriteComment: false;
      };
    }
  | {
      ok: false;
      code:
        | "ASSESSOR_ROLE_NOT_SUPPORTED"
        | "RETURNING_REVIEWER_ROLE_NOT_SUPPORTED"
        | "REVIEW_STAGE_INVALID"
        | "RETURNING_REVIEWER_STAGE_MISMATCH";
    };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function canonicalOriginRole(
  value: unknown,
): TeacherSupervisoryReviewOriginRole | null {
  const role = canonicalTeacherSupervisoryAssessorRole(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.assessorOriginRoles.includes(
    role as TeacherSupervisoryReviewOriginRole,
  )
    ? (role as TeacherSupervisoryReviewOriginRole)
    : null;
}

function canonicalReviewerRole(
  value: unknown,
): TeacherSupervisoryReviewerRole | null {
  const role = normalized(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles.includes(
    role as TeacherSupervisoryReviewerRole,
  )
    ? (role as TeacherSupervisoryReviewerRole)
    : null;
}

export function teacherSupervisoryReviewChainForAssessor(
  assessorRoleName: unknown,
): TeacherSupervisoryReviewChain | null {
  const assessorRole = canonicalOriginRole(assessorRoleName);
  if (!assessorRole) return null;

  if (
    assessorRole === "SISSO" ||
    assessorRole === "BASIC_SCHOOL_COORDINATOR"
  ) {
    return {
      assessorRole,
      requiresReviewRows: true,
      selfReviewAllowed: false,
      stages: [
        {
          stage: 1,
          reviewerRole: "HEAD_OF_SUPERVISION",
          allowedActions: TEACHER_SUPERVISORY_REVIEW_POLICY.hosActions,
        },
        {
          stage: 2,
          reviewerRole: "DISTRICT_DIRECTOR",
          allowedActions: TEACHER_SUPERVISORY_REVIEW_POLICY.directorActions,
        },
      ],
      terminalAuthorityRole: "DISTRICT_DIRECTOR",
    };
  }

  if (assessorRole === "HEAD_OF_SUPERVISION") {
    return {
      assessorRole,
      requiresReviewRows: true,
      selfReviewAllowed: false,
      stages: [
        {
          stage: 1,
          reviewerRole: "DISTRICT_DIRECTOR",
          allowedActions: TEACHER_SUPERVISORY_REVIEW_POLICY.directorActions,
        },
      ],
      terminalAuthorityRole: "DISTRICT_DIRECTOR",
    };
  }

  return {
    assessorRole: "DISTRICT_DIRECTOR",
    requiresReviewRows: false,
    selfReviewAllowed: false,
    stages: [],
    terminalAuthorityRole: "DISTRICT_DIRECTOR",
  };
}

export function decideTeacherSupervisoryReviewAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  assessorUserId: string;
  assessorRoleName: unknown;
  stage: number;
}): TeacherSupervisoryReviewAuthorityDecision {
  const actorUserId = clean(input.actorUserId);
  const assessorUserId = clean(input.assessorUserId);
  const reviewerRole = canonicalReviewerRole(input.actorRoleName);
  const assessorRole = canonicalOriginRole(input.assessorRoleName);

  if (!actorUserId) {
    return {
      allowed: false,
      reason: "ACTOR_USER_ID_REQUIRED",
      assessorRole: assessorRole ?? normalized(input.assessorRoleName),
      reviewerRole: reviewerRole ?? normalized(input.actorRoleName),
    };
  }
  if (!assessorUserId) {
    return {
      allowed: false,
      reason: "ASSESSOR_USER_ID_REQUIRED",
      assessorRole: assessorRole ?? normalized(input.assessorRoleName),
      reviewerRole: reviewerRole ?? normalized(input.actorRoleName),
    };
  }
  if (!assessorRole) {
    return {
      allowed: false,
      reason: "ASSESSOR_ROLE_NOT_SUPPORTED",
      assessorRole: normalized(input.assessorRoleName),
      reviewerRole: reviewerRole ?? normalized(input.actorRoleName),
    };
  }
  if (!reviewerRole) {
    return {
      allowed: false,
      reason: "REVIEWER_ROLE_NOT_SUPPORTED",
      assessorRole,
      reviewerRole: normalized(input.actorRoleName),
    };
  }
  if (actorUserId === assessorUserId) {
    return {
      allowed: false,
      reason: "SELF_REVIEW_FORBIDDEN",
      assessorRole,
      reviewerRole,
    };
  }

  const chain = teacherSupervisoryReviewChainForAssessor(assessorRole);
  const expectedStage = chain?.stages.find((candidate) => candidate.stage === input.stage);
  if (!chain || !expectedStage) {
    return {
      allowed: false,
      reason: "REVIEW_STAGE_INVALID",
      assessorRole,
      reviewerRole,
    };
  }
  if (expectedStage.reviewerRole !== reviewerRole) {
    return {
      allowed: false,
      reason: "REVIEWER_ROLE_MISMATCH",
      assessorRole,
      reviewerRole,
    };
  }

  const capability = decideAppraisalAuthority(
    {
      roleName: reviewerRole,
      actorUserId,
    },
    TEACHER_SUPERVISORY_REVIEW_POLICY.requiredCapability,
  );
  if (!capability.allowed) {
    return {
      allowed: false,
      reason: "CAPABILITY_NOT_GRANTED",
      assessorRole,
      reviewerRole,
    };
  }

  return {
    allowed: true,
    reason: "AUTHORIZED",
    assessorRole,
    reviewerRole,
    stage: expectedStage.stage,
    allowedActions: expectedStage.allowedActions,
  };
}

export function planTeacherSupervisoryReviewAction(input: {
  assessorRoleName: unknown;
  stage: number;
  action: unknown;
}): TeacherSupervisoryReviewActionPlan {
  const chain = teacherSupervisoryReviewChainForAssessor(input.assessorRoleName);
  if (!chain) return { ok: false, code: "ASSESSOR_ROLE_NOT_SUPPORTED" };

  const stage = chain.stages.find((candidate) => candidate.stage === input.stage);
  if (!stage) return { ok: false, code: "REVIEW_STAGE_INVALID" };

  const action = normalized(input.action) as TeacherSupervisoryReviewAction;
  if (!stage.allowedActions.includes(action)) {
    return { ok: false, code: "ACTION_NOT_ALLOWED_FOR_STAGE" };
  }

  if (action === "RETURN") {
    return {
      ok: true,
      value: {
        action,
        reviewDecision: "RETURNED",
        assessmentNextStatus: "RETURNED",
        cycleNextStatus: "UNDER_REVIEW",
        revisionRequired: true,
        nextReviewStageRequired: false,
        nextReviewerRole: null,
        reviewerMayRewriteScores: false,
        reviewerMayRewriteComment: false,
        assessmentMutationAllowed: true,
        scoreMutationAllowed: false,
      },
    };
  }

  if (action === "FORWARD") {
    return {
      ok: true,
      value: {
        action,
        reviewDecision: "ACCEPTED",
        assessmentNextStatus: "FINALIZED",
        cycleNextStatus: "UNDER_REVIEW",
        revisionRequired: false,
        nextReviewStageRequired: true,
        nextReviewerRole: "DISTRICT_DIRECTOR",
        reviewerMayRewriteScores: false,
        reviewerMayRewriteComment: false,
        assessmentMutationAllowed: false,
        scoreMutationAllowed: false,
      },
    };
  }

  return {
    ok: true,
    value: {
      action: "RELEASE",
      reviewDecision: "ACCEPTED",
      assessmentNextStatus: "FINALIZED",
      cycleNextStatus: "RELEASED",
      revisionRequired: false,
      nextReviewStageRequired: false,
      nextReviewerRole: null,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      assessmentMutationAllowed: false,
      scoreMutationAllowed: false,
    },
  };
}

export function planTeacherSupervisoryCorrectionContinuation(input: {
  assessorRoleName: unknown;
  returningReviewerRoleName: unknown;
  reviewStage: number;
}): TeacherSupervisoryCorrectionContinuationPlan {
  const chain = teacherSupervisoryReviewChainForAssessor(input.assessorRoleName);
  if (!chain) return { ok: false, code: "ASSESSOR_ROLE_NOT_SUPPORTED" };

  const reviewerRole = canonicalReviewerRole(input.returningReviewerRoleName);
  if (!reviewerRole) {
    return { ok: false, code: "RETURNING_REVIEWER_ROLE_NOT_SUPPORTED" };
  }

  const stage = chain.stages.find((candidate) => candidate.stage === input.reviewStage);
  if (!stage) return { ok: false, code: "REVIEW_STAGE_INVALID" };
  if (stage.reviewerRole !== reviewerRole) {
    return { ok: false, code: "RETURNING_REVIEWER_STAGE_MISMATCH" };
  }

  return {
    ok: true,
    value: {
      reviewerRole,
      reviewStage: stage.stage,
      preserveReturningReviewer: true,
      reviewDecision: "PENDING",
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
    },
  };
}
