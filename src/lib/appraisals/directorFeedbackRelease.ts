// src/lib/appraisals/directorFeedbackRelease.ts
import { randomUUID } from "crypto";
import { AppraisalCycleStatus, Prisma } from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { getDirectorFeedbackReviewWorkspace } from "@/lib/appraisals/directorFeedbackReview";
import {
  appraisalReleaseReadiness,
  assertAppraisalCycleTransition,
} from "@/lib/appraisals/workflow";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_RELEASE_POLICY = {
  workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
  releaseMode: "INTERIM_DEVELOPMENTAL_FEEDBACK",
  supervisoryAssessmentRequired: false,
  directorMayReleaseOwnFeedback: true,
  respondentNotificationCreated: false,
  providerDeliveryTriggered: false,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 15_000,
} as const;

type JsonRecord = Record<string, unknown>;

export type ReleaseDirectorFeedbackResult = {
  outcome: "RELEASED" | "ALREADY_RELEASED";
  workspace: Awaited<ReturnType<typeof getDirectorFeedbackReviewWorkspace>>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
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

const RELEASE_CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetRoleSnapshot: true,
  reviewStartedAt: true,
  releasedAt: true,
  releasedByUserId: true,
  metadata: true,
  instrumentVersion: {
    select: {
      version: true,
      instrument: { select: { code: true } },
    },
  },
  aggregates: {
    orderBy: { version: "desc" },
    take: 1,
    select: {
      version: true,
      finalizedResponses: true,
      minimumResponses: true,
      releaseEligible: true,
      sourceHash: true,
    },
  },
} as const satisfies Prisma.AppraisalCycleSelect;

type ReleaseCycleRecord = Prisma.AppraisalCycleGetPayload<{
  select: typeof RELEASE_CYCLE_SELECT;
}>;

function assertDirectorReleaseScope(
  cycle: ReleaseCycleRecord,
  actorUserId: string,
) {
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR" ||
    cycle.instrumentVersion.version !== DIRECTOR_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.instrument.code !== DIRECTOR_FEEDBACK_POLICY.instrumentCode
  ) {
    fail("DIRECTOR_FEEDBACK_RELEASE_SCOPE_FORBIDDEN", 403);
  }
}

export async function releaseDirectorFeedback(input: {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}): Promise<ReleaseDirectorFeedbackResult> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = effectiveRole(input.actorRoleName);
  const cycleId = clean(input.cycleId);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "RELEASE_DIRECTOR_FEEDBACK",
  );

  const outcome = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: RELEASE_CYCLE_SELECT,
      });

      if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
      assertDirectorReleaseScope(cycle, actorUserId);

      if (cycle.status === AppraisalCycleStatus.RELEASED) {
        return "ALREADY_RELEASED" as const;
      }

      if (cycle.status !== AppraisalCycleStatus.UNDER_REVIEW) {
        fail("DIRECTOR_FEEDBACK_CYCLE_NOT_READY_FOR_RELEASE", 409, {
          status: cycle.status,
        });
      }

      if (!cycle.reviewStartedAt) {
        fail("DIRECTOR_FEEDBACK_REVIEW_NOT_STARTED", 409);
      }

      const snapshot = cycle.aggregates[0] ?? null;
      const readiness = appraisalReleaseReadiness({
        status: cycle.status,
        finalizedResponses: snapshot?.finalizedResponses ?? 0,
        minimumResponses: snapshot?.minimumResponses ?? 0,
        aggregateSnapshotPresent: Boolean(snapshot),
        supervisoryAssessmentRequired:
          DIRECTOR_FEEDBACK_RELEASE_POLICY.supervisoryAssessmentRequired,
        supervisoryAssessmentAccepted: true,
      });

      if (!snapshot) {
        fail("DIRECTOR_FEEDBACK_AGGREGATE_SNAPSHOT_MISSING", 409);
      }

      if (!snapshot.releaseEligible || !readiness.ready) {
        fail("DIRECTOR_FEEDBACK_RELEASE_READINESS_BLOCKED", 409, {
          reasons: readiness.reasons,
          finalizedResponses: snapshot.finalizedResponses,
          minimumResponses: snapshot.minimumResponses,
        });
      }

      assertAppraisalCycleTransition(
        AppraisalCycleStatus.UNDER_REVIEW,
        AppraisalCycleStatus.RELEASED,
      );

      const updated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: AppraisalCycleStatus.UNDER_REVIEW,
          releasedAt: null,
        },
        data: {
          status: AppraisalCycleStatus.RELEASED,
          releasedAt: now,
          releasedByUserId: actorUserId,
          metadata: {
            ...objectValue(cycle.metadata),
            directorFeedbackRelease: {
              actorRole,
              occurredAt: now.toISOString(),
              releaseMode: DIRECTOR_FEEDBACK_RELEASE_POLICY.releaseMode,
              aggregateVersion: snapshot.version,
              aggregateSourceHash: snapshot.sourceHash,
              thresholdVerified: true,
              supervisoryAssessmentRequired: false,
              officialRegionalAppraisalReplaced: false,
              respondentIdentityIncluded: false,
              schoolIdentityIncluded: false,
              individualAnswersIncluded: false,
            },
          },
        },
      });

      if (updated.count !== 1) {
        const raced = await tx.appraisalCycle.findUnique({
          where: { id: cycle.id },
          select: { status: true },
        });

        if (raced?.status === AppraisalCycleStatus.RELEASED) {
          return "ALREADY_RELEASED" as const;
        }

        fail("DIRECTOR_FEEDBACK_RELEASE_CONFLICT", 409);
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.CYCLE_RELEASED,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_RELEASED,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            actorRole,
            cycleId: cycle.id,
            priorStatus: AppraisalCycleStatus.UNDER_REVIEW,
            nextStatus: AppraisalCycleStatus.RELEASED,
            releaseMode: DIRECTOR_FEEDBACK_RELEASE_POLICY.releaseMode,
            aggregateVersion: snapshot.version,
            sourceHash: snapshot.sourceHash,
            finalizedResponses: snapshot.finalizedResponses,
            minimumResponses: snapshot.minimumResponses,
            supervisoryAssessmentRequired: false,
            officialRegionalAppraisalReplaced: false,
            respondentIdentityIncluded: false,
            schoolIdentityIncluded: false,
            individualAnswersIncluded: false,
            scoreValuesRecordedInAudit: false,
            notificationsQueued: false,
          },
        },
      });

      return "RELEASED" as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: DIRECTOR_FEEDBACK_RELEASE_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_RELEASE_POLICY.transactionTimeoutMs,
    },
  );

  const workspace = await getDirectorFeedbackReviewWorkspace({
    actorUserId,
    actorRoleName: actorRole,
  });

  return { outcome, workspace };
}
