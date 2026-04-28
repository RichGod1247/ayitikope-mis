"use client";

import { useEffect, useState } from "react";

type Dispute = {
  kind: string;
  invoiceId: string;
  studentName: string;
  term: string;
  academicYear: string;
  netBilledPesewas: number;
  totalPaidPesewas: number;
  overPaidPesewas: number;
  description: string;
};

type DisputeData = {
  ok: boolean;
  isClean: boolean;
  count: number;
  disputes: Dispute[];
};

function formatCedis(p: number) {
  return `GH₵${(Math.abs(p) / 100).toFixed(2)}`;
}

export default function AdminFeesDisputesPage() {
  const [data, setData] = useState<DisputeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  function load() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/admin/fees/disputes", window.location.origin);
    if (term) url.searchParams.set("term", term);
    if (academicYear) url.searchParams.set("academicYear", academicYear);
    fetch(url.toString(), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || "Failed to load disputes."); return; }
        setData(j);
      })
      .catch(() => setError("Network error loading disputes."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[#F7F4ED]">Payment Disputes</h1>
        <p className="text-sm text-[#C9CDD6]">
          Flags overpayments and anomalies for review. A clean queue means all payments are within expected bounds.
        </p>
      </header>

      {/* Filters */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
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
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-[#1B66D1] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5dc0]"
          >
            Refresh
          </button>
        </div>
      </section>

      {loading && <p className="text-sm text-[#8F98A8]">Scanning for disputes…</p>}
      {error && <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              { label: "Disputes found", value: data.count, cls: data.count > 0 ? "text-red-400" : "text-emerald-400" },
              { label: "Status", value: data.isClean ? "CLEAN ✓" : "ACTION NEEDED", cls: data.isClean ? "text-emerald-400" : "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
                <p className="text-[11px] text-[#8F98A8] uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {data.isClean && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-5 py-5 text-center space-y-1">
              <p className="text-base font-semibold text-emerald-300">Dispute queue is clean</p>
              <p className="text-sm text-emerald-400/80">
                No overpayments or anomalies detected. All invoices are within expected payment bounds.
              </p>
            </div>
          )}

          {!data.isClean && data.disputes.length > 0 && (
            <section className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                <p className="text-sm font-semibold text-[#F7F4ED]">Anomalies ({data.disputes.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Student</th>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Term</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Net Billed</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Total Paid</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Overpaid</th>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.disputes.map((d) => (
                      <tr key={d.invoiceId} className="border-b border-white/5">
                        <td className="px-4 py-3 text-[#C9CDD6] font-medium">{d.studentName}</td>
                        <td className="px-4 py-3 text-[#8F98A8]">{d.term} · {d.academicYear}</td>
                        <td className="px-4 py-3 text-right text-[#C9CDD6] font-mono">{formatCedis(d.netBilledPesewas)}</td>
                        <td className="px-4 py-3 text-right text-[#C9CDD6] font-mono">{formatCedis(d.totalPaidPesewas)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">{formatCedis(d.overPaidPesewas)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                            Overpayment
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
