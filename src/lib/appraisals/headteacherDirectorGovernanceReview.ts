import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAppraisalCapability } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewAdmission";
import {
  HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewDecision";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import {
  HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY,
} from "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  eligibleAssessorRoles: [
    "SISSO",
    "BASIC_SCHOOL_COORDINATOR",
    "HEAD_OF_SUPERVISION",
  ] as const,
  directReleaseAssessorRole: "DISTRICT_DIRECTOR",
  directHosAuthoredReviewStage: 1,
  hosForwardedDirectorReviewStage: 2,
  reviewDecision: "PENDING",
  allowedDecisions: ["RETURN", "HOLD", "RELEASE"] as const,
  directorReturnAssessorRole: "HEAD_OF_SUPERVISION",
  hosForwardedAllowedDecisions: ["HOLD", "RELEASE"] as const,
  minimumReasonLength: 3,
  maximumNoteLength: 2_000,
  releaseMode: "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE",
  carrierCycleStatusMutationAllowed: false,
  carrierCycleTimestampMutationAllowed: false,
  staffFeedbackRequired: false,
  staffFeedbackAccessed: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteVisitEvidence: false,
  scoreMutationAllowed: false,
  assessmentMutationAllowedOnRelease: false,
  combinedWeightingDefined: false,
  commentsIncluded: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 25_000,
  maximumQueueItems: 200,
  holdContinuationProofReverified: true,
  holdContinuationPreservesDirectorCustody: true,
  holdRequiresExplicitUnhold: true,
  releaseWhileHeldAllowed: false,
  unholdCreatesReviewStage: false,
} as const;

export type HeadteacherDirectorGovernanceAssessorRole =
  | "SISSO"
  | "BASIC_SCHOOL_COORDINATOR"
  | "HEAD_OF_SUPERVISION"
  | "DISTRICT_DIRECTOR";

export type HeadteacherDirectorGovernanceAssessorOffice =
  | "SISSO"
  | "Basic School Coordinator"
  | "Head of Supervision"
  | "District Director";

export type HeadteacherDirectorGovernanceQueueState =
  | "DIRECT_RELEASE_READY"
  | "READY_TO_START"
  | "READY_TO_DECIDE"
  | "HELD"
  | "RETURNED_FOR_CORRECTION"
  | "RELEASED";

export type HeadteacherDirectorGovernanceQueueItem = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  dateObserved: string;
  targetHeadteacherName: string;
  schoolName: string;
  circuitName: string;
  districtName: string;
  assessorRole: HeadteacherDirectorGovernanceAssessorRole;
  assessorOffice: HeadteacherDirectorGovernanceAssessorOffice;
  directorAuthored: boolean;
  state: HeadteacherDirectorGovernanceQueueState;
  reviewId: string | null;
  reviewStage: number | null;
  reviewDecision: "PENDING" | "RETURNED" | "HELD" | "ACCEPTED" | null;
  canDirectRelease: boolean;
  canStartReview: boolean;
  canDecide: boolean;
  releasedAt: string | null;
};

export type HeadteacherDirectorGovernanceQueue = {
  items: HeadteacherDirectorGovernanceQueueItem[];
  summary: {
    total: number;
    needsAction: number;
    directReleaseReady: number;
    reviewReady: number;
    pendingDecision: number;
    returnedForCorrection: number;
    released: number;
  };
  readOnlyDiscovery: true;
  staffFeedbackIncluded: false;
  respondentIdentitiesIncluded: false;
  combinedWeightingDefined: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

export type HeadteacherDirectorGovernanceWorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: true;
};

export type HeadteacherDirectorGovernanceWorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  percentage: number | null;
  rawScore: number;
  applicableMaximum: number;
  notApplicableItems: number;
  items: HeadteacherDirectorGovernanceWorkspaceItem[];
};

export type HeadteacherDirectorGovernanceReviewPackage = {
  schemaVersion: 1;
  audience: "DISTRICT_DIRECTOR";
  lifecycleState: "READY_TO_START" | "READY_TO_DECIDE" | "HELD";
  cycle: {
    id: string;
    carrierStatus: string;
    targetName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
  };
  review: null | {
    id: string;
    stage: number;
    decision: "PENDING";
    startedAt: string;
  };
  assessment: {
    assessmentId: string;
    revision: number;
    status: "FINALIZED";
    dateObserved: string;
    finalizedAt: string;
    overallPercentage: number | null;
    assessorRole: Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">;
    assessorOffice: Exclude<HeadteacherDirectorGovernanceAssessorOffice, "District Director">;
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
    sections: HeadteacherDirectorGovernanceWorkspaceSection[];
  };
  privacy: {
    staffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    assessorIdentityIncluded: false;
    reviewerIdentityIncluded: false;
    contactDetailsIncluded: false;
  };
  integrity: {
    assessmentHashVerified: true;
    visitContextHashVerified: true;
    calculationsVerified: true;
    instrumentVerified: true;
    currentTargetScopeVerified: true;
    currentDirectorAssignmentVerified: true;
    hosForwardVerified: boolean;
    reviewerMayRewriteScores: false;
    scoreMutationAllowed: false;
    separateFromStaffFeedback: true;
    combinedWeightingDefined: false;
    providerCalled: false;
  };
};

export type HeadteacherDirectorGovernanceDecision =
  (typeof HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.allowedDecisions)[number];

export type StartHeadteacherDirectorGovernanceReviewResult = {
  outcome: "STARTED" | "EXISTING_REVIEW";
  assessmentId: string;
  assessmentRevision: number;
  cycleId: string;
  reviewId: string;
  reviewStage: number;
  reviewDecision: "PENDING";
  reviewEvidenceHash: string;
  startedAt: string;
  carrierCycleStatusMutationPerformed: false;
  carrierCycleTimestampMutationPerformed: false;
  staffFeedbackIncluded: false;
  scoreMutationPerformed: false;
  providerCalled: false;
};

export type ExecuteHeadteacherDirectorGovernanceDecisionResult = {
  outcome:
    | "RETURNED"
    | "HELD"
    | "RELEASED"
    | "EXISTING_RETURNED"
    | "EXISTING_HELD"
    | "EXISTING_RELEASED";
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "RETURNED" | "FINALIZED";
  cycleId: string;
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "HELD" | "ACCEPTED";
  nextReviewId: string | null;
  nextReviewStage: number | null;
  revisionRequired: boolean;
  releaseProofHash: string | null;
  releasedAt: string | null;
  carrierCycleStatusMutationPerformed: false;
  carrierCycleTimestampMutationPerformed: false;
  staffFeedbackIncluded: false;
  respondentIdentitiesAccessed: false;
  scoreMutationPerformed: false;
  providerCalled: false;
};

export type EnsureHeadteacherDirectorGovernanceCorrectionContinuationResult = {
  outcome: "NOT_REQUIRED" | "CREATED" | "EXISTING_REVIEW";
  continuationRequired: boolean;
  cycleId: string;
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "FINALIZED";
  sourceAssessmentId: string | null;
  sourceReviewId: string | null;
  sourceReviewStage: number | null;
  reviewId: string | null;
  reviewStage: number | null;
  reviewDecision: "PENDING" | null;
  reviewerUserId: string | null;
  reviewerAssignmentId: string | null;
  reviewEvidenceHash: string | null;
  reviewCreated: boolean;
  scoreMutationPerformed: false;
  staffFeedbackIncluded: false;
  providerCalled: false;
};

export type HeadteacherDirectorGovernanceRequestMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type ListHeadteacherDirectorGovernanceQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: HeadteacherDirectorGovernanceReviewDatabase;
};

export type ReadHeadteacherDirectorGovernanceReviewPackageInput =
  HeadteacherDirectorGovernanceRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    assessmentId: string;
    governanceScope: GovernanceScope;
    now?: Date;
    database?: HeadteacherDirectorGovernanceReviewDatabase;
  };

export type StartHeadteacherDirectorGovernanceReviewInput =
  ReadHeadteacherDirectorGovernanceReviewPackageInput & {
    confirm: boolean;
  };

export type UnholdHeadteacherDirectorGovernanceReviewInput =
  ReadHeadteacherDirectorGovernanceReviewPackageInput & {
    reviewId: string;
    confirm: boolean;
  };

export type UnholdHeadteacherDirectorGovernanceReviewResult = {
  outcome: "UNHELD" | "EXISTING_UNHELD";
  assessmentId: string;
  assessmentRevision: number;
  cycleId: string;
  reviewId: string;
  reviewStage: number;
  reviewDecision: "PENDING";
  carrierCycleStatusMutationPerformed: false;
  carrierCycleTimestampMutationPerformed: false;
  scoreMutationPerformed: false;
  staffFeedbackIncluded: false;
  providerCalled: false;
};

export type ExecuteHeadteacherDirectorGovernanceDecisionInput =
  ReadHeadteacherDirectorGovernanceReviewPackageInput & {
    reviewId: string;
    decision: unknown;
    note?: unknown;
    confirm: boolean;
  };

export type EnsureHeadteacherDirectorGovernanceCorrectionContinuationInput =
  HeadteacherDirectorGovernanceRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    assessmentId: string;
    now?: Date;
    database?: HeadteacherDirectorGovernanceReviewDatabase;
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
  priorAssessmentId: string | null;
  instrumentVersionId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  dateObserved: Date | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  scores: AssessmentScoreRecord[];
  reviews: ReviewRecord[];
  cycle: {
    id: string;
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
      zoneType: { level: number; countryCode: string };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: { level: number; countryCode: string };
      };
    };
  };
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
    name: string;
    isActive: boolean;
    zoneType: { level: number; countryCode: string };
  };
};

type CountResult = { count: number };

export type HeadteacherDirectorGovernanceReviewTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
    findMany(args: unknown): Promise<AssessmentRecord[]>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<AssessmentRecord["cycle"] | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    findMany(args: unknown): Promise<ReviewRecord[]>;
    create(args: unknown): Promise<ReviewRecord>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
    findMany(args: unknown): Promise<MembershipRecord[]>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherDirectorGovernanceReviewDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<AssessmentRecord["cycle"] | null>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    findMany(args: unknown): Promise<ReviewRecord[]>;
  };
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
    findMany(args: unknown): Promise<MembershipRecord[]>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  $transaction<T>(
    operation: (tx: HeadteacherDirectorGovernanceReviewTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  priorAssessmentId: true,
  instrumentVersionId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  status: true,
  revision: true,
  dateObserved: true,
  overallPercentage: true,
  sectionPercentagesJson: true,
  generalComment: true,
  evidenceSnapshotJson: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  metadata: true,
  createdAt: true,
  scores: {
    select: {
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
} as const;

const MEMBERSHIP_SELECT = {
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
          zoneType: { select: { level: true, countryCode: true } },
          parentZone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              zoneType: { select: { level: true, countryCode: true } },
            },
          },
        },
      },
    },
  },
} as const;

const ASSIGNMENT_SELECT = {
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
      zoneType: { select: { level: true, countryCode: true } },
    },
  },
} as const;

const REVIEW_SELECT = {
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
} as const;

const CYCLE_SELECT = {
  id: true,
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
} as const;

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

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(code: string, status: number, details?: Record<string, unknown>): never {
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
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_INVALID_TIME", 400);
  }
  return now;
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.transactionMaxWaitMs,
    timeout: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.transactionTimeoutMs,
  };
}

function displayName(user: MembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    "Headteacher"
  );
}

function assessorOffice(role: HeadteacherDirectorGovernanceAssessorRole): HeadteacherDirectorGovernanceAssessorOffice {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
  }
}

