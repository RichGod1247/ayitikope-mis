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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const pillBase =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium";

const cardShell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";

const sectionTitle = "text-sm font-semibold text-[#F7F4ED]";
const labelCls = "block text-[11px] font-medium text-[#C9CDD6] mb-1";
const helperCls = "mt-1 text-[10px] text-[#8F98A8]";
const inputBase =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs md:text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#1B66D1]/35 focus:border-[#1B66D1]/40 disabled:cursor-not-allowed disabled:opacity-60";
const selectBase =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs md:text-sm text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-[#1B66D1]/35 focus:border-[#1B66D1]/40 disabled:cursor-not-allowed disabled:opacity-60";
const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnOutline =
  `${btnBase} border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;
const btnPrimary =
  `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnSoftInfo =
  `${btnBase} border-cyan-300/20 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/18`;
const btnSoftSuccess =
  `${btnBase} border-emerald-300/20 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/18`;

const ACADEMIC_YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => {
  const start = 2025 + index;
  const end = start + 1;
  return {
    value: `${start}/${end}`,
    label: `${start}/${String(end).slice(-2)}`,
  };
});

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

  const fullSlash = v.match(/^(\d{4})\/(\d{4})$/);
  if (fullSlash) return `${fullSlash[1]}/${fullSlash[2]}`;

  const fullDash = v.match(/^(\d{4})-(\d{4})$/);
  if (fullDash) return `${fullDash[1]}/${fullDash[2]}`;

  const shortSlash = v.match(/^(\d{4})\/(\d{2})$/);
  if (shortSlash) {
    const start = Number(shortSlash[1]);
    const end2 = Number(shortSlash[2]);
    const century = Math.floor(start / 100) * 100;
    return `${start}/${century + end2}`;
  }

  const shortDash = v.match(/^(\d{4})-(\d{2})$/);
  if (shortDash) {
    const start = Number(shortDash[1]);
    const end2 = Number(shortDash[2]);
    const century = Math.floor(start / 100) * 100;
    return `${start}/${century + end2}`;
  }

  return v;
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

function toneNoticeClass(tone: Notice["tone"]) {
  if (tone === "ok") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }
  if (tone === "info") {
    return "border-sky-300/20 bg-sky-400/12 text-sky-100";
  }
  return "border-rose-300/20 bg-rose-400/12 text-rose-100";
}

export default function TeacherCurriculumExplorerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const schemeMode = mode === "scheme";

  const urlTerm = (searchParams.get("term") ?? "").trim();
  const urlAcademicYear = (searchParams.get("academicYear") ?? "").trim();
  const urlReturn = searchParams.get("return");

  const [schemeTerm, setSchemeTerm] = useState<string>("");
  const [schemeAcademicYear, setSchemeAcademicYear] = useState<string>("");
  const [schemeWeekNumber, setSchemeWeekNumber] = useState<string>("1");
  const [schemeNotice, setSchemeNotice] = useState<Notice | null>(null);

  const [schemeSummary, setSchemeSummary] = useState<SchemeSummary[]>([]);
  const [schemeSummaryLoading, setSchemeSummaryLoading] = useState(false);
  const [schemeSummaryError, setSchemeSummaryError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<CurriculumSubjectSummary[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");

  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumHierarchy | null>(null);

  const [selectedStrandId, setSelectedStrandId] = useState<string | null>(null);
  const [selectedSubStrandId, setSelectedSubStrandId] = useState<string | null>(null);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string | null>(null);

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
  }, [schemeMode, urlTerm, urlAcademicYear]);

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
  }, [schemeMode, schemeTerm, schemeAcademicYear]);

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
  }, [schemeMode]);

  useEffect(() => {
    if (!schemeMode) return;
    if (!curriculum) return;
    void loadSchemesForSubject();
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
      setSchemeNotice({ tone: "error", text: "Enter a valid week number (1, 2, 3…)." });
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

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-6xl space-y-5 px-0 py-0 md:space-y-6">
        <header className={cx(cardShell, "relative overflow-hidden p-5 md:p-6")}>
          <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-[#D4AF37]/14 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${pillBase} border-cyan-300/20 bg-cyan-400/12 text-cyan-100`}>
                  EduLife OS · Curriculum Explorer
                </span>
                {schemeMode ? (
                  <span className={`${pillBase} border-emerald-300/20 bg-emerald-400/12 text-emerald-100`}>
                    Mode: Scheme Builder
                  </span>
                ) : (
                  <span className="text-[11px] text-[#AEB6C4]">
                    NaCCA KG–JHS curriculum · read-only, trusted source
                  </span>
                )}
              </div>

              <h1 className="text-xl font-semibold tracking-tight text-[#F7F4ED] md:text-2xl">
                Teacher Curriculum Explorer
              </h1>

              <p className="max-w-2xl text-xs text-[#C9CDD6] md:text-sm">
                Choose a <span className="font-semibold text-[#F7F4ED]">phase, level</span> and{" "}
                <span className="font-semibold text-[#F7F4ED]">subject</span>. EduLife OS will load the official NaCCA
                structure for that subject: strands, sub-strands, content standards, indicators and exemplars.
              </p>
            </div>

            <div className="max-w-xs text-[11px] text-[#AEB6C4] md:text-right">
              <p>
                This page is the <span className="font-semibold text-[#F7F4ED]">single source of truth</span> for your
                curriculum tree. Lesson notes and Scheme of Work tools all read from here.
              </p>
            </div>
          </div>
        </header>

        {subjectsError && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-sm text-rose-100">
            {subjectsError}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)] md:gap-6">
          <div className="space-y-4">
            <div className={cx(cardShell, "p-4 md:p-5")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={sectionTitle}>1 · Choose phase, level &amp; subject</h2>
                {subjectsLoading && <span className="text-[11px] text-[#8F98A8]">Loading subjects…</span>}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={labelCls}>Phase</label>
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
                  <p className={helperCls}>Examples: KG, Lower Primary, Upper Primary, JHS…</p>
                </div>

                <div>
                  <label className={labelCls}>Level / Class</label>
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
                  <p className={helperCls}>Examples: KG1, KG2, B1… JHS1…</p>
                </div>

                <div>
                  <label className={labelCls}>Subject</label>
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
                  <p className={helperCls}>Real subjects from your seeded NaCCA data only.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
                <p className="max-w-sm text-[11px] text-[#8F98A8]">
                  As soon as you pick a subject, EduLife OS will automatically load the{" "}
                  <span className="font-semibold text-[#F7F4ED]">full curriculum tree</span>.
                </p>
                <div className="text-[11px] text-[#8F98A8]">
                  Status:{" "}
                  {curriculumLoading ? "Loading curriculum…" : hasCurriculum ? "Curriculum loaded" : "No curriculum loaded yet"}
                </div>
              </div>
            </div>

            {curriculumError && (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-sm text-rose-100">
                {curriculumError}
              </div>
            )}

            <div className={cx(cardShell, "p-4 md:p-5")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={sectionTitle}>2 · Curriculum tree (NaCCA)</h2>
                {curriculumLoading && <span className="text-[11px] text-[#8F98A8]">Loading…</span>}
              </div>

              {!curriculumLoading && !hasCurriculum && (
                <p className="mt-3 text-xs text-[#8F98A8]">
                  Select a phase, level and subject above to see strands, sub-strands, standards and indicators.
                </p>
              )}

              {hasCurriculum && curriculum && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-[11px] text-[#C9CDD6]">
                    <p className="text-[12px] font-semibold text-[#F7F4ED]">{curriculum.name}</p>
                    <p className="mt-1">
                      Phase: <span className="font-semibold text-[#F7F4ED]">{curriculum.phase ?? "—"}</span> • Level:{" "}
                      <span className="font-semibold text-[#F7F4ED]">{curriculum.level ?? "—"}</span>
                    </p>
                    {curriculum.description && <p className="mt-1 text-[10px] text-[#8F98A8]">{curriculum.description}</p>}
                  </div>

                  <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                    {curriculum.strands.map((strand) => {
                      const isStrandSelected = strand.id === selectedStrandId;
                      return (
                        <div key={strand.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#07111F]/70">
                          <button
                            type="button"
                            className={cx(
                              "w-full px-3 py-3 text-left transition",
                              isStrandSelected
                                ? "bg-[linear-gradient(135deg,#0C1730,#10244A)] text-[#F7F4ED]"
                                : "bg-transparent text-[#F7F4ED] hover:bg-white/[0.04]"
                            )}
                            onClick={() => {
                              setSelectedStrandId(strand.id);
                              setSelectedSubStrandId(null);
                              setSelectedIndicatorId(null);
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-0.5">
                                <div className="text-[12px] font-semibold">
                                  {strand.code ? `${strand.code} · ` : ""}
                                  {strand.title || "Strand"}
                                </div>
                                {strand.description && (
                                  <div className="line-clamp-2 text-[11px] text-[#C9CDD6]">{strand.description}</div>
                                )}
                              </div>
                              <span className="text-[10px] text-[#AEB6C4]">
                                {strand.subStrands.length} sub-strand{strand.subStrands.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </button>

                          {isStrandSelected && strand.subStrands.length > 0 && (
                            <div className="space-y-2 border-t border-white/10 bg-[#05070B]/40 px-3 py-3">
                              {strand.subStrands.map((sub) => {
                                const isSubSelected = sub.id === selectedSubStrandId;
                                return (
                                  <div key={sub.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                                    <button
                                      type="button"
                                      className={cx(
                                        "w-full px-3 py-2 text-left transition",
                                        isSubSelected
                                          ? "bg-[linear-gradient(135deg,#1A1034,#231A4B)] text-[#F7F4ED]"
                                          : "bg-transparent text-[#F7F4ED] hover:bg-white/[0.04]"
                                      )}
                                      onClick={() => {
                                        setSelectedSubStrandId(sub.id);
                                        setSelectedIndicatorId(null);
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-0.5">
                                          <div className="text-[11px] font-medium">
                                            {sub.code ? `${sub.code} · ` : ""}
                                            {sub.title || "Sub-strand"}
                                          </div>
                                          {sub.description && (
                                            <div className="line-clamp-2 text-[10px] text-[#C9CDD6]">{sub.description}</div>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-[#AEB6C4]">
                                          {sub.contentStandards.length} standard{sub.contentStandards.length === 1 ? "" : "s"}
                                        </span>
                                      </div>
                                    </button>

                                    {isSubSelected && sub.contentStandards.length > 0 && (
                                      <div className="space-y-2 border-t border-white/10 bg-[#07111F]/55 px-3 py-2">
                                        {sub.contentStandards.map((cs) => (
                                          <div key={cs.id} className="rounded-lg border border-white/10 bg-[#05070B]/50 px-2.5 py-2">
                                            <div className="text-[10px] font-semibold text-[#E8C96A]">
                                              {cs.code ? `${cs.code} · ` : ""}
                                              {cs.description || "Content standard"}
                                            </div>

                                            {cs.indicators.length > 0 && (
                                              <div className="mt-2 space-y-1">
                                                {cs.indicators.map((ind) => {
                                                  const isIndSelected = ind.id === selectedIndicatorId;
                                                  return (
                                                    <button
                                                      key={ind.id}
                                                      type="button"
                                                      className={cx(
                                                        "w-full rounded-lg border px-2 py-1.5 text-left text-[10px] transition",
                                                        isIndSelected
                                                          ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                                                          : "border-emerald-300/20 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/18"
                                                      )}
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

          <aside className="space-y-4">
            {schemeMode && (
              <div className={cx(cardShell, "p-4 md:p-5")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className={sectionTitle}>Scheme Builder</h2>
                    <p className="mt-1 text-[11px] text-[#C9CDD6]">
                      Build your Scheme of Work for <span className="font-semibold text-[#F7F4ED]">{schemeTerm || "—"}</span>{" "}
                      <span className="font-semibold text-[#F7F4ED]">{schemeAcademicYear || ""}</span>. Add indicators week-by-week.
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

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Term</label>
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
                    <label className={labelCls}>Academic year</label>
                    <select
                      className={selectBase}
                      value={schemeAcademicYear}
                      onChange={(e) => setSchemeAcademicYear(normalizeAcademicYearClient(e.target.value))}
                    >
                      <option value="">— Select academic year —</option>
                      {ACADEMIC_YEAR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 items-end gap-2">
                  <div>
                    <label className={labelCls}>Week</label>
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

                {schemesLoading && <p className="mt-3 text-[11px] text-[#8F98A8]">Loading schemes for this subject…</p>}
                {schemesError && <p className="mt-3 text-[11px] text-rose-200">{schemesError}</p>}

                {!schemesLoading && !schemesError && curriculum && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-[11px] text-[#C9CDD6]">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Subject schemes ({schemeTerm} {schemeAcademicYear}):{" "}
                        <span className="font-semibold text-[#F7F4ED]">{schemes.length}</span>
                      </span>

                      {schemes.length > 0 && (
                        <select
                          className="rounded-lg border border-white/10 bg-[#05070B] px-2 py-1 text-[11px] text-[#F7F4ED]"
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
                          <span className="font-semibold text-[#F7F4ED]">Checking…</span>
                        ) : canReturnToLessonNotes ? (
                          <span className="font-semibold text-emerald-100">READY</span>
                        ) : (
                          <span className="font-semibold text-amber-100">NOT READY</span>
                        )}
                      </span>
                      {schemeSummaryError && <span className="text-rose-200">{schemeSummaryError}</span>}
                    </div>
                  </div>
                )}

                {schemeNotice && (
                  <p className={cx("mt-3 rounded-xl border px-3 py-1.5 text-[11px]", toneNoticeClass(schemeNotice.tone))}>
                    {schemeNotice.text}
                  </p>
                )}
              </div>
            )}

            <div className={cx(cardShell, "p-4 md:p-5")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={sectionTitle}>3 · Focus indicator &amp; details</h2>

                {selectedIndicator && schemeMode && (
                  <button
                    type="button"
                    className={btnPrimary + " h-8 text-[11px]"}
                    onClick={handleAddSelectedIndicatorToScheme}
                    disabled={addToSchemeSaving || !schemeTerm || !schemeAcademicYear}
                  >
                    {addToSchemeSaving ? "Saving…" : "Add to Scheme"}
                  </button>
                )}
              </div>

              {!selectedIndicator && (
                <p className="mt-3 text-xs text-[#8F98A8]">
                  Click any <span className="font-semibold text-[#F7F4ED]">indicator</span> on the left to see details here.
                </p>
              )}

              {selectedIndicator && selectedSubStrand && (
                <div className="mt-4 space-y-3 text-xs text-[#C9CDD6]">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">Indicator</div>
                    <p className="text-[13px] font-semibold text-[#F7F4ED]">
                      {selectedIndicator.code && <span>{selectedIndicator.code} · </span>}
                      {selectedIndicator.description}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">Content standard</div>
                    <p>
                      {(() => {
                        if (!contentStandardForSelectedIndicator) return "Content standard not located for this indicator.";
                        const cs = contentStandardForSelectedIndicator;
                        return cs.code ? `${cs.code} · ${cs.description}` : cs.description || "Content standard text not available.";
                      })()}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">Strand &amp; Sub-strand</div>
                    <p>
                      {selectedStrand && (
                        <span>
                          <span className="font-semibold text-[#F7F4ED]">
                            {selectedStrand.code ? `${selectedStrand.code} · ` : ""}
                            {selectedStrand.title}
                          </span>
                          {" · "}
                        </span>
                      )}
                      <span className="font-semibold text-[#F7F4ED]">
                        {selectedSubStrand.code ? `${selectedSubStrand.code} · ` : ""}
                        {selectedSubStrand.title}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">Exemplars (from curriculum)</div>

                    {selectedIndicator.exemplars.length === 0 && (
                      <p className="text-[11px] text-[#8F98A8]">
                        No exemplars were attached to this indicator in the seed data yet.
                      </p>
                    )}

                    {selectedIndicator.exemplars.length > 0 && (
                      <ul className="space-y-1.5">
                        {selectedIndicator.exemplars.map((ex) => (
                          <li
                            key={ex.id}
                            className="rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-2"
                          >
                            {ex.title && <p className="mb-0.5 font-semibold text-[#F7F4ED]">{ex.title}</p>}
                            {ex.description && <p className="text-[11px] text-[#C9CDD6]">{ex.description}</p>}
                            {ex.assessmentNotes && (
                              <p className="mt-0.5 text-[10px] text-[#8F98A8]">Assessment notes: {ex.assessmentNotes}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-t border-dashed border-white/10 pt-2 text-[11px] text-[#AEB6C4]">
                    Use <span className="font-semibold text-[#F7F4ED]">Scheme Builder</span> to attach this indicator to a week.
                  </div>
                </div>
              )}
            </div>

            <div className={cx(cardShell, "p-4 md:p-5 text-xs text-[#C9CDD6]")}>
              <h3 className="text-xs font-semibold text-[#F7F4ED]">Curriculum Trust &amp; Source</h3>

              {!curriculum && (
                <p className="mt-2 text-[11px] text-[#8F98A8]">
                  Select a subject to see framework and source information.
                </p>
              )}

              {curriculum && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px]">
                    Framework:{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {curriculum.curriculumFramework ?? "NaCCA Curriculum (default)"}
                    </span>
                    {curriculum.frameworkVersion && <> · Version {curriculum.frameworkVersion}</>}
                  </p>

                  <p className="text-[11px]">
                    Country: <span className="font-semibold text-[#F7F4ED]">{curriculum.countryCode ?? "GH"}</span> · Subject:{" "}
                    <span className="font-semibold text-[#F7F4ED]">{curriculum.name}</span> · Phase/Level:{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {curriculum.phase ?? "—"} / {curriculum.level ?? "—"}
                    </span>
                  </p>

                  <p className="text-[11px]">
                    Source document:{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {curriculum.sourceDocumentTitle ?? "Official NaCCA PDF"}
                    </span>
                    {curriculum.sourceDocumentYear && <> ({curriculum.sourceDocumentYear})</>}
                  </p>

                  {selectedIndicator && (
                    <p className="text-[11px]">
                      Current focus:{" "}
                      <span className="font-semibold text-[#F7F4ED]">Indicator {selectedIndicator.code ?? "—"}</span>
                      {pageRangeForSelectedIndicator ? (
                        <>
                          {" "}· Pages in PDF:{" "}
                          <span className="font-semibold text-[#F7F4ED]">
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
                    <p className="text-[10px] text-[#8F98A8]">
                      Last verified: {new Date(curriculum.lastVerifiedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className={cx(cardShell, "p-4 md:p-5 text-xs text-[#C9CDD6]")}>
              <h3 className="text-xs font-semibold text-[#F7F4ED]">How this connects to Lesson Notes</h3>
              <p className="mt-2">
                This page is <span className="font-semibold text-[#F7F4ED]">read-only</span> for curriculum editing, but active for
                schemes + lesson notes.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-[#C9CDD6]">
                <li>
                  Attaching indicators to weekly <span className="font-semibold text-[#F7F4ED]">Schemes of Work</span>.
                </li>
                <li>
                  Generating NaCCA-aligned <span className="font-semibold text-[#F7F4ED]">Lesson Notes</span>.
                </li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}