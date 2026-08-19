import { NextRequest } from "next/server";
import { startHeadteacherStaffFeedbackReview } from "@/lib/appraisals/headteacherStaffFeedbackReview";
import {
  clean,
  isLikelyIdentifier,
  jsonNoStore,
  readJsonObject,
  requestMeta,
  requireDirectorReviewApiContext,
  reviewGovernanceScope,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

type ServiceError = Error & { code?: unknown; status?: unknown; details?: unknown };

function serviceError(error: unknown, reqId: string) {
  const candidate = error as ServiceError;
  const code = clean(candidate?.code || candidate?.message);
  const status = Number(candidate?.status);
  if (
    code.startsWith("HEADTEACHER_STAFF_FEEDBACK_REVIEW_") &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 499
  ) {
    return jsonNoStore(status, {
      ok: false,
      reqId,
      error: code,
      ...(candidate.details && typeof candidate.details === "object"
        ? { details: candidate.details }
        : {}),
    });
  }
  console.error("[HEADTEACHER_STAFF_FEEDBACK_REVIEW_START_API_ERROR]", {
    reqId,
    error,
  });
  return jsonNoStore(500, {
    ok: false,
    reqId,
    error: "HEADTEACHER_STAFF_FEEDBACK_REVIEW_REQUEST_FAILED",
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireDirectorReviewApiContext(req);
  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);
  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_CYCLE_ID",
    });
  }

  const parsed = await readJsonObject({ req, reqId: meta.reqId });
  if (!parsed.ok) return parsed.response;

  try {
    const result = await startHeadteacherStaffFeedbackReview({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      confirm: parsed.body.confirm === true,
      governanceScope: reviewGovernanceScope(auth.scope),
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(result.outcome === "STARTED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
    });
  } catch (error) {
    return serviceError(error, meta.reqId);
  }
}
