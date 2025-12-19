// src/app/headteacher/lesson-notes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type LessonNoteListItem = {
  id: string;
  tenantId: string;
  teacherUserId: string | null;
  headteacherUserId: string | null;
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

type ListResponse = {
  ok: boolean;
  items?: LessonNoteListItem[];
  error?: string;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-900`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

function statusBadgeClasses(status: LessonNoteStatus) {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium";

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
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function HeadteacherLessonNotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tenantId =
    searchParams.get("tenantId") ?? "cmhhnghn00008vcpgp3fl07fl";

  // In production this should be read from the auth session;
  // for now we keep a demo fallback so the page is usable in dev.
  const headteacherUserId =
    searchParams.get("headteacherUserId") ?? "HEADTEACHER_DEMO_ID";

  const [items, setItems] = useState<LessonNoteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    LessonNoteStatus | "ALL"
  >("SUBMITTED");
  const [teacherFilter, setTeacherFilter] = useState<string>("");

  useEffect(() => {
    async function loadList() {
      if (!tenantId) return;

      setLoading(true);
      setLoadError(null);

      try {
        const url = new URL(
          "/api/headteacher/lesson-notes/list",
          window.location.origin
        );
        url.searchParams.set("tenantId", tenantId);

        if (statusFilter && statusFilter !== "ALL") {
          url.searchParams.set("status", statusFilter);
        }

        if (teacherFilter.trim()) {
          url.searchParams.set("teacherUserId", teacherFilter.trim());
        }

        const res = await fetch(url.toString());
        const data = (await res.json().catch(() => ({}))) as ListResponse;

        if (!res.ok) {
          setLoadError(
            data.error ??
              "Failed to load lesson notes for review. Please try again."
          );
          setItems([]);
          return;
        }

        if (!data.ok) {
          setLoadError(
            data.error ??
              "Failed to load lesson notes for review. Please try again."
          );
          setItems([]);
          return;
        }

        if (!data.items) {
          setLoadError("No lesson notes were returned from the server.");
          setItems([]);
          return;
        }

        const mapped = data.items.map((item) => ({
          ...item,
          createdAt: new Date(item.createdAt).toISOString(),
          updatedAt: new Date(item.updatedAt).toISOString(),
        }));

        setItems(mapped);
      } catch (err) {
        console.error(
          "Error loading headteacher lesson notes list",
          err
        );
        setLoadError(
          "Network or server error while loading lesson notes. Please try again."
        );
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    void loadList();
  }, [tenantId, statusFilter, teacherFilter]);

  const filteredItems = useMemo(() => {
    const byTeacher = teacherFilter.trim().toLowerCase();

    let base = items;
    if (byTeacher) {
      base = base.filter((i) =>
        (i.teacherUserId ?? "").toLowerCase().includes(byTeacher)
      );
    }

    if (statusFilter === "ALL") return base;
    return base.filter((i) => i.status === statusFilter);
  }, [items, teacherFilter, statusFilter]);

  const hasNotes = filteredItems.length > 0;

  /**
   * NEW:
   * When the headteacher opens a note, we send them to the
   * TEACHER print route in "headteacher review" mode so they see
   * the NaCCA-style PDF sheet plus the review controls.
   */
  function handleOpenNote(id: string) {
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    params.set("headteacherUserId", headteacherUserId);
    params.set("reviewMode", "headteacher");

    router.push(
      `/teacher/lesson-notes/${id}/print?${params.toString()}`
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}
              >
                EduLife OS · Headteacher Review
              </span>
              <span className="text-[11px] text-zinc-500">
                Tenant:{" "}
                <span className="font-mono">
                  {tenantId.slice(0, 8)}…
                </span>
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              Lesson Notes · Review &amp; Approval
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              View, filter and review{" "}
              <span className="font-semibold">teacher lesson notes</span>{" "}
              submitted for this school. When you open a note, you&apos;ll
              see the{" "}
              <span className="font-semibold">
                NaCCA-style learner note sheet
              </span>{" "}
              (PDF view) with your review controls beneath it.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="inline-flex flex-wrap gap-1.5">
              {(
                ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const
              ).map((s) => {
                const active = statusFilter === s;
                const label =
                  s === "ALL" ? "All statuses" : statusLabel(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setStatusFilter(s as LessonNoteStatus | "ALL")
                    }
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
                className="rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-[11px] w-40 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                placeholder="Filter by Teacher ID…"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500 max-w-xs md:text-right">
                Start typing a{" "}
                <span className="font-semibold">teacher user ID</span>{" "}
                to see only their notes.
              </p>
            </div>
          </div>
        </header>

        {/* Error / loading */}
        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {loadError}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="border border-zinc-200 bg-white rounded-2xl p-4 space-y-3 animate-pulse"
              >
                <div className="h-4 w-32 bg-zinc-100 rounded-md" />
                <div className="h-3 w-40 bg-zinc-100 rounded-md" />
                <div className="h-3 w-24 bg-zinc-100 rounded-md" />
                <div className="h-8 w-full bg-zinc-100 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {/* List */}
        {!loading && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-800">
                Lesson notes in this school
              </h2>
              {hasNotes && (
                <span className="text-[11px] text-zinc-500">
                  {filteredItems.length} note
                  {filteredItems.length === 1 ? "" : "s"} shown
                </span>
              )}
            </div>

            {!hasNotes && !loadError && (
              <div className="border border-dashed border-zinc-300 bg-white rounded-2xl px-4 py-5 md:px-5 md:py-6 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-800">
                  No lesson notes match this filter
                </h3>
                <p className="text-xs text-zinc-600 max-w-md">
                  Try switching the{" "}
                  <span className="font-semibold">status filter</span>{" "}
                  or clearing the{" "}
                  <span className="font-semibold">teacher ID filter</span>{" "}
                  to view more notes. Teachers create and submit notes
                  from their{" "}
                  <span className="font-semibold">
                    Lesson Design Studio
                  </span>{" "}
                  in the teacher portal.
                </p>
              </div>
            )}

            {hasNotes && (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const subjectLabel =
                    item.subject || "Subject not set";
                  const termLabel = item.term || "Term —";
                  const yearLabel = item.academicYear || "Year —";
                  const weekLabel =
                    item.weekNumber != null
                      ? `Week ${item.weekNumber}`
                      : "Week —";
                  const strandLabel = item.strand || "Strand —";
                  const teacherLabel =
                    item.teacherUserId ?? "Teacher ID —";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOpenNote(item.id)}
                      className="w-full text-left border border-zinc-200 bg-white rounded-2xl px-4 py-3 md:px-5 md:py-4 hover:border-zinc-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm md:text-[15px] font-semibold text-zinc-900">
                            {subjectLabel} • {termLabel} • {yearLabel}
                          </div>
                          <div className="text-[11px] text-zinc-600">
                            {strandLabel}
                            {item.substrand
                              ? ` • ${item.substrand}`
                              : ""}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {weekLabel}
                            {" • Created: "}
                            {formatDateShort(item.createdAt)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Teacher ID:{" "}
                            <span className="font-mono">
                              {teacherLabel}
                            </span>
                          </div>
                          {item.headteacherComment && (
                            <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-2 py-1 mt-1">
                              <span className="font-semibold">
                                Your last comment:
                              </span>{" "}
                              {item.headteacherComment}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={statusBadgeClasses(item.status)}
                          >
                            {statusLabel(item.status)}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            Updated:{" "}
                            {formatDateShort(item.updatedAt)}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {item.id.slice(0, 8)}…
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Meta card */}
        <section className="border rounded-2xl bg-white p-3.5 md:p-4 text-[11px] text-zinc-600 space-y-1.5">
          <h3 className="text-xs font-semibold text-zinc-800">
            How this connects to the teacher portal
          </h3>
          <p>
            Teachers create and submit lesson notes in the{" "}
            <span className="font-semibold">
              Lesson Design Studio
            </span>{" "}
            (teacher portal). Once they hit{" "}
            <span className="font-semibold">Submit</span>, the notes
            appear here as{" "}
            <span className="font-semibold">SUBMITTED</span> for your
            review.
          </p>
          <p>
            When you{" "}
            <span className="font-semibold">
              approve or return a note
            </span>{" "}
            from the PDF-style learner note view, the status, your
            comment and your digital signature (on approval) are
            instantly reflected in the teacher&apos;s view. That is how
            EduLife OS keeps{" "}
            <span className="font-semibold">
              trust and transparency
            </span>{" "}
            inside your school&apos;s teaching culture.
          </p>
        </section>
      </div>
    </main>
  );
}
