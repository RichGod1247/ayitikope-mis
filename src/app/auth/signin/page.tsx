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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function mapError(raw: string | null): string | null {
  const e = clean(raw);
  if (!e) return null;

  if (e === "NO_ACTIVE_TENANT") return "Your account does not currently have access to an active school.";
  if (e === "FORBIDDEN") return "You don’t have access to this workspace.";
  if (e === "UNAUTHORIZED") return "Please sign in to continue.";
  if (e === "CredentialsSignin") return "Invalid email/Staff ID or password.";

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

  const modeRaw = clean(sp.get("mode")).toLowerCase();
  const isGovernanceMode = modeRaw === "governance" || modeRaw === "officer";

  const rawCb = sp.get("callbackUrl") || sp.get("redirect") || sp.get("redirectTo") || "/app";

  const safeCb = safeInternalPath(
  rawCb,
  isGovernanceMode ? "/circuit/dashboard" : "/app"
);

// Governance users must not be routed through /app because /app is tenant-school centered.
// School users may still use /app?next=... as the canonical workspace router.
const callbackUrl = isGovernanceMode
  ? safeCb
  : safeCb.startsWith("/app")
    ? safeCb
    : buildAppCallbackUrl(safeCb);

  const initialErr = mapError(sp.get("error"));

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(initialErr);

  const canSubmit = useMemo(() => {
    const baseReady = identifier.trim().length >= 3 && password.length >= 6 && !loading;
    if (!baseReady) return false;
    if (!showOtp) return true;
    return otp.replace(/\D/g, "").length === 6;
  }, [identifier, password, otp, showOtp, loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
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
      if (res.error === "TENANT_REQUIRED") {
        return setErr(
          "This account is linked to more than one active school. Contact EduLife OS support so the correct school can be confirmed securely."
        );
      }

      if (res.error === "INVALID_TENANT") {
        return setErr(
          "This account could not be matched to an active school or current governance assignment."
        );
      }

      if (res.error === "OTP_REQUIRED") {
        setShowOtp(true);
        setOtp("");
        return setErr(
          "Extra security is enabled for this account. Enter your 6-digit security code to continue."
        );
      }

      if (res.error === "OTP_INVALID") {
        setShowOtp(true);
        return setErr("That security code is not valid. Check the 6-digit code and try again.");
      }

      if (res.error === "OTP_MISCONFIGURED") {
        setShowOtp(true);
        return setErr(
          "Extra security is not configured correctly on this account. Contact EduLife OS support."
        );
      }

      if (res.error.startsWith("OTP_LOCKED:")) {
        setShowOtp(true);
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(
          `Security-code attempts are temporarily locked. Try again in ${minutesFromSeconds(secs)} minute(s).`
        );
      }

      if (res.error.startsWith("RATE_LIMIT:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(`Too many attempts. Try again in ${minutesFromSeconds(secs)} minute(s).`);
      }

      if (res.error.startsWith("ACCOUNT_LOCKED:")) {
        const secs = Number(res.error.split(":")[1] || "60");
        return setErr(`Account temporarily locked. Try again in ${minutesFromSeconds(secs)} minute(s).`);
      }

      if (hasOtpValue(otp)) {
        return setErr("Sign-in failed. Check your password and one-time code, then try again.");
      }

      return setErr("Invalid email/Staff ID or password.");
    }

    router.replace(callbackUrl || "/app");
  }

  return (
    <main className="os-auth-shell px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              {isGovernanceMode ? "Secure Governance Access" : "Secure Staff Access"}
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-tight text-[#F7F4ED]">
              {isGovernanceMode
                ? "Enter your protected governance workspace."
                : "Enter your protected EduLife OS workspace."}
            </h1>

            <p className="mt-5 max-w-lg text-sm leading-8 text-[#C9CDD6]">
              {isGovernanceMode
                ? "Sign in as a verified circuit or district officer. Your access is based on audited jurisdiction assignment, not school tenant membership."
                : "Sign in to access teaching workflows, leadership controls, school operations, and role-scoped portals designed for disciplined execution."}
            </p>
          </div>

          <div className="grid gap-3">
            {(isGovernanceMode
              ? [
                  "Jurisdiction-scoped officer access",
                  "Circuit and district oversight routing",
                  "Audited governance assignment",
                ]
              : [
                  "Tenant-scoped school access",
                  "Role-based workspace routing",
                  "Extra security only when enabled",
                ]
            ).map((item) => (
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
          <FormLogo
            subtitle={
              isGovernanceMode
                ? "Sign in to continue into your governance dashboard."
                : "Sign in to continue into your school workspace."
            }
          />

          {err ? <div className="os-error-banner mb-4 rounded-2xl px-4 py-3 text-sm">{err}</div> : null}

          <form onSubmit={onSubmit} className="space-y-4">
            {isGovernanceMode ? (
              <div className="rounded-2xl border border-[#E8C96A]/25 bg-[#E8C96A]/10 px-4 py-3 text-xs leading-6 text-[#E8C96A]">
                Your access is matched securely from your current governance assignment.
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="os-label">{isGovernanceMode ? "Official Email" : "Staff ID or Email"}</label>
              <input
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (showOtp) {
                    setShowOtp(false);
                    setOtp("");
                  }
                }}
                className="os-input"
                placeholder={isGovernanceMode ? "officer@district.ges.gov.gh" : "e.g. AYI-TCH-001 or name@school.com"}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="os-label">Password</label>
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (showOtp) {
                    setShowOtp(false);
                    setOtp("");
                  }
                }}
                className="os-input"
                placeholder="Your password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {!showOtp ? (
              <div className="-mt-1 flex justify-end">
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-semibold text-[#E8C96A] hover:text-white"
                >
                  Forgot password?
                </Link>
              </div>
            ) : null}

            {showOtp ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="os-label">Security code</label>
                  <span className="rounded-full border border-[#E8C96A]/25 bg-[#E8C96A]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E8C96A]">
                    2FA
                  </span>
                </div>
                <p className="os-helper">Enter the 6-digit code from your authenticator app.</p>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="os-input"
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
              </div>
            ) : null}

            <button type="submit" disabled={!canSubmit} className="os-btn-primary w-full px-4 py-3 text-sm">
              {loading
                ? showOtp
                  ? "Verifying..."
                  : "Signing in..."
                : showOtp
                  ? "Verify & sign in"
                  : "Sign in"}
            </button>

            {!isGovernanceMode ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-[#C9CDD6]">
                New teacher?{" "}
                <Link
                  href={`/auth/signup?redirectTo=${encodeURIComponent(callbackUrl || "/app")}`}
                  className="font-semibold text-[#E8C96A] hover:text-white"
                >
                  Create account
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-[#C9CDD6]">
                Need access? Ask Superadmin to issue a governance officer invite for your official
                circuit, district, or region.
              </div>
            )}
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