function sectionPercentageMap(value: unknown) {
  const object = objectValue(value);
  return Object.fromEntries(
    Object.entries(object).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function scopeContainsTarget(input: {
  governanceScope: GovernanceScope;
  tenantId: string;
  circuitId: string;
  districtId: string;
}) {
  const tenants = new Set(input.governanceScope.tenantIds.map(clean).filter(Boolean));
  if (!tenants.has(input.tenantId)) return false;
  if (input.governanceScope.isSuperAdmin) return true;
  const zones = new Set(input.governanceScope.zoneIds.map(clean).filter(Boolean));
  return zones.has(input.circuitId) || zones.has(input.districtId);
}

function assertDirectorRole(actorRoleName: unknown) {
  const actorRole = effectiveRole(actorRoleName);
  if (
    actorRole !== HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.reviewerRole ||
    !hasAppraisalCapability(
      actorRole,
      HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.requiredCapability,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ROLE_FORBIDDEN", 403, { actorRole });
  }
  return actorRole;
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  actorUserId: string;
  districtId: string;
  governanceScope?: GovernanceScope;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.userId !== input.actorUserId ||
    effectiveRole(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtId ||
    assignment.zone.id !== input.districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    return false;
  }
  if (assignment.startsAt && assignment.startsAt.getTime() > input.now.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() <= input.now.getTime()) {
    return false;
  }
  if (input.governanceScope && !input.governanceScope.isSuperAdmin) {
    const carried = input.governanceScope.assignments.some(
      (candidate) =>
        clean(candidate.id) === assignment.id &&
        effectiveRole(candidate.role) === "DISTRICT_DIRECTOR" &&
        clean(candidate.zoneId) === assignment.zoneId &&
        candidate.zoneLevel ===
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel,
    );
    if (!carried) return false;
  }
  return true;
}

function requireDirectorAssignment(input: {
  assignments: AssignmentRecord[];
  actorUserId: string;
  districtId: string;
  governanceScope?: GovernanceScope;
  now: Date;
  expectedAssignmentId?: string | null;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      actorUserId: input.actorUserId,
      districtId: input.districtId,
      governanceScope: input.governanceScope,
      now: input.now,
    }),
  );
  if (matches.length === 0) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSIGNMENT_AMBIGUOUS", 409);
  }
  if (input.expectedAssignmentId && matches[0].id !== input.expectedAssignmentId) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSIGNMENT_DRIFT", 409);
  }
  return matches[0];
}

function assertInstrument(record: AssessmentRecord) {
  const expected = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  const version = record.instrumentVersion;
  if (
    record.instrumentVersionId !== version.id ||
    version.version !== expected.instrumentVersion ||
    version.instrument.code !== expected.instrumentCode ||
    version.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    version.instrument.subjectType !== "HEADTEACHER" ||
    version.instrument.isActive !== true ||
    !isSha256(version.contentHash)
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_INSTRUMENT_INVALID", 409);
  }

  const sections = [...version.sections].sort((a, b) => a.order - b.order);
  if (sections.length !== expected.expectedSectionCount) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SECTION_COUNT_DRIFT", 409);
  }
  const sectionKeys = new Set<string>();
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  let rawMaximum = 0;
  let itemCount = 0;

  sections.forEach((section, index) => {
    if (
      !clean(section.id) ||
      !clean(section.key) ||
      !clean(section.title) ||
      sectionKeys.has(section.key) ||
      section.order !== index + 1 ||
      section.maxScore !== expected.expectedSectionMaximums[index]
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SECTION_STRUCTURE_DRIFT", 409, {
        sectionKey: section.key,
      });
    }
    sectionKeys.add(section.key);
    rawMaximum += section.maxScore;
    const itemOrders = new Set<number>();
    const items = [...section.items].sort((a, b) => a.order - b.order);
    if (items.reduce((sum, item) => sum + item.maxScore, 0) !== section.maxScore) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SECTION_MAXIMUM_DRIFT", 409, {
        sectionKey: section.key,
      });
    }
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
        item.maxScore !== expected.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ITEM_STRUCTURE_DRIFT", 409, {
          itemKey: item.key,
        });
      }
      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemOrders.add(item.order);
      itemCount += 1;
    }
  });

  if (itemCount !== expected.expectedItemCount || rawMaximum !== expected.expectedRawMaximum) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_FORM_STRUCTURE_DRIFT", 409, {
      itemCount,
      rawMaximum,
    });
  }
  return sections;
}

function scoreMapFor(record: AssessmentRecord, sections: InstrumentSectionRecord[]) {
  const expected = new Map(
    sections.flatMap((section) =>
      section.items.map((item) => [item.id, { section, item }] as const),
    ),
  );
  if (record.scores.length !== expected.size) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SCORE_COUNT_DRIFT", 409);
  }
  const map = new Map<string, AssessmentScoreRecord>();
  for (const score of record.scores) {
    const definition = expected.get(score.instrumentItemId);
    if (
      !definition ||
      map.has(score.instrumentItemId) ||
      score.assessmentId !== record.id ||
      score.sectionKey !== definition.section.key ||
      score.sectionTitle !== definition.section.title ||
      score.sectionOrder !== definition.section.order ||
      score.sectionMaxScore !== definition.section.maxScore ||
      score.itemKey !== definition.item.key ||
      score.itemLabel !== definition.item.label ||
      score.itemOrder !== definition.item.order ||
      score.itemMaxScore !== definition.item.maxScore ||
      (score.notApplicable && score.score !== null) ||
      (!score.notApplicable &&
        (!Number.isInteger(score.score) ||
          Number(score.score) < 1 ||
          Number(score.score) > definition.item.maxScore))
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SCORE_ROW_DRIFT", 409, {
        itemKey: score.itemKey,
      });
    }
    map.set(score.instrumentItemId, score);
  }
  return map;
}

