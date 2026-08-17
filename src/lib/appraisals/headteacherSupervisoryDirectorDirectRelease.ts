import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  loadHeadteacherSupervisoryAssessment,
  type HeadteacherSupervisoryAssessmentView,
  type HeadteacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY =
  "headteacherSupervisoryReleases";

export const HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
  requiredActorRole: "DISTRICT_DIRECTOR",
  requiredAssessorRole: "DISTRICT_DIRECTOR",
  requiredCapability: "RELEASE_HEADTEACHER_FEEDBACK",
  requiredAssessmentStatus: "FINALIZED",
  requiredAssessmentRevision: 1,
  eligibleCarrierCycleStatuses: [
    "OPEN",
    "CLOSED",
    "UNDER_REVIEW",
    "RELEASED",
  ] as const,
  exactAssessorAsReleaserRequired: true,
  exactAssessorAssignmentAsReleaserAssignmentRequired: true,
  currentDirectorAssignmentRequired: true,
  currentHeadteacherTargetRequired: true,
  explicitConfirmationRequired: true,
  reviewRowsRequired: false,
  reviewRowsAllowed: false,
  selfReviewAllowed: false,
  assessmentStatusMutationAllowed: false,
  scoreMutationAllowed: false,
  visitContextMutationAllowed: false,
  staffFeedbackRequired: false,
  staffFeedbackAccessed: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  carrierCycleStatusMutationAllowed: false,
  carrierCycleTimestampMutationAllowed: false,
  participantMutationAllowed: false,
  reviewerMayRewriteScores: false,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  releaseNoteAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  evidenceReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const DIRECT_RELEASE_AUDIT_ACTION =
  "HEADTEACHER_GOVERNANCE_ASSESSMENT_DIRECT_RELEASED";

type CarrierCycleStatus =
  (typeof HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.eligibleCarrierCycleStatuses)[number];

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
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

type ReviewRecord = {
  id: string;
  cycleId: string;
  assessmentId: string;
};

type CountResult = { count: number };

export type HeadteacherSupervisoryDirectorDirectReleaseTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
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

export type HeadteacherSupervisoryDirectorDirectReleaseDatabase = {
  appraisalCycle: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalCycle"];
  appraisalAssessment: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalAssessment"];
  appraisalReview: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["appraisalReview"];
  membership: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["membership"];
  governanceOfficerAssignment: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["governanceOfficerAssignment"];
  auditLog: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherSupervisoryDirectorDirectReleaseTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type ExecuteHeadteacherSupervisoryDirectorDirectReleaseInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  confirm: boolean;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryDirectorDirectReleaseDatabase;
  dependencies?: {
    loadAssessment: typeof loadHeadteacherSupervisoryAssessment;
  };
};

export type ExecuteHeadteacherSupervisoryDirectorDirectReleaseResult = {
  outcome: "RELEASED" | "EXISTING_RELEASED";
  releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE";
  governanceReleaseStatus: "RELEASED";
  assessmentId: string;
  assessmentRevision: 1;
  assessmentStatus: "FINALIZED";
  cycleId: string;
  staffFeedbackCycleStatus: CarrierCycleStatus;
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
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releaseProofHash: string;
  releasedAt: string;
  assessmentStatusMutationPerformed: false;
  scoreMutationPerformed: false;
  visitContextMutationPerformed: false;
  staffFeedbackRequired: false;
  staffFeedbackAccessed: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
  carrierCycleStatusMutationPerformed: false;
  carrierCycleTimestampMutationPerformed: false;
  participantMutationPerformed: false;
  notificationsSeeded: false;
  providerCalled: false;
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
      "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_INVALID_IDENTIFIER",
      400,
      { fieldName },
    );
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_INVALID_CURRENT_TIME", 400);
  }
  return now;
}

function assertDirectorAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
  assessment: HeadteacherSupervisoryAssessmentView;
}) {
  const actorRole = effectiveRole(input.actorRoleName);
  if (
    actorRole !==
    HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.requiredActorRole
  ) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ROLE_FORBIDDEN", 403);
  }

  assertAppraisalAuthority(
    { actorUserId: input.actorUserId, roleName: actorRole },
    HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.requiredCapability,
  );

  if (
    input.assessment.assessorUserId !== input.actorUserId ||
    input.assessment.revision !== 1 ||
    input.assessment.status !== "FINALIZED" ||
    !isSha256(input.assessment.assessmentHash) ||
    !isSha256(input.assessment.visitContextHash)
  ) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_AUTHORITY_INVALID", 403);
  }
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
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (current.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_AMBIGUOUS_ASSIGNMENT", 409, {
      activeAssignments: current.length,
    });
  }
  if (current[0].id !== input.expectedAssignmentId) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ASSESSOR_ASSIGNMENT_DRIFT", 409);
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
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_TARGET_CONTEXT_INVALID", 409);
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
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ASSESSOR_PROVENANCE_DRIFT", 409);
  }
  return role;
}

function assertCycleContract(
  cycle: CycleRecord,
  verifiedAssessment: HeadteacherSupervisoryAssessmentView,
): CarrierCycleStatus {
  const status = normalized(cycle.status);

  if (
    cycle.id !== verifiedAssessment.cycleId ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    cycle.targetUserId !== verifiedAssessment.targetUserId ||
    cycle.targetTenantId !== verifiedAssessment.targetTenantId ||
    !cycle.targetZoneId ||
    !cycle.scopeZoneId ||
    !cycle.openedAt ||
    cycle.cancelledAt !== null ||
    !HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.eligibleCarrierCycleStatuses.includes(
      status as CarrierCycleStatus,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_CARRIER_CYCLE_INVALID", 409, {
      cycleId: cycle.id,
      cycleStatus: status,
    });
  }

  return status as CarrierCycleStatus;
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
    stored.assessorUserId !== verified.assessorUserId ||
    normalized(stored.status) !== "FINALIZED" ||
    stored.revision !== 1 ||
    stored.priorAssessmentId !== null ||
    !stored.assessorAssignmentId ||
    stored.assessorAssignmentId !== verified.assessorAssignmentId ||
    clean(stored.assessmentHash).toLowerCase() !==
      clean(verified.assessmentHash).toLowerCase() ||
    stored.finalizedByUserId !== stored.assessorUserId ||
    !stored.finalizedAt ||
    clean(objectValue(stored.metadata).visitContextHash).toLowerCase() !==
      clean(verified.visitContextHash).toLowerCase()
  ) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ASSESSMENT_DRIFT", 409);
  }

  frozenAssessorRole(stored, cycle);
  return stored;
}

export type HeadteacherSupervisoryDirectorDirectReleaseHashEvidence = {
  cycleId: string;
  assessmentId: string;
  assessmentRevision: 1;
  assessmentHash: string;
  visitContextHash: string;
  assessorUserId: string;
  assessorAssignmentId: string;
};

function directHashEvidence(
  assessment: HeadteacherSupervisoryAssessmentView,
): HeadteacherSupervisoryDirectorDirectReleaseHashEvidence {
  const assessmentHash = clean(assessment.assessmentHash).toLowerCase();
  const visitContextHash = clean(assessment.visitContextHash).toLowerCase();
  const assessorAssignmentId = requireIdentifier(
    assessment.assessorAssignmentId,
    "assessorAssignmentId",
  );

  if (!isSha256(assessmentHash) || !isSha256(visitContextHash)) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_HASH_EVIDENCE_INVALID", 409);
  }

  return {
    cycleId: assessment.cycleId,
    assessmentId: assessment.assessmentId,
    assessmentRevision: 1,
    assessmentHash,
    visitContextHash,
    assessorUserId: assessment.assessorUserId,
    assessorAssignmentId,
  };
}

