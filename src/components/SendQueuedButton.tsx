"use client";

import { useState, useTransition } from "react";

export default function SendQueuedButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function sendOnce() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const json = await r.json();
        if (!r.ok || !json.ok) {
          throw new Error(json?.error || `HTTP ${r.status}`);
        }
        const { processed, results, note } = json;
        const sent = (results || []).filter((x: any) => x.sent).length;
        const failed = (results || []).filter((x: any) => x.sent === false).length;
        setMsg(
          processed
            ? `Processed ${processed}. Sent: ${sent}, Failed: ${failed}.`
            : note || "No queued notifications."
        );
      } catch (e: any) {
        setMsg(`Error: ${String(e?.message || e)}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={sendOnce}
        disabled={isPending}
        className="inline-flex items-center rounded-md border border-sky-600 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60"
      >
        {isPending ? "Sending…" : "Send queued WhatsApp now"}
      </button>
      {msg && <span className="text-xs text-gray-700">{msg}</span>}
    </div>
  );
}
