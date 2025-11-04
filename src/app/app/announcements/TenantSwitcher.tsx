// src/app/app/announcements/TenantSwitcher.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TENANTS = [
  { slug: "ayitikope-basic", label: "Ayitikope M/A Basic School" },
  { slug: "sogakope-basic", label: "Sogakope M/A Basic School" },
];

export default function TenantSwitcher({
  currentSlug,
}: {
  currentSlug: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(currentSlug ?? "");

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelected(val);
    if (!val) return;

    try {
      setBusy(true);
      const res = await fetch(`/api/debug-tenant/set?slug=${encodeURIComponent(val)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to set tenant cookie");
        return;
      }
      router.refresh(); // reload server components with new cookie
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600">Tenant:</label>
      <select
        className="border rounded px-2 py-1"
        value={selected}
        onChange={onChange}
        disabled={busy}
      >
        <option value="">Select tenant…</option>
        {TENANTS.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
      {busy && <span className="text-xs text-gray-500">Switching…</span>}
    </div>
  );
}
