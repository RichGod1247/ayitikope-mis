// src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ListItem = {
  id: string;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;
  lessonTitle: string | null;
  strand: string | null;
  substrand: string | null;
  status: LessonNoteStatus;
  updatedAt: string | null;
  createdAt: string | null;
  headteacherComment: string | null;
};

type FilterState = {
  status: LessonNoteStatus | "";
  term: string;
  academicYear: string;
  weekNumber: string;
};

const EMPTY_FILTERS: FilterState = {
  status: "",
  term: "",
  academicYear: "",
  weekNumber: "",
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store", credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: string): Term | "" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";
  const exact = (VALID_TERMS as readonly string[]).find((t) => t.toLowerCase() === v);
  return (exact as Term) ?? "";
}

function normalizeAcademicYear(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";

  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  if (/^\d{4}\/\d{4}$/.test(v)) return v;

  return v;
}

function toIntOrEmpty(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function statusBadgeClass(status: LessonNoteStatus) {
  switch (status) {
    case "DRAFT":
      return "border-white/10 bg-white/5 text-[#D7DCE5]";
    case "SUBMITTED":
      return "border-sky-300/25 bg-sky-400/12 text-sky-100";
    case "APPROVED":
      return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
    case "REJECTED":
      return "border-rose-300/25 bg-rose-400/12 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-[#D7DCE5]";
  }
}

function statusLabel(status: LessonNoteStatus) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Waiting for Headteacher";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Correction required";
  }
}

function primaryActionLabel(status: LessonNoteStatus) {
  switch (status) {
    case "DRAFT":
      return "Continue Lesson Note";
    case "SUBMITTED":
      return "View submission";
    case "APPROVED":
      return "View approved note";
    case "REJECTED":
      return "Read feedback & correct";
  }
}

function commentClass(status: LessonNoteStatus) {
  if (status === "APPROVED") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }
  if (status === "REJECTED") {
    return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  }
  return "border-amber-300/20 bg-amber-400/12 text-amber-100";
}

const cardShell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panel = "rounded-2xl border border-white/10 bg-[#0C1730]/78";
const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#7E8796] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";
const outlineBtn =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";
const goldBtn =
  "rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_16px_40px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:opacity-60";

function primaryButtonClass(status: LessonNoteStatus) {
  if (status === "SUBMITTED") return outlineBtn;
  if (status === "APPROVED") {
    return "rounded-xl bg-[linear-gradient(135deg,#34D399,#A7F3D0)] px-3 py-2 text-sm font-semibold text-[#052E24] shadow-[0_16px_40px_rgba(52,211,153,0.18)] transition hover:brightness-105";
  }
  return goldBtn;
}

