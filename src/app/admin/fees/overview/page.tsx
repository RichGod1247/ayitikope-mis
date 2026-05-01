// src/app/admin/fees/overview/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Summary = {
  invoiceCount: number;
  learnerCount: number;
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  outstandingPesewas: number;
  todayCollectedPesewas: number;
  receiptCount: number;
  clearedCount: number;
  partialCount: number;
  unpaidCount: number;
  noChargeCount: number;
  openExceptionCount: number;
  collectionRateBps: number;
};

type FeeRow = {
  invoiceId: string;
  studentId: string;
  studentName: string;
  classLabel: string;
  classroomId: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  term: string;
  academicYear: string;
  status: "cleared" | "partial" | "unpaid" | "no_charge";
  storedInvoiceStatus: string;
  issuedAt: string;
  dueDate: string | null;
  billedPesewas: number;
  waivedPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  paymentCount: number;
  receiptCount: number;
  latestPaymentAt: string | null;
  storedMismatch: boolean;
};

type ClassSummary = {
  classroomId: string | null;
  classLabel: string;
  invoiceCount: number;
  learnerCount: number;
  billedPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  clearedCount: number;
  partialCount: number;
  unpaidCount: number;
  collectionRateBps: number;
};

type MethodSummary = {
  method: string;
  count: number;
  amountPesewas: number;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  tenant?: {
    id: string;
    name: string;
    slug: string | null;
    schoolCode: string;
  } | null;
  summary?: Summary;
  classSummaries?: ClassSummary[];
  paymentMethodSummaries?: MethodSummary[];
  rows?: FeeRow[];
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GHS ${(value / 100).toFixed(2)}`;
}

function percentFromBps(bps: number | null | undefined) {
  const value = typeof bps === "number" ? bps : 0;
  return `${(value / 100).toFixed(1)}%`;
}

function statusLabel(status: FeeRow["status"]) {
  if (status === "cleared") return "Cleared";
  if (status === "partial") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "No charge";
}

function statusClass(status: FeeRow["status"]) {
  if (status === "cleared") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "unpaid") return "border-red-200 bg-red-50 text-red-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function methodLabel(method: string) {
  const map: Record<string, string> = {
    cash: "Cash",
    momo: "Mobile money",
    paystack: "Paystack",
    bank_transfer: "Bank transfer",
    other: "Other",
    unknown: "Unknown",
  };

  return map[method] ?? method;
}

export default function AdminFeesOverviewPage() {
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [classroomId, setClassroomId] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("School");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [paymentMethodSummaries, setPaymentMethodSummaries] = useState<MethodSummary[]>([]);

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/overview", window.location.origin);

      if (term) url.searchParams.set("term", term);
      if (academicYear) url.searchParams.set("academicYear", academicYear);
      if (classroomId) url.searchParams.set("classroomId", classroomId);
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !json.ok || !json.summary) {
        setError(json.error || "Failed to load finance overview.");
        setSummary(null);
        setRows([]);
        setClassSummaries([]);
        setPaymentMethodSummaries([]);
        return;
      }

      setTenantName(json.tenant?.name || "School");
      setSummary(json.summary);
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setClassSummaries(Array.isArray(json.classSummaries) ? json.classSummaries : []);
      setPaymentMethodSummaries(
        Array.isArray(json.paymentMethodSummaries) ? json.paymentMethodSummaries : []
      );
    } catch {
      setError("Network error loading finance overview.");
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classroomOptions = useMemo(() => classSummaries.filter((c) => c.classroomId), [classSummaries]);
  const topDebtors = useMemo(() => rows.filter((r) => r.outstandingPesewas > 0).slice(0, 10), [rows]);
  const mismatchCount = useMemo(() => rows.filter((r) => r.storedMismatch).length, [rows]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              EduLife OS - Finance Command
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-950">
              School finance overview
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Real invoice, payment, receipt, and reconciliation signals for{" "}
              <span className="font-semibold text-zinc-900">{tenantName}</span>.
              No mock data. No guesswork.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/online-payments"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Online payments setup
            </Link>
            <Link
              href="/admin/fees/reconciliation"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Reconciliation
            </Link>
            <Link
              href="/admin/fees/ledger"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Ledger trail
            </Link>
            <Link
              href="/admin/fees/receipts"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Receipts
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Term</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All terms</option>
                <option>1st Term</option>
                <option>2nd Term</option>
                <option>3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Academic year</label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Class</label>
              <select
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All classes</option>
                {classroomOptions.map((cls) => (
                  <option key={cls.classroomId ?? cls.classLabel} value={cls.classroomId ?? ""}>
                    {cls.classLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Search learner / guardian / phone
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. Ama, Mensah, 024..."
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply"}
            </button>
          </form>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
        </section>

        {summary && (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium text-zinc-500">Total billed</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">
                  {formatCedis(summary.totalBilledPesewas)}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {summary.invoiceCount} invoices / {summary.learnerCount} learners
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[11px] font-medium text-emerald-700">Total collected</p>
                <p className="mt-1 text-xl font-bold text-emerald-950">
                  {formatCedis(summary.totalPaidPesewas)}
                </p>
                <p className="mt-1 text-[11px] text-emerald-800">
                  {percentFromBps(summary.collectionRateBps)} collection rate
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <p className="text-[11px] font-medium text-amber-700">Outstanding</p>
                <p className="mt-1 text-xl font-bold text-amber-950">
                  {formatCedis(summary.outstandingPesewas)}
                </p>
                <p className="mt-1 text-[11px] text-amber-800">
                  {summary.partialCount + summary.unpaidCount} learners need follow-up
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <p className="text-[11px] font-medium text-blue-700">Collected today</p>
                <p className="mt-1 text-xl font-bold text-blue-950">
                  {formatCedis(summary.todayCollectedPesewas)}
                </p>
                <p className="mt-1 text-[11px] text-blue-800">
                  {summary.receiptCount} receipts in view
                </p>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] text-zinc-500">Cleared</p>
                <p className="text-lg font-bold text-emerald-700">{summary.clearedCount}</p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] text-zinc-500">Partial</p>
                <p className="text-lg font-bold text-amber-700">{summary.partialCount}</p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] text-zinc-500">Unpaid</p>
                <p className="text-lg font-bold text-red-700">{summary.unpaidCount}</p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  summary.openExceptionCount > 0 || mismatchCount > 0
                    ? "border-red-200 bg-red-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p className="text-[11px] text-zinc-600">Risk signals</p>
                <p
                  className={`text-lg font-bold ${
                    summary.openExceptionCount > 0 || mismatchCount > 0
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {summary.openExceptionCount + mismatchCount}
                </p>
                <p className="text-[11px] text-zinc-600">Exceptions + stored mismatches</p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-900">Outstanding by class</h2>
                <div className="mt-3 space-y-2">
                  {classSummaries.length === 0 ? (
                    <p className="text-xs text-zinc-500">No class data found.</p>
                  ) : (
                    classSummaries.slice(0, 8).map((cls) => (
                      <div
                        key={cls.classroomId ?? cls.classLabel}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">{cls.classLabel}</p>
                            <p className="text-[11px] text-zinc-500">
                              {cls.learnerCount} learners / {percentFromBps(cls.collectionRateBps)} collected
                            </p>
                          </div>
                          <p className="text-sm font-bold text-amber-700">
                            {formatCedis(cls.outstandingPesewas)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-900">Payment methods</h2>
                <div className="mt-3 space-y-2">
                  {paymentMethodSummaries.length === 0 ? (
                    <p className="text-xs text-zinc-500">No payments found.</p>
                  ) : (
                    paymentMethodSummaries.map((method) => (
                      <div
                        key={method.method}
                        className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
                      >
                        <div>
                          <p className="font-semibold text-zinc-900">{methodLabel(method.method)}</p>
                          <p className="text-[11px] text-zinc-500">
                            {method.count} payment{method.count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <p className="font-bold text-emerald-700">
                          {formatCedis(method.amountPesewas)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Top balances requiring action
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Sorted by highest outstanding balance.
                  </p>
                </div>
                <p className="text-xs text-zinc-500">
                  Showing {topDebtors.length} of {rows.length} invoices
                </p>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Learner</th>
                      <th className="px-3 py-2 text-left font-medium">Class</th>
                      <th className="px-3 py-2 text-left font-medium">Guardian</th>
                      <th className="px-3 py-2 text-right font-medium">Billed</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                          No invoices found for these filters.
                        </td>
                      </tr>
                    ) : (
                      topDebtors.map((row) => (
                        <tr key={row.invoiceId}>
                          <td className="px-3 py-2 font-semibold text-zinc-900">
                            {row.studentName}
                            <p className="text-[10px] font-normal text-zinc-500">
                              {row.term}, {row.academicYear}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-zinc-700">{row.classLabel}</td>
                          <td className="px-3 py-2 text-zinc-700">
                            {row.guardianName || "Unknown"}
                            {row.guardianPhone && (
                              <p className="text-[10px] text-zinc-500">{row.guardianPhone}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-900">
                            {formatCedis(row.billedPesewas)}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-700">
                            {formatCedis(row.paidPesewas)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700">
                            {formatCedis(row.outstandingPesewas)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(
                                row.status
                              )}`}
                            >
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {row.storedMismatch ? (
                              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                Stored mismatch
                              </span>
                            ) : (
                              <span className="text-zinc-400">Clear</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
              <p className="font-semibold text-zinc-900">Decision rule</p>
              <p className="mt-1">
                Use this page to decide follow-up priorities, not to decorate the
                product. Highest balances, open exceptions, and stored mismatches
                must be handled before rollout.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}