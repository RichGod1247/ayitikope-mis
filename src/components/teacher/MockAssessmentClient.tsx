//MockAssessmentClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type ClassroomPick = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type ContextOk = {
  ok: true;
  term: string;
  academicYear: string;
  defaultClassroomId: string | null;
  classrooms: ClassroomPick[];
  teacherPhase: "KG" | "PRIMARY" | "JHS" | null;
};

type ContextErr = { ok: false; error: string };
type ContextResponse = ContextOk | ContextErr;

type SubjectOptionsOk = {
  ok: true;
  subjects: string[];
};

type SubjectOptionsErr = { ok: false; error: string };
type SubjectOptionsResponse = SubjectOptionsOk | SubjectOptionsErr;

type MockSession = {
  id: string;
  classroomId: string;
  academicYear: string;
  term: string | null;
  mockNumber: number;
  mockLabel: string;
  title: string;
  status: string;
  itemCount?: number;
  scoredCellsCount?: number;
  subjects?: string[];
};

type MockSessionsOk = {
  ok: true;
  classroom: ClassroomPick;
  access?: {
    scopeSource?: string | null;
    allowedSubjects?: string[] | null;
  };
  academicYear: string;
  sessions: MockSession[];
};

type MockSessionSaveOk = {
  ok: true;
  session: MockSession;
};

type MockItem = {
  id: string;
  classroomId: string;
  subject: string;
  term: string;
  academicYear: string;
  title: string;
  type: string;
  maxScore: number;
  status: string;
  mockExamSessionId: string | null;
  scoresCount?: number;
};

type MockItemsOk = {
  ok: true;
  session: MockSession;
  classroom: ClassroomPick;
  access?: {
    scopeSource?: string | null;
    allowedSubjects?: string[] | null;
  };
  items: MockItem[];
};

type MockItemSaveOk = {
  ok: true;
  created?: boolean;
  repaired?: boolean;
  item: MockItem;
  session: {
    id: string;
    mockNumber: number;
    mockLabel: string;
    title: string;
  };
};

type ScoreStudent = {
  id: string;
  name: string;
  score: number | null;
  comment: string | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade: number | null;
  pointsToNextGrade: number | null;
};

type MockScoresOk = {
  ok: true;
  item: MockItem;
  session: MockSession | null;
  classroom: ClassroomPick | null;
  access?: {
    scopeSource?: string | null;
    allowedSubjects?: string[] | null;
  };
  students: ScoreStudent[];
};

type MockScoresSaveOk = {
  ok: true;
  itemId: string;
  updatedCount: number;
  clearedCount: number;
};

type AggregateResult = {
  ok: boolean;
  aggregate: number | null;
  missingSubjects: string[];
  reason: string | null;
};

type ReadinessBand = {
  code: string;
  label: string;
  tone: string;
  action: string;
};

type BroadsheetStudent = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  schoolAggregate: AggregateResult;
  placementAggregate: AggregateResult;
  readiness: ReadinessBand;
};

type SubjectSummary = {
  itemId: string;
  subject: string;
  canonicalSubject: string;
  title: string;
  maxScore: number;
  status: string;
  scoredCount: number;
  missingCount: number;
  averageScore: number | null;
  averageGrade: number | null;
};

type MockBroadsheetOk = {
  ok: true;
  session: MockSession;
  classroom: ClassroomPick;
  access: {
    scopeSource?: string | null;
    allowedSubjects?: string[] | null;
    visibleSubjectCount: number;
  };
  summary: {
    totalStudents: number;
    visibleSubjectCount: number;
    possibleCells: number;
    scoredCells: number;
    missingCells: number;
    completionPercent: number;
    schoolAggregateReadyCount: number;
    placementReadyCount: number;
    classAveragePlacementAggregate: number | null;
    classReadiness: ReadinessBand;
  };
  subjectSummaries: SubjectSummary[];
  students: BroadsheetStudent[];
  warnings: {
    aggregateMayBeIncomplete: boolean;
    message: string | null;
  };
};

type ApiErr = {
  ok: false;
  error: string;
  message?: string;
};

type ApiResult<T> = T | ApiErr;

