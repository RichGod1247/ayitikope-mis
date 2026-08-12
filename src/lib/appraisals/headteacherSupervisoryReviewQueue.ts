import { prisma } from "@/lib/prisma";
import { hasAppraisalCapability } from "@/lib/appraisals/authority";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  instrumentCode: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  instrumentVersion: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  targetRole: "HEADTEACHER",
  reviewerRole: "HEAD_OF_SUPERVISION",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"] as const,
  requiredAssessmentStatus: "FINALIZED",
  requiredCycleStatus: "CLOSED",
  requiredReviewCount: 0,
  state: "READY_TO_START",
  nextAction: "START_REVIEW",
  activeTargetMembershipRequired: true,
  activeTargetTenantRequired: true,
  activeCircuitRequired: true,
  activeDistrictRequired: true,
  exactDistrictAssignmentRequired: true,
  immutableAssessmentHashRequired: true,
  fullAssessmentHashReverificationDeferredToAction: true,
  supervisoryEvidenceIncluded: false,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  contactDetailsIncluded: false,
  assessorUserIdIncluded: false,
  targetUserIdIncluded: false,
  reviewIdIncluded: false,
  assignmentIdsIncluded: false,
  proofHashesIncluded: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
  backgroundPollingAllowed: false,
} as const;

export type HeadteacherSupervisoryReviewOriginRole =
  (typeof HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.eligibleAssessorRoles)[number];

export type HeadteacherSupervisoryReviewQueueItem = {
  cycleId: string;
  assessmentId: string;
  revision: number;
  dateObserved: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  assessorRole: HeadteacherSupervisoryReviewOriginRole;
  assessorOfficeLabel: string;
  state: "READY_TO_START";
  nextAction: "START_REVIEW";
  eligible: true;
};

export type HeadteacherSupervisoryReviewQueue = {
  actorRole: string;
  officeLabel: string;
  summary: {
    assessments: number;
    circuits: number;
    schools: number;
  };
  items: HeadteacherSupervisoryReviewQueueItem[];
  readOnlyDiscovery: true;
  supervisoryEvidenceIncluded: false;
  staffFeedbackIncluded: false;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  contactDetailsIncluded: false;
  assessorUserIdIncluded: false;
  targetUserIdIncluded: false;
  reviewIdIncluded: false;
  assignmentIdsIncluded: false;
  proofHashesIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

export type ReadHeadteacherSupervisoryReviewQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  database?: HeadteacherSupervisoryReviewQueueDatabase;
};

type ScopeAssignment = GovernanceScope["assignments"][number];

type CandidateReviewRecord = {
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

type CandidateAssessmentRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  dateObserved: Date | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  reviews: CandidateReviewRecord[];
  _count: { reviews: number };
  instrumentVersion: {
    id: string;
    version: number;
    status: string;
    contentHash: string | null;
    instrument: {
      code: string;
      purpose: string;
      subjectType: string;
      isActive: boolean;
    };
  };
  cycle: {
    id: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    targetNameSnapshot: string | null;
    targetSchoolNameSnapshot: string | null;
    targetZoneNameSnapshot: string | null;
    targetRoleSnapshot: string | null;
    status: string;
    openedAt: Date | null;
    closedAt: Date | null;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
    scopeZone: {
      id: string;
      name: string;
      isActive: boolean;
      zoneType: { level: number };
    };
    targetZone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: { level: number };
    };
  };
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  tenant: {
    id: string;
    name: string;
    status: string;
    zone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: { level: number };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: { level: number };
      };
    };
  };
};

export type HeadteacherSupervisoryReviewQueueDatabase = {
  appraisalAssessment: {
    findMany(args: unknown): Promise<CandidateAssessmentRecord[]>;
  };
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
};

type VisitContext = {
  schemaVersion?: unknown;
  workflow?: unknown;
  evidenceStream?: unknown;
  target?: {
    userId?: unknown;
    role?: unknown;
    tenantId?: unknown;
    name?: unknown;
    schoolName?: unknown;
  };
  assessor?: {
    userId?: unknown;
    role?: unknown;
    assignmentId?: unknown;
  };
  jurisdiction?: {
    districtZoneId?: unknown;
    districtName?: unknown;
    circuitZoneId?: unknown;
    circuitName?: unknown;
  };
  instrument?: {
    instrumentVersionId?: unknown;
    code?: unknown;
    version?: unknown;
    contentHash?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
  };
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

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function displayName(user: TargetMembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    null
  );
}

