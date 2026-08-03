//src/lib/appraisals/headteacherDirectorReviewPackage.ts
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import {
  readHeadteacherFeedbackAggregateReadiness,
  type DirectorAggregateReadinessView,
  type HeadteacherFeedbackAggregateReadinessDatabase,
} from "@/lib/appraisals/headteacherFeedbackAggregateReadiness";
import {
  HEADTEACHER_DIRECTOR_REVIEW_POLICY,
  type HeadteacherDirectorReviewEvidenceReadiness,
} from "@/lib/appraisals/headteacherDirectorReview";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
  inspectHeadteacherSupervisoryInstrument,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY = {
  schemaVersion: 1,
  audience: "DISTRICT_DIRECTOR",
  requiredCapability: HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  requiredCycleStatus: "UNDER_REVIEW",
  minimumReviewStage: 1,
  currentReviewStageMode: "LATEST_PENDING",
  requiredReviewDecision: "PENDING",
  aggregateSnapshotVersion: 1,
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  officialVisitDetailsIncluded: true,
  legacyVisitContextReadable: true,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  comparisonDirection: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
  comparisonThresholdsDefined: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  responseHashesIncluded: false,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  readOnly: true,
  databaseWritesAllowed: false,
  transactionRequired: false,
  providerCallsAllowed: false,
} as const;

export const HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY = {
  schemaVersion: 1,
  decisions: ["RETURN", "HOLD", "RELEASE"] as const,
  explicitConfirmationRequired: true,
  returnReasonRequired: true,
  holdReasonRequired: true,
  releaseNoteRequired: false,
  minimumReasonLength: 3,
  maximumNoteLength: 2_000,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  combinedWeightingDefined: false,
  executionPerformed: false,
} as const;

export type HeadteacherDirectorReviewDecision =
  (typeof HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.decisions)[number];

export type HeadteacherDirectorReviewPackageRequestMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type ReadHeadteacherDirectorReviewPackageInput =
  HeadteacherDirectorReviewPackageRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    cycleId: string;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    now?: Date;
    database?: HeadteacherDirectorReviewPackageDatabase;
  };

export type HeadteacherDirectorReviewPackageSectionComparison = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  staffAveragePercentage: number;
  supervisoryPercentage: number;
  supervisoryMinusStaffPercentagePoints: number;
};

export type HeadteacherDirectorReviewPackageItemComparison = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  staffApplicableResponses: number;
  staffNotApplicableResponses: number;
  staffAverageScore: number | null;
  staffAveragePercentage: number | null;
  supervisoryScore: number | null;
  supervisoryNotApplicable: boolean;
  supervisoryPercentage: number | null;
  comparisonState:
    | "COMPARABLE"
    | "STAFF_ALL_NOT_APPLICABLE"
    | "SUPERVISORY_NOT_APPLICABLE";
  supervisoryMinusStaffPercentagePoints: number | null;
};

export type HeadteacherDirectorReviewPackage = {
  schemaVersion: 1;
  audience: "DISTRICT_DIRECTOR";
  lifecycleState: "READY_FOR_DECISION";
  cycle: {
    id: string;
    status: "UNDER_REVIEW";
    targetUserId: string;
    targetTenantId: string;
    targetName: string;
    schoolName: string;
    circuitZoneId: string;
    circuitName: string;
    districtZoneId: string;
    districtName: string;
    reviewStartedAt: string;
  };
  review: {
    id: string;
    stage: number;
    decision: "PENDING";
    reviewerUserId: string;
    reviewerAssignmentId: string;
    createdAt: string;
    reviewEvidenceHash: string;
  };
  staffFeedback: {
    snapshotId: string;
    snapshotVersion: 1;
    sourceHash: string;
    generatedAt: string;
    eligibleResponses: number;
    finalizedResponses: number;
    expiredResponses: number;
    revokedResponses: number;
    minimumResponses: 1;
    overallPercentage: number;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      sectionMaxScore: number;
      finalizedResponses: number;
      averagePercentage: number;
    }>;
    items: Array<{
      sectionKey: string;
      sectionOrder: number;
      itemKey: string;
      itemLabel: string;
      itemOrder: number;
      itemMaxScore: number;
      applicableResponses: number;
      notApplicableResponses: number;
      averageScore: number | null;
      averagePercentage: number | null;
    }>;
  };
  supervisoryAssessment: {
    assessmentId: string;
    revision: number;
    status: "FINALIZED";
    assessmentHash: string;
    instrumentVersionId: string;
    instrumentCode: string;
    instrumentVersion: 1;
    instrumentContentHash: string;
    dateObserved: string;
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
    finalizedAt: string;
    overallPercentage: number;
    sectionPercentages: Record<string, number>;
    assessor: {
      userId: string;
      name: string;
      assignmentId: string;
      office: string;
      scopeLevel: "DISTRICT" | "CIRCUIT";
    };
    items: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      itemKey: string;
      itemLabel: string;
      itemOrder: number;
      itemMaxScore: number;
      score: number | null;
      notApplicable: boolean;
      percentage: number | null;
    }>;
  };
  comparison: {
    direction: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS";
    thresholdsDefined: false;
    combinedOverallPercentage: null;
    overall: {
      staffAveragePercentage: number;
      supervisoryPercentage: number;
      supervisoryMinusStaffPercentagePoints: number;
    };
    sections: HeadteacherDirectorReviewPackageSectionComparison[];
    items: HeadteacherDirectorReviewPackageItemComparison[];
  };
  privacy: {
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    participantListIncluded: false;
    responseHashesIncluded: false;
    reviewerContactDetailsIncluded: false;
    assessorContactDetailsIncluded: false;
  };
  integrity: {
    separateEvidenceStreams: true;
    combinedWeightingDefined: false;
    reviewerMayRewriteScores: false;
    scoreMutationAllowed: false;
    reviewEvidenceHash: string;
    staffSourceHash: string;
    supervisoryAssessmentHash: string;
  };
};

