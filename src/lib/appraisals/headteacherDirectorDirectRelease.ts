import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
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
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  loadHeadteacherSupervisoryAssessment,
  type HeadteacherSupervisoryAssessmentView,
  type HeadteacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
import { assertAppraisalCycleTransition } from "@/lib/appraisals/workflow";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
  requiredActorRole: "DISTRICT_DIRECTOR",
  requiredAssessorRole: "DISTRICT_DIRECTOR",
  requiredCapability: "RELEASE_HEADTEACHER_FEEDBACK",
  requiredInitialCycleStatus: "CLOSED",
  intermediateReviewCycleStatus: "UNDER_REVIEW",
  releasedCycleStatus: "RELEASED",
  requiredAssessmentStatus: "FINALIZED",
  requiredAssessmentRevision: 1,
  requiredSnapshotVersion: 1,
  minimumFinalizedStaffResponses: 1,
  exactAssessorAsReleaserRequired: true,
  exactAssessorAssignmentAsReleaserAssignmentRequired: true,
  currentDirectorAssignmentRequired: true,
  currentHeadteacherTargetRequired: true,
  explicitConfirmationRequired: true,
  reviewRowsRequired: false,
  reviewRowsAllowed: false,
  selfReviewAllowed: false,
  assessmentMutationAllowed: false,
  scoreMutationAllowed: false,
  visitContextMutationAllowed: false,
  reviewerMayRewriteScores: false,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  releaseNoteAllowed: false,
  notificationsSeeded: false,
  notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
  providerCallsAllowed: false,
  evidenceReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const RELEASE_METADATA_KEY = "headteacherDirectorRelease";
const REVIEW_METADATA_KEY = "headteacherSupervisoryReview";
const DIRECT_RELEASE_AUDIT_ACTION =
  "HEADTEACHER_APPRAISAL_DIRECTOR_AUTHORED_DIRECT_RELEASED";

export type HeadteacherDirectorDirectReleaseDependencies = {
  loadAssessment: typeof loadHeadteacherSupervisoryAssessment;
  readAggregateReadiness: typeof readHeadteacherFeedbackAggregateReadiness;
};

export type ExecuteHeadteacherDirectorDirectReleaseInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  confirm: boolean;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherDirectorDirectReleaseDatabase;
  dependencies?: HeadteacherDirectorDirectReleaseDependencies;
};

export type ExecuteHeadteacherDirectorDirectReleaseResult = {
  outcome: "RELEASED" | "EXISTING_RELEASED";
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE";
  assessmentId: string;
  assessmentRevision: 1;
  assessmentStatus: "FINALIZED";
  cycleId: string;
  cycleStatus: "RELEASED";
  snapshotId: string;
  assessorUserId: string;
  assessorAssignmentId: string;
  releaserUserId: string;
  releaserAssignmentId: string;
  releaserRole: "DISTRICT_DIRECTOR";
  reviewRowsRequired: false;
  reviewRowsPresent: false;
  selfReviewPerformed: false;
  assessmentHash: string;
  visitContextHash: string;
  staffSourceHash: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releaseProofHash: string;
  releasedAt: string;
  releaseNoteIncluded: false;
  assessmentMutationPerformed: false;
  scoreMutationPerformed: false;
  visitContextMutationPerformed: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
  notificationsSeeded: false;
  notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING";
  providerCalled: false;
};

type CountResult = { count: number };

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  minimumResponses: number;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
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
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: { level: number };
      parentZone: null | {
        id: string;
        isActive: boolean;
        zoneType: { level: number };
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
    zoneType: { level: number };
  };
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  evidenceSnapshotJson: unknown;
};

type SnapshotRecord = {
  id: string;
  cycleId: string;
  version: number;
  finalizedResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  sourceHash: string;
};

type ReviewRecord = {
  id: string;
  cycleId: string;
  assessmentId: string;
};

export type HeadteacherDirectorDirectReleaseTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findUnique(args: unknown): Promise<SnapshotRecord | null>;
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

export type HeadteacherDirectorDirectReleaseDatabase = {
  appraisalCycle: HeadteacherDirectorDirectReleaseTransactionClient["appraisalCycle"];
  appraisalAssessment: HeadteacherDirectorDirectReleaseTransactionClient["appraisalAssessment"];
  appraisalAggregateSnapshot: HeadteacherDirectorDirectReleaseTransactionClient["appraisalAggregateSnapshot"];
  appraisalReview: HeadteacherDirectorDirectReleaseTransactionClient["appraisalReview"];
  membership: HeadteacherDirectorDirectReleaseTransactionClient["membership"];
  governanceOfficerAssignment: HeadteacherDirectorDirectReleaseTransactionClient["governanceOfficerAssignment"];
  auditLog: HeadteacherDirectorDirectReleaseTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherDirectorDirectReleaseTransactionClient,
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
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INVALID_IDENTIFIER",
      400,
      { fieldName },
    );
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INVALID_CURRENT_TIME",
      400,
    );
  }
  return now;
}

function assertDirectorAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  assessment: HeadteacherSupervisoryAssessmentView;
}) {
  const actorRole = effectiveRole(input.actorRoleName);
  if (actorRole !== HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.requiredActorRole) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ROLE_FORBIDDEN",
      403,
    );
  }
  assertAppraisalAuthority(
    { actorUserId: input.actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.requiredCapability,
  );
  if (
    input.assessment.assessorUserId !== input.actorUserId ||
    input.assessment.revision !== 1 ||
    input.assessment.status !== "FINALIZED" ||
    !isSha256(input.assessment.assessmentHash) ||
    !isSha256(input.assessment.visitContextHash)
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_AUTHORITY_INVALID",
      403,
    );
  }
}

type ReadyDirectorAggregateReadiness = DirectorAggregateReadinessView & {
  audience: "DIRECTOR";
  state: "READY_FOR_REVIEW";
  snapshotId: string;
  snapshotVersion: 1;
  snapshotSourceHash: string;
  minimumResponses: 1;
  aggregateScoresIncluded: false;
  respondentIdentitiesIncluded: false;
  participantListIncluded: false;
};

function directorReadiness(
  value: unknown,
): ReadyDirectorAggregateReadiness {
  const readiness = value as DirectorAggregateReadinessView;
  if (
    readiness.audience !== "DIRECTOR" ||
    readiness.state !== "READY_FOR_REVIEW" ||
    !readiness.snapshotId ||
    readiness.snapshotVersion !== 1 ||
    !isSha256(readiness.snapshotSourceHash) ||
    readiness.finalizedResponses <
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.minimumFinalizedStaffResponses ||
    readiness.minimumResponses !== 1 ||
    readiness.aggregateScoresIncluded !== false ||
    readiness.respondentIdentitiesIncluded !== false ||
    readiness.participantListIncluded !== false
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_STAFF_EVIDENCE_NOT_READY",
      409,
      { state: readiness.state },
    );
  }
  return readiness as ReadyDirectorAggregateReadiness;
}

function assignmentIsCurrent(
  assignment: DirectorAssignmentRecord,
  actorUserId: string,
  districtZoneId: string,
  now: Date,
) {
  if (
    assignment.userId !== actorUserId ||
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== districtZoneId ||
    assignment.zone.id !== districtZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
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

function requireExactCurrentDirectorAssignment(input: {
  assignments: DirectorAssignmentRecord[];
  actorUserId: string;
  districtZoneId: string;
  expectedAssignmentId: string;
  now: Date;
}) {
  const current = input.assignments.filter((assignment) =>
    assignmentIsCurrent(
      assignment,
      input.actorUserId,
      input.districtZoneId,
      input.now,
    ),
  );
  if (current.length === 0) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ACTIVE_ASSIGNMENT_REQUIRED",
      403,
    );
  }
  if (current.length !== 1) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_AMBIGUOUS_ASSIGNMENT",
      409,
      { activeAssignments: current.length },
    );
  }
  if (current[0].id !== input.expectedAssignmentId) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ASSESSOR_ASSIGNMENT_DRIFT",
      409,
    );
  }
  return current[0];
}

function assertTargetMembership(input: {
  cycle: CycleRecord;
  membership: TargetMembershipRecord | null;
}) {
  const { cycle, membership } = input;
  const circuit = membership?.tenant.zone;
  const district = circuit?.parentZone;
  if (
    !membership ||
    membership.userId !== cycle.targetUserId ||
    membership.tenantId !== cycle.targetTenantId ||
    membership.tenant.id !== cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !circuit ||
    circuit.isActive !== true ||
    circuit.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    circuit.id !== cycle.targetZoneId ||
    circuit.parentZoneId !== cycle.scopeZoneId ||
    !district ||
    district.id !== cycle.scopeZoneId ||
    district.isActive !== true ||
    district.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_TARGET_CONTEXT_INVALID",
      409,
    );
  }
}

