// src/app/district/dashboard/page.tsx
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";
import GovernanceSentNoticeAccountabilityClient from "@/components/governance/GovernanceSentNoticeAccountabilityClient";
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
    <div className="space-y-6">
      <GovernanceDashboardClient
        endpoint="/api/district/overview"
        eyebrow="District Oversight"
        title="District Education Dashboard"
        description="Monitor schools, circuits, learners, teachers, attendance signals, health alerts, assessments, and intervention priorities inside your authorized district."
      />

      <GovernanceSentNoticeAccountabilityClient
        mode="jurisdiction"
        title="District command notice accountability"
        description="Track official notices personally issued by the Director and escalated governance notices that require district attention. Routine SISSO-to-school notices remain inside the circuit unless escalated."
      />
    </div>
  );
}