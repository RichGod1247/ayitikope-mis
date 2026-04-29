// src/app/admin/fees/ledger/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LedgerItem = {
  id: string;
  entryType: string;
  direction: "DEBIT" | "CREDIT";
  amountPesewas: number;
  signedAmountPesewas: number;
  description: string | null;
  journalRef: string | null;
  createdAt: string;

  invoiceId: string | null;
  invoiceLineId: string | null;
  feePaymentId: string | null;
  feeAdjustmentId: string | null;
  receiptId: string | null;

  term: string | null;
  academicYear: string | null;

  studentId: string | null;
  studentName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  classLabel: string | null;

  paymentMethod: string | null;
  paymentReference: string | null;
  paymentChannel: string | null;
  paidAt: string | null;

  receiptNumber: string | null;
  createdByName: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  count?: number;
  summary?: {
    debitTotalPesewas: number;
    creditTotalPesewas: number;
    netCreditPesewas: number;
  };
  items?: LedgerItem[];
};

const ENTRY_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "INVOICE_DEBIT", label: "Invoice debit" },
  { value: "PAYMENT_CREDIT", label: "Payment credit" },
  { value: "ADJUSTMENT_CREDIT", label: "Adjustment credit" },
  { value: "REVERSAL_DEBIT", label: "Reversal debit" },
  { value: "REVERSAL_CREDIT", label: "Reversal credit" },
  { value: "CORRECTION", label: "Correction" },
];

const DIRECTION_OPTIONS = [
  { value: "", label: "All directions" },
  { value: "DEBIT", label: "Debit only" },
  { value: "CREDIT", label: "Credit only" },
];

const ENTRY_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  INVOICE_DEBIT: {
    label: "Invoice debit",
    cls: "border-red-200 bg-red-50 text-red-800",
  },
  PAYMENT_CREDIT: {
    label: "Payment credit",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  ADJUSTMENT_CREDIT: {
    label: "Adjustment credit",
    cls: "border-blue-200 bg-blue-50 text-blue-800",
  },
  REVERSAL_DEBIT: {
    label: "Reversal debit",
    cls: "border-orange-200 bg-orange-50 text-orange-800",
  },
  REVERSAL_CREDIT: {
    label: "Reversal credit",
    cls: "border-teal-200 bg-teal-50 text-teal-800",
  },
  CORRECTION: {
    label: "Correction",
    cls: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "Unavailable";

  try {
    return new Date(iso).toLocaleString("en-GH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unavailable";
  }
}

function methodLabel(method: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    momo: "Mobile money",
    paystack: "Paystack",
    bank_transfer: "Bank transfer",
    other: "Other",
  };

  return method ? map[method.toLowerCase()] ?? method : "None";
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_LEDGER:
      "The ledger could not be loaded. Please try again or check the server logs.",
    INVALID_ENTRY_TYPE: "The selected ledger type is not valid.",
    INVALID_DIRECTION: "The selected ledger direction is not valid.",
  };

  return map[code ?? ""] ?? "Failed to load ledger.";
}

