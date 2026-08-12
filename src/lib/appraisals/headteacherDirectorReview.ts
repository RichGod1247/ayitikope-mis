//src/lib/appraisals/headteacherDirectorReview.ts
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
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
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
  inspectHeadteacherSupervisoryInstrument,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewAdmission";
import {
  HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryReviewDecision";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_REVIEW_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  reviewStage: 1,
  directReviewStage: 1,
  hosForwardedReviewStage: 2,
  directEligibleAssessorRoles: ["HEAD_OF_SUPERVISION"] as const,
  hosForwardedEligibleAssessorRoles: [
    "SISSO",
    "BASIC_SCHOOL_COORDINATOR",
  ] as const,
  hosForwardRequiredForSissoBsc: true,
  cycleFromStatus: "CLOSED",
  cycleToStatus: "UNDER_REVIEW",
  reviewDecisionAtStart: "PENDING",
  aggregateSnapshotVersion: 1,
  minimumFinalizedStaffResponses: 1,
  requiredCurrentSupervisoryAssessments: 1,
  respondentIdentitiesAccessedAtStart: false,
  individualStaffResponsesAccessedAtStart: false,
  reviewerMayRewriteScores: false,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  directorAuthoredAssessmentNeedsSeparateReviewer: false,
  directorAuthoredAssessmentSelfReviewAllowed: false,
  explicitConfirmationRequired: true,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

export const HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY = {
  schemaVersion: 1,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredAssessmentStatus: "FINALIZED",
  requiredSourceAssessmentStatus: "SUPERSEDED",
  minimumCorrectionRevision: 2,
  reviewStage: 1,
  reviewStageMode: "SOURCE_RETURN_STAGE",
  preserveSourceReviewStage: true,
  reviewDecision: "PENDING",
  sourceReviewDecision: "RETURNED",
  preserveOriginalReviewer: true,
  precomputeAggregateOutsideTransaction: true,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  providerCallsAllowed: false,
} as const;

const REVIEW_STARTED_AUDIT_ACTION =
  "HEADTEACHER_APPRAISAL_DIRECTOR_REVIEW_STARTED";
const CORRECTION_REVIEW_CONTINUED_AUDIT_ACTION =
  "HEADTEACHER_APPRAISAL_DIRECTOR_CORRECTION_REVIEW_CONTINUED";

export type HeadteacherDirectorReviewRequestMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type StartHeadteacherDirectorReviewInput =
  HeadteacherDirectorReviewRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    cycleId: string;
    confirm: boolean;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    now?: Date;
    database?: HeadteacherDirectorReviewDatabase;
  };

export type HeadteacherDirectorReviewEvidenceReadiness = {
  staffFeedback: {
    ready: true;
    snapshotId: string;
    snapshotVersion: 1;
    sourceHash: string;
    finalizedResponses: number;
    minimumResponses: 1;
  };
  supervisoryAssessment: {
    ready: true;
    assessmentId: string;
    revision: number;
    assessmentHash: string;
    assessorUserId: string;
    assessorAssignmentId: string;
    directorAuthored: boolean;
  };
  separateEvidenceStreams: true;
  combinedWeightingDefined: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
  reviewerMayRewriteScores: false;
};

export type StartHeadteacherDirectorReviewResult = {
  outcome: "STARTED" | "EXISTING_REVIEW";
  cycleId: string;
  cycleStatus: "UNDER_REVIEW";
  reviewId: string;
  reviewStage: 1 | 2;
  reviewDecision: "PENDING";
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewStartedAt: string;
  reviewEvidenceHash: string;
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
};

type HeadteacherDirectorRunStartResult = Omit<
  StartHeadteacherDirectorReviewResult,
  "reviewStage"
> & {
  reviewStage: number;
};


export type HeadteacherDirectorCorrectionContinuationDependencies = {
  readAggregateReadiness: typeof readHeadteacherFeedbackAggregateReadiness;
};

export type EnsureHeadteacherDirectorCorrectionReviewContinuationInput =
  HeadteacherDirectorReviewRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    assessmentId: string;
    now?: Date;
    database?: HeadteacherDirectorReviewDatabase;
    dependencies?: HeadteacherDirectorCorrectionContinuationDependencies;
  };

