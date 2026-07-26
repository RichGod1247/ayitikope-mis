// src/lib/appraisals/directorFeedbackClosure.ts
import { createHash, randomUUID } from "crypto";
import {
  AppraisalCycleStatus,
  AppraisalParticipantStatus,
  AppraisalResponseStatus,
  Prisma,
} from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  DIRECTOR_FEEDBACK_POLICY,
  directorFeedbackMunicipalReleaseBand,
} from "@/lib/appraisals/directorFeedback";
import {
  assertAppraisalCycleTransition,
  cycleMayGenerateAggregate,
} from "@/lib/appraisals/workflow";
import { prisma } from "@/lib/prisma";

export const DIRECTOR_FEEDBACK_CLOSURE_POLICY = {
  workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
  aggregationSchemaVersion: 1,
  workerLimit: 10,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 20_000,
  closeActor: "SYSTEM_DEADLINE_WORKER",
  municipalMinimum: DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses,
  municipalPreferred: DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses,
  circuitDisclosureThreshold:
    DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
} as const;

type JsonRecord = Record<string, unknown>;

type AggregateScoreSource = {
  instrumentItemId: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  score: number | null;
  notApplicable: boolean;
};

type AggregateResponseSource = {
  id: string;
  status: AppraisalResponseStatus;
  responseHash: string | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  scores: AggregateScoreSource[];
};

export type DirectorFeedbackAggregateParticipantSource = {
  id: string;
  status: AppraisalParticipantStatus;
  eligibilitySnapshotJson: unknown;
  response: AggregateResponseSource | null;
};

export type DirectorFeedbackAggregateSourceCycle = {
  id: string;
  status: AppraisalCycleStatus;
  instrumentVersionId: string;
  minimumResponses: number;
  deadlineAt: Date | null;
  closedAt: Date | null;
  participants: DirectorFeedbackAggregateParticipantSource[];
};

export type DirectorFeedbackAggregateData = {
  sourceHash: string;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: Prisma.InputJsonObject;
  itemAveragesJson: Prisma.InputJsonObject;
  metadata: Prisma.InputJsonObject;
};

export type DirectorFeedbackCloseCycleResult = {
  outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_DUE" | "NOT_OPEN";
  expiredParticipants: number;
  finalizedParticipants: number;
};

export type DirectorFeedbackAggregateResult = {
  outcome: "CREATED" | "EXISTING_MATCH" | "NOT_AGGREGATABLE";
  version: number | null;
  sourceHash: string | null;
  releaseEligible: boolean;
  finalizedResponses: number;
};

export type DirectorFeedbackLifecycleWorkerResult = {
  dueCycles: number;
  closed: number;
  alreadyClosed: number;
  notDue: number;
  closeFailed: number;
  aggregateCandidates: number;
  snapshotsCreated: number;
  snapshotsExisting: number;
  aggregateSkipped: number;
  aggregateFailed: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function average(values: number[]) {
  if (!values.length) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function sourceHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002") ||
    objectValue(error).code === "P2002"
  );
}

function safeErrorCode(error: unknown) {
  const candidate = clean(objectValue(error).code) || clean(objectValue(error).message);
  return /^[A-Z0-9_:-]{3,160}$/.test(candidate)
    ? candidate
    : "DIRECTOR_FEEDBACK_LIFECYCLE_OPERATION_FAILED";
}

function circuitSnapshot(value: unknown) {
  const snapshot = objectValue(value);
  const circuitZoneId = clean(snapshot.circuitZoneId);
  const circuitName = clean(snapshot.circuitName);

  return {
    circuitZoneId: circuitZoneId || null,
    circuitName: circuitName || null,
  };
}

function finalizedParticipants(cycle: DirectorFeedbackAggregateSourceCycle) {
  return cycle.participants.filter((participant) => {
    const response = participant.response;
    return (
      participant.status === AppraisalParticipantStatus.FINALIZED &&
      response !== null &&
      response.status === AppraisalResponseStatus.FINALIZED &&
      Boolean(clean(response.responseHash))
    );
  });
}

