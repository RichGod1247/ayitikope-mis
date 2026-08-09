import { NextRequest } from "next/server";
import { startTeacherSupervisoryReviewAdmission } from "@/lib/appraisals/teacherSupervisoryReviewAdmission";
import { TEACHER_SUPERVISORY_REVIEW_POLICY } from "@/lib/appraisals/teacherSupervisoryReview";
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

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function reviewerRoleAllowed(value: unknown) {
  const role = normalizedRole(value);
  return (
    TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles as readonly string[]
  ).includes(role);
}

function confirmOnlyBody(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => key === "confirm");
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

    if (!reviewerRoleAllowed(auth.ctx.roleName)) {
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

    if (!confirmOnlyBody(parsed.body)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_REVIEW_ADMISSION_CONFIRM_ONLY",
      });
    }

    if (parsed.body.confirm !== true) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_REVIEW_ADMISSION_CONFIRMATION_REQUIRED",
      });
    }

    const result = await startTeacherSupervisoryReviewAdmission({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      confirm: true,
      governanceScope: auth.scope,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(result.outcome === "STARTED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_REVIEW_ADMISSION_API_ERROR]",
    });
  }
}