function calculationRows(
  sections: InstrumentSectionRecord[],
  scores: Map<string, AssessmentScoreRecord>,
) {
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = scores.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: score?.score ?? null,
        notApplicable: score?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function assessmentHashPayload(input: {
  record: AssessmentRecord;
  sections: InstrumentSectionRecord[];
  scores: Map<string, AssessmentScoreRecord>;
  visitContextHash: string;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
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
      dateObserved: input.record.dateObserved?.toISOString().slice(0, 10) ?? null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.record.instrumentVersionId,
      code: input.record.instrumentVersion.instrument.code,
      version: input.record.instrumentVersion.version,
      contentHash: clean(input.record.instrumentVersion.contentHash).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      section.items.map((item) => {
        const score = input.scores.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score?.score ?? null,
          notApplicable: score?.notApplicable ?? false,
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

type VerifiedAssessment = {
  sections: InstrumentSectionRecord[];
  scores: Map<string, AssessmentScoreRecord>;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
  visitContextHash: string;
  contextSchemaVersion: 1 | 2;
  assessorRole: HeadteacherDirectorGovernanceAssessorRole;
};

function verifyFinalizedAssessment(record: AssessmentRecord): VerifiedAssessment {
  const sections = assertInstrument(record);
  const scores = scoreMapFor(record, sections);
  const context = objectValue(record.evidenceSnapshotJson);
  const metadata = objectValue(record.metadata);
  const assessor = objectValue(context.assessor);
  const target = objectValue(context.target);
  const jurisdiction = objectValue(context.jurisdiction);
  const instrument = objectValue(context.instrument);
  const observation = objectValue(context.observation);
  const schemaVersion = Number(context.schemaVersion);
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  const assessorRole = canonicalHeadteacherSupervisoryAssessorRole(
    clean(assessor.role) || clean(assessor.assignmentRole),
  ) as HeadteacherDirectorGovernanceAssessorRole;

  if (
    normalized(record.status) !== "FINALIZED" ||
    !Number.isInteger(record.revision) ||
    record.revision < 1 ||
    !record.assessorAssignmentId ||
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    !record.dateObserved ||
    !isSha256(record.assessmentHash) ||
    clean(record.generalComment) ||
    ![1, HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion].includes(
      schemaVersion,
    ) ||
    !isSha256(visitContextHash) ||
    hashJson(record.evidenceSnapshotJson) !== visitContextHash ||
    clean(context.workflow) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(context.evidenceStream) !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    clean(objectValue(context.cycle).id) !== record.cycleId ||
    clean(target.userId) !== record.cycle.targetUserId ||
    clean(target.tenantId) !== clean(record.cycle.targetTenantId) ||
    normalized(target.role) !== "HEADTEACHER" ||
    clean(assessor.userId) !== record.assessorUserId ||
    clean(assessor.assignmentId) !== clean(record.assessorAssignmentId) ||
    ![
      "SISSO",
      "BASIC_SCHOOL_COORDINATOR",
      "HEAD_OF_SUPERVISION",
      "DISTRICT_DIRECTOR",
    ].includes(assessorRole) ||
    clean(jurisdiction.circuitZoneId) !== clean(record.cycle.targetZoneId) ||
    clean(jurisdiction.districtZoneId) !== record.cycle.scopeZoneId ||
    clean(instrument.instrumentId) !== record.instrumentVersion.instrument.id ||
    clean(instrument.instrumentVersionId) !== record.instrumentVersionId ||
    clean(instrument.code) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    Number(instrument.version) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(instrument.contentHash).toLowerCase() !==
      clean(record.instrumentVersion.contentHash).toLowerCase() ||
    clean(observation.dateObserved) !== record.dateObserved.toISOString().slice(0, 10)
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_FINALIZED_EVIDENCE_INVALID", 409, {
      assessmentId: record.id,
    });
  }

  const calculated = calculateAppraisalScores(calculationRows(sections, scores), {
    requireComplete: true,
  });
  if (!calculated.ok) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CALCULATION_INVALID", 409, {
      scoreError: calculated.code,
      itemKeys: calculated.itemKeys,
    });
  }
  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameJson(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CALCULATION_DRIFT", 409);
  }
  const expectedHash = hashJson(
    assessmentHashPayload({
      record,
      sections,
      scores,
      visitContextHash,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(record.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSMENT_HASH_DRIFT", 409);
  }

  return {
    sections,
    scores,
    sectionPercentages: calculated.value.sectionPercentages,
    overallPercentage: calculated.value.overallPercentage,
    visitContextHash,
    contextSchemaVersion: schemaVersion as 1 | 2,
    assessorRole,
  };
}

function assertTargetMembership(
  record: AssessmentRecord,
  membership: MembershipRecord | null,
  governanceScope: GovernanceScope,
) {
  const zone = membership?.tenant.zone;
  const district = zone?.parentZone;
  if (
    !membership ||
    membership.userId !== record.cycle.targetUserId ||
    membership.user.id !== membership.userId ||
    membership.tenantId !== clean(record.cycle.targetTenantId) ||
    membership.tenant.id !== membership.tenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    zone.id !== clean(record.cycle.targetZoneId) ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    district.id !== record.cycle.scopeZoneId ||
    zone.parentZoneId !== district.id ||
    !scopeContainsTarget({
      governanceScope,
      tenantId: membership.tenantId,
      circuitId: zone.id,
      districtId: district.id,
    })
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_TARGET_SCOPE_INVALID", 403);
  }
  return { membership, zone, district };
}

function reviewMetadata(review: ReviewRecord) {
  return objectValue(review.metadata);
}

function isDirectorGovernanceReview(review: ReviewRecord) {
  const metadata = reviewMetadata(review);
  return (
    clean(metadata.reviewType) === "DIRECTOR_GOVERNANCE_REVIEW" &&
    normalized(metadata.reviewerRole) === "DISTRICT_DIRECTOR" &&
    metadata.staffFeedbackIncluded === false &&
    metadata.respondentIdentitiesIncluded === false &&
    metadata.reviewerMayRewriteScores === false &&
    metadata.scoreMutationAllowed === false &&
    metadata.providerCalled === false
  );
}

function hosReviewEvidenceHash(input: {
  assessment: AssessmentRecord;
  cycle: AssessmentRecord["cycle"];
  review: ReviewRecord;
  visitContextHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
    evidenceStream: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
    },
    review: {
      stage: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.reviewStage,
      reviewerUserId: input.review.reviewerUserId,
      reviewerAssignmentId: input.review.reviewerAssignmentId,
      reviewerRole: "HEAD_OF_SUPERVISION",
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function hosDecisionRequestHash(input: {
  assessment: AssessmentRecord;
  cycle: AssessmentRecord["cycle"];
  review: ReviewRecord;
  visitContextHash: string;
  sourceReviewEvidenceHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.workflow,
    evidenceStream: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
    },
    review: {
      id: input.review.id,
      stage: input.review.stage,
      reviewerUserId: input.review.reviewerUserId,
      reviewerAssignmentId: input.review.reviewerAssignmentId,
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    action: "FORWARD",
    reason: null,
    returnAssessmentStatus: "FINALIZED",
    reviewDecision: "ACCEPTED",
    nextReviewCreated: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function hosDecisionEvidenceHash(input: {
  decisionRequestHash: string;
  sourceReviewEvidenceHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY.schemaVersion,
    decisionRequestHash: input.decisionRequestHash,
    sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
    action: "FORWARD",
    nextReviewCreated: false,
  });
}

type Admission = {
  kind: "HOS_AUTHORED" | "HOS_FORWARDED" | "CORRECTED_ASSESSMENT";
  reviewStage: number;
  assessorRole: Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">;
  sourceReviewId: string | null;
  sourceReviewStage: number | null;
  sourceReviewEvidenceHash: string | null;
  sourceDecisionRequestHash: string | null;
  sourceDecisionEvidenceHash: string | null;
};

function pendingHoldContinuationAdmission(input: {
  assessment: AssessmentRecord;
  pending: ReviewRecord;
  assessorRole: Exclude<
    HeadteacherDirectorGovernanceAssessorRole,
    "DISTRICT_DIRECTOR"
  >;
}): Admission | null {
  const pendingMetadata = reviewMetadata(input.pending);
  if (clean(pendingMetadata.continuationType) !== "HOLD_CONTINUATION") {
    return null;
  }

  const sourceReviewId = clean(pendingMetadata.admittedFromReviewId);
  const sourceReviewStage = Number(pendingMetadata.admittedFromReviewStage);
  const sourceReviewEvidenceHash = clean(
    pendingMetadata.admittedFromReviewEvidenceHash,
  ).toLowerCase();
  const sourceDecisionRequestHash = clean(
    pendingMetadata.admittedFromDecisionRequestHash,
  ).toLowerCase();
  const sourceDecisionEvidenceHash =
    clean(pendingMetadata.admittedFromDecisionEvidenceHash).toLowerCase() || null;

  const sourceReview = input.assessment.reviews.find(
    (review) => review.id === sourceReviewId,
  );
  const sourceMetadata = sourceReview ? reviewMetadata(sourceReview) : {};

  if (
    clean(pendingMetadata.admissionType) !== "CORRECTED_ASSESSMENT" ||
    !sourceReview ||
    !isDirectorGovernanceReview(sourceReview) ||
    sourceReview.cycleId !== input.assessment.cycleId ||
    sourceReview.assessmentId !== input.assessment.id ||
    normalized(sourceReview.decision) !== "HELD" ||
    !sourceReview.decidedAt ||
    sourceReview.stage + 1 !== input.pending.stage ||
    sourceReviewStage !== sourceReview.stage ||
    sourceReview.reviewerUserId !== input.pending.reviewerUserId ||
    sourceReview.reviewerAssignmentId !== input.pending.reviewerAssignmentId ||
    clean(sourceMetadata.reviewEvidenceHash).toLowerCase() !==
      sourceReviewEvidenceHash ||
    clean(sourceMetadata.decisionAction) !== "HOLD" ||
    clean(sourceMetadata.decisionRequestHash).toLowerCase() !==
      sourceDecisionRequestHash ||
    clean(sourceMetadata.nextReviewId) !== input.pending.id ||
    Number(sourceMetadata.nextReviewStage) !== input.pending.stage ||
    clean(pendingMetadata.continuedFromReviewId) !== sourceReview.id ||
    Number(pendingMetadata.continuedFromStage) !== sourceReview.stage ||
    clean(pendingMetadata.sourceDecisionRequestHash).toLowerCase() !==
      sourceDecisionRequestHash ||
    sourceDecisionEvidenceHash !== null
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOLD_CONTINUATION_PROOF_DRIFT", 409);
  }

  return {
    kind: "CORRECTED_ASSESSMENT",
    reviewStage: input.pending.stage,
    assessorRole: input.assessorRole,
    sourceReviewId: sourceReview.id,
    sourceReviewStage: sourceReview.stage,
    sourceReviewEvidenceHash,
    sourceDecisionRequestHash,
    sourceDecisionEvidenceHash: null,
  };
}

async function resolveAdmission(input: {
  assessment: AssessmentRecord;
  verified: VerifiedAssessment;
  database: Pick<HeadteacherDirectorGovernanceReviewTransactionClient, "governanceOfficerAssignment">;
  now: Date;
}) : Promise<Admission> {
  const { assessment, verified } = input;
  const role = verified.assessorRole;
  if (role === "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_SELF_REVIEW_FORBIDDEN", 403);
  }
  if (
    !HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.eligibleAssessorRoles.includes(
      role as Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSOR_ORIGIN_FORBIDDEN", 409, { role });
  }

  const directorReviews = assessment.reviews.filter(isDirectorGovernanceReview);
  const pendingDirectorReview = [...directorReviews]
    .filter((review) => normalized(review.decision) === "PENDING")
    .sort((a, b) => a.stage - b.stage || a.createdAt.getTime() - b.createdAt.getTime())
    .at(-1);

  if (pendingDirectorReview) {
    const holdContinuation = pendingHoldContinuationAdmission({
      assessment,
      pending: pendingDirectorReview,
      assessorRole: role as Exclude<
        HeadteacherDirectorGovernanceAssessorRole,
        "DISTRICT_DIRECTOR"
      >,
    });
    if (holdContinuation) return holdContinuation;
  }

  if (assessment.revision >= 2 && assessment.priorAssessmentId) {
    const pending = pendingDirectorReview;
    if (pending && reviewMetadata(pending).continuationType === "CORRECTED_ASSESSMENT") {
      const pendingMetadata = reviewMetadata(pending);
      return {
        kind: "CORRECTED_ASSESSMENT",
        reviewStage: pending.stage,
        assessorRole: role as Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">,
        sourceReviewId:
          clean(pendingMetadata.admittedFromReviewId) ||
          clean(pendingMetadata.continuedFromReviewId) ||
          null,
        sourceReviewStage:
          Number(pendingMetadata.admittedFromReviewStage) ||
          Number(pendingMetadata.continuedFromStage) ||
          null,
        sourceReviewEvidenceHash:
          clean(pendingMetadata.admittedFromReviewEvidenceHash).toLowerCase() || null,
        sourceDecisionRequestHash:
          clean(pendingMetadata.admittedFromDecisionRequestHash).toLowerCase() || null,
        sourceDecisionEvidenceHash:
          clean(pendingMetadata.admittedFromDecisionEvidenceHash).toLowerCase() || null,
      };
    }
  }

  if (role === "HEAD_OF_SUPERVISION") {
    const nonDirector = assessment.reviews.filter((review) => !isDirectorGovernanceReview(review));
    if (nonDirector.length !== 0) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_AUTHORED_REVIEW_DRIFT", 409);
    }
    return {
      kind: "HOS_AUTHORED",
      reviewStage: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.directHosAuthoredReviewStage,
      assessorRole: "HEAD_OF_SUPERVISION",
      sourceReviewId: null,
      sourceReviewStage: null,
      sourceReviewEvidenceHash: null,
      sourceDecisionRequestHash: null,
      sourceDecisionEvidenceHash: null,
    };
  }

  const hosReviews = assessment.reviews.filter((review) => {
    const metadata = reviewMetadata(review);
    return clean(metadata.reviewType) === "HOS_SUPERVISORY_REVIEW";
  });
  if (hosReviews.length !== 1 || hosReviews[0].stage !== 1) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_FORWARD_REQUIRED", 409);
  }
  const sourceReview = hosReviews[0];
  const metadata = reviewMetadata(sourceReview);
  if (
    normalized(sourceReview.decision) !== "ACCEPTED" ||
    clean(sourceReview.note) ||
    !sourceReview.decidedAt ||
    !clean(sourceReview.reviewerAssignmentId) ||
    normalized(metadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(metadata.decisionAction) !== "FORWARD" ||
    clean(metadata.decidedByRole) !== "HEAD_OF_SUPERVISION" ||
    metadata.nextReviewCreated !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.scoreMutationPerformed !== false ||
    metadata.visitEvidenceMutationPerformed !== false ||
    metadata.staffFeedbackIncluded !== false ||
    metadata.respondentIdentitiesIncluded !== false ||
    metadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_FORWARD_INVALID", 409);
  }
  const expectedReviewHash = hosReviewEvidenceHash({
    assessment,
    cycle: assessment.cycle,
    review: sourceReview,
    visitContextHash: verified.visitContextHash,
  });
  const expectedRequestHash = hosDecisionRequestHash({
    assessment,
    cycle: assessment.cycle,
    review: sourceReview,
    visitContextHash: verified.visitContextHash,
    sourceReviewEvidenceHash: expectedReviewHash,
  });
  const expectedDecisionHash = hosDecisionEvidenceHash({
    decisionRequestHash: expectedRequestHash,
    sourceReviewEvidenceHash: expectedReviewHash,
  });
  if (
    clean(metadata.reviewEvidenceHash).toLowerCase() !== expectedReviewHash ||
    clean(metadata.decisionRequestHash).toLowerCase() !== expectedRequestHash ||
    clean(metadata.decisionEvidenceHash).toLowerCase() !== expectedDecisionHash
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_FORWARD_PROOF_DRIFT", 409);
  }
  const assignments = await input.database.governanceOfficerAssignment.findMany({
    where: { userId: sourceReview.reviewerUserId },
    select: ASSIGNMENT_SELECT,
  });
  const activeHos = assignments.filter((assignment) => {
    if (
      assignment.id !== sourceReview.reviewerAssignmentId ||
      effectiveRole(assignment.role) !== "HEAD_OF_SUPERVISION" ||
      normalized(assignment.status) !== "ACTIVE" ||
      assignment.revokedAt ||
      assignment.zoneId !== assessment.cycle.scopeZoneId ||
      assignment.zone.id !== assessment.cycle.scopeZoneId ||
      assignment.zone.isActive !== true ||
      assignment.zone.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
    ) return false;
    if (assignment.startsAt && assignment.startsAt.getTime() > input.now.getTime()) return false;
    if (assignment.endsAt && assignment.endsAt.getTime() <= input.now.getTime()) return false;
    return true;
  });
  if (activeHos.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_FORWARD_ASSIGNMENT_INVALID", 409);
  }

  const cycleReview = objectValue(objectValue(assessment.cycle.metadata).headteacherSupervisoryReview);
  if (
    clean(cycleReview.currentReviewId) !== sourceReview.id ||
    Number(cycleReview.currentReviewStage) !== 1 ||
    normalized(cycleReview.currentReviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(cycleReview.currentReviewerAssignmentId) !== sourceReview.reviewerAssignmentId ||
    normalized(cycleReview.sourceReviewDecision) !== "ACCEPTED" ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !== expectedReviewHash ||
    clean(cycleReview.admittedAssessmentId) !== assessment.id ||
    Number(cycleReview.admittedAssessmentRevision) !== assessment.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !== clean(assessment.assessmentHash).toLowerCase() ||
    clean(cycleReview.decisionRequestHash).toLowerCase() !== expectedRequestHash ||
    clean(cycleReview.decisionEvidenceHash).toLowerCase() !== expectedDecisionHash ||
    cycleReview.awaitingRevision !== false ||
    cycleReview.staffFeedbackIncluded !== false ||
    cycleReview.respondentIdentitiesIncluded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HOS_FORWARD_CYCLE_DRIFT", 409);
  }

  return {
    kind: "HOS_FORWARDED",
    reviewStage: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.hosForwardedDirectorReviewStage,
    assessorRole: role as "SISSO" | "BASIC_SCHOOL_COORDINATOR",
    sourceReviewId: sourceReview.id,
    sourceReviewStage: sourceReview.stage,
    sourceReviewEvidenceHash: expectedReviewHash,
    sourceDecisionRequestHash: expectedRequestHash,
    sourceDecisionEvidenceHash: expectedDecisionHash,
  };
}

function directorReviewEvidenceHash(input: {
  assessment: AssessmentRecord;
  verified: VerifiedAssessment;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewStage: number;
  admission: Admission;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.verified.visitContextHash,
      assessorRole: input.verified.assessorRole,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
    },
    review: {
      stage: input.reviewStage,
      reviewerUserId: input.reviewerUserId,
      reviewerAssignmentId: input.reviewerAssignmentId,
      reviewerRole: "DISTRICT_DIRECTOR",
    },
    admission: {
      type: input.admission.kind,
      sourceReviewId: input.admission.sourceReviewId,
      sourceReviewStage: input.admission.sourceReviewStage,
      sourceReviewEvidenceHash: input.admission.sourceReviewEvidenceHash,
      sourceDecisionRequestHash: input.admission.sourceDecisionRequestHash,
      sourceDecisionEvidenceHash: input.admission.sourceDecisionEvidenceHash,
    },
    jurisdiction: {
      districtZoneId: input.assessment.cycle.scopeZoneId,
      targetTenantId: input.assessment.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
  });
}

function directorReviewMetadata(input: {
  assessment: AssessmentRecord;
  verified: VerifiedAssessment;
  assignment: AssignmentRecord;
  reviewStage: number;
  admission: Admission;
  reviewEvidenceHash: string;
}) {
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    reviewType: "DIRECTOR_GOVERNANCE_REVIEW",
    reviewStage: input.reviewStage,
    reviewerRole: "DISTRICT_DIRECTOR",
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    visitContextHash: input.verified.visitContextHash,
    assessorRole: input.verified.assessorRole,
    admissionType: input.admission.kind,
    admittedFromReviewId: input.admission.sourceReviewId,
    admittedFromReviewStage: input.admission.sourceReviewStage,
    admittedFromReviewEvidenceHash: input.admission.sourceReviewEvidenceHash,
    admittedFromDecisionRequestHash: input.admission.sourceDecisionRequestHash,
    admittedFromDecisionEvidenceHash: input.admission.sourceDecisionEvidenceHash,
    hosForwardVerified: input.admission.kind === "HOS_FORWARDED",
    immutableEvidenceReverified: true,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationAllowed: false,
    assessmentMutationAllowed: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
    reviewerAssignmentZoneId: input.assignment.zoneId,
  };
}

function releaseEntry(metadata: unknown, assessmentId: string) {
  const releases = objectValue(objectValue(metadata)[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY]);
  return objectValue(releases[assessmentId]);
}

function releaseMapWith(metadata: unknown, assessmentId: string, entry: Record<string, unknown>) {
  const root = objectValue(metadata);
  const releases = objectValue(root[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY]);
  return {
    ...root,
    [HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY]: {
      ...releases,
      [assessmentId]: entry,
    },
  };
}

function releaseProofPayload(input: {
  assessment: AssessmentRecord;
  verified: VerifiedAssessment;
  review: ReviewRecord;
  reviewerAssignmentId: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releasedAt: Date;
  note: string;
}) {
  const reviewHash = clean(reviewMetadata(input.review).reviewEvidenceHash).toLowerCase();
  return {
    proofSchemaVersion: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.proofSchemaVersion,
    releaseMode: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.releaseMode,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    cycleId: input.assessment.cycleId,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    assessmentStatus: "FINALIZED",
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    visitContextHash: input.verified.visitContextHash,
    assessorRole: input.verified.assessorRole,
    assessorAssignmentId: input.assessment.assessorAssignmentId,
    reviewRowsRequired: true,
    reviewRowsPresent: true,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "ACCEPTED",
    reviewEvidenceHash: reviewHash,
    releaserUserId: input.review.reviewerUserId,
    releaserAssignmentId: input.reviewerAssignmentId,
    releaserRole: "DISTRICT_DIRECTOR",
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.releaseRequestHash,
    releaseEvidenceHash: input.releaseEvidenceHash,
    releasedAt: input.releasedAt.toISOString(),
    releaseNoteIncluded: Boolean(input.note),
    releaseNoteHash: input.note ? hashJson({ note: input.note }) : null,
    selfReviewPerformed: false,
    assessmentStatusMutationPerformed: false,
    scoreMutationPerformed: false,
    visitContextMutationPerformed: false,
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    carrierCycleStatusMutationPerformed: false,
    carrierCycleTimestampMutationPerformed: false,
    participantMutationPerformed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  } as const;
}

export function computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata(
  releaseMetadata: unknown,
) {
  const release = objectValue(releaseMetadata);
  const payload = { ...release } as Record<string, unknown>;
  delete payload.releaseProofHash;
  return hashJson(payload);
}

export function isHeadteacherDirectorGovernanceReviewedReleaseMetadata(
  releaseMetadata: unknown,
) {
  const release = objectValue(releaseMetadata);
  return clean(release.releaseMode) === HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.releaseMode;
}

function decisionContractHash(input: {
  review: ReviewRecord;
  assessment: AssessmentRecord;
  action: HeadteacherDirectorGovernanceDecision;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    action: input.action,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
    combinedWeightingDefined: false,
  });
}

function decisionRequestHash(input: {
  review: ReviewRecord;
  assessment: AssessmentRecord;
  action: HeadteacherDirectorGovernanceDecision;
  note: string;
  contractHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    reviewEvidenceHash: clean(reviewMetadata(input.review).reviewEvidenceHash).toLowerCase(),
    decisionContractHash: input.contractHash,
    action: input.action,
    note: input.note || null,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
  });
}

function releaseEvidenceHash(input: {
  assessment: AssessmentRecord;
  verified: VerifiedAssessment;
  review: ReviewRecord;
  requestHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    visitContextHash: input.verified.visitContextHash,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewEvidenceHash: clean(reviewMetadata(input.review).reviewEvidenceHash).toLowerCase(),
    releaseRequestHash: input.requestHash,
    staffFeedbackIncluded: false,
  });
}

function normalizeDecision(value: unknown): HeadteacherDirectorGovernanceDecision {
  const decision = normalized(value);
  if (
    !HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.allowedDecisions.includes(
      decision as HeadteacherDirectorGovernanceDecision,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_DECISION_FORBIDDEN", 400, { decision });
  }
  return decision as HeadteacherDirectorGovernanceDecision;
}

function normalizeDecisionNote(decision: HeadteacherDirectorGovernanceDecision, value: unknown) {
  const note = clean(value);
  if (note.length > HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.maximumNoteLength) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_NOTE_TOO_LONG", 400);
  }
  if (
    (decision === "RETURN" || decision === "HOLD") &&
    note.length < HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.minimumReasonLength
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_REASON_REQUIRED", 400);
  }
  return note;
}

function assertDirectorDecisionAuthority(input: {
  decision: HeadteacherDirectorGovernanceDecision;
  assessorRole: HeadteacherDirectorGovernanceAssessorRole;
}) {
  if (
    input.decision === "RETURN" &&
    input.assessorRole !==
      HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.directorReturnAssessorRole
  ) {
    fail(
      "HEADTEACHER_DIRECTOR_GOVERNANCE_RETURN_AUTHORSHIP_FORBIDDEN",
      409,
      {
        assessorRole: input.assessorRole,
        allowedReturnAssessorRole:
          HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.directorReturnAssessorRole,
      },
    );
  }
}

function currentPendingDirectorReview(assessment: AssessmentRecord) {
  const candidates = assessment.reviews
    .filter(isDirectorGovernanceReview)
    .filter((review) => normalized(review.decision) === "PENDING")
    .sort((a, b) => a.stage - b.stage || a.createdAt.getTime() - b.createdAt.getTime());
  if (candidates.length > 1) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_MULTIPLE_PENDING_REVIEWS", 409);
  }
  return candidates[0] ?? null;
}

