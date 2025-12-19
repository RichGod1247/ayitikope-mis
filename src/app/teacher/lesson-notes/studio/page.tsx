// src/app/teacher/lesson-notes/studio/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CurriculumUnitDto } from "@/types/curriculum";

type IndicatorSlicePayload = {
  indicatorId: string;
  curriculumUnitId?: string | null;

  strandCode?: string | null;
  strandTitle?: string | null;

  subStrandCode?: string | null;
  subStrandTitle?: string | null;

  contentStandardCode?: string | null;
  contentStandardDescription?: string | null;

  indicatorCode?: string | null;
  indicatorDescription?: string | null;
};

type LessonNoteFromApi = {
  id: string;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;
  strand: string | null;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  aiPlanJson?: any;
};

type GenerateResponse = {
  ok: boolean;
  note?: LessonNoteFromApi;
  error?: string;
};

type GeneratedPlan = {
  introduction: string;
  development: string;
  assessment: string;
  differentiation: string;
  reflection: string;
  meta?: unknown;
};

type LoadUnitsOptions = {
  phase?: string;
  level?: string;
  term?: string;
  weekNumber?: number;
  subjectSlug?: string;
  indicatorCode?: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  btnBase +
  " bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700";
const btnOutline =
  btnBase +
  " bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50";
const inputBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";
const selectBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";

export default function LessonNoteStudioPage() {
  const searchParams = useSearchParams();

  // 🔑 Tenant / teacher context (for now we use demo IDs with URL overrides)
  const tenantIdFromUrl = searchParams.get("tenantId");
  const teacherUserIdFromUrl = searchParams.get("teacherUserId");
  const classroomIdFromUrl = searchParams.get("classroomId");

  const tenantId =
    tenantIdFromUrl && tenantIdFromUrl.trim().length > 0
      ? tenantIdFromUrl.trim()
      : "cmhhnghn00008vcpgp3fl07fl";

  const teacherUserId =
    teacherUserIdFromUrl && teacherUserIdFromUrl.trim().length > 0
      ? teacherUserIdFromUrl.trim()
      : "cmhhnguk5000ivcpgmjj3nxn4";

  // -----------------------------
  // Filters for curriculum units
  // -----------------------------
  const [phase, setPhase] = useState("KG");
  const [level, setLevel] = useState("KG1");
  const [term, setTerm] = useState("1st Term");
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [subjectSlug, setSubjectSlug] = useState(
    "kg1-our-world-and-our-people"
  );

  const [units, setUnits] = useState<CurriculumUnitDto[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    null
  );

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? null,
    [units, selectedUnitId]
  );

  // -----------------------------
  // Generated lesson note plan
  // -----------------------------
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // -----------------------------
  // Load curriculum units
  // -----------------------------
  async function loadUnits(options?: LoadUnitsOptions) {
    setUnitsLoading(true);
    setUnitsError(null);
    setUnits([]);
    setSelectedUnitId(null);
    setPlan(null);
    setPlanError(null);

    // Use overrides if provided; else fall back to current state
    const effectivePhase = options?.phase ?? phase;
    const effectiveLevel = options?.level ?? level;
    const effectiveTerm = options?.term ?? term;
    const effectiveWeekNumber = options?.weekNumber ?? weekNumber;
    const effectiveSubjectSlug = options?.subjectSlug ?? subjectSlug;
    const indicatorCode = options?.indicatorCode;

    try {
      const params = new URLSearchParams();
      if (effectiveSubjectSlug.trim()) {
        params.set("subjectSlug", effectiveSubjectSlug.trim());
      }
      if (effectivePhase.trim()) {
        params.set("phase", effectivePhase.trim());
      }
      if (effectiveLevel.trim()) {
        params.set("level", effectiveLevel.trim());
      }
      if (effectiveTerm.trim()) {
        params.set("term", effectiveTerm.trim());
      }
      if (effectiveWeekNumber > 0) {
        params.set("weekNumber", String(effectiveWeekNumber));
      }

      const res = await fetch(
        `/api/curriculum/units?${params.toString()}`
      );
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data.ok) {
        setUnitsError(
          data.error ??
            "Failed to load curriculum units. Please check your seed data and try again."
        );
        setUnits([]);
        return;
      }

      const items = (data.items ?? []) as CurriculumUnitDto[];
      setUnits(items);

      if (items.length > 0) {
        let initial = items[0];

        if (indicatorCode) {
          const match = items.find(
            (u) => u.indicatorCode === indicatorCode
          );
          if (match) {
            initial = match;
          }
        }

        setSelectedUnitId(initial.id);
      }
    } catch (err) {
      console.error("LOAD_UNITS_ERROR", err);
      setUnitsError(
        "Network or server error while loading curriculum units."
      );
    } finally {
      setUnitsLoading(false);
    }
  }

  // Initialise from URL (phase, level, term, weekNumber, subjectSlug, indicatorCode)
  useEffect(() => {
    const phaseFromUrl = searchParams.get("phase");
    const levelFromUrl = searchParams.get("level");
    const termFromUrl = searchParams.get("term");
    const weekFromUrl = searchParams.get("weekNumber");
    const subjectSlugFromUrl = searchParams.get("subjectSlug");
    const indicatorCodeFromUrl = searchParams.get("indicatorCode");

    if (phaseFromUrl) setPhase(phaseFromUrl);
    if (levelFromUrl) setLevel(levelFromUrl);
    if (termFromUrl) setTerm(termFromUrl);

    let weekOverride: number | undefined;
    if (weekFromUrl) {
      const parsed = Number.parseInt(weekFromUrl, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setWeekNumber(parsed);
        weekOverride = parsed;
      }
    }

    if (subjectSlugFromUrl) setSubjectSlug(subjectSlugFromUrl);

    void loadUnits({
      phase: phaseFromUrl ?? undefined,
      level: levelFromUrl ?? undefined,
      term: termFromUrl ?? undefined,
      weekNumber: weekOverride,
      subjectSlug: subjectSlugFromUrl ?? undefined,
      indicatorCode: indicatorCodeFromUrl ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 🔁 Sync phase/level labels with actual curriculum items (fixes "KG" vs "JHS 1")
  useEffect(() => {
    if (units.length === 0) return;
    const first = units[0] as any;

    if (
      first.phase &&
      typeof first.phase === "string" &&
      first.phase !== phase
    ) {
      setPhase(first.phase);
    }

    if (
      first.level &&
      typeof first.level === "string" &&
      first.level !== level
    ) {
      setLevel(first.level);
    }
  }, [units, phase, level]);

  // -----------------------------
  // Generate NaCCA lesson note plan
  // -----------------------------
  async function handleGeneratePlan() {
    if (!selectedUnit) return;

    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);

    try {
      const subjectFromUrl = searchParams.get("subject");
      const academicYearFromUrl =
        searchParams.get("academicYear") || "2025/2026";

      const slicePhase =
        (selectedUnit.phase && selectedUnit.phase.trim()) ||
        (phase && phase.trim()) ||
        "Unknown phase";

      const sliceLevel =
        (selectedUnit.level && selectedUnit.level.trim()) ||
        (level && level.trim()) ||
        "Unknown level";

      const sliceSubject =
        (selectedUnit.subject &&
          selectedUnit.subject.trim()) ||
        (subjectFromUrl && subjectFromUrl.trim()) ||
        "Unknown subject";

      const sliceTerm =
        selectedUnit.term || term || "1st Term";

      const sliceWeekNumber =
  selectedUnit.weekNumber ?? (weekNumber || 1);


      const indicatorId = (selectedUnit as any).id;
      if (!indicatorId) {
        setPlanError(
          "Could not determine indicatorId for this curriculum unit."
        );
        setPlan(null);
        setPlanLoading(false);
        return;
      }

      const slice: IndicatorSlicePayload = {
        indicatorId,
        curriculumUnitId: null,

        strandCode: selectedUnit.strandCode ?? null,
        strandTitle: selectedUnit.strand,

        subStrandCode: selectedUnit.substrandCode ?? null,
        subStrandTitle: selectedUnit.substrand ?? null,

        contentStandardCode:
          selectedUnit.contentStandardCode ?? null,
        contentStandardDescription:
          selectedUnit.contentStandard ?? null,

        indicatorCode: selectedUnit.indicatorCode ?? null,
        indicatorDescription: selectedUnit.indicator ?? null,
      };

      const body = {
        tenantId,
        teacherUserId,
        classroomId: classroomIdFromUrl ?? null,

        phase: slicePhase,
        level: sliceLevel,
        subject: sliceSubject,
        term: sliceTerm,
        academicYear: academicYearFromUrl,
        weekNumber: sliceWeekNumber,
        lessonDate: null,

        slice,
      };

      const res = await fetch(
        "/api/teachers/lesson-notes/generate-from-curriculum",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = (await res.json().catch(
        () => ({}) as any
      )) as GenerateResponse;

      if (!res.ok || !data.ok || !data.note) {
        setPlanError(
          data.error ??
            "Failed to generate lesson note draft. Please try again."
        );
        setPlan(null);
        return;
      }

      const note = data.note;
      const indicatorText =
        note.indicator ||
        (selectedUnit.indicatorCode
          ? `${selectedUnit.indicatorCode} · ${selectedUnit.indicator}`
          : selectedUnit.indicator) ||
        "this indicator";

      const strandTitle =
        note.strand || selectedUnit.strand || "the strand";

      const draftPlan: GeneratedPlan = {
        introduction: `Introduce the lesson by discussing why "${indicatorText}" matters in the lives of learners. Activate prior knowledge and link it to ${strandTitle.toLowerCase()}.`,
        development: `Guide learners through practical activities and discussions around "${indicatorText}". Use real-life examples, group work, and questioning to deepen understanding of the strand ${strandTitle}.`,
        assessment: `Check understanding with short oral questions, quick written tasks, and peer explanations based on "${indicatorText}". Make sure all learners can explain the core idea in their own words.`,
        differentiation: `Support slower learners with simpler examples, visuals and guided practice on "${indicatorText}". Challenge faster learners with extension questions and real-life problem scenarios related to ${strandTitle.toLowerCase()}.`,
        reflection: `After the lesson, reflect on how well learners understood "${indicatorText}". Note which strategies worked, which learners need follow-up support, and what to adjust in the next lesson.`,
        meta: note.aiPlanJson ?? null,
      };

      setPlan(draftPlan);
    } catch (err) {
      console.error("GENERATE_PLAN_ERROR", err);
      setPlanError(
        "Network or server error while generating lesson note draft."
      );
      setPlan(null);
    } finally {
      setPlanLoading(false);
    }
  }

  // -----------------------------
  // Small helpers
  // -----------------------------
  function onWeekChange(value: string) {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n > 0) {
      setWeekNumber(n);
    } else {
      setWeekNumber(1);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-5">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}
            >
              EduLife OS · Teacher · Lesson Note Studio
            </span>
            <span className="text-[11px] text-slate-500">
              NaCCA curriculum · Scheme of Work · AI-assisted lesson notes
            </span>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1.5">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
                NaCCA Lesson Note Studio (Curriculum Slice)
              </h1>
              <p className="text-xs md:text-sm text-slate-600 max-w-2xl">
                Pick a{" "}
                <span className="font-semibold">
                  phase, level, term and week
                </span>
                , load{" "}
                <span className="font-semibold">
                  real NaCCA indicators
                </span>
                , then let EduLife OS draft an{" "}
                <span className="font-semibold">
                  AI-assisted lesson note
                </span>{" "}
                you can refine and later save as a proper GES note.
              </p>
            </div>
            <div className="text-[11px] md:text-xs text-slate-500 md:text-right space-y-1">
              <p>
                Phase:{" "}
                <span className="font-semibold">
                  {phase || "—"}
                </span>{" "}
                • Level:{" "}
                <span className="font-semibold">
                  {level || "—"}
                </span>
              </p>
              <p>
                Term:{" "}
                <span className="font-semibold">
                  {term || "—"}
                </span>{" "}
                • Week:{" "}
                <span className="font-semibold">
                  {weekNumber}
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* 3-column layout */}
        <section className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]">
          {/* Column 1: Filters + curriculum units list */}
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm space-y-3">
            {/* Filters */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-900">
                  1 · Choose curriculum slice
                </h2>
                {unitsLoading && (
                  <span className="text-[11px] text-slate-500">
                    Loading…
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-700 mb-1">
                    Phase
                  </label>
                  <select
                    className={selectBase}
                    value={phase}
                    onChange={(e) => setPhase(e.target.value)}
                  >
                    <option value="KG">KG</option>
                    <option value="Lower Primary">
                      Lower Primary
                    </option>
                    <option value="Upper Primary">
                      Upper Primary
                    </option>
                    <option value="Junior High School">
                      JHS
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-slate-700 mb-1">
                    Level / Class
                  </label>
                  <input
                    className={inputBase}
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    placeholder="e.g. KG1, B3, JHS1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-700 mb-1">
                    Term
                  </label>
                  <select
                    className={selectBase}
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  >
                    <option value="1st Term">1st Term</option>
                    <option value="2nd Term">2nd Term</option>
                    <option value="3rd Term">3rd Term</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-700 mb-1">
                    Week number
                  </label>
                  <input
                    className={inputBase}
                    type="number"
                    min={1}
                    value={weekNumber}
                    onChange={(e) =>
                      onWeekChange(e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Subject slug remains internal – auto-wired from Scheme link */}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => void loadUnits()}
                  disabled={unitsLoading}
                >
                  Reload units
                </button>
                <span className="text-[10px] text-slate-500">
                  Units:{" "}
                  <span className="font-semibold">
                    {units.length}
                  </span>
                </span>
              </div>
            </div>

            {/* Error message */}
            {unitsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {unitsError}
              </div>
            )}

            {/* Units list */}
            <div className="space-y-1.5 max-h-80 overflow-auto pr-1 mt-2">
              {units.length === 0 &&
                !unitsLoading &&
                !unitsError && (
                  <p className="text-[11px] text-slate-500">
                    No units found for this combination yet.
                    Confirm that:
                    <br />
                    • The NaCCA curriculum for this
                    subject/level is seeded.
                    <br />
                    • The subject slug matches the
                    CurriculumSubject row.
                  </p>
                )}

              {units.map((u) => {
                const isSelected = u.id === selectedUnitId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUnitId(u.id);
                      setPlan(null);
                      setPlanError(null);
                    }}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left text-[11px] transition",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/60",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        Week {u.weekNumber} ·{" "}
                        {u.indicatorCode
                          ? u.indicatorCode + " · "
                          : ""}
                        Indicator
                      </div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600">
                        {u.strand}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-600">
                      {u.indicator}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
              <p>
                These rows come from the{" "}
                <span className="font-semibold">
                  /api/curriculum/units
                </span>{" "}
                endpoint, which flattens your NaCCA tree
                (strand → substrand → indicator) for quick
                lesson planning.
              </p>
            </div>
          </div>

          {/* Column 2: Generated lesson note (AI-assisted) */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 md:p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-emerald-900">
                  2 · AI-assisted NaCCA Lesson Note Draft
                </h2>
                <p className="text-[11px] text-emerald-900/80">
                  Based on:{" "}
                  {selectedUnit ? (
                    <span className="font-semibold">
                      {selectedUnit.indicatorCode
                        ? `${selectedUnit.indicatorCode} · `
                        : ""}
                      {selectedUnit.indicator}
                    </span>
                  ) : (
                    <span className="italic">
                      no indicator selected yet
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void handleGeneratePlan()}
                disabled={!selectedUnit || planLoading}
              >
                {planLoading
                  ? "Generating draft…"
                  : "Generate lesson note draft"}
              </button>
            </div>

            {!selectedUnit && (
              <p className="text-[11px] text-emerald-900/80">
                Select any indicator on the left, then click{" "}
                <span className="font-semibold">
                  Generate lesson note draft
                </span>
                . EduLife OS will create a NaCCA-aligned
                introduction, development, assessment and
                reflection for you to refine.
              </p>
            )}

            {planError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {planError}
              </div>
            )}

            {plan && (
              <div className="space-y-2 text-[11px] text-emerald-950">
                <NoteBlock
                  title="Introduction"
                  text={plan.introduction}
                />
                <NoteBlock
                  title="Development / Main Activity"
                  text={plan.development}
                />
                <NoteBlock
                  title="Assessment"
                  text={plan.assessment}
                />
                <NoteBlock
                  title="Differentiation"
                  text={plan.differentiation}
                />
                <NoteBlock
                  title="Teacher Reflection (end of lesson)"
                  text={plan.reflection}
                />
              </div>
            )}

            {!plan &&
              selectedUnit &&
              !planLoading &&
              !planError && (
                <p className="text-[11px] text-emerald-900/80">
                  Click the{" "}
                  <span className="font-semibold">
                    Generate lesson note draft
                  </span>{" "}
                  button above to see a full NaCCA-style
                  note for this indicator.
                </p>
              )}

            <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-900/90 pt-1">
              <p>
                Later, this draft will be editable and
                you&apos;ll be able to{" "}
                <span className="font-semibold">
                  Save as NaCCA lesson note
                </span>{" "}
                linked to your Scheme of Work and
                classroom.
              </p>
            </div>
          </div>

          {/* Column 3: Print-style preview + trust meta */}
          <div className="space-y-3">
            {/* Print preview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm text-[11px] text-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900">
                    NaCCA Lesson Note – Print Preview
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {selectedUnit ? (
                      <>
                        {selectedUnit.subject} • Week{" "}
                        {selectedUnit.weekNumber ??
                          weekNumber}{" "}
                        • Indicator:{" "}
                        <span className="font-semibold">
                          {selectedUnit.indicatorCode
                            ? `${selectedUnit.indicatorCode} · `
                            : ""}
                          {selectedUnit.indicator}
                        </span>
                      </>
                    ) : (
                      "Select an indicator to see the print-style layout."
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="hidden md:inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  Print sample
                </button>
              </div>

              {selectedUnit && (
                <>
                  <div className="space-y-1">
                    <Row
                      label="Strand"
                      value={selectedUnit.strand}
                    />
                    <Row
                      label="Sub-strand"
                      value={selectedUnit.substrand}
                    />
                    <Row
                      label="Content standard"
                      value={selectedUnit.contentStandard}
                    />
                    <Row
                      label="Indicator"
                      value={
                        selectedUnit.indicatorCode
                          ? `${selectedUnit.indicatorCode} · ${selectedUnit.indicator}`
                          : selectedUnit.indicator
                      }
                    />
                  </div>

                  <div className="mt-1 grid gap-1.5 md:grid-cols-2">
                    <Row
                      label="Class"
                      value={`${level} (demo)`}
                    />
                    <Row
                      label="Duration"
                      value="30–45 minutes"
                    />
                  </div>

                  <div className="mt-2 space-y-1.5">
                    <Block
                      label="Introduction"
                      text={
                        plan?.introduction ??
                        "(Will appear after generation)"
                      }
                    />
                    <Block
                      label="Development / Main Activity"
                      text={
                        plan?.development ??
                        "(Will appear after generation)"
                      }
                    />
                    <Block
                      label="Assessment"
                      text={
                        plan?.assessment ??
                        "(Will appear after generation)"
                      }
                    />
                    <Block
                      label="Differentiation"
                      text={
                        plan?.differentiation ??
                        "(Will appear after generation)"
                      }
                    />
                    <Block
                      label="Teacher's Reflection"
                      text={
                        plan?.reflection ??
                        "(Will appear after generation)"
                      }
                    />
                  </div>

                  <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                    <Row
                      label="Teacher"
                      value="(To be auto-filled from login)"
                    />
                    <Row
                      label="Date"
                      value="(To be auto-filled from timetable)"
                    />
                  </div>
                </>
              )}

              {!selectedUnit && (
                <p className="mt-2 text-[10px] text-slate-500">
                  When you select an indicator and generate a
                  draft, this right side will show a{" "}
                  <span className="font-semibold">
                    print-ready layout
                  </span>{" "}
                  similar to GES lesson note format.
                </p>
              )}
            </div>

            {/* Trust & provenance meta */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3 md:p-4 shadow-sm text-[11px] text-sky-900 space-y-1.5">
              <h3 className="text-xs font-semibold text-sky-900">
                3 · Trust: Real NaCCA Curriculum → Real Lesson Notes
              </h3>
              <p>
                Every draft shown here is based on{" "}
                <span className="font-semibold">
                  real indicators from your seeded NaCCA
                  curriculum
                </span>
                , not random AI guesses.
              </p>
              <p>
                In your 31st January demo, you can show how a
                teacher moves from:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  Curriculum Explorer (trusted NaCCA tree)
                </li>
                <li>
                  Scheme of Work (weekly plan for the class)
                </li>
                <li>
                  Lesson Note Studio (this page – daily NaCCA
                  lesson note drafts)
                </li>
              </ul>
              <p className="text-[10px] text-sky-800/90">
                Later, EduLife OS will store these notes in the{" "}
                <span className="font-semibold">
                  LessonNote
                </span>{" "}
                table and link them directly to each
                SchemeOfWorkItem, classroom and term.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* -------------------------
 * Small presentational bits
 * ------------------------*/

function NoteBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
        {title}
      </div>
      <p className="mt-0.5 whitespace-pre-line text-[11px] text-emerald-950">
        {text}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="min-w-[90px] text-[10px] font-semibold text-slate-700">
        {label}:
      </span>
      <span className="flex-1 text-[11px] text-slate-800 whitespace-pre-line">
        {value || "—"}
      </span>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">
        {label}:
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 whitespace-pre-line text-[11px]">
        {text}
      </div>
    </div>
  );
}
