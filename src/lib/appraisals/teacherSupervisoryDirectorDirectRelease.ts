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
  teacherSupervisoryReviewChainForAssessor,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
  requiredActorRole: "DISTRICT_DIRECTOR",
  requiredAssessorRole: "DISTRICT_DIRECTOR",
  requiredAssessmentStatus: "FINALIZED",
  requiredInitialCycleStatus: "OPEN",
  intermediateClosedCycleStatus: "CLOSED",
  intermediateReviewCycleStatus: "UNDER_REVIEW",
  releasedCycleStatus: "RELEASED",
  explicitConfirmationRequired: true,
  exactAssessorAsReleaserRequired: true,
  exactAssessorAssignmentAsReleaserAssignmentRequired: true,
  reviewRowsRequired: false,
  reviewRowsAllowed: false,
  selfReviewAllowed: false,
  initialRevisionOnly: true,
  immutableEvidenceReverificationRequired: true,
  currentTargetRequired: true,
  currentDirectorAssignmentRequired: true,
  assessmentMutationAllowed: false,
  scoreMutationAllowed: false,
  commentMutationAllowed: false,
  observationMutationAllowed: false,
  governanceEnrolmentMutationAllowed: false,
  teacherAssignmentProvenanceMutationAllowed: false,
  curriculumProvenanceMutationAllowed: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const RELEASE_METADATA_KEY = "teacherSupervisoryRelease";
const DIRECT_RELEASE_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_DIRECTOR_AUTHORED_DIRECT_RELEASED";

export type ExecuteTeacherSupervisoryDirectorDirectReleaseInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  confirm: boolean;
  governanceScope: GovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryDirectorDirectReleaseDatabase;
};

export type ExecuteTeacherSupervisoryDirectorDirectReleaseResult = {
  outcome: "RELEASED" | "EXISTING_RELEASED";
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE";
  assessmentId: string;
  assessmentRevision: 1;
  assessmentStatus: "FINALIZED";
  cycleId: string;
  cycleStatus: "RELEASED";
  assessorUserId: string;
  assessorAssignmentId: string;
  releaserUserId: string;
  releaserAssignmentId: string;
  releaserRole: "DISTRICT_DIRECTOR";
  reviewRowsRequired: false;
  reviewRowsPresent: false;
  selfReviewPerformed: false;
  assessmentHash: string;
  observationContextHash: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releaseProofHash: string;
  releasedAt: string;
  assessmentMutationPerformed: false;
  scoreMutationPerformed: false;
  commentMutationPerformed: false;
  providerCalled: false;
};

type CountResult = {
  count: number;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetRoleSnapshot: string | null;
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
    isActive: boolean;
    zoneType: {
      level: number;
    };
  };
};

type ReviewRecord = {
  id: string;
  assessmentId: string;
};

export type TeacherSupervisoryDirectorDirectReleaseTransactionClient = {
  appraisalAssessment: TeacherSupervisoryScoringDatabase["appraisalAssessment"];
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findMany(args: unknown): Promise<ReviewRecord[]>;
  };
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<DirectorAssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type TeacherSupervisoryDirectorDirectReleaseDatabase = {
  appraisalAssessment:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalAssessment"];
  appraisalCycle:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalCycle"];
  appraisalReview:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalReview"];
  membership:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["membership"];
  governanceOfficerAssignment:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["governanceOfficerAssignment"];
  auditLog:
    TeacherSupervisoryDirectorDirectReleaseTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: TeacherSupervisoryDirectorDirectReleaseTransactionClient,
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

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
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
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INVALID_IDENTIFIER",
      400,
      { fieldName },
    );
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INVALID_CURRENT_TIME",
      400,
    );
  }
  return date;
}

