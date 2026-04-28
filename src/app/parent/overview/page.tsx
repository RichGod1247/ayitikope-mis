// src/app/parent/overview/page.tsx
"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";

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
  guardianPhone?: string | null;
  meta?: { term: string; academicYear: string };
  students?: OverviewStudent[];
  error?: string;
};

function formatCedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function LoadingShell() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Loading…</div>
          <div className="mt-2 text-[11px] text-zinc-500">Preparing parent overview.</div>
        </div>
      </div>
    </main>
  );
}

export default function ParentOverviewPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <ParentOverviewInner />
    </Suspense>
  );
}

function ParentOverviewInner() {
  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<OverviewStudent[] | null>(null);
  const [metaTerm, setMetaTerm] = useState<string | null>(null);
  const [metaYear, setMetaYear] = useState<string | null>(null);

  type PayModal = {
    open: boolean;
    studentId: string;
    studentName: string;
    outstandingPesewas: number;
    amountCedis: string;
    term: string;
    academicYear: string;
    paying: boolean;
    payError: string | null;
  };
  const emptyModal: PayModal = {
    open: false,
    studentId: "",
    studentName: "",
    outstandingPesewas: 0,
    amountCedis: "",
    term: "",
    academicYear: "",
    paying: false,
    payError: null,
  };
  const [payModal, setPayModal] = useState<PayModal>(emptyModal);

  const openPayModal = useCallback((child: OverviewStudent) => {
    const outstanding = Math.max(child.fees.balancePesewas, 0);
    setPayModal({
      open: true,
      studentId: child.id,
      studentName: child.name,
      outstandingPesewas: outstanding,
      amountCedis: (outstanding / 100).toFixed(2),
      term: child.fees.term,
      academicYear: child.fees.academicYear,
      paying: false,
      payError: null,
    });
  }, []);

  const loadOverview = useCallback(async () => {
    if (!term.trim() || !academicYear.trim()) return;
    setLoading(true);
    setError("");
    setData(null);

    try {
      const url = new URL("/api/parent/overview", window.location.origin);
      url.searchParams.set("term", term.trim());
      url.searchParams.set("academicYear", academicYear.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as OverviewResponse;

      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load overview. Please sign in again.");
        return;
      }

      setData(Array.isArray(json.students) ? json.students : []);
      setMetaTerm(json.meta?.term ?? term);
      setMetaYear(json.meta?.academicYear ?? academicYear);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [term, academicYear]);

  // Auto-load on mount
  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePayNow() {
    const amountCedisNum = parseFloat(payModal.amountCedis);
    if (!Number.isFinite(amountCedisNum) || amountCedisNum < 0.01) {
      setPayModal((p) => ({ ...p, payError: "Enter a valid amount (minimum GH₵0.01)" }));
      return;
    }
    const amountPesewas = Math.round(amountCedisNum * 100);
    if (amountPesewas < 100) {
      setPayModal((p) => ({ ...p, payError: "Minimum payment is GH₵1.00" }));
      return;
    }
    if (amountPesewas > payModal.outstandingPesewas) {
      setPayModal((p) => ({ ...p, payError: "Amount exceeds outstanding balance" }));
      return;
    }

    setPayModal((p) => ({ ...p, paying: true, payError: null }));

    try {
      const res = await fetch("/api/parent/payments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: payModal.studentId,
          term: payModal.term,
          academicYear: payModal.academicYear,
          amountPesewas,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        authorization_url?: string;
      };
      if (!res.ok || !j.ok) {
        setPayModal((p) => ({
          ...p,
          paying: false,
          payError: j.error || "Payment initialization failed",
        }));
        return;
      }
      if (j.authorization_url) window.location.href = j.authorization_url;
    } catch {
      setPayModal((p) => ({
        ...p,
        paying: false,
        payError: "Network error. Please try again.",
      }));
    }
  }

  const hasData = data !== null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
            Term Overview
          </h1>
          <p className="text-sm text-zinc-500">
            Fees and health snapshot for your children.
          </p>
        </header>

        {/* Term / year filters */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">Term</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">Academic year</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025/2026"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-sky-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-950 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load overview"}
            </button>
          </div>

          {metaTerm && metaYear && (
            <p className="mt-3 text-[11px] text-zinc-500">
              Showing: <span className="font-semibold">{metaTerm}</span> ·{" "}
              <span className="font-semibold">{metaYear}</span>
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {error}
            </div>
          )}
        </section>

        {/* Quick navigation */}
        <nav className="flex flex-wrap gap-2">
          <a
            href="/parent/fees"
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100 transition-colors"
          >
            My Fees &amp; Payments
          </a>
          <a
            href="/parent/receipts"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            Payment Receipts
          </a>
          <a
            href="/parent/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Attendance
          </a>
          <a
            href="/parent/report"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            My Children&apos;s Reports
          </a>
        </nav>

        {/* Results */}
        <section className="space-y-3">
          {loading && (
            <p className="text-[11px] text-zinc-500">Loading your children's overview…</p>
          )}

          {hasData && data!.length === 0 && !loading && !error && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              No learners found linked to your account for this term.
              <p className="mt-1 text-[11px]">Contact the school if your children are not showing.</p>
            </div>
          )}

          {hasData && data!.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {data!.map((child) => (
                <article
                  key={child.id}
                  className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm md:text-base font-semibold text-zinc-900">{child.name}</h3>
                      <p className="text-[11px] text-zinc-500">
                        Class: <span className="font-medium">{child.classroomName || "Not set"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {/* Fees summary */}
                    <div className="rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-amber-900">Fees summary</span>
                        <span className="text-[10px] text-amber-800">
                          {child.fees.term} · {child.fees.academicYear}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-amber-800/80">Billed (after waivers)</div>
                          <div className="font-semibold text-amber-900">
                            {formatCedis(child.fees.totalBilledPesewas - child.fees.totalWaivedPesewas)}
                          </div>
                        </div>
                        <div>
                          <div className="text-emerald-800/80">Paid so far</div>
                          <div className="font-semibold text-emerald-900">
                            {formatCedis(child.fees.totalPaidPesewas)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-amber-900/80">
                          Balance:{" "}
                          <span className="font-semibold">
                            {formatCedis(Math.max(child.fees.balancePesewas, 0))}
                          </span>
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          Last payment:{" "}
                          {child.fees.lastPaymentAmountPesewas != null && child.fees.lastPaymentAt
                            ? `${formatCedis(child.fees.lastPaymentAmountPesewas)} on ${formatDate(child.fees.lastPaymentAt)}`
                            : "None recorded yet"}
                        </span>
                      </div>
                      {child.fees.balancePesewas > 0 && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => openPayModal(child)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-800 active:scale-95 transition-transform"
                          >
                            Pay Now
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Health summary */}
                    <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-emerald-900">Health screening</span>
                        <span className="text-[10px] text-emerald-800">
                          Last check: {formatDate(child.health?.lastDate ?? null)}
                        </span>
                      </div>
                      {child.health ? (
                        <>
                          <div className="text-[11px] text-emerald-900/90">
                            Temperature:{" "}
                            {child.health.temperatureC != null ? (
                              <span
                                className={
                                  child.health.temperatureC >= 37.8
                                    ? "font-semibold text-rose-700"
                                    : "font-semibold text-emerald-900"
                                }
                              >
                                {child.health.temperatureC.toFixed(1)} °C
                              </span>
                            ) : (
                              <span className="text-zinc-600">Not recorded</span>
                            )}
                          </div>
                          <div className="text-[11px] text-emerald-900/90">
                            Symptoms:{" "}
                            {child.health.symptoms?.trim() ? child.health.symptoms : "None recorded"}
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-emerald-900/80">
                          No health screenings recorded yet for this learner.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Pay Now modal */}
      {payModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !payModal.paying && setPayModal(emptyModal)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-zinc-200 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-900">Pay School Fees</h2>
              <p className="text-xs text-zinc-600">
                Learner: <span className="font-semibold">{payModal.studentName}</span>
              </p>
              <p className="text-xs text-zinc-500">
                {payModal.term} · {payModal.academicYear}
              </p>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-0.5">
              <p className="text-[11px] text-amber-800">Outstanding balance</p>
              <p className="text-xl font-bold text-amber-900">
                {formatCedis(payModal.outstandingPesewas)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-900">Amount to pay (GH₵)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-500">
                  GH₵
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(payModal.outstandingPesewas / 100).toFixed(2)}
                  value={payModal.amountCedis}
                  onChange={(e) =>
                    setPayModal((p) => ({ ...p, amountCedis: e.target.value, payError: null }))
                  }
                  disabled={payModal.paying}
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                />
              </div>
              <p className="text-[10px] text-zinc-500">Minimum GH₵1.00.</p>
            </div>

            {payModal.payError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {payModal.payError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={payModal.paying}
                onClick={() => setPayModal(emptyModal)}
                className="flex-1 rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={payModal.paying}
                onClick={handlePayNow}
                className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
              >
                {payModal.paying ? "Connecting…" : "Proceed to payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
