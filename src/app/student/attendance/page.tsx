// src/app/student/attendance/page.tsx
"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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

function StudentAttendanceSkeleton() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        <div className="h-7 w-56 rounded bg-slate-200 animate-pulse" />
        <div className="h-28 rounded-2xl bg-white/90 border border-zinc-200 shadow-sm animate-pulse" />
        <div className="h-44 rounded-2xl bg-white/90 border border-zinc-200 shadow-sm animate-pulse" />
        <div className="h-64 rounded-2xl bg-emerald-50/80 border border-emerald-200 shadow-sm animate-pulse" />
        <div className="h-56 rounded-2xl bg-indigo-50/80 border border-indigo-200 shadow-sm animate-pulse" />
      </div>
    </main>
  );
}

function StudentAttendanceInner() {
  const searchParams = useSearchParams();
  const initialTenantId = searchParams.get("tenantId") || "";

  const [tenantId] = useState<string>(initialTenantId);
  const [studentId, setStudentId] = useState<string>("");

  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [summaryMeta, setSummaryMeta] = useState<{
    term: string;
    academicYear: string;
    studentId: string;
  } | null>(null);
  const [summaryError, setSummaryError] = useState<string>("");

  const [loadingSummary, setLoadingSummary] = useState(false);

  // Tiny "AI-style" explainer state (rule-based, no extra API)
  const [explanation, setExplanation] = useState<string | null>(null);

  const canLoadSummary = useMemo(
    () =>
      Boolean(
        studentId.trim().length > 0 &&
          term.trim().length > 0 &&
          academicYear.trim().length > 0
      ),
    [studentId, term, academicYear]
  );

  async function loadSummary() {
    if (!canLoadSummary) return;

    setLoadingSummary(true);
    setSummaryError("");
    setSummary(null);
    setSummaryMeta(null);
    setExplanation(null);

    try {
      const url = new URL("/api/parent/attendance/summary", window.location.origin);
      url.searchParams.set("studentId", studentId.trim());
      url.searchParams.set("term", term.trim());
      url.searchParams.set("academicYear", academicYear.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as AttendanceResponse;

      if (!res.ok || !json.ok) {
        setSummaryError(
          json.error ||
            "Could not load attendance. Please check the ID or term and try again."
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
        studentId: json.studentId || studentId.trim(),
      });
    } catch {
      setSummaryError("Network or server error while loading attendance. Please try again.");
      setSummary(null);
      setSummaryMeta(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  function explainAttendance() {
    if (!summary || !summaryMeta) return;

    const s = summary;
    const termLabel = summaryMeta.academicYear
      ? `${summaryMeta.term}, ${summaryMeta.academicYear}`
      : summaryMeta.term;

    const lines: string[] = [];

    // Case 1: no sessions yet
    if (!s.totalSessions || s.totalSessions === 0) {
      lines.push(`For ${termLabel}, there are no recorded attendance sessions yet in EduLife OS.`);
      lines.push(
        `That usually means teachers have not started using the digital register for this term, or they are still setting things up.`
      );
      lines.push(
        `Your job for now is simple: keep coming to school every day and on time, so that when the digital register goes live, your record already matches your real behaviour.`
      );
      lines.push("");
      lines.push(
        `Small actions you can take from tomorrow:\n` +
          `- Sleep early so it is easier to arrive before assembly.\n` +
          `- Prepare your books and uniform the night before.\n` +
          `- If you know you may be absent, let your parent or teacher know early (for genuine reasons only).`
      );

      setExplanation(lines.join("\n"));
      return;
    }

    const rate =
      s.attendanceRate != null && !Number.isNaN(s.attendanceRate)
        ? s.attendanceRate
        : s.totalSessions > 0
        ? (s.daysPresent / s.totalSessions) * 100
        : null;

    const absent = s.daysAbsent;
    const late = s.daysLate;
    const excused = s.daysExcused ?? 0;

    if (rate != null) {
      lines.push(
        `For ${termLabel}, your attendance rate is about ${rate.toFixed(1)}%, based on ${s.totalSessions} recorded school days.`
      );
    } else {
      lines.push(
        `For ${termLabel}, you have ${s.daysPresent} present day(s) out of ${s.totalSessions} recorded school days.`
      );
    }

    if (rate != null) {
      if (rate >= 95) {
        lines.push(`This is excellent attendance. Protect it — it helps your results more than most students think.`);
      } else if (rate >= 90) {
        lines.push(`This is very good attendance. Push it closer to 95–100% if you can.`);
      } else if (rate >= 80) {
        lines.push(`This is okay but not ideal. Try to lift it above 90% so you don’t miss key lessons and quizzes.`);
      } else {
        lines.push(`This attendance rate is dangerously low. It will be hard to keep up if it continues.`);
      }
    }

    if (absent > 0) {
      lines.push(`You were marked absent about ${absent} day(s). Each absence creates learning gaps.`);
    } else {
      lines.push(`You have almost no absence recorded so far — strong foundation.`);
    }

    if (late > 0) {
      lines.push(`You were marked late about ${late} time(s). Being late often means missing opening instructions.`);
    } else {
      lines.push(`You have very few or no late marks. Great for starting each day focused.`);
    }

    if (excused > 0) {
      lines.push(
        `About ${excused} absence(s) were excused. Even when reasons are genuine, catch up quickly after each missed day.`
      );
    }

    lines.push("");
    lines.push(`Simple next steps you can try this week:`);
    lines.push(
      [
        `- Night before: pack your bag, set your uniform out.`,
        `- Morning: leave home 10–15 minutes earlier than usual.`,
        `- If absences/lateness repeat, show this page to your parent and discuss what’s causing it.`,
        `- Link to results: strong attendance is the “root” that supports strong grades.`,
      ].join("\n")
    );

    setExplanation(lines.join("\n"));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}>
              EduLife OS · Student · Attendance
            </span>
            {tenantId && (
              <span className="text-[11px] text-zinc-500">
                Tenant demo: <span className="font-mono text-[10px]">{tenantId}</span>
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
                My attendance this term
              </h1>
              <p className="text-sm md:text-base text-zinc-600 max-w-xl">
                See, in one place,{" "}
                <span className="font-semibold">
                  how often you were present, absent or late
                </span>{" "}
                this term — so you can fix problems early, not at the end of the year.
              </p>
              <p className="text-[11px] md:text-xs text-zinc-500 max-w-xl">
                This page is built to help you and your parents talk honestly about attendance, not to shame you.
              </p>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 md:px-5 md:py-4 space-y-2">
              <p className="text-xs md:text-sm font-semibold text-sky-900 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-900 text-[12px] text-white">
                  🕒
                </span>
                How to use this page
              </p>
              <ul className="text-[11px] md:text-xs text-sky-900/90 space-y-1.5">
                <li>1. Enter your Student ID.</li>
                <li>2. Choose term and academic year.</li>
                <li>3. Press “Load my attendance summary”.</li>
                <li>4. Read the numbers, then let EduLife explain them in plain language.</li>
              </ul>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.8fr))]">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">Student ID</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. STU-0001"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-[10px] text-zinc-500">Use any valid student ID from your demo data.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">Term</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-700">Academic year</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025/2026"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={loadSummary}
              disabled={!canLoadSummary || loadingSummary}
              className="inline-flex items-center justify-center rounded-xl bg-sky-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-sky-950 disabled:opacity-50"
            >
              {loadingSummary ? "Loading my attendance…" : "Load my attendance summary"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStudentId("");
                setSummary(null);
                setSummaryMeta(null);
                setSummaryError("");
                setExplanation(null);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Clear
            </button>
          </div>

          {summaryError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {summaryError}
            </div>
          )}
        </section>

        {/* Summary + explainer */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-emerald-900">
                  Attendance summary
                </h2>
                <p className="text-[11px] md:text-xs text-emerald-900/90">
                  Shows how many days were{" "}
                  <span className="font-semibold">present, absent, late</span>{" "}
                  or <span className="font-semibold">excused</span> — and your attendance rate.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-900 text-white text-[10px] font-medium px-3 py-1">
                Demo register
              </span>
            </div>

            {!summary && !summaryError && !loadingSummary && (
              <p className="text-[11px] text-emerald-900/90">
                Load your attendance and it will appear here.
              </p>
            )}

            {summary && summaryMeta && (
              <div className="space-y-3">
                <div className="text-[11px] text-emerald-900/90">
                  Term: <span className="font-semibold">{summaryMeta.term}</span> · Year:{" "}
                  <span className="font-semibold">{summaryMeta.academicYear}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] md:text-xs">
                  <Kpi label="Sessions recorded" value={summary.totalSessions.toString()} />
                  <Kpi label="Days present" value={summary.daysPresent.toString()} />
                  <Kpi label="Days absent" value={summary.daysAbsent.toString()} />
                  <Kpi label="Attendance rate" value={formatPercent(summary.attendanceRate)} />
                  <Kpi label="Late marks" value={summary.daysLate.toString()} />
                  <Kpi label="Excused days" value={(summary.daysExcused ?? 0).toString()} />
                </div>

                <p className="text-[11px] text-emerald-900/90 whitespace-pre-line">
                  {summary.note ||
                    "No extra note has been recorded yet for this attendance summary."}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-4 md:px-5 md:py-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-indigo-900">
                  Attendance explainer (student-friendly)
                </h2>
                <p className="text-[11px] md:text-xs text-indigo-900/90">
                  Turns your numbers into a short story + action plan you can share.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-900 text-white text-[10px] font-medium px-3 py-1">
                Beta · Student
              </span>
            </div>

            <button
              type="button"
              onClick={explainAttendance}
              disabled={!summary || !summaryMeta}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-indigo-950 disabled:opacity-50"
            >
              {!summary ? "Load attendance first" : "Explain my attendance for me"}
            </button>

            {explanation && (
              <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[11px] text-indigo-950 whitespace-pre-line">
                {explanation}
              </div>
            )}

            {!explanation && !summary && (
              <p className="text-[11px] text-indigo-900/90">
                First load your attendance, then ask the explainer to turn it into a simple plan.
              </p>
            )}
          </div>
        </section>

        <p className="text-[11px] text-zinc-500 max-w-3xl">
          Later, this page will connect to live device-based attendance records, so every learner can see how daily choices build up across the term.
        </p>
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border border-emerald-100 px-3 py-2">
      <div className="text-[10px] text-emerald-800/80">{label}</div>
      <div className="mt-1 text-lg font-semibold text-emerald-900">{value}</div>
    </div>
  );
}

export default function StudentAttendancePage() {
  return (
    <Suspense fallback={<StudentAttendanceSkeleton />}>
      <StudentAttendanceInner />
    </Suspense>
  );
}
