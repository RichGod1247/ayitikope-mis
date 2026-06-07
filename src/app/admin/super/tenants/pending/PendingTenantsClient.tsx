// src/app/admin/super/tenants/pending/PendingTenantsClient.tsx
"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  schoolCode: string;
  slug: string;
  createdAt: string;
  contactEmail: string | null;
  contactPhoneNorm: string | null;
    status: string;
  schoolSector: "PUBLIC" | "PRIVATE";
  autoActivateAt?: string | null;
  autoActivateInMinutes?: number | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
};

function schoolSectorLabel(sector: Item["schoolSector"]) {
  return sector === "PRIVATE" ? "Private School" : "Public School";
}

export default function PendingTenantsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/super/tenants/pending/list", {
        cache: "no-store",
      });

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

  async function approve(tenant: Item) {
    setBusyId(tenant.id);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/super/tenants/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Approve failed (${r.status})`);
        return;
      }

      setMsg(`${tenant.name} approved. Online fee payments can be enabled later.`);
      await load();
    } catch {
      setMsg("Network/server error approving tenant.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(tenantId: string, reason: string) {
    setMsg(null);
    setBusyId(tenantId);

    try {
      const r = await fetch("/api/admin/super/tenants/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, reason }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Reject failed (${r.status})`);
        return;
      }

      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch {
      setMsg("Network/server error rejecting tenant.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={load}
          className="h-10 px-4 rounded-xl bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50"
        >
          Refresh
        </button>

        {msg ? <div className="text-sm text-zinc-700">{msg}</div> : null}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-600">No pending tenants right now.</div>
      ) : (
        <div className="space-y-3">
          {items.map((t) => {
            const isRejected = Boolean(t.rejectedAt);
            const busy = busyId === t.id;

            return (
              <div key={t.id} className="border rounded-xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900">
                      {t.name}{" "}
                      <span className="text-xs text-zinc-500">({t.schoolCode})</span>
                      {isRejected ? (
                        <span className="ml-2 inline-flex text-[10px] px-2 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700">
                          REJECTED
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-zinc-600">
                      Created: {new Date(t.createdAt).toLocaleString()} • slug:{" "}
                      <span className="font-mono">{t.slug}</span>
                    </div>

                    <div className="text-xs text-zinc-600">
                      Sector:{" "}
                      <span className="font-semibold">
                        {schoolSectorLabel(t.schoolSector)}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-600">
                      Contact: {t.contactEmail || "—"} • {t.contactPhoneNorm || "—"}
                    </div>

                    {t.autoActivateAt ? (
                      <div className="text-xs text-zinc-600">
                        Auto-activates: {new Date(t.autoActivateAt).toLocaleString()}
                        {typeof t.autoActivateInMinutes === "number"
                          ? ` (in ~${t.autoActivateInMinutes} min)`
                          : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(t)}
                      disabled={busy || isRejected}
                      className="h-9 px-3 rounded-xl bg-black text-white border border-black hover:bg-zinc-800 disabled:opacity-60 text-sm"
                    >
                      {busy ? "Processing…" : "Approve"}
                    </button>

                    <button
                      onClick={() => {
                        setRejectingId(t.id);
                        setRejectReason("");
                      }}
                      disabled={busy}
                      className="h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-sm font-semibold text-emerald-950">
                    Online fee payments are optional
                  </div>
                  <p className="text-xs text-emerald-900/80 mt-1">
                    Approve the school first. They can enable parent online fee payments later from their admin dashboard.
                  </p>
                </div>

                {rejectingId === t.id ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                    <div className="text-xs text-zinc-700 font-semibold">
                      Reject reason
                    </div>

                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. invalid contact details / duplicate school / incomplete info"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRejectingId(null)}
                        className="h-9 px-3 rounded-xl border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 text-sm"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={() => reject(t.id, rejectReason.trim())}
                        disabled={!rejectReason.trim() || busy}
                        className="h-9 px-3 rounded-xl border border-rose-300 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 text-sm"
                      >
                        Confirm Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}