export type EnsureHeadteacherDirectorCorrectionReviewContinuationResult = {
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
  providerCalled: false;
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
  scopeZone: {
    id: string;
    name: string;
    isActive: boolean;
    zoneType: {
      level: number;
      countryCode: string;
    };
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
  tenant: {
    id: string;
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
    zoneType: {
      level: number;
      countryCode: string;
    };
  };
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

type AppraisalReviewDelegate = {
  findUnique(args: unknown): Promise<ReviewRecord | null>;
  findMany(args: unknown): Promise<ReviewRecord[]>;
  create(args: unknown): Promise<ReviewRecord>;
};

export type HeadteacherDirectorReviewTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    update(args: unknown): Promise<{
      id: string;
      status: string;
      reviewStartedAt: Date | null;
      metadata: unknown;
    }>;
  };
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<DirectorAssignmentRecord[]>;
  };
  appraisalAggregateSnapshot: {
    findMany(args: unknown): Promise<unknown[]>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
  appraisalReview: AppraisalReviewDelegate;
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherDirectorReviewDatabase = {
  appraisalCycle: HeadteacherDirectorReviewTransactionClient["appraisalCycle"];
  membership: HeadteacherDirectorReviewTransactionClient["membership"];
  governanceOfficerAssignment: HeadteacherDirectorReviewTransactionClient["governanceOfficerAssignment"];
  appraisalAggregateSnapshot: HeadteacherDirectorReviewTransactionClient["appraisalAggregateSnapshot"];
  appraisalAssessment: HeadteacherDirectorReviewTransactionClient["appraisalAssessment"];
  appraisalReview: AppraisalReviewDelegate;
  auditLog: HeadteacherDirectorReviewTransactionClient["auditLog"];
  $transaction<T>(
    operation: (tx: HeadteacherDirectorReviewTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export class HeadteacherDirectorReviewError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorReviewError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const cycleSelect = {
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
  scopeZone: {
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: {
        select: {
          level: true,
          countryCode: true,
        },
      },
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

const membershipSelect = {
  id: true,
  userId: true,
  tenantId: true,
  status: true,
  role: { select: { name: true } },
  tenant: {
    select: {
      id: true,
      status: true,
      zone: {
        select: {
          id: true,
          name: true,
          isActive: true,
          parentZoneId: true,
          zoneType: {
            select: {
              level: true,
              countryCode: true,
            },
          },
          parentZone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              zoneType: {
                select: {
                  level: true,
                  countryCode: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const assignmentSelect = {
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
      zoneType: {
        select: {
          level: true,
          countryCode: true,
        },
      },
    },
  },
} as const;

const assessmentSelect = {
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

const reviewSelect = {
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

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherDirectorReviewError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function dateValue(value: Date | null | undefined) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
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
    fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
  if (cycle.releasedAt || cycle.cancelledAt) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_ALREADY_TERMINAL", 409, {
      cycleStatus: cycle.status,
    });
  }
}

function assertTargetMembership(
  cycle: CycleRecord,
  membership: TargetMembershipRecord | null,
) {
  if (!membership) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_TARGET_NOT_FOUND", 404);
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
    fail("HEADTEACHER_DIRECTOR_REVIEW_TARGET_JURISDICTION_DRIFT", 409);
  }
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
    fail("HEADTEACHER_DIRECTOR_REVIEW_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_AMBIGUOUS_ASSIGNMENT", 409);
  }
  return matches[0];
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
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(
    input.assessment.scores.map((score) => [
      score.instrumentItemId,
      score,
    ]),
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

function verifySupervisoryAssessment(
  assessment: AssessmentRecord,
) {
  const policy = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  const instrumentContract = inspectHeadteacherSupervisoryInstrument();
  if (!instrumentContract.valid) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_INSTRUMENT_DRIFT", 409);
  }
  if (
    normalized(assessment.status) !== "FINALIZED" ||
    !assessment.finalizedAt ||
    assessment.finalizedByUserId !== assessment.assessorUserId ||
    !assessment.assessorAssignmentId ||
    !assessment.dateObserved ||
    clean(assessment.generalComment) ||
    !/^[a-f0-9]{64}$/i.test(clean(assessment.assessmentHash)) ||
    assessment.instrumentVersionId !== assessment.instrumentVersion.id ||
    assessment.instrumentVersion.version !== policy.instrumentVersion ||
    normalized(assessment.instrumentVersion.status) !== "ACTIVE" ||
    assessment.instrumentVersion.instrument.code !== policy.instrumentCode ||
    assessment.instrumentVersion.instrument.purpose !==
      "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    assessment.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    assessment.instrumentVersion.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/i.test(
      clean(assessment.instrumentVersion.contentHash),
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_EVIDENCE_INVALID", 409, {
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
    sections.length !== policy.expectedSectionCount ||
    itemCount !== policy.expectedItemCount ||
    JSON.stringify(sections.map((section) => section.maxScore)) !==
      JSON.stringify(policy.expectedSectionMaximums)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_STRUCTURE_DRIFT", 409);
  }

  const uniqueScoreIds = new Set(
    assessment.scores.map((score) => score.instrumentItemId),
  );
  if (
    assessment.scores.length !== policy.expectedItemCount ||
    uniqueScoreIds.size !== policy.expectedItemCount
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_SCORE_COUNT_DRIFT", 409);
  }

  const calculated = calculateAppraisalScores(
    calculationRows(assessment, sections),
    { requireComplete: true },
  );
  if (!calculated.ok) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_SCORES_INVALID", 409, {
      scoreError: calculated.code,
    });
  }
  const storedSections = sectionPercentageMap(
    assessment.sectionPercentagesJson,
  );
  if (
    !sameNumbers(storedSections, calculated.value.sectionPercentages) ||
    assessment.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_CALCULATION_DRIFT", 409);
  }

  const visitContextHash = clean(
    objectValue(assessment.metadata).visitContextHash,
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(visitContextHash)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_VISIT_CONTEXT_HASH_INVALID", 409);
  }
  const expectedHash = hashJson(
    assessmentHashPayload({
      assessment,
      visitContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(assessment.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_HASH_DRIFT", 409);
  }

  return {
    assessmentHash: expectedHash,
    answeredItems: calculated.value.answeredItems,
    notApplicableItems: calculated.value.notApplicableItems,
  };
}

function currentFinalizedAssessment(assessments: AssessmentRecord[]) {
  const unresolved = assessments.filter((assessment) =>
    ["DRAFT", "RETURNED"].includes(normalized(assessment.status)),
  );
  if (unresolved.length) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_WORK_UNRESOLVED", 409, {
      assessmentId: unresolved[0].id,
      status: unresolved[0].status,
    });
  }

  const finalized = assessments.filter(
    (assessment) => normalized(assessment.status) === "FINALIZED",
  );
  if (finalized.length === 0) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED", 409);
  }
  if (
    finalized.length !==
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCurrentSupervisoryAssessments
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_AMBIGUOUS", 409, {
      finalizedAssessments: finalized.length,
    });
  }
  return finalized[0];
}

function directorReadiness(
  value: unknown,
  expectedState: "READY_FOR_REVIEW" | "UNDER_REVIEW",
) {
  const readiness = value as DirectorAggregateReadinessView;
  if (
    readiness.audience !== "DIRECTOR" ||
    readiness.state !== expectedState ||
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
    fail("HEADTEACHER_DIRECTOR_REVIEW_STAFF_EVIDENCE_NOT_READY", 409, {
      state: readiness.state,
    });
  }
  return readiness;
}

function reviewEvidence(input: {
  readiness: DirectorAggregateReadinessView;
  assessment: AssessmentRecord;
  assessmentHash: string;
  actorUserId: string;
}) {
  return {
    staffFeedback: {
      ready: true as const,
      snapshotId: clean(input.readiness.snapshotId),
      snapshotVersion: 1 as const,
      sourceHash: clean(input.readiness.snapshotSourceHash).toLowerCase(),
      finalizedResponses: input.readiness.finalizedResponses,
      minimumResponses: 1 as const,
    },
    supervisoryAssessment: {
      ready: true as const,
      assessmentId: input.assessment.id,
      revision: input.assessment.revision,
      assessmentHash: input.assessmentHash,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: clean(input.assessment.assessorAssignmentId),
      directorAuthored: input.assessment.assessorUserId === input.actorUserId,
    },
    separateEvidenceStreams: true as const,
    combinedWeightingDefined: false as const,
    respondentIdentitiesAccessed: false as const,
    individualStaffResponsesAccessed: false as const,
    reviewerMayRewriteScores: false as const,
  };
}

type HeadteacherDirectorAdmissionContext =
  | {
      kind: "HOS_AUTHORED_STAGE_1";
      reviewStage: 1;
      assessorRole: "HEAD_OF_SUPERVISION";
      hosForward: null;
    }
  | {
      kind: "HOS_FORWARDED_STAGE_2";
      reviewStage: 2;
      assessorRole: "SISSO" | "BASIC_SCHOOL_COORDINATOR";
      hosForward: {
        reviewId: string;
        reviewStage: 1;
        reviewerUserId: string;
        reviewerAssignmentId: string;
        reviewEvidenceHash: string;
        decisionRequestHash: string;
        decisionEvidenceHash: string;
        decidedAt: string;
      };
    }
  | {
      kind: "DIRECTOR_CORRECTION";
      reviewStage: number;
      assessorRole: string;
      hosForward: null;
      correction: {
        sourceAssessmentId: string;
        sourceAssessmentRevision: number;
        sourceReviewId: string;
        sourceReviewStage: number;
        returnEvidenceHash: string;
      };
    };

function frozenSupervisoryAssessorRole(
  assessment: AssessmentRecord,
  cycle: CycleRecord,
) {
  const context = objectValue(assessment.evidenceSnapshotJson);
  const assessor = objectValue(context.assessor);
  const jurisdiction = objectValue(context.jurisdiction);
  const frozenRole = canonicalHeadteacherSupervisoryAssessorRole(
    clean(assessor.role) || clean(assessor.assignmentRole),
  );
  if (
    clean(assessor.userId) !== assessment.assessorUserId ||
    clean(assessor.assignmentId) !== clean(assessment.assessorAssignmentId) ||
    clean(jurisdiction.districtZoneId) !== cycle.scopeZoneId
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_ASSESSOR_PROVENANCE_DRIFT", 409, {
      assessmentId: assessment.id,
    });
  }
  return frozenRole;
}

