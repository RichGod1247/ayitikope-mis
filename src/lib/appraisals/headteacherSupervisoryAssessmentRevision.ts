//src/lib/appraisals/headteacherSupervisoryAssessmentRevision.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
  decideHeadteacherSupervisoryAssessmentAuthority,
  planReturnedHeadteacherSupervisoryRevision,
  type HeadteacherSupervisoryGovernanceAssignment,
  type HeadteacherSupervisoryTarget,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";

export const HEADTEACHER_SUPERVISORY_REVISION_POLICY = {
  schemaVersion: 1,
  revisionEvidenceSchemaVersion: 1,
  eligibleCycleStatus: "UNDER_REVIEW",
  returnedStatus: "RETURNED",
  supersededStatus: "SUPERSEDED",
  newRevisionStatus: "DRAFT",
  returnDecision: "RETURNED",
  preserveVisitContext: true,
  preserveVisitDetailsMetadata: true,
  copyScoreRows: true,
  commentsAllowed: false,
  finalizedSourceImmutable: true,
  reviewerMayRewriteScores: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 25_000,
  revisionSourceReadMode: "OUTSIDE_WRITE_TRANSACTION",
  writeTransactionFullSourceRead: false,
  writeTransactionCurrentAuthorityRevalidated: true,
  directorReturnRevisionAdmission: true,
  directorReturnCorrectionAssessorRole: "HEAD_OF_SUPERVISION",
  directorReturnHosAuthoredOnly: true,
  directorReturnCarrierStatusMutationRequired: false,
  directorReturnCarrierTimestampMutationRequired: false,
} as const;

const SUPERVISORY_REVISION_CREATED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_ASSESSMENT_REVISION_CREATED";

type AssessorLifecycleStateCode =
  | "DRAFT"
  | "REVISION_DRAFT"
  | "FINALIZED_READ_ONLY"
  | "REVISION_FINALIZED_READ_ONLY"
  | "RETURNED_REVISION_REQUIRED"
  | "SUPERSEDED_READ_ONLY"
  | "RELEASED_READ_ONLY"
  | "CANCELLED_READ_ONLY";

export type CreateReturnedHeadteacherSupervisoryRevisionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  returnedAssessmentId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryRevisionDatabase;
};

export type ReadHeadteacherSupervisoryAssessorStateInput = {
  actorUserId: string;
  assessmentId: string;
  database?: Pick<HeadteacherSupervisoryRevisionDatabase, "appraisalAssessment">;
};

export type HeadteacherSupervisoryAssessorReadState = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  status: AppraisalAssessmentStatus;
  state: AssessorLifecycleStateCode;
  label: string;
  description: string;
  readOnly: boolean;
  canEdit: boolean;
  canFinalize: boolean;
  canCreateRevision: boolean;
  finalizationReadinessIncluded: false;
  priorAssessmentId: string | null;
  successorAssessmentId: string | null;
  returnReason: string | null;
  scoresIncluded: false;
  percentagesIncluded: false;
  reviewerIdentityIncluded: false;
  providerCalled: false;
};

export type HeadteacherSupervisoryRevisionSummary = {
  id: string;
  cycleId: string;
  status: AppraisalAssessmentStatus;
  revision: number;
  priorAssessmentId: string;
  assessorUserId: string;
  assessorAssignmentId: string;
  targetUserId: string;
  targetTenantId: string;
  instrumentVersionId: string;
  dateObserved: string;
  visitContextHash: string;
  sourceAssessmentHash: string;
  returnEvidenceHash: string;
  copiedScoreCount: number;
  createdAt: string;
  providerCalled: false;
};

export type CreateReturnedHeadteacherSupervisoryRevisionResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  originalAssessmentId: string;
  originalStatus: "SUPERSEDED";
  revision: HeadteacherSupervisoryRevisionSummary;
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
  createdAt: Date;
  scores: AssessmentScoreRecord[];
  reviews: ReviewRecord[];
  cycle: {
    id: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
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

type AssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  zoneId: string;
  zone: {
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

type AssessmentDelegate = {
  findUnique(args: unknown): Promise<AssessmentRecord | null>;
  create(args: unknown): Promise<AssessmentRecord>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

export type HeadteacherSupervisoryRevisionTransactionClient = {
  appraisalAssessment: AssessmentDelegate;
  appraisalAssessmentScore: {
    createMany(args: unknown): Promise<{ count: number }>;
  };
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryRevisionDatabase = {
  appraisalAssessment: AssessmentDelegate;
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  $transaction<T>(
    operation: (tx: HeadteacherSupervisoryRevisionTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

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
  createdAt: true,
  scores: {
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
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
  },
  reviews: {
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
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
  },
  cycle: {
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
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
        orderBy: { order: "asc" },
        select: {
          id: true,
          key: true,
          title: true,
          description: true,
          order: true,
          maxScore: true,
          items: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              key: true,
              label: true,
              order: true,
              maxScore: true,
              isRequired: true,
            },
          },
        },
      },
    },
  },
} as const;

export class HeadteacherSupervisoryRevisionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "HeadteacherSupervisoryRevisionError";
  }
}

function fail(code: string, status = 409, details?: Record<string, unknown>): never {
  throw new HeadteacherSupervisoryRevisionError(code, status, details);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireIdentifier(value: unknown, fieldName: string) {
  const result = clean(value);
  if (!result) fail(`HEADTEACHER_SUPERVISORY_REVISION_${fieldName.toUpperCase()}_REQUIRED`, 400);
  return result;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_INVALID_CURRENT_TIME", 400);
  }
  return now;
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
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

function sectionPercentageMap(value: unknown) {
  const source = objectValue(value);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, candidate]) => candidate == null || typeof candidate === "number")
      .map(([key, candidate]) => [key, candidate as number | null]),
  );
}

