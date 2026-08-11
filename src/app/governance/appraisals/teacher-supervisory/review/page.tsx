import { TEACHER_SUPERVISORY_REVIEW_POLICY } from "@/lib/appraisals/teacherSupervisoryReview";
import { requireGovernancePageContext } from "@/lib/governance/scope";
import TeacherSupervisoryReviewClient from "./TeacherSupervisoryReviewClient";

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

export default async function TeacherSupervisoryReviewPage({
  searchParams,
}: PageProps) {
  await requireGovernancePageContext({
    allowedRoles: [...TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles],
    redirectTo: "/app",
  });

  const params = await Promise.resolve(searchParams);

  return (
    <TeacherSupervisoryReviewClient
      initialAssessmentId={first(params.assessmentId)}
    />
  );
}
