import { NextRequest } from "next/server";
import {
  executeTeacherSupervisoryHosDecision,
  TEACHER_SUPERVISORY_HOS_DECISION_POLICY,
  type ExecuteTeacherSupervisoryHosDecisionResult,
} from "@/lib/appraisals/teacherSupervisoryHosReviewDecision";
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

const ALLOWED_BODY_FIELDS = new Set(["action", "reason", "confirm"]);

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function isHosReviewer(value: unknown) {
  return (
    normalizedRole(value) ===
    TEACHER_SUPERVISORY_HOS_DECISION_POLICY.reviewerRole
  );
}

function bodyContainsOnlyAllowedFields(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

function browserDecisionResult(
  result: ExecuteTeacherSupervisoryHosDecisionResult,
) {
  return {
    outcome: result.outcome,
  };
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

    if (!isHosReviewer(auth.ctx.roleName)) {
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
        error: "TEACHER_SUPERVISORY_HOS_DECISION_FIELDS_FORBIDDEN",
      });
    }

    const action = clean(parsed.body.action).toUpperCase();

    if (
      !(
        TEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions as readonly string[]
      ).includes(action)
    ) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_HOS_DECISION_ACTION_FORBIDDEN",
      });
    }

    if (parsed.body.confirm !== true) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_HOS_DECISION_CONFIRMATION_REQUIRED",
      });
    }

    const result = await executeTeacherSupervisoryHosDecision({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      action,
      reason: parsed.body.reason,
      confirm: true,
      governanceScope: auth.scope,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      result: browserDecisionResult(result),
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_HOS_DECISION_API_ERROR]",
    });
  }
}
