"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  id: string;                // scholarship_applications.id (uuid)
  current?: string | null;   // current status to style/disable a bit
};

export default function ScholarshipActions({ id, current }: Props) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function update(status: "accepted" | "rejected" | "reviewed") {
    setErr(null);
    try {
      const r = await fetch("/api/admin/scholarships/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        throw new Error(json?.error || `HTTP ${r.status}`);
      }
      // Refresh the server component so the table shows the new status
      startTransition(() => router.refresh());
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  const base =
    "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition";
  const disabled = isPending ? "opacity-60 pointer-events-none" : "";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => update("accepted")}
        className={`${base} border-green-600 text-green-700 hover:bg-green-50 ${disabled}`}
        aria-label="Accept scholarship"
      >
        Accept
      </button>
      <button
        onClick={() => update("rejected")}
        className={`${base} border-red-600 text-red-700 hover:bg-red-50 ${disabled}`}
        aria-label="Reject scholarship"
      >
        Reject
      </button>
      <button
        onClick={() => update("reviewed")}
        className={`${base} border-gray-500 text-gray-700 hover:bg-gray-50 ${disabled}`}
        aria-label="Mark as reviewed"
      >
        Reviewed
      </button>

      {err && <span className="ml-2 text-xs text-red-600">{err}</span>}
    </div>
  );
}
