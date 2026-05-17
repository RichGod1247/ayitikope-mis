// src/app/parent/receipts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ReceiptStatus = "ISSUED" | "PARTIALLY_REFUNDED" | "REFUNDED";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;

  amountPesewas: number;
  grossAmountPesewas?: number;
  succeededRefundPesewas?: number;
  pendingRefundPesewas?: number;
  failedOrCancelledRefundPesewas?: number;
  netAmountPesewas?: number;
  refundableRemainingPesewas?: number;
  outstandingPesewas?: number | null;

  computedStatus?: ReceiptStatus;
  receiptStatus?: string | null;
  paymentStatus?: string | null;
  paymentIsSuccessful?: boolean;
  refundCount?: number;
  hasRefundActivity?: boolean;

  method: string | null;
  reference: string | null;
  channel: string | null;
  term: string | null;
  academicYear: string | null;
  studentName: string | null;
};

type ReceiptsResponse = {
  ok: boolean;
  error?: string;
  receipts?: ReceiptRow[];
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GHS ${(value / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Date unavailable";
  }
}

function methodLabel(method: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    paystack: "Online",
    bank_transfer: "Bank transfer",
    bank: "Bank transfer",
    momo: "Mobile money",
    hubtel: "Mobile money",
    other: "Other",
  };

  return method ? map[method.toLowerCase()] ?? method : "Payment";
}

function statusLabel(status?: string | null) {
  const map: Record<string, string> = {
    ISSUED: "Issued",
    PARTIALLY_REFUNDED: "Partially refunded",
    REFUNDED: "Refunded",
  };

  return map[String(status ?? "").toUpperCase()] ?? "Issued";
}

function statusClass(status?: string | null) {
  const s = String(status ?? "").toUpperCase();

  if (s === "REFUNDED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (s === "PARTIALLY_REFUNDED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_RECEIPTS:
      "We could not load your receipts right now. Please try again shortly.",
  };

  return map[code ?? ""] ?? "We could not load your receipts right now.";
}

export default function ParentReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReceipts() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parent/receipts/list", {
        cache: "no-store",
      });

      const json = (await res.json()) as ReceiptsResponse;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setReceipts([]);
        return;
      }

      setReceipts(json.receipts ?? []);
    } catch {
      setError("Network error loading receipts. Please try again.");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReceipts();
  }, []);

  const totals = useMemo(() => {
    return receipts.reduce(
      (acc, receipt) => {
        acc.gross += receipt.grossAmountPesewas ?? receipt.amountPesewas ?? 0;
        acc.refunded += receipt.succeededRefundPesewas ?? 0;
        acc.pendingRefund += receipt.pendingRefundPesewas ?? 0;
        acc.net += receipt.netAmountPesewas ?? receipt.amountPesewas ?? 0;
        return acc;
      },
      { gross: 0, refunded: 0, pendingRefund: 0, net: 0 }
    );
  }, [receipts]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              EduLife OS · Parent Receipts
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">
              Payment receipts
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              View official receipts, refund activity, and the current net paid amount after
              successful refunds.
            </p>
          </div>

          <Link
            href="/parent/fees"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Back to fees
          </Link>
        </header>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500 shadow-sm">
            Loading receipts...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-800">
            <p className="font-semibold">Receipts unavailable</p>
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={loadReceipts}
              className="mt-4 rounded-xl bg-red-900 px-4 py-2 text-xs font-semibold text-white hover:bg-red-950"
            >
              Try again
            </button>
          </section>
        ) : receipts.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">No receipts found</p>
            <p className="mt-1 text-xs text-zinc-500">
              Receipts will appear here after a confirmed payment.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] text-zinc-500">Receipts</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">{receipts.length}</p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[11px] text-emerald-700">Gross paid</p>
                <p className="mt-1 text-xl font-bold text-emerald-950">
                  {formatCedis(totals.gross)}
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <p className="text-[11px] text-rose-700">Refunded</p>
                <p className="mt-1 text-xl font-bold text-rose-950">
                  {formatCedis(totals.refunded)}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] text-zinc-500">Net paid</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">
                  {formatCedis(totals.net)}
                </p>
              </div>
            </section>

            {totals.pendingRefund > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
                <p className="font-semibold">Pending refund exposure</p>
                <p className="mt-1">
                  {formatCedis(totals.pendingRefund)} is currently requested, approved, or
                  processing. Pending refunds are shown separately and are not deducted from net paid
                  until they succeed.
                </p>
              </section>
            )}

            <section className="space-y-3">
              {receipts.map((receipt) => {
                const grossAmount = receipt.grossAmountPesewas ?? receipt.amountPesewas ?? 0;
                const netAmount = receipt.netAmountPesewas ?? grossAmount;
                const refundedAmount = receipt.succeededRefundPesewas ?? 0;
                const pendingRefund = receipt.pendingRefundPesewas ?? 0;
                const computedStatus = receipt.computedStatus ?? "ISSUED";

                return (
                  <article
                    key={receipt.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-bold text-zinc-950">
                            {receipt.receiptNumber}
                          </p>

                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(
                              computedStatus
                            )}`}
                          >
                            {statusLabel(computedStatus)}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-zinc-900">
                          {receipt.studentName ?? receipt.issuedToName ?? "Student"}
                        </p>

                        <p className="text-xs text-zinc-500">
                          {methodLabel(receipt.method)} · {receipt.term}
                          {receipt.term && receipt.academicYear ? ", " : ""}
                          {receipt.academicYear}
                        </p>

                        <p className="text-[11px] text-zinc-500">
                          Issued {formatDate(receipt.issuedAt)}
                        </p>

                        {receipt.reference && (
                          <p className="break-all font-mono text-[10px] text-zinc-500">
                            Ref: {receipt.reference}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-2 text-xs md:min-w-[260px]">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                            <p className="text-zinc-500">Paid</p>
                            <p className="font-bold text-zinc-950">{formatCedis(grossAmount)}</p>
                          </div>

                          <div className="rounded-xl border border-rose-100 bg-rose-50 p-2">
                            <p className="text-rose-700">Refunded</p>
                            <p className="font-bold text-rose-900">
                              {formatCedis(refundedAmount)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2">
                            <p className="text-emerald-700">Net</p>
                            <p className="font-bold text-emerald-900">
                              {formatCedis(netAmount)}
                            </p>
                          </div>
                        </div>

                        {pendingRefund > 0 && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-900">
                            Pending refund: {formatCedis(pendingRefund)}
                          </div>
                        )}

                        {typeof receipt.outstandingPesewas === "number" && (
                          <div className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700">
                            Invoice balance: {formatCedis(receipt.outstandingPesewas)}
                          </div>
                        )}

                        <Link
                          href={`/parent/receipts/${receipt.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-black"
                        >
                          View receipt
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}