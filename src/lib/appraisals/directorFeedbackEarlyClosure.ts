import { AppraisalCycleStatus, AppraisalParticipantStatus, AppraisalResponseStatus, Prisma } from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { assertAppraisalCycleTransition } from "@/lib/appraisals/workflow";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY = {
  earlyClosureMode: "DIRECTOR_ALL_RESPONSES_FINALIZED",
  requiresExplicitConfirmation: true,
  eligibleCycleStatus: AppraisalCycleStatus.OPEN,
  deadlineMustRemainInFuture: true,
  allEligibleResponsesMustBeFinalized: true,
  participantSetPreserved: true,
  participantExpiryPerformed: false,
  finalizedResponsesPreserved: true,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  aggregateGeneratedInsideTransaction: false,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 20_000,
  transactionIsolation: "Serializable",
} as const;

export const DIRECTOR_FEEDBACK_EARLY_CLOSURE_AUDIT_ACTION =
  APPRAISAL_AUDIT_ACTIONS.CYCLE_CLOSED;

export type CloseCompletedDirectorFeedbackCycleEarlyInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  confirm: boolean;
  now?: Date;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  database?: DirectorFeedbackEarlyClosureDatabase;
};

export type CloseCompletedDirectorFeedbackCycleEarlyResult = {
  outcome: "CLOSED" | "ALREADY_CLOSED";
  cycleId: string;
  status: "CLOSED";
  closedAt: string;
  deadlineAt: string;
  eligibleResponseCount: number;
  finalizedResponseCount: number;
  expiredParticipantCount: 0;
  providerCalled: false;
};

type ParticipantRecord = {
  id: string;
  status: AppraisalParticipantStatus;
  finalizedAt: Date | null;
  response: null | {
    status: AppraisalResponseStatus;
    finalizedAt: Date | null;
    responseHash: string | null;
  };
};

type CycleRecord = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetRoleSnapshot: string | null;
  scopeZoneId: string;
  deadlineAt: Date | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
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

type DirectorFeedbackEarlyClosureTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  governanceOfficerAssignment: {
    findFirst(args: unknown): Promise<AssignmentRecord | null>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type DirectorFeedbackEarlyClosureDatabase = {
  appraisalCycle: DirectorFeedbackEarlyClosureTransactionClient["appraisalCycle"];
  governanceOfficerAssignment: DirectorFeedbackEarlyClosureTransactionClient["governanceOfficerAssignment"];
  auditLog: DirectorFeedbackEarlyClosureTransactionClient["auditLog"];
  $transaction<T>(
    operation: (tx: DirectorFeedbackEarlyClosureTransactionClient) => Promise<T>,
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
  deadlineAt: true,
  closedAt: true,
  closedByUserId: true,
  reviewStartedAt: true,
  releasedAt: true,
  responseWindowDays: true,
  minimumResponses: true,
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
      id: true,
      status: true,
      finalizedAt: true,
      response: {
        select: {
          status: true,
          finalizedAt: true,
          responseHash: true,
        },
      },
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
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireValidDate(value: Date | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_INVALID_NOW", 400);
  }
  return date;
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
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_SCOPE_FORBIDDEN", 403, {
      cycleId: cycle.id,
    });
  }
}

async function assertCurrentDirectorAssignment(
  tx: DirectorFeedbackEarlyClosureTransactionClient,
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
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_CURRENT_ASSIGNMENT_REQUIRED", 403);
  }
}

function finalizedEvidence(cycle: CycleRecord) {
  const eligible = cycle.participants.filter(
    (participant) => participant.status !== AppraisalParticipantStatus.REVOKED,
  );

  if (!eligible.length) {
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_ELIGIBLE_RESPONSES_REQUIRED", 409, {
      cycleId: cycle.id,
    });
  }

  for (const participant of eligible) {
    if (participant.status !== AppraisalParticipantStatus.FINALIZED) {
      fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_ALL_RESPONSES_REQUIRED", 409, {
        cycleId: cycle.id,
        eligibleResponseCount: eligible.length,
      });
    }

    const response = participant.response;
    if (
      !participant.finalizedAt ||
      !response ||
      response.status !== AppraisalResponseStatus.FINALIZED ||
      !response.finalizedAt ||
      !/^[0-9a-f]{64}$/i.test(clean(response.responseHash))
    ) {
      fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_FINALIZED_EVIDENCE_INVALID", 409, {
        cycleId: cycle.id,
      });
    }
  }

  return {
    eligibleResponseCount: eligible.length,
    finalizedResponseCount: eligible.length,
  };
}

function closedResult(cycle: CycleRecord): CloseCompletedDirectorFeedbackCycleEarlyResult {
  const metadata = objectValue(cycle.metadata);
  const earlyClosure = objectValue(metadata.directorFeedbackEarlyClosure);

  if (
    !cycle.closedAt ||
    !cycle.deadlineAt ||
    earlyClosure.earlyClosureMode !==
      DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY.earlyClosureMode ||
    earlyClosure.allEligibleResponsesFinalized !== true ||
    earlyClosure.participantExpiryPerformed !== false
  ) {
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_CYCLE_ALREADY_CLOSED", 409, {
      cycleId: cycle.id,
    });
  }

  const eligible = cycle.participants.filter(
    (participant) => participant.status !== AppraisalParticipantStatus.REVOKED,
  );
  const finalizedResponseCount = eligible.filter(
    (participant) => participant.status === AppraisalParticipantStatus.FINALIZED,
  ).length;

  return {
    outcome: "ALREADY_CLOSED",
    cycleId: cycle.id,
    status: "CLOSED",
    closedAt: cycle.closedAt.toISOString(),
    deadlineAt: cycle.deadlineAt.toISOString(),
    eligibleResponseCount: eligible.length,
    finalizedResponseCount,
    expiredParticipantCount: 0,
    providerCalled: false,
  };
}

