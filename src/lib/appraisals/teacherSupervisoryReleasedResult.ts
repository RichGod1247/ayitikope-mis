import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  computeTeacherSupervisoryCorrectionRevisionKey,
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  verifyTeacherSupervisorySealedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  computeTeacherSupervisoryReviewEvidenceHash,
} from "@/lib/appraisals/teacherSupervisoryReviewAdmission";
import {
  planTeacherSupervisoryReviewAction,
  teacherSupervisoryReviewChainForAssessor,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  readTeacherSupervisoryObservationDetailsSnapshot,
  type TeacherSupervisoryObservationDetailsSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationDetails";
import {
  readTeacherSupervisoryObservationSelectionSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationOptions";
import { effectiveRole } from "@/lib/roleRouting";

export const TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_TEACHER",
  requiredRole: "TEACHER",
  requiredCycleStatus: "RELEASED",
  requiredReviewDecision: "ACCEPTED",
  requiredAssessmentStatus: "FINALIZED",
  releaseProofSchemaVersion: 1,
  reviewedReleaseMode: "REVIEWED_DIRECTOR_RELEASE",
  directorAuthoredDirectReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
  dualReleaseModesSupported: true,
  expectedSectionCount: 6,
  expectedItemCount: 34,
  officialObservationDetailsIncluded: true,
  governanceEnrolmentEvidenceIncludedWhenAvailable: true,
  scoreValuesIncluded: true,
  generalCommentIncluded: true,
  assessorOfficeIncluded: true,
  assessorIdentityIncluded: false,
  reviewerIdentityIncluded: false,
  reviewerAssignmentIncluded: false,
  reviewNotesIncluded: false,
  returnReasonsIncluded: false,
  rawEvidenceSnapshotIncluded: false,
  rawMetadataIncluded: false,
  contactDetailsIncluded: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  correctionLineageVerified: true,
  scoreMutationAllowed: false,
  readOnly: true,
  databaseWritesAllowed: false,
  transactionRequired: false,
  databaseReadMode: "SEQUENTIAL",
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

const RELEASE_METADATA_KEY = "teacherSupervisoryRelease";
const REVIEWED_RELEASE_MODE = "REVIEWED_DIRECTOR_RELEASE";
const DIRECT_RELEASE_MODE = "DIRECTOR_AUTHORED_DIRECT_RELEASE";

export type ReadTeacherSupervisoryReleasedResultInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  cycleId: string;
  database?: TeacherSupervisoryReleasedResultDatabase;
  verificationDatabase?: Pick<
    TeacherSupervisoryScoringDatabase,
    "appraisalAssessment"
  >;
};

export type TeacherSupervisoryReleasedResultObservation = {
  contextSchemaVersion: 1 | 2;
  teacherName: string;
  schoolName: string;
  circuitName: string;
  districtName: string;
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
  totalEnrolment: number | null;
  girls: number | null;
  boys: number | null;
  teacherAssignmentVerified: boolean;
  curriculumSelectionVerified: boolean;
};

export type TeacherSupervisoryReleasedResult = {
  schemaVersion: 1;
  audience: "RELEASED_TEACHER";
  lifecycleState: "RELEASED";
  cycle: {
    id: string;
    teacherName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
    releasedAt: string;
  };
  release: {
    proofSchemaVersion: 1;
    releaseMode:
      | "REVIEWED_DIRECTOR_RELEASE"
      | "DIRECTOR_AUTHORED_DIRECT_RELEASE";
    releaseProofHash: string;
    reviewStage: number | null;
    integrityVerified: true;
  };
  assessment: {
    revision: number;
    dateObserved: string;
    finalizedAt: string;
    assessorOffice: string;
    instrumentCode: string;
    instrumentVersion: number;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    generalComment: string | null;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionDescription: string | null;
      sectionOrder: number;
      sectionMaxScore: number;
      percentage: number | null;
      items: Array<{
        itemKey: string;
        itemLabel: string;
        itemOrder: number;
        itemMaxScore: number;
        score: number | null;
        notApplicable: boolean;
      }>;
    }>;
  };
  observation: TeacherSupervisoryReleasedResultObservation;
  privacy: {
    assessorIdentityIncluded: false;
    reviewerIdentityIncluded: false;
    reviewerAssignmentIncluded: false;
    reviewNotesIncluded: false;
    returnReasonsIncluded: false;
    rawEvidenceSnapshotIncluded: false;
    rawMetadataIncluded: false;
    contactDetailsIncluded: false;
  };
  integrity: {
    finalizedAssessmentEvidenceVerified: true;
    assessmentHashVerified: true;
    observationContextHashVerified: true;
    releaseModeVerified: true;
    reviewEvidenceHashVerified: true | null;
    reviewChainHashVerified: true | null;
    directReleaseAuthorityVerified: true | null;
    decisionContractHashVerified: true;
    releaseRequestHashVerified: true;
    releaseEvidenceHashVerified: true;
    releaseProofHashVerified: true;
    cycleReviewReleaseAnchorsVerified: true;
    correctionLineageVerified: true;
    officialFormProjectionVerified: true;
    generalCommentIncludedInAssessmentHash: true;
    reviewerMayRewriteScores: false;
    reviewerMayRewriteComment: false;
    legacyTeacherAppraisalIncluded: false;
    combinedWeightingDefined: false;
    scoreMutationAllowed: false;
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

type ReleasedCycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  closedAt: Date | null;
  closedByUserId: string | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type AssessmentScoreRecord = {
  assessmentId: string;
  instrumentItemId: string;
  itemKey: string;
  score: number | null;
  notApplicable: boolean;
};

type InstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
};

type InstrumentSectionRecord = {
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: InstrumentItemRecord[];
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
  scores: AssessmentScoreRecord[];
  reviews: ReviewRecord[];
  instrumentVersion: {
    id: string;
    version: number;
    contentHash: string | null;
    instrument: {
      code: string;
    };
    sections: InstrumentSectionRecord[];
  };
};

export type TeacherSupervisoryReleasedResultDatabase = {
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<ReleasedCycleRecord | null>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
};

export class TeacherSupervisoryReleasedResultError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "TeacherSupervisoryReleasedResultError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ObservationContext = {
  schemaVersion?: unknown;
  workflow?: unknown;
  evidenceStream?: unknown;
  target?: {
    userId?: unknown;
    tenantId?: unknown;
    name?: unknown;
    schoolName?: unknown;
  };
  assessor?: {
    userId?: unknown;
    role?: unknown;
    assignmentId?: unknown;
    scopeLevel?: unknown;
  };
  jurisdiction?: {
    circuitZoneId?: unknown;
    circuitName?: unknown;
    districtZoneId?: unknown;
    districtName?: unknown;
  };
  instrument?: {
    instrumentVersionId?: unknown;
    code?: unknown;
    version?: unknown;
    contentHash?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
    details?: unknown;
    selection?: unknown;
  };
};

type CorrectionRevisionProvenance = {
  sourceAssessmentId: string;
  sourceAssessmentHash: string;
  sourceObservationContextHash: string;
  sourceRevision: number;
  returnReviewId: string;
  returnReviewStage: number;
  returningReviewerUserId: string;
  returningReviewerAssignmentId: string;
  returningReviewerRole: string;
  returnReviewEvidenceHash: string;
  returnDecisionRequestHash: string;
  returnDecisionEvidenceHash: string;
  returnReason: string;
  returnReasonHash: string;
  returnReasonLength: number;
  revisionKey: string;
};

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  tenantId: true,
  status: true,
  role: {
    select: {
      name: true,
    },
  },
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

