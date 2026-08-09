import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertAppraisalCycleTransition,
} from "@/lib/appraisals/workflow";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  TEACHER_SUPERVISORY_REVIEW_POLICY,
  decideTeacherSupervisoryReviewAuthority,
  teacherSupervisoryReviewChainForAssessor,
  type TeacherSupervisoryReviewerRole,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  requiredAssessmentStatus: "FINALIZED",
  initialCycleStatus: "OPEN",
  intermediateCycleStatus: "CLOSED",
  admittedCycleStatus: "UNDER_REVIEW",
  reviewDecisionAtAdmission: "PENDING",
  explicitConfirmationRequired: true,
  currentTargetRequired: true,
  currentReviewerAssignmentRequired: true,
  immutableEvidenceReverificationRequired: true,
  initialReviewOnly: true,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  reviewerMayRewriteObservationDetails: false,
  reviewerMayRewriteGovernanceEnrolmentEvidence: false,
  reviewerMayRewriteTeacherAssignmentProvenance: false,
  reviewerMayRewriteCurriculumProvenance: false,
  assessmentMutationAllowed: false,
  scoreMutationAllowed: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const REVIEW_ADMITTED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_REVIEW_ADMITTED";

export type TeacherSupervisoryReviewAdmissionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  confirm: boolean;
  governanceScope: GovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryReviewAdmissionDatabase;
};

export type TeacherSupervisoryReviewAdmissionResult = {
  outcome: "STARTED" | "EXISTING_REVIEW";
  assessmentId: string;
  assessmentRevision: number;
  assessmentHash: string;
  observationContextHash: string;
  cycleId: string;
  cycleStatus: "UNDER_REVIEW";
  reviewId: string;
  reviewStage: number;
  reviewDecision: "PENDING";
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewStartedAt: string;
  reviewEvidenceHash: string;
  evidenceVerified: true;
  scoreMutationPerformed: false;
  assessmentMutationPerformed: false;
  providerCalled: false;
};

type CycleRecord = {
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
  closedByUserId: string | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  _count: {
    participants: number;
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
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: {
        level: number;
      };
      parentZone: null | {
        id: string;
        isActive: boolean;
        zoneType: {
          level: number;
        };
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
    isActive: boolean;
    zoneType: {
      level: number;
    };
  };
};

type CountResult = {
  count: number;
};

export type TeacherSupervisoryReviewAdmissionTransactionClient = {
  appraisalAssessment: TeacherSupervisoryScoringDatabase["appraisalAssessment"];
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findUnique(args: unknown): Promise<ReviewRecord | null>;
    create(args: unknown): Promise<ReviewRecord>;
  };
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<ReviewerAssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type TeacherSupervisoryReviewAdmissionDatabase = {
  appraisalAssessment: TeacherSupervisoryReviewAdmissionTransactionClient["appraisalAssessment"];
  appraisalCycle: TeacherSupervisoryReviewAdmissionTransactionClient["appraisalCycle"];
  appraisalReview: TeacherSupervisoryReviewAdmissionTransactionClient["appraisalReview"];
  membership: TeacherSupervisoryReviewAdmissionTransactionClient["membership"];
  governanceOfficerAssignment: TeacherSupervisoryReviewAdmissionTransactionClient["governanceOfficerAssignment"];
  auditLog: TeacherSupervisoryReviewAdmissionTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: TeacherSupervisoryReviewAdmissionTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
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
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function canonicalReviewerRole(
  value: unknown,
): TeacherSupervisoryReviewerRole | null {
  const role = normalized(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles.includes(
    role as TeacherSupervisoryReviewerRole,
  )
    ? (role as TeacherSupervisoryReviewerRole)
    : null;
}

function assignmentIsCurrent(
  assignment: ReviewerAssignmentRecord,
  actorUserId: string,
  reviewerRole: TeacherSupervisoryReviewerRole,
  districtId: string,
  now: Date,
) {
  if (
    assignment.userId !== actorUserId ||
    normalized(assignment.role) !== reviewerRole ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== districtId ||
    assignment.zone.id !== districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
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

function resolveReviewerAssignment(input: {
  assignments: ReviewerAssignmentRecord[];
  actorUserId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  districtId: string;
  now: Date;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent(
      assignment,
      input.actorUserId,
      input.reviewerRole,
      input.districtId,
      input.now,
    ),
  );

  if (matches.length === 0) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_AMBIGUOUS_ASSIGNMENT", 409, {
      activeAssignments: matches.length,
    });
  }
  return matches[0];
}

function assertGovernanceScope(input: {
  governanceScope: GovernanceScope;
  tenantId: string;
  circuitId: string;
  districtId: string;
}) {
  const tenantIds = new Set(
    input.governanceScope.tenantIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.has(input.tenantId)) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_TENANT_OUT_OF_SCOPE", 403);
  }
  if (input.governanceScope.isSuperAdmin) return;

  const zoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );
  if (!zoneIds.has(input.circuitId) && !zoneIds.has(input.districtId)) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_ZONE_OUT_OF_SCOPE", 403);
  }
}

