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
          Governance Officer Administration
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Share one public application link with prospective SISSOs, District
          Directors, Heads of Supervision, Basic School Coordinators, and other
          directorate officers. Review and verify each request, then issue the
          secure jurisdiction-based invite from this workspace.
        </p>
      </section>

      <GovernanceOfficersClient />
    </div>
  );
}
