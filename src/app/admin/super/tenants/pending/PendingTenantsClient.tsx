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
  autoActivateAt?: string | null;
  autoActivateInMinutes?: number | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
};

type SettlementForm = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  percentageCharge: string;
};

const DEFAULT_FORM: SettlementForm = {
  bankCode: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  percentageCharge: "0",
};

export default function PendingTenantsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [forms, setForms] = useState<Record<string, SettlementForm>>({});

  function formFor(id: string): SettlementForm {
    return forms[id] || DEFAULT_FORM;
  }

  function updateForm(id: string, patch: Partial<SettlementForm>) {
    setForms((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || DEFAULT_FORM), ...patch },
    }));
  }

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

  async function createSubaccount(tenant: Item) {
    const f = formFor(tenant.id);

    const bankCode = f.bankCode.trim();
    const bankName = f.bankName.trim();
    const accountNumber = f.accountNumber.replace(/\D/g, "");
    const accountName = f.accountName.trim();
    const percentageCharge = Number(f.percentageCharge || 0);

    if (!bankCode) return setMsg("Bank code is required.");
    if (!accountNumber) return setMsg("Account number is required.");
    if (accountNumber.length < 6 || accountNumber.length > 20) {
      return setMsg("Account number length looks invalid.");
    }
    if (!accountName) return setMsg("Account name is required.");
    if (!Number.isFinite(percentageCharge) || percentageCharge < 0 || percentageCharge > 100) {
      return setMsg("Percentage charge must be between 0 and 100.");
    }

    setBusyId(tenant.id);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/paystack/create-subaccount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          bankCode,
          bankName,
          accountNumber,
          accountName,
          businessName: tenant.name,
          percentageCharge,
          primaryContactEmail: tenant.contactEmail,
          primaryContactName: tenant.name,
          primaryContactPhone: tenant.contactPhoneNorm,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || j?.message || `Subaccount failed (${r.status})`);
        return false;
      }

      setMsg(`Settlement account created for ${tenant.name}.`);
      return true;
    } catch {
      setMsg("Network/server error creating Paystack subaccount.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function approve(tenant: Item) {
    setBusyId(tenant.id);
    setMsg(null);

    try {
      const subaccountOk = await createSubaccount(tenant);
      if (!subaccountOk) return;

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

      setMsg(`${tenant.name} approved and financially activated.`);
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
            const f = formFor(t.id);
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

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-amber-950">
                      Settlement Account Required
                    </div>
                    <p className="text-xs text-amber-900/80 mt-1">
                      Create the school’s Paystack subaccount before approval so parent fees route to the school’s own account.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      className="h-10 rounded-xl border px-3 text-sm"
                      placeholder="Bank code e.g. 058"
                      value={f.bankCode}
                      onChange={(e) => updateForm(t.id, { bankCode: e.target.value })}
                    />

                    <input
                      className="h-10 rounded-xl border px-3 text-sm"
                      placeholder="Bank name e.g. CalBank"
                      value={f.bankName}
                      onChange={(e) => updateForm(t.id, { bankName: e.target.value })}
                    />

                    <input
                      className="h-10 rounded-xl border px-3 text-sm"
                      placeholder="Account number"
                      value={f.accountNumber}
                      onChange={(e) => updateForm(t.id, { accountNumber: e.target.value })}
                    />

                    <input
                      className="h-10 rounded-xl border px-3 text-sm"
                      placeholder="Account name"
                      value={f.accountName}
                      onChange={(e) => updateForm(t.id, { accountName: e.target.value })}
                    />

                    <input
                      className="h-10 rounded-xl border px-3 text-sm md:col-span-2"
                      placeholder="EduLife percentage charge, usually 0 for school fees"
                      value={f.percentageCharge}
                      onChange={(e) =>
                        updateForm(t.id, { percentageCharge: e.target.value })
                      }
                    />
                  </div>

                  <button
                    onClick={() => approve(t)}
                    disabled={busy || isRejected}
                    className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800 disabled:opacity-60 text-sm"
                  >
                    {busy ? "Processing…" : "Create Subaccount + Approve Tenant"}
                  </button>
                </div>

                {isRejected ? (
                  <div className="text-xs text-rose-700">
                    Reason: <span className="font-medium">{t.rejectReason || "—"}</span>
                  </div>
                ) : null}

                {rejectingId === t.id ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                    <div className="text-xs text-zinc-700 font-semibold">
                      Reject reason (required)
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