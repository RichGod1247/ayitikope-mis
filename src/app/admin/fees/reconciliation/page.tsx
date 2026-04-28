"use client";

import { useEffect, useState } from "react";

type ReconciliationIssue = {
  invoiceId: string;
  studentName: string;
  term: string;
  academicYear: string;
  paymentTotal: number;
  ledgerTotal: number;
  delta: number;
  kind: string;
};

type ReconciliationData = {
  ok: boolean;
  isClean: boolean;
  issueCount: number;
  cleanCount: number;
  totalInvoices: number;
  issues: ReconciliationIssue[];
};

function formatCedis(p: number) {
  return `GH₵${(Math.abs(p) / 100).toFixed(2)}`;
}

export default function AdminFeesReconciliationPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  function load() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/admin/fees/reconciliation", window.location.origin);
    if (term) url.searchParams.set("term", term);
    if (academicYear) url.searchParams.set("academicYear", academicYear);
    fetch(url.toString(), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || "Failed to run reconciliation."); return; }
        setData(j);
      })
      .catch(() => setError("Network error during reconciliation check."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[#F7F4ED]">Reconciliation</h1>
        <p className="text-sm text-[#C9CDD6]">
          Compares payment totals against ledger credits. Any mismatch surfaces here for review.
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
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-[#1B66D1] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5dc0]"
          >
            Run check
          </button>
        </div>
      </section>

      {loading && <p className="text-sm text-[#8F98A8]">Running reconciliation check…</p>}
      {error && <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3">{error}</p>}

      {!loading && !error && data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total invoices", value: data.totalInvoices, cls: "text-[#F7F4ED]" },
              { label: "Reconciled", value: data.cleanCount, cls: "text-emerald-400" },
              { label: "Issues found", value: data.issueCount, cls: data.issueCount > 0 ? "text-red-400" : "text-emerald-400" },
              { label: "Status", value: data.isClean ? "CLEAN ✓" : "NEEDS REVIEW", cls: data.isClean ? "text-emerald-400" : "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
                <p className="text-[11px] text-[#8F98A8] uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {data.isClean && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-5 py-5 text-center space-y-1">
              <p className="text-base font-semibold text-emerald-300">All payments reconciled</p>
              <p className="text-sm text-emerald-400/80">
                Every payment is matched by a corresponding ledger credit. No action required.
              </p>
            </div>
          )}

          {!data.isClean && data.issues.length > 0 && (
            <section className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                <p className="text-sm font-semibold text-[#F7F4ED]">Reconciliation issues ({data.issues.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Student</th>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Term</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Payments</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Ledger Credits</th>
                      <th className="px-4 py-3 text-right text-[#8F98A8] font-medium">Delta</th>
                      <th className="px-4 py-3 text-left text-[#8F98A8] font-medium">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.issues.map((issue) => (
                      <tr key={issue.invoiceId} className="border-b border-white/5">
                        <td className="px-4 py-3 text-[#C9CDD6] font-medium">{issue.studentName}</td>
                        <td className="px-4 py-3 text-[#8F98A8]">{issue.term} · {issue.academicYear}</td>
                        <td className="px-4 py-3 text-right text-[#C9CDD6] font-mono">{formatCedis(issue.paymentTotal)}</td>
                        <td className="px-4 py-3 text-right text-[#C9CDD6] font-mono">{formatCedis(issue.ledgerTotal)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-red-400">
                          {issue.delta > 0 ? "+" : ""}{formatCedis(issue.delta)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-red-500/30 bg-red-900/20 px-2 py-0.5 text-[10px] font-medium text-red-300">
                            {issue.kind === "MISSING_LEDGER_CREDIT" ? "Missing ledger credit" : "Excess ledger credit"}
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
