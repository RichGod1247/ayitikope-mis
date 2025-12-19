// src/app/admin/tools/sms-broadcast/page.tsx

"use client";

import { useState } from "react";

type Mode = "initial" | "full";

type BroadcastResult = {
  ok: boolean;
  mode?: Mode;
  brand?: string;
  count?: number;
  successCount?: number;
  results?: {
    recipient: string;
    to: string;
    ok: boolean;
    error?: string;
  }[];
  error?: string;
};

export default function SmsBroadcastPage() {
  const [message, setMessage] = useState(
    "[EduLife OS] This is a test broadcast from Ayitikope M/A Basic School."
  );
  const [mode, setMode] = useState<Mode>("initial");
  const [brand, setBrand] = useState<string>("AYITIADMIN");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/sms/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          mode,
          brand,
        }),
      });

      const data = (await res.json()) as BroadcastResult;
      setResult(data);
    } catch (err: any) {
      setResult({
        ok: false,
        error: err?.message ?? "Unexpected error sending broadcast.",
      });
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !message.trim();

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-3xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-2">
          EduLife OS – SMS Broadcast Console
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Send a one-time SMS broadcast to your configured notification
          contacts. Use <strong>mode = initial</strong> for pilot tests
          (first 5 contacts), and <strong>mode = full</strong> for the
          entire list.
        </p>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Message
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[120px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="[EduLife OS] ..."
            />
            <p className="mt-1 text-xs text-slate-500">
              Keep it short, clear, and respectful. This will be sent as a
              standard SMS through Hubtel.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Mode
              </label>
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="mode"
                    value="initial"
                    checked={mode === "initial"}
                    onChange={() => setMode("initial")}
                  />
                  <span>Initial (pilot 5 contacts)</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="mode"
                    value="full"
                    checked={mode === "full"}
                    onChange={() => setMode("full")}
                  />
                  <span>Full (all active contacts)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Brand / Sender
              </label>
              <select
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="AYITIADMIN">AyitiAdmin (Admin)</option>
                <option value="AYITIKOPJHS">AyitikopJHS (JHS)</option>
                <option value="AYITIKPRIM">AyitikPRIM (Primary)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Choose which Hubtel brand / wallet should be used as the
                sender ID.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={disabled}
            className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm ${
              disabled
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {loading ? "Sending..." : "Send Broadcast SMS"}
          </button>
        </form>

        {result && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              Result
            </h2>

            {!result.ok ? (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                Error: {result.error ?? "Unknown error"}
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                Broadcast sent with{" "}
                <strong>
                  mode = {result.mode} • brand = {result.brand}
                </strong>
                . Success:{" "}
                <strong>
                  {result.successCount}/{result.count}
                </strong>
              </div>
            )}

            {result.results && result.results.length > 0 && (
              <div className="mt-4 max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        Recipient
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        To
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                      >
                        <td className="px-3 py-2 text-slate-700">
                          {r.recipient}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <code>{r.to || "—"}</code>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {r.ok ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              Failed
                            </span>
                          )}
                          {r.error && (
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              {r.error}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          <p>
            All messages sent here are also logged in{" "}
            <code>SmsLog</code> and visible in{" "}
            <code>/admin/tools/sms-logs</code>. In future sprints we can
            add templates, segments (parents vs teachers), and scheduling.
          </p>
        </div>
      </div>
    </main>
  );
}
