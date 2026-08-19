import { requireGovernancePageContext } from "@/lib/governance/scope";
import HeadteacherSupervisoryReviewClient from "./HeadteacherSupervisoryReviewClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADTEACHER_SUPERVISORY_REVIEW_ROLES = ["HEAD_OF_SUPERVISION"] as const;

type PageProps = {
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function HeadteacherSupervisoryReviewPage({
  searchParams,
}: PageProps) {
  await requireGovernancePageContext({
    allowedRoles: HEADTEACHER_SUPERVISORY_REVIEW_ROLES,
    allowedZoneLevels: [2],
    redirectTo: "/governance/appraisals/headteacher-supervisory/review",
  });

  const params = await Promise.resolve(searchParams);

  return (
    <HeadteacherSupervisoryReviewClient
      initialAssessmentId={first(params.assessmentId)}
    />
  );
}
