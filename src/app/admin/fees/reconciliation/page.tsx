// src/app/admin/fees/reconciliation/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ExceptionStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";

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
  message?: string;

  isClean: boolean;
  issueCount: number;
  cleanCount: number;
  totalInvoices: number;
  highestSeverity: Severity | null;

  expectedPesewas: number;
  actualPesewas: number;
  deltaPesewas: number;

  issues: ReconciliationIssue[];

  persisted?: boolean;
  recheckOnly?: boolean;

  createdExceptionCount?: number;
  createdExceptionIds?: string[];

  alreadyTrackedExceptionCount?: number;
  alreadyTrackedExceptionIds?: string[];

  dismissedDuplicateCount?: number;
  dismissedDuplicateExceptionIds?: string[];

  batch?: {
    id: string;
    status: string;
    batchDate: string;
    createdAt: string;
  } | null;
};

type BatchSummary = {
  id: string;
  provider: string | null;
  batchDate: string;
  status: string;
  expectedPesewas: number;
  actualPesewas: number;
  deltaPesewas: number;
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  createdByName: string | null;
  exceptionCount: number;
  openCount: number;
  investigatingCount: number;
  resolvedCount: number;
  dismissedCount: number;
  criticalCount: number;
};

type BatchException = {
  id: string;
  kind: string;
  severity: Severity;
  status: ExceptionStatus;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  resolvedByName: string | null;
  studentName: string;
  term: string | null;
  academicYear: string | null;
};

type BatchDetail = BatchSummary & {
  exceptions: BatchException[];
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
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

function statusClass(status: string) {
  if (status === "CLOSED" || status === "CLEAN" || status === "RESOLVED") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (status === "HAS_EXCEPTIONS" || status === "OPEN") {
    return "border-red-300 bg-red-50 text-red-800";
  }
  if (status === "INVESTIGATING") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  if (status === "DISMISSED") {
    return "border-zinc-300 bg-zinc-50 text-zinc-700";
  }
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
    SUSPICIOUS_PROVIDER_EVENT: "Suspicious provider event",
    REFUND_WITHOUT_LEDGER_ENTRY: "Refund without ledger entry",
    REFUND_AMOUNT_MISMATCH: "Refund amount mismatch",
    OVERPAYMENT: "Overpayment",
    UNKNOWN: "Unknown issue",
  };

  return map[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_RUN_RECONCILIATION: "Reconciliation could not run.",
    FAILED_TO_PERSIST_RECONCILIATION: "Reconciliation ran but could not save the batch.",
    FAILED_TO_LOAD_RECONCILIATION_BATCHES: "Could not load reconciliation batch history.",
    FAILED_TO_LOAD_RECONCILIATION_BATCH: "Could not load reconciliation batch detail.",
    FAILED_TO_UPDATE_RECONCILIATION_EXCEPTION: "Could not update exception.",
    FAILED_TO_REPAIR_RECEIPT: "Could not repair the missing receipt.",
    CONTENT_TYPE_MUST_BE_JSON: "The request content type was invalid.",
    INVALID_JSON: "The request body was invalid.",
    INVALID_EXCEPTION_STATUS: "Invalid exception status.",
    RESOLUTION_NOTE_TOO_SHORT: "Action note must be at least 8 characters.",
    BATCH_ALREADY_CLOSED: "This batch is already closed.",
    BATCH_HAS_ACTIVE_EXCEPTIONS: "Resolve or dismiss all active exceptions before closing.",
    EXCEPTION_NOT_FOUND: "This reconciliation exception could not be found.",
    EXCEPTION_ALREADY_CLOSED: "This exception has already been closed.",
    EXCEPTION_STILL_ACTIVE_REPAIR_OR_DISMISS:
      "This issue is still active in the finance records. Repair the underlying evidence first, or dismiss it with a clear reason if it is an accepted/known exception.",
    UNSUPPORTED_REPAIR_ACTION: "This exception type does not support receipt repair.",
    EXCEPTION_HAS_NO_INVOICE: "This exception is not attached to an invoice.",
    SUCCESSFUL_PAYMENT_WITHOUT_RECEIPT_NOT_FOUND:
      "The missing-receipt payment could not be found. It may already have been repaired.",
    FAILED_TO_GENERATE_RECEIPT_NUMBER: "Could not generate a unique receipt number.",
    PAYMENT_LEDGER_ALREADY_LINKED_TO_DIFFERENT_RECEIPT:
      "This payment ledger is already linked to another receipt.",
  };

  return map[code ?? ""] ?? `Action failed${code ? `: ${code}` : ""}.`;
}

function defaultActionNote() {
  return `Reviewed by finance admin on ${new Date().toLocaleDateString("en-GH")}.`;
}