export function computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash() {
  return hashJson({
    schemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    action: "RELEASE",
    assessorRole: "DISTRICT_DIRECTOR",
    releaserRole: "DISTRICT_DIRECTOR",
    exactAssessorAsReleaserRequired: true,
    exactAssessorAssignmentAsReleaserAssignmentRequired: true,
    reviewRowsRequired: false,
    reviewRowsAllowed: false,
    selfReviewAllowed: false,
    eligibleCarrierCycleStatuses: ["OPEN", "CLOSED", "UNDER_REVIEW", "RELEASED"],
    carrierCycleStatusMutationAllowed: false,
    carrierCycleTimestampMutationAllowed: false,
    participantMutationAllowed: false,
    assessmentStatus: "FINALIZED",
    assessmentRevision: 1,
    assessmentStatusMutationAllowed: false,
    scoreMutationAllowed: false,
    visitContextMutationAllowed: false,
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    releaseNoteAllowed: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
}

export function computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash(input: {
  evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
}) {
  return hashJson({
    schemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    releaseMode:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    cycleId: input.evidence.cycleId,
    assessment: {
      id: input.evidence.assessmentId,
      revision: input.evidence.assessmentRevision,
      status: "FINALIZED",
      assessmentHash: input.evidence.assessmentHash,
      visitContextHash: input.evidence.visitContextHash,
      assessorUserId: input.evidence.assessorUserId,
      assessorAssignmentId: input.evidence.assessorAssignmentId,
      assessorRole: "DISTRICT_DIRECTOR",
    },
    releaser: {
      userId: input.evidence.assessorUserId,
      assignmentId: input.releaserAssignmentId,
      role: "DISTRICT_DIRECTOR",
    },
    decisionContractHash: input.decisionContractHash,
    staffFeedbackRequired: false,
  });
}

export function computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash(input: {
  evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence;
  releaseRequestHash: string;
}) {
  return hashJson({
    schemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.assessmentRevision,
    assessmentHash: input.evidence.assessmentHash,
    visitContextHash: input.evidence.visitContextHash,
    releaseRequestHash: input.releaseRequestHash,
    staffFeedbackAccessed: false,
  });
}

function directReleaseProofPayload(input: {
  evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releasedAt: Date;
}) {
  return {
    proofSchemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.proofSchemaVersion,
    releaseMode:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    workflow: HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
    evidenceStream:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
    cycleId: input.evidence.cycleId,
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: input.evidence.assessmentRevision,
    assessmentStatus: "FINALIZED",
    assessmentHash: input.evidence.assessmentHash,
    visitContextHash: input.evidence.visitContextHash,
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
    assessmentStatusMutationPerformed: false,
    scoreMutationPerformed: false,
    visitContextMutationPerformed: false,
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    carrierCycleStatusMutationPerformed: false,
    carrierCycleTimestampMutationPerformed: false,
    participantMutationPerformed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  } as const;
}

export function computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata(
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
    assessmentStatusMutationPerformed: release.assessmentStatusMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    visitContextMutationPerformed: release.visitContextMutationPerformed,
    staffFeedbackRequired: release.staffFeedbackRequired,
    staffFeedbackAccessed: release.staffFeedbackAccessed,
    respondentIdentitiesAccessed: release.respondentIdentitiesAccessed,
    individualStaffResponsesAccessed: release.individualStaffResponsesAccessed,
    carrierCycleStatusMutationPerformed:
      release.carrierCycleStatusMutationPerformed,
    carrierCycleTimestampMutationPerformed:
      release.carrierCycleTimestampMutationPerformed,
    participantMutationPerformed: release.participantMutationPerformed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    separateEvidenceStreams: release.separateEvidenceStreams,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    providerCalled: release.providerCalled,
  });
}

function releaseEntries(metadata: unknown) {
  return objectValue(
    objectValue(metadata)[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY],
  );
}

function releaseEntry(metadata: unknown, assessmentId: string) {
  return objectValue(releaseEntries(metadata)[assessmentId]);
}

function cycleMetadataForRelease(input: {
  cycleMetadata: unknown;
  assessmentId: string;
  proof: ReturnType<typeof directReleaseProofPayload>;
  releaseProofHash: string;
}) {
  return {
    ...objectValue(input.cycleMetadata),
    [HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY]: {
      ...releaseEntries(input.cycleMetadata),
      [input.assessmentId]: {
        ...input.proof,
        releaseProofHash: input.releaseProofHash,
      },
    },
  };
}

