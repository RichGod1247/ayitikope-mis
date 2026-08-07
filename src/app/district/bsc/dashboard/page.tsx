// src/app/district/bsc/dashboard/page.tsx
import GovernanceAppraisalHubClient from "@/components/governance/GovernanceAppraisalHubClient";
import { requireGovernancePageContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BSC_DASHBOARD_ROLES = ["BASIC_SCHOOL_COORDINATOR"] as const;

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

export default async function BasicSchoolCoordinatorDashboardPage() {
  const { ctx, scope } = await requireGovernancePageContext({
    allowedRoles: BSC_DASHBOARD_ROLES,
    allowedZoneLevels: [2],
    redirectTo: "/district/bsc/dashboard",
  });

  return (
    <GovernanceAppraisalHubClient
      role="BASIC_SCHOOL_COORDINATOR"
      roleLabel="Basic School Coordinator"
      officerName={ctx.name || ctx.email}
      districtLabel={jurisdictionLabel(scope)}
    />
  );
}
