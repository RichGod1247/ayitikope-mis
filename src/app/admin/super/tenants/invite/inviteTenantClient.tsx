//src/app/admin/super/tenants/invite/inviteTenantClient.tsx
"use client";

import { useMemo, useState } from "react";

export default function InviteTenantClient() {
  const [schoolName, setSchoolName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);

  const [ttlMinutes, setTtlMinutes] = useState("1440");
  const [brand, setBrand] = useState("EDULIFEOS");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const canSubmit = useMemo(() => {
    return contactEmail.trim().includes("@") && (!sendSms || contactPhone.trim().length >= 10);
  }, [contactEmail, contactPhone, sendSms]);

  async function submit() {
    setMsg(null);
    setResult(null);

    if (!canSubmit) {
      setMsg("Provide a valid email. If SMS is enabled, provide a valid phone.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/admin/tenant-bootstrap/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolName: schoolName.trim() || undefined,
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          sendEmail,
          sendSms,
          ttlMinutes: Number(ttlMinutes || "1440"),
          brand: brand.trim() || "EDULIFEOS",
        }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Failed (${r.status})`);
        return;
      }

      setResult(j);
      setMsg("Invite created and delivery attempted.");
    } catch {
      setMsg("Network/server error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      {msg ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {msg}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            School name (optional)
          </label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Contact email
          </label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Contact phone (Ghana)
          </label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Invite TTL (minutes)
            </label>
            <input
              className="w-full border rounded-xl p-2 h-10"
              value={ttlMinutes}
              onChange={(e) => setTtlMinutes(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              SMS brand
            </label>
            <input
              className="w-full border rounded-xl p-2 h-10"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="EDULIFEOS"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Send Email
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
          Send SMS
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={loading}
          onClick={submit}
          className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create Invite"}
        </button>
      </div>

      {result ? (
        <div className="rounded-xl border bg-zinc-50 p-3 space-y-2">
          <div className="text-sm font-semibold text-zinc-900">Created</div>
          <div className="text-sm text-zinc-700">
            School Code: <span className="font-mono">{result.reservedSchoolCode}</span>
          </div>
          <div className="text-sm text-zinc-700">
            Slug: <span className="font-mono">{result.reservedSlug}</span>
          </div>
          <div className="text-sm text-zinc-700">
            Expires: <span className="font-mono">{result.expiresAt}</span>
          </div>
          {result.inviteUrl ? (
            <div className="text-sm text-zinc-700">
              Invite URL:
              <div className="mt-1 font-mono break-all text-zinc-900">{result.inviteUrl}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}