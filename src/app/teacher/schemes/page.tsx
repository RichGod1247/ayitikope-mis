// src/app/teacher/schemes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Teacher · Scheme of Work Overview
 *
 * This page shows a summary of all SchemeOfWork records
 * returned by:
 *
 *   GET /api/schemes?mode=summary
 *
 * It is intentionally read-only for now so that:
 *  - Nothing breaks in your working system.
 *  - You can demo: Curriculum → Scheme of Work overview.
 */

type SchemeOfWorkSummary = {
  id: string;
  subject: string;
  term: string;
  academicYear: string;
  classroomName?: string | null;
  teacherName?: string | null;
  totalItems: number;
  weekNumbers: number[];
  createdAt: string;
  updatedAt: string;
};

type SchemesSummaryResponse = {
  ok: boolean;
  items?: SchemeOfWorkSummary[];
  error?: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-8 px-3 rounded-xl border text-[11px] md:text-xs shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline =
  btnBase +
  " bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50";

export default function TeacherSchemesPage() {
  const [schemes, setSchemes] = useState<SchemeOfWorkSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSchemeId, setSelectedSchemeId] =
    useState<string | null>(null);

  // ---------------------------
  // Load Scheme of Work summary
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/schemes?mode=summary");
        const data =
          (await res.json().catch(() => ({}))) as SchemesSummaryResponse;

        if (!res.ok || !data.ok || !data.items) {
          if (!cancelled) {
            setSchemes([]);
            setError(
              data.error ??
                "Failed to load schemes of work. Please try again."
            );
          }
          return;
        }

        if (cancelled) return;

        setSchemes(data.items);

        // auto-select the first scheme, if any
        if (data.items.length > 0) {
          setSelectedSchemeId(data.items[0].id);
        }
      } catch (err) {
        console.error("SCHEMES_SUMMARY_LOAD_ERROR", err);
        if (!cancelled) {
          setError(
            "Network or server error while loading schemes of work."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedScheme = useMemo(
    () => schemes.find((s) => s.id === selectedSchemeId) ?? null,
    [schemes, selectedSchemeId]
  );

  const schemesByTermYear = useMemo(() => {
    const groups = new Map<string, SchemeOfWorkSummary[]>();

    for (const s of schemes) {
      const key = `${s.academicYear}__${s.term}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(s);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const [year, term] = key.split("__");
      return {
        academicYear: year,
        term,
        items: items.sort((a, b) =>
          (a.subject || "").localeCompare(b.subject || "")
        ),
      };
    });
  }, [schemes]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}
              >
                EduLife OS · Teacher · Scheme of Work
              </span>
              <span className="text-[11px] text-zinc-500">
                Built directly from your NaCCA curriculum indicators.
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              Scheme of Work Overview
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This screen shows{" "}
              <span className="font-semibold">
                real Scheme of Work records
              </span>{" "}
              stored in your database. Each row comes from indicators
              you assign in the Curriculum Explorer (&quot;Add to
              Scheme of Work&quot; step).
            </p>
          </div>

          <div className="text-[11px] text-zinc-500 max-w-xs md:text-right space-y-1">
            <p>
              Use this page to show your headteacher how{" "}
              <span className="font-semibold">
                Curriculum → Scheme of Work → Lesson Notes
              </span>{" "}
              stays in one flow.
            </p>
            <p>
              Then open a specific scheme to see its{" "}
              <span className="font-semibold">
                full weekly breakdown
              </span>{" "}
              and jump into Lesson Note Studio from each indicator.
            </p>
          </div>
        </header>

        {/* Error / status */}
        {error && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Main 2-column layout */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-4 md:gap-6">
          {/* LEFT: Schemes grouped by term/year */}
          <div className="space-y-3">
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  1 · Schemes by term &amp; academic year
                </h2>
                <div className="text-[11px] text-zinc-500">
                  {loading
                    ? "Loading schemes…"
                    : `${schemes.length} scheme${
                        schemes.length === 1 ? "" : "s"
                      } found`}
                </div>
              </div>

              {schemes.length === 0 && !loading && (
                <p className="text-xs text-zinc-500">
                  No Scheme of Work records found yet. Once you start
                  assigning indicators from the Curriculum Explorer,
                  they will appear here, grouped by term and academic
                  year.
                </p>
              )}

              <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                {schemesByTermYear.map((group) => (
                  <div
                    key={`${group.academicYear}-${group.term}`}
                    className="border border-zinc-200 rounded-2xl bg-zinc-50"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200">
                      <div className="space-y-0.5">
                        <div className="text-[12px] font-semibold text-zinc-900">
                          {group.term} · {group.academicYear}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {group.items.length} scheme
                          {group.items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="px-3 py-2 space-y-1.5">
                      {group.items.map((s) => {
                        const isSelected = s.id === selectedSchemeId;
                        const weeksLabel =
                          s.weekNumbers &&
                          s.weekNumbers.length > 0
                            ? `Weeks: ${s.weekNumbers
                                .sort((a, b) => a - b)
                                .join(", ")}`
                            : "Weeks: —";

                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedSchemeId(s.id)}
                            className={[
                              "w-full rounded-xl border px-3 py-2 text-left text-[11px] transition",
                              isSelected
                                ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/60",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="text-[12px] font-semibold text-zinc-900">
                                  {s.subject}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  Class:{" "}
                                  <span className="font-semibold">
                                    {s.classroomName ?? "—"}
                                  </span>
                                  {s.teacherName && (
                                    <>
                                      {" "}
                                      · Teacher:{" "}
                                      <span className="font-semibold">
                                        {s.teacherName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right space-y-0.5">
                                <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200">
                                  {s.totalItems} indicator
                                  {s.totalItems === 1 ? "" : "s"}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  {weeksLabel}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-2xl bg-white px-4 py-3 text-[11px] text-zinc-600">
              <p>
                As you start adding indicators from the Curriculum
                Explorer, each combination of{" "}
                <span className="font-semibold">
                  subject + class + term + academic year
                </span>{" "}
                will grow into a Scheme of Work here.
              </p>
            </div>
          </div>

          {/* RIGHT: Selected scheme meta & actions */}
          <aside className="space-y-3">
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                2 · Selected scheme details
              </h2>

              {!selectedScheme && (
                <p className="text-xs text-zinc-500">
                  Select a Scheme of Work on the left to see its key
                  details here. Then open the{" "}
                  <span className="font-semibold">
                    full week-by-week table
                  </span>{" "}
                  or jump into Lesson Note Studio from the indicators.
                </p>
              )}

              {selectedScheme && (
                <div className="space-y-3 text-xs text-zinc-700">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      Scheme overview
                    </div>
                    <p className="text-[13px] font-semibold text-zinc-900">
                      {selectedScheme.subject}
                    </p>
                    <p>
                      Term:{" "}
                      <span className="font-semibold">
                        {selectedScheme.term}
                      </span>{" "}
                      · Academic year:{" "}
                      <span className="font-semibold">
                        {selectedScheme.academicYear}
                      </span>
                    </p>
                    <p>
                      Class:{" "}
                      <span className="font-semibold">
                        {selectedScheme.classroomName ?? "—"}
                      </span>
                    </p>
                    {selectedScheme.teacherName && (
                      <p>
                        Teacher:{" "}
                        <span className="font-semibold">
                          {selectedScheme.teacherName}
                        </span>
                      </p>
                    )}
                    <p>
                      Total indicators:{" "}
                      <span className="font-semibold">
                        {selectedScheme.totalItems}
                      </span>
                    </p>
                    <p>
                      Weeks covered:{" "}
                      <span className="font-semibold">
                        {selectedScheme.weekNumbers &&
                        selectedScheme.weekNumbers.length > 0
                          ? selectedScheme.weekNumbers
                              .slice()
                              .sort((a, b) => a - b)
                              .join(", ")
                          : "—"}
                      </span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-600">
                      Next step: open the{" "}
                      <span className="font-semibold">
                        full scheme table
                      </span>{" "}
                      and then click{" "}
                      <span className="font-semibold">
                        Open in Studio
                      </span>{" "}
                      on any indicator.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/teacher/schemes/${selectedScheme.id}`}
                        className={btnOutline}
                      >
                        Open full scheme
                      </Link>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500">
                    When you demo this, you can say: “These schemes
                    are generated from NaCCA indicators so every lesson
                    note and assessment comes from the same national
                    standard.”
                  </div>
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
