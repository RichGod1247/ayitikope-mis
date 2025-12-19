// src/components/TeacherAssessmentClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TeacherAssessmentClientProps = {
  tenantId: string;
  teacherUserId: string;
  classroomId: string;
  term: string;
  academicYear: string;
};

type Student = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

type AssessmentItem = {
  id: string;
  tenantId: string;
  classroomId: string;
  subject: string;
  term: string;
  academicYear: string;
  title: string;
  description?: string | null;
  type: string;
  maxScore: number;
  weighting?: number | null;
  date?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type OverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    teacherUserId: string;
    classroomId: string;
    term: string;
    academicYear: string;
  };
  classroom: {
    id: string;
    name: string;
    grade?: string | null;
    arm?: string | null;
  } | null;
  students: Student[];
  assessments: AssessmentItem[];
};

type ClassAverageResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    classroomId: string;
    term: string;
    academicYear: string;
  };
  averagePercent: number | null;
  learnersCount: number;
  itemsCount: number;
};

type RemarkBand = {
  grade: number;
  label: string;
  minPercent: number;
  maxPercent: number;
  learnersCount: number;
};

type RemarkSummaryResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    classroomId: string;
    term: string;
    academicYear: string;
  };
  totalLearnersEvaluated: number;
  bands: RemarkBand[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

const ASSESSMENT_TYPES: { value: string; label: string }[] = [
  { value: "CLASS_TEST", label: "Class Test" },
  { value: "HOMEWORK", label: "Homework" },
  { value: "PROJECT", label: "Project" },
  { value: "QUIZ", label: "Quiz" },
  { value: "EXAM", label: "Exam" },
  { value: "OTHER", label: "Other" },
];

function formatDateForInput(date?: string | null): string {
  if (!date) return "";
  try {
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const TeacherAssessmentClient: React.FC<TeacherAssessmentClientProps> = ({
  tenantId,
  teacherUserId,
  classroomId,
  term,
  academicYear,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [classroom, setClassroom] =
    useState<OverviewResponse["classroom"]>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [items, setItems] = useState<AssessmentItem[]>([]);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // New / edit item form
  const [subject, setSubject] = useState("Mathematics");
  const [type, setType] = useState("CLASS_TEST");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxScore, setMaxScore] = useState<string>("10");
  const [weighting, setWeighting] = useState<string>("10");
  const [date, setDate] = useState<string>("");

  // Scores draft state
  const [scoreDraft, setScoreDraft] = useState<
    Record<string, { score: string; comment: string }>
  >({});

  const [savingItemState, setSavingItemState] = useState<SaveState>("idle");
  const [savingScoresState, setSavingScoresState] =
    useState<SaveState>("idle");

  // NEW: summary insight state
  const [classAverage, setClassAverage] =
    useState<ClassAverageResponse | null>(null);
  const [remarkSummary, setRemarkSummary] =
    useState<RemarkSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  // Build term dashboard link from props
  const termDashboardHref = useMemo(() => {
    const params = new URLSearchParams({
      tenantId,
      teacherUserId,
      classroomId,
      term,
      academicYear,
    });
    return `/teacher/assessment/term-dashboard?${params.toString()}`;
  }, [tenantId, teacherUserId, classroomId, term, academicYear]);

  // ------------------------
  // Helper: build blank grid
  // ------------------------
  function buildBlankScoreGrid(
    currentStudents: Student[]
  ): Record<string, { score: string; comment: string }> {
    const base: Record<string, { score: string; comment: string }> = {};
    for (const s of currentStudents) {
      base[s.id] = { score: "", comment: "" };
    }
    return base;
  }

  // ------------------------
  // Helper: load scores for a given item
  // ------------------------
  async function loadScoresForItem(
    itemId: string,
    currentStudents: Student[]
  ) {
    // start from blank grid
    const base = buildBlankScoreGrid(currentStudents);

    if (!itemId || currentStudents.length === 0) {
      setScoreDraft(base);
      return;
    }

    try {
      const params = new URLSearchParams({
        tenantId,
        itemId,
      });

      const res = await fetch(
        `/api/teacher/assessment/scores/list?${params.toString()}`
      );

      if (!res.ok) {
        console.error(
          "[TeacherAssessmentClient] failed to load scores",
          res.status
        );
        setScoreDraft(base);
        return;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.scores)) {
        setScoreDraft(base);
        return;
      }

      const withSaved = { ...base };
      for (const score of data.scores as {
        studentId: string;
        score: number;
        comment?: string | null;
      }[]) {
        if (withSaved[score.studentId]) {
          withSaved[score.studentId] = {
            score: String(score.score ?? ""),
            comment: score.comment ?? "",
          };
        }
      }

      setScoreDraft(withSaved);
    } catch (err) {
      console.error("[TeacherAssessmentClient] error loading scores", err);
      setScoreDraft(base);
    }
  }

  // ------------------------
  // Load overview on mount
  // ------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadingError(null);

        const params = new URLSearchParams({
          tenantId,
          teacherUserId,
          classroomId,
          term,
          academicYear,
        });

        const res = await fetch(
          `/api/teacher/assessment/overview?${params.toString()}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: OverviewResponse = await res.json();
        if (!data.ok) {
          throw new Error("Server returned ok:false");
        }

        const classroomData = data.classroom;
        const studentData = data.students || [];
        const assessmentData = data.assessments || [];

        setClassroom(classroomData);
        setStudents(studentData);
        setItems(assessmentData);

        if (assessmentData.length > 0) {
          const firstItem = assessmentData[0];
          setSelectedItemId(firstItem.id);
          await loadScoresForItem(firstItem.id, studentData);
        } else {
          setSelectedItemId(null);
          setScoreDraft(buildBlankScoreGrid(studentData));
        }
      } catch (err: any) {
        console.error("[TeacherAssessmentClient] load overview error", err);
        setLoadingError("Failed to load assessment overview.");
        setScoreDraft({});
      } finally {
        setLoading(false);
      }
    };

    load();
    // only re-run if core context changes
  }, [tenantId, teacherUserId, classroomId, term, academicYear]);

  // ------------------------
  // NEW: load summary insights (class average + remark bands)
  // ------------------------
  useEffect(() => {
    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);

        const baseParams = new URLSearchParams({
          tenantId,
          classroomId,
          term,
          academicYear,
        });

        const [avgRes, remarkRes] = await Promise.all([
          fetch(
            `/api/teacher/assessment/class-average?${baseParams.toString()}`
          ),
          fetch(
            `/api/teacher/assessment/remark-summary?${baseParams.toString()}`
          ),
        ]);

        if (!avgRes.ok || !remarkRes.ok) {
          throw new Error(
            `HTTP ${
              !avgRes.ok ? avgRes.status : remarkRes.status
            } while loading summary`
          );
        }

        const avgJson: any = await avgRes.json();
        const remarkJson: any = await remarkRes.json();

        if (!avgJson.ok) {
          throw new Error(
            avgJson.error || "Server returned ok:false for class-average"
          );
        }
        if (!remarkJson.ok) {
          throw new Error(
            remarkJson.error || "Server returned ok:false for remark-summary"
          );
        }

        setClassAverage({
          ok: true,
          context: avgJson.context,
          averagePercent:
            typeof avgJson.averagePercent === "number"
              ? avgJson.averagePercent
              : null,
          learnersCount: avgJson.learnersCount ?? 0,
          itemsCount: avgJson.itemsCount ?? 0,
        });

        setRemarkSummary({
          ok: true,
          context: remarkJson.context,
          totalLearnersEvaluated: remarkJson.totalLearnersEvaluated ?? 0,
          bands: Array.isArray(remarkJson.bands) ? remarkJson.bands : [],
        });
      } catch (err: any) {
        console.error("[TeacherAssessmentClient] load summary error", err);
        setSummaryError("Failed to load class summary insights.");
        setClassAverage(null);
        setRemarkSummary(null);
      } finally {
        setSummaryLoading(false);
      }
    };

    // Classroom/term context is enough to load
    loadSummary();
  }, [tenantId, classroomId, term, academicYear]);

  // ------------------------
  // When selectedItem changes, sync the form fields
  // ------------------------
  useEffect(() => {
    if (!selectedItem) {
      // Reset to "new item" defaults
      setSubject("Mathematics");
      setType("CLASS_TEST");
      setTitle("");
      setDescription("");
      setMaxScore("10");
      setWeighting("10");
      setDate("");
      return;
    }

    setSubject(selectedItem.subject || "Mathematics");
    setType(selectedItem.type || "CLASS_TEST");
    setTitle(selectedItem.title || "");
    setDescription(selectedItem.description ?? "");
    setMaxScore(
      typeof selectedItem.maxScore === "number"
        ? String(selectedItem.maxScore)
        : "10"
    );
    setWeighting(
      selectedItem.weighting != null ? String(selectedItem.weighting) : ""
    );
    setDate(formatDateForInput(selectedItem.date ?? null));
  }, [selectedItem]);

  // ------------------------
  // Handlers
  // ------------------------

  async function handleSelectItem(itemId: string) {
    setSelectedItemId(itemId);
    await loadScoresForItem(itemId, students);
  }

  function handleNewItem() {
    // Clear selection and reset form + score grid
    setSelectedItemId(null);
    setSubject("Mathematics");
    setType("CLASS_TEST");
    setTitle("");
    setDescription("");
    setMaxScore("10");
    setWeighting("10");
    setDate("");
    setScoreDraft(buildBlankScoreGrid(students));
  }

  async function handleDeleteSelectedItem() {
    if (!selectedItem) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${selectedItem.title}" and all its scores?`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/teacher/assessment/items/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedItem.id }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        // If the server accidentally returns HTML or non-JSON, log it.
        console.error(
          "[TeacherAssessmentClient] Delete response not valid JSON:",
          text
        );
      }

      if (!res.ok || !data?.ok) {
        console.error(
          "[TeacherAssessmentClient] Item delete failed",
          res.status,
          text
        );
        alert(
          data?.error ||
            "Failed to delete assessment item. Please try again or contact the office."
        );
        return;
      }

      // Remove from local state and choose the next item (if any)
      setItems((prev) => {
        const remaining = prev.filter((i) => i.id !== selectedItem.id);

        if (remaining.length > 0) {
          const nextItem = remaining[0];
          setSelectedItemId(nextItem.id);
          // Load scores for the new selection
          loadScoresForItem(nextItem.id, students);
        } else {
          setSelectedItemId(null);
          setScoreDraft(buildBlankScoreGrid(students));
        }

        return remaining;
      });
    } catch (err) {
      console.error("[TeacherAssessmentClient] Error deleting item", err);
      alert(
        "Unexpected error deleting assessment item. Please try again or contact the office."
      );
    }
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSavingItemState("saving");
    try {
      const body = {
        tenantId,
        teacherUserId,
        classroomId,
        subject: subject.trim(),
        term,
        academicYear,
        title: title.trim(),
        description: description.trim() || null,
        type,
        maxScore: Number(maxScore) || 0,
        weighting: weighting ? Number(weighting) : null,
        date: date ? new Date(date).toISOString() : null,
        id: selectedItem ? selectedItem.id : undefined,
      };

      const res = await fetch("/api/teacher/assessment/items/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.error("Item upsert failed", data);
        setSavingItemState("error");
        return;
      }

      const item: AssessmentItem = data.item;

      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id);
        if (idx === -1) {
          return [...prev, item];
        } else {
          const clone = [...prev];
          clone[idx] = item;
          return clone;
        }
      });

      setSelectedItemId(item.id);

      // reload scores for this item (will give blank grid initially)
      await loadScoresForItem(item.id, students);

      setSavingItemState("saved");
      setTimeout(() => setSavingItemState("idle"), 1200);
    } catch (err) {
      console.error("Error saving assessment item", err);
      setSavingItemState("error");
    }
  }

  async function handleSaveScores() {
    if (!selectedItem) return;

    setSavingScoresState("saving");
    try {
      const scoresPayload = Object.entries(scoreDraft)
        .filter(([_, v]) => v.score.trim() !== "")
        .map(([studentId, v]) => ({
          studentId,
          score: Number(v.score),
          comment: v.comment.trim() || null,
        }));

      const body = {
        tenantId,
        itemId: selectedItem.id,
        scores: scoresPayload,
      };

      const res = await fetch(
        "/api/teacher/assessment/scores/bulk-upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.error("Scores bulk-upsert failed", data);
        setSavingScoresState("error");
        return;
      }

      // after saving, reload from server so grid reflects DB
      await loadScoresForItem(selectedItem.id, students);

      setSavingScoresState("saved");
      setTimeout(() => setSavingScoresState("idle"), 1200);
    } catch (err) {
      console.error("Error saving scores", err);
      setSavingScoresState("error");
    }
  }

  // ------------------------
  // Render
  // ------------------------

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Loading assessment overview…
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="p-6 text-sm text-red-600">
        {loadingError} Please refresh the page or contact the office.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Top context bar */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <div className="font-medium text-slate-800">
            {classroom?.name || "Classroom"}
          </div>
          <div className="text-slate-600">
            Term: <span className="font-medium">{term}</span> • Academic
            Year:{" "}
            <span className="font-medium">{academicYear}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
            <span className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
              Learners: {students.length}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
              Items: {items.length}
            </span>
          </div>

          <Link
            href={termDashboardHref}
            className="inline-flex items-center rounded-full border border-indigo-500 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
          >
            View term summary
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)]">
        {/* Left column: Assessment Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Assessment items
              </h2>
              <span className="text-[11px] text-slate-500">
                Class tests, homework, projects, etc.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewItem}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                + New item
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedItem}
                disabled={!selectedItem}
                className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            {items.length === 0 ? (
              <div className="text-slate-600">
                No assessment items found yet for this class and term.
                <br />
                Use the form below to create your first item.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectItem(item.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left transition",
                        selectedItemId === item.id
                          ? "border-blue-500 bg-blue-50/70"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40",
                      ].join(" ")}
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-900">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {item.subject} • {item.type} • Max:{" "}
                          {item.maxScore}
                          {item.weighting != null
                            ? ` • Weight: ${item.weighting}%`
                            : ""}
                        </div>
                      </div>
                      {item.date && (
                        <div className="text-[11px] text-slate-500">
                          {formatDateForInput(item.date)}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Create / update assessment item form */}
          <form
            onSubmit={handleSaveItem}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900 text-xs">
                {selectedItem
                  ? "Update selected assessment item"
                  : "Create new assessment item"}
              </h3>
              <span className="text-[11px] text-slate-500">
                Basic details only for now
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Subject
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Type
                </label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {ASSESSMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700">
                  Title
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Counting 1–20 quick test"
                  required
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700">
                  Short description (optional)
                </label>
                <textarea
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this assessment about?"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Max score
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Weight (%) (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={weighting}
                  onChange={(e) => setWeighting(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Date (optional)
                </label>
                <input
                  type="date"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="submit"
                disabled={savingItemState === "saving"}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingItemState === "saving"
                  ? "Saving..."
                  : selectedItem
                  ? "Update item"
                  : "Create item"}
              </button>
              {savingItemState === "error" && (
                <span className="text-[11px] text-red-600">
                  Failed to save. Please try again.
                </span>
              )}
              {savingItemState === "saved" && (
                <span className="text-[11px] text-emerald-600">
                  Saved successfully.
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Right column: Summary + Scores for selected item */}
        <div className="space-y-4">
          {/* NEW: summary insights */}
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900 text-sm">
                Class performance snapshot
              </div>
              {summaryLoading && (
                <span className="text-[11px] text-slate-500">
                  Loading summary…
                </span>
              )}
            </div>

            {summaryError && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                {summaryError}
              </div>
            )}

            {!summaryError && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-medium text-slate-600">
                    Overall average (%)
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {formatPercent(classAverage?.averagePercent ?? null)}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                    <div>
                      Learners:{" "}
                      <span className="font-medium">
                        {classAverage?.learnersCount ?? 0}
                      </span>
                    </div>
                    <div>
                      Items:{" "}
                      <span className="font-medium">
                        {classAverage?.itemsCount ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-slate-600">
                    Performance bands
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(remarkSummary?.bands || [])
                      .filter((b) => b.learnersCount > 0)
                      .slice(0, 5)
                      .map((band) => (
                        <span
                          key={band.grade}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                        >
                          <span className="min-w-8 text-center text-[10px] font-semibold text-slate-800">
                            {band.grade}
                          </span>
                          <span className="text-[10px]">
                            {band.label} ({band.learnersCount})
                          </span>
                        </span>
                      ))}
                    {remarkSummary &&
                      (remarkSummary.bands || []).every(
                        (b) => b.learnersCount === 0
                      ) && (
                        <span className="text-[11px] text-slate-500">
                          No band distribution yet.
                        </span>
                      )}
                  </div>
                  {remarkSummary && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Learners evaluated:{" "}
                      <span className="font-medium">
                        {remarkSummary.totalLearnersEvaluated}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Learner scores
            </h2>
            <span className="text-[11px] text-slate-500">
              For the selected assessment item
            </span>
          </div>

          {!selectedItem ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
              Select an existing assessment item on the left, or click{" "}
              <span className="font-semibold">“+ New item”</span> to
              create one, then start recording scores.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="font-medium text-slate-900">
                  {selectedItem.title}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {selectedItem.subject} • {selectedItem.type} • Max:{" "}
                  {selectedItem.maxScore}
                  {selectedItem.weighting != null
                    ? ` • Weight: ${selectedItem.weighting}%`
                    : ""}
                  {selectedItem.date && (
                    <>
                      {" "}
                      • Date: {formatDateForInput(selectedItem.date)}
                    </>
                  )}
                </div>
                {selectedItem.description && (
                  <div className="mt-1 text-[11px] text-slate-600">
                    {selectedItem.description}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white text-xs">
                <div className="max-h-[340px] overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          Learner
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          Score
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          Comment (optional)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, idx) => {
                        const row = scoreDraft[s.id] ?? {
                          score: "",
                          comment: "",
                        };
                        const isOdd = idx % 2 === 1;
                        return (
                          <tr
                            key={s.id}
                            className={isOdd ? "bg-slate-50/60" : "bg-white"}
                          >
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                              <div className="font-medium text-slate-900">
                                {s.name}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {s.guardianName || ""}{" "}
                                {s.guardianPhone
                                  ? `• ${s.guardianPhone}`
                                  : ""}
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                              <input
                                type="number"
                                min={0}
                                max={selectedItem.maxScore}
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                                value={row.score}
                                onChange={(e) =>
                                  setScoreDraft((prev) => ({
                                    ...prev,
                                    [s.id]: {
                                      ...prev[s.id],
                                      score: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                              <input
                                type="text"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                placeholder="Optional remark"
                                value={row.comment}
                                onChange={(e) =>
                                  setScoreDraft((prev) => ({
                                    ...prev,
                                    [s.id]: {
                                      ...prev[s.id],
                                      comment: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={handleSaveScores}
                    disabled={savingScoresState === "saving"}
                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingScoresState === "saving"
                      ? "Saving scores..."
                      : "Save scores"}
                  </button>
                  {savingScoresState === "error" && (
                    <span className="text-[11px] text-red-600">
                      Failed to save scores. Please try again.
                    </span>
                  )}
                  {savingScoresState === "saved" && (
                    <span className="text-[11px] text-emerald-600">
                      Scores saved.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherAssessmentClient;
