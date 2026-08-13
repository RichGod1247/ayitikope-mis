import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hasAppraisalCapability } from "@/lib/appraisals/authority";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY = {
  schemaVersion: 1,
  audience: "HEAD_OF_SUPERVISION",
  workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"] as const,
  requiredAssessmentStatus: "FINALIZED",
  requiredCycleStatus: "CLOSED",
  requiredReviewCount: 0,
  activeCycleStatus: "UNDER_REVIEW",
  activeReviewCount: 1,
  activeReviewStage: 1,
  activeReviewDecision: "PENDING",
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  officialVisitDetailsIncluded: true,
  legacyVisitContextReadable: true,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  contactDetailsIncluded: false,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  readOnly: true,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type HeadteacherSupervisoryReviewPackage = {
  schemaVersion: 1;
  audience: "HEAD_OF_SUPERVISION";
  lifecycleState: "READY_TO_START" | "READY_TO_REVIEW";
  cycle: {
    id: string;
    status: "CLOSED" | "UNDER_REVIEW";
    targetName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
  };
  review: null | {
    stage: 1;
    decision: "PENDING";
    startedAt: string;
  };
  assessment: {
    id: string;
    revision: number;
    status: "FINALIZED";
    dateObserved: string;
    finalizedAt: string;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    assessor: {
      name: string;
      role: "SISSO" | "BASIC_SCHOOL_COORDINATOR";
      office: string;
      scopeLevel: "CIRCUIT" | "DISTRICT";
    };
    visit: {
      contextSchemaVersion: 1 | 2;
      officialDetailsAvailable: boolean;
      arrivalTime: string | null;
      staffStrength: number | null;
      totalEnrolment: number | null;
      girls: number | null;
      boys: number | null;
      teachersPresentAtVisit: number | null;
    };
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionDescription: string | null;
      sectionOrder: number;
      sectionMaxScore: number;
      percentage: number | null;
      rawScore: number;
      applicableMaximum: number;
      notApplicableItems: number;
      items: Array<{
        itemKey: string;
        itemLabel: string;
        itemOrder: number;
        itemMaxScore: number;
        score: number | null;
        notApplicable: boolean;
        percentage: number | null;
      }>;
    }>;
  };
  privacy: {
    staffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    participantListIncluded: false;
    contactDetailsIncluded: false;
    assessorUserIdIncluded: false;
    targetUserIdIncluded: false;
    reviewerUserIdIncluded: false;
    assignmentIdsIncluded: false;
    proofHashesIncluded: false;
  };
  integrity: {
    finalizedAssessmentVerified: true;
    assessmentHashVerified: true;
    visitContextHashVerified: true;
    calculationsVerified: true;
    instrumentVerified: true;
    currentTargetScopeVerified: true;
    currentHosAssignmentVerified: true;
    noExistingReviewCustody: boolean;
    activeReviewCustodyVerified: boolean;
    reviewerMayRewriteScores: false;
    scoreMutationAllowed: false;
    separateFromStaffFeedback: true;
    combinedWeightingDefined: false;
    providerCalled: false;
  };
};

export type ReadHeadteacherSupervisoryReviewPackageInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: HeadteacherSupervisoryReviewPackageDatabase;
};

type InstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
  isRequired: boolean;
};

type InstrumentSectionRecord = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: InstrumentItemRecord[];
};

type AssessmentScoreRecord = {
  id: string;
  assessmentId: string;
  instrumentItemId: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  score: number | null;
  notApplicable: boolean;
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

type AssessmentRecord = {
  id: string;
  cycleId: string;
  instrumentVersionId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  dateObserved: Date | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  scores: AssessmentScoreRecord[];
  reviews: ReviewRecord[];
  cycle: {
    id: string;
    instrumentVersionId: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    targetRoleSnapshot: string | null;
    status: string;
    openedAt: Date | null;
    closedAt: Date | null;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
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
  };
  instrumentVersion: {
    id: string;
    version: number;
    status: string;
    contentHash: string | null;
    instrument: {
      id: string;
      code: string;
      purpose: string;
      subjectType: string;
      isActive: boolean;
    };
    sections: InstrumentSectionRecord[];
  };
};

type CurrentAssessmentRecord = {
  id: string;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
};

type MembershipRecord = {
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

type ReviewerAssignmentRecord = {
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
    name: string;
    isActive: boolean;
    zoneType: { level: number };
  };
};

export type HeadteacherSupervisoryReviewPackageDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
    findMany(args: unknown): Promise<CurrentAssessmentRecord[]>;
  };
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<ReviewerAssignmentRecord[]>;
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
    name?: unknown;
    role?: unknown;
    assignmentId?: unknown;
    assignmentRole?: unknown;
    scopeLevel?: unknown;
  };
  jurisdiction?: {
    districtZoneId?: unknown;
    districtName?: unknown;
    circuitZoneId?: unknown;
    circuitName?: unknown;
    assignmentZoneId?: unknown;
    assignmentZoneName?: unknown;
    assignmentParentZoneId?: unknown;
    assignmentParentZoneName?: unknown;
  };
  instrument?: {
    instrumentId?: unknown;
    instrumentVersionId?: unknown;
    code?: unknown;
    version?: unknown;
    contentHash?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
    visitDetails?: unknown;
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
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_INVALID_CURRENT_TIME", 400);
  }
  return now;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function displayName(user: MembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    "Headteacher"
  );
}

