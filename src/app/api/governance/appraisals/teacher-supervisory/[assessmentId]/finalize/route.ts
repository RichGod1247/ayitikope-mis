import { NextRequest } from "next/server";
import { finalizeTeacherSupervisoryAssessment } from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
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

  if (parsed.body.confirmFinalization !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "FINALIZATION_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const result = await finalizeTeacherSupervisoryAssessment({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      result,
      reviewCreated: false,
      cycleTransitioned: false,
      providerCalled: false,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_FINALIZE_API_ERROR]",
    });
  }
}
