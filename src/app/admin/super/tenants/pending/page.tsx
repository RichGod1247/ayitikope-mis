import { requireServerUserContext } from "@/lib/serverAuth";
import PendingTenantsClient from "./PendingTenantsClient";

export const dynamic = "force-dynamic";

export default async function PendingTenantsPage() {
  await requireServerUserContext({
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
    redirectTo: "/admin/super/tenants/pending",
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
          Superadmin · Tenant Activation
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          Pending Approvals
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Approve legitimate schools first. Online parent fee payments should be
          offered as an optional trust upgrade, not forced during activation.
        </p>
      </section>

      <PendingTenantsClient />
    </div>
  );
}