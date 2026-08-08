import { NextRequest } from "next/server";
import { loadTeacherSupervisoryAssessmentWorkspace } from "@/lib/appraisals/teacherSupervisoryAssessmentWorkspace";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
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

export async function GET(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireTeacherSupervisoryGovernanceApiContext(req);
  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
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

  try {
    const workspace = await loadTeacherSupervisoryAssessmentWorkspace({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      workspace,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_WORKSPACE_API_ERROR]",
    });
  }
}