function hosReviewEvidenceHash(input: {
  assessment: AssessmentRecord;
  cycle: CycleRecord;
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
      stage: 1,
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
  cycle: CycleRecord;
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

async function resolveInitialDirectorAdmission(input: {
  tx: HeadteacherDirectorReviewTransactionClient;
  cycle: CycleRecord;
  assessment: AssessmentRecord;
  actorUserId: string;
  now: Date;
}): Promise<HeadteacherDirectorAdmissionContext> {
  const assessorRole = frozenSupervisoryAssessorRole(
    input.assessment,
    input.cycle,
  );
  if (
    input.assessment.assessorUserId === input.actorUserId ||
    assessorRole === "DISTRICT_DIRECTOR"
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_SELF_REVIEW_FORBIDDEN", 403, {
      assessmentId: input.assessment.id,
    });
  }

  if (assessorRole === "HEAD_OF_SUPERVISION") {
    const reviews = await input.tx.appraisalReview.findMany({
      where: { assessmentId: input.assessment.id },
      select: reviewSelect,
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    });
    if (
      reviews.length > 1 ||
      reviews.some((review) => review.stage !== 1)
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_AUTHORED_REVIEW_DRIFT", 409);
    }
    if (
      (reviews.length === 0 &&
        (normalized(input.cycle.status) !== "CLOSED" ||
          input.cycle.reviewStartedAt)) ||
      (reviews.length === 1 &&
        (normalized(input.cycle.status) !== "UNDER_REVIEW" ||
          !input.cycle.reviewStartedAt))
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_AUTHORED_CYCLE_NOT_READY", 409);
    }
    return {
      kind: "HOS_AUTHORED_STAGE_1",
      reviewStage: 1,
      assessorRole: "HEAD_OF_SUPERVISION",
      hosForward: null,
    };
  }

  if (!(["SISSO", "BASIC_SCHOOL_COORDINATOR"] as const).includes(
    assessorRole as "SISSO" | "BASIC_SCHOOL_COORDINATOR",
  )) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_ASSESSOR_ORIGIN_FORBIDDEN", 409, {
      assessorRole,
    });
  }
  if (
    normalized(input.cycle.status) !== "UNDER_REVIEW" ||
    !input.cycle.reviewStartedAt
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_REQUIRED", 409, {
      assessorRole,
    });
  }

  const reviews = await input.tx.appraisalReview.findMany({
    where: { assessmentId: input.assessment.id },
    select: reviewSelect,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const sourceReview = reviews.find((review) => review.stage === 1);
  const stage2 = reviews.find((review) => review.stage === 2);
  if (
    !sourceReview ||
    reviews.some((review) => ![1, 2].includes(review.stage)) ||
    reviews.filter((review) => review.stage === 1).length !== 1 ||
    reviews.filter((review) => review.stage === 2).length > 1 ||
    normalized(sourceReview.decision) !== "ACCEPTED" ||
    clean(sourceReview.note) ||
    !sourceReview.decidedAt ||
    !clean(sourceReview.reviewerAssignmentId)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_REVIEW_INVALID", 409);
  }

  const reviewMetadata = objectValue(sourceReview.metadata);
  const visitContextHash = clean(
    objectValue(input.assessment.metadata).visitContextHash,
  ).toLowerCase();
  const expectedReviewEvidenceHash = hosReviewEvidenceHash({
    assessment: input.assessment,
    cycle: input.cycle,
    review: sourceReview,
    visitContextHash,
  });
  const expectedRequestHash = hosDecisionRequestHash({
    assessment: input.assessment,
    cycle: input.cycle,
    review: sourceReview,
    visitContextHash,
    sourceReviewEvidenceHash: expectedReviewEvidenceHash,
  });
  const expectedDecisionEvidenceHash = hosDecisionEvidenceHash({
    decisionRequestHash: expectedRequestHash,
    sourceReviewEvidenceHash: expectedReviewEvidenceHash,
  });
  if (
    clean(reviewMetadata.reviewType) !== "HOS_SUPERVISORY_REVIEW" ||
    Number(reviewMetadata.reviewStage) !== 1 ||
    clean(reviewMetadata.reviewerRole) !== "HEAD_OF_SUPERVISION" ||
    clean(reviewMetadata.decisionAction) !== "FORWARD" ||
    clean(reviewMetadata.decidedByRole) !== "HEAD_OF_SUPERVISION" ||
    clean(reviewMetadata.reviewEvidenceHash).toLowerCase() !==
      expectedReviewEvidenceHash ||
    clean(reviewMetadata.decisionRequestHash).toLowerCase() !==
      expectedRequestHash ||
    clean(reviewMetadata.decisionEvidenceHash).toLowerCase() !==
      expectedDecisionEvidenceHash ||
    reviewMetadata.nextReviewCreated !== false ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.visitEvidenceMutationPerformed !== false ||
    reviewMetadata.staffFeedbackIncluded !== false ||
    reviewMetadata.respondentIdentitiesIncluded !== false ||
    reviewMetadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_PROVENANCE_DRIFT", 409);
  }

  const hosAssignments = await input.tx.governanceOfficerAssignment.findMany({
    where: { userId: sourceReview.reviewerUserId },
    select: assignmentSelect,
  });
  const activeHosAssignments = hosAssignments.filter(
    (assignment) =>
      assignment.id === sourceReview.reviewerAssignmentId &&
      effectiveRole(assignment.role) === "HEAD_OF_SUPERVISION" &&
      assignment.zoneId === input.cycle.scopeZoneId &&
      assignment.zone.id === input.cycle.scopeZoneId &&
      assignment.zone.zoneType.level === 2 &&
      assignmentWindowIsActive(assignment, input.now),
  );
  if (activeHosAssignments.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_ASSIGNMENT_INVALID", 409, {
      activeAssignments: activeHosAssignments.length,
    });
  }

  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).headteacherSupervisoryReview,
  );
  const baseCycleProvenanceValid =
    clean(cycleReview.currentReviewId) === sourceReview.id &&
    Number(cycleReview.currentReviewStage) === 1 &&
    clean(cycleReview.currentReviewerRole) === "HEAD_OF_SUPERVISION" &&
    clean(cycleReview.currentReviewerAssignmentId) ===
      sourceReview.reviewerAssignmentId &&
    clean(cycleReview.sourceReviewDecision) === "ACCEPTED" &&
    clean(cycleReview.reviewEvidenceHash).toLowerCase() ===
      expectedReviewEvidenceHash &&
    clean(cycleReview.admittedAssessmentId) === input.assessment.id &&
    Number(cycleReview.admittedAssessmentRevision) === input.assessment.revision &&
    clean(cycleReview.assessmentHash).toLowerCase() ===
      clean(input.assessment.assessmentHash).toLowerCase() &&
    clean(cycleReview.decisionRequestHash).toLowerCase() ===
      expectedRequestHash &&
    clean(cycleReview.decisionEvidenceHash).toLowerCase() ===
      expectedDecisionEvidenceHash &&
    cycleReview.awaitingRevision === false &&
    cycleReview.reviewerMayRewriteScores === false &&
    cycleReview.scoreMutationAllowed === false &&
    cycleReview.staffFeedbackIncluded === false &&
    cycleReview.respondentIdentitiesIncluded === false &&
    cycleReview.providerCalled === false;

  if (!baseCycleProvenanceValid) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_CYCLE_DRIFT", 409);
  }

  if (!stage2) {
    if (
      clean(cycleReview.state) !== "HOS_REVIEW_ACCEPTED_AWAITING_DIRECTOR" ||
      cycleReview.awaitingDirectorAdmission !== true ||
      cycleReview.directorReviewCreated !== false
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_CYCLE_DRIFT", 409);
    }
  } else {
    const directorReviewRecord = objectValue(
      objectValue(input.cycle.metadata).directorReview,
    );
    if (
      clean(cycleReview.state) !== "DIRECTOR_REVIEW_PENDING" ||
      cycleReview.awaitingDirectorAdmission !== false ||
      cycleReview.directorReviewCreated !== true ||
      clean(cycleReview.directorReviewId) !== stage2.id ||
      Number(cycleReview.directorReviewStage) !== 2 ||
      clean(directorReviewRecord.reviewId) !== stage2.id ||
      Number(directorReviewRecord.reviewStage) !== 2 ||
      clean(directorReviewRecord.admissionType) !== "HOS_FORWARDED" ||
      clean(directorReviewRecord.admittedFromReviewId) !== sourceReview.id ||
      Number(directorReviewRecord.admittedFromReviewStage) !== 1 ||
      clean(directorReviewRecord.admittedFromReviewEvidenceHash).toLowerCase() !==
        expectedReviewEvidenceHash ||
      clean(directorReviewRecord.admittedFromDecisionRequestHash).toLowerCase() !==
        expectedRequestHash ||
      clean(directorReviewRecord.admittedFromDecisionEvidenceHash).toLowerCase() !==
        expectedDecisionEvidenceHash ||
      directorReviewRecord.hosForwardVerified !== true
    ) {
      fail("HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_CYCLE_DRIFT", 409);
    }
  }

  return {
    kind: "HOS_FORWARDED_STAGE_2",
    reviewStage: 2,
    assessorRole: assessorRole as "SISSO" | "BASIC_SCHOOL_COORDINATOR",
    hosForward: {
      reviewId: sourceReview.id,
      reviewStage: 1,
      reviewerUserId: sourceReview.reviewerUserId,
      reviewerAssignmentId: clean(sourceReview.reviewerAssignmentId),
      reviewEvidenceHash: expectedReviewEvidenceHash,
      decisionRequestHash: expectedRequestHash,
      decisionEvidenceHash: expectedDecisionEvidenceHash,
      decidedAt: sourceReview.decidedAt.toISOString(),
    },
  };
}