function officeLabel(role: "SISSO" | "BASIC_SCHOOL_COORDINATOR") {
  return role === "SISSO" ? "SISSO" : "Basic School Coordinator";
}

function expectedScopeLevel(role: "SISSO" | "BASIC_SCHOOL_COORDINATOR") {
  return role === "SISSO" ? ("CIRCUIT" as const) : ("DISTRICT" as const);
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

function assignmentIsActive(assignment: ReviewerAssignmentRecord, now: Date) {
  if (
    normalized(assignment.role) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    assignment.zoneId !== assignment.zone.id
  ) {
    return false;
  }
  if (assignment.startsAt && assignment.startsAt.getTime() > now.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function scopeCarriesAssignment(input: {
  governanceScope: GovernanceScope;
  assignment: ReviewerAssignmentRecord;
}) {
  return input.governanceScope.assignments.some(
    (scopeAssignment) =>
      clean(scopeAssignment.id) === input.assignment.id &&
      normalized(scopeAssignment.role) ===
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience &&
      clean(scopeAssignment.zoneId) === input.assignment.zoneId &&
      scopeAssignment.zoneLevel ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel,
  );
}

function resolveReviewerAssignment(input: {
  assignments: ReviewerAssignmentRecord[];
  actorUserId: string;
  districtId: string;
  governanceScope: GovernanceScope;
  now: Date;
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actorUserId &&
      assignment.zoneId === input.districtId &&
      assignmentIsActive(assignment, input.now) &&
      scopeCarriesAssignment({
        governanceScope: input.governanceScope,
        assignment,
      }),
  );

  if (matches.length === 0) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_HOS_ASSIGNMENT_REQUIRED",
      403,
    );
  }
  if (matches.length !== 1) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_AMBIGUOUS_HOS_ASSIGNMENT",
      409,
    );
  }
  return matches[0];
}

