import { NextRequest } from "next/server";
import {
  readTeacherSupervisoryReviewPackage,
  TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY,
  type TeacherSupervisoryReviewPackage,
} from "@/lib/appraisals/teacherSupervisoryReviewPackage";
import {
  clean,
  isUuidIdentifier,
  jsonNoStore,
  requestMeta,
  requireTeacherSupervisoryGovernanceApiContext,
  teacherSupervisoryApiError,
} from "@/app/api/governance/appraisals/teacher-supervisory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

function normalizedRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function reviewerRoleAllowed(value: unknown) {
  const role = normalizedRole(value);
  return (
    TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience as readonly string[]
  ).includes(role);
}

function projectTeacherSupervisoryReviewPackageForBrowser(
  reviewPackage: TeacherSupervisoryReviewPackage,
) {
  return {
    schemaVersion: 1 as const,
    lifecycleState: reviewPackage.lifecycleState,
    review: {
      reviewerRole: reviewPackage.review.reviewerRole,
    },
    assessment: {
      id: reviewPackage.assessment.id,
      cycleId: reviewPackage.assessment.cycleId,
      revision: reviewPackage.assessment.revision,
      finalizedAt: reviewPackage.assessment.finalizedAt,
      assessorOffice: reviewPackage.assessment.assessorOffice,
      dateObserved: reviewPackage.assessment.dateObserved,
      overallPercentage: reviewPackage.assessment.overallPercentage,
      sectionPercentages: reviewPackage.assessment.sectionPercentages,
      generalComment: reviewPackage.assessment.generalComment,
      sections: reviewPackage.assessment.sections.map((section) => ({
        sectionKey: section.sectionKey,
        title: section.title,
        description: section.description,
        order: section.order,
        maxScore: section.maxScore,
        percentage: section.percentage,
        items: section.items.map((item) => ({
          itemKey: item.itemKey,
          label: item.label,
          order: item.order,
          maxScore: item.maxScore,
          score: item.score,
          notApplicable: item.notApplicable,
        })),
      })),
    },
    observation: {
      contextSchemaVersion: reviewPackage.observation.contextSchemaVersion,
      teacherName: reviewPackage.observation.teacherName,
      schoolName: reviewPackage.observation.schoolName,
      circuitName: reviewPackage.observation.circuitName,
      districtName: reviewPackage.observation.districtName,
      dateObserved: reviewPackage.observation.dateObserved,
      yearsInService: reviewPackage.observation.yearsInService,
      yearsInPresentSchool: reviewPackage.observation.yearsInPresentSchool,
      subjectBeingObserved: reviewPackage.observation.subjectBeingObserved,
      subStrand: reviewPackage.observation.subStrand,
      classTaught: reviewPackage.observation.classTaught,
      durationMinutes: reviewPackage.observation.durationMinutes,
      totalEnrolment: reviewPackage.observation.totalEnrolment,
      girls: reviewPackage.observation.girls,
      boys: reviewPackage.observation.boys,
    },
    readOnly: true as const,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
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

    if (!reviewerRoleAllowed(auth.ctx.roleName)) {
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

    const reviewPackage = await readTeacherSupervisoryReviewPackage({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      assessmentId,
      governanceScope: auth.scope,
    });

    const browserReviewPackage =
      projectTeacherSupervisoryReviewPackageForBrowser(reviewPackage);

    return jsonNoStore(200, {
      ok: true,
      reqId: meta.reqId,
      reviewPackage: browserReviewPackage,
    });
  } catch (error) {
    return teacherSupervisoryApiError({
      error,
      reqId: meta.reqId,
      logTag: "[TEACHER_SUPERVISORY_REVIEW_PACKAGE_API_ERROR]",
    });
  }
}
