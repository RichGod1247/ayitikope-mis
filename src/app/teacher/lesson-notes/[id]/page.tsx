// src/app/teacher/lesson-notes/[id]/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

// 🔽 shared curriculum types
import type { CurriculumUnitDto } from "@/types/curriculum";

/**
 * ==========================
 * Types
 * ==========================
 */

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

interface LessonNoteDetail {
  id: string;

  tenantId: string;
  teacherUserId: string;
  headteacherUserId: string | null;
  classroomId: string | null;

  // Optional curriculum context (if present)
  phase?: string | null; // e.g. "KG", "PRIMARY", "JHS"
  level?: string | null; // e.g. "KG1", "Basic 6", "JHS 1"
  curriculumUnitId?: string | null;

  subject: string;
  term: string;
  academicYear: string;
  weekNumber: number | null;
  lessonDate: string | null; // ISO

  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  lessonTitle: string | null;

  objectives: string | null;
  priorKnowledge: string | null;
  teachingLearningResources: string | null;
  introduction: string | null;
  lessonDevelopment: string | null;
  conclusion: string | null;
  assessment: string | null;
  homework: string | null;
  differentiationNotes: string | null;
  reflectionNotes: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;

  aiPlanJson?: unknown;
  aiPlanVersion?: number;

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

interface LessonNoteItemResponse {
  ok: boolean;
  item?: LessonNoteDetail;
  error?: string;
}

interface AiSupportResponseMeta {
  mode?: string;
  groundedOnLessonNoteId?: string;
}

interface AiLessonFields {
  lessonTitle?: string;
  objectives?: string;
  teachingLearningResources?: string;
  introduction?: string;
  lessonDevelopment?: string;
  conclusion?: string;
  assessment?: string;
  homework?: string;
  differentiationNotes?: string;
  reflectionNotes?: string;
}

interface AiSupportResponse {
  ok: boolean;
  suggestion?: string;
  meta?: AiSupportResponseMeta;
  fields?: AiLessonFields;
  error?: string;
}

/**
 * Shape of CurriculumUnit from the API
 * We now REUSE the shared DTO instead of redefining it.
 */
type CurriculumUnit = CurriculumUnitDto;

/**
 * ==========================
 * UI Helpers
 * ==========================
 */

const btnBase =
  "inline-flex items-center justify-center rounded-xl border text-xs md:text-sm h-9 px-3 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnGhost =
  "inline-flex items-center justify-center text-xs md:text-sm h-9 px-2 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100";

const inputBase =
  "w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white";

const textAreaBase =
  "w-full rounded-xl border border-zinc-300 px-2 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white resize-vertical min-h-24";

function formatDateTimeShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  if (status === "DRAFT") return "Draft (not submitted)";
  if (status === "SUBMITTED") return "Submitted, awaiting review";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Returned for improvement";
  return status;
}

/**
 * ==========================
 * Page
 * ==========================
 */

