import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  headteacherFeedbackDeadline,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_DIRECTOR_REVIEW_POLICY } from "@/lib/appraisals/headteacherDirectorReview";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY = {
  extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
  extensionDays: HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
  maximumExtensionsPerCycle: 1,
  requiresExplicitConfirmation: true,
  eligibleCycleStatus: "OPEN",
  originalDeadlineMustBeReached: true,
  preservesOpenedAt: true,
  preservesParticipantSet: true,
  preservesSavedResponses: true,
  preservesFinalizedResponses: true,
  respondentIdentitiesIncluded: false,
  scoreValuesIncluded: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 30_000,
  transactionIsolation: "Serializable",
} as const;

export const HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION =
  "APPRAISAL_CYCLE_FEEDBACK_DEADLINE_EXTENDED" as const;

export type HeadteacherFeedbackDeadlineExtensionMetadata = {
  schemaVersion: 1;
  extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY";
  extensionNumber: 1;
  extensionDays: number;
  originalDeadlineAt: string;
  extendedAt: string;
  newDeadlineAt: string;
  actorRole: "DISTRICT_DIRECTOR";
  participantSetPreserved: true;
  savedResponsesPreserved: true;
  finalizedResponsesPreserved: true;
  respondentIdentitiesIncluded: false;
  scoreValuesIncluded: false;
  notificationsSeeded: false;
  providerCalled: false;
};

export type ResolveHeadteacherFeedbackDeadlineContractInput = {
  cycleId: string;
  openedAt: Date;
  deadlineAt: Date;
  metadata: unknown;
};

export type ResolveHeadteacherFeedbackDeadlineContractResult = {
  mode: "ORIGINAL" | "DIRECTOR_EXTENDED";
  extensionCount: 0 | 1;
  originalDeadlineAt: Date;
  effectiveDeadlineAt: Date;
  extension: HeadteacherFeedbackDeadlineExtensionMetadata | null;
};

export type ExtendExpiredHeadteacherFeedbackCycleInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  cycleId: string;
  confirm: boolean;
  now?: Date;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  database?: HeadteacherFeedbackDeadlineExtensionDatabase;
};

export type ExtendExpiredHeadteacherFeedbackCycleResult = {
  outcome: "EXTENDED" | "EXISTING_EXTENDED";
  cycleId: string;
  status: "OPEN";
  priorDeadlineAt: string;
  newDeadlineAt: string;
  extensionNumber: 1;
  extensionDays: number;
  participantCount: number;
  finalizedResponseCount: number;
  unfinishedParticipantCount: number;
  providerCalled: false;
};

type ParticipantRecord = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINALIZED" | "EXPIRED" | "REVOKED";
};

type CycleRecord = {
  id: string;
  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "OPEN"
    | "CLOSED"
    | "UNDER_REVIEW"
    | "RELEASED"
    | "CANCELLED";
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  openedAt: Date | null;
  deadlineAt: Date | null;
  minimumResponses: number;
  responseWindowDays: number;
  identityVisibility: string;
  metadata: unknown;
  instrumentVersion: {
    id: string;
    version: number;
    status: string;
    instrument: {
      code: string;
      isActive: boolean;
    };
  };
  participants: ParticipantRecord[];
};

type CycleMutationRecord = {
  id: string;
  status: "OPEN";
  deadlineAt: Date | null;
  metadata: unknown;
};

type HeadteacherFeedbackDeadlineExtensionTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    update(args: unknown): Promise<CycleMutationRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherFeedbackDeadlineExtensionDatabase = {
  appraisalCycle: HeadteacherFeedbackDeadlineExtensionTransactionClient["appraisalCycle"];
  auditLog: HeadteacherFeedbackDeadlineExtensionTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherFeedbackDeadlineExtensionTransactionClient,
    ) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
    },
  ): Promise<T>;
};

const cycleSelect = {
  id: true,
  status: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  openedAt: true,
  deadlineAt: true,
  minimumResponses: true,
  responseWindowDays: true,
  identityVisibility: true,
  metadata: true,
  instrumentVersion: {
    select: {
      id: true,
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
    },
  },
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
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
    fail("HEADTEACHER_FEEDBACK_EXTENSION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireValidDate(value: Date | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_INVALID_NOW", 400);
  }
  return date;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

