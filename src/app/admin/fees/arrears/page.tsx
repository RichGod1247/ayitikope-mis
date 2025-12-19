// src/app/admin/fees/arrears/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnDanger = `${btnBase} bg-red-600 text-white border-red-600 hover:bg-red-700`;

const SMS_COST_PER_MESSAGE = 0.03; // Ghana cedi estimate per SMS unit (for mental model only)

export default function FeesArrearsPage() {
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("School");

  const [arrears, setArrears] = useState<ArrearsRow[]>([]);
  const [loadingArrears, setLoadingArrears] = useState(false);
  const [arrearsSource, setArrearsSource] = useState<
    "sample" | "database" | null
  >(null);

  const [templateText, setTemplateText] = useState<string>("");
  const [templateMeta, setTemplateMeta] = useState<FeesTemplateMeta | null>(
    null
  );
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    () => new Set()
  );

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSimulateOnly, setConfirmSimulateOnly] = useState(false);

  // --------------------------
  // Load tenant (shared helper)
  // --------------------------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];
        if (t?.id) {
          setTenantId(t.id);
          setTenantName(t.name || "School");
        } else {
          setError(
            "Could not determine default tenant. Please configure tenants first."
          );
        }
      } catch {
        setError("Failed to load default tenant.");
      }
    })();
  }, []);

  // --------------------------
  // Load template from API
  // --------------------------
  async function loadTemplate(tid: string) {
    if (!tid) return;
    setLoadingTemplate(true);
    try {
      const r = await fetch(
        `/api/admin/sms/templates/fees-arrears?tenantId=${encodeURIComponent(
          tid
        )}`
      );
      const j = (await r.json().catch(() => ({}))) as FeesTemplateResponse;

      if (!r.ok || !j.ok) {
        setTemplateText("");
        setTemplateMeta(null);
        setError(
          j?.error ||
            "Failed to load fees arrears SMS template. Please contact admin."
        );
        return;
      }

      setTemplateText(j.template || "");
      setTemplateMeta(j.meta || null);
    } catch {
      setError(
        "Network or server error while loading fees arrears SMS template."
      );
      setTemplateText("");
      setTemplateMeta(null);
    } finally {
      setLoadingTemplate(false);
    }
  }

  // --------------------------
  // Load arrears list (DB or sample)
  // --------------------------
  async function loadArrears(tid: string) {
    if (!tid) return;
    setLoadingArrears(true);
    setError(null);
    setInfo(null);
    setSelectedInvoiceIds(new Set());

    try {
      const r = await fetch(
        `/api/admin/fees/arrears/list?tenantId=${encodeURIComponent(tid)}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setArrears([]);
        setArrearsSource(null);
        setError(
          j?.error ||
            "Internal error loading arrears from database. Please try again or contact the system administrator."
        );
        return;
      }

      const items = (j.items || []) as ArrearsRow[];
      setArrears(items);
      setArrearsSource(j.source === "db" ? "database" : "sample");

      if (!items.length) {
        setInfo(
          "No current unpaid invoices were found. This usually means no one is owing at the moment. 🙏"
        );
      } else if (j.source !== "db") {
        setInfo(
          "Using safe sample arrears for preview only. No real parents will be contacted from this sample."
        );
      }
    } catch {
      setArrears([]);
      setArrearsSource(null);
      setError(
        "Network or server error while loading arrears. Please check your connection."
      );
    } finally {
      setLoadingArrears(false);
    }
  }

  // --------------------------
  // Auto-load when tenant is known
  // --------------------------
  useEffect(() => {
    if (tenantId) {
      loadTemplate(tenantId);
      loadArrears(tenantId);
    }
  }, [tenantId]);

  // --------------------------
  // Selection helpers
  // --------------------------
  function toggleSelect(invoiceId: string) {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function selectAllWithPhone() {
    const next = new Set<string>();
    for (const a of arrears) {
      if (a.guardianPhone && a.guardianPhone.trim().length > 0) {
        next.add(a.invoiceId);
      }
    }
    setSelectedInvoiceIds(next);
  }

  function clearSelection() {
    setSelectedInvoiceIds(new Set());
  }

  const selectedRows = useMemo(() => {
    if (!selectedInvoiceIds.size) return [];
    return arrears.filter((a) => selectedInvoiceIds.has(a.invoiceId));
  }, [arrears, selectedInvoiceIds]);

  const estimatedSmsCount = selectedRows.length;
  const estimatedCost =
    estimatedSmsCount > 0
      ? Number((estimatedSmsCount * SMS_COST_PER_MESSAGE).toFixed(2))
      : 0;

  // --------------------------
  // Send / simulate reminders
  // --------------------------
  async function sendReminders(simulateOnly: boolean) {
    if (!tenantId) {
      setError("Tenant not detected. Please reload the page.");
      return;
    }
    if (!selectedRows.length) {
      setError(
        "Please select at least one student with a phone number before sending reminders."
      );
      return;
    }

    setSending(true);
    setError(null);
    setInfo(null);

    try {
      const payload = {
        tenantId,
        arrears: selectedRows.map((a) => ({
          invoiceId: a.invoiceId,
          studentName: a.studentName,
          guardianPhone: a.guardianPhone,
          amountDue: a.amountDue,
          className: a.className,
          term: a.term,
          dueDate: a.dueDate,
        })),
        simulateOnly,
      };

      // 🔑 Key change: simulation goes to a *different* endpoint
      const endpoint = simulateOnly
        ? "/api/fees/notify-arrears/simulate"
        : "/api/fees/notify-arrears";

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setError(
          j?.error ||
            "Failed to send fee reminders. Please try again or contact the system administrator."
        );
        return;
      }

      if (simulateOnly) {
        setInfo(
          `Simulation complete. ${j.total} reminder(s) would have been sent. No parent was actually contacted.`
        );
      } else {
        const success = j.successCount ?? 0;
        setInfo(
          `Fee reminder request processed via ${
            j.brand || "school sender"
          }. Success (reported): ${success}/${j.total}. Please confirm details under Admin → Tools → SMS Logs.`
        );
      }
    } catch {
      setError(
        "Network or server error while sending reminders. Please check your connection."
      );
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  // --------------------------
  // UI
  // --------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          Fees – Gentle Arrears Reminder Centre
        </h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          This page helps the school send{" "}
          <span className="font-semibold">kind, respectful reminders</span> to
          families who are behind on fees. The goal is{" "}
          <span className="font-semibold">
            clarity, not fear or embarrassment
          </span>
          . No penalties are triggered from here — only information.
        </p>
      </header>

      {/* Context + template summary */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Context
            </div>
            <div className="text-sm">
              Tenant / School:{" "}
              <span className="font-semibold">{tenantName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 max-w-xl wrap-break-word">
              <span className="font-semibold">Ethics guardrail:</span> This
              system is designed to{" "}
              <span className="font-semibold">
                protect parents and teachers from pressure
              </span>
              . Messages are clear, time-bound, and never shaming.
            </div>
          </div>

          <div className="space-y-2 text-xs md:text-sm">
            <div className="border rounded-xl p-3 bg-zinc-50">
              <div className="font-semibold text-zinc-700 mb-1">
                Current template (read-only here)
              </div>
              {loadingTemplate ? (
                <div className="text-xs text-zinc-500">Loading template…</div>
              ) : templateText ? (
                <p className="text-xs text-zinc-700 whitespace-pre-wrap wrap-break-word">
                  {templateText}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  No template loaded. Please set one under{" "}
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
                      {templateMeta.brand || "AYITIADMIN"}
                    </span>
                  {templateMeta.lastUpdatedAt && (
                    <>
                      {" "}
                      • Last updated:{" "}
                      {new Date(
                        templateMeta.lastUpdatedAt
                      ).toLocaleString()}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Arrears + controls */}
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
            <p className="text-xs text-zinc-500 max-w-xl wrap-break-word">
              Use{" "}
              <span className="font-semibold">
                “Refresh from DB” for real invoices
              </span>
              . Sample data is for testing the flow without contacting real
              parents.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={btnOutline}
              onClick={() => tenantId && loadArrears(tenantId)}
              disabled={loadingArrears || !tenantId}
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
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {info && !error && (
          <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
            {info}
          </div>
        )}

        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-sm mt-2">
          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
            <div className="text-zinc-500">Total invoices shown</div>
            <div className="text-lg font-semibold">{arrears.length}</div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
            <div className="text-zinc-500">With phone on file</div>
            <div className="text-lg font-semibold">
              {
                arrears.filter(
                  (a) => a.guardianPhone && a.guardianPhone.trim().length > 0
                ).length
              }
            </div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-amber-50 border-amber-100">
            <div className="text-amber-700">Selected for reminder</div>
            <div className="text-lg font-semibold text-amber-800">
              {selectedRows.length}
            </div>
          </div>
          <div className="border rounded-xl px-3 py-2 bg-emerald-50 border-emerald-100">
            <div className="text-emerald-700">Est. SMS cost (guidance)</div>
            <div className="text-lg font-semibold text-emerald-800">
              GH₵ {estimatedCost.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Table */}
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
                const selected = selectedInvoiceIds.has(a.invoiceId);
                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(a.invoiceId)}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{a.studentName}</div>
                      <div className="text-xs text-zinc-500">
                        Invoice ID: {a.invoiceId}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {a.className || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {a.term || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-800">
                      {typeof a.amountDue === "number"
                        ? a.amountDue.toFixed(2)
                        : a.amountDue || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {a.dueDate || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {a.guardianPhone ? (
                        a.guardianPhone
                      ) : (
                        <span className="text-red-600">No phone on file</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!arrears.length && !loadingArrears && (
                <tr>
                  <td
                    className="px-3 py-4 text-sm text-zinc-600"
                    colSpan={7}
                  >
                    No arrears to show at the moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-xs text-zinc-500 max-w-xl wrap-break-word">
            <span className="font-semibold">Guardrail:</span> Before sending
            real reminders, always ensure amounts and due dates are accurate.
            This protects families from surprise messages and keeps trust high.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              className={btnOutline}
              onClick={() => {
                if (!selectedRows.length) {
                  setError(
                    "Select at least one student with a phone number before running a simulation."
                  );
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
                  setError(
                    "Select at least one student with a phone number before sending reminders."
                  );
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

      {/* Confirmation overlay */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 className="text-lg font-semibold">
              {confirmSimulateOnly
                ? "Run a simulation only?"
                : "Confirm sending SMS reminders?"}
            </h2>
            <p className="text-sm text-zinc-600 wrap-break-word">
              You are about to{" "}
              {confirmSimulateOnly ? (
                <>
                  <span className="font-semibold">
                    simulate sending {selectedRows.length} reminder(s)
                  </span>{" "}
                  without contacting any parent.
                </>
              ) : (
                <>
                  send{" "}
                  <span className="font-semibold">
                    {selectedRows.length} real reminder(s)
                  </span>{" "}
                  using the current template and school sender ID.
                </>
              )}
            </p>
            <p className="text-sm text-zinc-600">
              Estimated SMS units:{" "}
              <span className="font-semibold">{estimatedSmsCount}</span> •
              Estimated cost:{" "}
              <span className="font-semibold">
                GH₵ {estimatedCost.toFixed(2)}
              </span>
            </p>
            <p className="text-xs text-zinc-500 wrap-break-word">
              This is a{" "}
              <span className="font-semibold">service message</span>, not a
              threat. Parents should feel informed, not attacked.
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
                onClick={() => sendReminders(confirmSimulateOnly)}
                disabled={sending}
              >
                {sending
                  ? confirmSimulateOnly
                    ? "Simulating…"
                    : "Sending…"
                  : confirmSimulateOnly
                  ? "Yes, simulate only"
                  : "Yes, send now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
