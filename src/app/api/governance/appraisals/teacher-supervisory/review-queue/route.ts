import { NextRequest } from "next/server";
import { readTeacherSupervisoryReviewQueue } from "@/lib/appraisals/teacherSupervisoryReviewQueue";
import { TEACHER_SUPERVISORY_REVIEW_POLICY } from "@/lib/appraisals/teacherSupervisoryReview";
import {
  clean,
  jsonNoStore,
  requestMeta,
  requireTeacherSupervisoryGovernanceApiContext,
  teacherSupervisoryApiError,
} from "@/app/api/governance/appraisals/teacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function reviewerRoleAllowed(value: unknown) {
  const role = normalizedRole(value);
  return (
    TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles as readonly string[]
  ).includes(role);
}

export async function GET(req: NextRequest) {
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

    const reviewQueue = await readTeacherSupervisoryReviewQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewQueue,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_REVIEW_QUEUE_API_ERROR]",
    });
  }
}
