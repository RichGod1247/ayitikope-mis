import { NextRequest } from "next/server";
import { readDirectorHeadteacherAppraisalStates } from "@/lib/appraisals/headteacherFeedbackReadStates";
import {
  approveAndOpenHeadteacherFeedbackCycleWithNotifications,
  directOpenHeadteacherFeedbackCycleWithNotifications,
} from "@/lib/appraisals/headteacherFeedbackNotifications";
import { readHeadteacherFeedbackDirectOpenTargets } from "@/lib/appraisals/headteacherFeedbackDirectOpen";
import { closeCompletedHeadteacherFeedbackCycleEarly } from "@/lib/appraisals/headteacherFeedbackDeadlineClosure";
import { sealHeadteacherFeedbackAggregateSnapshot } from "@/lib/appraisals/headteacherFeedbackAggregateSnapshot";
import {
  clean,
  directorReviewApiError,
  isLikelyIdentifier,
  jsonNoStore,
  readJsonObject,
  requestMeta,
  requireDirectorReviewApiContext,
  reviewGovernanceScope,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HEADTEACHER_APPRAISAL_DIRECTOR_QUEUE_API_POLICY = {
  audience: "DISTRICT_DIRECTOR",
  methods: ["GET", "POST"] as const,
  queueScope: "AUTHORIZED_DISTRICT_ONLY",
  manualReferenceEntryRequired: false,
  cachePolicy: "NO_STORE",
  approvalRequiresConfirmation: true,
  directOpenRequiresConfirmation: true,
  directOpenTargetDiscoveryReadOnly: true,
  directOpenUsesExistingLifecycleEngine: true,
  participantFreezeAtOpen: true,
  notificationRowsSeededAtOpen: true,
  earlyCompletionDetectedFromFrozenParticipantCounts: true,
  earlyClosureRequiresAllEligibleResponsesFinalized: true,
  earlyClosureRequiresDirectorConfirmation: true,
  earlyClosureExpiresParticipants: false,
  earlyClosureSealsAggregateSnapshot: true,
  governanceAssessmentRequiredForStaffClosure: false,
  reviewStartedByEarlyClosure: false,
  providerCallsAllowed: false,
  respondentIdentitiesReturned: false,
  individualStaffResponsesReturned: false,
} as const;

async function readQueue(args: {
  actorUserId: string;
  actorRoleName: unknown;
  scope: {
    isSuperAdmin: boolean;
    tenantIds: readonly string[];
  };
}) {
  return readDirectorHeadteacherAppraisalStates({
    actorUserId: args.actorUserId,
    actorRoleName: args.actorRoleName,
    governanceScope: reviewGovernanceScope(args.scope),
    limit: 100,
  });
}

async function readDirectOpenTargets(args: {
  actorUserId: string;
  actorRoleName: unknown;
  scope: {
    isSuperAdmin: boolean;
    tenantIds: readonly string[];
  };
}) {
  return readHeadteacherFeedbackDirectOpenTargets({
    actorUserId: args.actorUserId,
    actorRoleName: args.actorRoleName,
    governanceScope: reviewGovernanceScope(args.scope),
  });
}

async function readDirectorWork(args: {
  actorUserId: string;
  actorRoleName: unknown;
  scope: {
    isSuperAdmin: boolean;
    tenantIds: readonly string[];
  };
}) {
  const [queue, directOpenTargets] = await Promise.all([
    readQueue(args),
    readDirectOpenTargets(args),
  ]);

  return { queue, directOpenTargets };
}

export async function GET(req: NextRequest) {
  const meta = requestMeta(req);
  const auth = await requireDirectorReviewApiContext(req);

  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  try {
    const work = await readDirectorWork({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      scope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      ...work,
      providerCalled: false,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_APPRAISAL_DIRECTOR_QUEUE_API_ERROR]",
    });
  }
}