const CYCLE_SELECT = {
  id: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetZoneId: true,
  targetRoleSnapshot: true,
  status: true,
  closedAt: true,
  closedByUserId: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
} as const;

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
  scores: {
    select: {
      assessmentId: true,
      instrumentItemId: true,
      itemKey: true,
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
  instrumentVersion: {
    select: {
      id: true,
      version: true,
      contentHash: true,
      instrument: {
        select: {
          code: true,
        },
      },
      sections: {
        select: {
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
            },
            orderBy: {
              order: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
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

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new TeacherSupervisoryReleasedResultError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("TEACHER_SUPERVISORY_RELEASED_RESULT_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function personName(user: TargetMembershipRecord["user"]) {
  const preferred = clean(user.name);
  if (preferred) return preferred;
  return (
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    "Teacher"
  );
}

function officeLabel(role: unknown) {
  switch (normalized(role)) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role);
  }
}

function sectionPercentageMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(objectValue(value)).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function releaseReviewChainHash(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();

  if (!isSha256(reviewEvidenceHash)) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_REVIEW_CHAIN_HASH_INVALID",
      409,
    );
  }

  return hashJson({
    schemaVersion:
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.releaseProofSchemaVersion,
    reviewId: review.id,
    reviewStage: review.stage,
    reviewEvidenceHash,
    reviewType: clean(metadata.reviewType) || null,
    sourceReviewId: clean(metadata.sourceReviewId) || null,
    sourceReviewStage:
      Number.isInteger(Number(metadata.sourceReviewStage))
        ? Number(metadata.sourceReviewStage)
        : null,
    sourceReviewDecision: clean(metadata.sourceReviewDecision) || null,
    forwardDecisionRequestHash:
      clean(metadata.forwardDecisionRequestHash).toLowerCase() || null,
    forwardDecisionContractHash:
      clean(metadata.forwardDecisionContractHash).toLowerCase() || null,
    forwardedByUserId: clean(metadata.forwardedByUserId) || null,
    forwardedByAssignmentId:
      clean(metadata.forwardedByAssignmentId) || null,
    sourceAssessmentId: clean(metadata.sourceAssessmentId) || null,
    sourceAssessmentHash:
      clean(metadata.sourceAssessmentHash).toLowerCase() || null,
    sourceReviewEvidenceHash:
      clean(metadata.sourceReviewEvidenceHash).toLowerCase() || null,
    sourceReturnDecisionRequestHash:
      clean(metadata.sourceReturnDecisionRequestHash).toLowerCase() || null,
    sourceReturnDecisionEvidenceHash:
      clean(metadata.sourceReturnDecisionEvidenceHash).toLowerCase() || null,
    continuationFromReturnedReview:
      metadata.continuationFromReturnedReview === true,
    preserveReturningReviewer: metadata.preserveReturningReviewer === true,
    preserveReviewStage: metadata.preserveReviewStage === true,
  });
}

function decisionContractHash(input: {
  assessorRole: string;
  stage: number;
}) {
  const planned = planTeacherSupervisoryReviewAction({
    assessorRoleName: input.assessorRole,
    stage: input.stage,
    action: "RELEASE",
  });

  if (!planned.ok) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_PLAN_INVALID",
      409,
      { code: planned.code },
    );
  }

  const plan = planned.value;
  if (
    plan.action !== "RELEASE" ||
    plan.reviewDecision !== "ACCEPTED" ||
    plan.assessmentNextStatus !== "FINALIZED" ||
    plan.cycleNextStatus !== "RELEASED" ||
    plan.revisionRequired !== false ||
    plan.nextReviewStageRequired !== false ||
    plan.nextReviewerRole !== null ||
    plan.reviewerMayRewriteScores !== false ||
    plan.reviewerMayRewriteComment !== false ||
    plan.assessmentMutationAllowed !== false ||
    plan.scoreMutationAllowed !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_PLAN_DRIFT",
      409,
    );
  }

  return hashJson({
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    action: plan.action,
    reviewDecision: plan.reviewDecision,
    assessmentNextStatus: plan.assessmentNextStatus,
    cycleNextStatus: plan.cycleNextStatus,
    revisionRequired: plan.revisionRequired,
    nextReviewStageRequired: plan.nextReviewStageRequired,
    nextReviewerRole: plan.nextReviewerRole,
    reviewerMayRewriteScores: plan.reviewerMayRewriteScores,
    reviewerMayRewriteComment: plan.reviewerMayRewriteComment,
    assessmentMutationAllowed: plan.assessmentMutationAllowed,
    scoreMutationAllowed: plan.scoreMutationAllowed,
  });
}

function releaseRequestHash(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  review: ReviewRecord;
  reviewerAssignmentId: string;
  sourceReviewEvidenceHash: string;
  contractHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    assessment: {
      id: input.evidence.assessmentId,
      cycleId: input.evidence.cycleId,
      revision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
    },
    review: {
      id: input.review.id,
      stage: input.review.stage,
      reviewEvidenceHash: input.sourceReviewEvidenceHash,
    },
    reviewer: {
      userId: input.review.reviewerUserId,
      assignmentId: input.reviewerAssignmentId,
      role: "DISTRICT_DIRECTOR",
    },
    action: "RELEASE",
    reason: null,
    decisionContractHash: input.contractHash,
  });
}

function releaseEvidenceHash(input: {
  releaseRequestHash: string;
  sourceReviewEvidenceHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    decisionRequestHash: input.releaseRequestHash,
    sourceReviewEvidenceHash: input.sourceReviewEvidenceHash,
    nextReviewEvidenceHash: null,
  });
}

function releaseProofPayload(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  review: ReviewRecord;
  reviewerAssignmentId: string;
  sourceReviewEvidenceHash: string;
  reviewChainHash: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releasedAt: string;
}) {
  return {
    proofSchemaVersion:
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.releaseProofSchemaVersion,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentStatus: "FINALIZED",
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    assessorUserId: input.evidence.assessorUserId,
    assessorAssignmentId: input.evidence.assessorAssignmentId,
    assessorRole: input.evidence.assessorRole,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "ACCEPTED",
    reviewEvidenceHash: input.sourceReviewEvidenceHash,
    reviewChainHash: input.reviewChainHash,
    reviewerUserId: input.review.reviewerUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    reviewerRole: "DISTRICT_DIRECTOR",
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.releaseRequestHash,
    releaseEvidenceHash: input.releaseEvidenceHash,
    releasedAt: input.releasedAt,
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  } as const;
}

