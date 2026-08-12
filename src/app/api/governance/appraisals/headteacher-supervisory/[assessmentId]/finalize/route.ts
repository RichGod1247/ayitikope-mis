//src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/finalize/route.ts
import { NextRequest } from "next/server";
import { ensureHeadteacherSupervisoryCorrectionReviewContinuation } from "@/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation";
import { finalizeHeadteacherSupervisoryAssessment } from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
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

export async function POST(req: NextRequest, context: RouteContext) {
  const meta = requestMeta(req);
  const auth = await requireSupervisoryGovernanceApiContext(req);
  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId: meta.reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
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
  const body = objectBody(await req.json().catch(() => null));
  if (!isUuidIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }
  if (body?.confirmFinalization !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId: meta.reqId,
      error: "FINALIZATION_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const result = await finalizeHeadteacherSupervisoryAssessment({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    try {
      const continuation =
        await ensureHeadteacherSupervisoryCorrectionReviewContinuation({
          actorUserId: auth.ctx.userId,
          actorRoleName: auth.ctx.roleName,
          assessmentId,
          reqId: meta.reqId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

      return jsonNoStore(200, {
        ok: true,
        reqId: meta.reqId,
        result,
        continuation,
      });
    } catch (continuationError) {
      const failure = continuationError as Error & {
        code?: unknown;
        status?: unknown;
      };
      console.error(
        "[HEADTEACHER_SUPERVISORY_FINALIZATION_CONTINUATION_ERROR]",
        {
          reqId: meta.reqId,
          assessmentId,
          finalizationOutcome: result.outcome,
          assessmentHash: result.assessmentHash,
          error: clean(failure.code || failure.message),
          status: Number(failure.status) || null,
        },
      );

      return jsonNoStore(503, {
        ok: false,
        reqId: meta.reqId,
        error:
          "HEADTEACHER_SUPERVISORY_FINALIZATION_CONTINUATION_RETRY_REQUIRED",
        finalizationCommitted: true,
        retrySafe: true,
        result,
        continuation: {
          outcome: "RETRY_REQUIRED",
          reviewCreated: false,
          providerCalled: false,
        },
      });
    }
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_FINALIZE_API_ERROR]",
    });
  }
}
