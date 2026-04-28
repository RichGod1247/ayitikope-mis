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
  term: string | null;
  academicYear: string | null;
  studentName: string | null;
};

function formatCedis(p: number) {
  return `GH₵ ${(p / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function methodLabel(m: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    paystack: "Online",
    hubtel: "MoMo",
    bank: "Bank",
    momo: "MoMo",
    other: "Other",
  };
  return m ? (map[m.toLowerCase()] ?? m) : "—";
}

export default function ParentReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parent/receipts/list", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || "Could not load receipts."); return; }
        setReceipts(Array.isArray(j.receipts) ? j.receipts : []);
      })
      .catch(() => setError("Network error loading receipts."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700">EduLife OS · Parent · Receipts</p>
        <h1 className="text-xl font-bold text-zinc-900">Payment Receipts</h1>
        <p className="text-sm text-zinc-600">
          Official receipts for all fee payments made for your children.
        </p>
      </header>

      {loading && (
        <div className="border border-zinc-200 rounded-xl p-6 bg-white shadow-sm flex items-center justify-center">
          <p className="text-sm text-zinc-600">Loading receipts…</p>
        </div>
      )}

      {error && !loading && (
        <div className="border border-amber-200 rounded-xl p-4 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">No receipts found yet</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Receipts appear here after fee payments are recorded by the school. If you have made a payment, please allow a few minutes for it to reflect.
          </p>
        </div>
      )}

      {!loading && !error && receipts.length === 0 && (
        <div className="border border-zinc-200 rounded-xl p-8 bg-white shadow-sm text-center space-y-2">
          <p className="text-sm font-medium text-zinc-900">No receipts yet</p>
          <p className="text-xs text-zinc-600">
            Receipts appear here after the school records a payment against your child&apos;s invoice.
          </p>
        </div>
      )}

      {!loading && !error && receipts.length > 0 && (
        <section className="space-y-3">
          {receipts.map((r) => (
            <div
              key={r.id}
              className="border border-zinc-200 rounded-xl bg-white p-4 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-zinc-900">
                    {r.receiptNumber}
                  </span>
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 font-medium px-2 py-0.5 rounded-full">
                    {formatCedis(r.amountPesewas)}
                  </span>
                  <span className="text-[11px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
                    {methodLabel(r.method)}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 truncate">
                  {r.studentName && <span className="font-medium">{r.studentName}</span>}
                  {r.studentName && (r.term || r.academicYear) && " · "}
                  {r.term}{r.term && r.academicYear ? ", " : ""}{r.academicYear}
                </p>
                <p className="text-[11px] text-zinc-600">{formatDate(r.issuedAt)}</p>
              </div>
              <Link
                href={`/parent/receipts/${r.id}`}
                className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                View
              </Link>
            </div>
          ))}
        </section>
      )}
      </div>
    </main>
  );
}
