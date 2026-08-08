import { requireGovernancePageContext } from "@/lib/governance/scope";
import { TEACHER_SUPERVISORY_ASSESSMENT_POLICY } from "@/lib/appraisals/teacherSupervisoryAssessment";
import TeacherSupervisoryAssessmentClient from "./TeacherSupervisoryAssessmentClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TeacherSupervisoryAssessmentPage({
  searchParams,
}: PageProps) {
  await requireGovernancePageContext({
    allowedRoles:
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles,
    redirectTo: "/app",
  });

  const params = await Promise.resolve(searchParams);
  return (
    <TeacherSupervisoryAssessmentClient
      initialAssessmentId={first(params.assessmentId)}
    />
  );
}
