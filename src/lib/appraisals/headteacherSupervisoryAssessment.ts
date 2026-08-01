//src/lib/appraisals/headteacherSupervisoryAssessment.ts
import {
  decideAppraisalAuthority,
  type AppraisalAuthorityDecision,
} from "@/lib/appraisals/authority";
import {
  APPRAISAL_INSTRUMENT_CODES,
  APPRAISAL_INSTRUMENT_DEFINITIONS,
} from "@/lib/appraisals/instruments";

export const HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY = {
  schemaVersion: 1,
  workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
  instrumentCode:
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
  instrumentVersion: 1,
  targetRole: "HEADTEACHER",
  requiredCapability: "ASSESS_HEADTEACHER",
  operationalAssessorRoles: [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
    "SISSO",
    "CIRCUIT_SUPERVISOR",
  ] as const,
  distinctOperationalOffices: [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
    "SISSO",
  ] as const,
  circuitOffice: {
    canonicalRole: "SISSO",
    legacyRoleAliases: ["CIRCUIT_SUPERVISOR"] as const,
    distinctOfficeCount: 1,
  },
  districtWideAssessorRoles: [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
  ] as const,
  circuitAssessorRoles: ["SISSO", "CIRCUIT_SUPERVISOR"] as const,
  districtZoneLevel: 2,
  circuitZoneLevel: 1,
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedRawMaximum: 170,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  scaleMinimum: 1,
  scaleMaximum: 5,
  allowNotApplicable: true,
  commentsAllowed: false,
  finalizedScoresImmutable: true,
  reviewerMayRewriteScores: false,
  returnedAssessmentRequiresRevision: true,
  separateFromStaffFeedback: true,
  combinedWeightingDefined: false,
  databaseRequiredForPolicyDecision: false,
} as const;

type OperationalAssessorRole =
  (typeof HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles)[number];

type AssessmentStatus = "DRAFT" | "FINALIZED" | "RETURNED" | "SUPERSEDED";

