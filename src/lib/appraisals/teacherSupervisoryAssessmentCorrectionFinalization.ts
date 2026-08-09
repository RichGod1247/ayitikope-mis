import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  finalizeTeacherSupervisoryAssessment,
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  verifyTeacherSupervisorySealedAssessmentEvidence,
  type FinalizeTeacherSupervisoryAssessmentInput,
  type FinalizeTeacherSupervisoryAssessmentResult,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  computeTeacherSupervisoryReviewEvidenceHash,
} from "@/lib/appraisals/teacherSupervisoryReviewAdmission";
import {
  decideTeacherSupervisoryReviewAuthority,
  type TeacherSupervisoryReviewerRole,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/teacherSupervisoryAssessment";

export const TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  requiredCycleStatus: "UNDER_REVIEW",
  correctionRevisionStatus: "DRAFT",
  finalizedRevisionStatus: "FINALIZED",
  requiredSourceStatus: "SUPERSEDED",
  requiredReturnDecision: "RETURNED",
  resumedReviewDecision: "PENDING",
  preserveReturningReviewer: true,
  preserveReviewStage: true,
  correctionObservationContextImmutable: true,
  correctionCycleStatusChanges: false,
  ordinaryFinalizationReviewCreation: false,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  reviewerMayRewriteObservationDetails: false,
  reviewerMayRewriteGovernanceEnrolmentEvidence: false,
  reviewerMayRewriteTeacherAssignmentProvenance: false,
  reviewerMayRewriteCurriculumProvenance: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const CORRECTION_FINALIZED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_CORRECTION_FINALIZED_FOR_REVIEW";

export type FinalizeTeacherSupervisoryAssessmentWithContinuationInput =
  Omit<FinalizeTeacherSupervisoryAssessmentInput, "database"> & {
    database?: TeacherSupervisoryCorrectionFinalizationDatabase;
  };

export type TeacherSupervisoryCorrectionContinuation = {
  reviewId: string;
  reviewStage: number;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewDecision: "PENDING";
  reviewEvidenceHash: string;
  sourceAssessmentId: string;
  sourceAssessmentHash: string;
  sourceReviewId: string;
  sourceReviewEvidenceHash: string;
};

export type FinalizeTeacherSupervisoryAssessmentWithContinuationResult = {
  result: FinalizeTeacherSupervisoryAssessmentResult;
  reviewCreated: boolean;
  cycleTransitioned: false;
  continuation: TeacherSupervisoryCorrectionContinuation | null;
  providerCalled: false;
};

type AssessmentProbeRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  assessmentHash: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  cycle: {
    id: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    status: string;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
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
    isActive: boolean;
    zoneType: {
      level: number;
    };
  };
};

type CountResult = {
  count: number;
};

export type TeacherSupervisoryCorrectionFinalizationTransactionClient = {
  appraisalAssessment: TeacherSupervisoryScoringDatabase["appraisalAssessment"];
  appraisalAssessmentScore: TeacherSupervisoryScoringDatabase["appraisalAssessmentScore"];
  membership: TeacherSupervisoryScoringDatabase["membership"];
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<ReviewerAssignmentRecord[]>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    create(args: unknown): Promise<ReviewRecord>;
  };
  appraisalCycle: {
    updateMany(args: unknown): Promise<CountResult>;
  };
  auditLog: TeacherSupervisoryScoringDatabase["auditLog"];
};

export type TeacherSupervisoryCorrectionFinalizationDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentProbeRecord | null>;
  };
  $transaction<T>(
    operation: (
      tx: TeacherSupervisoryCorrectionFinalizationTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

const probeSelect = {
  id: true,
  cycleId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  status: true,
  revision: true,
  priorAssessmentId: true,
  assessmentHash: true,
  finalizedAt: true,
  metadata: true,
  cycle: {
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      status: true,
      reviewStartedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
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
  const identifier = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(identifier)) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return identifier;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function canonicalReviewerRole(value: unknown): TeacherSupervisoryReviewerRole {
  const role = normalized(value);
  if (role === "HEAD_OF_SUPERVISION" || role === "DISTRICT_DIRECTOR") {
    return role;
  }
  fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_REVIEWER_ROLE_INVALID", 409, {
    role,
  });
}

function reviewerAssignmentIsCurrent(input: {
  assignment: ReviewerAssignmentRecord;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  districtZoneId: string;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.id !== input.reviewerAssignmentId ||
    assignment.userId !== input.reviewerUserId ||
    normalized(assignment.role) !== input.reviewerRole ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtZoneId ||
    assignment.zone.id !== input.districtZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    return false;
  }

  if (
    assignment.startsAt &&
    assignment.startsAt.getTime() > input.now.getTime()
  ) {
    return false;
  }

  if (
    assignment.endsAt &&
    assignment.endsAt.getTime() <= input.now.getTime()
  ) {
    return false;
  }

  return true;
}

function scoringDatabaseAdapter(
  tx: TeacherSupervisoryCorrectionFinalizationTransactionClient,
): TeacherSupervisoryScoringDatabase {
  const directTransaction = (async (operation: unknown) => {
    if (typeof operation !== "function") {
      fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_TRANSACTION_INVALID", 500);
    }
    return (operation as (innerTx: unknown) => Promise<unknown>)(tx);
  }) as TeacherSupervisoryScoringDatabase["$transaction"];

  return {
    appraisalAssessment: tx.appraisalAssessment,
    appraisalAssessmentScore: tx.appraisalAssessmentScore,
    membership: tx.membership,
    governanceOfficerAssignment:
      tx.governanceOfficerAssignment as unknown as
        TeacherSupervisoryScoringDatabase["governanceOfficerAssignment"],
    auditLog: tx.auditLog,
    $transaction: directTransaction,
  };
}

async function findProbe(
  database: Pick<TeacherSupervisoryCorrectionFinalizationDatabase, "appraisalAssessment">,
  assessmentId: string,
) {
  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: probeSelect,
  });

  if (!record) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_ASSESSMENT_NOT_FOUND", 404);
  }

  return record;
}

function correctionMetadata(record: AssessmentProbeRecord) {
  const metadata = objectValue(record.metadata);

  if (metadata.correctionRevision !== true) {
    return null;
  }

  const sourceAssessmentId = clean(metadata.sourceAssessmentId);
  const sourceAssessmentHash = clean(metadata.sourceAssessmentHash).toLowerCase();
  const sourceObservationContextHash = clean(
    metadata.sourceObservationContextHash,
  ).toLowerCase();
  const returnReviewId = clean(metadata.returnReviewId);
  const returnReviewStage = Number(metadata.returnReviewStage);
  const returningReviewerUserId = clean(metadata.returningReviewerUserId);
  const returningReviewerAssignmentId = clean(
    metadata.returningReviewerAssignmentId,
  );
  const returningReviewerRole = canonicalReviewerRole(
    metadata.returningReviewerRole,
  );
  const returnReviewEvidenceHash = clean(
    metadata.returnReviewEvidenceHash,
  ).toLowerCase();
  const returnDecisionRequestHash = clean(
    metadata.returnDecisionRequestHash,
  ).toLowerCase();
  const returnDecisionEvidenceHash = clean(
    metadata.returnDecisionEvidenceHash,
  ).toLowerCase();

  if (
    !record.priorAssessmentId ||
    sourceAssessmentId !== record.priorAssessmentId ||
    !isSha256(sourceAssessmentHash) ||
    !isSha256(sourceObservationContextHash) ||
    !returnReviewId ||
    !Number.isInteger(returnReviewStage) ||
    returnReviewStage < 1 ||
    !returningReviewerUserId ||
    !returningReviewerAssignmentId ||
    !isSha256(returnReviewEvidenceHash) ||
    !isSha256(returnDecisionRequestHash) ||
    !isSha256(returnDecisionEvidenceHash)
  ) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_PROVENANCE_INVALID", 409);
  }

  return {
    sourceAssessmentId,
    sourceAssessmentHash,
    sourceObservationContextHash,
    returnReviewId,
    returnReviewStage,
    returningReviewerUserId,
    returningReviewerAssignmentId,
    returningReviewerRole,
    returnReviewEvidenceHash,
    returnDecisionRequestHash,
    returnDecisionEvidenceHash,
  };
}

