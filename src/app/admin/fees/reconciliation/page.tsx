// src/app/admin/fees/reconciliation/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type ReconciliationIssue = {
  kind: string;
  severity: Severity;
  invoiceId: string | null;
  studentName: string | null;
  term: string | null;
  academicYear: string | null;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
};

type ReconciliationData = {
  ok: boolean;
  error?: string;
  isClean: boolean;
  issueCount: number;
  cleanCount: number;
  totalInvoices: number;
  highestSeverity: Severity | null;
  issues: ReconciliationIssue[];
  persisted?: boolean;
  batch?: {
    id: string;
    status: string;
    batchDate: string;
    createdAt: string;
  };
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
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
    MISSING_LEDGER_ENTRY: "Missing ledger entry",
    PAYMENT_WITHOUT_RECEIPT: "Payment without receipt",
    RECEIPT_WITHOUT_PAYMENT: "Receipt without payment",
    DUPLICATE_PROVIDER_REFERENCE: "Duplicate provider reference",
    AMOUNT_MISMATCH: "Amount mismatch",
    UNMATCHED_PROVIDER_EVENT: "Unmatched provider event",
    OVERPAYMENT: "Overpayment",
    UNKNOWN: "Unknown issue",
  };

  return map[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_RUN_RECONCILIATION:
      "Reconciliation could not run. Check server logs and database connectivity.",
    FAILED_TO_PERSIST_RECONCILIATION:
      "Reconciliation ran but could not save the batch.",
    CONTENT_TYPE_MUST_BE_JSON: "The request content type was invalid.",
    INVALID_JSON: "The request body was invalid.",
  };

  return map[code ?? ""] ?? "Reconciliation failed. Please try again.";
}