function assertExistingRelease(input: {
  cycle: CycleRecord;
  evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence;
  releaserAssignmentId: string;
}) {
  const release = releaseEntry(input.cycle.metadata, input.evidence.assessmentId);
  if (Object.keys(release).length === 0) return null;

  const releasedAt = clean(release.releasedAt);
  const releasedDate = new Date(releasedAt);
  if (!releasedAt || Number.isNaN(releasedDate.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_EXISTING_TIMESTAMP_INVALID", 409);
  }

  const decisionContractHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash();
  const releaseRequestHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash({
      evidence: input.evidence,
      releaserAssignmentId: input.releaserAssignmentId,
      decisionContractHash,
    });
  const releaseEvidenceHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash({
      evidence: input.evidence,
      releaseRequestHash,
    });
  const expectedProofHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata(
      release,
    );

  if (
    Number(release.proofSchemaVersion) !== 1 ||
    clean(release.releaseMode) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    clean(release.workflow) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow ||
    clean(release.evidenceStream) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream ||
    clean(release.cycleId) !== input.evidence.cycleId ||
    clean(release.assessmentId) !== input.evidence.assessmentId ||
    Number(release.assessmentRevision) !== 1 ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !== input.evidence.assessmentHash ||
    clean(release.visitContextHash).toLowerCase() !== input.evidence.visitContextHash ||
    clean(release.assessorUserId) !== input.evidence.assessorUserId ||
    clean(release.assessorAssignmentId) !== input.evidence.assessorAssignmentId ||
    normalized(release.assessorRole) !== "DISTRICT_DIRECTOR" ||
    release.reviewRowsRequired !== false ||
    release.reviewRowsPresent !== false ||
    release.selfReviewPerformed !== false ||
    clean(release.releaserUserId) !== input.evidence.assessorUserId ||
    clean(release.releaserAssignmentId) !== input.releaserAssignmentId ||
    normalized(release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    clean(release.decisionContractHash).toLowerCase() !== decisionContractHash ||
    clean(release.releaseRequestHash).toLowerCase() !== releaseRequestHash ||
    clean(release.releaseEvidenceHash).toLowerCase() !== releaseEvidenceHash ||
    release.releaseNoteIncluded !== false ||
    release.assessmentStatusMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.visitContextMutationPerformed !== false ||
    release.staffFeedbackRequired !== false ||
    release.staffFeedbackAccessed !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.carrierCycleStatusMutationPerformed !== false ||
    release.carrierCycleTimestampMutationPerformed !== false ||
    release.participantMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.separateEvidenceStreams !== true ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.providerCalled !== false ||
    !isSha256(release.releaseProofHash) ||
    clean(release.releaseProofHash).toLowerCase() !== expectedProofHash
  ) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_EXISTING_PROOF_DRIFT", 409);
  }

  return {
    decisionContractHash,
    releaseRequestHash,
    releaseEvidenceHash,
    releaseProofHash: expectedProofHash,
    releasedAt: releasedDate.toISOString(),
  };
}

async function prepareDirectRelease(input: {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  now: Date;
  database: HeadteacherSupervisoryDirectorDirectReleaseDatabase;
  dependencies: { loadAssessment: typeof loadHeadteacherSupervisoryAssessment };
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

  return assessment;
}

function resultFor(input: {
  outcome: "RELEASED" | "EXISTING_RELEASED";
  evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence;
  carrierStatus: CarrierCycleStatus;
  actorUserId: string;
  releaserAssignmentId: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseEvidenceHash: string;
  releaseProofHash: string;
  releasedAt: string;
}): ExecuteHeadteacherSupervisoryDirectorDirectReleaseResult {
  return {
    outcome: input.outcome,
    releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
    governanceReleaseStatus: "RELEASED",
    assessmentId: input.evidence.assessmentId,
    assessmentRevision: 1,
    assessmentStatus: "FINALIZED",
    cycleId: input.evidence.cycleId,
    staffFeedbackCycleStatus: input.carrierStatus,
    assessorUserId: input.evidence.assessorUserId,
    assessorAssignmentId: input.evidence.assessorAssignmentId,
    releaserUserId: input.actorUserId,
    releaserAssignmentId: input.releaserAssignmentId,
    releaserRole: "DISTRICT_DIRECTOR",
    reviewRowsRequired: false,
    reviewRowsPresent: false,
    selfReviewPerformed: false,
    assessmentHash: input.evidence.assessmentHash,
    visitContextHash: input.evidence.visitContextHash,
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.releaseRequestHash,
    releaseEvidenceHash: input.releaseEvidenceHash,
    releaseProofHash: input.releaseProofHash,
    releasedAt: input.releasedAt,
    assessmentStatusMutationPerformed: false,
    scoreMutationPerformed: false,
    visitContextMutationPerformed: false,
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    carrierCycleStatusMutationPerformed: false,
    carrierCycleTimestampMutationPerformed: false,
    participantMutationPerformed: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
}

async function runDirectRelease(
  input: ExecuteHeadteacherSupervisoryDirectorDirectReleaseInput,
  database: HeadteacherSupervisoryDirectorDirectReleaseDatabase,
  dependencies: { loadAssessment: typeof loadHeadteacherSupervisoryAssessment },
): Promise<ExecuteHeadteacherSupervisoryDirectorDirectReleaseResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);

  if (input.confirm !== true) {
    fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_CONFIRMATION_REQUIRED", 400);
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
          openedAt: true,
          deadlineAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
        },
      });
      if (!cycle) {
        fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_CYCLE_NOT_FOUND", 404);
      }

      const carrierStatus = assertCycleContract(cycle, prepared);
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
        verified: prepared,
        cycle,
      });

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
        where: { assessmentId: evidence.assessmentId },
        select: { id: true, cycleId: true, assessmentId: true },
      });
      if (reviewRows.length !== 0) {
        fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_REVIEW_ROWS_PRESENT", 409, {
          reviewRows: reviewRows.length,
        });
      }

      const existing = assertExistingRelease({
        cycle,
        evidence,
        releaserAssignmentId: directorAssignment.id,
      });
      if (existing) {
        return resultFor({
          outcome: "EXISTING_RELEASED",
          evidence,
          carrierStatus,
          actorUserId,
          releaserAssignmentId: directorAssignment.id,
          ...existing,
        });
      }

      const decisionContractHash =
        computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash();
      const releaseRequestHash =
        computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash({
          evidence,
          releaserAssignmentId: directorAssignment.id,
          decisionContractHash,
        });
      const releaseEvidenceHash =
        computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash({
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

      const written = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: cycle.status,
          cancelledAt: null,
        },
        data: {
          metadata: cycleMetadataForRelease({
            cycleMetadata: cycle.metadata,
            assessmentId: evidence.assessmentId,
            proof,
            releaseProofHash,
          }),
        },
      });
      if (written.count !== 1) {
        fail("HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_WRITE_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: actorUserId,
          action: DIRECT_RELEASE_AUDIT_ACTION,
          resource: "AppraisalAssessment",
          resourceId: evidence.assessmentId,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: DIRECT_RELEASE_AUDIT_ACTION,
            workflow:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.workflow,
            evidenceStream:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream,
            releaseMode:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
            cycleId: evidence.cycleId,
            assessmentId: evidence.assessmentId,
            assessmentRevision: 1,
            releaserRole: "DISTRICT_DIRECTOR",
            releaseProofHash,
            carrierCycleStatusAtRelease: carrierStatus,
            staffFeedbackRequired: false,
            staffFeedbackAccessed: false,
            carrierCycleStatusMutationPerformed: false,
            carrierCycleTimestampMutationPerformed: false,
            participantMutationPerformed: false,
            assessmentStatusMutationPerformed: false,
            scoreMutationPerformed: false,
            visitContextMutationPerformed: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            separateEvidenceStreams: true,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return resultFor({
        outcome: "RELEASED",
        evidence,
        carrierStatus,
        actorUserId,
        releaserAssignmentId: directorAssignment.id,
        decisionContractHash,
        releaseRequestHash,
        releaseEvidenceHash,
        releaseProofHash,
        releasedAt: now.toISOString(),
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.transactionTimeoutMs,
    },
  );
}

function isPrismaCode(error: unknown, code: string) {
  return clean((error as { code?: unknown })?.code) === code;
}

export async function executeHeadteacherSupervisoryDirectorDirectRelease(
  input: ExecuteHeadteacherSupervisoryDirectorDirectReleaseInput,
): Promise<ExecuteHeadteacherSupervisoryDirectorDirectReleaseResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryDirectorDirectReleaseDatabase);
  const dependencies = input.dependencies ?? {
    loadAssessment: loadHeadteacherSupervisoryAssessment,
  };

  try {
    return await runDirectRelease(input, database, dependencies);
  } catch (error) {
    if (!isPrismaCode(error, "P2034")) throw error;
    return runDirectRelease(input, database, dependencies);
  }
}