function assertForwardReviewLink(input: {
  prior: ReviewRecord;
  next: ReviewRecord;
}) {
  const priorMetadata = objectValue(input.prior.metadata);
  const nextMetadata = objectValue(input.next.metadata);
  const nextReviewEvidenceHash = clean(
    nextMetadata.reviewEvidenceHash,
  ).toLowerCase();

  if (
    normalized(input.prior.decision) !== "ACCEPTED" ||
    clean(input.prior.note) ||
    !input.prior.decidedAt ||
    clean(priorMetadata.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(priorMetadata.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    clean(priorMetadata.decisionAction) !== "FORWARD" ||
    clean(priorMetadata.nextReviewId) !== input.next.id ||
    Number(priorMetadata.nextReviewStage) !== input.next.stage ||
    clean(priorMetadata.nextReviewerRole) !==
      clean(nextMetadata.reviewerRole) ||
    !isSha256(priorMetadata.decisionRequestHash) ||
    !isSha256(priorMetadata.decisionContractHash) ||
    !isSha256(priorMetadata.forwardedReviewEvidenceHash) ||
    clean(priorMetadata.forwardedReviewEvidenceHash).toLowerCase() !==
      nextReviewEvidenceHash
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_PRIOR_FORWARD_INVALID",
      409,
      { stage: input.prior.stage },
    );
  }
}

function assertCurrentReleaseReviewChain(input: {
  reviews: ReviewRecord[];
  releaseReview: ReviewRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}) {
  const ordered = [...input.reviews].sort(
    (left, right) =>
      left.stage - right.stage ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const releaseMetadata = objectValue(input.releaseReview.metadata);
  const correctionContinuation =
    clean(releaseMetadata.reviewType) === "CORRECTION_CONTINUATION";

  if (correctionContinuation) {
    if (
      ordered.length !== 1 ||
      ordered[0]?.id !== input.releaseReview.id ||
      releaseMetadata.continuationFromReturnedReview !== true ||
      releaseMetadata.preserveReturningReviewer !== true ||
      releaseMetadata.preserveReviewStage !== true
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_REVIEW_CHAIN_DRIFT",
        409,
      );
    }
  } else {
    if (
      ordered.length !== input.releaseReview.stage ||
      ordered.some((review, index) => review.stage !== index + 1) ||
      ordered.at(-1)?.id !== input.releaseReview.id
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_REVIEW_STAGE_DRIFT",
        409,
      );
    }

    for (let index = 0; index < ordered.length - 1; index += 1) {
      assertForwardReviewLink({
        prior: ordered[index],
        next: ordered[index + 1],
      });
    }
  }

  const chain = teacherSupervisoryReviewChainForAssessor(
    input.evidence.assessorRole,
  );
  const expectedStage = chain?.stages.find(
    (candidate) => candidate.stage === input.releaseReview.stage,
  );

  if (
    !chain ||
    !chain.requiresReviewRows ||
    !expectedStage ||
    expectedStage.reviewerRole !== "DISTRICT_DIRECTOR"
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_REVIEW_CHAIN_INVALID",
      409,
    );
  }
}

function correctionProvenance(
  assessment: AssessmentRecord,
): CorrectionRevisionProvenance | null {
  if (assessment.revision === 1) {
    if (
      assessment.priorAssessmentId ||
      objectValue(assessment.metadata).correctionRevision === true
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_INITIAL_REVISION_DRIFT",
        409,
      );
    }
    return null;
  }

  const metadata = objectValue(assessment.metadata);
  const sourceAssessmentId = clean(metadata.sourceAssessmentId);
  const sourceAssessmentHash = clean(metadata.sourceAssessmentHash).toLowerCase();
  const sourceObservationContextHash = clean(
    metadata.sourceObservationContextHash,
  ).toLowerCase();
  const sourceRevision = Number(metadata.sourceRevision);
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
  const revisionKey = clean(metadata.revisionKey).toLowerCase();

  if (
    !assessment.priorAssessmentId ||
    assessment.priorAssessmentId !== sourceAssessmentId ||
    metadata.correctionRevision !== true ||
    Number(metadata.revisionSchemaVersion) !== 1 ||
    Number(metadata.correctionRevisionNumber) !== assessment.revision ||
    sourceRevision !== assessment.revision - 1 ||
    !isSha256(sourceAssessmentHash) ||
    !isSha256(sourceObservationContextHash) ||
    !returnReviewId ||
    !Number.isInteger(returnReviewStage) ||
    returnReviewStage < 1 ||
    !returningReviewerUserId ||
    !returningReviewerAssignmentId ||
    (returningReviewerRole !== "HEAD_OF_SUPERVISION" &&
      returningReviewerRole !== "DISTRICT_DIRECTOR") ||
    !isSha256(returnReviewEvidenceHash) ||
    !isSha256(returnDecisionRequestHash) ||
    !isSha256(returnDecisionEvidenceHash) ||
    returnReason.length < 3 ||
    returnReasonLength !== returnReason.length ||
    !isSha256(returnReasonHash) ||
    returnReasonHash !== hashJson(returnReason) ||
    !isSha256(revisionKey) ||
    metadata.preserveObservationContext !== true ||
    metadata.copyScores !== true ||
    metadata.copyGeneralComment !== true ||
    Number(metadata.copiedScoreCount) !==
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.expectedItemCount ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteComment !== false ||
    metadata.returnedAssessmentRequiresRevision !== true ||
    metadata.separateFromLegacyTeacherAppraisal !== true ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_PROVENANCE_INVALID",
      409,
      { revision: assessment.revision },
    );
  }

  return {
    sourceAssessmentId,
    sourceAssessmentHash,
    sourceObservationContextHash,
    sourceRevision,
    returnReviewId,
    returnReviewStage,
    returningReviewerUserId,
    returningReviewerAssignmentId,
    returningReviewerRole,
    returnReviewEvidenceHash,
    returnDecisionRequestHash,
    returnDecisionEvidenceHash,
    returnReason,
    returnReasonHash,
    returnReasonLength,
    revisionKey,
  };
}

