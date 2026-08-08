import { NextRequest } from "next/server";
import { readTeacherSupervisoryObservationOptions } from "@/lib/appraisals/teacherSupervisoryObservationOptions";
import {
  clean,
  isIsoDate,
  isLikelyIdentifier,
  jsonNoStore,
  requestMeta,
  requireTeacherSupervisoryGovernanceApiContext,
  teacherSupervisoryApiError,
} from "@/app/api/governance/appraisals/teacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const url = new URL(req.url);
    const targetUserId = clean(url.searchParams.get("targetUserId"));
    const targetTenantId = clean(url.searchParams.get("targetTenantId"));
    const dateObserved = clean(url.searchParams.get("dateObserved"));

    if (!isLikelyIdentifier(targetUserId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_TARGET_USER_ID",
      });
    }

    if (!isLikelyIdentifier(targetTenantId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_TARGET_TENANT_ID",
      });
    }

    if (!isIsoDate(dateObserved)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_OBSERVATION_DATE",
      });
    }

    const options = await readTeacherSupervisoryObservationOptions({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
      targetUserId,
      targetTenantId,
      dateObserved,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      options,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_API_ERROR]",
    });
  }
}
