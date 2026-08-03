//src/lib/appraisals/headteacherDirectorReviewRelease.ts
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_DIRECTOR_REVIEW_POLICY } from "@/lib/appraisals/headteacherDirectorReview";
import {
  planHeadteacherDirectorReviewDecision,
  readHeadteacherDirectorReviewPackage,
  type HeadteacherDirectorReviewPackage,
  type HeadteacherDirectorReviewPackageDatabase,
} from "@/lib/appraisals/headteacherDirectorReviewPackage";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_RELEASE_POLICY = {
  schemaVersion: 1,
  proofSchemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  reviewerRole: "DISTRICT_DIRECTOR",
  requiredCapability: HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  requiredCycleStatus: "UNDER_REVIEW",
  releasedCycleStatus: "RELEASED",
  requiredCurrentReviewDecision: "PENDING",
  releasedReviewDecision: "ACCEPTED",
  requiredAssessmentStatus: "FINALIZED",
  releasedAssessmentStatus: "FINALIZED",
  explicitConfirmationRequired: true,
  releaseNoteRequired: false,
  maximumReleaseNoteLength: 2_000,
  assessmentMutationAllowed: false,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  separateEvidenceStreams: true,
  combinedWeightingDefined: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  notificationsSeeded: false,
  notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
  providerCallsAllowed: false,
  reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

const RELEASED_AUDIT_ACTION = "HEADTEACHER_APPRAISAL_DIRECTOR_RELEASED";
const RELEASE_METADATA_KEY = "headteacherDirectorRelease";

export type HeadteacherDirectorReleaseRequestMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type HeadteacherDirectorReleaseDependencies = {
  readReviewPackage: typeof readHeadteacherDirectorReviewPackage;
  planDecision: typeof planHeadteacherDirectorReviewDecision;
};

export type ExecuteHeadteacherDirectorReleaseInput =
  HeadteacherDirectorReleaseRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    cycleId: string;
    reviewId: string;
    note?: unknown;
    confirm: boolean;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    now?: Date;
    database?: HeadteacherDirectorReleaseDatabase;
    dependencies?: HeadteacherDirectorReleaseDependencies;
  };

export type ExecuteHeadteacherDirectorReleaseResult = {
  outcome: "RELEASED" | "EXISTING_RELEASED";
  cycleId: string;
  cycleStatus: "RELEASED";
  reviewId: string;
  reviewStage: number;
  reviewDecision: "ACCEPTED";
  assessmentId: string;
  assessmentStatus: "FINALIZED";
  snapshotId: string;
  reviewEvidenceHash: string;
  staffSourceHash: string;
  supervisoryAssessmentHash: string;
  decisionContractHash: string;
  releaseRequestHash: string;
  releaseProofHash: string;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  releasedAt: string;
  releaseNoteIncluded: boolean;
  assessmentMutationPerformed: false;
  scoreMutationPerformed: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
  notificationsSeeded: false;
  notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING";
  providerCalled: false;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
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
    zoneType: { level: number; countryCode: string };
  };
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  status: string;
  revision: number;
  assessorUserId: string;
  assessmentHash: string | null;
  metadata: unknown;
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

type CountResult = { count: number };

export type HeadteacherDirectorReleaseTransactionClient =
  HeadteacherDirectorReviewPackageDatabase & {
    appraisalCycle: HeadteacherDirectorReviewPackageDatabase["appraisalCycle"] & {
      updateMany(args: unknown): Promise<CountResult>;
    };
    appraisalAssessment: HeadteacherDirectorReviewPackageDatabase["appraisalAssessment"] & {
      findUnique(args: unknown): Promise<AssessmentRecord | null>;
    };
    appraisalReview: HeadteacherDirectorReviewPackageDatabase["appraisalReview"] & {
      findUnique(args: unknown): Promise<ReviewRecord | null>;
      findMany(args: unknown): Promise<ReviewRecord[]>;
      updateMany(args: unknown): Promise<CountResult>;
    };
    auditLog: {
      create(args: unknown): Promise<unknown>;
    };
  };