function pendingDirectorHoldState(input: {
  assessment: AssessmentRecord;
  pending: ReviewRecord | null;
  assessorRole: Exclude<
    HeadteacherDirectorGovernanceAssessorRole,
    "DISTRICT_DIRECTOR"
  >;
}) {
  if (!input.pending) return null;
  const holdAdmission = pendingHoldContinuationAdmission({
    assessment: input.assessment,
    pending: input.pending,
    assessorRole: input.assessorRole,
  });
  if (!holdAdmission) return null;

  const cycleReview = objectValue(
    objectValue(input.assessment.cycle.metadata).directorGovernanceReview,
  );
  return clean(cycleReview.unheldAt) ? "UNHELD" as const : "HELD" as const;
}

async function readMembershipForAssessment(
  database: Pick<HeadteacherDirectorGovernanceReviewDatabase, "membership">,
  assessment: AssessmentRecord,
) {
  const tenantId = requireIdentifier(assessment.cycle.targetTenantId, "targetTenantId");
  return database.membership.findFirst({
    where: {
      userId: assessment.cycle.targetUserId,
      tenantId,
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
      tenant: { status: "ACTIVE" },
    },
    select: MEMBERSHIP_SELECT,
  });
}

async function readAssessment(
  database: Pick<HeadteacherDirectorGovernanceReviewDatabase, "appraisalAssessment">,
  assessmentId: string,
) {
  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: ASSESSMENT_SELECT,
  });
  if (!record) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSMENT_NOT_FOUND", 404);
  }
  if (
    record.cycle.id !== record.cycleId ||
    normalized(record.cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    !record.cycle.openedAt ||
    record.cycle.cancelledAt
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CYCLE_BOUNDARY_INVALID", 409);
  }
  return record;
}

function buildWorkspace(
  assessment: AssessmentRecord,
  verified: VerifiedAssessment,
) {
  const visit = visitDetailsFromEvidenceSnapshot(assessment.evidenceSnapshotJson);
  const context = objectValue(assessment.evidenceSnapshotJson);
  const target = objectValue(context.target);
  const jurisdiction = objectValue(context.jurisdiction);
  return {
    assessmentId: assessment.id,
    revision: assessment.revision,
    status: "FINALIZED" as const,
    dateObserved: assessment.dateObserved!.toISOString().slice(0, 10),
    finalizedAt: assessment.finalizedAt!.toISOString(),
    overallPercentage: verified.overallPercentage,
    assessorRole: verified.assessorRole as Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">,
    assessorOffice: assessorOffice(verified.assessorRole) as Exclude<HeadteacherDirectorGovernanceAssessorOffice, "District Director">,
    visit: {
      contextSchemaVersion: verified.contextSchemaVersion,
      officialDetailsAvailable: Boolean(visit),
      arrivalTime: visit?.arrivalTime ?? null,
      staffStrength: visit?.staffStrength ?? null,
      totalEnrolment: visit?.totalEnrolment ?? null,
      girls: visit?.girls ?? null,
      boys: visit?.boys ?? null,
      teachersPresentAtVisit: visit?.teachersPresentAtVisit ?? null,
    },
    context: {
      targetName: clean(target.name),
      schoolName: clean(target.schoolName),
      circuitName: clean(jurisdiction.circuitName),
      districtName: clean(jurisdiction.districtName),
    },
    sections: verified.sections.map((section) => {
      const sectionScores = section.items.map((item) => {
        const row = verified.scores.get(item.id)!;
        return {
          itemKey: item.key,
          label: item.label,
          order: item.order,
          maxScore: item.maxScore,
          score: row.score,
          notApplicable: row.notApplicable,
          answered: true as const,
        };
      });
      const applicable = sectionScores.filter((item) => !item.notApplicable);
      return {
        sectionKey: section.key,
        title: section.title,
        description: section.description,
        order: section.order,
        maxScore: section.maxScore,
        percentage: verified.sectionPercentages[section.key] ?? null,
        rawScore: applicable.reduce((sum, item) => sum + (item.score ?? 0), 0),
        applicableMaximum: applicable.reduce((sum, item) => sum + item.maxScore, 0),
        notApplicableItems: sectionScores.filter((item) => item.notApplicable).length,
        items: sectionScores,
      };
    }),
  };
}

