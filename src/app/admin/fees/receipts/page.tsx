// src/app/admin/fees/receipts/page.tsx
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type RefundState =
  | "NOT_REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FULLY_REFUNDED"
  | "HAS_PENDING_REFUND";

type RefundRow = {
  id: string;
  amountPesewas: number;
  status: string;
  reason: string | null;
  provider: string | null;
  providerReference: string | null;
  providerRefundReference: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  processingAt: string | null;
  processedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
};

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  status: string;
  expectedStatus?: string | null;
  statusMatchesRefundTruth?: boolean;
  reversedAt?: string | null;
  reversalReason?: string | null;
  note?: string | null;

  amountPesewas: number;
  originalAmountPesewas?: number;
  grossPaidPesewas?: number;
  refundedPesewas?: number;
  succeededRefundPesewas?: number;
  pendingRefundPesewas?: number;
  failedRefundPesewas?: number;
  cancelledRefundPesewas?: number;
  reservedRefundPesewas?: number;
  netAmountPesewas?: number;
  netPaidPesewas?: number;
  remainingRefundablePesewas?: number;
  refundState?: RefundState;

  method: string | null;
  reference: string | null;
  channel: string | null;
  paidAt: string | null;
  paymentStatus?: string | null;
  isSuccessfulPayment?: boolean;

  provider: string | null;
  providerReference: string | null;
  providerTransactionId?: string | null;
  providerPaymentStatus?: string | null;
  currency?: string | null;

  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceTotalBilledPesewas?: number | null;
  invoiceTotalWaivedPesewas?: number | null;
  invoiceTotalPaidPesewas?: number | null;
  invoiceBalancePesewas: number | null;
  term: string | null;
  academicYear: string | null;

  studentId?: string | null;
  studentName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  classLabel: string;
  issuedByName: string;

  refunds?: RefundRow[];
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  count?: number;
  take?: number;
  filters?: {
    term?: string | null;
    academicYear?: string | null;
    studentId?: string | null;
    method?: string | null;
    q?: string | null;
    refundState?: string | null;
  };
  totalAmountPesewas?: number;
  totalRefundedPesewas?: number;
  totalPendingRefundPesewas?: number;
  totalNetAmountPesewas?: number;
  inconsistentReceiptStatusCount?: number;
  receipts?: ReceiptRow[];
  items?: ReceiptRow[];
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
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

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";

  try {
    return new Date(iso).toLocaleString("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
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

function receiptStatusClass(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();

  if (s === "REFUNDED") return "border-red-200 bg-red-50 text-red-800";
  if (s === "PARTIALLY_REFUNDED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (s === "ISSUED") return "border-emerald-200 bg-emerald-50 text-emerald-800";

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function refundStateLabel(state: string | null | undefined) {
  const s = String(state ?? "NOT_REFUNDED").toUpperCase();

  if (s === "FULLY_REFUNDED") return "Fully refunded";
  if (s === "PARTIALLY_REFUNDED") return "Partially refunded";
  if (s === "HAS_PENDING_REFUND") return "Pending refund";
  return "Not refunded";
}

function refundStateClass(state: string | null | undefined) {
  const s = String(state ?? "NOT_REFUNDED").toUpperCase();

  if (s === "FULLY_REFUNDED") return "border-red-200 bg-red-50 text-red-800";
  if (s === "PARTIALLY_REFUNDED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (s === "HAS_PENDING_REFUND") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_RECEIPTS:
      "Receipts could not be loaded. Check the server logs or database connection.",
    FORBIDDEN: "You do not have permission to view receipts.",
  };

  return map[code ?? ""] ?? "Receipts could not be loaded.";
}

function receiptAmount(row: ReceiptRow) {
  return row.originalAmountPesewas ?? row.grossPaidPesewas ?? row.amountPesewas ?? 0;
}

function refundedAmount(row: ReceiptRow) {
  return row.succeededRefundPesewas ?? row.refundedPesewas ?? 0;
}

function pendingRefundAmount(row: ReceiptRow) {
  return row.pendingRefundPesewas ?? 0;
}

function netAmount(row: ReceiptRow) {
  return row.netAmountPesewas ?? row.netPaidPesewas ?? Math.max(0, receiptAmount(row) - refundedAmount(row));
}

export default function AdminReceiptsPage() {
  const [items, setItems] = useState<ReceiptRow[]>([]);
  const [totalAmountPesewas, setTotalAmountPesewas] = useState(0);
  const [totalRefundedPesewas, setTotalRefundedPesewas] = useState(0);
  const [totalPendingRefundPesewas, setTotalPendingRefundPesewas] = useState(0);
  const [totalNetAmountPesewas, setTotalNetAmountPesewas] = useState(0);
  const [inconsistentReceiptStatusCount, setInconsistentReceiptStatusCount] =
    useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [method, setMethod] = useState("");
  const [refundState, setRefundState] = useState("");
  const [q, setQ] = useState("");

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("take", "1000");

      if (term.trim()) params.set("term", term.trim());
      if (academicYear.trim()) params.set("academicYear", academicYear.trim());
      if (method.trim()) params.set("method", method.trim());
      if (refundState.trim()) params.set("refundState", refundState.trim());
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/admin/fees/receipts/list?${params}`, {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setItems([]);
        setTotalAmountPesewas(0);
        setTotalRefundedPesewas(0);
        setTotalPendingRefundPesewas(0);
        setTotalNetAmountPesewas(0);
        setInconsistentReceiptStatusCount(0);
        return;
      }

      const rows = Array.isArray(json.receipts)
        ? json.receipts
        : Array.isArray(json.items)
          ? json.items
          : [];

      setItems(rows);
      setTotalAmountPesewas(json.totalAmountPesewas ?? 0);
      setTotalRefundedPesewas(json.totalRefundedPesewas ?? 0);
      setTotalPendingRefundPesewas(json.totalPendingRefundPesewas ?? 0);
      setTotalNetAmountPesewas(json.totalNetAmountPesewas ?? 0);
      setInconsistentReceiptStatusCount(json.inconsistentReceiptStatusCount ?? 0);
    } catch {
      setError("Network error loading receipts.");
      setItems([]);
      setTotalAmountPesewas(0);
      setTotalRefundedPesewas(0);
      setTotalPendingRefundPesewas(0);
      setTotalNetAmountPesewas(0);
      setInconsistentReceiptStatusCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const paystackCount = useMemo(
    () => items.filter((item) => item.method?.toLowerCase() === "paystack").length,
    [items]
  );

  const manualCount = useMemo(
    () => items.filter((item) => item.method?.toLowerCase() !== "paystack").length,
    [items]
  );

  const refundedReceiptCount = useMemo(
    () =>
      items.filter((item) =>
        ["REFUNDED", "PARTIALLY_REFUNDED"].includes(
          String(item.status ?? "").toUpperCase()
        )
      ).length,
    [items]
  );

  const pendingRefundReceiptCount = useMemo(
    () =>
      items.filter(
        (item) =>
          String(item.refundState ?? "").toUpperCase() === "HAS_PENDING_REFUND"
      ).length,
    [items]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              EduLife OS · Finance Evidence
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Payment receipts
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Full tenant receipt register. This page must agree with ledger,
              refunds, overview, summary, reconciliation, and parent receipts.
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
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto]"
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
                placeholder="All years"
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
                Refund state
              </label>
              <select
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                value={refundState}
                onChange={(e) => setRefundState(e.target.value)}
              >
                <option value="">All states</option>
                <option value="NOT_REFUNDED">Not refunded</option>
                <option value="HAS_PENDING_REFUND">Pending refund</option>
                <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                <option value="FULLY_REFUNDED">Fully refunded</option>
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

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTerm("");
                setAcademicYear("");
                setMethod("");
                setRefundState("");
                setQ("");
                setTimeout(() => void load(), 0);
              }}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Clear filters
            </button>

            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Refresh register
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Receipts in view</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {items.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {manualCount} manual / {paystackCount} Paystack
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Gross receipted</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">
              {formatCedis(totalAmountPesewas)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Before succeeded refunds
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Succeeded refunds</p>
            <p className="mt-1 text-xl font-bold text-red-950">
              {formatCedis(totalRefundedPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">
              {refundedReceiptCount} affected receipt(s)
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Pending refunds</p>
            <p className="mt-1 text-xl font-bold text-amber-950">
              {formatCedis(totalPendingRefundPesewas)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {pendingRefundReceiptCount} awaiting final outcome
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-[11px] text-blue-700">Net receipted</p>
            <p className="mt-1 text-xl font-bold text-blue-950">
              {formatCedis(totalNetAmountPesewas)}
            </p>
            <p className="mt-1 text-xs text-blue-700">
              Gross minus succeeded refunds
            </p>
          </div>
        </section>

        {inconsistentReceiptStatusCount > 0 && (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Receipt truth warning</p>
            <p className="mt-1 text-xs">
              {inconsistentReceiptStatusCount} receipt(s) do not match their refund truth.
              Investigate before exporting reports.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Receipt register
              </h2>
              <p className="text-xs text-zinc-500">
                Newest receipts first. Every row shows gross amount, refund exposure,
                net amount, and receipt status.
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
                  <th className="px-3 py-2 text-right font-medium">Gross</th>
                  <th className="px-3 py-2 text-right font-medium">Refunded</th>
                  <th className="px-3 py-2 text-right font-medium">Pending</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-left font-medium">Method</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-zinc-500">
                      No receipts found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  items.map((receipt) => {
                    const gross = receiptAmount(receipt);
                    const refunded = refundedAmount(receipt);
                    const pending = pendingRefundAmount(receipt);
                    const net = netAmount(receipt);

                    return (
                      <tr key={receipt.id} className="align-top">
                        <td className="px-3 py-3">
                          <p className="font-mono text-[11px] font-semibold text-zinc-900">
                            {receipt.receiptNumber}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            Invoice: {receipt.invoiceStatus ?? "—"}
                          </p>
                          {receipt.statusMatchesRefundTruth === false && (
                            <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
                              Status mismatch
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3 text-zinc-700">
                          {formatDate(receipt.issuedAt)}
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-semibold text-zinc-900">
                            {receipt.studentName}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            Guardian: {receipt.guardianName ?? "—"}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {receipt.guardianPhone ?? receipt.issuedToPhone ?? "—"}
                          </p>
                        </td>

                        <td className="px-3 py-3 text-zinc-700">
                          {receipt.classLabel}
                        </td>

                        <td className="px-3 py-3 text-zinc-700">
                          {receipt.term ?? "—"}, {receipt.academicYear ?? "—"}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-zinc-900">
                          {formatCedis(gross)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-red-700">
                          {formatCedis(refunded)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-amber-700">
                          {formatCedis(pending)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-blue-900">
                          {formatCedis(net)}
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-zinc-900">
                            {methodLabel(receipt.method)}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {receipt.channel ?? "—"}
                          </p>
                          <p className="mt-1 max-w-[180px] break-all font-mono text-[10px] text-zinc-500">
                            {receipt.reference ?? receipt.providerReference ?? "—"}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${receiptStatusClass(
                              receipt.status
                            )}`}
                          >
                            {receipt.status}
                          </span>

                          <span
                            className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${refundStateClass(
                              receipt.refundState
                            )}`}
                          >
                            {refundStateLabel(receipt.refundState)}
                          </span>

                          {receipt.refunds && receipt.refunds.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {receipt.refunds.slice(0, 2).map((refund) => (
                                <p
                                  key={refund.id}
                                  className="text-[10px] text-zinc-500"
                                  title={`${refund.status} · ${formatDateTime(
                                    refund.processedAt ||
                                      refund.processingAt ||
                                      refund.approvedAt ||
                                      refund.requestedAt
                                  )}`}
                                >
                                  {refund.status}: {formatCedis(refund.amountPesewas)}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/fees/receipts/${receipt.id}`}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}