export type HeadteacherDirectorReleaseDatabase = {
  appraisalReview: {
    findUnique(args: unknown): Promise<Pick<ReviewRecord, "id" | "decision"> | null>;
  };
  $transaction<T>(
    operation: (
      tx: HeadteacherDirectorReleaseTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export class HeadteacherDirectorReleaseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorReleaseError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  status: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
} as const;

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  tenantId: true,
  status: true,
  role: { select: { name: true } },
  tenant: { select: { id: true, status: true } },
} as const;

const ASSIGNMENT_SELECT = {
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
      zoneType: { select: { level: true, countryCode: true } },
    },
  },
} as const;

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  status: true,
  revision: true,
  assessorUserId: true,
  assessmentHash: true,
  metadata: true,
} as const;

const REVIEW_SELECT = {
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

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherDirectorReleaseError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function normalizeNote(value: unknown) {
  const note = clean(value);
  if (note.length > HEADTEACHER_DIRECTOR_RELEASE_POLICY.maximumReleaseNoteLength) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_NOTE_TOO_LONG", 400);
  }
  return note;
}

function assignmentIsActive(
  assignment: DirectorAssignmentRecord,
  scopeZoneId: string,
  now: Date,
) {
  if (
    normalized(assignment.role) !== "DISTRICT_DIRECTOR" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== scopeZoneId ||
    assignment.zone.id !== scopeZoneId ||
    assignment.zone.isActive !== true ||
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

function resolveDirectorAssignment(input: {
  actorUserId: string;
  scopeZoneId: string;
  assignments: DirectorAssignmentRecord[];
  now: Date;
}) {
  const active = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actorUserId &&
      assignmentIsActive(assignment, input.scopeZoneId, input.now),
  );
  if (active.length !== 1) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_ASSIGNMENT_INVALID", 403, {
      activeAssignments: active.length,
    });
  }
  return active[0];
}

function assertTargetMembership(
  cycle: CycleRecord,
  membership: MembershipRecord | null,
) {
  if (
    !membership ||
    membership.userId !== cycle.targetUserId ||
    membership.tenantId !== cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    membership.tenant.id !== cycle.targetTenantId ||
    normalized(membership.tenant.status) !== "ACTIVE"
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_TARGET_INACTIVE", 409);
  }
}

function assertCycleWorkflow(cycle: CycleRecord) {
  const metadata = objectValue(cycle.metadata);
  if (
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    clean(metadata.workflow) !== HEADTEACHER_DIRECTOR_RELEASE_POLICY.workflow ||
    !clean(cycle.targetTenantId) ||
    !cycle.reviewStartedAt ||
    cycle.cancelledAt
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_CYCLE_DRIFT", 409);
  }
}

function reviewEvidenceAnchors(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const evidence = objectValue(metadata.evidence);
  const staffFeedback = objectValue(evidence.staffFeedback);
  const supervisoryAssessment = objectValue(evidence.supervisoryAssessment);
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();
  const snapshotId = clean(staffFeedback.snapshotId);
  const staffSourceHash = clean(staffFeedback.sourceHash).toLowerCase();
  const assessmentHash = clean(
    supervisoryAssessment.assessmentHash,
  ).toLowerCase();
  if (
    !isSha256(reviewEvidenceHash) ||
    !snapshotId ||
    !isSha256(staffSourceHash) ||
    clean(supervisoryAssessment.assessmentId) !== review.assessmentId ||
    !isSha256(assessmentHash) ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateEvidenceStreams !== true ||
    metadata.combinedWeightingDefined !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_REVIEW_EVIDENCE_DRIFT", 409);
  }
  return {
    reviewEvidenceHash,
    snapshotId,
    staffSourceHash,
    assessmentHash,
  };
}

