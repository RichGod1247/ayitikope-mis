//src/app/admin/super/tenants/all/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import AllTenantsClient from "./allTenantsClient";

export const dynamic = "force-dynamic";

export default async function AllTenantsPage() {
  await requireServerUserContext({
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
    redirectTo: "/admin/super/tenants/all",
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
          Superadmin · Control Center
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          Tenant & Governance Registry
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Separate school tenants from governance officers, verify lifecycle
          status, and control access without mixing onboarding pipelines.
        </p>
      </section>

      <AllTenantsClient />
    </div>
  );
}