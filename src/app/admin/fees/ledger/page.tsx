"use client";

import { useEffect, useState } from "react";

type LedgerItem = {
  id: string;
  entryType: string;
  amountPesewas: number;
  description: string | null;
  createdAt: string;
  invoiceId: string | null;
  term: string | null;
  academicYear: string | null;
  studentName: string | null;
  createdByName: string;
};

const ENTRY_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  INVOICE_DEBIT:       { label: "Invoice Debit",      cls: "bg-red-900/30 text-red-300 border-red-500/30" },
  PAYMENT_CREDIT:      { label: "Payment Credit",     cls: "bg-emerald-900/30 text-emerald-300 border-emerald-500/30" },
  ADJUSTMENT_CREDIT:   { label: "Adjustment Credit",  cls: "bg-sky-900/30 text-sky-300 border-sky-500/30" },
  CORRECTION:          { label: "Correction",         cls: "bg-amber-900/30 text-amber-300 border-amber-500/30" },
};

function formatCedis(p: number) {
  const sign = p < 0 ? "-" : "";
  return `${sign}GH₵${(Math.abs(p) / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminFeesLedgerPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [entryType, setEntryType] = useState("");

  function load() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/admin/fees/ledger", window.location.origin);
    if (term) url.searchParams.set("term", term);
    if (academicYear) url.searchParams.set("academicYear", academicYear);
    if (entryType) url.searchParams.set("entryType", entryType);
    fetch(url.toString(), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || "Failed to load ledger."); return; }
        setItems(Array.isArray(j.items) ? j.items : []);
      })
      .catch(() => setError("Network error loading ledger."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[#F7F4ED]">Ledger Trail</h1>
        <p className="text-sm text-[#C9CDD6]">
          Every financial movement — debits, credits, adjustments — in chronological order.
        </p>
      </header>

      {/* Filters */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#8F98A8] uppercase tracking-wide">Term</label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#0C1830] text-[#F7F4ED] px-3 py-2 text-sm"
            >
              <option value="">All terms</option>
              <option>1st Term</option>
              <option>2nd Term</option>
              <option>3rd Term</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#8F98A8] uppercase tracking-wide">Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g. 2025/2026"
              className="rounded-xl border border-white/10 bg-[#0C1830] text-[#F7F4ED] px-3 py-2 text-sm placeholder:text-[#8F98A8]"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#8F98A8] uppercase tracking-wide">Type</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#0C1830] text-[#F7F4ED] px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              <option value="INVOICE_DEBIT">Invoice Debit</option>
              <option value="PAYMENT_CREDIT">Payment Credit</option>
              <option value="ADJUSTMENT_CREDIT">Adjustment Credit</option>
              <option value="CORRECTION">Correction</option>
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-[#1B66D1] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5dc0]"
          >
            Apply
          </button>
        </div>
      </section>

      {/* Table */}
      {loading && <p className="text-sm text-[#8F98A8]">Loading ledger entries…</p>}
      {error && <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-2">
          <p className="text-sm font-medium text-[#F7F4ED]">No ledger entries yet</p>
          <p className="text-xs text-[#8F98A8]">
            Entries appear here automatically when invoices are generated, payments recorded, or adjustments applied.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <section className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[#8F98A8] font-medium uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-[#8F98A8] font-medium uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-[#8F98A8] font-medium uppercase tracking-wide">Student</th>
                  <th className="px-4 py-3 text-left text-[#8F98A8] font-medium uppercase tracking-wide">Description</th>
                  <th className="px-4 py-3 text-right text-[#8F98A8] font-medium uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-left text-[#8F98A8] font-medium uppercase tracking-wide">By</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const cfg = ENTRY_TYPE_CONFIG[item.entryType] ?? { label: item.entryType, cls: "bg-white/5 text-[#C9CDD6] border-white/10" };
                  const isCredit = item.entryType.includes("CREDIT");
                  return (
                    <tr key={item.id} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                      <td className="px-4 py-3 text-[#8F98A8] whitespace-nowrap">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#C9CDD6]">
                        {item.studentName || "—"}
                        {item.term && <span className="ml-1 text-[#8F98A8]">· {item.term}</span>}
                      </td>
                      <td className="px-4 py-3 text-[#8F98A8] max-w-[240px] truncate">{item.description || "—"}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${isCredit ? "text-emerald-400" : "text-red-400"}`}>
                        {isCredit ? "+" : "-"}{formatCedis(item.amountPesewas)}
                      </td>
                      <td className="px-4 py-3 text-[#8F98A8]">{item.createdByName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02]">
            <p className="text-[11px] text-[#8F98A8]">{items.length} entries shown (max 200 per page)</p>
          </div>
        </section>
      )}
    </div>
  );
}