function reviewerScoreEditsPresent(value: unknown) {
  const record = objectValue(value);
  return ["scoreEdits", "scores", "itemScores", "sectionScores"].some((key) => {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.length > 0;
    if (candidate && typeof candidate === "object") {
      return Object.keys(candidate as Record<string, unknown>).length > 0;
    }
    return candidate != null && clean(candidate) !== "";
  });
}

function latestReturnedReview(record: AssessmentRecord) {
  const reviews = [...record.reviews].sort(
    (left, right) => left.stage - right.stage || left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const latest = reviews.at(-1);
  if (
    !latest ||
    latest.assessmentId !== record.id ||
    latest.cycleId !== record.cycleId ||
    normalized(latest.decision) !== HEADTEACHER_SUPERVISORY_REVISION_POLICY.returnDecision ||
    !latest.decidedAt ||
    clean(latest.note).length < 3
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_RETURN_REVIEW_REQUIRED", 409);
  }
  if (reviewerScoreEditsPresent(latest.metadata)) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_REVIEWER_SCORE_REWRITE_FORBIDDEN", 409);
  }
  return latest;
}

function assertCycleBoundary(record: AssessmentRecord) {
  if (
    normalized(record.cycle.status) !==
      HEADTEACHER_SUPERVISORY_REVISION_POLICY.eligibleCycleStatus ||
    !record.cycle.openedAt ||
    !record.cycle.closedAt ||
    !record.cycle.reviewStartedAt ||
    record.cycle.releasedAt ||
    record.cycle.cancelledAt
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_CYCLE_NOT_UNDER_REVIEW", 409, {
      cycleStatus: normalized(record.cycle.status),
    });
  }
}

type ReturnedRevisionAdmission =
  | {
      mode: "LEGACY_UNDER_REVIEW_RETURN";
      review: ReviewRecord;
      decisionContractHash: null;
      decisionRequestHash: null;
    }
  | {
      mode: "DIRECTOR_GOVERNANCE_RETURN";
      review: ReviewRecord;
      decisionContractHash: string;
      decisionRequestHash: string;
    };

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/i.test(clean(value));
}

function directorReturnDecisionContractHash(
  record: AssessmentRecord,
  review: ReviewRecord,
) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    reviewId: review.id,
    reviewStage: review.stage,
    assessmentId: record.id,
    assessmentRevision: record.revision,
    action: "RETURN",
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
    combinedWeightingDefined: false,
  });
}

function directorReturnDecisionRequestHash(input: {
  record: AssessmentRecord;
  review: ReviewRecord;
  contractHash: string;
}) {
  const metadata = objectValue(input.review.metadata);
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.record.id,
    assessmentRevision: input.record.revision,
    assessmentHash: clean(input.record.assessmentHash).toLowerCase(),
    reviewEvidenceHash: clean(metadata.reviewEvidenceHash).toLowerCase(),
    decisionContractHash: input.contractHash,
    action: "RETURN",
    note: clean(input.review.note) || null,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
  });
}