async function assertSourceAndReturnReview(input: {
  tx: TeacherSupervisoryCorrectionFinalizationTransactionClient;
  record: AssessmentProbeRecord;
  provenance: NonNullable<ReturnType<typeof correctionMetadata>>;
}) {
  const sourceEvidence = await verifyTeacherSupervisorySealedAssessmentEvidence({
    assessmentId: input.provenance.sourceAssessmentId,
    allowedStatuses: ["SUPERSEDED"],
    database: input.tx as unknown as Pick<
      TeacherSupervisoryScoringDatabase,
      "appraisalAssessment"
    >,
  });

  if (
    sourceEvidence.cycleId !== input.record.cycleId ||
    sourceEvidence.assessorUserId !== input.record.assessorUserId ||
    sourceEvidence.assessorAssignmentId !==
      clean(input.record.assessorAssignmentId) ||
    sourceEvidence.assessmentHash !== input.provenance.sourceAssessmentHash ||
    sourceEvidence.observationContextHash !==
      input.provenance.sourceObservationContextHash
  ) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_SOURCE_DRIFT", 409);
  }

  const sourceReview = await input.tx.appraisalReview.findUnique({
    where: { id: input.provenance.returnReviewId },
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
  });

  const reviewMetadata = objectValue(sourceReview?.metadata);

  if (
    !sourceReview ||
    sourceReview.cycleId !== input.record.cycleId ||
    sourceReview.assessmentId !== input.provenance.sourceAssessmentId ||
    sourceReview.reviewerUserId !==
      input.provenance.returningReviewerUserId ||
    clean(sourceReview.reviewerAssignmentId) !==
      input.provenance.returningReviewerAssignmentId ||
    sourceReview.stage !== input.provenance.returnReviewStage ||
    normalized(sourceReview.decision) !==
      TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.requiredReturnDecision ||
    !sourceReview.decidedAt ||
    clean(reviewMetadata.decisionAction) !== "RETURN" ||
    clean(reviewMetadata.reviewEvidenceHash).toLowerCase() !==
      input.provenance.returnReviewEvidenceHash ||
    clean(reviewMetadata.decisionRequestHash).toLowerCase() !==
      input.provenance.returnDecisionRequestHash ||
    clean(reviewMetadata.decisionEvidenceHash).toLowerCase() !==
      input.provenance.returnDecisionEvidenceHash
  ) {
    fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_RETURN_REVIEW_DRIFT", 409);
  }

  return {
    sourceEvidence,
    sourceReview,
  };
}

async function requireReturningReviewerAssignment(input: {
  tx: TeacherSupervisoryCorrectionFinalizationTransactionClient;
  provenance: NonNullable<ReturnType<typeof correctionMetadata>>;
  districtZoneId: string;
  assessorUserId: string;
  assessorRole: string;
  now: Date;
}) {
  const assignments = await input.tx.governanceOfficerAssignment.findMany({
    where: {
      userId: input.provenance.returningReviewerUserId,
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
          isActive: true,
          zoneType: {
            select: {
              level: true,
            },
          },
        },
      },
    },
  });

  const matching = assignments.filter((assignment) =>
    reviewerAssignmentIsCurrent({
      assignment,
      reviewerUserId: input.provenance.returningReviewerUserId,
      reviewerAssignmentId: input.provenance.returningReviewerAssignmentId,
      reviewerRole: input.provenance.returningReviewerRole,
      districtZoneId: input.districtZoneId,
      now: input.now,
    }),
  );

  if (matching.length !== 1) {
    fail(
      "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_RETURNING_REVIEWER_ASSIGNMENT_INVALID",
      409,
      { matchingAssignments: matching.length },
    );
  }

  const authority = decideTeacherSupervisoryReviewAuthority({
    actorUserId: input.provenance.returningReviewerUserId,
    actorRoleName: input.provenance.returningReviewerRole,
    assessorUserId: input.assessorUserId,
    assessorRoleName: input.assessorRole,
    stage: input.provenance.returnReviewStage,
  });

  if (
    !authority.allowed ||
    authority.reviewerRole !== input.provenance.returningReviewerRole
  ) {
    fail(
      "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_RETURNING_REVIEWER_AUTHORITY_INVALID",
      409,
    );
  }

  return matching[0];
}

function reviewMetadata(input: {
  evidence: Awaited<
    ReturnType<typeof verifyTeacherSupervisoryFinalizedAssessmentEvidence>
  >;
  provenance: NonNullable<ReturnType<typeof correctionMetadata>>;
  reviewEvidenceHash: string;
  sourceReviewId: string;
}) {
  return {
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.evidenceStream,
    reviewType: "CORRECTION_CONTINUATION",
    reviewStage: input.provenance.returnReviewStage,
    reviewerRole: input.provenance.returningReviewerRole,
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    immutableEvidenceReverified: true,
    generalCommentIncludedInAssessmentHash: true,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
    continuationFromReturnedReview: true,
    sourceAssessmentId: input.provenance.sourceAssessmentId,
    sourceAssessmentHash: input.provenance.sourceAssessmentHash,
    sourceReviewId: input.sourceReviewId,
    sourceReviewStage: input.provenance.returnReviewStage,
    sourceReviewEvidenceHash: input.provenance.returnReviewEvidenceHash,
    sourceReturnDecisionRequestHash:
      input.provenance.returnDecisionRequestHash,
    sourceReturnDecisionEvidenceHash:
      input.provenance.returnDecisionEvidenceHash,
    preserveReturningReviewer: true,
    preserveReviewStage: true,
  };
}

