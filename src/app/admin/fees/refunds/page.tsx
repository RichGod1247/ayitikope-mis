// src/app/admin/fees/refunds/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RefundRow = {
  id: string;
  status?: string | null;
  provider?: string | null;
  amountPesewas?: number | null;
  currency?: string | null;
  reason?: string | null;
  approvalNote?: string | null;
  feePaymentId?: string | null;
  receiptId?: string | null;
  providerReference?: string | null;
  providerRefundReference?: string | null;
  requestedAt?: string | null;
  approvedAt?: string | null;
  processingAt?: string | null;
  processedAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  failureReason?: string | null;
  requestedBy?: { name?: string | null; email?: string | null } | null;
  approvedBy?: { name?: string | null; email?: string | null } | null;
};

type ActionState =
  | { kind: "idle"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toRefundRows(payload: unknown): RefundRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord).map((row) => row as RefundRow);
  }

  if (!isRecord(payload)) return [];

  const candidates = [payload.refunds, payload.items, payload.rows, payload.data];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord).map((row) => row as RefundRow);
    }

    if (isRecord(candidate)) {
      const nested = [candidate.refunds, candidate.items, candidate.rows, candidate.data];

      for (const value of nested) {
        if (Array.isArray(value)) {
          return value.filter(isRecord).map((row) => row as RefundRow);
        }
      }
    }
  }

  return [];
}

function formatMoney(pesewas: unknown, currency = "GHS") {
  const n = typeof pesewas === "number" && Number.isFinite(pesewas) ? pesewas : 0;

  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: currency || "GHS",
    }).format(n / 100);
  } catch {
    return `${currency || "GHS"} ${(n / 100).toFixed(2)}`;
  }
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pesewasFromGhs(value: string) {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

function shortId(value: unknown) {
  const id = clean(value);
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 7)}…${id.slice(-5)}`;
}

function statusClass(status: unknown) {
  const s = clean(status).toUpperCase();

  if (s === "SUCCEEDED") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (s === "PROCESSING" || s === "APPROVED") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (s === "REQUESTED") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (s === "FAILED" || s === "CANCELLED") return "border-rose-400/25 bg-rose-400/10 text-rose-200";

  return "border-white/10 bg-white/5 text-[#C9CDD6]";
}

async function readJson(res: Response) {
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const error =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP_${res.status}`;

    throw new Error(error);
  }

  return payload;
}

