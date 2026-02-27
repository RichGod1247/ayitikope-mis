// src/components/OrgSwitcher.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type TenantOption = {
  id: string;
  slug: string;
  name: string;
};

type OrgSwitcherProps = {
  currentTenantId: string | null;
  allTenants: TenantOption[];
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

export default function OrgSwitcher({ currentTenantId, allTenants }: OrgSwitcherProps) {
  const router = useRouter();
  const { update } = useSession();

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: TenantOption[] = [];

    for (const t of allTenants ?? []) {
      const id = cleanStr((t as any).id);
      const slug = cleanStr((t as any).slug);
      const name = cleanStr((t as any).name) || slug || id;

      if (!id || seen.has(id)) continue;
      seen.add(id);

      out.push({ id, slug, name });
    }

    // Sort by name but keep current tenant (if any) at top
    out.sort((a, b) => {
      const aIsCur = currentTenantId && a.id === currentTenantId;
      const bIsCur = currentTenantId && b.id === currentTenantId;
      if (aIsCur && !bIsCur) return -1;
      if (!aIsCur && bIsCur) return 1;
      return a.name.localeCompare(b.name);
    });

    return out;
  }, [allTenants, currentTenantId]);

  const [value, setValue] = useState(currentTenantId || "");

  useEffect(() => {
    setValue(currentTenantId || "");
  }, [currentTenantId]);

  async function switchTo(tenantIdRaw: string) {
    const tenantId = cleanStr(tenantIdRaw);

    if (!tenantId) {
      setValue("");
      return;
    }

    if (tenantId === (currentTenantId || "")) {
      setValue(tenantId);
      return;
    }

    setValue(tenantId);

    try {
      // ✅ triggers jwt({ trigger:"update", session }) → membership-verified server-side
      await update({ tenantId });
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Failed to switch school";
      alert(msg);
      // revert UI selection
      setValue(currentTenantId || "");
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
        {currentTenantId ? null : <option value="">(choose)</option>}
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.slug})
          </option>
        ))}
      </select>
    </div>
  );
}
