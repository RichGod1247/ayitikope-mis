import { prisma } from "@/lib/prisma";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackApprovalAuthority,
  assertHeadteacherFeedbackInstrumentReady,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY = {
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
  instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
  snapshotVersion: 1,
  minimumFinalizedResponses: 1,
  readOnly: true,
  startsReview: false,
  changesCycleStatus: false,
  exposesScores: false,
  exposesRespondentIdentities: false,
  exposesParticipantList: false,
} as const;

export const HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_LABELS = {
  COLLECTION_NOT_CLOSED: "Feedback collection not closed",
  INSUFFICIENT_RESPONSES: "Responses closed — insufficient finalized feedback",
  SNAPSHOT_PENDING: "Responses closed — preparing review evidence",
  READY_FOR_REVIEW: "Evidence ready for Director review",
  UNDER_REVIEW: "Director reviewing appraisal",
  RELEASED: "Released appraisal available",
  CANCELLED: "Appraisal cycle closed",
} as const;

export type HeadteacherFeedbackAggregateReadinessCode =
  keyof typeof HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_LABELS;

type CycleRecord = {
  id: string;
  status: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  minimumResponses: number;
  metadata: unknown;
  instrumentVersion: {
    version: number;
    contentHash: string | null;
    instrument: { code: string };
  };
  participants: Array<{ status: string }>;
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
  sourceHash: string;
  generatedByUserId: string | null;
  generatedAt: Date;
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

export type HeadteacherFeedbackAggregateReadinessDatabase = {
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findMany(args: unknown): Promise<SnapshotRecord[]>;
  };
};

export type ReadHeadteacherFeedbackAggregateReadinessInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  tenantId?: string | null;
  governanceScope?: HeadteacherFeedbackGovernanceScope;
  database?: HeadteacherFeedbackAggregateReadinessDatabase;
};

export type HeadteacherAggregateReadinessView = {
  audience: "HEADTEACHER";
  cycleId: string;
  cycleStatus: string;
  state: HeadteacherFeedbackAggregateReadinessCode;
  label: string;
  canViewReleasedAppraisal: boolean;
  canBeginReview: false;
  responseCountsVisible: false;
  snapshotDetailsVisible: false;
};

export type DirectorAggregateReadinessView = {
  audience: "DIRECTOR";
  cycleId: string;
  cycleStatus: string;
  state: HeadteacherFeedbackAggregateReadinessCode;
  label: string;
  canBeginReview: boolean;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  revokedResponses: number;
  minimumResponses: 1;
  snapshotId: string | null;
  snapshotVersion: 1 | null;
  snapshotSourceHash: string | null;
  snapshotGeneratedAt: string | null;
  aggregateScoresIncluded: false;
  respondentIdentitiesIncluded: false;
  participantListIncluded: false;
};

export type HeadteacherFeedbackAggregateReadinessView =
  | HeadteacherAggregateReadinessView
  | DirectorAggregateReadinessView;

export class HeadteacherFeedbackAggregateReadinessError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherFeedbackAggregateReadinessError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  minimumResponses: true,
  metadata: true,
  instrumentVersion: {
    select: {
      version: true,
      contentHash: true,
      instrument: { select: { code: true } },
    },
  },
  participants: { select: { status: true } },
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
  sourceHash: true,
  generatedByUserId: true,
  generatedAt: true,
  metadata: true,
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function fail(code: string, status: number, details?: Record<string, unknown>): never {
  throw new HeadteacherFeedbackAggregateReadinessError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_IDENTIFIER_INVALID", 400, {
      fieldName,
    });
  }
  return id;
}

function workflowFromCycle(cycle: CycleRecord) {
  return clean(objectValue(cycle.metadata).workflow);
}

function participantCounts(cycle: CycleRecord) {
  return {
    eligibleResponses: cycle.participants.length,
    finalizedResponses: cycle.participants.filter(
      (participant) => participant.status === "FINALIZED",
    ).length,
    expiredResponses: cycle.participants.filter(
      (participant) => participant.status === "EXPIRED",
    ).length,
    revokedResponses: cycle.participants.filter(
      (participant) => participant.status === "REVOKED",
    ).length,
  };
}

