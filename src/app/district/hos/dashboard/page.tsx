// src/app/district/hos/dashboard/page.tsx
import GovernanceAppraisalHubClient from "@/components/governance/GovernanceAppraisalHubClient";
import { requireGovernancePageContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOS_DASHBOARD_ROLES = ["HEAD_OF_SUPERVISION"] as const;

function jurisdictionLabel(args: {
  isSuperAdmin: boolean;
  assignments: Array<{ zoneName: string }>;
}) {
  if (args.isSuperAdmin) return "All authorized districts";

  const names = Array.from(
    new Set(
      args.assignments
        .map((assignment) => String(assignment.zoneName ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return names.length ? names.join(" · ") : "Assigned district";
}

export default async function HeadOfSupervisionDashboardPage() {
  const { ctx, scope } = await requireGovernancePageContext({
    allowedRoles: HOS_DASHBOARD_ROLES,
    allowedZoneLevels: [2],
    redirectTo: "/district/hos/dashboard",
  });

  return (
    <GovernanceAppraisalHubClient
      role="HEAD_OF_SUPERVISION"
      roleLabel="Head of Supervision"
      officerName={ctx.name || ctx.email}
      districtLabel={jurisdictionLabel(scope)}
    />
  );
}