function reviewEvidenceHash(input: {
  cycleId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
  admission?: HeadteacherDirectorAdmissionContext | null;
}) {
  const payload: Record<string, unknown> = {
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
  };
  if (input.admission?.kind === "HOS_FORWARDED_STAGE_2") {
    payload.admission = {
      type: "HOS_FORWARDED",
      reviewStage: 2,
      assessorRole: input.admission.assessorRole,
      sourceReviewId: input.admission.hosForward.reviewId,
      sourceReviewStage: input.admission.hosForward.reviewStage,
      sourceReviewerUserId: input.admission.hosForward.reviewerUserId,
      sourceReviewerAssignmentId:
        input.admission.hosForward.reviewerAssignmentId,
      sourceReviewEvidenceHash:
        input.admission.hosForward.reviewEvidenceHash,
      decisionRequestHash: input.admission.hosForward.decisionRequestHash,
      decisionEvidenceHash: input.admission.hosForward.decisionEvidenceHash,
      decidedAt: input.admission.hosForward.decidedAt,
    };
  } else if (input.admission?.kind === "DIRECTOR_CORRECTION") {
    payload.admission = {
      type: "CORRECTED_ASSESSMENT",
      reviewStage: input.admission.reviewStage,
      sourceAssessmentId: input.admission.correction.sourceAssessmentId,
      sourceAssessmentRevision:
        input.admission.correction.sourceAssessmentRevision,
      sourceReviewId: input.admission.correction.sourceReviewId,
      sourceReviewStage: input.admission.correction.sourceReviewStage,
      returnEvidenceHash: input.admission.correction.returnEvidenceHash,
      preserveSourceReviewStage: true,
    };
  }
  return hashJson(payload);
}

