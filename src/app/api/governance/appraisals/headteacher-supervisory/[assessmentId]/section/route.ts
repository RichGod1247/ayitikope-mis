import { NextRequest } from "next/server";
import { saveHeadteacherSupervisoryAssessmentSection } from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
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
  const sectionKey = clean(body?.sectionKey);
  const rawScores = Array.isArray(body?.scores) ? body?.scores : [];

  if (!isUuidIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }
  if (!sectionKey || rawScores.length === 0) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "SECTION_SCORES_REQUIRED",
    });
  }
  if (body?.comment != null || body?.comments != null || body?.note != null) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_SUPERVISORY_COMMENTS_FORBIDDEN",
    });
  }

  const scores = rawScores.map((raw) => {
    const score = objectBody(raw);
    return {
      itemKey: clean(score?.itemKey),
      score: score?.score == null ? null : Number(score.score),
      notApplicable: score?.notApplicable === true,
    };
  });

  try {
    const result = await saveHeadteacherSupervisoryAssessmentSection({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      sectionKey,
      scores,
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
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_SECTION_API_ERROR]",
    });
  }
}
