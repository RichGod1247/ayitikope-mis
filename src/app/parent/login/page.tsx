// src/app/parent/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type RequestState = "idle" | "loading" | "success" | "error";
type VerifyState = "idle" | "loading" | "success" | "error";

const DEFAULT_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const DEFAULT_GUARDIAN_PHONE = "0240000000";

const ParentLoginPage: React.FC = () => {
  const router = useRouter();

  // Step 1: request OTP
  const [tenantId, setTenantId] = useState<string>(DEFAULT_TENANT_ID);
  const [guardianPhone, setGuardianPhone] =
    useState<string>(DEFAULT_GUARDIAN_PHONE);
  const [requestState, setRequestState] =
    useState<RequestState>("idle");
  const [requestError, setRequestError] = useState<string | null>(
    null
  );
  const [debugCode, setDebugCode] = useState<string | null>(null);

  // From OTP request
  const [otpToken, setOtpToken] = useState<string | null>(null);

  // Step 2: verify OTP
  const [code, setCode] = useState<string>("");
  const [verifyState, setVerifyState] =
    useState<VerifyState>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);
    setDebugCode(null);
    setOtpToken(null);
    setVerifyError(null);
    setVerifyState("idle");

    if (!tenantId.trim() || !guardianPhone.trim()) {
      setRequestError(
        "Please enter your school tenant ID and phone number."
      );
      return;
    }

    try {
      setRequestState("loading");
      const body = {
        tenantId: tenantId.trim(),
        guardianPhone: guardianPhone.trim(),
      };

      const res = await fetch("/api/parent/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.error(
          "[ParentLoginPage] Failed to parse OTP request JSON:",
          text
        );
        setRequestState("error");
        setRequestError(
          "Server returned an invalid response. Please try again."
        );
        return;
      }

      if (!res.ok || !json.ok) {
        const msg =
          (json && json.error) ||
          `Failed to request OTP. HTTP ${res.status}.`;
        console.error("[ParentLoginPage] OTP request error:", msg);
        setRequestState("error");
        setRequestError(String(msg));
        return;
      }

      // Expected shape:
      // { ok: true, token: "...", validForMinutes: 10, debugCode?: "123456" }
      setOtpToken(json.token ?? null);
      setDebugCode(json.debugCode ?? null);
      setRequestState("success");
    } catch (err) {
      console.error("[ParentLoginPage] OTP request exception:", err);
      setRequestState("error");
      setRequestError(
        "Something went wrong while requesting your OTP. Please try again."
      );
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError(null);

    if (!tenantId.trim() || !guardianPhone.trim()) {
      setVerifyError(
        "Tenant ID and phone number are required to verify the OTP."
      );
      return;
    }

    if (!otpToken) {
      setVerifyError(
        "No OTP token found. Please request a code first."
      );
      return;
    }

    if (!code.trim()) {
      setVerifyError("Please enter the code you received.");
      return;
    }

    try {
      setVerifyState("loading");

      const body = {
        guardianPhone: guardianPhone.trim(),
        code: code.trim(),
        token: otpToken,
      };

      const res = await fetch("/api/parent/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.error(
          "[ParentLoginPage] Failed to parse OTP verify JSON:",
          text
        );
        setVerifyState("error");
        setVerifyError(
          "Server returned an invalid response. Please try again."
        );
        return;
      }

      if (!res.ok || !json.ok) {
        const msg =
          (json && json.error) ||
          `Failed to verify OTP. HTTP ${res.status}.`;
        console.error("[ParentLoginPage] OTP verify error:", msg);
        setVerifyState("error");
        setVerifyError(String(msg));
        return;
      }

      // On success, redirect parent into /parent with prefilled tenant + phone
      setVerifyState("success");

      const params = new URLSearchParams({
        tenantId: tenantId.trim(),
        guardianPhone: guardianPhone.trim(),
      });

      router.push(`/parent?${params.toString()}`);
    } catch (err) {
      console.error("[ParentLoginPage] OTP verify exception:", err);
      setVerifyState("error");
      setVerifyError(
        "Something went wrong while verifying your code. Please try again."
      );
    }
  }

  const hasRequestedSuccessfully = requestState === "success";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 space-y-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Parent login (OTP)
          </h1>
          <p className="text-sm text-slate-600">
            Enter your phone number and we&apos;ll send you a one-time
            code (OTP). Use that code to access your child&apos;s
            EduLife OS information without a password.
          </p>
        </header>

        {/* Step 1: Request OTP */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Step 1 – Request code
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Use the same phone number the school has on record for you.
          </p>

          {requestError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {requestError}
            </div>
          )}

          <form onSubmit={handleRequestOtp} className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Tenant ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="School tenant ID"
              />
              <p className="text-[11px] text-slate-500">
                Demo:{" "}
                <span className="font-mono">
                  {DEFAULT_TENANT_ID}
                </span>
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Your phone number
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0240000000"
              />
              <p className="text-[11px] text-slate-500">
                Must match the phone number stored in the school&apos;s
                records.
              </p>
            </div>

            <button
              type="submit"
              disabled={requestState === "loading"}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestState === "loading"
                ? "Requesting code..."
                : "Send me a code"}
            </button>

            {requestState === "success" && (
              <p className="text-[11px] text-emerald-700">
                If this phone number is valid, an SMS code has been
                sent. Enter it below to continue.
              </p>
            )}

            {/* Developer / testing helper: show debug code if returned */}
            {debugCode && (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <div className="font-semibold">
                  Developer testing note (will be hidden in production)
                </div>
                <div className="mt-1">
                  Debug code from API:{" "}
                  <span className="font-mono font-semibold">
                    {debugCode}
                  </span>
                </div>
              </div>
            )}
          </form>
        </section>

        {/* Step 2: Verify OTP */}
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Step 2 – Enter code
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            After you receive the SMS, enter the code here. If you
            didn&apos;t receive it, request a new one above.
          </p>

          {verifyError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {verifyError}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Code from SMS
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 123456"
              />
            </div>

            <button
              type="submit"
              disabled={
                verifyState === "loading" || !hasRequestedSuccessfully
              }
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifyState === "loading"
                ? "Verifying..."
                : "Verify and continue"}
            </button>

            {hasRequestedSuccessfully && !otpToken && (
              <p className="text-[11px] text-amber-700">
                No OTP token stored. You may need to request a new code
                above.
              </p>
            )}

            {verifyState === "success" && (
              <p className="text-[11px] text-emerald-700">
                Verified! Redirecting to your parent dashboard…
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
};

export default ParentLoginPage;
