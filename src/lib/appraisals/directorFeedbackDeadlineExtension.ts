import { AppraisalCycleStatus, AppraisalParticipantStatus, Prisma } from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY = {
  extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
  extensionDays: DIRECTOR_FEEDBACK_POLICY.responseWindowDays,
  maximumExtensionsPerCycle: 1,
  requiresExplicitConfirmation: true,
  eligibleClosedStatus: AppraisalCycleStatus.CLOSED,
  retryOpenStatus: AppraisalCycleStatus.OPEN,
  requiresReviewNotStarted: true,
  preservesParticipantSet: true,
  preservesSavedResponses: true,
  preservesFinalizedResponses: true,
  preservesPriorAggregateSnapshots: true,
  restoresExpiredParticipants: true,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 30_000,
  transactionIsolation: "Serializable",
} as const;

export const DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION =
  APPRAISAL_AUDIT_ACTIONS.CYCLE_EXTENDED;

export type DirectorFeedbackDeadlineExtensionMetadata = {
  schemaVersion: 1;
  extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY";
  extensionNumber: 1;
  extensionDays: number;
  priorDeadlineAt: string;
  priorClosedAt: string;
  extendedAt: string;
  newDeadlineAt: string;
  actorRole: "DISTRICT_DIRECTOR";
  participantSetPreserved: true;
  savedResponsesPreserved: true;
  finalizedResponsesPreserved: true;
  priorAggregateSnapshotsPreserved: true;
  expiredParticipantsRestored: true;
  respondentIdentitiesIncluded: false;
  scoreValuesIncluded: false;
  notificationsSeeded: false;
  providerCalled: false;
};

export type ExtendExpiredDirectorFeedbackCycleInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  confirm: boolean;
  now?: Date;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  database?: DirectorFeedbackDeadlineExtensionDatabase;
};

export type ExtendExpiredDirectorFeedbackCycleResult = {
  outcome: "EXTENDED" | "EXISTING_EXTENDED";
  cycleId: string;
  status: "OPEN";
  priorDeadlineAt: string;
  newDeadlineAt: string;
  extensionNumber: 1;
  extensionDays: number;
  finalizedResponseCount: number;
  restoredNotStartedParticipants: number;
  restoredInProgressParticipants: number;
  providerCalled: false;
};

type ParticipantRecord = {
  status: AppraisalParticipantStatus;
  startedAt: Date | null;
  finalizedAt: Date | null;
};

type AggregateRecord = {
  version: number;
  sourceHash: string;
};

type CycleRecord = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetRoleSnapshot: string | null;
  scopeZoneId: string;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
  extensionCount: number;
  metadata: unknown;
  instrumentVersion: {
    version: number;
    status: string;
    instrument: {
      code: string;
      isActive: boolean;
    };
  };
  participants: ParticipantRecord[];
  aggregates: AggregateRecord[];
};

type AssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  revokedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  zone: {
    id: string;
    isActive: boolean;
    zoneType: {
      level: number;
    };
  };
};

type DirectorFeedbackDeadlineExtensionTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  appraisalParticipant: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  governanceOfficerAssignment: {
    findFirst(args: unknown): Promise<AssignmentRecord | null>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type DirectorFeedbackDeadlineExtensionDatabase = {
  appraisalCycle: DirectorFeedbackDeadlineExtensionTransactionClient["appraisalCycle"];
  appraisalParticipant: DirectorFeedbackDeadlineExtensionTransactionClient["appraisalParticipant"];
  governanceOfficerAssignment: DirectorFeedbackDeadlineExtensionTransactionClient["governanceOfficerAssignment"];
  auditLog: DirectorFeedbackDeadlineExtensionTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: DirectorFeedbackDeadlineExtensionTransactionClient,
    ) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
    },
  ): Promise<T>;
};

const CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetRoleSnapshot: true,
  scopeZoneId: true,
  openedAt: true,
  deadlineAt: true,
  closedAt: true,
  closedByUserId: true,
  reviewStartedAt: true,
  releasedAt: true,
  responseWindowDays: true,
  minimumResponses: true,
  extensionCount: true,
  metadata: true,
  instrumentVersion: {
    select: {
      version: true,
      status: true,
      instrument: {
        select: {
          code: true,
          isActive: true,
        },
      },
    },
  },
  participants: {
    orderBy: { id: "asc" as const },
    select: {
      status: true,
      startedAt: true,
      finalizedAt: true,
    },
  },
  aggregates: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      version: true,
      sourceHash: true,
    },
  },
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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
    fail("DIRECTOR_FEEDBACK_EXTENSION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireValidDate(value: Date | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_INVALID_NOW", 400);
  }
  return date;
}