export type PlanHeadteacherDirectorReviewDecisionInput = {
  reviewPackage: HeadteacherDirectorReviewPackage;
  decision: unknown;
  note?: unknown;
  confirm: boolean;
};

export type HeadteacherDirectorReviewDecisionPlan = {
  schemaVersion: 1;
  decision: HeadteacherDirectorReviewDecision;
  reviewId: string;
  cycleId: string;
  assessmentId: string;
  snapshotId: string;
  reviewEvidenceHash: string;
  decisionContractHash: string;
  note: string | null;
  reviewNextDecision: "RETURNED" | "HELD" | "ACCEPTED";
  cycleNextStatus: "UNDER_REVIEW" | "RELEASED";
  assessmentNextStatus: "RETURNED" | "FINALIZED";
  revisionRequired: boolean;
  nextReviewStageRequired: boolean;
  releaseRequested: boolean;
  reviewerMayRewriteScores: false;
  scoreMutationAllowed: false;
  combinedWeightingDefined: false;
  executionPerformed: false;
};

type CycleRecord = {
  id: string;
  instrumentVersionId: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  status: string;
  minimumResponses: number;
  targetRoleSnapshot: string | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  participants: Array<{ status: string }>;
  scopeZone: {
    id: string;
    name: string;
    isActive: boolean;
    zoneType: { level: number; countryCode: string };
  };
  instrumentVersion: {
    id: string;
    version: number;
    contentHash: string | null;
    instrument: {
      code: string;
      purpose: string;
      subjectType: string;
      isActive: boolean;
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

type DirectorAssignmentRecord = {
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

type SnapshotRecord = {
  id: string;
  cycleId: string;
  version: number;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: unknown;
  itemAveragesJson: unknown;
  sourceHash: string;
  generatedByUserId: string | null;
  generatedAt: Date;
  metadata: unknown;
};

type InstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
};

type InstrumentSectionRecord = {
  id: string;
  key: string;
  title: string;
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
  createdAt: Date;
  scores: AssessmentScoreRecord[];
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

export type HeadteacherDirectorReviewPackageDatabase = {
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<DirectorAssignmentRecord[]>;
  };
  appraisalAggregateSnapshot: {
    findMany(args: unknown): Promise<SnapshotRecord[]>;
  };
  appraisalAssessment: {
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
  appraisalReview: {
    findMany(args: unknown): Promise<ReviewRecord[]>;
  };
};

export class HeadteacherDirectorReviewPackageError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorReviewPackageError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  instrumentVersionId: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetZoneId: true,
  status: true,
  minimumResponses: true,
  targetRoleSnapshot: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
  participants: { select: { status: true } },
  scopeZone: {
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: { select: { level: true, countryCode: true } },
    },
  },
  instrumentVersion: {
    select: {
      id: true,
      version: true,
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

const SNAPSHOT_SELECT = {
  id: true,
  cycleId: true,
  version: true,
  eligibleResponses: true,
  finalizedResponses: true,
  expiredResponses: true,
  minimumResponses: true,
  releaseEligible: true,
  overallPercentage: true,
  sectionAveragesJson: true,
  itemAveragesJson: true,
  sourceHash: true,
  generatedByUserId: true,
  generatedAt: true,
  metadata: true,
} as const;

const ASSESSMENT_SELECT = {
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
  createdAt: true,
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
          order: true,
          maxScore: true,
          items: {
            select: {
              id: true,
              key: true,
              label: true,
              order: true,
              maxScore: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
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

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherDirectorReviewPackageError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireDate(value: Date | null | undefined, code: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail(code, 409);
  }
  return value;
}

function displayName(user: TargetMembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    "Headteacher"
  );
}

function assignmentIsActive(
  assignment: DirectorAssignmentRecord,
  now: Date,
) {
  if (
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    !assignment.zone.isActive ||
    assignment.zone.zoneType.level !== 2
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

function resolveDirectorAssignment(input: {
  assignments: DirectorAssignmentRecord[];
  actorUserId: string;
  scopeZoneId: string;
  now: Date;
}) {
  const matches = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actorUserId &&
      assignment.zoneId === input.scopeZoneId &&
      assignment.zone.id === input.scopeZoneId &&
      assignmentIsActive(assignment, input.now),
  );
  if (matches.length === 0) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_AMBIGUOUS_ASSIGNMENT", 409);
  }
  return matches[0];
}

function workflowFromCycle(cycle: CycleRecord) {
  return clean(objectValue(cycle.metadata).workflow);
}

function assertCycleContract(cycle: CycleRecord) {
  if (
    workflowFromCycle(cycle) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    cycle.instrumentVersionId !== cycle.instrumentVersion.id ||
    cycle.instrumentVersion.instrument.code !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.instrument.purpose !== "HEADTEACHER_STAFF_FEEDBACK" ||
    cycle.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    !clean(cycle.targetTenantId) ||
    cycle.minimumResponses !== 1 ||
    cycle.scopeZone.id !== cycle.scopeZoneId ||
    cycle.scopeZone.zoneType.level !== 2 ||
    cycle.scopeZone.isActive !== true
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
  if (
    normalized(cycle.status) !==
      HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.requiredCycleStatus ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt ||
    cycle.cancelledAt
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CYCLE_NOT_ACTIVE", 409, {
      cycleStatus: cycle.status,
    });
  }
}

function assertTargetMembership(
  cycle: CycleRecord,
  membership: TargetMembershipRecord | null,
) {
  if (!membership) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_TARGET_NOT_FOUND", 404);
  }
  const tenantId = requireIdentifier(cycle.targetTenantId, "targetTenantId");
  assertActiveHeadteacherFeedbackTarget({
    target: {
      membershipId: membership.id,
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipStatus: membership.status,
      roleName: membership.role.name,
      tenantStatus: membership.tenant.status,
    },
    expectedUserId: cycle.targetUserId,
    expectedTenantId: tenantId,
  });
  const zone = membership.tenant.zone;
  if (
    !zone ||
    !zone.isActive ||
    zone.zoneType.level !== 1 ||
    zone.parentZoneId !== cycle.scopeZoneId ||
    !zone.parentZone ||
    !zone.parentZone.isActive ||
    zone.parentZone.id !== cycle.scopeZoneId ||
    zone.parentZone.zoneType.level !== 2
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_TARGET_JURISDICTION_DRIFT", 409);
  }
}

function directorReadiness(value: unknown) {
  const readiness = value as DirectorAggregateReadinessView;
  if (
    readiness.audience !== "DIRECTOR" ||
    readiness.state !== "UNDER_REVIEW" ||
    readiness.cycleStatus !== "UNDER_REVIEW" ||
    !readiness.snapshotId ||
    readiness.snapshotVersion !== 1 ||
    !readiness.snapshotSourceHash ||
    !/^[a-f0-9]{64}$/.test(readiness.snapshotSourceHash.toLowerCase()) ||
    readiness.finalizedResponses < 1 ||
    readiness.minimumResponses !== 1 ||
    readiness.aggregateScoresIncluded !== false ||
    readiness.respondentIdentitiesIncluded !== false ||
    readiness.participantListIncluded !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_EVIDENCE_NOT_READY", 409);
  }
  return readiness;
}

function sectionPercentageMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(objectValue(value)).map(([key, raw]) => [key, Number(raw)]),
  ) as Record<string, number>;
}

function calculationRows(
  assessment: AssessmentRecord,
  sections: InstrumentSectionRecord[],
) {
  const stored = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = stored.get(item.id);
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
  assessment: AssessmentRecord;
  visitContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number>;
  overallPercentage: number;
}) {
  const stored = new Map(
    input.assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
      dateObserved: input.assessment.dateObserved
        ? isoDateOnly(input.assessment.dateObserved)
        : null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.assessment.instrumentVersionId,
      code: input.assessment.instrumentVersion.instrument.code,
      version: input.assessment.instrumentVersion.version,
      contentHash: clean(
        input.assessment.instrumentVersion.contentHash,
      ).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      section.items.map((item) => {
        const score = stored.get(item.id);
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

function currentFinalizedAssessment(assessments: AssessmentRecord[]) {
  const unresolved = assessments.filter((assessment) =>
    ["DRAFT", "RETURNED"].includes(normalized(assessment.status)),
  );
  if (unresolved.length) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_WORK_UNRESOLVED", 409, {
      assessmentId: unresolved[0].id,
      status: unresolved[0].status,
    });
  }
  const finalized = assessments.filter(
    (assessment) => normalized(assessment.status) === "FINALIZED",
  );
  if (finalized.length === 0) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_REQUIRED", 409);
  }
  if (finalized.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_AMBIGUOUS", 409, {
      finalizedAssessments: finalized.length,
    });
  }
  return finalized[0];
}

