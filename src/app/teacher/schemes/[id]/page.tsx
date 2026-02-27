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

  // ✅ these are returned by /api/schemes already — we should use them
  subjectSlug?: string | null;
  level?: string | null;

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

function isThenable(v: unknown): v is Promise<any> {
  return (
    !!v &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as any).then === "function"
  );
}

// 🔒 Conservative slug validation (client-side only; server remains source of truth)
function normalizeSubjectSlug(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return null;
  return v;
}

// Simple “best effort” phase from level token.
// (Studio can ignore this if it doesn’t need it; we pass it anyway.)
function inferPhaseFromLevel(level: string | null | undefined): string | null {
  const v = String(level ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("KG")) return "KG";
  if (v.startsWith("JHS")) return "JHS";
  if (v.startsWith("B")) return "PRIMARY";
  if (v.startsWith("BASIC")) return "PRIMARY";
  return null;
}

/**
 * Fallback only: Infer meta from subject label if old records lack level/slug.
 * Keep this so the page still works even if older schemes don’t have these fields.
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

  const coreSlug = slugifyCore(src);
  return coreSlug ? { subjectSlug: coreSlug } : {};
}

export default function SchemeDetailPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const [paramsReady, setParamsReady] = useState(false);
  const [schemeId, setSchemeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [scheme, setScheme] = useState<SchemeOfWorkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) Resolve params safely (no render-time Promise work)
  useEffect(() => {
    let alive = true;

    async function resolve() {
      try {
        const raw: any = params as any;

        if (isThenable(raw)) {
          const p = await raw;
          const id = String(p?.id ?? "").trim();
          if (!alive) return;
          setSchemeId(id || null);
          setParamsReady(true);
          return;
        }

        const id = String(raw?.id ?? "").trim();
        if (!alive) return;
        setSchemeId(id || null);
        setParamsReady(true);
      } catch {
        if (!alive) return;
        setParamsReady(true);
        setSchemeId(null);
        setError("Failed to read route params.");
      }
    }

    void resolve();

    return () => {
      alive = false;
    };
  }, [params]);

  // 2) Load scheme once schemeId is known
  useEffect(() => {
    if (!paramsReady) return;

    const sid = (schemeId ?? "").trim();
    if (!sid) {
      setLoading(false);
      setScheme(null);
      setError("Missing scheme id.");
      return;
    }

    const ac = new AbortController();

    async function loadScheme(currentSchemeId: string) {
      setLoading(true);
      setError(null);
      setScheme(null);

      try {
        const url = `/api/schemes?id=${encodeURIComponent(currentSchemeId)}`;

        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
        });

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

    void loadScheme(sid);

    return () => {
      ac.abort();
    };
  }, [paramsReady, schemeId]);

  // Helper: build Lesson Note Studio deep-link URL (authoritative first, fallback second)
  const buildLessonNoteUrl = (weekNumber: number, item: SchemeOfWorkItemDto) => {
    if (!scheme) return "#";

    const subjectSlugFromApi = normalizeSubjectSlug(scheme.subjectSlug);
    const levelFromApi = String(scheme.level ?? "").trim();
    const phaseFromApi = inferPhaseFromLevel(levelFromApi) ?? null;

    const fallback = inferCurriculumMetaFromSubject(scheme.subject);

    const qs = new URLSearchParams();
    qs.set("schemeItemId", item.id);

    if (scheme.subject) qs.set("subject", scheme.subject);
    if (scheme.term) qs.set("term", scheme.term);
    if (scheme.academicYear) qs.set("academicYear", scheme.academicYear);
    if (weekNumber) qs.set("weekNumber", String(weekNumber));
    if (item.indicatorCode) qs.set("indicatorCode", item.indicatorCode);

    // Prefer API truth, fallback only if missing
    const finalLevel = levelFromApi || fallback.level || "";
    const finalPhase = phaseFromApi || fallback.phase || "";
    const finalSlug = subjectSlugFromApi || fallback.subjectSlug || "";

    if (finalPhase) qs.set("phase", finalPhase);
    if (finalLevel) qs.set("level", finalLevel);
    if (finalSlug) qs.set("subjectSlug", finalSlug);

    return `/teacher/lesson-notes/studio?${qs.toString()}`;
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
              disabled={!scheme}
            >
              Print Scheme of Work
            </button>
          </div>
        </header>

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
                    <div className="flex items-center justify-between gap-2 bg-zinc-100 px-3 py-2">
                      <div className="text-xs font-semibold text-zinc-800">
                        Week {group.weekNumber}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {group.items.length} indicator{group.items.length === 1 ? "" : "s"}
                      </div>
                    </div>

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
