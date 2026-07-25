import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { listHeadteacherDirectorFeedbackAssignments } from "@/lib/appraisals/directorFeedbackResponse";
import {
  directorFeedbackApiError,
  jsonNoStore,
} from "@/app/api/headteacher/director-feedback/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const reqId = randomUUID();
  const ctx = await getHeadteacherApiContext();

  if (!ctx) {
    return jsonNoStore(401, {
      ok: false,
      reqId,
      error: "UNAUTHORIZED",
    });
  }

  try {
    const items = await listHeadteacherDirectorFeedbackAssignments({
      actorUserId: ctx.userId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      items,
    });
  } catch (error) {
    return directorFeedbackApiError({
      error,
      reqId,
      logTag: "[HEADTEACHER_DIRECTOR_FEEDBACK_LIST_ERROR]",
    });
  }
}
