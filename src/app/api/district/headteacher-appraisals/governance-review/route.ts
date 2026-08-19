import { NextRequest } from "next/server";
import { listHeadteacherDirectorGovernanceReviewQueue } from "@/lib/appraisals/headteacherDirectorGovernanceReview";
import {
  directorReviewApiError,
  jsonNoStore,
  requestMeta,
  requireDirectorReviewApiContext,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (new URL(req.url).searchParams.size !== 0) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_DIRECTOR_GOVERNANCE_QUEUE_QUERY_FIELDS_FORBIDDEN",
    });
  }

  try {
    const queue = await listHeadteacherDirectorGovernanceReviewQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
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
      logTag: "[HEADTEACHER_DIRECTOR_GOVERNANCE_QUEUE_API_ERROR]",
    });
  }
}
