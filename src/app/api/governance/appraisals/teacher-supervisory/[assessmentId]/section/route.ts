import { NextRequest } from "next/server";
import { saveTeacherSupervisoryAssessmentSection } from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
  objectBody,
  readBoundedJsonObject,
  requestIsJson,
  requestMeta,
  requireTeacherSupervisoryGovernanceApiContext,
  teacherSupervisoryApiError,
} from "@/app/api/governance/appraisals/teacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireTeacherSupervisoryGovernanceApiContext(req);
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
  if (!isUuidIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }

  const parsed = await readBoundedJsonObject(req);
  if (!parsed.ok) {
    return jsonNoStore(parsed.status, {
      ok: false,
      reqId: meta.reqId,
      error: parsed.error,
    });
  }

  const body = parsed.body;
  const sectionKey = clean(body.sectionKey);
  const rawScores = Array.isArray(body.scores) ? body.scores : [];

  if (!sectionKey || rawScores.length === 0) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "SECTION_SCORES_REQUIRED",
    });
  }

  if (
    body.generalComment != null ||
    body.comment != null ||
    body.comments != null ||
    body.note != null
  ) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "TEACHER_SUPERVISORY_COMMENT_USE_COMMENT_ENDPOINT",
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
    const result = await saveTeacherSupervisoryAssessmentSection({
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
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_SECTION_API_ERROR]",
    });
  }
}
