// src/components/TeacherLessonNoteDetailClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

  phase?: string | null;
  level?: string | null;
  curriculumUnitId?: string | null;

  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;
  lessonDate: string | null;

  strand: string | null;
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

  createdAt: string;
  updatedAt: string;
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

type CurriculumUnit = CurriculumUnitDto;

type CurriculumSubjectOption = {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string;
  orderIndex?: number;
};

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

function safeTrim(v: string) {
  return v.replace(/^\s+/g, "").replace(/\s+$/g, "");
}

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

async function safeJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

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

function handleAuthFailure() {
  window.location.href = "/auth/signin";
}

function unlinkCurriculum(prev: LessonNoteDetail): LessonNoteDetail {
  // Prevent inconsistent state (unit linked but subject/level changed)
  return {
    ...prev,
    curriculumUnitId: null,
    strand: prev.strand ?? null,
    substrand: null,
    contentStandard: null,
    indicator: null,
  };
}

function parseStep(raw: string | null): 1 | 2 | 3 | null {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

/**
 * ==========================
 * Component
 * ==========================
 */
export default function TeacherLessonNoteDetailClient(props: {
  noteId: string;
  tenantId: string;
  teacherUserId: string;
}) {
  const { noteId, tenantId, teacherUserId } = props;

  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const stepParam = searchParams.get("step");

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

  // Resolved curriculum subject slug (for stable NaCCA queries)
  const [resolvedSubjectSlug, setResolvedSubjectSlug] = useState<string | null>(null);

  /**
   * Step 1 – Class & learners
   */
  const [learnerProfile, setLearnerProfile] = useState("");

  /**
   * Step 2 – Curriculum slice
   */
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [curriculumUnits, setCurriculumUnits] = useState<CurriculumUnit[]>([]);
  const [selectedSubstrand, setSelectedSubstrand] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  // ✅ persist-link state (prevents Step 3 mismatch + makes refresh deterministic)
  const [linkingSlice, setLinkingSlice] = useState(false);
  const [linkSliceError, setLinkSliceError] = useState<string | null>(null);

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

  const canEditCurriculumSlice =
    note?.status === "DRAFT" || note?.status === "REJECTED";

  /**
   * ==========================
   * Step URL sync (production grade)
   * ==========================
   */
  const updateStepInUrl = useCallback(
    (step: 1 | 2 | 3) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("step", String(step));
      const qs = p.toString();
      const path =
        typeof window !== "undefined" ? window.location.pathname : "";
      router.replace(qs ? `${path}?${qs}` : path);
    },
    [router, searchParams]
  );

  const setStep = useCallback(
    (step: 1 | 2 | 3) => {
      setActiveStep(step);
      updateStepInUrl(step);
    },
    [updateStepInUrl]
  );

  // Default: if step not provided, force step=1 (so refresh is deterministic)
  useEffect(() => {
    if (!parseStep(stepParam)) updateStepInUrl(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepParam]);

  // If URL step changes (back/forward), reflect it
  useEffect(() => {
    const s = parseStep(stepParam) ?? 1;
    setActiveStep(s);
  }, [stepParam]);

  /**
   * ==========================
   * Load lesson note
   *
   * ✅ CRITICAL:
   * Do NOT re-fetch note just because ?step changes.
   * If you re-fetch on step navigation, you overwrite the in-memory slice selected in Step 2.
   * ==========================
   */
  useEffect(() => {
    const ac = new AbortController();

    async function run() {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(
          `/api/teachers/lesson-notes/item/${encodeURIComponent(noteId)}`,
          { signal: ac.signal }
        );

        if (res.status === 401 || res.status === 403) return handleAuthFailure();

        const data = await safeJson<LessonNoteItemResponse>(res);

        if (!res.ok || !data.ok || !data.item) {
          setLoadError(
            data.error ??
              "Failed to load this lesson note. Please try again or contact the system administrator."
          );
          return;
        }

        const n = data.item;

        // Tenant/user sanity
        if (n.tenantId !== tenantId || n.teacherUserId !== teacherUserId) {
          setLoadError("Access denied for this lesson note.");
          return;
        }

        setNote(n);

        // Step 1/3 fields
        setLearnerProfile(n.priorKnowledge ?? "");
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

        // Reset AI output on load
        setAiSuggestion(null);
        setAiMeta(null);
        setAiError(null);
        setAiFields(null);

        // ❌ do not set activeStep here; step is URL-driven by effects above.
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setLoadError(
          "Network or server error while loading this lesson note. Please try again."
        );
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => ac.abort();
  }, [noteId, tenantId, teacherUserId]);

  /**
   * Clear resolved slug if the teacher edits subject/level/phase
   */
  useEffect(() => {
    if (!note) return;
    setResolvedSubjectSlug(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.subject, note?.level, note?.phase]);

  /**
   * ==========================
   * Navigation
   * ==========================
   */
  const handleBack = useCallback(() => {
    if (fromParam === "curriculum") {
      router.push("/teacher/curriculum");
      return;
    }
    router.push("/teacher/lesson-notes");
  }, [router, fromParam]);

  /**
   * ==========================
   * Step 2 – Resolve subjectSlug (so seeded NaCCA queries are stable)
   * ==========================
   */
  const resolveSubjectSlug = useCallback(
    async (n: LessonNoteDetail): Promise<string | null> => {
      try {
        const res = await fetch("/api/curriculum/subjects", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        if (res.status === 401 || res.status === 403) {
          handleAuthFailure();
          return null;
        }

        const data = await safeJson<{
          ok?: boolean;
          error?: string;
          items?: CurriculumSubjectOption[];
        }>(res);

        if (!res.ok || !data.ok || !Array.isArray(data.items)) return null;

        const targetName = norm(n.subject);
        const targetLevel = norm(n.level);
        const targetPhase = norm(n.phase);

        // Match by name + (level/phase if present) to avoid collisions
        const match =
          data.items.find((s) => {
            if (norm(s.name) !== targetName) return false;
            if (targetLevel && norm(s.level) !== targetLevel) return false;
            if (targetPhase && norm(s.phase) !== targetPhase) return false;
            return true;
          }) ??
          // fallback: name + level only
          data.items.find(
            (s) =>
              norm(s.name) === targetName &&
              (!targetLevel || norm(s.level) === targetLevel)
          ) ??
          // last fallback: name only
          data.items.find((s) => norm(s.name) === targetName);

        return match?.slug ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  /**
   * ==========================
   * Step 2 – Load CurriculumUnits
   * ==========================
   */
  const handleLoadCurriculumUnits = useCallback(async () => {
    if (!note) {
      setCurriculumError("Lesson note not loaded yet.");
      return;
    }

    if (!note.subject || !note.level || !note.term) {
      setCurriculumError(
        "Missing subject/level/term on this lesson note. Complete Step 1 first (and ensure subject & class match NaCCA naming)."
      );
      return;
    }

    setCurriculumLoading(true);
    setCurriculumError(null);
    setLinkSliceError(null);

    try {
      // Resolve subjectSlug (preferred for seeded NaCCA lookups)
      const slug = resolvedSubjectSlug ?? (await resolveSubjectSlug(note));
      if (slug) setResolvedSubjectSlug(slug);

      const params = new URLSearchParams();
      if (note.phase) params.set("phase", note.phase);
      if (note.level) params.set("level", note.level);
      if (note.subject) params.set("subject", note.subject);

      // ✅ key addition: subjectSlug (won’t break if API ignores it)
      if (slug) params.set("subjectSlug", slug);

      if (note.term) params.set("term", note.term);
      if (note.weekNumber != null)
        params.set("weekNumber", String(note.weekNumber));

      const res = await fetch(`/api/curriculum/units?${params.toString()}`, {
        headers: { "Cache-Control": "no-store" },
      });

      if (res.status === 401 || res.status === 403) return handleAuthFailure();

      const data = (await safeJson(res)) as {
        ok?: boolean;
        error?: string;
        items?: CurriculumUnit[];
      };

      if (!res.ok || !data.ok || !Array.isArray(data.items)) {
        setCurriculumError(
          data.error ??
            "Failed to load curriculum units. Please try again or contact the system administrator."
        );
        setCurriculumUnits([]);
        setSelectedSubstrand("");
        setSelectedUnitId(null);
        return;
      }

      if (data.items.length === 0) {
        const slugHint = slug
          ? `Resolved subjectSlug: ${slug}.`
          : "Could not resolve subjectSlug.";
        setCurriculumError(
          `No NaCCA curriculum units found for this selection. ${slugHint} Confirm that your seed includes this class/subject/term (and week if filtered).`
        );
        setCurriculumUnits([]);
        setSelectedSubstrand("");
        setSelectedUnitId(null);
        return;
      }

      setCurriculumUnits(data.items);

      // Preselect existing linked unit if present
      if (note.curriculumUnitId && data.items.some((u) => u.id === note.curriculumUnitId)) {
        const linked = data.items.find((u) => u.id === note.curriculumUnitId)!;
        setSelectedSubstrand(linked.substrand ?? "");
        setSelectedUnitId(linked.id);
      } else {
        const uniqueSubstrands = Array.from(
          new Set(data.items.map((u) => u.substrand).filter(Boolean))
        ).sort();
        if (uniqueSubstrands.length === 1)
          setSelectedSubstrand(uniqueSubstrands[0] ?? "");
      }
    } catch {
      setCurriculumError(
        "Network or server error while loading curriculum units. Please try again."
      );
      setCurriculumUnits([]);
      setSelectedSubstrand("");
      setSelectedUnitId(null);
    } finally {
      setCurriculumLoading(false);
    }
  }, [note, resolvedSubjectSlug, resolveSubjectSlug]);

  // Optional: auto-load when entering Step 2 (only if nothing loaded yet)
  useEffect(() => {
    if (activeStep !== 2) return;
    if (!note) return;
    if (curriculumLoading) return;
    if (curriculumUnits.length > 0) return;
    void handleLoadCurriculumUnits();
  }, [
    activeStep,
    note,
    curriculumLoading,
    curriculumUnits.length,
    handleLoadCurriculumUnits,
  ]);

  const uniqueSubstrands = useMemo(() => {
    if (!curriculumUnits.length) return [];
    return Array.from(
      new Set(curriculumUnits.map((u) => u.substrand).filter(Boolean))
    ).sort();
  }, [curriculumUnits]);

  const unitsForSelectedSubstrand = useMemo(() => {
    if (!selectedSubstrand) return [];
    return curriculumUnits.filter((u) => u.substrand === selectedSubstrand);
  }, [curriculumUnits, selectedSubstrand]);

  function applyCurriculumUnitToNote(unit: CurriculumUnit) {
    // local UI update immediately (fast), DB persist happens right after selection
    setNote((prev) =>
      prev
        ? {
            ...prev,
            phase: unit.phase ?? prev.phase ?? null,
            level: unit.level ?? prev.level ?? null,
            subject: unit.subject ?? prev.subject ?? null,
            term: unit.term ?? prev.term ?? null,
            weekNumber: unit.weekNumber ?? prev.weekNumber ?? null,
            strand: unit.strand ?? prev.strand ?? null,
            substrand: unit.substrand ?? null,
            contentStandard: unit.contentStandard ?? null,
            indicator: unit.indicator ?? null,
            curriculumUnitId: unit.id,
          }
        : prev
    );

    setSelectedUnitId(unit.id);
    setSelectedSubstrand(unit.substrand ?? "");
  }

  /**
   * ==========================
   * Save / submit
   * ==========================
   */
  async function postUpsert(payload: any) {
    const res = await fetch("/api/teachers/lesson-notes/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthFailure();
      return { res, data: { ok: false, error: "Unauthorized" } };
    }

    const data = (await safeJson(res)) as {
      ok?: boolean;
      error?: string;
      item?: LessonNoteDetail;
    };

    return { res, data };
  }

  /**
   * ✅ Persist the selected curriculum slice immediately.
   * Prevents Step 3 showing a different (previous) slice due to a refetch overwrite.
   */
  async function persistCurriculumSlice(
    unit: CurriculumUnit
  ): Promise<boolean> {
    if (!note) return false;

    if (!canEditCurriculumSlice) {
      setLinkSliceError(
        "This lesson note is locked (submitted/approved). You cannot change its curriculum slice."
      );
      return false;
    }

    if (linkingSlice || saving || submitSaving) return false;

    setLinkingSlice(true);
    setLinkSliceError(null);

    const priorToSave = safeTrim(priorKnowledge || learnerProfile);
    const objectivesToSave = safeTrim(objectives);
    const tlmToSave = safeTrim(tlm);
    const introToSave = safeTrim(introduction);
    const devToSave = safeTrim(development);
    const conclToSave = safeTrim(conclusion);
    const assessToSave = safeTrim(assessment);
    const hwToSave = safeTrim(homework);
    const diffToSave = safeTrim(differentiation);
    const reflToSave = safeTrim(reflection);
    const titleToSave = safeTrim(note.lessonTitle ?? "");

    const fullPayload = {
      lessonNoteId: note.id,

      phase: unit.phase ?? note.phase ?? null,
      level: unit.level ?? note.level ?? null,
      subject: unit.subject ?? note.subject ?? null,
      term: unit.term ?? note.term ?? null,
      academicYear: note.academicYear ?? null,
      weekNumber: unit.weekNumber ?? note.weekNumber ?? null,

      curriculumUnitId: unit.id,
      strand: unit.strand ?? null,
      substrand: unit.substrand ?? null,
      contentStandard: unit.contentStandard ?? null,
      indicator: unit.indicator ?? null,

      lessonTitle: titleToSave || null,
      priorKnowledge: priorToSave || null,

      objectives: objectivesToSave || "",
      teachingLearningResources: tlmToSave || "",
      introduction: introToSave || "",
      lessonDevelopment: devToSave || "",
      conclusion: conclToSave || "",
      assessment: assessToSave || "",
      homework: hwToSave || "",
      differentiationNotes: diffToSave || "",
      reflectionNotes: reflToSave || "",

      // do NOT alter workflow status here
      status: note.status,
    };

    const legacyPayload = {
      lessonNoteId: note.id,
      level: fullPayload.level,
      subject: fullPayload.subject,
      priorKnowledge: priorToSave || "",

      objectives: objectivesToSave,
      teachingLearningResources: tlmToSave,
      introduction: introToSave,
      lessonDevelopment: devToSave,
      conclusion: conclToSave,
      assessment: assessToSave,
      homework: hwToSave,
      differentiationNotes: diffToSave,
      reflectionNotes: reflToSave,

      status: note.status,
    };

    try {
      let { res, data } = await postUpsert(fullPayload);

      if ((!res.ok || !data.ok || !data.item) && res.status === 400) {
        const retry = await postUpsert(legacyPayload);
        res = retry.res;
        data = retry.data;
      }

      if (!res.ok || !data.ok || !data.item) {
        setLinkSliceError(
          data.error ??
            "Failed to link the selected NaCCA indicator to this lesson note."
        );
        return false;
      }

      if (data.item.tenantId !== tenantId || data.item.teacherUserId !== teacherUserId) {
        setLinkSliceError("Access denied for this lesson note.");
        return false;
      }

      setNote(data.item);
      return true;
    } catch {
      setLinkSliceError(
        "Network/server error while linking the curriculum slice. Try again."
      );
      return false;
    } finally {
      setLinkingSlice(false);
    }
  }

  async function saveWithStatus(targetStatus: LessonNoteStatus) {
    if (!note) return;
    if (saving || submitSaving) return;

    const isSubmit = targetStatus === "SUBMITTED";
    isSubmit ? setSubmitSaving(true) : setSaving(true);

    setLoadError(null);

    const priorToSave = safeTrim(priorKnowledge || learnerProfile);
    const objectivesToSave = safeTrim(objectives);
    const tlmToSave = safeTrim(tlm);
    const introToSave = safeTrim(introduction);
    const devToSave = safeTrim(development);
    const conclToSave = safeTrim(conclusion);
    const assessToSave = safeTrim(assessment);
    const hwToSave = safeTrim(homework);
    const diffToSave = safeTrim(differentiation);
    const reflToSave = safeTrim(reflection);
    const titleToSave = safeTrim(note.lessonTitle ?? "");

    const fullPayload = {
      lessonNoteId: note.id,

      phase: note.phase ?? null,
      level: note.level ?? null,
      subject: note.subject ?? null,
      term: note.term ?? null,
      academicYear: note.academicYear ?? null,
      weekNumber: note.weekNumber ?? null,

      curriculumUnitId: note.curriculumUnitId ?? null,
      strand: note.strand ?? null,
      substrand: note.substrand ?? null,
      contentStandard: note.contentStandard ?? null,
      indicator: note.indicator ?? null,

      lessonTitle: titleToSave || null,
      priorKnowledge: priorToSave || null,

      objectives: objectivesToSave || "",
      teachingLearningResources: tlmToSave || "",
      introduction: introToSave || "",
      lessonDevelopment: devToSave || "",
      conclusion: conclToSave || "",
      assessment: assessToSave || "",
      homework: hwToSave || "",
      differentiationNotes: diffToSave || "",
      reflectionNotes: reflToSave || "",

      status: targetStatus,
    };

    const legacyPayload = {
      lessonNoteId: note.id,
      level: note.level,
      subject: note.subject,
      priorKnowledge: priorToSave || "",

      objectives: objectivesToSave,
      teachingLearningResources: tlmToSave,
      introduction: introToSave,
      lessonDevelopment: devToSave,
      conclusion: conclToSave,
      assessment: assessToSave,
      homework: hwToSave,
      differentiationNotes: diffToSave,
      reflectionNotes: reflToSave,

      status: targetStatus,
    };

    try {
      let { res, data } = await postUpsert(fullPayload);

      if ((!res.ok || !data.ok || !data.item) && res.status === 400) {
        const retry = await postUpsert(legacyPayload);
        res = retry.res;
        data = retry.data;
      }

      if (!res.ok || !data.ok || !data.item) {
        setLoadError(
          data.error ??
            "Failed to save this lesson note. Please try again or contact the system administrator."
        );
        return;
      }

      if (data.item.tenantId !== tenantId || data.item.teacherUserId !== teacherUserId) {
        setLoadError("Access denied for this lesson note.");
        return;
      }

      setNote(data.item);
    } catch {
      setLoadError(
        "Network or server error while saving this lesson note. Please try again."
      );
    } finally {
      isSubmit ? setSubmitSaving(false) : setSaving(false);
    }
  }

  const handleSaveDraft = useCallback(() => {
    void saveWithStatus("DRAFT");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const canSubmitStatus =
    note?.status === "DRAFT" || note?.status === "REJECTED";
  const hasCurriculumSlice = Boolean(note?.curriculumUnitId && note?.indicator);
  const hasCoreLessonText =
    safeTrim(objectives).length > 0 &&
    safeTrim(development).length > 0 &&
    safeTrim(assessment).length > 0;

  const canSubmit = Boolean(
    canSubmitStatus && hasCurriculumSlice && hasCoreLessonText
  );

  /**
   * ==========================
   * AI Co-Tutor
   * ==========================
   */
  const handleRunAiSupport = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSuggestion(null);
    setAiMeta(null);
    setAiFields(null);

    try {
      const res = await fetch("/api/teachers/lesson-notes/ai-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: noteId, mode: "FULL" }),
      });

      if (res.status === 401 || res.status === 403) return handleAuthFailure();

      const data = await safeJson<AiSupportResponse>(res);

      if (!res.ok || !data.ok) {
        setAiError(
          data.error ?? "AI Co-Tutor could not generate support. Please try again."
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

    setNote((prev) =>
      prev
        ? { ...prev, lessonTitle: aiFields.lessonTitle ?? prev.lessonTitle ?? null }
        : prev
    );

    if (aiFields.objectives) setObjectives(aiFields.objectives);
    if (aiFields.teachingLearningResources)
      setTlm(aiFields.teachingLearningResources);
    if (aiFields.introduction) setIntroduction(aiFields.introduction);
    if (aiFields.lessonDevelopment) setDevelopment(aiFields.lessonDevelopment);
    if (aiFields.conclusion) setConclusion(aiFields.conclusion);
    if (aiFields.assessment) setAssessment(aiFields.assessment);
    if (aiFields.homework) setHomework(aiFields.homework);
    if (aiFields.differentiationNotes)
      setDifferentiation(aiFields.differentiationNotes);
    if (aiFields.reflectionNotes) setReflection(aiFields.reflectionNotes);
  }, [aiFields]);

  const handleOpenPrint = useCallback(() => {
    if (!note) return;
    const url = `/teacher/lesson-notes/${encodeURIComponent(note.id)}/print`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [note]);

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
            <button type="button" onClick={handleBack} className={btnGhost}>
              ← Back
            </button>
            <h1 className="text-xl md:text-2xl font-semibold">Lesson Note Studio</h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              Move from{" "}
              <span className="font-semibold">
                class &amp; learners → curriculum slice → lesson
              </span>
              .
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

        {!loading && note && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)] gap-4 md:gap-5">
            {/* LEFT */}
            <section className="space-y-4">
              {/* Step indicator */}
              <div className="border rounded-2xl bg-white p-3 md:p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2 text-[11px] md:text-xs">
                    {[1, 2, 3].map((s) => {
                      const step = s as 1 | 2 | 3;
                      const label =
                        step === 1
                          ? "Class & learners"
                          : step === 2
                          ? "NaCCA curriculum slice"
                          : "Lesson design & reflection";
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setStep(step)}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 border ${
                            activeStep === step
                              ? "bg-zinc-900 text-white border-zinc-900"
                              : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                          }`}
                        >
                          <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                            {step}
                          </span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    URL-driven steps. Default always starts at{" "}
                    <span className="font-semibold">Step 1</span>.
                  </p>
                </div>
              </div>

              {/* STEP 1 */}
              {activeStep === 1 && (
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Step 1 · Class &amp; learner snapshot
                    </h2>
                    <span className="text-[11px] text-zinc-500">
                      Short answers — sets AI tone and level.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Class / level
                      </label>
                      <input
                        type="text"
                        className={inputBase}
                        value={note.level ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNote((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev, level: value.trim() || null };
                            return prev.curriculumUnitId ? unlinkCurriculum(next) : next;
                          });
                        }}
                        placeholder="e.g. KG1, Basic 4, Basic 6, JHS 1"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        If you change level, we auto-unlink the NaCCA indicator to prevent mismatch.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        className={inputBase}
                        value={note.subject ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNote((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev, subject: value.trim() || null };
                            return prev.curriculumUnitId ? unlinkCurriculum(next) : next;
                          });
                        }}
                        placeholder="e.g. Mathematics, Computing, Our World and Our People"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Use the exact NaCCA subject name for best matching.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Learners’ level, prior knowledge, and key challenges
                    </label>
                    <textarea
                      className={textAreaBase}
                      value={learnerProfile}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLearnerProfile(value);
                        setPriorKnowledge(value);
                      }}
                      placeholder="Example: Most learners can…, but struggle with… Biggest challenge is…"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Feeds directly into{" "}
                      <span className="font-semibold">Prior knowledge</span>.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <p className="text-[11px] text-zinc-500 max-w-xs">
                      Next:{" "}
                      <span className="font-semibold">Step 2 – NaCCA curriculum slice</span>.
                    </p>
                    <button type="button" className={btnPrimary} onClick={() => setStep(2)}>
                      Continue to Step 2
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {activeStep === 2 && (
                <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Step 2 · Choose the NaCCA curriculum slice
                    </h2>
                    <span className="text-[11px] text-zinc-500">
                      Sub-strand first, then indicator.
                    </span>
                  </div>

                  {!canEditCurriculumSlice && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      This lesson note is{" "}
                      <span className="font-semibold">{note.status}</span>. Curriculum slice changes are locked.
                    </div>
                  )}

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700 space-y-1.5">
                    <p>
                      <span className="font-semibold">Filter in use (from this lesson note):</span>
                    </p>
                    <p>
                      Phase: <span className="font-semibold">{note.phase || "—"}</span> • Level:{" "}
                      <span className="font-semibold">{note.level || "—"}</span> • Subject:{" "}
                      <span className="font-semibold">{note.subject || "—"}</span>
                    </p>
                    <p>
                      Term: <span className="font-semibold">{note.term || "—"}</span> • Week:{" "}
                      <span className="font-semibold">{note.weekNumber ?? "—"}</span>
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Resolved subjectSlug:{" "}
                      <span className="font-mono">{resolvedSubjectSlug ?? "—"}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={handleLoadCurriculumUnits}
                      disabled={curriculumLoading || linkingSlice}
                    >
                      {curriculumLoading ? "Loading NaCCA units…" : "Reload NaCCA units"}
                    </button>
                    {curriculumUnits.length > 0 && (
                      <span className="text-[11px] text-zinc-500">
                        {curriculumUnits.length} unit{curriculumUnits.length === 1 ? "" : "s"} found
                      </span>
                    )}
                  </div>

                  {curriculumError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {curriculumError}
                    </div>
                  )}

                  {linkSliceError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {linkSliceError}
                    </div>
                  )}

                  {curriculumUnits.length > 0 && (
                    <>
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
                            setLinkSliceError(null);
                          }}
                          disabled={!canEditCurriculumSlice || linkingSlice}
                        >
                          <option value="">— Select sub-strand / topic —</option>
                          {uniqueSubstrands.map((ss) => (
                            <option key={ss ?? "blank"} value={ss ?? ""}>
                              {ss}
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedSubstrand && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-zinc-700">
                            Indicator for this lesson
                          </label>
                          <select
                            className={inputBase}
                            value={selectedUnitId ?? ""}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setSelectedUnitId(value);
                              setLinkSliceError(null);

                              const unit = unitsForSelectedSubstrand.find((u) => u.id === value);
                              if (!unit) return;

                              // 1) update UI immediately
                              applyCurriculumUnitToNote(unit);

                              // 2) persist immediately, then move to Step 3 only if persisted
                              void (async () => {
                                const ok = await persistCurriculumSlice(unit);
                                if (ok) setStep(3);
                              })();
                            }}
                            disabled={!canEditCurriculumSlice || linkingSlice}
                          >
                            <option value="">
                              {linkingSlice ? "Linking selection…" : "— Select indicator —"}
                            </option>
                            {unitsForSelectedSubstrand.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.indicatorCode ? `${u.indicatorCode} – ${u.indicator}` : u.indicator}
                              </option>
                            ))}
                          </select>
                          {linkingSlice && (
                            <p className="text-[11px] text-zinc-500">
                              Saving selection… this prevents Step 3 mismatches.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 space-y-1.5">
                        <p className="font-semibold">Linked curriculum slice for this lesson</p>
                        <p>
                          Strand: <span className="font-semibold">{note.strand || "—"}</span>
                        </p>
                        <p>
                          Sub-strand: <span className="font-semibold">{note.substrand || "—"}</span>
                        </p>
                        <p>
                          Content standard:{" "}
                          <span className="font-semibold">{note.contentStandard || "—"}</span>
                        </p>
                        <p>
                          Indicator: <span className="font-semibold">{note.indicator || "—"}</span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2">
                        <p className="text-[11px] text-zinc-500 max-w-xs">
                          When the <span className="font-semibold">indicator looks right</span>, continue to Step 3.
                        </p>
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => setStep(3)}
                          disabled={!note.indicator || linkingSlice}
                        >
                          Continue to Step 3
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 3 */}
              {activeStep === 3 && (
                <>
                  <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">
                          {(note.subject ?? "Subject —")} •{" "}
                          <span className="text-zinc-700">
                            {note.strand ?? "Strand —"}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 space-y-0.5">
                          {note.substrand && (
                            <div>
                              <span className="font-medium">Sub-strand:</span> {note.substrand}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Term / Year:</span>{" "}
                            {(note.term ?? "—")} • {(note.academicYear ?? "—")}
                          </div>
                          <div>
                            <span className="font-medium">Week:</span>{" "}
                            {note.weekNumber ?? "—"}
                          </div>
                          {(note.phase || note.level) && (
                            <div>
                              <span className="font-medium">Phase / Level:</span>{" "}
                              {note.phase ?? "—"} {note.level ? `• ${note.level}` : ""}
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

                  <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
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
                              prev ? { ...prev, lessonTitle: e.target.value } : prev
                            )
                          }
                          placeholder="Short, learner-friendly title"
                        />
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

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-zinc-700">
                          Objectives
                        </label>
                        <span className="text-[11px] text-zinc-500">
                          Align with indicator; observable.
                        </span>
                      </div>
                      <textarea
                        className={textAreaBase}
                        value={objectives}
                        onChange={(e) => setObjectives(e.target.value)}
                        placeholder="By the end of the lesson, learners will be able to…"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          TLM
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={tlm}
                          onChange={(e) => setTlm(e.target.value)}
                          placeholder="Real objects, charts, number cards…"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Introduction
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={introduction}
                          onChange={(e) => setIntroduction(e.target.value)}
                          placeholder="Short starter that connects to learners’ experiences."
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-zinc-700">
                          Lesson development (I do – We do – You do)
                        </label>
                        <span className="text-[11px] text-zinc-500">
                          Model → guided → independent.
                        </span>
                      </div>
                      <textarea
                        className={textAreaBase}
                        value={development}
                        onChange={(e) => setDevelopment(e.target.value)}
                        placeholder={"Step 1: …\nStep 2: …\nStep 3: …"}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Conclusion
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={conclusion}
                          onChange={(e) => setConclusion(e.target.value)}
                          placeholder="Quick recap or demonstration."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Assessment
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={assessment}
                          onChange={(e) => setAssessment(e.target.value)}
                          placeholder="Oral checks, tasks, short written work…"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Homework
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={homework}
                          onChange={(e) => setHomework(e.target.value)}
                          placeholder="Simple, realistic home task."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Differentiation
                        </label>
                        <textarea
                          className={textAreaBase}
                          value={differentiation}
                          onChange={(e) => setDifferentiation(e.target.value)}
                          placeholder="Support slower learners; stretch faster learners."
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-700">
                        Teacher reflection
                      </label>
                      <textarea
                        className={textAreaBase}
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                        placeholder="What went well? What will you change next time?"
                      />
                    </div>

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
                          title={
                            canSubmit
                              ? ""
                              : "To submit: select the NaCCA indicator (Step 2) and fill objectives, development and assessment."
                          }
                        >
                          {submitSaving ? "Submitting…" : "Submit for headteacher review"}
                        </button>

                        <button
                          type="button"
                          className={btnGhost}
                          onClick={handleOpenPrint}
                          disabled={!note?.id}
                        >
                          🖨️ Open NaCCA print view
                        </button>
                      </div>

                      <p className="text-[11px] text-zinc-500">
                        Curriculum stays NaCCA-aligned. You refine the{" "}
                        <span className="font-semibold">human side</span>.
                      </p>
                    </div>
                  </div>

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
                          <div>Reviewed at: {formatDateTimeShort(note.reviewedAt)}</div>
                        )}
                        {note.approvedAt && (
                          <div>Approved at: {formatDateTimeShort(note.approvedAt)}</div>
                        )}
                        {note.rejectedAt && (
                          <div>Returned at: {formatDateTimeShort(note.rejectedAt)}</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* RIGHT: AI Co-Tutor */}
            <aside className="space-y-4">
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">AI Co-Tutor assistant</h2>
                    <p className="text-xs text-zinc-600">
                      Draft grounded in{" "}
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
                  {aiLoading ? "Thinking with you…" : "Ask AI Co-Tutor for a lesson draft"}
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
                        AI draft
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
                  </div>
                )}

                {!aiLoading && !aiSuggestion && !aiError && (
                  <p className="text-[11px] text-zinc-500">
                    Tip: run after Step 1 + Step 2.
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
                      Applies draft text into fields; you can still edit.
                    </p>
                  </div>
                )}
              </div>

              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
                <h3 className="text-xs font-semibold text-zinc-800">Lesson meta</h3>
                <div className="space-y-0.5">
                  <div>Created: {formatDateTimeShort(note.createdAt)}</div>
                  <div>Updated: {formatDateTimeShort(note.updatedAt)}</div>
                  {note.curriculumUnitId && (
                    <div>
                      Linked unit:{" "}
                      <span className="font-mono text-[11px]">{note.curriculumUnitId}</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
