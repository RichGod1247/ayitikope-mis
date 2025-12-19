// src/app/teacher/curriculum/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type CurriculumSubjectSummary = {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string | null;
  description: string | null;
};

type CurriculumMedia = {
  id: string;
  pageNumberInPdf: number;
  figureLabel: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags: string | null;
};

type CurriculumExemplar = {
  id: string;
  title: string | null;
  description: string | null;
  assessmentNotes: string | null;
  orderIndex: number | null;
};

type CurriculumIndicator = {
  id: string;
  code: string | null;
  description: string | null;
  orderIndex: number | null;
  media?: CurriculumMedia[];
  exemplars: CurriculumExemplar[];
};

type CurriculumContentStandard = {
  id: string;
  code: string | null;
  description: string | null;
  orderIndex: number | null;
  media?: CurriculumMedia[];
  indicators: CurriculumIndicator[];
};

type CurriculumSubStrand = {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  contentStandards: CurriculumContentStandard[];
};

type CurriculumStrand = {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  subStrands: CurriculumSubStrand[];
};

type CurriculumHierarchy = {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  orderIndex: number | null;

  // Trust / provenance fields – may be null if not seeded yet
  curriculumFramework?: string | null;
  frameworkVersion?: string | null;
  countryCode?: string | null;
  sourceDocumentTitle?: string | null;
  sourceDocumentYear?: number | null;
  sourceDocumentUrl?: string | null;
  lastVerifiedAt?: string | null;

  media?: CurriculumMedia[];
  strands: CurriculumStrand[];
};

type SubjectsResponse = {
  ok: boolean;
  items?: CurriculumSubjectSummary[];
  error?: string;
};

type CurriculumResponse = {
  ok: boolean;
  item?: CurriculumHierarchy;
  error?: string;
};

type SchemesListResponse = {
  ok: boolean;
  items?: SchemeSummary[];
  error?: string;
};