function assertCurrentTarget(
  membership: TargetMembershipRecord | null,
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence,
) {
  const zone = membership?.tenant.zone;
  const district = zone?.parentZone;

  if (
    !membership ||
    membership.userId !== evidence.targetUserId ||
    membership.tenantId !== evidence.targetTenantId ||
    membership.tenant.id !== evidence.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "TEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    zone.id !== evidence.targetCircuitZoneId ||
    zone.parentZoneId !== evidence.targetDistrictZoneId ||
    !district ||
    district.id !== evidence.targetDistrictZoneId ||
    district.isActive !== true ||
    district.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_TARGET_CONTEXT_INVALID", 409);
  }
}

function assertCycleContract(
  cycle: CycleRecord,
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence,
) {
  const metadata = objectValue(cycle.metadata);
  const status = normalized(cycle.status);

  if (
    cycle.id !== evidence.cycleId ||
    cycle.scopeZoneId !== evidence.targetDistrictZoneId ||
    cycle.targetUserId !== evidence.targetUserId ||
    cycle.targetTenantId !== evidence.targetTenantId ||
    cycle.targetZoneId !== evidence.targetCircuitZoneId ||
    !cycle.openedAt ||
    cycle.deadlineAt !== null ||
    cycle.releasedAt !== null ||
    cycle.cancelledAt !== null ||
    cycle.responseWindowDays !== 0 ||
    cycle.minimumResponses !== 0 ||
    cycle._count.participants !== 0 ||
    clean(metadata.workflow) !==
      TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.workflow ||
    clean(metadata.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.evidenceStream ||
    metadata.respondentWorkflow !== false ||
    clean(metadata.participantSelection) !== "NONE" ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
      status,
    });
  }

  if (status === "OPEN") {
    if (
      cycle.closedAt !== null ||
      cycle.closedByUserId !== null ||
      cycle.reviewStartedAt !== null
    ) {
      fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_OPEN_CYCLE_DRIFT", 409);
    }
    return "OPEN" as const;
  }

  if (status === "UNDER_REVIEW") {
    if (
      !cycle.closedAt ||
      !cycle.closedByUserId ||
      !cycle.reviewStartedAt ||
      cycle.closedAt.getTime() !== cycle.reviewStartedAt.getTime()
    ) {
      fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_REVIEW_CYCLE_DRIFT", 409);
    }
    return "UNDER_REVIEW" as const;
  }

  fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_CYCLE_NOT_ADMISSIBLE", 409, {
    status,
  });
}

export function computeTeacherSupervisoryReviewEvidenceHash(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewStage: number;
}) {
  return hashJson({
    schemaVersion: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.evidenceStream,
    assessment: {
      id: input.evidence.assessmentId,
      cycleId: input.evidence.cycleId,
      revision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      finalizedAt: input.evidence.finalizedAt,
    },
    target: {
      userId: input.evidence.targetUserId,
      tenantId: input.evidence.targetTenantId,
      circuitZoneId: input.evidence.targetCircuitZoneId,
      districtZoneId: input.evidence.targetDistrictZoneId,
    },
    assessor: {
      userId: input.evidence.assessorUserId,
      assignmentId: input.evidence.assessorAssignmentId,
      role: input.evidence.assessorRole,
      scopeLevel: input.evidence.assessorScopeLevel,
    },
    instrument: {
      instrumentVersionId: input.evidence.instrumentVersionId,
      code: input.evidence.instrumentCode,
      version: input.evidence.instrumentVersion,
      contentHash: input.evidence.instrumentContentHash,
    },
    reviewer: {
      userId: input.reviewerUserId,
      assignmentId: input.reviewerAssignmentId,
      role: input.reviewerRole,
      stage: input.reviewStage,
    },
    generalCommentIncludedInAssessmentHash: true,
    immutableEvidenceReverified: true,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteComment: false,
    reviewerMayRewriteObservationDetails: false,
    reviewerMayRewriteGovernanceEnrolmentEvidence: false,
    reviewerMayRewriteTeacherAssignmentProvenance: false,
    reviewerMayRewriteCurriculumProvenance: false,
    legacyTeacherAppraisalIncluded: false,
    combinedWeightingDefined: false,
  });
}