function verifySupervisoryAssessment(assessment: AssessmentRecord) {
  const instrumentContract = inspectHeadteacherSupervisoryInstrument();
  if (!instrumentContract.valid) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_CONTRACT_INVALID", 409, {
      issues: [...instrumentContract.issues],
    });
  }
  if (
    assessment.cycleId.length === 0 ||
    normalized(assessment.status) !== "FINALIZED" ||
    assessment.instrumentVersionId !== assessment.instrumentVersion.id ||
    assessment.instrumentVersion.instrument.code !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    assessment.instrumentVersion.version !== 1 ||
    normalized(assessment.instrumentVersion.status) !== "ACTIVE" ||
    assessment.instrumentVersion.instrument.purpose !==
      "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    assessment.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    assessment.instrumentVersion.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/.test(
      clean(assessment.instrumentVersion.contentHash).toLowerCase(),
    ) ||
    clean(assessment.generalComment) ||
    assessment.finalizedByUserId !== assessment.assessorUserId ||
    !assessment.finalizedAt ||
    !assessment.dateObserved ||
    !assessment.assessorAssignmentId
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_EVIDENCE_INVALID", 409, {
      assessmentId: assessment.id,
    });
  }

  const sections = [...assessment.instrumentVersion.sections].sort(
    (left, right) => left.order - right.order,
  );
  const itemCount = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  if (
    sections.length !== HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.expectedSectionCount ||
    itemCount !== HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.expectedItemCount ||
    JSON.stringify(sections.map((section) => section.maxScore)) !==
      JSON.stringify(
        HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.expectedSectionMaximums,
      )
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_STRUCTURE_DRIFT", 409);
  }

  const uniqueScoreIds = new Set(
    assessment.scores.map((score) => score.instrumentItemId),
  );
  if (
    assessment.scores.length !== HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.expectedItemCount ||
    uniqueScoreIds.size !== HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.expectedItemCount
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_SCORE_COUNT_DRIFT", 409);
  }

  const calculated = calculateAppraisalScores(
    calculationRows(assessment, sections),
    { requireComplete: true },
  );
  if (!calculated.ok || calculated.value.overallPercentage === null) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_SCORES_INVALID", 409, {
      scoreError: calculated.ok ? "OVERALL_NULL" : calculated.code,
    });
  }

  const storedSections = sectionPercentageMap(
    assessment.sectionPercentagesJson,
  );
  if (
    JSON.stringify(stableValue(storedSections)) !==
      JSON.stringify(stableValue(calculated.value.sectionPercentages)) ||
    typeof assessment.overallPercentage !== "number" ||
    !closeEnough(
      assessment.overallPercentage,
      calculated.value.overallPercentage,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_CALCULATION_DRIFT", 409);
  }

  const metadata = objectValue(assessment.metadata);
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(visitContextHash)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_CONTEXT_HASH_INVALID", 409);
  }
  if (hashJson(assessment.evidenceSnapshotJson) !== visitContextHash) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_CONTEXT_DRIFT", 409);
  }

  const expectedHash = hashJson(
    assessmentHashPayload({
      assessment,
      visitContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages as Record<
        string,
        number
      >,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(assessment.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_HASH_DRIFT", 409);
  }

  return {
    assessmentHash: expectedHash,
    sections,
    calculated: {
      sectionPercentages: calculated.value.sectionPercentages as Record<
        string,
        number
      >,
      overallPercentage: calculated.value.overallPercentage,
    },
  };
}

function reviewEvidenceHash(input: {
  cycleId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
    cycleId: input.cycleId,
    reviewerUserId: input.reviewerUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    staffFeedback: {
      snapshotId: input.evidence.staffFeedback.snapshotId,
      snapshotVersion: input.evidence.staffFeedback.snapshotVersion,
      sourceHash: input.evidence.staffFeedback.sourceHash,
      finalizedResponses: input.evidence.staffFeedback.finalizedResponses,
      minimumResponses: input.evidence.staffFeedback.minimumResponses,
    },
    supervisoryAssessment: {
      assessmentId: input.evidence.supervisoryAssessment.assessmentId,
      revision: input.evidence.supervisoryAssessment.revision,
      assessmentHash: input.evidence.supervisoryAssessment.assessmentHash,
      assessorAssignmentId:
        input.evidence.supervisoryAssessment.assessorAssignmentId,
      directorAuthored:
        input.evidence.supervisoryAssessment.directorAuthored,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  });
}

function resolveCurrentPendingReview(input: {
  reviews: ReviewRecord[];
  cycleId: string;
  assessmentId: string;
  actorUserId: string;
  assignmentId: string;
}) {
  const reviews = [...input.reviews].sort(
    (left, right) =>
      left.stage - right.stage ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  );
  if (reviews.length === 0) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_RECORD_MISSING", 409);
  }
  for (let index = 0; index < reviews.length; index += 1) {
    const review = reviews[index];
    const expectedStage = index + 1;
    if (
      review.cycleId !== input.cycleId ||
      review.assessmentId !== input.assessmentId ||
      review.reviewerUserId !== input.actorUserId ||
      review.reviewerAssignmentId !== input.assignmentId ||
      review.stage !== expectedStage
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_CHAIN_DRIFT", 409, {
        expectedStage,
        actualStage: review.stage,
      });
    }
    const isLatest = index === reviews.length - 1;
    if (isLatest) {
      if (
        normalized(review.decision) !== "PENDING" ||
        clean(review.note) ||
        review.decidedAt
      ) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CURRENT_STAGE_INVALID", 409, {
          stage: review.stage,
          decision: normalized(review.decision),
        });
      }
      continue;
    }
    if (
      normalized(review.decision) !== "HELD" ||
      clean(review.note).length <
        HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.minimumReasonLength ||
      !review.decidedAt
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_PRIOR_STAGE_INVALID", 409, {
        stage: review.stage,
        decision: normalized(review.decision),
      });
    }
  }
  return reviews[reviews.length - 1];
}