function officeLabel(role: string) {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function emptyQueue(actorRole: string): HeadteacherSupervisoryReviewQueue {
  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    summary: {
      assessments: 0,
      circuits: 0,
      schools: 0,
    },
    items: [],
    readOnlyDiscovery: true,
    supervisoryEvidenceIncluded: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    contactDetailsIncluded: false,
    assessorUserIdIncluded: false,
    targetUserIdIncluded: false,
    reviewIdIncluded: false,
    assignmentIdsIncluded: false,
    proofHashesIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

function parseVisitContext(record: CandidateAssessmentRecord): VisitContext | null {
  const context = objectValue(record.evidenceSnapshotJson) as VisitContext;
  const schemaVersion = Number(context.schemaVersion);

  if (
    ![1, 2].includes(schemaVersion) ||
    clean(context.workflow) !== HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow ||
    clean(context.evidenceStream) !==
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream ||
    normalized(context.target?.role) !== "HEADTEACHER" ||
    clean(context.target?.userId) !== record.cycle.targetUserId ||
    clean(context.target?.tenantId) !== clean(record.cycle.targetTenantId) ||
    clean(context.assessor?.userId) !== record.assessorUserId ||
    clean(context.assessor?.assignmentId) !== clean(record.assessorAssignmentId) ||
    clean(context.instrument?.instrumentVersionId) !== record.instrumentVersion.id ||
    clean(context.instrument?.code) !==
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode ||
    Number(context.instrument?.version) !==
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion ||
    !isSha256(context.instrument?.contentHash) ||
    !record.dateObserved ||
    clean(context.observation?.dateObserved) !== isoDateOnly(record.dateObserved)
  ) {
    return null;
  }

  return context;
}

function commonAssessmentContract(record: CandidateAssessmentRecord) {
  const cycleMetadata = objectValue(record.cycle.metadata);
  const assessmentMetadata = objectValue(record.metadata);

  return Boolean(
    normalized(record.status) ===
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredAssessmentStatus &&
      record.revision >= 1 &&
      record.dateObserved &&
      record.finalizedAt &&
      record.finalizedByUserId === record.assessorUserId &&
      isSha256(record.assessmentHash) &&
      clean(assessmentMetadata.workflow) ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow &&
      clean(assessmentMetadata.evidenceStream) ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream &&
      assessmentMetadata.finalizedScoresImmutable === true &&
      assessmentMetadata.reviewerMayRewriteScores === false &&
      assessmentMetadata.separateFromStaffFeedback === true &&
      assessmentMetadata.combinedWeightingDefined === false &&
      assessmentMetadata.providerCalled === false &&
      normalized(record.cycle.status) ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredCycleStatus &&
      record.cycle.openedAt &&
      record.cycle.closedAt &&
      !record.cycle.reviewStartedAt &&
      !record.cycle.releasedAt &&
      !record.cycle.cancelledAt &&
      normalized(record.cycle.targetRoleSnapshot) === "HEADTEACHER" &&
      clean(cycleMetadata.workflow) === HEADTEACHER_FEEDBACK_POLICY.workflow &&
      record._count.reviews === 0 &&
      record.reviews.length === 0 &&
      record.instrumentVersion.version ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion &&
      normalized(record.instrumentVersion.status) === "ACTIVE" &&
      record.instrumentVersion.instrument.code ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode &&
      record.instrumentVersion.instrument.purpose ===
        "HEADTEACHER_SUPERVISORY_ASSESSMENT" &&
      record.instrumentVersion.instrument.subjectType === "HEADTEACHER" &&
      record.instrumentVersion.instrument.isActive === true &&
      isSha256(record.instrumentVersion.contentHash),
  );
}

function membershipKey(userId: string, tenantId: string) {
  return `${tenantId}:${userId}`;
}

function validCurrentTarget(
  membership: TargetMembershipRecord,
  record: CandidateAssessmentRecord,
) {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  return Boolean(
    clean(membership.id) &&
      membership.userId === record.cycle.targetUserId &&
      membership.user.id === membership.userId &&
      membership.tenantId === record.cycle.targetTenantId &&
      membership.tenant.id === membership.tenantId &&
      normalized(membership.status) === "ACTIVE" &&
      normalized(membership.role.name) === "HEADTEACHER" &&
      normalized(membership.tenant.status) === "ACTIVE" &&
      zone &&
      zone.isActive === true &&
      zone.zoneType.level ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel &&
      zone.id === record.cycle.targetZoneId &&
      district &&
      district.isActive === true &&
      district.zoneType.level ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      district.id === record.cycle.scopeZoneId &&
      zone.parentZoneId === district.id,
  );
}

function reviewerAssignmentForDistrict(input: {
  districtId: string;
  assignments: readonly ScopeAssignment[];
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      normalized(assignment.role) ===
        HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole &&
      assignment.zoneLevel ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      clean(assignment.zoneId) === input.districtId &&
      clean(assignment.id),
  );

  return matches.length === 1 ? matches[0] : null;
}

function scopeContainsTarget(input: {
  governanceScope: GovernanceScope;
  tenantId: string;
  circuitId: string;
  districtId: string;
}) {
  const tenantIds = new Set(
    input.governanceScope.tenantIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.has(input.tenantId)) return false;
  if (input.governanceScope.isSuperAdmin) return true;

  const zoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );
  return zoneIds.has(input.circuitId) || zoneIds.has(input.districtId);
}

function publicQueueItem(input: {
  record: CandidateAssessmentRecord;
  membership: TargetMembershipRecord;
  context: VisitContext;
  assessorRole: HeadteacherSupervisoryReviewOriginRole;
}): HeadteacherSupervisoryReviewQueueItem {
  return {
    cycleId: input.record.cycleId,
    assessmentId: input.record.id,
    revision: input.record.revision,
    dateObserved: isoDateOnly(input.record.dateObserved!),
    targetName:
      clean(input.context.target?.name) || displayName(input.membership.user),
    schoolId: input.membership.tenant.id,
    schoolName:
      clean(input.context.target?.schoolName) || input.membership.tenant.name,
    circuitId: input.membership.tenant.zone!.id,
    circuitName:
      clean(input.context.jurisdiction?.circuitName) ||
      input.membership.tenant.zone!.name,
    districtId: input.membership.tenant.zone!.parentZone!.id,
    districtName:
      clean(input.context.jurisdiction?.districtName) ||
      input.membership.tenant.zone!.parentZone!.name,
    assessorRole: input.assessorRole,
    assessorOfficeLabel: officeLabel(input.assessorRole),
    state: "READY_TO_START",
    nextAction: "START_REVIEW",
    eligible: true,
  };
}

export async function readHeadteacherSupervisoryReviewQueue(
  input: ReadHeadteacherSupervisoryReviewQueueInput,
): Promise<HeadteacherSupervisoryReviewQueue> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = normalized(input.actorRoleName);
  const empty = () => emptyQueue(actorRole);

  if (!actorUserId) return empty();
  if (
    actorRole !== HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole ||
    !hasAppraisalCapability(
      actorRole,
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredCapability,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_ROLE_FORBIDDEN", 403);
  }

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  if (!tenantIds.length) return empty();

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryReviewQueueDatabase);

  const assessments = await database.appraisalAssessment.findMany({
    where: {
      status: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredAssessmentStatus,
      cycle: {
        status: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredCycleStatus,
        targetTenantId: { in: tenantIds },
        targetRoleSnapshot: "HEADTEACHER",
        reviewStartedAt: null,
        releasedAt: null,
        cancelledAt: null,
      },
      instrumentVersion: {
        version: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion,
        status: "ACTIVE",
        instrument: {
          code: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode,
          purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
          subjectType: "HEADTEACHER",
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      cycleId: true,
      assessorUserId: true,
      assessorAssignmentId: true,
      status: true,
      revision: true,
      dateObserved: true,
      evidenceSnapshotJson: true,
      assessmentHash: true,
      finalizedByUserId: true,
      finalizedAt: true,
      metadata: true,
      reviews: {
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
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      },
      _count: { select: { reviews: true } },
      instrumentVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          contentHash: true,
          instrument: {
            select: {
              code: true,
              purpose: true,
              subjectType: true,
              isActive: true,
            },
          },
        },
      },
      cycle: {
        select: {
          id: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          targetNameSnapshot: true,
          targetSchoolNameSnapshot: true,
          targetZoneNameSnapshot: true,
          targetRoleSnapshot: true,
          status: true,
          openedAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
          scopeZone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              zoneType: { select: { level: true } },
            },
          },
          targetZone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              parentZoneId: true,
              zoneType: { select: { level: true } },
            },
          },
        },
      },
    },
    orderBy: [{ finalizedAt: "asc" }, { createdAt: "asc" }],
    take: 200,
  });

  const targetUserIds = [
    ...new Set(assessments.map((record) => clean(record.cycle.targetUserId))),
  ].filter(Boolean);

  const memberships = targetUserIds.length
    ? await database.membership.findMany({
        where: {
          userId: { in: targetUserIds },
          tenantId: { in: tenantIds },
          status: "ACTIVE",
          role: {
            name: {
              equals: "HEADTEACHER",
              mode: "insensitive",
            },
          },
          tenant: { status: "ACTIVE" },
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          status: true,
          role: { select: { name: true } },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
              status: true,
              zone: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                  parentZoneId: true,
                  zoneType: { select: { level: true } },
                  parentZone: {
                    select: {
                      id: true,
                      name: true,
                      isActive: true,
                      zoneType: { select: { level: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const membershipByTarget = new Map<string, TargetMembershipRecord>();
  for (const membership of memberships) {
    const key = membershipKey(membership.userId, membership.tenantId);
    if (!membershipByTarget.has(key)) membershipByTarget.set(key, membership);
  }

  const items: HeadteacherSupervisoryReviewQueueItem[] = [];

  for (const record of assessments) {
    if (!commonAssessmentContract(record)) continue;

    const context = parseVisitContext(record);
    if (!context) continue;

    const assessorRole = canonicalHeadteacherSupervisoryAssessorRole(
      context.assessor?.role,
    );
    if (
      !HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.eligibleAssessorRoles.includes(
        assessorRole as HeadteacherSupervisoryReviewOriginRole,
      )
    ) {
      continue;
    }

    const targetTenantId = clean(record.cycle.targetTenantId);
    const circuitId = clean(record.cycle.targetZoneId);
    const districtId = clean(record.cycle.scopeZoneId);
    if (!targetTenantId || !circuitId || !districtId) continue;

    if (
      !scopeContainsTarget({
        governanceScope: input.governanceScope,
        tenantId: targetTenantId,
        circuitId,
        districtId,
      })
    ) {
      continue;
    }

    const reviewerAssignment = reviewerAssignmentForDistrict({
      districtId,
      assignments: input.governanceScope.assignments,
    });
    if (!reviewerAssignment) continue;

    const membership = membershipByTarget.get(
      membershipKey(record.cycle.targetUserId, targetTenantId),
    );
    if (!membership || !validCurrentTarget(membership, record)) continue;

    const contextDistrictId = clean(context.jurisdiction?.districtZoneId);
    const contextCircuitId = clean(context.jurisdiction?.circuitZoneId);
    const contextDistrictName = clean(context.jurisdiction?.districtName);
    const contextCircuitName = clean(context.jurisdiction?.circuitName);
    const contextSchoolName = clean(context.target?.schoolName);

    if (
      contextDistrictId !== districtId ||
      contextCircuitId !== circuitId ||
      !contextDistrictName ||
      !contextCircuitName ||
      !contextSchoolName ||
      clean(context.target?.userId) !== membership.userId ||
      clean(context.target?.tenantId) !== membership.tenantId
    ) {
      continue;
    }

    items.push(
      publicQueueItem({
        record,
        membership,
        context,
        assessorRole: assessorRole as HeadteacherSupervisoryReviewOriginRole,
      }),
    );
  }

  items.sort((left, right) => {
    const dateDifference = left.dateObserved.localeCompare(right.dateObserved);
    if (dateDifference !== 0) return dateDifference;
    const circuitDifference = left.circuitName.localeCompare(right.circuitName);
    if (circuitDifference !== 0) return circuitDifference;
    const schoolDifference = left.schoolName.localeCompare(right.schoolName);
    if (schoolDifference !== 0) return schoolDifference;
    return (left.targetName ?? "").localeCompare(right.targetName ?? "");
  });

  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    summary: {
      assessments: items.length,
      circuits: new Set(items.map((item) => item.circuitId)).size,
      schools: new Set(items.map((item) => item.schoolId)).size,
    },
    items,
    readOnlyDiscovery: true,
    supervisoryEvidenceIncluded: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    contactDetailsIncluded: false,
    assessorUserIdIncluded: false,
    targetUserIdIncluded: false,
    reviewIdIncluded: false,
    assignmentIdsIncluded: false,
    proofHashesIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}
