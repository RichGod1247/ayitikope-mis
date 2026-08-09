// src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import {
  readTeacherSupervisoryObservationDetailsSnapshot,
  type TeacherSupervisoryObservationDetailsSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationDetails";
import {
  readTeacherSupervisoryObservationSelectionSnapshot,
  type TeacherSupervisoryObservationSelectionSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationOptions";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
  decideTeacherSupervisoryAssessmentAuthority,
  decideTeacherSupervisoryScoreMutation,
  inspectTeacherSupervisoryInstrument,
  type TeacherSupervisoryGovernanceAssignment,
  type TeacherSupervisoryTarget,
} from "@/lib/appraisals/teacherSupervisoryAssessment";

export const TEACHER_SUPERVISORY_SCORING_POLICY = {
  schemaVersion: 1,
  assessmentHashSchemaVersion: 1,
  saveUnit: "SECTION",
  partialSectionSaveAllowed: true,
  commentsAllowed: true,
  editableCycleStatus: "OPEN",
  correctionDraftCycleStatus: "UNDER_REVIEW",
  correctionRevisionMinimum: 2,
  correctionRevisionSchemaVersion: 1,
  correctionRevisionMetadataRequired: true,
  expectedSectionCount: 6,
  expectedItemCount: 34,
  expectedSectionMaximums: [35, 25, 25, 30, 30, 25] as const,
  scaleMinimum: 1,
  scaleMaximum: 5,
  allowNotApplicable: true,
  finalizedScoresImmutable: true,
  finalizedCommentImmutable: true,
  returnedAssessmentRequiresRevision: true,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  separateFromLegacyTeacherAppraisal: true,
  combinedWeightingDefined: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 60_000,
} as const;

const TEACHER_DRAFT_SAVED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_ASSESSMENT_DRAFT_SAVED";
const TEACHER_COMMENT_SAVED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_ASSESSMENT_COMMENT_SAVED";
const TEACHER_FINALIZED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_ASSESSMENT_FINALIZED";

export type TeacherSupervisoryScoreInput = {
  itemKey: string;
  score?: number | null;
  notApplicable?: boolean | null;
};

export type LoadTeacherSupervisoryAssessmentInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  now?: Date;
  database?: TeacherSupervisoryScoringDatabase;
};

export type SaveTeacherSupervisorySectionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  sectionKey: string;
  scores: readonly TeacherSupervisoryScoreInput[];
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryScoringDatabase;
};

export type SaveTeacherSupervisoryCommentInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  generalComment?: unknown;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryScoringDatabase;
};

export type FinalizeTeacherSupervisoryAssessmentInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryScoringDatabase;
};

export type TeacherSupervisorySectionProgress = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  complete: boolean;
  percentage: number | null;
};

export type TeacherSupervisoryProgress = {
  totalSections: number;
  completedSections: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  completionPercentage: number;
  missingItemKeys: string[];
  sections: TeacherSupervisorySectionProgress[];
};

export type TeacherSupervisoryAssessmentView = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  status: AppraisalAssessmentStatus;
  assessorUserId: string;
  assessorAssignmentId: string;
  targetUserId: string;
  targetTenantId: string;
  targetCircuitZoneId: string;
  targetDistrictZoneId: string;
  instrumentCode: string;
  instrumentVersion: number;
  dateObserved: string;
  observationContextHash: string;
  assessmentHash: string | null;
  finalizedAt: string | null;
  generalComment: string | null;
  canEdit: boolean;
  canFinalize: boolean;
  commentsAllowed: true;
  separateFromLegacyTeacherAppraisal: true;
  combinedWeightingDefined: false;
  progress: TeacherSupervisoryProgress;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
};

export type SaveTeacherSupervisorySectionResult = {
  outcome: "SAVED" | "UNCHANGED";
  assessmentId: string;
  sectionKey: string;
  savedItems: number;
  progress: TeacherSupervisoryProgress;
};

export type SaveTeacherSupervisoryCommentResult = {
  outcome: "SAVED" | "UNCHANGED";
  assessmentId: string;
  generalComment: string | null;
};

export type FinalizeTeacherSupervisoryAssessmentResult = {
  outcome: "FINALIZED" | "EXISTING_FINALIZED";
  assessmentId: string;
  finalizedAt: string;
  assessmentHash: string;
  generalComment: string | null;
  overallPercentage: number | null;
  sectionPercentages: Record<string, number | null>;
  answeredItems: number;
  notApplicableItems: number;
  progress: TeacherSupervisoryProgress;
};

export type TeacherSupervisoryFinalizedAssessmentEvidence = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  assessorUserId: string;
  assessorAssignmentId: string;
  assessorRole: string;
  assessorScopeLevel: string;
  targetUserId: string;
  targetTenantId: string;
  targetCircuitZoneId: string;
  targetDistrictZoneId: string;
  instrumentVersionId: string;
  instrumentCode: string;
  instrumentVersion: number;
  instrumentContentHash: string;
  dateObserved: string;
  observationContextSchemaVersion: 1 | 2;
  observationContextHash: string;
  assessmentHash: string;
  finalizedAt: string;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
  answeredItems: number;
  notApplicableItems: number;
  generalCommentIncludedInHash: true;
  separateFromLegacyTeacherAppraisal: true;
  combinedWeightingDefined: false;
  providerCalled: false;
};

export type TeacherSupervisorySealedAssessmentStatus =
  | "FINALIZED"
  | "RETURNED"
  | "SUPERSEDED";

export type TeacherSupervisorySealedAssessmentEvidence =
  TeacherSupervisoryFinalizedAssessmentEvidence & {
    status: TeacherSupervisorySealedAssessmentStatus;
  };