function frozenAssessorRole(assessment: AssessmentRecord, cycle: CycleRecord) {
  const snapshot = objectValue(assessment.evidenceSnapshotJson);
  const assessor = objectValue(snapshot.assessor);
  const jurisdiction = objectValue(snapshot.jurisdiction);
  const role = canonicalHeadteacherSupervisoryAssessorRole(
    clean(assessor.role) || clean(assessor.assignmentRole),
  );
  if (
    clean(assessor.userId) !== assessment.assessorUserId ||
    clean(assessor.assignmentId) !== clean(assessment.assessorAssignmentId) ||
    clean(jurisdiction.districtZoneId) !== cycle.scopeZoneId ||
    role !== "DISTRICT_DIRECTOR"
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ASSESSOR_PROVENANCE_DRIFT",
      409,
    );
  }
  return role;
}

function assertCycleContract(
  cycle: CycleRecord,
  verifiedAssessment: HeadteacherSupervisoryAssessmentView,
) {
  const status = normalized(cycle.status);
  const metadata = objectValue(cycle.metadata);
  if (
    cycle.id !== verifiedAssessment.cycleId ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    cycle.targetUserId !== verifiedAssessment.targetUserId ||
    cycle.targetTenantId !== verifiedAssessment.targetTenantId ||
    !cycle.targetZoneId ||
    !cycle.scopeZoneId ||
    cycle.minimumResponses !== 1 ||
    cycle.cancelledAt !== null ||
    clean(metadata.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_CONTRACT_INVALID",
      409,
      { cycleId: cycle.id, cycleStatus: status },
    );
  }

  if (status === "CLOSED") {
    if (
      cycle.reviewStartedAt !== null ||
      cycle.releasedAt !== null ||
      Object.keys(objectValue(metadata[RELEASE_METADATA_KEY])).length !== 0 ||
      Object.keys(objectValue(metadata[REVIEW_METADATA_KEY])).length !== 0
    ) {
      fail(
        "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CLOSED_CYCLE_DRIFT",
        409,
      );
    }
    return "CLOSED" as const;
  }

  if (status === "RELEASED") {
    if (
      !cycle.reviewStartedAt ||
      !cycle.releasedAt ||
      cycle.reviewStartedAt.getTime() !== cycle.releasedAt.getTime()
    ) {
      fail(
        "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_RELEASED_CYCLE_DRIFT",
        409,
      );
    }
    return "RELEASED" as const;
  }

  fail(
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_NOT_RELEASABLE",
    409,
    { cycleStatus: status },
  );
}

export function computeHeadteacherDirectorDirectReleaseDecisionContractHash() {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    action: "RELEASE",
    assessorRole: "DISTRICT_DIRECTOR",
    releaserRole: "DISTRICT_DIRECTOR",
    exactAssessorAsReleaserRequired: true,
    exactAssessorAssignmentAsReleaserAssignmentRequired: true,
    reviewRowsRequired: false,
    reviewRowsAllowed: false,
    selfReviewAllowed: false,
    cycleIngress: ["CLOSED", "UNDER_REVIEW", "RELEASED"],
    assessmentStatus: "FINALIZED",
    assessmentRevision: 1,
    staffSnapshotRequired: true,
    assessmentMutationAllowed: false,
    scoreMutationAllowed: false,
    visitContextMutationAllowed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    releaseNoteAllowed: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
}

export type HeadteacherDirectorDirectReleaseHashEvidence = {
  cycleId: string;
  assessmentId: string;
  assessmentRevision: number;
  assessmentHash: string;
  visitContextHash: string;
  assessorUserId: string;
  assessorAssignmentId: string;
  snapshotId: string;
  snapshotVersion: number;
  staffSourceHash: string;
  finalizedResponses: number;
  minimumResponses: number;
};