async function postJson(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const key = clean(idempotencyKey);
  if (key) headers["x-idempotency-key"] = key;

  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return readJson(res);
}

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<unknown>(null);
  const [selectedRefundId, setSelectedRefundId] = useState("");
  const [action, setAction] = useState<ActionState>({
    kind: "idle",
    message: "Ready to test refund truth.",
  });

  const [feePaymentId, setFeePaymentId] = useState("");
  const [amountGhs, setAmountGhs] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [approvalNote, setApprovalNote] = useState("");

  const visibleRefunds = useMemo(() => {
    const filter = clean(statusFilter).toUpperCase();
    if (!filter) return refunds;

    return refunds.filter((refund) => clean(refund.status).toUpperCase() === filter);
  }, [refunds, statusFilter]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();

    for (const refund of refunds) {
      const key = clean(refund.status).toUpperCase() || "UNKNOWN";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [refunds]);

  const loadRefunds = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/fees/refunds/list", {
        headers: { "Cache-Control": "no-store" },
      });

      const payload = await readJson(res);
      setRefunds(toRefundRows(payload));
      setAction({ kind: "success", message: "Refund list refreshed." });
    } catch (err) {
      setAction({
        kind: "error",
        message: err instanceof Error ? err.message : "FAILED_TO_LOAD_REFUNDS",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  async function requestRefund() {
    const amountPesewas = pesewasFromGhs(amountGhs);

    if (!clean(feePaymentId)) {
      setAction({ kind: "error", message: "Fee payment ID is required." });
      return;
    }

    if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) {
      setAction({ kind: "error", message: "Enter a valid refund amount in GHS." });
      return;
    }

    if (!clean(reason)) {
      setAction({ kind: "error", message: "Refund reason is required." });
      return;
    }

    setAction({ kind: "idle", message: "Requesting refund..." });

    try {
      const payload = await postJson(
        "/api/admin/fees/refunds/request",
        {
          feePaymentId: clean(feePaymentId),
          amountPesewas,
          reason: clean(reason),
          idempotencyKey: clean(idempotencyKey) || undefined,
        },
        idempotencyKey
      );

      setDetail(payload);
      setAction({ kind: "success", message: "Refund requested successfully." });
      await loadRefunds();
    } catch (err) {
      setAction({
        kind: "error",
        message: err instanceof Error ? err.message : "FAILED_TO_REQUEST_REFUND",
      });
    }
  }

  async function approveRefund(refundId: string) {
    const id = clean(refundId);
    if (!id) return;

    setAction({ kind: "idle", message: "Approving refund..." });

    try {
      const payload = await postJson("/api/admin/fees/refunds/approve", {
        refundId: id,
        approvalNote: clean(approvalNote) || null,
      });

      setDetail(payload);
      setAction({ kind: "success", message: "Refund approved successfully." });
      await loadRefunds();
    } catch (err) {
      setAction({
        kind: "error",
        message: err instanceof Error ? err.message : "FAILED_TO_APPROVE_REFUND",
      });
    }
  }

  async function executeRefund(refundId: string) {
    const id = clean(refundId);
    if (!id) return;

    setAction({ kind: "idle", message: "Executing refund..." });

    try {
      const payload = await postJson("/api/admin/fees/refunds/execute", {
        refundId: id,
      });

      setDetail(payload);
      setAction({ kind: "success", message: "Refund execution submitted successfully." });
      await loadRefunds();
    } catch (err) {
      setAction({
        kind: "error",
        message: err instanceof Error ? err.message : "FAILED_TO_EXECUTE_REFUND",
      });
    }
  }

  async function inspectRefund(refundId: string) {
    const id = clean(refundId);
    if (!id) return;

    setSelectedRefundId(id);
    setAction({ kind: "idle", message: "Loading refund details..." });

    try {
      const res = await fetch(`/api/admin/fees/refunds/${encodeURIComponent(id)}`, {
        headers: { "Cache-Control": "no-store" },
      });

      const payload = await readJson(res);
      setDetail(payload);
      setAction({ kind: "success", message: "Refund detail loaded." });
    } catch (err) {
      setAction({
        kind: "error",
        message: err instanceof Error ? err.message : "FAILED_TO_LOAD_REFUND_DETAIL",
      });
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(7,26,61,0.88),rgba(5,7,11,0.95))] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E8C96A]">
              Finance Trust Spine
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#F7F4ED] md:text-4xl">
              Refund Operations Console
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
              Request, approve, execute, inspect, and verify refunds before moving to Sprint 10.
              Parents may request refunds; school finance/admin must approve and execute.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRefunds()}
            className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/[0.12]"
          >
            Refresh Refunds
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {summary.length ? (
            summary.map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(status)}`}
              >
                {status}: {count}
              </button>
            ))
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#C9CDD6]">
              No refunds loaded
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
              Staff Test Action
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Request a Refund</h2>
            <p className="mt-2 text-sm leading-6 text-[#9EA7B8]">
              Use a real fee payment ID from receipts, ledger, or payment records. Parent requests
              can also appear here after being submitted from the parent portal.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-[#C9CDD6]">Fee Payment ID</span>
              <input
                value={feePaymentId}
                onChange={(e) => setFeePaymentId(e.target.value)}
                placeholder="e.g. cm..."
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#F7F4ED] outline-none transition placeholder:text-[#647084] focus:border-[#E8C96A]/60"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#C9CDD6]">Amount to refund (GHS)</span>
              <input
                value={amountGhs}
                onChange={(e) => setAmountGhs(e.target.value)}
                placeholder="e.g. 25.00"
                inputMode="decimal"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#F7F4ED] outline-none transition placeholder:text-[#647084] focus:border-[#E8C96A]/60"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#C9CDD6]">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the operational reason for the refund."
                rows={3}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#F7F4ED] outline-none transition placeholder:text-[#647084] focus:border-[#E8C96A]/60"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#C9CDD6]">
                Idempotency Key — optional but useful for tests
              </span>
              <input
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                placeholder="e.g. refund-test-001"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#F7F4ED] outline-none transition placeholder:text-[#647084] focus:border-[#E8C96A]/60"
              />
            </label>

            <button
              type="button"
              onClick={() => void requestRefund()}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2.5 text-sm font-black text-[#071A3D] transition hover:brightness-110"
            >
              Request Refund
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="block">
              <span className="text-xs font-semibold text-[#C9CDD6]">
                Approval Note — used by approve action
              </span>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Optional approval note."
                rows={3}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#F7F4ED] outline-none transition placeholder:text-[#647084] focus:border-[#E8C96A]/60"
              />
            </label>
          </div>

          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              action.kind === "error"
                ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
                : action.kind === "success"
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-[#C9CDD6]"
            }`}
          >
            {action.message}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
                Refund Register
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Recent Refunds</h2>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-white/10 bg-[#071A3D] px-3 py-2 text-sm text-[#F7F4ED] outline-none"
            >
              <option value="">All statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="PROCESSING">Processing</option>
              <option value="SUCCEEDED">Succeeded</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.14em] text-[#9EA7B8]">
                <tr>
                  <th className="px-4 py-3">Refund</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#C9CDD6]">
                      Loading refunds...
                    </td>
                  </tr>
                ) : visibleRefunds.length ? (
                  visibleRefunds.map((refund) => {
                    const status = clean(refund.status).toUpperCase();
                    const canApprove = status === "REQUESTED";
                    const canExecute = status === "APPROVED";

                    return (
                      <tr key={refund.id} className="align-top hover:bg-white/[0.025]">
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => void inspectRefund(refund.id)}
                            className="font-mono text-xs font-bold text-[#E8C96A] hover:underline"
                          >
                            {shortId(refund.id)}
                          </button>
                          <p className="mt-1 max-w-[260px] truncate text-xs text-[#8F98A8]">
                            {refund.reason || "No reason captured"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(status)}`}
                          >
                            {status || "UNKNOWN"}
                          </span>
                          {refund.failureReason && (
                            <p className="mt-1 max-w-[220px] text-xs text-rose-200">
                              {refund.failureReason}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4 font-semibold text-[#F7F4ED]">
                          {formatMoney(refund.amountPesewas, refund.currency || "GHS")}
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-xs font-bold text-[#C9CDD6]">
                            {refund.provider || "—"}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-[#8F98A8]">
                            {shortId(refund.providerRefundReference || refund.providerReference)}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-mono text-xs text-[#C9CDD6]">
                            {shortId(refund.feePaymentId)}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-[#8F98A8]">
                            Receipt: {shortId(refund.receiptId)}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-xs text-[#C9CDD6]">
                          {formatDate(refund.requestedAt)}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void inspectRefund(refund.id)}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#F7F4ED] hover:bg-white/10"
                            >
                              Inspect
                            </button>

                            <button
                              type="button"
                              disabled={!canApprove}
                              onClick={() => void approveRefund(refund.id)}
                              className="rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              disabled={!canExecute}
                              onClick={() => void executeRefund(refund.id)}
                              className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Execute
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#C9CDD6]">
                      No refunds found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
              Evidence Panel
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">
              Last API Response {selectedRefundId ? `· ${shortId(selectedRefundId)}` : ""}
            </h2>
            <p className="mt-2 text-sm text-[#9EA7B8]">
              Use this response while filling the Sprint 9 finance trust test log.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDetail(null)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] hover:bg-white/10"
          >
            Clear
          </button>
        </div>

        <pre className="mt-4 max-h-[440px] overflow-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-5 text-[#C9CDD6]">
          {detail ? JSON.stringify(detail, null, 2) : "No action response yet."}
        </pre>
      </section>
    </div>
  );
}