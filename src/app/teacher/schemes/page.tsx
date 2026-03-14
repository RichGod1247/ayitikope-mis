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

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const pillBase =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const btnOutline =
  btnBase +
  " border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10";
const btnPrimary =
  btnBase +
  " border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";

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

function formatWeeks(weekNumbers: number[]) {
  if (!Array.isArray(weekNumbers) || weekNumbers.length === 0) return "—";
  return weekNumbers.slice().sort((a, b) => a - b).join(", ");
}

export default function TeacherSchemesPage() {
  const router = useRouter();

  const [schemes, setSchemes] = useState<SchemeOfWorkSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const [schemeNavLoading, setSchemeNavLoading] = useState(false);

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

  async function openSchemeBuilder() {
    if (schemeNavLoading) return;
    setSchemeNavLoading(true);

    try {
      let t: Term | "" = "";
      let y = "";

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
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:py-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx(pillBase, "border-emerald-300/25 bg-emerald-400/14 text-emerald-100")}>
                  EduLife OS · Teacher · Scheme of Work
                </span>
                <span className="text-[11px] text-[#AEB6C4]">
                  Canonical: Curriculum → Scheme → Lesson Notes
                </span>
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
                Scheme of Work Overview
              </h1>

              <p className="max-w-2xl text-sm leading-7 text-[#C9CDD6]">
                This screen shows <span className="font-semibold text-[#F7F4ED]">real Scheme of Work records</span> stored in your database.
                Use <span className="font-semibold text-[#F7F4ED]">Prepare scheme of work</span> to add indicators week-by-week.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 xl:items-end">
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

              <div className="max-w-xs text-[11px] text-[#8F98A8] xl:text-right">
                If you ever see “No schemes found…”, you’re in the old attach flow. Use Scheme Builder instead.
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] md:gap-6">
          <div className="space-y-3">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#F7F4ED]">
                  1 · Schemes by term &amp; academic year
                </h2>
                <div className="text-[11px] text-[#AEB6C4]">
                  {loading ? "Loading schemes…" : `${schemes.length} scheme${schemes.length === 1 ? "" : "s"} found`}
                </div>
              </div>

              {schemes.length === 0 && !loading && !error && (
                <p className="mt-3 text-xs text-[#AEB6C4]">
                  No Scheme of Work records found yet. Click{" "}
                  <span className="font-semibold text-[#F7F4ED]">Prepare scheme of work</span> to create
                  your first one from NaCCA indicators.
                </p>
              )}

              <div className="mt-3 max-h-[520px] space-y-3 overflow-auto pr-1">
                {schemesByTermYear.map((group) => (
                  <div
                    key={`${group.academicYear}-${group.term}`}
                    className="overflow-hidden rounded-[24px] border border-white/10 bg-[#08111C]/85"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                      <div className="space-y-0.5">
                        <div className="text-[12px] font-semibold text-[#F7F4ED]">
                          {group.term} · {group.academicYear}
                        </div>
                        <div className="text-[11px] text-[#8F98A8]">
                          {group.items.length} scheme{group.items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 px-3 py-2">
                      {group.items.map((s) => {
                        const isSelected = s.id === selectedSchemeId;
                        const weeksLabel =
                          s.weekNumbers && s.weekNumbers.length > 0
                            ? `Weeks: ${formatWeeks(s.weekNumbers)}`
                            : "Weeks: —";

                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedSchemeId(s.id)}
                            className={cx(
                              "w-full rounded-2xl border px-3 py-2 text-left text-[11px] transition",
                              isSelected
                                ? "border-[#E8C96A]/35 bg-[linear-gradient(135deg,rgba(212,175,55,0.10),rgba(27,102,209,0.08))] shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
                                : "border-white/10 bg-white/[0.03] hover:border-[#E8C96A]/20 hover:bg-white/[0.06]"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="text-[12px] font-semibold text-[#F7F4ED]">{s.subject}</div>
                                <div className="text-[10px] text-[#AEB6C4]">
                                  Class: <span className="font-semibold text-[#F7F4ED]">{s.classroomName ?? "—"}</span>
                                  {s.teacherName && (
                                    <>
                                      {" "}
                                      · Teacher: <span className="font-semibold text-[#F7F4ED]">{s.teacherName}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="text-right space-y-0.5">
                                <div className="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                                  {s.totalItems} indicator{s.totalItems === 1 ? "" : "s"}
                                </div>
                                <div className="text-[10px] text-[#8F98A8]">{weeksLabel}</div>
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

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[11px] text-[#C9CDD6]">
              <p>
                Canonical workflow: <span className="font-semibold text-[#F7F4ED]">Curriculum (scheme mode)</span> creates schemes + items,
                then Lesson Notes pulls from the same SchemeOfWorkItem records.
              </p>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
              <h2 className="text-sm font-semibold text-[#F7F4ED]">
                2 · Selected scheme details
              </h2>

              {!selectedScheme && (
                <p className="mt-3 text-xs text-[#AEB6C4]">
                  Select a Scheme of Work on the left to see details. Then open the full week-by-week table.
                </p>
              )}

              {selectedScheme && (
                <div className="mt-3 space-y-3 text-xs text-[#C9CDD6]">
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-[#08111C]/85 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">
                      Scheme overview
                    </div>
                    <p className="text-[13px] font-semibold text-[#F7F4ED]">{selectedScheme.subject}</p>
                    <p>
                      Term: <span className="font-semibold text-[#F7F4ED]">{selectedScheme.term}</span> · Academic year:{" "}
                      <span className="font-semibold text-[#F7F4ED]">{selectedScheme.academicYear}</span>
                    </p>
                    <p>
                      Class: <span className="font-semibold text-[#F7F4ED]">{selectedScheme.classroomName ?? "—"}</span>
                    </p>
                    {selectedScheme.teacherName && (
                      <p>
                        Teacher: <span className="font-semibold text-[#F7F4ED]">{selectedScheme.teacherName}</span>
                      </p>
                    )}
                    <p>
                      Total indicators: <span className="font-semibold text-[#F7F4ED]">{selectedScheme.totalItems}</span>
                    </p>
                    <p>
                      Weeks covered:{" "}
                      <span className="font-semibold text-[#F7F4ED]">{formatWeeks(selectedScheme.weekNumbers)}</span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[#AEB6C4]">
                      Next step: open the <span className="font-semibold text-[#F7F4ED]">full scheme table</span> and then click{" "}
                      <span className="font-semibold text-[#F7F4ED]">Open in Studio</span> on any indicator.
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