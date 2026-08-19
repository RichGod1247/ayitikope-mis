import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_HEADTEACHER_STAFF_FEEDBACK",
  requiredRole: "HEADTEACHER",
  releaseMode: "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
  requiredReviewDecision: "ACCEPTED",
  requiredSnapshotVersion: 1,
  minimumResponses: 1,
  expectedSectionCount: 4,
  responseCountsIncluded: false,
  staffItemAveragesIncluded: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  responseHashesIncluded: false,
  reviewerIdentityIncluded: false,
  governanceAssessmentIncluded: false,
  governanceAssessmentRequired: false,
  combinedScoreIncluded: false,
  readOnly: true,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type HeadteacherStaffFeedbackReleasedResult = {
  schemaVersion: 1;
  audience: "RELEASED_HEADTEACHER_STAFF_FEEDBACK";
  lifecycleState: "RELEASED";
  cycle: {
    id: string;
    schoolName: string;
    circuitName: string | null;
    headteacherName: string;
    closedAt: string;
    releasedAt: string;
  };
  release: {
    reviewId: string;
    reviewStage: number;
    releaseMode: "INDEPENDENT_STAFF_FEEDBACK_RELEASE";
    releaseProofHash: string;
    releaseNote: string | null;
    releaseNoteIncluded: boolean;
    integrityVerified: true;
  };
  staffFeedback: {
    overallPercentage: number;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      sectionMaxScore: number;
      averagePercentage: number;
    }>;
  };
  privacy: {
    responseCountsIncluded: false;
    staffItemAveragesIncluded: false;
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    participantListIncluded: false;
    responseHashesIncluded: false;
    reviewerIdentityIncluded: false;
    governanceAssessmentIncluded: false;
  };
  integrity: {
    snapshotSourceHashVerified: true;
    reviewEvidenceHashVerified: true;
    releaseProofHashVerified: true;
    governanceAssessmentRequired: false;
    governanceAssessmentAccessed: false;
    carrierCycleStatusMutationPerformed: false;
    combinedWeightingDefined: false;
    scoreMutationAllowed: false;
  };
};

type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
};

type CycleRecord = {
  id: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  targetNameSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  status: string;
  closedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type SnapshotRecord = {
  id: string;
  cycleId: string;
  version: number;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: unknown;
  itemAveragesJson: unknown;
  sourceHash: string;
  generatedByUserId: string | null;
  generatedAt: Date;
  metadata: unknown;
};

type ReviewRecord = {
  id: string;
  cycleId: string;
  snapshotId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string | null;
  stage: number;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

export type HeadteacherStaffFeedbackReleasedResultDatabase = {
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findUnique(args: unknown): Promise<SnapshotRecord | null>;
  };
  appraisalStaffFeedbackReview: {
    findMany(args: unknown): Promise<ReviewRecord[]>;
  };
};

export type ReadHeadteacherStaffFeedbackReleasedResultInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  cycleId: string;
  database?: HeadteacherStaffFeedbackReleasedResultDatabase;
};

export class HeadteacherStaffFeedbackReleasedResultError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherStaffFeedbackReleasedResultError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  targetNameSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  status: true,
  closedAt: true,
  cancelledAt: true,
  metadata: true,
} as const;

const SNAPSHOT_SELECT = {
  id: true,
  cycleId: true,
  version: true,
  eligibleResponses: true,
  finalizedResponses: true,
  expiredResponses: true,
  minimumResponses: true,
  releaseEligible: true,
  overallPercentage: true,
  sectionAveragesJson: true,
  itemAveragesJson: true,
  sourceHash: true,
  generatedByUserId: true,
  generatedAt: true,
  metadata: true,
} as const;

