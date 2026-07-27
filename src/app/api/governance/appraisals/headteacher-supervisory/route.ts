import { NextRequest } from "next/server";
import { createHeadteacherSupervisoryAssessmentDraft } from "@/lib/appraisals/headteacherSupervisoryAssessmentDraft";
import {
  clean,
  isIsoDate,
  isLikelyIdentifier,
  jsonNoStore,
  objectBody,
  requestIsJson,
  requestMeta,
  requireSupervisoryGovernanceApiContext,
  supervisoryApiError,
} from "@/app/api/governance/appraisals/headteacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const body = objectBody(await req.json().catch(() => null));
  const cycleId = clean(body?.cycleId);
  const dateObserved = clean(body?.dateObserved);
  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_CYCLE_ID",
    });
  }
  if (!isIsoDate(dateObserved)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_OBSERVATION_DATE",
    });
  }

  try {
    const result = await createHeadteacherSupervisoryAssessmentDraft({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      dateObserved,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
      workspaceUrl:
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(result.assessment.id)}`,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_DRAFT_API_ERROR]",
    });
  }
}
