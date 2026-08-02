//src/lib/appraisals/headteacherFeedbackDeadlineClosure.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackInstrumentReady,
  headteacherFeedbackDeadline,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_DIRECTOR_REVIEW_POLICY } from "@/lib/appraisals/headteacherDirectorReview";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY = {
  closureMode: "SYSTEM_DEADLINE",
  earlyClosureMode: "DIRECTOR_ALL_RESPONSES_FINALIZED",
  earlyClosureRequiresExplicitConfirmation: true,
  earlyClosureRequiresAllEligibleFinalized: true,
  earlyClosureExpiresParticipants: false,
  staffFeedbackIndependentOfGovernanceAssessment: true,
  closesOnlyOpenCycles: true,
  deadlineInclusive: true,
  expiresOnlyUnfinalizedParticipants: true,
  preservesFinalizedResponses: true,
  minimumFinalizedResponses:
    HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 30_000,
  transactionIsolation: "Serializable",
  notificationsSeeded: false,
  aggregateSnapshotCreated: false,
  reviewStarted: false,
} as const;

export const HEADTEACHER_FEEDBACK_CLOSURE_AUDIT_ACTION =
  "APPRAISAL_CYCLE_CLOSED" as const;

export type CloseExpiredHeadteacherFeedbackCycleInput = {
  cycleId: string;
  now?: Date;
  reqId?: string | null;
  database?: HeadteacherFeedbackDeadlineClosureDatabase;
};

export type CloseCompletedHeadteacherFeedbackCycleEarlyInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  cycleId: string;
  confirm: boolean;
  now?: Date;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  database?: HeadteacherFeedbackDeadlineClosureDatabase;
};

export type CloseExpiredHeadteacherFeedbackCycleResult = {
  outcome: "CLOSED" | "EXISTING_CLOSED" | "ALREADY_ADVANCED";
  cycleId: string;
  status: "CLOSED" | "UNDER_REVIEW" | "RELEASED";
  closedAt: string | null;
  deadlineAt: string;
  participantCount: number;
  finalizedResponseCount: number;
  expiredParticipantCount: number;
  revokedParticipantCount: number;
  minimumResponses: number;
  reviewReadiness: "READY" | "INSUFFICIENT_RESPONSES";
};

type ParticipantRecord = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINALIZED" | "EXPIRED" | "REVOKED";
  finalizedAt: Date | null;
  expiredAt: Date | null;
  response: {
    id: string;
    status: "DRAFT" | "FINALIZED";
    finalizedAt: Date | null;
    responseHash: string | null;
  } | null;
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
  closedAt: Date | null;
  closedByUserId: string | null;
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
  status: "CLOSED";
  closedAt: Date | null;
  deadlineAt: Date | null;
  minimumResponses: number;
  metadata: unknown;
};

type ParticipantUpdateManyResult = {
  count: number;
};

type HeadteacherFeedbackDeadlineClosureTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    update(args: unknown): Promise<CycleMutationRecord>;
  };
  appraisalParticipant: {
    updateMany(args: unknown): Promise<ParticipantUpdateManyResult>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherFeedbackDeadlineClosureDatabase = {
  appraisalCycle: HeadteacherFeedbackDeadlineClosureTransactionClient["appraisalCycle"];
  appraisalParticipant: HeadteacherFeedbackDeadlineClosureTransactionClient["appraisalParticipant"];
  auditLog: HeadteacherFeedbackDeadlineClosureTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherFeedbackDeadlineClosureTransactionClient,
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
  closedAt: true,
  closedByUserId: true,
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
      id: true,
      status: true,
      finalizedAt: true,
      expiredAt: true,
      response: {
        select: {
          id: true,
          status: true,
          finalizedAt: true,
          responseHash: true,
        },
      },
    },
  },
} as const;

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_FEEDBACK_CLOSURE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireValidDate(value: Date | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("HEADTEACHER_FEEDBACK_CLOSURE_INVALID_NOW", 400);
  }
  return date;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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
    fail("HEADTEACHER_FEEDBACK_CLOSURE_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  if (!cycle.targetTenantId) {
    fail("HEADTEACHER_FEEDBACK_CLOSURE_TARGET_TENANT_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }
}

function assertParticipantResponseConsistency(cycle: CycleRecord) {
  if (!cycle.participants.length) {
    fail("HEADTEACHER_FEEDBACK_CLOSURE_PARTICIPANTS_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }

  for (const participant of cycle.participants) {
    const response = participant.response;

    if (cycle.status === "OPEN" && participant.status === "EXPIRED") {
      fail("HEADTEACHER_FEEDBACK_CLOSURE_PREEXPIRED_PARTICIPANT_INVALID", 409, {
        cycleId: cycle.id,
      });
    }

    if (participant.status === "FINALIZED") {
      if (
        !participant.finalizedAt ||
        !response ||
        response.status !== "FINALIZED" ||
        !response.finalizedAt ||
        !response.responseHash
      ) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_FINALIZED_EVIDENCE_INVALID", 409, {
          cycleId: cycle.id,
        });
      }
      continue;
    }

    if (response?.status === "FINALIZED" || response?.finalizedAt) {
      fail("HEADTEACHER_FEEDBACK_CLOSURE_RESPONSE_STATUS_MISMATCH", 409, {
        cycleId: cycle.id,
      });
    }
  }
}