function assignmentIsCurrent(
  assignment: DirectorAssignmentRecord,
  actorUserId: string,
  districtId: string,
  now: Date,
) {
  if (
    assignment.userId !== actorUserId ||
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
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

  if (
    assignment.startsAt &&
    assignment.startsAt.getTime() > now.getTime()
  ) {
    return false;
  }

  if (
    assignment.endsAt &&
    assignment.endsAt.getTime() <= now.getTime()
  ) {
    return false;
  }

  return true;
}

function requireExactCurrentDirectorAssignment(input: {
  assignments: DirectorAssignmentRecord[];
  actorUserId: string;
  districtId: string;
  expectedAssignmentId: string;
  now: Date;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent(
      assignment,
      input.actorUserId,
      input.districtId,
      input.now,
    ),
  );

  if (matches.length === 0) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ACTIVE_ASSIGNMENT_REQUIRED",
      403,
    );
  }

  if (matches.length !== 1) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_AMBIGUOUS_ASSIGNMENT",
      409,
      { activeAssignments: matches.length },
    );
  }

  if (matches[0].id !== input.expectedAssignmentId) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ASSESSOR_ASSIGNMENT_DRIFT",
      409,
    );
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
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_TENANT_OUT_OF_SCOPE",
      403,
    );
  }

  if (input.governanceScope.isSuperAdmin) return;

  const zoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );

  if (
    !zoneIds.has(input.circuitId) &&
    !zoneIds.has(input.districtId)
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ZONE_OUT_OF_SCOPE",
      403,
    );
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
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_TARGET_CONTEXT_INVALID",
      409,
    );
  }
}

function assertDirectReleaseAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}) {
  const actorRole = normalized(input.actorRoleName);
  const chain = teacherSupervisoryReviewChainForAssessor(
    input.evidence.assessorRole,
  );

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ROLE_FORBIDDEN",
      403,
    );
  }

  if (
    input.evidence.assessorRole !== "DISTRICT_DIRECTOR" ||
    input.evidence.assessorUserId !== input.actorUserId ||
    !chain ||
    chain.assessorRole !== "DISTRICT_DIRECTOR" ||
    chain.requiresReviewRows !== false ||
    chain.selfReviewAllowed !== false ||
    chain.stages.length !== 0 ||
    chain.terminalAuthorityRole !== "DISTRICT_DIRECTOR"
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_AUTHORITY_INVALID",
      403,
    );
  }

  if (input.evidence.revision !== 1) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INITIAL_REVISION_REQUIRED",
      409,
      { revision: input.evidence.revision },
    );
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
    normalized(cycle.targetRoleSnapshot) !== "TEACHER" ||
    !cycle.openedAt ||
    cycle.deadlineAt !== null ||
    cycle.cancelledAt !== null ||
    cycle.responseWindowDays !== 0 ||
    cycle.minimumResponses !== 0 ||
    cycle._count.participants !== 0 ||
    clean(metadata.workflow) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow ||
    clean(metadata.evidenceStream) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream ||
    metadata.respondentWorkflow !== false ||
    clean(metadata.participantSelection) !== "NONE" ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_CONTRACT_INVALID",
      409,
      { cycleId: cycle.id, status },
    );
  }

  if (status === "OPEN") {
    if (
      cycle.closedAt !== null ||
      cycle.closedByUserId !== null ||
      cycle.reviewStartedAt !== null ||
      cycle.releasedAt !== null ||
      Object.keys(
        objectValue(metadata.teacherSupervisoryReview),
      ).length !== 0 ||
      Object.keys(
        objectValue(metadata[RELEASE_METADATA_KEY]),
      ).length !== 0
    ) {
      fail(
        "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_OPEN_CYCLE_DRIFT",
        409,
      );
    }

    return "OPEN" as const;
  }

  if (status === "RELEASED") {
    if (
      !cycle.closedAt ||
      !cycle.closedByUserId ||
      !cycle.reviewStartedAt ||
      !cycle.releasedAt ||
      cycle.closedAt.getTime() !==
        cycle.reviewStartedAt.getTime() ||
      cycle.reviewStartedAt.getTime() !==
        cycle.releasedAt.getTime()
    ) {
      fail(
        "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_RELEASED_CYCLE_DRIFT",
        409,
      );
    }

    return "RELEASED" as const;
  }

  fail(
    "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_NOT_RELEASABLE",
    409,
    { status },
  );
}

