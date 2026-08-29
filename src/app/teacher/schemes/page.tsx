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
 * Guided Scheme lifecycle page using persisted server status.
 */

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

type SchemeOfWorkSummary = {
  id: string;
  subject: string;
  subjectSlug?: string | null;
  level?: string | null;
  term: string;
  academicYear: string;
  classroomName?: string | null;
  teacherName?: string | null;
  totalItems: number;
  weekNumbers: number[];
  status: SchemeStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  returnedAt?: string | null;
  headteacherComment?: string | null;
  isEditable?: boolean;
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

function statusLabel(status: SchemeStatus) {
  if (status === "SUBMITTED") return "Submitted";
  if (status === "APPROVED") return "Approved";
  if (status === "RETURNED") return "Returned";
  return "Draft";
}

function statusClass(status: SchemeStatus) {
  if (status === "APPROVED") return "border-emerald-300/25 bg-emerald-400/14 text-emerald-100";
  if (status === "SUBMITTED") return "border-amber-300/25 bg-amber-400/14 text-amber-100";
  if (status === "RETURNED") return "border-rose-300/25 bg-rose-400/14 text-rose-100";
  return "border-white/10 bg-white/10 text-[#C9CDD6]";
}

function guideToneClass(status: SchemeStatus) {
  if (status === "APPROVED") return "border-emerald-300/25 bg-emerald-400/12";
  if (status === "SUBMITTED") return "border-amber-300/25 bg-amber-400/12";
  if (status === "RETURNED") return "border-rose-300/25 bg-rose-400/12";
  return "border-sky-300/20 bg-sky-400/10";
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

  async function openSchemeBuilder(scheme?: SchemeOfWorkSummary | null) {
    if (schemeNavLoading) return;
    setSchemeNavLoading(true);

    try {
      let t: Term | "" = scheme ? normalizeTerm(scheme.term) : "";
      let y = scheme ? normalizeAcademicYear(scheme.academicYear).trim() : "";

      if (!scheme) {
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
          // The preparation page can still load its own tenant defaults.
        }
      }

      const p = new URLSearchParams();
      p.set("mode", "scheme");
      if (t) p.set("term", t);
      if (y) p.set("academicYear", y);

      if (scheme) {
        if (scheme.level) p.set("level", scheme.level);
        if (scheme.subjectSlug) p.set("subjectSlug", scheme.subjectSlug);
        else if (scheme.subject) p.set("subject", scheme.subject);
        p.set("schemeId", scheme.id);
        p.set("return", `/teacher/schemes/${scheme.id}`);
      } else {
        p.set("return", "/teacher/schemes");
      }

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

          <div className="relative space-y-3">
            <span className={cx(pillBase, "border-emerald-300/25 bg-emerald-400/14 text-emerald-100")}>
              EduLife OS · Teacher · Scheme of Work
            </span>

            <h1 className="text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
              Scheme of Work
            </h1>

            <p className="max-w-2xl text-sm leading-7 text-[#C9CDD6]">
              EduLife shows the next step from your saved Scheme status. Lesson Notes become available only after Headteacher approval.
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {!error && (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
            {loading ? (
              <p className="text-sm text-[#C9CDD6]">Checking your Scheme of Work…</p>
            ) : schemes.length === 0 ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">Step 1</p>
                  <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Prepare your Scheme of Work</h2>
                  <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                    No Scheme of Work has been prepared yet. Start by choosing your class, subject, week and NaCCA indicators.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openSchemeBuilder()}
                  className={btnPrimary}
                  disabled={schemeNavLoading}
                >
                  {schemeNavLoading ? "Opening…" : "Prepare Scheme of Work"}
                </button>
              </div>
            ) : selectedScheme ? (
              <div className={cx("rounded-2xl border p-4", guideToneClass(selectedScheme.status))}>
                {selectedScheme.status === "DRAFT" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">Current step</p>
                      <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">
                        {selectedScheme.totalItems > 0 ? "Review your Scheme and submit it" : "Continue preparing your Scheme"}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                        Lesson Notes stay locked until this Scheme is submitted and approved by the Headteacher.
                      </p>
                    </div>
                    {selectedScheme.totalItems > 0 ? (
                      <Link href={`/teacher/schemes/${selectedScheme.id}`} className={btnPrimary}>
                        Review &amp; Submit
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openSchemeBuilder(selectedScheme)}
                        className={btnPrimary}
                        disabled={schemeNavLoading}
                      >
                        {schemeNavLoading ? "Opening…" : "Continue Scheme"}
                      </button>
                    )}
                  </div>
                )}

                {selectedScheme.status === "SUBMITTED" && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">Waiting for approval</p>
                    <h2 className="text-lg font-bold text-[#F7F4ED]">Submitted to the Headteacher</h2>
                    <p className="text-sm leading-6 text-[#C9CDD6]">
                      No action is needed now. Lesson Notes will unlock after approval, or this Scheme will return here if a correction is needed.
                    </p>
                  </div>
                )}

                {selectedScheme.status === "RETURNED" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100">Correction required</p>
                      <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Correct this Scheme of Work</h2>
                      <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                        Read the Headteacher feedback below, correct the Scheme, then resubmit it for approval.
                      </p>
                    </div>
                    {selectedScheme.headteacherComment && (
                      <div className="rounded-xl border border-rose-300/20 bg-black/10 px-3 py-2 text-sm text-rose-50">
                        <span className="font-semibold">Headteacher: </span>{selectedScheme.headteacherComment}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openSchemeBuilder(selectedScheme)}
                      className={btnPrimary}
                      disabled={schemeNavLoading}
                    >
                      {schemeNavLoading ? "Opening…" : "Correct Scheme"}
                    </button>
                  </div>
                )}

                {selectedScheme.status === "APPROVED" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">Approved</p>
                      <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Lesson Notes are now unlocked</h2>
                      <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                        Open this approved Scheme, choose the week and indicator you are teaching, then prepare the Lesson Note.
                      </p>
                    </div>
                    <Link href={`/teacher/schemes/${selectedScheme.id}`} className={btnPrimary}>
                      Prepare Lesson Notes
                    </Link>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] md:gap-6">
          <div className="space-y-3">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F4ED]">
                    Your Schemes
                  </h2>
                  <div className="text-[11px] text-[#AEB6C4]">
                    {loading ? "Loading schemes…" : `${schemes.length} scheme${schemes.length === 1 ? "" : "s"} found`}
                  </div>
                </div>

                {schemes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openSchemeBuilder()}
                    className={btnOutline}
                    disabled={schemeNavLoading}
                  >
                    {schemeNavLoading ? "Opening…" : "Prepare another Scheme"}
                  </button>
                )}
              </div>

              {schemes.length === 0 && !loading && !error && (
                <p className="mt-3 text-xs text-[#AEB6C4]">
                  No Scheme of Work records found yet. Use the guided action above to prepare your first Scheme.
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

                              <div className="space-y-1 text-right">
                                <div
                                  className={cx(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                                    statusClass(s.status)
                                  )}
                                >
                                  {statusLabel(s.status)}
                                </div>
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
              Prepare → Submit → Headteacher approval → Lesson Notes.
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
              <h2 className="text-sm font-semibold text-[#F7F4ED]">
                Selected Scheme
              </h2>

              {!selectedScheme && (
                <p className="mt-3 text-xs text-[#AEB6C4]">
                  Select a Scheme above to see its status, weeks and Headteacher feedback.
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
                      Status:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {statusLabel(selectedScheme.status)}
                      </span>
                    </p>
                    <p>
                      Weeks covered:{" "}
                      <span className="font-semibold text-[#F7F4ED]">{formatWeeks(selectedScheme.weekNumbers)}</span>
                    </p>
                    {selectedScheme.headteacherComment && (
                      <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs leading-6 text-rose-100">
                        <span className="font-bold">Headteacher comment: </span>
                        {selectedScheme.headteacherComment}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href={`/teacher/schemes/${selectedScheme.id}`} className={btnOutline}>
                      View Scheme
                    </Link>
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