function directorGovernanceReturnAdmission(
  record: AssessmentRecord,
  review: ReviewRecord,
): ReturnedRevisionAdmission | null {
  const assessmentMetadata = objectValue(record.metadata);
  const reviewMetadata = objectValue(review.metadata);
  const cycleReview = objectValue(
    objectValue(record.cycle.metadata).directorGovernanceReview,
  );

  const hasDirectorReturnMarker =
    Boolean(clean(assessmentMetadata.returnedByDirectorReviewId)) ||
    clean(reviewMetadata.reviewType) === "DIRECTOR_GOVERNANCE_REVIEW" ||
    clean(cycleReview.state) === "RETURNED_FOR_CORRECTION";

  if (!hasDirectorReturnMarker) return null;

  const evidenceAssessor = objectValue(
    objectValue(record.evidenceSnapshotJson).assessor,
  );
  const evidenceAssessorRole = canonicalHeadteacherSupervisoryAssessorRole(
    clean(evidenceAssessor.role) || clean(evidenceAssessor.assignmentRole),
  );
  const reviewAssessorRole = canonicalHeadteacherSupervisoryAssessorRole(
    reviewMetadata.assessorRole,
  );

  if (
    evidenceAssessorRole !==
      HEADTEACHER_SUPERVISORY_REVISION_POLICY.directorReturnCorrectionAssessorRole ||
    reviewAssessorRole !==
      HEADTEACHER_SUPERVISORY_REVISION_POLICY.directorReturnCorrectionAssessorRole
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVISION_DIRECTOR_RETURN_AUTHORSHIP_FORBIDDEN",
      409,
      {
        evidenceAssessorRole,
        reviewAssessorRole,
        requiredAssessorRole:
          HEADTEACHER_SUPERVISORY_REVISION_POLICY.directorReturnCorrectionAssessorRole,
      },
    );
  }

  const reviewEvidenceHash = clean(reviewMetadata.reviewEvidenceHash).toLowerCase();
  const storedContractHash = clean(reviewMetadata.decisionContractHash).toLowerCase();
  const storedRequestHash = clean(reviewMetadata.decisionRequestHash).toLowerCase();
  const expectedContractHash = directorReturnDecisionContractHash(record, review);
  const expectedRequestHash = directorReturnDecisionRequestHash({
    record,
    review,
    contractHash: expectedContractHash,
  });
  const decidedAt = review.decidedAt?.toISOString() ?? null;
  const note = clean(review.note);
  const carrierStatus = normalized(record.cycle.status);

  if (
    !record.cycle.openedAt ||
    record.cycle.cancelledAt ||
    carrierStatus === "CANCELLED"
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVISION_DIRECTOR_RETURN_CARRIER_INVALID",
      409,
      { cycleStatus: carrierStatus },
    );
  }

  if (
    review.assessmentId !== record.id ||
    review.cycleId !== record.cycleId ||
    normalized(review.decision) !== "RETURNED" ||
    !review.decidedAt ||
    note.length < 3 ||
    clean(review.reviewerAssignmentId).length === 0 ||
    clean(reviewMetadata.reviewType) !== "DIRECTOR_GOVERNANCE_REVIEW" ||
    normalized(reviewMetadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    Number(reviewMetadata.reviewStage) !== review.stage ||
    clean(reviewMetadata.assessmentId) !== record.id ||
    Number(reviewMetadata.assessmentRevision) !== record.revision ||
    clean(reviewMetadata.assessmentHash).toLowerCase() !==
      clean(record.assessmentHash).toLowerCase() ||
    !isSha256(reviewEvidenceHash) ||
    clean(reviewMetadata.decisionAction) !== "RETURN" ||
    normalized(reviewMetadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    clean(reviewMetadata.decidedAt) !== decidedAt ||
    reviewMetadata.revisionRequired !== true ||
    reviewMetadata.releasePerformed !== false ||
    reviewMetadata.immutableEvidenceReverified !== true ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.reviewerMayRewriteVisitEvidence !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.visitEvidenceMutationPerformed !== false ||
    reviewMetadata.staffFeedbackIncluded !== false ||
    reviewMetadata.respondentIdentitiesIncluded !== false ||
    reviewMetadata.combinedWeightingDefined !== false ||
    reviewMetadata.providerCalled !== false ||
    clean(reviewMetadata.reasonHash).toLowerCase() !==
      hashJson({ note }).toLowerCase() ||
    Number(reviewMetadata.reasonLength) !== note.length ||
    !isSha256(storedContractHash) ||
    storedContractHash !== expectedContractHash ||
    !isSha256(storedRequestHash) ||
    storedRequestHash !== expectedRequestHash ||
    clean(assessmentMetadata.returnedByDirectorReviewId) !== review.id ||
    Number(assessmentMetadata.returnedByDirectorReviewStage) !== review.stage ||
    clean(assessmentMetadata.returnDecisionContractHash).toLowerCase() !==
      expectedContractHash ||
    clean(assessmentMetadata.returnDecisionRequestHash).toLowerCase() !==
      expectedRequestHash ||
    clean(assessmentMetadata.returnedAt) !== decidedAt ||
    assessmentMetadata.reviewerMayRewriteScores !== false ||
    assessmentMetadata.scoreMutationPerformed !== false ||
    assessmentMetadata.separateFromStaffFeedback !== true ||
    assessmentMetadata.combinedWeightingDefined !== false ||
    assessmentMetadata.providerCalled !== false ||
    clean(cycleReview.state) !== "RETURNED_FOR_CORRECTION" ||
    clean(cycleReview.assessmentId) !== record.id ||
    Number(cycleReview.assessmentRevision) !== record.revision ||
    clean(cycleReview.sourceReviewId) !== review.id ||
    Number(cycleReview.sourceReviewStage) !== review.stage ||
    clean(cycleReview.decision) !== "RETURN" ||
    clean(cycleReview.decisionContractHash).toLowerCase() !==
      expectedContractHash ||
    clean(cycleReview.decisionRequestHash).toLowerCase() !==
      expectedRequestHash ||
    clean(cycleReview.currentReviewId) !== review.id ||
    Number(cycleReview.currentReviewStage) !== review.stage ||
    cycleReview.revisionRequired !== true ||
    Boolean(clean(cycleReview.releaseProofHash)) ||
    Boolean(clean(cycleReview.releasedAt)) ||
    cycleReview.staffFeedbackIncluded !== false ||
    cycleReview.respondentIdentitiesIncluded !== false ||
    cycleReview.carrierCycleStatusMutationPerformed !== false ||
    cycleReview.carrierCycleTimestampMutationPerformed !== false ||
    cycleReview.reviewerMayRewriteScores !== false ||
    cycleReview.scoreMutationAllowed !== false ||
    cycleReview.combinedWeightingDefined !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_REVISION_DIRECTOR_RETURN_PROVENANCE_DRIFT",
      409,
    );
  }

  return {
    mode: "DIRECTOR_GOVERNANCE_RETURN",
    review,
    decisionContractHash: expectedContractHash,
    decisionRequestHash: expectedRequestHash,
  };
}

function returnedRevisionAdmission(
  record: AssessmentRecord,
  review: ReviewRecord,
): ReturnedRevisionAdmission {
  const directorAdmission = directorGovernanceReturnAdmission(record, review);
  if (directorAdmission) return directorAdmission;

  assertCycleBoundary(record);
  return {
    mode: "LEGACY_UNDER_REVIEW_RETURN",
    review,
    decisionContractHash: null,
    decisionRequestHash: null,
  };
}