function sectionAverages(
  participants: DirectorFeedbackAggregateParticipantSource[],
): Prisma.InputJsonObject {
  const values = new Map<
    string,
    { title: string | null; order: number | null; values: number[] }
  >();

  for (const participant of participants) {
    const response = participant.response;
    if (!response) continue;

    const metadataBySection = new Map<
      string,
      { title: string; order: number }
    >();
    for (const score of response.scores) {
      if (!metadataBySection.has(score.sectionKey)) {
        metadataBySection.set(score.sectionKey, {
          title: score.sectionTitle,
          order: score.sectionOrder,
        });
      }
    }

    for (const [sectionKey, raw] of Object.entries(
      objectValue(response.sectionPercentagesJson),
    )) {
      const percentage = numeric(raw);
      if (percentage == null) continue;

      const metadata = metadataBySection.get(sectionKey);
      const current = values.get(sectionKey) ?? {
        title: metadata?.title ?? null,
        order: metadata?.order ?? null,
        values: [],
      };
      current.values.push(percentage);
      values.set(sectionKey, current);
    }
  }

  return Object.fromEntries(
    [...values.entries()]
      .sort(([, left], [, right]) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) -
          (right.order ?? Number.MAX_SAFE_INTEGER),
      )
      .map(([sectionKey, entry]) => [
        sectionKey,
        {
          sectionKey,
          sectionTitle: entry.title,
          sectionOrder: entry.order,
          averagePercentage: average(entry.values),
          validResponses: entry.values.length,
        },
      ]),
  ) as Prisma.InputJsonObject;
}

function itemAverages(
  participants: DirectorFeedbackAggregateParticipantSource[],
): Prisma.InputJsonObject {
  const values = new Map<
    string,
    {
      instrumentItemId: string;
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      itemKey: string;
      itemLabel: string;
      itemOrder: number;
      itemMaxScore: number;
      scores: number[];
      notApplicableResponses: number;
    }
  >();

  for (const participant of participants) {
    for (const score of participant.response?.scores ?? []) {
      const current = values.get(score.instrumentItemId) ?? {
        instrumentItemId: score.instrumentItemId,
        sectionKey: score.sectionKey,
        sectionTitle: score.sectionTitle,
        sectionOrder: score.sectionOrder,
        itemKey: score.itemKey,
        itemLabel: score.itemLabel,
        itemOrder: score.itemOrder,
        itemMaxScore: score.itemMaxScore,
        scores: [],
        notApplicableResponses: 0,
      };

      if (score.notApplicable) {
        current.notApplicableResponses += 1;
      } else if (score.score != null) {
        current.scores.push(score.score);
      }
      values.set(score.instrumentItemId, current);
    }
  }

  return Object.fromEntries(
    [...values.values()]
      .sort(
        (left, right) =>
          left.sectionOrder - right.sectionOrder ||
          left.itemOrder - right.itemOrder,
      )
      .map((entry) => {
        const averageScore = average(entry.scores);
        return [
          entry.itemKey,
          {
            instrumentItemId: entry.instrumentItemId,
            sectionKey: entry.sectionKey,
            sectionTitle: entry.sectionTitle,
            sectionOrder: entry.sectionOrder,
            itemKey: entry.itemKey,
            itemLabel: entry.itemLabel,
            itemOrder: entry.itemOrder,
            itemMaxScore: entry.itemMaxScore,
            averageScore,
            averagePercentage:
              averageScore == null
                ? null
                : round2((averageScore / entry.itemMaxScore) * 100),
            validResponses: entry.scores.length,
            notApplicableResponses: entry.notApplicableResponses,
          },
        ];
      }),
  ) as Prisma.InputJsonObject;
}

function circuitDisclosure(
  participants: DirectorFeedbackAggregateParticipantSource[],
): Prisma.InputJsonObject {
  const groups = new Map<
    string,
    {
      circuitZoneId: string | null;
      circuitName: string | null;
      participants: DirectorFeedbackAggregateParticipantSource[];
    }
  >();

  for (const participant of participants) {
    const circuit = circuitSnapshot(participant.eligibilitySnapshotJson);
    const key = circuit.circuitZoneId ?? "__MISSING_CIRCUIT__";
    const current = groups.get(key) ?? {
      ...circuit,
      participants: [],
    };
    current.participants.push(participant);
    groups.set(key, current);
  }

  const visibleCircuits: Prisma.InputJsonObject[] = [];
  let hiddenCircuitCount = 0;

  for (const group of groups.values()) {
    if (
      group.participants.length <
        DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold ||
      !group.circuitZoneId ||
      !group.circuitName
    ) {
      hiddenCircuitCount += 1;
      continue;
    }

    visibleCircuits.push({
      circuitZoneId: group.circuitZoneId,
      circuitName: group.circuitName,
      finalizedResponses: group.participants.length,
      overallPercentage: average(
        group.participants
          .map((participant) =>
            numeric(participant.response?.overallPercentage),
          )
          .filter((value): value is number => value != null),
      ),
      sectionAverages: sectionAverages(group.participants),
    });
  }

  visibleCircuits.sort((left, right) =>
    clean(left.circuitName).localeCompare(clean(right.circuitName)),
  );

  return {
    threshold: DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
    visibleCircuits,
    hiddenCircuitCount,
    hiddenCircuitsIncludedInMunicipalAggregate: true,
    exactCountsForHiddenCircuitsIncluded: false,
  };
}