type ScoreDraftRow = {
  score: string;
  comment: string;
};

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panelCard = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const softPanel = "rounded-2xl border border-white/10 bg-white/[0.04]";
const darkInput =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:bg-white/[0.05] disabled:text-[#8F98A8]";
const darkButton =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
const goldButton =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[12px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const emeraldButton =
  "inline-flex items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton =
  "inline-flex items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[12px] font-semibold text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50";

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function safeObject(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function getErrorMessage(raw: unknown, fallback: string) {
  if (!safeObject(raw)) return fallback;

  const error = cleanStr(raw.error);
  const message = cleanStr(raw.message);

  return message || error || fallback;
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
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

  return null;
}

function isJhs3Classroom(c: ClassroomPick) {
  return normalizeLevelToken(c.grade) === "JHS3" || normalizeLevelToken(c.name) === "JHS3";
}

function classroomLabel(c: ClassroomPick) {
  const name = cleanStr(c.name) || "Classroom";
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade && arm) return `${name} (${grade} ${arm})`;
  if (grade) return `${name} (${grade})`;
  return name;
}

function pickBestJhs3Classroom(
  list: ClassroomPick[],
  preferredId: string | null,
  includeMultiStream = false
) {
  const allJhs3 = list.filter(isJhs3Classroom);
  if (!allJhs3.length) return "";

  const singleStream = allJhs3.filter((c) => !cleanStr(c.arm));
  const candidates = includeMultiStream
    ? allJhs3
    : singleStream.length > 0
      ? singleStream
      : allJhs3;

  if (preferredId && candidates.some((c) => c.id === preferredId)) {
    return preferredId;
  }

  const noArm = candidates.find((c) => !cleanStr(c.arm));
  if (noArm) return noArm.id;

  return candidates[0]?.id ?? "";
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}${suffix}`;
}

function readinessClass(code: string) {
  const c = cleanStr(code).toUpperCase();

  if (c.includes("READY") || c === "EXCELLENT" || c === "COMPETITIVE") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }

  if (c.includes("RISK") || c === "CRITICAL") {
    return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  }

  if (c === "DEVELOPING" || c === "READY_MONITOR" || c === "MODERATE") {
    return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-[#C9CDD6]";
}

function gradeClass(grade: number | null) {
  if (grade == null) return "border-white/10 bg-white/[0.04] text-[#AEB6C4]";
  if (grade <= 3) return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (grade <= 6) return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  return "border-rose-300/20 bg-rose-400/12 text-rose-100";
}

function sameText(a: unknown, b: unknown) {
  return cleanStr(a).toUpperCase() === cleanStr(b).toUpperCase();
}

function isValidScoreDraftValue(raw: unknown) {
  const text = cleanStr(raw);
  if (!text) return false;

  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function guidedScoreInputClass(isGuidedTarget: boolean, hasValidScore: boolean) {
  if (!isGuidedTarget) return darkInput + " max-w-[140px]";

  if (hasValidScore) {
    return [
      darkInput,
      "max-w-[140px]",
      "ring-2 ring-emerald-300/25 bg-emerald-400/10 shadow-[0_0_20px_rgba(16,185,129,0.16)]",
    ].join(" ");
  }

  return [
    darkInput,
    "max-w-[140px]",
    "ring-2 ring-amber-300/40 bg-amber-400/10 shadow-[0_0_24px_rgba(245,158,11,0.24)]",
  ].join(" ");
}

function mockAutoComment(scoreRaw: unknown) {
  const scoreText = cleanStr(scoreRaw);
  if (!scoreText) return "";

  const score = Number(scoreText);
  if (!Number.isFinite(score)) return "";

  if (score >= 90) return "Excellent mock performance; protect Grade 1 standard.";
  if (score >= 80) return "Very strong performance; push for consistency.";
  if (score >= 70) return "Good performance; revise weak strands for improvement.";
  if (score >= 60) return "Fairly good start; strengthen core exam skills.";
  if (score >= 55) return "Credit range; needs focused revision.";
  if (score >= 50) return "Pass range; monitor closely before next mock.";
  if (score >= 45) return "Borderline risk; urgent targeted revision needed.";
  if (score >= 40) return "Weak pass; immediate intervention recommended.";
  return "Critical risk; daily remedial support required.";
}

async function readJson<T>(res: Response): Promise<ApiResult<T> | null> {
  const raw: unknown = await res.json().catch(() => null);
  if (!safeObject(raw)) return null;
  return raw as ApiResult<T>;
}

function MetricCard(props: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={softPanel + " p-4"}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#F7F4ED]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] text-[#AEB6C4]">{props.hint}</div> : null}
      {props.tone ? <div className="mt-2 text-[11px] text-[#8F98A8]">{props.tone}</div> : null}
    </div>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={shellCard}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F7F4ED]">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-0.5 text-[11px] text-[#AEB6C4]">{props.subtitle}</div>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-4 py-4">{props.children}</div>
    </div>
  );
}

export default function MockAssessmentClient() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const scoreEntryRef = useRef<HTMLDivElement | null>(null);

  const deepLinkTarget = useMemo(() => {
    const params = new URLSearchParams(queryString);

    return {
      sessionId: cleanStr(params.get("sessionId")),
      itemId: cleanStr(params.get("itemId")),
      subject: cleanStr(params.get("subject")),
    };
  }, [queryString]);

  const hasDeepLinkTarget = Boolean(
    deepLinkTarget.sessionId || deepLinkTarget.itemId || deepLinkTarget.subject
  );
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<string | null>(null);

const [classrooms, setClassrooms] = useState<ClassroomPick[]>([]);
const [showMultiStream, setShowMultiStream] = useState(false);
const [classroomId, setClassroomId] = useState("");
  const [term, setTerm] = useState("3rd Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [mockNumber, setMockNumber] = useState("1");
  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [items, setItems] = useState<MockItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const [scoreSheet, setScoreSheet] = useState<MockScoresOk | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, ScoreDraftRow>>({});
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresSaving, setScoresSaving] = useState(false);
  const [scoresError, setScoresError] = useState<string | null>(null);
  const [scoresNotice, setScoresNotice] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);

  const [broadsheet, setBroadsheet] = useState<MockBroadsheetOk | null>(null);
  const [broadsheetLoading, setBroadsheetLoading] = useState(false);
  const [broadsheetError, setBroadsheetError] = useState<string | null>(null);

  const allJhs3Classrooms = useMemo(() => classrooms.filter(isJhs3Classroom), [classrooms]);

const jhs3Classrooms = useMemo(() => {
  if (showMultiStream) return allJhs3Classrooms;

  const singleStream = allJhs3Classrooms.filter((c) => !cleanStr(c.arm));
  return singleStream.length > 0 ? singleStream : allJhs3Classrooms;
}, [allJhs3Classrooms, showMultiStream]);

const canToggleMultiStream = allJhs3Classrooms.some((c) => cleanStr(c.arm));
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId]
  );
  const selectedItem = useMemo(() => items.find((item) => item.id === itemId) ?? null, [items, itemId]);
  const selectedItemIsDeepLinkTarget = useMemo(() => {
    if (!hasDeepLinkTarget || !selectedItem) return false;

    if (deepLinkTarget.itemId && selectedItem.id === deepLinkTarget.itemId) return true;

    if (deepLinkTarget.subject && sameText(selectedItem.subject, deepLinkTarget.subject)) {
      return true;
    }

    return false;
  }, [deepLinkTarget.itemId, deepLinkTarget.subject, hasDeepLinkTarget, selectedItem]);

  const guidedMissingScoreCount = useMemo(() => {
    if (!selectedItemIsDeepLinkTarget || !scoreSheet) return 0;

    return scoreSheet.students.filter(
      (student) => !isValidScoreDraftValue(scoreDraft[student.id]?.score)
    ).length;
  }, [scoreDraft, scoreSheet, selectedItemIsDeepLinkTarget]);

  const visibleSubjects = useMemo(() => {
    const fromOptions = subjectOptions.map(cleanStr).filter(Boolean);
    const fromItems = items.map((item) => item.subject).map(cleanStr).filter(Boolean);
    return Array.from(new Set([...fromOptions, ...fromItems])).sort((a, b) => a.localeCompare(b));
  }, [subjectOptions, items]);

  function clearDownstream() {
    setItems([]);
    setItemId("");
    setScoreSheet(null);
    setScoreDraft({});
    setBroadsheet(null);
  }

  async function loadContext() {
    try {
      setCtxLoading(true);
      setCtxError(null);

      const res = await fetch("/api/teacher/assessment/context", { cache: "no-store" });
      const json = await readJson<ContextResponse>(res);

      if (!json) {
        setCtxError(`Invalid assessment context response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setCtxError(getErrorMessage(json, `Failed to load context. HTTP ${res.status}`));
        return;
      }

      const nextClassrooms = Array.isArray(json.classrooms) ? json.classrooms : [];
      setClassrooms(nextClassrooms);
      setTerm(json.term || "3rd Term");
      setAcademicYear(json.academicYear || "2025/2026");

const nextClassroomId = pickBestJhs3Classroom(
  nextClassrooms,
  json.defaultClassroomId,
  false
);
setClassroomId(nextClassroomId);
    } catch {
      setCtxError("Failed to load assessment context.");
    } finally {
      setCtxLoading(false);
    }
  }

  async function loadSessions(nextClassroomId = classroomId, nextAcademicYear = academicYear) {
    if (!nextClassroomId || !nextAcademicYear) {
      setSessions([]);
      setSessionId("");
      clearDownstream();
      return;
    }

    try {
      setSessionsLoading(true);
      setSessionError(null);

      const params = new URLSearchParams({
        classroomId: nextClassroomId,
        academicYear: nextAcademicYear,
      });

      const res = await fetch(`/api/teacher/assessment/mock/sessions?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await readJson<MockSessionsOk>(res);

      if (!json) {
        setSessionError(`Invalid mock sessions response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setSessionError(getErrorMessage(json, `Failed to load mock sessions. HTTP ${res.status}`));
        return;
      }

      const nextSessions = Array.isArray(json.sessions) ? json.sessions : [];
      setSessions(nextSessions);

      const requestedSession = deepLinkTarget.sessionId
        ? nextSessions.find((session) => session.id === deepLinkTarget.sessionId) ?? null
        : null;

      if (hasDeepLinkTarget && deepLinkTarget.sessionId && !requestedSession) {
        setDeepLinkNotice(
          "The reminder link points to a Mock session that is not available under this JHS 3 classroom. Check the stream/classroom or ask the headteacher to resend the reminder."
        );
      }

      if (requestedSession) {
        setDeepLinkNotice(
          `Guided from reminder: ${requestedSession.title} is selected.`
        );
      }

      setSessionId((prev) => {
        if (requestedSession) return requestedSession.id;
        if (prev && nextSessions.some((session) => session.id === prev)) return prev;
        return nextSessions[0]?.id ?? "";
      });
    } catch {
      setSessionError("Failed to load mock sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadSubjectOptions(nextClassroomId = classroomId) {
    if (!nextClassroomId) {
      setSubjectOptions([]);
      setSubject("");
      return;
    }

    try {
      const params = new URLSearchParams({ classroomId: nextClassroomId });
      const res = await fetch(`/api/teacher/assessment/subject-options?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await readJson<SubjectOptionsResponse>(res);

      if (!json || !res.ok || !json.ok) {
        setSubjectOptions([]);
        setSubject("");
        return;
      }

      const subjects = Array.isArray(json.subjects) ? json.subjects.map(cleanStr).filter(Boolean) : [];
      setSubjectOptions(subjects);
      setSubject((prev) => {
        if (prev && subjects.some((s) => s.toUpperCase() === prev.toUpperCase())) return prev;
        return subjects[0] ?? "";
      });
    } catch {
      setSubjectOptions([]);
      setSubject("");
    }
  }

  async function saveSession() {
    if (!classroomId) {
      setSessionError("Select a JHS 3 classroom first.");
      return;
    }

    try {
      setSessionSaving(true);
      setSessionError(null);

      const res = await fetch("/api/teacher/assessment/mock/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId,
          academicYear,
          term,
          mockNumber: Number(mockNumber),
        }),
      });

      const json = await readJson<MockSessionSaveOk>(res);

      if (!json) {
        setSessionError(`Invalid save response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setSessionError(getErrorMessage(json, `Failed to save mock session. HTTP ${res.status}`));
        return;
      }

      setSessionId(json.session.id);
      await loadSessions(classroomId, academicYear);
    } catch {
      setSessionError("Failed to save mock session.");
    } finally {
      setSessionSaving(false);
    }
  }

  async function loadItems(nextSessionId = sessionId) {
    if (!nextSessionId) {
      setItems([]);
      setItemId("");
      setScoreSheet(null);
      setScoreDraft({});
      return;
    }

    try {
      setItemsLoading(true);
      setItemError(null);

      const params = new URLSearchParams({ sessionId: nextSessionId });
      const res = await fetch(`/api/teacher/assessment/mock/items?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await readJson<MockItemsOk>(res);

      if (!json) {
        setItemError(`Invalid mock items response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setItemError(getErrorMessage(json, `Failed to load mock items. HTTP ${res.status}`));
        return;
      }

      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems(nextItems);

      const requestedItemById = deepLinkTarget.itemId
        ? nextItems.find((item) => item.id === deepLinkTarget.itemId) ?? null
        : null;

      const requestedItemBySubject =
        !requestedItemById && deepLinkTarget.subject
          ? nextItems.find((item) => sameText(item.subject, deepLinkTarget.subject)) ?? null
          : null;

      const requestedItem = requestedItemById ?? requestedItemBySubject;

      if (requestedItem) {
        setSubject(requestedItem.subject);
        setDeepLinkNotice(
          `Guided from reminder: ${requestedItem.subject} is selected. Empty score fields below are highlighted until evidence is entered.`
        );
      }

      if (
        hasDeepLinkTarget &&
        (deepLinkTarget.itemId || deepLinkTarget.subject) &&
        !requestedItem
      ) {
        const targetLabel = deepLinkTarget.subject || deepLinkTarget.itemId || "the requested subject";

        setDeepLinkNotice(
          `The reminder target (${targetLabel}) is not available in your assigned Mock subjects. This may mean the subject is not assigned to your teacher profile or the item has not been opened yet.`
        );
      }

      setItemId((prev) => {
        if (requestedItem) return requestedItem.id;
        if (prev && nextItems.some((item) => item.id === prev)) return prev;
        return nextItems[0]?.id ?? "";
      });
    } catch {
      setItemError("Failed to load mock items.");
    } finally {
      setItemsLoading(false);
    }
  }

  async function createSubjectItem(subjectName = subject) {
    const cleanSubject = cleanStr(subjectName);

    if (!sessionId) {
      setItemError("Create or select a mock session first.");
      return;
    }

    if (!cleanSubject) {
      setItemError("Select a subject first.");
      return;
    }

    try {
      setItemSaving(true);
      setItemError(null);

      const res = await fetch("/api/teacher/assessment/mock/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          subject: cleanSubject,
        }),
      });

      const json = await readJson<MockItemSaveOk>(res);

      if (!json) {
        setItemError(`Invalid subject item response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setItemError(getErrorMessage(json, `Failed to create subject item. HTTP ${res.status}`));
        return;
      }

      setSubject(json.item.subject);
      setItemId(json.item.id);
      await loadItems(sessionId);
      await loadBroadsheet(sessionId);
    } catch {
      setItemError("Failed to create subject item.");
    } finally {
      setItemSaving(false);
    }
  }

  async function loadScores(nextItemId = itemId) {
    if (!nextItemId) {
      setScoreSheet(null);
      setScoreDraft({});
      return;
    }

    try {
      setScoresLoading(true);
      setScoresError(null);
      setScoresNotice(null);

      const params = new URLSearchParams({ itemId: nextItemId });
      const res = await fetch(`/api/teacher/assessment/mock/scores?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await readJson<MockScoresOk>(res);

      if (!json) {
        setScoresError(`Invalid score sheet response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setScoresError(getErrorMessage(json, `Failed to load scores. HTTP ${res.status}`));
        return;
      }

      setScoreSheet(json);

      const nextDraft: Record<string, ScoreDraftRow> = {};
      for (const student of json.students) {
        nextDraft[student.id] = {
          score: student.score == null ? "" : String(student.score),
          comment: student.comment ?? "",
        };
      }
      setScoreDraft(nextDraft);
    } catch {
      setScoresError("Failed to load scores.");
    } finally {
      setScoresLoading(false);
    }
  }

  async function saveScores() {
    if (!itemId || !scoreSheet) {
      setScoresError("Select a mock subject item first.");
      return;
    }

    try {
      setScoresSaving(true);
      setScoresError(null);
      setScoresNotice(null);

const rows = scoreSheet.students.map((student) => {
  const scoreText = cleanStr(scoreDraft[student.id]?.score);
  const manualComment = cleanStr(scoreDraft[student.id]?.comment);
  const autoComment = mockAutoComment(scoreText);

  return {
    studentId: student.id,
    score: scoreText || null,
    comment: manualComment || autoComment,
  };
});

      const res = await fetch("/api/teacher/assessment/mock/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          scores: rows,
        }),
      });

      const json = await readJson<MockScoresSaveOk>(res);

      if (!json) {
        setScoresError(`Invalid save scores response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setScoresError(getErrorMessage(json, `Failed to save scores. HTTP ${res.status}`));
        return;
      }

      setScoresNotice(`Saved ${json.updatedCount} score(s). Cleared ${json.clearedCount}.`);

      await Promise.all([
        loadScores(itemId),
        sessionId ? loadItems(sessionId) : Promise.resolve(),
        sessionId ? loadBroadsheet(sessionId) : Promise.resolve(),
      ]);
    } catch {
      setScoresError("Failed to save scores.");
    } finally {
      setScoresSaving(false);
    }
  }

  async function loadBroadsheet(nextSessionId = sessionId) {
    if (!nextSessionId) {
      setBroadsheet(null);
      return;
    }

    try {
      setBroadsheetLoading(true);
      setBroadsheetError(null);

      const params = new URLSearchParams({ sessionId: nextSessionId });
      const res = await fetch(`/api/teacher/assessment/mock/broadsheet?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await readJson<MockBroadsheetOk>(res);

      if (!json) {
        setBroadsheetError(`Invalid mock broadsheet response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setBroadsheetError(getErrorMessage(json, `Failed to load mock broadsheet. HTTP ${res.status}`));
        return;
      }

      setBroadsheet(json);
    } catch {
      setBroadsheetError("Failed to load mock broadsheet.");
    } finally {
      setBroadsheetLoading(false);
    }
  }

  function updateDraft(studentId: string, patch: Partial<ScoreDraftRow>) {
    setScoreDraft((prev) => ({
      ...prev,
      [studentId]: {
        score: prev[studentId]?.score ?? "",
        comment: prev[studentId]?.comment ?? "",
        ...patch,
      },
    }));
  }

  useEffect(() => {
    void loadContext();
  }, []);

useEffect(() => {
  if (ctxLoading) return;
  if (!classrooms.length) return;

  const next = pickBestJhs3Classroom(classrooms, classroomId || null, showMultiStream);

  if (next && !jhs3Classrooms.some((c) => c.id === classroomId)) {
    setClassroomId(next);
  }
}, [showMultiStream, classrooms, classroomId, ctxLoading, jhs3Classrooms]);

  useEffect(() => {
    clearDownstream();
    if (!classroomId || !academicYear) return;

    void loadSessions(classroomId, academicYear);
    void loadSubjectOptions(classroomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, academicYear]);

useEffect(() => {
  setScoreSheet(null);
  setScoreDraft({});
  setBroadsheet(null);

  if (!sessionId) return;

  void loadItems(sessionId);
  // Broadsheet is heavier; load it on demand or after score save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sessionId]);

  useEffect(() => {
    if (!itemId) {
      setScoreSheet(null);
      setScoreDraft({});
      return;
    }

    void loadScores(itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

    useEffect(() => {
    if (!selectedItemIsDeepLinkTarget || !scoreSheet) return;

    scoreEntryRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [scoreSheet, selectedItemIsDeepLinkTarget]);

  return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                EduLife OS • BECE Mock Engine
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Mock assessment cockpit
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                Create a JHS 3 mock session, open subject score columns, enter raw marks,
                and view early readiness intelligence without polluting the normal 30/70 term report.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/teacher/assessment" className={darkButton}>
                Normal assessment
              </Link>
              <button
                type="button"
                onClick={() => {
                  void loadSessions(classroomId, academicYear);
                  void loadItems(sessionId);
                  void loadScores(itemId);
                  void loadBroadsheet(sessionId);
                }}
                className={goldButton}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
<div className="mb-1 flex items-center justify-between gap-2">
  <label className="block text-[11px] font-semibold text-[#AEB6C4]">
    JHS 3 classroom
  </label>

  {canToggleMultiStream ? (
    <button
      type="button"
      onClick={() => setShowMultiStream((v) => !v)}
      className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[#C9CDD6] hover:bg-white/[0.08]"
    >
      {showMultiStream ? "Single-stream" : "Show streams"}
    </button>
  ) : null}
</div>
<select
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                disabled={ctxLoading}
                className={darkInput}
              >
                <option value="">Select JHS 3</option>
                {jhs3Classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classroomLabel(c)}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[10px] text-[#8F98A8]">
  {showMultiStream
    ? "Multistream mode: arms A–D are visible where applicable."
    : "Single-stream mode: classes without arms are shown by default."}
</div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Academic year
              </label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className={darkInput}
                placeholder="2025/2026"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Term
              </label>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className={darkInput}
                placeholder="3rd Term"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Mock number
              </label>
              <select value={mockNumber} onChange={(e) => setMockNumber(e.target.value)} className={darkInput}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    Mock {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {ctxError ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {ctxError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <SectionCard
              title="1. Mock session"
              subtitle="Create or select the mock exam container."
              right={
                <button
                  type="button"
                  onClick={saveSession}
                  disabled={sessionSaving || !classroomId}
                  className={goldButton}
                >
                  {sessionSaving ? "Saving..." : "Create / load"}
                </button>
              }
            >
              <div className="space-y-3">
                {sessionError ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-100">
                    {sessionError}
                  </div>
                ) : null}

                <div className={panelCard + " max-h-[280px] overflow-auto p-2"}>
                  {sessionsLoading ? (
                    <div className="px-3 py-4 text-[12px] text-[#AEB6C4]">Loading sessions...</div>
                  ) : sessions.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-[#AEB6C4]">
                      No mock sessions yet. Tap Create / load.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((session) => {
                        const selected = session.id === sessionId;
                        const isReminderTarget = Boolean(deepLinkTarget.sessionId && session.id === deepLinkTarget.sessionId);
                        return (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => setSessionId(session.id)}
                            className={[
                              "w-full rounded-xl border px-3 py-3 text-left transition",
                              selected
  ? "border-[#E8C96A]/35 bg-[#E8C96A]/10"
  : isReminderTarget
    ? "border-cyan-300/35 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.14)]"
    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[13px] font-semibold text-[#F7F4ED]">
                                  {session.title}
                                </div>
                                <div className="mt-1 text-[11px] text-[#AEB6C4]">
                                  {session.mockLabel} • {session.status}
                                </div>
                              </div>
                              <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                                {session.itemCount ?? 0} item(s)
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="2. Subject columns"
              subtitle="Open one Mock item per assigned subject."
              right={
                <button
                  type="button"
                  onClick={() => createSubjectItem(subject)}
                  disabled={itemSaving || !sessionId || !subject}
                  className={emeraldButton}
                >
                  {itemSaving ? "Opening..." : "+ Subject"}
                </button>
              }
            >
              <div className="space-y-3">
                {itemError ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-100">
                    {itemError}
                  </div>
                ) : null}

                <select value={subject} onChange={(e) => setSubject(e.target.value)} className={darkInput}>
                  <option value="">Select subject</option>
                  {visibleSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap gap-2">
                  {subjectOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSubject(s);
                        void createSubjectItem(s);
                      }}
                      disabled={itemSaving || !sessionId}
                      className={darkButton}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className={panelCard + " max-h-[300px] overflow-auto p-2"}>
                  {itemsLoading ? (
                    <div className="px-3 py-4 text-[12px] text-[#AEB6C4]">Loading subjects...</div>
                  ) : items.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-[#AEB6C4]">
                      No subject columns yet for this mock.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item) => {
                        const selected = item.id === itemId;
                        const isReminderTarget =
                         Boolean(deepLinkTarget.itemId && item.id === deepLinkTarget.itemId) ||
                         Boolean(deepLinkTarget.subject && sameText(item.subject, deepLinkTarget.subject));
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSubject(item.subject);
                              setItemId(item.id);
                            }}
                            className={[
                              "w-full rounded-xl border px-3 py-3 text-left transition",
                              selected
  ? "border-emerald-300/30 bg-emerald-400/10"
  : isReminderTarget
    ? "border-cyan-300/35 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.14)]"
    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[13px] font-semibold text-[#F7F4ED]">{item.subject}</div>
                                <div className="mt-1 text-[11px] text-[#AEB6C4]">
                                  {item.title} • Max {item.maxScore}
                                </div>
                              </div>
                              <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                                {item.scoresCount ?? 0} scored
                              </div>
                              {isReminderTarget ? (
                               <div className="mt-1 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100">
                                Reminder target
                               </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <div ref={scoreEntryRef} className="scroll-mt-6">
  <SectionCard
    title="3. Score entry"
    subtitle={
      selectedItem
        ? `${selectedItem.subject} • ${selectedSession?.mockLabel ?? "Mock"}`
        : "Select or create a subject column first."
    }
    right={
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!scoreSheet) return;

            setScoreDraft((prev) => {
              const next = { ...prev };

              for (const student of scoreSheet.students) {
                const current = next[student.id] ?? { score: "", comment: "" };
                const comment = cleanStr(current.comment);
                const autoComment = mockAutoComment(current.score);

                next[student.id] = {
                  ...current,
                  comment: comment || autoComment,
                };
              }

              return next;
            });
          }}
          disabled={!scoreSheet}
          className={darkButton}
        >
          Auto comments
        </button>

        <button
          type="button"
          onClick={() => loadScores(itemId)}
          disabled={!itemId || scoresLoading}
          className={darkButton}
        >
          Reload
        </button>

        <button
          type="button"
          onClick={saveScores}
          disabled={!itemId || !scoreSheet || scoresSaving}
          className={goldButton}
        >
          {scoresSaving ? "Saving..." : "Save scores"}
        </button>
      </div>
    }
  >
    <div className="space-y-3">
      {scoresError ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-100">
          {scoresError}
        </div>
      ) : null}

      {scoresNotice ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100">
          {scoresNotice}
        </div>
      ) : null}

      {hasDeepLinkTarget ? (
        <div
          className={[
            "rounded-xl border px-3 py-2 text-[12px] leading-5",
            selectedItemIsDeepLinkTarget
              ? guidedMissingScoreCount > 0
                ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
              : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
          ].join(" ")}
        >
          <div className="font-semibold">Reminder-guided score entry</div>
          <div className="mt-1">
            {deepLinkNotice ||
              "This page was opened from a Mock reminder. The requested session and subject will be selected automatically where your teacher access permits it."}
          </div>

          {selectedItemIsDeepLinkTarget ? (
            <div className="mt-1 text-[11px]">
              {guidedMissingScoreCount > 0
                ? `${guidedMissingScoreCount} score field(s) still need evidence. Empty target fields are softly highlighted.`
                : "All visible target score fields now have valid score evidence."}
            </div>
          ) : null}
        </div>
      ) : null}

      {!scoreSheet ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-10 text-center text-[12px] text-[#AEB6C4]">
          {scoresLoading ? "Loading score sheet..." : "Select a mock subject item to enter scores."}
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-[760px] w-full border-collapse text-left text-[12px]">
            <thead className="bg-white/[0.05] text-[#AEB6C4]">
              <tr>
                <th className="border-b border-white/10 px-3 py-2">Learner</th>
                <th className="border-b border-white/10 px-3 py-2">Score /100</th>
                <th className="border-b border-white/10 px-3 py-2">Grade</th>
                <th className="border-b border-white/10 px-3 py-2">Comment</th>
              </tr>
            </thead>

            <tbody>
              {scoreSheet.students.map((student) => {
                const hasValidGuidedScore = isValidScoreDraftValue(scoreDraft[student.id]?.score);
                const isGuidedMissing = selectedItemIsDeepLinkTarget && !hasValidGuidedScore;
                const isGuidedRepaired = selectedItemIsDeepLinkTarget && hasValidGuidedScore;

                return (
                  <tr
                    key={student.id}
                    className={[
                      "border-b border-white/5 transition",
                      isGuidedMissing
                        ? "bg-amber-400/[0.045]"
                        : isGuidedRepaired
                          ? "bg-emerald-400/[0.035]"
                          : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[#F7F4ED]">{student.name}</div>
                      {student.remark ? (
                        <div className="text-[10px] text-[#8F98A8]">{student.remark}</div>
                      ) : null}
                    </td>

                    <td className="px-3 py-2">
                      <input
                        value={scoreDraft[student.id]?.score ?? ""}
                        onChange={(e) => updateDraft(student.id, { score: e.target.value })}
                        inputMode="decimal"
                        placeholder="Blank clears"
                        className={guidedScoreInputClass(selectedItemIsDeepLinkTarget, hasValidGuidedScore)}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold",
                          gradeClass(student.grade),
                        ].join(" ")}
                      >
                        {student.gradeLabel ?? "—"}
                      </span>

                      {student.pointsToNextGrade != null ? (
                        <div className="mt-1 text-[10px] text-[#8F98A8]">
                          {student.pointsToNextGrade} mark(s) to Grade {student.nextGrade}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-3 py-2">
                      <input
                        value={scoreDraft[student.id]?.comment ?? ""}
                        onChange={(e) => updateDraft(student.id, { comment: e.target.value })}
                        placeholder="Optional comment"
                        className={darkInput}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </SectionCard>
</div>

            <SectionCard
              title="4. Mock broadsheet intelligence"
              subtitle="Completion, subject averages, aggregate readiness, and missing evidence."
              right={
                <button
                  type="button"
                  onClick={() => loadBroadsheet(sessionId)}
                  disabled={!sessionId || broadsheetLoading}
                  className={darkButton}
                >
                  {broadsheetLoading ? "Loading..." : "Reload broadsheet"}
                </button>
              }
            >
              <div className="space-y-4">
                {broadsheetError ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-100">
                    {broadsheetError}
                  </div>
                ) : null}

                {!broadsheet ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-10 text-center text-[12px] text-[#AEB6C4]">
                    {broadsheetLoading ? "Loading broadsheet..." : "Create/select a mock session to view readiness."}
                  </div>
                ) : (
                  <>
                    {broadsheet.warnings.message ? (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
                        {broadsheet.warnings.message}
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-4">
                      <MetricCard
                        label="Students"
                        value={broadsheet.summary.totalStudents}
                        hint="Active JHS 3 roster"
                      />
                      <MetricCard
                        label="Subjects"
                        value={broadsheet.summary.visibleSubjectCount}
                        hint="Visible to this teacher"
                      />
                      <MetricCard
                        label="Completion"
                        value={formatNumber(broadsheet.summary.completionPercent, "%")}
                        hint={`${broadsheet.summary.scoredCells}/${broadsheet.summary.possibleCells} cells`}
                      />
                      <div className={softPanel + " p-4"}>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
                          Class readiness
                        </div>
                        <div className={["mt-2 inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold", readinessClass(broadsheet.summary.classReadiness.code)].join(" ")}>
                          {broadsheet.summary.classReadiness.label}
                        </div>
                        <div className="mt-2 text-[11px] text-[#AEB6C4]">
                          {broadsheet.summary.classReadiness.action}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {broadsheet.subjectSummaries.map((summary) => (
                        <div key={summary.itemId} className={panelCard + " p-4"}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[#F7F4ED]">{summary.subject}</div>
                              <div className="mt-1 text-[11px] text-[#8F98A8]">
                                {summary.scoredCount} scored • {summary.missingCount} missing
                              </div>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                              {summary.status}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <MetricCard label="Avg score" value={formatNumber(summary.averageScore)} />
                            <MetricCard label="Avg grade" value={formatNumber(summary.averageGrade)} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-auto rounded-2xl border border-white/10">
                      <table className="min-w-[900px] w-full border-collapse text-left text-[12px]">
                        <thead className="bg-white/[0.05] text-[#AEB6C4]">
                          <tr>
                            <th className="border-b border-white/10 px-3 py-2">Learner</th>
                            <th className="border-b border-white/10 px-3 py-2">Scored subjects</th>
                            <th className="border-b border-white/10 px-3 py-2">Average</th>
                            <th className="border-b border-white/10 px-3 py-2">School agg.</th>
                            <th className="border-b border-white/10 px-3 py-2">Placement agg.</th>
                            <th className="border-b border-white/10 px-3 py-2">Readiness</th>
                          </tr>
                        </thead>
                        <tbody>
                          {broadsheet.students.map((student) => (
                            <tr key={student.studentId} className="border-b border-white/5">
                              <td className="px-3 py-2 font-semibold text-[#F7F4ED]">{student.name}</td>
                              <td className="px-3 py-2 text-[#C9CDD6]">
                                {student.scoredSubjectCount} scored • {student.missingSubjectCount} missing
                              </td>
                              <td className="px-3 py-2 text-[#C9CDD6]">{formatNumber(student.averageScore)}</td>
                              <td className="px-3 py-2 text-[#C9CDD6]">
                                {student.schoolAggregate.aggregate ?? "Incomplete"}
                              </td>
                              <td className="px-3 py-2 text-[#C9CDD6]">
                                {student.placementAggregate.aggregate ?? "Incomplete"}
                              </td>
                              <td className="px-3 py-2">
                                <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", readinessClass(student.readiness.code)].join(" ")}>
                                  {student.readiness.code}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 text-[12px] leading-6 text-[#AEB6C4]">
          <span className="font-semibold text-[#F7F4ED]">A14.5F shell note:</span>{" "}
          This page is intentionally separate from normal 30/70 assessment. It proves the full Mock
          flow before we integrate dashboard links, headteacher view, parent summary, and governance intelligence.
        </div>
      </div>
    </main>
  );
}