async function verifyCorrectionLineage(input: {
  database: TeacherSupervisoryReleasedResultDatabase;
  verificationDatabase: Pick<
    TeacherSupervisoryScoringDatabase,
    "appraisalAssessment"
  >;
  currentAssessment: AssessmentRecord;
  currentEvidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}) {
  let currentRecord = input.currentAssessment;
  let currentEvidence:
    | TeacherSupervisoryFinalizedAssessmentEvidence
    | Awaited<ReturnType<typeof verifyTeacherSupervisorySealedAssessmentEvidence>> =
    input.currentEvidence;

  const seen = new Set<string>();

  while (currentRecord.revision > 1) {
    if (seen.has(currentRecord.id)) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_LINEAGE_CYCLE",
        409,
      );
    }
    seen.add(currentRecord.id);

    const provenance = correctionProvenance(currentRecord);
    if (!provenance) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_LINEAGE_MISSING",
        409,
      );
    }

    const expectedRevisionKey =
      computeTeacherSupervisoryCorrectionRevisionKey({
        cycleId: currentEvidence.cycleId,
        sourceAssessmentId: provenance.sourceAssessmentId,
        sourceAssessmentHash: provenance.sourceAssessmentHash,
        sourceObservationContextHash:
          provenance.sourceObservationContextHash,
        revisionNumber: currentRecord.revision,
        assessorUserId: currentEvidence.assessorUserId,
        assessorAssignmentId: currentEvidence.assessorAssignmentId,
        returnReviewId: provenance.returnReviewId,
        returnReviewStage: provenance.returnReviewStage,
        returningReviewerUserId: provenance.returningReviewerUserId,
        returningReviewerAssignmentId:
          provenance.returningReviewerAssignmentId,
        returningReviewerRole: provenance.returningReviewerRole,
        returnReviewEvidenceHash: provenance.returnReviewEvidenceHash,
        returnDecisionRequestHash: provenance.returnDecisionRequestHash,
        returnDecisionEvidenceHash: provenance.returnDecisionEvidenceHash,
        returnReasonHash: provenance.returnReasonHash,
        returnReasonLength: provenance.returnReasonLength,
      });

    if (expectedRevisionKey !== provenance.revisionKey) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_REVISION_KEY_DRIFT",
        409,
        { revision: currentRecord.revision },
      );
    }

    const sourceEvidence =
      await verifyTeacherSupervisorySealedAssessmentEvidence({
        assessmentId: provenance.sourceAssessmentId,
        allowedStatuses: ["SUPERSEDED"],
        database: input.verificationDatabase,
      });

    if (
      sourceEvidence.revision !== provenance.sourceRevision ||
      sourceEvidence.revision !== currentRecord.revision - 1 ||
      sourceEvidence.cycleId !== currentEvidence.cycleId ||
      sourceEvidence.assessorUserId !== currentEvidence.assessorUserId ||
      sourceEvidence.assessorAssignmentId !==
        currentEvidence.assessorAssignmentId ||
      sourceEvidence.targetUserId !== currentEvidence.targetUserId ||
      sourceEvidence.targetTenantId !== currentEvidence.targetTenantId ||
      sourceEvidence.targetCircuitZoneId !==
        currentEvidence.targetCircuitZoneId ||
      sourceEvidence.targetDistrictZoneId !==
        currentEvidence.targetDistrictZoneId ||
      sourceEvidence.instrumentVersionId !==
        currentEvidence.instrumentVersionId ||
      sourceEvidence.assessmentHash !== provenance.sourceAssessmentHash ||
      sourceEvidence.observationContextHash !==
        provenance.sourceObservationContextHash ||
      sourceEvidence.observationContextHash !==
        currentEvidence.observationContextHash
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_SOURCE_DRIFT",
        409,
        { revision: currentRecord.revision },
      );
    }

    const sourceRecord = await input.database.appraisalAssessment.findUnique({
      where: {
        id: provenance.sourceAssessmentId,
      },
      select: ASSESSMENT_SELECT,
    });

    if (
      !sourceRecord ||
      sourceRecord.id !== sourceEvidence.assessmentId ||
      normalized(sourceRecord.status) !== "SUPERSEDED" ||
      sourceRecord.revision !== sourceEvidence.revision
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_SOURCE_RECORD_DRIFT",
        409,
      );
    }

    const returnReview = sourceRecord.reviews.find(
      (review) => review.id === provenance.returnReviewId,
    );

    if (
      !returnReview ||
      returnReview.stage !== provenance.returnReviewStage ||
      returnReview.reviewerUserId !== provenance.returningReviewerUserId ||
      clean(returnReview.reviewerAssignmentId) !==
        provenance.returningReviewerAssignmentId ||
      normalized(returnReview.decision) !== "RETURNED" ||
      returnReview.note !== provenance.returnReason ||
      !returnReview.decidedAt
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_RETURN_REVIEW_DRIFT",
        409,
      );
    }

    const ordered = [...sourceRecord.reviews].sort(
      (left, right) =>
        left.stage - right.stage ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );

    if (
      ordered.length !== returnReview.stage ||
      ordered.some((review, index) => review.stage !== index + 1) ||
      ordered.at(-1)?.id !== returnReview.id
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_SOURCE_STAGE_DRIFT",
        409,
      );
    }

    for (let index = 0; index < ordered.length - 1; index += 1) {
      assertForwardReviewLink({
        prior: ordered[index],
        next: ordered[index + 1],
      });
    }

    const returnMetadata = objectValue(returnReview.metadata);
    if (
      clean(returnMetadata.workflow) !==
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
      clean(returnMetadata.evidenceStream) !==
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
      clean(returnMetadata.decisionAction) !== "RETURN" ||
      clean(returnMetadata.reviewerRole) !==
        provenance.returningReviewerRole ||
      clean(returnMetadata.reviewEvidenceHash).toLowerCase() !==
        provenance.returnReviewEvidenceHash ||
      clean(returnMetadata.decisionRequestHash).toLowerCase() !==
        provenance.returnDecisionRequestHash ||
      clean(returnMetadata.decisionEvidenceHash).toLowerCase() !==
        provenance.returnDecisionEvidenceHash ||
      clean(returnMetadata.assessmentHash).toLowerCase() !==
        provenance.sourceAssessmentHash ||
      clean(returnMetadata.observationContextHash).toLowerCase() !==
        provenance.sourceObservationContextHash ||
      clean(returnMetadata.decidedByUserId) !==
        provenance.returningReviewerUserId ||
      clean(returnMetadata.decidedByAssignmentId) !==
        provenance.returningReviewerAssignmentId ||
      clean(returnMetadata.decidedByRole) !==
        provenance.returningReviewerRole ||
      returnMetadata.revisionRequired !== true ||
      returnMetadata.preserveReturningReviewerForCorrection !== true ||
      returnMetadata.reviewerMayRewriteScores !== false ||
      returnMetadata.reviewerMayRewriteComment !== false ||
      returnMetadata.scoreMutationPerformed !== false ||
      returnMetadata.commentMutationPerformed !== false ||
      returnMetadata.legacyTeacherAppraisalIncluded !== false ||
      returnMetadata.combinedWeightingDefined !== false ||
      returnMetadata.providerCalled !== false
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_RETURN_PROOF_DRIFT",
        409,
      );
    }

    currentRecord = sourceRecord;
    currentEvidence = sourceEvidence;
  }

  if (
    currentRecord.revision !== 1 ||
    currentRecord.priorAssessmentId ||
    objectValue(currentRecord.metadata).correctionRevision === true
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_ROOT_DRIFT",
      409,
    );
  }
}

function buildObservation(input: {
  record: AssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  membership: TargetMembershipRecord;
}): TeacherSupervisoryReleasedResultObservation {
  const snapshot = objectValue(
    input.record.evidenceSnapshotJson,
  ) as unknown as ObservationContext;
  const schemaVersion = Number(snapshot.schemaVersion);

  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    clean(snapshot.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(snapshot.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    clean(snapshot.target?.userId) !== input.evidence.targetUserId ||
    clean(snapshot.target?.tenantId) !== input.evidence.targetTenantId ||
    clean(snapshot.jurisdiction?.circuitZoneId) !==
      input.evidence.targetCircuitZoneId ||
    clean(snapshot.jurisdiction?.districtZoneId) !==
      input.evidence.targetDistrictZoneId ||
    clean(snapshot.assessor?.userId) !== input.evidence.assessorUserId ||
    clean(snapshot.assessor?.assignmentId) !==
      input.evidence.assessorAssignmentId ||
    clean(snapshot.instrument?.instrumentVersionId) !==
      input.evidence.instrumentVersionId ||
    clean(snapshot.instrument?.code) !== input.evidence.instrumentCode ||
    Number(snapshot.instrument?.version) !== input.evidence.instrumentVersion ||
    clean(snapshot.instrument?.contentHash).toLowerCase() !==
      input.evidence.instrumentContentHash ||
    clean(snapshot.observation?.dateObserved) !== input.evidence.dateObserved ||
    hashJson(input.record.evidenceSnapshotJson) !==
      input.evidence.observationContextHash
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_OBSERVATION_CONTEXT_DRIFT",
      409,
    );
  }

  const details: TeacherSupervisoryObservationDetailsSnapshot | null =
    readTeacherSupervisoryObservationDetailsSnapshot(
      snapshot.observation?.details,
    );

  if (
    !details ||
    Number(details.schemaVersion) !== schemaVersion ||
    details.dateObserved !== input.evidence.dateObserved
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_OBSERVATION_DETAILS_INVALID",
      409,
    );
  }

  let teacherAssignmentVerified = false;
  let curriculumSelectionVerified = false;

  if (schemaVersion === 2) {
    const selection = readTeacherSupervisoryObservationSelectionSnapshot(
      snapshot.observation?.selection,
    );

    if (
      !selection ||
      selection.classTaught !== details.classTaught ||
      selection.subjectBeingObserved !== details.subjectBeingObserved ||
      selection.subStrand !== details.subStrand
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_OBSERVATION_SELECTION_INVALID",
        409,
      );
    }

    teacherAssignmentVerified = true;
    curriculumSelectionVerified = true;
  }

  const zone = input.membership.tenant.zone;
  if (!zone?.parentZone) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_MEMBERSHIP_HIERARCHY_MISSING",
      409,
    );
  }

  const teacherName = personName(input.membership.user);

  if (
    (clean(snapshot.target?.name) &&
      clean(snapshot.target?.name) !== teacherName) ||
    clean(snapshot.target?.schoolName) !== input.membership.tenant.name ||
    clean(snapshot.jurisdiction?.circuitName) !== zone.name ||
    clean(snapshot.jurisdiction?.districtName) !== zone.parentZone.name
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_OBSERVATION_NAME_DRIFT",
      409,
    );
  }

  return {
    contextSchemaVersion: schemaVersion as 1 | 2,
    teacherName,
    schoolName: input.membership.tenant.name,
    circuitName: zone.name,
    districtName: zone.parentZone.name,
    dateObserved: input.evidence.dateObserved,
    yearsInService: details.yearsInService,
    yearsInPresentSchool: details.yearsInPresentSchool,
    subjectBeingObserved: details.subjectBeingObserved,
    subStrand: details.subStrand,
    classTaught: details.classTaught,
    durationMinutes: details.durationMinutes,
    totalEnrolment: details.schemaVersion === 2 ? details.totalEnrolment : null,
    girls: details.schemaVersion === 2 ? details.girls : null,
    boys: details.schemaVersion === 2 ? details.boys : null,
    teacherAssignmentVerified,
    curriculumSelectionVerified,
  };
}

