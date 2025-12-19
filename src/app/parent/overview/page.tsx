// src/app/parent/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type FeeSummary = {
  term: string;
  academicYear: string;
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  lastPaymentAmountPesewas: number | null;
  lastPaymentAt: string | null;
};

type HealthSummary = {
  lastDate: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
} | null;

type OverviewStudent = {
  id: string;
  name: string;
  classroomName: string | null;
  fees: FeeSummary;
  health: HealthSummary;
};

type OverviewResponse = {
  ok: boolean;
  guardianPhone?: string;
  meta?: {
    term: string;
    academicYear: string;
  };
  students?: OverviewStudent[];
  error?: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

function formatCedis(pesewas: number): string {
  const cedis = pesewas / 100;
  return `GH₵${cedis.toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return iso.slice(0, 10);
  } catch {
    return "—";
  }
}

export default function ParentOverviewPage() {
  const searchParams = useSearchParams();

  const initialTenantId = searchParams.get("tenantId") || "";
  const [tenantId, setTenantId] = useState<string>(initialTenantId);

  const [guardianPhone, setGuardianPhone] = useState<string>("");
  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<OverviewStudent[] | null>(null);
  const [metaTerm, setMetaTerm] = useState<string | null>(null);
  const [metaYear, setMetaYear] = useState<string | null>(null);
  const [usedPhone, setUsedPhone] = useState<string | null>(null);

  // If tenantId comes from URL later (client nav), keep it in sync once.
  useEffect(() => {
    if (!tenantId && initialTenantId) {
      setTenantId(initialTenantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTenantId]);

  const canQuery = useMemo(
    () =>
      Boolean(
        tenantId.trim() &&
          guardianPhone.trim() &&
          term.trim() &&
          academicYear.trim()
      ),
    [tenantId, guardianPhone, term, academicYear]
  );

  async function loadOverview() {
    if (!canQuery) return;

    setLoading(true);
    setError("");
    setData(null);

    try {
      const url = new URL(
        "/api/parent/overview",
        window.location.origin
      );
      url.searchParams.set("tenantId", tenantId.trim());
      url.searchParams.set("guardianPhone", guardianPhone.trim());
      url.searchParams.set("term", term.trim());
      url.searchParams.set("academicYear", academicYear.trim());

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as OverviewResponse;

      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load overview for this guardian.");
        setData(null);
        setMetaTerm(null);
        setMetaYear(null);
        setUsedPhone(null);
        return;
      }

      const students = Array.isArray(json.students)
        ? json.students
        : [];
      setData(students);
      setMetaTerm(json.meta?.term ?? term);
      setMetaYear(json.meta?.academicYear ?? academicYear);
      setUsedPhone(json.guardianPhone ?? guardianPhone.trim());
    } catch (err) {
      setError(
        "Network or server error while loading overview. Please try again or contact the school."
      );
      setData(null);
      setMetaTerm(null);
      setMetaYear(null);
      setUsedPhone(null);
    } finally {
      setLoading(false);
    }
  }

  // On first load, if tenantId is present in URL, we can keep fields ready
  // but we won't auto-query, because we don't know the phone number yet.

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}
            >
              EduLife OS · Parent · Term overview
            </span>
            {tenantId && (
              <span className="text-[11px] text-zinc-500">
                Tenant:{" "}
                <span className="font-mono text-[10px]">
                  {tenantId}
                </span>
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
                Quick term overview (fees &amp; health)
              </h1>
              <p className="text-sm md:text-base text-zinc-600 max-w-xl">
                This page gives a{" "}
                <span className="font-semibold">
                  simple summary for each child
                </span>{" "}
                linked to your phone number — focusing on{" "}
                <span className="font-semibold">
                  fees and basic health screenings
                </span>{" "}
                for the selected term.
              </p>
              <p className="text-[11px] md:text-xs text-zinc-500 max-w-xl">
                In the future, this will also show{" "}
                <span className="font-semibold">
                  attendance and learning highlights
                </span>{" "}
                so you can understand your child&apos;s term at a glance.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 md:px-5 md:py-4 space-y-2">
              <p className="text-xs md:text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-900 text-[12px] text-white">
                  💡
                </span>
                How to use this page
              </p>
              <ul className="text-[11px] md:text-xs text-emerald-900/90 space-y-1.5">
                <li>1. Type the parent / guardian phone number.</li>
                <li>
                  2. Choose the term and academic year you want to check.
                </li>
                <li>
                  3. Press <span className="font-semibold">Load overview</span>{" "}
                  to see all children linked to that phone.
                </li>
              </ul>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.8fr))]">
            {/* Guardian phone */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Guardian / parent phone number
              </label>
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0241234567"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-[10px] text-zinc-500">
                This should match the phone number captured for the learner in
                EduLife OS.
              </p>
            </div>

            {/* Term */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Term
              </label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            {/* Academic year */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Academic year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025/2026"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Buttons + tiny meta */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadOverview}
                disabled={!canQuery || loading}
                className="inline-flex items-center justify-center rounded-xl bg-sky-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-sky-950 disabled:opacity-50"
              >
                {loading ? "Loading overview…" : "Load overview"}
              </button>
              <button
                type="button"
                disabled={loading && !data}
                onClick={() => {
                  setGuardianPhone("");
                  setData(null);
                  setError("");
                  setMetaTerm(null);
                  setMetaYear(null);
                  setUsedPhone(null);
                }}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Clear
              </button>
            </div>

            <div className="text-[11px] text-zinc-500 md:text-right">
              {metaTerm && metaYear && usedPhone ? (
                <p>
                  Showing overview for{" "}
                  <span className="font-semibold">{metaTerm}</span>,{" "}
                  <span className="font-semibold">{metaYear}</span>{" "}
                  · Phone:{" "}
                  <span className="font-semibold">{usedPhone}</span>
                </p>
              ) : (
                <p>Ready to load data once you enter a phone number.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {error}
            </div>
          )}
        </section>

        {/* Results */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm md:text-base font-semibold text-zinc-900">
              Children linked to this phone
            </h2>
            {data && (
              <p className="text-[11px] text-zinc-500">
                Total learners:{" "}
                <span className="font-semibold">
                  {data.length}
                </span>
              </p>
            )}
          </div>

          {!data && !loading && !error && (
            <p className="text-[11px] text-zinc-500">
              Once you load the overview, each child linked to this phone will
              appear here with a simple fees &amp; health snapshot.
            </p>
          )}

          {loading && (
            <p className="text-[11px] text-zinc-500">
              Loading data from EduLife OS…
            </p>
          )}

          {data && data.length === 0 && !loading && !error && (
            <p className="text-[11px] text-zinc-500">
              No learners were found for this phone number in the selected term
              and academic year. The school may need to confirm how the phone
              was captured.
            </p>
          )}

          {data && data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {data.map((child) => (
                <article
                  key={child.id}
                  className="relative rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm md:text-base font-semibold text-zinc-900">
                        {child.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Class:{" "}
                        <span className="font-medium">
                          {child.classroomName || "Not set"}
                        </span>
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 border border-sky-100">
                      ID: {child.id.slice(0, 6)}…
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {/* Fees summary */}
                    <div className="rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-amber-900">
                          Fees summary
                        </span>
                        <span className="text-[10px] text-amber-800">
                          {child.fees.term} · {child.fees.academicYear}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-amber-800/80">
                            Billed (after waivers)
                          </div>
                          <div className="font-semibold text-amber-900">
                            {formatCedis(
                              child.fees.totalBilledPesewas -
                                child.fees.totalWaivedPesewas
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-emerald-800/80">
                            Paid so far
                          </div>
                          <div className="font-semibold text-emerald-900">
                            {formatCedis(child.fees.totalPaidPesewas)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-amber-900/80">
                          Balance:
                          <span className="font-semibold ml-1">
                            {formatCedis(
                              Math.max(child.fees.balancePesewas, 0)
                            )}
                          </span>
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          Last payment:{" "}
                          {child.fees.lastPaymentAmountPesewas != null &&
                          child.fees.lastPaymentAt
                            ? `${formatCedis(
                                child.fees.lastPaymentAmountPesewas
                              )} on ${formatDate(
                                child.fees.lastPaymentAt
                              )}`
                            : "None recorded yet"}
                        </span>
                      </div>
                    </div>

                    {/* Health summary */}
                    <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-emerald-900">
                          Health screening
                        </span>
                        <span className="text-[10px] text-emerald-800">
                          Last check:{" "}
                          {formatDate(child.health?.lastDate ?? null)}
                        </span>
                      </div>
                      {child.health ? (
                        <>
                          <div className="text-[11px] text-emerald-900/90">
                            Temperature:{" "}
                            {child.health.temperatureC != null ? (
                              <span
                                className={
                                  (child.health.temperatureC ?? 0) >= 37.8
                                    ? "font-semibold text-rose-700"
                                    : "font-semibold text-emerald-900"
                                }
                              >
                                {child.health.temperatureC.toFixed(1)} °C
                              </span>
                            ) : (
                              <span className="text-zinc-600">
                                Not recorded
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-emerald-900/90">
                            Symptoms:{" "}
                            {child.health.symptoms?.trim()
                              ? child.health.symptoms
                              : "None recorded"}
                          </div>
                          <div className="text-[11px] text-emerald-900/90">
                            Notes:{" "}
                            {child.health.notes?.trim()
                              ? child.health.notes
                              : "—"}
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-emerald-900/80">
                          No health screenings recorded yet for this learner in
                          the system. As the daily temperature project grows,
                          this box will light up.
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-[10px] text-zinc-500">
                    This card is designed for calm conversations at home:{" "}
                    <span className="font-semibold">
                      &quot;Here&apos;s what we owe, here&apos;s how your health
                      is, here&apos;s how we&apos;ll plan together.&quot;
                    </span>
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Tiny footer note */}
        <p className="text-[11px] text-zinc-500 max-w-3xl">
          In later EduLife OS phases, this overview will also pull in{" "}
          <span className="font-semibold">
            attendance and learning highlights
          </span>{" "}
          for each child, plus a short AI-written summary in simple language
          that any parent can understand.
        </p>
      </div>
    </main>
  );
}
