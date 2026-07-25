import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  type DirectorFeedbackScoreInput,
  saveHeadteacherDirectorFeedbackSection,
} from "@/lib/appraisals/directorFeedbackResponse";
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

function normalizeScores(
  value: unknown,
): DirectorFeedbackScoreInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 35) {
    return null;
  }

  const rows: DirectorFeedbackScoreInput[] = [];

  for (const entry of value) {
    const body = objectBody(entry);
    if (!body) return null;

    const itemKey = clean(body.itemKey);
    if (!itemKey || itemKey.length > 80) return null;

    const rawScore = body.score;
    const score =
      rawScore == null || clean(rawScore) === ""
        ? null
        : Number(rawScore);

    rows.push({
      itemKey,
      score,
      notApplicable: body.notApplicable === true,
    });
  }

  return rows;
}

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

  const sectionKey = clean(body.sectionKey);
  const scores = normalizeScores(body.scores);

  if (!sectionKey || sectionKey.length > 80) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_SECTION_KEY",
    });
  }

  if (!scores) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_SECTION_SCORES",
    });
  }

  try {
    const result = await saveHeadteacherDirectorFeedbackSection({
      actorUserId: ctx.userId,
      cycleId,
      sectionKey,
      scores,
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
      logTag: "[HEADTEACHER_DIRECTOR_FEEDBACK_SECTION_SAVE_ERROR]",
    });
  }
}
