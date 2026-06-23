// src/components/TeacherAssessmentClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AssessmentInsightsPanel from "@/components/teacher/AssessmentInsightsPanel";
import AssessmentBroadsheetPanel from "@/components/teacher/AssessmentBroadsheetPanel";

type ClassroomPick = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type TeacherPhaseCode = "KG" | "PRIMARY" | "JHS" | null;
type ItemStatusCode = "DRAFT" | "PUBLISHED" | "LOCKED";

// --------------------
// Context (session-scoped)
// --------------------
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

// --------------------
// Overview (session-scoped)
// --------------------
type Student = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

type AssessmentItem = {
  id: string;
  classroomId: string;
  subject: string;
  term: string;
  academicYear: string;
  title: string;
  description?: string | null;
  type: string;
  maxScore: number;
  weighting?: number | null;
  date?: string | null;
  status?: string | null;
  publishedAt?: string | null;
  lockedAt?: string | null;
  lessonDeliveryId?: string | null;
  curriculumUnitId?: string | null;
  componentCode?: string | null;
  policyComponentId?: string | null;
  sortOrder?: number | null;
  isRequired?: boolean | null;
};

type OverviewOk = {
  ok: true;
  classroom: ClassroomPick | null;
  students: Student[];
  assessments: AssessmentItem[];
};

type OverviewErr = { ok: false; error: string };
type OverviewResponse = OverviewOk | OverviewErr;

// --------------------
// Subject options
// --------------------
type SubjectOptionsOk = {
  ok: true;
  subjects: string[];
};

type SubjectOptionsErr = { ok: false; error: string };
type SubjectOptionsResponse = SubjectOptionsOk | SubjectOptionsErr;

// --------------------
// Lesson deliveries (session-scoped)
// --------------------
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
};

type LessonDeliveryListOk = {
  ok: true;
  classroom?: ClassroomPick | null;
  items: LessonDeliveryItem[];
};

type LessonDeliveryListErr = { ok: false; error: string };
type LessonDeliveryListResponse = LessonDeliveryListOk | LessonDeliveryListErr;

// --------------------
// Summary (session-scoped)
// --------------------
type ClassAverageOk = {
  ok: true;
  averagePercent: number | null;
  learnersCount: number;
  itemsCount: number;
};
type ClassAverageErr = { ok: false; error: string };
type ClassAverageResponse = ClassAverageOk | ClassAverageErr;

type RemarkBand = {
  grade: number;
  label: string;
  minPercent: number;
  maxPercent: number;
  learnersCount: number;
};

type RemarkSummaryOk = {
  ok: true;
  totalLearnersEvaluated: number;
  bands: RemarkBand[];
};
type RemarkSummaryErr = { ok: false; error: string };
type RemarkSummaryResponse = RemarkSummaryOk | RemarkSummaryErr;

// --------------------
// Pipeline analytics
// --------------------
type PipelineCounts = {
  approvedNotesCount: number;
  deliveredLessonsCount: number;
  linkedAssessmentsCount: number;
  scoredAssessmentsCount: number;
  orphanNotesCount: number;
  orphanDeliveriesCount: number;
  orphanAssessmentsCount: number;
};

type PipelineCoverage = {
  deliveryCoveragePercent: number | null;
  assessmentLinkCoveragePercent: number | null;
  scoringCoveragePercent: number | null;
};

type PipelineOrphanNote = {
  id: string;
  subject: string;
  lessonTitle?: string | null;
  lessonDate?: string | null;
  approvedAt?: string | null;
  curriculumUnitId?: string | null;
  reason: "NO_DELIVERY_RECORDED";
};

type PipelineOrphanDelivery = {
  id: string;
  subject: string;
  dateTaught?: string | null;
  lessonNoteId?: string | null;
  curriculumUnitId?: string | null;
  notes?: string | null;
  reason: "NO_LINKED_ASSESSMENT";
};

type PipelineOrphanAssessment = {
  id: string;
  title: string;
  subject: string;
  type: string;
  date?: string | null;
  status?: string | null;
  lessonDeliveryId?: string | null;
  curriculumUnitId?: string | null;
  reason: "NO_LINKED_DELIVERY" | "LINKED_DELIVERY_NOT_FOUND_IN_SCOPE";
};

type PipelineAnalyticsOk = {
  ok: true;
  scope: {
    tenantId: string;
    classroomId: string;
    term: string;
    academicYear: string;
    roleName: string | null;
    allowedSubjects: string[] | null;
    scopeSource?: string | null;
    classroom?: ClassroomPick | null;
  };
  counts: PipelineCounts;
  coverage: PipelineCoverage;
  orphanNotes: PipelineOrphanNote[];
  orphanDeliveries: PipelineOrphanDelivery[];
  orphanAssessments: PipelineOrphanAssessment[];
};

type PipelineAnalyticsErr = { ok: false; error: string };
type PipelineAnalyticsResponse = PipelineAnalyticsOk | PipelineAnalyticsErr;

type SaveState = "idle" | "saving" | "saved" | "error";

type CreateEvidenceItemArgs = {
  subject: string;
  componentCode: string;
  componentLabel: string;
  maxScore: number;
  weightPercent: number;
  required: boolean;
};

const ASSESSMENT_TYPES: { value: string; label: string }[] = [
  { value: "EXERCISE", label: "Exercise" },
  { value: "HOMEWORK", label: "Homework" },
  { value: "QUIZ", label: "Quiz" },
  { value: "CLASS_TEST", label: "Class Test" },
  { value: "GROUP_WORK", label: "Group Work" },
  { value: "PROJECT", label: "Project" },
  { value: "PRACTICAL", label: "Practical" },
  { value: "EXAM", label: "Exam" },
  { value: "OTHER", label: "Other" },
];

function assessmentTypeFromComponent(args: {
  componentCode: string;
  componentLabel: string;
}) {
  const code = cleanStr(args.componentCode).toUpperCase();
  const label = cleanStr(args.componentLabel).toUpperCase();

  if (ASSESSMENT_TYPES.some((t) => t.value === code)) return code;

  if (label.includes("EXERCISE")) return "EXERCISE";
  if (label.includes("HOMEWORK")) return "HOMEWORK";
  if (label.includes("CLASS") && label.includes("TEST")) return "CLASS_TEST";
  if (label.includes("PROJECT")) return "PROJECT";
  if (label.includes("PRACTICAL")) return "PRACTICAL";
  if (label.includes("EXAM")) return "EXAM";
  if (label.includes("QUIZ")) return "QUIZ";

  return code || "CLASS_TEST";
}