const REVIEW_SELECT = {
  id: true,
  cycleId: true,
  snapshotId: true,
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
  throw new HeadteacherStaffFeedbackReleasedResultError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function assertMembership(
  cycle: CycleRecord,
  membership: MembershipRecord | null,
  actorUserId: string,
  actorTenantId: string,
) {
  if (
    !membership ||
    cycle.targetUserId !== actorUserId ||
    cycle.targetTenantId !== actorTenantId ||
    membership.userId !== actorUserId ||
    membership.tenantId !== actorTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    membership.tenant.id !== actorTenantId ||
    normalized(membership.tenant.status) !== "ACTIVE"
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_TARGET_FORBIDDEN", 403);
  }
}

function snapshotSections(snapshot: SnapshotRecord) {
  const metadata = objectValue(snapshot.metadata);
  const privacy = objectValue(metadata.privacy);
  const sourceIntegrity = objectValue(metadata.sourceIntegrity);

  if (
    snapshot.version !== 1 ||
    snapshot.releaseEligible !== true ||
    snapshot.minimumResponses !== 1 ||
    snapshot.eligibleResponses < 1 ||
    snapshot.finalizedResponses < 1 ||
    snapshot.finalizedResponses > snapshot.eligibleResponses ||
    typeof snapshot.overallPercentage !== "number" ||
    snapshot.overallPercentage < 0 ||
    snapshot.overallPercentage > 100 ||
    !isSha256(snapshot.sourceHash) ||
    snapshot.generatedByUserId !== null ||
    Number.isNaN(snapshot.generatedAt.getTime()) ||
    clean(metadata.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    Number(metadata.aggregateSchemaVersion) !== 1 ||
    normalized(metadata.readiness) !== "READY" ||
    privacy.respondentIdentitiesIncluded !== false ||
    privacy.individualScoresIncluded !== false ||
    privacy.responseHashesIncluded !== false ||
    privacy.submissionTimestampsIncluded !== false ||
    privacy.participantListIncluded !== false ||
    sourceIntegrity.finalizedResponsesOnly !== true ||
    sourceIntegrity.finalizedResponseHashesVerified !== true ||
    sourceIntegrity.storedCalculationsRecomputed !== true ||
    Number(sourceIntegrity.immutableSnapshotVersion) !== 1
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_SNAPSHOT_INVALID", 409);
  }

  const sections = Object.values(objectValue(snapshot.sectionAveragesJson))
    .map((value) => objectValue(value))
    .sort((left, right) => Number(left.sectionOrder) - Number(right.sectionOrder));

  if (sections.length !== HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_POLICY.expectedSectionCount) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_SECTION_COUNT_DRIFT", 409, {
      sections: sections.length,
    });
  }

  return sections.map((section) => {
    const sectionKey = clean(section.sectionKey);
    const sectionTitle = clean(section.sectionTitle);
    const sectionOrder = Number(section.sectionOrder);
    const sectionMaxScore = Number(section.sectionMaxScore);
    const averagePercentage = Number(section.averagePercentage);

    if (
      !sectionKey ||
      !sectionTitle ||
      !Number.isInteger(sectionOrder) ||
      sectionOrder < 1 ||
      !Number.isFinite(sectionMaxScore) ||
      sectionMaxScore <= 0 ||
      !Number.isFinite(averagePercentage) ||
      averagePercentage < 0 ||
      averagePercentage > 100
    ) {
      fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_SECTION_DRIFT", 409, {
        sectionKey,
      });
    }

    return {
      sectionKey,
      sectionTitle,
      sectionOrder,
      sectionMaxScore,
      averagePercentage,
    };
  });
}

