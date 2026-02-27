// src/app/app/announcements/TenantSwitcher.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type TenantRow = {
  tenantId: string;
  slug: string;
  name: string;
  schoolCode: string | null;
  roleName: string | null;
};

export default function TenantSwitcher({ currentSlug }: { currentSlug: string | null }) {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const currentTenantId = (session?.user as any)?.tenantId ? String((session?.user as any).tenantId) : "";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        const res = await fetch("/api/tenants/mine", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) throw new Error(j?.error || "FAILED_TO_LOAD_TENANTS");
        if (!cancelled) setTenants(Array.isArray(j.tenants) ? j.tenants : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    }

    if (status === "authenticated") load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const options = useMemo(() => {
    return tenants.map((t) => ({
      value: t.tenantId,
      label: `${t.name}${t.schoolCode ? ` (${t.schoolCode})` : ""}${t.roleName ? ` — ${t.roleName}` : ""}`,
    }));
  }, [tenants]);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tenantId = e.target.value;
    if (!tenantId || tenantId === currentTenantId) return;

    setBusy(true);
    setErr(null);
    try {
      // ✅ This triggers jwt({ trigger: "update" }) in your auth.ts and verifies ACTIVE membership server-side.
      await update({ tenantId } as any);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // Keep prop for compatibility; cookie-based "currentSlug" is ignored now.
  void currentSlug;

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600">Tenant:</label>

      <select
        className="border rounded px-2 py-1"
        value={currentTenantId || ""}
        onChange={onChange}
        disabled={busy || status !== "authenticated" || options.length <= 1}
      >
        <option value="" disabled>
          {status !== "authenticated" ? "Sign in to choose…" : options.length ? "Select tenant…" : "Loading…"}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {busy ? <span className="text-xs text-gray-500">Switching…</span> : null}
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </div>
  );
}