function releaseRequestHash(input: {
  cycleId: string;
  review: ReviewRecord;
  actorUserId: string;
  assignmentId: string;
  note: string;
  reviewEvidenceHash: string;
  snapshotId: string;
  staffSourceHash: string;
  assessmentHash: string;
  decisionContractHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_RELEASE_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_RELEASE_POLICY.workflow,
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.review.assessmentId,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    reviewEvidenceHash: input.reviewEvidenceHash,
    snapshotId: input.snapshotId,
    staffSourceHash: input.staffSourceHash,
    supervisoryAssessmentHash: input.assessmentHash,
    decisionContractHash: input.decisionContractHash,
    decision: "RELEASE",
    note: input.note || null,
    cycleNextStatus: "RELEASED",
    reviewNextDecision: "ACCEPTED",
    assessmentNextStatus: "FINALIZED",
    assessmentMutationAllowed: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
}

function releaseProofPayload(input: {
  cycleId: string;
  review: ReviewRecord;
  actorUserId: string;
  assignmentId: string;
  releasedAt: Date;
  releaseRequestHash: string;
  decisionContractHash: string;
  reviewEvidenceHash: string;
  snapshotId: string;
  staffSourceHash: string;
  assessmentHash: string;
}) {
  return {
    proofSchemaVersion: HEADTEACHER_DIRECTOR_RELEASE_POLICY.proofSchemaVersion,
    workflow: HEADTEACHER_DIRECTOR_RELEASE_POLICY.workflow,
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "ACCEPTED",
    assessmentId: input.review.assessmentId,
    assessmentStatus: "FINALIZED",
    snapshotId: input.snapshotId,
    reviewEvidenceHash: input.reviewEvidenceHash,
    staffSourceHash: input.staffSourceHash,
    supervisoryAssessmentHash: input.assessmentHash,
    decisionContractHash: input.decisionContractHash,
    releaseRequestHash: input.releaseRequestHash,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    releasedAt: input.releasedAt.toISOString(),
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
    providerCalled: false,
  } as const;
}

function releaseMetadata(input: {
  existingMetadata: unknown;
  proof: ReturnType<typeof releaseProofPayload>;
  releaseProofHash: string;
  note: string;
}) {
  return {
    ...objectValue(input.existingMetadata),
    [RELEASE_METADATA_KEY]: {
      ...input.proof,
      releaseProofHash: input.releaseProofHash,
      releaseNoteIncluded: Boolean(input.note),
      releaseNoteHash: input.note ? hashJson({ note: input.note }) : null,
    },
  };
}

function extractReleaseProof(value: unknown) {
  const release = objectValue(objectValue(value)[RELEASE_METADATA_KEY]);
  return release;
}

function expectedReleaseProofHash(release: Record<string, unknown>) {
  const payload = {
    proofSchemaVersion: release.proofSchemaVersion,
    workflow: release.workflow,
    cycleId: release.cycleId,
    reviewId: release.reviewId,
    reviewStage: release.reviewStage,
    reviewDecision: release.reviewDecision,
    assessmentId: release.assessmentId,
    assessmentStatus: release.assessmentStatus,
    snapshotId: release.snapshotId,
    reviewEvidenceHash: release.reviewEvidenceHash,
    staffSourceHash: release.staffSourceHash,
    supervisoryAssessmentHash: release.supervisoryAssessmentHash,
    decisionContractHash: release.decisionContractHash,
    releaseRequestHash: release.releaseRequestHash,
    reviewerUserId: release.reviewerUserId,
    reviewerAssignmentId: release.reviewerAssignmentId,
    releasedAt: release.releasedAt,
    assessmentMutationPerformed: release.assessmentMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    respondentIdentitiesAccessed: release.respondentIdentitiesAccessed,
    individualStaffResponsesAccessed: release.individualStaffResponsesAccessed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    separateEvidenceStreams: release.separateEvidenceStreams,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    notificationReadiness: release.notificationReadiness,
    providerCalled: release.providerCalled,
  };
  return hashJson(payload);
}

function assertReleaseProofShape(input: {
  cycle: CycleRecord;
  review: ReviewRecord;
  assessment: AssessmentRecord;
  actorUserId: string;
  assignmentId: string;
  note: string;
}) {
  const cycleRelease = extractReleaseProof(input.cycle.metadata);
  const reviewRelease = extractReleaseProof(input.review.metadata);
  if (
    JSON.stringify(stableValue(cycleRelease)) !==
    JSON.stringify(stableValue(reviewRelease))
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_PROOF_COPY_DRIFT", 409);
  }
  const anchors = reviewEvidenceAnchors(input.review);
  const releasedAt = input.cycle.releasedAt;
  if (
    !releasedAt ||
    normalized(input.cycle.status) !== "RELEASED" ||
    normalized(input.review.decision) !== "ACCEPTED" ||
    !input.review.decidedAt ||
    input.review.decidedAt.toISOString() !== releasedAt.toISOString() ||
    clean(input.review.note) !== input.note ||
    normalized(input.assessment.status) !== "FINALIZED" ||
    clean(input.assessment.assessmentHash).toLowerCase() !==
      anchors.assessmentHash ||
    Number(cycleRelease.proofSchemaVersion) !== 1 ||
    clean(cycleRelease.workflow) !== HEADTEACHER_DIRECTOR_RELEASE_POLICY.workflow ||
    clean(cycleRelease.cycleId) !== input.cycle.id ||
    clean(cycleRelease.reviewId) !== input.review.id ||
    Number(cycleRelease.reviewStage) !== input.review.stage ||
    normalized(cycleRelease.reviewDecision) !== "ACCEPTED" ||
    clean(cycleRelease.assessmentId) !== input.assessment.id ||
    normalized(cycleRelease.assessmentStatus) !== "FINALIZED" ||
    clean(cycleRelease.snapshotId) !== anchors.snapshotId ||
    clean(cycleRelease.reviewEvidenceHash).toLowerCase() !==
      anchors.reviewEvidenceHash ||
    clean(cycleRelease.staffSourceHash).toLowerCase() !==
      anchors.staffSourceHash ||
    clean(cycleRelease.supervisoryAssessmentHash).toLowerCase() !==
      anchors.assessmentHash ||
    clean(cycleRelease.reviewerUserId) !== input.actorUserId ||
    clean(cycleRelease.reviewerAssignmentId) !== input.assignmentId ||
    clean(cycleRelease.releasedAt) !== releasedAt.toISOString() ||
    !isSha256(cycleRelease.decisionContractHash) ||
    !isSha256(cycleRelease.releaseRequestHash) ||
    !isSha256(cycleRelease.releaseProofHash) ||
    cycleRelease.assessmentMutationPerformed !== false ||
    cycleRelease.scoreMutationPerformed !== false ||
    cycleRelease.respondentIdentitiesAccessed !== false ||
    cycleRelease.individualStaffResponsesAccessed !== false ||
    cycleRelease.reviewerMayRewriteScores !== false ||
    cycleRelease.separateEvidenceStreams !== true ||
    cycleRelease.combinedWeightingDefined !== false ||
    cycleRelease.notificationsSeeded !== false ||
    cycleRelease.notificationReadiness !==
      "READY_FOR_POST_RELEASE_SEEDING" ||
    cycleRelease.providerCalled !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_EXISTING_PROOF_DRIFT", 409);
  }
  const expectedRequestHash = releaseRequestHash({
    cycleId: input.cycle.id,
    review: input.review,
    actorUserId: input.actorUserId,
    assignmentId: input.assignmentId,
    note: input.note,
    reviewEvidenceHash: anchors.reviewEvidenceHash,
    snapshotId: anchors.snapshotId,
    staffSourceHash: anchors.staffSourceHash,
    assessmentHash: anchors.assessmentHash,
    decisionContractHash: clean(cycleRelease.decisionContractHash).toLowerCase(),
  });
  if (
    clean(cycleRelease.releaseRequestHash).toLowerCase() !==
    expectedRequestHash ||
    clean(cycleRelease.releaseProofHash).toLowerCase() !==
      expectedReleaseProofHash(cycleRelease)
  ) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_EXISTING_HASH_DRIFT", 409);
  }
  return {
    anchors,
    decisionContractHash: clean(
      cycleRelease.decisionContractHash,
    ).toLowerCase(),
    releaseRequestHash: expectedRequestHash,
    releaseProofHash: clean(cycleRelease.releaseProofHash).toLowerCase(),
    releasedAt,
  };
}