function reviewMetadata(input: {
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
  reviewEvidenceHash: string;
  admission: HeadteacherDirectorAdmissionContext;
}) {
  return {
    schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
    reviewStage: input.admission.reviewStage,
    reviewEvidenceHash: input.reviewEvidenceHash,
    evidence: input.evidence,
    admissionType:
      input.admission.kind === "HOS_FORWARDED_STAGE_2"
        ? "HOS_FORWARDED"
        : input.admission.kind === "HOS_AUTHORED_STAGE_1"
          ? "HOS_AUTHORED"
          : "CORRECTED_ASSESSMENT",
    ...(input.admission.kind === "DIRECTOR_CORRECTION"
      ? {
          preserveSourceReviewStage: true,
          correctedFromReviewStage:
            input.admission.correction.sourceReviewStage,
        }
      : {}),
    ...(input.admission.kind === "HOS_FORWARDED_STAGE_2"
      ? {
          admittedFromReviewId: input.admission.hosForward.reviewId,
          admittedFromReviewStage: 1,
          admittedFromReviewerRole: "HEAD_OF_SUPERVISION",
          admittedFromReviewerUserId: input.admission.hosForward.reviewerUserId,
          admittedFromReviewerAssignmentId:
            input.admission.hosForward.reviewerAssignmentId,
          admittedFromReviewEvidenceHash:
            input.admission.hosForward.reviewEvidenceHash,
          admittedFromDecisionRequestHash:
            input.admission.hosForward.decisionRequestHash,
          admittedFromDecisionEvidenceHash:
            input.admission.hosForward.decisionEvidenceHash,
          hosForwardVerified: true,
        }
      : {}),
    directorAuthoredAssessmentNeedsSeparateReviewer:
      HEADTEACHER_DIRECTOR_REVIEW_POLICY
        .directorAuthoredAssessmentNeedsSeparateReviewer,
    directorAuthoredAssessmentSelfReviewAllowed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

function existingReviewResult(input: {
  cycle: CycleRecord;
  review: ReviewRecord;
  actorUserId: string;
  assignmentId: string;
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
  expectedEvidenceHash: string;
  admission: HeadteacherDirectorAdmissionContext;
}) {
  const metadata = objectValue(input.review.metadata);
  if (
    normalized(input.cycle.status) !== "UNDER_REVIEW" ||
    !dateValue(input.cycle.reviewStartedAt) ||
    input.review.cycleId !== input.cycle.id ||
    input.review.assessmentId !==
      input.evidence.supervisoryAssessment.assessmentId ||
    input.review.reviewerUserId !== input.actorUserId ||
    input.review.reviewerAssignmentId !== input.assignmentId ||
    input.review.stage !== input.admission.reviewStage ||
    normalized(input.review.decision) !== "PENDING" ||
    clean(input.review.note) ||
    input.review.decidedAt ||
    Number(metadata.reviewStage) !== input.admission.reviewStage ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !==
      input.expectedEvidenceHash ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateEvidenceStreams !== true ||
    metadata.combinedWeightingDefined !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_EXISTING_RECORD_DRIFT", 409);
  }
  if (
    input.admission.kind === "HOS_FORWARDED_STAGE_2" &&
    (
      clean(metadata.admissionType) !== "HOS_FORWARDED" ||
      clean(metadata.admittedFromReviewId) !== input.admission.hosForward.reviewId ||
      Number(metadata.admittedFromReviewStage) !== 1 ||
      clean(metadata.admittedFromReviewerRole) !== "HEAD_OF_SUPERVISION" ||
      clean(metadata.admittedFromReviewEvidenceHash).toLowerCase() !==
        input.admission.hosForward.reviewEvidenceHash ||
      clean(metadata.admittedFromDecisionRequestHash).toLowerCase() !==
        input.admission.hosForward.decisionRequestHash ||
      clean(metadata.admittedFromDecisionEvidenceHash).toLowerCase() !==
        input.admission.hosForward.decisionEvidenceHash ||
      metadata.hosForwardVerified !== true
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_EXISTING_ADMISSION_DRIFT", 409);
  }
  return {
    outcome: "EXISTING_REVIEW" as const,
    cycleId: input.cycle.id,
    cycleStatus: "UNDER_REVIEW" as const,
    reviewId: input.review.id,
    reviewStage: input.admission.reviewStage,
    reviewDecision: "PENDING" as const,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    reviewStartedAt: input.cycle.reviewStartedAt!.toISOString(),
    reviewEvidenceHash: input.expectedEvidenceHash,
    evidence: input.evidence,
  };
}

type HeadteacherDirectorRunStartOptions = {
  allowUnderReviewCreate?: boolean;
  requiredAssessmentId?: string;
  requiredReviewerAssignmentId?: string;
  auditActorUserId?: string;
  precomputedReadiness?: DirectorAggregateReadinessView;
  continuation?: {
    sourceAssessmentId: string;
    sourceAssessmentRevision: number;
    sourceReviewId: string;
    sourceReviewStage: number;
    returnEvidenceHash: string;
  };
};

function correctionAdmissionContext(
  assessment: AssessmentRecord,
  cycle: CycleRecord,
  continuation: NonNullable<HeadteacherDirectorRunStartOptions["continuation"]>,
): HeadteacherDirectorAdmissionContext {
  if (
    !Number.isInteger(continuation.sourceReviewStage) ||
    continuation.sourceReviewStage < 1 ||
    !isSha256(continuation.returnEvidenceHash)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_STAGE_INVALID", 409, {
      sourceReviewStage: continuation.sourceReviewStage,
    });
  }
  return {
    kind: "DIRECTOR_CORRECTION",
    reviewStage: continuation.sourceReviewStage,
    assessorRole: frozenSupervisoryAssessorRole(assessment, cycle),
    hosForward: null,
    correction: {
      sourceAssessmentId: continuation.sourceAssessmentId,
      sourceAssessmentRevision: continuation.sourceAssessmentRevision,
      sourceReviewId: continuation.sourceReviewId,
      sourceReviewStage: continuation.sourceReviewStage,
      returnEvidenceHash: continuation.returnEvidenceHash,
    },
  };
}

type HeadteacherDirectorCorrectionContinuationContext =
  | {
      kind: "NOT_REQUIRED";
      assessment: AssessmentRecord;
    }
  | {
      kind: "REQUIRED";
      assessment: AssessmentRecord;
      sourceAssessment: AssessmentRecord;
      sourceReview: ReviewRecord;
      readiness: DirectorAggregateReadinessView;
      governanceScope: HeadteacherFeedbackGovernanceScope;
      returnEvidenceHash: string;
    };

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function assignmentWindowIsActive(
  assignment: DirectorAssignmentRecord,
  now: Date,
) {
  if (
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zone.isActive !== true
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

function reviewScoreEditsPresent(value: unknown) {
  const record = objectValue(value);
  return ["scoreEdits", "scores", "itemScores", "sectionScores"].some(
    (key) => {
      const candidate = record[key];
      if (Array.isArray(candidate)) return candidate.length > 0;
      if (candidate && typeof candidate === "object") {
        return Object.keys(candidate as Record<string, unknown>).length > 0;
      }
      return candidate != null && clean(candidate) !== "";
    },
  );
}

function correctionReturnEvidenceHash(
  assessment: AssessmentRecord,
  review: ReviewRecord,
) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    assessmentId: assessment.id,
    assessmentHash: clean(assessment.assessmentHash).toLowerCase(),
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

function correctionRevisionKey(input: {
  sourceAssessmentId: string;
  revision: number;
  sourceAssessmentHash: string;
  returnEvidenceHash: string;
  visitContextHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    originalAssessmentId: input.sourceAssessmentId,
    nextRevision: input.revision,
    sourceAssessmentHash: input.sourceAssessmentHash,
    returnEvidenceHash: input.returnEvidenceHash,
    visitContextHash: input.visitContextHash,
  });
}

function assertContinuationMetadata(input: {
  metadata: unknown;
  sourceAssessment: AssessmentRecord;
  sourceReview: ReviewRecord;
  assessmentRevision: number;
}) {
  const metadata = objectValue(input.metadata);
  const sourceHash = clean(input.sourceAssessment.assessmentHash).toLowerCase();
  const returnHash = correctionReturnEvidenceHash(
    input.sourceAssessment,
    input.sourceReview,
  );
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  const expectedRevisionKey = correctionRevisionKey({
    sourceAssessmentId: input.sourceAssessment.id,
    revision: input.assessmentRevision,
    sourceAssessmentHash: sourceHash,
    returnEvidenceHash: returnHash,
    visitContextHash,
  });
  const sourceReviewMetadata = objectValue(input.sourceReview.metadata);

  if (
    clean(metadata.sourceAssessmentId) !== input.sourceAssessment.id ||
    clean(metadata.sourceAssessmentHash).toLowerCase() !== sourceHash ||
    clean(metadata.returnReviewId) !== input.sourceReview.id ||
    Number(metadata.returnReviewStage) !== input.sourceReview.stage ||
    clean(metadata.returnEvidenceHash).toLowerCase() !== returnHash ||
    clean(metadata.returnReason) !== clean(input.sourceReview.note) ||
    clean(metadata.revisionKey).toLowerCase() !== expectedRevisionKey ||
    Number(metadata.revisionSchemaVersion) !== 1 ||
    Number(metadata.copiedScoreCount) !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount ||
    !isSha256(visitContextHash) ||
    metadata.preserveVisitContext !== true ||
    metadata.returnedAssessmentRequiresRevision !== true ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateFromStaffFeedback !== true ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false ||
    sourceReviewMetadata.reviewerMayRewriteScores !== false ||
    sourceReviewMetadata.scoreMutationPerformed !== false ||
    reviewScoreEditsPresent(input.sourceReview.metadata)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_REVISION_CHAIN_INVALID", 409, {
      assessmentId: clean(metadata.sourceAssessmentId),
    });
  }

  return returnHash;
}

function assertExistingContinuationMetadata(
  review: ReviewRecord,
  continuation: NonNullable<HeadteacherDirectorRunStartOptions["continuation"]>,
) {
  const metadata = objectValue(review.metadata);
  if (
    metadata.continuationType !== "CORRECTED_ASSESSMENT" ||
    clean(metadata.continuedFromAssessmentId) !==
      continuation.sourceAssessmentId ||
    Number(metadata.continuedFromAssessmentRevision) !==
      continuation.sourceAssessmentRevision ||
    clean(metadata.continuedFromReviewId) !== continuation.sourceReviewId ||
    Number(metadata.continuedFromReviewStage) !==
      continuation.sourceReviewStage ||
    clean(metadata.returnEvidenceHash).toLowerCase() !==
      continuation.returnEvidenceHash ||
    metadata.scoreMutationPerformed !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_EXISTING_DRIFT", 409);
  }
}