function instrumentSections(record: AssessmentRecord) {
  const expected = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  const version = record.instrumentVersion;
  if (
    record.instrumentVersionId !== version.id ||
    version.version !== expected.instrumentVersion ||
    version.status !== "ACTIVE" ||
    version.instrument.code !== expected.instrumentCode ||
    version.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    version.instrument.subjectType !== "HEADTEACHER" ||
    version.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/i.test(clean(version.contentHash))
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_INSTRUMENT_INVALID", 409);
  }
  const sections = [...version.sections].sort((a, b) => a.order - b.order);
  if (sections.length !== expected.expectedSectionCount) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_SECTION_COUNT_DRIFT", 409);
  }
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  let itemCount = 0;
  sections.forEach((section, index) => {
    if (
      section.order !== index + 1 ||
      section.maxScore !== expected.expectedSectionMaximums[index] ||
      !clean(section.id) ||
      !clean(section.key) ||
      !clean(section.title)
    ) {
      fail("HEADTEACHER_SUPERVISORY_REVISION_SECTION_STRUCTURE_DRIFT", 409);
    }
    const items = [...section.items].sort((a, b) => a.order - b.order);
    if (items.reduce((sum, item) => sum + item.maxScore, 0) !== section.maxScore) {
      fail("HEADTEACHER_SUPERVISORY_REVISION_SECTION_MAXIMUM_DRIFT", 409);
    }
    items.forEach((item) => {
      if (
        itemIds.has(item.id) ||
        itemKeys.has(item.key) ||
        !clean(item.id) ||
        !clean(item.key) ||
        !clean(item.label) ||
        item.maxScore !== expected.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail("HEADTEACHER_SUPERVISORY_REVISION_ITEM_STRUCTURE_DRIFT", 409);
      }
      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemCount += 1;
    });
  });
  if (itemCount !== expected.expectedItemCount) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_ITEM_COUNT_DRIFT", 409);
  }
  return sections;
}