function assertReviewRecord(input: {
  cycle: CycleRecord;
  review: ReviewRecord | null;
  assessment: AssessmentRecord;
  actorUserId: string;
  assignmentId: string;
  readiness: DirectorAggregateReadinessView;
  assessmentHash: string;
}) {
  const review = input.review;
  if (!review) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_RECORD_MISSING", 409);
  }
  const metadata = objectValue(review.metadata);
  const evidence = objectValue(metadata.evidence) as unknown as
    | HeadteacherDirectorReviewEvidenceReadiness
    | undefined;
  if (!evidence) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_METADATA_MISSING", 409);
  }

  const expectedEvidence: HeadteacherDirectorReviewEvidenceReadiness = {
    staffFeedback: {
      ready: true,
      snapshotId: clean(input.readiness.snapshotId),
      snapshotVersion: 1,
      sourceHash: clean(input.readiness.snapshotSourceHash).toLowerCase(),
      finalizedResponses: input.readiness.finalizedResponses,
      minimumResponses: 1,
    },
    supervisoryAssessment: {
      ready: true,
      assessmentId: input.assessment.id,
      revision: input.assessment.revision,
      assessmentHash: input.assessmentHash,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: clean(input.assessment.assessorAssignmentId),
      directorAuthored: input.assessment.assessorUserId === input.actorUserId,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  };
  const expectedHash = reviewEvidenceHash({
    cycleId: input.cycle.id,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    evidence: expectedEvidence,
  });

  if (
    review.cycleId !== input.cycle.id ||
    review.assessmentId !== input.assessment.id ||
    review.reviewerUserId !== input.actorUserId ||
    review.reviewerAssignmentId !== input.assignmentId ||
    !Number.isInteger(review.stage) ||
    review.stage < HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.minimumReviewStage ||
    normalized(review.decision) !== "PENDING" ||
    clean(review.note) ||
    review.decidedAt ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !== expectedHash ||
    JSON.stringify(stableValue(evidence)) !==
      JSON.stringify(stableValue(expectedEvidence)) ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateEvidenceStreams !== true ||
    metadata.combinedWeightingDefined !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_RECORD_DRIFT", 409);
  }

  return { review, evidence: expectedEvidence, reviewEvidenceHash: expectedHash };
}

function finitePercentage(value: unknown, code: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
    fail(code, 409);
  }
  return round2(numberValue);
}

function finiteScore(value: unknown, maximum: number, code: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > maximum) {
    fail(code, 409);
  }
  return round2(numberValue);
}

