// src/app/teacher/lesson-notes/page.tsx
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

  term: string | null;
  academicYear: string | null;
  strand: string | null;
  substrand: string | null;
  subject: string | null;
  weekNumber: number | null;

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

type CurriculumSubjectOption = {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string | null;
  orderIndex: number | null;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-900`;
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

export default function TeacherLessonNotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Demo IDs as fallback so the page always loads in dev.
  const tenantId =
    searchParams.get("tenantId") ?? "cmhhnghn00008vcpgp3fl07fl";
  const teacherUserId =
    searchParams.get("teacherUserId") ?? "cmhhnguk5000ivcpgmjj3nxn4";

  const [items, setItems] = useState<LessonNoteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    LessonNoteStatus | "ALL"
  >("ALL");

  // ============================
  // Curriculum subjects (KG–JHS)
  // ============================
  const [subjectOptions, setSubjectOptions] = useState<
    CurriculumSubjectOption[]
  >([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectLoadError, setSubjectLoadError] =
    useState<string | null>(null);

  // Phase + Class filter
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [classLevel, setClassLevel] = useState<string>("");

  // Subject name + slug we send to the generator route
  const [subject, setSubject] = useState<string>("");
  const [subjectSlug, setSubjectSlug] = useState<string>("");

  // Week / term / year for generator
  const [weekNumber, setWeekNumber] = useState<string>("1");
  const [term] = useState<string>("1st Term");
  const [academicYear] = useState<string>("2025/2026");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(
    null
  );

  // delete draft
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (statusFilter === "ALL") return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const hasNotes = filteredItems.length > 0;

  // Phase options derived from subjects
  const phaseOptions = useMemo(
    () =>
      Array.from(
        new Set(
          subjectOptions
            .map((opt) => opt.phase)
            .filter((p): p is string => Boolean(p))
        )
      ).sort(),
    [subjectOptions]
  );

  // Class/level options derived from phase
  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(
          subjectOptions
            .filter((opt) =>
              phaseFilter ? opt.phase === phaseFilter : true
            )
            .map((opt) => opt.level)
            .filter((l): l is string => Boolean(l))
        )
      ).sort(),
    [subjectOptions, phaseFilter]
  );

  // Subjects filtered by phase + class
  const filteredSubjectOptions = useMemo(
    () =>
      subjectOptions.filter((opt) => {
        if (phaseFilter && opt.phase !== phaseFilter) return false;
        if (classLevel && opt.level !== classLevel) return false;
        return true;
      }),
    [subjectOptions, phaseFilter, classLevel]
  );

  // If subject becomes invalid when filters change, clear it
  useEffect(() => {
    if (!subject) return;
    const stillExists = filteredSubjectOptions.some(
      (opt) => opt.name === subject
    );
    if (!stillExists) {
      setSubject("");
      setSubjectSlug("");
    }
  }, [filteredSubjectOptions, subject]);

  // -----------------------------
  // Load list of lesson notes
  // -----------------------------
  useEffect(() => {
    async function loadList() {
      if (!tenantId || !teacherUserId) return;

      setLoading(true);
      setLoadError(null);

      try {
        const url = new URL(
          "/api/teachers/lesson-notes/list",
          window.location.origin
        );
        url.searchParams.set("tenantId", tenantId);
        url.searchParams.set("teacherUserId", teacherUserId);

        const res = await fetch(url.toString());
        const data = (await res.json().catch(() => ({}))) as ListResponse;

        if (!res.ok || !data.ok || !data.items) {
          setLoadError(
            data.error ??
              "Failed to load your lesson notes. Please try again."
          );
          setItems([]);
          return;
        }

        setItems(data.items);
      } catch (err) {
        console.error("Error loading lesson notes list", err);
        setLoadError(
          "Network or server error while loading your lesson notes. Please try again."
        );
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    void loadList();
  }, [tenantId, teacherUserId]);

  // -----------------------------
  // Load curriculum subjects (KG–JHS)
  // -----------------------------
  useEffect(() => {
    async function loadSubjects() {
      setSubjectLoading(true);
      setSubjectLoadError(null);

      try {
        const res = await fetch("/api/curriculum/subjects");
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          items?: CurriculumSubjectOption[];
        };

        if (!res.ok || !data.ok || !Array.isArray(data.items)) {
          setSubjectLoadError(
            data.error ??
              "Failed to load curriculum subjects for the generator."
          );
          setSubjectOptions([]);
          return;
        }

        const options = data.items;
        setSubjectOptions(options);

        // If no subject is selected yet, try to pick a reasonable default
        if (!subject && options.length > 0) {
          const mathCandidate =
            options.find((opt) =>
              (opt.name || "").toLowerCase().includes("math")
            ) ||
            options.find((opt) =>
              (opt.name || "").toLowerCase().includes("numeracy")
            );

          const initial = mathCandidate ?? options[0];

          if (initial) {
            setSubject(initial.name);
            setSubjectSlug(initial.slug ?? "");
            if (initial.phase) setPhaseFilter(initial.phase);
            if (initial.level) setClassLevel(initial.level);
          }
        }
      } catch (err) {
        console.error("Error loading curriculum subjects", err);
        setSubjectLoadError(
          "Network or server error while loading curriculum subjects."
        );
        setSubjectOptions([]);
      } finally {
        setSubjectLoading(false);
      }
    }

    void loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Handlers
  // -----------------------------
  function handleOpenNote(id: string) {
    const params = new URLSearchParams();
    params.set("teacherUserId", teacherUserId);
    router.push(`/teacher/lesson-notes/${id}?${params.toString()}`);
  }

  async function handleGenerateFromCurriculum() {
    if (!tenantId || !teacherUserId || !subject.trim() || !classLevel) {
      return;
    }

    const weekNumberInt = Number(weekNumber || "0") || 1;

    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch(
        "/api/teachers/lesson-notes/generate-from-curriculum",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            teacherUserId,
            subject: subject.trim(), // friendly label
            subjectSlug: subjectSlug || null, // canonical key for engine
            term,
            academicYear,
            weekNumber: weekNumberInt,
            classLevel: classLevel || null,
          }),
        }
      );

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        item?: { id: string };
      };

      if (!res.ok || !data.ok || !data.item?.id) {
        setGenerateError(
          data.error ??
            "Could not generate a lesson note from the curriculum. Please check the subject/week/class or contact the system administrator."
        );
        return;
      }

      // Navigate straight into the generated note
      const params = new URLSearchParams();
      params.set("teacherUserId", teacherUserId);
      params.set("from", "curriculum");
      router.push(
        `/teacher/lesson-notes/${data.item.id}?${params.toString()}`
      );
    } catch (err) {
      console.error("Error generating lesson note from curriculum", err);
      setGenerateError(
        "Network or server error while generating from curriculum. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteDraft(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.status !== "DRAFT") return;

    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this draft lesson note?"
    );
    if (!confirmed) return;

    setDeletingId(id);
    setDeleteError(null);

    try {
      const res = await fetch("/api/teachers/lesson-notes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: id }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setDeleteError(
          data.error ??
            "Could not delete this draft. Please try again or contact the system administrator."
        );
        return;
      }

      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Error deleting draft lesson note", err);
      setDeleteError(
        "Network or server error while deleting this draft. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpenApprovedPdf(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const params = new URLSearchParams();
    params.set("teacherUserId", teacherUserId);
    router.push(`/teacher/lesson-notes/${id}/print?${params.toString()}`);
  }

  function handleSubjectChange(value: string) {
    setSubject(value);

    const match = filteredSubjectOptions.find((opt) => opt.name === value);

    setSubjectSlug(match?.slug ?? "");
    // We *could* also sync phase + class from the subject here,
    // but since the dropdown is already filtered BY these,
    // we leave them as the teacher selected them.
  }

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}
              >
                EduLife OS · Lesson Design Studio
              </span>
              <span className="text-[11px] text-zinc-500">
                Tenant:{" "}
                <span className="font-mono">
                  {tenantId.slice(0, 8)}…
                </span>
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              My Lesson Notes
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This is your{" "}
              <span className="font-semibold">personal box</span> of
              NaCCA-aligned lesson notes inside EduLife OS. Start from
              the official curriculum, refine with the{" "}
              <span className="font-semibold">AI Co-Tutor</span>, and
              submit for{" "}
              <span className="font-semibold">
                headteacher approval
              </span>{" "}
              — all in one calm workspace.
            </p>
          </div>

          {/* Status filter + small legend */}
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
            <p className="text-[11px] text-zinc-500 max-w-xs md:text-right">
              Filter your notes by status. Draft and returned notes can
              still be refined before submission.
            </p>
          </div>
        </header>

        {/* Error / loading states */}
        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {loadError}
          </div>
        )}

        {deleteError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-xs">
            {deleteError}
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

        {/* Main content: list + side panel */}
        {!loading && (
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)] gap-4 md:gap-6">
            {/* LEFT: list of notes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-800">
                  Lesson notes for{" "}
                  <span className="font-mono text-[11px]">
                    {teacherUserId.slice(0, 8)}…
                  </span>
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
                    No lesson notes yet
                  </h3>
                  <p className="text-xs text-zinc-600 max-w-md">
                    You haven&apos;t generated any lesson notes in
                    EduLife OS yet. Use{" "}
                    <span className="font-semibold">
                      &quot;Generate from curriculum&quot;
                    </span>{" "}
                    on the right to create your first NaCCA-aligned
                    draft in one click.
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

                    const isDraft = item.status === "DRAFT";
                    const isApproved = item.status === "APPROVED";

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenNote(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpenNote(item.id);
                          }
                        }}
                        className="w-full text-left border border-zinc-200 bg-white rounded-2xl px-4 py-3 md:px-5 md:py-4 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer"
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
                            {item.headteacherComment && (
                              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-2 py-1 mt-1">
                                <span className="font-semibold">
                                  Headteacher:
                                </span>{" "}
                                {item.headteacherComment}
                              </p>
                            )}

                            {isDraft && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteDraft(item.id);
                                }}
                                disabled={deletingId === item.id}
                                className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {deletingId === item.id
                                  ? "Deleting…"
                                  : "Delete draft"}
                              </button>
                            )}

                            {/* Approved PDF link */}
                            {isApproved && (
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleOpenApprovedPdf(item.id, e)
                                }
                                className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100"
                              >
                                View approved learner note (PDF)
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={statusBadgeClasses(
                                item.status
                              )}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Generate from curriculum */}
            <aside className="space-y-3">
              <div className="border rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-sky-50 border-emerald-100 p-4 md:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Generate from curriculum
                    </h2>
                    <p className="text-xs text-zinc-600 max-w-xs">
                      Pick a{" "}
                      <span className="font-semibold">
                        phase, class and subject
                      </span>
                      . EduLife OS will fetch the matching{" "}
                      <span className="font-semibold">
                        NaCCA curriculum unit
                      </span>{" "}
                      and turn it into a draft lesson note you can
                      refine.
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center h-7 px-3 rounded-full bg-black text-white text-[10px] font-medium">
                    1-click draft
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Phase & Class */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        Phase
                      </label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={phaseFilter}
                        onChange={(e) => {
                          setPhaseFilter(e.target.value);
                          setClassLevel("");
                          // When phase changes, we also clear subject + slug
                          setSubject("");
                          setSubjectSlug("");
                        }}
                        disabled={
                          subjectLoading || subjectOptions.length === 0
                        }
                      >
                        {phaseOptions.length === 0 && (
                          <option value="">
                            {subjectLoading
                              ? "Loading phases…"
                              : "No phases found"}
                          </option>
                        )}
                        {phaseOptions.length > 0 && (
                          <>
                            <option value="">
                              — All phases —
                            </option>
                            {phaseOptions.map((phase) => (
                              <option key={phase} value={phase}>
                                {phase}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        Class / Level
                      </label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={classLevel}
                        onChange={(e) => {
                          setClassLevel(e.target.value);
                          // When class changes, also clear subject + slug
                          setSubject("");
                          setSubjectSlug("");
                        }}
                        disabled={
                          subjectLoading ||
                          subjectOptions.length === 0 ||
                          classOptions.length === 0
                        }
                      >
                        {classOptions.length === 0 && (
                          <option value="">
                            {phaseFilter
                              ? "No classes for this phase"
                              : "Select a phase first"}
                          </option>
                        )}
                        {classOptions.length > 0 && (
                          <>
                            <option value="">
                              — Select class / level —
                            </option>
                            {classOptions.map((level) => (
                              <option key={level} value={level}>
                                {level}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-700">
                      Subject (from NaCCA curriculum)
                    </label>
                    <select
                      className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      value={subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      disabled={
                        subjectLoading ||
                        filteredSubjectOptions.length === 0
                      }
                    >
                      {filteredSubjectOptions.length === 0 && (
                        <option value="">
                          {subjectLoading
                            ? "Loading subjects…"
                            : "No curriculum subjects found for this filter"}
                        </option>
                      )}

                      {filteredSubjectOptions.length > 0 && !subject && (
                        <option value="">
                          — Select curriculum subject —
                        </option>
                      )}

                      {filteredSubjectOptions.map((opt) => (
                        <option key={opt.id} value={opt.name}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    {subjectLoadError && (
                      <p className="text-[11px] text-red-700 mt-1">
                        {subjectLoadError}
                      </p>
                    )}
                    {!subjectLoadError && (
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Options come directly from your{" "}
                        <span className="font-semibold">
                          CurriculumSubject
                        </span>{" "}
                        table (KG–JHS). Phase and class filters help you
                        avoid scrolling through everything.
                      </p>
                    )}
                  </div>

                  {/* Week / term / year */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        Week
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={weekNumber}
                        onChange={(e) => setWeekNumber(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        Term
                      </label>
                      <input
                        type="text"
                        disabled
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-500"
                        value={term}
                        readOnly
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        Academic year
                      </label>
                      <input
                        type="text"
                        disabled
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-500"
                        value={academicYear}
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleGenerateFromCurriculum}
                    disabled={
                      generating ||
                      !subject.trim() ||
                      subjectLoading ||
                      !classLevel
                    }
                  >
                    {generating
                      ? "Generating…"
                      : "Generate lesson note"}
                  </button>
                  <p className="text-[11px] text-zinc-500 max-w-[260px]">
                    Select{" "}
                    <span className="font-semibold">
                      phase, class and subject
                    </span>{" "}
                    first. You can edit objectives, activities and
                    assessment later in the{" "}
                    <span className="font-semibold">
                      Lesson Design Studio
                    </span>
                    .
                  </p>
                </div>

                {generateError && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                    {generateError}
                  </p>
                )}
              </div>

              <div className="border rounded-2xl bg-white p-3.5 md:p-4 text-[11px] text-zinc-600 space-y-1.5">
                <h3 className="text-xs font-semibold text-zinc-800">
                  How this fits the bigger EduLife OS picture
                </h3>
                <p>
                  Each lesson note here moves through a{" "}
                  <span className="font-semibold">
                    transparent pipeline
                  </span>
                  : Draft → Submitted → Approved. Headteachers can see
                  the same status on their portal.
                </p>
                <p>
                  That&apos;s how we keep{" "}
                  <span className="font-semibold">
                    trust, integrity and clarity
                  </span>{" "}
                  inside your school&apos;s teaching culture.
                </p>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
