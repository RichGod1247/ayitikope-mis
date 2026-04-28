"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ReceiptData = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  note: string | null;
  payment: {
    amountPesewas: number;
    method: string | null;
    reference: string | null;
    channel: string | null;
    paidAt: string | null;
  };
  invoice: {
    term: string | null;
    academicYear: string | null;
    totalBilledPesewas: number;
    totalWaivedPesewas: number;
    totalPaidPesewas: number;
    outstandingPesewas: number;
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

function formatCedis(p: number) {
  return `GH₵ ${(p / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function methodLabel(m: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    paystack: "Paystack (Online)",
    hubtel: "Hubtel Mobile Money",
    bank: "Bank Transfer",
    momo: "Mobile Money",
    other: "Other",
  };
  return m ? (map[m.toLowerCase()] ?? m) : "—";
}

export default function ParentReceiptPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = params?.receiptId ?? "";

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptId) return;
    fetch(`/api/parent/receipts/${receiptId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || "Could not load receipt."); return; }
        setReceipt(j.receipt);
      })
      .catch(() => setError("Network error loading receipt."))
      .finally(() => setLoading(false));
  }, [receiptId]);

  // Auto-print once loaded
  useEffect(() => {
    if (receipt) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [receipt]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Loading receipt…</p>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error ?? "Receipt not found."}
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="min-h-screen bg-zinc-50 flex flex-col items-center py-8 px-4">
        {/* Print button — hidden when printing */}
        <div className="no-print mb-6 flex gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-black"
          >
            Print / Download PDF
          </button>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Back
          </button>
        </div>

        {/* Receipt document */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-zinc-200 overflow-hidden">
          {/* Header band */}
          <div className="bg-zinc-900 px-8 py-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-400">EduLife OS</p>
                <h1 className="mt-1 text-xl font-bold">{receipt.school.name}</h1>
                {receipt.school.contactPhone && (
                  <p className="mt-0.5 text-xs text-zinc-400">{receipt.school.contactPhone}</p>
                )}
                {receipt.school.contactEmail && (
                  <p className="text-xs text-zinc-400">{receipt.school.contactEmail}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-400">Official Receipt</p>
                <p className="mt-1 text-lg font-bold font-mono">{receipt.receiptNumber}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{formatDateTime(receipt.issuedAt)}</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6 space-y-6">
            {/* Issued to */}
            <section className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Issued to</p>
                <p className="mt-1 font-semibold text-zinc-900">{receipt.issuedToName || receipt.student.guardianName || "—"}</p>
                {receipt.issuedToPhone && <p className="text-zinc-600 text-xs">{receipt.issuedToPhone}</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Learner</p>
                <p className="mt-1 font-semibold text-zinc-900">{receipt.student.name}</p>
                {receipt.student.classLabel && <p className="text-zinc-600 text-xs">{receipt.student.classLabel}</p>}
              </div>
            </section>

            <hr className="border-zinc-100" />

            {/* Term + Year */}
            <section className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Term</p>
                <p className="mt-1 text-zinc-900">{receipt.invoice.term ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Academic Year</p>
                <p className="mt-1 text-zinc-900">{receipt.invoice.academicYear ?? "—"}</p>
              </div>
            </section>

            <hr className="border-zinc-100" />

            {/* Payment details */}
            <section className="space-y-3 text-sm">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Payment Details</p>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 overflow-hidden">
                <table className="min-w-full text-sm text-zinc-900">
                  <tbody>
                    <tr className="border-b border-zinc-100">
                      <td className="px-4 py-2.5 font-medium text-zinc-600 w-40">Amount Paid</td>
                      <td className="px-4 py-2.5 font-bold text-emerald-700 text-base">
                        {formatCedis(receipt.payment.amountPesewas)}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-4 py-2.5 font-medium text-zinc-600">Payment Method</td>
                      <td className="px-4 py-2.5">{methodLabel(receipt.payment.method)}</td>
                    </tr>
                    {receipt.payment.reference && (
                      <tr className="border-b border-zinc-100">
                        <td className="px-4 py-2.5 font-medium text-zinc-600">Reference</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{receipt.payment.reference}</td>
                      </tr>
                    )}
                    <tr className="border-b border-zinc-100">
                      <td className="px-4 py-2.5 font-medium text-zinc-600">Payment Date</td>
                      <td className="px-4 py-2.5">{formatDate(receipt.payment.paidAt ?? receipt.issuedAt)}</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-4 py-2.5 font-medium text-zinc-600">Total Billed</td>
                      <td className="px-4 py-2.5">{formatCedis(receipt.invoice.totalBilledPesewas)}</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-4 py-2.5 font-medium text-zinc-600">Total Paid</td>
                      <td className="px-4 py-2.5">{formatCedis(receipt.invoice.totalPaidPesewas)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 font-medium text-zinc-600">Balance Remaining</td>
                      <td
                        className={`px-4 py-2.5 font-bold ${
                          receipt.invoice.outstandingPesewas > 0 ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {formatCedis(receipt.invoice.outstandingPesewas)}
                        {receipt.invoice.outstandingPesewas === 0 && (
                          <span className="ml-2 text-[11px] font-normal bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            Fully cleared
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {receipt.note && (
              <p className="text-xs text-zinc-600 italic">{receipt.note}</p>
            )}

            <hr className="border-zinc-100" />

            {/* Footer */}
            <section className="flex items-end justify-between gap-4 text-xs text-zinc-500">
              <div>
                <p>Issued by: <span className="font-medium text-zinc-700">{receipt.issuedByName}</span></p>
                <p className="mt-1">
                  This is an official payment receipt from {receipt.school.name} via EduLife OS.
                </p>
                <p>Keep this as proof of payment.</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-[11px]">{receipt.receiptNumber}</p>
                <p>{formatDate(receipt.issuedAt)}</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
