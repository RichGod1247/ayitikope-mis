// src/app/circuit/dashboard/page.tsx
import Link from "next/link";
import {
  CIRCUIT_GOVERNANCE_ROLES,
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

export default async function CircuitDashboardPage() {
  const { scope } = await requireGovernancePageContext({
    redirectTo: "/circuit/dashboard",
    allowedRoles: CIRCUIT_GOVERNANCE_ROLES,
    allowedZoneLevels: [1],
  });

  const overview = await buildGovernanceOverview(scope);

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-6 text-[#F7F4ED] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.18),transparent_32%),rgba(255,255,255,0.04)] p-6 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E8C96A]">
            EduLife OS · Circuit Command Center
          </p>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Circuit Oversight Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                This is the SISSO/Circuit Supervisor’s first read-only control room. It proves
                school scope before deeper analytics are added.
              </p>
            </div>

            <Link
              href="/api/circuit/overview"
              className="rounded-full border border-[#D4AF37]/40 px-4 py-2 text-sm font-semibold text-[#E8C96A] hover:bg-[#D4AF37]/10"
            >
              View JSON proof
            </Link>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Schools" value={overview.totals.schools} note="Active schools in this circuit." />
          <StatCard label="Learners" value={overview.totals.learners} note="Active learners across circuit schools." />
          <StatCard label="Teachers" value={overview.totals.teachers} note="Teacher profiles across circuit schools." />
          <StatCard
            label="Present Marks Today"
            value={overview.signals.presentMarksToday}
            note="Raw present marks from today’s attendance evidence."
          />
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
          <h2 className="text-lg font-bold">Schools in Circuit Scope</h2>
          <p className="mt-1 text-sm text-[#C9CDD6]">
            A SISSO must see every school in the assigned circuit — and not one school more.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.schools.length ? (
              overview.schools.map((school) => (
                <div key={school.id} className="rounded-2xl border border-white/10 bg-[#05070B]/70 p-4">
                  <p className="font-semibold text-[#F7F4ED]">{school.name}</p>
                  <p className="mt-1 text-sm text-[#C9CDD6]">Code: {school.schoolCode ?? "—"}</p>
                  <p className="mt-1 text-sm text-[#C9CDD6]">
                    Circuit: {school.circuit?.name ?? "Unassigned"}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                    {school.status}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#05070B]/70 p-6 text-sm text-[#C9CDD6]">
                No active schools found in this authorized circuit scope.
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}