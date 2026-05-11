// src/app/parent/overview/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";

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

type PayInitResponse = {
  ok?: boolean;
  error?: string;
  authorization_url?: string;
};

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

const emptyPayModal: PayModal = {
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

function formatCedis(pesewas: number | null | undefined): string {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GH₵${(value / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";

  return dt.toLocaleDateString("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseCedisToPesewas(raw: string): number {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return NaN;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return NaN;

  return Math.round(value * 100);
}

function LoadingShell() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Loading…</div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Preparing parent overview.
          </div>
        </div>
      </div>
    </main>
  );
}

function friendlyParentError(code?: string) {
  const map: Record<string, string> = {
    UNAUTHORIZED_PARENT: "Your parent session has expired. Please sign in again.",
    FAILED_TO_LOAD_PARENT_OVERVIEW:
      "Could not load the parent overview. Please try again.",
    PAYMENT_AMOUNT_INVALID: "Enter a valid payment amount.",
    PAYMENT_EXCEEDS_BALANCE: "The amount is more than the outstanding balance.",
    PAYMENT_SERVICE_NOT_CONFIGURED:
      "Online payment is not fully configured yet. Please contact the school.",
    PAYMENT_GATEWAY_FAILED:
      "The payment provider could not start the payment. Please try again.",
  };

  return map[code ?? ""] ?? code ?? "Something went wrong. Please try again.";
}

export default function ParentOverviewPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <ParentOverviewInner />
    </Suspense>
  );
}

