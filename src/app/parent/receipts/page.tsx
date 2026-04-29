// src/app/parent/receipts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  amountPesewas: number;
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

function formatCedis(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
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

      setReceipts(Array.isArray(json.receipts) ? json.receipts : []);
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

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              EduLife OS - Parent Receipts
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Payment receipts
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600">
              Official receipts for fee payments recorded against your children.
              Keep these as proof of payment.
            </p>
          </div>

          <Link
            href="/parent/fees"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Back to fees
          </Link>
        </header>

        {loading && (
          <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center shadow-sm">
            <p className="text-sm text-zinc-600">Loading receipts...</p>
          </section>
        )}

        {!loading && error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 shadow-sm">
            <p className="text-sm font-semibold text-red-900">
              Receipts could not be loaded
            </p>
            <p className="mt-1 text-xs text-red-800">{error}</p>
            <button
              type="button"
              onClick={loadReceipts}
              className="mt-4 rounded-xl bg-red-900 px-4 py-2 text-xs font-semibold text-white hover:bg-red-950"
            >
              Try again
            </button>
          </section>
        )}

        {!loading && !error && receipts.length === 0 && (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">
              No receipts yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-zinc-600">
              Receipts will appear here after a school office payment or an
              online payment is confirmed and posted to your child&apos;s account.
            </p>
          </section>
        )}

        {!loading && !error && receipts.length > 0 && (
          <section className="space-y-3">
            {receipts.map((receipt) => (
              <article
                key={receipt.id}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-zinc-900">
                        {receipt.receiptNumber}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {formatCedis(receipt.amountPesewas)}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                        {methodLabel(receipt.method)}
                      </span>
                    </div>

                    <p className="truncate text-xs text-zinc-600">
                      {receipt.studentName || "Learner"}
                      {(receipt.term || receipt.academicYear) && " - "}
                      {receipt.term}
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

                  <Link
                    href={`/parent/receipts/${receipt.id}`}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-black"
                  >
                    View receipt
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}