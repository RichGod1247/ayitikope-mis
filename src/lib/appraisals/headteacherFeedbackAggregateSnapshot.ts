import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  calculateHeadteacherFeedbackAggregate,
  type HeadteacherFeedbackAggregateReadiness,
  type HeadteacherFeedbackAggregateSnapshotContract,
} from "@/lib/appraisals/headteacherFeedbackAggregateContract";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import { prisma } from "@/lib/prisma";

export const HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY = {
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
  instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
  snapshotVersion: 1,
  minimumFinalizedResponses:
    HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
  cycleStatusRequired: "CLOSED",
  targetRoleRequired: "HEADTEACHER",
  generatedBy: "SYSTEM_AGGREGATE_WORKER",
  transactionIsolation: "Serializable",
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 20_000,
  startsReview: false,
  changesCycleStatus: false,
  seedsNotifications: false,
  callsProviders: false,
} as const;

type JsonRecord = Record<string, unknown>;

type AggregateScoreRecord = {
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

type AggregateResponseRecord = {
  status: string;
  responseHash: string | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  scores: AggregateScoreRecord[];
};

type AggregateParticipantRecord = {
  status: string;
  response: AggregateResponseRecord | null;
};

type AggregateCycleRecord = {
  id: string;
  status: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  minimumResponses: number;
  metadata: unknown;
  instrumentVersion: {
    version: number;
    contentHash: string | null;
    instrument: {
      code: string;
    };
  };
  participants: AggregateParticipantRecord[];
};

type AggregateSnapshotRecord = {
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
  metadata: unknown;
};

type AggregateSnapshotCreateRecord = {
  id: string;
  version: number;
  sourceHash: string;
  releaseEligible: boolean;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  overallPercentage: number | null;
};

export type HeadteacherFeedbackAggregateSnapshotTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<AggregateCycleRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findFirst(args: unknown): Promise<AggregateSnapshotRecord | null>;
    create(args: unknown): Promise<AggregateSnapshotCreateRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherFeedbackAggregateSnapshotDatabase = {
  appraisalCycle: HeadteacherFeedbackAggregateSnapshotTransactionClient["appraisalCycle"];
  appraisalAggregateSnapshot: HeadteacherFeedbackAggregateSnapshotTransactionClient["appraisalAggregateSnapshot"];
  $transaction<T>(
    operation: (
      tx: HeadteacherFeedbackAggregateSnapshotTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type SealHeadteacherFeedbackAggregateSnapshotInput = {
  cycleId: string;
  reqId?: string | null;
  now?: Date;
  database?: HeadteacherFeedbackAggregateSnapshotDatabase;
};

export type HeadteacherFeedbackAggregateSnapshotSummary = {
  id: string;
  cycleId: string;
  version: 1;
  sourceHash: string;
  releaseEligible: true;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: 1;
  overallPercentage: number;
};

export type SealHeadteacherFeedbackAggregateSnapshotResult =
  | {
      outcome: "CREATED" | "EXISTING_MATCH";
      snapshot: HeadteacherFeedbackAggregateSnapshotSummary;
    }
  | {
      outcome: "INSUFFICIENT_RESPONSES";
      snapshot: null;
      cycleId: string;
      eligibleResponses: number;
      finalizedResponses: number;
      expiredResponses: number;
      revokedResponses: number;
      minimumResponses: 1;
    };

export class HeadteacherFeedbackAggregateSnapshotError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "HeadteacherFeedbackAggregateSnapshotError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const AGGREGATE_CYCLE_SELECT = {
  id: true,
  status: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  minimumResponses: true,
  metadata: true,
  instrumentVersion: {
    select: {
      version: true,
      contentHash: true,
      instrument: {
        select: {
          code: true,
        },
      },
    },
  },
  participants: {
    orderBy: { id: "asc" },
    select: {
      status: true,
      response: {
        select: {
          status: true,
          responseHash: true,
          overallPercentage: true,
          sectionPercentagesJson: true,
          generalComment: true,
          scores: {
            orderBy: [
              { sectionOrder: "asc" },
              { itemOrder: "asc" },
            ],
            select: {
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
        },
      },
    },
  },
} as const;

const AGGREGATE_SNAPSHOT_SELECT = {
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
  metadata: true,
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function jsonEqual(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function closeEnough(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= 0.01;
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherFeedbackAggregateSnapshotError(code, status, details);
}

function requireCycleId(value: unknown) {
  const cycleId = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(cycleId)) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_CYCLE_ID_INVALID", 400);
  }
  return cycleId;
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002") ||
    objectValue(error).code === "P2002"
  );
}

function workflowFromCycle(cycle: AggregateCycleRecord) {
  return clean(objectValue(cycle.metadata).workflow);
}

function assertAggregateCycleScope(cycle: AggregateCycleRecord) {
  if (
    clean(cycle.targetRoleSnapshot).toUpperCase() !==
    HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.targetRoleRequired
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_TARGET_INVALID", 409);
  }

  if (!clean(cycle.targetTenantId)) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_TENANT_SCOPE_MISSING", 409);
  }
}

function calculateCycleReadiness(
  cycle: AggregateCycleRecord,
): HeadteacherFeedbackAggregateReadiness {
  assertAggregateCycleScope(cycle);

  const result = calculateHeadteacherFeedbackAggregate({
    cycleId: cycle.id,
    cycleStatus: cycle.status,
    workflow: workflowFromCycle(cycle),
    instrumentCode: cycle.instrumentVersion.instrument.code,
    instrumentVersion: cycle.instrumentVersion.version,
    instrumentDefinitionHash: cycle.instrumentVersion.contentHash ?? "",
    minimumResponses: cycle.minimumResponses,
    participants: cycle.participants.map((participant) => ({
      status: participant.status,
      response: participant.response
        ? {
            status: participant.response.status,
            responseHash: participant.response.responseHash,
            overallPercentage: participant.response.overallPercentage,
            sectionPercentages:
              participant.response.sectionPercentagesJson,
            generalComment: participant.response.generalComment,
            scores: participant.response.scores,
          }
        : null,
    })),
  });

  if (!result.ok) {
    fail(`HEADTEACHER_FEEDBACK_AGGREGATE_CONTRACT_${result.code}`, 409, {
      contractCode: result.code,
      ...(result.details ?? {}),
    });
  }

  return result.value;
}

function snapshotMetadata(
  snapshot: HeadteacherFeedbackAggregateSnapshotContract,
): Prisma.InputJsonObject {
  return {
    workflow: snapshot.workflow,
    aggregateSchemaVersion: snapshot.schemaVersion,
    instrumentCode: snapshot.instrumentCode,
    instrumentVersion: snapshot.instrumentVersion,
    instrumentDefinitionHash: snapshot.instrumentDefinitionHash,
    readiness: "READY",
    revokedResponses: snapshot.revokedResponses,
    reviewStarted: false,
    privacy: {
      respondentIdentitiesIncluded: false,
      individualScoresIncluded: false,
      responseHashesIncluded: false,
      submissionTimestampsIncluded: false,
      participantListIncluded: false,
    },
    sourceIntegrity: {
      generatedBy: HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.generatedBy,
      sourceHashAlgorithm: "SHA-256",
      finalizedResponsesOnly: true,
      finalizedResponseHashesVerified: true,
      storedCalculationsRecomputed: true,
      immutableSnapshotVersion: 1,
    },
  } as Prisma.InputJsonObject;
}

function expectedStoredValues(
  snapshot: HeadteacherFeedbackAggregateSnapshotContract,
) {
  return {
    version: HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.snapshotVersion,
    eligibleResponses: snapshot.eligibleResponses,
    finalizedResponses: snapshot.finalizedResponses,
    expiredResponses: snapshot.expiredResponses,
    minimumResponses: snapshot.minimumResponses,
    releaseEligible: snapshot.releaseEligible,
    overallPercentage: snapshot.overallPercentage,
    sectionAveragesJson:
      snapshot.sectionEvidence as unknown as Prisma.InputJsonObject,
    itemAveragesJson:
      snapshot.itemEvidence as unknown as Prisma.InputJsonObject,
    sourceHash: snapshot.sourceHash,
    generatedByUserId: null,
    metadata: snapshotMetadata(snapshot),
  };
}

function assertExistingSnapshotMatches(
  existing: AggregateSnapshotRecord,
  expected: HeadteacherFeedbackAggregateSnapshotContract,
) {
  const values = expectedStoredValues(expected);

  const matches =
    existing.cycleId === expected.cycleId &&
    existing.version === values.version &&
    existing.eligibleResponses === values.eligibleResponses &&
    existing.finalizedResponses === values.finalizedResponses &&
    existing.expiredResponses === values.expiredResponses &&
    existing.minimumResponses === values.minimumResponses &&
    existing.releaseEligible === values.releaseEligible &&
    closeEnough(existing.overallPercentage, values.overallPercentage) &&
    existing.sourceHash === values.sourceHash &&
    existing.generatedByUserId === null &&
    jsonEqual(existing.sectionAveragesJson, values.sectionAveragesJson) &&
    jsonEqual(existing.itemAveragesJson, values.itemAveragesJson) &&
    jsonEqual(existing.metadata, values.metadata);

  if (!matches) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_DRIFT", 409, {
      cycleId: expected.cycleId,
      existingVersion: existing.version,
      existingSourceHash: existing.sourceHash,
      expectedSourceHash: expected.sourceHash,
    });
  }
}