export function computeHeadteacherDirectorDirectReleaseRequestHash(input: {
  evidence: HeadteacherDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    cycleId: input.evidence.cycleId,
    assessment: {
      id: input.evidence.assessmentId,
      revision: input.evidence.assessmentRevision,
      status: "FINALIZED",
      assessmentHash: input.evidence.assessmentHash,
      visitContextHash: input.evidence.visitContextHash,
    },
    staffFeedback: {
      snapshotId: input.evidence.snapshotId,
      snapshotVersion: input.evidence.snapshotVersion,
      sourceHash: input.evidence.staffSourceHash,
      finalizedResponses: input.evidence.finalizedResponses,
      minimumResponses: input.evidence.minimumResponses,
    },
    assessor: {
      userId: input.evidence.assessorUserId,
      assignmentId: input.evidence.assessorAssignmentId,
      role: "DISTRICT_DIRECTOR",
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

export function computeHeadteacherDirectorDirectReleaseEvidenceHash(input: {
  evidence: HeadteacherDirectorDirectReleaseHashEvidence;
  releaseRequestHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    releaseRequestHash: input.releaseRequestHash,
    assessmentHash: input.evidence.assessmentHash,
    visitContextHash: input.evidence.visitContextHash,
    staffSourceHash: input.evidence.staffSourceHash,
    reviewRowsPresent: false,
    selfReviewPerformed: false,
  });
}

function directReleaseProofPayload(input: {
  evidence: HeadteacherDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releasedAt: Date;
}) {
  return {
    proofSchemaVersion: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.proofSchemaVersion,
    releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    workflow: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.assessmentRevision,
    assessmentStatus: "FINALIZED",
    assessmentHash: input.evidence.assessmentHash,
    visitContextHash: input.evidence.visitContextHash,
    snapshotId: input.evidence.snapshotId,
    snapshotVersion: input.evidence.snapshotVersion,
    staffSourceHash: input.evidence.staffSourceHash,
    finalizedResponses: input.evidence.finalizedResponses,
    minimumResponses: input.evidence.minimumResponses,
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
    releaseNoteIncluded: false,
    releaseNoteHash: null,
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    visitContextMutationPerformed: false,
    reviewerMayRewriteScores: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    notificationReadiness:
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.notificationReadiness,
    providerCalled: false,
  } as const;
}

export function computeHeadteacherDirectorDirectReleaseProofHashFromMetadata(
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
    visitContextHash: release.visitContextHash,
    snapshotId: release.snapshotId,
    snapshotVersion: release.snapshotVersion,
    staffSourceHash: release.staffSourceHash,
    finalizedResponses: release.finalizedResponses,
    minimumResponses: release.minimumResponses,
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
    releaseNoteIncluded: release.releaseNoteIncluded,
    releaseNoteHash: release.releaseNoteHash,
    assessmentMutationPerformed: release.assessmentMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    visitContextMutationPerformed: release.visitContextMutationPerformed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    respondentIdentitiesAccessed: release.respondentIdentitiesAccessed,
    individualStaffResponsesAccessed: release.individualStaffResponsesAccessed,
    separateEvidenceStreams: release.separateEvidenceStreams,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    notificationReadiness: release.notificationReadiness,
    providerCalled: release.providerCalled,
  });
}

function cycleMetadataForDirectRelease(input: {
  cycleMetadata: unknown;
  proof: ReturnType<typeof directReleaseProofPayload>;
  releaseProofHash: string;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    [REVIEW_METADATA_KEY]: {
      schemaVersion: 1,
      state: "RELEASED",
      releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
      currentReviewId: null,
      currentReviewStage: null,
      currentReviewDecision: null,
      currentReviewerRole: null,
      currentReviewerAssignmentId: null,
      reviewEvidenceHash: null,
      reviewRowsRequired: false,
      reviewRowsPresent: false,
      selfReviewPerformed: false,
      admittedAssessmentId: input.proof.assessmentId,
      admittedAssessmentRevision: input.proof.assessmentRevision,
      assessmentHash: input.proof.assessmentHash,
      visitContextHash: input.proof.visitContextHash,
      staffSnapshotId: input.proof.snapshotId,
      staffSourceHash: input.proof.staffSourceHash,
      directReleasedByUserId: input.proof.releaserUserId,
      directReleasedByAssignmentId: input.proof.releaserAssignmentId,
      directReleasedByRole: input.proof.releaserRole,
      releaseProofHash: input.releaseProofHash,
      awaitingRevision: false,
      awaitingDirectorAdmission: false,
      directorReviewCreated: false,
      reviewerMayRewriteScores: false,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      notificationsSeeded: false,
      providerCalled: false,
      releasedAt: input.proof.releasedAt,
    },
    [RELEASE_METADATA_KEY]: {
      ...input.proof,
      releaseProofHash: input.releaseProofHash,
    },
  };
}

function directHashEvidence(input: {
  assessment: HeadteacherSupervisoryAssessmentView;
  readiness: ReadyDirectorAggregateReadiness;
}) : HeadteacherDirectorDirectReleaseHashEvidence {
  return {
    cycleId: input.assessment.cycleId,
    assessmentId: input.assessment.assessmentId,
    assessmentRevision: input.assessment.revision,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    visitContextHash: clean(input.assessment.visitContextHash).toLowerCase(),
    assessorUserId: input.assessment.assessorUserId,
    assessorAssignmentId: input.assessment.assessorAssignmentId,
    snapshotId: clean(input.readiness.snapshotId),
    snapshotVersion: input.readiness.snapshotVersion,
    staffSourceHash: clean(input.readiness.snapshotSourceHash).toLowerCase(),
    finalizedResponses: input.readiness.finalizedResponses,
    minimumResponses: input.readiness.minimumResponses,
  };
}

