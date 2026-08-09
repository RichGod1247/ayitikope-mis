import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
  decideTeacherSupervisoryAssessmentAuthority,
  planReturnedTeacherSupervisoryRevision,
  type TeacherSupervisoryGovernanceAssignment,
  type TeacherSupervisoryTarget,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  planTeacherSupervisoryCorrectionContinuation,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  computeTeacherSupervisoryCorrectionRevisionKey,
  verifyTeacherSupervisorySealedAssessmentEvidence,
  type TeacherSupervisoryScoringDatabase,
  type TeacherSupervisorySealedAssessmentEvidence,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";

export const TEACHER_SUPERVISORY_REVISION_POLICY = {
  schemaVersion: 1,
  revisionEvidenceSchemaVersion: 1,
  eligibleCycleStatus: "UNDER_REVIEW",
  returnedStatus: "RETURNED",
  supersededStatus: "SUPERSEDED",
  newRevisionStatus: "DRAFT",
  returnDecision: "RETURNED",
  preserveObservationContext: true,
  copyScoreRows: true,
  copyGeneralComment: true,
  expectedScoreCount: 34,
  finalizedSourceImmutable: true,
  originalAssessorOnly: true,
  currentAssessorAuthorityRequired: true,
  preserveReturningReviewerForCorrection: true,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  observationDetailsRewriteAllowed: false,
  governanceEnrolmentRewriteAllowed: false,
  teacherAssignmentProvenanceRewriteAllowed: false,
  curriculumProvenanceRewriteAllowed: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  cycleMutationAllowed: false,
  reviewMutationAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const REVISION_CREATED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_ASSESSMENT_REVISION_CREATED";

export type CreateReturnedTeacherSupervisoryRevisionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  returnedAssessmentId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryRevisionDatabase;
};

export type TeacherSupervisoryRevisionSummary = {
  id: string;
  cycleId: string;
  status: AppraisalAssessmentStatus;
  revision: number;
  priorAssessmentId: string;
  assessorUserId: string;
  assessorAssignmentId: string;
  assessorRole: string;
  targetUserId: string;
  targetTenantId: string;
  targetCircuitZoneId: string;
  targetDistrictZoneId: string;
  instrumentVersionId: string;
  dateObserved: string;
  observationContextHash: string;
  sourceAssessmentHash: string;
  returnReviewId: string;
  returnReviewStage: number;
  returningReviewerRole: string;
  returnReviewEvidenceHash: string;
  returnDecisionRequestHash: string;
  returnDecisionEvidenceHash: string;
  revisionKey: string;
  copiedScoreCount: number;
  generalCommentCopied: true;
  createdAt: string;
  providerCalled: false;
};

export type CreateReturnedTeacherSupervisoryRevisionResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  originalAssessmentId: string;
  originalStatus: "SUPERSEDED";
  returnReason: string;
  revision: TeacherSupervisoryRevisionSummary;
};

type ScoreRecord = {
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
  scores: ScoreRecord[];
  reviews: ReviewRecord[];
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
    _count: {
      participants: number;
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
  };
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
  };
  tenant: {
    id: string;
    status: string;
    zone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: {
        level: number;
        countryCode: string;
      };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: {
          level: number;
          countryCode: string;
        };
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
    zoneType: {
      level: number;
      countryCode: string;
    };
    parentZone: null | {
      id: string;
      name: string;
      isActive: boolean;
      zoneType: {
        level: number;
        countryCode: string;
      };
    };
  };
};