function resultFromExisting(input: {
  cycle: CycleRecord;
  review: ReviewRecord;
  assessment: AssessmentRecord;
  reviews: ReviewRecord[];
  actorUserId: string;
  assignmentId: string;
  note: string;
}): ExecuteHeadteacherDirectorReleaseResult {
  const laterReviews = input.reviews.filter(
    (review) => review.stage > input.review.stage,
  );
  if (laterReviews.length !== 0) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_LATER_REVIEW_DRIFT", 409);
  }
  const proof = assertReleaseProofShape(input);
  return {
    outcome: "EXISTING_RELEASED",
    cycleId: input.cycle.id,
    cycleStatus: "RELEASED",
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewDecision: "ACCEPTED",
    assessmentId: input.assessment.id,
    assessmentStatus: "FINALIZED",
    snapshotId: proof.anchors.snapshotId,
    reviewEvidenceHash: proof.anchors.reviewEvidenceHash,
    staffSourceHash: proof.anchors.staffSourceHash,
    supervisoryAssessmentHash: proof.anchors.assessmentHash,
    decisionContractHash: proof.decisionContractHash,
    releaseRequestHash: proof.releaseRequestHash,
    releaseProofHash: proof.releaseProofHash,
    reviewerUserId: input.actorUserId,
    reviewerAssignmentId: input.assignmentId,
    releasedAt: proof.releasedAt.toISOString(),
    releaseNoteIncluded: Boolean(input.note),
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    notificationsSeeded: false,
    notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
    providerCalled: false,
  };
}