function assertSnapshotMatches(
  snapshot: SnapshotRecord | null,
  evidence: HeadteacherDirectorDirectReleaseHashEvidence,
) {
  if (
    !snapshot ||
    snapshot.id !== evidence.snapshotId ||
    snapshot.cycleId !== evidence.cycleId ||
    snapshot.version !== 1 ||
    snapshot.finalizedResponses !== evidence.finalizedResponses ||
    snapshot.minimumResponses !== 1 ||
    snapshot.releaseEligible !== true ||
    clean(snapshot.sourceHash).toLowerCase() !== evidence.staffSourceHash
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_STAFF_SNAPSHOT_DRIFT",
      409,
    );
  }
}

function assertAssessmentMatches(input: {
  stored: AssessmentRecord | null;
  verified: HeadteacherSupervisoryAssessmentView;
  cycle: CycleRecord;
}) {
  const { stored, verified, cycle } = input;
  if (
    !stored ||
    stored.id !== verified.assessmentId ||
    stored.cycleId !== verified.cycleId ||
    normalized(stored.status) !== "FINALIZED" ||
    stored.revision !== 1 ||
    stored.priorAssessmentId !== null ||
    stored.assessorUserId !== verified.assessorUserId ||
    clean(stored.assessorAssignmentId) !== verified.assessorAssignmentId ||
    clean(stored.assessmentHash).toLowerCase() !==
      clean(verified.assessmentHash).toLowerCase() ||
    stored.finalizedByUserId !== stored.assessorUserId ||
    !stored.finalizedAt ||
    clean(objectValue(stored.metadata).visitContextHash).toLowerCase() !==
      clean(verified.visitContextHash).toLowerCase()
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ASSESSMENT_DRIFT",
      409,
    );
  }
  frozenAssessorRole(stored, cycle);
  return stored;
}

function extractReleaseProof(value: unknown) {
  return objectValue(objectValue(value)[RELEASE_METADATA_KEY]);
}