function visitContextEvidence(record: AssessmentRecord) {
  const metadata = objectValue(record.metadata);
  const expectedHash = clean(metadata.visitContextHash).toLowerCase();
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    hashJson(record.evidenceSnapshotJson) !== expectedHash
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_VISIT_CONTEXT_HASH_INVALID", 409);
  }

  const context = objectValue(record.evidenceSnapshotJson);
  const contextSchemaVersion = Number(context.schemaVersion);
  const target = objectValue(context.target);
  const assessor = objectValue(context.assessor);
  const instrument = objectValue(context.instrument);
  const observation = objectValue(context.observation);
  if (
    ![1, 2].includes(contextSchemaVersion) ||
    context.workflow !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    context.evidenceStream !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    target.userId !== record.cycle.targetUserId ||
    target.tenantId !== record.cycle.targetTenantId ||
    normalized(target.role) !== "HEADTEACHER" ||
    assessor.userId !== record.assessorUserId ||
    assessor.assignmentId !== record.assessorAssignmentId ||
    instrument.instrumentVersionId !== record.instrumentVersionId ||
    instrument.code !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    instrument.version !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(instrument.contentHash).toLowerCase() !==
      clean(record.instrumentVersion.contentHash).toLowerCase() ||
    !record.dateObserved ||
    observation.dateObserved !== isoDateOnly(record.dateObserved)
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_VISIT_CONTEXT_DRIFT", 409);
  }

  let visitDetails;
  try {
    visitDetails = visitDetailsFromEvidenceSnapshot(
      record.evidenceSnapshotJson,
    );
  } catch {
    fail("HEADTEACHER_SUPERVISORY_REVISION_VISIT_DETAILS_INVALID", 409);
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
    fail("HEADTEACHER_SUPERVISORY_REVISION_VISIT_DETAILS_INVALID", 409);
  }

  return {
    contextHash: expectedHash,
    contextSchemaVersion: contextSchemaVersion as 1 | 2,
    visitDetailsSchemaVersion: visitDetails?.schemaVersion ?? null,
    officialVisitDetailsIncluded: visitDetails !== null,
  };
}
function scoringRows(record: AssessmentRecord, sections: InstrumentSectionRecord[]) {
  const scores = new Map(record.scores.map((score) => [score.instrumentItemId, score]));
  if (scores.size !== record.scores.length) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_DUPLICATE_SCORE_ROW", 409);
  }
  return sections.flatMap((section) =>
    [...section.items]
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        const row = scores.get(item.id);
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
              (row.score as number) < HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.scaleMinimum ||
              (row.score as number) > item.maxScore))
        ) {
          fail("HEADTEACHER_SUPERVISORY_REVISION_SCORE_EVIDENCE_INVALID", 409, {
            itemKey: item.key,
          });
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

function assessmentHashPayload(input: {
  record: AssessmentRecord;
  visitContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(input.record.scores.map((score) => [score.instrumentItemId, score]));
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
      dateObserved: input.record.dateObserved ? isoDateOnly(input.record.dateObserved) : null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.record.instrumentVersionId,
      code: input.record.instrumentVersion.instrument.code,
      version: input.record.instrumentVersion.version,
      contentHash: clean(input.record.instrumentVersion.contentHash).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      [...section.items]
        .sort((a, b) => a.order - b.order)
        .map((item) => {
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

function assertFinalizedSourceEvidence(record: AssessmentRecord) {
  if (
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    !/^[a-f0-9]{64}$/i.test(clean(record.assessmentHash)) ||
    clean(record.generalComment)
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_FINALIZED_SOURCE_INVALID", 409);
  }
  const sections = instrumentSections(record);
  const calculated = calculateAppraisalScores(scoringRows(record, sections), {
    requireComplete: true,
  });
  if (!calculated.ok) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_SOURCE_SCORES_INVALID", 409, {
      scoreError: calculated.code,
      itemKeys: calculated.itemKeys,
    });
  }
  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameJson(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_SOURCE_CALCULATION_DRIFT", 409);
  }
  const visitEvidence = visitContextEvidence(record);
  const expectedHash = hashJson(
    assessmentHashPayload({
      record,
      visitContextHash: visitEvidence.contextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(record.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_SOURCE_HASH_DRIFT", 409);
  }
  return {
    sections,
    contextHash: visitEvidence.contextHash,
    visitEvidence,
    calculated: calculated.value,
  };
}

function targetFromMembership(
  record: AssessmentRecord,
  membership: TargetMembershipRecord,
): HeadteacherSupervisoryTarget {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;
  if (
    membership.userId !== record.cycle.targetUserId ||
    membership.tenantId !== record.cycle.targetTenantId ||
    membership.tenant.id !== record.cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    zone.id !== record.cycle.targetZoneId ||
    district.id !== record.cycle.scopeZoneId
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_TARGET_CONTEXT_INVALID", 409);
  }
  return {
    userId: membership.userId,
    roleName: membership.role.name,
    isActive: true,
    tenantId: membership.tenantId,
    tenantStatus: membership.tenant.status,
    circuitZoneId: zone.id,
    circuitName: zone.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

function assignmentInputs(rows: AssignmentRecord[]): HeadteacherSupervisoryGovernanceAssignment[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    role: row.role,
    zoneId: row.zoneId,
    zoneName: row.zone.name,
    zoneLevel: row.zone.zoneType.level,
    parentZoneId: row.zone.parentZone?.id ?? row.zone.parentZoneId,
    parentZoneName: row.zone.parentZone?.name ?? null,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.zone.isActive,
  }));
}

async function assertCurrentAuthority(
  tx: Pick<
    HeadteacherSupervisoryRevisionTransactionClient,
    "membership" | "governanceOfficerAssignment"
  >,
  record: AssessmentRecord,
  input: { actorUserId: string; actorRoleName: string; now: Date },
) {
  const membership = await tx.membership.findFirst({
    where: {
      userId: record.cycle.targetUserId,
      tenantId: record.cycle.targetTenantId,
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: { status: "ACTIVE" },
    },
    select: {
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
    },
  });
  if (!membership) fail("HEADTEACHER_SUPERVISORY_REVISION_TARGET_NOT_FOUND", 404);
  const assignments = await tx.governanceOfficerAssignment.findMany({
    where: { userId: input.actorUserId, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      startsAt: true,
      endsAt: true,
      zoneId: true,
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
  });
  const authority = decideHeadteacherSupervisoryAssessmentAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    target: targetFromMembership(record, membership),
    assignments: assignmentInputs(assignments),
    now: input.now,
  });
  if (!authority.allowed) {
    fail(`HEADTEACHER_SUPERVISORY_REVISION_AUTHORITY_${authority.reason}`, 403, {
      reason: authority.reason,
    });
  }
  return authority;
}

function returnEvidenceHash(record: AssessmentRecord, review: ReviewRecord) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_REVISION_POLICY.revisionEvidenceSchemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    assessmentId: record.id,
    assessmentHash: clean(record.assessmentHash).toLowerCase(),
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

function scoreCopyRows(record: AssessmentRecord, newAssessmentId: string) {
  return record.scores.map((score) => ({
    assessmentId: newAssessmentId,
    instrumentItemId: score.instrumentItemId,
    sectionKey: score.sectionKey,
    sectionTitle: score.sectionTitle,
    sectionOrder: score.sectionOrder,
    sectionMaxScore: score.sectionMaxScore,
    itemKey: score.itemKey,
    itemLabel: score.itemLabel,
    itemOrder: score.itemOrder,
    itemMaxScore: score.itemMaxScore,
    score: score.score,
    notApplicable: score.notApplicable,
  }));
}

function successorId(record: AssessmentRecord) {
  const value = clean(objectValue(record.metadata).supersededByAssessmentId);
  return value || null;
}

function existingRevisionSummary(input: {
  original: AssessmentRecord;
  existing: AssessmentRecord;
  returnHash: string;
  sourceHash: string;
  visitHash: string;
  returnAdmission: ReturnedRevisionAdmission;
  visitEvidence: {
    contextSchemaVersion: 1 | 2;
    visitDetailsSchemaVersion: 1 | null;
    officialVisitDetailsIncluded: boolean;
  };
}) {
  const metadata = objectValue(input.existing.metadata);
  if (
    input.existing.cycleId !== input.original.cycleId ||
    input.existing.assessorUserId !== input.original.assessorUserId ||
    input.existing.instrumentVersionId !== input.original.instrumentVersionId ||
    input.existing.revision !== input.original.revision + 1 ||
    input.existing.priorAssessmentId !== input.original.id ||
    input.existing.assessorAssignmentId !== input.original.assessorAssignmentId ||
    input.existing.dateObserved?.getTime() !== input.original.dateObserved?.getTime() ||
    !sameJson(input.existing.evidenceSnapshotJson, input.original.evidenceSnapshotJson) ||
    clean(metadata.sourceAssessmentHash).toLowerCase() !== input.sourceHash ||
    clean(metadata.returnEvidenceHash).toLowerCase() !== input.returnHash ||
    clean(metadata.visitContextHash).toLowerCase() !== input.visitHash ||
    Number(metadata.visitContextSchemaVersion) !==
      input.visitEvidence.contextSchemaVersion ||
    (input.visitEvidence.visitDetailsSchemaVersion === null
      ? metadata.visitDetailsSchemaVersion !== null
      : Number(metadata.visitDetailsSchemaVersion) !==
        input.visitEvidence.visitDetailsSchemaVersion) ||
    metadata.officialVisitDetailsIncluded !==
      input.visitEvidence.officialVisitDetailsIncluded ||
    clean(metadata.returnAdmissionMode) !== input.returnAdmission.mode ||
    (input.returnAdmission.mode === "DIRECTOR_GOVERNANCE_RETURN"
      ? clean(metadata.returnDecisionContractHash).toLowerCase() !==
          input.returnAdmission.decisionContractHash ||
        clean(metadata.returnDecisionRequestHash).toLowerCase() !==
          input.returnAdmission.decisionRequestHash
      : metadata.returnDecisionContractHash != null ||
        metadata.returnDecisionRequestHash != null) ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.preserveVisitContext !== true
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_EXISTING_DRIFT", 409);
  }
  return buildRevisionSummary(input.existing, input.original, input.returnHash, input.sourceHash, input.visitHash);
}

function buildRevisionSummary(
  record: AssessmentRecord,
  original: AssessmentRecord,
  returnHash: string,
  sourceHash: string,
  visitHash: string,
): HeadteacherSupervisoryRevisionSummary {
  return {
    id: record.id,
    cycleId: record.cycleId,
    status: normalized(record.status) as AppraisalAssessmentStatus,
    revision: record.revision,
    priorAssessmentId: original.id,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId: clean(record.assessorAssignmentId),
    targetUserId: record.cycle.targetUserId,
    targetTenantId: clean(record.cycle.targetTenantId),
    instrumentVersionId: record.instrumentVersionId,
    dateObserved: record.dateObserved ? isoDateOnly(record.dateObserved) : "",
    visitContextHash: visitHash,
    sourceAssessmentHash: sourceHash,
    returnEvidenceHash: returnHash,
    copiedScoreCount: original.scores.length,
    createdAt: record.createdAt.toISOString(),
    providerCalled: false,
  };
}

function isRetryableConflict(error: unknown) {
  const code =
    error && typeof error === "object"
      ? clean((error as { code?: unknown }).code)
      : "";
  const message =
    error && typeof error === "object"
      ? clean((error as { message?: unknown }).message)
      : "";

  return (
    ["P2002", "P2034"].includes(code) ||
    message === "HEADTEACHER_SUPERVISORY_REVISION_WRITE_RACE"
  );
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: HEADTEACHER_SUPERVISORY_REVISION_POLICY.transactionMaxWaitMs,
    timeout: HEADTEACHER_SUPERVISORY_REVISION_POLICY.transactionTimeoutMs,
  };
}

function deriveState(record: AssessmentRecord): HeadteacherSupervisoryAssessorReadState {
  const status = normalized(record.status) as AppraisalAssessmentStatus;
  const cycleStatus = normalized(record.cycle.status);
  const returnReview = status === "RETURNED" ? latestReturnedReview(record) : null;
  const directorReturnAdmission =
    returnReview ? directorGovernanceReturnAdmission(record, returnReview) : null;
  const inheritedReturnReason =
    record.revision > 1
      ? clean(objectValue(record.metadata).returnReason)
      : "";
  let state: AssessorLifecycleStateCode;
  let label: string;
  let description: string;
  let canEdit = false;
  const canFinalize = false;
  let canCreateRevision = false;

  if (status === "RETURNED" && directorReturnAdmission) {
    state = "RETURNED_REVISION_REQUIRED";
    label = "Revision required";
    description = "The returned assessment remains locked. Create a new revision to respond.";
    canCreateRevision = true;
  } else if (cycleStatus === "RELEASED") {
    state = "RELEASED_READ_ONLY";
    label = "Appraisal released";
    description = "This supervisory evidence is locked as part of the released appraisal.";
  } else if (cycleStatus === "CANCELLED") {
    state = "CANCELLED_READ_ONLY";
    label = "Appraisal cancelled";
    description = "This supervisory evidence is retained as read-only audit history.";
  } else if (status === "DRAFT") {
    state = record.revision > 1 ? "REVISION_DRAFT" : "DRAFT";
    label = record.revision > 1 ? "Continue revision" : "Continue assessment";
    description = "Your draft remains editable until it is finalized.";
    canEdit = true;
  } else if (status === "FINALIZED") {
    state = record.revision > 1 ? "REVISION_FINALIZED_READ_ONLY" : "FINALIZED_READ_ONLY";
    label = record.revision > 1 ? "Revision submitted" : "Assessment submitted";
    description = "Finalized scores are immutable and available only as read-only evidence.";
  } else if (status === "RETURNED") {
    state = "RETURNED_REVISION_REQUIRED";
    label = "Revision required";
    description = "The returned assessment remains locked. Create a new revision to respond.";
    canCreateRevision = Boolean(
      returnReview && returnedRevisionAdmission(record, returnReview),
    );
  } else {
    state = "SUPERSEDED_READ_ONLY";
    label = "Superseded";
    description = "A later revision replaced this assessment. This version remains read-only.";
  }

  return {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    status,
    state,
    label,
    description,
    readOnly: !canEdit,
    canEdit,
    canFinalize,
    canCreateRevision,
    finalizationReadinessIncluded: false,
    priorAssessmentId: record.priorAssessmentId,
    successorAssessmentId: successorId(record),
    returnReason:
      returnReview
        ? clean(returnReview.note)
        : inheritedReturnReason || null,
    scoresIncluded: false,
    percentagesIncluded: false,
    reviewerIdentityIncluded: false,
    providerCalled: false,
  };
}

export async function readHeadteacherSupervisoryAssessorState(
  input: ReadHeadteacherSupervisoryAssessorStateInput,
): Promise<HeadteacherSupervisoryAssessorReadState> {
  const database =
    input.database ??
    (prisma as unknown as Pick<HeadteacherSupervisoryRevisionDatabase, "appraisalAssessment">);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: assessmentSelect,
  });
  if (!record) fail("HEADTEACHER_SUPERVISORY_REVISION_ASSESSMENT_NOT_FOUND", 404);
  if (record.assessorUserId !== actorUserId) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_ASSESSOR_ONLY", 403);
  }
  return deriveState(record);
}

