import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { finalizeHeadteacherDirectorFeedbackResponse } from "@/lib/appraisals/directorFeedbackResponse";
import {
  clean,
  directorFeedbackApiError,
  isLikelyIdentifier,
  jsonNoStore,
  objectBody,
  requestIsJson,
  requestMeta,
} from "@/app/api/headteacher/director-feedback/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

export async function POST(
  req: NextRequest,
  context: RouteContext,
) {
  const reqId = randomUUID();
  const ctx = await getHeadteacherApiContext();

  if (!ctx) {
    return jsonNoStore(401, {
      ok: false,
      reqId,
      error: "UNAUTHORIZED",
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

  if (!isLikelyIdentifier(cycleId)) {
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
    const result = await finalizeHeadteacherDirectorFeedbackResponse({
      actorUserId: ctx.userId,
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
    return directorFeedbackApiError({
      error,
      reqId,
      logTag: "[HEADTEACHER_DIRECTOR_FEEDBACK_FINALIZE_ERROR]",
    });
  }
}
