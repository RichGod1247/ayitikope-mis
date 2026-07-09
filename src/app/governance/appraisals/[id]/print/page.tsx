//src/app/governance/appraisals/[id]/print/page.tsx
import GovernanceAppraisalPrintClient from "./ui";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  DISTRICT_GOVERNANCE_ROLES,
  requireGovernancePageContext,
} from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default async function GovernanceAppraisalPrintPage({ params }: PageProps) {
  const { id } = await params;
  const reportId = clean(id);

  await requireGovernancePageContext({
    allowedRoles: Array.from(
      new Set([...DISTRICT_GOVERNANCE_ROLES, ...CIRCUIT_GOVERNANCE_ROLES])
    ),
    allowedZoneLevels: [1, 2],
    redirectTo: `/governance/appraisals/${encodeURIComponent(reportId)}/print`,
  });

  return <GovernanceAppraisalPrintClient reportId={reportId} />;
}