function defaultEvidenceTitle(args: CreateEvidenceItemArgs) {
  const label = cleanStr(args.componentLabel) || cleanStr(args.componentCode) || "Assessment";
  return `${label} evidence`;
}

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panelCard = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const softPanel = "rounded-2xl border border-white/10 bg-white/[0.04]";
const darkInput =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:bg-white/[0.05] disabled:text-[#8F98A8]";
const darkTextarea =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:bg-white/[0.05] disabled:text-[#8F98A8]";
const darkButton =
  "inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
const goldButton =
  "inline-flex items-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[12px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const emeraldButton =
  "inline-flex items-center rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-50";
const indigoButton =
  "inline-flex items-center rounded-xl border border-indigo-300/20 bg-indigo-400/12 px-4 py-2 text-[12px] font-semibold text-indigo-100 transition hover:bg-indigo-400/18 disabled:cursor-not-allowed disabled:opacity-50";

const broadsheetButton =
  "inline-flex items-center justify-center rounded-xl border border-[#E8C96A]/35 bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[12px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeSubjectToken(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameSubject(a: unknown, b: unknown) {
  return normalizeSubjectToken(a) === normalizeSubjectToken(b);
}

function formatDateForInput(date?: string | null): string {
  if (!date) return "";
  try {
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function safeJson<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as T;
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

function fullClassroomLabel(c: ClassroomPick) {
  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade) {
    return `${name}${grade ? ` (${grade}${arm ? ` ${arm}` : ""})` : ""}`;
  }
  return name || "Classroom";
}

function singleStreamLabel(c: ClassroomPick) {
  const token = getLevelTokenForClassroom(c);
  return levelTokenLabel(token) || fullClassroomLabel(c);
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

  const orderedTokens = Array.from(grouped.keys()).sort((a, b) => {
    const diff = levelTokenOrder(a) - levelTokenOrder(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  for (const token of orderedTokens) {
    const group = grouped.get(token) ?? [];
    const representative = pickSingleStreamRepresentative(group, preferredClassroomId);
    if (representative) picked.push(representative);
  }

  return [...picked, ...others];
}

function resolveInitialClassroomId(
  list: ClassroomPick[],
  preferredClassroomId: string | null
): string {
  if (!list.length) return "";

  if (preferredClassroomId) {
    const preferred = list.find((c) => c.id === preferredClassroomId);
    if (preferred) {
      const token = getLevelTokenForClassroom(preferred);
      if (token) {
        const sameLevel = list.filter((c) => getLevelTokenForClassroom(c) === token);
        const representative = pickSingleStreamRepresentative(sameLevel, preferredClassroomId);
        if (representative) return representative.id;
      }
      return preferred.id;
    }
  }

  const singleStream = buildSingleStreamClassrooms(list, preferredClassroomId);
  return singleStream[0]?.id ?? list[0]?.id ?? "";
}

function normalizeItemStatus(raw: unknown): ItemStatusCode {
  const s = cleanStr(raw).toUpperCase();
  if (s === "LOCKED") return "LOCKED";
  if (s === "PUBLISHED") return "PUBLISHED";
  return "DRAFT";
}

function itemDefinitionReadOnlyReason(item: AssessmentItem | null) {
  if (!item) return null;

  const status = normalizeItemStatus(item.status);

  if (status === "LOCKED" || item.lockedAt) {
    return "This assessment is locked. It can no longer be edited or deleted.";
  }

  if (status === "PUBLISHED" || item.publishedAt) {
    return "This assessment is published. Reopen it before editing its details.";
  }

  return null;
}

function itemScoreReadOnlyReason(item: AssessmentItem | null) {
  if (!item) return null;

  const status = normalizeItemStatus(item.status);

  if (status === "LOCKED" || item.lockedAt) {
    return "This assessment is locked. Scores can no longer be edited.";
  }

  return null;
}

function itemStateChip(item: AssessmentItem) {
  const status = normalizeItemStatus(item.status);

  if (status === "LOCKED" || item.lockedAt) {
    return {
      label: "Locked",
      className: "border-rose-300/20 bg-rose-400/12 text-rose-100",
    };
  }

  if (status === "PUBLISHED" || item.publishedAt) {
    return {
      label: "Published",
      className: "border-amber-300/20 bg-amber-400/12 text-amber-100",
    };
  }

  return {
    label: "Draft",
    className: "border-emerald-300/20 bg-emerald-400/12 text-emerald-100",
  };
}

function formatLessonDeliveryLabel(d: LessonDeliveryItem) {
  const parts: string[] = [];

  const dt = formatDateForInput(d.dateTaught ?? null);
  if (dt) parts.push(dt);

  if (cleanStr(d.subject)) parts.push(d.subject);

  if (cleanStr(d.indicatorCode)) {
    parts.push(d.indicatorCode!);
  } else if (cleanStr(d.contentStandardCode)) {
    parts.push(d.contentStandardCode!);
  }

  if (d.lessonNoteId) parts.push("Lesson note linked");

  return parts.join(" • ") || d.id;
}

function friendlyActionError(code: string | null | undefined) {
  const c = cleanStr(code).toUpperCase();

  if (c === "ITEM_PUBLISHED") return "This assessment is published. Reopen it before editing its details.";
  if (c === "ITEM_LOCKED") return "This assessment is locked. It can no longer be edited or scored.";
  if (c === "INVALID_STUDENT_SCOPE") return "One or more learners do not belong to this class.";
  if (c === "LESSON_DELIVERY_NOT_FOUND") return "The selected lesson delivery was not found.";
  if (c === "DELIVERY_CLASSROOM_MISMATCH") return "The selected lesson delivery belongs to a different class.";
  if (c === "DELIVERY_SUBJECT_MISMATCH") return "The selected lesson delivery subject does not match this assessment subject.";
  if (c === "DELIVERY_TERM_MISMATCH") return "The selected lesson delivery belongs to a different term.";
  if (c === "DELIVERY_YEAR_MISMATCH") return "The selected lesson delivery belongs to a different academic year.";
  if (c === "DELIVERY_FORBIDDEN") return "You are not allowed to link that lesson delivery.";
  if (c === "DELIVERY_UNIT_MISMATCH") return "The selected lesson delivery conflicts with the curriculum unit already attached to this assessment.";
  return null;
}

type MobileTab = "scores" | "broadsheet" | "items" | "insights" | "pipeline";

function TabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "flex-1 rounded-xl border px-3 py-2 text-left text-[12px] transition",
        props.active
          ? "border-[#E8C96A]/35 bg-[linear-gradient(135deg,rgba(212,175,55,0.10),rgba(27,102,209,0.08))] text-[#F7F4ED]"
          : "border-white/10 bg-white/[0.04] text-[#C9CDD6] hover:bg-white/[0.08]",
      ].join(" ")}
    >
      <div className="font-semibold">{props.label}</div>
      {props.hint ? <div className="text-[10px] text-[#8F98A8]">{props.hint}</div> : null}
    </button>
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
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
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

export default function TeacherAssessmentClient() {
    const searchParams = useSearchParams();

  const urlClassroomId = cleanStr(searchParams.get("classroomId"));
  const urlTerm = cleanStr(searchParams.get("term"));
  const urlAcademicYear = cleanStr(searchParams.get("academicYear"));
  const urlSubject = cleanStr(searchParams.get("subject"));
  const urlLessonDeliveryId = cleanStr(searchParams.get("lessonDeliveryId"));
  const urlCurriculumUnitId = cleanStr(searchParams.get("curriculumUnitId"));
  const urlLessonNoteId = cleanStr(searchParams.get("lessonNoteId"));

  const hasLessonDeliveryContext = !!urlLessonDeliveryId;
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomPick[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");
  const [teacherPhase, setTeacherPhase] = useState<TeacherPhaseCode>(null);
  const [showMultiStream, setShowMultiStream] = useState(false);

  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [classroom, setClassroom] = useState<ClassroomPick | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectOptionsLoading, setSubjectOptionsLoading] = useState(false);
  const [subjectOptionsError, setSubjectOptionsError] = useState<string | null>(null);

  const [lessonDeliveries, setLessonDeliveries] = useState<LessonDeliveryItem[]>([]);
  const [lessonDeliveriesLoading, setLessonDeliveriesLoading] = useState(false);
  const [lessonDeliveriesError, setLessonDeliveriesError] = useState<string | null>(null);
  const [lessonDeliveryId, setLessonDeliveryId] = useState<string>("");
  const [curriculumUnitId, setCurriculumUnitId] = useState<string>("");

  const [subject, setSubject] = useState("");
  const [type, setType] = useState("CLASS_TEST");
  const [componentCode, setComponentCode] = useState("CLASS_TEST");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxScore, setMaxScore] = useState<string>("10");
  const [weighting, setWeighting] = useState<string>("10");
  const [date, setDate] = useState<string>("");

  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: string; comment: string }>>({});

  const [savingItemState, setSavingItemState] = useState<SaveState>("idle");
  const [savingScoresState, setSavingScoresState] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const [classAverage, setClassAverage] = useState<ClassAverageOk | null>(null);
  const [remarkSummary, setRemarkSummary] = useState<RemarkSummaryOk | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<PipelineAnalyticsOk | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [tab, setTab] = useState<MobileTab>("scores");
  const [itemFormOpen, setItemFormOpen] = useState<boolean>(true);
  const [learnerQuery, setLearnerQuery] = useState<string>("");
const [broadsheetRefreshKey, setBroadsheetRefreshKey] = useState(0);
const [broadsheetNotice, setBroadsheetNotice] = useState<string | null>(null);

  const selectedItem = useMemo(() => items.find((i) => i.id === selectedItemId) ?? null, [items, selectedItemId]);

  const selectedItemDefinitionReadOnlyReason = useMemo(
    () => itemDefinitionReadOnlyReason(selectedItem),
    [selectedItem]
  );

  const selectedItemScoreReadOnlyReason = useMemo(
    () => itemScoreReadOnlyReason(selectedItem),
    [selectedItem]
  );

const typeOptions = useMemo(() => {
  const current = cleanStr(type).toUpperCase();

  if (!current || ASSESSMENT_TYPES.some((t) => t.value === current)) {
    return ASSESSMENT_TYPES;
  }

  return [
    {
      value: current,
      label: current.replace(/_/g, " "),
    },
    ...ASSESSMENT_TYPES,
  ];
}, [type]);

  const selectedItemNotice =
    selectedItemScoreReadOnlyReason ?? selectedItemDefinitionReadOnlyReason;

  const selectedLessonDelivery = useMemo(
    () => lessonDeliveries.find((d) => d.id === lessonDeliveryId) ?? null,
    [lessonDeliveries, lessonDeliveryId]
  );

  const selectedLessonDeliverySubjectMismatch = useMemo(() => {
    if (!selectedLessonDelivery) return false;
    if (!cleanStr(subject)) return false;
    return !sameSubject(selectedLessonDelivery.subject, subject);
  }, [selectedLessonDelivery, subject]);

  const canToggleMultiStream = useMemo(() => hasDuplicateLevelTokens(classrooms), [classrooms]);

  const visibleClassrooms = useMemo(() => {
    if (!canToggleMultiStream) return classrooms;
    if (showMultiStream) return classrooms;
    return buildSingleStreamClassrooms(classrooms, classroomId || null);
  }, [canToggleMultiStream, showMultiStream, classrooms, classroomId]);

  const selectedClassMayBeRepresentative = useMemo(() => {
    if (showMultiStream) return false;
    const current = classrooms.find((c) => c.id === classroomId);
    if (!current) return false;

    const token = getLevelTokenForClassroom(current);
    if (!token) return false;

    const sameLevel = classrooms.filter((c) => getLevelTokenForClassroom(c) === token);
    return sameLevel.length > 1 && cleanStr(current.arm) === "";
  }, [showMultiStream, classrooms, classroomId]);

  const streamModeHelp = useMemo(() => {
    if (teacherPhase === "KG") return "Default view is single-stream for KG. Turn multi-stream on only when you need all streams.";
    if (teacherPhase === "PRIMARY") return "Default view is single-stream for Primary. Turn multi-stream on only when you need all streams.";
    if (teacherPhase === "JHS") return "Default view is single-stream for JHS. Turn multi-stream on only when you need all streams.";
    return "Default view is single-stream for KG, Primary, and JHS. Turn multi-stream on only when you need all streams.";
  }, [teacherPhase]);

  const termDashboardHref = useMemo(() => {
    if (!classroomId) return "/teacher/assessment/term-dashboard";
    const params = new URLSearchParams({ classroomId, term, academicYear });
    return `/teacher/assessment/term-dashboard?${params.toString()}`;
  }, [classroomId, term, academicYear]);

  const lessonDeliveriesPageHref = useMemo(() => {
    if (!classroomId) return "/teacher/lesson-deliveries";
    const params = new URLSearchParams({ classroomId, term, academicYear });
    return `/teacher/lesson-deliveries?${params.toString()}`;
  }, [classroomId, term, academicYear]);

  function buildBlankScoreGrid(currentStudents: Student[]) {
    const base: Record<string, { score: string; comment: string }> = {};
    for (const s of currentStudents) base[s.id] = { score: "", comment: "" };
    return base;
  }

function markBroadsheetDirty(message: string) {
  setBroadsheetRefreshKey((v) => v + 1);
  setBroadsheetNotice(message);
}

  async function loadScoresForItem(itemId: string, currentStudents: Student[]) {
    const base = buildBlankScoreGrid(currentStudents);

    if (!itemId || currentStudents.length === 0) {
      setScoreDraft(base);
      return;
    }

    try {
      const params = new URLSearchParams({ itemId });
      const res = await fetch(`/api/teacher/assessment/scores/list?${params.toString()}`, {
        cache: "no-store",
      });

      const raw = await res.json().catch(() => null);
      const data = safeJson<any>(raw);

      if (!res.ok || !data?.ok || !Array.isArray(data.scores)) {
        setScoreDraft(base);
        return;
      }

      const withSaved = { ...base };
      for (const row of data.scores as { studentId: string; score: number; comment?: string | null }[]) {
        if (withSaved[row.studentId]) {
          withSaved[row.studentId] = {
            score: String(row.score ?? ""),
            comment: row.comment ?? "",
          };
        }
      }
      setScoreDraft(withSaved);
    } catch {
      setScoreDraft(base);
    }
  }

  useEffect(() => {
    const boot = async () => {
      try {
        setCtxLoading(true);
        setCtxError(null);

        const res = await fetch("/api/teacher/assessment/context", { cache: "no-store" });
        const raw = await res.json().catch(() => null);
        const json = safeJson<ContextResponse>(raw);

        if (!json) {
          setCtxError(`Invalid context response (HTTP ${res.status}).`);
          return;
        }

        if (!res.ok) {
          const msg = (json as any)?.error || `Failed to load context (HTTP ${res.status}).`;
          setCtxError(msg);
          return;
        }

        if (!json.ok) {
          setCtxError(json.error || "Failed to load assessment context.");
          return;
        }

        const nextClassrooms = Array.isArray(json.classrooms) ? json.classrooms : [];

        setTerm(urlTerm || json.term);
        setAcademicYear(urlAcademicYear || json.academicYear);
        setTeacherPhase(json.teacherPhase ?? null);
setClassrooms(nextClassrooms);

const exactUrlClassroom = urlClassroomId
  ? nextClassrooms.find((c) => c.id === urlClassroomId) ?? null
  : null;

// When coming from lesson delivery, preserve the exact stream/class.
// Do not let single-stream representative logic swap the classroom.
setShowMultiStream(!!exactUrlClassroom);

const def = exactUrlClassroom
  ? exactUrlClassroom.id
  : resolveInitialClassroomId(nextClassrooms, json.defaultClassroomId || null);

setClassroomId(def);
      } catch {
        setCtxError("Failed to load assessment context.");
      } finally {
        setCtxLoading(false);
      }
    };

    boot();
  }, [urlAcademicYear, urlClassroomId, urlTerm]);

  useEffect(() => {
    if (visibleClassrooms.length === 0) {
      if (classroomId) setClassroomId("");
      return;
    }

    if (visibleClassrooms.some((c) => c.id === classroomId)) return;

    const current = classrooms.find((c) => c.id === classroomId);
    const currentToken = current ? getLevelTokenForClassroom(current) : null;

    if (currentToken) {
      const sameTokenVisible = visibleClassrooms.find((c) => getLevelTokenForClassroom(c) === currentToken);
      if (sameTokenVisible) {
        setClassroomId(sameTokenVisible.id);
        return;
      }
    }

    setClassroomId(visibleClassrooms[0].id);
  }, [visibleClassrooms, classrooms, classroomId]);

  useEffect(() => {
    const load = async () => {
      if (!classroomId) {
        setLoading(false);
        setLoadingError("No classroom selected.");
        return;
      }

      try {
        setLoading(true);
        setLoadingError(null);
        setActionError(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        const res = await fetch(`/api/teacher/assessment/overview?${params.toString()}`, { cache: "no-store" });

        const raw = await res.json().catch(() => null);
        const data = safeJson<OverviewResponse>(raw);

        if (!data) throw new Error(`Invalid overview response (HTTP ${res.status}).`);

        if (!res.ok) {
          const msg = (data as any)?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        if (!data.ok) throw new Error(data.error || "Server returned ok:false");

        setClassroom(data.classroom ?? null);
        setStudents(Array.isArray(data.students) ? data.students : []);
        setItems(Array.isArray(data.assessments) ? data.assessments : []);

        const studentData = Array.isArray(data.students) ? data.students : [];
        const assessmentData = Array.isArray(data.assessments) ? data.assessments : [];

        if (hasLessonDeliveryContext) {
          setSelectedItemId(null);
          setLessonDeliveryId(urlLessonDeliveryId);
          setCurriculumUnitId(urlCurriculumUnitId);
          setScoreDraft(buildBlankScoreGrid(studentData));
          setItemFormOpen(true);
          setTab("items");
          return;
        }

        if (assessmentData.length > 0) {
          const first = assessmentData[0];
          setSelectedItemId(first.id);
          await loadScoresForItem(first.id, studentData);
        } else {
          setSelectedItemId(null);
          setScoreDraft(buildBlankScoreGrid(studentData));
        }
      } catch {
        setLoadingError("Failed to load assessment overview.");
        setItems([]);
        setStudents([]);
        setSelectedItemId(null);
        setScoreDraft({});
        setClassroom(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [
    classroomId,
    term,
    academicYear,
    hasLessonDeliveryContext,
    urlCurriculumUnitId,
    urlLessonDeliveryId,
  ]);

  useEffect(() => {
    const loadSubjects = async () => {
      if (!classroomId) {
        setSubjectOptions([]);
        setSubjectOptionsError(null);
        setSubjectOptionsLoading(false);
        return;
      }

      try {
        setSubjectOptionsLoading(true);
        setSubjectOptionsError(null);

        const params = new URLSearchParams({ classroomId });
        const res = await fetch(`/api/teacher/assessment/subject-options?${params.toString()}`, { cache: "no-store" });

        const raw = await res.json().catch(() => null);
        const json = safeJson<SubjectOptionsResponse>(raw);

        if (!json) throw new Error(`Invalid subject-options response (HTTP ${res.status}).`);
        if (!res.ok || !json.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

        const nextSubjects = Array.isArray(json.subjects) ? json.subjects : [];
        setSubjectOptions(nextSubjects);

        setSubject((prev) => {
          if (urlSubject && nextSubjects.some((s) => sameSubject(s, urlSubject))) {
            return nextSubjects.find((s) => sameSubject(s, urlSubject)) || urlSubject;
          }

          if (cleanStr(prev) && nextSubjects.some((s) => sameSubject(s, prev))) {
            return nextSubjects.find((s) => sameSubject(s, prev)) || prev;
          }

          return nextSubjects[0] || "";
        });
      } catch (err: any) {
        setSubjectOptions([]);
        setSubjectOptionsError(String(err?.message || "Failed to load subject options."));
      } finally {
        setSubjectOptionsLoading(false);
      }
    };

    loadSubjects();
  }, [classroomId, urlSubject]);

  useEffect(() => {
    const loadLessonDeliveries = async () => {
      if (!classroomId) {
        setLessonDeliveries([]);
        setLessonDeliveriesError(null);
        setLessonDeliveriesLoading(false);
        return;
      }

      try {
        setLessonDeliveriesLoading(true);
        setLessonDeliveriesError(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        const res = await fetch(`/api/teacher/lesson-deliveries/list?${params.toString()}`, { cache: "no-store" });

        const raw = await res.json().catch(() => null);
        const json = safeJson<LessonDeliveryListResponse>(raw);

        if (!json) throw new Error(`Invalid lesson-deliveries response (HTTP ${res.status}).`);
        if (!res.ok || !json.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

        const nextDeliveries = Array.isArray(json.items) ? json.items : [];
        setLessonDeliveries(nextDeliveries);

        if (urlLessonDeliveryId) {
          const linked = nextDeliveries.find((d) => d.id === urlLessonDeliveryId);

          if (linked) {
            setLessonDeliveryId(linked.id);
            setCurriculumUnitId(linked.curriculumUnitId || urlCurriculumUnitId || "");

            if (cleanStr(linked.subject)) {
              setSubject((prev) => {
                if (cleanStr(prev) && sameSubject(prev, linked.subject)) return prev;
                return linked.subject;
              });
            }
          } else {
            setLessonDeliveryId(urlLessonDeliveryId);
            setCurriculumUnitId(urlCurriculumUnitId);
          }
        }
      } catch (err: any) {
        setLessonDeliveries([]);
        setLessonDeliveriesError(String(err?.message || "Failed to load lesson deliveries."));
      } finally {
        setLessonDeliveriesLoading(false);
      }
    };

    loadLessonDeliveries();
  }, [classroomId, term, academicYear, urlCurriculumUnitId, urlLessonDeliveryId]);

  useEffect(() => {
    const loadSummary = async () => {
      if (!classroomId) return;

      try {
        setSummaryLoading(true);
        setSummaryError(null);

        const baseParams = new URLSearchParams({ classroomId, term, academicYear });

        const [avgRes, remarkRes] = await Promise.all([
          fetch(`/api/teacher/assessment/class-average?${baseParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/teacher/assessment/remark-summary?${baseParams.toString()}`, { cache: "no-store" }),
        ]);

        const avgRaw = await avgRes.json().catch(() => null);
        const remarkRaw = await remarkRes.json().catch(() => null);

        const avgJson = safeJson<ClassAverageResponse>(avgRaw);
        const remarkJson = safeJson<RemarkSummaryResponse>(remarkRaw);

        if (!avgJson) throw new Error(`Invalid class-average response (HTTP ${avgRes.status}).`);
        if (!remarkJson) throw new Error(`Invalid remark-summary response (HTTP ${remarkRes.status}).`);

        if (!avgRes.ok || !avgJson.ok) throw new Error((avgJson as any)?.error || `Failed class-average (HTTP ${avgRes.status})`);
        if (!remarkRes.ok || !remarkJson.ok) throw new Error((remarkJson as any)?.error || `Failed remark-summary (HTTP ${remarkRes.status})`);

        setClassAverage({
          ok: true,
          averagePercent: typeof avgJson.averagePercent === "number" ? avgJson.averagePercent : null,
          learnersCount: typeof avgJson.learnersCount === "number" ? avgJson.learnersCount : 0,
          itemsCount: typeof avgJson.itemsCount === "number" ? avgJson.itemsCount : 0,
        });

        setRemarkSummary({
          ok: true,
          totalLearnersEvaluated: typeof remarkJson.totalLearnersEvaluated === "number" ? remarkJson.totalLearnersEvaluated : 0,
          bands: Array.isArray(remarkJson.bands) ? remarkJson.bands : [],
        });
      } catch (err: any) {
        setSummaryError(String(err?.message || "Failed to load class summary insights."));
        setClassAverage(null);
        setRemarkSummary(null);
      } finally {
        setSummaryLoading(false);
      }
    };

    loadSummary();
  }, [classroomId, term, academicYear]);

  useEffect(() => {
    const loadPipeline = async () => {
      if (!classroomId) {
        setPipeline(null);
        setPipelineError(null);
        setPipelineLoading(false);
        return;
      }

      try {
        setPipelineLoading(true);
        setPipelineError(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        const res = await fetch(`/api/teacher/assessment/pipeline-analytics?${params.toString()}`, { cache: "no-store" });

        const raw = await res.json().catch(() => null);
        const json = safeJson<PipelineAnalyticsResponse>(raw);

        if (!json) throw new Error(`Invalid pipeline-analytics response (HTTP ${res.status}).`);
        if (!res.ok || !json.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

        setPipeline(json);
      } catch (err: any) {
        setPipeline(null);
        setPipelineError(String(err?.message || "Failed to load pipeline analytics."));
      } finally {
        setPipelineLoading(false);
      }
    };

    loadPipeline();
  }, [classroomId, term, academicYear]);

useEffect(() => {
  if (!selectedItem) return;

  setSubject(selectedItem.subject || subjectOptions[0] || "");
  setType(selectedItem.type || "CLASS_TEST");
  setComponentCode(
    cleanStr(selectedItem.componentCode) || selectedItem.type || "CLASS_TEST"
  );
  setTitle(selectedItem.title || "");
  setDescription(selectedItem.description ?? "");
  setMaxScore(
    typeof selectedItem.maxScore === "number" ? String(selectedItem.maxScore) : "10"
  );
  setWeighting(selectedItem.weighting != null ? String(selectedItem.weighting) : "");
  setDate(formatDateForInput(selectedItem.date ?? null));
  setLessonDeliveryId(selectedItem.lessonDeliveryId ?? "");
  setCurriculumUnitId(selectedItem.curriculumUnitId ?? "");
}, [selectedItem, subjectOptions]);

useEffect(() => {
  if (selectedItem) return;

  setSubject((prev) => {
    if (urlSubject && subjectOptions.some((s) => sameSubject(s, urlSubject))) {
      return subjectOptions.find((s) => sameSubject(s, urlSubject)) || urlSubject;
    }

    if (cleanStr(prev) && subjectOptions.some((s) => sameSubject(s, prev))) {
      return subjectOptions.find((s) => sameSubject(s, prev)) || prev;
    }

    return subjectOptions[0] || prev || "";
  });
}, [selectedItem, subjectOptions, urlSubject]);


async function handleSelectItem(itemId: string) {
    setActionError(null);
    setSelectedItemId(itemId);
    setItemFormOpen(false);
    await loadScoresForItem(itemId, students);
    setTab("scores");
  }

  function handleNewItem() {
    setActionError(null);
    setSelectedItemId(null);

    const linkedDelivery = urlLessonDeliveryId
      ? lessonDeliveries.find((d) => d.id === urlLessonDeliveryId) ?? null
      : selectedLessonDelivery;

    setSubject(
      cleanStr(linkedDelivery?.subject) ||
        urlSubject ||
        subjectOptions[0] ||
        ""
    );
    setType("CLASS_TEST");
    setComponentCode("CLASS_TEST");
    setTitle("");
    setDescription("");
    setMaxScore("10");
    setWeighting("10");
    setDate(formatDateForInput(linkedDelivery?.dateTaught ?? null));
    setLessonDeliveryId(linkedDelivery?.id || urlLessonDeliveryId || "");
    setCurriculumUnitId(
      linkedDelivery?.curriculumUnitId || urlCurriculumUnitId || ""
    );
    setScoreDraft(buildBlankScoreGrid(students));
    setItemFormOpen(true);
    setTab("items");
  }

function handleCreateEvidenceItemFromBroadsheet(args: CreateEvidenceItemArgs) {
  setActionError(null);
  setSelectedItemId(null);

  const resolvedSubject =
    subjectOptions.find((s) => sameSubject(s, args.subject)) ||
    args.subject ||
    urlSubject ||
    subjectOptions[0] ||
    "";

  const resolvedType = assessmentTypeFromComponent(args);
  const resolvedComponentCode = cleanStr(args.componentCode) || resolvedType;

  const linkedDelivery = hasLessonDeliveryContext
    ? lessonDeliveries.find((d) => d.id === urlLessonDeliveryId) ??
      selectedLessonDelivery
    : null;

  setSubject(resolvedSubject);
  setType(resolvedType);
  setComponentCode(resolvedComponentCode);
  setTitle(defaultEvidenceTitle(args));
  setDescription("");
  setMaxScore( String(Number.isFinite(args.maxScore) && args.maxScore > 0 ? args.maxScore : 10) );
  setWeighting(
    Number.isFinite(args.weightPercent) ? String(args.weightPercent) : ""
  );
  setDate(formatDateForInput(linkedDelivery?.dateTaught ?? null));

  setLessonDeliveryId(linkedDelivery?.id || "");
setCurriculumUnitId( linkedDelivery?.curriculumUnitId || (hasLessonDeliveryContext ? urlCurriculumUnitId : "") );
  setScoreDraft(buildBlankScoreGrid(students));
  setItemFormOpen(true);
  setTab("items");
}

  async function handleDeleteSelectedItem() {
    if (!selectedItem) return;
    if (selectedItemDefinitionReadOnlyReason) {
      setActionError(selectedItemDefinitionReadOnlyReason);
      return;
    }
    if (!window.confirm(`Delete "${selectedItem.title}" and all its scores?`)) return;

    try {
      setActionError(null);

      const res = await fetch("/api/teacher/assessment/items/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedItem.id }),
      });

      const raw = await res.json().catch(() => null);
      const json = safeJson<any>(raw);

      if (!res.ok || !json?.ok) {
        setActionError(friendlyActionError(json?.error) || json?.error || "Failed to delete assessment item.");
        return;
      }

      setItems((prev) => {
        const remaining = prev.filter((i) => i.id !== selectedItem.id);

        if (remaining.length > 0) {
          const next = remaining[0];
          setSelectedItemId(next.id);
          void loadScoresForItem(next.id, students);
        } else {
        setSelectedItemId(null);
setLessonDeliveryId("");
setCurriculumUnitId("");
setScoreDraft(buildBlankScoreGrid(students));
        }

        return remaining;
      });
    } catch {
      setActionError("Unexpected error deleting assessment item.");
    }
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!classroomId) return;
    if (!title.trim()) return;
    if (!subject.trim()) {
      setActionError("Select a valid subject before saving.");
      setSavingItemState("error");
      return;
    }

    if (selectedItemDefinitionReadOnlyReason) {
      setActionError(selectedItemDefinitionReadOnlyReason);
      setSavingItemState("error");
      return;
    }

    if (selectedLessonDeliverySubjectMismatch) {
      setActionError("The selected lesson delivery subject does not match the current assessment subject.");
      setSavingItemState("error");
      return;
    }

    setSavingItemState("saving");
    setActionError(null);

    try {
const resolvedCurriculumUnitId = selectedLessonDelivery?.curriculumUnitId || curriculumUnitId || (hasLessonDeliveryContext ? urlCurriculumUnitId : null);

const body = {
  id: selectedItem?.id,
  classroomId,
  subject: subject.trim(),
  term,
  academicYear,
  title: title.trim(),
  description: description.trim() || null,
  type,
  componentCode: componentCode || type,
  maxScore: Number(maxScore) || 0,
  weighting: weighting ? Number(weighting) : null,
  date: date ? new Date(date).toISOString() : null,
  lessonDeliveryId: lessonDeliveryId || null,
  curriculumUnitId: resolvedCurriculumUnitId,
};

      const res = await fetch("/api/teacher/assessment/items/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await res.json().catch(() => null);
      const json = safeJson<any>(raw);

      if (!res.ok || !json?.ok || !json?.item) {
        setActionError(friendlyActionError(json?.error) || json?.error || "Failed to save item.");
        setSavingItemState("error");
        return;
      }

      const item: AssessmentItem = json.item;

      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id);
        if (idx === -1) return [...prev, item];
        const clone = [...prev];
        clone[idx] = item;
        return clone;
      });

setSelectedItemId(item.id);
setLessonDeliveryId(item.lessonDeliveryId ?? "");
setCurriculumUnitId(item.curriculumUnitId ?? "");
await loadScoresForItem(item.id, students);
markBroadsheetDirty("Assessment item saved. Broadsheet evidence can now be refreshed.");

      setSavingItemState("saved");
      setTimeout(() => setSavingItemState("idle"), 900);

      setTab("scores");
      setItemFormOpen(false);
    } catch {
      setActionError("Unexpected error saving assessment item.");
      setSavingItemState("error");
    }
  }

  async function handleSaveScores() {
    if (!selectedItem) return;

    if (selectedItemScoreReadOnlyReason) {
      setActionError(selectedItemScoreReadOnlyReason);
      setSavingScoresState("error");
      return;
    }

    setSavingScoresState("saving");
    setActionError(null);

    try {
      const scoresPayload = Object.entries(scoreDraft)
        .filter(([_, v]) => v.score.trim() !== "")
        .map(([studentId, v]) => ({
          studentId,
          score: Number(v.score),
          comment: v.comment.trim() || null,
        }));

      const res = await fetch("/api/teacher/assessment/scores/bulk-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedItem.id, scores: scoresPayload }),
      });

      const raw = await res.json().catch(() => null);
      const json = safeJson<any>(raw);

      if (!res.ok || !json?.ok) {
        setActionError(friendlyActionError(json?.error) || json?.error || "Failed to save scores.");
        setSavingScoresState("error");
        return;
      }

await loadScoresForItem(selectedItem.id, students);
markBroadsheetDirty("Scores saved. Broadsheet readiness can now be refreshed.");

setSavingScoresState("saved");
      setTimeout(() => setSavingScoresState("idle"), 900);
    } catch {
      setActionError("Unexpected error saving scores.");
      setSavingScoresState("error");
    }
  }

  const zeroPipeline =
    !!pipeline &&
    pipeline.counts.approvedNotesCount === 0 &&
    pipeline.counts.deliveredLessonsCount === 0 &&
    pipeline.counts.linkedAssessmentsCount === 0 &&
    pipeline.counts.scoredAssessmentsCount === 0;

  const filteredStudents = useMemo(() => {
    const q = cleanStr(learnerQuery).toLowerCase();
    if (!q) return students;
    return students.filter((s) => cleanStr(s.name).toLowerCase().includes(q));
  }, [students, learnerQuery]);

  if (ctxLoading) {
    return <div className="p-6 text-sm text-[#C9CDD6]">Loading assessment context…</div>;
  }

  if (ctxError) {
    return (
      <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 p-6 text-sm text-rose-100">
        {ctxError}
        <div className="mt-2 text-xs text-[#C9CDD6]">
          If this says <span className="font-semibold text-[#F7F4ED]">NO_PRIMARY_CLASSROOM</span>, assign the teacher a primary class.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-[#C9CDD6]">Loading assessment overview…</div>;
  }

  if (loadingError) {
    return (
      <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 p-6 text-sm text-rose-100">
        {loadingError} Please refresh the page or contact the office.
      </div>
    );
  }

  const selectedChip = selectedItem ? itemStateChip(selectedItem) : null;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className={shellCard + " px-4 py-4"}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Teacher • Assessment Entry
            </div>
            <div className="text-lg font-semibold text-[#F7F4ED]">
              {classroom?.name || "Classroom"}
            </div>
            <div className="text-[12px] text-[#C9CDD6]">
              Term: <span className="font-semibold text-[#F7F4ED]">{term}</span> • Academic Year:{" "}
              <span className="font-semibold text-[#F7F4ED]">{academicYear}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                Learners: <span className="font-semibold text-[#F7F4ED]">{students.length}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                Items: <span className="font-semibold text-[#F7F4ED]">{items.length}</span>
              </span>
              {selectedItem ? (
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${selectedChip?.className ?? ""}`}>
                  Selected: {selectedChip?.label}
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                  Selected: <span className="font-semibold text-[#F7F4ED]">None</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setTab("broadsheet")}
              className={
                tab === "broadsheet"
                  ? `${broadsheetButton} ring-2 ring-[#E8C96A]/35`
                  : broadsheetButton
              }
            >
              📊 Open broadsheet
            </button>

            <Link href={lessonDeliveriesPageHref} className={emeraldButton}>
              Record lesson delivery
            </Link>

            <Link href={termDashboardHref} className={indigoButton}>
              View term dashboard
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">Class</label>
            <select
              className={darkInput}
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
            >
              {visibleClassrooms.length === 0 ? (
                <option value="">No classes</option>
              ) : (
                visibleClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {canToggleMultiStream && !showMultiStream ? singleStreamLabel(c) : fullClassroomLabel(c)}
                  </option>
                ))
              )}
            </select>

            {canToggleMultiStream ? (
              <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-[#C9CDD6]">
                <input
                  type="checkbox"
                  checked={showMultiStream}
                  onChange={(e) => setShowMultiStream(e.target.checked)}
                />
                Show multi-stream classes
              </label>
            ) : null}

            {canToggleMultiStream && !showMultiStream ? (
              <p className="text-[10px] text-[#8F98A8]">{streamModeHelp}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">Term</label>
            <input
              className={darkInput}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">Academic year</label>
            <input
              className={darkInput}
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-[12px] text-amber-100">
          {actionError}
        </div>
      ) : null}

{broadsheetNotice ? (
  <div className="flex flex-col gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-[12px] text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
    <div>{broadsheetNotice}</div>

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setTab("broadsheet")}
        className="inline-flex items-center rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
      >
        View updated broadsheet
      </button>

      <button
        type="button"
        onClick={() => setBroadsheetNotice(null)}
        className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/[0.09]"
      >
        Dismiss
      </button>
    </div>
  </div>
) : null}

      {hasLessonDeliveryContext ? (
        <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/12 px-4 py-3 text-[12px] text-indigo-100">
          Creating assessment evidence from delivered lesson.
          {selectedLessonDelivery ? (
            <span className="ml-1 font-semibold">
              {formatLessonDeliveryLabel(selectedLessonDelivery)}
            </span>
          ) : urlLessonDeliveryId ? (
            <span className="ml-1 text-indigo-200">
              Linked delivery: {urlLessonDeliveryId.slice(0, 8)}…
            </span>
          ) : null}
          {urlLessonNoteId ? (
            <span className="ml-1 text-indigo-200">
              • Lesson note linked
            </span>
          ) : null}
        </div>
      ) : null}

      {selectedItemNotice && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-[12px] text-amber-100">
          {selectedItemNotice}
        </div>
      )}

      <div className="md:hidden">
        <div className="grid grid-cols-5 gap-2">
          <TabButton
            active={tab === "scores"}
            label="Scores"
            hint={selectedItem ? "Enter marks" : "Pick item"}
            onClick={() => setTab("scores")}
          />
          <TabButton
            active={tab === "broadsheet"}
            label="Sheet"
            hint="Totals"
            onClick={() => setTab("broadsheet")}
          />
          <TabButton
            active={tab === "items"}
            label="Items"
            hint="Create / edit"
            onClick={() => setTab("items")}
          />
          <TabButton
            active={tab === "insights"}
            label="Insights"
            hint="Signals"
            onClick={() => setTab("insights")}
          />
          <TabButton
            active={tab === "pipeline"}
            label="Pipeline"
            hint="Chain"
            onClick={() => setTab("pipeline")}
          />
        </div>
      </div>

            <div className="hidden md:grid md:grid-cols-5 md:gap-2">
        <TabButton
          active={tab === "scores"}
          label="Scores"
          hint={selectedItem ? "Enter marks" : "Pick item"}
          onClick={() => setTab("scores")}
        />
        <TabButton
          active={tab === "broadsheet"}
          label="Broadsheet"
          hint="Totals • grades • readiness"
          onClick={() => setTab("broadsheet")}
        />
        <TabButton
          active={tab === "items"}
          label="Items"
          hint="Create / edit"
          onClick={() => setTab("items")}
        />
        <TabButton
          active={tab === "insights"}
          label="Insights"
          hint="Class signals"
          onClick={() => setTab("insights")}
        />
        <TabButton
          active={tab === "pipeline"}
          label="Pipeline"
          hint="Teaching chain"
          onClick={() => setTab("pipeline")}
        />
      </div>

            {tab === "broadsheet" ? (
<AssessmentBroadsheetPanel
  classroomId={classroomId}
  term={term}
  academicYear={academicYear}
  subjectOptions={subjectOptions}
  currentSubject={subject}
  refreshKey={broadsheetRefreshKey}
  onCreateEvidenceItem={handleCreateEvidenceItemFromBroadsheet}
/>
      ) : null}

      <div className={tab === "broadsheet" ? "hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}>
        <div className={["space-y-4", "md:block", tab === "pipeline" ? "hidden md:block" : ""].join(" ")}>
          <div className={tab !== "insights" ? "hidden md:block" : ""}>
            <SectionCard
              title="Insights"
              subtitle="Quick signals to help you teach better, not to punish you."
              right={
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                  Class: <span className="font-semibold text-[#F7F4ED]">{classroom?.name || "—"}</span>
                </span>
              }
            >
              <div className={panelCard + " p-3"}>
                <AssessmentInsightsPanel
                  classroomId={classroomId}
                  term={term}
                  academicYear={academicYear}
                  students={students.map((s) => ({ id: s.id, name: s.name }))}
                />
              </div>
            </SectionCard>
          </div>

          <div className={tab !== "items" ? "hidden md:block" : ""}>
            <SectionCard
              title="Assessment items"
              subtitle="Create class test, homework, quiz, exam, etc."
              right={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNewItem}
                    className={darkButton}
                  >
                    + New item
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelectedItem}
                    disabled={!selectedItem || !!selectedItemDefinitionReadOnlyReason}
                    className="inline-flex items-center rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[12px] font-semibold text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              }
            >
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-4 text-[12px] text-[#C9CDD6]">
                    No assessment items yet for this class/term/year.
                    <div className="mt-1 text-[11px] text-[#8F98A8]">
                      Tap <span className="font-semibold text-[#F7F4ED]">New item</span> to create one.
                    </div>
                  </div>
                ) : (
                  <div className={panelCard + " max-h-[320px] overflow-auto p-2"}>
                    <ul className="space-y-2">
                      {items.map((item) => {
                        const chip = itemStateChip(item);
                        const selected = selectedItemId === item.id;

                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectItem(item.id)}
                              className={[
                                "w-full rounded-xl border px-3 py-3 text-left transition",
                                selected
                                  ? "border-[#E8C96A]/35 bg-[linear-gradient(135deg,rgba(212,175,55,0.10),rgba(27,102,209,0.08))]"
                                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-[#F7F4ED]">
                                      {item.title}
                                    </div>
                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.className}`}>
                                      {chip.label}
                                    </span>
                                    {item.lessonDeliveryId ? (
                                      <span className="inline-flex rounded-full border border-indigo-300/20 bg-indigo-400/12 px-2 py-0.5 text-[10px] font-semibold text-indigo-100">
                                        Linked lesson
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-[11px] text-[#C9CDD6]">
                                    {item.subject} • {item.type} • Max: {item.maxScore}
                                    {item.weighting != null ? ` • Weight: ${item.weighting}%` : ""}
                                  </div>
                                </div>

                                {item.date ? (
                                  <div className="shrink-0 text-[11px] text-[#8F98A8]">
                                    {formatDateForInput(item.date)}
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className={darkButton}
                    onClick={() => setItemFormOpen((v) => !v)}
                  >
                    {itemFormOpen ? "Hide item form" : selectedItem ? "Edit selected item" : "Show item form"}
                  </button>
                  <div className="text-[11px] text-[#8F98A8]">
                    {selectedItem ? "Update details & link lesson" : "Create item"}
                  </div>
                </div>

                {itemFormOpen ? (
                  <form onSubmit={handleSaveItem} className={panelCard + " p-4"}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                          {selectedItem ? "Update assessment item" : "Create new assessment item"}
                        </div>
                        <div className="text-[11px] text-[#AEB6C4]">
                          Fill the details, then save. After that, go to <span className="font-semibold text-[#F7F4ED]">Scores</span>.
                        </div>
                      </div>
                      <div className="text-[11px] text-[#8F98A8]">
                        {selectedItem ? `ID: ${selectedItem.id.slice(0, 8)}…` : ""}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Subject</label>
                        <select
                          disabled={!!selectedItemDefinitionReadOnlyReason || subjectOptionsLoading || subjectOptions.length === 0}
                          className={darkInput}
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          {subjectOptions.length === 0 ? (
                            <option value="">{subjectOptionsLoading ? "Loading subjects..." : "No valid subjects"}</option>
                          ) : (
                            subjectOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))
                          )}
                        </select>

                        {subjectOptionsLoading ? <p className="text-[10px] text-[#8F98A8]">Loading allowed subjects…</p> : null}
                        {!subjectOptionsLoading && subjectOptionsError ? <p className="text-[10px] text-amber-100">{subjectOptionsError}</p> : null}
                        {!subjectOptionsLoading && !subjectOptionsError ? (
                          <p className="text-[10px] text-[#8F98A8]">
                            You can only create assessments for subjects you are allowed to teach.
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Type</label>
            <select
  disabled={!!selectedItemDefinitionReadOnlyReason}
  className={darkInput}
  value={type}
  onChange={(e) => {
    setType(e.target.value);
    setComponentCode(e.target.value);
  }}
>
  {typeOptions.map((t) => (
    <option key={t.value} value={t.value}>
      {t.label}
    </option>
  ))}
</select>

{componentCode && componentCode !== type ? (
  <p className="text-[10px] text-[#8F98A8]">
    Policy component:{" "}
    <span className="font-semibold text-[#F7F4ED]">{componentCode}</span>
  </p>
) : null}
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Title</label>
                        <input
                          disabled={!!selectedItemDefinitionReadOnlyReason}
                          className={darkInput}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Short description (optional)</label>
                        <textarea
                          disabled={!!selectedItemDefinitionReadOnlyReason}
                          className={darkTextarea}
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Max score</label>
                        <input
                          type="number"
                          min={0}
                          disabled={!!selectedItemDefinitionReadOnlyReason}
                          className={darkInput}
                          value={maxScore}
                          onChange={(e) => setMaxScore(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Weight (%) (optional)</label>
                        <input
                          type="number"
                          min={0}
                          disabled={!!selectedItemDefinitionReadOnlyReason}
                          className={darkInput}
                          value={weighting}
                          onChange={(e) => setWeighting(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Date (optional)</label>
                        <input
                          type="date"
                          disabled={!!selectedItemDefinitionReadOnlyReason}
                          className={darkInput}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-[11px] font-medium text-[#C9CDD6]">Link lesson delivered (optional)</label>
                        <select
                          disabled={!!selectedItemDefinitionReadOnlyReason || lessonDeliveriesLoading}
                          className={darkInput}
                          value={lessonDeliveryId}
                  onChange={(e) => {
  const nextId = e.target.value;
  setLessonDeliveryId(nextId);

  const nextDelivery =
    lessonDeliveries.find((d) => d.id === nextId) ?? null;

  setCurriculumUnitId(nextDelivery?.curriculumUnitId ?? "");

  if (nextDelivery?.subject && !sameSubject(subject, nextDelivery.subject)) {
    setSubject(nextDelivery.subject);
  }

  if (nextDelivery?.dateTaught && !date) {
    setDate(formatDateForInput(nextDelivery.dateTaught));
  }
}}
                        >
                          <option value="">No linked lesson delivery</option>
                          {lessonDeliveries.map((d) => (
                            <option key={d.id} value={d.id}>
                              {formatLessonDeliveryLabel(d)}
                            </option>
                          ))}
                        </select>

                        {lessonDeliveriesLoading ? <p className="text-[10px] text-[#8F98A8]">Loading lesson deliveries…</p> : null}
                        {!lessonDeliveriesLoading && lessonDeliveriesError ? <p className="text-[10px] text-amber-100">{lessonDeliveriesError}</p> : null}

                        {!lessonDeliveriesLoading && !lessonDeliveriesError && lessonDeliveries.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] text-[#C9CDD6]">
                            No lesson deliveries recorded yet for this class/term/year.{" "}
                            <Link href={lessonDeliveriesPageHref} className="font-semibold text-emerald-100 underline">
                              Record a lesson delivery first
                            </Link>
                            .
                          </div>
                        ) : null}

                        {selectedLessonDelivery ? (
                          <div className="rounded-xl border border-indigo-300/20 bg-indigo-400/12 px-3 py-2 text-[11px] text-indigo-100">
                            Linked delivery:{" "}
                            <span className="font-semibold">{formatLessonDeliveryLabel(selectedLessonDelivery)}</span>
                            {selectedLessonDelivery.curriculumUnitId ? (
                              <span className="ml-2 text-indigo-200">• Curriculum unit attached</span>
                            ) : null}
                          </div>
                        ) : null}

                        {selectedLessonDeliverySubjectMismatch ? (
                          <div className="rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[11px] text-amber-100">
                            Subject mismatch: selected delivery subject does not match this assessment subject. Save will be blocked.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="submit"
                        disabled={savingItemState === "saving" || !!selectedItemDefinitionReadOnlyReason || !cleanStr(subject)}
                        className={goldButton}
                      >
                        {savingItemState === "saving" ? "Saving..." : selectedItem ? "Update item" : "Create item"}
                      </button>

                      <div className="text-[11px]">
                        {savingItemState === "error" ? (
                          <span className="text-rose-100">Failed to save. Try again.</span>
                        ) : savingItemState === "saved" ? (
                          <span className="text-emerald-100">Saved.</span>
                        ) : (
                          <span className="text-[#8F98A8]">Then enter scores.</span>
                        )}
                      </div>
                    </div>
                  </form>
                ) : null}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className={["space-y-4", tab === "items" ? "hidden md:block" : ""].join(" ")}>
          <div className={tab !== "pipeline" ? "hidden md:block" : ""}>
            <SectionCard
              title="Teaching pipeline health"
              subtitle="Approved note → delivered lesson → linked assessment → scored assessment"
              right={pipelineLoading ? <span className="text-[11px] text-[#8F98A8]">Loading…</span> : null}
            >
              {pipelineError ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[12px] text-amber-100">
                  {pipelineError}
                </div>
              ) : null}

              {selectedClassMayBeRepresentative ? (
                <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[12px] text-amber-100">
                  You are viewing a <span className="font-semibold">single-stream representative</span> class. This is not an aggregate across A/B/C/D.
                  For strict testing, turn on <span className="font-semibold">Show multi-stream classes</span> and pick the exact stream.
                </div>
              ) : null}

              {!pipelineError && pipeline ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniStat label="Approved notes" value={pipeline.counts.approvedNotesCount} />
                    <MiniStat label="Delivered lessons" value={pipeline.counts.deliveredLessonsCount} />
                    <MiniStat label="Linked assessments" value={pipeline.counts.linkedAssessmentsCount} />
                    <MiniStat label="Scored assessments" value={pipeline.counts.scoredAssessmentsCount} />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <MiniPct label="Delivery coverage" value={pipeline.coverage.deliveryCoveragePercent} />
                    <MiniPct label="Assessment-link coverage" value={pipeline.coverage.assessmentLinkCoveragePercent} />
                    <MiniPct label="Scoring coverage" value={pipeline.coverage.scoringCoveragePercent} />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <MiniWarn label="Orphan notes" value={pipeline.counts.orphanNotesCount} />
                    <MiniWarn label="Orphan deliveries" value={pipeline.counts.orphanDeliveriesCount} />
                    <MiniWarn label="Orphan assessments" value={pipeline.counts.orphanAssessmentsCount} />
                  </div>

                  {pipeline.scope.allowedSubjects?.length ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]">
                      Subject scope: <span className="font-semibold text-[#F7F4ED]">{pipeline.scope.allowedSubjects.join(", ")}</span>
                    </div>
                  ) : null}

                  {zeroPipeline ? (
                    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] text-[#C9CDD6]">
                      No pipeline activity found in this exact scope. Usually the <span className="font-semibold text-[#F7F4ED]">term/classroom</span> is wrong,
                      or the work was recorded under a different stream classroom (e.g. JHS 3 A/B/C/D).
                    </div>
                  ) : null}

                  {(pipeline.orphanNotes.length > 0 ||
                    pipeline.orphanDeliveries.length > 0 ||
                    pipeline.orphanAssessments.length > 0) ? (
                    <div className="mt-4 space-y-3">
                      {pipeline.orphanNotes.length > 0 ? (
                        <SampleList
                          title="Sample orphan notes"
                          rows={pipeline.orphanNotes.slice(0, 3).map((n) => ({
                            k: n.id,
                            a: n.subject,
                            b: `${n.lessonTitle || "Untitled lesson"} • ${formatDateForInput(n.lessonDate)}`,
                          }))}
                        />
                      ) : null}

                      {pipeline.orphanDeliveries.length > 0 ? (
                        <SampleList
                          title="Sample orphan deliveries"
                          rows={pipeline.orphanDeliveries.slice(0, 3).map((d) => ({
                            k: d.id,
                            a: d.subject,
                            b: `${formatDateForInput(d.dateTaught)} • No linked assessment`,
                          }))}
                        />
                      ) : null}

                      {pipeline.orphanAssessments.length > 0 ? (
                        <SampleList
                          title="Sample orphan assessments"
                          rows={pipeline.orphanAssessments.slice(0, 3).map((a) => ({
                            k: a.id,
                            a: a.title,
                            b: `${a.subject} • ${a.type} • ${formatDateForInput(a.date)}`,
                          }))}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Class performance snapshot"
              subtitle="Quick view of average and remark bands"
              right={summaryLoading ? <span className="text-[11px] text-[#8F98A8]">Loading…</span> : null}
            >
              {summaryError ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[12px] text-amber-100">
                  {summaryError}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={panelCard + " p-3"}>
                    <div className="text-[11px] font-semibold text-[#C9CDD6]">Overall average</div>
                    <div className="mt-1 text-2xl font-semibold text-[#F7F4ED]">
                      {formatPercent(classAverage?.averagePercent ?? null)}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#AEB6C4]">
                      <div> Learners: <span className="font-semibold text-[#F7F4ED]">{classAverage?.learnersCount ?? 0}</span></div>
                      <div> Items: <span className="font-semibold text-[#F7F4ED]">{classAverage?.itemsCount ?? 0}</span></div>
                    </div>
                  </div>

                  <div className={panelCard + " p-3"}>
                    <div className="text-[11px] font-semibold text-[#C9CDD6]">Performance bands</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(remarkSummary?.bands || [])
                        .filter((b) => (b.learnersCount ?? 0) > 0)
                        .slice(0, 6)
                        .map((band) => (
                          <span
                            key={band.grade}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-[#C9CDD6]"
                          >
                            <span className="min-w-6 text-center text-[10px] font-semibold text-[#F7F4ED]">
                              {band.grade}
                            </span>
                            <span className="text-[10px]">{band.label} ({band.learnersCount})</span>
                          </span>
                        ))}
                      {remarkSummary && (remarkSummary.bands || []).every((b) => (b.learnersCount ?? 0) === 0) ? (
                        <span className="text-[11px] text-[#8F98A8]">No band distribution yet.</span>
                      ) : null}
                    </div>

                    {remarkSummary ? (
                      <div className="mt-2 text-[11px] text-[#AEB6C4]">
                        Learners evaluated: <span className="font-semibold text-[#F7F4ED]">{remarkSummary.totalLearnersEvaluated ?? 0}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          <div className={tab !== "scores" ? "hidden md:block" : ""}>
            <SectionCard
              title="Learner scores"
              subtitle={selectedItem ? "Enter score for each learner, then save." : "Select an item first."}
              right={
                selectedItem ? (
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${selectedChip?.className ?? ""}`}>
                    {selectedChip?.label}
                  </span>
                ) : null
              }
            >
              {!selectedItem ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-6 text-center text-[12px] text-[#C9CDD6]">
                  Select an item (or create one), then record scores.
                </div>
              ) : (
                <>
                  <div className={panelCard + " px-4 py-3"}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">{selectedItem.title}</div>
                        <div className="mt-1 text-[11px] text-[#C9CDD6]">
                          {selectedItem.subject} • {selectedItem.type} • Max: {selectedItem.maxScore}
                          {selectedItem.weighting != null ? ` • Weight: ${selectedItem.weighting}%` : ""}
                          {selectedItem.date ? ` • Date: ${formatDateForInput(selectedItem.date)}` : ""}
                        </div>
                      </div>
                      {selectedItem.lessonDeliveryId ? (
                        <span className="inline-flex rounded-full border border-indigo-300/20 bg-indigo-400/12 px-3 py-1 text-[11px] font-semibold text-indigo-100">
                          Linked lesson
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] text-[#C9CDD6]">
                      Showing <span className="font-semibold text-[#F7F4ED]">{filteredStudents.length}</span> of{" "}
                      <span className="font-semibold text-[#F7F4ED]">{students.length}</span> learners
                    </div>
                    <input
                      value={learnerQuery}
                      onChange={(e) => setLearnerQuery(e.target.value)}
                      placeholder="Search learner name…"
                      className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] sm:w-72"
                    />
                  </div>

                  <div className="mt-4 space-y-3 md:hidden">
                    {filteredStudents.map((s) => {
                      const row = scoreDraft[s.id] ?? { score: "", comment: "" };

                      return (
                        <div key={s.id} className={panelCard + " p-3"}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[#F7F4ED]">{s.name}</div>
                              <div className="mt-0.5 text-[11px] text-[#C9CDD6]">
                                {s.guardianName || ""} {s.guardianPhone ? `• ${s.guardianPhone}` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[10px] text-[#8F98A8]">Max</div>
                              <div className="text-sm font-semibold text-[#F7F4ED]">{selectedItem.maxScore}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[11px] font-semibold text-[#C9CDD6]">Score</div>
                              <input
                                type="number"
min={0}
max={selectedItem.maxScore}
disabled={!!selectedItemScoreReadOnlyReason}
                                className={darkInput + " mt-1"}
                                value={row.score}
                                onChange={(e) =>
                                  setScoreDraft((prev) => ({
                                    ...prev,
                                    [s.id]: { ...(prev[s.id] || { score: "", comment: "" }), score: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-[#C9CDD6]">Comment</div>
                              <input
                                type="text"
                                disabled={!!selectedItemScoreReadOnlyReason}
                                className={darkInput + " mt-1"}
                                value={row.comment}
                                onChange={(e) =>
                                  setScoreDraft((prev) => ({
                                    ...prev,
                                    [s.id]: { ...(prev[s.id] || { score: "", comment: "" }), comment: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={"mt-4 hidden md:block " + panelCard}>
                    <div className="max-h-[420px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-white/[0.04] text-[#C9CDD6]">
                          <tr>
                            <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Learner</th>
                            <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Score</th>
                            <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Comment (optional)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((s, idx) => {
                            const row = scoreDraft[s.id] ?? { score: "", comment: "" };
                            const zebra = idx % 2 ? "bg-white/[0.03]" : "bg-transparent";
                            return (
                              <tr key={s.id} className={zebra}>
                                <td className="border-b border-white/10 px-4 py-3 align-top">
                                  <div className="font-semibold text-[#F7F4ED]">{s.name}</div>
                                  <div className="text-[12px] text-[#8F98A8]">
                                    {s.guardianName || ""} {s.guardianPhone ? `• ${s.guardianPhone}` : ""}
                                  </div>
                                </td>
                                <td className="border-b border-white/10 px-4 py-3 align-top">
                                  <input
                                    type="number"
                                    min={0}
                                    max={selectedItem.maxScore}
                                    disabled={!!selectedItemScoreReadOnlyReason}
                                    className="w-28 rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] disabled:bg-white/[0.05]"
                                    value={row.score}
                                    onChange={(e) =>
                                      setScoreDraft((prev) => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] || { score: "", comment: "" }), score: e.target.value },
                                      }))
                                    }
                                  />
                                </td>
                                <td className="border-b border-white/10 px-4 py-3 align-top">
                                  <input
                                    type="text"
                                    disabled={!!selectedItemScoreReadOnlyReason}
                                    className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] disabled:bg-white/[0.05]"
                                    value={row.comment}
                                    onChange={(e) =>
                                      setScoreDraft((prev) => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] || { score: "", comment: "" }), comment: e.target.value },
                                      }))
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={"mt-4 hidden md:flex items-center justify-between gap-3 " + panelCard + " px-4 py-3"}>
                    <button
                      type="button"
                      onClick={handleSaveScores}
                      disabled={savingScoresState === "saving" || !!selectedItemScoreReadOnlyReason}
                      className={goldButton}
                    >
                      {savingScoresState === "saving" ? "Saving…" : "Save scores"}
                    </button>

                    <div className="text-[11px]">
                      {savingScoresState === "error" ? (
                        <span className="text-rose-100">Failed to save scores.</span>
                      ) : savingScoresState === "saved" ? (
                        <span className="text-emerald-100">Scores saved.</span>
                      ) : (
                        <span className="text-[#8F98A8]">Save after entering marks.</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      {tab === "scores" && selectedItem ? (
        <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[rgba(5,7,11,0.92)] p-3 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-[#F7F4ED]">
                {selectedItem.title}
              </div>
              <div className="text-[11px] text-[#C9CDD6]">
                Max {selectedItem.maxScore} • {selectedChip?.label}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveScores}
              disabled={savingScoresState === "saving" || !!selectedItemScoreReadOnlyReason}
              className={goldButton + " shrink-0"}
            >
              {savingScoresState === "saving" ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-2 text-center text-[11px]">
            {selectedItemScoreReadOnlyReason ? (
              <span className="text-amber-100">{selectedItemScoreReadOnlyReason}</span>
            ) : savingScoresState === "error" ? (
              <span className="text-rose-100">Failed to save scores.</span>
            ) : savingScoresState === "saved" ? (
              <span className="text-emerald-100">Saved.</span>
            ) : (
              <span className="text-[#8F98A8]">Enter marks, then tap Save.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="text-[11px] font-semibold text-[#C9CDD6]">{props.label}</div>
      <div className="mt-1 text-xl font-semibold text-[#F7F4ED]">{props.value}</div>
    </div>
  );
}

function MiniPct(props: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/12 px-3 py-3">
      <div className="text-[11px] font-semibold text-indigo-100">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-[#F7F4ED]">{formatPercent(props.value)}</div>
    </div>
  );
}

function MiniWarn(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-3 py-3">
      <div className="text-[11px] font-semibold text-amber-100">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-[#F7F4ED]">{props.value}</div>
    </div>
  );
}

function SampleList(props: { title: string; rows: Array<{ k: string; a: string; b: string }> }) {
  return (
    <div className={panelCard + " p-3"}>
      <div className="text-[12px] font-semibold text-[#F7F4ED]">{props.title}</div>
      <div className="mt-2 space-y-2">
        {props.rows.map((r) => (
          <div key={r.k} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-[#C9CDD6]">
            <div className="font-semibold text-[#F7F4ED]">{r.a}</div>
            <div className="text-[11px] text-[#8F98A8]">{r.b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}