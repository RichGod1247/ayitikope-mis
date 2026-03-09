// src/components/TeacherCurriculumExplorerClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  message?: string;
};

type CurriculumResponse = {
  ok: boolean;
  item?: CurriculumHierarchy;
  error?: string;
  message?: string;
};

type SchemeSummary = {
  id: string;
  title: string | null;
  subject: string;
  term: string;
  academicYear: string;
  classroomId: string | null;

  // API may use either name; we support both.
  itemCount?: number;
  totalItems?: number;
};

type SchemesListResponse = {
  ok: boolean;
  items?: SchemeSummary[];
  error?: string;
  message?: string;
};

type Notice = { tone: "ok" | "error" | "info"; text: string };

const pillBase = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline = btnBase + " bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50";
const btnPrimary = btnBase + " bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700";
const inputBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";
const selectBase =
  "w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black";

function normalizeTermClient(raw: unknown): "" | "1st Term" | "2nd Term" | "3rd Term" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";
  if (v === "1st") return "1st Term";
  if (v === "2nd") return "2nd Term";
  if (v === "3rd") return "3rd Term";
  return "";
}

function normalizeAcademicYearClient(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;
  if (/^\d{4}\/\d{4}$/.test(v)) return v;
  return v; // keep typed
}

function handleAuthFailure() {
  const here =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/teacher/curriculum";

  const p = new URLSearchParams();
  p.set("callbackUrl", here);

  window.location.href = `/auth/signin?${p.toString()}`;
}