function verifyStaffSnapshot(input: {
  snapshot: SnapshotRecord;
  readiness: DirectorAggregateReadinessView;
  sections: InstrumentSectionRecord[];
}) {
  const snapshot = input.snapshot;
  if (
    snapshot.id !== input.readiness.snapshotId ||
    snapshot.cycleId !== input.readiness.cycleId ||
    snapshot.version !== 1 ||
    snapshot.sourceHash !== input.readiness.snapshotSourceHash ||
    snapshot.eligibleResponses !== input.readiness.eligibleResponses ||
    snapshot.finalizedResponses !== input.readiness.finalizedResponses ||
    snapshot.expiredResponses !== input.readiness.expiredResponses ||
    snapshot.minimumResponses !== 1 ||
    snapshot.releaseEligible !== true ||
    typeof snapshot.overallPercentage !== "number" ||
    snapshot.generatedByUserId !== null ||
    Number.isNaN(snapshot.generatedAt.getTime())
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_SNAPSHOT_DRIFT", 409);
  }

  const sectionEvidenceRoot = objectValue(snapshot.sectionAveragesJson);
  const itemEvidenceRoot = objectValue(snapshot.itemAveragesJson);
  const canonicalItems = input.sections.flatMap((section) =>
    section.items.map((item) => ({ section, item })),
  );
  if (
    Object.keys(sectionEvidenceRoot).length !== input.sections.length ||
    Object.keys(itemEvidenceRoot).length !== canonicalItems.length
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_STRUCTURE_DRIFT", 409);
  }

  const sections = input.sections.map((section) => {
    const evidence = objectValue(sectionEvidenceRoot[section.key]);
    const averagePercentage = finitePercentage(
      evidence.averagePercentage,
      "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_SECTION_INVALID",
    );
    if (
      clean(evidence.sectionKey) !== section.key ||
      clean(evidence.sectionTitle) !== section.title ||
      Number(evidence.sectionOrder) !== section.order ||
      Number(evidence.sectionMaxScore) !== section.maxScore ||
      Number(evidence.finalizedResponses) !== snapshot.finalizedResponses
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_SECTION_DRIFT", 409, {
        sectionKey: section.key,
      });
    }
    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      finalizedResponses: snapshot.finalizedResponses,
      averagePercentage,
    };
  });

  const items = canonicalItems.map(({ section, item }) => {
    const evidence = objectValue(itemEvidenceRoot[item.key]);
    const applicableResponses = Number(evidence.applicableResponses);
    const notApplicableResponses = Number(evidence.notApplicableResponses);
    if (
      clean(evidence.itemKey) !== item.key ||
      clean(evidence.itemLabel) !== item.label ||
      Number(evidence.itemOrder) !== item.order ||
      Number(evidence.itemMaxScore) !== item.maxScore ||
      clean(evidence.sectionKey) !== section.key ||
      Number(evidence.sectionOrder) !== section.order ||
      !Number.isInteger(applicableResponses) ||
      !Number.isInteger(notApplicableResponses) ||
      applicableResponses < 0 ||
      notApplicableResponses < 0 ||
      applicableResponses + notApplicableResponses !==
        snapshot.finalizedResponses
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_ITEM_DRIFT", 409, {
        itemKey: item.key,
      });
    }

    const allNotApplicable = applicableResponses === 0;
    const averageScore = allNotApplicable
      ? null
      : finiteScore(
          evidence.averageScore,
          item.maxScore,
          "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_ITEM_SCORE_INVALID",
        );
    const averagePercentage = allNotApplicable
      ? null
      : finitePercentage(
          evidence.averagePercentage,
          "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_ITEM_PERCENTAGE_INVALID",
        );
    if (
      (allNotApplicable &&
        (evidence.averageScore !== null ||
          evidence.averagePercentage !== null)) ||
      (!allNotApplicable &&
        !closeEnough(
          averagePercentage as number,
          round2(((averageScore as number) / item.maxScore) * 100),
        ))
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_ITEM_CALCULATION_DRIFT", 409, {
        itemKey: item.key,
      });
    }

    return {
      sectionKey: section.key,
      sectionOrder: section.order,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
      applicableResponses,
      notApplicableResponses,
      averageScore,
      averagePercentage,
    };
  });

  const expectedOverall = round2(
    sections.reduce((sum, section) => sum + section.averagePercentage, 0) /
      sections.length,
  );
  if (!closeEnough(snapshot.overallPercentage, expectedOverall)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_OVERALL_DRIFT", 409);
  }

  return {
    snapshotId: snapshot.id,
    snapshotVersion: 1 as const,
    sourceHash: snapshot.sourceHash,
    generatedAt: snapshot.generatedAt.toISOString(),
    eligibleResponses: snapshot.eligibleResponses,
    finalizedResponses: snapshot.finalizedResponses,
    expiredResponses: snapshot.expiredResponses,
    revokedResponses: input.readiness.revokedResponses,
    minimumResponses: 1 as const,
    overallPercentage: expectedOverall,
    sections,
    items,
  };
}

