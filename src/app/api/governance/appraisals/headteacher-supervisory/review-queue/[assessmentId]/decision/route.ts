import { NextRequest } from "next/server";
import {
  executeHeadteacherSupervisoryHosDecision,
} from "@/lib/appraisals/headteacherSupervisoryReviewDecision";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
  objectBody,
  requestIsJson,
  requestMeta,
  requireSupervisoryGovernanceApiContext,
  supervisoryApiError,
} from "@/app/api/governance/appraisals/headteacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_BODY_FIELDS = new Set(["action", "reason", "confirm"]);

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function bodyFieldsAllowed(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

function browserDecisionResult(
  result: Awaited<ReturnType<typeof executeHeadteacherSupervisoryHosDecision>>,
) {
  return {
    outcome: result.outcome,
    assessmentStatus: result.assessmentStatus,
    cycleStatus: result.cycleStatus,
    reviewDecision: result.reviewDecision,
    revisionRequired: result.revisionRequired,
    nextReviewCreated: result.nextReviewCreated,
  };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);

  try {
    const auth = await requireSupervisoryGovernanceApiContext(req);
    if (!auth.ok) {
      return jsonNoStore(auth.res.status, {
        ok: false,
        reqId: meta.reqId,
        error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      });
    }

    if (normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION") {
      return jsonNoStore(403, {
        ok: false,
        reqId: meta.reqId,
        error: "FORBIDDEN",
      });
    }

    if (!requestIsJson(req)) {
      return jsonNoStore(415, {
        ok: false,
        reqId: meta.reqId,
        error: "JSON_BODY_REQUIRED",
      });
    }

    const params = await Promise.resolve(context.params);
    const assessmentId = clean(params?.assessmentId);
    if (!isUuidIdentifier(assessmentId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_ASSESSMENT_ID",
      });
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonNoStore(413, {
        ok: false,
        reqId: meta.reqId,
        error: "REQUEST_BODY_TOO_LARGE",
      });
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return jsonNoStore(413, {
        ok: false,
        reqId: meta.reqId,
        error: "REQUEST_BODY_TOO_LARGE",
      });
    }

    let parsedJson: unknown = null;
    try {
      parsedJson = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_JSON_BODY",
      });
    }

    const body = objectBody(parsedJson);
    if (!body || !bodyFieldsAllowed(body)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_DECISION_BODY",
      });
    }

    const result = await executeHeadteacherSupervisoryHosDecision({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      action: body.action,
      reason: body.reason,
      confirm: body.confirm === true,
      governanceScope: auth.scope,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      result: browserDecisionResult(result),
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_HOS_DECISION_API_ERROR]",
    });
  }
}