export default function AdminFeesReconciliationPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [savingExceptionId, setSavingExceptionId] = useState<string | null>(null);
  const [repairingExceptionId, setRepairingExceptionId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [limit, setLimit] = useState("1000");

  const [notesByException, setNotesByException] = useState<Record<string, string>>({});

  async function loadHistory() {
    setHistoryLoading(true);

    try {
      const res = await fetch("/api/admin/fees/reconciliation/batches?limit=50", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        batches?: BatchSummary[];
      };

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      setBatches(json.batches ?? []);
    } catch {
      setError("Network error while loading reconciliation history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadBatch(batchId: string) {
    setDetailLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/fees/reconciliation/batches/${batchId}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        batch?: BatchDetail;
      };

      if (!res.ok || !json.ok || !json.batch) {
        setError(friendlyError(json.error));
        return;
      }

      setSelectedBatch(json.batch);
      setNotesByException(
        Object.fromEntries(
          json.batch.exceptions.map((e) => [
            e.id,
            e.resolutionNote ?? defaultActionNote(),
          ])
        )
      );
    } catch {
      setError("Network error while loading batch detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function runCheck(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const url = new URL("/api/admin/fees/reconciliation", window.location.origin);

      if (term.trim()) url.searchParams.set("term", term.trim());
      if (academicYear.trim()) url.searchParams.set("academicYear", academicYear.trim());

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
    setNotice(null);

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
      await loadHistory();

      if (json.recheckOnly) {
        setNotice(
          json.message ||
            `Recheck completed. No new exception case was created because ${
              json.alreadyTrackedExceptionCount ?? 0
            } issue(s) are already tracked.`
        );
        return;
      }

      if (json.createdExceptionCount && json.createdExceptionCount > 0) {
        setNotice(
          json.message ||
            `${json.createdExceptionCount} new reconciliation exception case(s) created.`
        );
      } else if (json.persisted && json.isClean) {
        setNotice(json.message || "Clean reconciliation batch saved.");
      } else if (json.persisted) {
        setNotice(json.message || "Reconciliation batch saved.");
      }

      if (json.batch?.id) {
        await loadBatch(json.batch.id);
      }
    } catch {
      setError("Network error while saving reconciliation batch.");
    } finally {
      setPersisting(false);
    }
  }

  async function updateException(exceptionId: string, status: ExceptionStatus) {
    setSavingExceptionId(exceptionId);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/fees/reconciliation/exceptions/${exceptionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          resolutionNote: notesByException[exceptionId] ?? "",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        batchAutoClosed?: boolean;
      };

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      if (status === "INVESTIGATING") {
        setNotice("Exception moved to investigation. Save Batch will not duplicate this active case.");
      }

      if (status === "DISMISSED") {
        setNotice(
          "Exception dismissed with audit trail. Future rechecks will not recreate the same dismissed case blindly."
        );
      }

      if (status === "RESOLVED") {
        setNotice(
          json.batchAutoClosed
            ? "Exception resolved and the batch was automatically closed because no active exceptions remain."
            : "Exception resolved because the underlying finance evidence is now clean."
        );
      }

      await loadHistory();
      if (selectedBatch?.id) await loadBatch(selectedBatch.id);
    } catch {
      setError("Network error while updating exception.");
    } finally {
      setSavingExceptionId(null);
    }
  }

  async function repairMissingReceipt(exceptionId: string) {
    setRepairingExceptionId(exceptionId);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/admin/fees/reconciliation/exceptions/${exceptionId}/repair-receipt`,
        { method: "POST" }
      );

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        repaired?: boolean;
        alreadyHadReceipt?: boolean;
        batchAutoClosed?: boolean;
      };

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      if (json.alreadyHadReceipt) {
        setNotice(
          json.batchAutoClosed
            ? "Receipt already existed. Exception resolved and batch auto-closed."
            : "Receipt already existed. Exception resolved without creating a duplicate receipt."
        );
      } else if (json.repaired) {
        setNotice(
          json.batchAutoClosed
            ? "Missing receipt created safely. Exception resolved and batch auto-closed."
            : "Missing receipt created safely and exception resolved."
        );
      } else {
        setNotice("Repair completed without creating duplicate evidence.");
      }

      await loadHistory();
      if (selectedBatch?.id) await loadBatch(selectedBatch.id);
      await runCheck();
    } catch {
      setError("Network error while repairing missing receipt.");
    } finally {
      setRepairingExceptionId(null);
    }
  }

  async function closeBatch(batchId: string) {
    setDetailLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/fees/reconciliation/batches/${batchId}`, {
        method: "PATCH",
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      setNotice("Batch closed. All active exceptions were cleared before closure.");
      await loadHistory();
      await loadBatch(batchId);
    } catch {
      setError("Network error while closing batch.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void runCheck();
    void loadHistory();
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

  const activeExceptionCount =
    selectedBatch?.exceptions.filter((e) => e.status === "OPEN" || e.status === "INVESTIGATING")
      .length ?? 0;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              EduLife OS · Finance Governance
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Reconciliation & Audit
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Run finance checks, persist reconciliation batches, inspect exceptions, and record
              resolution decisions with an audit trail. Resolve means the underlying finance
              evidence is clean; dismiss means the issue is accepted with a recorded reason.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/ledger"
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Ledger
            </Link>
            <Link
              href="/admin/fees/receipts"
              className="inline-flex h-10 items-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Receipts
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {notice}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form onSubmit={runCheck} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
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
              <label className="text-[11px] font-semibold text-zinc-700">Invoice limit</label>
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
        </section>

        {data && (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] text-zinc-500">Total invoices</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">{data.totalInvoices}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[11px] text-emerald-700">Clean invoices</p>
                <p className="mt-1 text-xl font-bold text-emerald-950">{data.cleanCount}</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-[11px] text-red-700">Issues found</p>
                <p className="mt-1 text-xl font-bold text-red-900">{data.issueCount}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] text-zinc-500">Expected</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">
                  {formatCedis(data.expectedPesewas)}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] text-zinc-500">Delta</p>
                <p className="mt-1 text-xl font-bold text-zinc-950">
                  {formatCedis(data.deltaPesewas)}
                </p>
              </div>
            </section>

            {(data.recheckOnly ||
              typeof data.createdExceptionCount === "number" ||
              typeof data.alreadyTrackedExceptionCount === "number" ||
              typeof data.dismissedDuplicateCount === "number") && (
              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 shadow-sm">
                <p className="font-semibold">Save Batch control result</p>
                <p className="mt-1">
                  {data.message ??
                    "Save Batch completed. Existing cases are tracked without creating duplicate exception records."}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-blue-600">New cases</p>
                    <p className="text-lg font-bold text-blue-950">
                      {data.createdExceptionCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-blue-600">Already tracked</p>
                    <p className="text-lg font-bold text-blue-950">
                      {data.alreadyTrackedExceptionCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-blue-600">Dismissed matches</p>
                    <p className="text-lg font-bold text-blue-950">
                      {data.dismissedDuplicateCount ?? 0}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.4fr]">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-4">
              <h2 className="text-sm font-semibold text-zinc-950">Batch history</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Persistent records of saved reconciliation runs.
              </p>
            </div>

            <div className="max-h-[620px] overflow-y-auto p-3">
              {historyLoading ? (
                <p className="p-3 text-sm text-zinc-500">Loading history...</p>
              ) : batches.length === 0 ? (
                <p className="p-3 text-sm text-zinc-500">No saved batches yet.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => loadBatch(batch.id)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:bg-zinc-50 ${
                        selectedBatch?.id === batch.id ? "border-zinc-950" : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">
                            {formatDate(batch.batchDate)}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {batch.provider ?? "Provider"} · by {batch.createdByName ?? "System"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                            batch.status
                          )}`}
                        >
                          {batch.status.replaceAll("_", " ")}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-zinc-400">Exceptions</p>
                          <p className="font-semibold text-zinc-950">{batch.exceptionCount}</p>
                        </div>
                        <div>
                          <p className="text-zinc-400">Open</p>
                          <p className="font-semibold text-red-700">{batch.openCount}</p>
                        </div>
                        <div>
                          <p className="text-zinc-400">Delta</p>
                          <p className="font-semibold text-zinc-950">
                            {formatCedis(batch.deltaPesewas)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">Exception workflow</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Investigate, repair, resolve, or dismiss issues. Closed batches and closed
                    exceptions cannot be modified.
                  </p>
                </div>

                {selectedBatch && (
                  <button
                    type="button"
                    onClick={() => closeBatch(selectedBatch.id)}
                    disabled={
                      detailLoading ||
                      selectedBatch.status === "CLOSED" ||
                      Boolean(selectedBatch.closedAt) ||
                      activeExceptionCount > 0
                    }
                    className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
                  >
                    Close batch
                  </button>
                )}
              </div>
            </div>

            <div className="p-4">
              {detailLoading ? (
                <p className="text-sm text-zinc-500">Loading batch detail...</p>
              ) : !selectedBatch ? (
                <p className="text-sm text-zinc-500">
                  Select a saved batch from the history list.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] text-zinc-500">Expected</p>
                      <p className="font-semibold text-zinc-950">
                        {formatCedis(selectedBatch.expectedPesewas)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] text-zinc-500">Actual</p>
                      <p className="font-semibold text-zinc-950">
                        {formatCedis(selectedBatch.actualPesewas)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] text-zinc-500">Delta</p>
                      <p className="font-semibold text-zinc-950">
                        {formatCedis(selectedBatch.deltaPesewas)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] text-zinc-500">Active</p>
                      <p className="font-semibold text-red-700">{activeExceptionCount}</p>
                    </div>
                  </div>

                  {selectedBatch.exceptions.length === 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      This batch has no exceptions. If a recheck found issues already tracked in
                      another active or dismissed case, no duplicate batch was created.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedBatch.exceptions.map((ex) => {
                        const closedBatch =
                          selectedBatch.status === "CLOSED" || Boolean(selectedBatch.closedAt);
                        const closedException =
                          ex.status === "RESOLVED" || ex.status === "DISMISSED";
                        const locked = closedBatch || closedException;
                        const canRepairMissingReceipt =
                          ex.kind === "PAYMENT_WITHOUT_RECEIPT" &&
                          (ex.status === "OPEN" || ex.status === "INVESTIGATING");

                        return (
                          <div key={ex.id} className="rounded-2xl border border-zinc-200 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap gap-2">
                                  <span
                                    className={`rounded-full border px-2 py-1 text-[10px] font-bold ${severityClass(
                                      ex.severity
                                    )}`}
                                  >
                                    {ex.severity}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                                      ex.status
                                    )}`}
                                  >
                                    {ex.status}
                                  </span>
                                </div>
                                <h3 className="mt-2 text-sm font-semibold text-zinc-950">
                                  {kindLabel(ex.kind)}
                                </h3>
                                <p className="mt-1 text-xs text-zinc-600">{ex.description}</p>
                                <p className="mt-2 text-xs text-zinc-500">
                                  {ex.studentName} · {ex.term ?? "No term"} ·{" "}
                                  {ex.academicYear ?? "No academic year"}
                                </p>
                              </div>

                              <div className="text-right text-xs text-zinc-500">
                                <p>{formatCedis(ex.deltaPesewas)}</p>
                                <p>{ex.providerReference ?? "No ref"}</p>
                              </div>
                            </div>

                            <textarea
                              value={notesByException[ex.id] ?? ""}
                              onChange={(e) =>
                                setNotesByException((prev) => ({
                                  ...prev,
                                  [ex.id]: e.target.value,
                                }))
                              }
                              disabled={locked}
                              rows={3}
                              className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100"
                              placeholder="Write the investigation, resolution, or dismissal note..."
                            />

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={locked || savingExceptionId === ex.id}
                                onClick={() => updateException(ex.id, "INVESTIGATING")}
                                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Investigating
                              </button>
                              <button
                                type="button"
                                disabled={locked || savingExceptionId === ex.id}
                                onClick={() => updateException(ex.id, "RESOLVED")}
                                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Resolve
                              </button>

                              {canRepairMissingReceipt && (
                                <button
                                  type="button"
                                  disabled={locked || repairingExceptionId === ex.id}
                                  onClick={() => repairMissingReceipt(ex.id)}
                                  className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                                >
                                  {repairingExceptionId === ex.id
                                    ? "Creating..."
                                    : "Create missing receipt"}
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={locked || savingExceptionId === ex.id}
                                onClick={() => updateException(ex.id, "DISMISSED")}
                                className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
                              >
                                Dismiss
                              </button>
                            </div>

                            {closedException && (
                              <p className="mt-2 text-[11px] font-medium text-zinc-500">
                                This exception is closed. Create a new case only if the defect
                                reappears after being resolved.
                              </p>
                            )}

                            {ex.resolutionNote && (
                              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                                <p className="font-semibold text-zinc-800">Action note</p>
                                <p className="mt-1">{ex.resolutionNote}</p>
                                <p className="mt-2 text-zinc-400">
                                  {ex.resolvedByName ?? "—"} · {formatDate(ex.resolvedAt)}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {groupedIssues.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Latest unsaved check issues</h2>
            <p className="mt-1 text-xs text-zinc-500">
              These are current scan findings. Saving a batch will create only new exception cases;
              issues already tracked by existing cases will be logged as a recheck, not duplicated.
            </p>
            <div className="mt-4 space-y-3">
              {groupedIssues.map((group) => (
                <div key={group.kind} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-950">
                    {group.label}{" "}
                    <span className="text-xs font-normal text-zinc-500">({group.count})</span>
                  </p>
                  <div className="mt-2 space-y-2">
                    {group.issues.slice(0, 5).map((issue, idx) => (
                      <div key={`${group.kind}-${idx}`} className="text-xs text-zinc-600">
                        <span
                          className={`mr-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${severityClass(
                            issue.severity
                          )}`}
                        >
                          {issue.severity}
                        </span>
                        {issue.studentName ?? "Unknown"} · {issue.description}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}