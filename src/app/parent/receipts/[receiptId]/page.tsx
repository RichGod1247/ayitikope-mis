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

type ReceiptData = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  note: string | null;
  payment: {
    id: string | null;
    amountPesewas: number;
    method: string | null;
    reference: string | null;
    channel: string | null;
    paidAt: string | null;
    provider: string | null;
    providerReference: string | null;
    providerTransactionId: string | null;
  };
  invoice: {
    id: string;
    term: string | null;
    academicYear: string | null;
    status: string | null;
    totalBilledPesewas: number;
    totalWaivedPesewas: number;
    totalPaidPesewas: number;
    outstandingPesewas: number;
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

function formatCedis(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
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
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-sm text-zinc-500">Loading receipt...</p>
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-center">
          <p className="text-sm font-semibold text-red-900">
            Receipt unavailable
          </p>
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

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-black"
          >
            Print / save PDF
          </button>
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
                  <p className="text-xs text-zinc-400">
                    {receipt.school.contactPhone}
                  </p>
                )}
                {receipt.school.contactEmail && (
                  <p className="text-xs text-zinc-400">
                    {receipt.school.contactEmail}
                  </p>
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
                  <p className="text-xs text-zinc-600">
                    {receipt.issuedToPhone}
                  </p>
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
                  <p className="text-xs text-zinc-600">
                    {receipt.student.classLabel}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Amount paid
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {formatCedis(receipt.payment.amountPesewas)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Payment method
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {methodLabel(receipt.payment.method)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-zinc-500">
                  Payment date
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {formatDate(receipt.payment.paidAt ?? receipt.issuedAt)}
                </p>
              </div>
            </div>

            {(receipt.payment.reference ||
              receipt.payment.providerReference ||
              receipt.payment.providerTransactionId) && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Transaction references
                </p>

                {receipt.payment.reference && (
                  <p className="mt-2 break-all font-mono text-xs text-zinc-700">
                    Payment reference: {receipt.payment.reference}
                  </p>
                )}

                {receipt.payment.providerReference && (
                  <p className="mt-1 break-all font-mono text-xs text-zinc-700">
                    Provider reference: {receipt.payment.providerReference}
                  </p>
                )}

                {receipt.payment.providerTransactionId && (
                  <p className="mt-1 break-all font-mono text-xs text-zinc-700">
                    Provider transaction ID: {receipt.payment.providerTransactionId}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Term
                </p>
                <p className="mt-1 text-sm text-zinc-900">
                  {receipt.invoice.term || "Unavailable"}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Academic year
                </p>
                <p className="mt-1 text-sm text-zinc-900">
                  {receipt.invoice.academicYear || "Unavailable"}
                </p>
              </div>
            </div>

            {receipt.invoice.lines.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Fee item</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Waived
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {receipt.invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-zinc-800">
                          {line.description}
                        </td>
                        <td className="px-3 py-2 text-zinc-500">
                          {line.category}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-zinc-900">
                          {formatCedis(line.amountPesewas)}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-700">
                          {formatCedis(line.waivedPesewas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Total billed</span>
                  <span className="font-semibold text-zinc-900">
                    {formatCedis(receipt.invoice.totalBilledPesewas)}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Waived / support</span>
                  <span className="font-semibold text-zinc-900">
                    {formatCedis(receipt.invoice.totalWaivedPesewas)}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Net billed</span>
                  <span className="font-semibold text-zinc-900">
                    {formatCedis(netBilled)}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Total paid</span>
                  <span className="font-semibold text-emerald-700">
                    {formatCedis(receipt.invoice.totalPaidPesewas)}
                  </span>
                </div>

                <div className="flex justify-between gap-3 md:col-span-2">
                  <span className="text-zinc-700">Balance remaining</span>
                  <span
                    className={`font-bold ${
                      receipt.invoice.outstandingPesewas > 0
                        ? "text-red-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {formatCedis(receipt.invoice.outstandingPesewas)}
                  </span>
                </div>
              </div>
            </div>

            {receipt.note && (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                {receipt.note}
              </p>
            )}

            <footer className="border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              <p>
                Issued by:{" "}
                <span className="font-semibold text-zinc-700">
                  {receipt.issuedByName}
                </span>
              </p>
              <p className="mt-1">
                This is an official payment receipt from {receipt.school.name}
                via EduLife OS. Keep this document as proof of payment.
              </p>
              <p className="mt-2 font-mono text-[11px]">
                Receipt: {receipt.receiptNumber}
              </p>
            </footer>
          </section>
        </article>
      </main>
    </>
  );
}