async function preparePackage(input: ReadHeadteacherDirectorGovernanceReviewPackageInput) {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  assertDirectorRole(input.actorRoleName);
  const now = requireNow(input.now);
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorGovernanceReviewDatabase);
  const assessment = await readAssessment(database, assessmentId);
  const membership = await readMembershipForAssessment(database, assessment);
  const target = assertTargetMembership(assessment, membership, input.governanceScope);
  const verified = verifyFinalizedAssessment(assessment);
  if (verified.assessorRole === "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_DIRECT_RELEASE_PATH_REQUIRED", 409);
  }
  const assignments = await database.governanceOfficerAssignment.findMany({
    where: { userId: actorUserId },
    select: ASSIGNMENT_SELECT,
  });
  const assignment = requireDirectorAssignment({
    assignments,
    actorUserId,
    districtId: assessment.cycle.scopeZoneId,
    governanceScope: input.governanceScope,
    now,
  });
  const admission = await resolveAdmission({
    assessment,
    verified,
    database: database as unknown as Pick<HeadteacherDirectorGovernanceReviewTransactionClient, "governanceOfficerAssignment">,
    now,
  });
  const pending = currentPendingDirectorReview(assessment);
  const holdState = pendingDirectorHoldState({
    assessment,
    pending,
    assessorRole: verified.assessorRole as Exclude<
      HeadteacherDirectorGovernanceAssessorRole,
      "DISTRICT_DIRECTOR"
    >,
  });
  if (pending) {
    if (
      pending.reviewerUserId !== actorUserId ||
      pending.reviewerAssignmentId !== assignment.id ||
      pending.stage < admission.reviewStage
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_PENDING_REVIEW_SCOPE_DRIFT", 409);
    }
    const metadata = reviewMetadata(pending);
    const expectedHash = directorReviewEvidenceHash({
      assessment,
      verified,
      reviewerUserId: actorUserId,
      reviewerAssignmentId: assignment.id,
      reviewStage: pending.stage,
      admission: {
        ...admission,
        kind:
          clean(metadata.continuationType) === "CORRECTED_ASSESSMENT"
            ? "CORRECTED_ASSESSMENT"
            : admission.kind,
      },
    });
    if (
      Number(metadata.reviewStage) !== pending.stage ||
      clean(metadata.assessmentId) !== assessment.id ||
      Number(metadata.assessmentRevision) !== assessment.revision ||
      clean(metadata.assessmentHash).toLowerCase() !== clean(assessment.assessmentHash).toLowerCase() ||
      clean(metadata.visitContextHash).toLowerCase() !== verified.visitContextHash ||
      clean(metadata.reviewEvidenceHash).toLowerCase() !== expectedHash ||
      metadata.staffFeedbackIncluded !== false ||
      metadata.reviewerMayRewriteScores !== false
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_PENDING_REVIEW_PROOF_DRIFT", 409);
    }
  }
  const workspace = buildWorkspace(assessment, verified);
  return {
    actorUserId,
    assessment,
    membership: target.membership,
    target,
    verified,
    assignment,
    admission,
    pending,
    holdState,
    workspace,
    database,
    now,
  };
}

export async function readHeadteacherDirectorGovernanceReviewPackage(
  input: ReadHeadteacherDirectorGovernanceReviewPackageInput,
): Promise<HeadteacherDirectorGovernanceReviewPackage> {
  const prepared = await preparePackage(input);
  const { assessment, target, pending, holdState, workspace } = prepared;
  const context = workspace.context;
  return {
    schemaVersion: 1,
    audience: "DISTRICT_DIRECTOR",
    lifecycleState:
      holdState === "HELD"
        ? "HELD"
        : pending
          ? "READY_TO_DECIDE"
          : "READY_TO_START",
    cycle: {
      id: assessment.cycleId,
      carrierStatus: normalized(assessment.cycle.status),
      targetName: context.targetName || displayName(target.membership.user),
      schoolName: context.schoolName || target.membership.tenant.name,
      circuitName: context.circuitName || target.zone.name,
      districtName: context.districtName || target.district.name,
    },
    review: pending
      ? {
          id: pending.id,
          stage: pending.stage,
          decision: "PENDING",
          startedAt: pending.createdAt.toISOString(),
        }
      : null,
    assessment: {
      assessmentId: workspace.assessmentId,
      revision: workspace.revision,
      status: "FINALIZED",
      dateObserved: workspace.dateObserved,
      finalizedAt: workspace.finalizedAt,
      overallPercentage: workspace.overallPercentage,
      assessorRole: workspace.assessorRole,
      assessorOffice: workspace.assessorOffice,
      visit: workspace.visit,
      sections: workspace.sections,
    },
    privacy: {
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      assessorIdentityIncluded: false,
      reviewerIdentityIncluded: false,
      contactDetailsIncluded: false,
    },
    integrity: {
      assessmentHashVerified: true,
      visitContextHashVerified: true,
      calculationsVerified: true,
      instrumentVerified: true,
      currentTargetScopeVerified: true,
      currentDirectorAssignmentVerified: true,
      hosForwardVerified: prepared.admission.kind === "HOS_FORWARDED",
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
  };
}

export async function startHeadteacherDirectorGovernanceReview(
  input: StartHeadteacherDirectorGovernanceReviewInput,
): Promise<StartHeadteacherDirectorGovernanceReviewResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_START_CONFIRMATION_REQUIRED", 400);
  }
  const prepared = await preparePackage(input);
  if (prepared.pending) {
    const metadata = reviewMetadata(prepared.pending);
    return {
      outcome: "EXISTING_REVIEW",
      assessmentId: prepared.assessment.id,
      assessmentRevision: prepared.assessment.revision,
      cycleId: prepared.assessment.cycleId,
      reviewId: prepared.pending.id,
      reviewStage: prepared.pending.stage,
      reviewDecision: "PENDING",
      reviewEvidenceHash: clean(metadata.reviewEvidenceHash).toLowerCase(),
      startedAt: prepared.pending.createdAt.toISOString(),
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      staffFeedbackIncluded: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    };
  }
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  return prepared.database.$transaction(async (tx) => {
    const assessment = await tx.appraisalAssessment.findUnique({
      where: { id: prepared.assessment.id },
      select: ASSESSMENT_SELECT,
    });
    if (!assessment) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSMENT_NOT_FOUND", 404);
    const verified = verifyFinalizedAssessment(assessment);
    const existingPending = currentPendingDirectorReview(assessment);
    if (existingPending) {
      if (
        existingPending.reviewerUserId !== prepared.actorUserId ||
        existingPending.reviewerAssignmentId !== prepared.assignment.id
      ) {
        fail("HEADTEACHER_DIRECTOR_GOVERNANCE_START_WRITE_RACE", 409);
      }
      return {
        outcome: "EXISTING_REVIEW" as const,
        assessmentId: assessment.id,
        assessmentRevision: assessment.revision,
        cycleId: assessment.cycleId,
        reviewId: existingPending.id,
        reviewStage: existingPending.stage,
        reviewDecision: "PENDING" as const,
        reviewEvidenceHash: clean(reviewMetadata(existingPending).reviewEvidenceHash).toLowerCase(),
        startedAt: existingPending.createdAt.toISOString(),
        carrierCycleStatusMutationPerformed: false as const,
        carrierCycleTimestampMutationPerformed: false as const,
        staffFeedbackIncluded: false as const,
        scoreMutationPerformed: false as const,
        providerCalled: false as const,
      };
    }
    const admission = await resolveAdmission({
      assessment,
      verified,
      database: tx,
      now: prepared.now,
    });
    const assignments = await tx.governanceOfficerAssignment.findMany({
      where: { userId: prepared.actorUserId },
      select: ASSIGNMENT_SELECT,
    });
    const assignment = requireDirectorAssignment({
      assignments,
      actorUserId: prepared.actorUserId,
      districtId: assessment.cycle.scopeZoneId,
      governanceScope: input.governanceScope,
      now: prepared.now,
      expectedAssignmentId: prepared.assignment.id,
    });
    const evidenceHash = directorReviewEvidenceHash({
      assessment,
      verified,
      reviewerUserId: prepared.actorUserId,
      reviewerAssignmentId: assignment.id,
      reviewStage: admission.reviewStage,
      admission,
    });
    const created = await tx.appraisalReview.create({
      data: {
        cycleId: assessment.cycleId,
        assessmentId: assessment.id,
        reviewerUserId: prepared.actorUserId,
        reviewerAssignmentId: assignment.id,
        stage: admission.reviewStage,
        decision: "PENDING",
        note: null,
        decidedAt: null,
        metadata: directorReviewMetadata({
          assessment,
          verified,
          assignment,
          reviewStage: admission.reviewStage,
          admission,
          reviewEvidenceHash: evidenceHash,
        }),
      },
      select: REVIEW_SELECT,
    });
    const cycle = await tx.appraisalCycle.findUnique({
      where: { id: assessment.cycleId },
      select: CYCLE_SELECT,
    });
    if (!cycle) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CYCLE_NOT_FOUND", 404);
    const updated = await tx.appraisalCycle.updateMany({
      where: { id: cycle.id, cancelledAt: null },
      data: {
        metadata: {
          ...objectValue(cycle.metadata),
          directorGovernanceReview: {
            schemaVersion: 1,
            state: "PENDING",
            assessmentId: assessment.id,
            assessmentRevision: assessment.revision,
            reviewId: created.id,
            reviewStage: created.stage,
            reviewEvidenceHash: evidenceHash,
            admissionType: admission.kind,
            staffFeedbackIncluded: false,
            carrierCycleStatusMutationPerformed: false,
            carrierCycleTimestampMutationPerformed: false,
            reviewerMayRewriteScores: false,
            scoreMutationAllowed: false,
            combinedWeightingDefined: false,
            providerCalled: false,
            startedAt: prepared.now.toISOString(),
          },
        },
      },
    });
    if (updated.count !== 1) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_START_CYCLE_WRITE_RACE", 409);
    }
    await tx.auditLog.create({
      data: {
        tenantId: clean(assessment.cycle.targetTenantId),
        userId: prepared.actorUserId,
        action: "HEADTEACHER_GOVERNANCE_DIRECTOR_REVIEW_STARTED",
        resource: "AppraisalReview",
        resourceId: created.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          cycleId: assessment.cycleId,
          assessmentId: assessment.id,
          assessmentRevision: assessment.revision,
          reviewId: created.id,
          reviewStage: created.stage,
          reviewEvidenceHash: evidenceHash,
          admissionType: admission.kind,
          reasonTextIncluded: false,
          scoreValuesIncluded: false,
          staffFeedbackIncluded: false,
          respondentIdentitiesIncluded: false,
          carrierCycleStatusMutationPerformed: false,
          carrierCycleTimestampMutationPerformed: false,
          providerCalled: false,
        },
      },
    });
    return {
      outcome: "STARTED" as const,
      assessmentId: assessment.id,
      assessmentRevision: assessment.revision,
      cycleId: assessment.cycleId,
      reviewId: created.id,
      reviewStage: created.stage,
      reviewDecision: "PENDING" as const,
      reviewEvidenceHash: evidenceHash,
      startedAt: created.createdAt.toISOString(),
      carrierCycleStatusMutationPerformed: false as const,
      carrierCycleTimestampMutationPerformed: false as const,
      staffFeedbackIncluded: false as const,
      scoreMutationPerformed: false as const,
      providerCalled: false as const,
    };
  }, transactionOptions());
}

