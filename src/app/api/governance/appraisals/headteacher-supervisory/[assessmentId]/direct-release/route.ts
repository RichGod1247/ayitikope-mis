import { NextRequest } from "next/server";
import { executeHeadteacherSupervisoryDirectorDirectRelease } from "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease";
import { ensureHeadteacherDirectorReleaseNotifications } from "@/lib/appraisals/headteacherDirectorReleaseNotifications";
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
const ALLOWED_BODY_FIELDS = new Set(["confirm"]);

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function bodyFieldsAllowed(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

function browserReleaseResult(
  result: Awaited<
    ReturnType<typeof executeHeadteacherSupervisoryDirectorDirectRelease>
  >,
) {
  return {
    outcome: result.outcome,
    releaseMode: result.releaseMode,
    governanceReleaseStatus: result.governanceReleaseStatus,
    assessmentId: result.assessmentId,
    cycleId: result.cycleId,
    staffFeedbackCycleStatus: result.staffFeedbackCycleStatus,
    releasedAt: result.releasedAt,
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

    if (normalizedRole(auth.ctx.roleName) !== "DISTRICT_DIRECTOR") {
      return jsonNoStore(403, {
        ok: false,
        reqId: meta.reqId,
        error: "FORBIDDEN",
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

    if (!requestIsJson(req)) {
      return jsonNoStore(415, {
        ok: false,
        reqId: meta.reqId,
        error: "CONTENT_TYPE_MUST_BE_JSON",
      });
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_BYTES
    ) {
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

    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_JSON_BODY",
      });
    }

    const body = objectBody(parsed);
    if (!body || !bodyFieldsAllowed(body)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_REQUEST_BODY",
      });
    }

    if (body.confirm !== true) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "CONFIRMATION_REQUIRED",
      });
    }

    const result =
      await executeHeadteacherSupervisoryDirectorDirectRelease({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        assessmentId,
        confirm: true,
        governanceScope: auth.scope,
        reqId: meta.reqId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

    const browserResult = browserReleaseResult(result);

    try {
      const notifications =
        await ensureHeadteacherDirectorReleaseNotifications({
          cycleId: result.cycleId,
          assessmentId: result.assessmentId,
          actorUserId: auth.ctx.userId,
          releaseProofHash: result.releaseProofHash,
          releasedAt: result.releasedAt,
          reqId: meta.reqId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

      return jsonNoStore(200, {
        ok: true,
        reqId: meta.reqId,
        result: browserResult,
        notifications,
      });
    } catch (notificationError) {
      const notificationFailure = notificationError as Error & {
        code?: unknown;
        status?: unknown;
      };

      console.error(
        "[HEADTEACHER_GOVERNANCE_DIRECT_RELEASE_NOTIFICATION_SEEDING_ERROR]",
        {
          reqId: meta.reqId,
          cycleId: result.cycleId,
          assessmentId: result.assessmentId,
          error: clean(notificationFailure.code || notificationFailure.message),
          status: Number(notificationFailure.status) || null,
        },
      );

      return jsonNoStore(503, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
        releaseCommitted: true,
        retrySafe: true,
        result: browserResult,
        notifications: {
          outcome: "RETRY_REQUIRED",
          providerCalled: false,
        },
      });
    }
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_GOVERNANCE_DIRECT_RELEASE_API_ERROR]",
    });
  }
}