function resolveLifecycle(record: AssessmentRecord) {
  const cycle = record.cycle;
  const metadata = objectValue(cycle.metadata);
  const staffVersion = cycle.instrumentVersion;
  const cycleStatus = normalized(cycle.status);

  const commonValid =
    cycle.id === record.cycleId &&
    Boolean(cycle.openedAt) &&
    Boolean(cycle.closedAt) &&
    !cycle.releasedAt &&
    !cycle.cancelledAt &&
    normalized(cycle.targetRoleSnapshot) === "HEADTEACHER" &&
    clean(metadata.workflow) === HEADTEACHER_FEEDBACK_POLICY.workflow &&
    Boolean(clean(cycle.targetTenantId)) &&
    Boolean(clean(cycle.targetZoneId)) &&
    Boolean(clean(cycle.scopeZoneId)) &&
    cycle.instrumentVersionId === staffVersion.id &&
    staffVersion.version === HEADTEACHER_FEEDBACK_POLICY.instrumentVersion &&
    normalized(staffVersion.status) === "ACTIVE" &&
    staffVersion.instrument.code === HEADTEACHER_FEEDBACK_POLICY.instrumentCode &&
    staffVersion.instrument.purpose === "HEADTEACHER_STAFF_FEEDBACK" &&
    staffVersion.instrument.subjectType === "HEADTEACHER" &&
    staffVersion.instrument.isActive === true &&
    isSha256(staffVersion.contentHash);

  if (!commonValid) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
      status: cycleStatus,
    });
  }

  if (
    cycleStatus ===
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.requiredCycleStatus
  ) {
    if (cycle.reviewStartedAt) {
      fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID", 409, {
        cycleId: cycle.id,
        status: cycleStatus,
      });
    }
    return {
      lifecycleState: "READY_TO_START" as const,
      review: null,
    };
  }

  if (
    cycleStatus ===
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeCycleStatus
  ) {
    if (
      !cycle.reviewStartedAt ||
      record.reviews.length !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeReviewCount
    ) {
      fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID", 409, {
        cycleId: cycle.id,
        status: cycleStatus,
      });
    }

    const review = record.reviews[0];
    const reviewMetadata = objectValue(review.metadata);
    if (
      review.cycleId !== record.cycleId ||
      review.assessmentId !== record.id ||
      review.stage !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeReviewStage ||
      normalized(review.decision) !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeReviewDecision ||
      clean(review.note) ||
      review.decidedAt ||
      normalized(reviewMetadata.reviewerRole) !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience ||
      clean(reviewMetadata.workflow) !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
      clean(reviewMetadata.evidenceStream) !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
      Number(reviewMetadata.reviewStage) !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeReviewStage ||
      reviewMetadata.reviewerMayRewriteScores !== false ||
      reviewMetadata.staffFeedbackIncluded !== false ||
      reviewMetadata.respondentIdentitiesIncluded !== false ||
      reviewMetadata.providerCalled !== false
    ) {
      fail(
        "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_REVIEW_CONTRACT_INVALID",
        409,
      );
    }

    return {
      lifecycleState: "READY_TO_REVIEW" as const,
      review,
    };
  }

  fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID", 409, {
    cycleId: cycle.id,
    status: cycleStatus,
  });
}


function assertAssessmentBaseContract(
  record: AssessmentRecord,
  lifecycle: ReturnType<typeof resolveLifecycle>,
) {
  const metadata = objectValue(record.metadata);
  const version = record.instrumentVersion;
  const expectedReviewCount =
    lifecycle.lifecycleState === "READY_TO_START"
      ? HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.requiredReviewCount
      : HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.activeReviewCount;

  if (
    normalized(record.status) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.requiredAssessmentStatus ||
    !Number.isInteger(record.revision) ||
    record.revision < 1 ||
    !record.assessorAssignmentId ||
    !record.dateObserved ||
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    clean(record.generalComment) ||
    !isSha256(record.assessmentHash) ||
    clean(metadata.workflow) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
    clean(metadata.evidenceStream) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
    metadata.finalizedScoresImmutable !== true ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateFromStaffFeedback !== true ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false ||
    record.instrumentVersionId !== version.id ||
    version.version !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    normalized(version.status) !== "ACTIVE" ||
    version.instrument.code !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    version.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    version.instrument.subjectType !== "HEADTEACHER" ||
    version.instrument.isActive !== true ||
    !isSha256(version.contentHash) ||
    record.reviews.length !== expectedReviewCount
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_CONTRACT_INVALID",
      409,
      { assessmentId: record.id, status: normalized(record.status) },
    );
  }
}

function assertCurrentAssessmentUniqueness(
  current: CurrentAssessmentRecord[],
  assessmentId: string,
) {
  const unresolved = current.filter((row) =>
    ["DRAFT", "RETURNED"].includes(normalized(row.status)),
  );
  if (unresolved.length) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SUPERVISORY_WORK_UNRESOLVED",
      409,
      {
        assessmentId: unresolved[0].id,
        status: normalized(unresolved[0].status),
      },
    );
  }

  const finalized = current.filter(
    (row) => normalized(row.status) === "FINALIZED",
  );
  if (finalized.length !== 1 || finalized[0].id !== assessmentId) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CURRENT_ASSESSMENT_AMBIGUOUS",
      409,
      { finalizedAssessments: finalized.length },
    );
  }
}

function assertTargetMembership(
  membership: MembershipRecord | null,
  record: AssessmentRecord,
) {
  if (!membership) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_TARGET_NOT_FOUND", 404);
  }

  const zone = membership.tenant.zone;
  const district = zone?.parentZone;
  if (
    membership.userId !== record.cycle.targetUserId ||
    membership.user.id !== membership.userId ||
    membership.tenantId !== record.cycle.targetTenantId ||
    membership.tenant.id !== membership.tenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    zone.id !== record.cycle.targetZoneId ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    district.id !== record.cycle.scopeZoneId ||
    zone.parentZoneId !== district.id
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_TARGET_JURISDICTION_DRIFT",
      409,
    );
  }

  return membership;
}