export async function unholdHeadteacherDirectorGovernanceReview(
  input: UnholdHeadteacherDirectorGovernanceReviewInput,
): Promise<UnholdHeadteacherDirectorGovernanceReviewResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_UNHOLD_CONFIRMATION_REQUIRED", 400);
  }

  const prepared = await preparePackage(input);
  if (!prepared.pending) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HELD_REVIEW_NOT_FOUND", 409);
  }

  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  if (prepared.pending.id !== reviewId) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_UNHOLD_REVIEW_ID_DRIFT", 409);
  }

  if (prepared.holdState === "UNHELD") {
    return {
      outcome: "EXISTING_UNHELD",
      assessmentId: prepared.assessment.id,
      assessmentRevision: prepared.assessment.revision,
      cycleId: prepared.assessment.cycleId,
      reviewId: prepared.pending.id,
      reviewStage: prepared.pending.stage,
      reviewDecision: "PENDING",
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      scoreMutationPerformed: false,
      staffFeedbackIncluded: false,
      providerCalled: false,
    };
  }

  if (prepared.holdState !== "HELD") {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_NOT_HELD", 409);
  }

  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");

  return prepared.database.$transaction(async (tx) => {
    const assessment = await tx.appraisalAssessment.findUnique({
      where: { id: prepared.assessment.id },
      select: ASSESSMENT_SELECT,
    });
    if (!assessment) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSMENT_NOT_FOUND", 404);
    }

    const verified = verifyFinalizedAssessment(assessment);
    const pending = currentPendingDirectorReview(assessment);
    if (!pending || pending.id !== reviewId) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_UNHOLD_REVIEW_STATE_DRIFT", 409);
    }

    const holdState = pendingDirectorHoldState({
      assessment,
      pending,
      assessorRole: verified.assessorRole as Exclude<
        HeadteacherDirectorGovernanceAssessorRole,
        "DISTRICT_DIRECTOR"
      >,
    });
    if (holdState === "UNHELD") {
      return {
        outcome: "EXISTING_UNHELD" as const,
        assessmentId: assessment.id,
        assessmentRevision: assessment.revision,
        cycleId: assessment.cycleId,
        reviewId: pending.id,
        reviewStage: pending.stage,
        reviewDecision: "PENDING" as const,
        carrierCycleStatusMutationPerformed: false as const,
        carrierCycleTimestampMutationPerformed: false as const,
        scoreMutationPerformed: false as const,
        staffFeedbackIncluded: false as const,
        providerCalled: false as const,
      };
    }
    if (holdState !== "HELD") {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_NOT_HELD", 409);
    }

    const assignments = await tx.governanceOfficerAssignment.findMany({
      where: { userId: prepared.actorUserId },
      select: ASSIGNMENT_SELECT,
    });
    requireDirectorAssignment({
      assignments,
      actorUserId: prepared.actorUserId,
      districtId: assessment.cycle.scopeZoneId,
      governanceScope: input.governanceScope,
      now: prepared.now,
      expectedAssignmentId: prepared.assignment.id,
    });

    const cycleReview = objectValue(
      objectValue(assessment.cycle.metadata).directorGovernanceReview,
    );
    if (
      clean(cycleReview.currentReviewId) !== pending.id ||
      Number(cycleReview.currentReviewStage) !== pending.stage ||
      clean(cycleReview.decision) !== "HOLD"
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_UNHOLD_PROOF_DRIFT", 409);
    }

    const unheldAt = prepared.now.toISOString();
    const cycleUpdated = await tx.appraisalCycle.updateMany({
      where: { id: assessment.cycleId, cancelledAt: null },
      data: {
        metadata: {
          ...objectValue(assessment.cycle.metadata),
          directorGovernanceReview: {
            ...cycleReview,
            state: "PENDING",
            unheldAt,
          },
        },
      },
    });
    if (cycleUpdated.count !== 1) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_UNHOLD_WRITE_RACE", 409);
    }

    await tx.auditLog.create({
      data: {
        tenantId: clean(assessment.cycle.targetTenantId),
        userId: prepared.actorUserId,
        action: "HEADTEACHER_GOVERNANCE_DIRECTOR_UNHELD",
        resource: "AppraisalReview",
        resourceId: pending.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          cycleId: assessment.cycleId,
          assessmentId: assessment.id,
          assessmentRevision: assessment.revision,
          reviewId: pending.id,
          reviewStage: pending.stage,
          unheldAt,
          newReviewCreated: false,
          scoreValuesIncluded: false,
          staffFeedbackIncluded: false,
          respondentIdentitiesIncluded: false,
          carrierCycleStatusMutationPerformed: false,
          carrierCycleTimestampMutationPerformed: false,
          scoreMutationPerformed: false,
          providerCalled: false,
        },
      },
    });

    return {
      outcome: "UNHELD" as const,
      assessmentId: assessment.id,
      assessmentRevision: assessment.revision,
      cycleId: assessment.cycleId,
      reviewId: pending.id,
      reviewStage: pending.stage,
      reviewDecision: "PENDING" as const,
      carrierCycleStatusMutationPerformed: false as const,
      carrierCycleTimestampMutationPerformed: false as const,
      scoreMutationPerformed: false as const,
      staffFeedbackIncluded: false as const,
      providerCalled: false as const,
    };
  }, transactionOptions());
}

function existingDecisionResult(input: {
  assessment: AssessmentRecord;
  review: ReviewRecord;
}): ExecuteHeadteacherDirectorGovernanceDecisionResult | null {
  const decision = normalized(input.review.decision);
  if (!input.review.decidedAt) return null;
  if (decision === "RETURNED") {
    return {
      outcome: "EXISTING_RETURNED",
      assessmentId: input.assessment.id,
      assessmentRevision: input.assessment.revision,
      assessmentStatus: "RETURNED",
      cycleId: input.assessment.cycleId,
      sourceReviewId: input.review.id,
      sourceReviewStage: input.review.stage,
      sourceReviewDecision: "RETURNED",
      nextReviewId: null,
      nextReviewStage: null,
      revisionRequired: true,
      releaseProofHash: null,
      releasedAt: null,
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesAccessed: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    };
  }
  if (decision === "HELD") {
    const next = input.assessment.reviews
      .filter(isDirectorGovernanceReview)
      .find((candidate) => candidate.stage === input.review.stage + 1 && normalized(candidate.decision) === "PENDING");
    return {
      outcome: "EXISTING_HELD",
      assessmentId: input.assessment.id,
      assessmentRevision: input.assessment.revision,
      assessmentStatus: "FINALIZED",
      cycleId: input.assessment.cycleId,
      sourceReviewId: input.review.id,
      sourceReviewStage: input.review.stage,
      sourceReviewDecision: "HELD",
      nextReviewId: next?.id ?? null,
      nextReviewStage: next?.stage ?? null,
      revisionRequired: false,
      releaseProofHash: null,
      releasedAt: null,
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesAccessed: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    };
  }
  if (decision === "ACCEPTED") {
    const release = releaseEntry(input.assessment.cycle.metadata, input.assessment.id);
    const hash = clean(release.releaseProofHash).toLowerCase();
    if (!isHeadteacherDirectorGovernanceReviewedReleaseMetadata(release) || !isSha256(hash)) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_EXISTING_RELEASE_PROOF_DRIFT", 409);
    }
    return {
      outcome: "EXISTING_RELEASED",
      assessmentId: input.assessment.id,
      assessmentRevision: input.assessment.revision,
      assessmentStatus: "FINALIZED",
      cycleId: input.assessment.cycleId,
      sourceReviewId: input.review.id,
      sourceReviewStage: input.review.stage,
      sourceReviewDecision: "ACCEPTED",
      nextReviewId: null,
      nextReviewStage: null,
      revisionRequired: false,
      releaseProofHash: hash,
      releasedAt: clean(release.releasedAt) || null,
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesAccessed: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    };
  }
  return null;
}

