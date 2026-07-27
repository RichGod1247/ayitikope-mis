import type { AppraisalCycleStatus } from "@prisma/client";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  APPRAISAL_INSTRUMENT_CODES,
  APPRAISAL_INSTRUMENT_SPECIFICATIONS,
  instrumentActivationIsBlocked,
} from "@/lib/appraisals/instruments";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_POLICY = {
  workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
  instrumentCode:
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
  instrumentVersion: 1,
  targetRole: "HEADTEACHER",
  respondentRole: "TEACHER",
  responseWindowDays: 7,
  minimumFinalizedResponses: 1,
  commentsAllowed: false,
  identityVisibilityStorageValue: "DIRECTOR_ONLY",
  participantSelection: "ACTIVE_TEACHERS_FROZEN_AT_OPEN",
  participantFreezeStatus: "OPEN",
  headteacherMayRequestOwnCycle: true,
  headteacherMayOpenDirectly: false,
  directorMayApprove: true,
  directorMayOpenDirectly: true,
  teacherMayRequestOrOpen: false,
} as const;

export const ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES: readonly AppraisalCycleStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED",
  "UNDER_REVIEW",
];

const PENDING_HEADTEACHER_FEEDBACK_CYCLE_STATUSES: readonly AppraisalCycleStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
];

export type HeadteacherFeedbackGovernanceScope = {
  isSuperAdmin: boolean;
  tenantIds: readonly string[];
};

export type HeadteacherFeedbackTargetRecord = {
  membershipId: string;
  userId: string;
  tenantId: string;
  membershipStatus: unknown;
  roleName: unknown;
  tenantStatus: unknown;
};

export type HeadteacherFeedbackTeacherCandidate = {
  membershipId: string;
  userId: string;
  tenantId: string;
  membershipStatus: unknown;
  roleName: unknown;
  tenantStatus: unknown;
};

export type HeadteacherFeedbackEligibleParticipant = {
  respondentUserId: string;
  respondentTenantId: string;
  respondentRoleSnapshot: "TEACHER";
  eligibilitySnapshot: {
    membershipId: string;
    tenantId: string;
    selectionBasis: "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN";
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
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

function requireId(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!id) {
    fail("HEADTEACHER_FEEDBACK_IDENTIFIER_REQUIRED", 400, { fieldName });
  }
  return id;
}

function assertNoCallerSelectedRespondents(value: unknown) {
  if (value !== undefined && value !== null) {
    fail("HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN", 400);
  }
}

export function assertHeadteacherFeedbackInstrumentReady() {
  const specification =
    APPRAISAL_INSTRUMENT_SPECIFICATIONS[
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode
    ];

  if (
    specification.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    specification.targetRole !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    specification.responseWindowDays !==
      HEADTEACHER_FEEDBACK_POLICY.responseWindowDays ||
    specification.minimumResponses !==
      HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses ||
    specification.commentsPolicy !== "PROHIBITED" ||
    specification.identityVisibility !==
      HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue ||
    instrumentActivationIsBlocked(HEADTEACHER_FEEDBACK_POLICY.instrumentCode)
  ) {
    fail("HEADTEACHER_FEEDBACK_INSTRUMENT_NOT_READY", 409);
  }

  return specification;
}

export function assertHeadteacherFeedbackRequestAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  targetHeadteacherUserId?: string | null;
  requestedRespondentUserIds?: unknown;
}) {
  const actorUserId = requireId(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);
  const targetHeadteacherUserId =
    clean(input.targetHeadteacherUserId) || actorUserId;

  assertNoCallerSelectedRespondents(input.requestedRespondentUserIds);

  if (actorRole !== "HEADTEACHER") {
    fail("HEADTEACHER_FEEDBACK_REQUEST_HEADTEACHER_ONLY", 403, {
      actorRole,
    });
  }

  if (targetHeadteacherUserId !== actorUserId) {
    fail("HEADTEACHER_FEEDBACK_OWN_REQUEST_ONLY", 403);
  }

  assertAppraisalAuthority(
    {
      actorUserId,
      roleName: actorRole,
      targetUserId: targetHeadteacherUserId,
    },
    "REQUEST_HEADTEACHER_FEEDBACK_CYCLE",
  );

  return {
    actorUserId,
    actorRole: "HEADTEACHER" as const,
    targetHeadteacherUserId,
  };
}

function assertHeadteacherFeedbackGovernanceAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  targetHeadteacherUserId: string;
  targetTenantId: string;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  mode: "APPROVE" | "DIRECT_OPEN";
}) {
  const actorUserId = requireId(input.actorUserId, "actorUserId");
  const targetHeadteacherUserId = requireId(
    input.targetHeadteacherUserId,
    "targetHeadteacherUserId",
  );
  const targetTenantId = requireId(input.targetTenantId, "targetTenantId");
  const actorRole = effectiveRole(input.actorRoleName);
  const capability =
    input.mode === "APPROVE"
      ? "APPROVE_HEADTEACHER_FEEDBACK_CYCLE"
      : "OPEN_HEADTEACHER_FEEDBACK_CYCLE";

  if (actorRole !== "DISTRICT_DIRECTOR" && actorRole !== "SUPERADMIN") {
    fail(
      input.mode === "APPROVE"
        ? "HEADTEACHER_FEEDBACK_APPROVER_ROLE_FORBIDDEN"
        : "HEADTEACHER_FEEDBACK_OPENER_ROLE_FORBIDDEN",
      403,
      { actorRole },
    );
  }

  if (actorUserId === targetHeadteacherUserId) {
    fail("HEADTEACHER_FEEDBACK_GOVERNANCE_SELF_ACTION_FORBIDDEN", 403);
  }

  assertAppraisalAuthority(
    {
      actorUserId,
      roleName: actorRole,
      targetUserId: targetHeadteacherUserId,
    },
    capability,
  );

  assertHeadteacherFeedbackTargetInGovernanceScope({
    governanceScope: input.governanceScope,
    targetTenantId,
  });

  return {
    actorUserId,
    actorRole,
    targetHeadteacherUserId,
    targetTenantId,
    mode: input.mode,
  };
}

export function assertHeadteacherFeedbackApprovalAuthority(
  input: Omit<
    Parameters<typeof assertHeadteacherFeedbackGovernanceAuthority>[0],
    "mode"
  >,
) {
  return assertHeadteacherFeedbackGovernanceAuthority({
    ...input,
    mode: "APPROVE",
  });
}

export function assertHeadteacherFeedbackDirectOpenAuthority(
  input: Omit<
    Parameters<typeof assertHeadteacherFeedbackGovernanceAuthority>[0],
    "mode"
  >,
) {
  return assertHeadteacherFeedbackGovernanceAuthority({
    ...input,
    mode: "DIRECT_OPEN",
  });
}

export function assertHeadteacherFeedbackTargetInGovernanceScope(input: {
  governanceScope: HeadteacherFeedbackGovernanceScope;
  targetTenantId: string;
}) {
  const targetTenantId = requireId(input.targetTenantId, "targetTenantId");

  if (input.governanceScope.isSuperAdmin) return true;

  if (!input.governanceScope.tenantIds.includes(targetTenantId)) {
    fail("HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE", 403, {
      targetTenantId,
    });
  }

  return true;
}

export function assertActiveHeadteacherFeedbackTarget(input: {
  target: HeadteacherFeedbackTargetRecord;
  expectedUserId?: string | null;
  expectedTenantId?: string | null;
}) {
  const target = input.target;
  const membershipId = requireId(target.membershipId, "membershipId");
  const userId = requireId(target.userId, "userId");
  const tenantId = requireId(target.tenantId, "tenantId");

  if (upper(target.membershipStatus) !== "ACTIVE") {
    fail("HEADTEACHER_FEEDBACK_TARGET_MEMBERSHIP_INACTIVE", 409);
  }

  if (upper(target.tenantStatus) !== "ACTIVE") {
    fail("HEADTEACHER_FEEDBACK_TARGET_TENANT_INACTIVE", 409);
  }

  if (effectiveRole(target.roleName) !== "HEADTEACHER") {
    fail("HEADTEACHER_FEEDBACK_TARGET_NOT_HEADTEACHER", 409);
  }

  const expectedUserId = clean(input.expectedUserId);
  if (expectedUserId && expectedUserId !== userId) {
    fail("HEADTEACHER_FEEDBACK_TARGET_USER_MISMATCH", 409);
  }

  const expectedTenantId = clean(input.expectedTenantId);
  if (expectedTenantId && expectedTenantId !== tenantId) {
    fail("HEADTEACHER_FEEDBACK_TARGET_TENANT_MISMATCH", 409);
  }

  return {
    membershipId,
    userId,
    tenantId,
    roleName: "HEADTEACHER" as const,
    membershipStatus: "ACTIVE" as const,
    tenantStatus: "ACTIVE" as const,
  };
}

