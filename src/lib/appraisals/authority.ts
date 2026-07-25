//src/lib/appraisals/authority.ts
import { effectiveRole } from "@/lib/roleRouting";

export const APPRAISAL_CAPABILITIES = [
  "ASSESS_TEACHER",
  "REVIEW_TEACHER_APPRAISAL",
  "REQUEST_HEADTEACHER_FEEDBACK_CYCLE",
  "APPROVE_HEADTEACHER_FEEDBACK_CYCLE",
  "OPEN_HEADTEACHER_FEEDBACK_CYCLE",
  "EXTEND_HEADTEACHER_FEEDBACK_CYCLE",
  "ASSESS_HEADTEACHER",
  "REVIEW_HEADTEACHER_APPRAISAL",
  "RELEASE_HEADTEACHER_FEEDBACK",
  "VIEW_CONFIDENTIAL_RESPONDENTS",
  "ASSESS_GOVERNANCE_OFFICER",
  "VIEW_OWN_GOVERNANCE_APPRAISAL",
] as const;

export type AppraisalCapability = (typeof APPRAISAL_CAPABILITIES)[number];

const ALL_APPRAISAL_CAPABILITIES: readonly AppraisalCapability[] =
  APPRAISAL_CAPABILITIES;

const ROLE_CAPABILITIES = {
  SUPERADMIN: ALL_APPRAISAL_CAPABILITIES,

  HEADTEACHER: [
    "ASSESS_TEACHER",
    "REQUEST_HEADTEACHER_FEEDBACK_CYCLE",
  ],

  SISSO: [
    "REVIEW_TEACHER_APPRAISAL",
    "ASSESS_HEADTEACHER",
    "VIEW_OWN_GOVERNANCE_APPRAISAL",
  ],

  CIRCUIT_SUPERVISOR: [
    "REVIEW_TEACHER_APPRAISAL",
    "ASSESS_HEADTEACHER",
    "VIEW_OWN_GOVERNANCE_APPRAISAL",
  ],

  BASIC_SCHOOL_COORDINATOR: [
    "REVIEW_TEACHER_APPRAISAL",
    "ASSESS_HEADTEACHER",
    "REVIEW_HEADTEACHER_APPRAISAL",
    "VIEW_OWN_GOVERNANCE_APPRAISAL",
  ],

  HEAD_OF_SUPERVISION: [
    "REVIEW_TEACHER_APPRAISAL",
    "ASSESS_HEADTEACHER",
    "REVIEW_HEADTEACHER_APPRAISAL",
    "EXTEND_HEADTEACHER_FEEDBACK_CYCLE",
    "VIEW_OWN_GOVERNANCE_APPRAISAL",
  ],

  DISTRICT_DIRECTOR: [
    "REVIEW_TEACHER_APPRAISAL",
    "APPROVE_HEADTEACHER_FEEDBACK_CYCLE",
    "OPEN_HEADTEACHER_FEEDBACK_CYCLE",
    "EXTEND_HEADTEACHER_FEEDBACK_CYCLE",
    "ASSESS_HEADTEACHER",
    "REVIEW_HEADTEACHER_APPRAISAL",
    "RELEASE_HEADTEACHER_FEEDBACK",
    "VIEW_CONFIDENTIAL_RESPONDENTS",
    "ASSESS_GOVERNANCE_OFFICER",
    "VIEW_OWN_GOVERNANCE_APPRAISAL",
  ],
} as const satisfies Readonly<Record<string, readonly AppraisalCapability[]>>;

export type AppraisalAuthorityContext = {
  roleName: unknown;
  actorUserId: string;
  targetUserId?: string | null;
};

export type AppraisalAuthorityDecision = {
  allowed: boolean;
  capability: AppraisalCapability;
  effectiveRole: string;
  reason:
    | "CAPABILITY_GRANTED"
    | "CAPABILITY_NOT_GRANTED"
    | "SELF_APPRAISAL_FORBIDDEN";
};

export function getAppraisalCapabilities(roleName: unknown) {
  const role = effectiveRole(roleName);
  const capabilities = ROLE_CAPABILITIES[role as keyof typeof ROLE_CAPABILITIES];
  return capabilities ? [...capabilities] : [];
}

export function hasAppraisalCapability(
  roleName: unknown,
  capability: AppraisalCapability,
) {
  return getAppraisalCapabilities(roleName).includes(capability);
}

export function decideAppraisalAuthority(
  context: AppraisalAuthorityContext,
  capability: AppraisalCapability,
): AppraisalAuthorityDecision {
  const role = effectiveRole(context.roleName);

  if (
    context.targetUserId &&
    context.actorUserId === context.targetUserId &&
    (capability === "ASSESS_TEACHER" ||
      capability === "ASSESS_HEADTEACHER" ||
      capability === "ASSESS_GOVERNANCE_OFFICER")
  ) {
    return {
      allowed: false,
      capability,
      effectiveRole: role,
      reason: "SELF_APPRAISAL_FORBIDDEN",
    };
  }

  if (!hasAppraisalCapability(role, capability)) {
    return {
      allowed: false,
      capability,
      effectiveRole: role,
      reason: "CAPABILITY_NOT_GRANTED",
    };
  }

  return {
    allowed: true,
    capability,
    effectiveRole: role,
    reason: "CAPABILITY_GRANTED",
  };
}

export function assertAppraisalAuthority(
  context: AppraisalAuthorityContext,
  capability: AppraisalCapability,
) {
  const decision = decideAppraisalAuthority(context, capability);

  if (!decision.allowed) {
    const error = new Error(decision.reason) as Error & {
      code?: string;
      status?: number;
      capability?: AppraisalCapability;
      effectiveRole?: string;
    };

    error.code = decision.reason;
    error.status = 403;
    error.capability = capability;
    error.effectiveRole = decision.effectiveRole;
    throw error;
  }

  return decision;
}

/**
 * Capability is necessary but never sufficient.
 * Callers must still enforce active assignment, tenant/zone scope,
 * target relationship, cycle state, and immutable-finalization rules.
 */
export const APPRAISAL_AUTHORITY_RULES = {
  capabilityIsNecessaryButNotSufficient: true,
  scopeMustBeCheckedSeparately: true,
  selfAppraisalForbidden: true,
  confidentialIdentityAccessRequiresAudit: true,
  dashboardAccessDoesNotGrantAppraisalAuthority: true,
} as const;