type AssessmentDelegate = {
  findUnique(args: unknown): Promise<AssessmentRecord | null>;
  create(args: unknown): Promise<AssessmentRecord>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

export type TeacherSupervisoryRevisionTransactionClient = {
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

export type TeacherSupervisoryRevisionDatabase = {
  appraisalAssessment: AssessmentDelegate;
  $transaction<T>(
    operation: (
      tx: TeacherSupervisoryRevisionTransactionClient,
    ) => Promise<T>,
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
      responseWindowDays: true,
      minimumResponses: true,
      openedAt: true,
      deadlineAt: true,
      closedAt: true,
      reviewStartedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
      _count: {
        select: {
          participants: true,
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
    fail("TEACHER_SUPERVISORY_REVISION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_REVISION_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function targetFromMembership(
  record: AssessmentRecord,
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
    zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    zone.id !== record.cycle.targetZoneId ||
    district.id !== record.cycle.scopeZoneId
  ) {
    fail("TEACHER_SUPERVISORY_REVISION_TARGET_CONTEXT_INVALID", 409);
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

async function assertCurrentOriginalAssessorAuthority(
  tx: TeacherSupervisoryRevisionTransactionClient,
  record: AssessmentRecord,
  input: {
    actorUserId: string;
    actorRoleName: string;
    now: Date;
  },
) {
  if (record.assessorUserId !== input.actorUserId) {
    fail("TEACHER_SUPERVISORY_REVISION_ORIGINAL_ASSESSOR_ONLY", 403);
  }

  const membership = await tx.membership.findFirst({
    where: {
      userId: record.cycle.targetUserId,
      tenantId: record.cycle.targetTenantId,
      status: "ACTIVE",
      role: {
        name: "TEACHER",
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: {
        select: {
          name: true,
        },
      },
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
    },
  });

  if (!membership) {
    fail("TEACHER_SUPERVISORY_REVISION_TARGET_NOT_FOUND", 404);
  }

  const assignments = await tx.governanceOfficerAssignment.findMany({
    where: {
      userId: input.actorUserId,
    },
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
  });

  const decision = decideTeacherSupervisoryAssessmentAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    target: targetFromMembership(record, membership),
    assignments: assignmentInputs(assignments),
    now: input.now,
  });

  if (!decision.allowed) {
    fail(`TEACHER_SUPERVISORY_REVISION_AUTHORITY_${decision.reason}`, 403, {
      reason: decision.reason,
    });
  }

  if (decision.assignmentId !== record.assessorAssignmentId) {
    fail("TEACHER_SUPERVISORY_REVISION_ASSESSOR_ASSIGNMENT_DRIFT", 409);
  }

  return decision;
}

function currentReturnReview(record: AssessmentRecord) {
  const returned = record.reviews.filter(
    (review) =>
      normalized(review.decision) === "RETURNED" &&
      clean(objectValue(review.metadata).decisionAction) === "RETURN",
  );

  if (returned.length !== 1) {
    fail("TEACHER_SUPERVISORY_REVISION_RETURN_REVIEW_INVALID", 409, {
      returnedReviews: returned.length,
    });
  }

  const review = returned[0];

  if (
    review.assessmentId !== record.id ||
    review.cycleId !== record.cycleId ||
    !review.reviewerUserId ||
    !clean(review.reviewerAssignmentId) ||
    !review.decidedAt ||
    clean(review.note).length < 3 ||
    record.reviews.some((candidate) => candidate.stage > review.stage)
  ) {
    fail("TEACHER_SUPERVISORY_REVISION_RETURN_REVIEW_DRIFT", 409);
  }

  return review;
}

function verifyReturnProvenance(input: {
  record: AssessmentRecord;
  evidence: TeacherSupervisorySealedAssessmentEvidence;
  review: ReviewRecord;
}) {
  const sourceReturn = objectValue(
    objectValue(input.record.metadata).teacherSupervisoryReturn,
  );
  const reviewMetadata = objectValue(input.review.metadata);
  const cycleReview = objectValue(
    objectValue(input.record.cycle.metadata).teacherSupervisoryReview,
  );
  const reason = clean(input.review.note);
  const reasonHash = hashJson(reason);
  const reviewEvidenceHash = clean(
    reviewMetadata.reviewEvidenceHash,
  ).toLowerCase();
  const decisionRequestHash = clean(
    reviewMetadata.decisionRequestHash,
  ).toLowerCase();
  const decisionEvidenceHash = clean(
    reviewMetadata.decisionEvidenceHash,
  ).toLowerCase();
  const reviewerRole = normalized(reviewMetadata.decidedByRole);

  if (
    normalized(input.record.cycle.status) !==
      TEACHER_SUPERVISORY_REVISION_POLICY.eligibleCycleStatus ||
    !input.record.cycle.openedAt ||
    !input.record.cycle.closedAt ||
    !input.record.cycle.reviewStartedAt ||
    input.record.cycle.releasedAt ||
    input.record.cycle.cancelledAt ||
    input.record.cycle.responseWindowDays !== 0 ||
    input.record.cycle.minimumResponses !== 0 ||
    input.record.cycle._count.participants !== 0 ||
    !isSha256(reviewEvidenceHash) ||
    !isSha256(decisionRequestHash) ||
    !isSha256(decisionEvidenceHash) ||
    !isSha256(reasonHash) ||
    clean(reviewMetadata.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(reviewMetadata.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(reviewMetadata.decidedByUserId) !== input.review.reviewerUserId ||
    clean(reviewMetadata.decidedByAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    (reviewerRole !== "HEAD_OF_SUPERVISION" &&
      reviewerRole !== "DISTRICT_DIRECTOR") ||
    clean(reviewMetadata.reasonHash).toLowerCase() !== reasonHash ||
    Number(reviewMetadata.reasonLength) !== reason.length ||
    reviewMetadata.revisionRequired !== true ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.reviewerMayRewriteComment !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.commentMutationPerformed !== false ||
    reviewMetadata.legacyTeacherAppraisalIncluded !== false ||
    reviewMetadata.combinedWeightingDefined !== false ||
    reviewMetadata.providerCalled !== false ||
    clean(sourceReturn.sourceReviewId) !== input.review.id ||
    Number(sourceReturn.sourceReviewStage) !== input.review.stage ||
    clean(sourceReturn.returningReviewerUserId) !== input.review.reviewerUserId ||
    clean(sourceReturn.returningReviewerAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    normalized(sourceReturn.returningReviewerRole) !== reviewerRole ||
    clean(sourceReturn.sourceReviewEvidenceHash).toLowerCase() !==
      reviewEvidenceHash ||
    clean(sourceReturn.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(sourceReturn.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(sourceReturn.returnDecisionRequestHash).toLowerCase() !==
      decisionRequestHash ||
    clean(sourceReturn.returnDecisionEvidenceHash).toLowerCase() !==
      decisionEvidenceHash ||
    clean(sourceReturn.reasonHash).toLowerCase() !== reasonHash ||
    Number(sourceReturn.reasonLength) !== reason.length ||
    sourceReturn.preserveReturningReviewerForCorrection !== true ||
    sourceReturn.reviewerMayRewriteScores !== false ||
    sourceReturn.reviewerMayRewriteComment !== false ||
    sourceReturn.scoreMutationPerformed !== false ||
    sourceReturn.commentMutationPerformed !== false ||
    sourceReturn.legacyTeacherAppraisalIncluded !== false ||
    sourceReturn.combinedWeightingDefined !== false ||
    sourceReturn.providerCalled !== false ||
    clean(cycleReview.state) !== "RETURNED_FOR_CORRECTION" ||
    cycleReview.awaitingRevision !== true ||
    clean(cycleReview.currentReviewId) !== input.review.id ||
    Number(cycleReview.currentReviewStage) !== input.review.stage ||
    normalized(cycleReview.currentReviewerRole) !== reviewerRole ||
    clean(cycleReview.currentReviewerAssignmentId) !==
      clean(input.review.reviewerAssignmentId) ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !== reviewEvidenceHash ||
    clean(cycleReview.admittedAssessmentId) !== input.evidence.assessmentId ||
    Number(cycleReview.admittedAssessmentRevision) !== input.evidence.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReview.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(cycleReview.returnDecisionRequestHash).toLowerCase() !==
      decisionRequestHash ||
    clean(cycleReview.returnDecisionEvidenceHash).toLowerCase() !==
      decisionEvidenceHash ||
    cycleReview.preserveReturningReviewerForCorrection !== true
  ) {
    fail("TEACHER_SUPERVISORY_REVISION_RETURN_PROVENANCE_DRIFT", 409);
  }

  const continuation = planTeacherSupervisoryCorrectionContinuation({
    assessorRoleName: input.evidence.assessorRole,
    returningReviewerRoleName: reviewerRole,
    reviewStage: input.review.stage,
  });

  if (
    !continuation.ok ||
    continuation.value.preserveReturningReviewer !== true ||
    continuation.value.reviewDecision !== "PENDING" ||
    continuation.value.reviewerMayRewriteScores !== false ||
    continuation.value.reviewerMayRewriteComment !== false
  ) {
    fail("TEACHER_SUPERVISORY_REVISION_CONTINUATION_INVALID", 409);
  }

  return {
    reason,
    reasonHash,
    reviewEvidenceHash,
    decisionRequestHash,
    decisionEvidenceHash,
    reviewerRole,
  };
}

function revisionBaseMetadata(sourceMetadata: unknown) {
  const omitted = new Set([
    "assessmentHash",
    "assessmentHashSchemaVersion",
    "scoringSchemaVersion",
    "answeredItemCount",
    "notApplicableItemCount",
    "finalizedScoresImmutable",
    "finalizedCommentImmutable",
    "generalCommentIncludedInHash",
    "teacherSupervisoryReturn",
  ]);

  return Object.fromEntries(
    Object.entries(objectValue(sourceMetadata)).filter(
      ([key]) => !omitted.has(key),
    ),
  );
}

function expectedRevisionMetadata(input: {
  source: AssessmentRecord;
  evidence: TeacherSupervisorySealedAssessmentEvidence;
  returnReview: ReviewRecord;
  returnProvenance: ReturnType<typeof verifyReturnProvenance>;
  newRevisionNumber: number;
  revisionKey: string;
}) {
  return {
    ...revisionBaseMetadata(input.source.metadata),
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    revisionSchemaVersion:
      TEACHER_SUPERVISORY_REVISION_POLICY.revisionEvidenceSchemaVersion,
    revisionKey: input.revisionKey,
    sourceAssessmentId: input.source.id,
    sourceAssessmentHash: input.evidence.assessmentHash,
    sourceObservationContextHash: input.evidence.observationContextHash,
    sourceRevision: input.source.revision,
    returnReviewId: input.returnReview.id,
    returnReviewStage: input.returnReview.stage,
    returningReviewerUserId: input.returnReview.reviewerUserId,
    returningReviewerAssignmentId: clean(
      input.returnReview.reviewerAssignmentId,
    ),
    returningReviewerRole: input.returnProvenance.reviewerRole,
    returnReviewEvidenceHash: input.returnProvenance.reviewEvidenceHash,
    returnDecisionRequestHash: input.returnProvenance.decisionRequestHash,
    returnDecisionEvidenceHash: input.returnProvenance.decisionEvidenceHash,
    returnReason: input.returnProvenance.reason,
    returnReasonHash: input.returnProvenance.reasonHash,
    returnReasonLength: input.returnProvenance.reason.length,
    preserveObservationContext: true,
    copyScores: true,
    copyGeneralComment: true,
    copiedScoreCount: input.source.scores.length,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    returnedAssessmentRequiresRevision: true,
    correctionRevision: true,
    correctionRevisionNumber: input.newRevisionNumber,
    separateFromLegacyTeacherAppraisal: true,
    legacyTeacherAppraisalMutationAllowed: false,
    combinedWeightingDefined: false,
    providerCalled: false,
  };
}

function revisionMatches(input: {
  revision: AssessmentRecord;
  source: AssessmentRecord;
  evidence: TeacherSupervisorySealedAssessmentEvidence;
  returnReview: ReviewRecord;
  returnProvenance: ReturnType<typeof verifyReturnProvenance>;
  expectedRevisionKey: string;
}) {
  const metadata = objectValue(input.revision.metadata);
  const scoreKeys = input.revision.scores.map((score) => ({
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
  const sourceScoreKeys = input.source.scores.map((score) => ({
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

  return (
    input.revision.cycleId === input.source.cycleId &&
    input.revision.instrumentVersionId === input.source.instrumentVersionId &&
    input.revision.assessorUserId === input.source.assessorUserId &&
    input.revision.assessorAssignmentId === input.source.assessorAssignmentId &&
    normalized(input.revision.status) === "DRAFT" &&
    input.revision.revision === input.source.revision + 1 &&
    input.revision.priorAssessmentId === input.source.id &&
    input.revision.dateObserved?.toISOString() ===
      input.source.dateObserved?.toISOString() &&
    input.revision.overallPercentage === null &&
    Object.keys(objectValue(input.revision.sectionPercentagesJson)).length ===
      0 &&
    input.revision.generalComment === input.source.generalComment &&
    JSON.stringify(stableValue(input.revision.evidenceSnapshotJson)) ===
      JSON.stringify(stableValue(input.source.evidenceSnapshotJson)) &&
    input.revision.assessmentHash === null &&
    input.revision.finalizedByUserId === null &&
    input.revision.finalizedAt === null &&
    input.revision.scores.length === TEACHER_SUPERVISORY_REVISION_POLICY.expectedScoreCount &&
    JSON.stringify(scoreKeys) === JSON.stringify(sourceScoreKeys) &&
    Number(metadata.revisionSchemaVersion) ===
      TEACHER_SUPERVISORY_REVISION_POLICY.revisionEvidenceSchemaVersion &&
    clean(metadata.revisionKey).toLowerCase() === input.expectedRevisionKey &&
    clean(metadata.sourceAssessmentId) === input.source.id &&
    clean(metadata.sourceAssessmentHash).toLowerCase() ===
      input.evidence.assessmentHash &&
    clean(metadata.sourceObservationContextHash).toLowerCase() ===
      input.evidence.observationContextHash &&
    clean(metadata.returnReviewId) === input.returnReview.id &&
    Number(metadata.returnReviewStage) === input.returnReview.stage &&
    clean(metadata.returningReviewerUserId) === input.returnReview.reviewerUserId &&
    clean(metadata.returningReviewerAssignmentId) ===
      clean(input.returnReview.reviewerAssignmentId) &&
    normalized(metadata.returningReviewerRole) ===
      input.returnProvenance.reviewerRole &&
    clean(metadata.returnReviewEvidenceHash).toLowerCase() ===
      input.returnProvenance.reviewEvidenceHash &&
    clean(metadata.returnDecisionRequestHash).toLowerCase() ===
      input.returnProvenance.decisionRequestHash &&
    clean(metadata.returnDecisionEvidenceHash).toLowerCase() ===
      input.returnProvenance.decisionEvidenceHash &&
    clean(metadata.returnReason) === input.returnProvenance.reason &&
    clean(metadata.returnReasonHash).toLowerCase() ===
      input.returnProvenance.reasonHash &&
    Number(metadata.returnReasonLength) === input.returnProvenance.reason.length &&
    metadata.preserveObservationContext === true &&
    metadata.copyScores === true &&
    metadata.copyGeneralComment === true &&
    Number(metadata.copiedScoreCount) ===
      TEACHER_SUPERVISORY_REVISION_POLICY.expectedScoreCount &&
    metadata.reviewerMayRewriteScores === false &&
    metadata.reviewerMayRewriteComment === false &&
    metadata.returnedAssessmentRequiresRevision === true &&
    metadata.separateFromLegacyTeacherAppraisal === true &&
    metadata.combinedWeightingDefined === false &&
    metadata.providerCalled === false
  );
}

function summary(input: {
  revision: AssessmentRecord;
  evidence: TeacherSupervisorySealedAssessmentEvidence;
  returnReview: ReviewRecord;
  returnProvenance: ReturnType<typeof verifyReturnProvenance>;
}): TeacherSupervisoryRevisionSummary {
  const metadata = objectValue(input.revision.metadata);

  if (
    !input.revision.dateObserved ||
    !input.revision.priorAssessmentId ||
    !input.revision.assessorAssignmentId
  ) {
    fail("TEACHER_SUPERVISORY_REVISION_SUMMARY_INCOMPLETE", 409);
  }

  return {
    id: input.revision.id,
    cycleId: input.revision.cycleId,
    status: normalized(input.revision.status) as AppraisalAssessmentStatus,
    revision: input.revision.revision,
    priorAssessmentId: input.revision.priorAssessmentId,
    assessorUserId: input.revision.assessorUserId,
    assessorAssignmentId: input.revision.assessorAssignmentId,
    assessorRole: canonicalTeacherSupervisoryAssessorRole(
      input.evidence.assessorRole,
    ),
    targetUserId: input.evidence.targetUserId,
    targetTenantId: input.evidence.targetTenantId,
    targetCircuitZoneId: input.evidence.targetCircuitZoneId,
    targetDistrictZoneId: input.evidence.targetDistrictZoneId,
    instrumentVersionId: input.revision.instrumentVersionId,
    dateObserved: isoDateOnly(input.revision.dateObserved),
    observationContextHash: input.evidence.observationContextHash,
    sourceAssessmentHash: input.evidence.assessmentHash,
    returnReviewId: input.returnReview.id,
    returnReviewStage: input.returnReview.stage,
    returningReviewerRole: input.returnProvenance.reviewerRole,
    returnReviewEvidenceHash: input.returnProvenance.reviewEvidenceHash,
    returnDecisionRequestHash: input.returnProvenance.decisionRequestHash,
    returnDecisionEvidenceHash: input.returnProvenance.decisionEvidenceHash,
    revisionKey: clean(metadata.revisionKey).toLowerCase(),
    copiedScoreCount: input.revision.scores.length,
    generalCommentCopied: true,
    createdAt: input.revision.createdAt.toISOString(),
    providerCalled: false,
  };
}

async function findAssessment(
  database: Pick<TeacherSupervisoryRevisionDatabase, "appraisalAssessment">,
  assessmentId: string,
) {
  const record = await database.appraisalAssessment.findUnique({
    where: {
      id: assessmentId,
    },
    select: assessmentSelect,
  });

  if (!record) {
    fail("TEACHER_SUPERVISORY_REVISION_ASSESSMENT_NOT_FOUND", 404);
  }

  return record;
}

async function performRevisionTransaction(input: {
  database: TeacherSupervisoryRevisionDatabase;
  actorUserId: string;
  actorRoleName: string;
  returnedAssessmentId: string;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
}): Promise<CreateReturnedTeacherSupervisoryRevisionResult> {
  return input.database.$transaction(
    async (tx) => {
      const source = await findAssessment(tx, input.returnedAssessmentId);

      if (
        normalized(source.status) !== "RETURNED" &&
        normalized(source.status) !== "SUPERSEDED"
      ) {
        fail("TEACHER_SUPERVISORY_REVISION_RETURNED_STATUS_REQUIRED", 409, {
          status: normalized(source.status),
        });
      }

      const evidence = await verifyTeacherSupervisorySealedAssessmentEvidence({
        assessmentId: source.id,
        allowedStatuses: ["RETURNED", "SUPERSEDED"],
        database: tx as unknown as Pick<
          TeacherSupervisoryScoringDatabase,
          "appraisalAssessment"
        >,
      });

      if (
        evidence.assessorUserId !== input.actorUserId ||
        evidence.assessorAssignmentId !== clean(source.assessorAssignmentId) ||
        source.scores.length !== TEACHER_SUPERVISORY_REVISION_POLICY.expectedScoreCount
      ) {
        fail("TEACHER_SUPERVISORY_REVISION_SOURCE_PROOF_DRIFT", 409);
      }

      const returnReview = currentReturnReview(source);
      const returnProvenance = verifyReturnProvenance({
        record: source,
        evidence,
        review: returnReview,
      });

      await assertCurrentOriginalAssessorAuthority(tx, source, {
        actorUserId: input.actorUserId,
        actorRoleName: input.actorRoleName,
        now: input.now,
      });

      const newRevisionNumber = source.revision + 1;
      const revisionKey = computeTeacherSupervisoryCorrectionRevisionKey({
        cycleId: source.cycleId,
        sourceAssessmentId: source.id,
        sourceAssessmentHash: evidence.assessmentHash,
        sourceObservationContextHash: evidence.observationContextHash,
        revisionNumber: newRevisionNumber,
        assessorUserId: source.assessorUserId,
        assessorAssignmentId: clean(source.assessorAssignmentId),
        returnReviewId: returnReview.id,
        returnReviewStage: returnReview.stage,
        returningReviewerUserId: returnReview.reviewerUserId,
        returningReviewerAssignmentId: clean(returnReview.reviewerAssignmentId),
        returningReviewerRole: returnProvenance.reviewerRole,
        returnReviewEvidenceHash: returnProvenance.reviewEvidenceHash,
        returnDecisionRequestHash: returnProvenance.decisionRequestHash,
        returnDecisionEvidenceHash: returnProvenance.decisionEvidenceHash,
        returnReasonHash: returnProvenance.reasonHash,
        returnReasonLength: returnProvenance.reason.length,
      });

      const existing = await tx.appraisalAssessment.findUnique({
        where: {
          cycleId_assessorUserId_revision: {
            cycleId: source.cycleId,
            assessorUserId: source.assessorUserId,
            revision: newRevisionNumber,
          },
        },
        select: assessmentSelect,
      });

      if (existing) {
        if (
          normalized(source.status) !== "SUPERSEDED" ||
          !revisionMatches({
            revision: existing,
            source,
            evidence,
            returnReview,
            returnProvenance,
            expectedRevisionKey: revisionKey,
          })
        ) {
          fail("TEACHER_SUPERVISORY_REVISION_EXISTING_DRIFT", 409);
        }

        return {
          outcome: "EXISTING_MATCH",
          originalAssessmentId: source.id,
          originalStatus: "SUPERSEDED",
          returnReason: returnProvenance.reason,
          revision: summary({
            revision: existing,
            evidence,
            returnReview,
            returnProvenance,
          }),
        };
      }

      if (normalized(source.status) !== "RETURNED") {
        fail("TEACHER_SUPERVISORY_REVISION_SUCCESSOR_MISSING", 409);
      }

      const planned = planReturnedTeacherSupervisoryRevision({
        assessmentId: source.id,
        status: source.status,
        revisionNumber: source.revision,
        assessorUserId: source.assessorUserId,
        targetUserId: source.cycle.targetUserId,
        returnReason: returnProvenance.reason,
        reviewerScoreEdits: null,
      });

      if (
        !planned.ok ||
        planned.value.originalTransition.from !== "RETURNED" ||
        planned.value.originalTransition.to !== "SUPERSEDED" ||
        planned.value.newRevision.status !== "DRAFT" ||
        planned.value.newRevision.revisionNumber !== newRevisionNumber ||
        planned.value.newRevision.supersedesAssessmentId !== source.id ||
        planned.value.newRevision.assessorUserId !== source.assessorUserId ||
        planned.value.newRevision.targetUserId !== source.cycle.targetUserId ||
        planned.value.newRevision.copyScoresFromAssessmentId !== source.id ||
        planned.value.reviewerMayRewriteScores !== false
      ) {
        fail("TEACHER_SUPERVISORY_REVISION_PLAN_DRIFT", 409);
      }

      const metadata = expectedRevisionMetadata({
        source,
        evidence,
        returnReview,
        returnProvenance,
        newRevisionNumber,
        revisionKey,
      });

      const created = await tx.appraisalAssessment.create({
        data: {
          cycleId: source.cycleId,
          instrumentVersionId: source.instrumentVersionId,
          assessorUserId: source.assessorUserId,
          assessorAssignmentId: source.assessorAssignmentId,
          status: "DRAFT",
          revision: newRevisionNumber,
          priorAssessmentId: source.id,
          dateObserved: source.dateObserved,
          overallPercentage: null,
          sectionPercentagesJson: {},
          generalComment: source.generalComment,
          evidenceSnapshotJson: source.evidenceSnapshotJson as Prisma.InputJsonValue,
          assessmentHash: null,
          finalizedByUserId: null,
          finalizedAt: null,
          metadata: metadata as Prisma.InputJsonValue,
        },
        select: assessmentSelect,
      });

      const copied = await tx.appraisalAssessmentScore.createMany({
        data: source.scores.map((score) => ({
          assessmentId: created.id,
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
        })),
      });

      if (
        copied.count !== TEACHER_SUPERVISORY_REVISION_POLICY.expectedScoreCount
      ) {
        fail("TEACHER_SUPERVISORY_REVISION_SCORE_COPY_FAILED", 409, {
          copiedScoreCount: copied.count,
        });
      }

      const sourceUpdate = await tx.appraisalAssessment.updateMany({
        where: {
          id: source.id,
          status: "RETURNED",
          revision: source.revision,
          assessmentHash: evidence.assessmentHash,
        },
        data: {
          status: "SUPERSEDED",
        },
      });

      if (sourceUpdate.count !== 1) {
        fail("TEACHER_SUPERVISORY_REVISION_SOURCE_TRANSITION_RACE", 409);
      }

      const revisionRecord = await findAssessment(tx, created.id);

      if (
        !revisionMatches({
          revision: revisionRecord,
          source,
          evidence,
          returnReview,
          returnProvenance,
          expectedRevisionKey: revisionKey,
        })
      ) {
        fail("TEACHER_SUPERVISORY_REVISION_CREATED_EVIDENCE_DRIFT", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: evidence.targetTenantId,
          userId: input.actorUserId,
          action: REVISION_CREATED_AUDIT_ACTION,
          resource: "AppraisalAssessment",
          resourceId: revisionRecord.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId: input.reqId,
            action: REVISION_CREATED_AUDIT_ACTION,
            workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
            cycleId: source.cycleId,
            sourceAssessmentId: source.id,
            sourceRevision: source.revision,
            sourceAssessmentHash: evidence.assessmentHash,
            sourceObservationContextHash: evidence.observationContextHash,
            revisionAssessmentId: revisionRecord.id,
            revisionNumber: revisionRecord.revision,
            revisionKey,
            assessorAssignmentId: source.assessorAssignmentId,
            returnReviewId: returnReview.id,
            returnReviewStage: returnReview.stage,
            returningReviewerRole: returnProvenance.reviewerRole,
            returnReviewEvidenceHash: returnProvenance.reviewEvidenceHash,
            returnDecisionRequestHash: returnProvenance.decisionRequestHash,
            returnDecisionEvidenceHash: returnProvenance.decisionEvidenceHash,
            returnReasonHash: returnProvenance.reasonHash,
            returnReasonLength: returnProvenance.reason.length,
            copiedScoreCount: copied.count,
            generalCommentCopied: true,
            returnReasonTextRecordedInAudit: false,
            scoreValuesRecordedInAudit: false,
            generalCommentTextRecordedInAudit: false,
            observationDetailsRecordedInAudit: false,
            classEnrolmentRecordedInAudit: false,
            contactFieldsIncluded: false,
            cycleMutationPerformed: false,
            reviewMutationPerformed: false,
            reviewerMayRewriteScores: false,
            reviewerMayRewriteComment: false,
            legacyTeacherAppraisalIncluded: false,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "CREATED",
        originalAssessmentId: source.id,
        originalStatus: "SUPERSEDED",
        returnReason: returnProvenance.reason,
        revision: summary({
          revision: revisionRecord,
          evidence,
          returnReview,
          returnProvenance,
        }),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: TEACHER_SUPERVISORY_REVISION_POLICY.transactionMaxWaitMs,
      timeout: TEACHER_SUPERVISORY_REVISION_POLICY.transactionTimeoutMs,
    },
  );
}

function isRetryableConflict(error: unknown) {
  const code = clean((error as { code?: unknown })?.code);
  return (
    code === "P2002" ||
    code === "P2034" ||
    code === "TEACHER_SUPERVISORY_REVISION_SOURCE_TRANSITION_RACE"
  );
}

export async function createReturnedTeacherSupervisoryAssessmentRevision(
  input: CreateReturnedTeacherSupervisoryRevisionInput,
): Promise<CreateReturnedTeacherSupervisoryRevisionResult> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryRevisionDatabase);
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
      return await performRevisionTransaction({
        database,
        actorUserId,
        actorRoleName,
        returnedAssessmentId,
        reqId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        now,
      });
    } catch (error) {
      if (attempt === 0 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  fail("TEACHER_SUPERVISORY_REVISION_CONCURRENT_CREATE_FAILED", 409);
}