function summarize(cycle: CycleRecord) {
  assertParticipantResponseConsistency(cycle);

  const finalizedResponseCount = cycle.participants.filter(
    (participant) => participant.status === "FINALIZED",
  ).length;
  const expiredParticipantCount = cycle.participants.filter(
    (participant) => participant.status === "EXPIRED",
  ).length;
  const revokedParticipantCount = cycle.participants.filter(
    (participant) => participant.status === "REVOKED",
  ).length;

  return {
    participantCount: cycle.participants.length,
    finalizedResponseCount,
    expiredParticipantCount,
    revokedParticipantCount,
    reviewReadiness:
      finalizedResponseCount >= cycle.minimumResponses
        ? ("READY" as const)
        : ("INSUFFICIENT_RESPONSES" as const),
  };
}

function resultFromCycle(
  cycle: CycleRecord,
  outcome: CloseExpiredHeadteacherFeedbackCycleResult["outcome"],
): CloseExpiredHeadteacherFeedbackCycleResult {
  if (!cycle.deadlineAt) {
    fail("HEADTEACHER_FEEDBACK_CLOSURE_DEADLINE_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }

  const summary = summarize(cycle);
  const status =
    cycle.status === "RELEASED"
      ? "RELEASED"
      : cycle.status === "UNDER_REVIEW"
        ? "UNDER_REVIEW"
        : "CLOSED";

  return {
    outcome,
    cycleId: cycle.id,
    status,
    closedAt: cycle.closedAt?.toISOString() ?? null,
    deadlineAt: cycle.deadlineAt.toISOString(),
    participantCount: summary.participantCount,
    finalizedResponseCount: summary.finalizedResponseCount,
    expiredParticipantCount: summary.expiredParticipantCount,
    revokedParticipantCount: summary.revokedParticipantCount,
    minimumResponses: cycle.minimumResponses,
    reviewReadiness: summary.reviewReadiness,
  };
}


function requireDirectorEarlyClosureAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
}) {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_FEEDBACK_EARLY_CLOSURE_DIRECTOR_ONLY", 403, {
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

function eligibleParticipants(cycle: CycleRecord) {
  return cycle.participants.filter(
    (participant) => participant.status !== "REVOKED",
  );
}

function allEligibleParticipantsFinalized(cycle: CycleRecord) {
  const eligible = eligibleParticipants(cycle);
  return (
    eligible.length > 0 &&
    eligible.every((participant) => participant.status === "FINALIZED")
  );
}

export async function closeCompletedHeadteacherFeedbackCycleEarly(
  input: CloseCompletedHeadteacherFeedbackCycleEarlyInput,
): Promise<CloseExpiredHeadteacherFeedbackCycleResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_FEEDBACK_EARLY_CLOSURE_CONFIRMATION_REQUIRED", 400);
  }

  const authority = requireDirectorEarlyClosureAuthority(input);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(input.now);
  const reqId = clean(input.reqId).slice(0, 180) || null;
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackDeadlineClosureDatabase);

  return database.$transaction(
    async (
      tx: HeadteacherFeedbackDeadlineClosureTransactionClient,
    ) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: cycleSelect,
      });

      if (!cycle) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_CYCLE_NOT_FOUND", 404, {
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

      if (cycle.status === "CLOSED") {
        return resultFromCycle(cycle, "EXISTING_CLOSED");
      }

      if (cycle.status === "UNDER_REVIEW" || cycle.status === "RELEASED") {
        return resultFromCycle(cycle, "ALREADY_ADVANCED");
      }

      if (cycle.status !== "OPEN") {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_OPEN_CYCLE_REQUIRED", 409, {
          cycleId,
          status: cycle.status,
        });
      }

      if (!cycle.openedAt || !cycle.deadlineAt) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_OPEN_TIMESTAMPS_INVALID", 409, {
          cycleId,
        });
      }

      const expectedDeadline = headteacherFeedbackDeadline(cycle.openedAt);
      if (expectedDeadline.getTime() !== cycle.deadlineAt.getTime()) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_DEADLINE_CONTRACT_INVALID", 409, {
          cycleId,
        });
      }

      if (now.getTime() >= cycle.deadlineAt.getTime()) {
        fail(
          "HEADTEACHER_FEEDBACK_EARLY_CLOSURE_DEADLINE_REACHED_USE_SYSTEM_CLOSURE",
          409,
          {
            cycleId,
            deadlineAt: cycle.deadlineAt.toISOString(),
          },
        );
      }

      assertParticipantResponseConsistency(cycle);

      const eligible = eligibleParticipants(cycle);
      const finalizedResponseCount = eligible.filter(
        (participant) => participant.status === "FINALIZED",
      ).length;

      if (!allEligibleParticipantsFinalized(cycle)) {
        fail(
          "HEADTEACHER_FEEDBACK_EARLY_CLOSURE_ALL_RESPONSES_REQUIRED",
          409,
          {
            cycleId,
            eligibleParticipantCount: eligible.length,
            finalizedResponseCount,
          },
        );
      }

      const revokedParticipantCount = cycle.participants.filter(
        (participant) => participant.status === "REVOKED",
      ).length;
      const priorMetadata = objectValue(cycle.metadata);

      const updated = await tx.appraisalCycle.update({
        where: {
          id: cycleId,
          status: "OPEN",
        },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedByUserId: authority.actorUserId,
          metadata: {
            ...priorMetadata,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            closureMode:
              HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.earlyClosureMode,
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            participantCount: cycle.participants.length,
            eligibleParticipantCount: eligible.length,
            finalizedResponseCount,
            expiredParticipantCount: 0,
            revokedParticipantCount,
            minimumResponses: cycle.minimumResponses,
            reviewReadiness: "READY",
            allEligibleResponsesFinalized: true,
            directorEarlyClosure: true,
            governanceAssessmentRequiredForClosure: false,
            identitiesIncluded: false,
            scoreValuesIncluded: false,
            aggregateSnapshotCreated: false,
            reviewStarted: false,
            notificationsSeeded: false,
          },
        },
        select: {
          id: true,
          status: true,
          closedAt: true,
          deadlineAt: true,
          minimumResponses: true,
          metadata: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: authority.actorUserId,
          action: HEADTEACHER_FEEDBACK_CLOSURE_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycleId,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: HEADTEACHER_FEEDBACK_CLOSURE_AUDIT_ACTION,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            closureMode:
              HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.earlyClosureMode,
            actorRole: authority.actorRole,
            priorStatus: "OPEN",
            nextStatus: "CLOSED",
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            participantCount: cycle.participants.length,
            eligibleParticipantCount: eligible.length,
            finalizedResponseCount,
            expiredParticipantCount: 0,
            revokedParticipantCount,
            minimumResponses: cycle.minimumResponses,
            reviewReadiness: "READY",
            allEligibleResponsesFinalized: true,
            governanceAssessmentRequiredForClosure: false,
            respondentIdentityCopiedIntoAudit: false,
            participantIdentifiersCopiedIntoAudit: false,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            notificationsSeeded: false,
          },
        },
      });

      return resultFromCycle(
        {
          ...cycle,
          status: updated.status,
          closedAt: updated.closedAt,
          closedByUserId: authority.actorUserId,
          metadata: updated.metadata,
        },
        "CLOSED",
      );
    },
    {
      maxWait:
        HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.transactionTimeoutMs,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function closeExpiredHeadteacherFeedbackCycle(
  input: CloseExpiredHeadteacherFeedbackCycleInput,
): Promise<CloseExpiredHeadteacherFeedbackCycleResult> {
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(input.now);
  const reqId = clean(input.reqId).slice(0, 180) || null;
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackDeadlineClosureDatabase);

  return database.$transaction(
    async (
      tx: HeadteacherFeedbackDeadlineClosureTransactionClient,
    ) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: cycleSelect,
      });

      if (!cycle) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_CYCLE_NOT_FOUND", 404, {
          cycleId,
        });
      }

      assertCycleContract(cycle);

      if (cycle.status === "CLOSED") {
        return resultFromCycle(cycle, "EXISTING_CLOSED");
      }

      if (cycle.status === "UNDER_REVIEW" || cycle.status === "RELEASED") {
        return resultFromCycle(cycle, "ALREADY_ADVANCED");
      }

      if (cycle.status !== "OPEN") {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_OPEN_CYCLE_REQUIRED", 409, {
          cycleId,
          status: cycle.status,
        });
      }

      if (!cycle.openedAt || !cycle.deadlineAt) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_OPEN_TIMESTAMPS_INVALID", 409, {
          cycleId,
        });
      }

      const expectedDeadline = headteacherFeedbackDeadline(cycle.openedAt);
      if (expectedDeadline.getTime() !== cycle.deadlineAt.getTime()) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_DEADLINE_CONTRACT_INVALID", 409, {
          cycleId,
        });
      }

      if (now.getTime() < cycle.deadlineAt.getTime()) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_DEADLINE_NOT_REACHED", 409, {
          cycleId,
          deadlineAt: cycle.deadlineAt.toISOString(),
        });
      }

      assertParticipantResponseConsistency(cycle);

      const toExpire = cycle.participants.filter(
        (participant) =>
          participant.status === "NOT_STARTED" ||
          participant.status === "IN_PROGRESS",
      );

      const expired = await tx.appraisalParticipant.updateMany({
        where: {
          cycleId,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        },
        data: {
          status: "EXPIRED",
          expiredAt: now,
        },
      });

      if (expired.count !== toExpire.length) {
        fail("HEADTEACHER_FEEDBACK_CLOSURE_PARTICIPANT_RACE", 409, {
          cycleId,
          expected: toExpire.length,
          actual: expired.count,
        });
      }

      const finalizedResponseCount = cycle.participants.filter(
        (participant) => participant.status === "FINALIZED",
      ).length;
      const revokedParticipantCount = cycle.participants.filter(
        (participant) => participant.status === "REVOKED",
      ).length;
      const reviewReadiness =
        finalizedResponseCount >= cycle.minimumResponses
          ? "READY"
          : "INSUFFICIENT_RESPONSES";
      const priorMetadata = objectValue(cycle.metadata);

      const updated = await tx.appraisalCycle.update({
        where: {
          id: cycleId,
          status: "OPEN",
        },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedByUserId: null,
          metadata: {
            ...priorMetadata,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            closureMode:
              HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.closureMode,
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            participantCount: cycle.participants.length,
            finalizedResponseCount,
            expiredParticipantCount: expired.count,
            revokedParticipantCount,
            minimumResponses: cycle.minimumResponses,
            reviewReadiness,
            identitiesIncluded: false,
            scoreValuesIncluded: false,
            aggregateSnapshotCreated: false,
            reviewStarted: false,
            notificationsSeeded: false,
          },
        },
        select: {
          id: true,
          status: true,
          closedAt: true,
          deadlineAt: true,
          minimumResponses: true,
          metadata: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: cycle.targetTenantId,
          userId: null,
          action: HEADTEACHER_FEEDBACK_CLOSURE_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycleId,
          ip: null,
          userAgent: null,
          metadata: {
            reqId,
            action: HEADTEACHER_FEEDBACK_CLOSURE_AUDIT_ACTION,
            workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
            closureMode:
              HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.closureMode,
            priorStatus: "OPEN",
            nextStatus: "CLOSED",
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            participantCount: cycle.participants.length,
            finalizedResponseCount,
            expiredParticipantCount: expired.count,
            revokedParticipantCount,
            minimumResponses: cycle.minimumResponses,
            reviewReadiness,
            respondentIdentityCopiedIntoAudit: false,
            participantIdentifiersCopiedIntoAudit: false,
            scoreValuesRecordedInAudit: false,
            aggregateScoreRecordedInAudit: false,
            notificationsSeeded: false,
          },
        },
      });

      const closedParticipants: ParticipantRecord[] = cycle.participants.map(
        (participant) =>
          participant.status === "NOT_STARTED" ||
          participant.status === "IN_PROGRESS"
            ? {
                ...participant,
                status: "EXPIRED" as const,
                expiredAt: now,
              }
            : participant,
      );

      return resultFromCycle(
        {
          ...cycle,
          status: updated.status,
          closedAt: updated.closedAt,
          closedByUserId: null,
          metadata: updated.metadata,
          participants: closedParticipants,
        },
        "CLOSED",
      );
    },
    {
      maxWait:
        HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_FEEDBACK_DEADLINE_CLOSURE_POLICY.transactionTimeoutMs,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