function addCalendarDays(value: Date, days: number) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(value: unknown): Date | null {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameTime(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function readExtensionMetadata(
  metadata: unknown,
): DirectorFeedbackDeadlineExtensionMetadata | null {
  const root = objectValue(metadata);
  const raw = root.directorFeedbackDeadlineExtension;
  if (raw == null) return null;

  const extension = objectValue(raw);
  const priorDeadlineAt = isoDate(extension.priorDeadlineAt);
  const priorClosedAt = isoDate(extension.priorClosedAt);
  const extendedAt = isoDate(extension.extendedAt);
  const newDeadlineAt = isoDate(extension.newDeadlineAt);

  if (
    extension.schemaVersion !== 1 ||
    extension.extensionMode !==
      DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionMode ||
    extension.extensionNumber !== 1 ||
    extension.extensionDays !==
      DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays ||
    !priorDeadlineAt ||
    !priorClosedAt ||
    !extendedAt ||
    !newDeadlineAt ||
    extension.actorRole !== "DISTRICT_DIRECTOR" ||
    extension.participantSetPreserved !== true ||
    extension.savedResponsesPreserved !== true ||
    extension.finalizedResponsesPreserved !== true ||
    extension.priorAggregateSnapshotsPreserved !== true ||
    extension.expiredParticipantsRestored !== true ||
    extension.respondentIdentitiesIncluded !== false ||
    extension.scoreValuesIncluded !== false ||
    extension.notificationsSeeded !== false ||
    extension.providerCalled !== false
  ) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_METADATA_INVALID", 409);
  }

  return {
    schemaVersion: 1,
    extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
    extensionNumber: 1,
    extensionDays: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
    priorDeadlineAt: priorDeadlineAt.toISOString(),
    priorClosedAt: priorClosedAt.toISOString(),
    extendedAt: extendedAt.toISOString(),
    newDeadlineAt: newDeadlineAt.toISOString(),
    actorRole: "DISTRICT_DIRECTOR",
    participantSetPreserved: true,
    savedResponsesPreserved: true,
    finalizedResponsesPreserved: true,
    priorAggregateSnapshotsPreserved: true,
    expiredParticipantsRestored: true,
    respondentIdentitiesIncluded: false,
    scoreValuesIncluded: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
}

function assertCycleContract(cycle: CycleRecord, actorUserId: string) {
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR" ||
    cycle.instrumentVersion.version !== DIRECTOR_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !== DIRECTOR_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    cycle.responseWindowDays !== DIRECTOR_FEEDBACK_POLICY.responseWindowDays ||
    cycle.minimumResponses !== DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses
  ) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_SCOPE_FORBIDDEN", 403, {
      cycleId: cycle.id,
    });
  }
}

async function assertCurrentDirectorAssignment(
  tx: DirectorFeedbackDeadlineExtensionTransactionClient,
  actorUserId: string,
  scopeZoneId: string,
  now: Date,
) {
  const assignment = await tx.governanceOfficerAssignment.findFirst({
    where: {
      userId: actorUserId,
      role: "DISTRICT_DIRECTOR",
      status: "ACTIVE",
      revokedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      revokedAt: true,
      startsAt: true,
      endsAt: true,
      zone: {
        select: {
          id: true,
          isActive: true,
          zoneType: { select: { level: true } },
        },
      },
    },
  });

  if (
    !assignment ||
    assignment.zone.id !== scopeZoneId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !== 2
  ) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_CURRENT_ASSIGNMENT_REQUIRED", 403);
  }
}

function participantSummary(cycle: CycleRecord) {
  const finalizedResponseCount = cycle.participants.filter(
    (participant) =>
      participant.status === AppraisalParticipantStatus.FINALIZED,
  ).length;
  const expiredParticipants = cycle.participants.filter(
    (participant) =>
      participant.status === AppraisalParticipantStatus.EXPIRED &&
      participant.finalizedAt == null,
  );

  return {
    finalizedResponseCount,
    expiredParticipants,
  };
}

