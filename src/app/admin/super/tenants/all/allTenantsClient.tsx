// src/app/admin/super/tenants/all/allTenantsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  schoolCode: string;
  slug: string;
  status: string;
  createdAt: string;
  contactEmail: string | null;
  contactPhoneNorm: string | null;
};

export default function AllTenantsClient() {
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "PENDING">("ALL");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const url = `/api/admin/super/tenants/all/list?status=${encodeURIComponent(status)}&q=${encodeURIComponent(
        q.trim()
      )}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Failed (${r.status})`);
        setItems([]);
        return;
      }
      setItems(j.items || []);
    } catch {
      setMsg("Network/server error.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const canSearch = useMemo(() => true, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <select
          className="h-10 rounded-xl border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
        </select>

        <input
          className="h-10 rounded-xl border px-3 text-sm flex-1"
          placeholder="Search by name, school code, slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          disabled={!canSearch}
          onClick={load}
          className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800 disabled:opacity-60"
        >
          Search
        </button>

        {msg ? <div className="text-sm text-zinc-700">{msg}</div> : null}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-600">No tenants found.</div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="border rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">
                    {t.name} <span className="text-xs text-zinc-500">({t.schoolCode})</span>
                    <span className="ml-2 inline-flex text-[10px] px-2 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700">
                      {t.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600">
                    Created: {new Date(t.createdAt).toLocaleString()} • slug:{" "}
                    <span className="font-mono">{t.slug}</span>
                  </div>
                  <div className="text-xs text-zinc-600">
                    Contact: {t.contactEmail || "—"} • {t.contactPhoneNorm || "—"}
                  </div>
                </div>

                <div className="text-xs text-zinc-500 font-mono">{t.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}