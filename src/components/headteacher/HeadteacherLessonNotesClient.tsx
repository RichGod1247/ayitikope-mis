// src/components/headteacher/HeadteacherLessonNotesClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type StatusFilter = LessonNoteStatus | "ALL";

type LessonNoteListItem = {
  id: string;

  teacherUserId: string | null;
  teacherName: string | null;

  classroomId: string | null;

  phase: string | null;
  level: string | null;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;

  strand: string | null;
  substrand: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  createdAt: string;
  updatedAt: string;
};

type ListResponse =
  | { ok: true; items: LessonNoteListItem[]; nextCursor: string | null; pageSize: number }
  | { ok: false; error: string };

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  `${btnBase} bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] border-transparent font-semibold shadow-[0_16px_40px_rgba(212,175,55,0.22)]`;
const btnOutline =
  `${btnBase} bg-white/5 text-[#F7F4ED] border-white/10 hover:bg-white/10`;
const pillBase = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

function statusBadgeClasses(status: LessonNoteStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium";
  switch (status) {
    case "DRAFT":
      return `${base} bg-white/5 border-white/10 text-[#D7DCE5]`;
    case "SUBMITTED":
      return `${base} bg-amber-400/12 border-amber-300/20 text-amber-100`;
    case "APPROVED":
      return `${base} bg-emerald-400/12 border-emerald-300/20 text-emerald-100`;
    case "REJECTED":
      return `${base} bg-rose-400/12 border-rose-300/20 text-rose-100`;
    default:
      return base;
  }
}