function assertExistingDirectRelease(input: {
  cycle: CycleRecord;
  evidence: HeadteacherDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
  reviewRows: ReviewRecord[];
}) {
  if (input.reviewRows.length !== 0) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
      409,
      { reviewRows: input.reviewRows.length },
    );
  }
  const release = extractReleaseProof(input.cycle.metadata);
  const reviewState = objectValue(
    objectValue(input.cycle.metadata)[REVIEW_METADATA_KEY],
  );
  const releasedAt = input.cycle.releasedAt?.toISOString() ?? "";
  const decisionContractHash =
    computeHeadteacherDirectorDirectReleaseDecisionContractHash();
  const releaseRequestHash =
    computeHeadteacherDirectorDirectReleaseRequestHash({
      evidence: input.evidence,
      releaserAssignmentId: input.releaserAssignmentId,
      decisionContractHash,
    });
  const releaseEvidenceHash =
    computeHeadteacherDirectorDirectReleaseEvidenceHash({
      evidence: input.evidence,
      releaseRequestHash,
    });
  const proof = directReleaseProofPayload({
    evidence: input.evidence,
    releaserAssignmentId: input.releaserAssignmentId,
    decisionContractHash,
    releaseRequestHash,
    releaseEvidenceHash,
    releasedAt: input.cycle.releasedAt!,
  });
  const releaseProofHash = hashJson(proof);

  if (
    !releasedAt ||
    Number(release.proofSchemaVersion) !== 1 ||
    clean(release.releaseMode) !==
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    clean(release.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    clean(release.evidenceStream) !==
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream ||
    clean(release.cycleId) !== input.evidence.cycleId ||
    clean(release.assessmentId) !== input.evidence.assessmentId ||
    Number(release.assessmentRevision) !== 1 ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !== input.evidence.assessmentHash ||
    clean(release.visitContextHash).toLowerCase() !== input.evidence.visitContextHash ||
    clean(release.snapshotId) !== input.evidence.snapshotId ||
    Number(release.snapshotVersion) !== 1 ||
    clean(release.staffSourceHash).toLowerCase() !== input.evidence.staffSourceHash ||
    Number(release.finalizedResponses) !== input.evidence.finalizedResponses ||
    Number(release.minimumResponses) !== 1 ||
    clean(release.assessorUserId) !== input.evidence.assessorUserId ||
    clean(release.assessorAssignmentId) !== input.evidence.assessorAssignmentId ||
    clean(release.assessorRole) !== "DISTRICT_DIRECTOR" ||
    release.reviewRowsRequired !== false ||
    release.reviewRowsPresent !== false ||
    release.selfReviewPerformed !== false ||
    clean(release.releaserUserId) !== input.evidence.assessorUserId ||
    clean(release.releaserAssignmentId) !== input.releaserAssignmentId ||
    clean(release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    clean(release.decisionContractHash).toLowerCase() !== decisionContractHash ||
    clean(release.releaseRequestHash).toLowerCase() !== releaseRequestHash ||
    clean(release.releaseEvidenceHash).toLowerCase() !== releaseEvidenceHash ||
    clean(release.releasedAt) !== releasedAt ||
    release.releaseNoteIncluded !== false ||
    release.releaseNoteHash !== null ||
    release.assessmentMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.visitContextMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.separateEvidenceStreams !== true ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.notificationReadiness !==
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.notificationReadiness ||
    release.providerCalled !== false ||
    clean(release.releaseProofHash).toLowerCase() !== releaseProofHash ||
    computeHeadteacherDirectorDirectReleaseProofHashFromMetadata(release) !==
      releaseProofHash ||
    clean(reviewState.state) !== "RELEASED" ||
    clean(reviewState.releaseMode) !==
      HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    reviewState.currentReviewId !== null ||
    reviewState.currentReviewStage !== null ||
    reviewState.currentReviewDecision !== null ||
    reviewState.currentReviewerRole !== null ||
    reviewState.currentReviewerAssignmentId !== null ||
    reviewState.reviewEvidenceHash !== null ||
    reviewState.reviewRowsRequired !== false ||
    reviewState.reviewRowsPresent !== false ||
    reviewState.selfReviewPerformed !== false ||
    clean(reviewState.admittedAssessmentId) !== input.evidence.assessmentId ||
    Number(reviewState.admittedAssessmentRevision) !== 1 ||
    clean(reviewState.assessmentHash).toLowerCase() !== input.evidence.assessmentHash ||
    clean(reviewState.visitContextHash).toLowerCase() !== input.evidence.visitContextHash ||
    clean(reviewState.staffSnapshotId) !== input.evidence.snapshotId ||
    clean(reviewState.staffSourceHash).toLowerCase() !== input.evidence.staffSourceHash ||
    clean(reviewState.directReleasedByUserId) !== input.evidence.assessorUserId ||
    clean(reviewState.directReleasedByAssignmentId) !== input.releaserAssignmentId ||
    clean(reviewState.directReleasedByRole) !== "DISTRICT_DIRECTOR" ||
    clean(reviewState.releaseProofHash).toLowerCase() !== releaseProofHash ||
    reviewState.awaitingRevision !== false ||
    reviewState.awaitingDirectorAdmission !== false ||
    reviewState.directorReviewCreated !== false ||
    reviewState.reviewerMayRewriteScores !== false ||
    reviewState.separateEvidenceStreams !== true ||
    reviewState.combinedWeightingDefined !== false ||
    reviewState.respondentIdentitiesAccessed !== false ||
    reviewState.individualStaffResponsesAccessed !== false ||
    reviewState.notificationsSeeded !== false ||
    reviewState.providerCalled !== false ||
    clean(reviewState.releasedAt) !== releasedAt
  ) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_EXISTING_PROOF_DRIFT",
      409,
    );
  }

  return {
    decisionContractHash,
    releaseRequestHash,
    releaseEvidenceHash,
    releaseProofHash,
    releasedAt,
  };
}

function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

async function prepareDirectRelease(input: {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  now: Date;
  database: HeadteacherDirectorDirectReleaseDatabase;
  dependencies: HeadteacherDirectorDirectReleaseDependencies;
}) {
  const assessment = await input.dependencies.loadAssessment({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    assessmentId: input.assessmentId,
    now: input.now,
    database:
      input.database as unknown as HeadteacherSupervisoryScoringDatabase,
  });
  assertDirectorAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    assessment,
  });
  assertHeadteacherFeedbackTargetInGovernanceScope({
    governanceScope: input.governanceScope,
    targetTenantId: assessment.targetTenantId,
  });
  const readiness = directorReadiness(
    await input.dependencies.readAggregateReadiness({
      actorUserId: input.actorUserId,
      actorRoleName: input.actorRoleName,
      cycleId: assessment.cycleId,
      governanceScope: input.governanceScope,
      database:
        input.database as unknown as HeadteacherFeedbackAggregateReadinessDatabase,
    }),
  );
  return { assessment, readiness };
}

