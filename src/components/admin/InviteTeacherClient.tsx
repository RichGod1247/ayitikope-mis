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
  // user can type 024..., +233..., 233...
  return String(v ?? "").trim();
}

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
        // ✅ for SMS delivery
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
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Invite Staff</p>
        <p className="text-sm text-zinc-600 mt-1">
          Sends an invite link by <span className="font-medium">email + SMS</span> (expires in{" "}
          <span className="font-medium">15 minutes</span>).
        </p>
      </div>

      {topError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {topError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-zinc-700">Role</label>
          <select
            value={roleName}
            onChange={(e) => setRoleName(e.target.value as any)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
          >
            <option value="TEACHER">Teacher</option>
            <option value="HEADTEACHER">Headteacher</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-zinc-700">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="e.g. Mr. Mensah"
          />
        </div>

        <div>
          <label className="text-sm text-zinc-700">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="teacher@school.com"
          />
          {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label className="text-sm text-zinc-700">Phone (for SMS)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="024xxxxxxx or +23324xxxxxxx"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            This is the number that will receive the invite SMS.
          </p>
        </div>

        <div className="md:col-span-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create invite + send"}
          </button>
        </div>
      </div>

      {created ? (
        <div className="rounded-xl border bg-zinc-50 p-4 space-y-3">
          <p className="text-xs text-zinc-600">
            Expires: <span className="font-medium">{expiresLabel}</span>
          </p>

          <div className="flex items-center gap-2">
            <input readOnly value={created.link} className="flex-1 rounded-lg border px-3 py-2 text-xs bg-white" />
            <button onClick={copyLink} className="rounded-lg border px-3 py-2 text-xs hover:bg-white">
              Copy
            </button>
          </div>

          <div className="text-xs text-zinc-700 space-y-1">
            <div>
              Email:{" "}
              <span className={created.delivery?.email?.ok ? "text-emerald-700" : "text-amber-700"}>
                {created.delivery?.email?.ok ? "sent" : created.delivery?.email ? "failed" : "unknown"}
              </span>
              {created.delivery?.email?.error ? (
                <span className="text-zinc-500"> ({created.delivery.email.error})</span>
              ) : null}
            </div>

            <div>
              SMS:{" "}
              <span className={created.delivery?.sms?.ok ? "text-emerald-700" : "text-amber-700"}>
                {created.delivery?.sms?.ok ? "sent" : created.delivery?.sms ? "failed" : "unknown"}
              </span>
              {created.delivery?.sms?.to ? <span className="text-zinc-500"> (to {created.delivery.sms.to})</span> : null}
              {created.delivery?.sms?.error ? (
                <span className="text-zinc-500"> ({created.delivery.sms.error})</span>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Note: if <span className="font-medium">EMAIL_TEST_MODE=true</span>, the email will go to{" "}
            <span className="font-medium">EMAIL_TEST_TO</span>, not the invited email.
          </p>
        </div>
      ) : null}
    </div>
  );
}