function isUniqueViolation(error: unknown) {
  return clean((error as { code?: unknown })?.code) === "P2002";
}

function isReviewPackageRequired(error: unknown) {
  return (
    clean((error as { code?: unknown })?.code || (error as Error)?.message) ===
    "HEADTEACHER_DIRECTOR_RELEASE_REVIEW_PACKAGE_REQUIRED"
  );
}

type PreparedReleaseRequest = {
  actorUserId: string;
  cycleId: string;
  reviewId: string;
  actorRole: string;
  note: string;
  now: Date;
  reqId: string;
};

function prepareReleaseRequest(
  input: ExecuteHeadteacherDirectorReleaseInput,
): PreparedReleaseRequest {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  const actorRole = effectiveRole(input.actorRoleName);
  const note = normalizeNote(input.note);
  const now = input.now ?? new Date();
  const reqId = clean(input.reqId) || randomUUID();

  if (input.confirm !== true) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_CONFIRMATION_REQUIRED", 400);
  }
  if (actorRole !== HEADTEACHER_DIRECTOR_RELEASE_POLICY.reviewerRole) {
    fail("HEADTEACHER_DIRECTOR_RELEASE_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_RELEASE_POLICY.requiredCapability,
  );

  return {
    actorUserId,
    cycleId,
    reviewId,
    actorRole,
    note,
    now,
    reqId,
  };
}