function supervisoryView(input: {
  assessment: AssessmentRecord;
  sections: InstrumentSectionRecord[];
  calculated: {
    sectionPercentages: Record<string, number>;
    overallPercentage: number;
  };
}) {
  const context = objectValue(input.assessment.evidenceSnapshotJson);
  const assessor = objectValue(context.assessor);
  const observation = objectValue(context.observation);
  const contextTarget = objectValue(context.target);
  const contextInstrument = objectValue(context.instrument);
  const scopeLevel = normalized(assessor.scopeLevel);
  const contextSchemaVersion = Number(context.schemaVersion);
  const metadata = objectValue(input.assessment.metadata);
  let visitDetails;
  try {
    visitDetails = visitDetailsFromEvidenceSnapshot(
      input.assessment.evidenceSnapshotJson,
    );
  } catch {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_DETAILS_INVALID", 409);
  }

  if (
    ![1, 2].includes(contextSchemaVersion) ||
    clean(contextTarget.userId) === "" ||
    clean(assessor.userId) !== input.assessment.assessorUserId ||
    clean(assessor.assignmentId) !== input.assessment.assessorAssignmentId ||
    !["DISTRICT", "CIRCUIT"].includes(scopeLevel) ||
    clean(contextInstrument.instrumentVersionId) !==
      input.assessment.instrumentVersionId ||
    clean(contextInstrument.code) !==
      input.assessment.instrumentVersion.instrument.code ||
    Number(contextInstrument.version) !== 1 ||
    clean(contextInstrument.contentHash).toLowerCase() !==
      clean(input.assessment.instrumentVersion.contentHash).toLowerCase() ||
    clean(observation.dateObserved) !==
      isoDateOnly(requireDate(
        input.assessment.dateObserved,
        "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_OBSERVATION_DATE_MISSING",
      ))
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_CONTEXT_FIELDS_DRIFT", 409);
  }

  if (
    contextSchemaVersion ===
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion &&
    (
      !visitDetails ||
      Number(metadata.visitContextSchemaVersion) !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion ||
      Number(metadata.visitDetailsSchemaVersion) !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.schemaVersion ||
      metadata.officialVisitDetailsIncluded !== true
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_DETAILS_INVALID", 409);
  }

  const scoreMap = new Map(
    input.assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  const items = input.sections.flatMap((section) =>
    section.items.map((item) => {
      const score = scoreMap.get(item.id);
      if (!score) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_SCORE_MISSING", 409, {
          itemKey: item.key,
        });
      }
      const notApplicable = score.notApplicable === true;
      const numericScore = Number(score.score);
      const scoreValue = notApplicable ? null : numericScore;
      if (
        score.sectionKey !== section.key ||
        score.sectionTitle !== section.title ||
        score.sectionOrder !== section.order ||
        score.sectionMaxScore !== section.maxScore ||
        score.itemKey !== item.key ||
        score.itemLabel !== item.label ||
        score.itemOrder !== item.order ||
        score.itemMaxScore !== item.maxScore ||
        (notApplicable && score.score !== null) ||
        (!notApplicable &&
          (!Number.isInteger(numericScore) ||
            numericScore < 1 ||
            numericScore > 5))
      ) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_SCORE_DRIFT", 409, {
          itemKey: item.key,
        });
      }
      return {
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        score: scoreValue,
        notApplicable,
        percentage: notApplicable
          ? null
          : round2(((scoreValue as number) / item.maxScore) * 100),
      };
    }),
  );

  return {
    assessmentId: input.assessment.id,
    revision: input.assessment.revision,
    status: "FINALIZED" as const,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    instrumentVersionId: input.assessment.instrumentVersionId,
    instrumentCode: input.assessment.instrumentVersion.instrument.code,
    instrumentVersion: 1 as const,
    instrumentContentHash: clean(
      input.assessment.instrumentVersion.contentHash,
    ).toLowerCase(),
    dateObserved: isoDateOnly(
      requireDate(
        input.assessment.dateObserved,
        "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_OBSERVATION_DATE_MISSING",
      ),
    ),
    visit: {
      contextSchemaVersion: contextSchemaVersion as 1 | 2,
      officialDetailsAvailable: visitDetails !== null,
      arrivalTime: visitDetails?.arrivalTime ?? null,
      staffStrength: visitDetails?.staffStrength ?? null,
      totalEnrolment: visitDetails?.totalEnrolment ?? null,
      girls: visitDetails?.girls ?? null,
      boys: visitDetails?.boys ?? null,
      teachersPresentAtVisit:
        visitDetails?.teachersPresentAtVisit ?? null,
    },
    finalizedAt: requireDate(
      input.assessment.finalizedAt,
      "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_FINALIZED_AT_MISSING",
    ).toISOString(),
    overallPercentage: input.calculated.overallPercentage,
    sectionPercentages: input.calculated.sectionPercentages,
    assessor: {
      userId: input.assessment.assessorUserId,
      name: clean(assessor.name) || "Governance assessor",
      assignmentId: clean(input.assessment.assessorAssignmentId),
      office: canonicalHeadteacherSupervisoryAssessorRole(
        clean(assessor.role) || clean(assessor.assignmentRole),
      ),
      scopeLevel: scopeLevel as "DISTRICT" | "CIRCUIT",
    },
    items,
  };
}

function comparisonView(input: {
  staff: HeadteacherDirectorReviewPackage["staffFeedback"];
  supervisory: HeadteacherDirectorReviewPackage["supervisoryAssessment"];
  sections: InstrumentSectionRecord[];
}) {
  const staffSectionMap = new Map(
    input.staff.sections.map((section) => [section.sectionKey, section]),
  );
  const staffItemMap = new Map(
    input.staff.items.map((item) => [item.itemKey, item]),
  );
  const supervisoryItemMap = new Map(
    input.supervisory.items.map((item) => [item.itemKey, item]),
  );

  const sections = input.sections.map((section) => {
    const staff = staffSectionMap.get(section.key);
    const supervisoryPercentage = input.supervisory.sectionPercentages[section.key];
    if (!staff || !Number.isFinite(supervisoryPercentage)) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SECTION_COMPARISON_DRIFT", 409, {
        sectionKey: section.key,
      });
    }
    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      staffAveragePercentage: staff.averagePercentage,
      supervisoryPercentage: round2(supervisoryPercentage),
      supervisoryMinusStaffPercentagePoints: round2(
        supervisoryPercentage - staff.averagePercentage,
      ),
    };
  });

  const items = input.sections.flatMap((section) =>
    section.items.map((item) => {
      const staff = staffItemMap.get(item.key);
      const supervisory = supervisoryItemMap.get(item.key);
      if (!staff || !supervisory) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ITEM_COMPARISON_DRIFT", 409, {
          itemKey: item.key,
        });
      }
      const comparisonState =
        staff.averagePercentage === null
          ? "STAFF_ALL_NOT_APPLICABLE"
          : supervisory.notApplicable
            ? "SUPERVISORY_NOT_APPLICABLE"
            : "COMPARABLE";
      const difference =
        comparisonState === "COMPARABLE"
          ? round2(
              (supervisory.percentage as number) -
                (staff.averagePercentage as number),
            )
          : null;
      return {
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        staffApplicableResponses: staff.applicableResponses,
        staffNotApplicableResponses: staff.notApplicableResponses,
        staffAverageScore: staff.averageScore,
        staffAveragePercentage: staff.averagePercentage,
        supervisoryScore: supervisory.score,
        supervisoryNotApplicable: supervisory.notApplicable,
        supervisoryPercentage: supervisory.percentage,
        comparisonState,
        supervisoryMinusStaffPercentagePoints: difference,
      } as HeadteacherDirectorReviewPackageItemComparison;
    }),
  );

  return {
    direction:
      "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS" as const,
    thresholdsDefined: false as const,
    combinedOverallPercentage: null,
    overall: {
      staffAveragePercentage: input.staff.overallPercentage,
      supervisoryPercentage: input.supervisory.overallPercentage,
      supervisoryMinusStaffPercentagePoints: round2(
        input.supervisory.overallPercentage - input.staff.overallPercentage,
      ),
    },
    sections,
    items,
  };
}

