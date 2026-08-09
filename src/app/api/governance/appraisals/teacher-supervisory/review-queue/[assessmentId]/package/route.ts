import { NextRequest } from "next/server";
import {
  readTeacherSupervisoryReviewPackage,
  TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY,
} from "@/lib/appraisals/teacherSupervisoryReviewPackage";
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

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function reviewerRoleAllowed(value: unknown) {
  const role = normalizedRole(value);
  return (
    TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience as readonly string[]
  ).includes(role);
}

export async function GET(req: NextRequest, context: RouteContext) {
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

    const reviewPackage = await readTeacherSupervisoryReviewPackage({
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
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_REVIEW_PACKAGE_API_ERROR]",
    });
  }
}