export function readHeadteacherFeedbackDeadlineExtensionMetadata(
  metadata: unknown,
): HeadteacherFeedbackDeadlineExtensionMetadata | null {
  const root = objectValue(metadata);
  const raw = root.headteacherFeedbackDeadlineExtension;
  if (raw == null) return null;

  const extension = objectValue(raw);
  const originalDeadlineAt = isoDate(extension.originalDeadlineAt);
  const extendedAt = isoDate(extension.extendedAt);
  const newDeadlineAt = isoDate(extension.newDeadlineAt);

  if (
    extension.schemaVersion !== 1 ||
    extension.extensionMode !==
      HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionMode ||
    extension.extensionNumber !== 1 ||
    extension.extensionDays !==
      HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays ||
    !originalDeadlineAt ||
    !extendedAt ||
    !newDeadlineAt ||
    extension.actorRole !== "DISTRICT_DIRECTOR" ||
    extension.participantSetPreserved !== true ||
    extension.savedResponsesPreserved !== true ||
    extension.finalizedResponsesPreserved !== true ||
    extension.respondentIdentitiesIncluded !== false ||
    extension.scoreValuesIncluded !== false ||
    extension.notificationsSeeded !== false ||
    extension.providerCalled !== false
  ) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_METADATA_INVALID", 409);
  }

  return {
    schemaVersion: 1,
    extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
    extensionNumber: 1,
    extensionDays:
      HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
    originalDeadlineAt: originalDeadlineAt.toISOString(),
    extendedAt: extendedAt.toISOString(),
    newDeadlineAt: newDeadlineAt.toISOString(),
    actorRole: "DISTRICT_DIRECTOR",
    participantSetPreserved: true,
    savedResponsesPreserved: true,
    finalizedResponsesPreserved: true,
    respondentIdentitiesIncluded: false,
    scoreValuesIncluded: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
}

export function resolveHeadteacherFeedbackDeadlineContract(
  input: ResolveHeadteacherFeedbackDeadlineContractInput,
): ResolveHeadteacherFeedbackDeadlineContractResult {
  const originalDeadlineAt = headteacherFeedbackDeadline(input.openedAt);
  const extension = readHeadteacherFeedbackDeadlineExtensionMetadata(
    input.metadata,
  );

  if (!extension) {
    if (!sameTime(input.deadlineAt, originalDeadlineAt)) {
      fail("HEADTEACHER_FEEDBACK_EXTENSION_DEADLINE_CONTRACT_INVALID", 409, {
        cycleId: input.cycleId,
      });
    }

    return {
      mode: "ORIGINAL",
      extensionCount: 0,
      originalDeadlineAt,
      effectiveDeadlineAt: input.deadlineAt,
      extension: null,
    };
  }

  const metadataOriginalDeadlineAt = new Date(extension.originalDeadlineAt);
  const extendedAt = new Date(extension.extendedAt);
  const metadataNewDeadlineAt = new Date(extension.newDeadlineAt);
  const expectedExtendedDeadlineAt = headteacherFeedbackDeadline(extendedAt);

  if (
    !sameTime(metadataOriginalDeadlineAt, originalDeadlineAt) ||
    extendedAt.getTime() < originalDeadlineAt.getTime() ||
    !sameTime(metadataNewDeadlineAt, expectedExtendedDeadlineAt) ||
    !sameTime(input.deadlineAt, metadataNewDeadlineAt)
  ) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_DEADLINE_CONTRACT_INVALID", 409, {
      cycleId: input.cycleId,
    });
  }

  return {
    mode: "DIRECTOR_EXTENDED",
    extensionCount: 1,
    originalDeadlineAt,
    effectiveDeadlineAt: input.deadlineAt,
    extension,
  };
}

function assertCycleContract(cycle: CycleRecord) {
  assertHeadteacherFeedbackInstrumentReady();

  if (
    cycle.instrumentVersion.instrument.code !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.version !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    !cycle.instrumentVersion.instrument.isActive ||
    cycle.targetRoleSnapshot !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    cycle.identityVisibility !==
      HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue ||
    cycle.responseWindowDays !==
      HEADTEACHER_FEEDBACK_POLICY.responseWindowDays ||
    cycle.minimumResponses !==
      HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses
  ) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  if (!cycle.targetTenantId) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_TARGET_TENANT_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }
}

function requireDirectorExtensionAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
}) {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_DIRECTOR_ONLY", 403, {
      actorRole,
    });
  }

  assertAppraisalAuthority(
    {
      actorUserId,
      roleName: actorRole,
    },
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  );

  return {
    actorUserId,
    actorRole: "DISTRICT_DIRECTOR" as const,
  };
}

function summarizeParticipants(cycle: CycleRecord) {
  if (!cycle.participants.length) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_PARTICIPANTS_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }

  if (cycle.participants.some((participant) => participant.status === "EXPIRED")) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_PREEXPIRED_PARTICIPANT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  const finalizedResponseCount = cycle.participants.filter(
    (participant) => participant.status === "FINALIZED",
  ).length;
  const unfinishedParticipantCount = cycle.participants.filter(
    (participant) =>
      participant.status === "NOT_STARTED" ||
      participant.status === "IN_PROGRESS",
  ).length;

  return {
    participantCount: cycle.participants.length,
    finalizedResponseCount,
    unfinishedParticipantCount,
  };
}

function existingResult(
  cycle: CycleRecord,
  contract: ResolveHeadteacherFeedbackDeadlineContractResult,
): ExtendExpiredHeadteacherFeedbackCycleResult {
  const summary = summarizeParticipants(cycle);
  return {
    outcome: "EXISTING_EXTENDED",
    cycleId: cycle.id,
    status: "OPEN",
    priorDeadlineAt: contract.originalDeadlineAt.toISOString(),
    newDeadlineAt: contract.effectiveDeadlineAt.toISOString(),
    extensionNumber: 1,
    extensionDays: HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
    ...summary,
    providerCalled: false,
  };
}