export type HeadteacherSupervisoryGovernanceAssignment = {
  id: string;
  userId?: string | null;
  role: string;
  zoneId: string;
  zoneName?: string | null;
  zoneLevel: number;
  parentZoneId?: string | null;
  parentZoneName?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export type HeadteacherSupervisoryTarget = {
  userId: string;
  roleName: string;
  isActive: boolean;
  tenantId: string;
  tenantStatus: string;
  circuitZoneId?: string | null;
  circuitName?: string | null;
  districtZoneId?: string | null;
  districtName?: string | null;
};

export type DecideHeadteacherSupervisoryAuthorityInput = {
  actorUserId: string;
  actorRoleName: string;
  target: HeadteacherSupervisoryTarget;
  assignments: readonly HeadteacherSupervisoryGovernanceAssignment[];
  now?: Date;
};

export type HeadteacherSupervisoryAuthorityFailureReason =
  | "ACTOR_USER_ID_REQUIRED"
  | "TARGET_USER_ID_REQUIRED"
  | "TARGET_TENANT_ID_REQUIRED"
  | "CAPABILITY_NOT_GRANTED"
  | "SELF_APPRAISAL_FORBIDDEN"
  | "ASSESSOR_ROLE_NOT_OPERATIONAL"
  | "TARGET_NOT_HEADTEACHER"
  | "TARGET_INACTIVE"
  | "TARGET_TENANT_INACTIVE"
  | "TARGET_DISTRICT_REQUIRED"
  | "TARGET_CIRCUIT_REQUIRED"
  | "ACTIVE_ASSIGNMENT_REQUIRED"
  | "AMBIGUOUS_ACTIVE_ASSIGNMENT"
  | "DISTRICT_SCOPE_MISMATCH"
  | "CIRCUIT_SCOPE_MISMATCH";

export type HeadteacherSupervisoryAuthorityDecision =
  | {
      allowed: true;
      reason: "AUTHORIZED";
      effectiveRole: OperationalAssessorRole;
      scopeLevel: "DISTRICT" | "CIRCUIT";
      assignmentId: string;
      targetTenantId: string;
      targetDistrictZoneId: string | null;
      targetCircuitZoneId: string | null;
    }
  | {
      allowed: false;
      reason: HeadteacherSupervisoryAuthorityFailureReason;
      effectiveRole: string;
    };

export type HeadteacherSupervisoryInstrumentContract = {
  valid: boolean;
  issues: readonly string[];
  instrumentCode: string;
  instrumentVersion: number;
  sectionCount: number;
  itemCount: number;
  rawMaximum: number;
  sectionMaximums: readonly number[];
  commentsAllowed: boolean;
  allowNotApplicable: boolean;
  sharesOfficialItemBankWithStaffFeedback: boolean;
  separateEvidenceStream: true;
};

export type HeadteacherSupervisoryScoreMutationDecision =
  | { allowed: true; reason: "DRAFT_OWNER_EDIT" }
  | {
      allowed: false;
      reason:
        | "ASSESSOR_ONLY"
        | "FINALIZED_SCORES_IMMUTABLE"
        | "RETURNED_REQUIRES_REVISION"
        | "SUPERSEDED_READ_ONLY";
    };

export type PlanHeadteacherSupervisoryRevisionInput = {
  assessmentId: string;
  status: AssessmentStatus | string;
  revisionNumber: number;
  assessorUserId: string;
  targetUserId: string;
  returnReason: string;
  reviewerScoreEdits?: unknown;
};

export type HeadteacherSupervisoryRevisionPlanResult =
  | {
      ok: true;
      value: {
        originalAssessmentId: string;
        originalTransition: {
          from: "RETURNED";
          to: "SUPERSEDED";
        };
        newRevision: {
          status: "DRAFT";
          revisionNumber: number;
          supersedesAssessmentId: string;
          assessorUserId: string;
          targetUserId: string;
          copyScoresFromAssessmentId: string;
        };
        reviewerMayRewriteScores: false;
      };
    }
  | {
      ok: false;
      code:
        | "ASSESSMENT_ID_REQUIRED"
        | "RETURNED_STATUS_REQUIRED"
        | "REVISION_NUMBER_INVALID"
        | "ASSESSOR_USER_ID_REQUIRED"
        | "TARGET_USER_ID_REQUIRED"
        | "RETURN_REASON_REQUIRED"
        | "REVIEWER_SCORE_REWRITE_FORBIDDEN";
    };

const ASSESSMENT_TRANSITIONS = {
  DRAFT: ["FINALIZED"],
  FINALIZED: ["RETURNED"],
  RETURNED: ["SUPERSEDED"],
  SUPERSEDED: [],
} as const satisfies Record<AssessmentStatus, readonly AssessmentStatus[]>;

const DISTRICT_ROLES = new Set<string>(
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtWideAssessorRoles,
);
const CIRCUIT_ROLES = new Set<string>(["SISSO"]);
const OPERATIONAL_ROLES = new Set<string>(
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles,
);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

export function canonicalHeadteacherSupervisoryAssessorRole(value: unknown) {
  const role = normalized(value);
  return role === "CIRCUIT_SUPERVISOR" ? "SISSO" : role;
}

function normalizedName(value: unknown) {
  return clean(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function validDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assignmentIsActive(
  assignment: HeadteacherSupervisoryGovernanceAssignment,
  now: Date,
) {
  if (assignment.isActive === false) return false;
  if (assignment.status && normalized(assignment.status) !== "ACTIVE") {
    return false;
  }

  const startsAt = validDate(assignment.startsAt);
  const endsAt = validDate(assignment.endsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() <= now.getTime()) return false;
  return true;
}

function rolesEquivalent(left: string, right: string) {
  return (
    canonicalHeadteacherSupervisoryAssessorRole(left) ===
    canonicalHeadteacherSupervisoryAssessorRole(right)
  );
}

function jurisdictionMatches(input: {
  assignmentId?: string | null;
  assignmentName?: string | null;
  targetId?: string | null;
  targetName?: string | null;
}) {
  const assignmentId = clean(input.assignmentId);
  const targetId = clean(input.targetId);
  if (assignmentId && targetId) return assignmentId === targetId;

  const assignmentName = normalizedName(input.assignmentName);
  const targetName = normalizedName(input.targetName);
  return Boolean(assignmentName && targetName && assignmentName === targetName);
}

function authorityFailure(
  reason: HeadteacherSupervisoryAuthorityFailureReason,
  effectiveRole: string,
): HeadteacherSupervisoryAuthorityDecision {
  return { allowed: false, reason, effectiveRole };
}

function mapCapabilityFailure(
  decision: AppraisalAuthorityDecision,
): HeadteacherSupervisoryAuthorityFailureReason {
  if (decision.reason === "SELF_APPRAISAL_FORBIDDEN") {
    return "SELF_APPRAISAL_FORBIDDEN";
  }
  return "CAPABILITY_NOT_GRANTED";
}

export function inspectHeadteacherSupervisoryInstrument(): HeadteacherSupervisoryInstrumentContract {
  const supervisory =
    APPRAISAL_INSTRUMENT_DEFINITIONS.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1;
  const staff =
    APPRAISAL_INSTRUMENT_DEFINITIONS.HEADTEACHER_STAFF_FEEDBACK_V1;

  const sections = [...supervisory.sections].sort(
    (left, right) => left.order - right.order,
  );
  const staffSections = [...staff.sections].sort(
    (left, right) => left.order - right.order,
  );
  const sectionMaximums = sections.map((section) => section.maxScore);
  const itemCount = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const rawMaximum = sectionMaximums.reduce((sum, value) => sum + value, 0);
  const supervisoryBank = sections.flatMap((section) =>
    [...section.items]
      .sort((left, right) => left.order - right.order)
      .map((item) => `${section.key}|${item.key}|${item.label}|${item.maxScore}`),
  );
  const staffBank = staffSections.flatMap((section) =>
    [...section.items]
      .sort((left, right) => left.order - right.order)
      .map((item) => `${section.key}|${item.key}|${item.label}|${item.maxScore}`),
  );
  const sharesOfficialItemBankWithStaffFeedback =
    JSON.stringify(supervisoryBank) === JSON.stringify(staffBank);

  const issues: string[] = [];
  if (
    supervisory.code !==
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode
  ) {
    issues.push("INSTRUMENT_CODE_MISMATCH");
  }
  if (supervisory.version !== 1) issues.push("INSTRUMENT_VERSION_MISMATCH");
  if (supervisory.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT") {
    issues.push("INSTRUMENT_PURPOSE_MISMATCH");
  }
  if (supervisory.workflowKind !== "SUPERVISORY_ASSESSMENT") {
    issues.push("WORKFLOW_KIND_MISMATCH");
  }
  if (supervisory.targetRole !== "HEADTEACHER") {
    issues.push("TARGET_ROLE_MISMATCH");
  }
  if (supervisory.identityVisibility !== "AUTHORIZED_GOVERNANCE_ONLY") {
    issues.push("IDENTITY_VISIBILITY_MISMATCH");
  }
  if (supervisory.allowComments || supervisory.commentsPolicy !== "PROHIBITED") {
    issues.push("COMMENTS_POLICY_MISMATCH");
  }
  if (!supervisory.allowNotApplicable) {
    issues.push("NOT_APPLICABLE_REQUIRED");
  }
  if (sections.length !== 4) issues.push("SECTION_COUNT_MISMATCH");
  if (itemCount !== 34) issues.push("ITEM_COUNT_MISMATCH");
  if (rawMaximum !== 170) issues.push("RAW_MAXIMUM_MISMATCH");
  if (JSON.stringify(sectionMaximums) !== JSON.stringify([55, 45, 40, 30])) {
    issues.push("SECTION_MAXIMUMS_MISMATCH");
  }
  if (!sharesOfficialItemBankWithStaffFeedback) {
    issues.push("SHARED_ITEM_BANK_DRIFT");
  }

  return {
    valid: issues.length === 0,
    issues,
    instrumentCode: supervisory.code,
    instrumentVersion: supervisory.version,
    sectionCount: sections.length,
    itemCount,
    rawMaximum,
    sectionMaximums,
    commentsAllowed: supervisory.allowComments,
    allowNotApplicable: supervisory.allowNotApplicable,
    sharesOfficialItemBankWithStaffFeedback,
    separateEvidenceStream: true,
  };
}

export function decideHeadteacherSupervisoryAssessmentAuthority(
  input: DecideHeadteacherSupervisoryAuthorityInput,
): HeadteacherSupervisoryAuthorityDecision {
  const actorUserId = clean(input.actorUserId);
  const targetUserId = clean(input.target.userId);
  const targetTenantId = clean(input.target.tenantId);
  const now = input.now ?? new Date();

  if (!actorUserId) return authorityFailure("ACTOR_USER_ID_REQUIRED", "");
  if (!targetUserId) {
    return authorityFailure("TARGET_USER_ID_REQUIRED", normalized(input.actorRoleName));
  }
  if (!targetTenantId) {
    return authorityFailure("TARGET_TENANT_ID_REQUIRED", normalized(input.actorRoleName));
  }

  const capability = decideAppraisalAuthority(
    {
      roleName: input.actorRoleName,
      actorUserId,
      targetUserId,
    },
    "ASSESS_HEADTEACHER",
  );
  const effectiveRole = canonicalHeadteacherSupervisoryAssessorRole(
    capability.effectiveRole,
  );
  if (!capability.allowed) {
    return authorityFailure(mapCapabilityFailure(capability), effectiveRole);
  }
  if (!OPERATIONAL_ROLES.has(effectiveRole)) {
    return authorityFailure("ASSESSOR_ROLE_NOT_OPERATIONAL", effectiveRole);
  }
  if (normalized(input.target.roleName) !== "HEADTEACHER") {
    return authorityFailure("TARGET_NOT_HEADTEACHER", effectiveRole);
  }
  if (!input.target.isActive) {
    return authorityFailure("TARGET_INACTIVE", effectiveRole);
  }
  if (normalized(input.target.tenantStatus) !== "ACTIVE") {
    return authorityFailure("TARGET_TENANT_INACTIVE", effectiveRole);
  }

  const targetDistrictZoneId = clean(input.target.districtZoneId) || null;
  const targetCircuitZoneId = clean(input.target.circuitZoneId) || null;
  const targetDistrictName = clean(input.target.districtName) || null;
  const targetCircuitName = clean(input.target.circuitName) || null;

  if (!targetDistrictZoneId && !targetDistrictName) {
    return authorityFailure("TARGET_DISTRICT_REQUIRED", effectiveRole);
  }
  if (CIRCUIT_ROLES.has(effectiveRole) && !targetCircuitZoneId && !targetCircuitName) {
    return authorityFailure("TARGET_CIRCUIT_REQUIRED", effectiveRole);
  }

  const activeAssignments = input.assignments.filter((assignment) => {
    const assignmentUserId = clean(assignment.userId);
    if (assignmentUserId && assignmentUserId !== actorUserId) return false;
    if (!rolesEquivalent(assignment.role, effectiveRole)) return false;
    return assignmentIsActive(assignment, now);
  });

  if (!activeAssignments.length) {
    return authorityFailure("ACTIVE_ASSIGNMENT_REQUIRED", effectiveRole);
  }

  const matchingAssignments = activeAssignments.filter((assignment) => {
    if (DISTRICT_ROLES.has(effectiveRole)) {
      return (
        assignment.zoneLevel ===
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
        jurisdictionMatches({
          assignmentId: assignment.zoneId,
          assignmentName: assignment.zoneName,
          targetId: targetDistrictZoneId,
          targetName: targetDistrictName,
        })
      );
    }

    const circuitMatches =
      assignment.zoneLevel ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel &&
      jurisdictionMatches({
        assignmentId: assignment.zoneId,
        assignmentName: assignment.zoneName,
        targetId: targetCircuitZoneId,
        targetName: targetCircuitName,
      });
    if (!circuitMatches) return false;

    if (
      (assignment.parentZoneId || assignment.parentZoneName) &&
      !jurisdictionMatches({
        assignmentId: assignment.parentZoneId,
        assignmentName: assignment.parentZoneName,
        targetId: targetDistrictZoneId,
        targetName: targetDistrictName,
      })
    ) {
      return false;
    }
    return true;
  });

  if (!matchingAssignments.length) {
    return authorityFailure(
      DISTRICT_ROLES.has(effectiveRole)
        ? "DISTRICT_SCOPE_MISMATCH"
        : "CIRCUIT_SCOPE_MISMATCH",
      effectiveRole,
    );
  }
  if (matchingAssignments.length !== 1) {
    return authorityFailure("AMBIGUOUS_ACTIVE_ASSIGNMENT", effectiveRole);
  }

  const assignment = matchingAssignments[0];
  return {
    allowed: true,
    reason: "AUTHORIZED",
    effectiveRole: effectiveRole as OperationalAssessorRole,
    scopeLevel: DISTRICT_ROLES.has(effectiveRole) ? "DISTRICT" : "CIRCUIT",
    assignmentId: assignment.id,
    targetTenantId,
    targetDistrictZoneId,
    targetCircuitZoneId,
  };
}

export function canTransitionHeadteacherSupervisoryAssessment(
  from: AssessmentStatus,
  to: AssessmentStatus,
) {
  return (ASSESSMENT_TRANSITIONS[from] as readonly AssessmentStatus[]).includes(to);
}

export function decideHeadteacherSupervisoryScoreMutation(input: {
  status: AssessmentStatus | string;
  actorUserId: string;
  assessorUserId: string;
}): HeadteacherSupervisoryScoreMutationDecision {
  const status = normalized(input.status);
  if (clean(input.actorUserId) !== clean(input.assessorUserId)) {
    return { allowed: false, reason: "ASSESSOR_ONLY" };
  }
  if (status === "DRAFT") {
    return { allowed: true, reason: "DRAFT_OWNER_EDIT" };
  }
  if (status === "FINALIZED") {
    return { allowed: false, reason: "FINALIZED_SCORES_IMMUTABLE" };
  }
  if (status === "RETURNED") {
    return { allowed: false, reason: "RETURNED_REQUIRES_REVISION" };
  }
  return { allowed: false, reason: "SUPERSEDED_READ_ONLY" };
}

function reviewerScoreEditsPresent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

export function planReturnedHeadteacherSupervisoryRevision(
  input: PlanHeadteacherSupervisoryRevisionInput,
): HeadteacherSupervisoryRevisionPlanResult {
  const assessmentId = clean(input.assessmentId);
  const assessorUserId = clean(input.assessorUserId);
  const targetUserId = clean(input.targetUserId);
  const returnReason = clean(input.returnReason);

  if (!assessmentId) return { ok: false, code: "ASSESSMENT_ID_REQUIRED" };
  if (normalized(input.status) !== "RETURNED") {
    return { ok: false, code: "RETURNED_STATUS_REQUIRED" };
  }
  if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) {
    return { ok: false, code: "REVISION_NUMBER_INVALID" };
  }
  if (!assessorUserId) {
    return { ok: false, code: "ASSESSOR_USER_ID_REQUIRED" };
  }
  if (!targetUserId) return { ok: false, code: "TARGET_USER_ID_REQUIRED" };
  if (returnReason.length < 3) {
    return { ok: false, code: "RETURN_REASON_REQUIRED" };
  }
  if (reviewerScoreEditsPresent(input.reviewerScoreEdits)) {
    return { ok: false, code: "REVIEWER_SCORE_REWRITE_FORBIDDEN" };
  }

  return {
    ok: true,
    value: {
      originalAssessmentId: assessmentId,
      originalTransition: {
        from: "RETURNED",
        to: "SUPERSEDED",
      },
      newRevision: {
        status: "DRAFT",
        revisionNumber: input.revisionNumber + 1,
        supersedesAssessmentId: assessmentId,
        assessorUserId,
        targetUserId,
        copyScoresFromAssessmentId: assessmentId,
      },
      reviewerMayRewriteScores: false,
    },
  };
}