function cycleMetadata(input: {
  cycleMetadata: unknown;
  evidence: Awaited<
    ReturnType<typeof verifyTeacherSupervisoryFinalizedAssessmentEvidence>
  >;
  provenance: NonNullable<ReturnType<typeof correctionMetadata>>;
  review: ReviewRecord;
  reviewEvidenceHash: string;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      ...objectValue(
        objectValue(input.cycleMetadata).teacherSupervisoryReview,
      ),
      schemaVersion: 1,
      reviewType: "CORRECTION_CONTINUATION",
      state: "PENDING_CORRECTION_REVIEW",
      currentReviewId: input.review.id,
      currentReviewStage: input.review.stage,
      currentReviewerRole: input.provenance.returningReviewerRole,
      currentReviewerAssignmentId:
        input.provenance.returningReviewerAssignmentId,
      reviewEvidenceHash: input.reviewEvidenceHash,
      admittedAssessmentId: input.evidence.assessmentId,
      admittedAssessmentRevision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      immutableEvidenceReverified: true,
      generalCommentIncludedInAssessmentHash: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
      awaitingRevision: false,
      correctionFinalized: true,
      continuationFromReturnedReview: true,
      sourceAssessmentId: input.provenance.sourceAssessmentId,
      sourceAssessmentHash: input.provenance.sourceAssessmentHash,
      sourceReviewId: input.provenance.returnReviewId,
      sourceReviewStage: input.provenance.returnReviewStage,
      sourceReviewEvidenceHash: input.provenance.returnReviewEvidenceHash,
      sourceReturnDecisionRequestHash:
        input.provenance.returnDecisionRequestHash,
      sourceReturnDecisionEvidenceHash:
        input.provenance.returnDecisionEvidenceHash,
      preserveReturningReviewer: true,
      preserveReviewStage: true,
    },
  };
}

function continuationFromExisting(input: {
  review: ReviewRecord;
  provenance: NonNullable<ReturnType<typeof correctionMetadata>>;
  sourceAssessmentHash: string;
  sourceReviewId: string;
}) {
  const metadata = objectValue(input.review.metadata);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();

  if (
    normalized(input.review.decision) !== "PENDING" ||
    input.review.reviewerUserId !==
      input.provenance.returningReviewerUserId ||
    clean(input.review.reviewerAssignmentId) !==
      input.provenance.returningReviewerAssignmentId ||
    input.review.stage !== input.provenance.returnReviewStage ||
    !isSha256(reviewEvidenceHash) ||
    clean(metadata.reviewType) !== "CORRECTION_CONTINUATION" ||
    clean(metadata.sourceAssessmentId) !==
      input.provenance.sourceAssessmentId ||
    clean(metadata.sourceAssessmentHash).toLowerCase() !==
      input.sourceAssessmentHash ||
    clean(metadata.sourceReviewId) !== input.sourceReviewId ||
    metadata.preserveReturningReviewer !== true ||
    metadata.preserveReviewStage !== true
  ) {
    fail(
      "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_EXISTING_REVIEW_DRIFT",
      409,
    );
  }

  return reviewEvidenceHash;
}

async function performFinalize(input: {
  tx: TeacherSupervisoryCorrectionFinalizationTransactionClient;
  request: FinalizeTeacherSupervisoryAssessmentWithContinuationInput;
  assessmentId: string;
  now: Date;
}) {
  return finalizeTeacherSupervisoryAssessment({
    actorUserId: input.request.actorUserId,
    actorRoleName: input.request.actorRoleName,
    assessmentId: input.assessmentId,
    reqId: input.request.reqId,
    ip: input.request.ip,
    userAgent: input.request.userAgent,
    now: input.now,
    database: scoringDatabaseAdapter(input.tx),
  });
}