function summary(
  record: AggregateSnapshotCreateRecord | AggregateSnapshotRecord,
): HeadteacherFeedbackAggregateSnapshotSummary {
  if (
    record.version !== 1 ||
    record.releaseEligible !== true ||
    record.minimumResponses !== 1 ||
    typeof record.overallPercentage !== "number"
  ) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_RECORD_INVALID", 409);
  }

  return {
    id: record.id,
    cycleId:
      "cycleId" in record ? record.cycleId : "",
    version: 1,
    sourceHash: record.sourceHash,
    releaseEligible: true,
    eligibleResponses: record.eligibleResponses,
    finalizedResponses: record.finalizedResponses,
    expiredResponses: record.expiredResponses,
    minimumResponses: 1,
    overallPercentage: record.overallPercentage,
  };
}

function createdSummary(
  cycleId: string,
  record: AggregateSnapshotCreateRecord,
): HeadteacherFeedbackAggregateSnapshotSummary {
  return {
    ...summary({ ...record, cycleId } as AggregateSnapshotRecord),
    cycleId,
  };
}

async function findCycle(
  client: Pick<HeadteacherFeedbackAggregateSnapshotDatabase, "appraisalCycle">,
  cycleId: string,
) {
  return client.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: AGGREGATE_CYCLE_SELECT,
  });
}

