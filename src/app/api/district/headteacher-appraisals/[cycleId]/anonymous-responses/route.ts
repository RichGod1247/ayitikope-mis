// src/app/api/district/headteacher-appraisals/[cycleId]/anonymous-responses/route.ts
import { NextRequest } from "next/server";
import { readHeadteacherDirectorAnonymousResponses } from "@/lib/appraisals/headteacherDirectorAnonymousResponses";
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

function anonymousResponseKey(req: NextRequest) {
  const value = clean(req.nextUrl.searchParams.get("respondentKey"));
  return value || undefined;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);

  try {
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

    const anonymousResponses =
      await readHeadteacherDirectorAnonymousResponses({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        cycleId,
        respondentKey: anonymousResponseKey(req),
        governanceScope: reviewGovernanceScope(auth.scope),
      });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      anonymousResponses,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_API_ERROR]",
    });
  }
}
