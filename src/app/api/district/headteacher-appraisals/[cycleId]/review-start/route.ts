import { NextRequest } from "next/server";
import { startHeadteacherDirectorReview } from "@/lib/appraisals/headteacherDirectorReview";
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

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

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
    const result = await startHeadteacherDirectorReview({
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
      reviewPackageUrl:
        `/api/district/headteacher-appraisals/${encodeURIComponent(cycleId)}/review-package`,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_REVIEW_START_API_ERROR]",
    });
  }
}
