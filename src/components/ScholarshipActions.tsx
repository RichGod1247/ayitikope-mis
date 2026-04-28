"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ScholarshipApplicationStatus } from "@prisma/client";

type Props = {
  id: string;
  current?: ScholarshipApplicationStatus | null;
};

export default function ScholarshipActions({ id, current }: Props) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function update(status: ScholarshipApplicationStatus) {
    setErr(null);
    try {
      const r = await fetch("/api/admin/scholarships/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const base = "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition";
  const dim = isPending ? "opacity-60 pointer-events-none" : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => update("APPROVED")}
        disabled={isPending || current === "APPROVED"}
        className={`${base} border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-40 ${dim}`}
      >
        Approve
      </button>
      <button
        onClick={() => update("REJECTED")}
        disabled={isPending || current === "REJECTED"}
        className={`${base} border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-40 ${dim}`}
      >
        Reject
      </button>
      <button
        onClick={() => update("REVIEWED")}
        disabled={isPending || current === "REVIEWED"}
        className={`${base} border-gray-500 text-gray-700 hover:bg-gray-50 disabled:opacity-40 ${dim}`}
      >
        Mark Reviewed
      </button>
      {err && <span className="ml-1 text-xs text-red-600">{err}</span>}
    </div>
  );
}
