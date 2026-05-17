// src/app/admin/fees/outbox/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type OutboxEvent = {
  id: string;
  type: string;
  status: string;
  aggregateType: string | null;
  aggregateId: string | null;
  receiptNumber: string | null;
  refundId: string | null;
  studentName: string | null;
  to: string | null;
  message: string | null;
  amountPesewas: number | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  processedAt: string | null;
  nextAttemptAt: string;
};

type ApiPayload = {
  ok: boolean;
  counts?: Record<string, number>;
  typeCounts?: Record<string, number>;
  safeTypes?: string[];
  events?: OutboxEvent[];
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCedis(pesewas: number | null | undefined) {
  if (typeof pesewas !== "number") return "—";
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}

function statusClass(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
    case "FAILED":
      return "bg-amber-500/15 text-amber-200 border-amber-400/30";
    case "DEAD":
      return "bg-red-500/15 text-red-200 border-red-400/30";
    case "PENDING":
      return "bg-sky-500/15 text-sky-200 border-sky-400/30";
    case "PROCESSING":
      return "bg-violet-500/15 text-violet-200 border-violet-400/30";
    case "CANCELLED":
      return "bg-zinc-500/15 text-zinc-200 border-zinc-400/30";
    default:
      return "bg-white/10 text-white/70 border-white/15";
  }
}

function eventTypeLabel(type: string) {
  const map: Record<string, string> = {
    SMS_RECEIPT: "Receipt SMS",
    SMS_REFUND_NOTICE: "Refund SMS",
    SMS_ARREARS_NOTICE: "Arrears SMS",
    SMS_RESULTS_RELEASE: "Results SMS",
  };

  return map[type] ?? type.replaceAll("_", " ");
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_OUTBOX: "Could not load finance outbox.",
    FAILED_TO_RETRY_OUTBOX_EVENT: "Could not retry outbox event.",
    CONTENT_TYPE_MUST_BE_JSON: "Invalid request format.",
    EVENT_ID_REQUIRED: "Outbox event ID is required.",
    OUTBOX_EVENT_NOT_FOUND: "Outbox event was not found for this school.",
    CANNOT_RETRY_COMPLETED: "Completed events cannot be retried.",
    CANNOT_RETRY_CANCELLED: "Cancelled events cannot be retried.",
    CANNOT_RETRY_PROCESSING: "Processing events cannot be retried until they fail or become stale.",
    RATE_LIMITED: "Too many outbox actions. Try again shortly.",
  };

  return map[code ?? ""] ?? code ?? "Action failed.";
}

export default function FinanceOutboxPage() {
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [safeTypes, setSafeTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/outbox/list", window.location.origin);
      if (typeFilter) url.searchParams.set("type", typeFilter);
      if (statusFilter) url.searchParams.set("status", statusFilter);

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiPayload;

      if (!res.ok || !data.ok) {
        throw new Error(friendlyError(data.error || "FAILED_TO_LOAD_OUTBOX"));
      }

      setEvents(data.events ?? []);
      setCounts(data.counts ?? {});
      setTypeCounts(data.typeCounts ?? {});
      setSafeTypes(data.safeTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runWorker() {
    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/fees/outbox/run", {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(friendlyError(data.error || "FAILED_TO_RUN_OUTBOX_WORKER"));
      }

      setNotice(
        `Worker claimed ${data.result?.claimed ?? 0}, completed ${
          data.result?.completed ?? 0
        }, failed ${data.result?.failed ?? 0}.`
      );

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function retry(eventId: string) {
    setBusyId(eventId);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/fees/outbox/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(friendlyError(data.error || "FAILED_TO_RETRY_OUTBOX_EVENT"));
      }

      setNotice(
        `Retry worker claimed ${data.dispatch?.claimed ?? 0}, completed ${
          data.dispatch?.completed ?? 0
        }, failed ${data.dispatch?.failed ?? 0}.`
      );

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(
    () => ({
      pending: counts.PENDING ?? 0,
      completed: counts.COMPLETED ?? 0,
      failed: counts.FAILED ?? 0,
      dead: counts.DEAD ?? 0,
      processing: counts.PROCESSING ?? 0,
      cancelled: counts.CANCELLED ?? 0,
    }),
    [counts]
  );

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-8 text-white sm:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Finance Scale Infrastructure
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Finance Outbox Monitor
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                Track school-scoped SMS delivery jobs for receipts, refunds, arrears, and results.
                Money truth remains valid even when notification delivery retries.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={runWorker}
                disabled={running}
                className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {running ? "Running..." : "Run worker"}
              </button>

              <button
                onClick={load}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Pending", totals.pending],
              ["Processing", totals.processing],
              ["Completed", totals.completed],
              ["Failed", totals.failed],
              ["Dead", totals.dead],
              ["Cancelled", totals.cancelled],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
            {safeTypes.map((type) => (
              <span key={type} className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                {eventTypeLabel(type)}: {typeCounts[type] ?? 0}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-11 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            >
              <option value="">All safe SMS types</option>
              {safeTypes.map((type) => (
                <option key={type} value={type}>
                  {eventTypeLabel(type)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            >
              <option value="">All statuses</option>
              {["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD", "CANCELLED"].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                )
              )}
            </select>

            <button
              onClick={load}
              className="h-11 rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-bold text-white hover:bg-white/15"
            >
              Apply filters
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.18em] text-white/50">
                <tr>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Evidence</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Attempts</th>
                  <th className="px-5 py-4">Next attempt</th>
                  <th className="px-5 py-4">Processed</th>
                  <th className="px-5 py-4">Error</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td className="px-5 py-8 text-white/55" colSpan={9}>
                      Loading outbox events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-white/55" colSpan={9}>
                      No finance outbox events found for this school.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(
                            event.status
                          )}`}
                        >
                          {event.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-semibold text-white">
                        {eventTypeLabel(event.type)}
                      </td>

                      <td className="px-5 py-4 text-white/70">
                        <div className="max-w-xs space-y-1">
                          <p>{event.receiptNumber ?? event.refundId ?? event.aggregateId ?? "—"}</p>
                          {event.studentName && <p className="text-white/45">{event.studentName}</p>}
                          {event.amountPesewas !== null && (
                            <p className="text-white/45">{formatCedis(event.amountPesewas)}</p>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-white/70">{event.to ?? "—"}</td>

                      <td className="px-5 py-4 text-white/70">
                        {event.attempts}/{event.maxAttempts}
                      </td>

                      <td className="px-5 py-4 text-white/60">
                        {formatDate(event.nextAttemptAt)}
                      </td>

                      <td className="px-5 py-4 text-white/60">
                        {formatDate(event.processedAt)}
                      </td>

                      <td className="max-w-xs px-5 py-4 text-white/55">
                        {event.lastError ?? "—"}
                      </td>

                      <td className="px-5 py-4">
                        {["PENDING", "FAILED", "DEAD"].includes(event.status) ? (
                          <button
                            onClick={() => retry(event.id)}
                            disabled={busyId === event.id}
                            className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
                          >
                            {busyId === event.id ? "Retrying..." : "Retry"}
                          </button>
                        ) : (
                          <span className="text-xs text-white/35">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}