// src/app/teacher-portal/settings/security/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ApiBase = { ok?: boolean; message?: string };

type StatusResponse = ApiBase & {
  twoFactorEnabled?: boolean;
  twoFactorSetupAt?: string | null;
};

type SetupResponse = ApiBase & {
  qrDataUrl?: string; // preferred: data:image/png;base64,...
  qrCodeDataUrl?: string; // fallback key
  otpauthUrl?: string;
  manualKey?: string;
  twoFactorEnabled?: boolean;
};

type VerifyResponse = ApiBase & {
  twoFactorEnabled?: boolean;
};

type DisableResponse = ApiBase & {
  twoFactorEnabled?: boolean;
};

function minutesFromSeconds(secs: number) {
  const s = Number.isFinite(secs) ? secs : 60;
  return Math.max(1, Math.ceil(s / 60));
}

function pickEnabled(v: any): boolean {
  if (typeof v?.twoFactorEnabled === "boolean") return v.twoFactorEnabled;
  return false;
}

function pickQrDataUrl(v: any): string | null {
  if (typeof v?.qrDataUrl === "string" && v.qrDataUrl.startsWith("data:image")) return v.qrDataUrl;
  if (typeof v?.qrCodeDataUrl === "string" && v.qrCodeDataUrl.startsWith("data:image"))
    return v.qrCodeDataUrl;
  return null;
}

function normalizeOtp(s: string) {
  return s.replace(/\s+/g, "").trim();
}

