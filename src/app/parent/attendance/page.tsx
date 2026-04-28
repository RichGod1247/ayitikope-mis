// src/app/parent/attendance/page.tsx
"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Child = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  classroom?: {
    id: string;
    name: string;
    grade?: string | null;
    arm?: string | null;
  } | null;
};

type ChildrenResponse = {
  ok: boolean;
  guardianPhone?: string;
  students?: Child[];
  count?: number;
  error?: string;
};

type AttendanceSummary = {
  totalSessions: number;
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  daysExcused: number;
  attendanceRate: number | null;
  note: string;
};

type AttendanceResponse = {
  ok: boolean;
  studentId?: string;
  term?: string;
  academicYear?: string;
  summary?: AttendanceSummary;
  error?: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

function formatPercent(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "–";
  return `${v.toFixed(1)}%`;
}

function ParentAttendanceSkeleton() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <div className="h-7 w-56 rounded bg-slate-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-white/90 border border-zinc-200 shadow-sm animate-pulse" />
        <div className="h-44 rounded-2xl bg-white/90 border border-zinc-200 shadow-sm animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)] gap-4 md:gap-5">
          <div className="h-80 rounded-2xl bg-white/90 border border-zinc-200 shadow-sm animate-pulse" />
          <div className="h-80 rounded-2xl bg-emerald-50/80 border border-emerald-200 shadow-sm animate-pulse" />
        </div>
      </div>
    </main>
  );
}

