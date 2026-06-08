// src/app/admin/governance/officers/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import GovernanceOfficersClient from "./GovernanceOfficersClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GovernanceOfficersPage() {
  await requireServerUserContext({
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
    redirectTo: "/admin/governance/officers",
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
          Superadmin · Governance Officer Onboarding
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          Circuit & District Officer Invites
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Invite SISSOs, District Directors, MIS/Data Officers, SHEP Officers,
          and Assessment Officers into verified jurisdiction-based access.
          Officers receive authority through audited governance assignments, not
          school tenant membership.
        </p>
      </section>

      <GovernanceOfficersClient />
    </div>
  );
}
