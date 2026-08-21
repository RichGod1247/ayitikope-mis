import { NextRequest } from "next/server";
import {
  createHeadteacherSupervisoryDirectorAssessmentDraft,
} from "@/lib/appraisals/headteacherSupervisoryDirectorDraft";
import {
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  clean,
  isDirectAssessmentKey,
  isIsoDate,
  isLikelyIdentifier,
  jsonNoStore,
  readBoundedJsonObject,
  requestIsJson,
  requestMeta,
  requireSupervisoryGovernanceApiContext,
  supervisoryApiError,
} from "@/app/api/governance/appraisals/headteacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_RESOLVED_FIELDS = [
  "cycleId",
  "schoolId",
  "schoolName",
  "circuitId",
  "circuitName",
  "districtId",
  "districtName",
  "scopeZoneId",
  "targetZoneId",
  "targetHeadteacherName",
  "headteacherName",
  "assessorUserId",
  "assessorAssignmentId",
  "assessorRole",
  "instrumentVersionId",
  "instrumentCode",
  "instrumentVersion",
] as const;

function submittedServerResolvedField(
  body: Record<string, unknown>,
): string | null {
  for (const fieldName of SERVER_RESOLVED_FIELDS) {
    if (body[fieldName] != null && clean(body[fieldName])) {
      return fieldName;
    }
  }
  return null;
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

    if (
      canonicalHeadteacherSupervisoryAssessorRole(auth.ctx.roleName) !==
      "DISTRICT_DIRECTOR"
    ) {
      return jsonNoStore(403, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_DIRECTOR_ONLY",
      });
    }

    if (!requestIsJson(req)) {
      return jsonNoStore(415, {
        ok: false,
        reqId: meta.reqId,
        error: "JSON_BODY_REQUIRED",
      });
    }

    const parsed = await readBoundedJsonObject(req);
    if (!parsed.ok) {
      return jsonNoStore(parsed.status, {
        ok: false,
        reqId: meta.reqId,
        error: parsed.error,
      });
    }

    const body = parsed.body;
    const targetUserId = clean(body.targetUserId);
    const targetTenantId = clean(body.targetTenantId);
    const directAssessmentKey = clean(body.directAssessmentKey);
    const dateObserved = clean(body.dateObserved);

    if (!isLikelyIdentifier(targetUserId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_INVALID_TARGET_USER_ID",
      });
    }

    if (!isLikelyIdentifier(targetTenantId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_INVALID_TARGET_TENANT_ID",
      });
    }

    if (!isDirectAssessmentKey(directAssessmentKey)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_KEY_INVALID",
      });
    }

    if (!isIsoDate(dateObserved)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID",
      });
    }

    const forbiddenField = submittedServerResolvedField(body);
    if (forbiddenField) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_TARGET_FIELDS_SERVER_RESOLVED",
        details: {
          fieldName: forbiddenField,
          reason:
            "HEADTEACHER_SCHOOL_CIRCUIT_DISTRICT_ASSESSOR_AND_INSTRUMENT_CONTEXT_ARE_REVALIDATED_SERVER_SIDE",
        },
      });
    }

    if (
      body.generalComment != null ||
      body.comment != null ||
      body.comments != null ||
      body.note != null ||
      body.scores != null ||
      body.respondentUserIds != null ||
      body.participantIds != null ||
      body.deadlineAt != null ||
      body.responseWindowDays != null ||
      body.minimumResponses != null
    ) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_NON_HEADER_FIELDS_FORBIDDEN",
      });
    }

    const result = await createHeadteacherSupervisoryDirectorAssessmentDraft({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      governanceScope: auth.scope,
      targetUserId,
      targetTenantId,
      directAssessmentKey,
      dateObserved,
      arrivalTime: body.arrivalTime,
      staffStrength: body.staffStrength,
      totalEnrolment: body.totalEnrolment,
      girls: body.girls,
      boys: body.boys,
      teachersPresentAtVisit: body.teachersPresentAtVisit,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
      workspaceUrl:
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
          result.draft.assessmentId,
        )}`,
    });
  } catch (error) {
    return supervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_API_ERROR]",
    });
  }
}