async function performAtomicFinalization(
  input: {
    database: TeacherSupervisoryCorrectionFinalizationDatabase;
    request: FinalizeTeacherSupervisoryAssessmentWithContinuationInput;
    assessmentId: string;
    now: Date;
  },
): Promise<FinalizeTeacherSupervisoryAssessmentWithContinuationResult> {
  return input.database.$transaction(
    async (tx) => {
      const before = await findProbe(
        tx as unknown as Pick<
          TeacherSupervisoryCorrectionFinalizationDatabase,
          "appraisalAssessment"
        >,
        input.assessmentId,
      );
      const provenance = correctionMetadata(before);

      if (!provenance) {
        const result = await performFinalize({
          tx,
          request: input.request,
          assessmentId: input.assessmentId,
          now: input.now,
        });

        return {
          result,
          reviewCreated: false,
          cycleTransitioned: false,
          continuation: null,
          providerCalled: false,
        };
      }

      if (
        normalized(before.cycle.status) !==
          TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.requiredCycleStatus ||
        before.cycle.releasedAt ||
        before.cycle.cancelledAt ||
        !before.cycle.reviewStartedAt
      ) {
        fail(
          "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_CYCLE_INVALID",
          409,
        );
      }

      const { sourceEvidence, sourceReview } =
        await assertSourceAndReturnReview({
          tx,
          record: before,
          provenance,
        });

      await requireReturningReviewerAssignment({
        tx,
        provenance,
        districtZoneId: before.cycle.scopeZoneId,
        assessorUserId: before.assessorUserId,
        assessorRole: sourceEvidence.assessorRole,
        now: input.now,
      });

      const result = await performFinalize({
        tx,
        request: input.request,
        assessmentId: input.assessmentId,
        now: input.now,
      });

      const evidence =
        await verifyTeacherSupervisoryFinalizedAssessmentEvidence({
          assessmentId: input.assessmentId,
          database: tx as unknown as Pick<
            TeacherSupervisoryScoringDatabase,
            "appraisalAssessment"
          >,
        });

      if (
        evidence.cycleId !== before.cycleId ||
        evidence.assessorUserId !== before.assessorUserId ||
        evidence.assessorAssignmentId !== clean(before.assessorAssignmentId) ||
        evidence.observationContextHash !==
          provenance.sourceObservationContextHash ||
        evidence.revision !== before.revision
      ) {
        fail(
          "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_FINALIZED_EVIDENCE_DRIFT",
          409,
        );
      }

      const expectedReviewEvidenceHash =
        computeTeacherSupervisoryReviewEvidenceHash({
          evidence,
          reviewerUserId: provenance.returningReviewerUserId,
          reviewerAssignmentId:
            provenance.returningReviewerAssignmentId,
          reviewerRole: provenance.returningReviewerRole,
          reviewStage: provenance.returnReviewStage,
        });

      const existingReview = await tx.appraisalReview.findUnique({
        where: {
          assessmentId_stage: {
            assessmentId: evidence.assessmentId,
            stage: provenance.returnReviewStage,
          },
        },
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
      });

      let resumedReview = existingReview;
      let reviewCreated = false;

      if (existingReview) {
        const existingHash = continuationFromExisting({
          review: existingReview,
          provenance,
          sourceAssessmentHash: provenance.sourceAssessmentHash,
          sourceReviewId: sourceReview.id,
        });

        if (existingHash !== expectedReviewEvidenceHash) {
          fail(
            "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_EXISTING_HASH_DRIFT",
            409,
          );
        }
      } else {
        resumedReview = await tx.appraisalReview.create({
          data: {
            cycleId: evidence.cycleId,
            assessmentId: evidence.assessmentId,
            reviewerUserId: provenance.returningReviewerUserId,
            reviewerAssignmentId:
              provenance.returningReviewerAssignmentId,
            stage: provenance.returnReviewStage,
            decision: "PENDING",
            note: null,
            decidedAt: null,
            metadata: reviewMetadata({
              evidence,
              provenance,
              reviewEvidenceHash: expectedReviewEvidenceHash,
              sourceReviewId: sourceReview.id,
            }),
          },
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
        });
        reviewCreated = true;
      }

      if (!resumedReview) {
        fail(
          "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_REVIEW_CREATE_FAILED",
          409,
        );
      }

      const cycleUpdate = await tx.appraisalCycle.updateMany({
        where: {
          id: evidence.cycleId,
          status: "UNDER_REVIEW",
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          metadata: cycleMetadata({
            cycleMetadata: before.cycle.metadata,
            evidence,
            provenance,
            review: resumedReview,
            reviewEvidenceHash: expectedReviewEvidenceHash,
          }) as Prisma.InputJsonValue,
        },
      });

      if (cycleUpdate.count !== 1) {
        fail(
          "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_CYCLE_WRITE_RACE",
          409,
        );
      }

      if (reviewCreated) {
        await tx.auditLog.create({
          data: {
            tenantId: evidence.targetTenantId,
            userId: evidence.assessorUserId,
            action: CORRECTION_FINALIZED_AUDIT_ACTION,
            resource: "AppraisalAssessment",
            resourceId: evidence.assessmentId,
            ip: input.request.ip ?? undefined,
            userAgent: input.request.userAgent ?? undefined,
            metadata: {
              reqId: input.request.reqId ?? null,
              action: CORRECTION_FINALIZED_AUDIT_ACTION,
              workflow:
                TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.workflow,
              evidenceStream:
                TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.evidenceStream,
              cycleId: evidence.cycleId,
              assessmentId: evidence.assessmentId,
              revision: evidence.revision,
              assessmentHash: evidence.assessmentHash,
              observationContextHash: evidence.observationContextHash,
              sourceAssessmentId: provenance.sourceAssessmentId,
              sourceAssessmentHash: provenance.sourceAssessmentHash,
              sourceReviewId: sourceReview.id,
              sourceReviewStage: sourceReview.stage,
              sourceReviewEvidenceHash:
                provenance.returnReviewEvidenceHash,
              resumedReviewId: resumedReview.id,
              resumedReviewStage: resumedReview.stage,
              resumedReviewerUserId: resumedReview.reviewerUserId,
              resumedReviewerAssignmentId:
                resumedReview.reviewerAssignmentId,
              resumedReviewerRole:
                provenance.returningReviewerRole,
              resumedReviewEvidenceHash:
                expectedReviewEvidenceHash,
              preserveReturningReviewer: true,
              preserveReviewStage: true,
              scoreValuesRecordedInAudit: false,
              aggregateScoreRecordedInAudit: false,
              generalCommentRecordedInAudit: false,
              returnReasonTextRecordedInAudit: false,
              observationDetailsRecordedInAudit: false,
              classEnrolmentRecordedInAudit: false,
              contactFieldsIncluded: false,
              cycleStatusChanged: false,
              reviewerMayRewriteScores: false,
              reviewerMayRewriteComment: false,
              legacyTeacherAppraisalIncluded: false,
              combinedWeightingDefined: false,
              notificationsSeeded: false,
              providerCalled: false,
            },
          },
        });
      }

      return {
        result,
        reviewCreated,
        cycleTransitioned: false,
        continuation: {
          reviewId: resumedReview.id,
          reviewStage: resumedReview.stage,
          reviewerUserId: resumedReview.reviewerUserId,
          reviewerAssignmentId: clean(
            resumedReview.reviewerAssignmentId,
          ),
          reviewerRole: provenance.returningReviewerRole,
          reviewDecision: "PENDING",
          reviewEvidenceHash: expectedReviewEvidenceHash,
          sourceAssessmentId: provenance.sourceAssessmentId,
          sourceAssessmentHash: provenance.sourceAssessmentHash,
          sourceReviewId: sourceReview.id,
          sourceReviewEvidenceHash:
            provenance.returnReviewEvidenceHash,
        },
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.transactionMaxWaitMs,
      timeout:
        TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_POLICY.transactionTimeoutMs,
    },
  );
}

function retryable(error: unknown) {
  const code = clean((error as { code?: unknown })?.code);
  return (
    code === "P2002" ||
    code === "P2034" ||
    code ===
      "TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_CYCLE_WRITE_RACE"
  );
}

export async function finalizeTeacherSupervisoryAssessmentWithContinuation(
  input: FinalizeTeacherSupervisoryAssessmentWithContinuationInput,
): Promise<FinalizeTeacherSupervisoryAssessmentWithContinuationResult> {
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryCorrectionFinalizationDatabase);
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  requireIdentifier(input.actorUserId, "actorUserId");
  const now = requireNow(input.now);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await performAtomicFinalization({
        database,
        request: input,
        assessmentId,
        now,
      });
    } catch (error) {
      if (attempt === 0 && retryable(error)) continue;
      throw error;
    }
  }

  fail("TEACHER_SUPERVISORY_CORRECTION_FINALIZATION_CONCURRENT_FAILED", 409);
}