export default function TeacherLessonNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");

  const noteId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const teacherUserIdFromQuery = searchParams.get("teacherUserId");

  // Core note
  const [note, setNote] = useState<LessonNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Saving / submit
  const [saving, setSaving] = useState(false);
  const [submitSaving, setSubmitSaving] = useState(false);

  // AI co-tutor
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<AiSupportResponseMeta | null>(null);
  const [aiFields, setAiFields] = useState<AiLessonFields | null>(null);

  // Wizard active step: 1 = Class & learners, 2 = Curriculum slice, 3 = Lesson design
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  /**
   * Step 1 – Class & learners
   */
  const [learnerProfile, setLearnerProfile] = useState("");

  /**
   * Step 2 – Curriculum slice (CurriculumUnit)
   */
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [curriculumUnits, setCurriculumUnits] = useState<CurriculumUnit[]>([]);
  const [selectedSubstrand, setSelectedSubstrand] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  /**
   * Step 3 – Editable lesson fields
   */
  const [objectives, setObjectives] = useState("");
  const [priorKnowledge, setPriorKnowledge] = useState("");
  const [tlm, setTlm] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [development, setDevelopment] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [assessment, setAssessment] = useState("");
  const [homework, setHomework] = useState("");
  const [differentiation, setDifferentiation] = useState("");
  const [reflection, setReflection] = useState("");

  /**
   * ==========================
   * Load lesson note
   * ==========================
   */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!noteId) {
        setLoadError("Missing lesson note ID in the URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(
          `/api/teachers/lesson-notes/item/${encodeURIComponent(noteId)}`
        );
        const data = (await res.json()) as LessonNoteItemResponse;

        if (!res.ok || !data.ok || !data.item) {
          if (!cancelled) {
            setLoadError(
              data.error ??
                "Failed to load this lesson note. Please try again or contact the system administrator."
            );
          }
          return;
        }

        if (cancelled) return;

        const n = data.item;

        setNote(n);

        // Step 1 – learner profile
        setLearnerProfile(
          n.priorKnowledge ??
            "Briefly describe how your learners are doing in this topic (strengths, gaps, pace)."
        );

        // Step 3 – main text fields
        setObjectives(n.objectives ?? "");
        setPriorKnowledge(n.priorKnowledge ?? "");
        setTlm(n.teachingLearningResources ?? "");
        setIntroduction(n.introduction ?? "");
        setDevelopment(n.lessonDevelopment ?? "");
        setConclusion(n.conclusion ?? "");
        setAssessment(n.assessment ?? "");
        setHomework(n.homework ?? "");
        setDifferentiation(n.differentiationNotes ?? "");
        setReflection(n.reflectionNotes ?? "");

        setAiSuggestion(null);
        setAiMeta(null);
        setAiError(null);
        setAiFields(null);

        // If curriculum unit already linked, jump to step 3 by default
        if (n.curriculumUnitId || fromParam === "curriculum") {
  setActiveStep(3);
} else {
  setActiveStep(1);
}
      } catch {
        if (!cancelled) {
          setLoadError(
            "Network or server error while loading this lesson note. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [noteId, fromParam]);

  /**
   * ==========================
   * Navigation
   * ==========================
   */

  const handleBack = useCallback(() => {
    const query = teacherUserIdFromQuery
      ? `?teacherUserId=${encodeURIComponent(teacherUserIdFromQuery)}`
      : "";
    router.push(`/teacher/lesson-notes${query}`);
  }, [router, teacherUserIdFromQuery]);

  /**
   * ==========================
   * Step 2 – Load CurriculumUnits
   * ==========================
   *
   * IMPORTANT: we use ONLY lesson-note fields for the API filter.
   */

  async function handleLoadCurriculumUnits() {
    if (!note) {
      setCurriculumError("Lesson note not loaded yet.");
      return;
    }

    setCurriculumLoading(true);
    setCurriculumError(null);
    setCurriculumUnits([]);
    setSelectedSubstrand("");
    setSelectedUnitId(null);

    try {
      const params = new URLSearchParams();

      if (note.phase) params.set("phase", note.phase);
      if (note.level) params.set("level", note.level);
      if (note.subject) params.set("subject", note.subject);
      if (note.term) params.set("term", note.term);
      if (note.weekNumber != null) {
        params.set("weekNumber", String(note.weekNumber));
      }

      const res = await fetch(`/api/curriculum/units?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: CurriculumUnit[];
      };

      if (!res.ok || !data.ok || !Array.isArray(data.items)) {
        setCurriculumError(
          data.error ??
            "Failed to load curriculum units. Please try again or contact the system administrator."
        );
        return;
      }

      if (data.items.length === 0) {
        setCurriculumError(
          "No NaCCA curriculum units found for this phase/level/subject/term (and week if set). Please confirm that the seed data covers this class."
        );
        return;
      }

      setCurriculumUnits(data.items);
      // If there is only one substrand, auto-select it
      const uniqueSubstrands = Array.from(
        new Set(data.items.map((u) => u.substrand))
      );
      if (uniqueSubstrands.length === 1) {
        setSelectedSubstrand(uniqueSubstrands[0] ?? "");
      }

      // Move user to step 2 visually
      setActiveStep(2);
    } catch {
      setCurriculumError(
        "Network or server error while loading curriculum units. Please try again."
      );
    } finally {
      setCurriculumLoading(false);
    }
  }

  const uniqueSubstrands = useMemo(() => {
    if (!curriculumUnits.length) return [];
    return Array.from(new Set(curriculumUnits.map((u) => u.substrand))).sort();
  }, [curriculumUnits]);

  const unitsForSelectedSubstrand = useMemo(() => {
    if (!selectedSubstrand) return [];
    return curriculumUnits.filter((u) => u.substrand === selectedSubstrand);
  }, [curriculumUnits, selectedSubstrand]);

  const selectedCurriculumUnit = useMemo(
    () =>
      unitsForSelectedSubstrand.find((u) => u.id === selectedUnitId) ?? null,
    [unitsForSelectedSubstrand, selectedUnitId]
  );

  function applyCurriculumUnitToNote(unit: CurriculumUnit) {
    setNote((prev) =>
      prev
        ? {
            ...prev,
            phase: unit.phase,
            level: unit.level,
            subject: unit.subject,
            term: unit.term,
            weekNumber: unit.weekNumber,
            strand: unit.strand,
            substrand: unit.substrand,
            contentStandard: unit.contentStandard,
            indicator: unit.indicator,
            curriculumUnitId: unit.id,
          }
        : prev
    );

    // Move user to step 3 once curriculum choice is locked in
    setActiveStep(3);
  }

  /**
   * ==========================
   * Save / submit
   * ==========================
   */

  async function saveWithStatus(targetStatus: LessonNoteStatus) {
    if (!note) return;

    const isSubmit = targetStatus === "SUBMITTED";

    if (isSubmit) {
      setSubmitSaving(true);
    } else {
      setSaving(true);
    }
    setLoadError(null);

    try {
      const res = await fetch("/api/teachers/lesson-notes/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonNoteId: note.id,
          // From step 1 (now taken directly from the note)
          level: note.level,
          subject: note.subject,
          priorKnowledge: learnerProfile || priorKnowledge,

          // Step 3 – core NaCCA fields
          objectives,
          teachingLearningResources: tlm,
          introduction,
          lessonDevelopment: development,
          conclusion,
          assessment,
          homework,
          differentiationNotes: differentiation,
          reflectionNotes: reflection,

          status: targetStatus,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        item?: LessonNoteDetail;
      };

      if (!res.ok || !data.ok || !data.item) {
        setLoadError(
          data.error ??
            "Failed to save this lesson note. Please try again or contact the system administrator."
        );
        return;
      }

      setNote(data.item);
    } catch {
      setLoadError(
        "Network or server error while saving this lesson note. Please try again."
      );
    } finally {
      if (isSubmit) {
        setSubmitSaving(false);
      } else {
        setSaving(false);
      }
    }
  }

  const handleSaveDraft = useCallback(() => {
    void saveWithStatus("DRAFT");
  }, [
    note,
    learnerProfile,
    objectives,
    priorKnowledge,
    tlm,
    introduction,
    development,
    conclusion,
    assessment,
    homework,
    differentiation,
    reflection,
  ]);

  const handleSubmitForReview = useCallback(() => {
    void saveWithStatus("SUBMITTED");
  }, [
    note,
    learnerProfile,
    objectives,
    priorKnowledge,
    tlm,
    introduction,
    development,
    conclusion,
    assessment,
    homework,
    differentiation,
    reflection,
  ]);

  /**
   * ==========================
   * AI Co-Tutor
   * ==========================
   */

  const handleRunAiSupport = useCallback(async () => {
    if (!noteId) return;

    setAiLoading(true);
    setAiError(null);
    setAiSuggestion(null);
    setAiMeta(null);
    setAiFields(null);

    try {
      const res = await fetch("/api/teachers/lesson-notes/ai-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonNoteId: noteId,
          mode: "FULL", // FULL: structured coaching with fields
        }),
      });

      const data = (await res.json().catch(() => ({}))) as AiSupportResponse;

      if (!res.ok || !data.ok) {
        setAiError(
          data.error ??
            "AI Co-Tutor could not generate support. Please try again."
        );
        return;
      }

      setAiSuggestion(data.suggestion ?? null);
      setAiMeta(data.meta ?? null);
      setAiFields(data.fields ?? null);
    } catch {
      setAiError(
        "Network or server error while talking to the AI Co-Tutor. Please try again."
      );
    } finally {
      setAiLoading(false);
    }
  }, [noteId]);

  const handleApplyAiFields = useCallback(() => {
    if (!aiFields) return;

    // Lesson title lives inside the note object
    setNote((prev) =>
      prev
        ? {
            ...prev,
            lessonTitle: aiFields.lessonTitle ?? prev.lessonTitle ?? null,
          }
        : prev
    );

    if (aiFields.objectives) {
      setObjectives(aiFields.objectives);
    }
    if (aiFields.teachingLearningResources) {
      setTlm(aiFields.teachingLearningResources);
    }
    if (aiFields.introduction) {
      setIntroduction(aiFields.introduction);
    }
    if (aiFields.lessonDevelopment) {
      setDevelopment(aiFields.lessonDevelopment);
    }
    if (aiFields.conclusion) {
      setConclusion(aiFields.conclusion);
    }
    if (aiFields.assessment) {
      setAssessment(aiFields.assessment);
    }
    if (aiFields.homework) {
      setHomework(aiFields.homework);
    }
    if (aiFields.differentiationNotes) {
      setDifferentiation(aiFields.differentiationNotes);
    }
    if (aiFields.reflectionNotes) {
      setReflection(aiFields.reflectionNotes);
    }
  }, [aiFields]);

  const canSubmit =
    note?.status === "DRAFT" || note?.status === "REJECTED";

  /**
   * ==========================
   * Render
   * ==========================
   */

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-5 md:py-6 space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleBack}
              className={btnGhost}
            >
              ← Back to lesson notes
            </button>
            <h1 className="text-xl md:text-2xl font-semibold">
              Lesson Note Studio
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This is your{" "}
              <span className="font-semibold">
                NaCCA-aligned learner note workbench
              </span>{" "}
              inside EduLife OS. Move from{" "}
              <span className="font-semibold">
                class &amp; learners → curriculum slice → AI-assisted
                lesson
              </span>{" "}
              in a few simple steps.
            </p>
          </div>

          <div className="flex flex-col md:items-end gap-2 text-right">
            {note && (
              <span className={statusBadgeClasses(note.status)}>
                {statusLabel(note.status)}
              </span>
            )}
            {note && (
              <span className="text-[11px] text-zinc-500">
                Last updated: {formatDateTimeShort(note.updatedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Error + loading state */}
        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {loadError}
          </div>
        )}

        {loading && (
          <div className="border border-zinc-200 bg-white rounded-2xl p-4 md:p-5 space-y-3">
            <div className="h-4 w-48 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-3 w-64 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-3 w-40 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-24 w-full bg-zinc-100 rounded-xl animate-pulse" />
          </div>
        )}

        {/* Main content */}
        {!loading && note && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)] gap-4 md:gap-5">
            {/* LEFT: 3-step wizard + fields */}
            <section className="space-y-4">
              {/* Step indicator */}
              <div className="border rounded-2xl bg-white p-3 md:p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2 text-[11px] md:text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 border ${
                        activeStep === 1
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                        1
                      </span>
                      Class &amp; learners
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 border ${
                        activeStep === 2
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                        2
                      </span>
                      NaCCA curriculum slice
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStep(3)}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 border ${
                        activeStep === 3
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                        3
                      </span>
                      Lesson design &amp; reflection
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Start with step 1, but you can jump between steps at any
                    time.
                  </p>
                </div>
              </div>

              {/* STEP 1: Class & learners */}
              {activeStep === 1 && (
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Step 1 · Class &amp; learner snapshot
                    </h2>
                    <span className="text-[11px] text-zinc-500">
                      Short answers only – this powers the AI&apos;s tone and
                      level.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* CLASS / LEVEL INPUT */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Class / level
                      </label>
                      <input
                        type="text"
                        className={inputBase}
                        value={note.level ?? ""}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          setNote((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  level: value || null,
                                }
                              : prev
                          );
                        }}
                        placeholder="e.g. KG1, KG2, Basic 4, Basic 6, JHS 1"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Human-friendly label for the class. This should match
                        how you refer to the class (KG, Basic, JHS) in your
                        school.
                      </p>
                    </div>

                    {/* SUBJECT INPUT */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        className={inputBase}
                        value={note.subject ?? ""}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          setNote((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  subject: value || prev.subject,
                                }
                              : prev
                          );
                        }}
                        placeholder="e.g. Mathematics, Computing, Our World and Our People"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        This should align with the NaCCA subject name (Maths,
                        Literacy, OWOP, Science, Creative Arts, RME, Computing,
                        etc.). The AI Co-Tutor uses this to adapt its advice.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Briefly describe your learners&apos; current understanding
                    </label>
                    <textarea
                      className={textAreaBase}
                      value={learnerProfile}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLearnerProfile(value);
                        setPriorKnowledge(value);
                      }}
                      placeholder="Example: Most learners can name main body parts but still confuse left/right; 5–6 learners need extra support following instructions."
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      This feeds directly into the{" "}
                      <span className="font-semibold">
                        Prior knowledge / learner profile
                      </span>{" "}
                      part of the lesson note and informs AI suggestions.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <p className="text-[11px] text-zinc-500 max-w-xs">
                      When you are done, move to{" "}
                      <span className="font-semibold">
                        Step 2 – NaCCA curriculum slice
                      </span>{" "}
                      to pick the exact strand / indicator for this lesson.
                    </p>
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => setActiveStep(2)}
                    >
                      Continue to Step 2
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: NaCCA curriculum slice */}
              {activeStep === 2 && (
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Step 2 · Choose the NaCCA curriculum slice
                    </h2>
                    <span className="text-[11px] text-zinc-500">
                      Sub-strand first, then indicator. Strand &amp; content
                      standard auto-fill.
                    </span>
                  </div>

                  {/* Filters summary + Load button */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700 space-y-1.5">
                    <p>
                      <span className="font-semibold">
                        Filter in use (from this lesson note):
                      </span>
                    </p>
                    <p>
                      Phase:{" "}
                      <span className="font-semibold">
                        {note.phase || "—"}
                      </span>{" "}
                      • Level:{" "}
                      <span className="font-semibold">
                        {note.level || "—"}
                      </span>{" "}
                      • Subject:{" "}
                      <span className="font-semibold">
                        {note.subject || "—"}
                      </span>
                    </p>
                    <p>
                      Term:{" "}
                      <span className="font-semibold">
                        {note.term || "—"}
                      </span>{" "}
                      • Week:{" "}
                      <span className="font-semibold">
                        {note.weekNumber ?? "—"}
                      </span>
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      These values were seeded from the{" "}
                      <span className="font-semibold">CurriculumUnit</span>{" "}
                      table you populated earlier (NaCCA curriculum KG–Basic–JHS).
                      We simply read them; no guessing.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={handleLoadCurriculumUnits}
                      disabled={curriculumLoading}
                    >
                      {curriculumLoading
                        ? "Loading NaCCA units…"
                        : "Load NaCCA units for this class & subject"}
                    </button>
                    {curriculumUnits.length > 0 && (
                      <span className="text-[11px] text-zinc-500">
                        {curriculumUnits.length} unit
                        {curriculumUnits.length === 1 ? "" : "s"} found
                      </span>
                    )}
                  </div>

                  {curriculumError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {curriculumError}
                    </div>
                  )}

                  {curriculumUnits.length > 0 && (
                    <>
                      {/* Sub-strand picker */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Sub-strand / Topic
                        </label>
                        <select
                          className={inputBase}
                          value={selectedSubstrand}
                          onChange={(e) => {
                            setSelectedSubstrand(e.target.value);
                            setSelectedUnitId(null);
                          }}
                        >
                          <option value="">
                            — Select sub-strand / topic —
                          </option>
                          {uniqueSubstrands.map((ss) => (
                            <option key={ss ?? "blank"} value={ss ?? ""}>
                              {ss}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          This is the same as the{" "}
                          <span className="font-semibold">topic</span> that
                          appears on your NaCCA plans.
                        </p>
                      </div>

                      {/* Indicator picker (dependent) */}
                      {selectedSubstrand && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-zinc-700">
                            Indicator for this week&apos;s lesson
                          </label>
                          <select
                            className={inputBase}
                            value={selectedUnitId ?? ""}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setSelectedUnitId(value);
                              const unit = unitsForSelectedSubstrand.find(
                                (u) => u.id === value
                              );
                              if (unit) {
                                applyCurriculumUnitToNote(unit);
                              }
                            }}
                          >
                            <option value="">
                              — Select indicator for this lesson —
                            </option>
                            {unitsForSelectedSubstrand.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.indicatorCode
                                  ? `${u.indicatorCode} – ${u.indicator}`
                                  : u.indicator}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-zinc-500">
                            Once selected, the matching{" "}
                            <span className="font-semibold">
                              strand &amp; content standard
                            </span>{" "}
                            will be auto-filled into the lesson note.
                          </p>
                        </div>
                      )}

                      {/* Summary of what is currently linked */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 space-y-1.5">
                        <p className="font-semibold">
                          Linked curriculum slice for this lesson
                        </p>
                        <p>
                          Strand:{" "}
                          <span className="font-semibold">
                            {note.strand || "—"}
                          </span>
                        </p>
                        <p>
                          Sub-strand:{" "}
                          <span className="font-semibold">
                            {note.substrand || "—"}
                          </span>
                        </p>
                        <p>
                          Content standard:{" "}
                          <span className="font-semibold">
                            {note.contentStandard || "—"}
                          </span>
                        </p>
                        <p>
                          Indicator:{" "}
                          <span className="font-semibold">
                            {note.indicator || "—"}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2">
                        <p className="text-[11px] text-zinc-500 max-w-xs">
                          When the{" "}
                          <span className="font-semibold">
                            indicator looks right
                          </span>
                          , move to{" "}
                          <span className="font-semibold">
                            Step 3 – Lesson design &amp; reflection
                          </span>
                          . The AI Co-Tutor will use all of this.
                        </p>
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => setActiveStep(3)}
                          disabled={!note.indicator}
                        >
                          Continue to Step 3
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 3: Lesson design (main NaCCA fields) */}
              {activeStep === 3 && (
                <>
                  {/* Curriculum summary card */}
                  <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">
                          {note.subject} •{" "}
                          <span className="text-zinc-700">
                            {note.strand}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 space-y-0.5">
                          {note.substrand && (
                            <div>
                              <span className="font-medium">
                                Sub-strand:
                              </span>{" "}
                              {note.substrand}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">
                              Term / Year:
                            </span>{" "}
                            {note.term} • {note.academicYear}
                          </div>
                          <div>
                            <span className="font-medium">
                              Week:
                            </span>{" "}
                            {note.weekNumber ?? "—"}
                          </div>
                          {(note.phase || note.level) && (
                            <div>
                              <span className="font-medium">
                                Phase / Level:
                              </span>{" "}
                              {note.phase ?? "—"}{" "}
                              {note.level ? `• ${note.level}` : ""}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-zinc-600 space-y-2 max-w-xs">
                        {note.contentStandard && (
                          <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                            <div className="font-semibold text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                              Content standard
                            </div>
                            <p>{note.contentStandard}</p>
                          </div>
                        )}

                        {note.indicator && (
                          <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                            <div className="font-semibold text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                              Indicator
                            </div>
                            <p>{note.indicator}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Editable lesson fields – NaCCA style */}
                  <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                    {/* Row 1: Lesson title + prior knowledge */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Lesson title
                        </label>
                        <input
                          type="text"
                          className={inputBase}
                          value={note.lessonTitle ?? ""}
                          onChange={(e) =>
                            setNote((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    lessonTitle: e.target.value,
                                  }
                                : prev
                            )
                          }
                          placeholder="e.g. Parts of the body – head, arms, legs"
                        />
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Short, learner-friendly title that matches the
                          indicator.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Prior knowledge / learner profile
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={priorKnowledge}
                          onChange={(e) => {
                            setPriorKnowledge(e.target.value);
                            setLearnerProfile(e.target.value);
                          }}
                          placeholder="Summarise what learners can already do and where they struggle."
                        />
                      </div>
                    </div>

                    {/* Objectives */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-zinc-700">
                          Objectives (general &amp; specific)
                        </label>
                        <span className="text-[11px] text-zinc-500">
                          Align with the indicator; keep them observable and
                          measurable.
                        </span>
                      </div>
                      <textarea
                        className={textAreaBase}
                        value={objectives}
                        onChange={(e) => setObjectives(e.target.value)}
                        placeholder="By the end of the lesson, learners will be able to…"
                      />
                    </div>

                    {/* TLM + Introduction */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Teaching &amp; learning resources (TLM)
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={tlm}
                          onChange={(e) => setTlm(e.target.value)}
                          placeholder="Real objects, charts, number cards, songs, local materials…"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Introduction (Starter)
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={introduction}
                          onChange={(e) =>
                            setIntroduction(e.target.value)
                          }
                          placeholder="Short starter (song, game, question) that connects to learners’ experiences."
                        />
                      </div>
                    </div>

                    {/* Development */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-zinc-700">
                          Lesson development (I do – We do – You do)
                        </label>
                        <span className="text-[11px] text-zinc-500">
                          Break into simple steps: teacher model, guided
                          practice, independent/group practice.
                        </span>
                      </div>
                      <textarea
                        className={textAreaBase}
                        value={development}
                        onChange={(e) =>
                          setDevelopment(e.target.value)
                        }
                        placeholder="Step 1: …&#10;Step 2: …&#10;Step 3: …"
                      />
                    </div>

                    {/* Conclusion + Assessment */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Conclusion / Plenary
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={conclusion}
                          onChange={(e) =>
                            setConclusion(e.target.value)
                          }
                          placeholder="Quick recap, demonstration or game to reinforce the key idea."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Assessment / Evaluation
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={assessment}
                          onChange={(e) =>
                            setAssessment(e.target.value)
                          }
                          placeholder="Oral checks, practical tasks, short written work, exit tickets…"
                        />
                      </div>
                    </div>

                    {/* Homework + Differentiation */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Homework / Assignment
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={homework}
                          onChange={(e) =>
                            setHomework(e.target.value)
                          }
                          placeholder="Simple, realistic home task that reinforces today’s learning."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Differentiation (support &amp; extension)
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={differentiation}
                          onChange={(e) =>
                            setDifferentiation(e.target.value)
                          }
                          placeholder="How you will support slower learners and stretch faster learners."
                        />
                      </div>
                    </div>

                    {/* Reflection */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-700">
                        Teacher reflection (after the lesson)
                      </label>
                      <textarea
                        className={textAreaBase}
                        value={reflection}
                        onChange={(e) =>
                          setReflection(e.target.value)
                        }
                        placeholder="What went well? What did learners find hard? What will you change next time?"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={handleSaveDraft}
                          disabled={saving || submitSaving}
                        >
                          {saving ? "Saving…" : "Save as draft"}
                        </button>

                        <button
                          type="button"
                          className={btnOutline}
                          onClick={handleSubmitForReview}
                          disabled={!canSubmit || submitSaving || saving}
                        >
                          {submitSaving
                            ? "Submitting…"
                            : "Submit for headteacher review"}
                        </button>

                        {/* PRINT BUTTON (PRESERVED) */}
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() => {
                            if (!note) return;
                            const url = `/teacher/lesson-notes/${encodeURIComponent(
                              note.id
                            )}/print`;
                            window.open(url, "_blank");
                          }}
                        >
                          🖨️ Open NaCCA print view
                        </button>
                      </div>

                      <p className="text-[11px] text-zinc-500">
                        EduLife OS keeps your curriculum fields locked to the
                        official NaCCA document, while letting you refine the{" "}
                        <span className="font-semibold">
                          human side
                        </span>{" "}
                        of your lesson note.
                      </p>
                    </div>
                  </div>

                  {/* Headteacher review info (if any) */}
                  {(note.headteacherComment ||
                    note.reviewedAt ||
                    note.approvedAt ||
                    note.rejectedAt) && (
                    <div className="border rounded-2xl bg-emerald-50 border-emerald-100 p-4 md:p-5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-emerald-900">
                          Headteacher review
                        </h2>
                        <span className="text-[11px] text-emerald-800">
                          Status: {statusLabel(note.status)}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-900">
                        {note.headteacherComment
                          ? note.headteacherComment
                          : "No written comment provided yet."}
                      </p>
                      <div className="text-[11px] text-emerald-900 space-y-0.5">
                        {note.reviewedAt && (
                          <div>
                            Reviewed at:{" "}
                            {formatDateTimeShort(note.reviewedAt)}
                          </div>
                        )}
                        {note.approvedAt && (
                          <div>
                            Approved at:{" "}
                            {formatDateTimeShort(note.approvedAt)}
                          </div>
                        )}
                        {note.rejectedAt && (
                          <div>
                            Returned at:{" "}
                            {formatDateTimeShort(note.rejectedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* RIGHT: AI Co-Tutor + meta */}
            {!loading && note && (
              <aside className="space-y-4">
                {/* AI Co-Tutor card */}
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">
                        AI Co-Tutor assistant
                      </h2>
                      <p className="text-xs text-zinc-600">
                        Get a compact AI-style draft grounded in your{" "}
                        <span className="font-semibold">
                          curriculum slice + learner profile
                        </span>
                        .
                      </p>
                    </div>
                    <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-zinc-900 text-white text-[11px] font-medium">
                      Powered by EduLife OS
                    </span>
                  </div>

                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleRunAiSupport}
                    disabled={aiLoading}
                  >
                    {aiLoading
                      ? "Thinking with you…"
                      : "Ask AI Co-Tutor for a lesson draft"}
                  </button>

                  {aiError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {aiError}
                    </div>
                  )}

                  {aiSuggestion && (
                    <div className="border border-zinc-200 bg-zinc-50 rounded-xl px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wide">
                          AI draft (copy-paste into fields)
                        </span>
                        {aiMeta?.mode && (
                          <span className="text-[10px] text-zinc-500">
                            Mode: {aiMeta.mode}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-800 whitespace-pre-line">
                        {aiSuggestion}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Use this as a{" "}
                        <span className="font-semibold">
                          co-teacher, not a replacement
                        </span>
                        . You can copy pieces directly into objectives,
                        development, assessment, or reflection.
                      </p>
                    </div>
                  )}

                  {!aiLoading && !aiSuggestion && !aiError && (
                    <p className="text-[11px] text-zinc-500">
                      Tip: run the AI Co-Tutor after you complete{" "}
                      <span className="font-semibold">
                        Step 1 (learners) and Step 2 (indicator)
                      </span>
                      . This makes the response feel like a real human coach
                      who knows your class.
                    </p>
                  )}

                  {aiFields && (
                    <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2 space-y-2 mt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide">
                          AI field suggestions ready
                        </span>
                        <button
                          type="button"
                          onClick={handleApplyAiFields}
                          className="inline-flex items-center justify-center h-7 px-3 rounded-full border border-emerald-700 text-[11px] font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100"
                        >
                          Apply to lesson fields
                        </button>
                      </div>
                      <p className="text-[11px] text-emerald-900">
                        This will update your{" "}
                        <span className="font-semibold">
                          objectives, TLM, introduction, development,
                          assessment, homework, differentiation and reflection
                        </span>{" "}
                        with a student-centred NaCCA-aligned draft. You can
                        still edit everything before saving or submitting.
                      </p>
                    </div>
                  )}
                </div>

                {/* Tiny meta card */}
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
                  <h3 className="text-xs font-semibold text-zinc-800">
                    Lesson meta
                  </h3>
                  <div className="space-y-0.5">
                    <div>
                      Tenant / school ID:{" "}
                      <span className="font-mono text-[11px]">
                        {note.tenantId}
                      </span>
                    </div>
                    <div>
                      Teacher user ID:{" "}
                      <span className="font-mono text-[11px]">
                        {note.teacherUserId}
                      </span>
                    </div>
                    {note.curriculumUnitId && (
                      <div>
                        Curriculum unit ID:{" "}
                        <span className="font-mono text-[11px]">
                          {note.curriculumUnitId}
                        </span>
                      </div>
                    )}
                    <div>
                      Created: {formatDateTimeShort(note.createdAt)}
                    </div>
                    <div>
                      Updated: {formatDateTimeShort(note.updatedAt)}
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