type RevisionCreatePreflight = {
  original: AssessmentRecord;
  review: ReviewRecord;
  returnAdmission: ReturnedRevisionAdmission;
  evidence: ReturnType<typeof assertFinalizedSourceEvidence>;
  sourceHash: string;
  reviewHash: string;
  nextRevision: number;
  revisionKey: string;
};

type RevisionPreflight =
  | {
      outcome: "EXISTING_MATCH";
      result: CreateReturnedHeadteacherSupervisoryRevisionResult;
    }
  | {
      outcome: "CREATE";
      value: RevisionCreatePreflight;
    };

async function prepareRevisionPreflight(input: {
  database: HeadteacherSupervisoryRevisionDatabase;
  actorUserId: string;
  actorRoleName: string;
  returnedAssessmentId: string;
  now: Date;
}): Promise<RevisionPreflight> {
  const original = await input.database.appraisalAssessment.findUnique({
    where: { id: input.returnedAssessmentId },
    select: assessmentSelect,
  });
  if (!original) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_ASSESSMENT_NOT_FOUND", 404);
  }
  if (original.assessorUserId !== input.actorUserId) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_ASSESSOR_ONLY", 403);
  }
  if (!Number.isInteger(original.revision) || original.revision < 1) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_NUMBER_INVALID", 409);
  }

  const review = latestReturnedReview(original);
  const returnAdmission = returnedRevisionAdmission(original, review);
  const evidence = assertFinalizedSourceEvidence(original);
  const sourceHash = clean(original.assessmentHash).toLowerCase();
  const reviewHash = returnEvidenceHash(original, review);

  // Full target + actor authority validation is intentionally read-only and
  // happens before the write transaction so a slow remote read cannot consume
  // the bounded SERIALIZABLE write window.
  await assertCurrentAuthority(input.database, original, {
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    now: input.now,
  });

  const nextRevision = original.revision + 1;
  const existing = await input.database.appraisalAssessment.findUnique({
    where: {
      cycleId_assessorUserId_revision: {
        cycleId: original.cycleId,
        assessorUserId: original.assessorUserId,
        revision: nextRevision,
      },
    },
    select: assessmentSelect,
  });

  if (existing) {
    if (normalized(original.status) !== "SUPERSEDED") {
      fail("HEADTEACHER_SUPERVISORY_REVISION_ORIGINAL_NOT_SUPERSEDED", 409);
    }
    return {
      outcome: "EXISTING_MATCH",
      result: {
        outcome: "EXISTING_MATCH",
        originalAssessmentId: original.id,
        originalStatus: "SUPERSEDED",
        revision: existingRevisionSummary({
          original,
          existing,
          returnHash: reviewHash,
          sourceHash,
          visitHash: evidence.contextHash,
          returnAdmission,
          visitEvidence: evidence.visitEvidence,
        }),
      },
    };
  }

  if (normalized(original.status) !== "RETURNED") {
    fail("HEADTEACHER_SUPERVISORY_REVISION_RETURNED_STATUS_REQUIRED", 409);
  }

  const plan = planReturnedHeadteacherSupervisoryRevision({
    assessmentId: original.id,
    status: original.status,
    revisionNumber: original.revision,
    assessorUserId: original.assessorUserId,
    targetUserId: original.cycle.targetUserId,
    returnReason: clean(review.note),
    reviewerScoreEdits: objectValue(review.metadata).scoreEdits,
  });
  if (!plan.ok) {
    fail(`HEADTEACHER_SUPERVISORY_REVISION_PLAN_${plan.code}`, 409);
  }
  if (plan.value.newRevision.revisionNumber !== nextRevision) {
    fail("HEADTEACHER_SUPERVISORY_REVISION_PLAN_DRIFT", 409);
  }

  const revisionKey = hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_REVISION_POLICY.schemaVersion,
    originalAssessmentId: original.id,
    nextRevision,
    sourceAssessmentHash: sourceHash,
    returnEvidenceHash: reviewHash,
    returnAdmissionMode: returnAdmission.mode,
    returnDecisionContractHash: returnAdmission.decisionContractHash,
    returnDecisionRequestHash: returnAdmission.decisionRequestHash,
    visitContextHash: evidence.contextHash,
  });

  return {
    outcome: "CREATE",
    value: {
      original,
      review,
      returnAdmission,
      evidence,
      sourceHash,
      reviewHash,
      nextRevision,
      revisionKey,
    },
  };
}

