// src/app/auth/signin/page.tsx
"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { buildAppCallbackUrl, safeInternalPath } from "@/lib/roleRouting";
import FormLogo from "@/components/FormLogo";

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

  if (e === "NO_ACTIVE_TENANT") return "Select your school (School Code) to continue.";
  if (e === "FORBIDDEN") return "You don’t have access to this school workspace.";
  if (e === "UNAUTHORIZED") return "Please sign in to continue.";
  if (e === "CredentialsSignin") return "Invalid Staff ID/email or password.";

  return null;
}

function SignInSkeleton() {
  return (
    <main className="os-auth-shell flex items-center justify-center px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:block" />
        <section className="os-auth-card rounded-[32px] p-6 sm:p-8">
          <div className="os-skeleton-line h-6 w-36" />
          <div className="os-skeleton-line mt-4 h-12 w-full" />
          <div className="os-skeleton-line mt-3 h-12 w-full" />
          <div className="os-skeleton-line mt-3 h-12 w-full" />
          <div className="os-skeleton-line mt-3 h-12 w-full" />
          <div className="os-skeleton-line mt-5 h-12 w-full" />
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

  const safeCb = safeInternalPath(rawCb, "/app");
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
      callbackUrl,
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

    router.replace(callbackUrl || "/app");
  }

  return (
    <main className="os-auth-shell px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              Secure Staff Access
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-tight text-[#F7F4ED]">
              Enter your protected EduLife OS workspace.
            </h1>

            <p className="mt-5 max-w-lg text-sm leading-8 text-[#C9CDD6]">
              Sign in to access teaching workflows, leadership controls, school operations,
              and role-scoped portals designed for disciplined execution.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              "Tenant-scoped school access",
              "Role-based workspace routing",
              "OTP-ready secure sign-in",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="os-auth-card rounded-[32px] p-6 sm:p-8">
          <FormLogo subtitle="Sign in to continue into your school workspace." />

          {err ? (
            <div className="os-error-banner mb-4 rounded-2xl px-4 py-3 text-sm">
              {err}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="os-label">
                School Code <span className="os-helper">(required for Staff ID or multi-school accounts)</span>
              </label>
              <input
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                className="os-input"
                placeholder="e.g. SCH-AC4633 or ayitikope-basic"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <label className="os-label">Staff ID or Email</label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="os-input"
                placeholder="e.g. AYI-TCH-001 or name@school.com"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="os-label">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="os-input"
                placeholder="Your password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="os-label">
                One-Time Code (OTP) <span className="os-helper">(only if enabled)</span>
              </label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="os-input"
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="os-btn-primary w-full px-4 py-3 text-sm"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-[#C9CDD6]">
              New teacher?{" "}
              <Link
                href={`/auth/signup?redirectTo=${encodeURIComponent(callbackUrl || "/app")}`}
                className="font-semibold text-[#E8C96A] hover:text-white"
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