function buildSections(input: {
  record: AssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}) {
  const sections = [...input.record.instrumentVersion.sections].sort(
    (left, right) => left.order - right.order,
  );
  const scoreByItemId = new Map<string, AssessmentScoreRecord>();

  for (const score of input.record.scores) {
    if (
      score.assessmentId !== input.record.id ||
      !clean(score.instrumentItemId) ||
      scoreByItemId.has(score.instrumentItemId)
    ) {
      fail(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_SCORE_PROJECTION_DRIFT",
        409,
      );
    }
    scoreByItemId.set(score.instrumentItemId, score);
  }

  let itemCount = 0;
  const seenKeys = new Set<string>();

  const projected = sections.map((section) => ({
    sectionKey: section.key,
    sectionTitle: section.title,
    sectionDescription: section.description,
    sectionOrder: section.order,
    sectionMaxScore: section.maxScore,
    percentage: input.evidence.sectionPercentages[section.key] ?? null,
    items: [...section.items]
      .sort((left, right) => left.order - right.order)
      .map((item) => {
        const score = scoreByItemId.get(item.id);

        if (
          !score ||
          score.itemKey !== item.key ||
          seenKeys.has(item.key) ||
          (score.notApplicable && score.score !== null) ||
          (!score.notApplicable && score.score === null)
        ) {
          fail(
            "TEACHER_SUPERVISORY_RELEASED_RESULT_ITEM_PROJECTION_DRIFT",
            409,
            { itemKey: item.key },
          );
        }

        seenKeys.add(item.key);
        itemCount += 1;

        return {
          itemKey: item.key,
          itemLabel: item.label,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score.score,
          notApplicable: score.notApplicable,
        };
      }),
  }));

  if (
    projected.length !==
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.expectedSectionCount ||
    itemCount !== TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.expectedItemCount ||
    scoreByItemId.size !== itemCount
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_FORM_STRUCTURE_DRIFT",
      409,
      {
        sectionCount: projected.length,
        itemCount,
        scoreCount: scoreByItemId.size,
      },
    );
  }

  return projected;
}

function assertAssessmentProjection(input: {
  record: AssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}) {
  if (
    input.record.id !== input.evidence.assessmentId ||
    input.record.cycleId !== input.evidence.cycleId ||
    input.record.instrumentVersionId !== input.evidence.instrumentVersionId ||
    input.record.assessorUserId !== input.evidence.assessorUserId ||
    clean(input.record.assessorAssignmentId) !==
      input.evidence.assessorAssignmentId ||
    normalized(input.record.status) !== "FINALIZED" ||
    input.record.revision !== input.evidence.revision ||
    !input.record.dateObserved ||
    input.record.dateObserved.toISOString().slice(0, 10) !==
      input.evidence.dateObserved ||
    input.record.overallPercentage !== input.evidence.overallPercentage ||
    input.record.finalizedByUserId !== input.evidence.assessorUserId ||
    !input.record.finalizedAt ||
    input.record.finalizedAt.toISOString() !== input.evidence.finalizedAt ||
    clean(input.record.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    input.record.instrumentVersion.id !== input.evidence.instrumentVersionId ||
    input.record.instrumentVersion.version !==
      input.evidence.instrumentVersion ||
    input.record.instrumentVersion.instrument.code !==
      input.evidence.instrumentCode ||
    clean(input.record.instrumentVersion.contentHash).toLowerCase() !==
      input.evidence.instrumentContentHash ||
    !sameJson(
      sectionPercentageMap(input.record.sectionPercentagesJson),
      input.evidence.sectionPercentages,
    )
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_ASSESSMENT_PROJECTION_DRIFT",
      409,
    );
  }
}


type ReleaseVerification = {
  releaseMode:
    | "REVIEWED_DIRECTOR_RELEASE"
    | "DIRECTOR_AUTHORED_DIRECT_RELEASE";
  releaseProofHash: string;
  reviewStage: number | null;
  reviewEvidenceHashVerified: true | null;
  reviewChainHashVerified: true | null;
  directReleaseAuthorityVerified: true | null;
};

function directDecisionContractHash() {
  return hashJson({
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    releaseMode: DIRECT_RELEASE_MODE,
    action: "RELEASE",
    assessorRole: "DISTRICT_DIRECTOR",
    releaserRole: "DISTRICT_DIRECTOR",
    exactAssessorAsReleaserRequired: true,
    exactAssessorAssignmentAsReleaserAssignmentRequired: true,
    reviewRowsRequired: false,
    reviewRowsAllowed: false,
    selfReviewAllowed: false,
    assessmentStatus: "FINALIZED",
    cycleIngress: [
      "OPEN",
      "CLOSED",
      "UNDER_REVIEW",
      "RELEASED",
    ],
    assessmentMutationAllowed: false,
    scoreMutationAllowed: false,
    commentMutationAllowed: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
}

function directReleaseRequestHash(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    releaseMode: DIRECT_RELEASE_MODE,
    assessment: {
      id: input.evidence.assessmentId,
      cycleId: input.evidence.cycleId,
      revision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
    },
    assessor: {
      userId: input.evidence.assessorUserId,
      assignmentId: input.evidence.assessorAssignmentId,
      role: input.evidence.assessorRole,
    },
    releaser: {
      userId: input.evidence.assessorUserId,
      assignmentId: input.releaserAssignmentId,
      role: "DISTRICT_DIRECTOR",
    },
    reviewRowsRequired: false,
    selfReviewPerformed: false,
    action: "RELEASE",
    decisionContractHash: input.decisionContractHash,
  });
}