export async function POST(req: NextRequest) {
  const meta = requestMeta(req);
  const auth = await requireDirectorReviewApiContext(req);

  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const parsed = await readJsonObject({ req, reqId: meta.reqId });
  if (!parsed.ok) return parsed.response;

  const action = clean(parsed.body.action).toUpperCase();

  if (
    action !== "DIRECT_OPEN" &&
    action !== "APPROVE_AND_OPEN" &&
    action !== "CLOSE_COMPLETED_EARLY"
  ) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_DIRECTOR_QUEUE_ACTION",
    });
  }

  if (parsed.body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "EXPLICIT_CONFIRMATION_REQUIRED",
    });
  }

  try {
    if (action === "DIRECT_OPEN") {
      const targetHeadteacherUserId = clean(
        parsed.body.targetHeadteacherUserId,
      );
      const targetTenantId = clean(parsed.body.targetTenantId);
      const directOpenKey = clean(parsed.body.directOpenKey);

      if (!isLikelyIdentifier(targetHeadteacherUserId)) {
        return jsonNoStore(400, {
          ok: false,
          reqId: meta.reqId,
          error: "INVALID_TARGET_HEADTEACHER_USER_ID",
        });
      }

      if (!isLikelyIdentifier(targetTenantId)) {
        return jsonNoStore(400, {
          ok: false,
          reqId: meta.reqId,
          error: "INVALID_TARGET_TENANT_ID",
        });
      }

      if (!directOpenKey) {
        return jsonNoStore(400, {
          ok: false,
          reqId: meta.reqId,
          error: "DIRECT_OPEN_KEY_REQUIRED",
        });
      }

      const result =
        await directOpenHeadteacherFeedbackCycleWithNotifications({
          actorUserId: auth.ctx.userId,
          actorRoleName: auth.ctx.roleName,
          governanceScope: reviewGovernanceScope(auth.scope),
          targetHeadteacherUserId,
          targetTenantId,
          directOpenKey,
          openingNote: null,
          requestedRespondentUserIds: undefined,
          reqId: meta.reqId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

      const work = await readDirectorWork({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        scope: auth.scope,
      });

      return jsonNoStore(
        result.outcome === "DIRECTLY_OPENED" ? 201 : 200,
        {
          ok: true,
          reqId: meta.reqId,
          result,
          ...work,
          providerCalled: false,
        },
      );
    }

    const cycleId = clean(parsed.body.cycleId);

    if (!isLikelyIdentifier(cycleId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_CYCLE_ID",
      });
    }

    if (action === "APPROVE_AND_OPEN") {
      const result =
        await approveAndOpenHeadteacherFeedbackCycleWithNotifications({
          actorUserId: auth.ctx.userId,
          actorRoleName: auth.ctx.roleName,
          governanceScope: reviewGovernanceScope(auth.scope),
          cycleId,
          approvalNote: null,
          requestedRespondentUserIds: undefined,
          reqId: meta.reqId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

      const queue = await readQueue({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        scope: auth.scope,
      });

      return jsonNoStore(
        result.outcome === "APPROVED_AND_OPENED" ? 201 : 200,
        {
          ok: true,
          reqId: meta.reqId,
          result,
          queue,
          providerCalled: false,
        },
      );
    }

    const closure = await closeCompletedHeadteacherFeedbackCycleEarly({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: reviewGovernanceScope(auth.scope),
      cycleId,
      confirm: true,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const aggregate = await sealHeadteacherFeedbackAggregateSnapshot({
      cycleId,
      reqId: meta.reqId,
    });

    if (!aggregate.snapshot) {
      return jsonNoStore(409, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_FEEDBACK_EARLY_CLOSURE_AGGREGATE_NOT_READY",
        closureCommitted: closure.status === "CLOSED",
      });
    }

    const queue = await readQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      scope: auth.scope,
    });

    return jsonNoStore(closure.outcome === "CLOSED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result: {
        action: "CLOSE_COMPLETED_EARLY",
        closure,
        aggregate,
        staffFeedbackClosed: true,
        governanceAssessmentRequiredForClosure: false,
        reviewStarted: false,
        providerCalled: false,
      },
      queue,
      providerCalled: false,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_APPRAISAL_DIRECTOR_QUEUE_ACTION_ERROR]",
    });
  }
}