function instrumentSections(record: AssessmentRecord) {
  const sections = [...record.instrumentVersion.sections].sort(
    (left, right) => left.order - right.order,
  );

  if (
    sections.length !==
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.expectedSectionCount
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SECTION_COUNT_DRIFT", 409);
  }

  const sectionKeys = new Set<string>();
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  let itemCount = 0;

  for (const [index, section] of sections.entries()) {
    if (
      !clean(section.id) ||
      !clean(section.key) ||
      !clean(section.title) ||
      sectionKeys.has(section.key) ||
      section.order !== index + 1 ||
      section.maxScore !==
        HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY
          .expectedSectionMaximums[index]
    ) {
      fail(
        "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SECTION_STRUCTURE_DRIFT",
        409,
        { sectionKey: section.key },
      );
    }
    sectionKeys.add(section.key);

    const items = [...section.items].sort(
      (left, right) => left.order - right.order,
    );
    const rawMaximum = items.reduce(
      (sum, item) => sum + item.maxScore,
      0,
    );
    if (rawMaximum !== section.maxScore) {
      fail(
        "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SECTION_MAXIMUM_DRIFT",
        409,
        { sectionKey: section.key },
      );
    }

    const itemOrders = new Set<number>();
    for (const item of items) {
      if (
        !clean(item.id) ||
        !clean(item.key) ||
        !clean(item.label) ||
        itemIds.has(item.id) ||
        itemKeys.has(item.key) ||
        itemOrders.has(item.order) ||
        !Number.isInteger(item.order) ||
        item.order < 1 ||
        item.maxScore !==
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail(
          "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ITEM_STRUCTURE_DRIFT",
          409,
          { itemKey: item.key },
        );
      }
      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemOrders.add(item.order);
      itemCount += 1;
    }
  }

  if (
    itemCount !== HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.expectedItemCount
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ITEM_COUNT_DRIFT", 409, {
      itemCount,
    });
  }

  return sections;
}

function scoringRows(
  record: AssessmentRecord,
  sections: InstrumentSectionRecord[],
) {
  const stored = new Map(
    record.scores.map((row) => [row.instrumentItemId, row]),
  );
  if (
    stored.size !== record.scores.length ||
    record.scores.length !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.expectedItemCount
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SCORE_COUNT_DRIFT",
      409,
    );
  }

  return sections.flatMap((section) =>
    [...section.items]
      .sort((left, right) => left.order - right.order)
      .map((item) => {
        const row = stored.get(item.id);
        if (
          !row ||
          row.assessmentId !== record.id ||
          row.sectionKey !== section.key ||
          row.sectionTitle !== section.title ||
          row.sectionOrder !== section.order ||
          row.sectionMaxScore !== section.maxScore ||
          row.itemKey !== item.key ||
          row.itemLabel !== item.label ||
          row.itemOrder !== item.order ||
          row.itemMaxScore !== item.maxScore ||
          (row.notApplicable && row.score != null) ||
          (!row.notApplicable &&
            (!Number.isInteger(row.score) ||
              (row.score as number) <
                HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.scaleMinimum ||
              (row.score as number) > item.maxScore))
        ) {
          fail(
            "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SCORE_EVIDENCE_INVALID",
            409,
            { itemKey: item.key },
          );
        }

        return {
          itemKey: item.key,
          sectionKey: section.key,
          sectionTitle: section.title,
          sectionOrder: section.order,
          score: row.score,
          notApplicable: row.notApplicable,
          itemMaxScore: item.maxScore,
        };
      }),
  );
}

function sectionPercentageMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(objectValue(value)).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function sameNumbers(
  left: Record<string, number | null>,
  right: Record<string, number | null>,
) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function assessmentHashPayload(input: {
  record: AssessmentRecord;
  visitContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(
    input.record.scores.map((row) => [row.instrumentItemId, row]),
  );

  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: input.record.id,
      cycleId: input.record.cycleId,
      revision: input.record.revision,
      assessorUserId: input.record.assessorUserId,
      assessorAssignmentId: input.record.assessorAssignmentId,
      dateObserved: input.record.dateObserved
        ? isoDateOnly(input.record.dateObserved)
        : null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.record.instrumentVersionId,
      code: input.record.instrumentVersion.instrument.code,
      version: input.record.instrumentVersion.version,
      contentHash: clean(
        input.record.instrumentVersion.contentHash,
      ).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      [...section.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => {
          const row = stored.get(item.id);
          return {
            instrumentItemId: item.id,
            itemKey: item.key,
            sectionKey: section.key,
            sectionOrder: section.order,
            itemOrder: item.order,
            itemMaxScore: item.maxScore,
            score: row?.score ?? null,
            notApplicable: row?.notApplicable ?? false,
          };
        }),
    ),
    sectionPercentages: input.sectionPercentages,
    overallPercentage: input.overallPercentage,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function verifyAssessmentEvidence(
  record: AssessmentRecord,
  sections: InstrumentSectionRecord[],
) {
  const rows = scoringRows(record, sections);
  const calculated = calculateAppraisalScores(rows, { requireComplete: true });
  if (!calculated.ok) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SCORES_INVALID",
      409,
      {
        scoreError: calculated.code,
        itemKeys: calculated.itemKeys,
      },
    );
  }

  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameNumbers(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CALCULATION_DRIFT",
      409,
    );
  }

  const metadata = objectValue(record.metadata);
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  if (
    !isSha256(visitContextHash) ||
    hashJson(record.evidenceSnapshotJson) !== visitContextHash
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_VISIT_CONTEXT_HASH_DRIFT",
      409,
    );
  }

  const expectedAssessmentHash = hashJson(
    assessmentHashPayload({
      record,
      visitContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (
    expectedAssessmentHash !== clean(record.assessmentHash).toLowerCase()
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_HASH_DRIFT",
      409,
    );
  }

  return {
    calculated: calculated.value,
    visitContextHash,
  };
}

function parseVisitContext(record: AssessmentRecord) {
  const context = objectValue(record.evidenceSnapshotJson) as VisitContext;
  const schemaVersion = Number(context.schemaVersion);
  const assessorRole = canonicalHeadteacherSupervisoryAssessorRole(
    context.assessor?.role,
  );

  if (
    ![1, 2].includes(schemaVersion) ||
    clean(context.workflow) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
    clean(context.evidenceStream) !==
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
    normalized(context.target?.role) !== "HEADTEACHER" ||
    clean(context.target?.userId) !== record.cycle.targetUserId ||
    clean(context.target?.tenantId) !== clean(record.cycle.targetTenantId) ||
    clean(context.target?.schoolName).length === 0 ||
    clean(context.assessor?.userId) !== record.assessorUserId ||
    clean(context.assessor?.assignmentId) !== clean(record.assessorAssignmentId) ||
    clean(context.instrument?.instrumentId) !== record.instrumentVersion.instrument.id ||
    clean(context.instrument?.instrumentVersionId) !== record.instrumentVersion.id ||
    clean(context.instrument?.code) !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    Number(context.instrument?.version) !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(context.instrument?.contentHash).toLowerCase() !==
      clean(record.instrumentVersion.contentHash).toLowerCase() ||
    !record.dateObserved ||
    clean(context.observation?.dateObserved) !== isoDateOnly(record.dateObserved) ||
    clean(context.jurisdiction?.districtZoneId) !== record.cycle.scopeZoneId ||
    clean(context.jurisdiction?.circuitZoneId) !== record.cycle.targetZoneId ||
    !clean(context.jurisdiction?.districtName) ||
    !clean(context.jurisdiction?.circuitName)
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_VISIT_CONTEXT_DRIFT", 409);
  }

  if (
    !HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.eligibleAssessorRoles.includes(
      assessorRole as "SISSO" | "BASIC_SCHOOL_COORDINATOR",
    )
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSOR_ORIGIN_FORBIDDEN",
      409,
      { assessorRole },
    );
  }

  const role = assessorRole as "SISSO" | "BASIC_SCHOOL_COORDINATOR";
  const scopeLevel = expectedScopeLevel(role);
  if (
    canonicalHeadteacherSupervisoryAssessorRole(
      context.assessor?.assignmentRole,
    ) !== role ||
    normalized(context.assessor?.scopeLevel) !== scopeLevel
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSOR_SCOPE_DRIFT",
      409,
      { assessorRole: role },
    );
  }

  let visitDetails;
  try {
    visitDetails = visitDetailsFromEvidenceSnapshot(
      record.evidenceSnapshotJson,
    );
  } catch {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_VISIT_DETAILS_INVALID",
      409,
    );
  }

  if (
    schemaVersion ===
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion &&
    !visitDetails
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_VISIT_DETAILS_MISSING",
      409,
    );
  }

  return {
    context,
    contextSchemaVersion: schemaVersion as 1 | 2,
    assessorRole: role,
    assessorScopeLevel: scopeLevel,
    visitDetails,
  };
}