export async function executeHeadteacherDirectorGovernanceDecision(
  input: ExecuteHeadteacherDirectorGovernanceDecisionInput,
): Promise<ExecuteHeadteacherDirectorGovernanceDecisionResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_DECISION_CONFIRMATION_REQUIRED", 400);
  }
  const decision = normalizeDecision(input.decision);
  const note = normalizeDecisionNote(decision, input.note);
  const prepared = await preparePackage(input);
  if (prepared.holdState === "HELD") {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HELD_UNHOLD_REQUIRED", 409);
  }
  assertDirectorDecisionAuthority({
    decision,
    assessorRole: prepared.verified.assessorRole,
  });
  if (!prepared.pending) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_NOT_STARTED", 409);
  }
  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  if (prepared.pending.id !== reviewId) {
    const exact = prepared.assessment.reviews.find((review) => review.id === reviewId);
    const existing = exact ? existingDecisionResult({ assessment: prepared.assessment, review: exact }) : null;
    if (existing) return existing;
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_ID_DRIFT", 409);
  }
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = prepared.now;

  return prepared.database.$transaction(async (tx) => {
    const assessment = await tx.appraisalAssessment.findUnique({
      where: { id: prepared.assessment.id },
      select: ASSESSMENT_SELECT,
    });
    if (!assessment) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_ASSESSMENT_NOT_FOUND", 404);
    const verified = verifyFinalizedAssessment(assessment);
    const transactionPending = currentPendingDirectorReview(assessment);
    const transactionHoldState = pendingDirectorHoldState({
      assessment,
      pending: transactionPending,
      assessorRole: verified.assessorRole as Exclude<
        HeadteacherDirectorGovernanceAssessorRole,
        "DISTRICT_DIRECTOR"
      >,
    });
    if (transactionHoldState === "HELD") {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_HELD_UNHOLD_REQUIRED", 409);
    }
    assertDirectorDecisionAuthority({
      decision,
      assessorRole: verified.assessorRole,
    });
    const review = await tx.appraisalReview.findUnique({
      where: { id: reviewId },
      select: REVIEW_SELECT,
    });
    if (!review) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_NOT_FOUND", 404);
    const existing = existingDecisionResult({ assessment, review });
    if (existing) return existing;
    if (
      review.assessmentId !== assessment.id ||
      review.cycleId !== assessment.cycleId ||
      review.reviewerUserId !== prepared.actorUserId ||
      review.reviewerAssignmentId !== prepared.assignment.id ||
      normalized(review.decision) !== "PENDING" ||
      review.decidedAt ||
      !isDirectorGovernanceReview(review)
    ) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_STATE_DRIFT", 409);
    }
    const assignments = await tx.governanceOfficerAssignment.findMany({
      where: { userId: prepared.actorUserId },
      select: ASSIGNMENT_SELECT,
    });
    const assignment = requireDirectorAssignment({
      assignments,
      actorUserId: prepared.actorUserId,
      districtId: assessment.cycle.scopeZoneId,
      governanceScope: input.governanceScope,
      now,
      expectedAssignmentId: prepared.assignment.id,
    });
    const contractHash = decisionContractHash({ review, assessment, action: decision });
    const requestHash = decisionRequestHash({
      review,
      assessment,
      action: decision,
      note,
      contractHash,
    });

    let nextReview: ReviewRecord | null = null;
    let releaseProofHash: string | null = null;
    let releasedAt: string | null = null;
    let cycleMetadata = objectValue(assessment.cycle.metadata);

    if (decision === "HOLD") {
      const nextStage = review.stage + 1;
      const admission: Admission = {
        kind: "CORRECTED_ASSESSMENT",
        reviewStage: nextStage,
        assessorRole: verified.assessorRole as Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">,
        sourceReviewId: review.id,
        sourceReviewStage: review.stage,
        sourceReviewEvidenceHash: clean(reviewMetadata(review).reviewEvidenceHash).toLowerCase(),
        sourceDecisionRequestHash: requestHash,
        sourceDecisionEvidenceHash: null,
      };
      const nextHash = directorReviewEvidenceHash({
        assessment,
        verified,
        reviewerUserId: prepared.actorUserId,
        reviewerAssignmentId: assignment.id,
        reviewStage: nextStage,
        admission,
      });
      nextReview = await tx.appraisalReview.create({
        data: {
          cycleId: assessment.cycleId,
          assessmentId: assessment.id,
          reviewerUserId: prepared.actorUserId,
          reviewerAssignmentId: assignment.id,
          stage: nextStage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata: {
            ...directorReviewMetadata({
              assessment,
              verified,
              assignment,
              reviewStage: nextStage,
              admission,
              reviewEvidenceHash: nextHash,
            }),
            continuationType: "HOLD_CONTINUATION",
            continuedFromReviewId: review.id,
            continuedFromStage: review.stage,
            sourceDecisionRequestHash: requestHash,
          },
        },
        select: REVIEW_SELECT,
      });
    }

    const reviewUpdated = await tx.appraisalReview.updateMany({
      where: {
        id: review.id,
        assessmentId: assessment.id,
        decision: "PENDING",
        decidedAt: null,
      },
      data: {
        decision:
          decision === "RETURN" ? "RETURNED" : decision === "HOLD" ? "HELD" : "ACCEPTED",
        note: note || null,
        decidedAt: now,
        metadata: {
          ...reviewMetadata(review),
          decisionSchemaVersion: 1,
          decisionAction: decision,
          decisionContractHash: contractHash,
          decisionRequestHash: requestHash,
          decidedByRole: "DISTRICT_DIRECTOR",
          decidedAt: now.toISOString(),
          reasonHash: note ? hashJson({ note }) : null,
          reasonLength: note.length,
          revisionRequired: decision === "RETURN",
          nextReviewId: nextReview?.id ?? null,
          nextReviewStage: nextReview?.stage ?? null,
          releasePerformed: decision === "RELEASE",
          reviewerMayRewriteScores: false,
          reviewerMayRewriteVisitEvidence: false,
          scoreMutationPerformed: false,
          visitEvidenceMutationPerformed: false,
          staffFeedbackIncluded: false,
          respondentIdentitiesIncluded: false,
          combinedWeightingDefined: false,
          providerCalled: false,
        },
      },
    });
    if (reviewUpdated.count !== 1) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_DECISION_WRITE_RACE", 409);
    }

    if (decision === "RETURN") {
      const assessmentUpdated = await tx.appraisalAssessment.updateMany({
        where: { id: assessment.id, status: "FINALIZED", revision: assessment.revision },
        data: {
          status: "RETURNED",
          metadata: {
            ...objectValue(assessment.metadata),
            returnedByDirectorReviewId: review.id,
            returnedByDirectorReviewStage: review.stage,
            returnDecisionContractHash: contractHash,
            returnDecisionRequestHash: requestHash,
            returnedAt: now.toISOString(),
            reviewerMayRewriteScores: false,
            scoreMutationPerformed: false,
            separateFromStaffFeedback: true,
            combinedWeightingDefined: false,
            providerCalled: false,
          },
        },
      });
      if (assessmentUpdated.count !== 1) {
        fail("HEADTEACHER_DIRECTOR_GOVERNANCE_RETURN_WRITE_RACE", 409);
      }
    }

    if (decision === "RELEASE") {
      const evidenceHash = releaseEvidenceHash({
        assessment,
        verified,
        review,
        requestHash,
      });
      const proof = releaseProofPayload({
        assessment,
        verified,
        review,
        reviewerAssignmentId: assignment.id,
        decisionContractHash: contractHash,
        releaseRequestHash: requestHash,
        releaseEvidenceHash: evidenceHash,
        releasedAt: now,
        note,
      });
      releaseProofHash = hashJson(proof);
      releasedAt = now.toISOString();
      cycleMetadata = releaseMapWith(cycleMetadata, assessment.id, {
        ...proof,
        releaseProofHash,
      });
    }

    cycleMetadata = {
      ...cycleMetadata,
      directorGovernanceReview: {
        schemaVersion: 1,
        state:
          decision === "RETURN"
            ? "RETURNED_FOR_CORRECTION"
            : decision === "HOLD"
              ? "HELD"
              : "RELEASED",
        assessmentId: assessment.id,
        assessmentRevision: assessment.revision,
        sourceReviewId: review.id,
        sourceReviewStage: review.stage,
        decision,
        decisionContractHash: contractHash,
        decisionRequestHash: requestHash,
        currentReviewId: nextReview?.id ?? review.id,
        currentReviewStage: nextReview?.stage ?? review.stage,
        revisionRequired: decision === "RETURN",
        releaseProofHash,
        releasedAt,
        heldAt: decision === "HOLD" ? now.toISOString() : null,
        unheldAt: null,
        staffFeedbackIncluded: false,
        respondentIdentitiesIncluded: false,
        carrierCycleStatusMutationPerformed: false,
        carrierCycleTimestampMutationPerformed: false,
        reviewerMayRewriteScores: false,
        scoreMutationAllowed: false,
        combinedWeightingDefined: false,
        providerCalled: false,
      },
    };
    const cycleUpdated = await tx.appraisalCycle.updateMany({
      where: { id: assessment.cycleId, cancelledAt: null },
      data: { metadata: cycleMetadata },
    });
    if (cycleUpdated.count !== 1) {
      fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CYCLE_METADATA_WRITE_RACE", 409);
    }

    await tx.auditLog.create({
      data: {
        tenantId: clean(assessment.cycle.targetTenantId),
        userId: prepared.actorUserId,
        action:
          decision === "RETURN"
            ? "HEADTEACHER_GOVERNANCE_DIRECTOR_RETURNED"
            : decision === "HOLD"
              ? "HEADTEACHER_GOVERNANCE_DIRECTOR_HELD"
              : "HEADTEACHER_GOVERNANCE_DIRECTOR_RELEASED",
        resource: "AppraisalReview",
        resourceId: review.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          cycleId: assessment.cycleId,
          assessmentId: assessment.id,
          assessmentRevision: assessment.revision,
          reviewId: review.id,
          reviewStage: review.stage,
          decision,
          nextReviewId: nextReview?.id ?? null,
          nextReviewStage: nextReview?.stage ?? null,
          decisionContractHash: contractHash,
          decisionRequestHash: requestHash,
          releaseProofHash,
          reasonIncluded: Boolean(note),
          reasonTextIncluded: false,
          scoreValuesIncluded: false,
          staffFeedbackIncluded: false,
          respondentIdentitiesIncluded: false,
          carrierCycleStatusMutationPerformed: false,
          carrierCycleTimestampMutationPerformed: false,
          reviewerMayRewriteScores: false,
          scoreMutationPerformed: false,
          providerCalled: false,
        },
      },
    });

    return {
      outcome:
        decision === "RETURN" ? "RETURNED" : decision === "HOLD" ? "HELD" : "RELEASED",
      assessmentId: assessment.id,
      assessmentRevision: assessment.revision,
      assessmentStatus: decision === "RETURN" ? "RETURNED" : "FINALIZED",
      cycleId: assessment.cycleId,
      sourceReviewId: review.id,
      sourceReviewStage: review.stage,
      sourceReviewDecision:
        decision === "RETURN" ? "RETURNED" : decision === "HOLD" ? "HELD" : "ACCEPTED",
      nextReviewId: nextReview?.id ?? null,
      nextReviewStage: nextReview?.stage ?? null,
      revisionRequired: decision === "RETURN",
      releaseProofHash,
      releasedAt,
      carrierCycleStatusMutationPerformed: false,
      carrierCycleTimestampMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesAccessed: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    };
  }, transactionOptions());
}

function publicQueueState(assessment: AssessmentRecord, role: HeadteacherDirectorGovernanceAssessorRole) {
  const release = releaseEntry(assessment.cycle.metadata, assessment.id);
  if (Object.keys(release).length && clean(release.releaseMode)) {
    return {
      state: "RELEASED" as const,
      review: assessment.reviews.filter(isDirectorGovernanceReview).at(-1) ?? null,
      releasedAt: clean(release.releasedAt) || null,
    };
  }
  if (role === "DISTRICT_DIRECTOR") {
    if (normalized(assessment.status) === "FINALIZED" && assessment.revision === 1) {
      return { state: "DIRECT_RELEASE_READY" as const, review: null, releasedAt: null };
    }
    return null;
  }
  if (normalized(assessment.status) === "RETURNED") {
    const returned = assessment.reviews
      .filter(isDirectorGovernanceReview)
      .filter((review) => normalized(review.decision) === "RETURNED")
      .sort((a, b) => b.stage - a.stage)
      .at(0) ?? null;
    return { state: "RETURNED_FOR_CORRECTION" as const, review: returned, releasedAt: null };
  }
  if (normalized(assessment.status) !== "FINALIZED") return null;
  const pending = currentPendingDirectorReview(assessment);
  const holdState = pendingDirectorHoldState({
    assessment,
    pending,
    assessorRole: role as Exclude<
      HeadteacherDirectorGovernanceAssessorRole,
      "DISTRICT_DIRECTOR"
    >,
  });
  if (pending && holdState === "HELD") {
    return { state: "HELD" as const, review: pending, releasedAt: null };
  }
  if (pending) return { state: "READY_TO_DECIDE" as const, review: pending, releasedAt: null };
  if (role === "HEAD_OF_SUPERVISION") {
    return { state: "READY_TO_START" as const, review: null, releasedAt: null };
  }
  const hos = assessment.reviews.find((review) => {
    const metadata = reviewMetadata(review);
    return (
      review.stage === 1 &&
      normalized(review.decision) === "ACCEPTED" &&
      clean(metadata.reviewType) === "HOS_SUPERVISORY_REVIEW" &&
      clean(metadata.decisionAction) === "FORWARD" &&
      metadata.staffFeedbackIncluded === false
    );
  });
  return hos ? { state: "READY_TO_START" as const, review: null, releasedAt: null } : null;
}

export async function listHeadteacherDirectorGovernanceReviewQueue(
  input: ListHeadteacherDirectorGovernanceQueueInput,
): Promise<HeadteacherDirectorGovernanceQueue> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  assertDirectorRole(input.actorRoleName);
  const now = requireNow(input.now);
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorGovernanceReviewDatabase);
  const tenantIds = [...new Set(input.governanceScope.tenantIds.map(clean).filter(Boolean))];
  if (!tenantIds.length) {
    return {
      items: [],
      summary: { total: 0, needsAction: 0, directReleaseReady: 0, reviewReady: 0, pendingDecision: 0, returnedForCorrection: 0, released: 0 },
      readOnlyDiscovery: true,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      combinedWeightingDefined: false,
      noBackgroundPolling: true,
      providerCalled: false,
    };
  }
  const assessments = await database.appraisalAssessment.findMany({
    where: {
      cycle: {
        targetTenantId: { in: tenantIds },
        targetRoleSnapshot: "HEADTEACHER",
        cancelledAt: null,
      },
      instrumentVersion: {
        instrument: { code: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode },
      },
      status: { in: ["FINALIZED", "RETURNED"] },
    },
    select: ASSESSMENT_SELECT,
    orderBy: [{ createdAt: "desc" }],
    take: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.maximumQueueItems,
  });
  const memberships = await database.membership.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
      tenant: { status: "ACTIVE" },
    },
    select: MEMBERSHIP_SELECT,
  });
  const membershipMap = new Map(memberships.map((membership) => [`${membership.tenantId}:${membership.userId}`, membership]));
  const assignments = await database.governanceOfficerAssignment.findMany({
    where: { userId: actorUserId },
    select: ASSIGNMENT_SELECT,
  });
  const items: HeadteacherDirectorGovernanceQueueItem[] = [];
  for (const assessment of assessments) {
    const membership = membershipMap.get(`${clean(assessment.cycle.targetTenantId)}:${assessment.cycle.targetUserId}`) ?? null;
    if (!membership) continue;
    const zone = membership.tenant.zone;
    const district = zone?.parentZone;
    if (!zone || !district) continue;
    if (!scopeContainsTarget({ governanceScope: input.governanceScope, tenantId: membership.tenantId, circuitId: zone.id, districtId: district.id })) continue;
    const directorAssignment = assignments.find((assignment) =>
      assignmentIsCurrent({
        assignment,
        actorUserId,
        districtId: district.id,
        governanceScope: input.governanceScope,
        now,
      }),
    );
    if (!directorAssignment) continue;
    const context = objectValue(assessment.evidenceSnapshotJson);
    const assessor = objectValue(context.assessor);
    const jurisdiction = objectValue(context.jurisdiction);
    const target = objectValue(context.target);
    const role = canonicalHeadteacherSupervisoryAssessorRole(
      clean(assessor.role) || clean(assessor.assignmentRole),
    ) as HeadteacherDirectorGovernanceAssessorRole;
    if (!["SISSO", "BASIC_SCHOOL_COORDINATOR", "HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"].includes(role)) continue;
    const state = publicQueueState(assessment, role);
    if (!state) continue;
    items.push({
      assessmentId: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      dateObserved: assessment.dateObserved?.toISOString().slice(0, 10) ?? "",
      targetHeadteacherName: clean(target.name) || displayName(membership.user),
      schoolName: clean(target.schoolName) || membership.tenant.name,
      circuitName: clean(jurisdiction.circuitName) || zone.name,
      districtName: clean(jurisdiction.districtName) || district.name,
      assessorRole: role,
      assessorOffice: assessorOffice(role),
      directorAuthored: role === "DISTRICT_DIRECTOR",
      state: state.state,
      reviewId: state.review?.id ?? null,
      reviewStage: state.review?.stage ?? null,
      reviewDecision: state.review ? (normalized(state.review.decision) as "PENDING" | "RETURNED" | "HELD" | "ACCEPTED") : null,
      canDirectRelease: state.state === "DIRECT_RELEASE_READY",
      canStartReview: state.state === "READY_TO_START",
      canDecide: state.state === "READY_TO_DECIDE",
      releasedAt: state.releasedAt,
    });
  }
  const summary = {
    total: items.length,
    needsAction: items.filter((item) => ["DIRECT_RELEASE_READY", "READY_TO_START", "READY_TO_DECIDE"].includes(item.state)).length,
    directReleaseReady: items.filter((item) => item.state === "DIRECT_RELEASE_READY").length,
    reviewReady: items.filter((item) => item.state === "READY_TO_START").length,
    pendingDecision: items.filter((item) => item.state === "READY_TO_DECIDE").length,
    returnedForCorrection: items.filter((item) => item.state === "RETURNED_FOR_CORRECTION").length,
    released: items.filter((item) => item.state === "RELEASED").length,
  };
  return {
    items,
    summary,
    readOnlyDiscovery: true,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    combinedWeightingDefined: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

function correctionReturnEvidenceHash(source: AssessmentRecord, review: ReviewRecord) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    assessmentId: source.id,
    assessmentHash: clean(source.assessmentHash).toLowerCase(),
    review: {
      id: review.id,
      stage: review.stage,
      decision: normalized(review.decision),
      note: clean(review.note),
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      decidedAt: review.decidedAt?.toISOString() ?? null,
    },
    reviewerScoreEditsIncluded: false,
  });
}

