// src/app/admin/fees/receipts/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  issuedToName: string | null;
  amountPesewas: number;
  method: string | null;
  reference: string | null;
  term: string | null;
  academicYear: string | null;
  studentName: string;
  classLabel: string;
  issuedByName: string;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

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

export default function AdminReceiptsPage() {
  const [items, setItems] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (term) params.set("term", term);
      if (academicYear) params.set("academicYear", academicYear);
      const r = await fetch(`/api/admin/fees/receipts/list?${params}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error || "Failed to load receipts."); return; }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setError("Network error loading receipts.");
    } finally {
      setLoading(false);
    }
  }, [term, academicYear]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-zinc-900">Fees — Payment Receipts</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Every payment leaves an immutable receipt. Each row is a permanent paper trail.
        </p>
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-900">Term</label>
            <select
              className="border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white"
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
            <label className="block text-xs font-medium text-zinc-900">Academic Year</label>
            <input
              type="text"
              className="border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400 w-32"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025/2026"
            />
          </div>
          <button className={btnOutline} onClick={load} disabled={loading} type="button">
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            {items.length} receipt{items.length !== 1 ? "s" : ""}
          </h2>
          {loading && <span className="text-xs text-zinc-500">Loading…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border rounded-xl overflow-hidden text-zinc-900">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2 text-left border-b">Receipt #</th>
                <th className="px-3 py-2 text-left border-b">Date</th>
                <th className="px-3 py-2 text-left border-b">Learner</th>
                <th className="px-3 py-2 text-left border-b">Class</th>
                <th className="px-3 py-2 text-left border-b">Term / Year</th>
                <th className="px-3 py-2 text-right border-b">Amount</th>
                <th className="px-3 py-2 text-left border-b">Method</th>
                <th className="px-3 py-2 text-left border-b">Issued to</th>
                <th className="px-3 py-2 text-left border-b">Issued by</th>
                <th className="px-3 py-2 text-right border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0 hover:bg-zinc-50">
                  <td className="px-3 py-2 align-top font-mono font-semibold">{row.receiptNumber}</td>
                  <td className="px-3 py-2 align-top">{formatDate(row.issuedAt)}</td>
                  <td className="px-3 py-2 align-top font-semibold">{row.studentName}</td>
                  <td className="px-3 py-2 align-top">{row.classLabel}</td>
                  <td className="px-3 py-2 align-top">
                    {row.term ?? "—"}{row.term && row.academicYear ? ", " : ""}{row.academicYear ?? ""}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-semibold text-emerald-700">
                    {formatCedis(row.amountPesewas)}
                  </td>
                  <td className="px-3 py-2 align-top capitalize">{row.method ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{row.issuedToName ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{row.issuedByName}</td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link
                      href={`/admin/fees/receipts/${row.id}`}
                      className="inline-flex items-center h-8 px-3 rounded-lg border border-zinc-300 bg-white text-xs text-zinc-900 hover:bg-zinc-50 shadow-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-4 text-sm text-zinc-500">
                    No receipts found yet. Receipts are created automatically when payments are recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
