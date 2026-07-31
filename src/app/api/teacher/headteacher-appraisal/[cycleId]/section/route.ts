// src/app/api/teacher/headteacher-appraisal/[cycleId]/section/route.ts
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  type HeadteacherFeedbackScoreInput,
  saveTeacherHeadteacherFeedbackSection,
} from "@/lib/appraisals/headteacherFeedbackResponse";
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

function normalizeScores(
  value: unknown,
): HeadteacherFeedbackScoreInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 34) {
    return null;
  }

  const rows: HeadteacherFeedbackScoreInput[] = [];

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
    const result = await saveTeacherHeadteacherFeedbackSection({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      tenantId: auth.ctx.tenantId,
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
    return headteacherFeedbackApiError({
      error,
      reqId,
      logTag: "[TEACHER_HEADTEACHER_APPRAISAL_SECTION_SAVE_ERROR]",
    });
  }
}
