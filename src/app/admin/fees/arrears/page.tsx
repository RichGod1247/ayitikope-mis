// src/app/admin/fees/arrears/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MeResponse =
  | { ok: true; tenantId: string; tenant?: { name?: string | null } | null }
  | { ok: false; error?: string };

type ArrearsRow = {
  invoiceId: string;
  studentName: string;
  guardianPhone: string | null;
  amountDue: number;
  grossPaid?: number;
  succeededRefunds?: number;
  pendingRefunds?: number;
  netPaid?: number;
  className: string | null;
  term: string | null;
  academicYear?: string | null;
  dueDate: string | null;
};

type ArrearsListResponse = {
  ok: boolean;
  source?: "db" | string;
  count?: number;
  formula?: string;
  items?: ArrearsRow[];
  error?: string;
};

type FeesTemplateMeta = {
  brand: string | null;
  lastUpdatedBy: string | null;
  lastUpdatedAt: string | null;
};

type FeesTemplateResponse = {
  ok: boolean;
  template?: string;
  meta?: FeesTemplateMeta;
  error?: string;
};

type NotifySimulateResponse = {
  ok: boolean;
  total?: number;
  requested?: number;
  eligibleCount?: number;
  skippedCount?: number;
  error?: string;
};

type NotifySendResponse = {
  ok: boolean;
  requested?: number;
  eligibleCount?: number;
  queuedCount?: number;
  alreadyHandledCount?: number;
  skippedCount?: number;
  blockedCount?: number;
  error?: string;
};

const btnBase =
  "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btnBase} border-black bg-black text-white hover:bg-zinc-800`;
const btnOutline = `${btnBase} border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50`;

const SMS_COST_PER_MESSAGE = 0.03;

function hasPhone(value: string | null) {
  return Boolean(value?.trim());
}

function safeJson<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