async function readJsonSafe<T>(r: Response): Promise<T> {
  try {
    return (await r.json()) as T;
  } catch {
    return {} as T;
  }
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { status } = useSession();

  const [enabled, setEnabled] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [setupLoading, setSetupLoading] = useState(false);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canVerify = useMemo(() => {
    const token = normalizeOtp(otp);
    return token.length >= 6 && !verifyLoading && !!qrDataUrl;
  }, [otp, verifyLoading, qrDataUrl]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/auth/login?redirect=${encodeURIComponent("/teacher-portal/settings/security")}`);
      return;
    }
    if (status !== "authenticated") return;

    const ac = new AbortController();

    (async () => {
      setLoadingStatus(true);
      setErr(null);
      setMsg(null);

      try {
        const r = await fetch("/api/auth/2fa/status", { cache: "no-store", signal: ac.signal });

        if (r.status === 401) {
          router.push(`/auth/login?redirect=${encodeURIComponent("/teacher-portal/settings/security")}`);
          return;
        }

        const data = await readJsonSafe<StatusResponse>(r);

        if (!r.ok) {
          setErr(data?.message || "Failed to load 2FA status.");
          return;
        }

        setEnabled(pickEnabled(data));
      } catch (e: any) {
        if (e?.name !== "AbortError") setErr("Failed to load 2FA status. Please refresh.");
      } finally {
        setLoadingStatus(false);
      }
    })();

    return () => ac.abort();
  }, [status, router]);

  async function startSetup() {
    setErr(null);
    setMsg(null);
    setSetup(null);
    setQrDataUrl(null);
    setOtp("");

    setSetupLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      if (r.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent("/teacher-portal/settings/security")}`);
        return;
      }

      const data = await readJsonSafe<SetupResponse>(r);

      if (!r.ok) {
        setErr(data?.message || "Failed to start 2FA setup.");
        return;
      }

      setSetup(data);
      setEnabled(pickEnabled(data)); // if API echoes current status

      const qr = pickQrDataUrl(data);
      if (!qr) {
        setErr("Setup started, but QR code was not returned. Check /api/auth/2fa/setup response.");
        return;
      }

      setQrDataUrl(qr);
      setMsg("Scan the QR code with Google/Microsoft Authenticator, then enter the 6-digit code to enable 2FA.");
    } catch {
      setErr("Failed to start 2FA setup. Please try again.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function verifySetup() {
    setErr(null);
    setMsg(null);

    const token = normalizeOtp(otp);
    if (!token || token.length < 6) {
      setErr("Enter your 6-digit code.");
      return;
    }

    setVerifyLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (r.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent("/teacher-portal/settings/security")}`);
        return;
      }

      const data = await readJsonSafe<VerifyResponse>(r);

      if (!r.ok) {
        setErr(data?.message || "Invalid code. Please try again.");
        return;
      }

      setEnabled(true);
      setMsg("2FA enabled successfully.");
      setSetup(null);
      setQrDataUrl(null);
      setOtp("");
    } catch {
      setErr("Failed to verify code. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function disable2fa() {
    setErr(null);
    setMsg(null);

    const yes = window.confirm("Disable 2FA on your account? This reduces security.");
    if (!yes) return;

    setDisableLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      if (r.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent("/teacher-portal/settings/security")}`);
        return;
      }

      const data = await readJsonSafe<DisableResponse>(r);

      if (!r.ok) {
        setErr(data?.message || "Failed to disable 2FA.");
        return;
      }

      setEnabled(false);
      setSetup(null);
      setQrDataUrl(null);
      setOtp("");
      setMsg("2FA disabled.");
    } catch {
      setErr("Failed to disable 2FA. Please try again.");
    } finally {
      setDisableLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-sky-600">EduLife OS · Teacher Portal</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-sky-950">Security</h1>
          <p className="text-sm text-slate-600">Enable two-factor authentication (2FA) to protect your account.</p>
        </header>

        {err ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{err}</div>
        ) : null}

        {msg ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {msg}
          </div>
        ) : null}

        <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Two-Factor Authentication (TOTP)</h2>
              <p className="text-sm text-slate-600">
                Works offline with Authenticator apps. Recommended for Ghana school environments.
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500">Status</div>
              <div
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  enabled ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800"
                }`}
              >
                {loadingStatus ? "Checking…" : enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={startSetup}
              disabled={setupLoading || enabled}
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {setupLoading ? "Starting…" : enabled ? "2FA Enabled" : "Enable 2FA"}
            </button>

            <button
              onClick={disable2fa}
              disabled={disableLoading || !enabled}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              {disableLoading ? "Disabling…" : "Disable 2FA"}
            </button>

            <Link
              href="/teacher-portal"
              className="ml-auto inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to portal
            </Link>
          </div>

          {qrDataUrl ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
                <div className="rounded-2xl bg-white p-3 border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="2FA QR Code" className="w-full h-auto" />
                </div>

                <div className="space-y-3">
                  <div className="text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Step 1</div>
                    Scan the QR code using Google Authenticator or Microsoft Authenticator.
                  </div>

                  <div className="text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Step 2</div>
                    Enter the 6-digit code from your authenticator app to confirm.
                  </div>

                  {setup?.otpauthUrl ? (
                    <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        Advanced (manual setup)
                      </summary>
                      <div className="mt-2 text-xs text-slate-600 break-words">
                        <div className="font-semibold text-slate-800">otpauth URL</div>
                        <div>{setup.otpauthUrl}</div>
                        {setup.manualKey ? (
                          <>
                            <div className="mt-2 font-semibold text-slate-800">manual key</div>
                            <div>{setup.manualKey}</div>
                          </>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-700">6-digit code</label>
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                    </div>
                    <button
                      onClick={verifySetup}
                      disabled={!canVerify}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {verifyLoading ? "Verifying…" : "Confirm"}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500">
                    If the code keeps failing, check your phone time is set to “automatic”.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Why this matters</h3>
          <p className="text-sm text-slate-600">
            Password leaks happen. 2FA blocks most account takeovers even if the password is exposed.
          </p>
          <p className="text-xs text-slate-500">
            We show cooldown time (not attempt countdown) to avoid helping attackers.
          </p>
        </section>
      </div>
    </main>
  );
}
