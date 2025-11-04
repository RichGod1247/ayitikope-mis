// src/app/app/tools/switch/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function switchTenant(slug: string) {
  const res = await fetch("/api/tenant/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Failed to switch");
  }
  return res.json();
}

export default function SwitchTenantTools() {
  const [status, setStatus] = useState<string>("idle");
  const router = useRouter();

  async function handle(slug: string) {
    try {
      setStatus(`Switching to ${slug}…`);
      await switchTenant(slug);
      setStatus(`Switched to ${slug}. Refreshing…`);
      router.refresh();
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
    }
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Tenant Switch (Temporary Tool)</h1>
      <div className="flex gap-3">
        <button
          className="rounded bg-black/80 text-white px-4 py-2"
          onClick={() => handle("sogakope-basic")}
        >
          Switch to Sogakope
        </button>
        <button
          className="rounded bg-black/80 text-white px-4 py-2"
          onClick={() => handle("ayitikope-basic")}
        >
          Switch to Ayitikope
        </button>
      </div>
      <p className="text-sm">{status}</p>
      <p className="text-xs text-gray-500">
        You can remove this page after testing: <code>/app/tools/switch</code>
      </p>
    </main>
  );
}