async function readCorrectionContinuationContext(
  input: EnsureHeadteacherDirectorCorrectionReviewContinuationInput,
  database: HeadteacherDirectorReviewDatabase,
): Promise<HeadteacherDirectorCorrectionContinuationContext> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const actorRole = effectiveRole(input.actorRoleName);
  const operationalRoles =
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles.map(
      normalized,
    );
  if (!operationalRoles.includes(actorRole)) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_ASSESSOR_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  const assessment = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: assessmentSelect,
  });
  if (!assessment) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_ASSESSMENT_NOT_FOUND", 404);
  }
  if (
    assessment.assessorUserId !== actorUserId ||
    normalized(assessment.status) !==
      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.requiredAssessmentStatus
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_FINALIZED_OWNER_REQUIRED", 409, {
      assessmentId,
      status: normalized(assessment.status),
    });
  }
  if (assessment.revision === 1 && !assessment.priorAssessmentId) {
    return { kind: "NOT_REQUIRED", assessment };
  }

  const now = input.now ?? new Date();
  const assessorAssignments =
    await database.governanceOfficerAssignment.findMany({
      where: { userId: actorUserId },
      select: assignmentSelect,
    });
  const exactAssessorAssignments = assessorAssignments.filter(
    (assignment) =>
      assignment.id === assessment.assessorAssignmentId &&
      assignment.userId === actorUserId &&
      effectiveRole(assignment.role) === actorRole &&
      assignmentWindowIsActive(assignment, now),
  );
  if (exactAssessorAssignments.length !== 1) {
    fail(
      "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_ASSESSOR_ASSIGNMENT_INVALID",
      403,
      { activeAssignments: exactAssessorAssignments.length },
    );
  }

  if (
    assessment.revision <
      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.minimumCorrectionRevision ||
    !assessment.priorAssessmentId
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_REVISION_CHAIN_INVALID", 409);
  }

  const sourceAssessment = await database.appraisalAssessment.findUnique({
    where: { id: assessment.priorAssessmentId },
    select: assessmentSelect,
  });
  if (
    !sourceAssessment ||
    normalized(sourceAssessment.status) !==
      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.requiredSourceAssessmentStatus ||
    sourceAssessment.cycleId !== assessment.cycleId ||
    sourceAssessment.revision + 1 !== assessment.revision ||
    sourceAssessment.assessorUserId !== assessment.assessorUserId ||
    sourceAssessment.assessorAssignmentId !== assessment.assessorAssignmentId ||
    sourceAssessment.instrumentVersionId !== assessment.instrumentVersionId ||
    !isSha256(sourceAssessment.assessmentHash)
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_SOURCE_ASSESSMENT_INVALID", 409);
  }

  const metadata = objectValue(assessment.metadata);
  const returnReviewId = requireIdentifier(metadata.returnReviewId, "returnReviewId");
  const sourceReview = await database.appraisalReview.findUnique({
    where: { id: returnReviewId },
    select: reviewSelect,
  });
  const sourceReviews = await database.appraisalReview.findMany({
    where: { assessmentId: sourceAssessment.id },
    select: reviewSelect,
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
  const latestSourceReview = [...sourceReviews]
    .sort(
      (left, right) =>
        left.stage - right.stage ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .at(-1);
  if (
    !sourceReview ||
    !latestSourceReview ||
    sourceReview.cycleId !== assessment.cycleId ||
    sourceReview.assessmentId !== sourceAssessment.id ||
    normalized(sourceReview.decision) !==
      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.sourceReviewDecision ||
    !sourceReview.decidedAt ||
    !sourceReview.reviewerAssignmentId ||
    clean(sourceReview.note).length < 3
  ) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_SOURCE_REVIEW_INVALID", 409);
  }
  if (latestSourceReview.id !== sourceReview.id) {
    fail(
      "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_SOURCE_REVIEW_NOT_LATEST",
      409,
      {
        sourceReviewId: sourceReview.id,
        latestReviewId: latestSourceReview.id,
      },
    );
  }

  const sourceReviewMetadata = objectValue(sourceReview.metadata);
  const sourceAssessmentMetadata = objectValue(sourceAssessment.metadata);
  if (
    !Number.isInteger(sourceReview.stage) ||
    sourceReview.stage < 1 ||
    normalized(sourceReviewMetadata.decision) !== "RETURN" ||
    !isSha256(sourceReviewMetadata.decisionContractHash) ||
    !isSha256(sourceReviewMetadata.decisionRequestHash) ||
    sourceReviewMetadata.releasePerformed !== false ||
    sourceReviewMetadata.scoreMutationPerformed !== false ||
    sourceReviewMetadata.respondentIdentitiesAccessed !== false ||
    sourceReviewMetadata.individualStaffResponsesAccessed !== false ||
    sourceReviewMetadata.providerCalled !== false ||
    clean(sourceAssessmentMetadata.returnedByDirectorReviewId) !==
      sourceReview.id ||
    Number(sourceAssessmentMetadata.returnedByDirectorReviewStage) !==
      sourceReview.stage ||
    clean(sourceAssessmentMetadata.returnDecisionContractHash).toLowerCase() !==
      clean(sourceReviewMetadata.decisionContractHash).toLowerCase() ||
    clean(sourceAssessmentMetadata.returnDecisionRequestHash).toLowerCase() !==
      clean(sourceReviewMetadata.decisionRequestHash).toLowerCase()
  ) {
    fail(
      "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_DIRECTOR_RETURN_PROVENANCE_INVALID",
      409,
    );
  }

  const returnEvidenceHash = assertContinuationMetadata({
    metadata: assessment.metadata,
    sourceAssessment,
    sourceReview,
    assessmentRevision: assessment.revision,
  });

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: assessment.cycleId },
    select: cycleSelect,
  });
  if (!cycle) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_CYCLE_NOT_FOUND", 404);
  }
  assertCycleContract(cycle);
  if (
    normalized(cycle.status) !==
      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.requiredCycleStatus ||
    !cycle.reviewStartedAt
  ) {
    fail(
      "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_CYCLE_NOT_UNDER_REVIEW",
      409,
      { cycleStatus: normalized(cycle.status) },
    );
  }
  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );
  const governanceScope: HeadteacherFeedbackGovernanceScope = {
    isSuperAdmin: false,
    tenantIds: [targetTenantId],
  };

  const dependencies = input.dependencies ?? {
    readAggregateReadiness: readHeadteacherFeedbackAggregateReadiness,
  };
  const readiness = directorReadiness(
    await dependencies.readAggregateReadiness({
      actorUserId: sourceReview.reviewerUserId,
      actorRoleName: HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewerRole,
      cycleId: assessment.cycleId,
      governanceScope,
      database:
        database as unknown as HeadteacherFeedbackAggregateReadinessDatabase,
    }),
    "UNDER_REVIEW",
  );

  return {
    kind: "REQUIRED",
    assessment,
    sourceAssessment,
    sourceReview,
    readiness,
    governanceScope,
    returnEvidenceHash,
  };
}

function isUniqueViolation(error: unknown) {
  const candidate = error as { code?: unknown };
  return clean(candidate?.code) === "P2002";
}