function directReleaseEvidenceHash(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  releaseRequestHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    releaseMode: DIRECT_RELEASE_MODE,
    releaseRequestHash: input.releaseRequestHash,
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    reviewRowsPresent: false,
    selfReviewPerformed: false,
  });
}

function directReleaseProofPayload(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releasedAt: string;
}) {
  return {
    proofSchemaVersion:
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.releaseProofSchemaVersion,
    releaseMode: DIRECT_RELEASE_MODE,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentStatus: "FINALIZED",
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    assessorUserId: input.evidence.assessorUserId,
    assessorAssignmentId: input.evidence.assessorAssignmentId,
    assessorRole: "DISTRICT_DIRECTOR",
    reviewRowsRequired: false,
    reviewRowsPresent: false,
    selfReviewPerformed: false,
    releaserUserId: input.evidence.assessorUserId,
    releaserAssignmentId: input.releaserAssignmentId,
    releaserRole: "DISTRICT_DIRECTOR",
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.releaseRequestHash,
    releaseEvidenceHash: input.releaseEvidenceHash,
    releasedAt: input.releasedAt,
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    commentMutationPerformed: false,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  } as const;
}

function verifyReviewedDirectorRelease(input: {
  cycle: ReleasedCycleRecord;
  record: AssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  release: Record<string, unknown>;
}): ReleaseVerification {
  if (clean(input.release.releaseMode)) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_REVIEWED_RELEASE_MODE_DRIFT",
      409,
    );
  }

  const reviewId = requireIdentifier(input.release.reviewId, "reviewId");
  const releaseReview =
    input.record.reviews.find((review) => review.id === reviewId) ?? null;

  if (
    !releaseReview ||
    releaseReview.cycleId !== input.cycle.id ||
    releaseReview.assessmentId !== input.record.id ||
    normalized(releaseReview.decision) !== "ACCEPTED" ||
    clean(releaseReview.note) ||
    !releaseReview.decidedAt ||
    releaseReview.decidedAt.toISOString() !==
      input.cycle.releasedAt?.toISOString() ||
    !clean(releaseReview.reviewerAssignmentId)
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_REVIEW_INVALID",
      409,
    );
  }

  assertCurrentReleaseReviewChain({
    reviews: input.record.reviews,
    releaseReview,
    evidence: input.evidence,
  });

  const releaseReviewMetadata = objectValue(releaseReview.metadata);
  const reviewerAssignmentId = clean(
    releaseReview.reviewerAssignmentId,
  );

  if (
    clean(releaseReviewMetadata.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(releaseReviewMetadata.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    clean(releaseReviewMetadata.reviewerRole) !== "DISTRICT_DIRECTOR" ||
    clean(releaseReviewMetadata.decisionAction) !== "RELEASE" ||
    clean(releaseReviewMetadata.decidedByUserId) !==
      releaseReview.reviewerUserId ||
    clean(releaseReviewMetadata.decidedByAssignmentId) !==
      reviewerAssignmentId ||
    clean(releaseReviewMetadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    releaseReviewMetadata.revisionRequired !== false ||
    releaseReviewMetadata.preserveReturningReviewerForCorrection !== false ||
    releaseReviewMetadata.reviewerMayRewriteScores !== false ||
    releaseReviewMetadata.reviewerMayRewriteComment !== false ||
    releaseReviewMetadata.scoreMutationPerformed !== false ||
    releaseReviewMetadata.commentMutationPerformed !== false ||
    releaseReviewMetadata.legacyTeacherAppraisalIncluded !== false ||
    releaseReviewMetadata.combinedWeightingDefined !== false ||
    releaseReviewMetadata.notificationsSeeded !== false ||
    releaseReviewMetadata.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_REVIEW_PROOF_DRIFT",
      409,
    );
  }

  const expectedReviewEvidenceHash =
    computeTeacherSupervisoryReviewEvidenceHash({
      evidence: input.evidence,
      reviewerUserId: releaseReview.reviewerUserId,
      reviewerAssignmentId,
      reviewerRole: "DISTRICT_DIRECTOR",
      reviewStage: releaseReview.stage,
    });

  const expectedReviewChainHash =
    releaseReviewChainHash(releaseReview);

  const expectedDecisionContractHash =
    decisionContractHash({
      assessorRole: input.evidence.assessorRole,
      stage: releaseReview.stage,
    });

  const expectedReleaseRequestHash =
    releaseRequestHash({
      evidence: input.evidence,
      review: releaseReview,
      reviewerAssignmentId,
      sourceReviewEvidenceHash: expectedReviewEvidenceHash,
      contractHash: expectedDecisionContractHash,
    });

  const expectedReleaseEvidenceHash =
    releaseEvidenceHash({
      releaseRequestHash: expectedReleaseRequestHash,
      sourceReviewEvidenceHash: expectedReviewEvidenceHash,
    });

  const expectedProof =
    releaseProofPayload({
      evidence: input.evidence,
      review: releaseReview,
      reviewerAssignmentId,
      sourceReviewEvidenceHash: expectedReviewEvidenceHash,
      reviewChainHash: expectedReviewChainHash,
      decisionContractHash: expectedDecisionContractHash,
      releaseRequestHash: expectedReleaseRequestHash,
      releaseEvidenceHash: expectedReleaseEvidenceHash,
      releasedAt: input.cycle.releasedAt!.toISOString(),
    });

  const expectedReleaseProofHash = hashJson(expectedProof);

  if (
    Number(input.release.proofSchemaVersion) !==
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.releaseProofSchemaVersion ||
    !sameJson(
      Object.fromEntries(
        Object.entries(input.release).filter(
          ([key]) => key !== "releaseProofHash",
        ),
      ),
      expectedProof,
    ) ||
    clean(input.release.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash ||
    clean(releaseReviewMetadata.reviewEvidenceHash).toLowerCase() !==
      expectedReviewEvidenceHash ||
    clean(releaseReviewMetadata.reviewChainHash).toLowerCase() !==
      expectedReviewChainHash ||
    clean(releaseReviewMetadata.decisionContractHash).toLowerCase() !==
      expectedDecisionContractHash ||
    clean(releaseReviewMetadata.decisionRequestHash).toLowerCase() !==
      expectedReleaseRequestHash ||
    clean(releaseReviewMetadata.decisionEvidenceHash).toLowerCase() !==
      expectedReleaseEvidenceHash ||
    clean(releaseReviewMetadata.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_PROOF_DRIFT",
      409,
    );
  }

  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).teacherSupervisoryReview,
  );

  if (
    Number(cycleReview.schemaVersion) !== 1 ||
    clean(cycleReview.state) !== "RELEASED" ||
    clean(cycleReview.currentReviewId) !== releaseReview.id ||
    Number(cycleReview.currentReviewStage) !== releaseReview.stage ||
    clean(cycleReview.currentReviewerRole) !== "DISTRICT_DIRECTOR" ||
    clean(cycleReview.currentReviewerAssignmentId) !==
      reviewerAssignmentId ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !==
      expectedReviewEvidenceHash ||
    clean(cycleReview.reviewChainHash).toLowerCase() !==
      expectedReviewChainHash ||
    clean(cycleReview.admittedAssessmentId) !== input.evidence.assessmentId ||
    Number(cycleReview.admittedAssessmentRevision) !== input.evidence.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReview.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(cycleReview.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash ||
    cycleReview.awaitingRevision !== false ||
    clean(cycleReview.releasedAt) !==
      input.cycle.releasedAt!.toISOString() ||
    cycleReview.reviewerMayRewriteScores !== false ||
    cycleReview.reviewerMayRewriteComment !== false ||
    cycleReview.legacyTeacherAppraisalIncluded !== false ||
    cycleReview.combinedWeightingDefined !== false ||
    cycleReview.notificationsSeeded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_CYCLE_RELEASE_ANCHOR_DRIFT",
      409,
    );
  }

  return {
    releaseMode: REVIEWED_RELEASE_MODE,
    releaseProofHash: expectedReleaseProofHash,
    reviewStage: releaseReview.stage,
    reviewEvidenceHashVerified: true,
    reviewChainHashVerified: true,
    directReleaseAuthorityVerified: null,
  };
}