function reviewEvidenceHash(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const staff = objectValue(metadata.staffFeedback);
  const payload = {
    schemaVersion: Number(metadata.schemaVersion),
    workflow: clean(metadata.workflow),
    evidenceStream: clean(metadata.evidenceStream),
    cycleId: review.cycleId,
    reviewerUserId: review.reviewerUserId,
    reviewerAssignmentId: clean(review.reviewerAssignmentId),
    reviewStage: review.stage,
    staffFeedback: {
      snapshotId: clean(staff.snapshotId),
      snapshotVersion: Number(staff.snapshotVersion),
      sourceHash: clean(staff.sourceHash).toLowerCase(),
      finalizedResponses: Number(staff.finalizedResponses),
      minimumResponses: Number(staff.minimumResponses),
    },
    governanceAssessmentRequired: false,
    governanceAssessmentAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    carrierCycleStatusMutationPerformed: false,
  };
  const expected = hashJson(payload);

  if (
    payload.schemaVersion !== 1 ||
    payload.workflow !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    payload.evidenceStream !== "CONFIDENTIAL_STAFF_FEEDBACK" ||
    payload.staffFeedback.snapshotId !== review.snapshotId ||
    payload.staffFeedback.snapshotVersion !== 1 ||
    payload.staffFeedback.finalizedResponses < 1 ||
    payload.staffFeedback.minimumResponses !== 1 ||
    !isSha256(payload.staffFeedback.sourceHash) ||
    !payload.reviewerAssignmentId ||
    metadata.governanceAssessmentRequired !== false ||
    metadata.governanceAssessmentAccessed !== false ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.carrierCycleStatusMutationPerformed !== false ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !== expected
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_REVIEW_EVIDENCE_DRIFT", 409);
  }

  return {
    reviewEvidenceHash: expected,
    snapshotId: payload.staffFeedback.snapshotId,
    staffSourceHash: payload.staffFeedback.sourceHash,
  };
}

function verifyRelease(input: {
  cycle: CycleRecord;
  snapshot: SnapshotRecord;
  review: ReviewRecord;
}) {
  const anchors = reviewEvidenceHash(input.review);
  const release = objectValue(objectValue(input.review.metadata).staffFeedbackRelease);
  const proofWithoutHash = { ...release };
  delete proofWithoutHash.releaseProofHash;
  const releaseProofHash = clean(release.releaseProofHash).toLowerCase();
  const releasedAt = clean(release.releasedAt);
  const releasedAtDate = new Date(releasedAt);

  if (
    normalized(input.review.decision) !== "ACCEPTED" ||
    !input.review.decidedAt ||
    input.review.cycleId !== input.cycle.id ||
    input.review.snapshotId !== input.snapshot.id ||
    anchors.snapshotId !== input.snapshot.id ||
    anchors.staffSourceHash !== input.snapshot.sourceHash.toLowerCase() ||
    clean(release.releaseMode) !== "INDEPENDENT_STAFF_FEEDBACK_RELEASE" ||
    clean(release.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    clean(release.evidenceStream) !== "CONFIDENTIAL_STAFF_FEEDBACK" ||
    clean(release.cycleId) !== input.cycle.id ||
    clean(release.reviewId) !== input.review.id ||
    Number(release.reviewStage) !== input.review.stage ||
    clean(release.reviewDecision) !== "ACCEPTED" ||
    clean(release.snapshotId) !== input.snapshot.id ||
    clean(release.staffSourceHash).toLowerCase() !== input.snapshot.sourceHash.toLowerCase() ||
    clean(release.reviewEvidenceHash).toLowerCase() !== anchors.reviewEvidenceHash ||
    !isSha256(release.decisionRequestHash) ||
    !isSha256(releaseProofHash) ||
    Number.isNaN(releasedAtDate.getTime()) ||
    releasedAtDate.toISOString() !== releasedAt ||
    input.review.decidedAt.toISOString() !== releasedAt ||
    release.carrierCycleStatusMutationPerformed !== false ||
    release.governanceAssessmentRequired !== false ||
    release.governanceAssessmentAccessed !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.combinedWeightingDefined !== false ||
    release.providerCalled !== false ||
    hashJson(proofWithoutHash) !== releaseProofHash
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_RELEASE_PROOF_DRIFT", 409);
  }

  return { release, releaseProofHash, releasedAt };
}

function assertReviewChain(reviews: ReviewRecord[]) {
  if (reviews.length === 0) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_RELEASE_NOT_FOUND", 404);
  }

  reviews.forEach((review, index) => {
    const expectedStage = index + 1;
    if (review.stage !== expectedStage) {
      fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_REVIEW_CHAIN_DRIFT", 409, {
        reviewStage: review.stage,
      });
    }
  });

  const accepted = reviews.filter((review) => normalized(review.decision) === "ACCEPTED");
  if (accepted.length !== 1 || reviews.at(-1)?.id !== accepted[0].id) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_ACCEPTED_REVIEW_DRIFT", 409);
  }

  return accepted[0];
}

