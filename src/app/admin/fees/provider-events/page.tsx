// src/app/admin/fees/provider-events/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ProviderEventStatus = "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";

type RelatedPayment = {
  id: string;
  invoiceId: string;
  amountPesewas: number;
  reference: string | null;
  method: string | null;
  channel: string | null;
  status: string;
  paidAt: string;
  term: string | null;
  academicYear: string | null;
};

type RelatedTransaction = {
  id: string;
  provider: string;
  providerReference: string;
  providerTransactionId: string | null;
  amountPesewas: number;
  currency: string;
  status: string;
  feePaymentId: string | null;
  createdAt: string;
};

type RelatedRefund = {
  id: string;
  amountPesewas: number;
  currency: string;
  status: string;
  providerReference: string | null;
  providerRefundReference: string | null;
  reason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  processingAt: string | null;
  processedAt: string | null;
  failedAt: string | null;
  refundLifecycleComplete: boolean;
};

type ProviderEventRow = {
  id: string;
  tenantId: string | null;
  provider: string;
  eventType: string;
  category: "PAYMENT" | "REFUND" | "TRANSFER" | "OTHER" | string;
  providerReference: string | null;
  derivedPaymentReference: string | null;
  providerRefundReference: string | null;
  providerEventId: string | null;
  processingStatus: ProviderEventStatus;
  processingError: string | null;
  isReplay: boolean;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  duplicateCount: number;
  receivedAt: string;
  eventTime: string | null;
  processedAt: string | null;
  humanSummary: string;
  relatedPayment: RelatedPayment | null;
  relatedTransaction: RelatedTransaction | null;
  relatedRefund: RelatedRefund | null;
  studentName: string | null;
  needsAdminAttention: boolean;
  rawPayload?: unknown;
};

type ProviderEventsSummary = {
  total: number;
  received: number;
  processed: number;
  failed: number;
  ignored: number;
  suspicious: number;
  replay: number;
  refundEvents: number;
  paymentEvents: number;
  needsAdminAttention: number;
};

type ProviderEventsPayload = {
  ok: boolean;
  error?: string;
  summary?: ProviderEventsSummary;
  rows?: ProviderEventRow[];
};

type ReprocessPayload = {
  ok?: boolean;
  error?: string;
  queued?: boolean;
  outboxEventId?: string;
  smsDispatch?: {
    claimed?: number;
    completed?: number;
    failed?: number;
  };
};