function verifyDirectorAuthoredDirectRelease(input: {
  cycle: ReleasedCycleRecord;
  record: AssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  release: Record<string, unknown>;
}): ReleaseVerification {
  if (
    clean(input.release.releaseMode) !== DIRECT_RELEASE_MODE ||
    input.record.reviews.length !== 0 ||
    input.evidence.assessorRole !== "DISTRICT_DIRECTOR" ||
    input.evidence.revision !== 1 ||
    input.record.priorAssessmentId ||
    input.cycle.closedByUserId !== input.evidence.assessorUserId ||
    !input.cycle.closedAt ||
    !input.cycle.reviewStartedAt ||
    !input.cycle.releasedAt ||
    input.cycle.closedAt.getTime() !==
      input.cycle.reviewStartedAt.getTime() ||
    input.cycle.reviewStartedAt.getTime() !==
      input.cycle.releasedAt.getTime()
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_AUTHORITY_DRIFT",
      409,
    );
  }

  const chain = teacherSupervisoryReviewChainForAssessor(
    input.evidence.assessorRole,
  );

  if (
    !chain ||
    chain.assessorRole !== "DISTRICT_DIRECTOR" ||
    chain.requiresReviewRows !== false ||
    chain.selfReviewAllowed !== false ||
    chain.stages.length !== 0 ||
    chain.terminalAuthorityRole !== "DISTRICT_DIRECTOR"
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_POLICY_DRIFT",
      409,
    );
  }

  const releaserAssignmentId = clean(
    input.release.releaserAssignmentId,
  );
  const expectedDecisionContractHash = directDecisionContractHash();
  const expectedReleaseRequestHash = directReleaseRequestHash({
    evidence: input.evidence,
    releaserAssignmentId,
    decisionContractHash: expectedDecisionContractHash,
  });
  const expectedReleaseEvidenceHash = directReleaseEvidenceHash({
    evidence: input.evidence,
    releaseRequestHash: expectedReleaseRequestHash,
  });
  const expectedProof = directReleaseProofPayload({
    evidence: input.evidence,
    releaserAssignmentId,
    decisionContractHash: expectedDecisionContractHash,
    releaseRequestHash: expectedReleaseRequestHash,
    releaseEvidenceHash: expectedReleaseEvidenceHash,
    releasedAt: input.cycle.releasedAt.toISOString(),
  });
  const expectedReleaseProofHash = hashJson(expectedProof);

  if (
    !releaserAssignmentId ||
    Number(input.release.proofSchemaVersion) !==
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.releaseProofSchemaVersion ||
    clean(input.release.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(input.release.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    clean(input.release.cycleId) !== input.evidence.cycleId ||
    clean(input.release.assessmentId) !== input.evidence.assessmentId ||
    Number(input.release.assessmentRevision) !== 1 ||
    normalized(input.release.assessmentStatus) !== "FINALIZED" ||
    clean(input.release.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(input.release.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(input.release.assessorUserId) !== input.evidence.assessorUserId ||
    clean(input.release.assessorAssignmentId) !==
      input.evidence.assessorAssignmentId ||
    clean(input.release.assessorRole) !== "DISTRICT_DIRECTOR" ||
    input.release.reviewRowsRequired !== false ||
    input.release.reviewRowsPresent !== false ||
    input.release.selfReviewPerformed !== false ||
    clean(input.release.releaserUserId) !== input.evidence.assessorUserId ||
    releaserAssignmentId !== input.evidence.assessorAssignmentId ||
    clean(input.release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    clean(input.release.decisionContractHash).toLowerCase() !==
      expectedDecisionContractHash ||
    clean(input.release.releaseRequestHash).toLowerCase() !==
      expectedReleaseRequestHash ||
    clean(input.release.releaseEvidenceHash).toLowerCase() !==
      expectedReleaseEvidenceHash ||
    clean(input.release.releasedAt) !== input.cycle.releasedAt.toISOString() ||
    input.release.assessmentMutationPerformed !== false ||
    input.release.scoreMutationPerformed !== false ||
    input.release.commentMutationPerformed !== false ||
    input.release.reviewerMayRewriteScores !== false ||
    input.release.reviewerMayRewriteComment !== false ||
    input.release.reviewerMayRewriteObservationDetails !== false ||
    input.release.reviewerMayRewriteGovernanceEnrolmentEvidence !== false ||
    input.release.reviewerMayRewriteTeacherAssignmentProvenance !== false ||
    input.release.reviewerMayRewriteCurriculumProvenance !== false ||
    input.release.legacyTeacherAppraisalIncluded !== false ||
    input.release.combinedWeightingDefined !== false ||
    input.release.notificationsSeeded !== false ||
    input.release.providerCalled !== false ||
    !sameJson(
      Object.fromEntries(
        Object.entries(input.release).filter(
          ([key]) => key !== "releaseProofHash",
        ),
      ),
      expectedProof,
    ) ||
    clean(input.release.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash ||
    !isSha256(input.release.releaseProofHash)
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_PROOF_DRIFT",
      409,
    );
  }

  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).teacherSupervisoryReview,
  );

  if (
    Number(cycleReview.schemaVersion) !== 1 ||
    clean(cycleReview.state) !== "RELEASED" ||
    clean(cycleReview.releaseMode) !== DIRECT_RELEASE_MODE ||
    cycleReview.currentReviewId !== null ||
    cycleReview.currentReviewStage !== null ||
    cycleReview.currentReviewerRole !== null ||
    cycleReview.currentReviewerAssignmentId !== null ||
    cycleReview.reviewEvidenceHash !== null ||
    cycleReview.reviewChainHash !== null ||
    cycleReview.reviewRowsRequired !== false ||
    cycleReview.reviewRowsPresent !== false ||
    cycleReview.selfReviewPerformed !== false ||
    clean(cycleReview.admittedAssessmentId) !== input.evidence.assessmentId ||
    Number(cycleReview.admittedAssessmentRevision) !== 1 ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReview.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(cycleReview.directReleasedByUserId) !==
      input.evidence.assessorUserId ||
    clean(cycleReview.directReleasedByAssignmentId) !==
      input.evidence.assessorAssignmentId ||
    clean(cycleReview.directReleasedByRole) !== "DISTRICT_DIRECTOR" ||
    clean(cycleReview.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash ||
    cycleReview.awaitingRevision !== false ||
    clean(cycleReview.releasedAt) !==
      input.cycle.releasedAt.toISOString() ||
    cycleReview.reviewerMayRewriteScores !== false ||
    cycleReview.reviewerMayRewriteComment !== false ||
    cycleReview.legacyTeacherAppraisalIncluded !== false ||
    cycleReview.combinedWeightingDefined !== false ||
    cycleReview.notificationsSeeded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_CYCLE_ANCHOR_DRIFT",
      409,
    );
  }

  return {
    releaseMode: DIRECT_RELEASE_MODE,
    releaseProofHash: expectedReleaseProofHash,
    reviewStage: null,
    reviewEvidenceHashVerified: null,
    reviewChainHashVerified: null,
    directReleaseAuthorityVerified: true,
  };
}

export async function readTeacherSupervisoryReleasedResult(
  input: ReadTeacherSupervisoryReleasedResultInput,
): Promise<TeacherSupervisoryReleasedResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(
    input.actorTenantId,
    "actorTenantId",
  );
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (
    actorRole !==
    TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.requiredRole
  ) {
    fail("TEACHER_SUPERVISORY_RELEASED_RESULT_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReleasedResultDatabase);

  const verificationDatabase =
    input.verificationDatabase ??
    (database as unknown as Pick<
      TeacherSupervisoryScoringDatabase,
      "appraisalAssessment"
    >);

  const cycle = await database.appraisalCycle.findUnique({
    where: {
      id: cycleId,
    },
    select: CYCLE_SELECT,
  });

  if (!cycle) {
    fail("TEACHER_SUPERVISORY_RELEASED_RESULT_CYCLE_NOT_FOUND", 404);
  }

  if (
    cycle.targetUserId !== actorUserId ||
    clean(cycle.targetTenantId) !== actorTenantId ||
    normalized(cycle.targetRoleSnapshot) !== "TEACHER"
  ) {
    fail("TEACHER_SUPERVISORY_RELEASED_RESULT_TARGET_FORBIDDEN", 403);
  }

  if (
    normalized(cycle.status) !==
      TEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.requiredCycleStatus ||
    !cycle.closedAt ||
    !cycle.reviewStartedAt ||
    !cycle.releasedAt ||
    cycle.cancelledAt
  ) {
    fail("TEACHER_SUPERVISORY_RELEASED_RESULT_NOT_RELEASED", 409, {
      cycleStatus: normalized(cycle.status),
    });
  }

  const memberships = await database.membership.findMany({
    where: {
      userId: actorUserId,
      tenantId: actorTenantId,
      status: "ACTIVE",
      role: {
        name: "TEACHER",
      },
      tenant: {
        status: "ACTIVE",
      },
    },
    select: MEMBERSHIP_SELECT,
  });

  if (memberships.length !== 1) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_ACTIVE_MEMBERSHIP_REQUIRED",
      403,
      { matches: memberships.length },
    );
  }

  const membership = memberships[0];
  const zone = membership.tenant.zone;

  if (
    membership.userId !== actorUserId ||
    membership.tenantId !== actorTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "TEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    !zone.isActive ||
    zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    zone.id !== clean(cycle.targetZoneId) ||
    zone.parentZoneId !== cycle.scopeZoneId ||
    !zone.parentZone ||
    !zone.parentZone.isActive ||
    zone.parentZone.id !== cycle.scopeZoneId ||
    zone.parentZone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_MEMBERSHIP_SCOPE_DRIFT",
      409,
    );
  }

  const release = objectValue(
    objectValue(cycle.metadata)[RELEASE_METADATA_KEY],
  );

  const assessmentId = requireIdentifier(
    release.assessmentId,
    "assessmentId",
  );

  const record = await database.appraisalAssessment.findUnique({
    where: {
      id: assessmentId,
    },
    select: ASSESSMENT_SELECT,
  });

  if (!record) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_ASSESSMENT_NOT_FOUND",
      409,
    );
  }

  const evidence =
    await verifyTeacherSupervisoryFinalizedAssessmentEvidence({
      assessmentId,
      database: verificationDatabase,
    });

  assertAssessmentProjection({
    record,
    evidence,
  });

  if (
    evidence.cycleId !== cycle.id ||
    evidence.targetUserId !== actorUserId ||
    evidence.targetTenantId !== actorTenantId ||
    evidence.targetCircuitZoneId !== zone.id ||
    evidence.targetDistrictZoneId !== zone.parentZone.id
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_FINALIZED_EVIDENCE_SCOPE_DRIFT",
      409,
    );
  }

  const storedReleaseMode = clean(release.releaseMode);

  if (
    storedReleaseMode &&
    storedReleaseMode !== DIRECT_RELEASE_MODE
  ) {
    fail(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_MODE_INVALID",
      409,
      { releaseMode: storedReleaseMode },
    );
  }

  const releaseVerification =
    storedReleaseMode === DIRECT_RELEASE_MODE
      ? verifyDirectorAuthoredDirectRelease({
          cycle,
          record,
          evidence,
          release,
        })
      : verifyReviewedDirectorRelease({
          cycle,
          record,
          evidence,
          release,
        });

  await verifyCorrectionLineage({
    database,
    verificationDatabase,
    currentAssessment: record,
    currentEvidence: evidence,
  });

  const observation = buildObservation({
    record,
    evidence,
    membership,
  });

  const sections = buildSections({
    record,
    evidence,
  });

  return {
    schemaVersion: 1,
    audience: "RELEASED_TEACHER",
    lifecycleState: "RELEASED",
    cycle: {
      id: cycle.id,
      teacherName: observation.teacherName,
      schoolName: observation.schoolName,
      circuitName: observation.circuitName,
      districtName: observation.districtName,
      releasedAt: cycle.releasedAt.toISOString(),
    },
    release: {
      proofSchemaVersion: 1,
      releaseMode: releaseVerification.releaseMode,
      releaseProofHash: releaseVerification.releaseProofHash,
      reviewStage: releaseVerification.reviewStage,
      integrityVerified: true,
    },
    assessment: {
      revision: evidence.revision,
      dateObserved: evidence.dateObserved,
      finalizedAt: evidence.finalizedAt,
      assessorOffice: officeLabel(evidence.assessorRole),
      instrumentCode: evidence.instrumentCode,
      instrumentVersion: evidence.instrumentVersion,
      overallPercentage: evidence.overallPercentage,
      sectionPercentages: evidence.sectionPercentages,
      generalComment: record.generalComment,
      sections,
    },
    observation,
    privacy: {
      assessorIdentityIncluded: false,
      reviewerIdentityIncluded: false,
      reviewerAssignmentIncluded: false,
      reviewNotesIncluded: false,
      returnReasonsIncluded: false,
      rawEvidenceSnapshotIncluded: false,
      rawMetadataIncluded: false,
      contactDetailsIncluded: false,
    },
    integrity: {
      finalizedAssessmentEvidenceVerified: true,
      assessmentHashVerified: true,
      observationContextHashVerified: true,
      releaseModeVerified: true,
      reviewEvidenceHashVerified:
        releaseVerification.reviewEvidenceHashVerified,
      reviewChainHashVerified:
        releaseVerification.reviewChainHashVerified,
      directReleaseAuthorityVerified:
        releaseVerification.directReleaseAuthorityVerified,
      decisionContractHashVerified: true,
      releaseRequestHashVerified: true,
      releaseEvidenceHashVerified: true,
      releaseProofHashVerified: true,
      cycleReviewReleaseAnchorsVerified: true,
      correctionLineageVerified: true,
      officialFormProjectionVerified: true,
      generalCommentIncludedInAssessmentHash: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      scoreMutationAllowed: false,
    },
  };
}
