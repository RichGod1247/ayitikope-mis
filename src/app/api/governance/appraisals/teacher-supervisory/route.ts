import { NextRequest } from "next/server";
import { createTeacherSupervisoryAssessmentDraft } from "@/lib/appraisals/teacherSupervisoryAssessmentDraft";
import { readTeacherSupervisoryAssessmentQueue } from "@/lib/appraisals/teacherSupervisoryAssessmentQueue";
import {
  clean,
  isIsoDate,
  isLikelyIdentifier,
  isObservationKey,
  jsonNoStore,
  readBoundedJsonObject,
  requestIsJson,
  requestMeta,
  requireTeacherSupervisoryGovernanceApiContext,
  teacherSupervisoryApiError,
} from "@/app/api/governance/appraisals/teacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_RESOLVED_FIELDS = [
  "schoolId",
  "schoolName",
  "circuitId",
  "circuitName",
  "targetZoneId",
  "districtId",
  "districtName",
  "scopeZoneId",
  "teacherName",
  "assessorUserId",
  "assessorAssignmentId",
  "subjectBeingObserved",
  "subject",
  "subStrand",
  "classTaught",
  "phase",
  "level",
  "strandId",
  "strandCode",
  "strandTitle",
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

export async function GET(req: NextRequest) {
  const meta = requestMeta(req);

  try {
    const auth = await requireTeacherSupervisoryGovernanceApiContext(req);
    if (!auth.ok) {
      return jsonNoStore(auth.res.status, {
        ok: false,
        reqId: meta.reqId,
        error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      });
    }

    const queue = await readTeacherSupervisoryAssessmentQueue({
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
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_QUEUE_API_ERROR]",
    });
  }
}

export async function POST(req: NextRequest) {
  const meta = requestMeta(req);

  try {
    const auth = await requireTeacherSupervisoryGovernanceApiContext(req);
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
    const observationKey = clean(body.observationKey);
    const dateObserved = clean(body.dateObserved);

    if (!isLikelyIdentifier(targetUserId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_TARGET_USER_ID",
      });
    }

    if (!isLikelyIdentifier(targetTenantId)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_TARGET_TENANT_ID",
      });
    }

    if (!isObservationKey(observationKey)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_OBSERVATION_KEY",
      });
    }

    if (!isIsoDate(dateObserved)) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "INVALID_OBSERVATION_DATE",
      });
    }

    const classroomId = clean(body.classroomId);
    const curriculumSubjectId = clean(body.curriculumSubjectId);
    const curriculumSubStrandId = clean(body.curriculumSubStrandId);

    for (const [fieldName, value] of [
      ["classroomId", classroomId],
      ["curriculumSubjectId", curriculumSubjectId],
      ["curriculumSubStrandId", curriculumSubStrandId],
    ] as const) {
      if (!isLikelyIdentifier(value)) {
        return jsonNoStore(400, {
          ok: false,
          reqId: meta.reqId,
          error: "TEACHER_SUPERVISORY_OBSERVATION_SELECTION_ID_INVALID",
          details: { fieldName },
        });
      }
    }

    const forbiddenField = submittedServerResolvedField(body);
    if (forbiddenField) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_TARGET_FIELDS_SERVER_RESOLVED",
        details: {
          fieldName: forbiddenField,
          reason:
            "TEACHER_SCHOOL_CIRCUIT_DISTRICT_AND_ASSESSOR_CONTEXT_ARE_REVALIDATED_SERVER_SIDE",
        },
      });
    }

    if (
      body.term != null ||
      body.academicYear != null ||
      body.generalComment != null ||
      body.comment != null ||
      body.comments != null ||
      body.note != null ||
      body.scores != null
    ) {
      return jsonNoStore(400, {
        ok: false,
        reqId: meta.reqId,
        error: "TEACHER_SUPERVISORY_DRAFT_NON_HEADER_FIELDS_FORBIDDEN",
      });
    }

    const result = await createTeacherSupervisoryAssessmentDraft({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      targetUserId,
      targetTenantId,
      observationKey,
      dateObserved,
      yearsInService: body.yearsInService,
      yearsInPresentSchool: body.yearsInPresentSchool,
      durationMinutes: body.durationMinutes,
      totalEnrolment: body.totalEnrolment,
      girls: body.girls,
      boys: body.boys,
      classroomId,
      curriculumSubjectId,
      curriculumSubStrandId,
      reqId: meta.reqId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId: meta.reqId,
      result,
      workspaceUrl:
        `/governance/appraisals/teacher-supervisory?assessmentId=${encodeURIComponent(
          result.draft.assessmentId,
        )}`,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_DRAFT_API_ERROR]",
    });
  }
}