function formatDate(value: string | null | undefined) {
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
  const sign = pesewas < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(pesewas) / 100).toFixed(2)}`;
}

function statusClass(status: string) {
  if (status === "PROCESSED") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "border-red-300 bg-red-50 text-red-800";
  if (status === "RECEIVED") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "IGNORED") return "border-zinc-300 bg-zinc-50 text-zinc-700";
  return "border-blue-300 bg-blue-50 text-blue-800";
}

function categoryClass(category: string) {
  if (category === "PAYMENT") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (category === "REFUND") return "border-rose-200 bg-rose-50 text-rose-800";
  if (category === "TRANSFER") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    FAILED_TO_LOAD_PROVIDER_EVENTS: "Could not load provider events.",
    PAYMENT_PROVIDER_EVENT_NOT_FOUND: "Provider event was not found for this school.",
    EVENT_ID_REQUIRED: "Provider event ID is required.",
    CONTENT_TYPE_MUST_BE_JSON: "Invalid request format.",
    RATE_LIMITED: "Too many recovery actions. Try again shortly.",
    PROVIDER_EVENT_ALREADY_PROCESSED: "This provider event has already been processed.",
    PROVIDER_EVENT_REPROCESS_FAILED: "Provider event recovery failed.",
  };

  return map[code ?? ""] ?? code ?? "Action failed.";
}

function canReprocess(row: ProviderEventRow) {
  return row.processingStatus === "RECEIVED" || row.processingStatus === "FAILED";
}

const CONTROL_CLASS =
  "h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function referenceOf(row: ProviderEventRow) {
  return (
    row.derivedPaymentReference ||
    row.providerReference ||
    row.providerRefundReference ||
    row.relatedPayment?.reference ||
    row.relatedTransaction?.providerReference ||
    row.relatedRefund?.providerRefundReference ||
    "—"
  );
}

function amountOf(row: ProviderEventRow) {
  return (
    row.relatedRefund?.amountPesewas ??
    row.relatedPayment?.amountPesewas ??
    row.relatedTransaction?.amountPesewas ??
    null
  );
}

function evidenceItems(row: ProviderEventRow) {
  const items = [
    row.relatedPayment ? `Payment: ${row.relatedPayment.id}` : null,
    row.relatedPayment?.invoiceId ? `Invoice: ${row.relatedPayment.invoiceId}` : null,
    row.relatedTransaction ? `Transaction: ${row.relatedTransaction.id}` : null,
    row.relatedRefund ? `Refund: ${row.relatedRefund.id}` : null,
    row.relatedRefund?.refundLifecycleComplete === false ? "Refund lifecycle still incomplete" : null,
  ].filter(Boolean) as string[];

  return items.length ? items : ["No linked finance record found yet."];
}

const emptySummary: ProviderEventsSummary = {
  total: 0,
  received: 0,
  processed: 0,
  failed: 0,
  ignored: 0,
  suspicious: 0,
  replay: 0,
  refundEvents: 0,
  paymentEvents: 0,
  needsAdminAttention: 0,
};

export default function AdminProviderEventsPage() {
  const [rows, setRows] = useState<ProviderEventRow[]>([]);
  const [summary, setSummary] = useState<ProviderEventsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [reference, setReference] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [includeRaw, setIncludeRaw] = useState(false);
  const [limit, setLimit] = useState("80");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(e?: FormEvent) {
    e?.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/admin/fees/provider-events/list", window.location.origin);

      if (status) url.searchParams.set("status", status);
      if (eventType.trim()) url.searchParams.set("eventType", eventType.trim());
      if (reference.trim()) url.searchParams.set("reference", reference.trim());
      if (suspiciousOnly) url.searchParams.set("suspicious", "1");
      if (includeRaw) url.searchParams.set("includeRaw", "1");

      const safeLimit = Number(limit);
      if (Number.isFinite(safeLimit) && safeLimit > 0) {
        url.searchParams.set("limit", String(Math.min(Math.floor(safeLimit), 200)));
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ProviderEventsPayload;

      if (!res.ok || !data.ok) {
        setError(friendlyError(data.error || "FAILED_TO_LOAD_PROVIDER_EVENTS"));
        setRows([]);
        setSummary(emptySummary);
        return;
      }

      setRows(data.rows ?? []);
      setSummary(data.summary ?? emptySummary);
    } catch {
      setError("Network error while loading provider events.");
      setRows([]);
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  }

  async function reprocess(row: ProviderEventRow, runAsync: boolean) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/fees/provider-events/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: row.id,
          async: runAsync,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ReprocessPayload;

      if (!res.ok || !data.ok) {
        setError(friendlyError(data.error));
        return;
      }

      if (data.queued) {
        setNotice(`Provider event queued for async recovery. Outbox event: ${data.outboxEventId}`);
      } else {
        setNotice(
          `Provider event reprocessed. SMS worker claimed ${
            data.smsDispatch?.claimed ?? 0
          }, completed ${data.smsDispatch?.completed ?? 0}, failed ${
            data.smsDispatch?.failed ?? 0
          }.`
        );
      }

      await load();
    } catch {
      setError("Network error while reprocessing provider event.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventTypes = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.eventType).filter(Boolean))).sort();
  }, [rows]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              EduLife OS · Finance Provider Recovery
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Provider Event Recovery
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Review Paystack events, replay/suspicious evidence, processing failures, linked
              payment/refund records, and recoverable provider events.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/outbox"
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Outbox monitor
            </Link>
            <Link
              href="/admin/fees/audit"
              className="inline-flex h-10 items-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Audit evidence
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5 lg:grid-cols-10">
          {[
            ["Total", summary.total, "zinc"],
            ["Received", summary.received, "amber"],
            ["Processed", summary.processed, "emerald"],
            ["Failed", summary.failed, "red"],
            ["Ignored", summary.ignored, "zinc"],
            ["Suspicious", summary.suspicious, "red"],
            ["Replay", summary.replay, "blue"],
            ["Refund", summary.refundEvents, "rose"],
            ["Payment", summary.paymentEvents, "emerald"],
            ["Attention", summary.needsAdminAttention, "amber"],
          ].map(([label, value, tone]) => (
            <div
              key={String(label)}
              className={`rounded-2xl border p-4 shadow-sm ${
                tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50"
                  : tone === "red"
                    ? "border-red-200 bg-red-50"
                    : tone === "amber"
                      ? "border-amber-200 bg-amber-50"
                      : tone === "blue"
                        ? "border-blue-200 bg-blue-50"
                        : tone === "rose"
                          ? "border-rose-200 bg-rose-50"
                          : "border-zinc-200 bg-white"
              }`}
            >
              <p className="text-[11px] text-zinc-600">{label}</p>
              <p className="mt-1 text-xl font-bold text-zinc-950">{String(value)}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Status</label>
              <select
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  className={CONTROL_CLASS}
>
                <option value="">All statuses</option>
                <option value="RECEIVED">Received</option>
                <option value="PROCESSED">Processed</option>
                <option value="FAILED">Failed</option>
                <option value="IGNORED">Ignored</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Event type</label>
              <input
  value={eventType}
  onChange={(e) => setEventType(e.target.value)}
  list="provider-event-types"
  placeholder="charge.success"
  className={CONTROL_CLASS}
/>
              <datalist id="provider-event-types">
                {eventTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">
                Provider reference
              </label>
              <input
  value={reference}
  onChange={(e) => setReference(e.target.value)}
  placeholder="provider reference"
  className={CONTROL_CLASS}
/>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Limit</label>
              <input
  value={limit}
  onChange={(e) => setLimit(e.target.value)}
  inputMode="numeric"
  className={CONTROL_CLASS}
/>
            </div>

            <button
              disabled={loading}
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={suspiciousOnly}
                onChange={(e) => setSuspiciousOnly(e.target.checked)}
              />
              Suspicious only
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={includeRaw}
                onChange={(e) => setIncludeRaw(e.target.checked)}
              />
              Include raw payload preview
            </label>
          </div>
        </section>

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Provider event queue</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Failed or received events are recoverable. Processed events are evidence. Ignored
              events usually represent duplicates or unsupported cases.
            </p>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-zinc-500">Loading provider events...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No provider events found.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <article key={row.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                            row.processingStatus
                          )}`}
                        >
                          {row.processingStatus}
                        </span>

                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${categoryClass(
                            row.category
                          )}`}
                        >
                          {row.category}
                        </span>

                        {row.needsAdminAttention && (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                            NEEDS ATTENTION
                          </span>
                        )}

                        {row.isSuspicious && (
                          <span className="rounded-full border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-800">
                            SUSPICIOUS
                          </span>
                        )}

                        {row.isReplay && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                            REPLAY ×{row.duplicateCount}
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-zinc-950">{row.eventType}</h3>
                        <p className="mt-1 text-xs text-zinc-600">{row.humanSummary}</p>
                      </div>

                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="font-semibold text-zinc-800">Provider reference</p>
                          <p className="mt-1 break-all font-mono text-[10px] text-zinc-600">
                            {referenceOf(row)}
                          </p>
                          <p className="mt-2 text-zinc-500">
                            Provider event ID: {row.providerEventId ?? "—"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="font-semibold text-zinc-800">Linked finance evidence</p>
                          <ul className="mt-1 space-y-1 text-zinc-600">
                            {evidenceItems(row).map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {row.studentName && (
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                          <span className="font-semibold text-zinc-900">Learner:</span>{" "}
                          {row.studentName}
                        </div>
                      )}

                      {row.relatedPayment && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                          <p className="font-semibold">Related payment</p>
                          <p className="mt-1">
                            {formatCedis(row.relatedPayment.amountPesewas)} ·{" "}
                            {row.relatedPayment.status} · {row.relatedPayment.term ?? "No term"} ·{" "}
                            {row.relatedPayment.academicYear ?? "No academic year"}
                          </p>
                          <p className="mt-1 break-all font-mono text-[10px]">
                            {row.relatedPayment.reference ?? "No payment reference"}
                          </p>
                        </div>
                      )}

                      {row.relatedRefund && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                          <p className="font-semibold">Related refund</p>
                          <p className="mt-1">
                            {formatCedis(row.relatedRefund.amountPesewas)} ·{" "}
                            {row.relatedRefund.status} · lifecycle{" "}
                            {row.relatedRefund.refundLifecycleComplete ? "complete" : "incomplete"}
                          </p>
                          <p className="mt-1 break-all font-mono text-[10px]">
                            {row.relatedRefund.providerRefundReference ?? "No refund reference"}
                          </p>
                        </div>
                      )}

                      {row.processingError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                          <p className="font-semibold">Processing error</p>
                          <p className="mt-1 break-words">{row.processingError}</p>
                        </div>
                      )}

                      {row.suspiciousReason && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <p className="font-semibold">Suspicious reason</p>
                          <p className="mt-1 break-words">{row.suspiciousReason}</p>
                        </div>
                      )}

                      {includeRaw && row.rawPayload !== undefined && (
                        <details className="rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-xs text-zinc-100">
                          <summary className="cursor-pointer font-semibold">
                            Raw payload preview
                          </summary>
                          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px]">
                            {JSON.stringify(row.rawPayload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>

                    <aside className="grid gap-2 text-xs lg:min-w-[260px]">
                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <p className="text-zinc-500">Received</p>
                        <p className="font-semibold text-zinc-950">{formatDate(row.receivedAt)}</p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <p className="text-zinc-500">Event time</p>
                        <p className="font-semibold text-zinc-950">{formatDate(row.eventTime)}</p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <p className="text-zinc-500">Processed</p>
                        <p className="font-semibold text-zinc-950">{formatDate(row.processedAt)}</p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <p className="text-zinc-500">Amount</p>
                        <p className="font-semibold text-zinc-950">{formatCedis(amountOf(row))}</p>
                      </div>

                      {canReprocess(row) ? (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => reprocess(row, false)}
                            disabled={busyId === row.id}
                            className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
                          >
                            {busyId === row.id ? "Working..." : "Reprocess now"}
                          </button>

                          <button
                            type="button"
                            onClick={() => reprocess(row, true)}
                            disabled={busyId === row.id}
                            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            Queue recovery
                          </button>
                        </div>
                      ) : (
                        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                          No recovery action available for this status.
                        </p>
                      )}
                    </aside>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}