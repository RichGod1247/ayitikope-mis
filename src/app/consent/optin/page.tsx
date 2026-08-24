export const dynamic = "force-dynamic";

export default function RetiredLegacyConsentPage() {
  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-[#F7F4ED]">
      <section className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#0B1018] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
          EduLife OS · Essential School Alerts
        </p>
        <h1 className="mt-2 text-2xl font-bold">Use your official school invitation</h1>
        <p className="mt-3 text-sm leading-6 text-[#C9CDD6]">
          For your privacy, Essential School Alerts can no longer be enabled using a learner ID or school ID in a public link.
        </p>
        <p className="mt-3 text-sm leading-6 text-[#C9CDD6]">
          Please open the secure, expiring invitation sent by your school. If you need a new link, contact the school office.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          Health consent is separate from Essential School Alerts and is not changed here.
        </div>
      </section>
    </main>
  );
}
