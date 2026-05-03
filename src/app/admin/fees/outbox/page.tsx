// src/app/admin/fees/outbox/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type OutboxEvent = {
  id: string;
  type: string;
  status: string;
  receiptNumber: string | null;
  to: string | null;
  message: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
  nextAttemptAt: string;
};

type ApiPayload = {
  ok: boolean;
  counts?: Record<string, number>;
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
    default:
      return "bg-white/10 text-white/70 border-white/15";
  }
}

export default function FinanceOutboxPage() {
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/fees/outbox/list", {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiPayload;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "FAILED_TO_LOAD_OUTBOX");
      }

      setEvents(data.events ?? []);
      setCounts(data.counts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function retry(eventId: string) {
    setBusyId(eventId);
    setError(null);

    try {
      const res = await fetch("/api/admin/fees/outbox/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "FAILED_TO_RETRY_OUTBOX_EVENT");
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(
    () => ({
      pending: counts.PENDING ?? 0,
      completed: counts.COMPLETED ?? 0,
      failed: counts.FAILED ?? 0,
      dead: counts.DEAD ?? 0,
      processing: counts.PROCESSING ?? 0,
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
                Receipt SMS Outbox Monitor
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                Track payment receipt SMS delivery jobs. Successful payments remain
                true even if SMS delivery fails; failed messages stay here for safe
                retry.
              </p>
            </div>

            <button
              onClick={load}
              className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Pending", totals.pending],
              ["Processing", totals.processing],
              ["Completed", totals.completed],
              ["Failed", totals.failed],
              ["Dead", totals.dead],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>

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
                  <th className="px-5 py-4">Receipt</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Attempts</th>
                  <th className="px-5 py-4">Created</th>
                  <th className="px-5 py-4">Processed</th>
                  <th className="px-5 py-4">Error</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td className="px-5 py-8 text-white/55" colSpan={8}>
                      Loading outbox events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-white/55" colSpan={8}>
                      No receipt SMS outbox events found.
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
                        {event.receiptNumber ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-white/70">{event.to ?? "—"}</td>
                      <td className="px-5 py-4 text-white/70">
                        {event.attempts}/{event.maxAttempts}
                      </td>
                      <td className="px-5 py-4 text-white/60">
                        {formatDate(event.createdAt)}
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