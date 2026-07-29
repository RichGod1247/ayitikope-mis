import { NextRequest } from "next/server";
import { readDirectorHeadteacherAppraisalStates } from "@/lib/appraisals/headteacherFeedbackReadStates";
import { approveAndOpenHeadteacherFeedbackCycleWithNotifications } from "@/lib/appraisals/headteacherFeedbackNotifications";
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
  participantFreezeAtOpen: true,
  notificationRowsSeededAtOpen: true,
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
    const queue = await readQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      scope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      queue,
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
  const cycleId = clean(parsed.body.cycleId);

  if (action !== "APPROVE_AND_OPEN") {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_DIRECTOR_QUEUE_ACTION",
    });
  }

  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_CYCLE_ID",
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
    const result = await approveAndOpenHeadteacherFeedbackCycleWithNotifications({
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
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_APPRAISAL_DIRECTOR_QUEUE_ACTION_ERROR]",
    });
  }
}
