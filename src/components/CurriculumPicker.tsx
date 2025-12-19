// src/components/CurriculumPicker.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * ==========================
 * Types matching curriculumEngine.ts
 * ==========================
 */

type CurriculumIndicator = {
  id: string;
  code?: string | null;
  description: string;
  orderIndex?: number | null;
};

type CurriculumContentStandard = {
  id: string;
  code?: string | null;
  description: string;
  orderIndex?: number | null;
  indicators: CurriculumIndicator[];
};

type CurriculumSubStrand = {
  id: string;
  code?: string | null;
  title: string;
  description?: string | null;
  orderIndex?: number | null;
  contentStandards: CurriculumContentStandard[];
};

type CurriculumStrand = {
  id: string;
  code?: string | null;
  title: string;
  description?: string | null;
  orderIndex?: number | null;
  subStrands: CurriculumSubStrand[];
};

type CurriculumSubjectHierarchy = {
  id: string;
  phase?: string | null;
  level?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  orderIndex?: number | null;
  strands: CurriculumStrand[];
};

/**
 * The selection we send back to the parent.
 */
export type CurriculumSelection = {
  subjectId: string;
  subjectName: string;
  subjectSlug: string;

  /**
   * Backwards-compat alias so existing code using `selection.subject`
   * (e.g. in /teacher/lesson-notes/[id]/page.tsx) continues to compile.
   * It simply mirrors `subjectName`.
   */
  subject?: string;

  phase?: string | null;
  level?: string | null;

  strand?: {
    id: string;
    title: string;
    code?: string | null;
  };

  subStrand?: {
    id: string;
    title: string;
    code?: string | null;
  };

  contentStandard?: {
    id: string;
    code?: string | null;
    description: string;
  };

  indicator?: {
    id: string;
    code?: string | null;
    description: string;
  };

  exemplar?: {
    id: string;
    title: string;
    description?: string | null;
  };
};

export type CurriculumPickerProps = {
  /**
   * Optional filters to help the API pick the right CurriculumSubject.
   * These mirror CurriculumHierarchyRequest in src/lib/curriculumEngine.ts.
   */
  phase?: string | null;
  level?: string | null;
  subjectName?: string;
  subjectSlug?: string;

  /**
   * If you want a nicer display name than the raw subject.name, you can pass it.
   * This is what we store in subjectName & subject (alias).
   */
  subjectNameOverride?: string;

  /**
   * Called whenever the user changes strand / sub-strand / indicator.
   * Will be called with `null` if we have no subject loaded.
   */
  onSelectionChange?: (selection: CurriculumSelection | null) => void;
};

/**
 * Simple button / select styles (keep tiny, nothing fancy)
 */
const selectBase =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";

const labelBase = "block text-[11px] md:text-xs font-medium text-zinc-700 mb-1";

/**
 * CurriculumPicker
 *
 * Fetches hierarchical NaCCA curriculum for a single subject
 * and lets the teacher pick: Strand → Sub-strand → Indicator.
 */
