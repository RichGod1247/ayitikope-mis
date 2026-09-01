// src/app/parent/login/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FormLogo from "@/components/FormLogo";

type RequestState = "idle" | "loading" | "success" | "error";
type VerifyState = "idle" | "loading" | "success" | "error";

type SchoolItem = {
  id: string; // internal tenantId (never shown)
  name: string;
  district: string | null;
  circuit: string | null;
  region: string | null;
  gpsAddress: string | null;
  schoolCode: string;
  emisCode: string | null;
};

type SchoolSearchResponse = {
  ok?: boolean;
  items?: SchoolItem[];
  error?: string;
};

type OtpRequestResponse = {
  ok?: boolean;
  token?: string;
  debugCode?: string;
  cooldownSecondsRemaining?: number;
  error?: string;
};

type OtpVerifyResponse = {
  ok?: boolean;
  error?: string;
};

function safeInternalPath(v: string | null | undefined, fallback: string) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("//")) return fallback;
  if (s.includes("://")) return fallback;
  return s;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function schoolSubtitle(s: SchoolItem) {
  const parts = [s.district, s.circuit, s.region].filter(Boolean);
  return parts.length ? parts.join(" • ") : s.gpsAddress || "";
}

function fmtCountdown(secs: number) {
  const s = Math.max(0, Math.trunc(secs));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function stepCardClass() {
  return "rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-3.5 sm:p-4 shadow-[0_12px_36px_rgba(0,0,0,0.14)]";
}

function optionCardClass() {
  return "w-full rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-2.5 text-left transition hover:bg-white/8";
}

function StepHeading({
  number,
  title,
  badge,
}: {
  number: string;
  title: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E8C96A]/30 bg-[#E8C96A]/10 text-[11px] font-bold text-[#E8C96A]">
          {number}
        </span>
        <h3 className="truncate text-[13px] font-semibold text-[#F7F4ED] sm:text-sm">
          {title}
        </h3>
      </div>
      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#BFC6D2]">
        {badge}
      </span>
    </div>
  );
}

function ParentLoginFallback() {
  return (
    <main className="os-auth-shell flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="os-auth-brand hidden min-h-[560px] rounded-[26px] p-6 lg:block" />
        <section className="os-auth-card rounded-[26px] p-4 sm:p-5">
          <div className="os-skeleton-line h-5 w-32" />
          <div className="os-skeleton-line mt-3 h-10 w-full" />
          <div className="os-skeleton-line mt-3 h-36 w-full" />
          <div className="os-skeleton-line mt-3 h-28 w-full" />
        </section>
      </div>
    </main>
  );
}

function ParentLoginContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = useMemo(
    () => safeInternalPath(sp.get("next"), "/parent-portal"),
    [sp]
  );

  const [schoolQuery, setSchoolQuery] = useState("");
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolErr, setSchoolErr] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolItem | null>(null);

  const [guardianPhone, setGuardianPhone] = useState("");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);

  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  const [code, setCode] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSeconds]);

  useEffect(() => {
    const q = clean(schoolQuery);
    setSchoolErr(null);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setSchools([]);
      setSchoolLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setSchoolLoading(true);
        const res = await fetch(
          `/api/public/schools/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as
          | SchoolSearchResponse
          | null;

        if (!res.ok || !json?.ok) {
          setSchools([]);
          setSchoolErr(
            json?.error || `Failed to load schools (HTTP ${res.status}).`
          );
          return;
        }

        setSchools(Array.isArray(json.items) ? json.items : []);
      } catch (e) {
        console.error("[PARENT_SCHOOL_SEARCH_ERROR]", e);
        setSchools([]);
        setSchoolErr("Network error while searching schools. Try again.");
      } finally {
        setSchoolLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [schoolQuery]);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();

    setRequestError(null);
    setDebugCode(null);
    setVerifyError(null);
    setVerifyState("idle");

    const phone = guardianPhone.trim();

    if (!selectedSchool) {
      setRequestError("Select your school first.");
      return;
    }
    if (!phone) {
      setRequestError("Enter your phone number.");
      return;
    }

    if (cooldownSeconds > 0) {
      setRequestError(
        `Please wait ${fmtCountdown(cooldownSeconds)} before requesting again.`
      );
      return;
    }

    try {
      setRequestState("loading");

      const res = await fetch("/api/parent/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId: selectedSchool.id,
          guardianPhone: phone,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as OtpRequestResponse;

      if (!res.ok || !json?.ok) {
        setRequestState("error");
        setRequestError(
          json?.error || `Failed to request OTP (HTTP ${res.status}).`
        );
        return;
      }

      if (json.token) setOtpToken(String(json.token));
      setDebugCode(json?.debugCode ? String(json.debugCode) : null);

      const cd = Number(json.cooldownSecondsRemaining ?? 0);
      if (Number.isFinite(cd) && cd > 0) {
        setCooldownSeconds(Math.trunc(cd));
      }

      setRequestState("success");
    } catch (err) {
      console.error("[PARENT_LOGIN_REQUEST_OTP_ERROR]", err);
      setRequestState("error");
      setRequestError("Network/server error while requesting OTP. Try again.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError(null);

    const tok = String(otpToken ?? "").trim();
    const c = code.trim();

    if (!tok) {
      setVerifyError("Request a code first.");
      return;
    }
    if (!c) {
      setVerifyError("Enter the 6-digit code.");
      return;
    }

    try {
      setVerifyState("loading");

      const res = await fetch("/api/parent/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: tok, code: c }),
      });

      const json = (await res.json().catch(() => ({}))) as OtpVerifyResponse;

      if (!res.ok || !json?.ok) {
        setVerifyState("error");
        setVerifyError(
          json?.error || `Failed to verify OTP (HTTP ${res.status}).`
        );
        return;
      }

      setVerifyState("success");
      router.replace(nextPath);
    } catch (err) {
      console.error("[PARENT_LOGIN_VERIFY_OTP_ERROR]", err);
      setVerifyState("error");
      setVerifyError("Network/server error while verifying. Try again.");
    }
  }

  const requested = requestState === "success";
  const schoolSearchStarted = clean(schoolQuery).length >= 2;
  const sendDisabled =
    requestState === "loading" || !selectedSchool || cooldownSeconds > 0;

  return (
    <main className="os-auth-shell flex items-center px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="os-auth-brand hidden min-h-[560px] rounded-[26px] p-6 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E8C96A]">
              Secure parent access
            </div>

            <div className="mt-4 w-fit origin-left scale-90">
              <FormLogo />
            </div>

            <h1 className="mt-5 max-w-sm text-2xl font-semibold tracking-tight text-[#F7F4ED]">
              Your child’s school, securely connected.
            </h1>

            <p className="mt-2.5 max-w-md text-[13px] leading-6 text-[#C9CDD6]">
              Choose the school, confirm the guardian phone on record, and use
              the one-time code sent to you.
            </p>

            <div className="mt-5 grid gap-2 text-[11px] text-[#D7DCE5]">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                School-linked OTP verification
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                Signed Parent Portal session
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                Access stays tied to the guardian record
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-3 text-[11px] leading-5 text-emerald-100">
            Use the same phone number held by the school. EduLife OS never asks
            parents to remember a portal password.
          </div>
        </section>

        <section className="os-auth-card rounded-[26px] p-4 sm:p-5">
          <header className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="lg:hidden">
                  <div className="w-fit origin-left scale-[0.82]">
                    <FormLogo />
                  </div>
                </div>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#E8C96A] lg:mt-0">
                  Parent Portal
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#F7F4ED] sm:text-[22px]">
                  Secure sign in
                </h2>
                <p className="mt-1 max-w-xl text-[12px] leading-5 text-[#BFC6D2] sm:text-[13px]">
                  School, guardian phone, then your 6-digit code.
                </p>
              </div>

              <div className="hidden rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-100 sm:block">
                OTP protected
              </div>
            </div>
          </header>

          <div className="space-y-3">
            <section className={stepCardClass()}>
              <StepHeading number="1" title="Choose your school" badge="Required" />

              {selectedSchool ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[#F7F4ED]">
                      {selectedSchool.name}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[#BFC6D2]">
                      {schoolSubtitle(selectedSchool) || "School selected"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSchool(null)}
                    className="os-btn-secondary shrink-0 px-3 py-1.5 text-[10px] font-semibold"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  {schoolErr ? (
                    <div className="os-error-banner mb-2 rounded-xl px-3 py-2 text-[11px]">
                      {schoolErr}
                    </div>
                  ) : null}

                  <label className="os-label text-[10px]">School name</label>
                  <input
                    className="os-input mt-1"
                    value={schoolQuery}
                    onChange={(e) => setSchoolQuery(e.target.value)}
                    placeholder="e.g. Ayitikope"
                    autoComplete="off"
                  />
                  <p className="os-helper mt-1">
                    Type at least 2 letters, then choose your school.
                  </p>

                  {schoolSearchStarted ? (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-[#07111F]/60">
                      {schoolLoading ? (
                        <div className="p-2.5 text-[11px] text-[#C9CDD6]">
                          Searching…
                        </div>
                      ) : schools.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-[#AEB6C4]">
                          No matching school found.
                        </div>
                      ) : (
                        <ul className="space-y-1.5 p-1.5">
                          {schools.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSchool(s);
                                  setSchools([]);
                                  setSchoolQuery(s.name);
                                }}
                                className={optionCardClass()}
                              >
                                <div className="text-[12px] font-semibold text-[#F7F4ED]">
                                  {s.name}
                                </div>
                                <div className="mt-0.5 text-[10px] leading-4 text-[#AEB6C4]">
                                  {schoolSubtitle(s) || "School"}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className={stepCardClass()}>
              <StepHeading number="2" title="Confirm guardian phone" badge="OTP" />

              {requestError ? (
                <div className="os-error-banner mt-2.5 rounded-xl px-3 py-2 text-[11px]">
                  {requestError}
                </div>
              ) : null}

              {requested ? (
                <div className="os-success-banner mt-2.5 rounded-xl px-3 py-2 text-[11px]">
                  Code sent to the guardian number.
                  {cooldownSeconds > 0 ? (
                    <span className="ml-1 text-[10px] text-emerald-100/90">
                      Resend in{" "}
                      <span className="font-mono">
                        {fmtCountdown(cooldownSeconds)}
                      </span>
                      .
                    </span>
                  ) : null}
                </div>
              ) : null}

              <form onSubmit={handleRequestOtp} className="mt-3">
                <label className="os-label text-[10px]">Phone number</label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="os-input flex-1"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="e.g. 0553690424"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <button
                    type="submit"
                    disabled={sendDisabled}
                    className="os-btn-primary inline-flex min-h-10 shrink-0 items-center justify-center px-4 py-2 text-[12px] font-semibold sm:min-w-28"
                  >
                    {requestState === "loading"
                      ? "Sending…"
                      : cooldownSeconds > 0
                        ? fmtCountdown(cooldownSeconds)
                        : requested
                          ? "Resend"
                          : "Send code"}
                  </button>
                </div>
                <p className="os-helper mt-1">
                  Use the same number stored in the school records.
                </p>

                {debugCode ? (
                  <div className="mt-2 rounded-xl border border-dashed border-white/15 bg-[#07111F]/60 px-3 py-2 text-[10px] text-[#D7DCE5]">
                    Local test code:{" "}
                    <span className="ml-1 font-mono text-[13px] tracking-[0.18em] text-[#E8C96A]">
                      {debugCode}
                    </span>
                  </div>
                ) : null}
              </form>
            </section>

            {/* Progressive disclosure: verification appears only after a code is sent. */}
            {requested ? (
              <section className={stepCardClass()}>
                <StepHeading number="3" title="Verify security code" badge="Secure" />

                {verifyError ? (
                  <div className="os-error-banner mt-2.5 rounded-xl px-3 py-2 text-[11px]">
                    {verifyError}
                  </div>
                ) : null}

                <form onSubmit={handleVerifyOtp} className="mt-3">
                  <label className="os-label text-[10px]">6-digit code</label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="os-input flex-1 tracking-[0.24em]"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. 333138"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                    <button
                      type="submit"
                      disabled={verifyState === "loading"}
                      className="os-btn-primary inline-flex min-h-10 shrink-0 items-center justify-center px-4 py-2 text-[12px] font-semibold sm:min-w-36"
                    >
                      {verifyState === "loading"
                        ? "Verifying…"
                        : "Verify & continue"}
                    </button>
                  </div>

                  {verifyState === "success" ? (
                    <p className="mt-2 text-[11px] text-emerald-100">
                      Verified. Redirecting…
                    </p>
                  ) : null}
                </form>
              </section>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-[9px] text-[#8F99A8]">
            <span>School-linked access</span>
            <span>One-time code • Signed session</span>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ParentLoginPage() {
  return (
    <Suspense fallback={<ParentLoginFallback />}>
      <ParentLoginContent />
    </Suspense>
  );
}