async function runRelease(
  input: ExecuteHeadteacherDirectorReleaseInput,
  database: HeadteacherDirectorReleaseDatabase,
  dependencies: HeadteacherDirectorReleaseDependencies,
  prepared: PreparedReleaseRequest,
  reviewPackage: HeadteacherDirectorReviewPackage | null,
  allowWrite: boolean,
): Promise<ExecuteHeadteacherDirectorReleaseResult> {
  const {
    actorUserId,
    cycleId,
    reviewId,
    note,
    now,
    reqId,
  } = prepared;

  return database.$transaction(
    async (tx) => {
      const cycle = (await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: CYCLE_SELECT,
      })) as CycleRecord | null;
      if (!cycle) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_CYCLE_NOT_FOUND", 404);
      }
      assertCycleWorkflow(cycle);
      const targetTenantId = requireIdentifier(
        cycle.targetTenantId,
        "targetTenantId",
      );
      assertHeadteacherFeedbackTargetInGovernanceScope({
        governanceScope: input.governanceScope,
        targetTenantId,
      });

      const membership = (await tx.membership.findFirst({
        where: {
          userId: cycle.targetUserId,
          tenantId: targetTenantId,
          status: "ACTIVE",
          role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
          tenant: { status: "ACTIVE" },
        },
        select: MEMBERSHIP_SELECT,
      })) as MembershipRecord | null;
      assertTargetMembership(cycle, membership);

      const assignments = (await tx.governanceOfficerAssignment.findMany({
        where: { userId: actorUserId },
        select: ASSIGNMENT_SELECT,
      })) as DirectorAssignmentRecord[];
      const assignment = resolveDirectorAssignment({
        actorUserId,
        scopeZoneId: cycle.scopeZoneId,
        assignments,
        now,
      });

      const review = (await tx.appraisalReview.findUnique({
        where: { id: reviewId },
        select: REVIEW_SELECT,
      })) as ReviewRecord | null;
      if (!review) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_REVIEW_NOT_FOUND", 404);
      }
      if (
        review.cycleId !== cycleId ||
        review.reviewerUserId !== actorUserId ||
        review.reviewerAssignmentId !== assignment.id ||
        !Number.isInteger(review.stage) ||
        review.stage < 1
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_REVIEW_SCOPE_DRIFT", 409);
      }

      const assessment = (await tx.appraisalAssessment.findUnique({
        where: { id: review.assessmentId },
        select: ASSESSMENT_SELECT,
      })) as AssessmentRecord | null;
      if (!assessment || assessment.cycleId !== cycleId) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_ASSESSMENT_NOT_FOUND", 409);
      }
      const reviews = (await tx.appraisalReview.findMany({
        where: { assessmentId: assessment.id },
        select: REVIEW_SELECT,
        orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      })) as ReviewRecord[];

      if (normalized(cycle.status) === "RELEASED") {
        return resultFromExisting({
          cycle,
          review,
          assessment,
          reviews,
          actorUserId,
          assignmentId: assignment.id,
          note,
        });
      }
      if (
        normalized(cycle.status) !== "UNDER_REVIEW" ||
        cycle.releasedAt
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_CYCLE_NOT_UNDER_REVIEW", 409, {
          cycleStatus: normalized(cycle.status),
        });
      }
      if (!allowWrite) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_CONCURRENT_STATE_NOT_VISIBLE", 409);
      }
      if (
        normalized(review.decision) !== "PENDING" ||
        clean(review.note) ||
        review.decidedAt ||
        normalized(assessment.status) !== "FINALIZED" ||
        !isSha256(assessment.assessmentHash)
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_PENDING_STATE_DRIFT", 409);
      }

      if (!reviewPackage) {
        fail(
          "HEADTEACHER_DIRECTOR_RELEASE_REVIEW_PACKAGE_REQUIRED",
          409,
        );
      }
      if (
        reviewPackage.review.id !== review.id ||
        reviewPackage.review.stage !== review.stage ||
        reviewPackage.supervisoryAssessment.assessmentId !== assessment.id
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_CURRENT_REVIEW_DRIFT", 409);
      }

      const plan = dependencies.planDecision({
        reviewPackage,
        decision: "RELEASE",
        note,
        confirm: true,
      });
      if (
        plan.decision !== "RELEASE" ||
        plan.cycleId !== cycleId ||
        plan.reviewId !== review.id ||
        plan.assessmentId !== assessment.id ||
        plan.reviewNextDecision !== "ACCEPTED" ||
        plan.cycleNextStatus !== "RELEASED" ||
        plan.assessmentNextStatus !== "FINALIZED" ||
        plan.releaseRequested !== true ||
        plan.revisionRequired !== false ||
        plan.nextReviewStageRequired !== false ||
        plan.executionPerformed !== false ||
        plan.reviewerMayRewriteScores !== false ||
        plan.scoreMutationAllowed !== false ||
        plan.combinedWeightingDefined !== false ||
        !isSha256(plan.decisionContractHash)
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_PLAN_DRIFT", 409);
      }

      const anchors = reviewEvidenceAnchors(review);
      if (
        anchors.reviewEvidenceHash !== reviewPackage.review.reviewEvidenceHash ||
        anchors.snapshotId !== reviewPackage.staffFeedback.snapshotId ||
        anchors.staffSourceHash !==
          clean(
            (reviewPackage.staffFeedback as { sourceHash?: unknown }).sourceHash,
          ).toLowerCase() ||
        anchors.assessmentHash !==
          reviewPackage.supervisoryAssessment.assessmentHash ||
        anchors.assessmentHash !==
          clean(assessment.assessmentHash).toLowerCase()
      ) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_PACKAGE_EVIDENCE_DRIFT", 409);
      }

      const requestHash = releaseRequestHash({
        cycleId,
        review,
        actorUserId,
        assignmentId: assignment.id,
        note,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        snapshotId: anchors.snapshotId,
        staffSourceHash: anchors.staffSourceHash,
        assessmentHash: anchors.assessmentHash,
        decisionContractHash: plan.decisionContractHash,
      });
      const proof = releaseProofPayload({
        cycleId,
        review,
        actorUserId,
        assignmentId: assignment.id,
        releasedAt: now,
        releaseRequestHash: requestHash,
        decisionContractHash: plan.decisionContractHash,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        snapshotId: anchors.snapshotId,
        staffSourceHash: anchors.staffSourceHash,
        assessmentHash: anchors.assessmentHash,
      });
      const proofHash = hashJson(proof);
      const sharedMetadata = {
        ...proof,
        releaseProofHash: proofHash,
        releaseNoteIncluded: Boolean(note),
        releaseNoteHash: note ? hashJson({ note }) : null,
      };

      const reviewUpdate = await tx.appraisalReview.updateMany({
        where: {
          id: review.id,
          decision: "PENDING",
          decidedAt: null,
        },
        data: {
          decision: "ACCEPTED",
          note: note || null,
          decidedAt: now,
          metadata: releaseMetadata({
            existingMetadata: review.metadata,
            proof,
            releaseProofHash: proofHash,
            note,
          }),
        },
      });
      if (reviewUpdate.count !== 1) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_REVIEW_UPDATE_RACE", 409);
      }

      const cycleUpdate = await tx.appraisalCycle.updateMany({
        where: {
          id: cycleId,
          status: "UNDER_REVIEW",
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "RELEASED",
          releasedAt: now,
          metadata: {
            ...objectValue(cycle.metadata),
            [RELEASE_METADATA_KEY]: sharedMetadata,
          },
        },
      });
      if (cycleUpdate.count !== 1) {
        fail("HEADTEACHER_DIRECTOR_RELEASE_CYCLE_UPDATE_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: actorUserId,
          action: RELEASED_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycleId,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            action: RELEASED_AUDIT_ACTION,
            workflow: HEADTEACHER_DIRECTOR_RELEASE_POLICY.workflow,
            cycleId,
            reviewId: review.id,
            reviewStage: review.stage,
            assessmentId: assessment.id,
            reviewerAssignmentId: assignment.id,
            snapshotId: anchors.snapshotId,
            reviewEvidenceHash: anchors.reviewEvidenceHash,
            staffFeedbackSourceHash: anchors.staffSourceHash,
            supervisoryAssessmentHash: anchors.assessmentHash,
            decisionContractHash: plan.decisionContractHash,
            releaseRequestHash: requestHash,
            releaseProofHash: proofHash,
            releaseNoteIncluded: Boolean(note),
            releaseNoteTextIncluded: false,
            assessmentMutationPerformed: false,
            scoreValuesIncluded: false,
            scoreMutationPerformed: false,
            respondentIdentitiesAccessed: false,
            individualStaffResponsesAccessed: false,
            reviewerMayRewriteScores: false,
            separateEvidenceStreams: true,
            combinedWeightingDefined: false,
            notificationsSeeded: false,
            notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "RELEASED",
        cycleId,
        cycleStatus: "RELEASED",
        reviewId: review.id,
        reviewStage: review.stage,
        reviewDecision: "ACCEPTED",
        assessmentId: assessment.id,
        assessmentStatus: "FINALIZED",
        snapshotId: anchors.snapshotId,
        reviewEvidenceHash: anchors.reviewEvidenceHash,
        staffSourceHash: anchors.staffSourceHash,
        supervisoryAssessmentHash: anchors.assessmentHash,
        decisionContractHash: plan.decisionContractHash,
        releaseRequestHash: requestHash,
        releaseProofHash: proofHash,
        reviewerUserId: actorUserId,
        reviewerAssignmentId: assignment.id,
        releasedAt: now.toISOString(),
        releaseNoteIncluded: Boolean(note),
        assessmentMutationPerformed: false,
        scoreMutationPerformed: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        notificationsSeeded: false,
        notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_DIRECTOR_RELEASE_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_DIRECTOR_RELEASE_POLICY.transactionTimeoutMs,
    },
  );
}