function statusLabel(status: LessonNoteStatus) {
  if (status === "DRAFT") return "Draft";
  if (status === "SUBMITTED") return "Submitted";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Returned";
  return status;
}

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function HeadteacherLessonNotesClient() {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("SUBMITTED");
  const [teacherFilter, setTeacherFilter] = useState<string>("");

  const debouncedTeacher = useDebouncedValue(teacherFilter.trim(), 400);

  const [items, setItems] = useState<LessonNoteListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  function resetAndLoad() {
    setItems([]);
    setNextCursor(null);
    setLoadError(null);
    void loadPage({ cursor: null, append: false });
  }

  async function loadPage(opts: { cursor: string | null; append: boolean }) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (opts.append) setLoadingMore(true);
    else setLoading(true);

    try {
      const p = new URLSearchParams();
      p.set("status", statusFilter);
      if (debouncedTeacher) p.set("teacher", debouncedTeacher);
      p.set("limit", "20");
      if (opts.cursor) p.set("cursor", opts.cursor);

      const res = await fetch(`/api/headteacher/lesson-notes/list?${p.toString()}`, {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
        signal: ac.signal,
      });

      const data = (await res.json().catch(() => ({}))) as ListResponse;

      if (!res.ok || !data.ok) {
        setLoadError((data as any)?.error ?? "Failed to load lesson notes.");
        if (!opts.append) setItems([]);
        return;
      }

      setLoadError(null);
      setItems((prev) => (opts.append ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("HEADTEACHER_LIST_CLIENT_ERROR", err);
      setLoadError("Network or server error while loading lesson notes.");
      if (!opts.append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    resetAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedTeacher]);

  const hasNotes = items.length > 0;

  const subtitle = useMemo(() => {
    const s = statusFilter === "ALL" ? "All statuses" : statusLabel(statusFilter as LessonNoteStatus);
    return debouncedTeacher ? `${s} · Teacher filter: "${debouncedTeacher}"` : s;
  }, [statusFilter, debouncedTeacher]);

  function openNote(id: string) {
    router.push(`/headteacher/lesson-notes/${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-sky-300/20 bg-sky-400/12 text-sky-100`}>
                EduLife OS · Headteacher Review
              </span>
              <span className="text-[11px] text-[#AEB6C4]">{subtitle}</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-[#F7F4ED] md:text-2xl">
              Lesson Notes · Review &amp; Approval
            </h1>
            <p className="max-w-2xl text-xs text-[#C9CDD6] md:text-sm">
              This inbox is <span className="font-semibold text-[#F7F4ED]">tenant-scoped and role-guarded</span>. You review only notes in your school.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="inline-flex flex-wrap gap-1.5">
              {(["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const).map((s) => {
                const active = statusFilter === s;
                const label = s === "ALL" ? "All" : statusLabel(s as LessonNoteStatus);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] border ${
                      active
                        ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] font-semibold"
                        : "border-white/10 bg-white/5 text-[#D7DCE5] hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                className="w-56 rounded-xl border border-white/10 bg-[#07111F] px-2 py-1.5 text-[11px] text-[#F7F4ED] placeholder:text-[#7E8796] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                placeholder="Filter by teacher name / email / ID…"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
              />
              <span className="text-[11px] text-[#AEB6C4]">Debounced</span>
            </div>
          </div>
        </div>
      </section>

      {loadError && (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-sm text-rose-100">
          {loadError}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-[#0C1730]/78 p-4 space-y-3 animate-pulse">
              <div className="h-4 w-44 rounded-md bg-white/10" />
              <div className="h-3 w-60 rounded-md bg-white/10" />
              <div className="h-3 w-32 rounded-md bg-white/10" />
              <div className="h-8 w-full rounded-md bg-white/10" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#F7F4ED]">Lesson notes</h2>
            {hasNotes && <span className="text-[11px] text-[#AEB6C4]">{items.length} shown</span>}
          </div>

          {!hasNotes && !loadError && (
            <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.04] px-4 py-5 md:px-5 md:py-6 space-y-3">
              <h3 className="text-sm font-semibold text-[#F7F4ED]">No lesson notes match this filter</h3>
              <p className="max-w-md text-xs text-[#C9CDD6]">Switch status or clear the teacher filter.</p>
              <button type="button" className={btnOutline} onClick={resetAndLoad}>
                Refresh
              </button>
            </div>
          )}

          {hasNotes && (
            <div className="space-y-2">
              {items.map((item) => {
                const subjectLabel = item.subject || "Subject —";
                const termLabel = item.term || "Term —";
                const yearLabel = item.academicYear || "Year —";
                const weekLabel = item.weekNumber != null ? `Week ${item.weekNumber}` : "Week —";
                const strandLabel = item.strand || "Strand —";

                const teacherLabel = item.teacherName || item.teacherUserId || "Teacher —";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNote(item.id)}
                    className="w-full rounded-[24px] border border-white/10 bg-[#0C1730]/78 px-4 py-3 text-left transition-all hover:border-white/20 hover:bg-[#102044] md:px-5 md:py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[#F7F4ED] md:text-[15px]">
                          {subjectLabel} • {termLabel} • {yearLabel}
                        </div>
                        <div className="text-[11px] text-[#C9CDD6]">
                          {strandLabel}
                          {item.substrand ? ` • ${item.substrand}` : ""}
                        </div>
                        <div className="text-[11px] text-[#AEB6C4]">
                          {weekLabel} • Updated: {formatDateShort(item.updatedAt)}
                        </div>
                        <div className="text-[11px] text-[#AEB6C4]">
                          Teacher: <span className="font-medium text-[#F7F4ED]">{teacherLabel}</span>
                        </div>
                        {item.headteacherComment && (
                          <p className="mt-1 rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-2 py-1 text-[11px] text-emerald-100">
                            <span className="font-semibold">Last comment:</span> {item.headteacherComment}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={statusBadgeClasses(item.status)}>{statusLabel(item.status)}</span>
                        <span className="font-mono text-[10px] text-[#8F98A8]">{item.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={loadingMore}
                onClick={() => void loadPage({ cursor: nextCursor, append: true })}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-[11px] text-[#C9CDD6] space-y-1.5 md:p-4">
        <h3 className="text-xs font-semibold text-[#F7F4ED]">Security model</h3>
        <p>Tenant-scoped on server. No client-controlled reviewer identity.</p>
      </section>
    </div>
  );
}