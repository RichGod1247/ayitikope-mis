"use client";

import React, { useState } from "react";

type SmsTestResult = {
  recipient: string;
  to: string;
  ok: boolean;
  error?: string;
};

type SmsTestResponse = {
  ok: boolean;
  mode: string;
  count: number;
  results: SmsTestResult[];
};

export default function SmsDebugPage() {
  const [message, setMessage] = useState(
    "EduLife OS live test 🚀 – Ayitikope control tower."
  );
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SmsTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/debug/sms-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Request failed with status ${res.status}: ${text.slice(0, 200)}`
        );
      }

      const data = (await res.json()) as SmsTestResponse;
      setResponse(data);
    } catch (err: any) {
      console.error("SMS test error:", err);
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-2xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-2">
          EduLife OS – SMS Debug Console
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          This tool sends a test SMS using <code>/api/debug/sms-test</code>.
          <br />
          In <span className="font-semibold">initial</span> mode, the backend
          targets the first 5 notification contacts, but in{" "}
          <span className="font-semibold">SMS_TEST_MODE</span> it actually
          routes all messages to your configured{" "}
          <code>TEST_SMS_TO</code> number for safety.
        </p>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Test SMS message
            </label>
            <textarea
              className="w-full min-h-[90px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Test SMS"}
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
                  SMS Test Result
                </div>
                <div className="text-xs text-emerald-700">
                  Mode: <code>{response.mode}</code> • Recipients:{" "}
                  <code>{response.count}</code>
                </div>
              </div>
            </div>

            <div className="mt-2 space-y-1">
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
