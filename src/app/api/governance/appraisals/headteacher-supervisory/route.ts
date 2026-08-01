// src/app/api/governance/appraisals/headteacher-supervisory/route.ts
import { NextRequest } from "next/server";
import { createHeadteacherSupervisoryAssessmentDraft } from "@/lib/appraisals/headteacherSupervisoryAssessmentDraft";
import { readHeadteacherSupervisoryAssessmentQueue } from "@/lib/appraisals/headteacherSupervisoryAssessmentQueue";
import { normalizeHeadteacherSupervisoryVisitDetails } from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import {
  clean,
  isIsoDate,
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

const SERVER_RESOLVED_TARGET_FIELDS = [
  "schoolId",
  "tenantId",
  "targetTenantId",
  "circuitId",
  "targetZoneId",
  "districtId",
  "scopeZoneId",
  "headteacherId",
  "targetUserId",
] as const;

function submittedServerResolvedTargetField(
  body: Record<string, unknown>,
): string | null {
  for (const fieldName of SERVER_RESOLVED_TARGET_FIELDS) {
    if (body[fieldName] != null && clean(body[fieldName])) {
      return fieldName;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
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

    const queue = await readHeadteacherSupervisoryAssessmentQueue({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      queue,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_QUEUE_API_ERROR]",
    });
  }
}

export async function POST(req: NextRequest) {
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

    if (!requestIsJson(req)) {
      return jsonNoStore(415, {
        ok: false,
        reqId: meta.reqId,
        error: "JSON_BODY_REQUIRED",
      });
    }

    const body = objectBody(await req.json().catch(() => null));
    if (!body) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_JSON_BODY",
      });
    }

    const cycleId = clean(body.cycleId);
    const dateObserved = clean(body.dateObserved);

    if (!isUuidIdentifier(cycleId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_CYCLE_ID",
      });
    }

    if (!isIsoDate(dateObserved)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_OBSERVATION_DATE",
      });
    }

    const forbiddenTargetField =
      submittedServerResolvedTargetField(body);

    if (forbiddenTargetField) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error:
          "HEADTEACHER_SUPERVISORY_TARGET_FIELDS_SERVER_RESOLVED",
        details: {
          fieldName: forbiddenTargetField,
          reason:
            "SCHOOL_CIRCUIT_DISTRICT_AND_HEADTEACHER_ARE_RESOLVED_FROM_THE_AUTHORIZED_CYCLE",
        },
      });
    }

    if (
      body.comment != null ||
      body.comments != null ||
      body.generalComment != null ||
      body.note != null
    ) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_COMMENTS_FORBIDDEN",
      });
    }

    const visitDetails =
      normalizeHeadteacherSupervisoryVisitDetails({
        arrivalTime: body.arrivalTime,
        staffStrength: body.staffStrength,
        totalEnrolment: body.totalEnrolment,
        girls: body.girls,
        boys: body.boys,
        teachersPresentAtVisit:
          body.teachersPresentAtVisit,
      });

    const result =
      await createHeadteacherSupervisoryAssessmentDraft({
        actorUserId: auth.ctx.userId,
        actorRoleName: auth.ctx.roleName,
        cycleId,
        dateObserved,
        ...visitDetails,
        reqId: meta.reqId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

    return jsonNoStore(
      result.outcome === "CREATED" ? 201 : 200,
      {
        ok: true,
        reqId: meta.reqId,
        result,
        workspaceUrl:
          `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
            result.assessment.id,
          )}`,
      },
    );
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_DRAFT_API_ERROR]",
    });
  }
}