async function runDirectRelease(
  input: ExecuteHeadteacherDirectorDirectReleaseInput,
  database: HeadteacherDirectorDirectReleaseDatabase,
  dependencies: HeadteacherDirectorDirectReleaseDependencies,
): Promise<ExecuteHeadteacherDirectorDirectReleaseResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  if (input.confirm !== true) {
    fail(
      "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CONFIRMATION_REQUIRED",
      400,
    );
  }

  const prepared = await prepareDirectRelease({
    actorUserId,
    actorRoleName: input.actorRoleName,
    assessmentId,
    governanceScope: input.governanceScope,
    now,
    database,
    dependencies,
  });
  const evidence = directHashEvidence(prepared);

  return database.$transaction(
    async (tx) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: evidence.cycleId },
        select: {
          id: true,
          scopeZoneId: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          targetRoleSnapshot: true,
          status: true,
          minimumResponses: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
        },
      });
      if (!cycle) {
        fail(
          "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CYCLE_NOT_FOUND",
          404,
        );
      }
      const cycleState = assertCycleContract(cycle, prepared.assessment);
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
                  isActive: true,
                  parentZoneId: true,
                  zoneType: { select: { level: true } },
                  parentZone: {
                    select: {
                      id: true,
                      isActive: true,
                      zoneType: { select: { level: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      assertTargetMembership({ cycle, membership });

      const storedAssessment = await tx.appraisalAssessment.findUnique({
        where: { id: evidence.assessmentId },
        select: {
          id: true,
          cycleId: true,
          assessorUserId: true,
          assessorAssignmentId: true,
          status: true,
          revision: true,
          priorAssessmentId: true,
          assessmentHash: true,
          finalizedByUserId: true,
          finalizedAt: true,
          metadata: true,
          evidenceSnapshotJson: true,
        },
      });
      assertAssessmentMatches({
        stored: storedAssessment,
        verified: prepared.assessment,
        cycle,
      });

      const snapshot = await tx.appraisalAggregateSnapshot.findUnique({
        where: { id: evidence.snapshotId },
        select: {
          id: true,
          cycleId: true,
          version: true,
          finalizedResponses: true,
          minimumResponses: true,
          releaseEligible: true,
          sourceHash: true,
        },
      });
      assertSnapshotMatches(snapshot, evidence);

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: { userId: actorUserId },
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
              zoneType: { select: { level: true } },
            },
          },
        },
      });
      const directorAssignment = requireExactCurrentDirectorAssignment({
        assignments,
        actorUserId,
        districtZoneId: cycle.scopeZoneId,
        expectedAssignmentId: evidence.assessorAssignmentId,
        now,
      });

      const reviewRows = await tx.appraisalReview.findMany({
        where: { cycleId: evidence.cycleId },
        select: { id: true, cycleId: true, assessmentId: true },
      });
      if (reviewRows.length !== 0) {
        fail(
          "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
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
          releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
          assessmentId: evidence.assessmentId,
          assessmentRevision: 1,
          assessmentStatus: "FINALIZED",
          cycleId: evidence.cycleId,
          cycleStatus: "RELEASED",
          snapshotId: evidence.snapshotId,
          assessorUserId: evidence.assessorUserId,
          assessorAssignmentId: evidence.assessorAssignmentId,
          releaserUserId: actorUserId,
          releaserAssignmentId: directorAssignment.id,
          releaserRole: "DISTRICT_DIRECTOR",
          reviewRowsRequired: false,
          reviewRowsPresent: false,
          selfReviewPerformed: false,
          assessmentHash: evidence.assessmentHash,
          visitContextHash: evidence.visitContextHash,
          staffSourceHash: evidence.staffSourceHash,
          decisionContractHash: existing.decisionContractHash,
          releaseRequestHash: existing.releaseRequestHash,
          releaseEvidenceHash: existing.releaseEvidenceHash,
          releaseProofHash: existing.releaseProofHash,
          releasedAt: existing.releasedAt,
          releaseNoteIncluded: false,
          assessmentMutationPerformed: false,
          scoreMutationPerformed: false,
          visitContextMutationPerformed: false,
          respondentIdentitiesAccessed: false,
          individualStaffResponsesAccessed: false,
          notificationsSeeded: false,
          notificationReadiness:
            HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.notificationReadiness,
          providerCalled: false,
        };
      }

      assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW");
      assertAppraisalCycleTransition("UNDER_REVIEW", "RELEASED");

      const decisionContractHash =
        computeHeadteacherDirectorDirectReleaseDecisionContractHash();
      const releaseRequestHash =
        computeHeadteacherDirectorDirectReleaseRequestHash({
          evidence,
          releaserAssignmentId: directorAssignment.id,
          decisionContractHash,
        });
      const releaseEvidenceHash =
        computeHeadteacherDirectorDirectReleaseEvidenceHash({
          evidence,
          releaseRequestHash,
        });
      const proof = directReleaseProofPayload({
        evidence,
        releaserAssignmentId: directorAssignment.id,
        decisionContractHash,
        releaseRequestHash,
        releaseEvidenceHash,
        releasedAt: now,
      });
      const releaseProofHash = hashJson(proof);

      const ingress = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "CLOSED",
          reviewStartedAt: null,
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "UNDER_REVIEW",
          reviewStartedAt: now,
        },
      });
      if (ingress.count !== 1) {
        fail(
          "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INGRESS_RACE",
          409,
        );
      }

      const released = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "UNDER_REVIEW",
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
            releaseProofHash,
          }),
        },
      });
      if (released.count !== 1) {
        fail(
          "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_WRITE_RACE",
          409,
        );
      }

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: actorUserId,
          action: DIRECT_RELEASE_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: DIRECT_RELEASE_AUDIT_ACTION,
            workflow: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
            evidenceStream:
              HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
            releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
            cycleId: cycle.id,
            cycleStatus: "RELEASED",
            assessmentId: evidence.assessmentId,
            assessmentRevision: 1,
            assessmentStatus: "FINALIZED",
            snapshotId: evidence.snapshotId,
            assessorUserId: evidence.assessorUserId,
            assessorAssignmentId: evidence.assessorAssignmentId,
            assessorRole: "DISTRICT_DIRECTOR",
            releaserUserId: actorUserId,
            releaserAssignmentId: directorAssignment.id,
            releaserRole: "DISTRICT_DIRECTOR",
            reviewRowsRequired: false,
            reviewRowsPresent: false,
            selfReviewPerformed: false,
            technicalLifecycleBridge: "CLOSED_TO_UNDER_REVIEW_TO_RELEASED",
            assessmentHash: evidence.assessmentHash,
            visitContextHash: evidence.visitContextHash,
            staffSourceHash: evidence.staffSourceHash,
            decisionContractHash,
            releaseRequestHash,
            releaseEvidenceHash,
            releaseProofHash,
            releasedAt: now.toISOString(),
            releaseNoteIncluded: false,
            releaseNoteTextIncluded: false,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            contactFieldsIncluded: false,
            assessmentMutationPerformed: false,
            scoreMutationPerformed: false,
            visitContextMutationPerformed: false,
            reviewerMayRewriteScores: false,
            separateEvidenceStreams: true,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            notificationReadiness:
              HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.notificationReadiness,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "RELEASED",
        releaseMode: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
        assessmentId: evidence.assessmentId,
        assessmentRevision: 1,
        assessmentStatus: "FINALIZED",
        cycleId: evidence.cycleId,
        cycleStatus: "RELEASED",
        snapshotId: evidence.snapshotId,
        assessorUserId: evidence.assessorUserId,
        assessorAssignmentId: evidence.assessorAssignmentId,
        releaserUserId: actorUserId,
        releaserAssignmentId: directorAssignment.id,
        releaserRole: "DISTRICT_DIRECTOR",
        reviewRowsRequired: false,
        reviewRowsPresent: false,
        selfReviewPerformed: false,
        assessmentHash: evidence.assessmentHash,
        visitContextHash: evidence.visitContextHash,
        staffSourceHash: evidence.staffSourceHash,
        decisionContractHash,
        releaseRequestHash,
        releaseEvidenceHash,
        releaseProofHash,
        releasedAt: now.toISOString(),
        releaseNoteIncluded: false,
        assessmentMutationPerformed: false,
        scoreMutationPerformed: false,
        visitContextMutationPerformed: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        notificationsSeeded: false,
        notificationReadiness:
          HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.notificationReadiness,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeHeadteacherDirectorDirectRelease(
  input: ExecuteHeadteacherDirectorDirectReleaseInput,
): Promise<ExecuteHeadteacherDirectorDirectReleaseResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorDirectReleaseDatabase);
  const dependencies = input.dependencies ?? {
    loadAssessment: loadHeadteacherSupervisoryAssessment,
    readAggregateReadiness: readHeadteacherFeedbackAggregateReadiness,
  };

  try {
    return await runDirectRelease(input, database, dependencies);
  } catch (error) {
    if (!isPrismaCode(error, "P2034")) throw error;
    return runDirectRelease(input, database, dependencies);
  }
}
