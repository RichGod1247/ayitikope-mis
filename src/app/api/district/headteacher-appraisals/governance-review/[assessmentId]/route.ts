import { NextRequest } from "next/server";
import {
  executeHeadteacherDirectorGovernanceDecision,
  readHeadteacherDirectorGovernanceReviewPackage,
  startHeadteacherDirectorGovernanceReview,
} from "@/lib/appraisals/headteacherDirectorGovernanceReview";
import {
  clean,
  directorReviewApiError,
  isLikelyIdentifier,
  jsonNoStore,
  readJsonObject,
  requestMeta,
  requireDirectorReviewApiContext,
} from "@/app/api/district/headteacher-appraisals/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

const ALLOWED_BODY_FIELDS = new Set([
  "action",
  "confirm",
  "reviewId",
  "note",
]);

function normalizeAction(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function forbiddenBodyField(body: Record<string, unknown>) {
  return Object.keys(body).find((key) => !ALLOWED_BODY_FIELDS.has(key)) ?? null;
}

async function assessmentIdFrom(context: RouteContext) {
  const params = await Promise.resolve(context.params);
  return clean(params?.assessmentId);
}

export async function GET(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireDirectorReviewApiContext(req);
  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const assessmentId = await assessmentIdFrom(context);
  if (!isLikelyIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }

  if (new URL(req.url).searchParams.size !== 0) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_DIRECTOR_GOVERNANCE_PACKAGE_QUERY_FIELDS_FORBIDDEN",
    });
  }

  try {
    const reviewPackage = await readHeadteacherDirectorGovernanceReviewPackage({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      governanceScope: auth.scope,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewPackage,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_GOVERNANCE_PACKAGE_API_ERROR]",
    });
  }
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

  const assessmentId = await assessmentIdFrom(context);
  if (!isLikelyIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }

  const parsed = await readJsonObject({ req, reqId: meta.reqId });
  if (!parsed.ok) return parsed.response;

  const forbidden = forbiddenBodyField(parsed.body);
  if (forbidden) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_DIRECTOR_GOVERNANCE_BODY_FIELD_FORBIDDEN",
      details: { fieldName: forbidden },
    });
  }

  const action = normalizeAction(parsed.body.action);
  if (!["START", "RETURN", "HOLD", "RELEASE"].includes(action)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "HEADTEACHER_DIRECTOR_GOVERNANCE_ACTION_FORBIDDEN",
      details: { decision: action },
    });
  }

  try {
    if (action === "START") {
      const result = await startHeadteacherDirectorGovernanceReview({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        assessmentId,
        confirm: parsed.body.confirm === true,
        governanceScope: auth.scope,
        reqId: meta.reqId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return jsonNoStore(result.outcome === "STARTED" ? 201 : 200, {
        ok: true,
        reqId: meta.reqId,
        result,
        reviewPackageUrl:
          `/api/district/headteacher-appraisals/governance-review/${encodeURIComponent(assessmentId)}`,
      });
    }

    const reviewId = clean(parsed.body.reviewId);
    if (!isLikelyIdentifier(reviewId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_REVIEW_ID",
      });
    }

    const result = await executeHeadteacherDirectorGovernanceDecision({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      reviewId,
      decision: action,
      note: parsed.body.note,
      confirm: parsed.body.confirm === true,
      governanceScope: auth.scope,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      result,
    });
  } catch (error) {
    return directorReviewApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_DIRECTOR_GOVERNANCE_ACTION_API_ERROR]",
    });
  }
}