function ParentAttendanceInner() {
  const searchParams = useSearchParams();
  const initialTenantId = searchParams.get("tenantId") || "";

  const [tenantId] = useState<string>(initialTenantId);
  const [guardianPhone, setGuardianPhone] = useState<string>("");

  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [children, setChildren] = useState<Child[] | null>(null);
  const [childrenError, setChildrenError] = useState<string>("");

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );

  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [summaryMeta, setSummaryMeta] = useState<{
    term: string;
    academicYear: string;
    studentId: string;
  } | null>(null);
  const [summaryError, setSummaryError] = useState<string>("");

  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const canSearchChildren = useMemo(
    () => guardianPhone.trim().length > 0,
    [guardianPhone]
  );

  const canLoadSummary = useMemo(
    () =>
      Boolean(
        selectedStudentId &&
          term.trim().length > 0 &&
          academicYear.trim().length > 0
      ),
    [selectedStudentId, term, academicYear]
  );

  async function loadChildren() {
    if (!canSearchChildren) return;

    setLoadingChildren(true);
    setChildrenError("");
    setChildren(null);
    setSelectedStudentId(null);
    setSummary(null);
    setSummaryMeta(null);
    setSummaryError("");

    try {
      const url = new URL("/api/parent/children", window.location.origin);
      url.searchParams.set("guardianPhone", guardianPhone.trim());

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as ChildrenResponse;

      if (!res.ok || !json.ok) {
        setChildrenError(
          json.error ||
            "Could not find learners for this phone number. Please check the number or contact the school."
        );
        setChildren(null);
        return;
      }

      const list = Array.isArray(json.students) ? json.students : [];
      setChildren(list);

      if (list.length === 1) {
        setSelectedStudentId(list[0].id);
        // We do NOT auto-load summary yet – parent can press the button.
      }
    } catch {
      setChildrenError(
        "Network or server error while looking up learners. Please try again."
      );
      setChildren(null);
    } finally {
      setLoadingChildren(false);
    }
  }

  async function loadSummary() {
    if (!canLoadSummary || !selectedStudentId) return;

    setLoadingSummary(true);
    setSummaryError("");
    setSummary(null);
    setSummaryMeta(null);

    try {
      const url = new URL(
        "/api/parent/attendance/summary",
        window.location.origin
      );
      url.searchParams.set("studentId", selectedStudentId);
      url.searchParams.set("term", term.trim());
      url.searchParams.set("academicYear", academicYear.trim());

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as AttendanceResponse;

      if (!res.ok || !json.ok) {
        setSummaryError(
          json.error || "Could not load attendance summary for this learner."
        );
        setSummary(null);
        return;
      }

      if (!json.summary) {
        setSummaryError("No attendance summary was returned for this learner.");
        setSummary(null);
        return;
      }

      setSummary(json.summary);
      setSummaryMeta({
        term: json.term || term,
        academicYear: json.academicYear || academicYear,
        studentId: json.studentId || selectedStudentId,
      });
    } catch {
      setSummaryError(
        "Network or server error while loading attendance summary. Please try again."
      );
      setSummary(null);
      setSummaryMeta(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}>
              EduLife OS · Parent · Attendance
            </span>
            {tenantId && (
              <span className="text-[11px] text-zinc-500">
                Tenant demo: <span className="font-mono text-[10px]">{tenantId}</span>
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
                Child attendance snapshot
              </h1>
              <p className="text-sm md:text-base text-zinc-600 max-w-xl">
                This page gives a{" "}
                <span className="font-semibold">simple view of attendance</span>{" "}
                for each child linked to your phone number in a chosen{" "}
                <span className="font-semibold">term and year</span>.
              </p>
              <p className="text-[11px] md:text-xs text-zinc-500 max-w-xl">
                As the full attendance engine grows, this will show{" "}
                <span className="font-semibold">present, absent and late patterns</span>{" "}
                so you can talk calmly with your child and the teacher.
              </p>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 md:px-5 md:py-4 space-y-2">
              <p className="text-xs md:text-sm font-semibold text-sky-900 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-900 text-[12px] text-white">
                  👨‍👩‍👧
                </span>
                How it works
              </p>
              <ul className="text-[11px] md:text-xs text-sky-900/90 space-y-1.5">
                <li>1. Type the parent / guardian phone number.</li>
                <li>2. Press “Find learners” to see all children.</li>
                <li>
                  3. Select one child and press{" "}
                  <span className="font-semibold">“Load attendance summary”</span>.
                </li>
              </ul>
            </div>
          </div>
        </header>

        {/* Guardian filters */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))]">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-900">
                Guardian / parent phone
              </label>
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0241234567"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-[10px] text-zinc-500">
                This should be the number captured in the school records.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-900">Term</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-900">
                Academic year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025/2026"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadChildren}
                disabled={!canSearchChildren || loadingChildren}
                className="inline-flex items-center justify-center rounded-xl bg-sky-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-sky-950 disabled:opacity-50"
              >
                {loadingChildren ? "Looking up learners…" : "Find learners"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setGuardianPhone("");
                  setChildren(null);
                  setChildrenError("");
                  setSelectedStudentId(null);
                  setSummary(null);
                  setSummaryMeta(null);
                  setSummaryError("");
                }}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Clear
              </button>
            </div>

            <div className="text-[11px] text-zinc-500 md:text-right">
              {children && (
                <p>
                  Learners found:{" "}
                  <span className="font-semibold">{children.length}</span>
                </p>
              )}
            </div>
          </div>

          {childrenError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {childrenError}
            </div>
          )}
        </section>

        {/* Children list + summary */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)] gap-4 md:gap-5">
          <div className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                Choose learner
              </h2>
            </div>

            {!children && (
              <p className="text-[11px] text-zinc-500">
                Once you search using a phone number, each child linked to that
                number will appear here.
              </p>
            )}

            {children && children.length === 0 && (
              <p className="text-[11px] text-zinc-500">
                No learners were found for this phone number. The school may
                need to confirm how the number was stored.
              </p>
            )}

            {children && children.length > 0 && (
              <div className="space-y-2">
                {children.map((child) => {
                  const isSelected = child.id === selectedStudentId;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(child.id);
                        setSummary(null);
                        setSummaryMeta(null);
                        setSummaryError("");
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left text-[11px] md:text-xs transition-colors ${
                        isSelected
                          ? "border-sky-400 bg-sky-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 text-xs md:text-sm">
                          {child.name}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          ID: {child.id.slice(0, 6)}…
                        </span>
                      </div>

                      <div className="mt-1 text-zinc-600">
                        Class:{" "}
                        <span className="font-medium">
                          {child.classroom?.name ?? "Not set"}
                        </span>
                      </div>

                      {child.guardianName && (
                        <div className="mt-0.5 text-zinc-500">
                          Guardian: {child.guardianName}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-emerald-900">
                  Attendance summary for this learner
                </h2>
                <p className="text-[11px] md:text-xs text-emerald-900/90">
                  Shows a simple count of{" "}
                  <span className="font-semibold">
                    sessions, presence, absence and lateness
                  </span>{" "}
                  in the selected term and year.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-900 text-white text-[10px] font-medium px-3 py-1">
                Demo engine
              </span>
            </div>

            <button
              type="button"
              onClick={loadSummary}
              disabled={!canLoadSummary || loadingSummary}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-900 px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-emerald-950 disabled:opacity-50"
            >
              {loadingSummary
                ? "Loading attendance summary…"
                : !selectedStudentId
                ? "Select a learner first"
                : "Load attendance summary"}
            </button>

            {summaryError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {summaryError}
              </div>
            )}

            {!summary && !summaryError && !loadingSummary && (
              <p className="text-[11px] text-emerald-900/90">
                Once you choose a learner and press{" "}
                <span className="font-semibold">“Load attendance summary”</span>,
                this box will show their attendance for the chosen term and
                academic year.
              </p>
            )}

            {summary && summaryMeta && (
              <div className="space-y-3">
                <div className="text-[11px] text-emerald-900/90">
                  Term: <span className="font-semibold">{summaryMeta.term}</span>{" "}
                  · Year:{" "}
                  <span className="font-semibold">{summaryMeta.academicYear}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] md:text-xs">
                  <Stat label="Total sessions" value={String(summary.totalSessions)} />
                  <Stat label="Present marks" value={String(summary.daysPresent)} />
                  <Stat label="Absent marks" value={String(summary.daysAbsent)} />
                  <Stat label="Late marks" value={String(summary.daysLate)} />
                  <Stat label="Excused" value={String(summary.daysExcused)} />
                  <Stat label="Attendance rate" value={formatPercent(summary.attendanceRate)} />
                </div>

                <p className="text-[11px] text-emerald-900/90 whitespace-pre-line">
                  {summary.note ||
                    "Attendance note is not available yet for this learner."}
                </p>
              </div>
            )}
          </div>
        </section>

        <p className="text-[11px] text-zinc-500 max-w-3xl">
          Later, this page will connect directly to the real daily attendance
          engine and offer{" "}
          <span className="font-semibold">simple parent-friendly explanations</span>{" "}
          of what the numbers mean for the learner&apos;s future.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 border border-emerald-100">
      <div className="text-emerald-800/80">{label}</div>
      <div className="mt-1 text-lg font-semibold text-emerald-900">{value}</div>
    </div>
  );
}

export default function ParentAttendancePage() {
  return (
    <Suspense fallback={<ParentAttendanceSkeleton />}>
      <ParentAttendanceInner />
    </Suspense>
  );
}
