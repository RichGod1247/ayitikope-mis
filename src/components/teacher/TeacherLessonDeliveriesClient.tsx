// src/components/teacher/TeacherLessonDeliveriesClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type ClassroomPick = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
  allowedSubjects?: string[] | null;
  scopeSource?: string | null;
};

type TeacherPhaseCode = "KG" | "PRIMARY" | "JHS" | null;

type ContextOk = {
  ok: true;
  term: string;
  academicYear: string;
  defaultClassroomId: string | null;
  classrooms: ClassroomPick[];
  teacherPhase: TeacherPhaseCode;
};

type ContextErr = { ok: false; error: string };
type ContextResponse = ContextOk | ContextErr;

type ApprovedNote = {
  id: string;
  classroomId: string | null;
  teacherUserId: string;
  subject: string;
  term: string;
  academicYear: string;
  lessonDate?: string | null;
  lessonTitle?: string | null;
  curriculumUnitId?: string | null;
  contentStandard?: string | null;
  indicator?: string | null;
  approvedAt?: string | null;
};

type ApprovedNotesOk = {
  ok: true;
  items: ApprovedNote[];
};

type ApprovedNotesErr = { ok: false; error: string };
type ApprovedNotesResponse = ApprovedNotesOk | ApprovedNotesErr;

type LessonDeliveryAssessmentItem = {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  weighting?: number | null;
  status: string;
  date?: string | null;
  assessmentPolicyId?: string | null;
  policyComponentId?: string | null;
  componentCode?: string | null;
  templateKey?: string | null;
  sortOrder?: number | null;
  isRequired?: boolean | null;
  publishedAt?: string | null;
  lockedAt?: string | null;
  scoresCount: number;
};

type LessonDeliveryItem = {
  id: string;
  classroomId: string;
  teacherUserId?: string;
  term: string;
  academicYear: string;
  subject: string;
  dateTaught?: string | null;
  lessonNoteId?: string | null;
  curriculumUnitId?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  assessmentItems?: LessonDeliveryAssessmentItem[];
};

type LessonDeliveryListOk = {
  ok: true;
  items: LessonDeliveryItem[];
};

type LessonDeliveryListErr = { ok: false; error: string };
type LessonDeliveryListResponse = LessonDeliveryListOk | LessonDeliveryListErr;

type SaveState = "idle" | "saving" | "saved" | "error";

const readableFieldStyle = {
  color: "#0f172a",
  WebkitTextFillColor: "#0f172a",
  opacity: 1,
} as React.CSSProperties;

const readableFieldClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-white disabled:text-slate-900 disabled:opacity-100";

const readableReadonlyFieldClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 shadow-sm outline-none read-only:bg-white read-only:text-slate-900";

const readableTextareaClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 shadow-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-white disabled:text-slate-900 disabled:opacity-100";

