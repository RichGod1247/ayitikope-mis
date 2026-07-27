// src/app/api/teacher/headteacher-appraisal/route.ts
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { readTeacherHeadteacherAppraisalAssignmentState } from "@/lib/appraisals/headteacherFeedbackReadStates";
import {
  headteacherFeedbackApiError,
  jsonNoStore,
} from "@/app/api/teacher/headteacher-appraisal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });

  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  try {
    const state = await readTeacherHeadteacherAppraisalAssignmentState({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      tenantId: auth.ctx.tenantId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      state,
    });
  } catch (error) {
    return headteacherFeedbackApiError({
      error,
      reqId,
      logTag: "[TEACHER_HEADTEACHER_APPRAISAL_STATE_ERROR]",
    });
  }
}
