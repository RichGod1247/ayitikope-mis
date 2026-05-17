// src/app/admin/fees/disputes/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type DisputeDisposition =
  | "NEW_RISK"
  | "ALREADY_IN_RECONCILIATION"
  | "DISMISSED_IN_RECONCILIATION";

type Dispute = {
  kind: string;
  reconciliationKind: string;
  severity: Severity;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  refundId: string | null;
  providerEventId: string | null;
  studentName: string;
  term: string | null;
  academicYear: string | null;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
  evidence: string[];
  recommendedAction: string;
  handledByReconciliation: boolean;
  disposition: DisputeDisposition;
  reconciliationExceptionId: string | null;
  reconciliationBatchId: string | null;
  reconciliationStatus: string | null;
  reconciliationBatchStatus: string | null;
  reconciliationBatchDate: string | null;
};

type DisputeData = {
  ok: boolean;
  error?: string;
  isClean: boolean;
  count: number;
  highestSeverity: Severity | null;
  scannedInvoices: number;
  summary?: {
    criticalCount: number;
    highCount: number;
    newRiskCount: number;
    alreadyInReconciliationCount: number;
    dismissedInReconciliationCount: number;
  };
  disputes: Dispute[];
};

function formatCedis(p: number | null | undefined) {
  const value = typeof p === "number" ? p : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function severityClass(severity: Severity | null | undefined) {
  if (severity === "CRITICAL") return "border-red-300 bg-red-50 text-red-800";
  if (severity === "HIGH") return "border-orange-300 bg-orange-50 text-orange-800";
  if (severity === "MEDIUM") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-blue-300 bg-blue-50 text-blue-800";
}

function dispositionClass(disposition: DisputeDisposition) {
  if (disposition === "NEW_RISK") return "border-red-300 bg-red-50 text-red-800";
  if (disposition === "ALREADY_IN_RECONCILIATION") {
    return "border-blue-300 bg-blue-50 text-blue-800";
  }
  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

function dispositionLabel(disposition: DisputeDisposition) {
  const map: Record<DisputeDisposition, string> = {
    NEW_RISK: "New risk",
    ALREADY_IN_RECONCILIATION: "Already in reconciliation",
    DISMISSED_IN_RECONCILIATION: "Dismissed in reconciliation",
  };

  return map[disposition];
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    OVERPAYMENT: "Overpayment",
    PAYMENT_WITHOUT_RECEIPT: "Payment without receipt",
    RECEIPT_WITHOUT_PAYMENT: "Receipt without payment",
    DUPLICATE_REFERENCE: "Duplicate reference",
    STORED_TOTAL_MISMATCH: "Stored total mismatch",
    PAYMENT_WITHOUT_LEDGER: "Payment without ledger",
    REFUND_WITHOUT_LEDGER_ENTRY: "Refund without ledger entry",
    REFUND_AMOUNT_MISMATCH: "Refund amount mismatch",
    PROVIDER_EVENT_NEEDS_REVIEW: "Provider event needs review",
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

function recordInvolved(d: Dispute) {
  if (d.providerEventId) return `Provider event: ${d.providerEventId}`;
  if (d.refundId) return `Refund: ${d.refundId}`;
  if (d.receiptId) return `Receipt: ${d.receiptId}`;
  if (d.paymentId) return `Payment: ${d.paymentId}`;
  if (d.invoiceId) return `Invoice: ${d.invoiceId}`;
  return "No linked record";
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

  const summary = data?.summary ?? {
    criticalCount: 0,
    highCount: 0,
    newRiskCount: 0,
    alreadyInReconciliationCount: 0,
    dismissedInReconciliationCount: 0,
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              EduLife OS · Finance Risk Radar
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Payment Disputes & Anomaly Radar
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              This radar identifies finance anomalies, shows the affected evidence, recommends the
              next action, and tells whether the issue is already tracked inside reconciliation.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/reconciliation"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Reconciliation control room
            </Link>
            <Link
              href="/admin/fees/reconciliation/history"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Evidence history
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Term</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All terms</option>
                <option>1st Term</option>
                <option>2nd Term</option>
                <option>3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Academic year</label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Scan limit</label>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="numeric"
                placeholder="500"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {loading ? "Scanning..." : "Run radar scan"}
            </button>
          </form>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500 shadow-sm">
            Scanning payment disputes and reconciliation coverage...
          </section>
        ) : null}

        {!loading && data ? (
          <>
            <section className="grid gap-3 md:grid-cols-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium text-zinc-500">Invoices scanned</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">{data.scannedInvoices ?? 0}</p>
              </div>

              <div
                className={`rounded-2xl border p-4 shadow-sm ${
                  data.count > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p className="text-[11px] font-medium text-zinc-700">Risks found</p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    data.count > 0 ? "text-red-800" : "text-emerald-800"
                  }`}
                >
                  {data.count}
                </p>
              </div>

              <div className={`rounded-2xl border p-4 shadow-sm ${severityClass(data.highestSeverity)}`}>
                <p className="text-[11px] font-medium">Highest severity</p>
                <p className="mt-1 text-xl font-bold">{data.highestSeverity ?? "NONE"}</p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-[11px] text-red-700">New risks</p>
                <p className="text-xl font-bold text-red-900">{summary.newRiskCount}</p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <p className="text-[11px] text-blue-700">Already tracked</p>
                <p className="text-xl font-bold text-blue-900">
                  {summary.alreadyInReconciliationCount}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
                <p className="text-[11px] text-zinc-700">Dismissed matches</p>
                <p className="text-xl font-bold text-zinc-900">
                  {summary.dismissedInReconciliationCount}
                </p>
              </div>
            </section>

            {data.isClean ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center shadow-sm">
                <p className="text-base font-semibold text-emerald-900">
                  Dispute radar is clean
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-800">
                  No overpayments, missing receipts, duplicate references, provider-event risks, or
                  refund/ledger mismatches were detected for this view.
                </p>
              </section>
            ) : (
              <section className="space-y-4">
                {grouped.map((group) => (
                  <div
                    key={group.kind}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">{group.label}</p>
                        <p className="text-xs text-zinc-500">
                          {group.count} risk item(s). Review the disposition before creating new
                          reconciliation work.
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-zinc-100">
                      {group.disputes.map((d, idx) => (
                        <article
                          key={`${group.kind}-${d.invoiceId ?? "no-invoice"}-${
                            d.providerReference ?? "no-ref"
                          }-${idx}`}
                          className="p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass(
                                    d.severity
                                  )}`}
                                >
                                  {d.severity}
                                </span>

                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${dispositionClass(
                                    d.disposition
                                  )}`}
                                >
                                  {dispositionLabel(d.disposition)}
                                </span>
                              </div>

                              <div>
                                <h3 className="text-sm font-semibold text-zinc-950">
                                  {d.studentName}
                                </h3>
                                <p className="mt-1 text-xs text-zinc-600">{d.description}</p>
                              </div>

                              <div className="grid gap-2 text-xs md:grid-cols-2">
                                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                                  <p className="font-semibold text-zinc-800">Record involved</p>
                                  <p className="mt-1 break-all text-zinc-600">
                                    {recordInvolved(d)}
                                  </p>
                                  <p className="mt-1 text-zinc-500">
                                    {d.term || "No term"} / {d.academicYear || "No academic year"}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                                  <p className="font-semibold text-zinc-800">Reference</p>
                                  <p className="mt-1 break-all font-mono text-[10px] text-zinc-600">
                                    {d.providerReference || "—"}
                                  </p>
                                  <p className="mt-1 text-zinc-500">
                                    Reconciliation kind: {d.reconciliationKind}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="grid min-w-[220px] gap-2 text-xs md:text-right">
                              <div>
                                <p className="text-zinc-500">Expected</p>
                                <p className="font-semibold text-zinc-900">
                                  {formatCedis(d.expectedPesewas)}
                                </p>
                              </div>
                              <div>
                                <p className="text-zinc-500">Actual</p>
                                <p className="font-semibold text-zinc-900">
                                  {formatCedis(d.actualPesewas)}
                                </p>
                              </div>
                              <div>
                                <p className="text-zinc-500">Delta</p>
                                <p className="font-semibold text-red-700">
                                  {formatCedis(d.deltaPesewas)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                              <p className="font-semibold">Recommended next action</p>
                              <p className="mt-1">{d.recommendedAction}</p>
                            </div>

                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                              <p className="font-semibold">Reconciliation coverage</p>
                              {d.handledByReconciliation ? (
                                <>
                                  <p className="mt-1">
                                    This risk is already tracked as{" "}
                                    <span className="font-semibold">
                                      {d.reconciliationStatus}
                                    </span>
                                    .
                                  </p>
                                  <p className="mt-1">
                                    Batch: {d.reconciliationBatchStatus ?? "—"} ·{" "}
                                    {formatDate(d.reconciliationBatchDate)}
                                  </p>
                                  {d.reconciliationBatchId ? (
                                    <Link
                                      href={`/admin/fees/reconciliation/history?batchId=${d.reconciliationBatchId}`}
                                      className="mt-2 inline-flex font-semibold underline"
                                    >
                                      Open evidence history
                                    </Link>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <p className="mt-1">
                                    No matching active or dismissed reconciliation case was found.
                                  </p>
                                  <Link
                                    href="/admin/fees/reconciliation"
                                    className="mt-2 inline-flex font-semibold underline"
                                  >
                                    Open reconciliation control room
                                  </Link>
                                </>
                              )}
                            </div>
                          </div>

                          {d.evidence.length > 0 && (
                            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                              <p className="text-xs font-semibold text-zinc-800">Evidence</p>
                              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                                {d.evidence.map((item) => (
                                  <li key={item}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </article>
                      ))}
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