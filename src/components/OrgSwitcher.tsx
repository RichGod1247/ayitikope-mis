// src/components/OrgSwitcher.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrgSwitcherProps = {
  currentSlug: string | null;
  allTenants: { slug: string; name: string }[];
};

export default function OrgSwitcher({ currentSlug, allTenants }: OrgSwitcherProps) {
  const [value, setValue] = useState(currentSlug || "");
  const router = useRouter();

  async function switchTo(slug: string) {
    setValue(slug);
    const res = await fetch("/api/tenant/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) {
      router.refresh(); // reload server components to pick up the new cookie
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to switch school");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm">School:</label>
      <select
        className="border rounded px-2 py-1"
        value={value}
        onChange={(e) => switchTo(e.target.value)}
      >
        {currentSlug ? null : <option value="">(choose)</option>}
        {allTenants.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.name} ({t.slug})
          </option>
        ))}
      </select>
    </div>
  );
}
