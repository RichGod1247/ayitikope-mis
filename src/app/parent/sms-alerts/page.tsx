// src/app/parent/sms-alerts/page.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type SmsRecord = {
  id: string;
  source: "SmsLog" | "SMSSendAudit";
  phone: string;
  message: string;
  status: string;
  channel: string;
  createdAt: string;
  raw: any;
};

type SmsHistoryResponse =
  | {
      ok: true;
      tenantId: string;
      guardianPhone: string;
      count: number;
      records: SmsRecord[];
    }
  | {
      ok: false;
      error: string;
    };

type FetchState = "idle" | "loading" | "loaded" | "error";

function ParentSmsAlertsInner() {
  const searchParams = useSearchParams();

  const tenantId = searchParams.get("tenantId") ?? "";
  const guardianPhone = searchParams.get("guardianPhone") ?? "";

  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<SmsRecord[]>([]);

  useEffect(() => {
    async function load() {
      if (!tenantId || !guardianPhone) {
        setFetchState("idle");
        return;
      }

      try {
        setFetchState("loading");
        setErrorMessage(null);

        const params = new URLSearchParams({
          tenantId,
          guardianPhone,
          limit: "30",
        });

        const res = await fetch(`/api/parent/sms/history?${params.toString()}`);

        const text = await res.text();
        let json: SmsHistoryResponse;

        try {
          json = JSON.parse(text) as SmsHistoryResponse;
        } catch {
          console.error("[ParentSmsAlertsPage] Failed to parse JSON:", text);
          setFetchState("error");
          setErrorMessage("Server returned an invalid response. Please try again later.");
          return;
        }

        if (!res.ok || !("ok" in json) || json.ok === false) {
          const msg =
            "error" in json && typeof json.error === "string"
              ? json.error
              : `Server error (HTTP ${res.status}).`;
          console.error("[ParentSmsAlertsPage] HTTP error:", res.status, msg);
          setFetchState("error");
          setErrorMessage(msg);
          return;
        }

        setRecords(json.records);
        setFetchState("loaded");
      } catch (err) {
        console.error("[ParentSmsAlertsPage] Error loading SMS history", err);
        setFetchState("error");
        setErrorMessage("Something went wrong while loading your SMS alerts. Please try again.");
      }
    }

    void load();
  }, [tenantId, guardianPhone]);

  const hasParams = tenantId && guardianPhone;
  const hasRecords = records.length > 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">SMS Alerts</h1>
            <p className="mt-1 text-sm text-slate-600">
              A simple list of recent SMS messages sent to your phone from the school. This helps you track fee reminders,
              attendance alerts, and health notifications.
            </p>
          </div>

          {guardianPhone && (
            <div className="text-right text-xs text-slate-500 space-y-1">
              <div>
                Phone: <span className="font-semibold">{guardianPhone}</span>
              </div>
              <div>
                Tenant: <span className="font-mono text-[11px]">{tenantId || "—"}</span>
              </div>
            </div>
          )}
        </header>

        {!hasParams && (
          <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-xs sm:text-sm text-slate-600">
            <p>
              To view your SMS alerts, open this page with your <span className="font-semibold">tenantId</span> and{" "}
              <span className="font-semibold">guardianPhone</span> in the URL, for example:
            </p>
            <pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-50">
{`/parent/sms-alerts?tenantId=cmhhnghn00008vcpgp3fl07fl
&guardianPhone=0240000000`}
            </pre>
            <p className="mt-2 text-[11px] text-slate-500">
              Later, this page will be opened automatically from your parent dashboard, so you won&apos;t need to copy links
              yourself.
            </p>
          </section>
        )}

        {hasParams && fetchState === "error" && errorMessage && (
          <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700">
            {errorMessage}
          </section>
        )}

        {hasParams && fetchState === "loading" && (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm text-slate-600">
            Loading your SMS alerts…
          </section>
        )}

        {hasParams && fetchState === "loaded" && (
          <section className="mt-4 space-y-4">
            {!hasRecords ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-xs sm:text-sm text-slate-600">
                No SMS alerts found for this phone yet. Once the school starts sending fee reminders or health alerts, they
                will appear here.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Recent SMS alerts</h2>
                <p className="mt-1 text-xs text-slate-600">The most recent messages appear at the top.</p>

                <div className="mt-3 max-h-[420px] overflow-auto space-y-2">
                  {records.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500">{new Date(r.createdAt).toLocaleString()}</div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">{r.source}</span>
                          {r.channel && (
                            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">{r.channel}</span>
                          )}
                          {r.status && (
                            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">{r.status}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-slate-900">
                        {r.message || <span className="text-slate-500">(No message text available)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
              <div className="mb-1 font-semibold">Developer debug (raw SMS records – can be removed later)</div>
              <pre className="max-h-56 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-50">
                {JSON.stringify(records, null, 2)}
              </pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function ParentSmsAlertsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Loading SMS alerts…</p>
            </div>
          </div>
        </main>
      }
    >
      <ParentSmsAlertsInner />
    </Suspense>
  );
}
