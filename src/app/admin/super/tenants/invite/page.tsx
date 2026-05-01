import InviteTenantClient from "./inviteTenantClient";

export const dynamic = "force-dynamic";

export default function InviteTenantPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
          Superadmin · School Onboarding
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          Invite School
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Create a bootstrap invite and deliver it by SMS and/or email. Online fee
          payment setup should be optional, not a barrier to school enrollment.
        </p>
      </section>

      <InviteTenantClient />
    </div>
  );
}