async function findLatestSnapshot(
  client: Pick<
    HeadteacherFeedbackAggregateSnapshotDatabase,
    "appraisalAggregateSnapshot"
  >,
  cycleId: string,
) {
  return client.appraisalAggregateSnapshot.findFirst({
    where: { cycleId },
    orderBy: { version: "desc" },
    select: AGGREGATE_SNAPSHOT_SELECT,
  });
}

async function recoverConcurrentSnapshot(input: {
  database: HeadteacherFeedbackAggregateSnapshotDatabase;
  cycleId: string;
}) {
  const cycle = await findCycle(input.database, input.cycleId);
  if (!cycle) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_CYCLE_NOT_FOUND", 404);
  }

  const readiness = calculateCycleReadiness(cycle);
  if (readiness.readiness !== "READY" || !readiness.snapshot) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_CONCURRENT_WRITE_INVALID", 409);
  }

  const existing = await findLatestSnapshot(input.database, input.cycleId);
  if (!existing) {
    fail("HEADTEACHER_FEEDBACK_AGGREGATE_CONCURRENT_WRITE_MISSING", 409);
  }

  assertExistingSnapshotMatches(existing, readiness.snapshot);

  return {
    outcome: "EXISTING_MATCH" as const,
    snapshot: summary(existing),
  };
}

