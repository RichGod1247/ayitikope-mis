// src/app/parent/report/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ParentChild = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  classroom: {
    id: string;
    name: string;
    grade?: string | null;
    arm?: string | null;
  } | null;
};

type ChildrenResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
  guardianPhone: string | null;
  students: ParentChild[];
  count: number;
};

type ReleaseStatusResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
  studentId?: string;
  term?: string;
  academicYear?: string;
  released?: boolean;
  release?: {
    scope: string;
    scopeKey: string;
    releasedAt: string;
  } | null;
};

const DEFAULT_TERM = "1st Term";
const DEFAULT_YEAR = "2025/2026";

const TERM_OPTIONS = ["1st Term", "2nd Term", "3rd Term"];

function looksLikeErrorCode(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return /^[A-Z0-9_]+$/.test(s);
}

function readableApiMessage(
  payload: any,
  status: number,
  fallback: string
): string {
  const candidates = [
    payload?.message,
    payload?.errorMessage,
    payload?.detail,
    payload?.error,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const firstHuman = candidates.find((v) => !looksLikeErrorCode(v));
  if (firstHuman) return firstHuman;

  if (status === 401) {
    return "Your parent session has expired. Please log in again.";
  }

  if (status === 403) {
    if (payload?.error === "RESULTS_NOT_RELEASED") {
      return "Report not yet released by the Headteacher.";
    }
    if (payload?.error === "GUARDIAN_MISMATCH") {
      return "This child is not linked to your parent login.";
    }
    return "You are not allowed to view this report.";
  }

  if (status === 404) {
    return "The selected learner could not be found.";
  }

  return fallback;
}

async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function classLabel(child: ParentChild | null): string {
  if (!child?.classroom) return "Class not assigned";

  const parts = [
    child.classroom.name || child.classroom.grade || "",
    child.classroom.arm || "",
  ]
    .map((x) => String(x).trim())
    .filter(Boolean);

  return parts.length ? parts.join(" ") : "Class not assigned";
}

function formatReleaseDate(value: string | null | undefined): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildPrintHref(studentId: string, term: string, academicYear: string) {
  const params = new URLSearchParams({ studentId, term, academicYear });
  return `/parent/report/print?${params.toString()}`;
}

function shellCardClass() {
  return "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.22)]";
}

export default function ParentReportPage() {
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [academicYear, setAcademicYear] = useState(DEFAULT_YEAR);

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [guardianPhone, setGuardianPhone] = useState<string | null>(null);

  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseStatus, setReleaseStatus] =
    useState<ReleaseStatusResponse | null>(null);

  const [sessionExpired, setSessionExpired] = useState(false);

  const selectedChild = useMemo(() => {
    return children.find((child) => child.id === selectedChildId) ?? null;
  }, [children, selectedChildId]);

  const released = !!releaseStatus?.released;
  const releasedHref =
    selectedChildId && released
      ? buildPrintHref(selectedChildId, term, academicYear)
      : "";

  const loadChildren = useCallback(async () => {
    setChildrenLoading(true);
    setChildrenError(null);
    setSessionExpired(false);

    try {
      const res = await fetch("/api/parent/children", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const data = await readJsonResponse<ChildrenResponse>(res);

      const unauthorized =
        res.status === 401 || data?.error === "UNAUTHORIZED_PARENT";

      if (unauthorized) {
        setSessionExpired(true);
        setChildren([]);
        setSelectedChildId(null);
        setGuardianPhone(null);
        return;
      }

      if (!res.ok || !data?.ok) {
        setChildrenError(
          readableApiMessage(data, res.status, "Failed to load your children.")
        );
        setChildren([]);
        setSelectedChildId(null);
        return;
      }

      const nextChildren = Array.isArray(data.students) ? data.students : [];

      setChildren(nextChildren);
      setGuardianPhone(data.guardianPhone || null);

      setSelectedChildId((prev) => {
        if (prev && nextChildren.some((child) => child.id === prev)) {
          return prev;
        }
        return nextChildren[0]?.id ?? null;
      });
    } catch (err) {
      console.error("[PARENT_REPORT_SELECTOR_CHILDREN_ERROR]", err);
      setChildrenError("Network error loading your children.");
      setChildren([]);
      setSelectedChildId(null);
    } finally {
      setChildrenLoading(false);
    }
  }, []);

  const loadReleaseStatus = useCallback(
    async (studentId: string, termValue: string, yearValue: string) => {
      setReleaseLoading(true);
      setReleaseError(null);
      setReleaseStatus(null);
      setSessionExpired(false);

      try {
        const params = new URLSearchParams({
          studentId,
          term: termValue,
          academicYear: yearValue,
        });

        const res = await fetch(`/api/parent/report/release-status?${params}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const data = await readJsonResponse<ReleaseStatusResponse>(res);

        const unauthorized =
          res.status === 401 || data?.error === "UNAUTHORIZED_PARENT";

        if (unauthorized) {
          setSessionExpired(true);
          setReleaseStatus(null);
          return;
        }

        if (!res.ok || !data?.ok) {
          setReleaseError(
            readableApiMessage(
              data,
              res.status,
              "Failed to check report release status."
            )
          );
          setReleaseStatus(null);
          return;
        }

        setReleaseStatus(data);
      } catch (err) {
        console.error("[PARENT_REPORT_RELEASE_STATUS_ERROR]", err);
        setReleaseError("Network error checking report release status.");
        setReleaseStatus(null);
      } finally {
        setReleaseLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    if (sessionExpired) return;

    if (!selectedChildId) {
      setReleaseStatus(null);
      setReleaseError(null);
      return;
    }

    void loadReleaseStatus(selectedChildId, term, academicYear);
  }, [sessionExpired, selectedChildId, term, academicYear, loadReleaseStatus]);

  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#05070B_0%,#071A3D_55%,#05070B_100%)] text-[#F7F4ED]">
        <div className="mx-auto max-w-md px-4 py-10">
          <div className={`${shellCardClass()} p-6`}>
            <div className="inline-flex rounded-full border border-rose-300/20 bg-rose-400/12 px-3 py-1 text-[11px] font-semibold text-rose-100">
              Parent session required
            </div>

            <h1 className="mt-3 text-lg font-semibold text-[#F7F4ED]">
              Please log in again
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#C9CDD6]">
              Your parent session has expired or is missing. For learner safety,
              reports can only be checked after a verified parent login.
            </p>

            <a
              href="/parent/login?next=/parent/report"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-xs font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105"
            >
              Go to parent login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#05070B_0%,#071A3D_52%,#05070B_100%)] text-[#F7F4ED]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`${shellCardClass()} relative overflow-hidden p-5 sm:p-6`}>
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/12 px-3 py-1 text-[11px] font-semibold text-[#E8C96A]">
                EduLife OS · Parent Reports
              </div>

              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#F7F4ED] sm:text-3xl">
                Released report cards
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#C9CDD6]">
                Select your child, term, and academic year. EduLife OS will show
                the report only after the Headteacher has officially released it.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-xs text-[#C9CDD6]">
              <div className="font-semibold text-[#F7F4ED]">Parent access</div>
              <div className="mt-1">
                {guardianPhone ? `Verified phone: ${guardianPhone}` : "Phone verified by OTP"}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <section className={`${shellCardClass()} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#F7F4ED]">
                  1. Select learner
                </h2>
                <p className="mt-1 text-[11px] text-[#AEB6C4]">
                  Only children linked to your verified parent phone are shown.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadChildren()}
                disabled={childrenLoading}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {childrenLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {childrenLoading ? (
                <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-5 text-center text-xs text-[#C9CDD6]">
                  Loading linked learners…
                </div>
              ) : childrenError ? (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-xs text-rose-100">
                  {childrenError}
                </div>
              ) : children.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-center text-xs text-[#C9CDD6]">
                  No learner is currently linked to this parent login.
                </div>
              ) : (
                children.map((child) => {
                  const active = child.id === selectedChildId;

                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedChildId(child.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-[#D4AF37]/45 bg-[#D4AF37]/12 shadow-[0_14px_40px_rgba(212,175,55,0.12)]"
                          : "border-white/10 bg-[#07111F]/70 hover:border-white/20 hover:bg-white/8"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#F7F4ED]">
                            {child.name || "Unnamed learner"}
                          </div>
                          <div className="mt-1 text-[11px] text-[#AEB6C4]">
                            {classLabel(child)}
                          </div>
                        </div>

                        {active && (
                          <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 text-[10px] font-bold text-[#071A3D]">
                            Selected
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <h2 className="text-sm font-semibold text-[#F7F4ED]">
                2. Select report period
              </h2>

              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[#C9CDD6]">
                    Term
                  </span>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] outline-none ring-0 transition focus:border-[#D4AF37]/55"
                  >
                    {TERM_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-medium text-[#C9CDD6]">
                    Academic year
                  </span>
                  <input
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2025/2026"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] outline-none ring-0 transition placeholder:text-white/30 focus:border-[#D4AF37]/55"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className={`${shellCardClass()} p-5 sm:p-6`}>
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#F7F4ED]">
                  Report release status
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#AEB6C4]">
                  This page does not load raw results. It only checks whether
                  the Headteacher has released the selected report.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (selectedChildId) {
                    void loadReleaseStatus(selectedChildId, term, academicYear);
                  }
                }}
                disabled={!selectedChildId || releaseLoading}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {releaseLoading ? "Checking…" : "Check again"}
              </button>
            </div>

            <div className="mt-5">
              {!selectedChild ? (
                <div className="rounded-[24px] border border-dashed border-white/15 bg-white/5 px-5 py-8 text-center">
                  <div className="text-sm font-semibold text-[#F7F4ED]">
                    Select a learner first
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[#C9CDD6]">
                    Choose one of your linked children to check whether their
                    report has been released.
                  </p>
                </div>
              ) : releaseLoading ? (
                <div className="rounded-[24px] border border-white/10 bg-[#07111F]/70 px-5 py-8 text-center">
                  <div className="text-sm font-semibold text-[#F7F4ED]">
                    Checking Headteacher release…
                  </div>
                  <p className="mt-2 text-xs text-[#C9CDD6]">
                    Please wait while EduLife OS checks the official release
                    record.
                  </p>
                </div>
              ) : releaseError ? (
                <div className="rounded-[24px] border border-rose-300/20 bg-rose-400/12 px-5 py-5">
                  <div className="text-sm font-semibold text-rose-100">
                    Report status could not be confirmed
                  </div>
                  <p className="mt-2 text-xs leading-6 text-rose-100/90">
                    {releaseError}
                  </p>
                </div>
              ) : released ? (
                <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/12 px-5 py-5">
                  <div className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                    Released by Headteacher
                  </div>

                  <h3 className="mt-4 text-xl font-semibold text-[#F7F4ED]">
                    {selectedChild.name || "Selected learner"}’s report is ready.
                  </h3>

                  <div className="mt-2 grid gap-2 text-xs text-[#C9CDD6] sm:grid-cols-2">
                    <div>
                      <span className="text-[#AEB6C4]">Class: </span>
                      <span className="font-semibold text-[#F7F4ED]">
                        {classLabel(selectedChild)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#AEB6C4]">Period: </span>
                      <span className="font-semibold text-[#F7F4ED]">
                        {term} · {academicYear}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#AEB6C4]">Release scope: </span>
                      <span className="font-semibold text-[#F7F4ED]">
                        {releaseStatus?.release?.scope === "SCHOOL"
                          ? "Whole school"
                          : "Classroom"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#AEB6C4]">Released on: </span>
                      <span className="font-semibold text-[#F7F4ED]">
                        {formatReleaseDate(releaseStatus?.release?.releasedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={releasedHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-2.5 text-xs font-bold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105"
                    >
                      View Released Report
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-5 py-5">
                  <div className="inline-flex rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold text-[#E8C96A]">
                    Not released yet
                  </div>

                  <h3 className="mt-4 text-xl font-semibold text-[#F7F4ED]">
                    Report not yet released by the Headteacher.
                  </h3>

                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#C9CDD6]">
                    The report for{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {selectedChild.name || "this learner"}
                    </span>{" "}
                    in{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {term} · {academicYear}
                    </span>{" "}
                    is locked until the school officially releases it.
                  </p>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-xs leading-6 text-[#C9CDD6]">
                    This is not an error. It protects academic governance by
                    ensuring parents only see results after Headteacher approval.
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}