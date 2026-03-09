// src/app/teacher/schemes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Teacher · Scheme of Work Overview
 *
 * GET /api/schemes?mode=summary
 *
 * Read-only summary page + canonical entry to Scheme Builder.
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

type TenantTermYearResponse = { ok?: boolean; term?: string | null; academicYear?: string | null };

const pillBase = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-8 px-3 rounded-xl border text-[11px] md:text-xs shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline = btnBase + " bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50";
const btnPrimary = btnBase + " bg-black text-white border-black hover:bg-zinc-900";

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: unknown): Term | "" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";
  const exact = (VALID_TERMS as readonly string[]).find((t) => t.toLowerCase() === v);
  return (exact as Term) ?? "";
}

function normalizeAcademicYear(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;
  if (/^\d{4}\/\d{4}$/.test(v)) return v;
  return v;
}

export default function TeacherSchemesPage() {
  const router = useRouter();

  const [schemes, setSchemes] = useState<SchemeOfWorkSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const [schemeNavLoading, setSchemeNavLoading] = useState(false);

  // ---------------------------
  // Load Scheme of Work summary
  // ---------------------------
  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/schemes?mode=summary", {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
        });

        if (res.status === 401 || res.status === 403) {
          setSchemes([]);
          setSelectedSchemeId(null);
          setError("Unauthorized. Please sign in again.");
          return;
        }

        const data = (await res.json().catch(() => ({}))) as SchemesSummaryResponse;

        if (!res.ok || !data.ok || !data.items) {
          setSchemes([]);
          setSelectedSchemeId(null);
          setError(data.error ?? "Failed to load schemes of work. Please try again.");
          return;
        }

        setSchemes(data.items);
        setSelectedSchemeId(data.items[0]?.id ?? null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("SCHEMES_SUMMARY_LOAD_ERROR", err);
        setSchemes([]);
        setSelectedSchemeId(null);
        setError("Network or server error while loading schemes of work.");
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => ac.abort();
  }, []);

  const selectedScheme = useMemo(
    () => schemes.find((s) => s.id === selectedSchemeId) ?? null,
    [schemes, selectedSchemeId]
  );

  const schemesByTermYear = useMemo(() => {
    const groups = new Map<string, SchemeOfWorkSummary[]>();
    for (const s of schemes) {
      const key = `${s.academicYear}__${s.term}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const [year, term] = key.split("__");
      return {
        academicYear: year,
        term,
        items: items.slice().sort((a, b) => (a.subject || "").localeCompare(b.subject || "")),
      };
    });
  }, [schemes]);

  /**
   * Canonical entry to scheme builder:
   * Always go to /teacher/curriculum?mode=scheme (+term/year if available) and return to /teacher/schemes.
   */
  async function openSchemeBuilder() {
    if (schemeNavLoading) return;
    setSchemeNavLoading(true);

    try {
      let t: Term | "" = "";
      let y = "";

      // Fetch tenant defaults (same as Lesson Notes flow)
      try {
        const res = await fetch("/api/settings/current-term-year", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const data = (await res.json().catch(() => ({}))) as TenantTermYearResponse;
        if (res.ok && data?.ok) {
          if (data.term) t = normalizeTerm(data.term);
          if (data.academicYear) y = normalizeAcademicYear(data.academicYear).trim();
        }
      } catch {
        // ignore; curriculum page will still fetch defaults
      }

      const p = new URLSearchParams();
      p.set("mode", "scheme");
      if (t) p.set("term", t);
      if (y) p.set("academicYear", y);
      p.set("return", "/teacher/schemes");

      router.push(`/teacher/curriculum?${p.toString()}`);
    } finally {
      setSchemeNavLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>
                EduLife OS · Teacher · Scheme of Work
              </span>
              <span className="text-[11px] text-zinc-500">Canonical: Curriculum → Scheme → Lesson Notes</span>
            </div>

            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Scheme of Work Overview</h1>

            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This screen shows <span className="font-semibold">real Scheme of Work records</span> stored in your database.
              Use <span className="font-semibold">Prepare scheme of work</span> to add indicators week-by-week.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openSchemeBuilder}
                className={btnPrimary}
                disabled={schemeNavLoading}
                title="Open Curriculum Explorer in Scheme Builder mode"
              >
                {schemeNavLoading ? "Opening…" : "Prepare scheme of work"}
              </button>

              <Link href="/teacher/lesson-notes" className={btnOutline}>
                Lesson Notes
              </Link>

              <Link href="/teacher/curriculum" className={btnOutline} title="Read-only curriculum browsing">
                Curriculum Explorer
              </Link>
            </div>

            <div className="text-[11px] text-zinc-500 max-w-xs md:text-right">
              If you ever see “No schemes found…”, you’re in the old attach flow. Use Scheme Builder instead.
            </div>
          </div>
        </header>

        {/* Error / status */}
        {error && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">{error}</div>
        )}

        {/* Main 2-column layout */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-4 md:gap-6">
          {/* LEFT */}
          <div className="space-y-3">
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">1 · Schemes by term &amp; academic year</h2>
                <div className="text-[11px] text-zinc-500">
                  {loading ? "Loading schemes…" : `${schemes.length} scheme${schemes.length === 1 ? "" : "s"} found`}
                </div>
              </div>

              {schemes.length === 0 && !loading && !error && (
                <p className="text-xs text-zinc-500">
                  No Scheme of Work records found yet. Click <span className="font-semibold">Prepare scheme of work</span> to create
                  your first one from NaCCA indicators.
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
                          {group.items.length} scheme{group.items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="px-3 py-2 space-y-1.5">
                      {group.items.map((s) => {
                        const isSelected = s.id === selectedSchemeId;
                        const weeksLabel =
                          s.weekNumbers && s.weekNumbers.length > 0
                            ? `Weeks: ${s.weekNumbers.slice().sort((a, b) => a - b).join(", ")}`
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
                                <div className="text-[12px] font-semibold text-zinc-900">{s.subject}</div>
                                <div className="text-[10px] text-zinc-500">
                                  Class: <span className="font-semibold">{s.classroomName ?? "—"}</span>
                                  {s.teacherName && (
                                    <>
                                      {" "}
                                      · Teacher: <span className="font-semibold">{s.teacherName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right space-y-0.5">
                                <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200">
                                  {s.totalItems} indicator{s.totalItems === 1 ? "" : "s"}
                                </div>
                                <div className="text-[10px] text-zinc-500">{weeksLabel}</div>
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
                Canonical workflow: <span className="font-semibold">Curriculum (scheme mode)</span> creates schemes + items,
                then Lesson Notes pulls from the same SchemeOfWorkItem records.
              </p>
            </div>
          </div>

          {/* RIGHT */}
          <aside className="space-y-3">
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">2 · Selected scheme details</h2>

              {!selectedScheme && (
                <p className="text-xs text-zinc-500">
                  Select a Scheme of Work on the left to see details. Then open the full week-by-week table.
                </p>
              )}

              {selectedScheme && (
                <div className="space-y-3 text-xs text-zinc-700">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Scheme overview</div>
                    <p className="text-[13px] font-semibold text-zinc-900">{selectedScheme.subject}</p>
                    <p>
                      Term: <span className="font-semibold">{selectedScheme.term}</span> · Academic year:{" "}
                      <span className="font-semibold">{selectedScheme.academicYear}</span>
                    </p>
                    <p>
                      Class: <span className="font-semibold">{selectedScheme.classroomName ?? "—"}</span>
                    </p>
                    {selectedScheme.teacherName && (
                      <p>
                        Teacher: <span className="font-semibold">{selectedScheme.teacherName}</span>
                      </p>
                    )}
                    <p>
                      Total indicators: <span className="font-semibold">{selectedScheme.totalItems}</span>
                    </p>
                    <p>
                      Weeks covered:{" "}
                      <span className="font-semibold">
                        {selectedScheme.weekNumbers && selectedScheme.weekNumbers.length > 0
                          ? selectedScheme.weekNumbers.slice().sort((a, b) => a - b).join(", ")
                          : "—"}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-600">
                      Next step: open the <span className="font-semibold">full scheme table</span> and then click{" "}
                      <span className="font-semibold">Open in Studio</span> on any indicator.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/teacher/schemes/${selectedScheme.id}`} className={btnOutline}>
                        Open full scheme
                      </Link>
                    </div>
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