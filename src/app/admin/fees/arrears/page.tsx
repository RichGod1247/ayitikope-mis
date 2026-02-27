// src/app/admin/fees/arrears/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type MeResponse =
  | { ok: true; tenantId: string; tenant?: { name?: string | null } | null }
  | { ok: false; error?: string };

type ArrearsRow = {
  invoiceId: string;
  studentName: string;
  guardianPhone: string | null;
  amountDue: number;
  className: string | null;
  term: string | null;
  dueDate: string | null;
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
  skippedNoPhone?: number;
  error?: string;
};

type NotifySendResponse = {
  ok: boolean;
  total?: number;
  attempted?: number;
  successCount?: number;
  sent?: number;
  brand?: string;
  from?: string;
  error?: string;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

const SMS_COST_PER_MESSAGE = 0.03; // estimate only

function hasPhone(v: string | null) {
  return !!v && v.trim().length > 0;
}

function safeJson<T>(v: unknown): T | null {
  if (!v || typeof v !== "object") return null;
  return v as T;
}

export default function FeesArrearsPage() {
  const [meReady, setMeReady] = useState(false);
  const [tenantName, setTenantName] = useState("School");

  const [arrears, setArrears] = useState<ArrearsRow[]>([]);
  const [loadingArrears, setLoadingArrears] = useState(false);
  const [arrearsSource, setArrearsSource] = useState<"sample" | "database" | null>(null);

  const [templateText, setTemplateText] = useState<string>("");
  const [templateMeta, setTemplateMeta] = useState<FeesTemplateMeta | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(() => new Set());

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSimulateOnly, setConfirmSimulateOnly] = useState(false);

  // Tenant context from /api/me (session-scoped)
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store", signal: ac.signal });
        const j = safeJson<MeResponse>(await r.json().catch(() => null));

        if (!r.ok || !j || (j as any).ok !== true) {
          setError("Could not load tenant context. Please sign in again.");
          return;
        }

        const ok = j as Extract<MeResponse, { ok: true }>;
        setTenantName(ok.tenant?.name || "School");
        setMeReady(true);
      } catch {
        if (!ac.signal.aborted) setError("Failed to load tenant context.");
      }
    })();

    return () => ac.abort();
  }, []);

  async function loadTemplate() {
    setLoadingTemplate(true);
    setError(null);

    try {
      // Server infers tenant from session; no tenantId query param.
      const r = await fetch("/api/admin/sms/templates/fees-arrears", { cache: "no-store" });
      const j = safeJson<FeesTemplateResponse>(await r.json().catch(() => null));

      if (!r.ok || !j || !j.ok) {
        setTemplateText("");
        setTemplateMeta(null);
        setError(j?.error || "Failed to load fees arrears SMS template.");
        return;
      }

      setTemplateText(j.template || "");
      setTemplateMeta(j.meta || null);
    } catch {
      setTemplateText("");
      setTemplateMeta(null);
      setError("Network or server error while loading fees arrears SMS template.");
    } finally {
      setLoadingTemplate(false);
    }
  }

  async function loadArrears() {
    setLoadingArrears(true);
    setError(null);
    setInfo(null);
    setSelectedInvoiceIds(new Set());

    try {
      // Server infers tenant from session; no tenantId query param.
      const r = await fetch("/api/admin/fees/arrears/list", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setArrears([]);
        setArrearsSource(null);
        setError(j?.error || "Internal error loading arrears. Please try again.");
        return;
      }

      const items = (j.items || []) as ArrearsRow[];
      setArrears(items);
      setArrearsSource(j.source === "db" ? "database" : "sample");

      if (!items.length) {
        setInfo("No current unpaid invoices were found.");
      } else if (j.source !== "db") {
        setInfo("Using safe sample arrears for preview only. No real parents will be contacted.");
      }
    } catch {
      setArrears([]);
      setArrearsSource(null);
      setError("Network or server error while loading arrears.");
    } finally {
      setLoadingArrears(false);
    }
  }

  useEffect(() => {
    if (meReady) {
      loadTemplate();
      loadArrears();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meReady]);

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
    for (const a of arrears) if (hasPhone(a.guardianPhone)) next.add(a.invoiceId);
    setSelectedInvoiceIds(next);
  }

  function clearSelection() {
    setSelectedInvoiceIds(new Set());
  }

  const selectedRows = useMemo(() => {
    if (!selectedInvoiceIds.size) return [];
    return arrears.filter((a) => selectedInvoiceIds.has(a.invoiceId) && hasPhone(a.guardianPhone));
  }, [arrears, selectedInvoiceIds]);

  const withPhoneCount = useMemo(() => arrears.filter((a) => hasPhone(a.guardianPhone)).length, [arrears]);

  const estimatedSmsCount = selectedRows.length;
  const estimatedCost = estimatedSmsCount > 0 ? Number((estimatedSmsCount * SMS_COST_PER_MESSAGE).toFixed(2)) : 0;

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
        arrears: selectedRows.map((a) => ({
          invoiceId: a.invoiceId,
          studentName: a.studentName,
          guardianPhone: a.guardianPhone,
          amountDue: a.amountDue,
          className: a.className,
          term: a.term,
          dueDate: a.dueDate,
        })),
      };

      const endpoint = simulateOnly ? "/api/fees/notify-arrears/simulate" : "/api/fees/notify-arrears";

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await r.json().catch(() => ({}));

      if (!r.ok || !raw?.ok) {
        setError(raw?.error || "Failed to process fee reminders. Please try again.");
        return;
      }

      if (simulateOnly) {
        const j = raw as NotifySimulateResponse;
        const total = Number(j.total ?? 0);
        setInfo(`Simulation complete. ${total} reminder(s) would have been sent. No parent was contacted.`);
      } else {
        const j = raw as NotifySendResponse;
        const success = Number(j.successCount ?? j.sent ?? 0);
        const total = Number(j.total ?? j.attempted ?? selectedRows.length);
        setInfo(`Fee reminder request processed. Success (reported): ${success}/${total}.`);
      }
    } catch {
      setError("Network or server error while sending reminders.");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees – Gentle Arrears Reminder Centre</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Send kind, respectful reminders to families who are behind on fees. Clarity, not shame.
        </p>
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Context</div>
            <div className="text-sm">
              Tenant / School: <span className="font-semibold">{tenantName}</span>
            </div>
            <div className="text-xs text-zinc-600 max-w-xl">
              <span className="font-semibold">Guardrail:</span> messages must be factual, time-bound, never shaming.
            </div>
          </div>

          <div className="space-y-2 text-xs md:text-sm">
            <div className="border rounded-xl p-3 bg-zinc-50">
              <div className="font-semibold text-zinc-700 mb-1">Current template (read-only here)</div>
              {loadingTemplate ? (
                <div className="text-xs text-zinc-500">Loading template…</div>
              ) : templateText ? (
                <p className="text-xs text-zinc-700 whitespace-pre-wrap break-words">{templateText}</p>
              ) : (
                <p className="text-xs text-zinc-500">
                  No template loaded. Set one under <span className="font-semibold">Admin → Tools → SMS Templates → Fees Arrears</span>.
                </p>
              )}

              {templateMeta && (
                <div className="mt-2 text-[11px] text-zinc-500">
                  Sender: <span className="font-semibold">{templateMeta.brand || "SENDER"}</span>
                  {templateMeta.lastUpdatedAt && <> • Last updated: {new Date(templateMeta.lastUpdatedAt).toLocaleString()}</>}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Arrears overview</span>
              {arrearsSource && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-zinc-50 text-zinc-700">
                  Source: {arrearsSource === "database" ? "Database" : "Sample"}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 max-w-xl">
              Use “Refresh from DB” for real invoices. Sample is safe for testing without contacting parents.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={btnOutline} onClick={() => loadArrears()} disabled={loadingArrears || !meReady}>
              {loadingArrears ? "Refreshing…" : "Refresh from DB"}
            </button>
            <button className={btnOutline} onClick={selectAllWithPhone} disabled={!arrears.length}>
              Select all with phone
            </button>
            <button className={btnOutline} onClick={clearSelection} disabled={!selectedInvoiceIds.size}>
              Clear selection
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
        {info && !error && <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">{info}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-sm mt-2">
          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
            <div className="text-zinc-500">Total invoices shown</div>
            <div className="text-lg font-semibold">{arrears.length}</div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
            <div className="text-zinc-500">With phone on file</div>
            <div className="text-lg font-semibold">{withPhoneCount}</div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-amber-50 border-amber-100">
            <div className="text-amber-700">Selected for reminder</div>
            <div className="text-lg font-semibold text-amber-800">{selectedRows.length}</div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-emerald-50 border-emerald-100">
            <div className="text-emerald-700">Est. SMS cost (guidance)</div>
            <div className="text-lg font-semibold text-emerald-800">GH₵ {estimatedCost.toFixed(2)}</div>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="min-w-full text-sm border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">Select</th>
                <th className="px-3 py-2 text-left border-b">Student</th>
                <th className="px-3 py-2 text-left border-b">Class</th>
                <th className="px-3 py-2 text-left border-b">Term</th>
                <th className="px-3 py-2 text-left border-b">Amount Due</th>
                <th className="px-3 py-2 text-left border-b">Due Date</th>
                <th className="px-3 py-2 text-left border-b">Guardian Phone</th>
              </tr>
            </thead>
            <tbody>
              {arrears.map((a, idx) => {
                const key = `${a.invoiceId}-${idx}`;
                const allowed = hasPhone(a.guardianPhone);
                const selected = allowed && selectedInvoiceIds.has(a.invoiceId);

                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <input type="checkbox" checked={selected} disabled={!allowed} onChange={() => toggleSelect(a.invoiceId, allowed)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{a.studentName}</div>
                      <div className="text-xs text-zinc-500">Invoice ID: {a.invoiceId}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{a.className || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{a.term || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-800">{a.amountDue.toFixed(2)}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{a.dueDate || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {allowed ? a.guardianPhone : <span className="text-red-600">No phone on file</span>}
                    </td>
                  </tr>
                );
              })}

              {!arrears.length && !loadingArrears && (
                <tr>
                  <td className="px-3 py-4 text-sm text-zinc-600" colSpan={7}>
                    No arrears to show at the moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-xs text-zinc-500 max-w-xl">
            <span className="font-semibold">Guardrail:</span> verify amounts and due dates before sending real reminders.
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
              Simulate (no SMS)
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 className="text-lg font-semibold">{confirmSimulateOnly ? "Run a simulation only?" : "Confirm sending SMS reminders?"}</h2>

            <p className="text-sm text-zinc-600 break-words">
              You are about to{" "}
              {confirmSimulateOnly ? (
                <>
                  <span className="font-semibold">simulate</span> sending <span className="font-semibold">{selectedRows.length}</span> reminder(s) without contacting any parent.
                </>
              ) : (
                <>
                  <span className="font-semibold">send</span> <span className="font-semibold">{selectedRows.length}</span> real reminder(s) using the current template.
                </>
              )}
            </p>

            <p className="text-sm text-zinc-600">
              Estimated SMS units: <span className="font-semibold">{estimatedSmsCount}</span> • Estimated cost:{" "}
              <span className="font-semibold">GH₵ {estimatedCost.toFixed(2)}</span>
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button className={btnOutline} onClick={() => setConfirmOpen(false)} disabled={sending}>
                Cancel
              </button>
              <button className={confirmSimulateOnly ? btnOutline : btnPrimary} onClick={() => sendReminders(confirmSimulateOnly)} disabled={sending}>
                {sending ? (confirmSimulateOnly ? "Simulating…" : "Sending…") : confirmSimulateOnly ? "Yes, simulate" : "Yes, send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