export default function AdminFeesReconciliationPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [limit, setLimit] = useState("1000");

  async function runCheck(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/reconciliation", window.location.origin);

      if (term.trim()) url.searchParams.set("term", term.trim());
      if (academicYear.trim()) {
        url.searchParams.set("academicYear", academicYear.trim());
      }

      const safeLimit = Number(limit);
      if (Number.isFinite(safeLimit) && safeLimit > 0) {
        url.searchParams.set("limit", String(Math.min(safeLimit, 5000)));
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ReconciliationData;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        setData(null);
        return;
      }

      setData(json);
    } catch {
      setError("Network error during reconciliation check.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function persistBatch() {
    setPersisting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/fees/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          term: term.trim() || undefined,
          academicYear: academicYear.trim() || undefined,
          limit: Number.isFinite(Number(limit)) ? Number(limit) : 1000,
          notes: "Finance reconciliation batch persisted from admin dashboard.",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as ReconciliationData;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      setData(json);
    } catch {
      setError("Network error while saving reconciliation batch.");
    } finally {
      setPersisting(false);
    }
  }

  useEffect(() => {
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedIssues = useMemo(() => {
    const buckets = new Map<string, ReconciliationIssue[]>();

    for (const issue of data?.issues ?? []) {
      const key = issue.kind || "UNKNOWN";
      const current = buckets.get(key) ?? [];
      current.push(issue);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries()).map(([kind, issues]) => ({
      kind,
      label: kindLabel(kind),
      count: issues.length,
      issues,
    }));
  }, [data]);

  const criticalCount = useMemo(
    () => (data?.issues ?? []).filter((i) => i.severity === "CRITICAL").length,
    [data]
  );

  const highCount = useMemo(
    () => (data?.issues ?? []).filter((i) => i.severity === "HIGH").length,
    [data]
  );

  const mediumCount = useMemo(
    () => (data?.issues ?? []).filter((i) => i.severity === "MEDIUM").length,
    [data]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              EduLife OS - Finance Control
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-950">
              Reconciliation
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Compare invoices, payments, receipts, ledger entries, and provider events.
              This page should expose financial risk, not hide it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/overview"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Overview
            </Link>
            <Link
              href="/admin/fees/ledger"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Ledger
            </Link>
            <Link
              href="/admin/fees/receipts"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Receipts
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form
            onSubmit={runCheck}
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
          >
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Term
              </label>
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
              <label className="text-[11px] font-semibold text-zinc-700">
                Academic year
              </label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Invoice limit
              </label>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="1000"
                inputMode="numeric"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {loading ? "Running..." : "Run check"}
            </button>

            <button
              type="button"
              onClick={persistBatch}
              disabled={loading || persisting || !data}
              className="h-10 self-end rounded-xl border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            >
              {persisting ? "Saving..." : "Save batch"}
            </button>
          </form>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
        </section>

        {loading && (
          <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500 shadow-sm">
            Running reconciliation check...
          </section>
        )}

        {!loading && data && (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium text-zinc-500">
                  Total invoices
                </p>
                <p className="mt-1 text-xl font-bold text-zinc-950">
                  {data.totalInvoices ?? 0}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[11px] font-medium text-emerald-700">
                  Clean invoices
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-950">
                  {data.cleanCount ?? 0}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 shadow-sm ${
                  data.issueCount > 0
                    ? "border-red-200 bg-red-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p className="text-[11px] font-medium text-zinc-700">
                  Issues found
                </p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    data.issueCount > 0 ? "text-red-800" : "text-emerald-800"
                  }`}
                >
                  {data.issueCount ?? 0}
                </p>
              </div>

              <div className={`rounded-2xl border p-4 shadow-sm ${severityClass(data.highestSeverity)}`}>
                <p className="text-[11px] font-medium">Highest severity</p>
                <p className="mt-1 text-xl font-bold">
                  {data.highestSeverity ?? "NONE"}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 shadow-sm ${
                  data.isClean
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <p className="text-[11px] font-medium text-zinc-700">Status</p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    data.isClean ? "text-emerald-800" : "text-amber-800"
                  }`}
                >
                  {data.isClean ? "CLEAN" : "NEEDS REVIEW"}
                </p>
              </div>
            </section>

            {data.batch && (
              <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
                <p className="font-semibold">Reconciliation batch saved</p>
                <p className="mt-1 text-xs">
                  Batch status: {data.batch.status}. Batch date:{" "}
                  {new Date(data.batch.batchDate).toLocaleDateString("en-GH")}.
                </p>
              </section>
            )}

            {data.isClean ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center shadow-sm">
                <p className="text-base font-semibold text-emerald-900">
                  Finance trail is clean for this view
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-800">
                  Payments, receipts, and ledger credits match for the invoices checked.
                  Keep monitoring after every major fee collection day.
                </p>
              </section>
            ) : (
              <>
                <section className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-[11px] text-red-700">Critical</p>
                    <p className="text-xl font-bold text-red-900">
                      {criticalCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <p className="text-[11px] text-orange-700">High</p>
                    <p className="text-xl font-bold text-orange-900">
                      {highCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[11px] text-amber-700">Medium</p>
                    <p className="text-xl font-bold text-amber-900">
                      {mediumCount}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Issue groups
                  </h2>

                  <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {groupedIssues.map((group) => (
                      <div
                        key={group.kind}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-zinc-900">
                          {group.label}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {group.count} issue{group.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-200 px-4 py-4">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Reconciliation issues
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      Each row is an accounting risk to investigate before rollout.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-zinc-50 text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            Severity
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Issue
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Learner / Term
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Reference
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Expected
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Actual
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Delta
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100">
                        {data.issues.map((issue, index) => (
                          <tr
                            key={`${issue.kind}-${issue.invoiceId ?? "no-invoice"}-${index}`}
                            className="align-top hover:bg-zinc-50"
                          >
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass(
                                  issue.severity
                                )}`}
                              >
                                {issue.severity}
                              </span>
                            </td>

                            <td className="px-3 py-3 font-semibold text-zinc-900">
                              {kindLabel(issue.kind)}
                              {issue.invoiceId && (
                                <p className="mt-1 font-mono text-[10px] font-normal text-zinc-500">
                                  Invoice: {issue.invoiceId}
                                </p>
                              )}
                            </td>

                            <td className="px-3 py-3 text-zinc-700">
                              <p className="font-medium">
                                {issue.studentName || "Unlinked"}
                              </p>
                              {(issue.term || issue.academicYear) && (
                                <p className="text-[10px] text-zinc-500">
                                  {issue.term || "Term unavailable"}
                                  {issue.academicYear
                                    ? `, ${issue.academicYear}`
                                    : ""}
                                </p>
                              )}
                            </td>

                            <td className="max-w-xs px-3 py-3">
                              {issue.providerReference ? (
                                <p className="break-all font-mono text-[10px] text-zinc-600">
                                  {issue.providerReference}
                                </p>
                              ) : (
                                <span className="text-zinc-400">None</span>
                              )}
                            </td>

                            <td className="px-3 py-3 text-right font-mono text-zinc-700">
                              {issue.expectedPesewas === null
                                ? "N/A"
                                : formatCedis(issue.expectedPesewas)}
                            </td>

                            <td className="px-3 py-3 text-right font-mono text-zinc-700">
                              {issue.actualPesewas === null
                                ? "N/A"
                                : formatCedis(issue.actualPesewas)}
                            </td>

                            <td
                              className={`px-3 py-3 text-right font-mono font-bold ${
                                (issue.deltaPesewas ?? 0) === 0
                                  ? "text-zinc-500"
                                  : "text-red-700"
                              }`}
                            >
                              {issue.deltaPesewas === null
                                ? "N/A"
                                : formatCedis(issue.deltaPesewas)}
                            </td>

                            <td className="max-w-sm px-3 py-3 text-zinc-600">
                              {issue.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
              <p className="font-semibold text-zinc-900">Reconciliation rule</p>
              <p className="mt-1">
                A clean screen is not the goal. A truthful screen is the goal. If money,
                receipt, provider, or ledger records disagree, EduLife OS must expose it
                before leadership makes decisions.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}