export type TeacherSupervisoryCorrectionRevisionKeyInput = {
  cycleId: string;
  sourceAssessmentId: string;
  sourceAssessmentHash: string;
  sourceObservationContextHash: string;
  revisionNumber: number;
  assessorUserId: string;
  assessorAssignmentId: string;
  returnReviewId: string;
  returnReviewStage: number;
  returningReviewerUserId: string;
  returningReviewerAssignmentId: string;
  returningReviewerRole: string;
  returnReviewEvidenceHash: string;
  returnDecisionRequestHash: string;
  returnDecisionEvidenceHash: string;
  returnReasonHash: string;
  returnReasonLength: number;
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

type AssessmentContextRecord = {
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
  cycle: {
    id: string;
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

type AssessmentMutationRecord = {
  id: string;
  status: string;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
};

type TeacherSupervisoryScoringTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentContextRecord | null>;
    update(args: unknown): Promise<AssessmentMutationRecord>;
  };
  appraisalAssessmentScore: {
    upsert(args: unknown): Promise<AssessmentScoreRecord>;
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

export type TeacherSupervisoryScoringDatabase = {
  appraisalAssessment: TeacherSupervisoryScoringTransactionClient["appraisalAssessment"];
  appraisalAssessmentScore: TeacherSupervisoryScoringTransactionClient["appraisalAssessmentScore"];
  membership: TeacherSupervisoryScoringTransactionClient["membership"];
  governanceOfficerAssignment: TeacherSupervisoryScoringTransactionClient["governanceOfficerAssignment"];
  auditLog: TeacherSupervisoryScoringTransactionClient["auditLog"];
  $transaction<T>(
    operation: (tx: TeacherSupervisoryScoringTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type ObservationContextSnapshot = {
  schemaVersion: 1 | 2;
  workflow: string;
  evidenceStream: string;
  cycle: {
    id: string;
    statusAtDraft: string;
    openedAt: string;
  };
  target: {
    userId: string;
    role: string;
    tenantId: string;
    name: string | null;
    schoolName: string;
  };
  assessor: {
    userId: string;
    name: string | null;
    role: string;
    assignmentId: string;
    assignmentRole: string;
    scopeLevel: string;
  };
  jurisdiction: {
    districtZoneId: string;
    districtName: string;
    circuitZoneId: string;
    circuitName: string;
    assignmentZoneId: string;
    assignmentZoneName: string;
    assignmentParentZoneId: string | null;
    assignmentParentZoneName: string | null;
  };
  instrument: {
    instrumentId: string;
    instrumentVersionId: string;
    code: string;
    version: number;
    contentHash: string;
  };
  observation: {
    dateObserved: string;
    details: TeacherSupervisoryObservationDetailsSnapshot;
    selection?: TeacherSupervisoryObservationSelectionSnapshot;
  };
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
  cycle: {
    select: {
      id: true,
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

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("TEACHER_SUPERVISORY_SCORING_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_SCORING_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
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

export function computeTeacherSupervisoryCorrectionRevisionKey(
  input: TeacherSupervisoryCorrectionRevisionKeyInput,
) {
  return hashJson({
    schemaVersion:
      TEACHER_SUPERVISORY_SCORING_POLICY.correctionRevisionSchemaVersion,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    cycleId: clean(input.cycleId),
    sourceAssessmentId: clean(input.sourceAssessmentId),
    sourceAssessmentHash: clean(input.sourceAssessmentHash).toLowerCase(),
    sourceObservationContextHash: clean(
      input.sourceObservationContextHash,
    ).toLowerCase(),
    revisionNumber: Number(input.revisionNumber),
    assessorUserId: clean(input.assessorUserId),
    assessorAssignmentId: clean(input.assessorAssignmentId),
    returnReviewId: clean(input.returnReviewId),
    returnReviewStage: Number(input.returnReviewStage),
    returningReviewerUserId: clean(input.returningReviewerUserId),
    returningReviewerAssignmentId: clean(
      input.returningReviewerAssignmentId,
    ),
    returningReviewerRole: normalized(input.returningReviewerRole),
    returnReviewEvidenceHash: clean(
      input.returnReviewEvidenceHash,
    ).toLowerCase(),
    returnDecisionRequestHash: clean(
      input.returnDecisionRequestHash,
    ).toLowerCase(),
    returnDecisionEvidenceHash: clean(
      input.returnDecisionEvidenceHash,
    ).toLowerCase(),
    returnReasonHash: clean(input.returnReasonHash).toLowerCase(),
    returnReasonLength: Number(input.returnReasonLength),
    preserveObservationContext: true,
    copyScores: true,
    copyGeneralComment: true,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    returnedAssessmentRequiresRevision: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
  });
}

function normalizeGeneralComment(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") {
    fail("TEACHER_SUPERVISORY_COMMENT_INVALID", 400, {
      reason: "TEXT_REQUIRED",
    });
  }

  const comment = value.replace(/\r\n?/g, "\n").trim();
  if (!comment) return null;
  return comment;
}

function assertInitialDraftCycleBoundary(record: AssessmentContextRecord) {
  const cycleMetadata = objectValue(record.cycle.metadata);
  if (
    normalized(record.cycle.status) !==
      TEACHER_SUPERVISORY_SCORING_POLICY.editableCycleStatus ||
    !record.cycle.openedAt ||
    record.cycle.deadlineAt !== null ||
    record.cycle.closedAt !== null ||
    record.cycle.reviewStartedAt !== null ||
    record.cycle.releasedAt !== null ||
    record.cycle.cancelledAt !== null ||
    record.cycle.responseWindowDays !== 0 ||
    record.cycle.minimumResponses !== 0 ||
    record.cycle._count.participants !== 0 ||
    clean(cycleMetadata.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(cycleMetadata.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    cycleMetadata.respondentWorkflow !== false ||
    clean(cycleMetadata.participantSelection) !== "NONE" ||
    cycleMetadata.legacyTeacherAppraisalIncluded !== false ||
    cycleMetadata.combinedWeightingDefined !== false ||
    cycleMetadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE", 409, {
      cycleId: record.cycle.id,
      status: normalized(record.cycle.status),
    });
  }
}

function assertCorrectionRevisionBoundary(record: AssessmentContextRecord) {
  const metadata = objectValue(record.metadata);
  const cycleReview = objectValue(
    objectValue(record.cycle.metadata).teacherSupervisoryReview,
  );

  const priorAssessmentId = clean(record.priorAssessmentId);
  const sourceAssessmentId = clean(metadata.sourceAssessmentId);
  const sourceAssessmentHash = clean(
    metadata.sourceAssessmentHash,
  ).toLowerCase();
  const sourceObservationContextHash = clean(
    metadata.sourceObservationContextHash,
  ).toLowerCase();
  const observationContextHash = clean(
    metadata.observationContextHash,
  ).toLowerCase();
  const revisionKey = clean(metadata.revisionKey).toLowerCase();
  const returnReviewId = clean(metadata.returnReviewId);
  const returnReviewStage = Number(metadata.returnReviewStage);
  const returningReviewerUserId = clean(metadata.returningReviewerUserId);
  const returningReviewerAssignmentId = clean(
    metadata.returningReviewerAssignmentId,
  );
  const returningReviewerRole = normalized(metadata.returningReviewerRole);
  const returnReviewEvidenceHash = clean(
    metadata.returnReviewEvidenceHash,
  ).toLowerCase();
  const returnDecisionRequestHash = clean(
    metadata.returnDecisionRequestHash,
  ).toLowerCase();
  const returnDecisionEvidenceHash = clean(
    metadata.returnDecisionEvidenceHash,
  ).toLowerCase();
  const returnReason = clean(metadata.returnReason);
  const returnReasonHash = clean(metadata.returnReasonHash).toLowerCase();
  const returnReasonLength = Number(metadata.returnReasonLength);
  const copiedScoreCount = Number(metadata.copiedScoreCount);
  const revisionSchemaVersion = Number(metadata.revisionSchemaVersion);
  const validHash = (value: string) => /^[a-f0-9]{64}$/.test(value);

  const expectedRevisionKey =
    computeTeacherSupervisoryCorrectionRevisionKey({
      cycleId: record.cycleId,
      sourceAssessmentId,
      sourceAssessmentHash,
      sourceObservationContextHash,
      revisionNumber: record.revision,
      assessorUserId: record.assessorUserId,
      assessorAssignmentId: clean(record.assessorAssignmentId),
      returnReviewId,
      returnReviewStage,
      returningReviewerUserId,
      returningReviewerAssignmentId,
      returningReviewerRole,
      returnReviewEvidenceHash,
      returnDecisionRequestHash,
      returnDecisionEvidenceHash,
      returnReasonHash,
      returnReasonLength,
    });

  const valid =
    normalized(record.status) === "DRAFT" &&
    normalized(record.cycle.status) ===
      TEACHER_SUPERVISORY_SCORING_POLICY.correctionDraftCycleStatus &&
    record.revision >=
      TEACHER_SUPERVISORY_SCORING_POLICY.correctionRevisionMinimum &&
    Boolean(priorAssessmentId) &&
    sourceAssessmentId === priorAssessmentId &&
    revisionSchemaVersion ===
      TEACHER_SUPERVISORY_SCORING_POLICY.correctionRevisionSchemaVersion &&
    returnReason.length >= 3 &&
    returnReason.length === returnReasonLength &&
    hashJson(returnReason) === returnReasonHash &&
    Boolean(returnReviewId) &&
    Number.isInteger(returnReviewStage) &&
    returnReviewStage >= 1 &&
    Boolean(returningReviewerUserId) &&
    Boolean(returningReviewerAssignmentId) &&
    (returningReviewerRole === "HEAD_OF_SUPERVISION" ||
      returningReviewerRole === "DISTRICT_DIRECTOR") &&
    validHash(revisionKey) &&
    revisionKey === expectedRevisionKey &&
    validHash(sourceAssessmentHash) &&
    validHash(sourceObservationContextHash) &&
    validHash(observationContextHash) &&
    sourceObservationContextHash === observationContextHash &&
    validHash(returnReviewEvidenceHash) &&
    validHash(returnDecisionRequestHash) &&
    validHash(returnDecisionEvidenceHash) &&
    metadata.preserveObservationContext === true &&
    metadata.copyScores === true &&
    metadata.copyGeneralComment === true &&
    copiedScoreCount === TEACHER_SUPERVISORY_SCORING_POLICY.expectedItemCount &&
    record.scores.length === copiedScoreCount &&
    metadata.reviewerMayRewriteScores === false &&
    metadata.reviewerMayRewriteComment === false &&
    metadata.returnedAssessmentRequiresRevision === true &&
    metadata.separateFromLegacyTeacherAppraisal === true &&
    metadata.combinedWeightingDefined === false &&
    metadata.providerCalled === false &&
    record.overallPercentage === null &&
    Object.keys(objectValue(record.sectionPercentagesJson)).length === 0 &&
    record.assessmentHash === null &&
    record.finalizedByUserId === null &&
    record.finalizedAt === null &&
    Boolean(record.cycle.openedAt) &&
    Boolean(record.cycle.closedAt) &&
    Boolean(record.cycle.reviewStartedAt) &&
    Boolean(
      record.cycle.reviewStartedAt &&
        record.createdAt.getTime() >= record.cycle.reviewStartedAt.getTime(),
    ) &&
    record.cycle.releasedAt === null &&
    record.cycle.cancelledAt === null &&
    clean(cycleReview.state) === "RETURNED_FOR_CORRECTION" &&
    cycleReview.awaitingRevision === true &&
    clean(cycleReview.currentReviewId) === returnReviewId &&
    Number(cycleReview.currentReviewStage) === returnReviewStage &&
    clean(cycleReview.currentReviewerRole) === returningReviewerRole &&
    clean(cycleReview.currentReviewerAssignmentId) ===
      returningReviewerAssignmentId &&
    clean(cycleReview.admittedAssessmentId) === sourceAssessmentId &&
    clean(cycleReview.assessmentHash).toLowerCase() === sourceAssessmentHash &&
    clean(cycleReview.observationContextHash).toLowerCase() ===
      sourceObservationContextHash;

  if (!valid) {
    fail(
      "TEACHER_SUPERVISORY_SCORING_CORRECTION_REVISION_INVALID",
      409,
      {
        cycleId: record.cycle.id,
        assessmentId: record.id,
        status: normalized(record.cycle.status),
        reason: "VERIFIED_RETURNED_REVISION_REQUIRED",
      },
    );
  }
}

function assertDraftCycleBoundary(record: AssessmentContextRecord) {
  const cycleStatus = normalized(record.cycle.status);

  if (
    cycleStatus === TEACHER_SUPERVISORY_SCORING_POLICY.editableCycleStatus
  ) {
    assertInitialDraftCycleBoundary(record);
    return;
  }

  if (
    cycleStatus ===
    TEACHER_SUPERVISORY_SCORING_POLICY.correctionDraftCycleStatus
  ) {
    const metadata = objectValue(record.metadata);

    if (metadata.correctionRevision !== true) {
      fail("TEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE", 409, {
        cycleId: record.cycle.id,
        status: cycleStatus,
      });
    }

    assertCorrectionRevisionBoundary(record);
    return;
  }

  fail("TEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE", 409, {
    cycleId: record.cycle.id,
    status: cycleStatus,
  });
}

function assertOwner(record: AssessmentContextRecord, actorUserId: string) {
  if (record.assessorUserId !== actorUserId) {
    fail("TEACHER_SUPERVISORY_SCORING_ASSESSOR_ONLY", 403);
  }
}

function assertDraftOwnerMutation(
  record: AssessmentContextRecord,
  actorUserId: string,
) {
  const decision = decideTeacherSupervisoryScoreMutation({
    status: record.status,
    actorUserId,
    assessorUserId: record.assessorUserId,
  });

  if (!decision.allowed) {
    fail(`TEACHER_SUPERVISORY_SCORING_${decision.reason}`, 409, {
      reason: decision.reason,
    });
  }
}

function assertDraftOwnerCommentMutation(
  record: AssessmentContextRecord,
  actorUserId: string,
) {
  assertOwner(record, actorUserId);
  const status = normalized(record.status);
  if (status === "DRAFT") return;
  if (status === "FINALIZED") {
    fail("TEACHER_SUPERVISORY_SCORING_FINALIZED_COMMENT_IMMUTABLE", 409);
  }
  if (status === "RETURNED") {
    fail("TEACHER_SUPERVISORY_SCORING_RETURNED_REQUIRES_REVISION", 409);
  }
  fail("TEACHER_SUPERVISORY_SCORING_SUPERSEDED_READ_ONLY", 409);
}

function assertInstrumentStructure(record: AssessmentContextRecord) {
  const sourceContract = inspectTeacherSupervisoryInstrument();
  if (!sourceContract.valid) {
    fail("TEACHER_SUPERVISORY_SCORING_SOURCE_INSTRUMENT_INVALID", 409, {
      issues: [...sourceContract.issues],
    });
  }

  const version = record.instrumentVersion;
  const expected = TEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  if (
    record.instrumentVersionId !== version.id ||
    version.version !== expected.instrumentVersion ||
    version.status !== "ACTIVE" ||
    version.instrument.code !== expected.instrumentCode ||
    version.instrument.purpose !== "TEACHER_OBSERVATION" ||
    version.instrument.subjectType !== "TEACHER" ||
    version.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/i.test(clean(version.contentHash))
  ) {
    fail("TEACHER_SUPERVISORY_SCORING_INSTRUMENT_INVALID", 409);
  }

  const sections = [...version.sections].sort((a, b) => a.order - b.order);
  if (sections.length !== expected.expectedSectionCount) {
    fail("TEACHER_SUPERVISORY_SCORING_SECTION_COUNT_DRIFT", 409);
  }

  const sectionKeys = new Set<string>();
  const sectionOrders = new Set<number>();
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  let itemCount = 0;

  sections.forEach((section, index) => {
    if (
      !clean(section.id) ||
      !clean(section.key) ||
      !clean(section.title) ||
      sectionKeys.has(section.key) ||
      sectionOrders.has(section.order) ||
      section.order !== index + 1 ||
      section.maxScore !== expected.expectedSectionMaximums[index]
    ) {
      fail("TEACHER_SUPERVISORY_SCORING_SECTION_STRUCTURE_DRIFT", 409, {
        sectionKey: section.key,
      });
    }

    sectionKeys.add(section.key);
    sectionOrders.add(section.order);

    const items = [...section.items].sort((a, b) => a.order - b.order);
    const rawMaximum = items.reduce((sum, item) => sum + item.maxScore, 0);
    if (rawMaximum !== section.maxScore) {
      fail("TEACHER_SUPERVISORY_SCORING_SECTION_MAXIMUM_DRIFT", 409, {
        sectionKey: section.key,
      });
    }

    const itemOrders = new Set<number>();
    items.forEach((item) => {
      if (
        !clean(item.id) ||
        !clean(item.key) ||
        !clean(item.label) ||
        itemIds.has(item.id) ||
        itemKeys.has(item.key) ||
        !Number.isInteger(item.order) ||
        item.order < 1 ||
        itemOrders.has(item.order) ||
        item.maxScore !== expected.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail("TEACHER_SUPERVISORY_SCORING_ITEM_STRUCTURE_DRIFT", 409, {
          itemKey: item.key,
        });
      }

      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemOrders.add(item.order);
      itemCount += 1;
    });
  });

  if (itemCount !== expected.expectedItemCount) {
    fail("TEACHER_SUPERVISORY_SCORING_ITEM_COUNT_DRIFT", 409, {
      itemCount,
    });
  }

  return sections;
}

function parseObservationContext(
  record: AssessmentContextRecord,
): ObservationContextSnapshot {
  const context = objectValue(record.evidenceSnapshotJson);
  const metadata = objectValue(record.metadata);
  const contextHash = clean(metadata.observationContextHash).toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(contextHash) ||
    hashJson(record.evidenceSnapshotJson) !== contextHash
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_CONTEXT_HASH_INVALID", 409);
  }

  const typed = context as unknown as ObservationContextSnapshot;
  const contextSchemaVersion = Number(typed.schemaVersion);
  const instrumentHash = clean(record.instrumentVersion.contentHash).toLowerCase();
  const details = readTeacherSupervisoryObservationDetailsSnapshot(
    typed.observation?.details,
  );
  const detailsSchemaVersion = Number(details?.schemaVersion);
  const metadataContextSchemaVersion = Number(
    metadata.observationContextSchemaVersion,
  );
  const metadataDetailsSchemaVersion = Number(
    metadata.observationDetailsSchemaVersion,
  );
  const supportedContextSchema =
    contextSchemaVersion === 1 || contextSchemaVersion === 2;

  let selection: TeacherSupervisoryObservationSelectionSnapshot | null = null;
  if (contextSchemaVersion === 2) {
    selection = readTeacherSupervisoryObservationSelectionSnapshot(
      typed.observation?.selection,
    );
  }

  const legacyContextValid =
    contextSchemaVersion === 1 &&
    detailsSchemaVersion === 1 &&
    metadataContextSchemaVersion === 1 &&
    metadataDetailsSchemaVersion === 1;

  const verifiedContextValid =
    contextSchemaVersion === 2 &&
    detailsSchemaVersion === 2 &&
    metadataContextSchemaVersion === 2 &&
    metadataDetailsSchemaVersion === 2 &&
    metadata.governanceEnrolmentEvidenceIncluded === true &&
    metadata.teacherAssignmentVerified === true &&
    metadata.curriculumSelectionVerified === true &&
    selection != null &&
    details != null &&
    selection.classTaught === details.classTaught &&
    selection.subjectBeingObserved === details.subjectBeingObserved &&
    selection.subStrand === details.subStrand;

  if (
    !supportedContextSchema ||
    (!legacyContextValid && !verifiedContextValid) ||
    typed.workflow !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    typed.evidenceStream !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    typed.cycle?.id !== record.cycleId ||
    typed.cycle?.statusAtDraft !== "OPEN" ||
    typed.cycle?.openedAt !== record.cycle.openedAt?.toISOString() ||
    typed.target?.userId !== record.cycle.targetUserId ||
    typed.target?.tenantId !== record.cycle.targetTenantId ||
    normalized(typed.target?.role) !== "TEACHER" ||
    !clean(typed.target?.schoolName) ||
    typed.assessor?.userId !== record.assessorUserId ||
    typed.assessor?.assignmentId !== record.assessorAssignmentId ||
    typed.jurisdiction?.districtZoneId !== record.cycle.scopeZoneId ||
    typed.jurisdiction?.circuitZoneId !== record.cycle.targetZoneId ||
    typed.instrument?.instrumentId !== record.instrumentVersion.instrument.id ||
    typed.instrument?.instrumentVersionId !== record.instrumentVersionId ||
    typed.instrument?.code !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    typed.instrument?.version !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(typed.instrument?.contentHash).toLowerCase() !== instrumentHash ||
    !record.dateObserved ||
    typed.observation?.dateObserved !== isoDateOnly(record.dateObserved) ||
    !details ||
    details.dateObserved !== typed.observation.dateObserved ||
    metadata.officialObservationDetailsIncluded !== true ||
    metadata.observationContextImmutable !== true ||
    metadata.separateFromLegacyTeacherAppraisal !== true ||
    metadata.legacyTeacherAppraisalMutationAllowed !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_CONTEXT_DRIFT", 409);
  }

  return {
    ...typed,
    schemaVersion: contextSchemaVersion as 1 | 2,
    observation: {
      ...typed.observation,
      details,
      ...(selection ? { selection } : {}),
    },
  };
}

function targetFromMembership(
  record: AssessmentContextRecord,
  membership: TargetMembershipRecord,
): TeacherSupervisoryTarget {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  if (
    membership.userId !== record.cycle.targetUserId ||
    membership.tenantId !== record.cycle.targetTenantId ||
    membership.tenant.id !== record.cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "TEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    zone.id !== record.cycle.targetZoneId ||
    district.id !== record.cycle.scopeZoneId
  ) {
    fail("TEACHER_SUPERVISORY_SCORING_TARGET_CONTEXT_INVALID", 409);
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

function assignmentInputs(
  assignments: AssignmentRecord[],
): TeacherSupervisoryGovernanceAssignment[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    userId: assignment.userId,
    role: assignment.role,
    zoneId: assignment.zoneId,
    zoneName: assignment.zone.name,
    zoneLevel: assignment.zone.zoneType.level,
    parentZoneId: assignment.zone.parentZoneId,
    parentZoneName: assignment.zone.parentZone?.name ?? null,
    status: assignment.status,
    isActive: assignment.zone.isActive,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  }));
}

async function assertCurrentAuthority(
  tx: TeacherSupervisoryScoringTransactionClient,
  record: AssessmentContextRecord,
  input: { actorUserId: string; actorRoleName: string; now: Date },
) {
  const membership = await tx.membership.findFirst({
    where: {
      userId: record.cycle.targetUserId,
      tenantId: record.cycle.targetTenantId,
      status: "ACTIVE",
      role: { name: "TEACHER" },
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

  if (!membership) {
    fail("TEACHER_SUPERVISORY_SCORING_TARGET_NOT_FOUND", 404);
  }

  const assignments = await tx.governanceOfficerAssignment.findMany({
    where: { userId: input.actorUserId },
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

  const decision = decideTeacherSupervisoryAssessmentAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    target: targetFromMembership(record, membership),
    assignments: assignmentInputs(assignments),
    now: input.now,
  });

  if (!decision.allowed) {
    fail(`TEACHER_SUPERVISORY_SCORING_AUTHORITY_${decision.reason}`, 403, {
      reason: decision.reason,
    });
  }

  if (decision.assignmentId !== record.assessorAssignmentId) {
    fail("TEACHER_SUPERVISORY_SCORING_ASSIGNMENT_DRIFT", 409);
  }

  const context = parseObservationContext(record);
  if (
    context.assessor.assignmentId !== decision.assignmentId ||
    canonicalTeacherSupervisoryAssessorRole(context.assessor.role) !==
      decision.effectiveRole ||
    canonicalTeacherSupervisoryAssessorRole(context.assessor.assignmentRole) !==
      decision.effectiveRole ||
    normalized(context.assessor.scopeLevel) !== decision.scopeLevel
  ) {
    fail("TEACHER_SUPERVISORY_SCORING_AUTHORITY_CONTEXT_DRIFT", 409);
  }

  return { decision, context };
}

function validateStoredScores(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  const items = sections.flatMap((section) =>
    section.items.map((item) => ({ section, item })),
  );
  const byItemId = new Map(items.map((row) => [row.item.id, row]));
  const seen = new Set<string>();

  for (const score of record.scores) {
    const expected = byItemId.get(score.instrumentItemId);
    if (
      score.assessmentId !== record.id ||
      !expected ||
      seen.has(score.instrumentItemId) ||
      score.sectionKey !== expected.section.key ||
      score.sectionTitle !== expected.section.title ||
      score.sectionOrder !== expected.section.order ||
      score.sectionMaxScore !== expected.section.maxScore ||
      score.itemKey !== expected.item.key ||
      score.itemLabel !== expected.item.label ||
      score.itemOrder !== expected.item.order ||
      score.itemMaxScore !== expected.item.maxScore ||
      (score.notApplicable && score.score != null) ||
      (!score.notApplicable &&
        score.score != null &&
        (!Number.isInteger(score.score) ||
          score.score < TEACHER_SUPERVISORY_SCORING_POLICY.scaleMinimum ||
          score.score > expected.item.maxScore))
    ) {
      fail("TEACHER_SUPERVISORY_SCORING_STORED_SCORE_DRIFT", 409, {
        itemKey: score.itemKey,
      });
    }
    seen.add(score.instrumentItemId);
  }
}

function calculationRows(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  const stored = new Map(
    record.scores.map((score) => [score.instrumentItemId, score]),
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

function sectionPercentageMap(value: unknown) {
  const object = objectValue(value);
  return Object.fromEntries(
    Object.entries(object).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function progressFor(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
): TeacherSupervisoryProgress {
  const stored = new Map(
    record.scores.map((score) => [score.instrumentItemId, score]),
  );
  const missingItemKeys: string[] = [];

  const sectionProgress = sections.map((section) => {
    let answeredItems = 0;
    let notApplicableItems = 0;

    for (const item of section.items) {
      const score = stored.get(item.id);
      if (score?.notApplicable) {
        answeredItems += 1;
        notApplicableItems += 1;
      } else if (score?.score != null) {
        answeredItems += 1;
      } else {
        missingItemKeys.push(item.key);
      }
    }

    const sectionCalculation = calculateAppraisalScores(
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
      { requireComplete: false },
    );

    if (!sectionCalculation.ok) {
      fail("TEACHER_SUPERVISORY_SCORING_PROGRESS_INVALID", 409, {
        scoreError: sectionCalculation.code,
      });
    }

    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      totalItems: section.items.length,
      answeredItems,
      notApplicableItems,
      complete: answeredItems === section.items.length,
      percentage:
        sectionCalculation.value.sectionPercentages[section.key] ?? null,
    };
  });

  const totalItems = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const answeredItems = totalItems - missingItemKeys.length;
  const notApplicableItems = sectionProgress.reduce(
    (sum, section) => sum + section.notApplicableItems,
    0,
  );

  return {
    totalSections: sections.length,
    completedSections: sectionProgress.filter((section) => section.complete)
      .length,
    totalItems,
    answeredItems,
    notApplicableItems,
    completionPercentage:
      totalItems > 0 ? round2((answeredItems / totalItems) * 100) : 0,
    missingItemKeys,
    sections: sectionProgress,
  };
}

function assessmentHashPayload(input: {
  record: AssessmentContextRecord;
  context: ObservationContextSnapshot;
  observationContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(
    input.record.scores.map((score) => [score.instrumentItemId, score]),
  );

  return {
    schemaVersion:
      TEACHER_SUPERVISORY_SCORING_POLICY.assessmentHashSchemaVersion,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    assessment: {
      id: input.record.id,
      cycleId: input.record.cycleId,
      revision: input.record.revision,
      assessorUserId: input.record.assessorUserId,
      assessorAssignmentId: input.record.assessorAssignmentId,
      dateObserved: input.record.dateObserved
        ? isoDateOnly(input.record.dateObserved)
        : null,
      observationContextHash: input.observationContextHash,
    },
    target: {
      userId: input.context.target.userId,
      tenantId: input.context.target.tenantId,
      circuitZoneId: input.context.jurisdiction.circuitZoneId,
      districtZoneId: input.context.jurisdiction.districtZoneId,
    },
    assessor: {
      userId: input.context.assessor.userId,
      role: canonicalTeacherSupervisoryAssessorRole(input.context.assessor.role),
      assignmentId: input.context.assessor.assignmentId,
      scopeLevel: normalized(input.context.assessor.scopeLevel),
    },
    instrument: {
      instrumentVersionId: input.record.instrumentVersionId,
      code: input.record.instrumentVersion.instrument.code,
      version: input.record.instrumentVersion.version,
      contentHash: clean(input.record.instrumentVersion.contentHash).toLowerCase(),
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
    generalComment: input.record.generalComment,
    sectionPercentages: input.sectionPercentages,
    overallPercentage: input.overallPercentage,
    commentsIncluded: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
  };
}

function sameNumbers(
  left: Record<string, number | null>,
  right: Record<string, number | null>,
) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function verifySealedAssessment(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
  allowedStatuses: readonly TeacherSupervisorySealedAssessmentStatus[],
) {
  const status = normalized(record.status) as TeacherSupervisorySealedAssessmentStatus;
  if (
    !allowedStatuses.includes(status) ||
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    !/^[a-f0-9]{64}$/i.test(clean(record.assessmentHash))
  ) {
    fail("TEACHER_SUPERVISORY_FINALIZED_EVIDENCE_INVALID", 409);
  }

  const calculated = calculateAppraisalScores(
    calculationRows(record, sections),
    { requireComplete: true },
  );
  if (!calculated.ok) {
    fail("TEACHER_SUPERVISORY_FINALIZED_SCORES_INVALID", 409, {
      scoreError: calculated.code,
      itemKeys: calculated.itemKeys,
    });
  }

  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameNumbers(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("TEACHER_SUPERVISORY_FINALIZED_CALCULATION_DRIFT", 409);
  }

  const context = parseObservationContext(record);
  const observationContextHash = clean(
    objectValue(record.metadata).observationContextHash,
  ).toLowerCase();
  const expectedHash = hashJson(
    assessmentHashPayload({
      record,
      context,
      observationContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );

  if (expectedHash !== clean(record.assessmentHash).toLowerCase()) {
    fail("TEACHER_SUPERVISORY_ASSESSMENT_HASH_DRIFT", 409);
  }

  return calculated.value;
}

function verifyFinalizedAssessment(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  return verifySealedAssessment(record, sections, ["FINALIZED"]);
}

export async function verifyTeacherSupervisoryFinalizedAssessmentEvidence(input: {
  assessmentId: string;
  database?: Pick<TeacherSupervisoryScoringDatabase, "appraisalAssessment">;
}): Promise<TeacherSupervisoryFinalizedAssessmentEvidence> {
  const database =
    input.database ??
    (prisma as unknown as Pick<
      TeacherSupervisoryScoringDatabase,
      "appraisalAssessment"
    >);
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const record = await findAssessment(database, assessmentId);
  const sections = assertInstrumentStructure(record);

  validateStoredScores(record, sections);
  const calculated = verifyFinalizedAssessment(record, sections);
  const context = parseObservationContext(record);
  const observationContextHash = clean(
    objectValue(record.metadata).observationContextHash,
  ).toLowerCase();
  const assessmentHash = clean(record.assessmentHash).toLowerCase();
  const assessorAssignmentId = clean(record.assessorAssignmentId);
  const targetTenantId = clean(record.cycle.targetTenantId);
  const targetCircuitZoneId = clean(record.cycle.targetZoneId);
  const instrumentContentHash = clean(
    record.instrumentVersion.contentHash,
  ).toLowerCase();

  if (
    !assessorAssignmentId ||
    !targetTenantId ||
    !targetCircuitZoneId ||
    !record.dateObserved ||
    !record.finalizedAt ||
    !/^[a-f0-9]{64}$/.test(observationContextHash) ||
    !/^[a-f0-9]{64}$/.test(assessmentHash) ||
    !/^[a-f0-9]{64}$/.test(instrumentContentHash)
  ) {
    fail("TEACHER_SUPERVISORY_FINALIZED_PROOF_INCOMPLETE", 409);
  }

  return {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId,
    assessorRole: canonicalTeacherSupervisoryAssessorRole(
      context.assessor.role,
    ),
    assessorScopeLevel: normalized(context.assessor.scopeLevel),
    targetUserId: record.cycle.targetUserId,
    targetTenantId,
    targetCircuitZoneId,
    targetDistrictZoneId: record.cycle.scopeZoneId,
    instrumentVersionId: record.instrumentVersionId,
    instrumentCode: record.instrumentVersion.instrument.code,
    instrumentVersion: record.instrumentVersion.version,
    instrumentContentHash,
    dateObserved: isoDateOnly(record.dateObserved),
    observationContextSchemaVersion: context.schemaVersion,
    observationContextHash,
    assessmentHash,
    finalizedAt: record.finalizedAt.toISOString(),
    sectionPercentages: calculated.sectionPercentages,
    overallPercentage: calculated.overallPercentage,
    answeredItems: calculated.answeredItems,
    notApplicableItems: calculated.notApplicableItems,
    generalCommentIncludedInHash: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

export async function verifyTeacherSupervisorySealedAssessmentEvidence(input: {
  assessmentId: string;
  allowedStatuses: readonly TeacherSupervisorySealedAssessmentStatus[];
  database?: Pick<TeacherSupervisoryScoringDatabase, "appraisalAssessment">;
}): Promise<TeacherSupervisorySealedAssessmentEvidence> {
  const database =
    input.database ??
    (prisma as unknown as Pick<
      TeacherSupervisoryScoringDatabase,
      "appraisalAssessment"
    >);
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const allowedStatuses = [...new Set(input.allowedStatuses)];

  if (!allowedStatuses.length) {
    fail("TEACHER_SUPERVISORY_SEALED_STATUS_REQUIRED", 400);
  }

  const record = await findAssessment(database, assessmentId);
  const sections = assertInstrumentStructure(record);

  validateStoredScores(record, sections);
  const calculated = verifySealedAssessment(
    record,
    sections,
    allowedStatuses,
  );
  const context = parseObservationContext(record);
  const observationContextHash = clean(
    objectValue(record.metadata).observationContextHash,
  ).toLowerCase();
  const assessmentHash = clean(record.assessmentHash).toLowerCase();
  const assessorAssignmentId = clean(record.assessorAssignmentId);
  const targetTenantId = clean(record.cycle.targetTenantId);
  const targetCircuitZoneId = clean(record.cycle.targetZoneId);
  const instrumentContentHash = clean(
    record.instrumentVersion.contentHash,
  ).toLowerCase();
  const status = normalized(
    record.status,
  ) as TeacherSupervisorySealedAssessmentStatus;

  if (
    !assessorAssignmentId ||
    !targetTenantId ||
    !targetCircuitZoneId ||
    !record.dateObserved ||
    !record.finalizedAt ||
    !/^[a-f0-9]{64}$/.test(observationContextHash) ||
    !/^[a-f0-9]{64}$/.test(assessmentHash) ||
    !/^[a-f0-9]{64}$/.test(instrumentContentHash)
  ) {
    fail("TEACHER_SUPERVISORY_SEALED_PROOF_INCOMPLETE", 409);
  }

  return {
    status,
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId,
    assessorRole: canonicalTeacherSupervisoryAssessorRole(
      context.assessor.role,
    ),
    assessorScopeLevel: normalized(context.assessor.scopeLevel),
    targetUserId: record.cycle.targetUserId,
    targetTenantId,
    targetCircuitZoneId,
    targetDistrictZoneId: record.cycle.scopeZoneId,
    instrumentVersionId: record.instrumentVersionId,
    instrumentCode: record.instrumentVersion.instrument.code,
    instrumentVersion: record.instrumentVersion.version,
    instrumentContentHash,
    dateObserved: isoDateOnly(record.dateObserved),
    observationContextSchemaVersion: context.schemaVersion,
    observationContextHash,
    assessmentHash,
    finalizedAt: record.finalizedAt.toISOString(),
    sectionPercentages: calculated.sectionPercentages,
    overallPercentage: calculated.overallPercentage,
    answeredItems: calculated.answeredItems,
    notApplicableItems: calculated.notApplicableItems,
    generalCommentIncludedInHash: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

async function findAssessment(
  database: Pick<TeacherSupervisoryScoringDatabase, "appraisalAssessment">,
  assessmentId: string,
) {
  const assessment = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: assessmentSelect,
  });
  if (!assessment) {
    fail("TEACHER_SUPERVISORY_ASSESSMENT_NOT_FOUND", 404);
  }
  return assessment;
}

function buildView(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
): TeacherSupervisoryAssessmentView {
  const progress = progressFor(record, sections);
  const status = normalized(record.status) as AppraisalAssessmentStatus;

  return {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    status,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId: clean(record.assessorAssignmentId),
    targetUserId: record.cycle.targetUserId,
    targetTenantId: clean(record.cycle.targetTenantId),
    targetCircuitZoneId: clean(record.cycle.targetZoneId),
    targetDistrictZoneId: record.cycle.scopeZoneId,
    instrumentCode: record.instrumentVersion.instrument.code,
    instrumentVersion: record.instrumentVersion.version,
    dateObserved: record.dateObserved ? isoDateOnly(record.dateObserved) : "",
    observationContextHash: clean(
      objectValue(record.metadata).observationContextHash,
    ),
    assessmentHash: record.assessmentHash,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    generalComment: record.generalComment,
    canEdit: status === "DRAFT",
    canFinalize: status === "DRAFT" && progress.missingItemKeys.length === 0,
    commentsAllowed: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
    progress,
    sectionPercentages: sectionPercentageMap(record.sectionPercentagesJson),
    overallPercentage: record.overallPercentage,
  };
}

function normalizeSectionPayload(
  section: InstrumentSectionRecord,
  inputs: readonly TeacherSupervisoryScoreInput[],
) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    fail("TEACHER_SUPERVISORY_SCORING_SECTION_SCORES_REQUIRED", 400);
  }
  if (inputs.length > section.items.length) {
    fail("TEACHER_SUPERVISORY_SCORING_TOO_MANY_SECTION_SCORES", 400);
  }

  const itemByKey = new Map(section.items.map((item) => [item.key, item]));
  const seen = new Set<string>();

  return inputs.map((input) => {
    const itemKey = clean(input.itemKey);
    const item = itemByKey.get(itemKey);
    if (!item) {
      fail("TEACHER_SUPERVISORY_SCORING_ITEM_NOT_IN_SECTION", 400, {
        itemKey,
        sectionKey: section.key,
      });
    }
    if (seen.has(itemKey)) {
      fail("TEACHER_SUPERVISORY_SCORING_DUPLICATE_ITEM", 400, { itemKey });
    }
    seen.add(itemKey);

    const notApplicable = input.notApplicable === true;
    const score = input.score == null ? null : Number(input.score);
    if (notApplicable && score != null) {
      fail("TEACHER_SUPERVISORY_SCORING_NA_WITH_SCORE", 400, { itemKey });
    }
    if (
      !notApplicable &&
      (!Number.isInteger(score) ||
        (score as number) < TEACHER_SUPERVISORY_SCORING_POLICY.scaleMinimum ||
        (score as number) > item.maxScore)
    ) {
      fail("TEACHER_SUPERVISORY_SCORING_INVALID_SCORE", 400, { itemKey });
    }

    return {
      item,
      score: notApplicable ? null : (score as number),
      notApplicable,
    };
  });
}

function storedScoreEquals(
  existing: AssessmentScoreRecord | undefined,
  row: { score: number | null; notApplicable: boolean },
) {
  return Boolean(
    existing &&
      existing.score === row.score &&
      existing.notApplicable === row.notApplicable,
  );
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: TEACHER_SUPERVISORY_SCORING_POLICY.transactionMaxWaitMs,
    timeout: TEACHER_SUPERVISORY_SCORING_POLICY.transactionTimeoutMs,
  };
}

export async function loadTeacherSupervisoryAssessment(
  input: LoadTeacherSupervisoryAssessmentInput,
): Promise<TeacherSupervisoryAssessmentView> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const now = requireNow(input.now);
  const actorRoleName = normalized(input.actorRoleName);
  const record = await findAssessment(database, assessmentId);

  assertOwner(record, actorUserId);
  const sections = assertInstrumentStructure(record);
  validateStoredScores(record, sections);
  parseObservationContext(record);

  if (normalized(record.status) === "DRAFT") {
    assertDraftCycleBoundary(record);
    await assertCurrentAuthority(database, record, {
      actorUserId,
      actorRoleName,
      now,
    });
  } else if (normalized(record.status) === "FINALIZED") {
    verifyFinalizedAssessment(record, sections);
  }

  return buildView(record, sections);
}

export async function saveTeacherSupervisoryAssessmentSection(
  input: SaveTeacherSupervisorySectionInput,
): Promise<SaveTeacherSupervisorySectionResult> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorRoleName = normalized(input.actorRoleName);
  const sectionKey = clean(input.sectionKey);
  const now = requireNow(input.now);

  if (!sectionKey) {
    fail("TEACHER_SUPERVISORY_SCORING_SECTION_KEY_REQUIRED", 400);
  }

  return database.$transaction(async (tx) => {
    const record = await findAssessment(tx, assessmentId);
    assertDraftOwnerMutation(record, actorUserId);
    assertDraftCycleBoundary(record);
    const sections = assertInstrumentStructure(record);
    validateStoredScores(record, sections);
    const { context } = await assertCurrentAuthority(tx, record, {
      actorUserId,
      actorRoleName,
      now,
    });

    const section = sections.find((candidate) => candidate.key === sectionKey);
    if (!section) {
      fail("TEACHER_SUPERVISORY_SCORING_SECTION_NOT_FOUND", 404, {
        sectionKey,
      });
    }

    const normalizedRows = normalizeSectionPayload(section, input.scores);
    const existingByItem = new Map(
      record.scores.map((score) => [score.instrumentItemId, score]),
    );
    const changed = normalizedRows.filter(
      (row) => !storedScoreEquals(existingByItem.get(row.item.id), row),
    );

    if (!changed.length) {
      return {
        outcome: "UNCHANGED" as const,
        assessmentId: record.id,
        sectionKey,
        savedItems: normalizedRows.length,
        progress: progressFor(record, sections),
      };
    }

    const savedByItem = new Map(existingByItem);
    for (const row of changed) {
      const saved = await tx.appraisalAssessmentScore.upsert({
        where: {
          assessmentId_instrumentItemId: {
            assessmentId: record.id,
            instrumentItemId: row.item.id,
          },
        },
        create: {
          assessmentId: record.id,
          instrumentItemId: row.item.id,
          sectionKey: section.key,
          sectionTitle: section.title,
          sectionOrder: section.order,
          sectionMaxScore: section.maxScore,
          itemKey: row.item.key,
          itemLabel: row.item.label,
          itemOrder: row.item.order,
          itemMaxScore: row.item.maxScore,
          score: row.score,
          notApplicable: row.notApplicable,
        },
        update: {
          score: row.score,
          notApplicable: row.notApplicable,
        },
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
      });
      savedByItem.set(row.item.id, saved);
    }

    await tx.auditLog.create({
      data: {
        tenantId: record.cycle.targetTenantId,
        userId: actorUserId,
        action: TEACHER_DRAFT_SAVED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: record.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: TEACHER_DRAFT_SAVED_AUDIT_ACTION,
          workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
          cycleId: record.cycleId,
          assessmentId: record.id,
          revision: record.revision,
          sectionKey,
          changedItemCount: changed.length,
          assessorAssignmentId: record.assessorAssignmentId,
          scopeLevel: context.assessor.scopeLevel,
          observationContextHash: clean(
            objectValue(record.metadata).observationContextHash,
          ),
          scoreValuesRecordedInAudit: false,
          commentTextRecordedInAudit: false,
          contactFieldsIncluded: false,
          legacyTeacherAppraisalIncluded: false,
          providerCalled: false,
        },
      },
    });

    const updated: AssessmentContextRecord = {
      ...record,
      scores: [...savedByItem.values()].sort(
        (left, right) =>
          left.sectionOrder - right.sectionOrder ||
          left.itemOrder - right.itemOrder,
      ),
    };

    return {
      outcome: "SAVED" as const,
      assessmentId: record.id,
      sectionKey,
      savedItems: normalizedRows.length,
      progress: progressFor(updated, sections),
    };
  }, transactionOptions());
}

export async function saveTeacherSupervisoryGeneralComment(
  input: SaveTeacherSupervisoryCommentInput,
): Promise<SaveTeacherSupervisoryCommentResult> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorRoleName = normalized(input.actorRoleName);
  const now = requireNow(input.now);
  const generalComment = normalizeGeneralComment(input.generalComment);

  return database.$transaction(async (tx) => {
    const record = await findAssessment(tx, assessmentId);
    assertDraftOwnerCommentMutation(record, actorUserId);
    assertDraftCycleBoundary(record);
    const sections = assertInstrumentStructure(record);
    validateStoredScores(record, sections);
    const { context } = await assertCurrentAuthority(tx, record, {
      actorUserId,
      actorRoleName,
      now,
    });

    if (record.generalComment === generalComment) {
      return {
        outcome: "UNCHANGED" as const,
        assessmentId: record.id,
        generalComment,
      };
    }

    const updated = await tx.appraisalAssessment.update({
      where: { id: record.id },
      data: { generalComment },
      select: {
        id: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        assessmentHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        metadata: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: record.cycle.targetTenantId,
        userId: actorUserId,
        action: TEACHER_COMMENT_SAVED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: record.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: TEACHER_COMMENT_SAVED_AUDIT_ACTION,
          workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
          cycleId: record.cycleId,
          assessmentId: record.id,
          revision: record.revision,
          assessorAssignmentId: record.assessorAssignmentId,
          scopeLevel: context.assessor.scopeLevel,
          observationContextHash: clean(
            objectValue(record.metadata).observationContextHash,
          ),
          commentPresent: Boolean(updated.generalComment),
          commentTextRecordedInAudit: false,
          scoreValuesRecordedInAudit: false,
          contactFieldsIncluded: false,
          legacyTeacherAppraisalIncluded: false,
          providerCalled: false,
        },
      },
    });

    return {
      outcome: "SAVED" as const,
      assessmentId: record.id,
      generalComment: updated.generalComment,
    };
  }, transactionOptions());
}

export async function finalizeTeacherSupervisoryAssessment(
  input: FinalizeTeacherSupervisoryAssessmentInput,
): Promise<FinalizeTeacherSupervisoryAssessmentResult> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorRoleName = normalized(input.actorRoleName);
  const now = requireNow(input.now);

  return database.$transaction(async (tx) => {
    const record = await findAssessment(tx, assessmentId);
    assertOwner(record, actorUserId);
    const sections = assertInstrumentStructure(record);
    validateStoredScores(record, sections);
    const context = parseObservationContext(record);

    if (normalized(record.status) === "FINALIZED") {
      const calculated = verifyFinalizedAssessment(record, sections);
      return {
        outcome: "EXISTING_FINALIZED" as const,
        assessmentId: record.id,
        finalizedAt: record.finalizedAt?.toISOString() ?? "",
        assessmentHash: clean(record.assessmentHash),
        generalComment: record.generalComment,
        overallPercentage: calculated.overallPercentage,
        sectionPercentages: calculated.sectionPercentages,
        answeredItems: calculated.answeredItems,
        notApplicableItems: calculated.notApplicableItems,
        progress: progressFor(record, sections),
      };
    }

    assertDraftOwnerMutation(record, actorUserId);
    assertDraftCycleBoundary(record);
    const authority = await assertCurrentAuthority(tx, record, {
      actorUserId,
      actorRoleName,
      now,
    });

    const calculated = calculateAppraisalScores(
      calculationRows(record, sections),
      { requireComplete: true },
    );
    if (!calculated.ok) {
      fail("TEACHER_SUPERVISORY_SCORING_INCOMPLETE", 409, {
        scoreError: calculated.code,
        itemKeys: calculated.itemKeys,
      });
    }

    const observationContextHash = clean(
      objectValue(record.metadata).observationContextHash,
    ).toLowerCase();
    const assessmentHash = hashJson(
      assessmentHashPayload({
        record,
        context,
        observationContextHash,
        sections,
        sectionPercentages: calculated.value.sectionPercentages,
        overallPercentage: calculated.value.overallPercentage,
      }),
    );

    const metadata = {
      ...objectValue(record.metadata),
      workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
      evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
      scoringSchemaVersion: TEACHER_SUPERVISORY_SCORING_POLICY.schemaVersion,
      assessmentHashSchemaVersion:
        TEACHER_SUPERVISORY_SCORING_POLICY.assessmentHashSchemaVersion,
      assessmentHash,
      commentsAllowed: true,
      generalCommentIncludedInHash: true,
      finalizedScoresImmutable: true,
      finalizedCommentImmutable: true,
      returnedAssessmentRequiresRevision: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      separateFromLegacyTeacherAppraisal: true,
      legacyTeacherAppraisalMutationAllowed: false,
      combinedWeightingDefined: false,
      answeredItemCount: calculated.value.answeredItems,
      notApplicableItemCount: calculated.value.notApplicableItems,
      providerCalled: false,
    };

    const finalized = await tx.appraisalAssessment.update({
      where: { id: record.id },
      data: {
        status: "FINALIZED",
        overallPercentage: calculated.value.overallPercentage,
        sectionPercentagesJson: calculated.value.sectionPercentages,
        generalComment: record.generalComment,
        assessmentHash,
        finalizedByUserId: actorUserId,
        finalizedAt: now,
        metadata,
      },
      select: {
        id: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        assessmentHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        metadata: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: record.cycle.targetTenantId,
        userId: actorUserId,
        action: TEACHER_FINALIZED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: record.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: TEACHER_FINALIZED_AUDIT_ACTION,
          workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
          cycleId: record.cycleId,
          assessmentId: record.id,
          revision: record.revision,
          assessorAssignmentId: record.assessorAssignmentId,
          scopeLevel: authority.context.assessor.scopeLevel,
          observationContextHash,
          assessmentHash,
          answeredItemCount: calculated.value.answeredItems,
          notApplicableItemCount: calculated.value.notApplicableItems,
          generalCommentPresent: Boolean(record.generalComment),
          scoreValuesRecordedInAudit: false,
          aggregateScoreRecordedInAudit: false,
          commentTextRecordedInAudit: false,
          contactFieldsIncluded: false,
          legacyTeacherAppraisalIncluded: false,
          providerCalled: false,
        },
      },
    });

    const finalizedRecord: AssessmentContextRecord = {
      ...record,
      status: finalized.status,
      overallPercentage: finalized.overallPercentage,
      sectionPercentagesJson: finalized.sectionPercentagesJson,
      generalComment: finalized.generalComment,
      assessmentHash: finalized.assessmentHash,
      finalizedByUserId: finalized.finalizedByUserId,
      finalizedAt: finalized.finalizedAt,
      metadata: finalized.metadata,
    };

    return {
      outcome: "FINALIZED" as const,
      assessmentId: finalized.id,
      finalizedAt: finalized.finalizedAt?.toISOString() ?? now.toISOString(),
      assessmentHash: finalized.assessmentHash ?? assessmentHash,
      generalComment: finalized.generalComment,
      overallPercentage: finalized.overallPercentage,
      sectionPercentages: sectionPercentageMap(finalized.sectionPercentagesJson),
      answeredItems: calculated.value.answeredItems,
      notApplicableItems: calculated.value.notApplicableItems,
      progress: progressFor(finalizedRecord, sections),
    };
  }, transactionOptions());
}