function assertCycleContract(cycle: CycleRecord) {
  if (
    clean(cycle.targetRoleSnapshot).toUpperCase() !==
      HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    workflowFromCycle(cycle) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    clean(cycle.instrumentVersion.instrument.code) !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.minimumResponses !== 1 ||
    !clean(cycle.targetTenantId)
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
}

function assertSnapshotPrivacy(metadata: unknown) {
  const root = objectValue(metadata);
  const privacy = objectValue(root.privacy);
  const integrity = objectValue(root.sourceIntegrity);

  if (
    clean(root.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    Number(root.aggregateSchemaVersion) !== 1 ||
    clean(root.instrumentCode) !== HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    Number(root.instrumentVersion) !== 1 ||
    clean(root.readiness) !== "READY" ||
    privacy.respondentIdentitiesIncluded !== false ||
    privacy.individualScoresIncluded !== false ||
    privacy.responseHashesIncluded !== false ||
    privacy.submissionTimestampsIncluded !== false ||
    privacy.participantListIncluded !== false ||
    clean(integrity.sourceHashAlgorithm) !== "SHA-256" ||
    integrity.finalizedResponsesOnly !== true ||
    integrity.immutableSnapshotVersion !== 1
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_SNAPSHOT_PRIVACY_INVALID", 409);
  }
}

function assertSnapshotMatchesCycle(
  cycle: CycleRecord,
  snapshot: SnapshotRecord,
  counts: ReturnType<typeof participantCounts>,
) {
  if (
    snapshot.cycleId !== cycle.id ||
    snapshot.version !== 1 ||
    snapshot.eligibleResponses !== counts.eligibleResponses ||
    snapshot.finalizedResponses !== counts.finalizedResponses ||
    snapshot.expiredResponses !== counts.expiredResponses ||
    snapshot.minimumResponses !== 1 ||
    snapshot.releaseEligible !== true ||
    typeof snapshot.overallPercentage !== "number" ||
    snapshot.overallPercentage < 0 ||
    snapshot.overallPercentage > 100 ||
    !/^[a-f0-9]{64}$/.test(clean(snapshot.sourceHash).toLowerCase()) ||
    snapshot.generatedByUserId !== null ||
    Number.isNaN(snapshot.generatedAt.getTime())
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_SNAPSHOT_DRIFT", 409, {
      cycleId: cycle.id,
      snapshotId: snapshot.id,
    });
  }

  assertSnapshotPrivacy(snapshot.metadata);
}

function readinessCode(input: {
  cycle: CycleRecord;
  snapshot: SnapshotRecord | null;
  finalizedResponses: number;
}): HeadteacherFeedbackAggregateReadinessCode {
  switch (input.cycle.status) {
    case "DRAFT":
    case "PENDING_APPROVAL":
    case "OPEN":
      if (input.snapshot) {
        fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_PREMATURE_SNAPSHOT", 409);
      }
      return "COLLECTION_NOT_CLOSED";
    case "CLOSED":
      if (input.finalizedResponses < 1) {
        if (input.snapshot) {
          fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_INSUFFICIENT_WITH_SNAPSHOT", 409);
        }
        return "INSUFFICIENT_RESPONSES";
      }
      return input.snapshot ? "READY_FOR_REVIEW" : "SNAPSHOT_PENDING";
    case "UNDER_REVIEW":
      if (!input.snapshot) {
        fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_REVIEW_WITHOUT_SNAPSHOT", 409);
      }
      return "UNDER_REVIEW";
    case "RELEASED":
      if (!input.snapshot) {
        fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_RELEASE_WITHOUT_SNAPSHOT", 409);
      }
      return "RELEASED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_CYCLE_STATUS_INVALID", 409, {
        cycleStatus: input.cycle.status,
      });
  }
}