export async function readHeadteacherDirectorReviewPackage(
  input: ReadHeadteacherDirectorReviewPackageInput,
): Promise<HeadteacherDirectorReviewPackage> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorReviewPackageDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);
  const now = input.now ?? new Date();

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.requiredCapability,
  );
  assertHeadteacherFeedbackInstrumentReady();

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CYCLE_NOT_FOUND", 404);
  }
  assertCycleContract(cycle);

  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );
  assertHeadteacherFeedbackTargetInGovernanceScope({
    governanceScope: input.governanceScope,
    targetTenantId,
  });

  const membership = await database.membership.findFirst({
    where: {
      userId: cycle.targetUserId,
      tenantId: targetTenantId,
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
      tenant: { status: "ACTIVE" },
    },
    select: MEMBERSHIP_SELECT,
  });
  assertTargetMembership(cycle, membership);

  const assignments = await database.governanceOfficerAssignment.findMany({
    where: { userId: actorUserId },
    select: ASSIGNMENT_SELECT,
  });
  const assignment = resolveDirectorAssignment({
    assignments,
    actorUserId,
    scopeZoneId: cycle.scopeZoneId,
    now,
  });

  const readiness = directorReadiness(
    await readHeadteacherFeedbackAggregateReadiness({
      actorUserId,
      actorRoleName: actorRole,
      cycleId,
      governanceScope: input.governanceScope,
      database:
        database as unknown as HeadteacherFeedbackAggregateReadinessDatabase,
    }),
  );

  const snapshots = await database.appraisalAggregateSnapshot.findMany({
    where: { cycleId },
    orderBy: { version: "desc" },
    take: 2,
    select: SNAPSHOT_SELECT,
  });
  if (snapshots.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SNAPSHOT_COUNT_INVALID", 409, {
      snapshots: snapshots.length,
    });
  }

  const assessments = await database.appraisalAssessment.findMany({
    where: { cycleId },
    select: ASSESSMENT_SELECT,
    orderBy: [{ createdAt: "asc" }, { revision: "asc" }],
  });
  const assessment = currentFinalizedAssessment(assessments);
  if (assessment.cycleId !== cycle.id) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ASSESSMENT_CYCLE_DRIFT", 409);
  }
  const verifiedAssessment = verifySupervisoryAssessment(assessment);

  const reviews = await database.appraisalReview.findMany({
    where: { assessmentId: assessment.id },
    select: REVIEW_SELECT,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const review = resolveCurrentPendingReview({
    reviews,
    cycleId: cycle.id,
    assessmentId: assessment.id,
    actorUserId,
    assignmentId: assignment.id,
  });
  const verifiedReview = assertReviewRecord({
    cycle,
    review,
    assessment,
    actorUserId,
    assignmentId: assignment.id,
    readiness,
    assessmentHash: verifiedAssessment.assessmentHash,
  });

  const staffFeedback = verifyStaffSnapshot({
    snapshot: snapshots[0],
    readiness,
    sections: verifiedAssessment.sections,
  });
  const supervisoryAssessment = supervisoryView({
    assessment,
    sections: verifiedAssessment.sections,
    calculated: verifiedAssessment.calculated,
  });
  const comparison = comparisonView({
    staff: staffFeedback,
    supervisory: supervisoryAssessment,
    sections: verifiedAssessment.sections,
  });

  const targetZone = membership!.tenant.zone!;
  const districtZone = targetZone.parentZone!;
  return {
    schemaVersion: 1,
    audience: "DISTRICT_DIRECTOR",
    lifecycleState: "READY_FOR_DECISION",
    cycle: {
      id: cycle.id,
      status: "UNDER_REVIEW",
      targetUserId: cycle.targetUserId,
      targetTenantId,
      targetName: displayName(membership!.user),
      schoolName: membership!.tenant.name,
      circuitZoneId: targetZone.id,
      circuitName: targetZone.name,
      districtZoneId: districtZone.id,
      districtName: districtZone.name,
      reviewStartedAt: requireDate(
        cycle.reviewStartedAt,
        "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STARTED_AT_MISSING",
      ).toISOString(),
    },
    review: {
      id: verifiedReview.review.id,
      stage: verifiedReview.review.stage,
      decision: "PENDING",
      reviewerUserId: actorUserId,
      reviewerAssignmentId: assignment.id,
      createdAt: requireDate(
        verifiedReview.review.createdAt,
        "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_CREATED_AT_INVALID",
      ).toISOString(),
      reviewEvidenceHash: verifiedReview.reviewEvidenceHash,
    },
    staffFeedback,
    supervisoryAssessment,
    comparison,
    privacy: {
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      participantListIncluded: false,
      responseHashesIncluded: false,
      reviewerContactDetailsIncluded: false,
      assessorContactDetailsIncluded: false,
    },
    integrity: {
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      reviewEvidenceHash: verifiedReview.reviewEvidenceHash,
      staffSourceHash: staffFeedback.sourceHash,
      supervisoryAssessmentHash: supervisoryAssessment.assessmentHash,
    },
  };
}

function normalizeDecision(value: unknown): HeadteacherDirectorReviewDecision {
  const decision = normalized(value);
  if (!HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.decisions.includes(
    decision as HeadteacherDirectorReviewDecision,
  )) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_INVALID", 400, { decision });
  }
  return decision as HeadteacherDirectorReviewDecision;
}