export async function extendExpiredHeadteacherFeedbackCycle(
  input: ExtendExpiredHeadteacherFeedbackCycleInput,
): Promise<ExtendExpiredHeadteacherFeedbackCycleResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED", 400);
  }

  const authority = requireDirectorExtensionAuthority(input);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(input.now);
  const reqId = clean(input.reqId).slice(0, 180) || null;
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackDeadlineExtensionDatabase);

  return database.$transaction(
    async (
      tx: HeadteacherFeedbackDeadlineExtensionTransactionClient,
    ) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: cycleSelect,
      });

      if (!cycle) {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_CYCLE_NOT_FOUND", 404, {
          cycleId,
        });
      }

      assertCycleContract(cycle);

      const targetTenantId = requireIdentifier(
        cycle.targetTenantId,
        "targetTenantId",
      );
      assertHeadteacherFeedbackTargetInGovernanceScope({
        governanceScope: input.governanceScope,
        targetTenantId,
      });

      if (cycle.status !== "OPEN") {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_OPEN_CYCLE_REQUIRED", 409, {
          cycleId,
          status: cycle.status,
        });
      }

      if (!cycle.openedAt || !cycle.deadlineAt) {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_OPEN_TIMESTAMPS_INVALID", 409, {
          cycleId,
        });
      }

      const deadlineContract = resolveHeadteacherFeedbackDeadlineContract({
        cycleId,
        openedAt: cycle.openedAt,
        deadlineAt: cycle.deadlineAt,
        metadata: cycle.metadata,
      });

      if (deadlineContract.extensionCount === 1) {
        return existingResult(cycle, deadlineContract);
      }

      if (now.getTime() < cycle.deadlineAt.getTime()) {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_DEADLINE_NOT_REACHED", 409, {
          cycleId,
          deadlineAt: cycle.deadlineAt.toISOString(),
        });
      }

      const summary = summarizeParticipants(cycle);
      if (summary.unfinishedParticipantCount < 1) {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_UNFINISHED_PARTICIPANTS_REQUIRED", 409, {
          cycleId,
          finalizedResponseCount: summary.finalizedResponseCount,
        });
      }

      const priorDeadlineAt = cycle.deadlineAt;
      const newDeadlineAt = headteacherFeedbackDeadline(now);
      const priorMetadata = objectValue(cycle.metadata);
      const extensionMetadata: HeadteacherFeedbackDeadlineExtensionMetadata = {
        schemaVersion: 1,
        extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
        extensionNumber: 1,
        extensionDays:
          HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
        originalDeadlineAt: deadlineContract.originalDeadlineAt.toISOString(),
        extendedAt: now.toISOString(),
        newDeadlineAt: newDeadlineAt.toISOString(),
        actorRole: authority.actorRole,
        participantSetPreserved: true,
        savedResponsesPreserved: true,
        finalizedResponsesPreserved: true,
        respondentIdentitiesIncluded: false,
        scoreValuesIncluded: false,
        notificationsSeeded: false,
        providerCalled: false,
      };

      const updated = await tx.appraisalCycle.update({
        where: {
          id: cycleId,
          status: "OPEN",
          deadlineAt: priorDeadlineAt,
        },
        data: {
          deadlineAt: newDeadlineAt,
          metadata: {
            ...priorMetadata,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            headteacherFeedbackDeadlineExtension: extensionMetadata,
          },
        },
        select: {
          id: true,
          status: true,
          deadlineAt: true,
          metadata: true,
        },
      });

      if (!updated.deadlineAt || !sameTime(updated.deadlineAt, newDeadlineAt)) {
        fail("HEADTEACHER_FEEDBACK_EXTENSION_UPDATE_MISMATCH", 409, {
          cycleId,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: authority.actorUserId,
          action: HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycleId,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            extensionMode:
              HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionMode,
            actorRole: authority.actorRole,
            priorStatus: "OPEN",
            nextStatus: "OPEN",
            extensionNumber: 1,
            extensionDays:
              HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
            originalDeadlineAt:
              deadlineContract.originalDeadlineAt.toISOString(),
            priorDeadlineAt: priorDeadlineAt.toISOString(),
            extendedAt: now.toISOString(),
            newDeadlineAt: newDeadlineAt.toISOString(),
            participantCount: summary.participantCount,
            finalizedResponseCount: summary.finalizedResponseCount,
            unfinishedParticipantCount: summary.unfinishedParticipantCount,
            participantSetPreserved: true,
            savedResponsesPreserved: true,
            finalizedResponsesPreserved: true,
            respondentIdentityCopiedIntoAudit: false,
            participantIdentifiersCopiedIntoAudit: false,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "EXTENDED",
        cycleId,
        status: "OPEN",
        priorDeadlineAt: priorDeadlineAt.toISOString(),
        newDeadlineAt: newDeadlineAt.toISOString(),
        extensionNumber: 1,
        extensionDays:
          HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.extensionDays,
        ...summary,
        providerCalled: false,
      };
    },
    {
      maxWait: HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_POLICY.transactionTimeoutMs,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