const readableOptionClass = "bg-white text-slate-900";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function subjectKey(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameSubject(a: unknown, b: unknown) {
  return subjectKey(a) === subjectKey(b);
}

function classAllowsSubject(c: ClassroomPick, subject: string) {
  const s = cleanStr(subject);
  if (!s) return true;

  if (!Array.isArray(c.allowedSubjects)) return true;
  if (c.allowedSubjects.length === 0) return false;

  return c.allowedSubjects.some((x) => sameSubject(x, s));
}

function classSubjectOptions(list: ClassroomPick[]) {
  const seen = new Map<string, string>();

  for (const c of list) {
    if (!Array.isArray(c.allowedSubjects)) continue;

    for (const subject of c.allowedSubjects) {
      const label = cleanStr(subject);
      if (!label) continue;
      const key = subjectKey(label);
      if (!seen.has(key)) seen.set(key, label);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    return `JHS${n - 6}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function levelTokenLabel(token: string | null): string {
  if (!token) return "";
  if (/^KG[12]$/.test(token)) return `KG ${token.slice(2)}`;
  if (/^B[1-6]$/.test(token)) return `Basic ${token.slice(1)}`;
  if (/^JHS[1-3]$/.test(token)) return `JHS ${token.slice(3)}`;
  return token;
}

function levelTokenOrder(token: string | null): number {
  if (!token) return 999;
  if (/^KG[12]$/.test(token)) return Number(token.slice(2));
  if (/^B[1-6]$/.test(token)) return 10 + Number(token.slice(1));
  if (/^JHS[1-3]$/.test(token)) return 20 + Number(token.slice(3));
  return 999;
}

function getLevelTokenForClassroom(c: ClassroomPick): string | null {
  return normalizeLevelToken(c.grade) ?? normalizeLevelToken(c.name);
}

function singleStreamLabel(c: ClassroomPick) {
  const token = getLevelTokenForClassroom(c);
  return levelTokenLabel(token) || fullClassroomLabel(c);
}

function hasDuplicateLevelTokens(list: ClassroomPick[]) {
  const seen = new Set<string>();

  for (const c of list) {
    const token = getLevelTokenForClassroom(c);
    if (!token) continue;
    if (seen.has(token)) return true;
    seen.add(token);
  }

  return false;
}

function pickSingleStreamRepresentative(
  group: ClassroomPick[],
  preferredClassroomId: string | null
): ClassroomPick | null {
  if (!group.length) return null;

  const noArm = group.find((c) => cleanStr(c.arm) === "");
  if (noArm) return noArm;

  if (preferredClassroomId) {
    const preferred = group.find((c) => c.id === preferredClassroomId);
    if (preferred) return preferred;
  }

  return [...group].sort((a, b) => {
    const armCmp = cleanStr(a.arm).localeCompare(cleanStr(b.arm));
    if (armCmp !== 0) return armCmp;
    return fullClassroomLabel(a).localeCompare(fullClassroomLabel(b));
  })[0];
}

function buildSingleStreamClassrooms(
  list: ClassroomPick[],
  preferredClassroomId: string | null
): ClassroomPick[] {
  const grouped = new Map<string, ClassroomPick[]>();
  const others: ClassroomPick[] = [];

  for (const c of list) {
    const token = getLevelTokenForClassroom(c);

    if (!token) {
      others.push(c);
      continue;
    }

    const arr = grouped.get(token) ?? [];
    arr.push(c);
    grouped.set(token, arr);
  }

  const picked: ClassroomPick[] = [];

  for (const token of Array.from(grouped.keys()).sort((a, b) => {
    const diff = levelTokenOrder(a) - levelTokenOrder(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  })) {
    const representative = pickSingleStreamRepresentative(
      grouped.get(token) ?? [],
      preferredClassroomId
    );

    if (representative) picked.push(representative);
  }

  return [...picked, ...others];
}

function safeJson<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as T;
}

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function fullClassroomLabel(c: ClassroomPick) {
  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade) {
    return `${name}${grade ? ` (${grade}${arm ? ` ${arm}` : ""})` : ""}`;
  }

  return name || "Classroom";
}

function noteLabel(n: ApprovedNote) {
  const parts: string[] = [];
  const dt = formatDate(n.lessonDate);
  if (dt !== "—") parts.push(dt);
  if (cleanStr(n.subject)) parts.push(n.subject);
  if (cleanStr(n.lessonTitle)) parts.push(n.lessonTitle!);
  return parts.join(" • ") || n.id;
}

function deliveryLabel(d: LessonDeliveryItem) {
  const parts: string[] = [];
  const dt = formatDate(d.dateTaught);
  if (dt !== "—") parts.push(dt);
  if (cleanStr(d.subject)) parts.push(d.subject);
  if (cleanStr(d.indicatorCode)) parts.push(d.indicatorCode!);
  else if (cleanStr(d.contentStandardCode)) parts.push(d.contentStandardCode!);
  if (d.lessonNoteId) parts.push("Lesson note linked");
  return parts.join(" • ") || d.id;
}

function statusBadgeClass(status: unknown) {
  const s = cleanStr(status).toUpperCase();

  if (s === "LOCKED") {
    return "rounded-full border border-slate-400 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700";
  }

  if (s === "PUBLISHED") {
    return "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700";
  }

  return "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700";
}

function createAssessmentHrefFromDelivery(d: LessonDeliveryItem) {
  const params = new URLSearchParams({
    classroomId: d.classroomId,
    term: d.term,
    academicYear: d.academicYear,
    subject: d.subject,
    lessonDeliveryId: d.id,
  });

  if (d.curriculumUnitId) params.set("curriculumUnitId", d.curriculumUnitId);
  if (d.lessonNoteId) params.set("lessonNoteId", d.lessonNoteId);

  return `/teacher/assessment?${params.toString()}`;
}

export default function TeacherLessonDeliveriesClient() {
  const searchParams = useSearchParams();

  const initialClassroomId = searchParams.get("classroomId") ?? "";
  const initialTerm = searchParams.get("term") ?? "";
  const initialAcademicYear = searchParams.get("academicYear") ?? "";

  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomPick[]>([]);
  const [teacherPhase, setTeacherPhase] = useState<TeacherPhaseCode>(null);
  const [selectedSubjectScope, setSelectedSubjectScope] = useState<string>("");
  const [showMultiStream, setShowMultiStream] = useState(false);
  const [classroomId, setClassroomId] = useState<string>(initialClassroomId);
  const [term, setTerm] = useState<string>(initialTerm || "1st Term");
  const [academicYear, setAcademicYear] = useState<string>(initialAcademicYear || "2025/2026");

  const [approvedNotes, setApprovedNotes] = useState<ApprovedNote[]>([]);
  const [approvedNotesLoading, setApprovedNotesLoading] = useState(false);
  const [approvedNotesError, setApprovedNotesError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<LessonDeliveryItem[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);

  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [dateTaught, setDateTaught] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedNote = useMemo(
    () => approvedNotes.find((n) => n.id === selectedNoteId) ?? null,
    [approvedNotes, selectedNoteId]
  );

  const assignmentSubjectOptions = useMemo(
    () => classSubjectOptions(classrooms),
    [classrooms]
  );

  const showAssignmentSubjectFilter =
    teacherPhase === "JHS" && assignmentSubjectOptions.length > 0;

const subjectScopedClassrooms = useMemo(() => {
  if (!selectedSubjectScope) return classrooms;
  return classrooms.filter((c) => classAllowsSubject(c, selectedSubjectScope));
}, [classrooms, selectedSubjectScope]);

const canToggleMultiStream = useMemo(
  () => hasDuplicateLevelTokens(subjectScopedClassrooms),
  [subjectScopedClassrooms]
);

const visibleClassrooms = useMemo(() => {
  if (!canToggleMultiStream) return subjectScopedClassrooms;
  if (showMultiStream) return subjectScopedClassrooms;

  return buildSingleStreamClassrooms(subjectScopedClassrooms, classroomId || null);
}, [canToggleMultiStream, showMultiStream, subjectScopedClassrooms, classroomId]);

  const assessmentHref = useMemo(() => {
    if (!classroomId) return "/teacher/assessment";
    const params = new URLSearchParams({ classroomId, term, academicYear });
    return `/teacher/assessment?${params.toString()}`;
  }, [classroomId, term, academicYear]);

const lessonNotesHref = useMemo(() => {
  if (!classroomId) return "/teacher/lesson-notes";
  const params = new URLSearchParams({ classroomId, term, academicYear });
  return `/teacher/lesson-notes?${params.toString()}`;
}, [classroomId, term, academicYear]);

  useEffect(() => {
    const boot = async () => {
      try {
        setCtxLoading(true);
        setCtxError(null);

        const res = await fetch("/api/teacher/assessment/context", {
          cache: "no-store",
        });
        const raw = await res.json().catch(() => null);
        const json = safeJson<ContextResponse>(raw);

        if (!json) {
          setCtxError(`Invalid context response (HTTP ${res.status}).`);
          return;
        }

        if (!res.ok || !json.ok) {
          setCtxError((json as any)?.error || "Failed to load context.");
          return;
        }

        const nextClassrooms = Array.isArray(json.classrooms) ? json.classrooms : [];
        const nextSubjectOptions = classSubjectOptions(nextClassrooms);

        setClassrooms(nextClassrooms);
        setTeacherPhase(json.teacherPhase ?? null);

        setSelectedSubjectScope((prev) => {
          if (prev && nextSubjectOptions.some((s) => sameSubject(s, prev))) {
            return nextSubjectOptions.find((s) => sameSubject(s, prev)) || prev;
          }

          return nextSubjectOptions[0] || "";
        });

        if (!initialClassroomId) {
          setClassroomId(json.defaultClassroomId || nextClassrooms[0]?.id || "");
        }
        if (!initialTerm) setTerm(json.term || "1st Term");
        if (!initialAcademicYear) setAcademicYear(json.academicYear || "2025/2026");
      } catch {
        setCtxError("Failed to load delivery context.");
      } finally {
        setCtxLoading(false);
      }
    };

    boot();
  }, [initialAcademicYear, initialClassroomId, initialTerm]);

  useEffect(() => {
    if (visibleClassrooms.length === 0) {
      if (classroomId) setClassroomId("");
      return;
    }

    if (visibleClassrooms.some((c) => c.id === classroomId)) return;

    setClassroomId(visibleClassrooms[0]?.id ?? "");
  }, [visibleClassrooms, classroomId]);

  useEffect(() => {
    const loadApprovedNotes = async () => {
      if (!classroomId || !term || !academicYear) {
        setApprovedNotes([]);
        return;
      }

      try {
        setApprovedNotesLoading(true);
        setApprovedNotesError(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        if (selectedSubjectScope) params.set("subject", selectedSubjectScope);
        const res = await fetch(
          `/api/teacher/lesson-deliveries/approved-notes/list?${params.toString()}`,
          { cache: "no-store" }
        );

        const raw = await res.json().catch(() => null);
        const json = safeJson<ApprovedNotesResponse>(raw);

        if (!json) throw new Error(`Invalid approved-notes response (HTTP ${res.status}).`);
        if (!res.ok || !json.ok) {
          throw new Error((json as any)?.error || `HTTP ${res.status}`);
        }

        const next = Array.isArray(json.items) ? json.items : [];
        setApprovedNotes(next);

        setSelectedNoteId((prev) => {
          if (prev && next.some((n) => n.id === prev)) return prev;
          return next[0]?.id || "";
        });
      } catch (err: any) {
        setApprovedNotes([]);
        setApprovedNotesError(String(err?.message || "Failed to load approved lesson notes."));
      } finally {
        setApprovedNotesLoading(false);
      }
    };

    loadApprovedNotes();
  }, [classroomId, term, academicYear, selectedSubjectScope]);

  useEffect(() => {
    const loadDeliveries = async () => {
      if (!classroomId || !term || !academicYear) {
        setDeliveries([]);
        return;
      }

      try {
        setDeliveriesLoading(true);
        setDeliveriesError(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        if (selectedSubjectScope) params.set("subject", selectedSubjectScope);

        const res = await fetch(`/api/teacher/lesson-deliveries/list?${params.toString()}`, {
          cache: "no-store",
        });

        const raw = await res.json().catch(() => null);
        const json = safeJson<LessonDeliveryListResponse>(raw);

        if (!json) throw new Error(`Invalid lesson-deliveries response (HTTP ${res.status}).`);
        if (!res.ok || !json.ok) {
          throw new Error((json as any)?.error || `HTTP ${res.status}`);
        }

        setDeliveries(Array.isArray(json.items) ? json.items : []);
      } catch (err: any) {
        setDeliveries([]);
        setDeliveriesError(String(err?.message || "Failed to load lesson deliveries."));
      } finally {
        setDeliveriesLoading(false);
      }
    };

    loadDeliveries();
    }, [classroomId, term, academicYear, selectedSubjectScope]);

  async function handleCreateDelivery(e: React.FormEvent) {
    e.preventDefault();

    if (!classroomId || !selectedNote || !dateTaught) {
      setActionError("Select a class, an approved lesson note, and a date taught.");
      setSaveState("error");
      return;
    }

    try {
      setSaveState("saving");
      setActionError(null);

      const body = {
        classroomId,
        subject: selectedNote.subject,
        term,
        academicYear,
        dateTaught,
        lessonNoteId: selectedNote.id,
        curriculumUnitId: selectedNote.curriculumUnitId ?? null,
        notes: notes.trim() || null,
      };

      const res = await fetch("/api/teacher/lesson-deliveries/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await res.json().catch(() => null);
      const json = safeJson<any>(raw);

      if (!res.ok || !json?.ok) {
        setActionError(String(json?.error || "Failed to record lesson delivery."));
        setSaveState("error");
        return;
      }

      const params = new URLSearchParams({ classroomId, term, academicYear });
      const refetch = await fetch(`/api/teacher/lesson-deliveries/list?${params.toString()}`, {
        cache: "no-store",
      });
      const refetchRaw = await refetch.json().catch(() => null);
      const refetchJson = safeJson<LessonDeliveryListResponse>(refetchRaw);

      if (refetch.ok && refetchJson?.ok) {
        setDeliveries(Array.isArray(refetchJson.items) ? refetchJson.items : []);
      }

      setNotes("");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 900);
    } catch {
      setActionError("Unexpected error recording lesson delivery.");
      setSaveState("error");
    }
  }

  if (ctxLoading) {
    return <div className="p-6 text-sm text-slate-600">Loading lesson-delivery context…</div>;
  }

  if (ctxError) {
    return <div className="p-6 text-sm text-rose-700">{ctxError}</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Lesson delivery tracker
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Approved lesson notes do not count as delivered until a delivery record is created.
            </p>
          </div>

          <Link
            href={assessmentHref}
            className="inline-flex items-center rounded-full border border-indigo-500 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Go to assessment
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Record a delivered lesson</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Delivery is created from an approved lesson note. That is the evidence link.
              </p>
            </div>

            {actionError ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {actionError}
              </div>
            ) : null}

            <form onSubmit={handleCreateDelivery} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                {showAssignmentSubjectFilter ? (
  <div className="space-y-1 sm:col-span-2">
    <label className="block text-[11px] font-medium text-slate-700">
      Subject assignment
    </label>
    <select
      className={readableFieldClass}
      style={readableFieldStyle}
      value={selectedSubjectScope}
      onChange={(e) => setSelectedSubjectScope(e.target.value)}
    >
      {assignmentSubjectOptions.map((s) => (
        <option key={s} value={s} className={readableOptionClass}>
          {s}
        </option>
      ))}
    </select>
    <p className="text-[10px] text-slate-500">
      Class options below are filtered by the selected subject assignment.
    </p>
  </div>
) : null}
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-700">Class</label>
<select
  className={readableFieldClass}
  style={readableFieldStyle}
  value={classroomId}
  onChange={(e) => setClassroomId(e.target.value)}
>
  {visibleClassrooms.length === 0 ? (
    <option value="" className={readableOptionClass}>
      No assigned classes for selected subject
    </option>
  ) : null}

{visibleClassrooms.map((c) => (
  <option key={c.id} value={c.id} className={readableOptionClass}>
    {canToggleMultiStream && !showMultiStream
      ? singleStreamLabel(c)
      : fullClassroomLabel(c)}
  </option>
))}
</select>
{canToggleMultiStream ? (
  <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-slate-600">
    <input
      type="checkbox"
      checked={showMultiStream}
      onChange={(e) => setShowMultiStream(e.target.checked)}
    />
    Show multi-stream classes
  </label>
) : null}

{canToggleMultiStream && !showMultiStream ? (
  <p className="text-[10px] text-slate-500">
    Showing single-stream view. Turn on multi-stream only when you need A/B/C/D.
  </p>
) : null}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Term</label>
<input
  className={readableFieldClass}
  style={readableFieldStyle}
  value={term}
  onChange={(e) => setTerm(e.target.value)}
/>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Academic year</label>
<input
  className={readableFieldClass}
  style={readableFieldStyle}
  value={academicYear}
  onChange={(e) => setAcademicYear(e.target.value)}
/>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Approved lesson note
                  </label>
<select
  className={readableFieldClass}
  style={readableFieldStyle}
  value={selectedNoteId}
  onChange={(e) => setSelectedNoteId(e.target.value)}
  disabled={approvedNotesLoading || approvedNotes.length === 0}
>
                    {approvedNotes.length === 0 ? (
<option value="" className={readableOptionClass}>
  {approvedNotesLoading ? "Loading approved notes..." : "No approved notes found"}
</option>
                    ) : (
                      approvedNotes.map((n) => (
<option key={n.id} value={n.id} className={readableOptionClass}>
  {noteLabel(n)}
</option>
                      ))
                    )}
                  </select>

                  {approvedNotesError ? (
                    <p className="text-[10px] text-amber-700">{approvedNotesError}</p>
                  ) : null}
                  {!approvedNotesLoading && !approvedNotesError && approvedNotes.length === 0 ? (
  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
    No approved lesson notes are available for this class, term, and academic year.
    Lesson delivery can only be recorded from an approved lesson note.
    <div className="mt-2">
      <Link href={lessonNotesHref} className="font-semibold underline">
        Create or submit a lesson note for approval
      </Link>
    </div>
  </div>
) : null}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Date taught</label>
<input
  type="date"
  className={readableFieldClass}
  style={readableFieldStyle}
  value={dateTaught}
  onChange={(e) => setDateTaught(e.target.value)}
/>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Subject</label>
<input
  readOnly
  className={readableReadonlyFieldClass}
  style={readableFieldStyle}
  value={selectedNote?.subject || ""}
/>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Delivery notes (optional)
                  </label>
<textarea
  rows={3}
  className={readableTextareaClass}
  style={readableFieldStyle}
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
/>
                </div>
              </div>

              {selectedNote ? (
                <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800">
                  Selected note: <span className="font-medium">{noteLabel(selectedNote)}</span>
                  {selectedNote.curriculumUnitId ? (
                    <span className="ml-1 text-indigo-700">• Curriculum unit attached</span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saveState === "saving" || !selectedNoteId}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saveState === "saving"
  ? "Recording..."
  : !selectedNoteId
    ? "Select approved note first"
    : "Record lesson delivery"}
                </button>

                {saveState === "error" ? (
                  <span className="text-[11px] text-rose-600">Failed to save.</span>
                ) : null}
                {saveState === "saved" ? (
                  <span className="text-[11px] text-emerald-600">Recorded successfully.</span>
                ) : null}
              </div>
            </form>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recorded deliveries</h2>
<p className="mt-1 text-[11px] text-slate-500">
  Each delivery now shows whether assessment evidence has been created from the lesson.
</p>
            </div>

            {deliveriesError ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {deliveriesError}
              </div>
            ) : null}

            {deliveriesLoading ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                Loading lesson deliveries…
              </div>
            ) : null}

            {!deliveriesLoading && deliveries.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600">
                No lesson deliveries recorded yet for this class, term, and year.
              </div>
            ) : null}

            {!deliveriesLoading && deliveries.length > 0 ? (
              <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-100 text-xs">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Delivery
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
  Linked note
</th>
<th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
  Assessment evidence
</th>
<th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
  Notes
</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d, idx) => {
                      const zebra = idx % 2 ? "bg-slate-50/60" : "bg-white";
                      return (
                        <tr key={d.id} className={zebra}>
                          <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-900">
                            <div className="font-medium">{deliveryLabel(d)}</div>
                            <div className="text-[11px] text-slate-500">{d.id}</div>
                            <Link
  href={`/teacher/assessment?${new URLSearchParams({
    classroomId: d.classroomId,
    term: d.term,
    academicYear: d.academicYear,
    subject: d.subject,
    lessonDeliveryId: d.id,
    ...(d.curriculumUnitId ? { curriculumUnitId: d.curriculumUnitId } : {}),
    ...(d.lessonNoteId ? { lessonNoteId: d.lessonNoteId } : {}),
  }).toString()}`}
  className="mt-1 inline-flex rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
>
  Create assessment from this lesson
</Link>
                          </td>
<td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-700">
  {d.lessonNoteId || "—"}
</td>

<td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-700">
  {Array.isArray(d.assessmentItems) && d.assessmentItems.length > 0 ? (
    <div className="space-y-2">
      {d.assessmentItems.map((a) => (
        <div
          key={a.id}
          className="rounded-md border border-emerald-100 bg-emerald-50/60 px-2 py-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-medium text-emerald-900">
              {a.componentCode || a.type || "Assessment"}
            </span>
            <span className={statusBadgeClass(a.status)}>
              {cleanStr(a.status) || "DRAFT"}
            </span>
          </div>

          <div className="mt-0.5 text-[11px] text-slate-700">{a.title}</div>

          <div className="mt-0.5 text-[10px] text-slate-500">
            Max: {Number(a.maxScore ?? 0)} • Scores:{" "}
            {Number(a.scoresCount ?? 0)}
            {a.isRequired ? " • Required" : " • Optional"}
          </div>
        </div>
      ))}

      <Link
        href={createAssessmentHrefFromDelivery(d)}
        className="inline-flex rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50"
      >
        Add another assessment
      </Link>
    </div>
  ) : (
    <div className="space-y-1">
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
        No assessment evidence yet.
      </div>

      <Link
        href={createAssessmentHrefFromDelivery(d)}
        className="inline-flex rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
      >
        Create assessment from this lesson
      </Link>
    </div>
  )}
</td>

<td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-700">
  {d.notes || "—"}
</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}