import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  TEACHER_SUPERVISORY_REVIEW_POLICY,
  decideTeacherSupervisoryReviewAuthority,
  teacherSupervisoryReviewChainForAssessor,
  type TeacherSupervisoryReviewOriginRole,
  type TeacherSupervisoryReviewerRole,
} from "@/lib/appraisals/teacherSupervisoryReview";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  instrumentCode: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  instrumentVersion: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  targetRole: "TEACHER",
  reviewerRoles: TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles,
  readOnlyDiscovery: true,
  requiredAssessmentStatus: "FINALIZED",
  requiredCycleStatus: "OPEN",
  requiredReviewCount: 0,
  activeTargetMembershipRequired: true,
  activeTargetTenantRequired: true,
  activeCircuitRequired: true,
  activeDistrictRequired: true,
  currentReviewerAssignmentRequired: true,
  reviewerAuthorityRecheckedPerAssessment: true,
  immutableAssessmentHashRequired: true,
  fullAssessmentHashReverificationDeferredToReviewAdmission: true,
  assessmentEvidenceIncluded: false,
  scoresIncluded: false,
  generalCommentIncluded: false,
  observationDetailsIncluded: false,
  classEnrolmentEvidenceIncluded: false,
  contactDetailsIncluded: false,
  legacyTeacherAppraisalIncluded: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
  backgroundPollingAllowed: false,
} as const;

export type TeacherSupervisoryReviewQueueState = "READY_TO_START";

export type TeacherSupervisoryReviewQueueItem = {
  cycleId: string;
  assessmentId: string;
  revision: number;
  dateObserved: string;
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  assessorUserId: string;
  assessorRole: TeacherSupervisoryReviewOriginRole;
  assessorOfficeLabel: string;
  requiredReviewStage: number;
  reviewerRole: TeacherSupervisoryReviewerRole;
  state: TeacherSupervisoryReviewQueueState;
  eligible: true;
};

export type TeacherSupervisoryReviewQueue = {
  actorRole: TeacherSupervisoryReviewerRole | string;
  officeLabel: string;
  summary: {
    assessments: number;
    circuits: number;
    schools: number;
  };
  items: TeacherSupervisoryReviewQueueItem[];
  readOnlyDiscovery: true;
  assessmentEvidenceIncluded: false;
  scoresIncluded: false;
  generalCommentIncluded: false;
  observationDetailsIncluded: false;
  classEnrolmentEvidenceIncluded: false;
  contactDetailsIncluded: false;
  legacyTeacherAppraisalIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

export type ReadTeacherSupervisoryReviewQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: TeacherSupervisoryReviewQueueDatabase;
};

type ScopeAssignment = GovernanceScope["assignments"][number];

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
    instrumentVersionId: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    status: string;
    responseWindowDays: number;
    minimumResponses: number;
    openedAt: Date | null;
    deadlineAt: Date | null;
    closedAt: Date | null;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
    _count: { participants: number };
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

export type TeacherSupervisoryReviewQueueDatabase = {
  appraisalAssessment: {
    findMany(args: unknown): Promise<CandidateAssessmentRecord[]>;
  };
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
};