export default function LessonNotesListClient() {
  const router = useRouter();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);

  const loadSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("take", "80");
    if (appliedFilters.status) sp.set("status", appliedFilters.status);

    const t = normalizeTerm(appliedFilters.term);
    if (t) sp.set("term", t);

    const y = normalizeAcademicYear(appliedFilters.academicYear);
    if (y.trim()) sp.set("academicYear", y.trim());

    const w = toIntOrEmpty(appliedFilters.weekNumber);
    if (w) sp.set("weekNumber", w);

    return sp.toString();
  }, [appliedFilters]);

  const normalizedTerm = normalizeTerm(filters.term);
  const normalizedYear = normalizeAcademicYear(filters.academicYear);
  const invalidYear = Boolean(filters.academicYear.trim() && !/^\d{4}\/\d{4}$/.test(normalizedYear));
  const invalidWeek = Boolean(filters.weekNumber.trim() && !toIntOrEmpty(filters.weekNumber));
  const hasActiveFilters = Boolean(
    appliedFilters.status || appliedFilters.term || appliedFilters.academicYear || appliedFilters.weekNumber
  );

  async function load() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const seq = ++loadSeq.current;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/teachers/lesson-notes/list?${query}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: ac.signal,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      if (seq !== loadSeq.current) return;

      setItems((data?.items as ListItem[]) || []);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to load lesson notes.";
      setErr(message);
      setItems([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function onDelete(id: string) {
    const yes = window.confirm("Delete this DRAFT lesson note? This cannot be undone.");
    if (!yes) return;

    try {
      await apiJson<{ ok: true }>(`/api/teachers/lesson-notes/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: id }),
      });
      await load();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete.");
    }
  }

  function applyFilters() {
    if (invalidYear || invalidWeek) return;
    setAppliedFilters({
      status: filters.status,
      term: normalizeTerm(filters.term),
      academicYear: normalizeAcademicYear(filters.academicYear),
      weekNumber: toIntOrEmpty(filters.weekNumber),
    });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }

  const priorityItem =
    items.find((item) => item.status === "REJECTED") ??
    items.find((item) => item.status === "DRAFT") ??
    null;
  const hasSubmitted = items.some((item) => item.status === "SUBMITTED");

  const nextStep = useMemo(() => {
    if (loading) {
      return {
        eyebrow: "YOUR NEXT STEP",
        title: "Loading your Lesson Notes",
        body: "EduLife is checking your saved Lesson Notes so it can show the right next action.",
        tone: "border-sky-300/20 bg-sky-400/10",
        actionLabel: null as string | null,
        action: null as (() => void) | null,
      };
    }

    if (priorityItem?.status === "REJECTED") {
      return {
        eyebrow: "CORRECTION REQUIRED",
        title: "A Lesson Note has been returned",
        body: "Read the Headteacher feedback, make the correction, save it, then resubmit.",
        tone: "border-rose-300/20 bg-rose-400/10",
        actionLabel: "Read feedback & correct",
        action: () => router.push(`/teacher/lesson-notes/${priorityItem.id}`),
      };
    }

    if (priorityItem?.status === "DRAFT") {
      return {
        eyebrow: "CONTINUE YOUR WORK",
        title: "Finish your draft Lesson Note",
        body: "Complete the required sections, save your work, then submit it to the Headteacher.",
        tone: "border-amber-300/20 bg-amber-400/10",
        actionLabel: "Continue Lesson Note",
        action: () => router.push(`/teacher/lesson-notes/${priorityItem.id}`),
      };
    }

    if (hasSubmitted) {
      return {
        eyebrow: "KEEP MOVING",
        title: "Submitted Lesson Notes are waiting for review",
        body: "No action is needed on those submissions now. You can prepare the next Lesson Note from another approved Scheme item.",
        tone: "border-sky-300/20 bg-sky-400/10",
        actionLabel: "Prepare next Lesson Note",
        action: () => router.push("/teacher/schemes"),
      };
    }

    return {
      eyebrow: "READY FOR THE NEXT LESSON",
      title: items.length ? "Prepare your next Lesson Note" : "Start your first Lesson Note",
      body: "Choose the week and indicator from an approved Scheme of Work. The server will recheck approval before creating the Lesson Note.",
      tone: "border-emerald-300/20 bg-emerald-400/10",
      actionLabel: "Choose Approved Scheme",
      action: () => router.push("/teacher/schemes"),
    };
  }, [hasSubmitted, items.length, loading, priorityItem, router]);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">Lesson Notes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
              Prepare from an approved Scheme, finish the Lesson Note, submit it, then follow the status shown here.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={outlineBtn} onClick={() => setFiltersOpen((open) => !open)}>
              {filtersOpen ? "Hide filters" : hasActiveFilters ? "Filters · On" : "Filters"}
            </button>
            <button className={outlineBtn} onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <section className={cx("rounded-[28px] border p-4 shadow-[0_18px_60px_rgba(0,0,0,0.16)] md:p-5", nextStep.tone)}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">{nextStep.eyebrow}</div>
            <h2 className="mt-1 text-lg font-bold text-[#F7F4ED]">{nextStep.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#C9CDD6]">{nextStep.body}</p>
          </div>
          {nextStep.action && nextStep.actionLabel ? (
            <button className={goldBtn + " w-full md:w-auto"} onClick={nextStep.action}>
              {nextStep.actionLabel}
            </button>
          ) : null}
        </div>

        {priorityItem ? (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-[#C9CDD6] underline decoration-white/25 underline-offset-4 hover:text-white"
            onClick={() => router.push("/teacher/schemes")}
          >
            Prepare another Lesson Note from an approved Scheme
          </button>
        ) : null}
      </section>

      {filtersOpen ? (
        <section className={cardShell}>
          <div className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">Find a Lesson Note</h2>
                <p className="mt-1 text-xs text-[#9AA4B2]">
                  Choose your filters, then tap Apply once. EduLife will not reload while you are still typing.
                </p>
              </div>
              {hasActiveFilters ? (
                <button className={outlineBtn + " px-2.5 py-1.5 text-xs"} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={panel + " p-3"}>
                <label className="text-xs text-[#9AA4B2]">Status</label>
                <select
                  className={inputClass}
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, status: event.target.value as LessonNoteStatus | "" }))
                  }
                >
                  <option value="">All</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUBMITTED">Waiting</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Correction required</option>
                </select>
              </div>

              <div className={panel + " p-3"}>
                <label className="text-xs text-[#9AA4B2]">Term</label>
                <select
                  className={inputClass}
                  value={filters.term}
                  onChange={(event) => setFilters((current) => ({ ...current, term: event.target.value }))}
                >
                  <option value="">All</option>
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                </select>
                {filters.term && !normalizedTerm ? (
                  <div className="mt-2 text-[11px] text-amber-200">Choose 1st, 2nd or 3rd Term.</div>
                ) : null}
              </div>

              <div className={panel + " p-3"}>
                <label className="text-xs text-[#9AA4B2]">Academic year</label>
                <input
                  className={inputClass}
                  placeholder="2025/2026"
                  value={filters.academicYear}
                  onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
                />
                {invalidYear ? <div className="mt-2 text-[11px] text-amber-200">Use YYYY/YYYY, for example 2025/2026.</div> : null}
              </div>

              <div className={panel + " p-3"}>
                <label className="text-xs text-[#9AA4B2]">Week</label>
                <input
                  className={inputClass}
                  placeholder="1"
                  inputMode="numeric"
                  value={filters.weekNumber}
                  onChange={(event) => setFilters((current) => ({ ...current, weekNumber: event.target.value }))}
                />
                {invalidWeek ? <div className="mt-2 text-[11px] text-amber-200">Use a positive whole number.</div> : null}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button className={goldBtn + " w-full md:w-auto"} onClick={applyFilters} disabled={invalidYear || invalidWeek}>
                Apply filters
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={cardShell}>
        <div className="p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#F7F4ED]">Your Lesson Notes</h2>
              <p className="mt-1 text-xs text-[#9AA4B2]">
                Status tells you what happens next. Existing Lesson Notes remain available here.
              </p>
            </div>
            <button className={outlineBtn} onClick={() => router.push("/teacher/schemes")}>
              Prepare another
            </button>
          </div>

          <div className="mt-4">
            {err ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-500/12 p-3 text-sm text-rose-100">{err}</div>
            ) : null}

            {loading ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#C9CDD6]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.04] p-5">
                <div className="text-sm font-semibold text-[#F7F4ED]">No Lesson Notes found.</div>
                <div className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                  Start from Scheme of Work. EduLife will only create a Lesson Note from an approved Scheme.
                </div>
                <button className={goldBtn + " mt-4 w-full sm:w-auto"} onClick={() => router.push("/teacher/schemes")}>
                  Choose Approved Scheme
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:hidden">
                  {items.map((noteItem) => (
                    <article key={noteItem.id} className="rounded-[22px] border border-white/10 bg-[#08111F]/92 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-[#9AA4B2]">Week {noteItem.weekNumber ?? "—"}</div>
                          <div className="mt-1 font-semibold text-[#F7F4ED]">{noteItem.subject ?? "Lesson Note"}</div>
                          <div className="mt-1 text-sm leading-5 text-[#C9CDD6]">{noteItem.lessonTitle ?? "Untitled Lesson Note"}</div>
                        </div>
                        <span className={cx("inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusBadgeClass(noteItem.status))}>
                          {statusLabel(noteItem.status)}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-[#8F98A8]">
                        {noteItem.term ?? "—"} · {noteItem.academicYear ?? "—"}
                      </div>

                      {noteItem.headteacherComment ? (
                        <div className={cx("mt-3 rounded-xl border p-3 text-xs leading-5", commentClass(noteItem.status))}>
                          <div className="font-semibold">Headteacher feedback</div>
                          <div className="mt-1 whitespace-pre-wrap">{noteItem.headteacherComment}</div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          className={primaryButtonClass(noteItem.status) + " w-full sm:w-auto"}
                          onClick={() => router.push(`/teacher/lesson-notes/${noteItem.id}`)}
                        >
                          {primaryActionLabel(noteItem.status)}
                        </button>
                        <button
                          className={outlineBtn + " w-full sm:w-auto"}
                          onClick={() => router.push(`/teacher/lesson-notes/${noteItem.id}/print`)}
                        >
                          Print
                        </button>
                        {noteItem.status === "DRAFT" ? (
                          <button
                            className="w-full rounded-xl border border-rose-300/20 bg-rose-500/12 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/18 sm:w-auto"
                            onClick={() => onDelete(noteItem.id)}
                          >
                            Delete draft
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 hidden overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111F]/90 shadow-[0_20px_70px_rgba(0,0,0,0.20)] md:block">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.04]">
                      <tr className="text-left text-[#E8C96A]">
                        <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Week</th>
                        <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Lesson Note</th>
                        <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Status</th>
                        <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Updated</th>
                        <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Next action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((noteItem) => (
                        <tr key={noteItem.id} className="border-t border-white/10 align-top">
                          <td className="p-3 text-[#DDE3ED]">{noteItem.weekNumber ?? "—"}</td>
                          <td className="p-3">
                            <div className="font-medium text-[#F7F4ED]">{noteItem.subject ?? "—"}</div>
                            <div className="mt-1 text-sm text-[#DDE3ED]">{noteItem.lessonTitle ?? "Untitled Lesson Note"}</div>
                            <div className="mt-1 text-xs text-[#8F98A8]">
                              {noteItem.term ?? "—"} · {noteItem.academicYear ?? "—"}
                            </div>
                            {noteItem.headteacherComment ? (
                              <div className={cx("mt-2 rounded-xl border p-2 text-xs", commentClass(noteItem.status))}>
                                Headteacher: {noteItem.headteacherComment}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusBadgeClass(noteItem.status))}>
                              {statusLabel(noteItem.status)}
                            </span>
                          </td>
                          <td className="p-3 text-[#C9CDD6]">
                            {noteItem.updatedAt ? new Date(noteItem.updatedAt).toLocaleString() : "—"}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                className={primaryButtonClass(noteItem.status) + " px-2.5 py-1.5 text-xs"}
                                onClick={() => router.push(`/teacher/lesson-notes/${noteItem.id}`)}
                              >
                                {primaryActionLabel(noteItem.status)}
                              </button>
                              <button
                                className={outlineBtn + " px-2.5 py-1.5 text-xs"}
                                onClick={() => router.push(`/teacher/lesson-notes/${noteItem.id}/print`)}
                              >
                                Print
                              </button>
                              {noteItem.status === "DRAFT" ? (
                                <button
                                  className="rounded-xl border border-rose-300/20 bg-rose-500/12 px-2.5 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/18"
                                  onClick={() => onDelete(noteItem.id)}
                                >
                                  Delete draft
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
