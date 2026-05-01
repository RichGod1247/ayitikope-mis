// src/app/admin/fees/disputes/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Dispute = {
  kind: string;
  severity: Severity;
  invoiceId: string | null;
  studentName: string;
  term: string | null;
  academicYear: string | null;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
};

type DisputeData = {
  ok: boolean;
  error?: string;
  isClean: boolean;
  count: number;
  highestSeverity: Severity | null;
  scannedInvoices: number;
  disputes: Dispute[];
};

function formatCedis(p: number | null | undefined) {
  const value = typeof p === "number" ? p : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function severityClass(severity: Severity | null | undefined) {
  if (severity === "CRITICAL") return "border-red-300 bg-red-50 text-red-800";
  if (severity === "HIGH") return "border-orange-300 bg-orange-50 text-orange-800";
  if (severity === "MEDIUM") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-blue-300 bg-blue-50 text-blue-800";
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    OVERPAYMENT: "Overpayment",
    PAYMENT_WITHOUT_RECEIPT: "Payment without receipt",
    RECEIPT_WITHOUT_PAYMENT: "Receipt without payment",
    DUPLICATE_REFERENCE: "Duplicate reference",
    STORED_TOTAL_MISMATCH: "Stored total mismatch",
  };

  return map[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_SCAN_PAYMENT_DISPUTES:
      "Dispute scan failed. Do not assume the finance queue is clean.",
    FORBIDDEN: "You do not have permission to view finance disputes.",
  };

  return map[code ?? ""] ?? "Failed to load disputes.";
}

export default function AdminFeesDisputesPage() {
  const [data, setData] = useState<DisputeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [limit, setLimit] = useState("500");

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/disputes", window.location.origin);
      if (term.trim()) url.searchParams.set("term", term.trim());
      if (academicYear.trim()) url.searchParams.set("academicYear", academicYear.trim());

      const safeLimit = Number(limit);
      if (Number.isFinite(safeLimit) && safeLimit > 0) {
        url.searchParams.set("limit", String(Math.min(safeLimit, 2000)));
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DisputeData;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setData(null);
        return;
      }

      setData(json);
    } catch {
      setError("Network error loading disputes.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Dispute[]>();
    for (const dispute of data?.disputes ?? []) {
      const key = dispute.kind || "UNKNOWN";
      const current = buckets.get(key) ?? [];
      current.push(dispute);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries()).map(([kind, disputes]) => ({
      kind,
      label: kindLabel(kind),
      count: disputes.length,
      disputes,
    }));
  }, [data]);

  const criticalCount = useMemo(
    () => (data?.disputes ?? []).filter((d) => d.severity === "CRITICAL").length,
    [data]
  );

  const highCount = useMemo(
    () => (data?.disputes ?? []).filter((d) => d.severity === "HIGH").length,
    [data]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              EduLife OS · Finance Control
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-950">
              Payment Disputes
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              This page exposes payment anomalies. If the scan fails, the system must report failure — never fake a clean finance queue.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/fees/overview" className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">
              Overview
            </Link>
            <Link href="/admin/fees/reconciliation" className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black">
              Reconciliation
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Term</label>
              <select value={term} onChange={(e) => setTerm(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900">
                <option value="">All terms</option>
                <option>1st Term</option>
                <option>2nd Term</option>
                <option>3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Academic year</label>
              <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2026-TEST" className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Scan limit</label>
              <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" placeholder="500" className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400" />
            </div>

            <button type="submit" disabled={loading} className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
              {loading ? "Scanning..." : "Run scan"}
            </button>
          </form>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500 shadow-sm">
            Scanning payment disputes...
          </section>
        ) : null}

        {!loading && data ? (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium text-zinc-500">Invoices scanned</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">{data.scannedInvoices ?? 0}</p>
              </div>

              <div className={`rounded-2xl border p-4 shadow-sm ${data.count > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className="text-[11px] font-medium text-zinc-700">Disputes found</p>
                <p className={`mt-1 text-xl font-bold ${data.count > 0 ? "text-red-800" : "text-emerald-800"}`}>
                  {data.count}
                </p>
              </div>

              <div className={`rounded-2xl border p-4 shadow-sm ${severityClass(data.highestSeverity)}`}>
                <p className="text-[11px] font-medium">Highest severity</p>
                <p className="mt-1 text-xl font-bold">{data.highestSeverity ?? "NONE"}</p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-[11px] text-red-700">Critical</p>
                <p className="text-xl font-bold text-red-900">{criticalCount}</p>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
                <p className="text-[11px] text-orange-700">High</p>
                <p className="text-xl font-bold text-orange-900">{highCount}</p>
              </div>
            </section>

            {data.isClean ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center shadow-sm">
                <p className="text-base font-semibold text-emerald-900">
                  Dispute queue is clean
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-800">
                  No overpayments, missing receipts, duplicate references, or stored-total mismatches were detected for this view.
                </p>
              </section>
            ) : (
              <section className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.kind} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">{group.label}</p>
                        <p className="text-xs text-zinc-500">{group.count} issue(s)</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-white text-zinc-500">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Student</th>
                            <th className="px-4 py-3 text-left font-medium">Term</th>
                            <th className="px-4 py-3 text-left font-medium">Reference</th>
                            <th className="px-4 py-3 text-right font-medium">Expected</th>
                            <th className="px-4 py-3 text-right font-medium">Actual</th>
                            <th className="px-4 py-3 text-right font-medium">Delta</th>
                            <th className="px-4 py-3 text-left font-medium">Severity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {group.disputes.map((d, idx) => (
                            <tr key={`${group.kind}-${d.invoiceId ?? "no-invoice"}-${d.providerReference ?? "no-ref"}-${idx}`}>
                              <td className="px-4 py-3 font-semibold text-zinc-900">
                                {d.studentName}
                                <p className="mt-1 text-[10px] font-normal text-zinc-500">{d.description}</p>
                              </td>
                              <td className="px-4 py-3 text-zinc-600">{d.term || "—"} / {d.academicYear || "—"}</td>
                              <td className="px-4 py-3 font-mono text-[10px] text-zinc-600">{d.providerReference || "—"}</td>
                              <td className="px-4 py-3 text-right text-zinc-700">{formatCedis(d.expectedPesewas)}</td>
                              <td className="px-4 py-3 text-right text-zinc-700">{formatCedis(d.actualPesewas)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-700">{formatCedis(d.deltaPesewas)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass(d.severity)}`}>
                                  {d.severity}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}