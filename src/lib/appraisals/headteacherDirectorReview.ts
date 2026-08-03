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
  inspectHeadteacherSupervisoryInstrument,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_REVIEW_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  reviewStage: 1,
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
  explicitConfirmationRequired: true,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

const REVIEW_STARTED_AUDIT_ACTION =
  "HEADTEACHER_APPRAISAL_DIRECTOR_REVIEW_STARTED";

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
  reviewStage: 1;
  reviewDecision: "PENDING";
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewStartedAt: string;
  reviewEvidenceHash: string;
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
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
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
  appraisalReview: AppraisalReviewDelegate;
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherDirectorReviewDatabase = {
  appraisalReview: AppraisalReviewDelegate;
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

function reviewMetadata(input: {
  evidence: HeadteacherDirectorReviewEvidenceReadiness;
  reviewEvidenceHash: string;
}) {
  return {
    schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
    reviewStage: HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewStage,
    reviewEvidenceHash: input.reviewEvidenceHash,
    evidence: input.evidence,
    directorAuthoredAssessmentNeedsSeparateReviewer:
      HEADTEACHER_DIRECTOR_REVIEW_POLICY
        .directorAuthoredAssessmentNeedsSeparateReviewer,
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
    input.review.stage !== 1 ||
    normalized(input.review.decision) !== "PENDING" ||
    clean(input.review.note) ||
    input.review.decidedAt ||
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
  return {
    outcome: "EXISTING_REVIEW" as const,
    cycleId: input.cycle.id,
    cycleStatus: "UNDER_REVIEW" as const,
    reviewId: input.review.id,
    reviewStage: 1 as const,
    reviewDecision: "PENDING" as const,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    reviewStartedAt: input.cycle.reviewStartedAt!.toISOString(),
    reviewEvidenceHash: input.expectedEvidenceHash,
    evidence: input.evidence,
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
): Promise<StartHeadteacherDirectorReviewResult> {
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
    {
      actorUserId,
      roleName: actorRole,
    },
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
        fail("HEADTEACHER_DIRECTOR_REVIEW_CYCLE_NOT_READY", 409, {
          cycleStatus,
        });
      }
      if (cycleStatus === "CLOSED" && cycle.reviewStartedAt) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_START_TIMESTAMP_DRIFT", 409);
      }
      if (cycleStatus === "UNDER_REVIEW" && !cycle.reviewStartedAt) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_START_TIMESTAMP_MISSING", 409);
      }

      const targetTenantId = requireIdentifier(
        cycle.targetTenantId,
        "targetTenantId",
      );
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

      const readiness = directorReadiness(
        await readHeadteacherFeedbackAggregateReadiness({
          actorUserId,
          actorRoleName: actorRole,
          cycleId,
          governanceScope: input.governanceScope,
          database:
            tx as unknown as HeadteacherFeedbackAggregateReadinessDatabase,
        }),
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
      const verified = verifySupervisoryAssessment(assessment);
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
      });

      const existing = await tx.appraisalReview.findUnique({
        where: {
          assessmentId_stage: {
            assessmentId: assessment.id,
            stage: HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewStage,
          },
        },
        select: reviewSelect,
      });

      if (cycleStatus === "UNDER_REVIEW") {
        if (!existing) {
          fail("HEADTEACHER_DIRECTOR_REVIEW_RECORD_MISSING", 409);
        }
        return existingReviewResult({
          cycle,
          review: existing,
          actorUserId,
          assignmentId: assignment.id,
          evidence,
          expectedEvidenceHash: evidenceHash,
        });
      }

      if (existing) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_PREMATURE_RECORD", 409);
      }
      if (!allowCreate) {
        fail("HEADTEACHER_DIRECTOR_REVIEW_CONCURRENT_STATE_NOT_VISIBLE", 409);
      }

      const metadata = reviewMetadata({
        evidence,
        reviewEvidenceHash: evidenceHash,
      });
      const review = await tx.appraisalReview.create({
        data: {
          cycleId,
          assessmentId: assessment.id,
          reviewerUserId: actorUserId,
          reviewerAssignmentId: assignment.id,
          stage: HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewStage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata,
        },
        select: reviewSelect,
      });

      const updatedCycle = await tx.appraisalCycle.update({
        where: { id: cycleId },
        data: {
          status: "UNDER_REVIEW",
          reviewStartedAt: now,
          metadata: {
            ...objectValue(cycle.metadata),
            directorReview: {
              schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
              reviewId: review.id,
              reviewStage: 1,
              reviewEvidenceHash: evidenceHash,
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

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: actorUserId,
          action: REVIEW_STARTED_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycleId,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: REVIEW_STARTED_AUDIT_ACTION,
            workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
            cycleId,
            reviewId: review.id,
            reviewStage: 1,
            reviewerAssignmentId: assignment.id,
            staffFeedbackSnapshotId: evidence.staffFeedback.snapshotId,
            staffFeedbackSourceHash: evidence.staffFeedback.sourceHash,
            finalizedStaffResponses:
              evidence.staffFeedback.finalizedResponses,
            supervisoryAssessmentId:
              evidence.supervisoryAssessment.assessmentId,
            supervisoryAssessmentRevision:
              evidence.supervisoryAssessment.revision,
            supervisoryAssessmentHash:
              evidence.supervisoryAssessment.assessmentHash,
            directorAuthoredAssessment:
              evidence.supervisoryAssessment.directorAuthored,
            reviewEvidenceHash: evidenceHash,
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
        reviewStage: 1,
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

export async function startHeadteacherDirectorReview(
  input: StartHeadteacherDirectorReviewInput,
): Promise<StartHeadteacherDirectorReviewResult> {
  const database =
    input.database ?? (prisma as unknown as HeadteacherDirectorReviewDatabase);
  try {
    return await runStart(input, database, true);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return runStart(input, database, false);
  }
}