export default function CurriculumPicker(props: CurriculumPickerProps) {
  const {
    phase,
    level,
    subjectName,
    subjectSlug,
    subjectNameOverride,
    onSelectionChange,
  } = props;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<CurriculumSubjectHierarchy | null>(
    null
  );

  // Local selection state (IDs only)
  const [selectedStrandId, setSelectedStrandId] = useState<string>("");
  const [selectedSubStrandId, setSelectedSubStrandId] = useState<string>("");
  const [selectedContentStandardId, setSelectedContentStandardId] =
    useState<string>("");
  const [selectedIndicatorId, setSelectedIndicatorId] =
    useState<string>("");

  /**
   * Load the curriculum hierarchy via API.
   * We assume you have an API route that calls getCurriculumHierarchyForSubject()
   * and returns { ok: boolean; subject?: CurriculumSubjectHierarchy; error?: string }
   */
  useEffect(() => {
    async function load() {
      // We need at least subjectName or subjectSlug; mirror the backend guard.
      if (!subjectName && !subjectSlug) {
        setSubject(null);
        setError("No subject provided to CurriculumPicker.");
        return;
      }

      setLoading(true);
      setError(null);
      setSubject(null);

      try {
        const url = new URL(
          "/api/curriculum/hierarchy",
          window.location.origin
        );

        if (phase) url.searchParams.set("phase", phase);
        if (level) url.searchParams.set("level", level);
        if (subjectName) url.searchParams.set("subject", subjectName);
        if (subjectSlug) url.searchParams.set("subjectSlug", subjectSlug);

        const res = await fetch(url.toString());
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          subject?: CurriculumSubjectHierarchy;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.subject) {
          setError(
            data.error ??
              "Failed to load curriculum hierarchy. Please check the seed data or try again."
          );
          setSubject(null);
          return;
        }

        setSubject(data.subject);
        // Reset selection when we load a fresh subject
        setSelectedStrandId("");
        setSelectedSubStrandId("");
        setSelectedContentStandardId("");
        setSelectedIndicatorId("");
      } catch {
        setError(
          "Network or server error while loading curriculum hierarchy."
        );
        setSubject(null);
      } finally {
        setLoading(false);
      }
    }

    // Run only on the client
    if (typeof window !== "undefined") {
      void load();
    }
  }, [phase, level, subjectName, subjectSlug]);

  /**
   * Compute references to currently selected items
   */
  const selectedStrand = useMemo(() => {
    if (!subject || !selectedStrandId) return undefined;
    return subject.strands.find((s) => s.id === selectedStrandId);
  }, [subject, selectedStrandId]);

  const selectedSubStrand = useMemo(() => {
    if (!selectedStrand || !selectedSubStrandId) return undefined;
    return selectedStrand.subStrands.find(
      (s) => s.id === selectedSubStrandId
    );
  }, [selectedStrand, selectedSubStrandId]);

  const selectedContentStandard = useMemo(() => {
    if (!selectedSubStrand || !selectedContentStandardId) return undefined;
    return selectedSubStrand.contentStandards.find(
      (cs) => cs.id === selectedContentStandardId
    );
  }, [selectedSubStrand, selectedContentStandardId]);

  const selectedIndicator = useMemo(() => {
    if (!selectedContentStandard || !selectedIndicatorId) return undefined;
    return selectedContentStandard.indicators.find(
      (ind) => ind.id === selectedIndicatorId
    );
  }, [selectedContentStandard, selectedIndicatorId]);

  /**
   * Build CurriculumSelection object and notify parent
   */
  useEffect(() => {
    if (!subject || !onSelectionChange) {
      onSelectionChange?.(null);
      return;
    }

    const selection: CurriculumSelection = {
      subjectId: subject.id,
      subjectName: subjectNameOverride ?? subject.name,
      subjectSlug: subject.slug,

      // ⚡ Backwards-compat alias for older code using `selection.subject`
      subject: subjectNameOverride ?? subject.name,

      phase: subject.phase,
      level: subject.level,
      strand: selectedStrand
        ? {
            id: selectedStrand.id,
            title: selectedStrand.title,
            code: selectedStrand.code,
          }
        : undefined,
      subStrand: selectedSubStrand
        ? {
            id: selectedSubStrand.id,
            title: selectedSubStrand.title,
            code: selectedSubStrand.code,
          }
        : undefined,
      contentStandard: selectedContentStandard
        ? {
            id: selectedContentStandard.id,
            code: selectedContentStandard.code,
            description: selectedContentStandard.description,
          }
        : undefined,
      indicator: selectedIndicator
        ? {
            id: selectedIndicator.id,
            code: selectedIndicator.code,
            description: selectedIndicator.description,
          }
        : undefined,
      exemplar: undefined, // can be added later when exemplars are wired in UI
    };

    onSelectionChange(selection);
  }, [
    subject,
    selectedStrand,
    selectedSubStrand,
    selectedContentStandard,
    selectedIndicator,
    onSelectionChange,
    subjectNameOverride,
  ]);

  /**
   * Options derived for dropdowns
   */
  const strandOptions = useMemo(() => {
    if (!subject) return [];
    return subject.strands;
  }, [subject]);

  const subStrandOptions = useMemo(() => {
    if (!selectedStrand) return [];
    return selectedStrand.subStrands;
  }, [selectedStrand]);

  const contentStandardOptions = useMemo(() => {
    if (!selectedSubStrand) return [];
    return selectedSubStrand.contentStandards;
  }, [selectedSubStrand]);

  const indicatorOptions = useMemo(() => {
    if (!selectedContentStandard) return [];
    return selectedContentStandard.indicators;
  }, [selectedContentStandard]);

  /**
   * Render
   */
  if (loading && !subject) {
    return (
      <div className="border rounded-2xl bg-white p-3 text-xs text-zinc-600">
        Loading NaCCA curriculum…
      </div>
    );
  }

  if (error && !subject) {
    return (
      <div className="border rounded-2xl bg-red-50 border-red-200 p-3 text-xs text-red-800">
        {error}
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="border rounded-2xl bg-white p-3 text-xs text-zinc-600">
        No curriculum subject found for the given phase/level/subject.
      </div>
    );
  }

  return (
    <div className="border rounded-2xl bg-white p-3 md:p-4 space-y-3 text-xs md:text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            NaCCA curriculum navigator
          </h2>
          <p className="text-[11px] text-zinc-600">
            Start from strand, then sub-strand, then indicator. We keep
            everything tied to your official KG / Basic curriculum.
          </p>
        </div>
        <span className="text-[10px] text-zinc-500">
          {subject.phase ?? "Phase"} • {subject.level ?? "Level"}
        </span>
      </div>

      {/* Strand */}
      <div>
        <label className={labelBase}>Strand</label>
        <select
          className={selectBase}
          value={selectedStrandId}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedStrandId(value);
            setSelectedSubStrandId("");
            setSelectedContentStandardId("");
            setSelectedIndicatorId("");
          }}
        >
          <option value="">— Select strand —</option>
          {strandOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ? `${s.code} – ${s.title}` : s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-strand */}
      {selectedStrand && (
        <div>
          <label className={labelBase}>Sub-strand / Topic</label>
          <select
            className={selectBase}
            value={selectedSubStrandId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSubStrandId(value);
              setSelectedContentStandardId("");
              setSelectedIndicatorId("");
            }}
          >
            <option value="">— Select sub-strand —</option>
            {subStrandOptions.map((ss) => (
              <option key={ss.id} value={ss.id}>
                {ss.code ? `${ss.code} – ${ss.title}` : ss.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content standard */}
      {selectedSubStrand && (
        <div>
          <label className={labelBase}>Content standard</label>
          <select
            className={selectBase}
            value={selectedContentStandardId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedContentStandardId(value);
              setSelectedIndicatorId("");
            }}
          >
            <option value="">— Select content standard —</option>
            {contentStandardOptions.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.code
                  ? `${cs.code} – ${cs.description}`
                  : cs.description}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Indicator */}
      {selectedContentStandard && (
        <div>
          <label className={labelBase}>Indicator</label>
          <select
            className={selectBase}
            value={selectedIndicatorId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedIndicatorId(value);
            }}
          >
            <option value="">— Select indicator —</option>
            {indicatorOptions.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.code
                  ? `${ind.code} – ${ind.description}`
                  : ind.description}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-2 py-1 mt-2">
          {error}
        </p>
      )}

      {!error && (
        <p className="text-[11px] text-zinc-500">
          As you choose strand / sub-strand / indicator, EduLife OS
          keeps a single, clean{" "}
          <span className="font-semibold">CurriculumSelection</span> in
          sync for your lesson note studio.
        </p>
      )}
    </div>
  );
}