type SchemeSummary = {
  id: string;
  title: string | null;
  subject: string;
  term: string;
  academicYear: string;
  classroomId: string | null;
  itemCount: number;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline =
  btnBase +
  " bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50";
const btnPrimary =
  btnBase +
  " bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700";
const inputBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";
const selectBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";

// TEMP single-tenant / single-teacher IDs until auth is wired
const DEFAULT_TENANT_ID = "single-tenant";
const DEFAULT_TEACHER_ID = "single-teacher";

export default function TeacherCurriculumExplorerPage() {
  // -----------------------------
  // 1. Load available subjects
  // -----------------------------
  const [subjects, setSubjects] = useState<CurriculumSubjectSummary[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  // Filters
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");

  // Curriculum tree
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumHierarchy | null>(null);

  // Selection inside the tree
  const [selectedStrandId, setSelectedStrandId] = useState<string | null>(null);
  const [selectedSubStrandId, setSelectedSubStrandId] =
    useState<string | null>(null);
  const [selectedIndicatorId, setSelectedIndicatorId] =
    useState<string | null>(null);

  // Schemes for "Add to Scheme" modal
  const [schemes, setSchemes] = useState<SchemeSummary[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [schemesError, setSchemesError] = useState<string | null>(null);

  const [addToSchemeOpen, setAddToSchemeOpen] = useState(false);
  const [selectedSchemeIdForAdd, setSelectedSchemeIdForAdd] =
    useState<string>("");
  const [weekNumberForAdd, setWeekNumberForAdd] = useState<string>("1");
  const [addToSchemeSaving, setAddToSchemeSaving] = useState(false);
  const [addToSchemeMessage, setAddToSchemeMessage] =
    useState<string | null>(null);

  // New scheme fields (when there are 0 schemes)
  const [newSchemeTerm, setNewSchemeTerm] = useState<string>("1st Term");
  const [newSchemeAcademicYear, setNewSchemeAcademicYear] =
    useState<string>("2025/2026");

  const newSchemeTitle = useMemo(() => {
    if (!curriculum) return "";
    return `${curriculum.name} – ${newSchemeTerm} (${newSchemeAcademicYear})`;
  }, [curriculum, newSchemeTerm, newSchemeAcademicYear]);

  // -----------------------------
  // Load subjects once
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadSubjects() {
      setSubjectsLoading(true);
      setSubjectsError(null);

      try {
        const res = await fetch("/api/curriculum/subjects");
        const data = (await res.json().catch(() => ({}))) as SubjectsResponse;

        if (!res.ok || !data.ok || !data.items) {
          if (!cancelled) {
            setSubjects([]);
            setSubjectsError(
              data.error ??
                "Failed to load curriculum subjects. Please try again."
            );
          }
          return;
        }

        if (cancelled) return;

        setSubjects(data.items);

        // Optional: preselect first subject
        if (data.items.length > 0) {
          const first = data.items[0];
          const phase = first.phase ?? "";
          const level = first.level ?? "";
          setSelectedPhase(phase);
          setSelectedLevel(level);
          setSelectedSubjectId(first.id);
        }
      } catch (err) {
        console.error("Error loading curriculum subjects", err);
        if (!cancelled) {
          setSubjectsError(
            "Network or server error while loading curriculum subjects."
          );
        }
      } finally {
        if (!cancelled) {
          setSubjectsLoading(false);
        }
      }
    }

    void loadSubjects();

    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Derived lists for dropdowns
  // -----------------------------
  const phases = useMemo(() => {
    const all = Array.from(
      new Set(
        subjects
          .map((s) => s.phase || "")
          .filter((p) => p.trim().length > 0)
      )
    );
    return all.sort();
  }, [subjects]);

  const levelsForPhase = useMemo(() => {
    if (!selectedPhase) return [];
    const all = Array.from(
      new Set(
        subjects
          .filter((s) => (s.phase || "") === selectedPhase)
          .map((s) => s.level || "")
          .filter((l) => l.trim().length > 0)
      )
    );
    return all.sort();
  }, [subjects, selectedPhase]);

  const subjectsForPhaseAndLevel = useMemo(() => {
    if (!selectedPhase || !selectedLevel) return [];
    return subjects.filter(
      (s) =>
        (s.phase || "") === selectedPhase &&
        (s.level || "") === selectedLevel
    );
  }, [subjects, selectedPhase, selectedLevel]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId]
  );

  // -----------------------------
  // Load curriculum tree
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadCurriculum() {
      if (!selectedSubject || !selectedPhase || !selectedLevel) {
        setCurriculum(null);
        setCurriculumError(null);
        return;
      }

      setCurriculumLoading(true);
      setCurriculumError(null);
      setCurriculum(null);
      setSelectedStrandId(null);
      setSelectedSubStrandId(null);
      setSelectedIndicatorId(null);
      setSchemes([]);
      setSchemesError(null);

      try {
        const params = new URLSearchParams();

        if (selectedPhase) params.set("phase", selectedPhase);
        if (selectedLevel) params.set("level", selectedLevel);

        if (selectedSubject.slug) {
          params.set("subjectSlug", selectedSubject.slug);
        } else {
          params.set("subject", selectedSubject.name);
        }

        const res = await fetch(`/api/curriculum?${params.toString()}`);
        const data = (await res.json().catch(() => ({}))) as CurriculumResponse;

        if (!res.ok || !data.ok || !data.item) {
          if (!cancelled) {
            setCurriculum(null);
            setCurriculumError(
              data.error ??
                "Failed to load curriculum hierarchy. Please try again."
            );
          }
          return;
        }

        if (cancelled) return;

        setCurriculum(data.item);

        // Auto-select first strand/substrand/indicator for convenience
        if (data.item.strands && data.item.strands.length > 0) {
          const firstStrand = data.item.strands[0];
          setSelectedStrandId(firstStrand.id);

          if (firstStrand.subStrands && firstStrand.subStrands.length > 0) {
            const firstSub = firstStrand.subStrands[0];
            setSelectedSubStrandId(firstSub.id);

            if (
              firstSub.contentStandards &&
              firstSub.contentStandards.length > 0 &&
              firstSub.contentStandards[0].indicators &&
              firstSub.contentStandards[0].indicators.length > 0
            ) {
              setSelectedIndicatorId(
                firstSub.contentStandards[0].indicators[0].id
              );
            }
          }
        }
      } catch (err) {
        console.error("Error loading curriculum hierarchy", err);
        if (!cancelled) {
          setCurriculum(null);
          setCurriculumError(
            "Network or server error while loading curriculum hierarchy."
          );
        }
      } finally {
        if (!cancelled) {
          setCurriculumLoading(false);
        }
      }
    }

    void loadCurriculum();

    return () => {
      cancelled = true;
    };
  }, [selectedSubject, selectedPhase, selectedLevel]);

  // -----------------------------
  // Helpers to find selected pieces
  // -----------------------------
  const selectedStrand = useMemo(() => {
    if (!curriculum || !selectedStrandId) return null;
    return curriculum.strands.find((st) => st.id === selectedStrandId) ?? null;
  }, [curriculum, selectedStrandId]);

  const selectedSubStrand = useMemo(() => {
    if (!selectedStrand || !selectedSubStrandId) return null;
    return (
      selectedStrand.subStrands.find((ss) => ss.id === selectedSubStrandId) ??
      null
    );
  }, [selectedStrand, selectedSubStrandId]);

  const selectedIndicator = useMemo(() => {
    if (!selectedSubStrand || !selectedIndicatorId) return null;

    for (const cs of selectedSubStrand.contentStandards) {
      const indicator = cs.indicators.find(
        (ind) => ind.id === selectedIndicatorId
      );
      if (indicator) return indicator;
    }

    return null;
  }, [selectedSubStrand, selectedIndicatorId]);

  const contentStandardForSelectedIndicator = useMemo(() => {
    if (!selectedSubStrand || !selectedIndicator) return null;

    for (const cs of selectedSubStrand.contentStandards) {
      const match = cs.indicators.find(
        (ind) => ind.id === selectedIndicator.id
      );
      if (match) {
        return cs;
      }
    }
    return null;
  }, [selectedSubStrand, selectedIndicator]);

  const pageRangeForSelectedIndicator = useMemo(() => {
    if (!selectedIndicator) return null;

    const pages: number[] = [];

    if (selectedIndicator.media && selectedIndicator.media.length) {
      for (const m of selectedIndicator.media) {
        if (
          typeof m.pageNumberInPdf === "number" &&
          !Number.isNaN(m.pageNumberInPdf)
        ) {
          pages.push(m.pageNumberInPdf);
        }
      }
    }

    if (
      contentStandardForSelectedIndicator &&
      contentStandardForSelectedIndicator.media &&
      contentStandardForSelectedIndicator.media.length
    ) {
      for (const m of contentStandardForSelectedIndicator.media) {
        if (
          typeof m.pageNumberInPdf === "number" &&
          !Number.isNaN(m.pageNumberInPdf)
        ) {
          pages.push(m.pageNumberInPdf);
        }
      }
    }

    if (pages.length === 0) return null;

    const min = Math.min(...pages);
    const max = Math.max(...pages);

    return { from: min, to: max };
  }, [selectedIndicator, contentStandardForSelectedIndicator]);

  const hasCurriculum = !!curriculum;

  // -----------------------------
  // Load schemes for the subject (for Add to Scheme modal)
  // Uses subject-only GET branch: /api/schemes?subject=...
  // -----------------------------
  async function loadSchemesForSubject() {
    if (!curriculum) return;
    setSchemesLoading(true);
    setSchemesError(null);

    try {
      const params = new URLSearchParams();
      params.set("subject", curriculum.name);

      const res = await fetch(`/api/schemes?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as SchemesListResponse;

      if (!res.ok || !data.ok || !data.items) {
        setSchemes([]);
        setSchemesError(
          data.error ?? "Failed to load schemes of work for this subject."
        );
        return;
      }

      setSchemes(data.items);
      if (data.items.length > 0) {
        setSelectedSchemeIdForAdd(data.items[0].id);
      }
    } catch (err) {
      console.error("Error loading schemes", err);
      setSchemesError(
        "Network or server error while loading schemes of work."
      );
    } finally {
      setSchemesLoading(false);
    }
  }

  async function handleOpenAddToScheme() {
    setAddToSchemeMessage(null);
    // Try to load schemes once (for "add to existing" support)
    if (!schemes.length && !schemesLoading) {
      await loadSchemesForSubject();
    }
    setAddToSchemeOpen(true);
  }

  async function handleAddIndicatorToScheme() {
    if (!selectedIndicator || !curriculum) return;

    setAddToSchemeMessage(null);

    const week = Number.parseInt(weekNumberForAdd, 10);
    if (!Number.isFinite(week) || week <= 0) {
      setAddToSchemeMessage(
        "Please enter a valid week number (1, 2, 3…)."
      );
      return;
    }

    const strandTitle = selectedStrand?.title ?? "Strand";
    const subStrandTitle = selectedSubStrand?.title ?? "Sub-strand";
    const csDesc = contentStandardForSelectedIndicator?.description ?? "";
    const csCode = contentStandardForSelectedIndicator?.code ?? null;
    const indicatorDescription = selectedIndicator.description ?? "";

    const isCreatingNewScheme = schemes.length === 0;

    if (!isCreatingNewScheme && !selectedSchemeIdForAdd) {
      setAddToSchemeMessage("Please choose a scheme of work.");
      return;
    }

    // Build indicator slice as expected by /api/schemes POST
    const indicatorSlice = {
      indicatorId: selectedIndicator.id,
      indicatorCode: selectedIndicator.code,
      indicatorDescription,
      strandTitle,
      subStrandTitle,
      contentStandardCode: csCode,
      contentStandardDescription: csDesc,
    };

    // Decide payload:
    // - if no schemes yet: create a new scheme + first item
    // - if schemes exist: reuse existing schemeId
    let subject = curriculum.name;
    let term = newSchemeTerm;
    let academicYear = newSchemeAcademicYear;
    let title = newSchemeTitle;
    let schemeId: string | undefined = undefined;

    if (!isCreatingNewScheme) {
      const s = schemes.find((x) => x.id === selectedSchemeIdForAdd);
      if (!s) {
        setAddToSchemeMessage(
          "Selected scheme could not be found. Please try again."
        );
        return;
      }
      subject = s.subject;
      term = s.term;
      academicYear = s.academicYear;
      title =
        s.title ?? `${s.subject} – ${s.term} (${s.academicYear})`;
      schemeId = s.id;
    }

    setAddToSchemeSaving(true);

    try {
      const res = await fetch("/api/schemes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: DEFAULT_TENANT_ID,
          teacherUserId: DEFAULT_TEACHER_ID,
          classroomId: null,
          subject,
          term,
          academicYear,
          title,
          notes: null, // accepted by API but ignored in DB (no notes column)
          weekNumber: week,
          indicatorSlice,
          schemeId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setAddToSchemeMessage(
          data.error ??
            "Failed to add indicator to scheme. Please try again."
        );
        return;
      }

      setAddToSchemeMessage(
        isCreatingNewScheme
          ? "Created new scheme and added indicator successfully."
          : "Added indicator to existing scheme successfully."
      );
    } catch (err) {
      console.error("Error adding to scheme", err);
      setAddToSchemeMessage(
        "Network or server error while adding to scheme."
      );
    } finally {
      setAddToSchemeSaving(false);
    }
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
                className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}
              >
                EduLife OS · Curriculum Explorer
              </span>
              <span className="text-[11px] text-zinc-500">
                NaCCA KG–JHS curriculum · read-only, trusted source
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              Teacher Curriculum Explorer
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              Choose a{" "}
              <span className="font-semibold">phase, level</span> and{" "}
              <span className="font-semibold">subject</span>. EduLife OS will
              load the official NaCCA structure for that subject: strands,
              sub-strands, content standards, indicators and exemplars.
            </p>
          </div>

          <div className="text-[11px] text-zinc-500 max-w-xs md:text-right">
            <p>
              This page is the{" "}
              <span className="font-semibold">single source of truth</span> for
              your curriculum tree. Lesson notes and Scheme of Work tools all
              read from here.
            </p>
          </div>
        </header>

        {/* Subjects error */}
        {subjectsError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {subjectsError}
          </div>
        )}

        {/* Main layout */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)] gap-4 md:gap-6">
          {/* LEFT: Filters + curriculum tree */}
          <div className="space-y-4">
            {/* Filter card */}
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  1 · Choose phase, level &amp; subject
                </h2>
                {subjectsLoading && (
                  <span className="text-[11px] text-zinc-500">
                    Loading subjects…
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Phase */}
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Phase
                  </label>
                  <select
                    className={selectBase}
                    value={selectedPhase}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedPhase(value);
                      setSelectedLevel("");
                      setSelectedSubjectId("");
                      setCurriculum(null);
                    }}
                  >
                    <option value="">— Select phase —</option>
                    {phases.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Examples: KG, Lower Primary, Upper Primary, JHS…
                  </p>
                </div>

                {/* Level */}
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Level / Class
                  </label>
                  <select
                    className={selectBase}
                    value={selectedLevel}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedLevel(value);
                      setSelectedSubjectId("");
                      setCurriculum(null);
                    }}
                    disabled={!selectedPhase}
                  >
                    <option value="">— Select level —</option>
                    {levelsForPhase.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Examples: KG1, KG2, B1, B2, B3, JHS1…
                  </p>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Subject
                  </label>
                  <select
                    className={selectBase}
                    value={selectedSubjectId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedSubjectId(value);
                      setCurriculum(null);
                    }}
                    disabled={!selectedPhase || !selectedLevel}
                  >
                    <option value="">— Select subject —</option>
                    {subjectsForPhaseAndLevel.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Real subjects from your seeded NaCCA data only.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-zinc-500 max-w-sm">
                  As soon as you pick a subject, EduLife OS will automatically
                  load the{" "}
                  <span className="font-semibold">full curriculum tree</span> for
                  that phase/level/subject.
                </p>
                <div className="text-[11px] text-zinc-500">
                  Status:{" "}
                  {curriculumLoading
                    ? "Loading curriculum…"
                    : hasCurriculum
                    ? "Curriculum loaded"
                    : "No curriculum loaded yet"}
                </div>
              </div>
            </div>

            {/* Curriculum error */}
            {curriculumError && (
              <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
                {curriculumError}
              </div>
            )}

            {/* Curriculum tree */}
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  2 · Curriculum tree (NaCCA)
                </h2>
                {curriculumLoading && (
                  <span className="text-[11px] text-zinc-500">
                    Loading…
                  </span>
                )}
              </div>

              {!curriculumLoading && !hasCurriculum && (
                <p className="text-xs text-zinc-500">
                  Select a phase, level and subject above to see the official
                  NaCCA strands, sub-strands, content standards and indicators
                  here.
                </p>
              )}

              {hasCurriculum && curriculum && (
                <div className="space-y-3">
                  {/* Subject summary */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700 space-y-0.5">
                    <p className="font-semibold text-[12px]">
                      {curriculum.name}
                    </p>
                    <p>
                      Phase:{" "}
                      <span className="font-semibold">
                        {curriculum.phase ?? "—"}
                      </span>{" "}
                      • Level:{" "}
                      <span className="font-semibold">
                        {curriculum.level ?? "—"}
                      </span>
                    </p>
                    {curriculum.description && (
                      <p className="text-[10px] text-zinc-500">
                        {curriculum.description}
                      </p>
                    )}
                  </div>

                  {/* Strands / Sub-strands / Indicators list */}
                  <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                    {curriculum.strands.map((strand) => {
                      const isStrandSelected =
                        strand.id === selectedStrandId;
                      return (
                        <div
                          key={strand.id}
                          className="border border-zinc-200 rounded-xl"
                        >
                          <button
                            type="button"
                            className={`w-full flex items-start justify-between gap-2 px-3 py-2 text-left ${
                              isStrandSelected
                                ? "bg-zinc-900 text-white"
                                : "bg-white text-zinc-900 hover:bg-zinc-50"
                            }`}
                            onClick={() => {
                              setSelectedStrandId(strand.id);
                              setSelectedSubStrandId(null);
                              setSelectedIndicatorId(null);
                            }}
                          >
                            <div className="space-y-0.5">
                              <div className="text-[12px] font-semibold">
                                {strand.code ? `${strand.code} · ` : ""}
                                {strand.title || "Strand"}
                              </div>
                              {strand.description && (
                                <div className="text-[11px] opacity-80 line-clamp-2">
                                  {strand.description}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] opacity-70">
                              {strand.subStrands.length} sub-strand
                              {strand.subStrands.length === 1 ? "" : "s"}
                            </span>
                          </button>

                          {/* Sub-strands */}
                          {isStrandSelected &&
                            strand.subStrands.length > 0 && (
                              <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 space-y-1.5">
                                {strand.subStrands.map((sub) => {
                                  const isSubSelected =
                                    sub.id === selectedSubStrandId;
                                  return (
                                    <div
                                      key={sub.id}
                                      className="border border-zinc-200 rounded-lg bg-white"
                                    >
                                      <button
                                        type="button"
                                        className={`w-full flex items-start justify-between gap-2 px-2.5 py-1.5 text-left ${
                                          isSubSelected
                                            ? "bg-zinc-900 text-white"
                                            : "bg-white text-zinc-900 hover:bg-zinc-50"
                                        }`}
                                        onClick={() => {
                                          setSelectedSubStrandId(sub.id);
                                          setSelectedIndicatorId(null);
                                        }}
                                      >
                                        <div className="space-y-0.5">
                                          <div className="text-[11px] font-medium">
                                            {sub.code
                                              ? `${sub.code} · `
                                              : ""}
                                            {sub.title || "Sub-strand"}
                                          </div>
                                          {sub.description && (
                                            <div className="text-[10px] opacity-80 line-clamp-2">
                                              {sub.description}
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-[10px] opacity-70">
                                          {sub.contentStandards.length} standard
                                          {sub.contentStandards.length === 1
                                            ? ""
                                            : "s"}
                                        </span>
                                      </button>

                                      {/* Content standards + indicators */}
                                      {isSubSelected &&
                                        sub.contentStandards.length > 0 && (
                                          <div className="border-t border-zinc-200 bg-zinc-50 px-2.5 py-1.5 space-y-1.5">
                                            {sub.contentStandards.map((cs) => (
                                              <div
                                                key={cs.id}
                                                className="border border-zinc-200 rounded-md bg-white px-2 py-1.5 space-y-1"
                                              >
                                                <div className="text-[10px] font-semibold text-zinc-800">
                                                  {cs.code
                                                    ? `${cs.code} · `
                                                    : ""}
                                                  {cs.description ||
                                                    "Content standard"}
                                                </div>
                                                {cs.indicators.length > 0 && (
                                                  <div className="space-y-0.5">
                                                    {cs.indicators.map(
                                                      (ind) => {
                                                        const isIndSelected =
                                                          ind.id ===
                                                          selectedIndicatorId;
                                                        return (
                                                          <button
                                                            key={ind.id}
                                                            type="button"
                                                            className={`w-full text-left text-[10px] px-2 py-1 rounded-md border ${
                                                              isIndSelected
                                                                ? "bg-emerald-600 text-white border-emerald-700"
                                                                : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                                                            }`}
                                                            onClick={() =>
                                                              setSelectedIndicatorId(
                                                                ind.id
                                                              )
                                                            }
                                                          >
                                                            <span className="font-semibold">
                                                              {ind.code
                                                                ? `${ind.code} · `
                                                                : ""}
                                                            </span>
                                                            {ind.description ||
                                                              "Indicator"}
                                                          </button>
                                                        );
                                                      }
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Indicator / content standard / trust / actions */}
          <aside className="space-y-4">
            {/* Indicator details + Add to Scheme */}
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  3 · Focus indicator &amp; details
                </h2>
                {selectedIndicator && (
                  <button
                    type="button"
                    className={btnPrimary + " text-[11px] h-8"}
                    onClick={handleOpenAddToScheme}
                  >
                    Add to Scheme of Work
                  </button>
                )}
              </div>

              {!selectedIndicator && (
                <p className="text-xs text-zinc-500">
                  Click on any <span className="font-semibold">indicator</span>{" "}
                  on the left to see its full text, related content standard and
                  exemplars here. This is what will later feed into Scheme of
                  Work and Lesson Notes.
                </p>
              )}

              {selectedIndicator && selectedSubStrand && (
                <div className="space-y-3 text-xs text-zinc-700">
                  {/* Indicator core */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      Indicator
                    </div>
                    <p className="text-[13px] font-semibold">
                      {selectedIndicator.code && (
                        <span>{selectedIndicator.code} · </span>
                      )}
                      {selectedIndicator.description}
                    </p>
                  </div>

                  {/* Content standard */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      Content standard
                    </div>
                    <p>
                      {(() => {
                        if (!contentStandardForSelectedIndicator)
                          return "Content standard not located for this indicator.";
                        const cs = contentStandardForSelectedIndicator;
                        return cs.code
                          ? `${cs.code} · ${cs.description}`
                          : cs.description ||
                              "Content standard text not available.";
                      })()}
                    </p>
                  </div>

                  {/* Strand / Sub-strand info */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      Strand &amp; Sub-strand
                    </div>
                    <p>
                      {selectedStrand && (
                        <span>
                          <span className="font-semibold">
                            {selectedStrand.code
                              ? `${selectedStrand.code} · `
                              : ""}
                            {selectedStrand.title}
                          </span>
                          {" · "}
                        </span>
                      )}
                      <span className="font-semibold">
                        {selectedSubStrand.code
                          ? `${selectedSubStrand.code} · `
                          : ""}
                        {selectedSubStrand.title}
                      </span>
                    </p>
                  </div>

                  {/* Exemplars */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      Exemplars (from curriculum)
                    </div>
                    {selectedIndicator.exemplars.length === 0 && (
                      <p className="text-[11px] text-zinc-500">
                        No exemplars were attached to this indicator in the seed
                        data yet.
                      </p>
                    )}
                    {selectedIndicator.exemplars.length > 0 && (
                      <ul className="space-y-1.5">
                        {selectedIndicator.exemplars.map((ex) => (
                          <li
                            key={ex.id}
                            className="border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-zinc-50"
                          >
                            {ex.title && (
                              <p className="font-semibold mb-0.5">
                                {ex.title}
                              </p>
                            )}
                            {ex.description && (
                              <p className="text-[11px]">
                                {ex.description}
                              </p>
                            )}
                            {ex.assessmentNotes && (
                              <p className="text-[10px] text-zinc-500 mt-0.5">
                                Assessment notes: {ex.assessmentNotes}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Next actions note */}
                  <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-[11px] text-zinc-600">
                    <p>
                      Use{" "}
                      <span className="font-semibold">
                        “Add to Scheme of Work”
                      </span>{" "}
                      to attach this indicator to a weekly Scheme for your
                      class. From the Scheme screen, you will be able to
                      generate your NaCCA-aligned lesson note.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Trust info card */}
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
              <h3 className="text-xs font-semibold text-zinc-800">
                Curriculum Trust &amp; Source
              </h3>

              {!curriculum && (
                <p className="text-[11px] text-zinc-500">
                  Select a subject on the left to see framework and source
                  information.
                </p>
              )}

              {curriculum && (
                <>
                  <p className="text-[11px]">
                    Framework:{" "}
                    <span className="font-semibold">
                      {curriculum.curriculumFramework ??
                        "NaCCA Curriculum (default)"}
                    </span>
                    {curriculum.frameworkVersion && (
                      <>
                        {" "}
                        · Version {curriculum.frameworkVersion}
                      </>
                    )}
                  </p>
                  <p className="text-[11px]">
                    Country:{" "}
                    <span className="font-semibold">
                      {curriculum.countryCode ?? "GH"}
                    </span>{" "}
                    · Subject:{" "}
                    <span className="font-semibold">
                      {curriculum.name}
                    </span>{" "}
                    · Phase/Level:{" "}
                    <span className="font-semibold">
                      {curriculum.phase ?? "—"} / {curriculum.level ?? "—"}
                    </span>
                  </p>
                  <p className="text-[11px]">
                    Source document:{" "}
                    <span className="font-semibold">
                      {curriculum.sourceDocumentTitle ??
                        "Official NaCCA PDF"}
                    </span>
                    {curriculum.sourceDocumentYear && (
                      <> ({curriculum.sourceDocumentYear})</>
                    )}
                  </p>
                  {selectedIndicator && (
                    <p className="text-[11px]">
                      Current focus:{" "}
                      <span className="font-semibold">
                        Indicator {selectedIndicator.code ?? "—"}
                      </span>
                      {pageRangeForSelectedIndicator ? (
                        <>
                          {" "}
                          · Pages in PDF:{" "}
                          <span className="font-semibold">
                            {pageRangeForSelectedIndicator.from ===
                            pageRangeForSelectedIndicator.to
                              ? `p. ${pageRangeForSelectedIndicator.from}`
                              : `pp. ${pageRangeForSelectedIndicator.from}–${pageRangeForSelectedIndicator.to}`}
                          </span>
                        </>
                      ) : (
                        <>
                          {" "}
                          · PDF page mapping for this indicator will be
                          refined as seeding improves.
                        </>
                      )}
                    </p>
                  )}
                  {curriculum.lastVerifiedAt && (
                    <p className="text-[10px] text-zinc-500">
                      Last verified:{" "}
                      {new Date(
                        curriculum.lastVerifiedAt
                      ).toLocaleDateString()}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Tiny meta card */}
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
              <h3 className="text-xs font-semibold text-zinc-800">
                How this connects to Lesson Notes
              </h3>
              <p>
                For now this page is{" "}
                <span className="font-semibold">read-only</span> for
                curriculum editing, but{" "}
                <span className="font-semibold">very active</span> for:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  Attaching indicators to weekly{" "}
                  <span className="font-semibold">Schemes of Work</span>.
                </li>
                <li>
                  Generating NaCCA-aligned{" "}
                  <span className="font-semibold">Lesson Notes</span> from
                  those schemes.
                </li>
              </ul>
              <p>
                Because everything flows from this one curriculum tree, your
                teachers, schemes and lesson notes will all stay aligned to the
                same trusted NaCCA source.
              </p>
            </div>
          </aside>
        </section>
      </div>

      {/* Add to Scheme of Work modal */}
      {addToSchemeOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-lg p-4 md:p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Add indicator to Scheme of Work
                </h2>
                <p className="text-[11px] text-zinc-600">
                  Attach this NaCCA indicator to a weekly Scheme of Work
                  for your class. EduLife OS will use this to generate
                  lesson notes later.
                </p>
              </div>
              <button
                type="button"
                className="text-[11px] text-zinc-500 hover:text-zinc-800"
                onClick={() => setAddToSchemeOpen(false)}
              >
                ✕
              </button>
            </div>

            {schemesLoading && (
              <p className="text-[11px] text-zinc-500">
                Checking for existing schemes for this subject…
              </p>
            )}

            {schemesError && (
              <p className="text-[11px] text-red-600">{schemesError}</p>
            )}

            {!schemesLoading && !schemesError && (
              <>
                {schemes.length === 0 ? (
                  // No schemes yet: create a new one directly
                  <div className="space-y-3">
                    <p className="text-[11px] text-zinc-500">
                      You don&apos;t have any Scheme of Work yet for this
                      subject. We&apos;ll create one now and attach this
                      indicator as the first week.
                    </p>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Subject
                        </label>
                        <div className="text-[11px] text-zinc-700 border border-zinc-200 rounded-xl px-2 py-1.5 bg-zinc-50">
                          {curriculum?.name ?? "—"}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                            Term
                          </label>
                          <select
                            className={selectBase}
                            value={newSchemeTerm}
                            onChange={(e) =>
                              setNewSchemeTerm(e.target.value)
                            }
                          >
                            <option value="1st Term">1st Term</option>
                            <option value="2nd Term">2nd Term</option>
                            <option value="3rd Term">3rd Term</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                            Academic year
                          </label>
                          <input
                            className={inputBase}
                            value={newSchemeAcademicYear}
                            onChange={(e) =>
                              setNewSchemeAcademicYear(e.target.value)
                            }
                            placeholder="2025/2026"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Week number
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={inputBase}
                          value={weekNumberForAdd}
                          onChange={(e) =>
                            setWeekNumberForAdd(e.target.value)
                          }
                        />
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Example: 1 for Week 1, 2 for Week 2, etc.
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Auto-generated scheme title
                        </label>
                        <div className="text-[11px] text-zinc-700 border border-zinc-200 rounded-xl px-2 py-1.5 bg-zinc-50">
                          {newSchemeTitle || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Add to existing schemes
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500">
                      Choose an existing scheme and week number to attach
                      this indicator.
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                        Scheme of Work
                      </label>
                      <select
                        className={selectBase}
                        value={selectedSchemeIdForAdd}
                        onChange={(e) =>
                          setSelectedSchemeIdForAdd(e.target.value)
                        }
                      >
                        {schemes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.title ?? s.subject) +
                              " · " +
                              s.term +
                              " " +
                              s.academicYear}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                        Week number
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={inputBase}
                        value={weekNumberForAdd}
                        onChange={(e) =>
                          setWeekNumberForAdd(e.target.value)
                        }
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Example: 1 for Week 1, 2 for Week 2, etc.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {addToSchemeMessage && (
              <p className="text-[11px] text-emerald-700">
                {addToSchemeMessage}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className={btnOutline + " h-8 text-[11px]"}
                onClick={() => setAddToSchemeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary + " h-8 text-[11px]"}
                disabled={addToSchemeSaving || schemesLoading}
                onClick={handleAddIndicatorToScheme}
              >
                {addToSchemeSaving
                  ? "Saving…"
                  : schemes.length === 0
                  ? "Create Scheme & Add"
                  : "Add to Scheme"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
