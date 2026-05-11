// src/app/parent/receipts/[receiptId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ReceiptLine = {
  id: string;
  category: string;
  description: string;
  amountPesewas: number;
  waivedPesewas: number;
};

type RefundItem = {
  id: string;
  amountPesewas: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  providerRefundReference: string | null;
  reason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  processingAt: string | null;
  processedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
};

type ReceiptData = {
  id: string;
  receiptNumber: string;
  status: string | null;
  computedStatus: string;
  issuedAt: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  note: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  payment: {
    id: string | null;
    amountPesewas: number;
    grossAmountPesewas: number;
    netAmountPesewas: number;
    succeededRefundPesewas: number;
    pendingRefundPesewas: number;
    refundableRemainingPesewas: number;
    method: string | null;
    reference: string | null;
    channel: string | null;
    status: string | null;
    paidAt: string | null;
    provider: string | null;
    providerReference: string | null;
    providerTransactionId: string | null;
  };
  refund: {
    succeededRefundPesewas: number;
    pendingRefundPesewas: number;
    failedOrCancelledRefundPesewas: number;
    netPaidPesewas: number;
    refundableRemainingPesewas: number;
    computedReceiptStatus: string;
    items: RefundItem[];
  };
  invoice: {
    id: string;
    term: string | null;
    academicYear: string | null;
    status: string | null;
    totalBilledPesewas: number;
    totalWaivedPesewas: number;
    grossPaidPesewas: number;
    refundedPesewas: number;
    totalPaidPesewas: number;
    outstandingPesewas: number;
    storedTotalPaidPesewas: number;
    storedBalancePesewas: number;
    lines: ReceiptLine[];
  };
  student: {
    id: string;
    name: string;
    guardianName: string | null;
    classLabel: string | null;
  };
  school: {
    name: string;
    schoolCode: string;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  issuedByName: string;
};

type ReceiptResponse = {
  ok: boolean;
  error?: string;
  receipt?: ReceiptData;
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GHS ${(value / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "Unavailable";

  try {
    return new Date(iso).toLocaleDateString("en-GH", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "Unavailable";
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Unavailable";

  try {
    return new Date(iso).toLocaleString("en-GH", {
      day: "2-digit",
      month: "long",
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
    paystack: "Paystack online payment",
    bank_transfer: "Bank transfer",
    bank: "Bank transfer",
    momo: "Mobile money",
    hubtel: "Mobile money",
    other: "Other",
  };

  return method ? map[method.toLowerCase()] ?? method : "Payment";
}

function statusLabel(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();

  const map: Record<string, string> = {
    ISSUED: "Issued",
    PARTIALLY_REFUNDED: "Partially refunded",
    REFUNDED: "Refunded",
    REQUESTED: "Requested",
    APPROVED: "Approved",
    PROCESSING: "Processing",
    SUCCEEDED: "Refund paid",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  };

  return map[s] ?? (s || "Unknown");
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    RECEIPT_ID_REQUIRED: "The receipt link is missing its receipt ID.",
    RECEIPT_NOT_FOUND: "This receipt could not be found.",
    FORBIDDEN_RECEIPT: "This receipt is not linked to your parent account.",
    FAILED_TO_LOAD_RECEIPT: "We could not load this receipt right now.",
  };

  return map[code ?? ""] ?? "We could not load this receipt right now.";
}

export default function ParentReceiptPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = String(params?.receiptId ?? "");

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReceipt() {
    if (!receiptId) {
      setError("The receipt link is missing its receipt ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/parent/receipts/${receiptId}`, {
        cache: "no-store",
      });

      const json = (await res.json()) as ReceiptResponse;

      if (!res.ok || !json.ok || !json.receipt) {
        setError(friendlyError(json.error));
        setReceipt(null);
        return;
      }

      setReceipt(json.receipt);
    } catch {
      setError("Network error loading receipt. Please try again.");
      setReceipt(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <p className="text-sm text-zinc-500">Loading receipt...</p>
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-center">
          <p className="text-sm font-semibold text-red-900">Receipt unavailable</p>
          <p className="mt-1 text-xs text-red-800">
            {error ?? "Receipt not found."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={loadReceipt}
              className="rounded-xl bg-red-900 px-4 py-2 text-xs font-semibold text-white hover:bg-red-950"
            >
              Try again
            </button>
            <Link
              href="/parent/receipts"
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-900"
            >
              Back to receipts
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const netBilled = Math.max(
    0,
    receipt.invoice.totalBilledPesewas - receipt.invoice.totalWaivedPesewas
  );

  const hasSucceededRefund = receipt.refund.succeededRefundPesewas > 0;
  const hasPendingRefund = receipt.refund.pendingRefundPesewas > 0;
  const hasAnyRefund = hasSucceededRefund || hasPendingRefund || receipt.refund.items.length > 0;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .receipt-shell { box-shadow: none !important; border: 1px solid #d4d4d8 !important; }
        }
      `}</style>

      <main className="min-h-screen bg-zinc-50 px-4 py-6 md:py-8">
        <div className="no-print mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <Link
            href="/parent/receipts"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Back to receipts
          </Link>

          <a
            href={`/api/parent/receipts/${receiptId}/pdf`}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-black"
          >
            Download PDF
          </a>
        </div>

        <article className="receipt-shell mx-auto max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
          <header className="bg-zinc-950 px-6 py-6 text-white md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  EduLife OS
                </p>
                <h1 className="mt-1 text-xl font-bold">{receipt.school.name}</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  School code: {receipt.school.schoolCode || "Unavailable"}
                </p>
                {receipt.school.contactPhone && (
                  <p className="text-xs text-zinc-400">{receipt.school.contactPhone}</p>
                )}
                {receipt.school.contactEmail && (
                  <p className="text-xs text-zinc-400">{receipt.school.contactEmail}</p>
                )}
              </div>

              <div className="md:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Official receipt
                </p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {receipt.receiptNumber}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {formatDateTime(receipt.issuedAt)}
                </p>
                <span className="mt-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  {statusLabel(receipt.computedStatus)}
                </span>
              </div>
            </div>
          </header>

          <section className="space-y-6 px-6 py-6 md:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Issued to
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {receipt.issuedToName ||
                    receipt.student.guardianName ||
                    "Parent / Guardian"}
                </p>
                {receipt.issuedToPhone && (
                  <p className="text-xs text-zinc-600">{receipt.issuedToPhone}</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Learner
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {receipt.student.name}
                </p>
                {receipt.student.classLabel && (
                  <p className="text-xs text-zinc-600">{receipt.student.classLabel}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Original payment
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {formatCedis(receipt.payment.grossAmountPesewas)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Refunded
                </p>
                <p
                  className={`mt-1 text-lg font-bold ${
                    hasSucceededRefund ? "text-rose-700" : "text-zinc-900"
                  }`}
                >
                  {formatCedis(receipt.refund.succeededRefundPesewas)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Net paid after refunds
                </p>
                <p className="mt-1 text-lg font-bold text-zinc-900">
                  {formatCedis(receipt.payment.netAmountPesewas)}
                </p>
              </div>
            </div>

            {hasAnyRefund && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-amber-950">
                      Refund activity on this receipt
                    </p>
                    <p className="mt-1 text-xs text-amber-900">
                      Refunds are shown separately so the original payment and the
                      money returned remain clear.
                    </p>
                  </div>
                  <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-950 md:mt-0">
                    {statusLabel(receipt.refund.computedReceiptStatus)}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-white px-3 py-3">
                    <p className="text-[11px] font-medium text-amber-800">
                      Refund paid
                    </p>
                    <p className="mt-1 font-bold text-amber-950">
                      {formatCedis(receipt.refund.succeededRefundPesewas)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-3">
                    <p className="text-[11px] font-medium text-amber-800">
                      Pending refund
                    </p>
                    <p className="mt-1 font-bold text-amber-950">
                      {formatCedis(receipt.refund.pendingRefundPesewas)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-3">
                    <p className="text-[11px] font-medium text-amber-800">
                      Still refundable
                    </p>
                    <p className="mt-1 font-bold text-amber-950">
                      {formatCedis(receipt.refund.refundableRemainingPesewas)}
                    </p>
                  </div>
                </div>

                {receipt.refund.items.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {receipt.refund.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-amber-100 bg-white px-3 py-3 text-xs"
                      >
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-bold text-zinc-900">
                              {statusLabel(item.status)} ·{" "}
                              {formatCedis(item.amountPesewas)}
                            </p>
                            <p className="mt-0.5 text-zinc-600">
                              Reason: {item.reason || "No reason captured"}
                            </p>
                            <p className="mt-0.5 text-zinc-500">
                              Requested: {formatDateTime(item.requestedAt)}
                            </p>
                            {item.processedAt && (
                              <p className="mt-0.5 text-zinc-500">
                                Paid: {formatDateTime(item.processedAt)}
                              </p>
                            )}
                          </div>
                          {item.providerRefundReference && (
                            <p className="mt-1 font-mono text-[10px] text-zinc-500 md:mt-0">
                              Refund ref: {item.providerRefundReference}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 rounded-2xl border border-zinc-200 p-4 md:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Payment method
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {methodLabel(receipt.payment.method)}
                </p>
                {receipt.payment.channel && (
                  <p className="text-xs text-zinc-500">{receipt.payment.channel}</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Payment date
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {formatDate(receipt.payment.paidAt)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Payment status
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {statusLabel(receipt.payment.status)}
                </p>
              </div>
            </div>

            {receipt.payment.reference && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Payment reference
                </p>
                <p className="mt-1 break-all font-mono text-xs font-semibold text-zinc-900">
                  {receipt.payment.reference}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-900">
                  Invoice summary
                </p>
                <p className="text-xs text-zinc-500">
                  {receipt.invoice.term || "Term unavailable"} ·{" "}
                  {receipt.invoice.academicYear || "Year unavailable"}
                </p>
              </div>

              <div className="grid gap-0 divide-y divide-zinc-100 text-sm md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="space-y-2 p-4">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Total billed</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCedis(receipt.invoice.totalBilledPesewas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Waived / support</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCedis(receipt.invoice.totalWaivedPesewas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Net billed</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCedis(netBilled)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Gross paid</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCedis(receipt.invoice.grossPaidPesewas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Refunded</span>
                    <span className="font-semibold text-rose-700">
                      {formatCedis(receipt.invoice.refundedPesewas)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Balance</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCedis(receipt.invoice.outstandingPesewas)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fee item</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Waived</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {receipt.invoice.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                        No invoice line items were found.
                      </td>
                    </tr>
                  ) : (
                    receipt.invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-zinc-900">
                          {line.description}
                        </td>
                        <td className="px-3 py-2 text-zinc-500">
                          {line.category}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-zinc-900">
                          {formatCedis(line.amountPesewas)}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600">
                          {formatCedis(line.waivedPesewas)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {receipt.note && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                {receipt.note}
              </div>
            )}

            <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              <p>Issued by: {receipt.issuedByName}</p>
              <p className="mt-1">
                This is a system-generated receipt from EduLife OS. Keep it as
                proof of payment and refund activity.
              </p>
              <p className="mt-1 font-mono text-[10px]">Receipt ID: {receipt.id}</p>
            </footer>
          </section>
        </article>
      </main>
    </>
  );
}