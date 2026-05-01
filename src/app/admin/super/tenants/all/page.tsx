import AllTenantsClient from "./allTenantsClient";

export const dynamic = "force-dynamic";

export default function AllTenantsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
          Superadmin · Tenant Registry
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          All Tenants
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          View active and pending schools. Settlement setup is optional and can be
          activated later when a school chooses online fee payments.
        </p>
      </section>

      <AllTenantsClient />
    </div>
  );
}