function reviewMetadata(input: {
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewStage: number;
  reviewEvidenceHash: string;
}) {
  return {
    schemaVersion: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.schemaVersion,
    workflow: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.workflow,
    evidenceStream: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.evidenceStream,
    reviewType: "INITIAL_UPSTREAM_REVIEW",
    reviewStage: input.reviewStage,
    reviewerRole: input.reviewerRole,
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
  };
}

function cycleReviewMetadata(input: {
  cycleMetadata: unknown;
  reviewId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewerAssignmentId: string;
  reviewStage: number;
  reviewEvidenceHash: string;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  admittedAt: Date;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      schemaVersion: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.schemaVersion,
      reviewType: "INITIAL_UPSTREAM_REVIEW",
      currentReviewId: input.reviewId,
      currentReviewStage: input.reviewStage,
      currentReviewerRole: input.reviewerRole,
      currentReviewerAssignmentId: input.reviewerAssignmentId,
      reviewEvidenceHash: input.reviewEvidenceHash,
      admittedAssessmentId: input.evidence.assessmentId,
      admittedAssessmentRevision: input.evidence.revision,
      assessmentHash: input.evidence.assessmentHash,
      observationContextHash: input.evidence.observationContextHash,
      admittedAt: input.admittedAt.toISOString(),
      immutableEvidenceReverified: true,
      generalCommentIncludedInAssessmentHash: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
    },
  };
}

