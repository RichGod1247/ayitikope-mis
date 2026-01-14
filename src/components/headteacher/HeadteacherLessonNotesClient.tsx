// src/components/headteacher/HeadteacherLessonNotesClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type StatusFilter = LessonNoteStatus | "ALL";

type LessonNoteListItem = {
  id: string;
  teacherUserId: string | null;
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
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-900`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

function statusBadgeClasses(status: LessonNoteStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium";
  switch (status) {
    case "DRAFT":
      return `${base} bg-zinc-50 border-zinc-200 text-zinc-700`;
    case "SUBMITTED":
      return `${base} bg-amber-50 border-amber-200 text-amber-800`;
    case "APPROVED":
      return `${base} bg-emerald-50 border-emerald-200 text-emerald-800`;
    case "REJECTED":
      return `${base} bg-red-50 border-red-200 text-red-800`;
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

  // Initial + filter changes (server-side, debounced teacher filter)
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
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}>
                EduLife OS · Headteacher Review
              </span>
              <span className="text-[11px] text-zinc-500">{subtitle}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Lesson Notes · Review &amp; Approval</h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This inbox is <span className="font-semibold">tenant-scoped and role-guarded</span>. Teachers cannot
              spoof tenant IDs or headteacher IDs. You review only notes in your school.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
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
                        ? "bg-black text-white border-black"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
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
                className="rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-[11px] w-48 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                placeholder="Filter by Teacher ID…"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
              />
              <span className="text-[11px] text-zinc-500">Debounced</span>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {loadError}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-zinc-200 bg-white rounded-2xl p-4 space-y-3 animate-pulse">
                <div className="h-4 w-44 bg-zinc-100 rounded-md" />
                <div className="h-3 w-60 bg-zinc-100 rounded-md" />
                <div className="h-3 w-32 bg-zinc-100 rounded-md" />
                <div className="h-8 w-full bg-zinc-100 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-800">Lesson notes</h2>
              {hasNotes && <span className="text-[11px] text-zinc-500">{items.length} shown</span>}
            </div>

            {!hasNotes && !loadError && (
              <div className="border border-dashed border-zinc-300 bg-white rounded-2xl px-4 py-5 md:px-5 md:py-6 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-800">No lesson notes match this filter</h3>
                <p className="text-xs text-zinc-600 max-w-md">
                  Switch status or clear the teacher filter. Submitted notes will appear here when teachers hit{" "}
                  <span className="font-semibold">Submit</span>.
                </p>
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
                  const teacherLabel = item.teacherUserId ?? "Teacher —";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openNote(item.id)}
                      className="w-full text-left border border-zinc-200 bg-white rounded-2xl px-4 py-3 md:px-5 md:py-4 hover:border-zinc-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm md:text-[15px] font-semibold text-zinc-900">
                            {subjectLabel} • {termLabel} • {yearLabel}
                          </div>
                          <div className="text-[11px] text-zinc-600">
                            {strandLabel}
                            {item.substrand ? ` • ${item.substrand}` : ""}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {weekLabel} • Updated: {formatDateShort(item.updatedAt)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Teacher ID: <span className="font-mono">{teacherLabel}</span>
                          </div>
                          {item.headteacherComment && (
                            <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-2 py-1 mt-1">
                              <span className="font-semibold">Last comment:</span> {item.headteacherComment}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className={statusBadgeClasses(item.status)}>{statusLabel(item.status)}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{item.id.slice(0, 8)}…</span>
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

        <section className="border rounded-2xl bg-white p-3.5 md:p-4 text-[11px] text-zinc-600 space-y-1.5">
          <h3 className="text-xs font-semibold text-zinc-800">Security model (non-negotiable)</h3>
          <p>
            This inbox is tenant-scoped on the server. No querystring tenant IDs. No client-controlled reviewer IDs.
            Every request must pass session + active membership + role authorization.
          </p>
        </section>
      </div>
    </main>
  );
}