export default function AdminFeesLedgerPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [summary, setSummary] = useState<ApiResponse["summary"] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [entryType, setEntryType] = useState("");
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/ledger", window.location.origin);

      if (term) url.searchParams.set("term", term);
      if (academicYear) url.searchParams.set("academicYear", academicYear);
      if (entryType) url.searchParams.set("entryType", entryType);
      if (direction) url.searchParams.set("direction", direction);
      if (q.trim()) url.searchParams.set("q", q.trim());
      url.searchParams.set("take", "300");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setItems([]);
        setSummary(null);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
      setSummary(json.summary ?? null);
    } catch {
      setError("Network error loading ledger.");
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestEntries = useMemo(() => items.slice(0, 300), [items]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              EduLife OS - Finance Ledger
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-950">
              Ledger trail
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Every financial movement: invoice debits, payment credits,
              adjustments, reversals, and corrections. This is the school&apos;s
              accounting evidence trail.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/overview"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Overview
            </Link>
            <Link
              href="/admin/fees/reconciliation"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Reconciliation
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
          <form
            onSubmit={load}
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto]"
          >
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Term
              </label>
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
              <label className="text-[11px] font-semibold text-zinc-700">
                Academic year
              </label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Entry type
              </label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                {ENTRY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Direction
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                {DIRECTION_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Search learner / guardian
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, guardian, phone..."
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
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-[11px] font-medium text-red-700">
                Debit total
              </p>
              <p className="mt-1 text-xl font-bold text-red-950">
                {formatCedis(summary.debitTotalPesewas)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-medium text-emerald-700">
                Credit total
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-950">
                {formatCedis(summary.creditTotalPesewas)}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-[11px] font-medium text-zinc-600">
                Net movement in view
              </p>
              <p
                className={`mt-1 text-xl font-bold ${
                  summary.netCreditPesewas >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatCedis(summary.netCreditPesewas)}
              </p>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Ledger entries
              </h2>
              <p className="text-xs text-zinc-500">
                Showing {latestEntries.length} entries. Newest first.
              </p>
            </div>

            {loading && <span className="text-xs text-zinc-500">Loading...</span>}
          </div>

          {loading ? (
            <div className="px-4 py-8 text-sm text-zinc-500">
              Loading ledger entries...
            </div>
          ) : latestEntries.length === 0 && !error ? (
            <div className="px-4 py-8 text-sm text-zinc-500">
              No ledger entries found for these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Learner</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Reference</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Receipt</th>
                    <th className="px-3 py-2 text-left font-medium">By</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100">
                  {latestEntries.map((item) => {
                    const cfg =
                      ENTRY_TYPE_CONFIG[item.entryType] ?? {
                        label: item.entryType,
                        cls: "border-zinc-200 bg-zinc-50 text-zinc-700",
                      };

                    const amountClass =
                      item.direction === "CREDIT" ? "text-emerald-700" : "text-red-700";

                    return (
                      <tr key={item.id} className="align-top hover:bg-zinc-50">
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                          {formatDateTime(item.createdAt)}
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}
                          >
                            {cfg.label}
                          </span>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            {item.direction}
                          </p>
                        </td>

                        <td className="px-3 py-3 text-zinc-700">
                          <p className="font-semibold text-zinc-900">
                            {item.studentName || "Unlinked"}
                          </p>
                          {item.classLabel && (
                            <p className="text-[10px] text-zinc-500">
                              {item.classLabel}
                            </p>
                          )}
                          {item.term && (
                            <p className="text-[10px] text-zinc-500">
                              {item.term}
                              {item.academicYear ? `, ${item.academicYear}` : ""}
                            </p>
                          )}
                        </td>

                        <td className="max-w-xs px-3 py-3 text-zinc-600">
                          <p className="line-clamp-2">
                            {item.description || "No description"}
                          </p>
                          {item.paymentMethod && (
                            <p className="mt-1 text-[10px] text-zinc-500">
                              Method: {methodLabel(item.paymentMethod)}
                              {item.paymentChannel ? ` / ${item.paymentChannel}` : ""}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3 text-zinc-600">
                          {item.journalRef && (
                            <p className="font-mono text-[10px]">
                              Journal: {item.journalRef}
                            </p>
                          )}
                          {item.paymentReference && (
                            <p className="mt-1 break-all font-mono text-[10px]">
                              Pay: {item.paymentReference}
                            </p>
                          )}
                          {!item.journalRef && !item.paymentReference && (
                            <span className="text-zinc-400">None</span>
                          )}
                        </td>

                        <td className={`px-3 py-3 text-right font-mono font-bold ${amountClass}`}>
                          {item.direction === "CREDIT" ? "+" : "-"}
                          {formatCedis(item.amountPesewas)}
                        </td>

                        <td className="px-3 py-3">
                          {item.receiptId ? (
                            <Link
                              href={`/admin/fees/receipts/${item.receiptId}`}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50"
                            >
                              {item.receiptNumber || "View"}
                            </Link>
                          ) : (
                            <span className="text-zinc-400">None</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-zinc-600">
                          {item.createdByName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
          <p className="font-semibold text-zinc-900">Ledger rule</p>
          <p className="mt-1">
            Every invoice charge should create a debit. Every successful payment
            should create a credit. If money moved but the ledger is silent, the
            reconciliation page must expose it.
          </p>
        </section>
      </div>
    </main>
  );
}