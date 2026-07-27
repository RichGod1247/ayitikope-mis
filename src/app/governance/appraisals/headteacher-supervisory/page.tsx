import { requireGovernancePageContext } from "@/lib/governance/scope";
import { HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY } from "@/lib/appraisals/headteacherSupervisoryAssessment";
import HeadteacherSupervisoryAssessmentClient from "./HeadteacherSupervisoryAssessmentClient";

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

export default async function HeadteacherSupervisoryAssessmentPage({
  searchParams,
}: PageProps) {
  await requireGovernancePageContext({
    allowedRoles:
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles,
    redirectTo: "/app",
  });

  const params = await Promise.resolve(searchParams);
  return (
    <HeadteacherSupervisoryAssessmentClient
      initialAssessmentId={first(params.assessmentId)}
      initialCycleId={first(params.cycleId)}
    />
  );
}
