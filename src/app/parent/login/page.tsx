// src/app/parent/login/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function ParentLoginFallback() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-6 sm:py-10 space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
            EduLife OS · Parent Portal
          </div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Parent login</h1>
          <p className="text-sm text-slate-600">Loading…</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Preparing parent login…</div>
        </section>
      </div>
    </main>
  );
}

function ParentLoginContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = useMemo(() => safeInternalPath(sp.get("next"), "/parent-portal"), [sp]);

  // School search + selection
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolErr, setSchoolErr] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolItem | null>(null);

  // OTP
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

  // countdown tick
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

      // If server returns a token, update it. If not, keep the old one.
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
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-6 sm:py-10 space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
            EduLife OS · Parent Portal
          </div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Parent login</h1>
          <p className="text-sm text-slate-600">
            Choose your school, enter your phone number, and we&apos;ll send a one-time code.
          </p>
        </header>

        {/* School selection */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Step 1 — Choose your school</h2>

          {selectedSchool ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="text-sm font-semibold text-emerald-900">{selectedSchool.name}</div>
              <div className="text-[11px] text-emerald-800/90">{schoolSubtitle(selectedSchool) || "—"}</div>
              <button
                type="button"
                onClick={() => setSelectedSchool(null)}
                className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-50"
              >
                Change school
              </button>
            </div>
          ) : (
            <>
              {schoolErr ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {schoolErr}
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Search school name</label>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  placeholder="e.g. Ayitikope"
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-500">
                  Type at least 2 letters. If you can’t find your school, contact the headteacher/ICT lead.
                </p>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                {schoolLoading ? (
                  <div className="p-3 text-[11px] text-slate-600">Searching…</div>
                ) : schools.length === 0 ? (
                  <div className="p-3 text-[11px] text-slate-600">No schools found yet.</div>
                ) : (
                  <ul className="divide-y">
                    {schools.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSchools([]);
                            setSchoolQuery(s.name);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        >
                          <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                          <div className="text-[11px] text-slate-500">{schoolSubtitle(s) || "—"}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>

        {/* OTP request */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Step 2 — Request code</h2>

          {requestError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {requestError}
            </div>
          ) : null}

          {requestState === "success" ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              Code sent. Enter it below to continue.
              {cooldownSeconds > 0 ? (
                <div className="mt-1 text-[10px] text-emerald-700">
                  You can resend in <span className="font-mono">{fmtCountdown(cooldownSeconds)}</span>.
                </div>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleRequestOtp} className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">Your phone number</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0553690424"
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="text-[11px] text-slate-500">Use the same number stored in the school records.</p>
            </div>

            <button
              type="submit"
              disabled={sendDisabled}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {requestState === "loading"
                ? "Requesting…"
                : cooldownSeconds > 0
                  ? `Resend in ${fmtCountdown(cooldownSeconds)}`
                  : "Send code"}
            </button>

            {debugCode ? (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                <div className="font-semibold">Local test code (won’t show in production)</div>
                <div className="mt-1 font-mono text-base tracking-[0.2em]">{debugCode}</div>
              </div>
            ) : null}
          </form>
        </section>

        {/* OTP verify */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Step 3 — Verify code</h2>

          {verifyError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {verifyError}
            </div>
          ) : null}

          <form onSubmit={handleVerifyOtp} className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">6-digit code</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tracking-[0.3em]"
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
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {verifyState === "loading" ? "Verifying…" : "Verify & continue"}
            </button>

            {verifyState === "success" ? <p className="text-[11px] text-emerald-700">Verified. Redirecting…</p> : null}
          </form>
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