function formatCedis(value: number | null | undefined) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `GH₵ ${n.toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function FeesArrearsPage() {
  const [meReady, setMeReady] = useState(false);
  const [tenantName, setTenantName] = useState("School");

  const [arrears, setArrears] = useState<ArrearsRow[]>([]);
  const [loadingArrears, setLoadingArrears] = useState(false);
  const [arrearsSource, setArrearsSource] = useState<"database" | null>(null);

  const [templateText, setTemplateText] = useState("");
  const [templateMeta, setTemplateMeta] = useState<FeesTemplateMeta | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    () => new Set()
  );

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSimulateOnly, setConfirmSimulateOnly] = useState(false);

  useEffect(() => {
    const ac = new AbortController();

    async function loadMe() {
      try {
        const res = await fetch("/api/me", {
          cache: "no-store",
          signal: ac.signal,
        });

        const json = safeJson<MeResponse>(await res.json().catch(() => null));

        if (!res.ok || !json || json.ok !== true) {
          setError("Could not load tenant context. Please sign in again.");
          return;
        }

        setTenantName(json.tenant?.name || "School");
        setMeReady(true);
      } catch {
        if (!ac.signal.aborted) {
          setError("Failed to load tenant context.");
        }
      }
    }

    void loadMe();

    return () => ac.abort();
  }, []);

  const loadTemplate = useCallback(async () => {
    setLoadingTemplate(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/sms/templates/fees-arrears", {
        cache: "no-store",
      });

      const json = safeJson<FeesTemplateResponse>(
        await res.json().catch(() => null)
      );

      if (!res.ok || !json || !json.ok) {
        setTemplateText("");
        setTemplateMeta(null);
        setError(json?.error || "Failed to load fees arrears SMS template.");
        return;
      }

      setTemplateText(json.template || "");
      setTemplateMeta(json.meta || null);
    } catch {
      setTemplateText("");
      setTemplateMeta(null);
      setError("Network or server error while loading fees arrears SMS template.");
    } finally {
      setLoadingTemplate(false);
    }
  }, []);

  const loadArrears = useCallback(async () => {
    setLoadingArrears(true);
    setError(null);
    setInfo(null);
    setSelectedInvoiceIds(new Set());

    try {
      const res = await fetch("/api/admin/fees/arrears/list", {
        cache: "no-store",
      });

      const json = safeJson<ArrearsListResponse>(
        await res.json().catch(() => null)
      );

      if (!res.ok || !json || !json.ok) {
        setArrears([]);
        setArrearsSource(null);
        setError(json?.error || "Internal error loading arrears. Please try again.");
        return;
      }

      const items = Array.isArray(json.items) ? json.items : [];

      setArrears(items);
      setArrearsSource(json.source === "db" ? "database" : null);

      if (!items.length) {
        setInfo("No current unpaid invoices were found.");
      } else {
        setInfo(
          "Arrears loaded from invoice, payment, and refund records. Refunded amounts are deducted from net paid."
        );
      }
    } catch {
      setArrears([]);
      setArrearsSource(null);
      setError("Network or server error while loading arrears.");
    } finally {
      setLoadingArrears(false);
    }
  }, []);

  useEffect(() => {
    if (!meReady) return;

    void loadTemplate();
    void loadArrears();
  }, [meReady, loadTemplate, loadArrears]);

  function toggleSelect(invoiceId: string, allowed: boolean) {
    if (!allowed) return;

    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function selectAllWithPhone() {
    const next = new Set<string>();

    for (const row of arrears) {
      if (hasPhone(row.guardianPhone)) next.add(row.invoiceId);
    }

    setSelectedInvoiceIds(next);
  }

  function clearSelection() {
    setSelectedInvoiceIds(new Set());
  }

  const selectedRows = useMemo(() => {
    if (!selectedInvoiceIds.size) return [];

    return arrears.filter(
      (row) => selectedInvoiceIds.has(row.invoiceId) && hasPhone(row.guardianPhone)
    );
  }, [arrears, selectedInvoiceIds]);

  const withPhoneCount = useMemo(
    () => arrears.filter((row) => hasPhone(row.guardianPhone)).length,
    [arrears]
  );

  const totalArrears = useMemo(
    () => arrears.reduce((sum, row) => sum + row.amountDue, 0),
    [arrears]
  );

  const totalSucceededRefunds = useMemo(
    () => arrears.reduce((sum, row) => sum + (row.succeededRefunds ?? 0), 0),
    [arrears]
  );

  const totalPendingRefunds = useMemo(
    () => arrears.reduce((sum, row) => sum + (row.pendingRefunds ?? 0), 0),
    [arrears]
  );

  const estimatedSmsCount = selectedRows.length;
  const estimatedCost =
    estimatedSmsCount > 0
      ? Number((estimatedSmsCount * SMS_COST_PER_MESSAGE).toFixed(2))
      : 0;

  async function sendReminders(simulateOnly: boolean) {
    if (!meReady) {
      setError("Session not detected. Please reload or sign in again.");
      return;
    }

    if (!selectedRows.length) {
      setError("Select at least one student with a phone number before continuing.");
      return;
    }

    setSending(true);
    setError(null);
    setInfo(null);

    try {
      const payload = {
        arrears: selectedRows.map((row) => ({
          invoiceId: row.invoiceId,
        })),
      };

      const endpoint = simulateOnly
        ? "/api/fees/notify-arrears/simulate"
        : "/api/fees/notify-arrears";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = safeJson<NotifySimulateResponse | NotifySendResponse>(
        await res.json().catch(() => null)
      );

      if (!res.ok || !raw?.ok) {
        setError(raw?.error || "Failed to process fee reminders. Please try again.");
        return;
      }

      if (simulateOnly) {
        const result = raw as NotifySimulateResponse;
        const eligible = Number(result.eligibleCount ?? result.total ?? 0);
        const requested = Number(result.requested ?? selectedRows.length);
        const skipped = Number(
          result.skippedCount ?? Math.max(0, requested - eligible)
        );

        setInfo(
          `Simulation complete. ${eligible} reminder(s) are currently eligible; ${skipped} would be skipped. No parent was contacted.`
        );
      } else {
        const result = raw as NotifySendResponse;
        const queued = Number(result.queuedCount ?? 0);
        const alreadyHandled = Number(result.alreadyHandledCount ?? 0);
        const skipped = Number(result.skippedCount ?? 0);
        const blocked = Number(result.blockedCount ?? 0);

        setInfo(
          `Fee reminder request processed. Queued: ${queued}. Already handled today: ${alreadyHandled}. Skipped: ${skipped}. Blocked: ${blocked}. Delivery runs through the background worker.`
        );
      }
    } catch {
      setError("Network or server error while sending reminders.");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">
          Finance Trust Spine
        </div>

        <h1 className="text-2xl font-bold text-[#F7F4ED]">
          Fees Arrears Reminder Centre
        </h1>

        <p className="max-w-3xl text-sm text-[#C9CDD6]">
          Send kind, respectful reminders to families who are behind on fees.
          The amounts shown here are refund-aware and calculated from real finance
          records.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Context
            </div>

            <div className="text-sm text-zinc-800">
              Tenant / School: <span className="font-semibold">{tenantName}</span>
            </div>

            <div className="max-w-xl text-xs text-zinc-600">
              <span className="font-semibold">Guardrail:</span> messages must be
              factual, time-bound, and never shaming.
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs md:text-sm">
            <div className="mb-1 font-semibold text-zinc-700">
              Current template
            </div>

            {loadingTemplate ? (
              <div className="text-xs text-zinc-500">Loading template…</div>
            ) : templateText ? (
              <p className="whitespace-pre-wrap break-words text-xs text-zinc-700">
                {templateText}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                No template loaded. Set one under{" "}
                <span className="font-semibold">
                  Admin → Tools → SMS Templates → Fees Arrears
                </span>
                .
              </p>
            )}

            {templateMeta && (
              <div className="mt-2 text-[11px] text-zinc-500">
                Sender:{" "}
                <span className="font-semibold">
                  {templateMeta.brand || "SENDER"}
                </span>
                {templateMeta.lastUpdatedAt && (
                  <>
                    {" "}
                    • Last updated:{" "}
                    {new Date(templateMeta.lastUpdatedAt).toLocaleString()}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-zinc-900">Arrears overview</span>

              {arrearsSource && (
                <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700">
                  Source: Database
                </span>
              )}
            </div>

            <p className="max-w-xl text-xs text-zinc-500">
              Use the refresh button to reload real invoice, payment, and refund
              records.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={btnOutline}
              onClick={() => void loadArrears()}
              disabled={loadingArrears || !meReady}
            >
              {loadingArrears ? "Refreshing…" : "Refresh from DB"}
            </button>

            <button
              className={btnOutline}
              onClick={selectAllWithPhone}
              disabled={!arrears.length}
            >
              Select all with phone
            </button>

            <button
              className={btnOutline}
              onClick={clearSelection}
              disabled={!selectedInvoiceIds.size}
            >
              Clear selection
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {info && !error && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {info}
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-3 text-xs md:grid-cols-5 md:text-sm">
          <div className="rounded-xl border bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">Invoices shown</div>
            <div className="text-lg font-semibold">{arrears.length}</div>
          </div>

          <div className="rounded-xl border bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">With phone</div>
            <div className="text-lg font-semibold">{withPhoneCount}</div>
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
            <div className="text-red-700">Total arrears</div>
            <div className="text-lg font-semibold text-red-800">
              {formatCedis(totalArrears)}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
            <div className="text-emerald-700">Succeeded refunds</div>
            <div className="text-lg font-semibold text-emerald-800">
              {formatCedis(totalSucceededRefunds)}
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
            <div className="text-amber-700">Pending refunds</div>
            <div className="text-lg font-semibold text-amber-800">
              {formatCedis(totalPendingRefunds)}
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full overflow-hidden rounded-xl border text-sm text-zinc-900">
            <thead className="bg-zinc-50 text-xs text-zinc-700">
              <tr>
                <th className="border-b px-3 py-2 text-left">Select</th>
                <th className="border-b px-3 py-2 text-left">Student</th>
                <th className="border-b px-3 py-2 text-left">Class</th>
                <th className="border-b px-3 py-2 text-left">Term</th>
                <th className="border-b px-3 py-2 text-right">Net paid</th>
                <th className="border-b px-3 py-2 text-right">Refunded</th>
                <th className="border-b px-3 py-2 text-right">Amount due</th>
                <th className="border-b px-3 py-2 text-left">Due date</th>
                <th className="border-b px-3 py-2 text-left">Guardian phone</th>
              </tr>
            </thead>

            <tbody>
              {arrears.map((row, index) => {
                const key = `${row.invoiceId}-${index}`;
                const allowed = hasPhone(row.guardianPhone);
                const selected = allowed && selectedInvoiceIds.has(row.invoiceId);

                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!allowed}
                        onChange={() => toggleSelect(row.invoiceId, allowed)}
                      />
                    </td>

                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{row.studentName}</div>
                      <div className="text-xs text-zinc-500">
                        Invoice ID: {row.invoiceId}
                      </div>
                    </td>

                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {row.className || "—"}
                    </td>

                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {[row.term, row.academicYear].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>

                    <td className="px-3 py-2 text-right align-top text-xs text-zinc-800">
                      {formatCedis(row.netPaid)}
                    </td>

                    <td className="px-3 py-2 text-right align-top text-xs text-emerald-700">
                      {formatCedis(row.succeededRefunds)}
                    </td>

                    <td className="px-3 py-2 text-right align-top text-xs font-semibold text-red-700">
                      {formatCedis(row.amountDue)}
                    </td>

                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {formatDate(row.dueDate)}
                    </td>

                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {allowed ? (
                        row.guardianPhone
                      ) : (
                        <span className="text-red-600">No phone on file</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!arrears.length && !loadingArrears && (
                <tr>
                  <td className="px-3 py-4 text-sm text-zinc-600" colSpan={9}>
                    No arrears to show at the moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-xs text-zinc-500">
            <span className="font-semibold">Guardrail:</span> verify amounts
            before sending real reminders. Refunds already paid are deducted from
            what the family owes.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              className={btnOutline}
              onClick={() => {
                if (!selectedRows.length) {
                  setError("Select at least one student with a phone number before simulating.");
                  return;
                }

                setConfirmSimulateOnly(true);
                setConfirmOpen(true);
              }}
              disabled={sending || !selectedRows.length}
            >
              Simulate, no SMS
            </button>

            <button
              className={btnPrimary}
              onClick={() => {
                if (!selectedRows.length) {
                  setError("Select at least one student with a phone number before sending.");
                  return;
                }

                setConfirmSimulateOnly(false);
                setConfirmOpen(true);
              }}
              disabled={sending || !selectedRows.length}
            >
              Send SMS reminders
            </button>
          </div>
        </div>
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">
              {confirmSimulateOnly
                ? "Run simulation only?"
                : "Confirm queueing SMS reminders?"}
            </h2>

            <p className="break-words text-sm text-zinc-600">
              You are about to{" "}
              {confirmSimulateOnly ? (
                <>
                  <span className="font-semibold">simulate</span>{" "}
                  <span className="font-semibold">{selectedRows.length}</span>{" "}
                  reminder(s) without contacting any parent.
                </>
              ) : (
                <>
                  <span className="font-semibold">queue</span>{" "}
                  <span className="font-semibold">{selectedRows.length}</span>{" "}
                  real reminder(s) using the current template.
                </>
              )}
            </p>

            <p className="text-sm text-zinc-600">
              Maximum estimated SMS units:{" "}
              <span className="font-semibold">{estimatedSmsCount}</span> •
              Maximum estimated cost:{" "}
              <span className="font-semibold">
                GH₵ {estimatedCost.toFixed(2)}
              </span>
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className={btnOutline}
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
              >
                Cancel
              </button>

              <button
                className={confirmSimulateOnly ? btnOutline : btnPrimary}
                onClick={() => void sendReminders(confirmSimulateOnly)}
                disabled={sending}
              >
                {sending
                  ? confirmSimulateOnly
                    ? "Simulating…"
                    : "Queueing…"
                  : confirmSimulateOnly
                    ? "Yes, simulate"
                    : "Yes, queue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}