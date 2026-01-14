// src/app/auth/signin/page.tsx
"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function minutesFromSeconds(secs: number) {
  const s = Number.isFinite(secs) ? secs : 60;
  return Math.max(1, Math.ceil(s / 60));
}

function hasOtpValue(v: string) {
  return v.replace(/\s+/g, "").trim().length > 0;
}

// Bank-grade: block open-redirects, allow only internal paths.
// Also supports NextAuth's callbackUrl which may be absolute.
function safeInternalRedirect(raw: string | null | undefined) {
  const fallback = "/teacher/dashboard";
  const v = String(raw ?? "").trim();
  if (!v) return fallback;

  // Block protocol-relative and backslash tricks
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;

  // Safe internal path must be a normal single-slash route
  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

export default function SignInPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const redirectTo = safeInternalRedirect(sp.get("redirect") || sp.get("callbackUrl") || "/teacher/dashboard");

  const [tenant, setTenant] = useState(""); // school code / tenant slug / tenantId
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => identifier.trim().length >= 3 && password.length >= 6 && !loading,
    [identifier, password, loading]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      tenant: tenant.trim() || undefined,
      identifier: identifier.trim(),
      password,
      otp: otp.trim() || undefined,
      callbackUrl: redirectTo,
    });

    setLoading(false);

    if (!res) {
      setErr("Sign-in failed. Please try again.");
      return;
    }

    if (res.error) {
      if (res.error === "TENANT_REQUIRED") {
        setErr("Enter your School Code (tenant) to continue. This is required for Staff ID login or multi-school accounts.");
        return;
      }

      if (res.error === "OTP_REQUIRED") {
        setErr("2FA is enabled. Enter your one-time code (OTP) and sign in again.");
        return;
      }

      if (res.error === "OTP_INVALID") {
        setErr("Invalid one-time code (OTP). Try again.");
        return;
      }

      if (res.error === "OTP_MISCONFIGURED") {
        setErr("2FA is misconfigured on this account. Contact the administrator.");
        return;
      }

      if (res.error.startsWith("OTP_LOCKED:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        const mins = minutesFromSeconds(secs);
        setErr(`OTP temporarily locked due to too many attempts. Try again in ${mins} minute(s).`);
        return;
      }

      if (res.error.startsWith("RATE_LIMIT:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        const mins = minutesFromSeconds(secs);
        setErr(`Too many attempts. Try again in ${mins} minute(s).`);
        return;
      }

      if (res.error.startsWith("ACCOUNT_LOCKED:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        const mins = minutesFromSeconds(secs);
        setErr(`Account temporarily locked. Try again in ${mins} minute(s).`);
        return;
      }

      if (hasOtpValue(otp)) {
        setErr("Sign-in failed. Check your password and one-time code, then try again.");
        return;
      }

      setErr("Invalid Staff ID/email or password.");
      return;
    }

    router.replace(res.url ? safeInternalRedirect(res.url) : redirectTo);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="mx-auto max-w-md px-4 py-10 space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-sky-600">EduLife OS · Teacher Portal</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-sky-950">Welcome back, Teacher.</h1>
          <p className="text-sm text-slate-600">Sign in to access your workspace.</p>
        </header>

        <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
          {err ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {err}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                School Code <span className="text-slate-400">(required for Staff ID or multi-school accounts)</span>
              </label>
              <input
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="e.g. ayitikope-jhs (tenant slug) or tenantId"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Staff ID or Email</label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="e.g. AYI-TCH-001 or name@school.com"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="Your password"
                type="password"
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                One-Time Code (OTP) <span className="text-slate-400">(only if enabled)</span>
              </label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="pt-2 text-center text-xs text-slate-600">
              New teacher?{" "}
              <Link
                href={`/auth/signup?redirect=${encodeURIComponent(redirectTo)}`}
                className="font-semibold text-sky-700 hover:underline"
              >
                Create account
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