function directDecisionContractHash() {
  return hashJson({
    schemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
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
    schemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
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
    schemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    releaseMode:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
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
  releasedAt: Date;
}) {
  return {
    proofSchemaVersion:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.proofSchemaVersion,
    releaseMode:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    workflow:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
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
    releasedAt: input.releasedAt.toISOString(),
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

function cycleMetadataForDirectRelease(input: {
  cycleMetadata: unknown;
  proof: ReturnType<typeof directReleaseProofPayload>;
  releaseProofHash: string;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    teacherSupervisoryReview: {
      schemaVersion: 1,
      state: "RELEASED",
      releaseMode:
        TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
      currentReviewId: null,
      currentReviewStage: null,
      currentReviewerRole: null,
      currentReviewerAssignmentId: null,
      reviewEvidenceHash: null,
      reviewChainHash: null,
      reviewRowsRequired: false,
      reviewRowsPresent: false,
      selfReviewPerformed: false,
      admittedAssessmentId: input.proof.assessmentId,
      admittedAssessmentRevision: input.proof.assessmentRevision,
      assessmentHash: input.proof.assessmentHash,
      observationContextHash: input.proof.observationContextHash,
      directReleasedByUserId: input.proof.releaserUserId,
      directReleasedByAssignmentId:
        input.proof.releaserAssignmentId,
      directReleasedByRole: input.proof.releaserRole,
      releaseProofHash: input.releaseProofHash,
      awaitingRevision: false,
      releasedAt: input.proof.releasedAt,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
      notificationsSeeded: false,
      providerCalled: false,
    },
    [RELEASE_METADATA_KEY]: {
      ...input.proof,
      releaseProofHash: input.releaseProofHash,
    },
  };
}

function extractReleaseProof(value: unknown) {
  return objectValue(objectValue(value)[RELEASE_METADATA_KEY]);
}

function expectedDirectReleaseProofHash(
  release: Record<string, unknown>,
) {
  return hashJson({
    proofSchemaVersion: release.proofSchemaVersion,
    releaseMode: release.releaseMode,
    workflow: release.workflow,
    evidenceStream: release.evidenceStream,
    cycleId: release.cycleId,
    assessmentId: release.assessmentId,
    assessmentRevision: release.assessmentRevision,
    assessmentStatus: release.assessmentStatus,
    assessmentHash: release.assessmentHash,
    observationContextHash: release.observationContextHash,
    assessorUserId: release.assessorUserId,
    assessorAssignmentId: release.assessorAssignmentId,
    assessorRole: release.assessorRole,
    reviewRowsRequired: release.reviewRowsRequired,
    reviewRowsPresent: release.reviewRowsPresent,
    selfReviewPerformed: release.selfReviewPerformed,
    releaserUserId: release.releaserUserId,
    releaserAssignmentId: release.releaserAssignmentId,
    releaserRole: release.releaserRole,
    decisionContractHash: release.decisionContractHash,
    releaseRequestHash: release.releaseRequestHash,
    releaseEvidenceHash: release.releaseEvidenceHash,
    releasedAt: release.releasedAt,
    assessmentMutationPerformed: release.assessmentMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    commentMutationPerformed: release.commentMutationPerformed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    reviewerMayRewriteComment: release.reviewerMayRewriteComment,
    reviewerMayRewriteObservationDetails:
      release.reviewerMayRewriteObservationDetails,
    reviewerMayRewriteGovernanceEnrolmentEvidence:
      release.reviewerMayRewriteGovernanceEnrolmentEvidence,
    reviewerMayRewriteTeacherAssignmentProvenance:
      release.reviewerMayRewriteTeacherAssignmentProvenance,
    reviewerMayRewriteCurriculumProvenance:
      release.reviewerMayRewriteCurriculumProvenance,
    legacyTeacherAppraisalIncluded:
      release.legacyTeacherAppraisalIncluded,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    providerCalled: release.providerCalled,
  });
}

function assertExistingDirectRelease(input: {
  cycle: CycleRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  releaserAssignmentId: string;
  reviewRows: ReviewRecord[];
}) {
  if (input.reviewRows.length !== 0) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
      409,
      { reviewRows: input.reviewRows.length },
    );
  }

  const release = extractReleaseProof(input.cycle.metadata);
  const cycleReview = objectValue(
    objectValue(input.cycle.metadata).teacherSupervisoryReview,
  );
  const releasedAt = input.cycle.releasedAt?.toISOString() ?? "";
  const contractHash = directDecisionContractHash();
  const requestHash = directReleaseRequestHash({
    evidence: input.evidence,
    releaserAssignmentId: input.releaserAssignmentId,
    decisionContractHash: contractHash,
  });
  const evidenceHash = directReleaseEvidenceHash({
    evidence: input.evidence,
    releaseRequestHash: requestHash,
  });
  const proof = directReleaseProofPayload({
    evidence: input.evidence,
    releaserAssignmentId: input.releaserAssignmentId,
    decisionContractHash: contractHash,
    releaseRequestHash: requestHash,
    releaseEvidenceHash: evidenceHash,
    releasedAt: input.cycle.releasedAt!,
  });
  const proofHash = hashJson(proof);

  if (
    !releasedAt ||
    input.cycle.closedByUserId !== input.evidence.assessorUserId ||
    Number(release.proofSchemaVersion) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.proofSchemaVersion ||
    clean(release.releaseMode) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    clean(release.workflow) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow ||
    clean(release.evidenceStream) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream ||
    clean(release.cycleId) !== input.evidence.cycleId ||
    clean(release.assessmentId) !== input.evidence.assessmentId ||
    Number(release.assessmentRevision) !== 1 ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(release.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(release.assessorUserId) !== input.evidence.assessorUserId ||
    clean(release.assessorAssignmentId) !==
      input.evidence.assessorAssignmentId ||
    clean(release.assessorRole) !== "DISTRICT_DIRECTOR" ||
    release.reviewRowsRequired !== false ||
    release.reviewRowsPresent !== false ||
    release.selfReviewPerformed !== false ||
    clean(release.releaserUserId) !== input.evidence.assessorUserId ||
    clean(release.releaserAssignmentId) !== input.releaserAssignmentId ||
    clean(release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    clean(release.decisionContractHash).toLowerCase() !== contractHash ||
    clean(release.releaseRequestHash).toLowerCase() !== requestHash ||
    clean(release.releaseEvidenceHash).toLowerCase() !== evidenceHash ||
    clean(release.releasedAt) !== releasedAt ||
    clean(release.releaseProofHash).toLowerCase() !== proofHash ||
    !isSha256(release.releaseProofHash) ||
    expectedDirectReleaseProofHash(release) !== proofHash ||
    release.assessmentMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.commentMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.reviewerMayRewriteComment !== false ||
    release.legacyTeacherAppraisalIncluded !== false ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.providerCalled !== false ||
    clean(cycleReview.state) !== "RELEASED" ||
    clean(cycleReview.releaseMode) !==
      TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    cycleReview.currentReviewId !== null ||
    cycleReview.currentReviewStage !== null ||
    cycleReview.currentReviewerRole !== null ||
    cycleReview.currentReviewerAssignmentId !== null ||
    cycleReview.reviewEvidenceHash !== null ||
    cycleReview.reviewChainHash !== null ||
    cycleReview.reviewRowsRequired !== false ||
    cycleReview.reviewRowsPresent !== false ||
    cycleReview.selfReviewPerformed !== false ||
    clean(cycleReview.admittedAssessmentId) !==
      input.evidence.assessmentId ||
    Number(cycleReview.admittedAssessmentRevision) !== 1 ||
    clean(cycleReview.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReview.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    clean(cycleReview.directReleasedByUserId) !==
      input.evidence.assessorUserId ||
    clean(cycleReview.directReleasedByAssignmentId) !==
      input.releaserAssignmentId ||
    clean(cycleReview.directReleasedByRole) !== "DISTRICT_DIRECTOR" ||
    clean(cycleReview.releaseProofHash).toLowerCase() !== proofHash ||
    cycleReview.awaitingRevision !== false ||
    clean(cycleReview.releasedAt) !== releasedAt ||
    cycleReview.reviewerMayRewriteScores !== false ||
    cycleReview.reviewerMayRewriteComment !== false ||
    cycleReview.legacyTeacherAppraisalIncluded !== false ||
    cycleReview.combinedWeightingDefined !== false ||
    cycleReview.notificationsSeeded !== false ||
    cycleReview.providerCalled !== false
  ) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_EXISTING_PROOF_DRIFT",
      409,
    );
  }

  return {
    contractHash,
    requestHash,
    evidenceHash,
    proofHash,
    releasedAt,
  };
}

function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

async function runDirectRelease(
  input: ExecuteTeacherSupervisoryDirectorDirectReleaseInput,
  database: TeacherSupervisoryDirectorDirectReleaseDatabase,
): Promise<ExecuteTeacherSupervisoryDirectorDirectReleaseResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(
    input.assessmentId,
    "assessmentId",
  );
  const reqId = requireIdentifier(
    clean(input.reqId) || randomUUID(),
    "reqId",
  );
  const now = requireNow(input.now);

  if (input.confirm !== true) {
    fail(
      "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CONFIRMATION_REQUIRED",
      400,
    );
  }

  return database.$transaction(
    async (tx) => {
      const evidence =
        await verifyTeacherSupervisoryFinalizedAssessmentEvidence({
          assessmentId,
          database: tx,
        });

      assertDirectReleaseAuthority({
        actorUserId,
        actorRoleName: input.actorRoleName,
        evidence,
      });

      assertGovernanceScope({
        governanceScope: input.governanceScope,
        tenantId: evidence.targetTenantId,
        circuitId: evidence.targetCircuitZoneId,
        districtId: evidence.targetDistrictZoneId,
      });

      const cycle = await tx.appraisalCycle.findUnique({
        where: {
          id: evidence.cycleId,
        },
        select: {
          id: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          targetRoleSnapshot: true,
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
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_NOT_FOUND",
          404,
        );
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

      const directorAssignments =
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

      const directorAssignment =
        requireExactCurrentDirectorAssignment({
          assignments: directorAssignments,
          actorUserId,
          districtId: evidence.targetDistrictZoneId,
          expectedAssignmentId: evidence.assessorAssignmentId,
          now,
        });

      const reviewRows = await tx.appraisalReview.findMany({
        where: {
          assessmentId: evidence.assessmentId,
        },
        select: {
          id: true,
          assessmentId: true,
        },
      });

      if (reviewRows.length !== 0) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
          409,
          { reviewRows: reviewRows.length },
        );
      }

      if (cycleState === "RELEASED") {
        const existing = assertExistingDirectRelease({
          cycle,
          evidence,
          releaserAssignmentId: directorAssignment.id,
          reviewRows,
        });

        return {
          outcome: "EXISTING_RELEASED",
          releaseMode:
            TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
          assessmentId: evidence.assessmentId,
          assessmentRevision: 1,
          assessmentStatus: "FINALIZED",
          cycleId: evidence.cycleId,
          cycleStatus: "RELEASED",
          assessorUserId: evidence.assessorUserId,
          assessorAssignmentId: evidence.assessorAssignmentId,
          releaserUserId: actorUserId,
          releaserAssignmentId: directorAssignment.id,
          releaserRole: "DISTRICT_DIRECTOR",
          reviewRowsRequired: false,
          reviewRowsPresent: false,
          selfReviewPerformed: false,
          assessmentHash: evidence.assessmentHash,
          observationContextHash: evidence.observationContextHash,
          decisionContractHash: existing.contractHash,
          releaseRequestHash: existing.requestHash,
          releaseEvidenceHash: existing.evidenceHash,
          releaseProofHash: existing.proofHash,
          releasedAt: existing.releasedAt,
          assessmentMutationPerformed: false,
          scoreMutationPerformed: false,
          commentMutationPerformed: false,
          providerCalled: false,
        };
      }

      assertAppraisalCycleTransition("OPEN", "CLOSED");
      assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW");
      assertAppraisalCycleTransition("UNDER_REVIEW", "RELEASED");

      const contractHash = directDecisionContractHash();
      const requestHash = directReleaseRequestHash({
        evidence,
        releaserAssignmentId: directorAssignment.id,
        decisionContractHash: contractHash,
      });
      const evidenceHash = directReleaseEvidenceHash({
        evidence,
        releaseRequestHash: requestHash,
      });
      const proof = directReleaseProofPayload({
        evidence,
        releaserAssignmentId: directorAssignment.id,
        decisionContractHash: contractHash,
        releaseRequestHash: requestHash,
        releaseEvidenceHash: evidenceHash,
        releasedAt: now,
      });
      const proofHash = hashJson(proof);

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
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CLOSE_RACE",
          409,
        );
      }

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
        },
      });

      if (underReviewResult.count !== 1) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INGRESS_RACE",
          409,
        );
      }

      const releaseResult = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "UNDER_REVIEW",
          closedAt: now,
          closedByUserId: actorUserId,
          reviewStartedAt: now,
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "RELEASED",
          releasedAt: now,
          metadata: cycleMetadataForDirectRelease({
            cycleMetadata: cycle.metadata,
            proof,
            releaseProofHash: proofHash,
          }),
        },
      });

      if (releaseResult.count !== 1) {
        fail(
          "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_WRITE_RACE",
          409,
        );
      }

      await tx.auditLog.create({
        data: {
          tenantId: evidence.targetTenantId,
          userId: actorUserId,
          action: DIRECT_RELEASE_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: evidence.cycleId,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: DIRECT_RELEASE_AUDIT_ACTION,
            workflow:
              TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
            evidenceStream:
              TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
            releaseMode:
              TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
            cycleId: evidence.cycleId,
            cycleStatus: "RELEASED",
            assessmentId: evidence.assessmentId,
            assessmentRevision: evidence.revision,
            assessmentStatus: "FINALIZED",
            assessorUserId: evidence.assessorUserId,
            assessorAssignmentId: evidence.assessorAssignmentId,
            assessorRole: evidence.assessorRole,
            releaserUserId: actorUserId,
            releaserAssignmentId: directorAssignment.id,
            releaserRole: "DISTRICT_DIRECTOR",
            reviewRowsRequired: false,
            reviewRowsPresent: false,
            selfReviewPerformed: false,
            technicalLifecycleBridge:
              "OPEN_TO_CLOSED_TO_UNDER_REVIEW_TO_RELEASED",
            assessmentHash: evidence.assessmentHash,
            observationContextHash: evidence.observationContextHash,
            decisionContractHash: contractHash,
            releaseRequestHash: requestHash,
            releaseEvidenceHash: evidenceHash,
            releaseProofHash: proofHash,
            releasedAt: now.toISOString(),
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            generalCommentRecordedInAudit: false,
            observationDetailsRecordedInAudit: false,
            classEnrolmentRecordedInAudit: false,
            contactFieldsIncluded: false,
            assessmentMutationPerformed: false,
            scoreMutationPerformed: false,
            commentMutationPerformed: false,
            legacyTeacherAppraisalIncluded: false,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "RELEASED",
        releaseMode:
          TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
        assessmentId: evidence.assessmentId,
        assessmentRevision: 1,
        assessmentStatus: "FINALIZED",
        cycleId: evidence.cycleId,
        cycleStatus: "RELEASED",
        assessorUserId: evidence.assessorUserId,
        assessorAssignmentId: evidence.assessorAssignmentId,
        releaserUserId: actorUserId,
        releaserAssignmentId: directorAssignment.id,
        releaserRole: "DISTRICT_DIRECTOR",
        reviewRowsRequired: false,
        reviewRowsPresent: false,
        selfReviewPerformed: false,
        assessmentHash: evidence.assessmentHash,
        observationContextHash: evidence.observationContextHash,
        decisionContractHash: contractHash,
        releaseRequestHash: requestHash,
        releaseEvidenceHash: evidenceHash,
        releaseProofHash: proofHash,
        releasedAt: now.toISOString(),
        assessmentMutationPerformed: false,
        scoreMutationPerformed: false,
        commentMutationPerformed: false,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.transactionMaxWaitMs,
      timeout:
        TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeTeacherSupervisoryDirectorDirectRelease(
  input: ExecuteTeacherSupervisoryDirectorDirectReleaseInput,
): Promise<ExecuteTeacherSupervisoryDirectorDirectReleaseResult> {
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryDirectorDirectReleaseDatabase);

  try {
    return await runDirectRelease(input, database);
  } catch (error) {
    if (!isPrismaCode(error, "P2034")) throw error;
    return runDirectRelease(input, database);
  }
}
