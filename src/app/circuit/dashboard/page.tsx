// src/app/circuit/dashboard/page.tsx
import Link from "next/link";
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
    <>
      <div className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-5 lg:px-6">
        <Link
          href="/circuit/work-output"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
        >
          Teacher Work Output
        </Link>
      </div>

      <GovernanceCommandDashboardClient
        endpoint="/api/circuit/overview"
        eyebrow="Circuit Oversight"
        title="SISSO Circuit Command"
        description="A lean supervision command center for risk, attendance, lesson delivery, assessment evidence, sector boundaries, official notices, and accountability inside your authorized circuit."
        accountabilityTitle="Circuit notice accountability"
        accountabilityDescription="Track official notices sent inside your authorized circuit, including SISSO-to-headteacher and SISSO-to-teacher communications, delivery status, acknowledgements, and responses."
      />
    </>
  );
}