export function buildDirectorFeedbackAggregateData(
  cycle: DirectorFeedbackAggregateSourceCycle,
): DirectorFeedbackAggregateData {
  const eligibleParticipants = cycle.participants.filter(
    (participant) => participant.status !== AppraisalParticipantStatus.REVOKED,
  );
  const finalized = finalizedParticipants(cycle);
  const expiredResponses = cycle.participants.filter(
    (participant) => participant.status === AppraisalParticipantStatus.EXPIRED,
  ).length;
  const minimumResponses = Math.max(
    1,
    cycle.minimumResponses ||
      DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses,
  );
  const releaseEligible = finalized.length >= minimumResponses;
  const municipalBand = directorFeedbackMunicipalReleaseBand(finalized.length);

  const hash = sourceHash({
    aggregationSchemaVersion:
      DIRECTOR_FEEDBACK_CLOSURE_POLICY.aggregationSchemaVersion,
    cycleId: cycle.id,
    instrumentVersionId: cycle.instrumentVersionId,
    minimumResponses,
    participants: cycle.participants
      .map((participant) => {
        const circuit = circuitSnapshot(participant.eligibilitySnapshotJson);
        const response = participant.response;
        return {
          participantId: participant.id,
          status: participant.status,
          circuitZoneId: circuit.circuitZoneId,
          response:
            response !== null &&
            response.status === AppraisalResponseStatus.FINALIZED
              ? {
                  responseId: response.id,
                  responseHash: response.responseHash,
                }
              : null,
        };
      })
      .sort((left, right) =>
        left.participantId.localeCompare(right.participantId),
      ),
  });

  const overallPercentage = releaseEligible
    ? average(
        finalized
          .map((participant) =>
            numeric(participant.response?.overallPercentage),
          )
          .filter((value): value is number => value != null),
      )
    : null;

  return {
    sourceHash: hash,
    eligibleResponses: eligibleParticipants.length,
    finalizedResponses: finalized.length,
    expiredResponses,
    minimumResponses,
    releaseEligible,
    overallPercentage,
    sectionAveragesJson: releaseEligible ? sectionAverages(finalized) : {},
    itemAveragesJson: releaseEligible ? itemAverages(finalized) : {},
    metadata: {
      workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
      aggregationSchemaVersion:
        DIRECTOR_FEEDBACK_CLOSURE_POLICY.aggregationSchemaVersion,
      municipalBand,
      preferredMunicipalResponses:
        DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses,
      circuitDisclosure: releaseEligible
        ? circuitDisclosure(finalized)
        : {
            threshold:
              DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
            visibleCircuits: [],
            hiddenCircuitCount: 0,
            hiddenCircuitsIncludedInMunicipalAggregate: true,
            exactCountsForHiddenCircuitsIncluded: false,
          },
      privacy: {
        respondentNamesIncluded: false,
        schoolNamesIncluded: false,
        contactDetailsIncluded: false,
        submissionTimesIncluded: false,
        responseOrderIncluded: false,
        individualAnswersIncluded: false,
      },
      sourceIntegrity: {
        finalizedResponseHashesRequired: true,
        sourceHashAlgorithm: "SHA-256",
        finalizedResponsesImmutable: true,
      },
    },
  };
}

