// src/app/district/dashboard/page.tsx
import Link from "next/link";
import {
  DISTRICT_GOVERNANCE_ROLES,
  buildGovernanceOverview,
  requireGovernancePageContext,
} from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#E8C96A]">{label}</p>
      <p className="mt-3 text-3xl font-bold text-[#F7F4ED]">{value}</p>
      {note ? <p className="mt-2 text-sm text-[#C9CDD6]">{note}</p> : null}
    </div>
  );
}

export default async function DistrictDashboardPage() {
  const { scope } = await requireGovernancePageContext({
    redirectTo: "/district/dashboard",
    allowedRoles: DISTRICT_GOVERNANCE_ROLES,
    allowedZoneLevels: [2],
  });

  const overview = await buildGovernanceOverview(scope);

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-6 text-[#F7F4ED] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.18),transparent_32%),rgba(255,255,255,0.04)] p-6 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E8C96A]">
            EduLife OS · District Command Center
          </p>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                District Oversight Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                Phase A is intentionally read-only. This view proves jurisdiction-safe access before
                risk intelligence, intervention workflows, or AI recommendations are added.
              </p>
            </div>

            <Link
              href="/api/district/overview"
              className="rounded-full border border-[#D4AF37]/40 px-4 py-2 text-sm font-semibold text-[#E8C96A] hover:bg-[#D4AF37]/10"
            >
              View JSON proof
            </Link>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Schools" value={overview.totals.schools} note="Active schools in authorized district scope." />
          <StatCard label="Circuits" value={overview.totals.circuits} note="Circuit zones under this jurisdiction." />
          <StatCard label="Learners" value={overview.totals.learners} note="Active learners across authorized schools." />
          <StatCard label="Teachers" value={overview.totals.teachers} note="Teacher profiles across authorized schools." />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Attendance Sessions Today"
            value={overview.signals.attendanceSessionsToday}
            note="Real attendance sessions found today."
          />
          <StatCard
            label="Health Alerts Today"
            value={overview.signals.healthAlertsToday}
            note="Temperature or symptom records needing attention."
          />
          <StatCard
            label="Lesson Deliveries 14 Days"
            value={overview.signals.lessonDeliveriesLast14Days}
            note="Real lesson delivery evidence in the last 14 days."
          />
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Schools in Authorized Scope</h2>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                This list must never include a school outside the officer’s district.
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.06] text-xs uppercase tracking-[0.16em] text-[#C9CDD6]">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Circuit</th>
                  <th className="px-4 py-3">District</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.schools.length ? (
                  overview.schools.map((school) => (
                    <tr key={school.id} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold text-[#F7F4ED]">{school.name}</td>
                      <td className="px-4 py-3 text-[#C9CDD6]">{school.schoolCode ?? "—"}</td>
                      <td className="px-4 py-3 text-[#C9CDD6]">{school.circuit?.name ?? "Unassigned"}</td>
                      <td className="px-4 py-3 text-[#C9CDD6]">{school.district?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#E8C96A]">{school.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#C9CDD6]">
                      No active schools found in this authorized district scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}