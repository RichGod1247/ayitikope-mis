//src/app/admin/tools/consent-sms/page.tsx
"use client";

import React, { useState } from "react";

type CampaignResultItem = {
  recipient: string;
  to: string;
  ok: boolean;
  error?: string;
};

type CampaignResponse = {
  ok: boolean;
  mode: "initial" | "full";
  count: number;
  successCount: number;
  results: CampaignResultItem[];
  note?: string;
};

export default function TeacherConsentSmsPage() {
  const [message, setMessage] = useState(
    "EduLife OS teacher consent test – please reply OK when you receive this. – Heh RichGod"
  );
  const [mode, setMode] = useState<"initial" | "full">("initial");
  const [tenantId, setTenantId] = useState("AYITIKOPE-DEV");
  const [brand, setBrand] = useState("EDULIFEOS");
  const [actorId, setActorId] = useState("heh-richgod");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CampaignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/consent/campaign/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          mode,
          tenantId,
          brand,
          actorId,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Request failed with status ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as CampaignResponse;
      setResponse(data);
    } catch (err: any) {
      console.error("Consent SMS error:", err);
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-3xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-1">EduLife OS – Teacher Consent SMS</h1>
        <p className="text-sm text-slate-600 mb-4">
          Send a consent/announcement SMS to your seeded teacher contacts using the Hubtel
          integration.
          <br />
          In <code>SMS_TEST_MODE=true</code>, all messages are actually routed only to your{" "}
          <code>TEST_SMS_TO</code> number for safety.
        </p>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "initial" | "full")}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="initial">Initial (first 5)</option>
                <option value="full">Full (all active contacts)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Tenant ID</label>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Brand</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="EDULIFEOS"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Actor ID (for logs/audit)
              </label>
              <input
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">SMS Message</label>
            <textarea
              className="w-full min-h-[110px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Teacher Consent SMS"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <div className="font-semibold mb-1">Error</div>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
          </div>
        )}

        {response && (
          <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold text-emerald-800">
                  Teacher Consent SMS Result
                </div>
                <div className="text-xs text-emerald-700">
                  Mode: <code>{response.mode}</code> • Recipients: <code>{response.count}</code> •
                  Success: <code>{response.successCount}</code>
                </div>
                {response.note && (
                  <div className="text-[11px] text-emerald-700 mt-1">Note: {response.note}</div>
                )}
              </div>
            </div>

            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {response.results.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between text-xs bg-white rounded-md px-2 py-1 border border-emerald-100"
                >
                  <div>
                    <div className="font-semibold">{r.recipient}</div>
                    <div className="text-slate-600">
                      To: <code>{r.to}</code>
                    </div>
                  </div>
                  <div
                    className={
                      r.ok
                        ? "text-[11px] font-semibold text-emerald-700"
                        : "text-[11px] font-semibold text-rose-700 text-right max-w-[180px]"
                    }
                  >
                    {r.ok ? "OK" : r.error ?? "Failed"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}