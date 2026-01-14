// src/components/teacher/TeacherLessonNotesClient.tsx
"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type LessonNoteListItem = {
  id: string;
  tenantId: string;
  teacherUserId: string;
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
  lessonTitle: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  ok: boolean;
  items?: LessonNoteListItem[];
  nextCursor?: string | null;
  error?: string;
};

type CurriculumSubjectOption = {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string;
  orderIndex: number;
};

type TeacherPhase = "KG" | "PRIMARY" | "JHS";

type TeacherScope = {
  phase: TeacherPhase;
  classLevel: string | null;
  jhsAssignments: unknown; // stored as Json in DB
  additionalDuties: string[];
} | null;

type SchemeSummaryItem = {
  id: string;
  subject: string;
  subjectSlug: string | null;
  phase: string | null;
  level: string | null;
  term: string;
  academicYear: string;
  title: string | null;
  classroomId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

type SchemesSummaryResponse = {
  ok?: boolean;
  items?: SchemeSummaryItem[];
  error?: string;
};

type Props = {
  initialTerm?: string;
  initialAcademicYear?: string;
  teacherScope?: TeacherScope;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-900`;
const btnSecondary = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;

function isValidTerm(v: string) {
  return (VALID_TERMS as readonly string[]).includes(v);
}

function isValidAcademicYear(v: string) {
  return /^\d{4}\/\d{4}$/.test(v.trim());
}

function normalizeLevelKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeSubjectKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

async function safeJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function coerceJhsAssignments(raw: unknown): Array<{ subject: string; classes: string[] }> {
  if (!Array.isArray(raw)) return [];
  const rows = raw
    .map((x: any) => ({
      subject: String(x?.subject ?? "").trim(),
      classes: Array.isArray(x?.classes)
        ? x.classes.map((c: any) => String(c ?? "").trim()).filter(Boolean)
        : [],
    }))
    .filter((r) => r.subject && r.classes.length > 0);

  return rows;
}

const LS_KEY = "edulife.lessonNotes.lastSelection.v1";

export default function TeacherLessonNotesClient({
  initialTerm = "",
  initialAcademicYear = "",
  teacherScope = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ URL is the source of truth when present
  const urlTerm = (searchParams.get("term") ?? "").trim();
  const urlAcademicYear = (searchParams.get("academicYear") ?? "").trim();

  const [items, setItems] = useState<LessonNoteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<LessonNoteStatus | "ALL">("ALL");

  // Curriculum subjects
  const [subjectOptions, setSubjectOptions] = useState<CurriculumSubjectOption[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectLoadError, setSubjectLoadError] = useState<string | null>(null);

  // Scheme summary (subject-aware gating)
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [schemesError, setSchemesError] = useState<string | null>(null);
  const [schemeIndex, setSchemeIndex] = useState<Map<string, SchemeSummaryItem>>(new Map());

  // Phase + Class filter
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [classLevel, setClassLevel] = useState<string>("");

  // Subject name + slug
  const [subject, setSubject] = useState<string>("");
  const [subjectSlug, setSubjectSlug] = useState<string>("");

  // Week / term / year
  const [weekNumber, setWeekNumber] = useState<string>("1");

  // Local state, initialized from URL first, then server props
  const [term, setTerm] = useState<string>(urlTerm || initialTerm || "");
  const [academicYear, setAcademicYear] = useState<string>(urlAcademicYear || initialAcademicYear || "");

  const [termYearLoading, setTermYearLoading] = useState(false);
  const [termYearError, setTermYearError] = useState<string | null>(null);
  const [termYearConfigured, setTermYearConfigured] = useState<boolean>(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // delete draft
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const normalizedYear = academicYear.trim();

  const filteredItems = useMemo(() => {
    if (statusFilter === "ALL") return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  // ✅ consider applied when URL matches (or URL is present and valid)
  const termYearApplied =
    Boolean(urlTerm && urlAcademicYear) &&
    urlTerm === term &&
    urlAcademicYear === normalizedYear &&
    isValidTerm(urlTerm) &&
    isValidAcademicYear(urlAcademicYear);

  const isScoped = Boolean(teacherScope?.phase);
  const isClassTeacherScoped = teacherScope?.phase === "KG" || teacherScope?.phase === "PRIMARY";
  const isJhsScoped = teacherScope?.phase === "JHS";

  const jhsAssignments = useMemo(() => coerceJhsAssignments(teacherScope?.jhsAssignments), [teacherScope]);

  // --- Scope-filtered subject options (this is the KEY fix for 3b)
  const scopedSubjectOptions = useMemo(() => {
    if (!isScoped) return subjectOptions;

    // KG/PRIMARY: lock to class level
    if (isClassTeacherScoped) {
      const key = normalizeLevelKey(teacherScope?.classLevel ?? "");
      if (!key) return [];
      return subjectOptions.filter((opt) => normalizeLevelKey(opt.level) === key);
    }

    // JHS: lock to assignments (subject + classes)
    if (isJhsScoped) {
      const allowedSubjects = new Set(jhsAssignments.map((a) => normalizeSubjectKey(a.subject)));
      const allowedLevels = new Set(
        jhsAssignments.flatMap((a) => a.classes.map((c) => normalizeLevelKey(c)))
      );

      if (!allowedSubjects.size || !allowedLevels.size) return [];
      return subjectOptions.filter((opt) => {
        const sKey = normalizeSubjectKey(opt.name);
        const lKey = normalizeLevelKey(opt.level);
        return allowedSubjects.has(sKey) && allowedLevels.has(lKey);
      });
    }

    return subjectOptions;
  }, [subjectOptions, isScoped, isClassTeacherScoped, isJhsScoped, teacherScope, jhsAssignments]);

  // Phase options derived from scoped subjects
  const phaseOptions = useMemo(
    () =>
      Array.from(
        new Set(scopedSubjectOptions.map((opt) => opt.phase).filter((p): p is string => Boolean(p)))
      ).sort(),
    [scopedSubjectOptions]
  );

  // Class/level options derived from scoped + phase
  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(
          scopedSubjectOptions
            .filter((opt) => (phaseFilter ? opt.phase === phaseFilter : true))
            .map((opt) => opt.level)
            .filter((l): l is string => Boolean(l))
        )
      ).sort(),
    [scopedSubjectOptions, phaseFilter]
  );

  // Subjects filtered by phase + class (within scope)
  const filteredSubjectOptions = useMemo(
    () =>
      scopedSubjectOptions.filter((opt) => {
        if (phaseFilter && opt.phase !== phaseFilter) return false;
        if (classLevel && opt.level !== classLevel) return false;
        return true;
      }),
    [scopedSubjectOptions, phaseFilter, classLevel]
  );

  // ✅ Sync state when URL term/year changes
  useEffect(() => {
    if (urlTerm && urlTerm !== term) setTerm(urlTerm);
    if (urlAcademicYear && urlAcademicYear !== academicYear) setAcademicYear(urlAcademicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTerm, urlAcademicYear]);

  // ✅ Restore last selection (fixes the “close laptop and it forgets” problem)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as any;

      // Only restore if URL didn't already define it
      if (!urlTerm && !urlAcademicYear) {
        if (typeof saved?.term === "string" && !term) setTerm(saved.term);
        if (typeof saved?.academicYear === "string" && !academicYear) setAcademicYear(saved.academicYear);
      }

      if (typeof saved?.phaseFilter === "string" && !phaseFilter) setPhaseFilter(saved.phaseFilter);
      if (typeof saved?.classLevel === "string" && !classLevel) setClassLevel(saved.classLevel);
      if (typeof saved?.subject === "string" && !subject) setSubject(saved.subject);
      if (typeof saved?.subjectSlug === "string" && !subjectSlug) setSubjectSlug(saved.subjectSlug);
      if (typeof saved?.weekNumber === "string" && !weekNumber) setWeekNumber(saved.weekNumber);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Auto-apply valid term/year into URL (removes annoying extra “Apply” step)
  useEffect(() => {
    const t = term.trim();
    const y = academicYear.trim();

    if (termYearLoading) return;
    if (!isValidTerm(t) || !isValidAcademicYear(y)) return;

    // if URL already matches, do nothing
    if (urlTerm === t && urlAcademicYear === y) return;

    // only auto-apply when URL is empty (so we don't fight user intent)
    if (!urlTerm && !urlAcademicYear) {
      const p = new URLSearchParams();
      p.set("term", t);
      p.set("academicYear", y);
      router.replace(`/teacher/lesson-notes?${p.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, academicYear, termYearLoading]);

  // Ensure selected subject still exists under filters
  useEffect(() => {
    if (!subject) return;
    const stillExists = filteredSubjectOptions.some((opt) => opt.name === subject);
    if (!stillExists) {
      setSubject("");
      setSubjectSlug("");
    }
  }, [filteredSubjectOptions, subject]);

  // Load tenant current term/year (defaults)
  useEffect(() => {
    let cancelled = false;

    async function loadTermYear() {
      setTermYearLoading(true);
      setTermYearError(null);

      try {
        const res = await fetch("/api/settings/current-term-year", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        const data = await safeJson<{
          ok?: boolean;
          configured?: boolean;
          term?: string | null;
          academicYear?: string | null;
          error?: string;
        }>(res);

        if (!res.ok || !data.ok) {
          if (!cancelled) setTermYearError(data.error ?? "Failed to load current term/year settings.");
          return;
        }

        if (cancelled) return;

        setTermYearConfigured(Boolean(data.configured));

        // ✅ Never clobber user input: only fill if still empty
        if (data.term) setTerm((prev) => (prev ? prev : data.term ?? ""));
        if (data.academicYear) setAcademicYear((prev) => (prev ? prev : data.academicYear ?? ""));
      } catch (err) {
        console.error("Error loading current term/year", err);
        if (!cancelled) setTermYearError("Network/server error while loading current term/year settings.");
      } finally {
        if (!cancelled) setTermYearLoading(false);
      }
    }

    void loadTermYear();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load lesson notes list
  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch("/api/teachers/lesson-notes/list", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        const data = await safeJson<ListResponse>(res);

        if (!res.ok || !data.ok || !Array.isArray(data.items)) {
          if (!cancelled) {
            setLoadError(data.error ?? "Failed to load your lesson notes.");
            setItems([]);
          }
          return;
        }

        if (!cancelled) setItems(data.items);
      } catch (err) {
        console.error("Error loading lesson notes list", err);
        if (!cancelled) {
          setLoadError("Network/server error while loading your lesson notes.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load curriculum subjects
  useEffect(() => {
    let cancelled = false;

    async function loadSubjects() {
      setSubjectLoading(true);
      setSubjectLoadError(null);

      try {
        const res = await fetch("/api/curriculum/subjects", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        const data = await safeJson<{
          ok?: boolean;
          error?: string;
          items?: CurriculumSubjectOption[];
        }>(res);

        if (!res.ok || !data.ok || !Array.isArray(data.items)) {
          if (!cancelled) {
            setSubjectLoadError(data.error ?? "Failed to load curriculum subjects.");
            setSubjectOptions([]);
          }
          return;
        }

        if (cancelled) return;

        const options = data.items;
        setSubjectOptions(options);

        // ✅ If scoped KG/PRIMARY: lock classLevel
        if (teacherScope?.phase === "KG" || teacherScope?.phase === "PRIMARY") {
          const lockedLevel = (teacherScope.classLevel ?? "").trim();
          if (lockedLevel && !classLevel) setClassLevel(lockedLevel);

          // try set phaseFilter based on any matching option (optional)
          if (!phaseFilter && lockedLevel) {
            const match = options.find((o) => String(o.level ?? "").trim() === lockedLevel);
            if (match?.phase) setPhaseFilter(match.phase);
          }
        }

        // ✅ If scoped JHS: pick first assignment if nothing chosen yet
        if (teacherScope?.phase === "JHS" && !subject && jhsAssignments.length > 0) {
          const first = jhsAssignments[0];
          setSubject(first.subject);
          // classLevel should align to one of the assigned classes (best-effort)
          const cls = first.classes[0] ?? "";
          if (cls && !classLevel) setClassLevel(cls);
        }

        // ✅ Only set a fallback initial subject if still empty
        if (!subject) {
          const scoped = (() => {
            // reuse same logic as scopedSubjectOptions, but without depending on memo
            if (!teacherScope?.phase) return options;

            if (teacherScope.phase === "KG" || teacherScope.phase === "PRIMARY") {
              const k = normalizeLevelKey(teacherScope.classLevel ?? "");
              if (!k) return [];
              return options.filter((o) => normalizeLevelKey(o.level) === k);
            }

            if (teacherScope.phase === "JHS") {
              const allowedSubjects = new Set(jhsAssignments.map((a) => normalizeSubjectKey(a.subject)));
              const allowedLevels = new Set(jhsAssignments.flatMap((a) => a.classes.map((c) => normalizeLevelKey(c))));
              if (!allowedSubjects.size || !allowedLevels.size) return [];
              return options.filter((o) => allowedSubjects.has(normalizeSubjectKey(o.name)) && allowedLevels.has(normalizeLevelKey(o.level)));
            }

            return options;
          })();

          const initial = scoped[0];
          if (initial) {
            setSubject(initial.name);
            setSubjectSlug(initial.slug);
            if (!phaseFilter && initial.phase) setPhaseFilter(initial.phase);
            if (!classLevel && initial.level) setClassLevel(initial.level);
          }
        } else {
          // If subject already chosen, keep slug in sync if we can
          const match = options.find((o) => o.name === subject);
          if (match?.slug) setSubjectSlug(match.slug);
        }
      } catch (err) {
        console.error("Error loading curriculum subjects", err);
        if (!cancelled) {
          setSubjectLoadError("Network/server error while loading curriculum subjects.");
          setSubjectOptions([]);
        }
      } finally {
        if (!cancelled) setSubjectLoading(false);
      }
    }

    void loadSubjects();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Load scheme summary when term/year is applied (subject-aware gating)
  useEffect(() => {
    let cancelled = false;

    async function loadSchemes() {
      setSchemesLoading(true);
      setSchemesError(null);

      try {
        const p = new URLSearchParams();
        p.set("mode", "summary");
        if (urlTerm) p.set("term", urlTerm);
        if (urlAcademicYear) p.set("academicYear", urlAcademicYear);

        const res = await fetch(`/api/schemes?${p.toString()}`, {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        const data = await safeJson<SchemesSummaryResponse>(res);

        if (!res.ok || !data.ok || !Array.isArray(data.items)) {
          if (!cancelled) setSchemesError(data.error ?? "Failed to load scheme summary.");
          return;
        }

        if (cancelled) return;

        const m = new Map<string, SchemeSummaryItem>();
        for (const s of data.items) {
          const subjKey = normalizeSubjectKey(s.subjectSlug ?? s.subject);
          const lvlKey = normalizeLevelKey(s.level ?? "");
          const key = `${subjKey}::${lvlKey}`;
          // Keep latest updated scheme per key
          const prev = m.get(key);
          if (!prev) m.set(key, s);
          else {
            const prevT = new Date(prev.updatedAt).getTime();
            const curT = new Date(s.updatedAt).getTime();
            if (curT >= prevT) m.set(key, s);
          }
        }

        setSchemeIndex(m);
      } catch (err) {
        console.error("Error loading schemes summary", err);
        if (!cancelled) setSchemesError("Network/server error while loading schemes summary.");
      } finally {
        if (!cancelled) setSchemesLoading(false);
      }
    }

    if (termYearApplied) void loadSchemes();
    else {
      // clear when not applied
      setSchemeIndex(new Map());
      setSchemesError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [termYearApplied, urlTerm, urlAcademicYear]);

  function handleOpenNote(id: string) {
    router.push(`/teacher/lesson-notes/${id}?step=1`);
  }

  function handleApplyTermYear() {
    setGenerateError(null);

    if (!term || !isValidTerm(term)) {
      setGenerateError("Select a valid term (1st, 2nd, or 3rd Term), then click Apply.");
      return;
    }
    if (!academicYear.trim() || !isValidAcademicYear(academicYear.trim())) {
      setGenerateError("Enter a valid academic year (e.g., 2025/2026), then click Apply.");
      return;
    }

    const p = new URLSearchParams();
    p.set("term", term);
    p.set("academicYear", academicYear.trim());

    router.push(`/teacher/lesson-notes?${p.toString()}`);
  }

  function schemeKeyForSelection() {
    const subjKey = normalizeSubjectKey(subjectSlug || subject);
    const lvlKey = normalizeLevelKey(classLevel);
    return `${subjKey}::${lvlKey}`;
  }

  const selectedScheme = useMemo(() => {
    if (!termYearApplied) return null;
    if (!subject.trim() || !classLevel.trim()) return null;
    const key = schemeKeyForSelection();
    const found = schemeIndex.get(key) ?? null;
    if (!found) return null;
    if ((found.itemCount ?? 0) <= 0) return null;
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termYearApplied, subject, subjectSlug, classLevel, schemeIndex]);

  const schemeReadyForSelection = Boolean(selectedScheme);

  function goPrepareScheme() {
    const p = new URLSearchParams();
    p.set("mode", "scheme");
    if (term) p.set("term", term);
    if (academicYear.trim()) p.set("academicYear", academicYear.trim());
    p.set("return", `/teacher/lesson-notes?term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear.trim())}`);
    router.push(`/teacher/curriculum?${p.toString()}`);
  }

  async function handleGenerateFromCurriculum() {
    setGenerateError(null);

    if (!term || !isValidTerm(term)) {
      setGenerateError("Select a valid term (1st, 2nd, or 3rd Term).");
      return;
    }
    if (!academicYear.trim() || !isValidAcademicYear(academicYear.trim())) {
      setGenerateError("Enter a valid academic year (e.g., 2025/2026).");
      return;
    }

    if (!termYearApplied) {
      setGenerateError("Click Apply to confirm this term/year before generating.");
      return;
    }

    if (!phaseFilter || !classLevel || !subject.trim()) {
      setGenerateError("Select phase, class, and subject.");
      return;
    }

    // ✅ THE FIX: subject-aware scheme gate
    if (!schemeReadyForSelection) {
      setGenerateError("No scheme of work found for this subject/class in the selected term/year. Prepare the scheme first.");
      goPrepareScheme();
      return;
    }

    const weekNumberInt = Number(weekNumber || "0");
    if (!Number.isFinite(weekNumberInt) || !Number.isInteger(weekNumberInt) || weekNumberInt <= 0) {
      setGenerateError("Week number must be a positive whole number.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/teachers/lesson-notes/generate-from-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: null,
          phase: phaseFilter,
          level: classLevel,
          subject: subject.trim(),
          term,
          academicYear: academicYear.trim(),
          weekNumber: weekNumberInt,
          lessonDate: null,

          // Optional: pass schemeId to let API enforce/align (if route supports it)
          schemeId: selectedScheme?.id ?? null,
        }),
      });

      const data = await safeJson<any>(res);

      const id: string | undefined =
        data?.note?.id ?? data?.item?.id ?? data?.existing?.id ?? data?.noteId ?? data?.id;

      if (res.status === 409 && id) {
        router.push(`/teacher/lesson-notes/${id}?step=1`);
        return;
      }

      if (!res.ok || !data?.ok || !id) {
        setGenerateError(data?.error ?? "Could not generate lesson note.");
        return;
      }

      // ✅ persist selection after successful generate
      try {
        window.localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            term,
            academicYear: academicYear.trim(),
            phaseFilter,
            classLevel,
            subject,
            subjectSlug,
            weekNumber,
          })
        );
      } catch {
        // ignore
      }

      router.push(`/teacher/lesson-notes/${id}?step=1`);
    } catch (err) {
      console.error("Error generating lesson note", err);
      setGenerateError("Network/server error while generating. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteDraft(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.status !== "DRAFT") return;

    const confirmed = window.confirm("Delete this draft lesson note permanently?");
    if (!confirmed) return;

    setDeletingId(id);
    setDeleteError(null);

    try {
      const res = await fetch("/api/teachers/lesson-notes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: id }),
      });

      const data = await safeJson<{ ok?: boolean; error?: string }>(res);

      if (!res.ok || !data.ok) {
        setDeleteError(data.error ?? "Could not delete this draft.");
        return;
      }

      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Error deleting draft", err);
      setDeleteError("Network/server error while deleting draft.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpenApprovedPdf(id: string, e: MouseEvent) {
    e.stopPropagation();
    router.push(`/teacher/lesson-notes/${id}/print`);
  }

  function handleSubjectChange(value: string) {
    setSubject(value);
    const match = filteredSubjectOptions.find((opt) => opt.name === value);
    setSubjectSlug(match?.slug ?? "");
  }

  // ✅ Persist selection frequently (even before generate)
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          term,
          academicYear: academicYear.trim(),
          phaseFilter,
          classLevel,
          subject,
          subjectSlug,
          weekNumber,
        })
      );
    } catch {
      // ignore
    }
  }, [term, academicYear, phaseFilter, classLevel, subject, subjectSlug, weekNumber]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-5">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>
                EduLife OS · Lesson Design Studio
              </span>

              {teacherScope?.phase ? (
                <span className={`${pillBase} border-zinc-200 bg-white text-zinc-700`}>
                  Teacher scope: <span className="font-semibold ml-1">{teacherScope.phase}</span>
                  {teacherScope.classLevel ? <span className="ml-1">· {teacherScope.classLevel}</span> : null}
                </span>
              ) : null}
            </div>

            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">My Lesson Notes</h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              Generate a draft, select scheme-aligned topic/indicator in Step 2, refine in Step 3, then submit.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="inline-flex flex-wrap gap-1.5">
              {(["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const).map((s) => {
                const active = statusFilter === s;
                const label = s === "ALL" ? "All statuses" : statusLabel(s as LessonNoteStatus);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s as LessonNoteStatus | "ALL")}
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
          </div>
        </header>

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

        {!loading && (
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)] gap-4 md:gap-6">
            {/* LEFT: list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-800">Your lesson notes</h2>
                {filteredItems.length > 0 && (
                  <span className="text-[11px] text-zinc-500">
                    {filteredItems.length} note{filteredItems.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {filteredItems.length === 0 && !loadError && (
                <div className="border border-dashed border-zinc-300 bg-white rounded-2xl px-4 py-6 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-800">No lesson notes yet</h3>
                  <p className="text-xs text-zinc-600 max-w-md">
                    Use <span className="font-semibold">Generate from curriculum</span> to create a draft.
                  </p>
                </div>
              )}

              {filteredItems.length > 0 && (
                <div className="space-y-2">
                  {filteredItems.map((item) => {
                    const subjectLabel = item.subject || "Subject not set";
                    const termLabel = item.term || "Term —";
                    const yearLabel = item.academicYear || "Year —";
                    const weekLabel = item.weekNumber != null ? `Week ${item.weekNumber}` : "Week —";
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
                              {item.substrand ? ` • ${item.substrand}` : ""}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {weekLabel} • Created: {formatDateShort(item.createdAt)}
                            </div>

                            {item.headteacherComment && (
                              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-2 py-1 mt-1">
                                <span className="font-semibold">Headteacher:</span> {item.headteacherComment}
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
                                {deletingId === item.id ? "Deleting…" : "Delete draft"}
                              </button>
                            )}

                            {isApproved && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenApprovedPdf(item.id, e)}
                                className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100"
                              >
                                View approved learner note (PDF)
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className={statusBadgeClasses(item.status)}>{statusLabel(item.status)}</span>
                            <span className="text-[10px] text-zinc-400">
                              Updated: {formatDateShort(item.updatedAt)}
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

            {/* RIGHT: generator */}
            <aside className="space-y-3">
              <div className="border rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-sky-50 border-emerald-100 p-4 md:p-5 space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-zinc-900">Generate from curriculum</h2>
                  <p className="text-xs text-zinc-600 max-w-xs">
                    Select phase, class, subject, week, term and academic year. Topic/indicator is chosen in Step 2.
                  </p>

                  {!termYearLoading && !termYearConfigured && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 mt-2">
                      Tenant term/year is not configured yet. You can still select a term and enter an academic year,
                      but your admin/headteacher should configure it in settings for consistency.
                    </p>
                  )}

                  {termYearError && (
                    <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 mt-2">
                      {termYearError}
                    </p>
                  )}

                  {term && normalizedYear && (
                    <p
                      className={`text-[11px] rounded-xl px-3 py-1.5 mt-2 border ${
                        termYearApplied
                          ? "text-emerald-800 bg-emerald-50 border-emerald-200"
                          : "text-zinc-700 bg-white border-zinc-200"
                      }`}
                    >
                      Term/Year: <span className="font-semibold">{term}</span> ·{" "}
                      <span className="font-semibold">{normalizedYear}</span>{" "}
                      {termYearApplied ? "✓ Applied" : "— click Apply to confirm"}
                    </p>
                  )}

                  {termYearApplied && (
                    <p
                      className={`text-[11px] rounded-xl px-3 py-1.5 mt-2 border ${
                        schemeReadyForSelection
                          ? "text-emerald-800 bg-emerald-50 border-emerald-200"
                          : "text-amber-900 bg-amber-50 border-amber-200"
                      }`}
                    >
                      Scheme gate:{" "}
                      {schemeReadyForSelection
                        ? `✓ Scheme found (${selectedScheme?.itemCount ?? 0} item(s))`
                        : "No scheme for this subject/class — generate is blocked"}
                    </p>
                  )}

                  {schemesError && (
                    <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 mt-2">
                      {schemesError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">Phase</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={phaseFilter}
                        onChange={(e) => {
                          setPhaseFilter(e.target.value);
                          setClassLevel("");
                          setSubject("");
                          setSubjectSlug("");
                        }}
                        disabled={subjectLoading || scopedSubjectOptions.length === 0 || isClassTeacherScoped}
                        title={isClassTeacherScoped ? "Locked by your Teacher Profile" : undefined}
                      >
                        <option value="">— Select phase —</option>
                        {phaseOptions.map((phase) => (
                          <option key={phase} value={phase}>
                            {phase}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">Class / Level</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={classLevel}
                        onChange={(e) => {
                          setClassLevel(e.target.value);
                          setSubject("");
                          setSubjectSlug("");
                        }}
                        disabled={subjectLoading || classOptions.length === 0 || isClassTeacherScoped}
                        title={isClassTeacherScoped ? "Locked by your Teacher Profile" : undefined}
                      >
                        <option value="">— Select class / level —</option>
                        {classOptions.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-700">Subject</label>
                    <select
                      className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      value={subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      disabled={subjectLoading || filteredSubjectOptions.length === 0}
                    >
                      {!subject && <option value="">— Select curriculum subject —</option>}
                      {filteredSubjectOptions.map((opt) => (
                        <option key={opt.id} value={opt.name}>
                          {opt.name}
                        </option>
                      ))}
                    </select>

                    {subjectLoadError && <p className="text-[11px] text-red-700 mt-1">{subjectLoadError}</p>}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">Week</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={weekNumber}
                        onChange={(e) => setWeekNumber(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">Term</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        disabled={termYearLoading}
                      >
                        <option value="">— Select term —</option>
                        <option value="1st Term">1st Term</option>
                        <option value="2nd Term">2nd Term</option>
                        <option value="3rd Term">3rd Term</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">Academic year</label>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                        placeholder="2025/2026"
                        disabled={termYearLoading}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={handleApplyTermYear}
                    disabled={termYearLoading || !term || !academicYear.trim()}
                    title="Apply term/year into URL"
                  >
                    Apply term/year
                  </button>

                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleGenerateFromCurriculum}
                    disabled={
                      generating ||
                      subjectLoading ||
                      termYearLoading ||
                      schemesLoading ||
                      !term ||
                      !academicYear.trim() ||
                      !termYearApplied ||
                      !phaseFilter ||
                      !classLevel ||
                      !subject.trim() ||
                      !schemeReadyForSelection
                    }
                  >
                    {generating ? "Generating…" : "Generate lesson note"}
                  </button>
                </div>

                {!schemeReadyForSelection && termYearApplied && (
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" className={btnSecondary} onClick={goPrepareScheme}>
                      Prepare scheme of work
                    </button>
                    <span className="text-[11px] text-zinc-600">
                      (required before generating)
                    </span>
                  </div>
                )}

                {generateError && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                    {generateError}
                  </p>
                )}
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
