// src/app/api/headteacher/director-feedback/[cycleId]/route.ts
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { loadHeadteacherDirectorFeedbackResponse } from "@/lib/appraisals/directorFeedbackResponse";
import {
  clean,
  directorFeedbackApiError,
  isLikelyIdentifier,
  jsonNoStore,
} from "@/app/api/headteacher/director-feedback/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

export async function GET(
  _req: NextRequest,
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

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);

  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_CYCLE_ID",
    });
  }

  try {
    const item = await loadHeadteacherDirectorFeedbackResponse({
      actorUserId: ctx.userId,
      cycleId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      item,
    });
  } catch (error) {
    return directorFeedbackApiError({
      error,
      reqId,
      logTag: "[HEADTEACHER_DIRECTOR_FEEDBACK_LOAD_ERROR]",
    });
  }
}
