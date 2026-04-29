// src/app/admin/fees/receipts/page.tsx
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  amountPesewas: number;
  method: string | null;
  reference: string | null;
  channel: string | null;
  paidAt: string | null;
  provider: string | null;
  providerReference: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceBalancePesewas: number | null;
  term: string | null;
  academicYear: string | null;
  studentName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  classLabel: string;
  issuedByName: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  count?: number;
  totalAmountPesewas?: number;
  items?: ReceiptRow[];
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GHS ${(value / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Unavailable";

  try {
    return new Date(iso).toLocaleDateString("en-GH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Unavailable";
  }
}

function methodLabel(method: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    paystack: "Paystack",
    momo: "Mobile money",
    bank_transfer: "Bank transfer",
    bank: "Bank transfer",
    hubtel: "Hubtel",
    other: "Other",
  };

  return method ? map[method.toLowerCase()] ?? method : "Payment";
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_RECEIPTS:
      "Receipts could not be loaded. Check the server logs or database connection.",
  };

  return map[code ?? ""] ?? "Receipts could not be loaded.";
}

export default function AdminReceiptsPage() {
  const [items, setItems] = useState<ReceiptRow[]>([]);
  const [totalAmountPesewas, setTotalAmountPesewas] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (term) params.set("term", term);
      if (academicYear) params.set("academicYear", academicYear);
      if (method) params.set("method", method);
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/admin/fees/receipts/list?${params}`, {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setItems([]);
        setTotalAmountPesewas(0);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
      setTotalAmountPesewas(json.totalAmountPesewas ?? 0);
    } catch {
      setError("Network error loading receipts.");
      setItems([]);
      setTotalAmountPesewas(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paystackCount = useMemo(
    () => items.filter((item) => item.method?.toLowerCase() === "paystack").length,
    [items]
  );

  const manualCount = useMemo(
    () => items.filter((item) => item.method?.toLowerCase() !== "paystack").length,
    [items]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              EduLife OS - Finance Evidence
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-950">
              Payment receipts
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Every recorded payment must have a traceable receipt. Use this page to inspect
              parent-facing proof, office-issued receipts, and Paystack references.
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
              href="/admin/fees/ledger"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Ledger
            </Link>
            <Link
              href="/admin/fees/reconciliation"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Reconciliation
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form
            onSubmit={load}
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.5fr_auto]"
          >
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Term
              </label>
              <select
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
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
                type="text"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Method
              </label>
              <select
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">All methods</option>
                <option value="cash">Cash</option>
                <option value="momo">Mobile money</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="paystack">Paystack</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Search
              </label>
              <input
                type="text"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Receipt, learner, guardian, phone, reference..."
              />
            </div>

            <button
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              disabled={loading}
              type="submit"
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

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Receipts in view</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{items.length}</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Total receipted</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">
              {formatCedis(totalAmountPesewas)}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-[11px] text-blue-700">Receipt source mix</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">
              {manualCount} manual / {paystackCount} Paystack
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Receipt register
              </h2>
              <p className="text-xs text-zinc-500">
                Newest receipts first. Each receipt should be printable and traceable.
              </p>
            </div>
            {loading && <span className="text-xs text-zinc-500">Loading...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Receipt</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Learner</th>
                  <th className="px-3 py-2 text-left font-medium">Class</th>
                  <th className="px-3 py-2 text-left font-medium">Term / year</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Method</th>
                  <th className="px-3 py-2 text-left font-medium">Reference</th>
                  <th className="px-3 py-2 text-left font-medium">Issued by</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {items.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-sm text-zinc-500">
                      No receipts found for these filters.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-zinc-50">
                      <td className="px-3 py-3">
                        <p className="font-mono font-semibold text-zinc-900">
                          {row.receiptNumber}
                        </p>
                        {row.invoiceStatus && (
                          <p className="mt-1 text-[10px] text-zinc-500">
                            Invoice: {row.invoiceStatus}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                        {formatDate(row.issuedAt)}
                      </td>

                      <td className="px-3 py-3 text-zinc-700">
                        <p className="font-semibold text-zinc-900">
                          {row.studentName}
                        </p>
                        {row.guardianName && (
                          <p className="text-[10px] text-zinc-500">
                            Guardian: {row.guardianName}
                          </p>
                        )}
                        {row.guardianPhone && (
                          <p className="text-[10px] text-zinc-500">
                            {row.guardianPhone}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3 text-zinc-700">
                        {row.classLabel}
                      </td>

                      <td className="px-3 py-3 text-zinc-700">
                        {row.term || "Term unavailable"}
                        {row.academicYear ? `, ${row.academicYear}` : ""}
                      </td>

                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        {formatCedis(row.amountPesewas)}
                      </td>

                      <td className="px-3 py-3 text-zinc-700">
                        {methodLabel(row.method)}
                        {row.channel && (
                          <p className="text-[10px] text-zinc-500">{row.channel}</p>
                        )}
                      </td>

                      <td className="max-w-xs px-3 py-3">
                        {row.reference || row.providerReference ? (
                          <div className="space-y-1">
                            {row.reference && (
                              <p className="break-all font-mono text-[10px] text-zinc-600">
                                Pay: {row.reference}
                              </p>
                            )}
                            {row.providerReference && (
                              <p className="break-all font-mono text-[10px] text-zinc-600">
                                Provider: {row.providerReference}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">None</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-zinc-700">
                        {row.issuedByName}
                      </td>

                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/admin/fees/receipts/${row.id}`}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}