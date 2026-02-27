// src/app/auth/signin/page.tsx
"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { buildAppCallbackUrl, safeInternalPath } from "@/lib/roleRouting";

function minutesFromSeconds(secs: number) {
  const s = Number.isFinite(secs) ? secs : 60;
  return Math.max(1, Math.ceil(s / 60));
}

function hasOtpValue(v: string) {
  return v.replace(/\s+/g, "").trim().length > 0;
}

function mapError(raw: string | null): string | null {
  const e = String(raw ?? "").trim();
  if (!e) return null;

  // Server-auth redirect errors
  if (e === "NO_ACTIVE_TENANT") return "Select your school (School Code) to continue.";
  if (e === "FORBIDDEN") return "You don’t have access to this school workspace.";
  if (e === "UNAUTHORIZED") return "Please sign in to continue.";

  // NextAuth generic
  if (e === "CredentialsSignin") return "Invalid Staff ID/email or password.";

  return null;
}

function SignInSkeleton() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="mx-auto max-w-md px-4 py-10 space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-sky-600">EduLife OS · Sign In</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-sky-950">Welcome back.</h1>
          <p className="text-sm text-slate-600">Loading…</p>
        </header>

        <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="mt-3 h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="mt-3 h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="mt-3 h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="mt-4 h-10 rounded-xl bg-slate-200 animate-pulse" />
        </section>
      </div>
    </main>
  );
}

function SignInInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const rawCb =
    sp.get("callbackUrl") || sp.get("redirect") || sp.get("redirectTo") || "/app";

  // Always sanitize
  const safeCb = safeInternalPath(rawCb, "/app");

  // ✅ Always route through /app gateway unless it's already /app
  const callbackUrl = safeCb.startsWith("/app") ? safeCb : buildAppCallbackUrl(safeCb);

  const tenantPrefill = (sp.get("tenant") || sp.get("tenantId") || sp.get("school") || "").trim();
  const initialErr = mapError(sp.get("error"));

  const [tenant, setTenant] = useState(tenantPrefill);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(initialErr);

  const canSubmit = useMemo(
    () => identifier.trim().length >= 3 && password.length >= 6 && !loading,
    [identifier, password, loading]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      tenant: tenant.trim() || undefined,
      identifier: identifier.trim(),
      password,
      otp: otp.trim() || undefined,
      callbackUrl, // ✅ always /app?next=...
    });

    setLoading(false);

    if (!res) {
      setErr("Sign-in failed. Please try again.");
      return;
    }

    if (res.error) {
      if (res.error === "TENANT_REQUIRED") return setErr("Enter your School Code (tenant) to continue.");
      if (res.error === "INVALID_TENANT") return setErr("School Code not found. Use the current School Code from your administrator.");
      if (res.error === "OTP_REQUIRED") return setErr("2FA is enabled. Enter your one-time code (OTP) and sign in again.");
      if (res.error === "OTP_INVALID") return setErr("Invalid one-time code (OTP). Try again.");
      if (res.error === "OTP_MISCONFIGURED") return setErr("2FA is misconfigured on this account. Contact the administrator.");

      if (res.error.startsWith("OTP_LOCKED:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(`OTP temporarily locked. Try again in ${minutesFromSeconds(secs)} minute(s).`);
      }
      if (res.error.startsWith("RATE_LIMIT:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(`Too many attempts. Try again in ${minutesFromSeconds(secs)} minute(s).`);
      }
      if (res.error.startsWith("ACCOUNT_LOCKED:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(`Account temporarily locked. Try again in ${minutesFromSeconds(secs)} minute(s).`);
      }

      if (hasOtpValue(otp)) return setErr("Sign-in failed. Check your password and one-time code, then try again.");
      return setErr("Invalid Staff ID/email or password.");
    }

    // Single gateway: /app will route by role + tenant safely.
    router.replace(callbackUrl || "/app");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="mx-auto max-w-md px-4 py-10 space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-sky-600">EduLife OS · Sign In</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-sky-950">Welcome back.</h1>
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
                placeholder="e.g. SCH-AC4633 or ayitikope-basic"
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
                required
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
                required
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
                href={`/auth/signup?redirectTo=${encodeURIComponent(callbackUrl || "/app")}`}
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

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInInner />
    </Suspense>
  );
}