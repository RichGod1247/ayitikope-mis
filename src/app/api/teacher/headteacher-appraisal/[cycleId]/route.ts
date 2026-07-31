// src/app/api/teacher/headteacher-appraisal/[cycleId]/route.ts
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { loadTeacherHeadteacherFeedbackResponse } from "@/lib/appraisals/headteacherFeedbackResponse";
import {
  clean,
  headteacherFeedbackApiError,
  isUuidIdentifier,
  jsonNoStore,
} from "@/app/api/teacher/headteacher-appraisal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

export async function GET(req: NextRequest, context: RouteContext) {
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

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);

  if (!isUuidIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_CYCLE_ID",
    });
  }

  try {
    const item = await loadTeacherHeadteacherFeedbackResponse({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      tenantId: auth.ctx.tenantId,
      cycleId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      item,
    });
  } catch (error) {
    return headteacherFeedbackApiError({
      error,
      reqId,
      logTag: "[TEACHER_HEADTEACHER_APPRAISAL_LOAD_ERROR]",
    });
  }
}
