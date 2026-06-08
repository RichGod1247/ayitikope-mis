// src/app/circuit/dashboard/page.tsx
import GovernanceCommandDashboardClient from "@/components/governance/GovernanceCommandDashboardClient";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  requireGovernancePageContext,
} from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CircuitDashboardPage() {
  await requireGovernancePageContext({
    allowedRoles: CIRCUIT_GOVERNANCE_ROLES,
    allowedZoneLevels: [1],
    redirectTo: "/circuit/dashboard",
  });

  return (
    <GovernanceCommandDashboardClient
      endpoint="/api/circuit/overview"
      eyebrow="Circuit Oversight"
      title="SISSO Circuit Command"
      description="A lean supervision command center for risk, attendance, lesson delivery, assessment evidence, sector boundaries, official notices, and accountability inside your authorized circuit."
      accountabilityTitle="Circuit notice accountability"
      accountabilityDescription="Track official notices sent inside your authorized circuit, including SISSO-to-headteacher and SISSO-to-teacher communications, delivery status, acknowledgements, and responses."
    />
  );
}
