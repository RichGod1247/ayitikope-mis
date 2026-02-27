// src/app/admin/staff/StaffOnboardingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type InviteItem = {
  id: string;
  roleName: string;
  codeHint: string | null;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  remaining: number;
  revokedAt: string | null;
  active: boolean;
  expired: boolean;
};

type CreateResp =
  | {
      ok: true;
      inviteCodeId: string;
      roleName: string;
      code: string;
      expiresAt: string;
      maxUses: number;
      link?: string | null;
      delivery?: { sms?: any; email?: any };
      sms?: any; // legacy
    }
  | { ok: false; error?: string; retryAfterSeconds?: number };

function safeNum(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function StaffOnboardingClient({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [roleName, setRoleName] = useState("TEACHER");

  // legacy days (parent)
  const [expiresInDays, setExpiresInDays] = useState("7");

  // staff minutes (teacher/headteacher)
  const [expiresInMinutes, setExpiresInMinutes] = useState("15");

  const [maxUses, setMaxUses] = useState("1");
  const [includeRevoked, setIncludeRevoked] = useState(false);

  // delivery fields
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [deliverToPhone, setDeliverToPhone] = useState("");
  const [deliverToEmail, setDeliverToEmail] = useState("");
  const [deliverToName, setDeliverToName] = useState("");
  const [brand, setBrand] = useState("AYITIADMIN");

  const [newCode, setNewCode] = useState<string | null>(null);
  const [lastDelivery, setLastDelivery] = useState<any>(null);

  const listUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (includeRevoked) p.set("includeRevoked", "1");
    return `/api/admin/invite-codes/list?${p.toString()}`;
  }, [includeRevoked]);

  const canonicalSignupPath = "/auth/signup";
  const defaultRedirectTo = "/app";

  function buildSignupLink(code: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return (
      `${origin}${canonicalSignupPath}` +
      `?code=${encodeURIComponent(code)}` +
      `&redirectTo=${encodeURIComponent(defaultRedirectTo)}`
    );
  }

  const isStaffRole = roleName === "TEACHER" || roleName === "HEADTEACHER";

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(listUrl, { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) {
        setMsg(j?.error || `Failed to load (${r.status})`);
        return;
      }
      setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function createCode() {
    setMsg(null);
    setNewCode(null);
    setLastDelivery(null);

    const payload: any = {
      roleName,
      maxUses: safeNum(maxUses, 1),

      // delivery
      sendSms,
      sendEmail,
      deliverToPhone: clean(deliverToPhone),
      deliverToEmail: clean(deliverToEmail),
      deliverToName: clean(deliverToName),
      brand: clean(brand) || "AYITIADMIN",
      redirectTo: defaultRedirectTo,
    };

    if (isStaffRole) payload.expiresInMinutes = safeNum(expiresInMinutes, 15);
    else payload.expiresInDays = safeNum(expiresInDays, 7);

    const r = await fetch("/api/admin/invite-codes/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = (await r.json().catch(() => ({} as any))) as CreateResp;

    if (!r.ok || !j || (j as any).ok === false) {
      setMsg((j as any)?.error || `Failed to create (${r.status})`);
      return;
    }

    setNewCode((j as any).code || null);
    setLastDelivery((j as any).delivery || null);
    await load();
  }

  async function revoke(id: string) {
    setMsg(null);
    const r = await fetch(`/api/admin/invite-codes/revoke/${id}`, { method: "POST" });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      setMsg(j?.error || `Failed to revoke (${r.status})`);
      return;
    }
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl]);

  return (
    <div className={embedded ? "space-y-4" : "max-w-5xl mx-auto space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Staff Onboarding</h1>
          <p className="text-sm text-zinc-600 mt-1">
            Generate onboarding codes. For TEACHER/HEADTEACHER: expires in minutes. For PARENT: expires in days.
          </p>
        </div>
      )}

      <div className="border rounded-2xl p-4 bg-white shadow-sm space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Role</label>
            <select
              className="w-full border rounded-xl p-2 h-10"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
            >
              <option value="HEADTEACHER">HEADTEACHER</option>
              <option value="TEACHER">TEACHER</option>
              <option value="PARENT">PARENT</option>
            </select>
          </div>

          {isStaffRole ? (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Expires (minutes)</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={expiresInMinutes}
                onChange={(e) => setExpiresInMinutes(e.target.value)}
                placeholder="15"
                inputMode="numeric"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Expires (days)</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="7"
                inputMode="numeric"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Max uses</label>
            <input
              className="w-full border rounded-xl p-2 h-10"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="1"
              inputMode="numeric"
            />
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={includeRevoked}
                onChange={(e) => setIncludeRevoked(e.target.checked)}
              />
              Show revoked
            </label>
          </div>
        </div>

        {/* Delivery */}
        <div className="border rounded-2xl p-4 bg-zinc-50 space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              Send SMS
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Send Email
            </label>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Recipient name (optional)</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={deliverToName}
                onChange={(e) => setDeliverToName(e.target.value)}
                placeholder="e.g. Mr. Mensah"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Recipient phone (for SMS)</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={deliverToPhone}
                onChange={(e) => setDeliverToPhone(e.target.value)}
                placeholder="e.g. 0553690424"
                inputMode="tel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Recipient email (for Email)</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={deliverToEmail}
                onChange={(e) => setDeliverToEmail(e.target.value)}
                placeholder="e.g. headteacher@school.com"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">SMS brand</label>
              <input
                className="w-full border rounded-xl p-2 h-10"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="AYITIADMIN"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={createCode}
            className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800"
          >
            Generate + Deliver
          </button>
          <button
            onClick={load}
            className="h-10 px-4 rounded-xl bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50"
          >
            Refresh
          </button>
          {msg && <div className="text-sm text-zinc-700">{msg}</div>}
        </div>

        {newCode && (
          <div className="mt-2 p-3 rounded-xl border bg-white space-y-2">
            <div className="text-sm font-semibold">New code (copy now — shown once):</div>
            <div className="font-mono text-lg break-all">{newCode}</div>

            <div className="text-xs text-zinc-600">
              Canonical signup link to share:
              <div className="mt-1 font-mono break-all text-zinc-900">{buildSignupLink(newCode)}</div>
            </div>

            {lastDelivery ? (
              <div className="text-xs text-zinc-700 mt-2">
                <div className="font-semibold">Delivery results:</div>
                <pre className="mt-1 whitespace-pre-wrap text-[11px] bg-zinc-50 border rounded-xl p-2">
                  {JSON.stringify(lastDelivery, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="border rounded-2xl p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Codes</h2>
          <a className="text-xs text-zinc-600 hover:underline" href="/api/admin/invite-codes/list?debug=1">
            Debug counts
          </a>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-600 mt-3">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-600 mt-3">No codes yet.</div>
        ) : (
          <div className="space-y-2 mt-3">
            {items.map((x) => (
              <div key={x.id} className="border rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">
                    {x.roleName}{" "}
                    <span className="text-xs text-zinc-500">
                      (hint: {x.codeHint ?? "—"}) • remaining {x.remaining}/{x.maxUses}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600">
                    Expires: {new Date(x.expiresAt).toLocaleString()} •{" "}
                    {x.revokedAt ? "REVOKED" : x.expired ? "EXPIRED" : x.active ? "ACTIVE" : "INACTIVE"}
                  </div>
                </div>

                {!x.revokedAt && (
                  <button
                    onClick={() => revoke(x.id)}
                    className="h-9 px-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-sm"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!embedded && (
        <div className="text-xs text-zinc-500">
          Canonical staff signup: <span className="font-mono">{canonicalSignupPath}</span>{" "}
          <span className="text-zinc-400">(?code=...&amp;redirectTo=/app)</span>
        </div>
      )}
    </div>
  );
}