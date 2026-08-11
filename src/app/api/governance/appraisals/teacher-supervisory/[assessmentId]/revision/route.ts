import { NextRequest } from "next/server";
import {
  createReturnedTeacherSupervisoryAssessmentRevision,
} from "@/lib/appraisals/teacherSupervisoryAssessmentRevision";
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

const ALLOWED_BODY_FIELDS = new Set(["confirmRevision"]);

function bodyContainsOnlyAllowedFields(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);

  try {
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

    if (!requestIsJson(req)) {
      return jsonNoStore(415, {
        ok: false,
        reqId: meta.reqId,
        error: "JSON_BODY_REQUIRED",
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

    if (!bodyContainsOnlyAllowedFields(parsed.body)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_REVISION_FIELDS_FORBIDDEN",
      });
    }

    if (parsed.body.confirmRevision !== true) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_REVISION_CONFIRMATION_REQUIRED",
      });
    }

    const result =
      await createReturnedTeacherSupervisoryAssessmentRevision({
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
      result: {
        outcome: result.outcome,
      },
      workspaceUrl:
        `/governance/appraisals/teacher-supervisory?assessmentId=${encodeURIComponent(result.revision.id)}`,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_REVISION_API_ERROR]",
    });
  }
}