export async function ensureHeadteacherDirectorGovernanceCorrectionContinuation(
  input: EnsureHeadteacherDirectorGovernanceCorrectionContinuationInput,
): Promise<EnsureHeadteacherDirectorGovernanceCorrectionContinuationResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorGovernanceReviewDatabase);
  const current = await readAssessment(database, assessmentId);
  if (current.revision === 1 && !current.priorAssessmentId) {
    return {
      outcome: "NOT_REQUIRED",
      continuationRequired: false,
      cycleId: current.cycleId,
      assessmentId: current.id,
      assessmentRevision: current.revision,
      assessmentStatus: "FINALIZED",
      sourceAssessmentId: null,
      sourceReviewId: null,
      sourceReviewStage: null,
      reviewId: null,
      reviewStage: null,
      reviewDecision: null,
      reviewerUserId: null,
      reviewerAssignmentId: null,
      reviewEvidenceHash: null,
      reviewCreated: false,
      scoreMutationPerformed: false,
      staffFeedbackIncluded: false,
      providerCalled: false,
    };
  }
  const verified = verifyFinalizedAssessment(current);
  if (
    current.assessorUserId !== actorUserId ||
    current.finalizedByUserId !== actorUserId ||
    !current.priorAssessmentId ||
    current.revision < 2
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CONTINUATION_CURRENT_INVALID", 409);
  }
  const source = await readAssessment(database, current.priorAssessmentId);
  if (
    normalized(source.status) !== "SUPERSEDED" ||
    source.cycleId !== current.cycleId ||
    source.revision + 1 !== current.revision ||
    source.assessorUserId !== current.assessorUserId ||
    source.assessorAssignmentId !== current.assessorAssignmentId ||
    clean(objectValue(source.metadata).supersededByAssessmentId) !== current.id
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CONTINUATION_LINEAGE_DRIFT", 409);
  }
  const metadata = objectValue(current.metadata);
  const sourceReviewId = requireIdentifier(metadata.returnReviewId, "returnReviewId");
  const sourceReviews = await database.appraisalReview.findMany({
    where: { assessmentId: source.id },
    select: REVIEW_SELECT,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const sourceReview = sourceReviews.find((review) => review.id === sourceReviewId);
  if (
    !sourceReview ||
    !isDirectorGovernanceReview(sourceReview) ||
    normalized(sourceReview.decision) !== "RETURNED" ||
    !sourceReview.decidedAt ||
    clean(objectValue(source.metadata).returnedByDirectorReviewId) !== sourceReview.id ||
    Number(objectValue(source.metadata).returnedByDirectorReviewStage) !== sourceReview.stage ||
    Number(metadata.returnReviewStage) !== sourceReview.stage ||
    clean(metadata.returnEvidenceHash).toLowerCase() !== correctionReturnEvidenceHash(source, sourceReview)
  ) {
    fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CONTINUATION_RETURN_PROVENANCE_DRIFT", 409);
  }
  const currentReviews = await database.appraisalReview.findMany({
    where: { assessmentId: current.id },
    select: REVIEW_SELECT,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const existing = currentReviews.find(
    (review) =>
      isDirectorGovernanceReview(review) &&
      normalized(review.decision) === "PENDING" &&
      review.stage === sourceReview.stage,
  );
  if (existing) {
    return {
      outcome: "EXISTING_REVIEW",
      continuationRequired: true,
      cycleId: current.cycleId,
      assessmentId: current.id,
      assessmentRevision: current.revision,
      assessmentStatus: "FINALIZED",
      sourceAssessmentId: source.id,
      sourceReviewId: sourceReview.id,
      sourceReviewStage: sourceReview.stage,
      reviewId: existing.id,
      reviewStage: existing.stage,
      reviewDecision: "PENDING",
      reviewerUserId: existing.reviewerUserId,
      reviewerAssignmentId: existing.reviewerAssignmentId,
      reviewEvidenceHash: clean(reviewMetadata(existing).reviewEvidenceHash).toLowerCase(),
      reviewCreated: false,
      scoreMutationPerformed: false,
      staffFeedbackIncluded: false,
      providerCalled: false,
    };
  }
  return database.$transaction(async (tx) => {
    const assignments = await tx.governanceOfficerAssignment.findMany({
      where: {
        userId: sourceReview.reviewerUserId,
        role: "DISTRICT_DIRECTOR",
        status: "ACTIVE",
        zoneId: current.cycle.scopeZoneId,
      },
      select: ASSIGNMENT_SELECT,
    });
    const assignment = requireDirectorAssignment({
      assignments,
      actorUserId: sourceReview.reviewerUserId,
      districtId: current.cycle.scopeZoneId,
      now,
      expectedAssignmentId: clean(sourceReview.reviewerAssignmentId),
    });
    const admission: Admission = {
      kind: "CORRECTED_ASSESSMENT",
      reviewStage: sourceReview.stage,
      assessorRole: verified.assessorRole as Exclude<HeadteacherDirectorGovernanceAssessorRole, "DISTRICT_DIRECTOR">,
      sourceReviewId: sourceReview.id,
      sourceReviewStage: sourceReview.stage,
      sourceReviewEvidenceHash: clean(reviewMetadata(sourceReview).reviewEvidenceHash).toLowerCase(),
      sourceDecisionRequestHash: clean(reviewMetadata(sourceReview).decisionRequestHash).toLowerCase(),
      sourceDecisionEvidenceHash: null,
    };
    const evidenceHash = directorReviewEvidenceHash({
      assessment: current,
      verified,
      reviewerUserId: sourceReview.reviewerUserId,
      reviewerAssignmentId: assignment.id,
      reviewStage: sourceReview.stage,
      admission,
    });
    const created = await tx.appraisalReview.create({
      data: {
        cycleId: current.cycleId,
        assessmentId: current.id,
        reviewerUserId: sourceReview.reviewerUserId,
        reviewerAssignmentId: assignment.id,
        stage: sourceReview.stage,
        decision: "PENDING",
        note: null,
        decidedAt: null,
        metadata: {
          ...directorReviewMetadata({
            assessment: current,
            verified,
            assignment,
            reviewStage: sourceReview.stage,
            admission,
            reviewEvidenceHash: evidenceHash,
          }),
          continuationType: "CORRECTED_ASSESSMENT",
          continuedFromAssessmentId: source.id,
          continuedFromAssessmentRevision: source.revision,
          continuedFromReviewId: sourceReview.id,
          continuedFromStage: sourceReview.stage,
          returnEvidenceHash: clean(metadata.returnEvidenceHash).toLowerCase(),
          preserveReturningReviewer: true,
          preserveReviewStage: true,
        },
      },
      select: REVIEW_SELECT,
    });
    const cycle = await tx.appraisalCycle.findUnique({ where: { id: current.cycleId }, select: CYCLE_SELECT });
    if (!cycle) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CYCLE_NOT_FOUND", 404);
    const updated = await tx.appraisalCycle.updateMany({
      where: { id: cycle.id, cancelledAt: null },
      data: {
        metadata: {
          ...objectValue(cycle.metadata),
          directorGovernanceReview: {
            schemaVersion: 1,
            state: "PENDING",
            assessmentId: current.id,
            assessmentRevision: current.revision,
            reviewId: created.id,
            reviewStage: created.stage,
            reviewEvidenceHash: evidenceHash,
            continuationType: "CORRECTED_ASSESSMENT",
            continuedFromAssessmentId: source.id,
            continuedFromReviewId: sourceReview.id,
            preserveReturningReviewer: true,
            preserveReviewStage: true,
            staffFeedbackIncluded: false,
            carrierCycleStatusMutationPerformed: false,
            carrierCycleTimestampMutationPerformed: false,
            reviewerMayRewriteScores: false,
            scoreMutationAllowed: false,
            providerCalled: false,
            continuedAt: now.toISOString(),
          },
        },
      },
    });
    if (updated.count !== 1) fail("HEADTEACHER_DIRECTOR_GOVERNANCE_CONTINUATION_WRITE_RACE", 409);
    await tx.auditLog.create({
      data: {
        tenantId: clean(current.cycle.targetTenantId),
        userId: actorUserId,
        action: "HEADTEACHER_GOVERNANCE_DIRECTOR_CORRECTION_REVIEW_CONTINUED",
        resource: "AppraisalReview",
        resourceId: created.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          cycleId: current.cycleId,
          correctedAssessmentId: current.id,
          correctedAssessmentRevision: current.revision,
          sourceAssessmentId: source.id,
          sourceReviewId: sourceReview.id,
          sourceReviewStage: sourceReview.stage,
          continuedReviewId: created.id,
          continuedReviewStage: created.stage,
          reviewEvidenceHash: evidenceHash,
          preserveReturningReviewer: true,
          preserveReviewStage: true,
          reasonTextIncluded: false,
          scoreValuesIncluded: false,
          staffFeedbackIncluded: false,
          respondentIdentitiesIncluded: false,
          carrierCycleStatusMutationPerformed: false,
          carrierCycleTimestampMutationPerformed: false,
          providerCalled: false,
        },
      },
    });
    return {
      outcome: "CREATED" as const,
      continuationRequired: true,
      cycleId: current.cycleId,
      assessmentId: current.id,
      assessmentRevision: current.revision,
      assessmentStatus: "FINALIZED" as const,
      sourceAssessmentId: source.id,
      sourceReviewId: sourceReview.id,
      sourceReviewStage: sourceReview.stage,
      reviewId: created.id,
      reviewStage: created.stage,
      reviewDecision: "PENDING" as const,
      reviewerUserId: created.reviewerUserId,
      reviewerAssignmentId: created.reviewerAssignmentId,
      reviewEvidenceHash: evidenceHash,
      reviewCreated: true,
      scoreMutationPerformed: false as const,
      staffFeedbackIncluded: false as const,
      providerCalled: false as const,
    };
  }, transactionOptions());
}