export async function sealHeadteacherFeedbackAggregateSnapshot(
  input: SealHeadteacherFeedbackAggregateSnapshotInput,
): Promise<SealHeadteacherFeedbackAggregateSnapshotResult> {
  const cycleId = requireCycleId(input.cycleId);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackAggregateSnapshotDatabase);

  try {
    return await database.$transaction(
      async (
        tx: HeadteacherFeedbackAggregateSnapshotTransactionClient,
      ) => {
        const cycle = await findCycle(tx, cycleId);
        if (!cycle) {
          fail("HEADTEACHER_FEEDBACK_AGGREGATE_CYCLE_NOT_FOUND", 404);
        }

        const readiness = calculateCycleReadiness(cycle);
        const existing = await findLatestSnapshot(tx, cycleId);

        if (
          readiness.readiness === "INSUFFICIENT_RESPONSES" ||
          !readiness.snapshot
        ) {
          if (existing) {
            fail(
              "HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_PRESENT_WITH_INSUFFICIENT_RESPONSES",
              409,
              { cycleId },
            );
          }

          return {
            outcome: "INSUFFICIENT_RESPONSES" as const,
            snapshot: null,
            cycleId,
            eligibleResponses: readiness.eligibleResponses,
            finalizedResponses: readiness.finalizedResponses,
            expiredResponses: readiness.expiredResponses,
            revokedResponses: readiness.revokedResponses,
            minimumResponses: 1 as const,
          };
        }

        if (existing) {
          assertExistingSnapshotMatches(existing, readiness.snapshot);
          return {
            outcome: "EXISTING_MATCH" as const,
            snapshot: summary(existing),
          };
        }

        const expected = expectedStoredValues(readiness.snapshot);
        const created = await tx.appraisalAggregateSnapshot.create({
          data: {
            cycleId,
            version: expected.version,
            eligibleResponses: expected.eligibleResponses,
            finalizedResponses: expected.finalizedResponses,
            expiredResponses: expected.expiredResponses,
            minimumResponses: expected.minimumResponses,
            releaseEligible: expected.releaseEligible,
            overallPercentage: expected.overallPercentage,
            sectionAveragesJson: expected.sectionAveragesJson,
            itemAveragesJson: expected.itemAveragesJson,
            sourceHash: expected.sourceHash,
            generatedByUserId: null,
            generatedAt: now,
            metadata: expected.metadata,
          },
          select: {
            id: true,
            version: true,
            sourceHash: true,
            releaseEligible: true,
            eligibleResponses: true,
            finalizedResponses: true,
            expiredResponses: true,
            minimumResponses: true,
            overallPercentage: true,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: cycle.targetTenantId,
            userId: null,
            action: APPRAISAL_AUDIT_ACTIONS.AGGREGATE_GENERATED,
            resource: "AppraisalAggregateSnapshot",
            resourceId: created.id,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.AGGREGATE_GENERATED,
              actorRole: "SYSTEM",
              actor:
                HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.generatedBy,
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              cycleId,
              aggregateVersion: 1,
              sourceHash: created.sourceHash,
              eligibleResponses: created.eligibleResponses,
              finalizedResponses: created.finalizedResponses,
              expiredResponses: created.expiredResponses,
              minimumResponses: created.minimumResponses,
              releaseEligible: created.releaseEligible,
              overallPercentageIncluded: false,
              sectionValuesIncluded: false,
              itemValuesIncluded: false,
              respondentIdentitiesIncluded: false,
              participantListIncluded: false,
              individualScoresIncluded: false,
              responseHashesIncluded: false,
              reviewStarted: false,
              notificationsSeeded: false,
            },
          },
        });

        return {
          outcome: "CREATED" as const,
          snapshot: createdSummary(cycleId, created),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait:
          HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.transactionMaxWaitMs,
        timeout:
          HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.transactionTimeoutMs,
      },
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return recoverConcurrentSnapshot({ database, cycleId });
  }
}