async function performRevisionTransaction(input: {
  database: HeadteacherSupervisoryRevisionDatabase;
  actorUserId: string;
  actorRoleName: string;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
  preflight: RevisionCreatePreflight;
}): Promise<CreateReturnedHeadteacherSupervisoryRevisionResult> {
  const {
    original,
    review,
    returnAdmission,
    evidence,
    sourceHash,
    reviewHash,
    nextRevision,
    revisionKey,
  } = input.preflight;

  return input.database.$transaction(async (tx) => {
    // Revalidate current authority inside the write transaction. The expensive
    // immutable source/evidence read remains outside this bounded write phase.
    const authority = await assertCurrentAuthority(tx, original, {
      actorUserId: input.actorUserId,
      actorRoleName: input.actorRoleName,
      now: input.now,
    });

    const created = await tx.appraisalAssessment.create({
      data: {
        cycleId: original.cycleId,
        instrumentVersionId: original.instrumentVersionId,
        assessorUserId: original.assessorUserId,
        assessorAssignmentId: original.assessorAssignmentId,
        status: "DRAFT",
        revision: nextRevision,
        priorAssessmentId: original.id,
        dateObserved: original.dateObserved,
        overallPercentage: null,
        sectionPercentagesJson: {},
        generalComment: null,
        evidenceSnapshotJson: original.evidenceSnapshotJson,
        assessmentHash: null,
        finalizedByUserId: null,
        finalizedAt: null,
        metadata: {
          workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
          revisionSchemaVersion:
            HEADTEACHER_SUPERVISORY_REVISION_POLICY.schemaVersion,
          revisionKey,
          sourceAssessmentId: original.id,
          sourceAssessmentHash: sourceHash,
          returnReviewId: review.id,
          returnReviewStage: review.stage,
          returnEvidenceHash: reviewHash,
          returnReason: clean(review.note),
          returnAdmissionMode: returnAdmission.mode,
          returnDecisionContractHash: returnAdmission.decisionContractHash,
          returnDecisionRequestHash: returnAdmission.decisionRequestHash,
          visitContextHash: evidence.contextHash,
          visitContextSchemaVersion:
            evidence.visitEvidence.contextSchemaVersion,
          visitDetailsSchemaVersion:
            evidence.visitEvidence.visitDetailsSchemaVersion,
          officialVisitDetailsIncluded:
            evidence.visitEvidence.officialVisitDetailsIncluded,
          preserveVisitContext: true,
          copiedScoreCount: original.scores.length,
          reviewerMayRewriteScores: false,
          returnedAssessmentRequiresRevision: true,
          separateFromStaffFeedback: true,
          combinedWeightingDefined: false,
          providerCalled: false,
        },
      },
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
        createdAt: true,
        cycle: {
          select: {
            targetUserId: true,
            targetTenantId: true,
          },
        },
      },
    });

    const copied = await tx.appraisalAssessmentScore.createMany({
      data: scoreCopyRows(original, created.id),
      skipDuplicates: false,
    });
    if (copied.count !== original.scores.length) {
      fail("HEADTEACHER_SUPERVISORY_REVISION_SCORE_COPY_INCOMPLETE", 409, {
        expected: original.scores.length,
        actual: copied.count,
      });
    }

    const originalMetadata = objectValue(original.metadata);
    const updated = await tx.appraisalAssessment.updateMany({
      where: {
        id: original.id,
        status: "RETURNED",
        revision: original.revision,
        assessorUserId: original.assessorUserId,
        assessmentHash: sourceHash,
      },
      data: {
        status: "SUPERSEDED",
        metadata: {
          ...originalMetadata,
          supersededByAssessmentId: created.id,
          supersededAt: input.now.toISOString(),
          returnEvidenceHash: reviewHash,
          returnAdmissionMode: returnAdmission.mode,
          returnDecisionContractHash: returnAdmission.decisionContractHash,
          returnDecisionRequestHash: returnAdmission.decisionRequestHash,
          reviewerMayRewriteScores: false,
          providerCalled: false,
        },
      },
    });
    if (updated.count !== 1) {
      fail("HEADTEACHER_SUPERVISORY_REVISION_WRITE_RACE", 409);
    }

    await tx.auditLog.create({
      data: {
        tenantId: original.cycle.targetTenantId,
        userId: input.actorUserId,
        action: SUPERVISORY_REVISION_CREATED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: created.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId: input.reqId,
          action: SUPERVISORY_REVISION_CREATED_AUDIT_ACTION,
          workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
          cycleId: original.cycleId,
          originalAssessmentId: original.id,
          newAssessmentId: created.id,
          originalRevision: original.revision,
          newRevision: nextRevision,
          assessorAssignmentId: original.assessorAssignmentId,
          currentAuthorityAssignmentId: authority.assignmentId,
          scopeLevel: authority.scopeLevel,
          sourceAssessmentHash: sourceHash,
          returnEvidenceHash: reviewHash,
          returnAdmissionMode: returnAdmission.mode,
          returnDecisionContractHash: returnAdmission.decisionContractHash,
          returnDecisionRequestHash: returnAdmission.decisionRequestHash,
          visitContextHash: evidence.contextHash,
          visitContextSchemaVersion:
            evidence.visitEvidence.contextSchemaVersion,
          visitDetailsSchemaVersion:
            evidence.visitEvidence.visitDetailsSchemaVersion,
          officialVisitDetailsIncluded:
            evidence.visitEvidence.officialVisitDetailsIncluded,
          copiedScoreCount: copied.count,
          scoreValuesRecordedInAudit: false,
          aggregateScoreRecordedInAudit: false,
          reviewerIdentityIncluded: false,
          contactFieldsIncluded: false,
          providerCalled: false,
        },
      },
    });

    return {
      outcome: "CREATED" as const,
      originalAssessmentId: original.id,
      originalStatus: "SUPERSEDED" as const,
      revision: buildRevisionSummary(
        created,
        original,
        reviewHash,
        sourceHash,
        evidence.contextHash,
      ),
    };
  }, transactionOptions());
}

export async function createReturnedHeadteacherSupervisoryAssessmentRevision(
  input: CreateReturnedHeadteacherSupervisoryRevisionInput,
): Promise<CreateReturnedHeadteacherSupervisoryRevisionResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryRevisionDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRoleName = normalized(input.actorRoleName);
  const returnedAssessmentId = requireIdentifier(
    input.returnedAssessmentId,
    "returnedAssessmentId",
  );
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const preflight = await prepareRevisionPreflight({
        database,
        actorUserId,
        actorRoleName,
        returnedAssessmentId,
        now,
      });

      if (preflight.outcome === "EXISTING_MATCH") {
        return preflight.result;
      }

      return await performRevisionTransaction({
        database,
        actorUserId,
        actorRoleName,
        reqId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        now,
        preflight: preflight.value,
      });
    } catch (error) {
      if (attempt === 0 && isRetryableConflict(error)) continue;
      throw error;
    }
  }
  fail("HEADTEACHER_SUPERVISORY_REVISION_CONCURRENT_CREATE_FAILED", 409);
}
