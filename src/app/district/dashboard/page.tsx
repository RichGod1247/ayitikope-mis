// src/app/district/dashboard/page.tsx
import GovernanceCommandDashboardClient from "@/components/governance/GovernanceCommandDashboardClient";
import {
  DISTRICT_GOVERNANCE_ROLES,
  requireGovernancePageContext,
} from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DistrictDashboardPage() {
  await requireGovernancePageContext({
    allowedRoles: DISTRICT_GOVERNANCE_ROLES,
    allowedZoneLevels: [2],
    redirectTo: "/district/dashboard",
  });

  return (
    <GovernanceCommandDashboardClient
      endpoint="/api/district/overview"
      eyebrow="District Oversight"
      title="District Education Command"
      description="A lean district command center for circuits, schools, risk, attendance, lesson delivery, assessment evidence, sector-aware governance, official notices, and intervention accountability."
      accountabilityTitle="District command notice accountability"
      accountabilityDescription="Track official notices personally issued by the Director and escalated governance notices that require district attention. Routine SISSO-to-school notices remain inside the circuit unless escalated."
    />
  );
}