export async function readHeadteacherStaffFeedbackReleasedResult(
  input: ReadHeadteacherStaffFeedbackReleasedResultInput,
): Promise<HeadteacherStaffFeedbackReleasedResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_POLICY.requiredRole) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherStaffFeedbackReleasedResultDatabase);

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_CYCLE_NOT_FOUND", 404);
  }

  if (
    cycle.cancelledAt ||
    !cycle.closedAt ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    clean(objectValue(cycle.metadata).workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_CYCLE_INVALID", 409);
  }

  const membership = await database.membership.findFirst({
    where: {
      userId: actorUserId,
      tenantId: actorTenantId,
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
      tenant: { select: { id: true, status: true } },
    },
  });
  assertMembership(cycle, membership, actorUserId, actorTenantId);

  const reviews = await database.appraisalStaffFeedbackReview.findMany({
    where: { cycleId },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    select: REVIEW_SELECT,
  });
  const acceptedReview = assertReviewChain(reviews);

  const snapshot = await database.appraisalAggregateSnapshot.findUnique({
    where: { id: acceptedReview.snapshotId },
    select: SNAPSHOT_SELECT,
  });
  if (!snapshot || snapshot.cycleId !== cycleId) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_SNAPSHOT_NOT_FOUND", 404);
  }

  const sections = snapshotSections(snapshot);
  const verifiedRelease = verifyRelease({ cycle, snapshot, review: acceptedReview });
  const schoolName = clean(cycle.targetSchoolNameSnapshot);
  const headteacherName = clean(cycle.targetNameSnapshot);
  if (!schoolName || !headteacherName) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_CYCLE_SNAPSHOT_INCOMPLETE", 409);
  }

  return {
    schemaVersion: 1,
    audience: "RELEASED_HEADTEACHER_STAFF_FEEDBACK",
    lifecycleState: "RELEASED",
    cycle: {
      id: cycle.id,
      schoolName,
      circuitName: clean(cycle.targetZoneNameSnapshot) || null,
      headteacherName,
      closedAt: cycle.closedAt.toISOString(),
      releasedAt: verifiedRelease.releasedAt,
    },
    release: {
      reviewId: acceptedReview.id,
      reviewStage: acceptedReview.stage,
      releaseMode: "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
      releaseProofHash: verifiedRelease.releaseProofHash,
      releaseNote: clean(acceptedReview.note) || null,
      releaseNoteIncluded: Boolean(clean(acceptedReview.note)),
      integrityVerified: true,
    },
    staffFeedback: {
      overallPercentage: snapshot.overallPercentage!,
      sections,
    },
    privacy: {
      responseCountsIncluded: false,
      staffItemAveragesIncluded: false,
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      participantListIncluded: false,
      responseHashesIncluded: false,
      reviewerIdentityIncluded: false,
      governanceAssessmentIncluded: false,
    },
    integrity: {
      snapshotSourceHashVerified: true,
      reviewEvidenceHashVerified: true,
      releaseProofHashVerified: true,
      governanceAssessmentRequired: false,
      governanceAssessmentAccessed: false,
      carrierCycleStatusMutationPerformed: false,
      combinedWeightingDefined: false,
      scoreMutationAllowed: false,
    },
  };
}
