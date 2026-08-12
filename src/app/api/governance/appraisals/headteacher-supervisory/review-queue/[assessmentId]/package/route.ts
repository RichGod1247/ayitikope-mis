import { NextRequest } from "next/server";
import {
  HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY,
  readHeadteacherSupervisoryReviewPackage,
} from "@/lib/appraisals/headteacherSupervisoryReviewPackage";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
  requestMeta,
  requireSupervisoryGovernanceApiContext,
  supervisoryApiError,
} from "@/app/api/governance/appraisals/headteacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

export async function GET(req: NextRequest, context: RouteContext) {
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
      HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience
    ) {
      return jsonNoStore(403, {
        ok: false,
        reqId: meta.reqId,
        error: "FORBIDDEN",
      });
    }

    const params = await Promise.resolve(context.params);
    const assessmentId = clean(params?.assessmentId);
    if (!isUuidIdentifier(assessmentId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_ASSESSMENT_ID",
      });
    }

    const reviewPackage = await readHeadteacherSupervisoryReviewPackage({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      governanceScope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewPackage,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_API_ERROR]",
    });
  }
}
