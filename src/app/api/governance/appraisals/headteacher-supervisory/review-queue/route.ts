import { NextRequest } from "next/server";
import {
  HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY,
  readHeadteacherSupervisoryReviewQueue,
} from "@/lib/appraisals/headteacherSupervisoryReviewQueue";
import {
  clean,
  jsonNoStore,
  requestMeta,
  requireSupervisoryGovernanceApiContext,
  supervisoryApiError,
} from "@/app/api/governance/appraisals/headteacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

export async function GET(req: NextRequest) {
  const meta = requestMeta(req);

  try {
    const auth = await requireSupervisoryGovernanceApiContext(req);
    if (!auth.ok) {
      return jsonNoStore(auth.res.status, {
        ok: false,
        reqId: meta.reqId,
        error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      });
    }

    if (
      normalizedRole(auth.ctx.roleName) !==
      HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole
    ) {
      return jsonNoStore(403, {
        ok: false,
        reqId: meta.reqId,
        error: "FORBIDDEN",
      });
    }

    const reviewQueue = await readHeadteacherSupervisoryReviewQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewQueue,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_API_ERROR]",
    });
  }
}