function ParentOverviewInner() {
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [students, setStudents] = useState<OverviewStudent[] | null>(null);
  const [metaTerm, setMetaTerm] = useState<string | null>(null);
  const [metaYear, setMetaYear] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<PayModal>(emptyPayModal);

  const loadOverview = useCallback(async () => {
    const safeTerm = term.trim();
    const safeYear = academicYear.trim();

    if (!safeTerm || !safeYear) {
      setError("Select a term and academic year.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/parent/overview", window.location.origin);
      url.searchParams.set("term", safeTerm);
      url.searchParams.set("academicYear", safeYear);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as OverviewResponse;

      if (!res.ok || !json.ok) {
        setStudents([]);
        setError(friendlyParentError(json.error));
        return;
      }

      setStudents(Array.isArray(json.students) ? json.students : []);
      setMetaTerm(json.meta?.term ?? safeTerm);
      setMetaYear(json.meta?.academicYear ?? safeYear);
    } catch {
      setStudents([]);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [term, academicYear]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  function openPayModal(child: OverviewStudent) {
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
  }

  async function handlePayNow() {
    const amountPesewas = parseCedisToPesewas(payModal.amountCedis);

    if (!Number.isFinite(amountPesewas) || amountPesewas < 100) {
      setPayModal((current) => ({
        ...current,
        payError: "Minimum payment is GH₵1.00.",
      }));
      return;
    }

    if (amountPesewas > payModal.outstandingPesewas) {
      setPayModal((current) => ({
        ...current,
        payError: "Amount exceeds outstanding balance.",
      }));
      return;
    }

    setPayModal((current) => ({ ...current, paying: true, payError: null }));

    try {
      const res = await fetch("/api/parent/payments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          studentId: payModal.studentId,
          term: payModal.term,
          academicYear: payModal.academicYear,
          amountPesewas,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as PayInitResponse;

      if (!res.ok || !json.ok || !json.authorization_url) {
        setPayModal((current) => ({
          ...current,
          paying: false,
          payError: friendlyParentError(json.error),
        }));
        return;
      }

      window.location.href = json.authorization_url;
    } catch {
      setPayModal((current) => ({
        ...current,
        paying: false,
        payError: "Network error. Please try again.",
      }));
    }
  }

  const hasLoaded = students !== null;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:py-8">
        <header className="space-y-1">
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-900">
            EduLife OS · Parent Overview
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            Term Overview
          </h1>
          <p className="max-w-2xl text-sm text-zinc-500">
            Fees, payments, attendance direction, and health snapshot for your
            children.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm md:px-5 md:py-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Term
              </label>
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
              <label className="text-[11px] font-medium text-zinc-700">
                Academic year
              </label>
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
              onClick={() => void loadOverview()}
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

        <nav className="flex flex-wrap gap-2">
          <Link
            href="/parent/fees"
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100"
          >
            My Fees &amp; Payments
          </Link>
          <Link
            href="/parent/receipts"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            Payment Receipts
          </Link>
          <Link
            href="/parent/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Attendance
          </Link>
          <Link
            href="/parent/report"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            My Children&apos;s Reports
          </Link>
        </nav>

        <section className="space-y-3">
          {loading && (
            <p className="text-[11px] text-zinc-500">
              Loading your children&apos;s overview…
            </p>
          )}

          {hasLoaded && students.length === 0 && !loading && !error && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              No learners found linked to your account for this term.
              <p className="mt-1 text-[11px]">
                Contact the school if your children are not showing.
              </p>
            </div>
          )}

          {hasLoaded && students.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              {students.map((child) => {
                const balance = Math.max(child.fees.balancePesewas, 0);
                const settled = balance <= 0;

                return (
                  <article
                    key={child.id}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm md:px-5 md:py-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900 md:text-base">
                          {child.name}
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          Class:{" "}
                          <span className="font-medium">
                            {child.classroomName || "Not set"}
                          </span>
                        </p>
                      </div>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-[11px] font-medium",
                          settled
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-50 text-amber-800",
                        ].join(" ")}
                      >
                        {settled ? "Fees settled" : "Balance due"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Paid
                        </p>
                        <p className="mt-1 text-lg font-semibold text-emerald-800">
                          {formatCedis(child.fees.totalPaidPesewas)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Balance
                        </p>
                        <p
                          className={[
                            "mt-1 text-lg font-semibold",
                            settled ? "text-emerald-800" : "text-amber-800",
                          ].join(" ")}
                        >
                          {formatCedis(balance)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-zinc-100 bg-white px-3 py-3 text-[11px] text-zinc-600">
                      <div className="flex justify-between gap-3">
                        <span>Total billed</span>
                        <span className="font-medium text-zinc-900">
                          {formatCedis(child.fees.totalBilledPesewas)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-3">
                        <span>Waived / support</span>
                        <span className="font-medium text-zinc-900">
                          {formatCedis(child.fees.totalWaivedPesewas)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-3">
                        <span>Last payment</span>
                        <span className="font-medium text-zinc-900">
                          {child.fees.lastPaymentAmountPesewas
                            ? `${formatCedis(
                                child.fees.lastPaymentAmountPesewas
                              )} · ${formatDate(child.fees.lastPaymentAt)}`
                            : "No payment yet"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-600">
                      <p className="font-semibold text-zinc-800">
                        Health snapshot
                      </p>
                      {child.health ? (
                        <div className="mt-1 space-y-1">
                          <p>
                            Last check:{" "}
                            <span className="font-medium text-zinc-900">
                              {formatDate(child.health.lastDate)}
                            </span>
                          </p>
                          <p>
                            Temperature:{" "}
                            <span className="font-medium text-zinc-900">
                              {child.health.temperatureC == null
                                ? "Not recorded"
                                : `${child.health.temperatureC.toFixed(1)}°C`}
                            </span>
                          </p>
                          {child.health.symptoms && (
                            <p>
                              Symptoms:{" "}
                              <span className="font-medium text-zinc-900">
                                {child.health.symptoms}
                              </span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1">No health record for this period.</p>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/parent/report?studentId=${encodeURIComponent(
                          child.id
                        )}&term=${encodeURIComponent(
                          child.fees.term
                        )}&academicYear=${encodeURIComponent(
                          child.fees.academicYear
                        )}`}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        View report
                      </Link>

                      <Link
                        href="/parent/fees"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Fees detail
                      </Link>

                      {!settled && (
                        <button
                          type="button"
                          onClick={() => openPayModal(child)}
                          className="rounded-xl bg-sky-900 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-950"
                        >
                          Pay now
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {payModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Pay school fees
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {payModal.studentName} · {payModal.term}{" "}
                  {payModal.academicYear}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPayModal(emptyPayModal)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-[11px] font-medium text-amber-900">
                Outstanding balance
              </p>
              <p className="mt-1 text-xl font-semibold text-amber-950">
                {formatCedis(payModal.outstandingPesewas)}
              </p>
            </div>

            <div className="mt-4 space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Amount to pay
              </label>
              <input
                value={payModal.amountCedis}
                onChange={(e) =>
                  setPayModal((current) => ({
                    ...current,
                    amountCedis: e.target.value,
                    payError: null,
                  }))
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="e.g. 50.00"
              />
            </div>

            {payModal.payError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {payModal.payError}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setPayModal((current) => ({
                    ...current,
                    amountCedis: (current.outstandingPesewas / 100).toFixed(2),
                    payError: null,
                  }))
                }
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Pay full balance
              </button>

              <button
                type="button"
                onClick={handlePayNow}
                disabled={payModal.paying}
                className="rounded-xl bg-sky-900 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-950 disabled:opacity-50"
              >
                {payModal.paying ? "Starting payment…" : "Continue to payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}