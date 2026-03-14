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

function shellSectionClass() {
  return "rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]";
}

function optionCardClass(active = false) {
  return [
    "w-full rounded-2xl border px-3 py-3 text-left transition",
    active
      ? "border-emerald-300/25 bg-emerald-400/12"
      : "border-white/10 bg-[#07111F]/80 hover:bg-white/8",
  ].join(" ");
}

function ParentLoginFallback() {
  return (
    <main className="os-auth-shell flex items-center justify-center px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:block" />
        <section className="os-auth-card rounded-[32px] p-6 sm:p-8">
          <div className="os-skeleton-line h-6 w-40" />
          <div className="os-skeleton-line mt-4 h-12 w-full" />
          <div className="os-skeleton-line mt-3 h-28 w-full" />
          <div className="os-skeleton-line mt-3 h-24 w-full" />
          <div className="os-skeleton-line mt-3 h-24 w-full" />
        </section>
      </div>
    </main>
  );
}

function ParentLoginContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = useMemo(() => safeInternalPath(sp.get("next"), "/parent-portal"), [sp]);

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
        const res = await fetch(`/api/public/schools/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const json: any = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          setSchools([]);
          setSchoolErr(json?.error || `Failed to load schools (HTTP ${res.status}).`);
          return;
        }

        setSchools(Array.isArray(json.items) ? (json.items as SchoolItem[]) : []);
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
      setRequestError(`Please wait ${fmtCountdown(cooldownSeconds)} before requesting again.`);
      return;
    }

    try {
      setRequestState("loading");

      const res = await fetch("/api/parent/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId: selectedSchool.id, guardianPhone: phone }),
      });

      const json: any = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        setRequestState("error");
        setRequestError(json?.error || `Failed to request OTP (HTTP ${res.status}).`);
        return;
      }

      if (json.token) setOtpToken(String(json.token));
      setDebugCode(json?.debugCode ? String(json.debugCode) : null);

      const cd = Number(json.cooldownSecondsRemaining ?? 0);
      if (Number.isFinite(cd) && cd > 0) setCooldownSeconds(Math.trunc(cd));

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

      const json: any = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        setVerifyState("error");
        setVerifyError(json?.error || `Failed to verify OTP (HTTP ${res.status}).`);
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
  const sendDisabled = requestState === "loading" || !selectedSchool || cooldownSeconds > 0;

  return (
    <main className="os-auth-shell px-4 py-8 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Parent Portal
            </div>

            <div className="mt-6">
              <FormLogo />
            </div>

            <h1 className="mt-8 text-3xl font-semibold tracking-tight text-[#F7F4ED]">
              Parent login made simple.
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-7 text-[#C9CDD6]">
              Choose your school, confirm your phone number, receive a one-time code, and enter your child’s portal safely.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-[#F7F4ED]">What you can access</div>
              <ul className="mt-3 space-y-2 text-sm text-[#C9CDD6]">
                <li>• Attendance and punctuality signal</li>
                <li>• Health visibility and alerts</li>
                <li>• Released performance and reports</li>
                <li>• Calm, school-linked parent access</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 p-4 text-sm text-emerald-100">
              Use the same guardian phone number stored in the school records.
            </div>
          </div>
        </section>

        <section className="os-auth-card rounded-[32px] p-5 sm:p-7">
          <header className="mb-5 space-y-2 lg:hidden">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Parent Portal
            </div>
            <div className="pt-1">
              <FormLogo />
            </div>
            <h1 className="text-2xl font-semibold text-[#F7F4ED]">Parent login</h1>
            <p className="text-sm leading-6 text-[#C9CDD6]">
              Choose your school, enter your phone number, and we’ll send a one-time code.
            </p>
          </header>

          <div className="hidden lg:block">
            <h2 className="text-2xl font-semibold text-[#F7F4ED]">Parent login</h2>
            <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
              Secure access for parents and guardians using school-linked OTP verification.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <section className={shellSectionClass()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#F7F4ED]">Step 1 — Choose your school</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-[#D7DCE5]">
                  Required
                </span>
              </div>

              {selectedSchool ? (
                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-3">
                  <div className="text-sm font-semibold text-[#F7F4ED]">{selectedSchool.name}</div>
                  <div className="mt-1 text-[11px] text-[#D7DCE5]">{schoolSubtitle(selectedSchool) || "—"}</div>
                  <button
                    type="button"
                    onClick={() => setSelectedSchool(null)}
                    className="os-btn-secondary mt-3 px-3 py-2 text-[11px] font-medium"
                  >
                    Change school
                  </button>
                </div>
              ) : (
                <>
                  {schoolErr ? (
                    <div className="os-error-banner mt-3 rounded-xl px-3 py-2 text-[11px]">
                      {schoolErr}
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-1">
                    <label className="os-label text-[11px]">Search school name</label>
                    <input
                      className="os-input"
                      value={schoolQuery}
                      onChange={(e) => setSchoolQuery(e.target.value)}
                      placeholder="e.g. Ayitikope"
                      autoComplete="off"
                    />
                    <p className="os-helper">
                      Type at least 2 letters. If you can’t find your school, contact the headteacher or ICT lead.
                    </p>
                  </div>

                  <div className="mt-3 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#07111F]/60">
                    {schoolLoading ? (
                      <div className="p-3 text-[11px] text-[#C9CDD6]">Searching…</div>
                    ) : schools.length === 0 ? (
                      <div className="p-3 text-[11px] text-[#AEB6C4]">No schools found yet.</div>
                    ) : (
                      <ul className="space-y-2 p-2">
                        {schools.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSchool(s);
                                setSchools([]);
                                setSchoolQuery(s.name);
                              }}
                              className={optionCardClass(false)}
                            >
                              <div className="text-sm font-semibold text-[#F7F4ED]">{s.name}</div>
                              <div className="mt-1 text-[11px] text-[#AEB6C4]">{schoolSubtitle(s) || "—"}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className={shellSectionClass()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#F7F4ED]">Step 2 — Request code</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-[#D7DCE5]">
                  OTP
                </span>
              </div>

              {requestError ? (
                <div className="os-error-banner mt-3 rounded-xl px-3 py-2 text-[11px]">
                  {requestError}
                </div>
              ) : null}

              {requestState === "success" ? (
                <div className="os-success-banner mt-3 rounded-xl px-3 py-2 text-[11px]">
                  Code sent. Enter it below to continue.
                  {cooldownSeconds > 0 ? (
                    <div className="mt-1 text-[10px] text-emerald-100/90">
                      You can resend in <span className="font-mono">{fmtCountdown(cooldownSeconds)}</span>.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <form onSubmit={handleRequestOtp} className="mt-3 space-y-3">
                <div className="space-y-1">
                  <label className="os-label text-[11px]">Your phone number</label>
                  <input
                    className="os-input"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="e.g. 0553690424"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <p className="os-helper">Use the same number stored in the school records.</p>
                </div>

                <button
                  type="submit"
                  disabled={sendDisabled}
                  className="os-btn-primary inline-flex items-center px-4 py-2 text-sm"
                >
                  {requestState === "loading"
                    ? "Requesting…"
                    : cooldownSeconds > 0
                      ? `Resend in ${fmtCountdown(cooldownSeconds)}`
                      : "Send code"}
                </button>

                {debugCode ? (
                  <div className="mt-2 rounded-xl border border-dashed border-white/15 bg-[#07111F]/60 px-3 py-3 text-[11px] text-[#D7DCE5]">
                    <div className="font-semibold text-[#F7F4ED]">Local test code</div>
                    <div className="mt-1 text-[#AEB6C4]">This should not appear in production.</div>
                    <div className="mt-2 font-mono text-base tracking-[0.2em] text-[#E8C96A]">{debugCode}</div>
                  </div>
                ) : null}
              </form>
            </section>

            <section className={shellSectionClass()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#F7F4ED]">Step 3 — Verify code</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-[#D7DCE5]">
                  Secure entry
                </span>
              </div>

              {verifyError ? (
                <div className="os-error-banner mt-3 rounded-xl px-3 py-2 text-[11px]">
                  {verifyError}
                </div>
              ) : null}

              <form onSubmit={handleVerifyOtp} className="mt-3 space-y-3">
                <div className="space-y-1">
                  <label className="os-label text-[11px]">6-digit code</label>
                  <input
                    className="os-input tracking-[0.3em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. 333138"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>

                <button
                  type="submit"
                  disabled={verifyState === "loading" || !requested}
                  className="os-btn-primary inline-flex items-center px-4 py-2 text-sm"
                >
                  {verifyState === "loading" ? "Verifying…" : "Verify & continue"}
                </button>

                {verifyState === "success" ? (
                  <p className="text-[11px] text-emerald-100">Verified. Redirecting…</p>
                ) : null}
              </form>
            </section>
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