const AGGREGATE_CYCLE_SELECT = {
  id: true,
  status: true,
  instrumentVersionId: true,
  minimumResponses: true,
  deadlineAt: true,
  closedAt: true,
  participants: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      eligibilitySnapshotJson: true,
      response: {
        select: {
          id: true,
          status: true,
          responseHash: true,
          overallPercentage: true,
          sectionPercentagesJson: true,
          scores: {
            orderBy: [
              { sectionOrder: "asc" },
              { itemOrder: "asc" },
            ],
            select: {
              instrumentItemId: true,
              sectionKey: true,
              sectionTitle: true,
              sectionOrder: true,
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
} as const satisfies Prisma.AppraisalCycleSelect;

export async function closeExpiredDirectorFeedbackCycle(input: {
  cycleId: string;
  now?: Date;
  reqId?: string | null;
}): Promise<DirectorFeedbackCloseCycleResult> {
  const now = input.now ? new Date(input.now) : new Date();
  const reqId = clean(input.reqId) || randomUUID();

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: input.cycleId },
        select: {
          id: true,
          status: true,
          deadlineAt: true,
          closedAt: true,
          targetRoleSnapshot: true,
          instrumentVersion: {
            select: {
              version: true,
              instrument: { select: { code: true } },
            },
          },
          metadata: true,
        },
      });

      if (!cycle) {
        throw Object.assign(new Error("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND"), {
          code: "DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND",
          status: 404,
        });
      }

      if (
        cycle.instrumentVersion.instrument.code !==
          DIRECTOR_FEEDBACK_POLICY.instrumentCode ||
        cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR"
      ) {
        return {
          outcome: "NOT_OPEN" as const,
          expiredParticipants: 0,
          finalizedParticipants: 0,
        };
      }

      if (cycle.status === AppraisalCycleStatus.CLOSED) {
        const finalizedParticipants = await tx.appraisalParticipant.count({
          where: {
            cycleId: cycle.id,
            status: AppraisalParticipantStatus.FINALIZED,
          },
        });
        return {
          outcome: "ALREADY_CLOSED" as const,
          expiredParticipants: 0,
          finalizedParticipants,
        };
      }

      if (cycle.status !== AppraisalCycleStatus.OPEN) {
        return {
          outcome: "NOT_OPEN" as const,
          expiredParticipants: 0,
          finalizedParticipants: 0,
        };
      }

      if (!cycle.deadlineAt || cycle.deadlineAt.getTime() > now.getTime()) {
        return {
          outcome: "NOT_DUE" as const,
          expiredParticipants: 0,
          finalizedParticipants: 0,
        };
      }

      assertAppraisalCycleTransition(
        AppraisalCycleStatus.OPEN,
        AppraisalCycleStatus.CLOSED,
      );

      const claimed = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: AppraisalCycleStatus.OPEN,
          deadlineAt: { lte: now },
        },
        data: {
          status: AppraisalCycleStatus.CLOSED,
          closedAt: now,
          closedByUserId: null,
          metadata: {
            ...objectValue(cycle.metadata),
            deadlineClosure: {
              actor: DIRECTOR_FEEDBACK_CLOSURE_POLICY.closeActor,
              occurredAt: now.toISOString(),
              deadlineAt: cycle.deadlineAt.toISOString(),
              extensionCountPreserved: true,
            },
          },
        },
      });

      if (claimed.count !== 1) {
        return {
          outcome: "ALREADY_CLOSED" as const,
          expiredParticipants: 0,
          finalizedParticipants: 0,
        };
      }

      const expired = await tx.appraisalParticipant.updateMany({
        where: {
          cycleId: cycle.id,
          status: {
            in: [
              AppraisalParticipantStatus.NOT_STARTED,
              AppraisalParticipantStatus.IN_PROGRESS,
            ],
          },
        },
        data: {
          status: AppraisalParticipantStatus.EXPIRED,
          expiredAt: now,
        },
      });

      const finalizedParticipants = await tx.appraisalParticipant.count({
        where: {
          cycleId: cycle.id,
          status: AppraisalParticipantStatus.FINALIZED,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: null,
          action: APPRAISAL_AUDIT_ACTIONS.CYCLE_CLOSED,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          metadata: {
            reqId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_CLOSED,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            cycleId: cycle.id,
            actorRole: "SYSTEM",
            actor: DIRECTOR_FEEDBACK_CLOSURE_POLICY.closeActor,
            priorStatus: AppraisalCycleStatus.OPEN,
            nextStatus: AppraisalCycleStatus.CLOSED,
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            expiredParticipants: expired.count,
            finalizedParticipants,
            respondentIdentityIncluded: false,
            schoolIdentityIncluded: false,
            scoreValuesRecordedInAudit: false,
          },
        },
      });

      return {
        outcome: "CLOSED" as const,
        expiredParticipants: expired.count,
        finalizedParticipants,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: DIRECTOR_FEEDBACK_CLOSURE_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_CLOSURE_POLICY.transactionTimeoutMs,
    },
  );
}