export async function closeCompletedDirectorFeedbackCycleEarly(
  input: CloseCompletedDirectorFeedbackCycleEarlyInput,
): Promise<CloseCompletedDirectorFeedbackCycleEarlyResult> {
  if (input.confirm !== true) {
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_CONFIRMATION_REQUIRED", 400);
  }

  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(input.now);
  const reqId = clean(input.reqId).slice(0, 180) || null;

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_DIRECTOR_ONLY", 403, { actorRole });
  }

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "OPEN_DIRECTOR_FEEDBACK_CYCLE",
  );

  const database =
    input.database ?? (prisma as unknown as DirectorFeedbackEarlyClosureDatabase);

  return database.$transaction(
    async (tx) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: CYCLE_SELECT,
      });

      if (!cycle) {
        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_CYCLE_NOT_FOUND", 404, { cycleId });
      }

      assertCycleContract(cycle, actorUserId);
      await assertCurrentDirectorAssignment(tx, actorUserId, cycle.scopeZoneId, now);

      if (cycle.status === AppraisalCycleStatus.CLOSED) {
        return closedResult(cycle);
      }

      if (cycle.status !== AppraisalCycleStatus.OPEN) {
        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_OPEN_CYCLE_REQUIRED", 409, {
          cycleId,
          status: cycle.status,
        });
      }

      if (cycle.reviewStartedAt || cycle.releasedAt) {
        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_REVIEW_ALREADY_STARTED", 409, {
          cycleId,
        });
      }

      if (!cycle.deadlineAt) {
        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_DEADLINE_REQUIRED", 409, {
          cycleId,
        });
      }

      if (now.getTime() >= cycle.deadlineAt.getTime()) {
        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_DEADLINE_REACHED", 409, {
          cycleId,
          deadlineAt: cycle.deadlineAt.toISOString(),
        });
      }

      const evidence = finalizedEvidence(cycle);

      assertAppraisalCycleTransition(
        AppraisalCycleStatus.OPEN,
        AppraisalCycleStatus.CLOSED,
      );

      const updated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: AppraisalCycleStatus.OPEN,
          deadlineAt: cycle.deadlineAt,
          reviewStartedAt: null,
          releasedAt: null,
        },
        data: {
          status: AppraisalCycleStatus.CLOSED,
          closedAt: now,
          closedByUserId: actorUserId,
          metadata: {
            ...objectValue(cycle.metadata),
            directorFeedbackEarlyClosure: {
              schemaVersion: 1,
              earlyClosureMode:
                DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY.earlyClosureMode,
              actorRole: "DISTRICT_DIRECTOR",
              occurredAt: now.toISOString(),
              deadlineAt: cycle.deadlineAt.toISOString(),
              eligibleResponseCount: evidence.eligibleResponseCount,
              finalizedResponseCount: evidence.finalizedResponseCount,
              allEligibleResponsesFinalized: true,
              participantSetPreserved: true,
              participantExpiryPerformed: false,
              finalizedResponsesPreserved: true,
              respondentIdentitiesIncluded: false,
              scoreValuesIncluded: false,
              notificationsSeeded: false,
              providerCalled: false,
            },
          },
        },
      });

      if (updated.count !== 1) {
        const raced = await tx.appraisalCycle.findUnique({
          where: { id: cycle.id },
          select: CYCLE_SELECT,
        });

        if (raced?.status === AppraisalCycleStatus.CLOSED) {
          return closedResult(raced);
        }

        fail("DIRECTOR_FEEDBACK_EARLY_CLOSE_CONFLICT", 409, { cycleId });
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: DIRECTOR_FEEDBACK_EARLY_CLOSURE_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: DIRECTOR_FEEDBACK_EARLY_CLOSURE_AUDIT_ACTION,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            earlyClosureMode:
              DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY.earlyClosureMode,
            actorRole: "DISTRICT_DIRECTOR",
            cycleId: cycle.id,
            priorStatus: AppraisalCycleStatus.OPEN,
            nextStatus: AppraisalCycleStatus.CLOSED,
            deadlineAt: cycle.deadlineAt.toISOString(),
            closedAt: now.toISOString(),
            eligibleResponseCount: evidence.eligibleResponseCount,
            finalizedResponseCount: evidence.finalizedResponseCount,
            expiredParticipantCount: 0,
            allEligibleResponsesFinalized: true,
            participantSetPreserved: true,
            participantExpiryPerformed: false,
            respondentIdentityIncluded: false,
            schoolIdentityIncluded: false,
            scoreValuesRecordedInAudit: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "CLOSED",
        cycleId: cycle.id,
        status: "CLOSED",
        closedAt: now.toISOString(),
        deadlineAt: cycle.deadlineAt.toISOString(),
        eligibleResponseCount: evidence.eligibleResponseCount,
        finalizedResponseCount: evidence.finalizedResponseCount,
        expiredParticipantCount: 0,
        providerCalled: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_EARLY_CLOSURE_POLICY.transactionTimeoutMs,
    },
  );
}