function existingExtendedResult(
  cycle: CycleRecord,
  metadata: DirectorFeedbackDeadlineExtensionMetadata,
): ExtendExpiredDirectorFeedbackCycleResult {
  const summary = participantSummary(cycle);
  const newDeadlineAt = new Date(metadata.newDeadlineAt);

  if (
    cycle.status !== AppraisalCycleStatus.OPEN ||
    cycle.extensionCount !== 1 ||
    !cycle.deadlineAt ||
    !sameTime(cycle.deadlineAt, newDeadlineAt) ||
    cycle.reviewStartedAt ||
    cycle.releasedAt
  ) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_RETRY_STATE_INVALID", 409, {
      cycleId: cycle.id,
      status: cycle.status,
    });
  }

  return {
    outcome: "EXISTING_EXTENDED",
    cycleId: cycle.id,
    status: "OPEN",
    priorDeadlineAt: metadata.priorDeadlineAt,
    newDeadlineAt: metadata.newDeadlineAt,
    extensionNumber: 1,
    extensionDays: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
    finalizedResponseCount: summary.finalizedResponseCount,
    restoredNotStartedParticipants: 0,
    restoredInProgressParticipants: 0,
    providerCalled: false,
  };
}

export async function extendExpiredDirectorFeedbackCycle(
  input: ExtendExpiredDirectorFeedbackCycleInput,
): Promise<ExtendExpiredDirectorFeedbackCycleResult> {
  if (input.confirm !== true) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED", 400);
  }

  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(input.now);
  const reqId = clean(input.reqId).slice(0, 180) || null;

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("DIRECTOR_FEEDBACK_EXTENSION_DIRECTOR_ONLY", 403, { actorRole });
  }

  // Deliberately use the Director's existing own-cycle authority rather than
  // the broad EXTEND_DIRECTOR_FEEDBACK_CYCLE capability, which remains
  // reserved for Superadmin's controlled arbitrary extend/reopen operation.
  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "OPEN_DIRECTOR_FEEDBACK_CYCLE",
  );

  const database =
    input.database ??
    (prisma as unknown as DirectorFeedbackDeadlineExtensionDatabase);

  return database.$transaction(
    async (tx) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: CYCLE_SELECT,
      });

      if (!cycle) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_CYCLE_NOT_FOUND", 404, { cycleId });
      }

      assertCycleContract(cycle, actorUserId);
      await assertCurrentDirectorAssignment(
        tx,
        actorUserId,
        cycle.scopeZoneId,
        now,
      );

      const existingMetadata = readExtensionMetadata(cycle.metadata);
      if (existingMetadata) {
        if (cycle.status === AppraisalCycleStatus.OPEN) {
          return existingExtendedResult(cycle, existingMetadata);
        }

        fail("DIRECTOR_FEEDBACK_EXTENSION_LIMIT_REACHED", 409, {
          cycleId,
          extensionCount: cycle.extensionCount,
        });
      }

      if (cycle.extensionCount >= DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.maximumExtensionsPerCycle) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_LIMIT_REACHED", 409, {
          cycleId,
          extensionCount: cycle.extensionCount,
        });
      }

      if (cycle.status !== AppraisalCycleStatus.CLOSED) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_CLOSED_CYCLE_REQUIRED", 409, {
          cycleId,
          status: cycle.status,
        });
      }

      if (cycle.reviewStartedAt || cycle.releasedAt) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_REVIEW_ALREADY_STARTED", 409, {
          cycleId,
        });
      }

      if (!cycle.deadlineAt || !cycle.closedAt) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_CLOSURE_EVIDENCE_REQUIRED", 409, {
          cycleId,
        });
      }

      if (cycle.deadlineAt.getTime() > now.getTime()) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_DEADLINE_NOT_REACHED", 409, {
          cycleId,
          deadlineAt: cycle.deadlineAt.toISOString(),
        });
      }

      const summary = participantSummary(cycle);
      if (!summary.expiredParticipants.length) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_EXPIRED_PARTICIPANTS_REQUIRED", 409, {
          cycleId,
          finalizedResponseCount: summary.finalizedResponseCount,
        });
      }

      const priorDeadlineAt = cycle.deadlineAt;
      const priorClosedAt = cycle.closedAt;
      const newDeadlineAt = addCalendarDays(
        now,
        DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
      );
      const priorMetadata = objectValue(cycle.metadata);
      const latestAggregate = cycle.aggregates[0] ?? null;

      const extensionMetadata: DirectorFeedbackDeadlineExtensionMetadata = {
        schemaVersion: 1,
        extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
        extensionNumber: 1,
        extensionDays: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
        priorDeadlineAt: priorDeadlineAt.toISOString(),
        priorClosedAt: priorClosedAt.toISOString(),
        extendedAt: now.toISOString(),
        newDeadlineAt: newDeadlineAt.toISOString(),
        actorRole: "DISTRICT_DIRECTOR",
        participantSetPreserved: true,
        savedResponsesPreserved: true,
        finalizedResponsesPreserved: true,
        priorAggregateSnapshotsPreserved: true,
        expiredParticipantsRestored: true,
        respondentIdentitiesIncluded: false,
        scoreValuesIncluded: false,
        notificationsSeeded: false,
        providerCalled: false,
      };

      const claimed = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: AppraisalCycleStatus.CLOSED,
          extensionCount: cycle.extensionCount,
          deadlineAt: priorDeadlineAt,
          reviewStartedAt: null,
          releasedAt: null,
        },
        data: {
          status: AppraisalCycleStatus.OPEN,
          deadlineAt: newDeadlineAt,
          extensionCount: { increment: 1 },
          closedAt: null,
          closedByUserId: null,
          metadata: {
            ...priorMetadata,
            directorFeedbackDeadlineExtension: extensionMetadata,
          },
        },
      });

      if (claimed.count !== 1) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_CONFLICT", 409, { cycleId });
      }

      const restoredNotStarted = await tx.appraisalParticipant.updateMany({
        where: {
          cycleId: cycle.id,
          status: AppraisalParticipantStatus.EXPIRED,
          startedAt: null,
          finalizedAt: null,
        },
        data: {
          status: AppraisalParticipantStatus.NOT_STARTED,
          expiredAt: null,
        },
      });

      const restoredInProgress = await tx.appraisalParticipant.updateMany({
        where: {
          cycleId: cycle.id,
          status: AppraisalParticipantStatus.EXPIRED,
          startedAt: { not: null },
          finalizedAt: null,
        },
        data: {
          status: AppraisalParticipantStatus.IN_PROGRESS,
          expiredAt: null,
        },
      });

      if (
        restoredNotStarted.count + restoredInProgress.count !==
        summary.expiredParticipants.length
      ) {
        fail("DIRECTOR_FEEDBACK_EXTENSION_PARTICIPANT_RESTORE_MISMATCH", 409, {
          cycleId,
          expected: summary.expiredParticipants.length,
          restored: restoredNotStarted.count + restoredInProgress.count,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            extensionMode:
              DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionMode,
            actorRole: "DISTRICT_DIRECTOR",
            priorStatus: AppraisalCycleStatus.CLOSED,
            nextStatus: AppraisalCycleStatus.OPEN,
            extensionNumber: 1,
            extensionDays: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
            priorDeadlineAt: priorDeadlineAt.toISOString(),
            priorClosedAt: priorClosedAt.toISOString(),
            extendedAt: now.toISOString(),
            newDeadlineAt: newDeadlineAt.toISOString(),
            finalizedResponseCount: summary.finalizedResponseCount,
            restoredNotStartedParticipants: restoredNotStarted.count,
            restoredInProgressParticipants: restoredInProgress.count,
            priorAggregateSnapshotPresent: Boolean(latestAggregate),
            priorAggregateVersion: latestAggregate?.version ?? null,
            priorAggregateSourceHash: latestAggregate?.sourceHash ?? null,
            priorAggregateSnapshotsPreserved: true,
            participantSetPreserved: true,
            savedResponsesPreserved: true,
            finalizedResponsesPreserved: true,
            respondentIdentityCopiedIntoAudit: false,
            participantIdentifiersCopiedIntoAudit: false,
            scoreValuesRecordedInAudit: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "EXTENDED" as const,
        cycleId,
        status: "OPEN" as const,
        priorDeadlineAt: priorDeadlineAt.toISOString(),
        newDeadlineAt: newDeadlineAt.toISOString(),
        extensionNumber: 1 as const,
        extensionDays: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
        finalizedResponseCount: summary.finalizedResponseCount,
        restoredNotStartedParticipants: restoredNotStarted.count,
        restoredInProgressParticipants: restoredInProgress.count,
        providerCalled: false as const,
      };
    },
    {
      maxWait: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_POLICY.transactionTimeoutMs,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
