// src/app/teacher/schemes/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SchemeOfWorkItemDto = {
  id: string;
  weekNumber: number;
  strandTitle: string | null;
  subStrandTitle: string | null;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;
  indicatorCode: string | null;
  indicatorDescription: string;
};

type SchemeOfWorkDetail = {
  id: string;
  subject: string;
  term: string;
  academicYear: string;
  teacherName?: string | null;
  className?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  items: SchemeOfWorkItemDto[];
};

type SchemeDetailResponse = {
  ok: boolean;
  scheme?: SchemeOfWorkDetail;
  error?: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Infer NaCCA curriculum meta (phase, level label, subjectSlug)
 * from a SchemeOfWork.subject like:
 *  - "KG1 Our World and Our People"
 *  - "KG 2 Mathematics"
 *  - "Basic 3 Science"
 *  - "Basic 6 Our World and Our People"
 *  - "JHS 1 Computing"
 *  - "JHS 1 Career Technology"
 */
function inferCurriculumMetaFromSubject(subject: string): {
  phase?: string;
  level?: string;
  subjectSlug?: string;
} {
  const src = (subject || "").trim();
  if (!src) return {};

  const slugifyCore = (core: string) =>
    core
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  // KG 1 / KG1
  let m = src.match(/^KG\s*([12])\s+/i) || src.match(/^KG([12])\s+/i);
  if (m) {
    const num = parseInt(m[1], 10);
    const levelSlug = `kg${num}`;
    const rest = src.slice(m[0].length).trim();
    const coreSlug = slugifyCore(rest);
    return {
      phase: "KG",
      level: `KG${num}`,
      subjectSlug: coreSlug ? `${levelSlug}-${coreSlug}` : levelSlug,
    };
  }

  // Basic 1..9 / Basic1..9
  m = src.match(/^Basic\s*([1-9])\s+/i) || src.match(/^Basic([1-9])\s+/i);
  if (m) {
    const num = parseInt(m[1], 10);
    const levelSlug = `basic-${num}`;
    const rest = src.slice(m[0].length).trim();
    const coreSlug = slugifyCore(rest);
    const phase = num <= 3 ? "Lower Primary" : "Upper Primary";
    return {
      phase,
      level: `Basic ${num}`,
      subjectSlug: coreSlug ? `${levelSlug}-${coreSlug}` : levelSlug,
    };
  }

  // JHS 1..3 / JHS1..3
  m = src.match(/^JHS\s*([1-3])\s+/i) || src.match(/^JHS([1-3])\s+/i);
  if (m) {
    const num = parseInt(m[1], 10);
    const levelSlug = `jhs-${num}`;
    const rest = src.slice(m[0].length).trim();
    const coreSlug = slugifyCore(rest);
    return {
      phase: "Junior High School",
      level: `JHS ${num}`,
      subjectSlug: coreSlug ? `${levelSlug}-${coreSlug}` : levelSlug,
    };
  }

  // Fallback – just slugify the whole thing
  const coreSlug = slugifyCore(src);
  return coreSlug ? { subjectSlug: coreSlug } : {};
}

export default function SchemeDetailPage({
  params,
}: {
  // ✅ SAFE: Next passes params as a plain object. Not a Promise.
  params: { id: string };
}) {
  // ✅ SAFE: no React.use, no Promise, no experimental behavior
  const schemeId = params?.id;

  const [loading, setLoading] = useState(true);
  const [scheme, setScheme] = useState<SchemeOfWorkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schemeId) {
      setLoading(false);
      setError("Missing scheme id.");
      return;
    }

    const ac = new AbortController();

    async function loadScheme() {
      setLoading(true);
      setError(null);
      setScheme(null);

      try {
        const url = `/api/schemes?id=${encodeURIComponent(schemeId)}`;

        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
        });

        // ✅ Better: explicit auth failures
        if (res.status === 401 || res.status === 403) {
          setError("Unauthorized. Please sign in again.");
          return;
        }

        const data = (await res.json().catch(() => ({}))) as SchemeDetailResponse;

        if (!res.ok || !data.ok || !data.scheme) {
          setError(data.error ?? "Failed to load Scheme of Work. Please try again.");
          return;
        }

        setScheme(data.scheme);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("SCHEME_DETAIL_LOAD_ERROR", err);
        setError("Network or server error while loading Scheme of Work.");
      } finally {
        setLoading(false);
      }
    }

    void loadScheme();

    return () => {
      ac.abort();
    };
  }, [schemeId]);

  // Helper: build Lesson Note Studio deep-link URL
  const buildLessonNoteUrl = (weekNumber: number, item: SchemeOfWorkItemDto) => {
    if (!scheme) return "#";

    const { phase, level, subjectSlug } = inferCurriculumMetaFromSubject(scheme.subject);

    const params = new URLSearchParams();

    if (scheme.subject) params.set("subject", scheme.subject);
    if (scheme.term) params.set("term", scheme.term);
    if (scheme.academicYear) params.set("academicYear", scheme.academicYear);
    if (weekNumber) params.set("weekNumber", String(weekNumber));
    if (item.indicatorCode) params.set("indicatorCode", item.indicatorCode);
    if (phase) params.set("phase", phase);
    if (level) params.set("level", level);
    if (subjectSlug) params.set("subjectSlug", subjectSlug);

    return `/teacher/lesson-notes/studio?${params.toString()}`;
  };

  // Group items by week
  const groupedByWeek = useMemo(() => {
    if (!scheme) return [];
    const map = new Map<number, SchemeOfWorkItemDto[]>();

    for (const item of scheme.items) {
      const week = item.weekNumber || 0;
      if (!map.has(week)) map.set(week, []);
      map.get(week)!.push(item);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekNumber, items]) => ({
        weekNumber,
        items: items.sort((a, b) =>
          a.indicatorDescription.localeCompare(b.indicatorDescription)
        ),
      }));
  }, [scheme]);

  const hasItems = !!scheme && scheme.items.length > 0;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        {/* Top header / breadcrumb-ish */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>
                EduLife OS · Teacher · Scheme of Work
              </span>
              {scheme && (
                <span className="text-[11px] text-zinc-500">
                  {scheme.subject} · {scheme.term} · {scheme.academicYear}
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">
              {scheme ? `${scheme.subject} – Scheme of Work` : "Scheme of Work"}
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This page shows a <span className="font-semibold">real Scheme of Work</span>{" "}
              generated from NaCCA indicators. You can print it directly for your headteacher
              or inspection, or jump into <span className="font-semibold">Lesson Note Studio</span>{" "}
              for any indicator.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 text-[11px] text-zinc-500">
            {scheme && (
              <>
                <p>
                  Term: <span className="font-semibold">{scheme.term}</span>
                </p>
                <p>
                  Academic year: <span className="font-semibold">{scheme.academicYear}</span>
                </p>
                {scheme.className && (
                  <p>
                    Class: <span className="font-semibold">{scheme.className}</span>
                  </p>
                )}
                {scheme.teacherName && (
                  <p>
                    Teacher: <span className="font-semibold">{scheme.teacherName}</span>
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className={`${btnBase} bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100`}
            >
              Print Scheme of Work
            </button>
          </div>
        </header>

        {/* Loading / error states */}
        {loading && (
          <div className="border border-zinc-200 bg-white rounded-2xl px-4 py-3 text-sm text-zinc-600">
            Loading Scheme of Work…
          </div>
        )}

        {error && !loading && (
          <div className="border border-red-200 bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !scheme && (
          <div className="border border-zinc-200 bg-white rounded-2xl px-4 py-3 text-sm text-zinc-600">
            Scheme of Work not found.
          </div>
        )}

        {/* Main content: grouped weeks + table */}
        {scheme && (
          <section className="border border-zinc-200 bg-white rounded-2xl p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-zinc-900">Weekly breakdown</h2>
                <p className="text-[11px] text-zinc-500">
                  Each row links a NaCCA indicator to a specific week, strand and sub-strand.
                  You can now <span className="font-semibold">open Lesson Note Studio</span>{" "}
                  directly from here.
                </p>
              </div>
              {hasItems && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                  {scheme.items.length} indicator{scheme.items.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {!hasItems && (
              <p className="text-xs text-zinc-500">
                No items have been added to this Scheme of Work yet. You can add indicators from{" "}
                <span className="font-semibold">Teacher → Curriculum</span>{" "}
                using the “Add to Scheme of Work” button.
              </p>
            )}

            {hasItems && (
              <div className="space-y-4">
                {groupedByWeek.map((group) => (
                  <div
                    key={group.weekNumber}
                    className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50"
                  >
                    {/* Week header */}
                    <div className="flex items-center justify-between gap-2 bg-zinc-100 px-3 py-2">
                      <div className="text-xs font-semibold text-zinc-800">
                        Week {group.weekNumber}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {group.items.length} indicator{group.items.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-t border-zinc-200 text-[11px]">
                        <thead className="bg-zinc-100/80">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Strand
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Sub-strand
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Content Std.
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Indicator Code
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Indicator Description
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">
                              Lesson Note
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id} className="odd:bg-white even:bg-zinc-50">
                              <td className="px-3 py-2 align-top border-b border-zinc-200">
                                {item.strandTitle || "—"}
                              </td>
                              <td className="px-3 py-2 align-top border-b border-zinc-200">
                                {item.subStrandTitle || "—"}
                              </td>
                              <td className="px-3 py-2 align-top border-b border-zinc-200">
                                {item.contentStandardCode ? item.contentStandardCode : "—"}
                                {item.contentStandardDescription && (
                                  <span className="block text-[10px] text-zinc-500 mt-0.5">
                                    {item.contentStandardDescription}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top border-b border-zinc-200 whitespace-nowrap">
                                {item.indicatorCode || "—"}
                              </td>
                              <td className="px-3 py-2 align-top border-b border-zinc-200">
                                {item.indicatorDescription}
                              </td>
                              <td className="px-3 py-2 align-top border-b border-zinc-200 whitespace-nowrap">
                                {item.indicatorCode ? (
                                  <Link
                                    href={buildLessonNoteUrl(group.weekNumber, item)}
                                    className={`${btnBase} bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 text-[10px] md:text-[11px]`}
                                  >
                                    Open in Studio
                                  </Link>
                                ) : (
                                  <span className="text-[10px] text-zinc-400">No indicator code</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Footer note */}
        <section className="border border-dashed border-zinc-200 bg-zinc-50 rounded-2xl px-4 py-3 text-[11px] text-zinc-600">
          <p>
            From here you can now choose a week and{" "}
            <span className="font-semibold">open Lesson Note Studio</span>{" "}
            for a specific indicator using the{" "}
            <span className="font-semibold">“Open in Studio”</span>{" "}
            button. This keeps your{" "}
            <span className="font-semibold">Scheme of Work → Lesson Notes</span>{" "}
            flow in one place, fully tied to the trusted NaCCA curriculum.
          </p>
        </section>
      </div>
    </main>
  );
}