async function runStart(
  input: StartHeadteacherDirectorReviewInput,
  database: HeadteacherDirectorReviewDatabase,
  allowCreate: boolean,
  options: HeadteacherDirectorRunStartOptions = {},
): Promise<HeadteacherDirectorRunStartResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);
  const now = input.now ?? new Date();
  const reqId = clean(input.reqId) || randomUUID();

  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_CONFIRMATION_REQUIRED", 400);
  }
  if (actorRole !== HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewerRole) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_ROLE_FORBIDDEN", 403, { actorRole });
  }
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  );
  assertHeadteacherFeedbackInstrumentReady();

  return database.$transaction(
    async (tx) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: cycleSelect,
      });
      if (!cycle) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_NOT_FOUND", 404);
      }
      assertCycleContract(cycle);

      const cycleStatus = normalized(cycle.status);
      if (!["CLOSED", "UNDER_REVIEW"].includes(cycleStatus)) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_NOT_READY", 409, { cycleStatus });
      }
      if (cycleStatus === "CLOSED" && cycle.reviewStartedAt) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_START_TIMESTAMP_DRIFT", 409);
      }
      if (cycleStatus === "UNDER_REVIEW" && !cycle.reviewStartedAt) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_START_TIMESTAMP_MISSING", 409);
      }

      const targetTenantId = requireIdentifier(cycle.targetTenantId, "targetTenantId");
      assertHeadteacherFeedbackTargetInGovernanceScope({
        governanceScope: input.governanceScope,
        targetTenantId,
      });

      const membership = await tx.membership.findFirst({
        where: {
          userId: cycle.targetUserId,
          tenantId: targetTenantId,
          status: "ACTIVE",
          role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
          tenant: { status: "ACTIVE" },
        },
        select: membershipSelect,
      });
      assertTargetMembership(cycle, membership);

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: { userId: actorUserId },
        select: assignmentSelect,
      });
      const assignment = resolveDirectorAssignment({
        assignments,
        actorUserId,
        scopeZoneId: cycle.scopeZoneId,
        now,
      });
      if (
        options.requiredReviewerAssignmentId &&
        assignment.id !== options.requiredReviewerAssignmentId
      ) {
        fail(
          "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_REVIEWER_ASSIGNMENT_DRIFT",
          409,
        );
      }

      const readiness = directorReadiness(
        options.precomputedReadiness ??
          (await readHeadteacherFeedbackAggregateReadiness({
            actorUserId,
            actorRoleName: actorRole,
            cycleId,
            governanceScope: input.governanceScope,
            database:
              tx as unknown as HeadteacherFeedbackAggregateReadinessDatabase,
          })),
        cycleStatus === "CLOSED" ? "READY_FOR_REVIEW" : "UNDER_REVIEW",
      );

      const assessments = await tx.appraisalAssessment.findMany({
        where: { cycleId },
        select: assessmentSelect,
        orderBy: [{ createdAt: "asc" }, { revision: "asc" }],
      });
      const assessment = currentFinalizedAssessment(assessments);
      if (assessment.cycleId !== cycle.id) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_ASSESSMENT_CYCLE_DRIFT", 409);
      }
      if (
        options.requiredAssessmentId &&
        assessment.id !== options.requiredAssessmentId
      ) {
        fail(
          "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_CURRENT_ASSESSMENT_DRIFT",
          409,
          {
            expectedAssessmentId: options.requiredAssessmentId,
            currentAssessmentId: assessment.id,
          },
        );
      }
      const verified = verifySupervisoryAssessment(assessment);
      const admission = options.continuation
        ? correctionAdmissionContext(
            assessment,
            cycle,
            options.continuation,
          )
        : await resolveInitialDirectorAdmission({
            tx,
            cycle,
            assessment,
            actorUserId,
            now,
          });
      const evidence = reviewEvidence({
        readiness,
        assessment,
        assessmentHash: verified.assessmentHash,
        actorUserId,
      });
      const evidenceHash = reviewEvidenceHash({
        cycleId,
        reviewerUserId: actorUserId,
        reviewerAssignmentId: assignment.id,
        evidence,
        admission,
      });

      const existing = await tx.appraisalReview.findUnique({
        where: {
          assessmentId_stage: {
            assessmentId: assessment.id,
            stage: admission.reviewStage,
          },
        },
        select: reviewSelect,
      });

      if (cycleStatus === "UNDER_REVIEW" && existing) {
        const result = existingReviewResult({
          cycle,
          review: existing,
          actorUserId,
          assignmentId: assignment.id,
          evidence,
          expectedEvidenceHash: evidenceHash,
          admission,
        });
        if (options.continuation) {
          assertExistingContinuationMetadata(existing, options.continuation);
        }
        return result;
      }

      const mayCreateUnderReview =
        options.allowUnderReviewCreate === true ||
        admission.kind === "HOS_FORWARDED_STAGE_2";
      if (cycleStatus === "UNDER_REVIEW" && !mayCreateUnderReview) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_RECORD_MISSING", 409);
      }
      if (cycleStatus === "CLOSED" && existing) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PREMATURE_RECORD", 409);
      }
      if (!allowCreate) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_CONCURRENT_STATE_NOT_VISIBLE", 409);
      }

      const metadata = {
        ...reviewMetadata({
          evidence,
          reviewEvidenceHash: evidenceHash,
          admission,
        }),
        ...(options.continuation
          ? {
              continuationSchemaVersion:
                HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.schemaVersion,
              continuationType: "CORRECTED_ASSESSMENT",
              continuedFromAssessmentId: options.continuation.sourceAssessmentId,
              continuedFromAssessmentRevision:
                options.continuation.sourceAssessmentRevision,
              continuedFromReviewId: options.continuation.sourceReviewId,
              continuedFromReviewStage: options.continuation.sourceReviewStage,
              returnEvidenceHash: options.continuation.returnEvidenceHash,
              preserveSourceReviewStage: true,
              scoreMutationPerformed: false,
            }
          : {}),
      };
      const review = await tx.appraisalReview.create({
        data: {
          cycleId,
          assessmentId: assessment.id,
          reviewerUserId: actorUserId,
          reviewerAssignmentId: assignment.id,
          stage: admission.reviewStage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata,
        },
        select: reviewSelect,
      });

      const effectiveReviewStartedAt =
        cycleStatus === "UNDER_REVIEW" ? cycle.reviewStartedAt! : now;
      const cycleMetadata = objectValue(cycle.metadata);
      const hosReviewMetadata = objectValue(cycleMetadata.headteacherSupervisoryReview);
      const updatedCycle = await tx.appraisalCycle.update({
        where: { id: cycleId },
        data: {
          status: "UNDER_REVIEW",
          reviewStartedAt: effectiveReviewStartedAt,
          metadata: {
            ...cycleMetadata,
            ...(admission.kind === "HOS_FORWARDED_STAGE_2"
              ? {
                  headteacherSupervisoryReview: {
                    ...hosReviewMetadata,
                    state: "DIRECTOR_REVIEW_PENDING",
                    awaitingDirectorAdmission: false,
                    directorReviewCreated: true,
                    directorReviewId: review.id,
                    directorReviewStage: 2,
                    directorAdmittedAt: now.toISOString(),
                  },
                }
              : {}),
            directorReview: {
              schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
              reviewId: review.id,
              reviewStage: admission.reviewStage,
              reviewEvidenceHash: evidenceHash,
              admissionType:
                admission.kind === "HOS_FORWARDED_STAGE_2"
                  ? "HOS_FORWARDED"
                  : admission.kind === "HOS_AUTHORED_STAGE_1"
                    ? "HOS_AUTHORED"
                    : "CORRECTED_ASSESSMENT",
              ...(admission.kind === "HOS_FORWARDED_STAGE_2"
                ? {
                    admittedFromReviewId: admission.hosForward.reviewId,
                    admittedFromReviewStage: 1,
                    admittedFromReviewerRole: "HEAD_OF_SUPERVISION",
                    admittedFromReviewEvidenceHash:
                      admission.hosForward.reviewEvidenceHash,
                    admittedFromDecisionRequestHash:
                      admission.hosForward.decisionRequestHash,
                    admittedFromDecisionEvidenceHash:
                      admission.hosForward.decisionEvidenceHash,
                    hosForwardVerified: true,
                  }
                : {}),
              staffFeedbackSnapshotId: evidence.staffFeedback.snapshotId,
              staffFeedbackSourceHash: evidence.staffFeedback.sourceHash,
              supervisoryAssessmentId:
                evidence.supervisoryAssessment.assessmentId,
              supervisoryAssessmentHash:
                evidence.supervisoryAssessment.assessmentHash,
              separateEvidenceStreams: true,
              combinedWeightingDefined: false,
              respondentIdentitiesAccessed: false,
              reviewerMayRewriteScores: false,
              ...(options.continuation
                ? {
                    continuationSchemaVersion:
                      HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.schemaVersion,
                    continuationType: "CORRECTED_ASSESSMENT",
                    continuedFromAssessmentId:
                      options.continuation.sourceAssessmentId,
                    continuedFromAssessmentRevision:
                      options.continuation.sourceAssessmentRevision,
                    continuedFromReviewId: options.continuation.sourceReviewId,
                    continuedFromReviewStage:
                      options.continuation.sourceReviewStage,
                    returnEvidenceHash: options.continuation.returnEvidenceHash,
                    preserveSourceReviewStage: true,
                    scoreMutationPerformed: false,
                    providerCalled: false,
                  }
                : {}),
            },
          },
        },
        select: {
          id: true,
          status: true,
          reviewStartedAt: true,
          metadata: true,
        },
      });
      if (
        normalized(updatedCycle.status) !== "UNDER_REVIEW" ||
        !updatedCycle.reviewStartedAt
      ) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_UPDATE_FAILED", 409);
      }

      const auditAction = options.continuation
        ? CORRECTION_REVIEW_CONTINUED_AUDIT_ACTION
        : REVIEW_STARTED_AUDIT_ACTION;
      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: options.auditActorUserId ?? actorUserId,
          action: auditAction,
          resource: options.continuation ? "AppraisalReview" : "AppraisalCycle",
          resourceId: options.continuation ? review.id : cycleId,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: auditAction,
            workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
            cycleId,
            reviewId: review.id,
            reviewStage: admission.reviewStage,
            admissionType:
              admission.kind === "HOS_FORWARDED_STAGE_2"
                ? "HOS_FORWARDED"
                : admission.kind === "HOS_AUTHORED_STAGE_1"
                  ? "HOS_AUTHORED"
                  : "CORRECTED_ASSESSMENT",
            ...(admission.kind === "HOS_FORWARDED_STAGE_2"
              ? {
                  sourceHosReviewId: admission.hosForward.reviewId,
                  sourceHosReviewStage: 1,
                  sourceHosReviewEvidenceHash:
                    admission.hosForward.reviewEvidenceHash,
                  sourceHosDecisionRequestHash:
                    admission.hosForward.decisionRequestHash,
                  sourceHosDecisionEvidenceHash:
                    admission.hosForward.decisionEvidenceHash,
                }
              : {}),
            reviewerAssignmentId: assignment.id,
            staffFeedbackSnapshotId: evidence.staffFeedback.snapshotId,
            staffFeedbackSourceHash: evidence.staffFeedback.sourceHash,
            finalizedStaffResponses: evidence.staffFeedback.finalizedResponses,
            supervisoryAssessmentId:
              evidence.supervisoryAssessment.assessmentId,
            supervisoryAssessmentRevision:
              evidence.supervisoryAssessment.revision,
            supervisoryAssessmentHash:
              evidence.supervisoryAssessment.assessmentHash,
            directorAuthoredAssessment: false,
            reviewEvidenceHash: evidenceHash,
            ...(options.continuation
              ? {
                  continuationType: "CORRECTED_ASSESSMENT",
                  sourceAssessmentId: options.continuation.sourceAssessmentId,
                  sourceAssessmentRevision:
                    options.continuation.sourceAssessmentRevision,
                  sourceReturnReviewId: options.continuation.sourceReviewId,
                  sourceReturnReviewStage: options.continuation.sourceReviewStage,
                  returnEvidenceHash: options.continuation.returnEvidenceHash,
                  preserveSourceReviewStage: true,
                  scoreMutationPerformed: false,
                }
              : {}),
            separateEvidenceStreams: true,
            combinedWeightingDefined: false,
            scoreValuesIncluded: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "STARTED",
        cycleId,
        cycleStatus: "UNDER_REVIEW",
        reviewId: review.id,
        reviewStage: admission.reviewStage,
        reviewDecision: "PENDING",
        reviewerUserId: actorUserId,
        reviewerAssignmentId: assignment.id,
        reviewStartedAt: updatedCycle.reviewStartedAt.toISOString(),
        reviewEvidenceHash: evidenceHash,
        evidence,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_DIRECTOR_REVIEW_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_DIRECTOR_REVIEW_POLICY.transactionTimeoutMs,
    },
  );
}

