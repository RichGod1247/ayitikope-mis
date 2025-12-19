// src/app/student/results/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type GesInfo = {
  grade: number;
  label: string;
  band: string;
};

type SubjectSummary = {
  subject: string;
  itemCount: number;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  ges: GesInfo | null;
};

type AssessmentSummary = {
  totalItems: number;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  ges: GesInfo | null;
  subjects: SubjectSummary[];
  note?: string;
};

type AssessmentApiResponse = {
  ok: boolean;
  studentId?: string;
  term?: string;
  academicYear?: string;
  summary?: AssessmentSummary;
  error?: string;
};

type ExplainApiResponse = {
  ok: boolean;
  summary?: string;
  suggestions?: string;
  error?: string;
  meta?: any;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const cardBase =
  "rounded-2xl border bg-white/90 shadow-sm px-4 py-4 md:px-5 md:py-5";

export default function StudentResultsPage() {
  const searchParams = useSearchParams();

  const tenantId = (searchParams.get("tenantId") || "").trim();
  const studentId = (searchParams.get("studentId") || "").trim();
  const studentName = (searchParams.get("studentName") || searchParams.get("name") || "").trim();
  const classroomName = (searchParams.get("className") || "").trim();
  const term = (searchParams.get("term") || "1st Term").trim();
  const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  const hasStudent = useMemo(() => !!studentId, [studentId]);

  // ---------------------------
  // Load assessment summary
  // ---------------------------
  useEffect(() => {
    if (!hasStudent) {
      setSummary(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setLoadError(null);
      setSummary(null);
      setAiSummary(null);
      setAiSuggestions(null);
      setAiError(null);

      try {
        const url = new URL(
          "/api/parent/assessment/summary",
          window.location.origin
        );
        url.searchParams.set("studentId", studentId);
        url.searchParams.set("term", term);
        url.searchParams.set("academicYear", academicYear);

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });

        const json = (await res.json().catch(() => ({}))) as AssessmentApiResponse;

        if (cancelled) return;

        if (!res.ok || !json.ok || !json.summary) {
          setLoadError(
            json.error ||
              "Could not load your assessment summary. Please try again later."
          );
          setSummary(null);
          return;
        }

        setSummary(json.summary);
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        setLoadError(
          "Network or server error while loading your summary. Please try again."
        );
        setSummary(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasStudent, studentId, term, academicYear]);

  // ---------------------------
  // AI explainer (student tone)
  // ---------------------------
  async function handleAskAi() {
    if (!summary) return;

    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiSuggestions(null);

    try {
      const body = {
        tenantId: tenantId || undefined,
        studentName: studentName || undefined,
        className: classroomName || undefined,
        term,
        academicYear,
        overallPercentage: summary.percentage,
        subjects: summary.subjects.map((s) => ({
          subject: s.subject,
          percentage: s.percentage,
          ges: s.ges,
        })),
      };

      const res = await fetch("/api/student/results/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => ({}))) as ExplainApiResponse;

      if (!res.ok || !json.ok) {
        setAiError(
          json.error ||
            "AI could not explain your results right now. Please try again later."
        );
        setAiSummary(null);
        setAiSuggestions(null);
        return;
      }

      setAiSummary(json.summary ?? null);
      setAiSuggestions(json.suggestions ?? null);
    } catch (err) {
      setAiError(
        "Network or server error while talking to the AI explainer. Please try again."
      );
      setAiSummary(null);
      setAiSuggestions(null);
    } finally {
      setAiLoading(false);
    }
  }

  const displayName = studentName || "You";
  const safeClassName = classroomName || "your class";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`${pillBase} border-indigo-200 bg-indigo-50 text-indigo-800`}
            >
              EduLife OS · Student · Results
            </span>
            {tenantId && (
              <span className="text-[11px] text-slate-500">
                Tenant:{" "}
                <span className="font-mono text-[10px]">{tenantId}</span>
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                My results this term
              </h1>
              <p className="text-sm md:text-base text-slate-600 max-w-2xl">
                See{" "}
                <span className="font-semibold">how you are doing</span> in each
                subject and let the{" "}
                <span className="font-semibold">AI coach</span> turn your scores
                into a simple plan to grow.
              </p>
            </div>

            <div className={`${cardBase} bg-gradient-to-br from-indigo-50 to-cyan-50`}>
              <p className="text-[11px] font-medium text-slate-700 mb-2">
                You &amp; your term
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-700">
                <div>
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-semibold">{displayName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Class</dt>
                  <dd className="font-medium">{safeClassName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Term</dt>
                  <dd className="font-medium">{term}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Academic year</dt>
                  <dd className="font-medium">{academicYear}</dd>
                </div>
              </dl>
              {!hasStudent && (
                <p className="mt-3 text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200 rounded-lg px-2 py-1.5">
                  This demo works best when opened from the Student Portal with a
                  specific learner selected.
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_minmax(0,1.3fr)] gap-4 md:gap-5">
          {/* Left: overall + table */}
          <div className="space-y-4">
            {/* Overall card */}
            <div className={cardBase}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm md:text-base font-semibold text-slate-900">
                    Overall performance
                  </h2>
                  <p className="text-[11px] md:text-xs text-slate-600 max-w-sm">
                    This is your average from the tests, quizzes and other
                    continuous assessment that your teachers have recorded so far.
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>
                    Term: <span className="font-medium">{term}</span>
                  </div>
                  <div>
                    Year: <span className="font-medium">{academicYear}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:text-sm">
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500">
                    Overall percentage
                  </div>
                  <div className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">
                    {summary?.percentage != null
                      ? `${summary.percentage.toFixed(1)}%`
                      : "—"}
                  </div>
                  {summary?.ges && (
                    <div className="mt-1 text-[11px] text-slate-600">
                      GES grade:{" "}
                      <span className="font-semibold">
                        {summary.ges.grade} ({summary.ges.band})
                      </span>{" "}
                      – {summary.ges.label}
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-emerald-50 px-3 py-3">
                  <div className="text-[11px] text-emerald-700">
                    Score totals
                  </div>
                  <div className="mt-1 text-lg font-semibold text-emerald-950">
                    {summary
                      ? `${summary.totalObtained.toFixed(
                          1
                        )} / ${summary.totalMax.toFixed(1)}`
                      : "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-800">
                    Items recorded:{" "}
                    <span className="font-semibold">
                      {summary?.totalItems ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {summary?.note && (
                <p className="mt-3 text-[11px] text-slate-500">{summary.note}</p>
              )}

              {loadError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                  {loadError}
                </div>
              )}

              {loading && !loadError && (
                <p className="mt-3 text-[11px] text-slate-500">
                  Loading your assessment summary…
                </p>
              )}
            </div>

            {/* Subject table */}
            <div className={cardBase}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  How you are doing by subject
                </h2>
                <p className="text-[11px] text-slate-500">
                  Use this to see your strong areas and where to grow next.
                </p>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 bg-white">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <Th label="Subject" align="left" />
                      <Th label="Items" />
                      <Th label="Total score" />
                      <Th label="Percentage" />
                      <Th label="GES grade" />
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.subjects.map((s) => (
                      <tr
                        key={s.subject}
                        className="border-b border-slate-100 hover:bg-slate-50/70"
                      >
                        <td className="px-3 py-2 text-left whitespace-nowrap">
                          {s.subject}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.itemCount ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.totalObtained.toFixed(1)} /{" "}
                          {s.totalMax.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.percentage != null
                            ? `${s.percentage.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.ges
                            ? `${s.ges.grade} (${s.ges.band}) – ${s.ges.label}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {(!summary || summary.subjects.length === 0) &&
                      !loading &&
                      !loadError && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-5 text-center text-[11px] text-slate-500"
                          >
                            No subject scores recorded yet for this term and
                            year. When your teachers enter more marks, they will
                            appear here.
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: AI coach */}
          <div className={`${cardBase} border-indigo-200 bg-indigo-50/80`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-indigo-950">
                  AI results coach (for you)
                </h2>
                <p className="text-[11px] md:text-xs text-indigo-900/90">
                  Let EduLife OS explain your results in simple English and give
                  you{" "}
                  <span className="font-semibold">
                    2–4 clear steps
                  </span>{" "}
                  you can act on this week.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-900 text-white text-[10px] font-medium px-3 py-1">
                Beta · Growth mode
              </span>
            </div>

            <button
              type="button"
              onClick={handleAskAi}
              disabled={aiLoading || !summary || !!loadError || !hasStudent}
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-indigo-900 px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-indigo-950 disabled:opacity-50"
            >
              {aiLoading
                ? "Thinking with you…"
                : !summary || !hasStudent
                ? "Need your results first"
                : "Help me understand my results"}
            </button>

            {aiError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {aiError}
              </div>
            )}

            {aiSummary && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[11px] text-indigo-950 whitespace-pre-line">
                  {aiSummary}
                </div>
                {aiSuggestions && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900 whitespace-pre-line">
                    {aiSuggestions}
                  </div>
                )}
              </div>
            )}

            {!aiError && !aiSummary && !aiLoading && summary && (
              <p className="mt-3 text-[11px] text-indigo-900/90">
                This AI coach is not here to shame you. It is here to show you{" "}
                <span className="font-semibold">where to focus next</span>, one
                small step at a time.
              </p>
            )}

            {!summary && !loading && !loadError && (
              <p className="mt-3 text-[11px] text-indigo-900/90">
                Once your teachers record some continuous assessment for this
                term, you can ask the AI coach to explain your pattern and suggest
                what to do next.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Th({ label, align = "right" }: { label: string; align?: "left" | "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-slate-500 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {label}
    </th>
  );
}