function decisionNote(input: {
  decision: HeadteacherDirectorReviewDecision;
  note: unknown;
}) {
  const note = clean(input.note);
  if (note.length > HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.maximumNoteLength) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_NOTE_TOO_LONG", 400);
  }
  if (
    ["RETURN", "HOLD"].includes(input.decision) &&
    note.length < HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.minimumReasonLength
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_REASON_REQUIRED", 400, {
      decision: input.decision,
    });
  }
  return note || null;
}

function assertDecisionVisitDetails(
  visit: HeadteacherDirectorReviewPackage["supervisoryAssessment"]["visit"],
) {
  if (visit.contextSchemaVersion === 1) {
    if (
      visit.officialDetailsAvailable !== false ||
      visit.arrivalTime !== null ||
      visit.staffStrength !== null ||
      visit.totalEnrolment !== null ||
      visit.girls !== null ||
      visit.boys !== null ||
      visit.teachersPresentAtVisit !== null
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_VISIT_DETAILS_INVALID", 409);
    }
    return;
  }

  const wholeNumbers = [
    visit.staffStrength,
    visit.totalEnrolment,
    visit.girls,
    visit.boys,
    visit.teachersPresentAtVisit,
  ];
  if (
    visit.contextSchemaVersion !== 2 ||
    visit.officialDetailsAvailable !== true ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean(visit.arrivalTime)) ||
    wholeNumbers.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0,
    ) ||
    Number(visit.girls) + Number(visit.boys) !==
      Number(visit.totalEnrolment) ||
    Number(visit.teachersPresentAtVisit) > Number(visit.staffStrength)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_VISIT_DETAILS_INVALID", 409);
  }
}

function assertDecisionPackage(reviewPackage: HeadteacherDirectorReviewPackage) {
  assertDecisionVisitDetails(reviewPackage.supervisoryAssessment.visit);
  if (
    reviewPackage.schemaVersion !== 1 ||
    reviewPackage.audience !== "DISTRICT_DIRECTOR" ||
    reviewPackage.lifecycleState !== "READY_FOR_DECISION" ||
    reviewPackage.cycle.status !== "UNDER_REVIEW" ||
    !Number.isInteger(reviewPackage.review.stage) ||
    reviewPackage.review.stage <
      HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.minimumReviewStage ||
    reviewPackage.review.decision !== "PENDING" ||
    !/^[a-f0-9]{64}$/.test(reviewPackage.review.reviewEvidenceHash) ||
    !/^[a-f0-9]{64}$/.test(reviewPackage.staffFeedback.sourceHash) ||
    !/^[a-f0-9]{64}$/.test(
      reviewPackage.supervisoryAssessment.assessmentHash,
    ) ||
    reviewPackage.integrity.separateEvidenceStreams !== true ||
    reviewPackage.integrity.combinedWeightingDefined !== false ||
    reviewPackage.integrity.reviewerMayRewriteScores !== false ||
    reviewPackage.integrity.scoreMutationAllowed !== false ||
    reviewPackage.privacy.respondentIdentitiesIncluded !== false ||
    reviewPackage.privacy.individualStaffResponsesIncluded !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_PACKAGE_INVALID", 409);
  }
}

export function planHeadteacherDirectorReviewDecision(
  input: PlanHeadteacherDirectorReviewDecisionInput,
): HeadteacherDirectorReviewDecisionPlan {
  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_DECISION_CONFIRMATION_REQUIRED", 400);
  }
  assertDecisionPackage(input.reviewPackage);
  const decision = normalizeDecision(input.decision);
  const note = decisionNote({ decision, note: input.note });

  const transition =
    decision === "RETURN"
      ? {
          reviewNextDecision: "RETURNED" as const,
          cycleNextStatus: "UNDER_REVIEW" as const,
          assessmentNextStatus: "RETURNED" as const,
          revisionRequired: true,
          nextReviewStageRequired: false,
          releaseRequested: false,
        }
      : decision === "HOLD"
        ? {
            reviewNextDecision: "HELD" as const,
            cycleNextStatus: "UNDER_REVIEW" as const,
            assessmentNextStatus: "FINALIZED" as const,
            revisionRequired: false,
            nextReviewStageRequired: true,
            releaseRequested: false,
          }
        : {
            reviewNextDecision: "ACCEPTED" as const,
            cycleNextStatus: "RELEASED" as const,
            assessmentNextStatus: "FINALIZED" as const,
            revisionRequired: false,
            nextReviewStageRequired: false,
            releaseRequested: true,
          };

  const decisionContractHash = hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.schemaVersion,
    cycleId: input.reviewPackage.cycle.id,
    reviewId: input.reviewPackage.review.id,
    reviewStage: input.reviewPackage.review.stage,
    assessmentId: input.reviewPackage.supervisoryAssessment.assessmentId,
    snapshotId: input.reviewPackage.staffFeedback.snapshotId,
    reviewEvidenceHash: input.reviewPackage.review.reviewEvidenceHash,
    staffSourceHash: input.reviewPackage.staffFeedback.sourceHash,
    supervisoryAssessmentHash:
      input.reviewPackage.supervisoryAssessment.assessmentHash,
    decision,
    note,
    transition,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
    executionPerformed: false,
  });

  return {
    schemaVersion: 1,
    decision,
    reviewId: input.reviewPackage.review.id,
    cycleId: input.reviewPackage.cycle.id,
    assessmentId: input.reviewPackage.supervisoryAssessment.assessmentId,
    snapshotId: input.reviewPackage.staffFeedback.snapshotId,
    reviewEvidenceHash: input.reviewPackage.review.reviewEvidenceHash,
    decisionContractHash,
    note,
    ...transition,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
    executionPerformed: false,
  };
}