function safeClientInternalPath(raw: string | null | undefined, fallback: string) {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

async function readJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function pickErrorMessage(res: Response, data: any, fallback: string) {
  const msg =
    (data && (data.error || data.message)) ||
    (res.status === 403 ? "Forbidden. You don’t have permission to do that." : "") ||
    fallback;
  return String(msg);
}

function getSchemeCount(s: SchemeSummary): number {
  const n = (s.itemCount ?? s.totalItems ?? 0) as any;
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export default function TeacherCurriculumExplorerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const schemeMode = mode === "scheme";

  const urlTerm = (searchParams.get("term") ?? "").trim();
  const urlAcademicYear = (searchParams.get("academicYear") ?? "").trim();
  const urlReturn = searchParams.get("return");

  // -----------------------------
  // Scheme builder (mode=scheme)
  // -----------------------------
  const [schemeTerm, setSchemeTerm] = useState<string>("");
  const [schemeAcademicYear, setSchemeAcademicYear] = useState<string>("");
  const [schemeWeekNumber, setSchemeWeekNumber] = useState<string>("1");
  const [schemeNotice, setSchemeNotice] = useState<Notice | null>(null);

  // Summary (across all subjects) to decide if "Return" should unlock
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummary[]>([]);
  const [schemeSummaryLoading, setSchemeSummaryLoading] = useState(false);
  const [schemeSummaryError, setSchemeSummaryError] = useState<string | null>(null);

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
  const [selectedSubStrandId, setSelectedSubStrandId] = useState<string | null>(null);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string | null>(null);

  // Schemes (subject scoped) — used ONLY by scheme builder mode
  const [schemes, setSchemes] = useState<SchemeSummary[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [schemesError, setSchemesError] = useState<string | null>(null);

  const [selectedSchemeIdForAdd, setSelectedSchemeIdForAdd] = useState<string>("");
  const [addToSchemeSaving, setAddToSchemeSaving] = useState(false);

  const schemeReturnTarget = useMemo(() => {
    const fallback =
      schemeTerm && schemeAcademicYear
        ? `/teacher/lesson-notes?term=${encodeURIComponent(schemeTerm)}&academicYear=${encodeURIComponent(
            schemeAcademicYear
          )}`
        : "/teacher/lesson-notes";

    return safeClientInternalPath(urlReturn, fallback);
  }, [urlReturn, schemeTerm, schemeAcademicYear]);

  // Sync scheme term/year from URL when in scheme mode (NORMALIZE)
  useEffect(() => {
    if (!schemeMode) return;

    if (urlTerm) {
      const t = normalizeTermClient(urlTerm);
      setSchemeTerm(t || urlTerm);
    }
    if (urlAcademicYear) {
      const y = normalizeAcademicYearClient(urlAcademicYear);
      setSchemeAcademicYear(y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeMode, urlTerm, urlAcademicYear]);

  // Load tenant current term/year as fallback (only if missing) (NORMALIZE)
  useEffect(() => {
    if (!schemeMode) return;

    let cancelled = false;

    async function loadDefaults() {
      try {
        const res = await fetch("/api/settings/current-term-year", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
          credentials: "include",
        });
        if (res.status === 401) return handleAuthFailure();

        const data = (await readJsonSafe(res)) as {
          ok?: boolean;
          term?: string | null;
          academicYear?: string | null;
        };

        if (!res.ok || !data?.ok) return;
        if (cancelled) return;

        if (!schemeTerm && data.term) {
          const t = normalizeTermClient(data.term);
          if (t) setSchemeTerm(t);
          else setSchemeTerm(String(data.term));
        }
        if (!schemeAcademicYear && data.academicYear) {
          setSchemeAcademicYear(normalizeAcademicYearClient(data.academicYear));
        }
      } catch {
        // ignore
      }
    }

    void loadDefaults();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeMode]);

  // -----------------------------
  // Load subjects once
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadSubjects() {
      setSubjectsLoading(true);
      setSubjectsError(null);

      try {
        const res = await fetch("/api/curriculum/subjects", { credentials: "include" });
        if (res.status === 401) return handleAuthFailure();

        const data = (await readJsonSafe(res)) as SubjectsResponse;

        if (res.status === 403) {
          if (!cancelled) {
            setSubjects([]);
            setSubjectsError(pickErrorMessage(res, data, "Forbidden."));
          }
          return;
        }

        if (!res.ok || !data?.ok || !data.items) {
          if (!cancelled) {
            setSubjects([]);
            setSubjectsError(data?.error ?? "Failed to load curriculum subjects. Please try again.");
          }
          return;
        }

        if (cancelled) return;

        setSubjects(data.items);

        if (data.items.length > 0) {
          const first = data.items[0];
          setSelectedPhase(first.phase ?? "");
          setSelectedLevel(first.level ?? "");
          setSelectedSubjectId(first.id);
        }
      } catch (err) {
        console.error("Error loading curriculum subjects", err);
        if (!cancelled) setSubjectsError("Network or server error while loading curriculum subjects.");
      } finally {
        if (!cancelled) setSubjectsLoading(false);
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
    const all = Array.from(new Set(subjects.map((s) => s.phase || "").filter((p) => p.trim().length > 0)));
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
    return subjects.filter((s) => (s.phase || "") === selectedPhase && (s.level || "") === selectedLevel);
  }, [subjects, selectedPhase, selectedLevel]);

  const selectedSubject = useMemo(() => subjects.find((s) => s.id === selectedSubjectId) ?? null, [subjects, selectedSubjectId]);

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

      // reset scheme UI for new subject selection
      setSchemes([]);
      setSchemesError(null);
      setSelectedSchemeIdForAdd("");

      try {
        const params = new URLSearchParams();
        if (selectedPhase) params.set("phase", selectedPhase);
        if (selectedLevel) params.set("level", selectedLevel);

        if (selectedSubject.slug) params.set("subjectSlug", selectedSubject.slug);
        else params.set("subject", selectedSubject.name);

        const res = await fetch(`/api/curriculum?${params.toString()}`, { credentials: "include" });
        if (res.status === 401) return handleAuthFailure();

        const data = (await readJsonSafe(res)) as CurriculumResponse;

        if (res.status === 403) {
          if (!cancelled) {
            setCurriculum(null);
            setCurriculumError(pickErrorMessage(res, data, "Forbidden."));
          }
          return;
        }

        if (!res.ok || !data?.ok || !data.item) {
          if (!cancelled) {
            setCurriculum(null);
            setCurriculumError(data?.error ?? "Failed to load curriculum hierarchy. Please try again.");
          }
          return;
        }

        if (cancelled) return;

        setCurriculum(data.item);

        if (data.item.strands && data.item.strands.length > 0) {
          const firstStrand = data.item.strands[0];
          setSelectedStrandId(firstStrand.id);

          if (firstStrand.subStrands && firstStrand.subStrands.length > 0) {
            const firstSub = firstStrand.subStrands[0];
            setSelectedSubStrandId(firstSub.id);

            if (firstSub.contentStandards.length > 0 && firstSub.contentStandards[0].indicators.length > 0) {
              setSelectedIndicatorId(firstSub.contentStandards[0].indicators[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Error loading curriculum hierarchy", err);
        if (!cancelled) {
          setCurriculum(null);
          setCurriculumError("Network or server error while loading curriculum hierarchy.");
        }
      } finally {
        if (!cancelled) setCurriculumLoading(false);
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
    return selectedStrand.subStrands.find((ss) => ss.id === selectedSubStrandId) ?? null;
  }, [selectedStrand, selectedSubStrandId]);

  const selectedIndicator = useMemo(() => {
    if (!selectedSubStrand || !selectedIndicatorId) return null;

    for (const cs of selectedSubStrand.contentStandards) {
      const indicator = cs.indicators.find((ind) => ind.id === selectedIndicatorId);
      if (indicator) return indicator;
    }

    return null;
  }, [selectedSubStrand, selectedIndicatorId]);

  const contentStandardForSelectedIndicator = useMemo(() => {
    if (!selectedSubStrand || !selectedIndicator) return null;

    for (const cs of selectedSubStrand.contentStandards) {
      const match = cs.indicators.find((ind) => ind.id === selectedIndicator.id);
      if (match) return cs;
    }
    return null;
  }, [selectedSubStrand, selectedIndicator]);

  const pageRangeForSelectedIndicator = useMemo(() => {
    if (!selectedIndicator) return null;

    const pages: number[] = [];

    if (selectedIndicator.media?.length) {
      for (const m of selectedIndicator.media) {
        if (typeof m.pageNumberInPdf === "number" && !Number.isNaN(m.pageNumberInPdf)) pages.push(m.pageNumberInPdf);
      }
    }

    if (contentStandardForSelectedIndicator?.media?.length) {
      for (const m of contentStandardForSelectedIndicator.media) {
        if (typeof m.pageNumberInPdf === "number" && !Number.isNaN(m.pageNumberInPdf)) pages.push(m.pageNumberInPdf);
      }
    }

    if (pages.length === 0) return null;
    return { from: Math.min(...pages), to: Math.max(...pages) };
  }, [selectedIndicator, contentStandardForSelectedIndicator]);

  const hasCurriculum = !!curriculum;

  // -----------------------------
  // Scheme loads (schemeMode only)
  // -----------------------------
  async function loadSchemeSummary() {
    setSchemeSummaryLoading(true);
    setSchemeSummaryError(null);

    try {
      const res = await fetch(`/api/schemes?mode=summary`, {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
        credentials: "include",
      });

      if (res.status === 401) return handleAuthFailure();

      const data = (await readJsonSafe(res)) as SchemesListResponse;

      if (res.status === 403) {
        setSchemeSummary([]);
        setSchemeSummaryError(pickErrorMessage(res, data, "Forbidden."));
        return;
      }

      if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
        setSchemeSummary([]);
        setSchemeSummaryError(data?.error ?? "Failed to load schemes summary.");
        return;
      }

      setSchemeSummary(data.items);
    } catch (err) {
      console.error("Error loading scheme summary", err);
      setSchemeSummaryError("Network or server error while loading schemes summary.");
      setSchemeSummary([]);
    } finally {
      setSchemeSummaryLoading(false);
    }
  }

  async function loadSchemesForSubject() {
    if (!curriculum) return;

    setSchemesLoading(true);
    setSchemesError(null);

    try {
      const params = new URLSearchParams();

      // ✅ slug-first (stable), name fallback
      if (curriculum.slug) params.set("subjectSlug", curriculum.slug);
      params.set("subject", curriculum.name);

      if (schemeMode) {
        if (schemeTerm) params.set("term", schemeTerm);
        if (schemeAcademicYear) params.set("academicYear", schemeAcademicYear);
      }

      const res = await fetch(`/api/schemes?${params.toString()}`, {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
        credentials: "include",
      });

      if (res.status === 401) return handleAuthFailure();

      const data = (await readJsonSafe(res)) as SchemesListResponse;

      if (res.status === 403) {
        setSchemes([]);
        setSchemesError(pickErrorMessage(res, data, "Forbidden."));
        return;
      }

      if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
        setSchemes([]);
        setSchemesError(data?.error ?? "Failed to load schemes of work for this subject.");
        return;
      }

      setSchemes(data.items);
      if (data.items.length > 0) setSelectedSchemeIdForAdd(data.items[0].id);
      else setSelectedSchemeIdForAdd("");
    } catch (err) {
      console.error("Error loading schemes", err);
      setSchemesError("Network or server error while loading schemes of work.");
    } finally {
      setSchemesLoading(false);
    }
  }

  useEffect(() => {
    if (!schemeMode) return;
    void loadSchemeSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeMode]);

  useEffect(() => {
    if (!schemeMode) return;
    if (!curriculum) return;
    void loadSchemesForSubject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeMode, curriculum, schemeTerm, schemeAcademicYear]);

  const canReturnToLessonNotes = useMemo(() => {
    if (!schemeMode) return false;
    if (!schemeTerm || !schemeAcademicYear) return false;
    return schemeSummary.some((s) => s.term === schemeTerm && s.academicYear === schemeAcademicYear && getSchemeCount(s) > 0);
  }, [schemeMode, schemeTerm, schemeAcademicYear, schemeSummary]);

  async function handleAddSelectedIndicatorToScheme() {
    setSchemeNotice(null);

    if (!curriculum || !selectedIndicator) {
      setSchemeNotice({ tone: "error", text: "Select an indicator first." });
      return;
    }

    if (!schemeTerm || !schemeAcademicYear) {
      setSchemeNotice({ tone: "error", text: "Set term and academic year first." });
      return;
    }

    const week = Number.parseInt(schemeWeekNumber, 10);
    if (!Number.isFinite(week) || week <= 0) {
      setSchemeNotice({ tone: "error", text: "Enter a valid week number (1, 2, 3…)."} );
      return;
    }

    const strandTitle = selectedStrand?.title ?? "Strand";
    const subStrandTitle = selectedSubStrand?.title ?? "Sub-strand";
    const csDesc = contentStandardForSelectedIndicator?.description ?? "";
    const csCode = contentStandardForSelectedIndicator?.code ?? null;
    const indicatorDescription = selectedIndicator.description ?? "";

    const schemeId = schemes.length > 0 ? (selectedSchemeIdForAdd || schemes[0].id) : undefined;

    setAddToSchemeSaving(true);

    try {
      const res = await fetch("/api/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          classroomId: null,

          // ✅ future-proof: send both name and slug at top-level
          subject: curriculum.name,
          subjectSlug: curriculum.slug ?? null,

          term: schemeTerm,
          academicYear: schemeAcademicYear,
          title: `${curriculum.name} – ${schemeTerm} (${schemeAcademicYear})`,
          notes: null,
          weekNumber: week,
          schemeId,

          indicatorSlice: {
            indicatorId: selectedIndicator.id,
            indicatorCode: selectedIndicator.code,
            indicatorDescription,
            strandTitle,
            subStrandTitle,
            contentStandardCode: csCode,
            contentStandardDescription: csDesc,
            phase: curriculum.phase ?? null,
            level: curriculum.level ?? null,
            subjectSlug: curriculum.slug ?? null,
            strandCode: selectedStrand?.code ?? null,
            subStrandCode: selectedSubStrand?.code ?? null,
          },
        }),
      });

      if (res.status === 401) return handleAuthFailure();

      const data = await readJsonSafe(res);

      if (res.status === 403) {
        const msg = pickErrorMessage(
          res,
          data,
          "Forbidden. This usually means your teacher profile isn’t assigned to this subject/level."
        );
        setSchemeNotice({ tone: "error", text: msg });
        return;
      }

      if (!res.ok || !data?.ok) {
        const msg = pickErrorMessage(res, data, "Failed to add indicator to scheme.");
        setSchemeNotice({ tone: "error", text: msg });
        return;
      }

      setSchemeNotice({ tone: "ok", text: "Saved. Indicator added to scheme." });

      await Promise.all([loadSchemesForSubject(), loadSchemeSummary()]);
    } catch (err) {
      console.error("Error adding to scheme", err);
      setSchemeNotice({ tone: "error", text: "Network or server error while adding to scheme." });
    } finally {
      setAddToSchemeSaving(false);
    }
  }

  function syncTermYearToUrl() {
    if (!schemeMode) return;

    const p = new URLSearchParams(searchParams.toString());

    const t = normalizeTermClient(schemeTerm) || schemeTerm;
    const y = normalizeAcademicYearClient(schemeAcademicYear);

    if (t) p.set("term", t);
    else p.delete("term");

    if (y) p.set("academicYear", y);
    else p.delete("academicYear");

    router.replace(`/teacher/curriculum?${p.toString()}`);
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}>EduLife OS · Curriculum Explorer</span>
              {schemeMode ? (
                <span className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>Mode: Scheme Builder</span>
              ) : (
                <span className="text-[11px] text-zinc-500">NaCCA KG–JHS curriculum · read-only, trusted source</span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Teacher Curriculum Explorer</h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              Choose a <span className="font-semibold">phase, level</span> and{" "}
              <span className="font-semibold">subject</span>. EduLife OS will load the official NaCCA structure for that subject:
              strands, sub-strands, content standards, indicators and exemplars.
            </p>
          </div>

          <div className="text-[11px] text-zinc-500 max-w-xs md:text-right">
            <p>
              This page is the <span className="font-semibold">single source of truth</span> for your curriculum tree. Lesson notes
              and Scheme of Work tools all read from here.
            </p>
          </div>
        </header>

        {subjectsError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">{subjectsError}</div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)] gap-4 md:gap-6">
          {/* LEFT */}
          <div className="space-y-4">
            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">1 · Choose phase, level &amp; subject</h2>
                {subjectsLoading && <span className="text-[11px] text-zinc-500">Loading subjects…</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">Phase</label>
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
                  <p className="text-[10px] text-zinc-500 mt-1">Examples: KG, Lower Primary, Upper Primary, JHS…</p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">Level / Class</label>
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
                  <p className="text-[10px] text-zinc-500 mt-1">Examples: KG1, KG2, B1… JHS1…</p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">Subject</label>
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
                  <p className="text-[10px] text-zinc-500 mt-1">Real subjects from your seeded NaCCA data only.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-zinc-500 max-w-sm">
                  As soon as you pick a subject, EduLife OS will automatically load the{" "}
                  <span className="font-semibold">full curriculum tree</span>.
                </p>
                <div className="text-[11px] text-zinc-500">
                  Status: {curriculumLoading ? "Loading curriculum…" : hasCurriculum ? "Curriculum loaded" : "No curriculum loaded yet"}
                </div>
              </div>
            </div>

            {curriculumError && (
              <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">{curriculumError}</div>
            )}

            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">2 · Curriculum tree (NaCCA)</h2>
                {curriculumLoading && <span className="text-[11px] text-zinc-500">Loading…</span>}
              </div>

              {!curriculumLoading && !hasCurriculum && (
                <p className="text-xs text-zinc-500">
                  Select a phase, level and subject above to see strands, sub-strands, standards and indicators.
                </p>
              )}

              {hasCurriculum && curriculum && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700 space-y-0.5">
                    <p className="font-semibold text-[12px]">{curriculum.name}</p>
                    <p>
                      Phase: <span className="font-semibold">{curriculum.phase ?? "—"}</span> • Level:{" "}
                      <span className="font-semibold">{curriculum.level ?? "—"}</span>
                    </p>
                    {curriculum.description && <p className="text-[10px] text-zinc-500">{curriculum.description}</p>}
                  </div>

                  <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                    {curriculum.strands.map((strand) => {
                      const isStrandSelected = strand.id === selectedStrandId;
                      return (
                        <div key={strand.id} className="border border-zinc-200 rounded-xl">
                          <button
                            type="button"
                            className={`w-full flex items-start justify-between gap-2 px-3 py-2 text-left ${
                              isStrandSelected ? "bg-zinc-900 text-white" : "bg-white text-zinc-900 hover:bg-zinc-50"
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
                              {strand.description && <div className="text-[11px] opacity-80 line-clamp-2">{strand.description}</div>}
                            </div>
                            <span className="text-[10px] opacity-70">
                              {strand.subStrands.length} sub-strand{strand.subStrands.length === 1 ? "" : "s"}
                            </span>
                          </button>

                          {isStrandSelected && strand.subStrands.length > 0 && (
                            <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 space-y-1.5">
                              {strand.subStrands.map((sub) => {
                                const isSubSelected = sub.id === selectedSubStrandId;
                                return (
                                  <div key={sub.id} className="border border-zinc-200 rounded-lg bg-white">
                                    <button
                                      type="button"
                                      className={`w-full flex items-start justify-between gap-2 px-2.5 py-1.5 text-left ${
                                        isSubSelected ? "bg-zinc-900 text-white" : "bg-white text-zinc-900 hover:bg-zinc-50"
                                      }`}
                                      onClick={() => {
                                        setSelectedSubStrandId(sub.id);
                                        setSelectedIndicatorId(null);
                                      }}
                                    >
                                      <div className="space-y-0.5">
                                        <div className="text-[11px] font-medium">
                                          {sub.code ? `${sub.code} · ` : ""}
                                          {sub.title || "Sub-strand"}
                                        </div>
                                        {sub.description && <div className="text-[10px] opacity-80 line-clamp-2">{sub.description}</div>}
                                      </div>
                                      <span className="text-[10px] opacity-70">
                                        {sub.contentStandards.length} standard{sub.contentStandards.length === 1 ? "" : "s"}
                                      </span>
                                    </button>

                                    {isSubSelected && sub.contentStandards.length > 0 && (
                                      <div className="border-t border-zinc-200 bg-zinc-50 px-2.5 py-1.5 space-y-1.5">
                                        {sub.contentStandards.map((cs) => (
                                          <div key={cs.id} className="border border-zinc-200 rounded-md bg-white px-2 py-1.5 space-y-1">
                                            <div className="text-[10px] font-semibold text-zinc-800">
                                              {cs.code ? `${cs.code} · ` : ""}
                                              {cs.description || "Content standard"}
                                            </div>

                                            {cs.indicators.length > 0 && (
                                              <div className="space-y-0.5">
                                                {cs.indicators.map((ind) => {
                                                  const isIndSelected = ind.id === selectedIndicatorId;
                                                  return (
                                                    <button
                                                      key={ind.id}
                                                      type="button"
                                                      className={`w-full text-left text-[10px] px-2 py-1 rounded-md border ${
                                                        isIndSelected
                                                          ? "bg-emerald-600 text-white border-emerald-700"
                                                          : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                                                      }`}
                                                      onClick={() => setSelectedIndicatorId(ind.id)}
                                                    >
                                                      <span className="font-semibold">{ind.code ? `${ind.code} · ` : ""}</span>
                                                      {ind.description || "Indicator"}
                                                    </button>
                                                  );
                                                })}
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

          {/* RIGHT */}
          <aside className="space-y-4">
            {schemeMode && (
              <div className="border rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-sky-50 border-emerald-100 p-4 md:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">Scheme Builder</h2>
                    <p className="text-[11px] text-zinc-600">
                      Build your Scheme of Work for <span className="font-semibold">{schemeTerm || "—"}</span>{" "}
                      <span className="font-semibold">{schemeAcademicYear || ""}</span>. Add indicators week-by-week.
                    </p>
                  </div>

                  <button
                    type="button"
                    className={btnOutline + " h-8 text-[11px]"}
                    onClick={() => router.push(schemeReturnTarget)}
                    disabled={!canReturnToLessonNotes}
                    title={canReturnToLessonNotes ? "Return to Lesson Notes" : "Add at least one scheme item first"}
                  >
                    Return to Lesson Notes
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-700 mb-1">Term</label>
                    <select
                      className={selectBase}
                      value={schemeTerm}
                      onChange={(e) => setSchemeTerm(normalizeTermClient(e.target.value) || e.target.value)}
                    >
                      <option value="">— Select term —</option>
                      <option value="1st Term">1st Term</option>
                      <option value="2nd Term">2nd Term</option>
                      <option value="3rd Term">3rd Term</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-zinc-700 mb-1">Academic year</label>
                    <input
                      className={inputBase}
                      value={schemeAcademicYear}
                      onChange={(e) => setSchemeAcademicYear(normalizeAcademicYearClient(e.target.value))}
                      placeholder="2025/2026"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-700 mb-1">Week</label>
                    <input
                      type="number"
                      min={1}
                      className={inputBase}
                      value={schemeWeekNumber}
                      onChange={(e) => setSchemeWeekNumber(e.target.value)}
                    />
                  </div>

                  <div className="col-span-2 flex gap-2">
                    <button type="button" className={btnOutline} onClick={syncTermYearToUrl}>
                      Sync term/year to URL
                    </button>

                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={handleAddSelectedIndicatorToScheme}
                      disabled={addToSchemeSaving || !selectedIndicator || !schemeTerm || !schemeAcademicYear}
                    >
                      {addToSchemeSaving ? "Saving…" : "Add selected indicator"}
                    </button>
                  </div>
                </div>

                {schemesLoading && <p className="text-[11px] text-zinc-500">Loading schemes for this subject…</p>}
                {schemesError && <p className="text-[11px] text-red-600">{schemesError}</p>}

                {!schemesLoading && !schemesError && curriculum && (
                  <div className="text-[11px] text-zinc-600 border border-zinc-200 bg-white rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Subject schemes ({schemeTerm} {schemeAcademicYear}):{" "}
                        <span className="font-semibold">{schemes.length}</span>
                      </span>
                      {schemes.length > 0 && (
                        <select
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px]"
                          value={selectedSchemeIdForAdd}
                          onChange={(e) => setSelectedSchemeIdForAdd(e.target.value)}
                        >
                          {schemes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {(s.title ?? s.subject) + ` · items: ${getSchemeCount(s)}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span>
                        Return status:{" "}
                        {schemeSummaryLoading ? (
                          <span className="font-semibold">Checking…</span>
                        ) : canReturnToLessonNotes ? (
                          <span className="font-semibold text-emerald-700">READY</span>
                        ) : (
                          <span className="font-semibold text-amber-700">NOT READY</span>
                        )}
                      </span>
                      {schemeSummaryError && <span className="text-red-600">{schemeSummaryError}</span>}
                    </div>
                  </div>
                )}

                {schemeNotice && (
                  <p
                    className={[
                      "text-[11px] rounded-xl px-3 py-1.5 border",
                      schemeNotice.tone === "ok"
                        ? "text-emerald-800 bg-emerald-50 border-emerald-200"
                        : schemeNotice.tone === "info"
                          ? "text-sky-800 bg-sky-50 border-sky-200"
                          : "text-red-800 bg-red-50 border-red-200",
                    ].join(" ")}
                  >
                    {schemeNotice.text}
                  </p>
                )}
              </div>
            )}

            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">3 · Focus indicator &amp; details</h2>

                {/* ✅ IMPORTANT: Remove legacy non-scheme "Add to Scheme of Work" button.
                    Only schemeMode is canonical + working. */}
                {selectedIndicator && schemeMode && (
                  <button
                    type="button"
                    className={btnPrimary + " text-[11px] h-8"}
                    onClick={handleAddSelectedIndicatorToScheme}
                    disabled={addToSchemeSaving || !schemeTerm || !schemeAcademicYear}
                  >
                    {addToSchemeSaving ? "Saving…" : "Add to Scheme"}
                  </button>
                )}
              </div>

              {!selectedIndicator && (
                <p className="text-xs text-zinc-500">
                  Click any <span className="font-semibold">indicator</span> on the left to see details here.
                </p>
              )}

              {selectedIndicator && selectedSubStrand && (
                <div className="space-y-3 text-xs text-zinc-700">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Indicator</div>
                    <p className="text-[13px] font-semibold">
                      {selectedIndicator.code && <span>{selectedIndicator.code} · </span>}
                      {selectedIndicator.description}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Content standard</div>
                    <p>
                      {(() => {
                        if (!contentStandardForSelectedIndicator) return "Content standard not located for this indicator.";
                        const cs = contentStandardForSelectedIndicator;
                        return cs.code ? `${cs.code} · ${cs.description}` : cs.description || "Content standard text not available.";
                      })()}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Strand &amp; Sub-strand</div>
                    <p>
                      {selectedStrand && (
                        <span>
                          <span className="font-semibold">
                            {selectedStrand.code ? `${selectedStrand.code} · ` : ""}
                            {selectedStrand.title}
                          </span>
                          {" · "}
                        </span>
                      )}
                      <span className="font-semibold">
                        {selectedSubStrand.code ? `${selectedSubStrand.code} · ` : ""}
                        {selectedSubStrand.title}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Exemplars (from curriculum)</div>

                    {selectedIndicator.exemplars.length === 0 && (
                      <p className="text-[11px] text-zinc-500">No exemplars were attached to this indicator in the seed data yet.</p>
                    )}

                    {selectedIndicator.exemplars.length > 0 && (
                      <ul className="space-y-1.5">
                        {selectedIndicator.exemplars.map((ex) => (
                          <li key={ex.id} className="border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-zinc-50">
                            {ex.title && <p className="font-semibold mb-0.5">{ex.title}</p>}
                            {ex.description && <p className="text-[11px]">{ex.description}</p>}
                            {ex.assessmentNotes && (
                              <p className="text-[10px] text-zinc-500 mt-0.5">Assessment notes: {ex.assessmentNotes}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-[11px] text-zinc-600">
                    Use <span className="font-semibold">Scheme Builder</span> to attach this indicator to a week.
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
              <h3 className="text-xs font-semibold text-zinc-800">Curriculum Trust &amp; Source</h3>

              {!curriculum && <p className="text-[11px] text-zinc-500">Select a subject to see framework and source information.</p>}

              {curriculum && (
                <>
                  <p className="text-[11px]">
                    Framework: <span className="font-semibold">{curriculum.curriculumFramework ?? "NaCCA Curriculum (default)"}</span>
                    {curriculum.frameworkVersion && <> · Version {curriculum.frameworkVersion}</>}
                  </p>

                  <p className="text-[11px]">
                    Country: <span className="font-semibold">{curriculum.countryCode ?? "GH"}</span> · Subject:{" "}
                    <span className="font-semibold">{curriculum.name}</span> · Phase/Level:{" "}
                    <span className="font-semibold">
                      {curriculum.phase ?? "—"} / {curriculum.level ?? "—"}
                    </span>
                  </p>

                  <p className="text-[11px]">
                    Source document: <span className="font-semibold">{curriculum.sourceDocumentTitle ?? "Official NaCCA PDF"}</span>
                    {curriculum.sourceDocumentYear && <> ({curriculum.sourceDocumentYear})</>}
                  </p>

                  {selectedIndicator && (
                    <p className="text-[11px]">
                      Current focus: <span className="font-semibold">Indicator {selectedIndicator.code ?? "—"}</span>
                      {pageRangeForSelectedIndicator ? (
                        <>
                          {" "}· Pages in PDF:{" "}
                          <span className="font-semibold">
                            {pageRangeForSelectedIndicator.from === pageRangeForSelectedIndicator.to
                              ? `p. ${pageRangeForSelectedIndicator.from}`
                              : `pp. ${pageRangeForSelectedIndicator.from}–${pageRangeForSelectedIndicator.to}`}
                          </span>
                        </>
                      ) : (
                        <> · PDF page mapping will improve as seeding improves.</>
                      )}
                    </p>
                  )}

                  {curriculum.lastVerifiedAt && (
                    <p className="text-[10px] text-zinc-500">Last verified: {new Date(curriculum.lastVerifiedAt).toLocaleDateString()}</p>
                  )}
                </>
              )}
            </div>

            <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
              <h3 className="text-xs font-semibold text-zinc-800">How this connects to Lesson Notes</h3>
              <p>
                This page is <span className="font-semibold">read-only</span> for curriculum editing, but active for schemes + lesson notes.
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  Attaching indicators to weekly <span className="font-semibold">Schemes of Work</span>.
                </li>
                <li>
                  Generating NaCCA-aligned <span className="font-semibold">Lesson Notes</span>.
                </li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}