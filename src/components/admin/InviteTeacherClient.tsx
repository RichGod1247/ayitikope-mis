// src/components/admin/InviteTeacherClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DeliveryInfo = {
  email?: { ok: boolean; error?: string } | null;
  sms?: { ok: boolean; to?: string; error?: string } | null;
};

type ApiResp =
  | {
      ok: true;
      token: string;
      expiresAt: string;
      inviteUrl?: string;
      delivery?: DeliveryInfo;
    }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> | null };

function cleanStr(v: string) {
  return String(v ?? "").trim();
}

function cleanEmail(v: string) {
  return String(v ?? "").toLowerCase().trim();
}

function cleanPhoneLoose(v: string) {
  return String(v ?? "").trim();
}

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnOutline =
  `${btnBase} border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;
const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";

export default function InviteTeacherClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [roleName, setRoleName] = useState<"TEACHER" | "HEADTEACHER">("TEACHER");

  const [loading, setLoading] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{
    link: string;
    expiresAt: string;
    delivery?: DeliveryInfo;
  } | null>(null);

  const canSubmit = useMemo(() => {
    const em = cleanEmail(email);
    const ph = cleanStr(phone);
    return em.includes("@") && ph.length >= 9 && !loading;
  }, [email, phone, loading]);

  async function onCreate() {
    setTopError(null);
    setFieldErrors({});
    setCreated(null);
    setLoading(true);

    try {
      const payload = {
        email: cleanEmail(email),
        roleName,
        redirectTo: "/app",
        deliverToPhone: cleanPhoneLoose(phone),
        deliverToName: cleanStr(name),
        brand: "AYITIADMIN",
      };

      const res = await fetch("/api/admin/invite-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResp | null;
      if (!data) {
        setTopError("Invalid server response.");
        return;
      }

      if (!data.ok) {
        setTopError(data.error || "Invite failed.");
        setFieldErrors((data.fieldErrors as any) || {});
        return;
      }

      const link =
        data.inviteUrl ||
        `${window.location.origin}/auth/signup?invite=${encodeURIComponent(
          data.token
        )}&redirectTo=${encodeURIComponent("/app")}`;

      setCreated({ link, expiresAt: data.expiresAt, delivery: data.delivery ?? undefined });

      setEmail("");
      setPhone("");
      setName("");
      setRoleName("TEACHER");

      router.refresh();
    } catch {
      setTopError("Invite failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
    } catch {
      // ignore
    }
  }

  const expiresLabel = created ? new Date(created.expiresAt).toLocaleString() : "";

  return (
    <div className={shellCard}>
      <div>
        <p className="text-sm font-semibold text-[#F7F4ED]">Invite Staff</p>
        <p className="mt-1 text-sm text-[#C9CDD6]">
          Sends an invite link by <span className="font-medium text-[#F7F4ED]">email + SMS</span> and expires in{" "}
          <span className="font-medium text-[#F7F4ED]">15 minutes</span>.
        </p>
      </div>

      {topError ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-xs text-amber-100">
          {topError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm text-[#C9CDD6]">Role</label>
          <select
            value={roleName}
            onChange={(e) => setRoleName(e.target.value as any)}
            className={inputClass}
          >
            <option value="TEACHER" className="bg-[#05070B] text-[#F7F4ED]">Teacher</option>
            <option value="HEADTEACHER" className="bg-[#05070B] text-[#F7F4ED]">Headteacher</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-[#C9CDD6]">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Mr. Mensah"
          />
        </div>

        <div>
          <label className="text-sm text-[#C9CDD6]">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="teacher@school.com"
          />
          {fieldErrors.email ? <p className="mt-1 text-xs text-rose-200">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label className="text-sm text-[#C9CDD6]">Phone (for SMS)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="024xxxxxxx or +23324xxxxxxx"
          />
          <p className="mt-1 text-[11px] text-[#8F98A8]">
            This is the number that will receive the invite SMS.
          </p>
        </div>

        <div className="md:col-span-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canSubmit}
            className={`${btnPrimary} w-full`}
          >
            {loading ? "Creating…" : "Create invite + send"}
          </button>
        </div>
      </div>

      {created ? (
        <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 p-4 space-y-3">
          <p className="text-xs text-[#C9CDD6]">
            Expires: <span className="font-medium text-[#F7F4ED]">{expiresLabel}</span>
          </p>

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={created.link}
              className="flex-1 rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-xs text-[#F7F4ED]"
            />
            <button onClick={copyLink} className={btnOutline}>
              Copy
            </button>
          </div>

          <div className="space-y-1 text-xs text-[#C9CDD6]">
            <div>
              Email:{" "}
              <span className={created.delivery?.email?.ok ? "text-emerald-200" : "text-amber-200"}>
                {created.delivery?.email?.ok ? "sent" : created.delivery?.email ? "failed" : "unknown"}
              </span>
              {created.delivery?.email?.error ? (
                <span className="text-[#8F98A8]"> ({created.delivery.email.error})</span>
              ) : null}
            </div>

            <div>
              SMS:{" "}
              <span className={created.delivery?.sms?.ok ? "text-emerald-200" : "text-amber-200"}>
                {created.delivery?.sms?.ok ? "sent" : created.delivery?.sms ? "failed" : "unknown"}
              </span>
              {created.delivery?.sms?.to ? (
                <span className="text-[#8F98A8]"> (to {created.delivery.sms.to})</span>
              ) : null}
              {created.delivery?.sms?.error ? (
                <span className="text-[#8F98A8]"> ({created.delivery.sms.error})</span>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-[#8F98A8]">
            Note: if <span className="font-medium text-[#F7F4ED]">EMAIL_TEST_MODE=true</span>, the email goes to{" "}
            <span className="font-medium text-[#F7F4ED]">EMAIL_TEST_TO</span>, not the invited email.
          </p>
        </div>
      ) : null}
    </div>
  );
}