import { NextRequest } from "next/server";
import { createReturnedHeadteacherSupervisoryAssessmentRevision } from "@/lib/appraisals/headteacherSupervisoryAssessmentRevision";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
  objectBody,
  requestIsJson,
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

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireSupervisoryGovernanceApiContext(req);
  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }
  if (!requestIsJson(req)) {
    return jsonNoStore(415, {
      ok: false,
      reqId: meta.reqId,
      error: "JSON_BODY_REQUIRED",
    });
  }

  const params = await Promise.resolve(context.params);
  const assessmentId = clean(params?.assessmentId);
  const body = objectBody(await req.json().catch(() => null));
  if (!isUuidIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }
  if (body?.confirmRevision !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "REVISION_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const result =
      await createReturnedHeadteacherSupervisoryAssessmentRevision({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        returnedAssessmentId: assessmentId,
        reqId: meta.reqId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
      workspaceUrl:
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(result.revision.id)}`,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_REVISION_API_ERROR]",
    });
  }
}
