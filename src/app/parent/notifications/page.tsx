// src/app/parent/notifications/page.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

type SmsRecord = {
  id: string;
  source: "SmsLog" | "SMSSendAudit";
  phone: string;
  message: string;
  status: string;
  channel: string;
  createdAt: string; // ISO string
};

type SmsHistoryResponse = {
  ok: boolean;
  tenantId?: string;
  guardianPhone?: string;
  count?: number;
  records?: SmsRecord[];
  error?: string;
};

type SmsSummaryMessage = {
  id: string;
  sentAt: string;
  direction: "OUTBOUND" | "INBOUND";
  channel: string;
  status: string;
  category: string;
  textPreview: string;
};

type SmsSummaryResponse = {
  ok: boolean;
  guardianPhone?: string;
  studentId?: string | null;
  messages?: SmsSummaryMessage[];
  note?: string;
  error?: string;
};

export default function ParentNotificationsPage() {
  const searchParams = useSearchParams();
  const initialTenantId = searchParams.get("tenantId") ?? "";

  const [tenantId, setTenantId] = useState<string>(initialTenantId);
  const [guardianPhone, setGuardianPhone] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [records, setRecords] = useState<SmsRecord[]>([]);

  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryMessages, setSummaryMessages] = useState<SmsSummaryMessage[]>(
    []
  );
  const [summaryNote, setSummaryNote] = useState<string | null>(null);

  const canQuery = Boolean(tenantId && guardianPhone.trim().length > 0);

  // -----------------------------
  // Load SMS history from /api/parent/sms/history
  // -----------------------------
  async function handleLoadHistory() {
    if (!canQuery) return;

    setLoading(true);
    setHistoryError(null);
    setRecords([]);

    try {
      const url = new URL(
        "/api/parent/sms/history",
        window.location.origin
      );
      url.searchParams.set("tenantId", tenantId);
      url.searchParams.set("guardianPhone", guardianPhone);
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as SmsHistoryResponse;

      if (!res.ok || !json.ok) {
        setHistoryError(
          json.error ||
            "Unable to load SMS history for this phone number."
        );
        setRecords([]);
        return;
      }

      setRecords(json.records ?? []);
    } catch (err) {
      setHistoryError(
        "Network or server error while loading SMS history. Please try again."
      );
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Load AI-style summary (demo) from /api/parent/sms/summary
  // -----------------------------
  async function handleLoadSummary() {
    if (!guardianPhone.trim()) return;

    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryMessages([]);
    setSummaryNote(null);

    try {
      const url = new URL(
        "/api/parent/sms/summary",
        window.location.origin
      );
      url.searchParams.set("guardianPhone", guardianPhone);

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as SmsSummaryResponse;

      if (!res.ok || !json.ok) {
        setSummaryError(
          json.error ||
            "Unable to load SMS summary for this guardian."
        );
        return;
      }

      setSummaryMessages(json.messages ?? []);
      setSummaryNote(json.note ?? null);
    } catch (err) {
      setSummaryError(
        "Network or server error while loading the SMS summary. Please try again."
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-800">
            EduLife OS · Parent · Notices &amp; SMS
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Notices &amp; SMS log
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              One calm place to see{" "}
              <span className="font-semibold">important messages</span>{" "}
              the school has sent to your phone number — even if SMS
              gets deleted from your device.
            </p>
          </div>
        </header>

        {/* Filters / Form */}
        <section className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-4 md:px-5 md:py-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_auto] gap-3 md:items-end">
            {/* Tenant ID (dev/demo) */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                School (tenant ID)
              </label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs md:text-sm font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Paste tenant ID or use demo"
              />
              <p className="text-[10px] text-zinc-500">
                This is automatically filled when you come from the main
                Parent Portal. For now it uses the demo tenant.
              </p>
            </div>

            {/* Guardian phone */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Your phone number
              </label>
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="e.g. 024xxxxxxx"
              />
              <p className="text-[10px] text-zinc-500">
                Type the same number the school uses to send you SMS
                (no need to add &#34;+233&#34; for now).
              </p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2 md:items-stretch">
              <button
                type="button"
                onClick={handleLoadHistory}
                disabled={!canQuery || loading}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load messages"}
              </button>
              <button
                type="button"
                onClick={handleLoadSummary}
                disabled={!guardianPhone.trim() || summaryLoading}
                className="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-[11px] md:text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                {summaryLoading
                  ? "Summarising…"
                  : "Ask EduLife OS to summarise (demo)"}
              </button>
            </div>
          </div>

          {historyError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {historyError}
            </div>
          )}

          {summaryError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {summaryError}
            </div>
          )}
        </section>

        {/* AI-style summary (demo) */}
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 md:px-5 md:py-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-semibold text-emerald-900">
                EduLife OS summary (demo)
              </h2>
              <p className="text-[11px] md:text-xs text-emerald-900/90">
                In future, this space will give a{" "}
                <span className="font-semibold">
                  simple explanation of recent messages
                </span>{" "}
                in plain language for busy parents.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-900 text-white text-[10px] font-medium px-3 py-1">
              Early demo
            </span>
          </div>

          {summaryMessages.length === 0 && !summaryNote && !summaryLoading && (
            <p className="text-[11px] text-emerald-900/90">
              Tap the{" "}
              <span className="font-semibold">
                &#34;Ask EduLife OS to summarise (demo)&#34;
              </span>{" "}
              button above to see sample messages that will later be generated
              from your real SMS history.
            </p>
          )}

          {summaryNote && (
            <p className="text-[11px] text-emerald-900/90 whitespace-pre-line">
              {summaryNote}
            </p>
          )}

          {summaryMessages.length > 0 && (
            <div className="mt-2 space-y-2">
              {summaryMessages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] text-emerald-950"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                        {m.category}
                      </span>
                      <span className="rounded-full border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-900">
                        {m.channel}
                      </span>
                      <span className="rounded-full border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-900">
                        {m.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-700">
                      {new Date(m.sentAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-950">
                    {m.textPreview}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SMS history list */}
        <section className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-900">
              Detailed SMS log
            </h2>
            <p className="text-[11px] text-zinc-500">
              Messages are matched by your phone number (last digits).
            </p>
          </div>

          <div className="max-h-[480px] overflow-auto">
            {records.length === 0 && !loading ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-500">
                No SMS records found yet for this phone number under this
                school. Once the school sends out notices and reminders
                via EduLife OS, they will appear here for easy reference.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {records.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-800">
                          {r.source}
                        </span>
                        <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700">
                          {r.channel || "SMS"}
                        </span>
                        {r.status && (
                          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700">
                            {r.status}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-800 whitespace-pre-line">
                      {r.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 border-t border-zinc-100 text-[11px] text-zinc-500">
            This view is designed so parents and the school can{" "}
            <span className="font-semibold">
              always agree on what was communicated
            </span>{" "}
            — even months later.
          </div>
        </section>
      </div>
    </main>
  );
}