function initialReviewStartResult(
  result: HeadteacherDirectorRunStartResult,
): StartHeadteacherDirectorReviewResult {
  if (result.reviewStage !== 1 && result.reviewStage !== 2) {
    fail("HEADTEACHER_DIRECTOR_REVIEW_INITIAL_STAGE_INVALID", 409, {
      reviewStage: result.reviewStage,
    });
  }
  return {
    ...result,
    reviewStage: result.reviewStage,
  };
}

export async function startHeadteacherDirectorReview(
  input: StartHeadteacherDirectorReviewInput,
): Promise<StartHeadteacherDirectorReviewResult> {
  const database =
    input.database ?? (prisma as unknown as HeadteacherDirectorReviewDatabase);
  try {
    return initialReviewStartResult(await runStart(input, database, true));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return initialReviewStartResult(await runStart(input, database, false));
  }
}

export async function ensureHeadteacherDirectorCorrectionReviewContinuation(
  input: EnsureHeadteacherDirectorCorrectionReviewContinuationInput,
): Promise<EnsureHeadteacherDirectorCorrectionReviewContinuationResult> {
  const database =
    input.database ?? (prisma as unknown as HeadteacherDirectorReviewDatabase);
  const context = await readCorrectionContinuationContext(input, database);

  if (context.kind === "NOT_REQUIRED") {
    return {
      outcome: "NOT_REQUIRED",
      continuationRequired: false,
      cycleId: context.assessment.cycleId,
      assessmentId: context.assessment.id,
      assessmentRevision: context.assessment.revision,
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
      providerCalled: false,
    };
  }

  const sourceReviewAssignmentId = requireIdentifier(
    context.sourceReview.reviewerAssignmentId,
    "reviewerAssignmentId",
  );
  const startInput: StartHeadteacherDirectorReviewInput = {
    actorUserId: context.sourceReview.reviewerUserId,
    actorRoleName: HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewerRole,
    cycleId: context.assessment.cycleId,
    confirm: true,
    governanceScope: context.governanceScope,
    reqId: input.reqId,
    ip: input.ip,
    userAgent: input.userAgent,
    now: input.now,
    database,
  };
  const options: HeadteacherDirectorRunStartOptions = {
    allowUnderReviewCreate: true,
    requiredAssessmentId: context.assessment.id,
    requiredReviewerAssignmentId: sourceReviewAssignmentId,
    auditActorUserId: input.actorUserId,
    precomputedReadiness: context.readiness,
    continuation: {
      sourceAssessmentId: context.sourceAssessment.id,
      sourceAssessmentRevision: context.sourceAssessment.revision,
      sourceReviewId: context.sourceReview.id,
      sourceReviewStage: context.sourceReview.stage,
      returnEvidenceHash: context.returnEvidenceHash,
    },
  };

  let result: HeadteacherDirectorRunStartResult;
  try {
    result = await runStart(startInput, database, true, options);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    result = await runStart(startInput, database, false, options);
  }

  return {
    outcome: result.outcome === "STARTED" ? "CREATED" : "EXISTING_REVIEW",
    continuationRequired: true,
    cycleId: result.cycleId,
    assessmentId: context.assessment.id,
    assessmentRevision: context.assessment.revision,
    assessmentStatus: "FINALIZED",
    sourceAssessmentId: context.sourceAssessment.id,
    sourceReviewId: context.sourceReview.id,
    sourceReviewStage: context.sourceReview.stage,
    reviewId: result.reviewId,
    reviewStage: result.reviewStage,
    reviewDecision: result.reviewDecision,
    reviewerUserId: result.reviewerUserId,
    reviewerAssignmentId: result.reviewerAssignmentId,
    reviewEvidenceHash: result.reviewEvidenceHash,
    reviewCreated: result.outcome === "STARTED",
    scoreMutationPerformed: false,
    providerCalled: false,
  };
}