function buildSections(input: {
  record: AssessmentRecord;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
}) {
  const scoreByItem = new Map(
    input.record.scores.map((row) => [row.instrumentItemId, row]),
  );

  return input.sections.map((section) => {
    const items = [...section.items]
      .sort((left, right) => left.order - right.order)
      .map((item) => {
        const row = scoreByItem.get(item.id)!;
        return {
          itemKey: item.key,
          itemLabel: item.label,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: row.score,
          notApplicable: row.notApplicable,
          percentage:
            row.notApplicable || row.score == null
              ? null
              : Number(((row.score / item.maxScore) * 100).toFixed(2)),
        };
      });

    const rawScore = items.reduce(
      (sum, item) => sum + (item.notApplicable ? 0 : item.score ?? 0),
      0,
    );
    const applicableMaximum = items.reduce(
      (sum, item) =>
        sum + (item.notApplicable ? 0 : item.itemMaxScore),
      0,
    );

    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionDescription: section.description,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      percentage: input.sectionPercentages[section.key] ?? null,
      rawScore,
      applicableMaximum,
      notApplicableItems: items.filter((item) => item.notApplicable).length,
      items,
    };
  });
}

export async function readHeadteacherSupervisoryReviewPackage(
  input: ReadHeadteacherSupervisoryReviewPackageInput,
): Promise<HeadteacherSupervisoryReviewPackage> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = normalized(input.actorRoleName);
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const now = requireNow(input.now);

  if (
    actorRole !== HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience ||
    !hasAppraisalCapability(
      actorRole,
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.requiredCapability,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ROLE_FORBIDDEN", 403);
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryReviewPackageDatabase);

  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      cycleId: true,
      instrumentVersionId: true,
      assessorUserId: true,
      assessorAssignmentId: true,
      status: true,
      revision: true,
      priorAssessmentId: true,
      dateObserved: true,
      overallPercentage: true,
      sectionPercentagesJson: true,
      generalComment: true,
      evidenceSnapshotJson: true,
      assessmentHash: true,
      finalizedByUserId: true,
      finalizedAt: true,
      metadata: true,
      scores: {
        select: {
          id: true,
          assessmentId: true,
          instrumentItemId: true,
          sectionKey: true,
          sectionTitle: true,
          sectionOrder: true,
          sectionMaxScore: true,
          itemKey: true,
          itemLabel: true,
          itemOrder: true,
          itemMaxScore: true,
          score: true,
          notApplicable: true,
        },
        orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
      },
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
      cycle: {
        select: {
          id: true,
          instrumentVersionId: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          targetRoleSnapshot: true,
          status: true,
          openedAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
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
        },
      },
      instrumentVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          contentHash: true,
          instrument: {
            select: {
              id: true,
              code: true,
              purpose: true,
              subjectType: true,
              isActive: true,
            },
          },
          sections: {
            select: {
              id: true,
              key: true,
              title: true,
              description: true,
              order: true,
              maxScore: true,
              items: {
                select: {
                  id: true,
                  key: true,
                  label: true,
                  order: true,
                  maxScore: true,
                  isRequired: true,
                },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!record) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_NOT_FOUND", 404);
  }

  const lifecycle = resolveLifecycle(record);
  assertAssessmentBaseContract(record, lifecycle);

  const current = await database.appraisalAssessment.findMany({
    where: {
      cycleId: record.cycleId,
      status: { in: ["DRAFT", "FINALIZED", "RETURNED"] },
    },
    select: {
      id: true,
      status: true,
      revision: true,
      priorAssessmentId: true,
    },
  });
  assertCurrentAssessmentUniqueness(current, record.id);

  const tenantId = clean(record.cycle.targetTenantId);
  const circuitId = clean(record.cycle.targetZoneId);
  const districtId = clean(record.cycle.scopeZoneId);
  if (
    !scopeContainsTarget({
      governanceScope: input.governanceScope,
      tenantId,
      circuitId,
      districtId,
    })
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SCOPE_FORBIDDEN", 403);
  }

  const assignments = await database.governanceOfficerAssignment.findMany({
    where: {
      userId: actorUserId,
      role: HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience,
      status: "ACTIVE",
      zoneId: districtId,
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
          name: true,
          isActive: true,
          zoneType: { select: { level: true } },
        },
      },
    },
  });

  const reviewerAssignment = resolveReviewerAssignment({
    assignments,
    actorUserId,
    districtId,
    governanceScope: input.governanceScope,
    now,
  });

  if (
    lifecycle.review &&
    (lifecycle.review.reviewerUserId !== actorUserId ||
      clean(lifecycle.review.reviewerAssignmentId) !== reviewerAssignment.id)
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_REVIEW_CUSTODY_DRIFT",
      409,
    );
  }

  const membership = assertTargetMembership(
    await database.membership.findFirst({
      where: {
        userId: record.cycle.targetUserId,
        tenantId,
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
    }),
    record,
  );

  const sections = instrumentSections(record);
  const evidence = verifyAssessmentEvidence(record, sections);
  const visit = parseVisitContext(record);
  const sectionPercentages = evidence.calculated
    .sectionPercentages as Record<string, number | null>;

  const contextTargetName = clean(visit.context.target?.name);
  const contextSchoolName = clean(visit.context.target?.schoolName);
  const contextCircuitName = clean(visit.context.jurisdiction?.circuitName);
  const contextDistrictName = clean(visit.context.jurisdiction?.districtName);
  const contextAssessorName = clean(visit.context.assessor?.name);

  if (
    contextSchoolName !== membership.tenant.name ||
    contextCircuitName !== membership.tenant.zone!.name ||
    contextDistrictName !== membership.tenant.zone!.parentZone!.name
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_DISPLAY_CONTEXT_DRIFT",
      409,
    );
  }

  return {
    schemaVersion: 1,
    audience: "HEAD_OF_SUPERVISION",
    lifecycleState: lifecycle.lifecycleState,
    cycle: {
      id: record.cycleId,
      status:
        lifecycle.lifecycleState === "READY_TO_START"
          ? "CLOSED"
          : "UNDER_REVIEW",
      targetName: contextTargetName || displayName(membership.user),
      schoolName: contextSchoolName,
      circuitName: contextCircuitName,
      districtName: contextDistrictName,
    },
    review: lifecycle.review
      ? {
          stage: 1,
          decision: "PENDING",
          startedAt: lifecycle.review.createdAt.toISOString(),
        }
      : null,
    assessment: {
      id: record.id,
      revision: record.revision,
      status: "FINALIZED",
      dateObserved: isoDateOnly(record.dateObserved!),
      finalizedAt: record.finalizedAt!.toISOString(),
      overallPercentage: evidence.calculated.overallPercentage,
      sectionPercentages,
      assessor: {
        name: contextAssessorName || officeLabel(visit.assessorRole),
        role: visit.assessorRole,
        office: officeLabel(visit.assessorRole),
        scopeLevel: visit.assessorScopeLevel,
      },
      visit: {
        contextSchemaVersion: visit.contextSchemaVersion,
        officialDetailsAvailable: visit.visitDetails !== null,
        arrivalTime: visit.visitDetails?.arrivalTime ?? null,
        staffStrength: visit.visitDetails?.staffStrength ?? null,
        totalEnrolment: visit.visitDetails?.totalEnrolment ?? null,
        girls: visit.visitDetails?.girls ?? null,
        boys: visit.visitDetails?.boys ?? null,
        teachersPresentAtVisit:
          visit.visitDetails?.teachersPresentAtVisit ?? null,
      },
      sections: buildSections({
        record,
        sections,
        sectionPercentages,
      }),
    },
    privacy: {
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      participantListIncluded: false,
      contactDetailsIncluded: false,
      assessorUserIdIncluded: false,
      targetUserIdIncluded: false,
      reviewerUserIdIncluded: false,
      assignmentIdsIncluded: false,
      proofHashesIncluded: false,
    },
    integrity: {
      finalizedAssessmentVerified: true,
      assessmentHashVerified: true,
      visitContextHashVerified: true,
      calculationsVerified: true,
      instrumentVerified: true,
      currentTargetScopeVerified: true,
      currentHosAssignmentVerified: true,
      ...(lifecycle.review
        ? {
            noExistingReviewCustody: false,
            activeReviewCustodyVerified: true,
          }
        : {
            noExistingReviewCustody: true,
            activeReviewCustodyVerified: false,
          }),
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
  };
}
