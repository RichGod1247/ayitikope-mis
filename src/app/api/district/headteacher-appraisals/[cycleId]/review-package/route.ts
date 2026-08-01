//src/app/api/district/headteacher-appraisals/[cycleId]/review-package/route.ts
import { NextRequest } from "next/server";
import { readHeadteacherDirectorReviewPackage } from "@/lib/appraisals/headteacherDirectorReviewPackage";
import {
  clean,
  directorReviewApiError,
  isLikelyIdentifier,
  jsonNoStore,
  requestMeta,
  requireDirectorReviewApiContext,
  reviewGovernanceScope,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

export async function GET(req: NextRequest, context: RouteContext) {
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

  try {
    const reviewPackage = await readHeadteacherDirectorReviewPackage({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      governanceScope: reviewGovernanceScope(auth.scope),
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewPackage,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_API_ERROR]",
    });
  }
}