export function resolveEligibleHeadteacherFeedbackTeachers(input: {
  targetHeadteacherUserId: string;
  targetTenantId: string;
  candidates: readonly HeadteacherFeedbackTeacherCandidate[];
}): HeadteacherFeedbackEligibleParticipant[] {
  const targetHeadteacherUserId = requireId(
    input.targetHeadteacherUserId,
    "targetHeadteacherUserId",
  );
  const targetTenantId = requireId(input.targetTenantId, "targetTenantId");

  const eligible = input.candidates
    .filter((candidate) => {
      return (
        clean(candidate.userId) !== targetHeadteacherUserId &&
        clean(candidate.tenantId) === targetTenantId &&
        upper(candidate.membershipStatus) === "ACTIVE" &&
        upper(candidate.tenantStatus) === "ACTIVE" &&
        effectiveRole(candidate.roleName) === "TEACHER"
      );
    })
    .map((candidate) => ({
      membershipId: requireId(candidate.membershipId, "membershipId"),
      userId: requireId(candidate.userId, "userId"),
      tenantId: requireId(candidate.tenantId, "tenantId"),
    }));

  const byUserId = new Map<string, typeof eligible>();
  for (const candidate of eligible) {
    const rows = byUserId.get(candidate.userId) ?? [];
    rows.push(candidate);
    byUserId.set(candidate.userId, rows);
  }

  const duplicates = [...byUserId.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([userId, rows]) => ({
      userId,
      membershipIds: rows.map((row) => row.membershipId),
    }));

  if (duplicates.length) {
    fail("HEADTEACHER_FEEDBACK_DUPLICATE_ELIGIBLE_TEACHER", 409, {
      duplicates,
    });
  }

  if (!eligible.length) {
    fail("HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS", 409, {
      targetTenantId,
    });
  }

  return eligible
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((candidate) => ({
      respondentUserId: candidate.userId,
      respondentTenantId: targetTenantId,
      respondentRoleSnapshot: "TEACHER" as const,
      eligibilitySnapshot: {
        membershipId: candidate.membershipId,
        tenantId: targetTenantId,
        selectionBasis:
          "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN" as const,
      },
    }));
}

export function headteacherFeedbackDeadline(openedAt: Date) {
  const value = new Date(openedAt);
  if (Number.isNaN(value.getTime())) {
    fail("HEADTEACHER_FEEDBACK_INVALID_OPENED_AT", 400);
  }

  const deadline = new Date(value.getTime());
  deadline.setUTCDate(
    deadline.getUTCDate() + HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
  );
  return deadline;
}

export function isActiveHeadteacherFeedbackCycleStatus(
  status: AppraisalCycleStatus,
) {
  return ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES.includes(status);
}

export function assertHeadteacherFeedbackPendingCycleHasNoParticipants(input: {
  status: AppraisalCycleStatus;
  participantCount: number;
}) {
  if (
    PENDING_HEADTEACHER_FEEDBACK_CYCLE_STATUSES.includes(input.status) &&
    input.participantCount !== 0
  ) {
    fail("HEADTEACHER_FEEDBACK_PARTICIPANTS_FROZEN_BEFORE_OPEN", 409, {
      status: input.status,
      participantCount: input.participantCount,
    });
  }

  return true;
}

export function headteacherFeedbackParticipantsFreezeOnTransition(input: {
  from: AppraisalCycleStatus;
  to: AppraisalCycleStatus;
}) {
  return (
    (input.from === "DRAFT" || input.from === "PENDING_APPROVAL") &&
    input.to === HEADTEACHER_FEEDBACK_POLICY.participantFreezeStatus
  );
}