function existingReviewResult(input: {
  cycle: CycleRecord;
  review: ReviewRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  actorUserId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewerAssignmentId: string;
  reviewStage: number;
  expectedEvidenceHash: string;
}) {
  const reviewMetadataValue = objectValue(input.review.metadata);
  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).teacherSupervisoryReview,
  );

  if (
    normalized(input.cycle.status) !== "UNDER_REVIEW" ||
    !input.cycle.reviewStartedAt ||
    !input.cycle.closedAt ||
    input.cycle.closedAt.getTime() !== input.cycle.reviewStartedAt.getTime() ||
    input.cycle.closedByUserId !== input.actorUserId ||
    input.review.cycleId !== input.cycle.id ||
    input.review.assessmentId !== input.evidence.assessmentId ||
    input.review.reviewerUserId !== input.actorUserId ||
    input.review.reviewerAssignmentId !== input.reviewerAssignmentId ||
    input.review.stage !== input.reviewStage ||
    normalized(input.review.decision) !== "PENDING" ||
    clean(input.review.note) ||
    input.review.decidedAt ||
    clean(reviewMetadataValue.reviewEvidenceHash).toLowerCase() !==
      input.expectedEvidenceHash ||
    clean(reviewMetadataValue.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(reviewMetadataValue.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    reviewMetadataValue.immutableEvidenceReverified !== true ||
    reviewMetadataValue.generalCommentIncludedInAssessmentHash !== true ||
    reviewMetadataValue.reviewerMayRewriteScores !== false ||
    reviewMetadataValue.reviewerMayRewriteComment !== false ||
    reviewMetadataValue.assessmentMutationPerformed !== false ||
    reviewMetadataValue.scoreMutationPerformed !== false ||
    reviewMetadataValue.legacyTeacherAppraisalIncluded !== false ||
    reviewMetadataValue.combinedWeightingDefined !== false ||
    reviewMetadataValue.providerCalled !== false ||
    clean(cycleReview.currentReviewId) !== input.review.id ||
    Number(cycleReview.currentReviewStage) !== input.reviewStage ||
    clean(cycleReview.currentReviewerRole) !== input.reviewerRole ||
    clean(cycleReview.currentReviewerAssignmentId) !==
      input.reviewerAssignmentId ||
    clean(cycleReview.reviewEvidenceHash).toLowerCase() !==
      input.expectedEvidenceHash ||
    clean(cycleReview.admittedAssessmentId) !== input.evidence.assessmentId ||
    Number(cycleReview.admittedAssessmentRevision) !== input.evidence.revision ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReview.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_EXISTING_REVIEW_DRIFT", 409);
  }

  return {
    outcome: "EXISTING_REVIEW" as const,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.revision,
    assessmentHash: input.evidence.assessmentHash,
    observationContextHash: input.evidence.observationContextHash,
    cycleId: input.cycle.id,
    cycleStatus: "UNDER_REVIEW" as const,
    reviewId: input.review.id,
    reviewStage: input.reviewStage,
    reviewDecision: "PENDING" as const,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.reviewerAssignmentId,
    reviewerRole: input.reviewerRole,
    reviewStartedAt: input.cycle.reviewStartedAt.toISOString(),
    reviewEvidenceHash: input.expectedEvidenceHash,
    evidenceVerified: true as const,
    scoreMutationPerformed: false as const,
    assessmentMutationPerformed: false as const,
    providerCalled: false as const,
  };
}

function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

async function runAdmission(
  input: TeacherSupervisoryReviewAdmissionInput,
  database: TeacherSupervisoryReviewAdmissionDatabase,
  allowCreate: boolean,
): Promise<TeacherSupervisoryReviewAdmissionResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const reviewerRole = canonicalReviewerRole(input.actorRoleName);

  if (input.confirm !== true) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_CONFIRMATION_REQUIRED", 400);
  }
  if (!reviewerRole) {
    fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_REVIEWER_ROLE_FORBIDDEN", 403);
  }

  return database.$transaction(
    async (tx) => {
      const evidence =
        await verifyTeacherSupervisoryFinalizedAssessmentEvidence({
          assessmentId,
          database: tx,
        });

      const chain = teacherSupervisoryReviewChainForAssessor(
        evidence.assessorRole,
      );
      const firstStage = chain?.stages[0] ?? null;

      if (!chain || !chain.requiresReviewRows || !firstStage) {
        fail(
          "TEACHER_SUPERVISORY_REVIEW_ADMISSION_SELF_REVIEW_PATH_FORBIDDEN",
          403,
          { assessorRole: evidence.assessorRole },
        );
      }

      const authority = decideTeacherSupervisoryReviewAuthority({
        actorUserId,
        actorRoleName: reviewerRole,
        assessorUserId: evidence.assessorUserId,
        assessorRoleName: evidence.assessorRole,
        stage: firstStage.stage,
      });
      if (!authority.allowed) {
        fail(
          `TEACHER_SUPERVISORY_REVIEW_ADMISSION_${authority.reason}`,
          403,
          { reason: authority.reason },
        );
      }

      assertGovernanceScope({
        governanceScope: input.governanceScope,
        tenantId: evidence.targetTenantId,
        circuitId: evidence.targetCircuitZoneId,
        districtId: evidence.targetDistrictZoneId,
      });

      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: evidence.cycleId },
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
          closedByUserId: true,
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
      });
      if (!cycle) {
        fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_CYCLE_NOT_FOUND", 404);
      }

      const cycleState = assertCycleContract(cycle, evidence);

      const membership = await tx.membership.findFirst({
        where: {
          userId: evidence.targetUserId,
          tenantId: evidence.targetTenantId,
          status: "ACTIVE",
          role: {
            name: {
              equals: "TEACHER",
              mode: "insensitive",
            },
          },
          tenant: {
            status: "ACTIVE",
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
                  isActive: true,
                  parentZoneId: true,
                  zoneType: {
                    select: {
                      level: true,
                    },
                  },
                  parentZone: {
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
              },
            },
          },
        },
      });
      assertCurrentTarget(membership, evidence);

      const reviewerAssignments =
        await tx.governanceOfficerAssignment.findMany({
          where: {
            userId: actorUserId,
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

      const reviewerAssignment = resolveReviewerAssignment({
        assignments: reviewerAssignments,
        actorUserId,
        reviewerRole,
        districtId: evidence.targetDistrictZoneId,
        now,
      });

      const evidenceHash = computeTeacherSupervisoryReviewEvidenceHash({
        evidence,
        reviewerUserId: actorUserId,
        reviewerAssignmentId: reviewerAssignment.id,
        reviewerRole,
        reviewStage: authority.stage,
      });

      const existing = await tx.appraisalReview.findUnique({
        where: {
          assessmentId_stage: {
            assessmentId: evidence.assessmentId,
            stage: authority.stage,
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

      if (cycleState === "UNDER_REVIEW") {
        if (!existing) {
          fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_RECORD_MISSING", 409);
        }
        return existingReviewResult({
          cycle,
          review: existing,
          evidence,
          actorUserId,
          reviewerRole,
          reviewerAssignmentId: reviewerAssignment.id,
          reviewStage: authority.stage,
          expectedEvidenceHash: evidenceHash,
        });
      }

      if (existing) {
        fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_PREMATURE_REVIEW_RECORD", 409);
      }
      if (!allowCreate) {
        fail(
          "TEACHER_SUPERVISORY_REVIEW_ADMISSION_CONCURRENT_STATE_NOT_VISIBLE",
          409,
        );
      }

      assertAppraisalCycleTransition("OPEN", "CLOSED");
      assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW");

      const closeResult = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "OPEN",
          closedAt: null,
          reviewStartedAt: null,
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedByUserId: actorUserId,
        },
      });
      if (closeResult.count !== 1) {
        fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_CLOSE_RACE", 409);
      }

      const review = await tx.appraisalReview.create({
        data: {
          cycleId: cycle.id,
          assessmentId: evidence.assessmentId,
          reviewerUserId: actorUserId,
          reviewerAssignmentId: reviewerAssignment.id,
          stage: authority.stage,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata: reviewMetadata({
            evidence,
            reviewerRole,
            reviewStage: authority.stage,
            reviewEvidenceHash: evidenceHash,
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

      const underReviewResult = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "CLOSED",
          closedAt: now,
          closedByUserId: actorUserId,
          reviewStartedAt: null,
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "UNDER_REVIEW",
          reviewStartedAt: now,
          metadata: cycleReviewMetadata({
            cycleMetadata: cycle.metadata,
            reviewId: review.id,
            reviewerRole,
            reviewerAssignmentId: reviewerAssignment.id,
            reviewStage: authority.stage,
            reviewEvidenceHash: evidenceHash,
            evidence,
            admittedAt: now,
          }),
        },
      });
      if (underReviewResult.count !== 1) {
        fail("TEACHER_SUPERVISORY_REVIEW_ADMISSION_START_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: evidence.targetTenantId,
          userId: actorUserId,
          action: REVIEW_ADMITTED_AUDIT_ACTION,
          resource: "AppraisalReview",
          resourceId: review.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: REVIEW_ADMITTED_AUDIT_ACTION,
            workflow: TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.workflow,
            evidenceStream:
              TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.evidenceStream,
            cycleId: evidence.cycleId,
            assessmentId: evidence.assessmentId,
            assessmentRevision: evidence.revision,
            assessorUserId: evidence.assessorUserId,
            assessorAssignmentId: evidence.assessorAssignmentId,
            assessorRole: evidence.assessorRole,
            reviewerAssignmentId: reviewerAssignment.id,
            reviewerRole,
            reviewId: review.id,
            reviewStage: authority.stage,
            assessmentHash: evidence.assessmentHash,
            observationContextHash: evidence.observationContextHash,
            reviewEvidenceHash: evidenceHash,
            immutableEvidenceReverified: true,
            generalCommentIncludedInAssessmentHash: true,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            commentTextRecordedInAudit: false,
            observationDetailsRecordedInAudit: false,
            classEnrolmentRecordedInAudit: false,
            contactFieldsIncluded: false,
            assessmentMutationPerformed: false,
            scoreMutationPerformed: false,
            legacyTeacherAppraisalIncluded: false,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "STARTED" as const,
        assessmentId: evidence.assessmentId,
        assessmentRevision: evidence.revision,
        assessmentHash: evidence.assessmentHash,
        observationContextHash: evidence.observationContextHash,
        cycleId: evidence.cycleId,
        cycleStatus: "UNDER_REVIEW" as const,
        reviewId: review.id,
        reviewStage: authority.stage,
        reviewDecision: "PENDING" as const,
        reviewerUserId: actorUserId,
        reviewerAssignmentId: reviewerAssignment.id,
        reviewerRole,
        reviewStartedAt: now.toISOString(),
        reviewEvidenceHash: evidenceHash,
        evidenceVerified: true as const,
        scoreMutationPerformed: false as const,
        assessmentMutationPerformed: false as const,
        providerCalled: false as const,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.transactionMaxWaitMs,
      timeout:
        TEACHER_SUPERVISORY_REVIEW_ADMISSION_POLICY.transactionTimeoutMs,
    },
  );
}

export async function startTeacherSupervisoryReviewAdmission(
  input: TeacherSupervisoryReviewAdmissionInput,
): Promise<TeacherSupervisoryReviewAdmissionResult> {
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReviewAdmissionDatabase);

  try {
    return await runAdmission(input, database, true);
  } catch (error) {
    if (isPrismaCode(error, "P2002")) {
      return runAdmission(input, database, false);
    }
    if (!isPrismaCode(error, "P2034")) throw error;

    try {
      return await runAdmission(input, database, true);
    } catch (retryError) {
      if (!isPrismaCode(retryError, "P2002")) throw retryError;
      return runAdmission(input, database, false);
    }
  }
}