export async function executeHeadteacherDirectorRelease(
  input: ExecuteHeadteacherDirectorReleaseInput,
): Promise<ExecuteHeadteacherDirectorReleaseResult> {
  const database =
    input.database ?? (prisma as unknown as HeadteacherDirectorReleaseDatabase);
  const dependencies = input.dependencies ?? {
    readReviewPackage: readHeadteacherDirectorReviewPackage,
    planDecision: planHeadteacherDirectorReviewDecision,
  };
  const prepared = prepareReleaseRequest(input);

  const sourceReview = await database.appraisalReview.findUnique({
    where: { id: prepared.reviewId },
    select: { id: true, decision: true },
  });

  let reviewPackage: HeadteacherDirectorReviewPackage | null = null;

  if (sourceReview && normalized(sourceReview.decision) === "PENDING") {
    try {
      reviewPackage = await dependencies.readReviewPackage({
        actorUserId: prepared.actorUserId,
        actorRoleName: prepared.actorRole,
        cycleId: prepared.cycleId,
        governanceScope: input.governanceScope,
        now: prepared.now,
        database:
          database as unknown as HeadteacherDirectorReviewPackageDatabase,
      });
    } catch (packageError) {
      try {
        return await runRelease(
          input,
          database,
          dependencies,
          prepared,
          null,
          false,
        );
      } catch (stateError) {
        if (isReviewPackageRequired(stateError)) {
          throw packageError;
        }
        throw stateError;
      }
    }
  }

  try {
    return await runRelease(
      input,
      database,
      dependencies,
      prepared,
      reviewPackage,
      true,
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return runRelease(
      input,
      database,
      dependencies,
      prepared,
      reviewPackage,
      false,
    );
  }
}
