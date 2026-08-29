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

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

type SchemeOfWorkDetail = {
  id: string;
  subject: string;
  subjectSlug?: string | null;
  level?: string | null;
  term: string;
  academicYear: string;
  teacherName?: string | null;
  className?: string | null;
  status: SchemeStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  returnedAt?: string | null;
  headteacherComment?: string | null;
  isEditable?: boolean;
  createdAt: string;
  updatedAt?: string | null;
  items: SchemeOfWorkItemDto[];
};

type SchemeDetailResponse = {
  ok: boolean;
  scheme?: SchemeOfWorkDetail;
  error?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const pillBase =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const btnOutline =
  btnBase +
  " border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10";
const btnPrimary =
  btnBase +
  " border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";

function isThenable(v: unknown): v is Promise<any> {
  return (
    !!v &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as any).then === "function"
  );
}

function normalizeSubjectSlug(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return null;
  return v;
}

function inferPhaseFromLevel(level: string | null | undefined): string | null {
  const v = String(level ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("KG")) return "KG";
  if (v.startsWith("JHS")) return "JHS";
  if (v.startsWith("B")) return "PRIMARY";
  if (v.startsWith("BASIC")) return "PRIMARY";
  return null;
}

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

function formatWeeks(items: SchemeOfWorkItemDto[]) {
  const weeks = Array.from(new Set(items.map((x) => x.weekNumber).filter((x) => Number.isFinite(x))));
  return weeks.sort((a, b) => a - b).join(", ");
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
  const [submitBusy, setSubmitBusy] = useState(false);

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

    const finalLevel = levelFromApi || fallback.level || "";
    const finalPhase = phaseFromApi || fallback.phase || "";
    const finalSlug = subjectSlugFromApi || fallback.subjectSlug || "";

    if (finalPhase) qs.set("phase", finalPhase);
    if (finalLevel) qs.set("level", finalLevel);
    if (finalSlug) qs.set("subjectSlug", finalSlug);

    return `/teacher/lesson-notes/studio?${qs.toString()}`;
  };

  const buildSchemeEditorUrl = () => {
    if (!scheme) return "/teacher/schemes";

    const subjectSlugFromApi = normalizeSubjectSlug(scheme.subjectSlug);
    const levelFromApi = String(scheme.level ?? "").trim();
    const fallback = inferCurriculumMetaFromSubject(scheme.subject);

    const qs = new URLSearchParams();
    qs.set("mode", "scheme");
    qs.set("term", scheme.term);
    qs.set("academicYear", scheme.academicYear);
    qs.set("schemeId", scheme.id);
    qs.set("return", `/teacher/schemes/${scheme.id}`);

    const finalLevel = levelFromApi || fallback.level || "";
    const finalSlug = subjectSlugFromApi || fallback.subjectSlug || "";

    if (finalLevel) qs.set("level", finalLevel);
    if (finalSlug) qs.set("subjectSlug", finalSlug);
    else if (scheme.subject) qs.set("subject", scheme.subject);

    return `/teacher/curriculum?${qs.toString()}`;
  };

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

  async function submitScheme() {
    if (!scheme || submitBusy) return;

    if (scheme.items.length < 1) {
      setError("Add at least one week/indicator before submitting this scheme.");
      return;
    }

    const ok = window.confirm(
      "Submit this scheme to the headteacher? It will lock until returned or approved."
    );

    if (!ok) return;

    setSubmitBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/schemes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "submit",
          schemeId: scheme.id,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Failed to submit scheme.");
        return;
      }

      const reload = await fetch(`/api/schemes?id=${encodeURIComponent(scheme.id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const next = (await reload.json().catch(() => ({}))) as SchemeDetailResponse;

      if (reload.ok && next.ok && next.scheme) {
        setScheme(next.scheme);
      }
    } catch {
      setError("Network error while submitting scheme.");
    } finally {
      setSubmitBusy(false);
    }
  }

  const hasItems = !!scheme && scheme.items.length > 0;

  return (
    <main className="min-h-screen print:bg-white print:text-black">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:py-8 print:max-w-none print:px-0 print:py-0">
        <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6 print:rounded-none print:border-slate-300 print:bg-white print:text-black print:shadow-none">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px] print:hidden" />
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl print:hidden" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl print:hidden" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <span className={cx(pillBase, "border-emerald-300/25 bg-emerald-400/14 text-emerald-100")}>
                  EduLife OS · Teacher · Scheme of Work
                </span>
                {scheme && (
                  <span
                    className={cx(
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold print:hidden",
                      statusClass(scheme.status)
                    )}
                  >
                    {statusLabel(scheme.status)}
                  </span>
                )}
                {scheme && (
                  <span className="text-[11px] text-[#AEB6C4]">
                    {scheme.subject} · {scheme.term} · {scheme.academicYear}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight text-[#F7F4ED] print:text-black md:text-3xl">
                {scheme ? `${scheme.subject} – Scheme of Work` : "Scheme of Work"}
              </h1>

              <p className="max-w-2xl text-sm leading-7 text-[#C9CDD6] print:text-slate-700">
                Review the weekly plan and follow the next step shown below. Lesson Notes are available only when this Scheme is approved.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 text-[11px] text-[#AEB6C4] print:text-slate-600 md:items-end">
              {scheme && (
                <>
                  <p>
                    Term: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.term}</span>
                  </p>
                  <p>
                    Academic year: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.academicYear}</span>
                  </p>
                  {scheme.className && (
                    <p>
                      Class: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.className}</span>
                    </p>
                  )}
                  {scheme.teacherName && (
                    <p>
                      Teacher: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.teacherName}</span>
                    </p>
                  )}
                  <p className="print:hidden">
                    Status: <span className="font-semibold text-[#F7F4ED] print:text-black">{statusLabel(scheme.status)}</span>
                  </p>
                </>
              )}

              <div className="flex flex-wrap gap-2 print:hidden">
                <Link href="/teacher/schemes" className={btnOutline}>
                  Back to Schemes
                </Link>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={btnPrimary}
                  disabled={!scheme}
                >
                  Print Scheme of Work
                </button>
              </div>
            </div>
          </div>
        </header>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#C9CDD6]">
            Loading Scheme of Work…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {!loading && !error && !scheme && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#C9CDD6]">
            Scheme of Work not found.
          </div>
        )}

        {scheme?.headteacherComment && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm leading-7 text-rose-100 print:hidden">
            <span className="font-bold">Headteacher comment: </span>
            {scheme.headteacherComment}
          </div>
        )}

        {scheme && (
          <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 print:hidden">
            {scheme.status === "DRAFT" && (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">Next step</p>
                  <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Finish and submit this Scheme</h2>
                  <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                    Check the weeks below. Add any missing indicators, then submit the Scheme to the Headteacher.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildSchemeEditorUrl()} className={btnOutline}>
                    Continue Scheme
                  </Link>
                  <button
                    type="button"
                    onClick={submitScheme}
                    className={btnPrimary}
                    disabled={submitBusy || scheme.items.length < 1}
                  >
                    {submitBusy ? "Submitting…" : "Submit for Approval"}
                  </button>
                </div>
              </div>
            )}

            {scheme.status === "SUBMITTED" && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">Waiting for approval</p>
                <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Submitted to the Headteacher</h2>
                <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                  No action is needed now. This page will show the correction step if the Scheme is returned, or Lesson Notes when it is approved.
                </p>
              </div>
            )}

            {scheme.status === "RETURNED" && (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100">Correction required</p>
                  <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Correct and resubmit this Scheme</h2>
                  <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                    Use the Headteacher feedback above to correct the Scheme. When the correction is complete, resubmit it for approval.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildSchemeEditorUrl()} className={btnPrimary}>
                    Correct Scheme
                  </Link>
                  <button
                    type="button"
                    onClick={submitScheme}
                    className={btnOutline}
                    disabled={submitBusy || scheme.items.length < 1}
                  >
                    {submitBusy ? "Submitting…" : "Resubmit for Approval"}
                  </button>
                </div>
              </div>
            )}

            {scheme.status === "APPROVED" && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">Approved</p>
                <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">Prepare your Lesson Notes</h2>
                <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                  Choose the week and indicator below, then tap <span className="font-semibold text-[#F7F4ED]">Prepare Lesson Note</span>.
                </p>
              </div>
            )}
          </section>
        )}

        {scheme && (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl print:rounded-none print:border-slate-300 print:bg-white print:shadow-none md:p-5">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 print:border-slate-200">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[#F7F4ED] print:text-black">
                  Weekly breakdown
                </h2>
                <p className="text-[11px] text-[#AEB6C4] print:text-slate-600">
                  Each row links a NaCCA indicator to a specific week, strand and sub-strand.
                  {scheme.status === "APPROVED"
                    ? " Choose the indicator you are teaching to prepare its Lesson Note."
                    : " Lesson Note preparation stays unavailable until Headteacher approval."}
                </p>
              </div>

              {hasItems && (
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-100 print:border-slate-300 print:bg-slate-100 print:text-slate-700">
                  {scheme.items.length} indicator{scheme.items.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08111C]/85 px-3 py-2 text-[11px] text-[#C9CDD6] print:border-slate-200 print:bg-slate-50 print:text-slate-700">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Subject: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.subject}</span>
                </span>
                <span>
                  Term: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.term}</span>
                </span>
                <span>
                  Year: <span className="font-semibold text-[#F7F4ED] print:text-black">{scheme.academicYear}</span>
                </span>
                <span>
                  Weeks: <span className="font-semibold text-[#F7F4ED] print:text-black">{formatWeeks(scheme.items) || "—"}</span>
                </span>
              </div>
            </div>

            {!hasItems && (
              <p className="text-xs text-[#AEB6C4] print:text-slate-600">
                No weekly indicators have been added yet. Return to the Scheme preparation screen to add the first week.
              </p>
            )}

            {hasItems && (
              <div className="space-y-4">
                {groupedByWeek.map((group) => (
                  <div
                    key={group.weekNumber}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-[#08111C]/85 print:border-slate-300 print:bg-white"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 print:border-slate-200 print:bg-slate-50">
                      <div className="text-xs font-semibold text-[#F7F4ED] print:text-black">
                        Week {group.weekNumber}
                      </div>
                      <div className="text-[10px] text-[#AEB6C4] print:text-slate-600">
                        {group.items.length} indicator{group.items.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-[11px]">
                        <thead className="bg-white/[0.04] print:bg-slate-50">
                          <tr>
                            <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700">
                              Strand
                            </th>
                            <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700">
                              Sub-strand
                            </th>
                            <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700">
                              Content Std.
                            </th>
                            <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700">
                              Indicator Code
                            </th>
                            <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700">
                              Indicator Description
                            </th>
                            {scheme.status === "APPROVED" && (
                              <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E8C96A] print:border-slate-200 print:text-slate-700 print:hidden">
                                Lesson Note
                              </th>
                            )}
                          </tr>
                        </thead>

                        <tbody>
                          {group.items.map((item, index) => (
                            <tr
                              key={item.id}
                              className={index % 2 === 0 ? "bg-transparent" : "bg-white/[0.03] print:bg-slate-50/60"}
                            >
                              <td className="border-b border-white/10 px-3 py-2 align-top text-[#F7F4ED] print:border-slate-200 print:text-black">
                                {item.strandTitle || "—"}
                              </td>

                              <td className="border-b border-white/10 px-3 py-2 align-top text-[#F7F4ED] print:border-slate-200 print:text-black">
                                {item.subStrandTitle || "—"}
                              </td>

                              <td className="border-b border-white/10 px-3 py-2 align-top text-[#C9CDD6] print:border-slate-200 print:text-slate-700">
                                {item.contentStandardCode ? item.contentStandardCode : "—"}
                                {item.contentStandardDescription && (
                                  <span className="mt-0.5 block text-[10px] text-[#8F98A8] print:text-slate-500">
                                    {item.contentStandardDescription}
                                  </span>
                                )}
                              </td>

                              <td className="whitespace-nowrap border-b border-white/10 px-3 py-2 align-top text-[#F7F4ED] print:border-slate-200 print:text-black">
                                {item.indicatorCode || "—"}
                              </td>

                              <td className="border-b border-white/10 px-3 py-2 align-top text-[#F7F4ED] print:border-slate-200 print:text-black">
                                {item.indicatorDescription}
                              </td>

                              {scheme.status === "APPROVED" && (
                                <td className="whitespace-nowrap border-b border-white/10 px-3 py-2 align-top print:hidden">
                                  {item.indicatorCode ? (
                                    <Link
                                      href={buildLessonNoteUrl(group.weekNumber, item)}
                                      className={btnPrimary}
                                    >
                                      Prepare Lesson Note
                                    </Link>
                                  ) : (
                                    <span className="text-[10px] text-[#8F98A8]">Indicator unavailable</span>
                                  )}
                                </td>
                              )}
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

        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[11px] text-[#C9CDD6] print:hidden">
          Prepare → Submit → Headteacher approval → Prepare Lesson Notes.
        </section>
      </div>
    </main>
  );
}