export async function generateDirectorFeedbackAggregateSnapshot(input: {
  cycleId: string;
  now?: Date;
  reqId?: string | null;
}): Promise<DirectorFeedbackAggregateResult> {
  const now = input.now ? new Date(input.now) : new Date();
  const reqId = clean(input.reqId) || randomUUID();

  try {
    return await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const cycle = await tx.appraisalCycle.findUnique({
          where: { id: input.cycleId },
          select: AGGREGATE_CYCLE_SELECT,
        });

        if (!cycle) {
          throw Object.assign(new Error("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND"), {
            code: "DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND",
            status: 404,
          });
        }

        if (!cycleMayGenerateAggregate(cycle.status)) {
          return {
            outcome: "NOT_AGGREGATABLE" as const,
            version: null,
            sourceHash: null,
            releaseEligible: false,
            finalizedResponses: 0,
          };
        }

        const data = buildDirectorFeedbackAggregateData(
          cycle as DirectorFeedbackAggregateSourceCycle,
        );

        const existing = await tx.appraisalAggregateSnapshot.findUnique({
          where: {
            cycleId_sourceHash: {
              cycleId: cycle.id,
              sourceHash: data.sourceHash,
            },
          },
          select: {
            version: true,
            sourceHash: true,
            releaseEligible: true,
            finalizedResponses: true,
          },
        });

        if (existing) {
          return {
            outcome: "EXISTING_MATCH" as const,
            version: existing.version,
            sourceHash: existing.sourceHash,
            releaseEligible: existing.releaseEligible,
            finalizedResponses: existing.finalizedResponses,
          };
        }

        const latest = await tx.appraisalAggregateSnapshot.findFirst({
          where: { cycleId: cycle.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = (latest?.version ?? 0) + 1;

        const created = await tx.appraisalAggregateSnapshot.create({
          data: {
            cycleId: cycle.id,
            version,
            eligibleResponses: data.eligibleResponses,
            finalizedResponses: data.finalizedResponses,
            expiredResponses: data.expiredResponses,
            minimumResponses: data.minimumResponses,
            releaseEligible: data.releaseEligible,
            overallPercentage: data.overallPercentage,
            sectionAveragesJson: data.sectionAveragesJson,
            itemAveragesJson: data.itemAveragesJson,
            sourceHash: data.sourceHash,
            generatedByUserId: null,
            generatedAt: now,
            metadata: data.metadata,
          },
          select: {
            id: true,
            version: true,
            sourceHash: true,
            releaseEligible: true,
            finalizedResponses: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: null,
            action: APPRAISAL_AUDIT_ACTIONS.AGGREGATE_GENERATED,
            resource: "AppraisalAggregateSnapshot",
            resourceId: created.id,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.AGGREGATE_GENERATED,
              workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
              cycleId: cycle.id,
              actorRole: "SYSTEM",
              actor: DIRECTOR_FEEDBACK_CLOSURE_POLICY.closeActor,
              aggregateVersion: version,
              sourceHash: data.sourceHash,
              eligibleResponses: data.eligibleResponses,
              finalizedResponses: data.finalizedResponses,
              expiredResponses: data.expiredResponses,
              releaseEligible: data.releaseEligible,
              respondentIdentityIncluded: false,
              schoolIdentityIncluded: false,
              individualAnswersIncluded: false,
            },
          },
        });

        return {
          outcome: "CREATED" as const,
          version: created.version,
          sourceHash: created.sourceHash,
          releaseEligible: created.releaseEligible,
          finalizedResponses: created.finalizedResponses,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: DIRECTOR_FEEDBACK_CLOSURE_POLICY.transactionMaxWaitMs,
        timeout: DIRECTOR_FEEDBACK_CLOSURE_POLICY.transactionTimeoutMs,
      },
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const cycle = await prisma.appraisalCycle.findUnique({
      where: { id: input.cycleId },
      select: AGGREGATE_CYCLE_SELECT,
    });
    if (!cycle || !cycleMayGenerateAggregate(cycle.status)) throw error;

    const data = buildDirectorFeedbackAggregateData(
      cycle as DirectorFeedbackAggregateSourceCycle,
    );
    const existing = await prisma.appraisalAggregateSnapshot.findUnique({
      where: {
        cycleId_sourceHash: {
          cycleId: cycle.id,
          sourceHash: data.sourceHash,
        },
      },
      select: {
        version: true,
        sourceHash: true,
        releaseEligible: true,
        finalizedResponses: true,
      },
    });

    if (!existing) throw error;
    return {
      outcome: "EXISTING_MATCH",
      version: existing.version,
      sourceHash: existing.sourceHash,
      releaseEligible: existing.releaseEligible,
      finalizedResponses: existing.finalizedResponses,
    };
  }
}

export async function getDirectorFeedbackLifecycleHealth(input?: {
  now?: Date;
}) {
  const now = input?.now ? new Date(input.now) : new Date();

  const [dueOpenCycles, closedWithoutSnapshot] = await Promise.all([
    prisma.appraisalCycle.count({
      where: {
        status: AppraisalCycleStatus.OPEN,
        deadlineAt: { lte: now },
        targetRoleSnapshot: "DISTRICT_DIRECTOR",
        instrumentVersion: {
          instrument: { code: DIRECTOR_FEEDBACK_POLICY.instrumentCode },
        },
      },
    }),
    prisma.appraisalCycle.count({
      where: {
        status: {
          in: [
            AppraisalCycleStatus.CLOSED,
            AppraisalCycleStatus.UNDER_REVIEW,
          ],
        },
        targetRoleSnapshot: "DISTRICT_DIRECTOR",
        instrumentVersion: {
          instrument: { code: DIRECTOR_FEEDBACK_POLICY.instrumentCode },
        },
        aggregates: { none: {} },
      },
    }),
  ]);

  return {
    dueOpenCycles,
    closedWithoutSnapshot,
  };
}

export async function runDirectorFeedbackLifecycleWorker(input?: {
  limit?: number;
  now?: Date;
}): Promise<DirectorFeedbackLifecycleWorkerResult> {
  const now = input?.now ? new Date(input.now) : new Date();
  const limit = Math.max(
    1,
    Math.min(input?.limit ?? DIRECTOR_FEEDBACK_CLOSURE_POLICY.workerLimit, 25),
  );

  const due = await prisma.appraisalCycle.findMany({
    where: {
      status: AppraisalCycleStatus.OPEN,
      deadlineAt: { lte: now },
      targetRoleSnapshot: "DISTRICT_DIRECTOR",
      instrumentVersion: {
        instrument: { code: DIRECTOR_FEEDBACK_POLICY.instrumentCode },
      },
    },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });

  const result: DirectorFeedbackLifecycleWorkerResult = {
    dueCycles: due.length,
    closed: 0,
    alreadyClosed: 0,
    notDue: 0,
    closeFailed: 0,
    aggregateCandidates: 0,
    snapshotsCreated: 0,
    snapshotsExisting: 0,
    aggregateSkipped: 0,
    aggregateFailed: 0,
  };

  for (const cycle of due) {
    try {
      const closed = await closeExpiredDirectorFeedbackCycle({
        cycleId: cycle.id,
        now,
      });
      if (closed.outcome === "CLOSED") result.closed += 1;
      else if (closed.outcome === "ALREADY_CLOSED") result.alreadyClosed += 1;
      else if (closed.outcome === "NOT_DUE") result.notDue += 1;
    } catch (error) {
      result.closeFailed += 1;
      console.error("[DIRECTOR_FEEDBACK_DEADLINE_CLOSE_FAILED]", {
        error: safeErrorCode(error),
      });
    }
  }

  const aggregateCandidates = await prisma.appraisalCycle.findMany({
    where: {
      status: {
        in: [
          AppraisalCycleStatus.CLOSED,
          AppraisalCycleStatus.UNDER_REVIEW,
        ],
      },
      targetRoleSnapshot: "DISTRICT_DIRECTOR",
      instrumentVersion: {
        instrument: { code: DIRECTOR_FEEDBACK_POLICY.instrumentCode },
      },
    },
    orderBy: [{ closedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  result.aggregateCandidates = aggregateCandidates.length;

  for (const cycle of aggregateCandidates) {
    try {
      const aggregated = await generateDirectorFeedbackAggregateSnapshot({
        cycleId: cycle.id,
        now,
      });
      if (aggregated.outcome === "CREATED") result.snapshotsCreated += 1;
      else if (aggregated.outcome === "EXISTING_MATCH") {
        result.snapshotsExisting += 1;
      } else {
        result.aggregateSkipped += 1;
      }
    } catch (error) {
      result.aggregateFailed += 1;
      console.error("[DIRECTOR_FEEDBACK_AGGREGATE_FAILED]", {
        error: safeErrorCode(error),
      });
    }
  }

  return result;
}