type ObservationContext = {
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
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function canonicalReviewerRole(value: unknown) {
  const role = normalized(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles.includes(
    role as TeacherSupervisoryReviewerRole,
  )
    ? (role as TeacherSupervisoryReviewerRole)
    : null;
}

function emptyQueue(actorRole: string): TeacherSupervisoryReviewQueue {
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
    assessmentEvidenceIncluded: false,
    scoresIncluded: false,
    generalCommentIncluded: false,
    observationDetailsIncluded: false,
    classEnrolmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    legacyTeacherAppraisalIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

function parseObservationContext(
  record: CandidateAssessmentRecord,
): ObservationContext | null {
  const context = objectValue(record.evidenceSnapshotJson) as ObservationContext;
  const metadata = objectValue(record.metadata);
  const schemaVersion = Number(context.schemaVersion);

  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    clean(context.workflow) !== TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow ||
    clean(context.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream ||
    clean(context.target?.userId) !== record.cycle.targetUserId ||
    clean(context.target?.tenantId) !== clean(record.cycle.targetTenantId) ||
    normalized(context.target?.role) !== "TEACHER" ||
    clean(context.assessor?.userId) !== record.assessorUserId ||
    clean(context.assessor?.assignmentId) !== clean(record.assessorAssignmentId) ||
    clean(context.jurisdiction?.districtZoneId) !== record.cycle.scopeZoneId ||
    clean(context.jurisdiction?.circuitZoneId) !== clean(record.cycle.targetZoneId) ||
    !record.dateObserved ||
    clean(context.observation?.dateObserved) !== isoDateOnly(record.dateObserved) ||
    !isSha256(metadata.observationContextHash) ||
    metadata.observationContextImmutable !== true ||
    metadata.separateFromLegacyTeacherAppraisal !== true ||
    metadata.legacyTeacherAppraisalMutationAllowed !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    return null;
  }

  return context;
}

function cycleReadyForReview(record: CandidateAssessmentRecord) {
  const cycleMetadata = objectValue(record.cycle.metadata);
  return Boolean(
    normalized(record.status) ===
      TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredAssessmentStatus &&
      normalized(record.cycle.status) ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredCycleStatus &&
      record.cycle.instrumentVersionId === record.instrumentVersion.id &&
      record.cycle.openedAt &&
      record.cycle.deadlineAt === null &&
      record.cycle.closedAt === null &&
      record.cycle.reviewStartedAt === null &&
      record.cycle.releasedAt === null &&
      record.cycle.cancelledAt === null &&
      record.cycle.responseWindowDays === 0 &&
      record.cycle.minimumResponses === 0 &&
      record.cycle._count.participants === 0 &&
      record._count.reviews ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredReviewCount &&
      record.finalizedAt &&
      record.finalizedByUserId === record.assessorUserId &&
      isSha256(record.assessmentHash) &&
      clean(cycleMetadata.workflow) ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.workflow &&
      clean(cycleMetadata.evidenceStream) ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.evidenceStream &&
      cycleMetadata.respondentWorkflow === false &&
      clean(cycleMetadata.participantSelection) === "NONE" &&
      cycleMetadata.legacyTeacherAppraisalIncluded === false &&
      cycleMetadata.combinedWeightingDefined === false &&
      cycleMetadata.providerCalled === false &&
      record.instrumentVersion.version ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion &&
      normalized(record.instrumentVersion.status) === "ACTIVE" &&
      record.instrumentVersion.instrument.code ===
        TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode &&
      record.instrumentVersion.instrument.purpose === "TEACHER_OBSERVATION" &&
      record.instrumentVersion.instrument.subjectType === "TEACHER" &&
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
      normalized(membership.role.name) === "TEACHER" &&
      normalized(membership.tenant.status) === "ACTIVE" &&
      zone &&
      zone.isActive === true &&
      zone.zoneType.level ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel &&
      zone.id === record.cycle.targetZoneId &&
      district &&
      district.isActive === true &&
      district.zoneType.level ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      district.id === record.cycle.scopeZoneId &&
      zone.parentZoneId === district.id,
  );
}

function reviewerAssignmentForDistrict(input: {
  actorRole: TeacherSupervisoryReviewerRole;
  districtId: string;
  assignments: readonly ScopeAssignment[];
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      normalized(assignment.role) === input.actorRole &&
      assignment.zoneLevel ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel &&
      clean(assignment.zoneId) === input.districtId,
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

export async function readTeacherSupervisoryReviewQueue(
  input: ReadTeacherSupervisoryReviewQueueInput,
): Promise<TeacherSupervisoryReviewQueue> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = canonicalReviewerRole(input.actorRoleName);
  const empty = () => emptyQueue(actorRole ?? normalized(input.actorRoleName));

  if (!actorUserId || !actorRole) return empty();

  const now = input.now ? new Date(input.now.getTime()) : new Date();
  if (Number.isNaN(now.getTime())) return empty();

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  if (!tenantIds.length) return empty();

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReviewQueueDatabase);

  const assessments = await database.appraisalAssessment.findMany({
    where: {
      status: "FINALIZED",
      cycle: {
        status: "OPEN",
        targetTenantId: { in: tenantIds },
      },
      instrumentVersion: {
        version: TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentVersion,
        status: "ACTIVE",
        instrument: {
          code: TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.instrumentCode,
          purpose: "TEACHER_OBSERVATION",
          subjectType: "TEACHER",
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
          instrumentVersionId: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          status: true,
          responseWindowDays: true,
          minimumResponses: true,
          openedAt: true,
          deadlineAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
          _count: { select: { participants: true } },
        },
      },
    },
    orderBy: [{ finalizedAt: "asc" }, { createdAt: "asc" }],
  });

  if (!assessments.length) return empty();

  const targetUserIds = [
    ...new Set(assessments.map((record) => record.cycle.targetUserId)),
  ];
  const memberships = await database.membership.findMany({
    where: {
      userId: { in: targetUserIds },
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
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
  });

  const membershipByTarget = new Map<string, TargetMembershipRecord>();
  for (const membership of memberships) {
    const key = membershipKey(membership.userId, membership.tenantId);
    if (!membershipByTarget.has(key)) membershipByTarget.set(key, membership);
  }

  const items: TeacherSupervisoryReviewQueueItem[] = [];

  for (const record of assessments) {
    if (!cycleReadyForReview(record)) continue;

    const context = parseObservationContext(record);
    if (!context) continue;

    const assessorRole = canonicalTeacherSupervisoryAssessorRole(
      context.assessor?.role,
    ) as TeacherSupervisoryReviewOriginRole;
    const chain = teacherSupervisoryReviewChainForAssessor(assessorRole);
    const firstStage = chain?.stages[0];
    if (!chain || !firstStage) continue;

    const authority = decideTeacherSupervisoryReviewAuthority({
      actorUserId,
      actorRoleName: actorRole,
      assessorUserId: record.assessorUserId,
      assessorRoleName: assessorRole,
      stage: firstStage.stage,
    });
    if (!authority.allowed) continue;

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
      actorRole,
      districtId,
      assignments: input.governanceScope.assignments,
    });
    if (!reviewerAssignment) continue;

    const membership = membershipByTarget.get(
      membershipKey(record.cycle.targetUserId, targetTenantId),
    );
    if (!membership || !validCurrentTarget(membership, record)) continue;

    const contextDistrictName = clean(context.jurisdiction?.districtName);
    const contextCircuitName = clean(context.jurisdiction?.circuitName);
    const contextSchoolName = clean(context.target?.schoolName);
    const contextTargetName = clean(context.target?.name) || null;

    if (
      !contextDistrictName ||
      !contextCircuitName ||
      !contextSchoolName ||
      clean(context.target?.userId) !== membership.userId ||
      clean(context.target?.tenantId) !== membership.tenantId
    ) {
      continue;
    }

    items.push({
      cycleId: record.cycleId,
      assessmentId: record.id,
      revision: record.revision,
      dateObserved: isoDateOnly(record.dateObserved!),
      targetUserId: membership.userId,
      targetName: contextTargetName ?? displayName(membership.user),
      schoolId: membership.tenant.id,
      schoolName: contextSchoolName,
      circuitId,
      circuitName: contextCircuitName,
      districtId,
      districtName: contextDistrictName,
      assessorUserId: record.assessorUserId,
      assessorRole: authority.assessorRole,
      assessorOfficeLabel: officeLabel(authority.assessorRole),
      requiredReviewStage: authority.stage,
      reviewerRole: authority.reviewerRole,
      state: "READY_TO_START",
      eligible: true,
    });
  }

  items.sort((left, right) => {
    const districtDifference = left.districtName.localeCompare(
      right.districtName,
    );
    if (districtDifference !== 0) return districtDifference;

    const circuitDifference = left.circuitName.localeCompare(
      right.circuitName,
    );
    if (circuitDifference !== 0) return circuitDifference;

    const schoolDifference = left.schoolName.localeCompare(right.schoolName);
    if (schoolDifference !== 0) return schoolDifference;

    const teacherDifference = (left.targetName ?? "").localeCompare(
      right.targetName ?? "",
    );
    if (teacherDifference !== 0) return teacherDifference;

    const dateDifference = left.dateObserved.localeCompare(right.dateObserved);
    if (dateDifference !== 0) return dateDifference;

    return left.assessmentId.localeCompare(right.assessmentId);
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
    assessmentEvidenceIncluded: false,
    scoresIncluded: false,
    generalCommentIncluded: false,
    observationDetailsIncluded: false,
    classEnrolmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    legacyTeacherAppraisalIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}
