import { NextRequest } from "next/server";
import { executeHeadteacherDirectorRelease } from "@/lib/appraisals/headteacherDirectorReviewRelease";
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

  const reviewId = clean(parsed.body.reviewId);
  if (!isLikelyIdentifier(reviewId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_REVIEW_ID",
    });
  }

  try {
    const result = await executeHeadteacherDirectorRelease({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      reviewId,
      note: parsed.body.note,
      confirm: parsed.body.confirm === true,
      governanceScope: reviewGovernanceScope(auth.scope),
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      result,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_RELEASE_API_ERROR]",
    });
  }
}
