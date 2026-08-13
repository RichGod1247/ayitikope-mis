import { NextRequest } from "next/server";
import { extendExpiredHeadteacherFeedbackCycle } from "@/lib/appraisals/headteacherFeedbackDeadlineExtension";
import {
  clean,
  directorReviewApiError,
  isLikelyIdentifier,
  jsonNoStore,
  readJsonObject,
  requestMeta,
  requireDirectorReviewApiContext,
  reviewGovernanceScope,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ cycleId: string }>
    | { cycleId: string };
};

const ALLOWED_BODY_FIELDS = new Set(["confirm"]);

function bodyContainsOnlyAllowedFields(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireDirectorReviewApiContext(req);

  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);

  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_CYCLE_ID",
    });
  }

  const parsed = await readJsonObject({ req, reqId: meta.reqId });
  if (!parsed.ok) return parsed.response;

  if (!bodyContainsOnlyAllowedFields(parsed.body)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_FEEDBACK_EXTENSION_FIELDS_FORBIDDEN",
    });
  }

  if (parsed.body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const result = await extendExpiredHeadteacherFeedbackCycle({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: reviewGovernanceScope(auth.scope),
      cycleId,
      confirm: true,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(result.outcome === "EXTENDED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
      providerCalled: false,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_API_ERROR]",
    });
  }
}