async function assertHeadteacherMembership(input: {
  database: HeadteacherFeedbackAggregateReadinessDatabase;
  actorUserId: string;
  tenantId: string;
}) {
  const membership = await input.database.membership.findFirst({
    where: {
      userId: input.actorUserId,
      tenantId: input.tenantId,
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

  if (!membership) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_ACTIVE_MEMBERSHIP_REQUIRED", 403);
  }

  assertActiveHeadteacherFeedbackTarget({
    target: {
      membershipId: membership.id,
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipStatus: membership.status,
      roleName: membership.role.name,
      tenantStatus: membership.tenant.status,
    },
    expectedUserId: input.actorUserId,
    expectedTenantId: input.tenantId,
  });
}

export function buildHeadteacherAggregateReadinessView(input: {
  cycle: CycleRecord;
  state: HeadteacherFeedbackAggregateReadinessCode;
}): HeadteacherAggregateReadinessView {
  return {
    audience: "HEADTEACHER",
    cycleId: input.cycle.id,
    cycleStatus: input.cycle.status,
    state: input.state,
    label: HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_LABELS[input.state],
    canViewReleasedAppraisal: input.state === "RELEASED",
    canBeginReview: false,
    responseCountsVisible: false,
    snapshotDetailsVisible: false,
  };
}

export function buildDirectorAggregateReadinessView(input: {
  cycle: CycleRecord;
  state: HeadteacherFeedbackAggregateReadinessCode;
  snapshot: SnapshotRecord | null;
  counts: ReturnType<typeof participantCounts>;
}): DirectorAggregateReadinessView {
  return {
    audience: "DIRECTOR",
    cycleId: input.cycle.id,
    cycleStatus: input.cycle.status,
    state: input.state,
    label: HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_LABELS[input.state],
    canBeginReview:
      input.state === "READY_FOR_REVIEW" && input.cycle.status === "CLOSED",
    ...input.counts,
    minimumResponses: 1,
    snapshotId: input.snapshot?.id ?? null,
    snapshotVersion: input.snapshot ? 1 : null,
    snapshotSourceHash: input.snapshot?.sourceHash ?? null,
    snapshotGeneratedAt: input.snapshot?.generatedAt.toISOString() ?? null,
    aggregateScoresIncluded: false,
    respondentIdentitiesIncluded: false,
    participantListIncluded: false,
  };
}

export async function readHeadteacherFeedbackAggregateReadiness(
  input: ReadHeadteacherFeedbackAggregateReadinessInput,
): Promise<HeadteacherFeedbackAggregateReadinessView> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackAggregateReadinessDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (
    actorRole !== "HEADTEACHER" &&
    actorRole !== "DISTRICT_DIRECTOR" &&
    actorRole !== "SUPERADMIN"
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  assertHeadteacherFeedbackInstrumentReady();

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_CYCLE_NOT_FOUND", 404);
  }

  assertCycleContract(cycle);
  const targetTenantId = requireIdentifier(cycle.targetTenantId, "targetTenantId");

  if (actorRole === "HEADTEACHER") {
    const tenantId = requireIdentifier(input.tenantId, "tenantId");
    if (cycle.targetUserId !== actorUserId || targetTenantId !== tenantId) {
      fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_OWN_CYCLE_ONLY", 403);
    }
    await assertHeadteacherMembership({ database, actorUserId, tenantId });
  } else {
    if (!input.governanceScope) {
      fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_GOVERNANCE_SCOPE_REQUIRED", 400);
    }
    assertHeadteacherFeedbackApprovalAuthority({
      actorUserId,
      actorRoleName: actorRole,
      targetHeadteacherUserId: cycle.targetUserId,
      targetTenantId,
      governanceScope: input.governanceScope,
    });
  }

  const snapshots = await database.appraisalAggregateSnapshot.findMany({
    where: { cycleId },
    orderBy: { version: "desc" },
    take: 2,
    select: SNAPSHOT_SELECT,
  });

  if (snapshots.length > 1) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_READ_MULTIPLE_SNAPSHOTS", 409, {
      cycleId,
    });
  }

  const snapshot = snapshots[0] ?? null;
  const counts = participantCounts(cycle);
  if (snapshot) assertSnapshotMatchesCycle(cycle, snapshot, counts);

  const state = readinessCode({
    cycle,
    snapshot,
    finalizedResponses: counts.finalizedResponses,
  });

  if (actorRole === "HEADTEACHER") {
    return buildHeadteacherAggregateReadinessView({ cycle, state });
  }

  return buildDirectorAggregateReadinessView({ cycle, state, snapshot, counts });
}
