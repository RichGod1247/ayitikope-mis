// src/app/api/teacher/headteacher-appraisal/[cycleId]/finalize/route.ts
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { finalizeTeacherHeadteacherFeedbackResponse } from "@/lib/appraisals/headteacherFeedbackResponse";
import {
  clean,
  headteacherFeedbackApiError,
  isUuidIdentifier,
  jsonNoStore,
  objectBody,
  requestIsJson,
  requestMeta,
} from "@/app/api/teacher/headteacher-appraisal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

export async function POST(req: NextRequest, context: RouteContext) {
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

  if (!requestIsJson(req)) {
    return jsonNoStore(415, {
      ok: false,
      reqId,
      error: "CONTENT_TYPE_MUST_BE_JSON",
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

  const body = objectBody(await req.json().catch(() => null));
  if (!body) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON_BODY",
    });
  }

  if (body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "FINAL_SUBMISSION_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const result = await finalizeTeacherHeadteacherFeedbackResponse({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      tenantId: auth.ctx.tenantId,
      cycleId,
      reqId,
      ...requestMeta(req),
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      result,
    });
  } catch (error) {
    return headteacherFeedbackApiError({
      error,
      reqId,
      logTag: "[TEACHER_HEADTEACHER_APPRAISAL_FINALIZE_ERROR]",
    });
  }
}
