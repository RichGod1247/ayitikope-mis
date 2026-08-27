//src/components/headteacher/HeadteacherMockOverviewClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ClassroomRow = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
  label?: string;
};

type MockSession = {
  id: string;
  classroomId: string;
  academicYear: string;
  term: string | null;
  mockNumber: number;
  mockLabel: string;
  title: string;
  status: string;
  date: string | null;
};

type ReadinessBand = {
  code: string;
  label: string;
  tone: string;
  action: string;
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

type MockActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type MockEvidenceActionMode =
  | "NOTIFY_TEACHER"
  | "REMIND_TEACHER"
  | "LEARNER_SUPPORT_REVIEW"
  | "REVIEW_ONLY";

type MockSubjectOwnerStatus = {
  subject: string;
  hasOwner: boolean;
  ownerCount: number;
  owners: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }[];
  issue: string | null;
  assignmentHref: string;
};

type MockReminderAudit = {
  sent: boolean;
  noticeId: string | null;
  noticeTitle: string | null;
  sentAt: string | null;
  recipientCount: number;
  readCount: number;
  acknowledgedCount: number;
  recipients: {
    id: string;
    userId: string | null;
    name: string | null;
    readAt: string | null;
    acknowledgedAt: string | null;
  }[];
};

type MockEvidenceAction = {
  code: string;
  mode: MockEvidenceActionMode;
  priority: MockActionPriority;
  title: string;
  detail: string;
  owner: string;
  primaryAction: string;
  lastResortAction?: string;
  href: string;
  subject?: string;
  studentId?: string;
  studentName?: string;
  missingCount?: number;
  ownerStatus?: MockSubjectOwnerStatus;
  reminderAudit?: MockReminderAudit;
};

type SubjectScoreGap = {
  subject: string;
  canonicalSubject: string;
  itemId: string;
  scoredCount: number;
  missingCount: number;
  completionPercent: number;
  href: string;
};

type LearnerScoreGap = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  missingForPlacement: string[];
  readinessCode: string;
};

type LearnerRiskSignal = {
  studentId: string;
  name: string;
  averageScore: number | null;
  scoredSubjectCount: number;
  readinessCode: string;
  action: string;
};

type EvidenceActions = {
  requiredSubjectColumns: {
    placementCore: string[];
    schoolAggregate: string[];
    placementElectiveMinimum: number;
    allRequiredForFinalization?: string[];
  };
  missingRequiredMockSubjectColumns: string[];
  createdSubjectColumns: {
    itemId: string;
    subject: string;
    canonicalSubject: string;
    scoredCount: number;
    missingCount: number;
  }[];
  missingCoreSubjectColumns: string[];
  missingSchoolAggregateColumns: string[];
  missingElectiveColumnCount: number;
  subjectScoreGaps: SubjectScoreGap[];
  learnerScoreGaps: LearnerScoreGap[];
  learnerRiskSignals: LearnerRiskSignal[];
  headlineActions: MockEvidenceAction[];
};

type StudentSubjectScore = {
  itemId: string;
  subject: string;
  canonicalSubject: string;
  score: number | null;
  comment: string | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade: number | null;
  pointsToNextGrade: number | null;
};

type StudentRow = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  subjects: StudentSubjectScore[];
  schoolAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  placementAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  readiness: ReadinessBand;
};

type CandidateRescuePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type CandidateSubjectSignal = {
  subject: string;
  canonicalSubject: string;
  score: number | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade: number | null;
  pointsToNextGrade: number | null;
  ownerStatus?: MockSubjectOwnerStatus;
};

type CandidateRescueProfile = {
  studentId: string;
  name: string;
  priority: CandidateRescuePriority;
  priorityLabel: string;
  reason: string;
  nextAction: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  schoolAggregate: StudentRow["schoolAggregate"];
  placementAggregate: StudentRow["placementAggregate"];
  readiness: StudentRow["readiness"];
  missingSubjects: string[];
  weakSubjects: CandidateSubjectSignal[];
  strongSubjects: CandidateSubjectSignal[];
  nearGradeOpportunities: CandidateSubjectSignal[];
};

type MockTrendLabel = "IMPROVING" | "DECLINING" | "STABLE" | "INCOMPLETE";

type MockTrendSubjectMovement = {
  subject: string;
  canonicalSubject: string;
  previousScore: number | null;
  latestScore: number | null;
  scoreMovement: number | null;
  previousGrade: number | null;
  latestGrade: number | null;
  gradeMovement: number | null;
  label: "IMPROVED" | "DECLINED" | "STABLE";
};

type MockTrendLearner = {
  studentId: string;
  name: string;
  trendLabel: MockTrendLabel;
  trendReason: string;
  previousSessionId: string | null;
  previousMockLabel: string | null;
  latestSessionId: string;
  latestMockLabel: string;
  previousPlacementAggregate: number | null;
  latestPlacementAggregate: number | null;
  aggregateMovement: number | null;
  previousAverageScore: number | null;
  latestAverageScore: number | null;
  averageScoreMovement: number | null;
  improvedSubjects: MockTrendSubjectMovement[];
  declinedSubjects: MockTrendSubjectMovement[];
  persistentWeakSubjects: MockTrendSubjectMovement[];
  nearGradeOpportunities: CandidateSubjectSignal[];
  recommendedAction: string;
};

type MockTrendSessionSummary = {
  id: string;
  mockNumber: number;
  mockLabel: string;
  title: string;
  status: string;
  date: string | null;
  scoredCells: number;
  possibleCells: number;
  completionPercent: number;
  placementReadyCount: number;
  classAveragePlacementAggregate: number | null;
  classAverageScore: number | null;
};

type MockTrendIntelligence = {
  available: boolean;
  reason: string | null;
  selectedSessionId: string;
  previousSessionId: string | null;
  lockedSessionCount: number;
  summary: {
    trackedLearners: number;
    improvingCount: number;
    decliningCount: number;
    stableCount: number;
    incompleteCount: number;
    averageAggregateMovement: number | null;
    averageScoreMovement: number | null;
  };
  sessionSummaries: MockTrendSessionSummary[];
  learners: MockTrendLearner[];
};

type Broadsheet = {
  session: MockSession;
  classroom: ClassroomRow | null;
  summary: {
    totalStudents: number;
    totalSubjects: number;
    possibleCells: number;
    scoredCells: number;
    missingCells: number;
    completionPercent: number;
    schoolAggregateReadyCount: number;
    placementReadyCount: number;
    classAveragePlacementAggregate: number | null;
    classReadiness: ReadinessBand;
    readinessCounts: Record<string, number>;
  };
  subjectSummaries: SubjectSummary[];
  weakestSubjects: SubjectSummary[];
  topSubjects: SubjectSummary[];
  students: StudentRow[];
  candidateRescueProfiles: CandidateRescueProfile[];
  trend: MockTrendIntelligence | null;
  evidenceActions: EvidenceActions;
  warnings: {
    aggregateMayBeIncomplete: boolean;
    message: string | null;
  };
};

type OverviewOk = {
  ok: true;
  classrooms: ClassroomRow[];
  selectedClassroomId: string | null;
  selectedClassroom: ClassroomRow | null;
  sessions: MockSession[];
  selectedSessionId: string | null;
  broadsheet: Broadsheet | null;
  warning?: string;
};

type FinalizeStatus = {
  loading: boolean;
  ok: boolean | null;
  message: string;
};

type MockReleaseInfo = {
  id: string;
  mockExamSessionId: string;
  classroomId: string;
  academicYear: string;
  term: string | null;
  mockNumber: number;
  mockLabel: string;
  title: string;
  readinessStatus: string;
  readinessScore: number;
  releaseSnapshotHash: string;
  releaseMode: string | null;
  parentVisible: boolean;
  smsNotifiedAt: string | null;
  releasedAt: string;
  releasedByUser?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type MockReleaseStatus = {
  loading: boolean;
  releasing: boolean;
  ok: boolean | null;
  message: string;
  canRelease: boolean;
  alreadyReleased: boolean;
  blockers: string[];
  release: MockReleaseInfo | null;
};

type MockReleaseNotifyJob = {
  id: string;
  status: string;
  totalTargets: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type MockReleaseNotifyStatus = {
  loading: boolean;
  queueing: boolean;
  ok: boolean | null;
  message: string;
  alreadyNotified: boolean;
  canQueue: boolean;
  blockers: string[];
  existingJob: MockReleaseNotifyJob | null;
  totals: {
    activeStudents: number;
    authorityEligibleLearners: number;
    eligibleGuardianPhones: number;
    eligibleLearners: number;
    notEligibleLearners: number;
    skippedNoPhone: number;
    ambiguousFamilyLearners: number;
  } | null;
  release: {
    id: string;
    mockExamSessionId: string;
    smsNotifiedAt: string | null;
  } | null;
};

type MockReleaseNotifyApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  alreadyQueued?: boolean;
  alreadyNotified?: boolean;
  canQueue?: boolean;
  blockers?: string[];
  existingJob?: MockReleaseNotifyJob | null;
  totals?: MockReleaseNotifyStatus["totals"];
  release?: MockReleaseNotifyStatus["release"];
};

type MockInterventionEvent = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
  actor?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type MockInterventionLifecycleAction =
  | "START"
  | "RESOLVE"
  | "ESCALATE"
  | "REOPEN"
  | "CANCEL";

type MockInterventionCase = {
  id: string;
  title: string;
  summary: string;
  priority: string;
  status: string;
  riskScore: number | null;
  riskLevel: string | null;
  dueAt: string | null;
  resolutionNote: string | null;
  metadata: unknown;
  recommendedActions: unknown;
  createdAt: string;
  updatedAt: string;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  events?: MockInterventionEvent[];
};

type MockInterventionsState = {
  loading: boolean;
  ok: boolean | null;
  message: string;
  items: MockInterventionCase[];
};

type OverviewErr = {
  ok: false;
  error: string;
  message?: string;
};

type OverviewResponse = OverviewOk | OverviewErr;

type ReminderSendStatus = {
  loading: boolean;
  ok: boolean | null;
  message: string;
};

const emptyMockNotifyStatus: MockReleaseNotifyStatus = {
  loading: false,
  queueing: false,
  ok: null,
  message: "",
  alreadyNotified: false,
  canQueue: false,
  blockers: [],
  existingJob: null,
  totals: null,
  release: null,
};

const emptyMockInterventions: MockInterventionsState = {
  loading: false,
  ok: null,
  message: "",
  items: [],
};

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panelCard = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const softPanel = "rounded-2xl border border-white/10 bg-white/[0.04]";
const darkInput =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const darkButton =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
const goldButton =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[12px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function safeObject(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function getError(raw: unknown, fallback: string) {
  if (!safeObject(raw)) return fallback;
  return cleanStr(raw.message) || cleanStr(raw.error) || fallback;
}

async function readJson(res: Response): Promise<OverviewResponse | null> {
  const raw: unknown = await res.json().catch(() => null);
  if (!safeObject(raw)) return null;
  return raw as OverviewResponse;
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
    s.match(/^B([7-9])$/);

  if (m) return `JHS${Number(m[1]) - 6}`;

  return null;
}

function isJhs3Classroom(c: ClassroomRow) {
  return (
    normalizeLevelToken(c.grade) === "JHS3" ||
    normalizeLevelToken(c.name) === "JHS3"
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n.toFixed(Number.isInteger(n) ? 0 : 1)}${suffix}`;
}

function actionKey(action: MockEvidenceAction) {
  return [
    action.code,
    action.subject ?? "",
    action.studentId ?? "",
    action.title,
  ].join(":");
}

function canSendTeacherReminder(action: MockEvidenceAction) {
  return (
    (action.mode === "NOTIFY_TEACHER" || action.mode === "REMIND_TEACHER") &&
    !!cleanStr(action.subject) &&
    action.ownerStatus?.hasOwner !== false
  );
}

function reminderAuditLabel(action: MockEvidenceAction) {
  const audit = action.reminderAudit;

  if (!audit?.sent) return "Not sent yet";

  if (audit.acknowledgedCount > 0) {
    return `Acknowledged by ${audit.acknowledgedCount}/${audit.recipientCount}`;
  }

  if (audit.readCount > 0) {
    return `Read by ${audit.readCount}/${audit.recipientCount}`;
  }

  return `Sent to ${audit.recipientCount}`;
}

function reminderButtonLabel(
  action: MockEvidenceAction,
  local?: ReminderSendStatus,
) {
  if (action.ownerStatus?.hasOwner === false) return "Assign teacher first";
  if (local?.loading) return "Sending...";
  if (local?.ok === true) {
    return local.message.startsWith("Reminder already")
      ? "Already sent"
      : "Sent";
  }
  if (action.reminderAudit?.sent) return "Already sent";
  return "Send reminder";
}

function actionModeLabel(mode: MockEvidenceActionMode) {
  if (mode === "NOTIFY_TEACHER") return "Teacher notification";
  if (mode === "REMIND_TEACHER") return "Teacher reminder";
  if (mode === "LEARNER_SUPPORT_REVIEW") return "Learner support";
  return "Leadership review";
}

function trendClass(label: MockTrendLabel) {
  if (label === "IMPROVING") {
    return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  }

  if (label === "DECLINING") {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (label === "STABLE") {
    return "border-sky-300/25 bg-sky-400/12 text-sky-100";
  }

  return "border-amber-300/25 bg-amber-400/12 text-amber-100";
}

function movementText(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n > 0) return `+${formatNumber(n)}${suffix}`;
  return `${formatNumber(n)}${suffix}`;
}

function aggregateMovementHint(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "No movement";
  if (value > 0) return "Better aggregate";
  if (value < 0) return "Worse aggregate";
  return "No aggregate change";
}

function scoreMovementHint(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "No movement";
  if (value > 0) return "Score improved";
  if (value < 0) return "Score declined";
  return "No score change";
}

function movementTone(value: number | null | undefined, mode: "aggregate" | "score") {
  if (value == null || !Number.isFinite(Number(value))) {
    return "text-[#AEB6C4]";
  }

  const n = Number(value);

  if (n === 0) return "text-sky-100";

  if (mode === "aggregate") {
    return n > 0 ? "text-emerald-100" : "text-rose-100";
  }

  return n > 0 ? "text-emerald-100" : "text-rose-100";
}

function interventionPriorityClass(priority: string) {
  const p = cleanStr(priority).toUpperCase();

  if (p === "CRITICAL") {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (p === "HIGH") {
    return "border-orange-300/25 bg-orange-400/12 text-orange-100";
  }

  if (p === "MEDIUM") {
    return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  }

  return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
}

function interventionStatusClass(status: string) {
  const s = cleanStr(status).toUpperCase();

  if (s === "RESOLVED") {
    return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  }

  if (s === "ESCALATED") {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (s === "IN_PROGRESS") {
    return "border-sky-300/25 bg-sky-400/12 text-sky-100";
  }

  if (s === "CANCELLED") {
    return "border-white/10 bg-white/[0.04] text-[#AEB6C4]";
  }

  return "border-amber-300/25 bg-amber-400/12 text-amber-100";
}

function interventionMetadata(item: MockInterventionCase) {
  return safeObject(item.metadata) ? item.metadata : {};
}

function interventionStudentId(item: MockInterventionCase) {
  return cleanStr(interventionMetadata(item).studentId);
}

function learnerNeedsIntervention(learner: MockTrendLearner) {
  return (
    learner.trendLabel === "DECLINING" ||
    learner.trendLabel === "INCOMPLETE" ||
    learner.persistentWeakSubjects.length > 0 ||
    learner.declinedSubjects.length > 0 ||
    learner.nearGradeOpportunities.length > 0
  );
}

function caseCanStart(status: string) {
  const s = cleanStr(status).toUpperCase();
  return s === "OPEN" || s === "ESCALATED";
}

function caseCanResolve(status: string) {
  const s = cleanStr(status).toUpperCase();
  return s === "OPEN" || s === "IN_PROGRESS" || s === "ESCALATED";
}

function caseCanEscalate(status: string) {
  const s = cleanStr(status).toUpperCase();
  return s === "OPEN" || s === "IN_PROGRESS";
}

function caseCanReopen(status: string) {
  const s = cleanStr(status).toUpperCase();
  return s === "RESOLVED" || s === "CANCELLED";
}

function isActiveInterventionStatus(status: string) {
  const s = cleanStr(status).toUpperCase();
  return s === "OPEN" || s === "IN_PROGRESS" || s === "ESCALATED";
}

function interventionPriorityRank(priority: string) {
  const p = cleanStr(priority).toUpperCase();

  if (p === "CRITICAL") return 1;
  if (p === "HIGH") return 2;
  if (p === "MEDIUM") return 3;
  if (p === "LOW") return 4;

  return 5;
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function interventionStudentName(item: MockInterventionCase) {
  const meta = interventionMetadata(item);
  return (
    cleanStr(meta.studentName) ||
    cleanStr(item.title).replace(/^Mock rescue:\s*/i, "") ||
    "Learner"
  );
}

function latestCaseEvent(item: MockInterventionCase) {
  return Array.isArray(item.events) && item.events.length > 0
    ? item.events[0]
    : null;
}

function lifecyclePrompt(action: MockInterventionLifecycleAction) {
  if (action === "RESOLVE") {
    return "Enter evidence note: What was done, by whom, and what proof shows the learner was supported?";
  }

  if (action === "ESCALATE") {
    return "Enter escalation reason: Why does this rescue case need higher attention?";
  }

  if (action === "REOPEN") {
    return "Enter reopen reason: Why must this rescue case continue?";
  }

  if (action === "CANCEL") {
    return "Enter cancellation reason: Why is this rescue case being cancelled?";
  }

  return "";
}

function rescuePriorityClass(priority: CandidateRescuePriority) {
  if (priority === "CRITICAL") {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (priority === "HIGH") {
    return "border-orange-300/25 bg-orange-400/12 text-orange-100";
  }

  if (priority === "MEDIUM") {
    return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  }

  return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
}

function subjectOwnerLine(signal: CandidateSubjectSignal) {
  const owners = signal.ownerStatus?.owners ?? [];

  if (owners.length > 0) {
    return owners.map((owner) => cleanStr(owner.name) || "Teacher").join(", ");
  }

  if (signal.ownerStatus?.hasOwner === false) return "No assigned teacher";

  return "Owner not resolved";
}

function priorityClass(priority: MockActionPriority) {
  if (priority === "CRITICAL") {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (priority === "HIGH") {
    return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  }

  if (priority === "MEDIUM") {
    return "border-sky-300/25 bg-sky-400/12 text-sky-100";
  }

  return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
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

function MetricCard(props: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={softPanel + " p-4"}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#F7F4ED]">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-[11px] text-[#AEB6C4]">{props.hint}</div>
      ) : null}
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
          <div className="text-sm font-semibold text-[#F7F4ED]">
            {props.title}
          </div>
          {props.subtitle ? (
            <div className="mt-0.5 text-[11px] text-[#AEB6C4]">
              {props.subtitle}
            </div>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-4 py-4">{props.children}</div>
    </div>
  );
}

function isSealedMockStatus(status: unknown) {
  return cleanStr(status).toUpperCase() === "LOCKED";
}

function buildLocalSealReadiness(broadsheet: Broadsheet) {
  const missingRequiredSubjects = new Set(
    broadsheet.evidenceActions.missingRequiredMockSubjectColumns ?? [],
  );

  const ownerGapActions = broadsheet.evidenceActions.headlineActions.filter(
    (action) =>
      (action.mode === "NOTIFY_TEACHER" || action.mode === "REMIND_TEACHER") &&
      action.ownerStatus?.hasOwner === false &&
      !!cleanStr(action.subject) &&
      missingRequiredSubjects.has(cleanStr(action.subject)),
  );

  const blockers: string[] = [];

  if (
    (broadsheet.evidenceActions.missingRequiredMockSubjectColumns ?? [])
      .length > 0
  ) {
    blockers.push(
      `Missing required Mock subject columns: ${broadsheet.evidenceActions.missingRequiredMockSubjectColumns.join(", ")}`,
    );
  }

  if (broadsheet.evidenceActions.missingCoreSubjectColumns.length > 0) {
    blockers.push(
      `Missing core columns: ${broadsheet.evidenceActions.missingCoreSubjectColumns.join(", ")}`,
    );
  }

  if (broadsheet.evidenceActions.missingSchoolAggregateColumns.length > 0) {
    blockers.push(
      `Missing school aggregate columns: ${broadsheet.evidenceActions.missingSchoolAggregateColumns.join(", ")}`,
    );
  }

  if (broadsheet.evidenceActions.missingElectiveColumnCount > 0) {
    blockers.push(
      `Add ${broadsheet.evidenceActions.missingElectiveColumnCount} more elective column(s).`,
    );
  }

  if (broadsheet.evidenceActions.subjectScoreGaps.length > 0) {
    blockers.push(
      `Missing score evidence in ${broadsheet.evidenceActions.subjectScoreGaps.length} subject(s).`,
    );
  }

  if (ownerGapActions.length > 0) {
    blockers.push(
      `Subject owner gaps: ${ownerGapActions
        .map((action) => action.subject)
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  if (
    broadsheet.summary.placementReadyCount < broadsheet.summary.totalStudents
  ) {
    blockers.push(
      `${broadsheet.summary.totalStudents - broadsheet.summary.placementReadyCount} learner(s) are not placement-ready.`,
    );
  }

  const sealed = isSealedMockStatus(broadsheet.session.status);

  return {
    sealed,
    ready: !sealed && blockers.length === 0,
    blockers,
  };
}

export default function HeadteacherMockOverviewClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [showMultiStream, setShowMultiStream] = useState(false);

  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const [broadsheet, setBroadsheet] = useState<Broadsheet | null>(null);

  const [reminderDeadline, setReminderDeadline] = useState(() => {
    const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [reminderNote, setReminderNote] = useState("");
  const [reminderStatus, setReminderStatus] = useState<
    Record<string, ReminderSendStatus>
  >({});

  const [finalizeStatus, setFinalizeStatus] = useState<FinalizeStatus>({
    loading: false,
    ok: null,
    message: "",
  });

  const [mockReleaseStatus, setMockReleaseStatus] = useState<MockReleaseStatus>({
    loading: false,
    releasing: false,
    ok: null,
    message: "",
    canRelease: false,
    alreadyReleased: false,
    blockers: [],
    release: null,
  });

const [mockNotifyStatus, setMockNotifyStatus] =
  useState<MockReleaseNotifyStatus>(emptyMockNotifyStatus);

const [mockInterventions, setMockInterventions] =
  useState<MockInterventionsState>(emptyMockInterventions);

const [interventionCreateStatus, setInterventionCreateStatus] = useState<
  Record<string, ReminderSendStatus>
>({});

const [interventionUpdateStatus, setInterventionUpdateStatus] = useState<
  Record<string, ReminderSendStatus>
>({});

  const allJhs3Classrooms = useMemo(
    () => classrooms.filter(isJhs3Classroom),
    [classrooms],
  );

  const visibleClassrooms = useMemo(() => {
    if (showMultiStream) return allJhs3Classrooms;
    const single = allJhs3Classrooms.filter((c) => !cleanStr(c.arm));
    return single.length > 0 ? single : allJhs3Classrooms;
  }, [allJhs3Classrooms, showMultiStream]);

  const canToggleMultiStream = allJhs3Classrooms.some((c) => cleanStr(c.arm));

  const sealReadiness = useMemo(
    () => (broadsheet ? buildLocalSealReadiness(broadsheet) : null),
    [broadsheet],
  );

const mockInterventionsByStudentId = useMemo(() => {
  const map = new Map<string, MockInterventionCase>();

  for (const item of mockInterventions.items) {
    const studentId = interventionStudentId(item);
    if (!studentId) continue;
    if (!map.has(studentId)) map.set(studentId, item);
  }

  return map;
}, [mockInterventions.items]);

const mockInterventionBoard = useMemo(() => {
  const counts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    ESCALATED: 0,
    CANCELLED: 0,
    OTHER: 0,
  };

  for (const item of mockInterventions.items) {
    const status = cleanStr(item.status).toUpperCase();

    if (status in counts) {
      counts[status as keyof typeof counts] += 1;
    } else {
      counts.OTHER += 1;
    }
  }

  const total = mockInterventions.items.length;
  const activeCount = counts.OPEN + counts.IN_PROGRESS + counts.ESCALATED;
  const closureRate = total > 0 ? (counts.RESOLVED / total) * 100 : null;

  const linkedStudentIds = new Set(
    mockInterventions.items
      .map((item) => interventionStudentId(item))
      .filter(Boolean),
  );

  const rescueCandidates =
    broadsheet?.trend?.available && Array.isArray(broadsheet.trend.learners)
      ? broadsheet.trend.learners.filter(learnerNeedsIntervention)
      : [];

  const unlinkedCandidateCount = rescueCandidates.filter(
    (learner) => !linkedStudentIds.has(learner.studentId),
  ).length;

  const followUpCases = [...mockInterventions.items]
    .filter((item) => isActiveInterventionStatus(item.status))
    .sort((a, b) => {
      const priorityDiff =
        interventionPriorityRank(a.priority) - interventionPriorityRank(b.priority);

      if (priorityDiff !== 0) return priorityDiff;

      return dateValue(b.updatedAt) - dateValue(a.updatedAt);
    });

  const recentEvents = mockInterventions.items
    .map((item) => ({
      item,
      event: latestCaseEvent(item),
    }))
    .filter((row): row is { item: MockInterventionCase; event: MockInterventionEvent } =>
      !!row.event,
    )
    .sort((a, b) => dateValue(b.event.createdAt) - dateValue(a.event.createdAt));

  return {
    total,
    openCount: counts.OPEN,
    inProgressCount: counts.IN_PROGRESS,
    resolvedCount: counts.RESOLVED,
    escalatedCount: counts.ESCALATED,
    cancelledCount: counts.CANCELLED,
    activeCount,
    closureRate,
    rescueCandidateCount: rescueCandidates.length,
    unlinkedCandidateCount,
    followUpCases,
    recentEvents,
  };
}, [broadsheet?.trend, mockInterventions.items]);

  const selectedExportSessionId =
    cleanStr(broadsheet?.session?.id) || cleanStr(sessionId);

  const mockExcelExportHref = selectedExportSessionId
    ? `/api/headteacher/assessment/mock/export/xlsx?sessionId=${encodeURIComponent(
        selectedExportSessionId,
      )}`
    : "";

  const mockPdfExportHref = selectedExportSessionId
    ? `/api/headteacher/assessment/mock/export/pdf?sessionId=${encodeURIComponent(
        selectedExportSessionId,
      )}`
    : "";

  async function loadOverview(args?: {
    nextClassroomId?: string;
    nextSessionId?: string;
    nextAcademicYear?: string;
  }) {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      const c = args?.nextClassroomId ?? classroomId;
      const s = args?.nextSessionId ?? sessionId;
      const y = args?.nextAcademicYear ?? academicYear;

      if (c) params.set("classroomId", c);
      if (s) params.set("sessionId", s);
      if (y) params.set("academicYear", y);

      const query = params.toString();
      const res = await fetch(
        `/api/headteacher/assessment/mock/overview${query ? `?${query}` : ""}`,
        { cache: "no-store" },
      );

      const json = await readJson(res);

      if (!json) {
        setError(`Invalid headteacher mock response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setError(
          getError(
            json,
            `Failed to load headteacher mock overview. HTTP ${res.status}`,
          ),
        );
        return;
      }

      setClassrooms(json.classrooms ?? []);
      setClassroomId(json.selectedClassroomId ?? "");
      setSessions(json.sessions ?? []);
      setSessionId(json.selectedSessionId ?? "");
      setBroadsheet(json.broadsheet ?? null);

if (json.selectedSessionId) {
  void loadMockReleaseStatus(json.selectedSessionId);
  void loadMockNotifyStatus(json.selectedSessionId);
  void loadMockInterventions(json.selectedSessionId);
} else {
  setMockReleaseStatus({
    loading: false,
    releasing: false,
    ok: null,
    message: "",
    canRelease: false,
    alreadyReleased: false,
    blockers: [],
    release: null,
  });

  setMockNotifyStatus({ ...emptyMockNotifyStatus });
  setMockInterventions({ ...emptyMockInterventions });
  setInterventionCreateStatus({});
  setInterventionUpdateStatus({});
}

      if (!academicYear && json.broadsheet?.session?.academicYear) {
        setAcademicYear(json.broadsheet.session.academicYear);
      }
    } catch {
      setError("Failed to load headteacher mock overview.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTeacherReminder(action: MockEvidenceAction) {
    if (!broadsheet) return;

    const key = actionKey(action);

    if (!canSendTeacherReminder(action)) {
      setReminderStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: false,
          message:
            "This action needs a specific subject before a teacher reminder can be sent.",
        },
      }));
      return;
    }

    try {
      setReminderStatus((prev) => ({
        ...prev,
        [key]: {
          loading: true,
          ok: null,
          message: "Sending reminder...",
        },
      }));

      const res = await fetch(
        "/api/headteacher/assessment/mock/reminders/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sessionId: broadsheet.session.id,
            actionCode: action.code,
            subject: action.subject,
            deadline: reminderDeadline,
            note: reminderNote,
          }),
        },
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setReminderStatus((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            ok: false,
            message:
              json?.error === "NO_ASSIGNED_TEACHER_FOUND_FOR_MOCK_REMINDER"
                ? "No assigned teacher found for this subject. Assign the subject first."
                : json?.error || `Failed to send reminder. HTTP ${res.status}`,
          },
        }));
        return;
      }

      const names = Array.isArray(json.recipients)
        ? json.recipients
            .map((r: { name?: string }) => cleanStr(r.name))
            .filter(Boolean)
        : [];

      setReminderStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: true,
          message: json.reused
            ? `Reminder already sent${names.length ? ` to ${names.join(", ")}` : ""}.`
            : `Reminder sent${names.length ? ` to ${names.join(", ")}` : ""}.`,
        },
      }));

      void loadOverview({
        nextClassroomId: classroomId,
        nextSessionId: sessionId,
        nextAcademicYear: academicYear,
      });

      void loadMockReleaseStatus(broadsheet.session.id);
      void loadMockNotifyStatus(broadsheet.session.id);
    } catch {
      setReminderStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: false,
          message: "Failed to send reminder.",
        },
      }));
    }
  }

  async function finalizeMockSession() {
    if (!broadsheet) return;

    try {
      setFinalizeStatus({
        loading: true,
        ok: null,
        message: "Finalizing Mock evidence seal...",
      });

      const res = await fetch("/api/headteacher/assessment/mock/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: broadsheet.session.id,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const blockers = Array.isArray(json?.readiness?.blockers)
          ? json.readiness.blockers
              .map(
                (blocker: { label?: string; detail?: string }) =>
                  `${cleanStr(blocker.label)}${cleanStr(blocker.detail) ? ` — ${cleanStr(blocker.detail)}` : ""}`,
              )
              .filter(Boolean)
              .join(" | ")
          : "";

        setFinalizeStatus({
          loading: false,
          ok: false,
          message:
            json?.error === "MOCK_SESSION_NOT_READY_TO_FINALIZE"
              ? `Not ready to finalize. ${blockers}`
              : json?.message ||
                json?.error ||
                `Failed to finalize. HTTP ${res.status}`,
        });
        return;
      }

      setFinalizeStatus({
        loading: false,
        ok: true,
        message: json.alreadyFinalized
          ? "This Mock session was already sealed."
          : "Mock session finalized and sealed successfully.",
      });

      void loadOverview({
        nextClassroomId: classroomId,
        nextSessionId: sessionId,
        nextAcademicYear: academicYear,
      });
    } catch {
      setFinalizeStatus({
        loading: false,
        ok: false,
        message: "Failed to finalize Mock session.",
      });
    }
  }

  async function loadMockReleaseStatus(nextSessionId?: string) {
    const targetSessionId =
      cleanStr(nextSessionId) || cleanStr(broadsheet?.session?.id) || cleanStr(sessionId);

    if (!targetSessionId) {
      setMockReleaseStatus({
        loading: false,
        releasing: false,
        ok: null,
        message: "",
        canRelease: false,
        alreadyReleased: false,
        blockers: [],
        release: null,
      });
      return;
    }

    try {
      setMockReleaseStatus((prev) => ({
        ...prev,
        loading: true,
        message: "Checking parent release status...",
      }));

      const res = await fetch(
        `/api/headteacher/assessment/mock/release/status?sessionId=${encodeURIComponent(
          targetSessionId,
        )}`,
        { cache: "no-store", credentials: "include" },
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setMockReleaseStatus((prev) => ({
          ...prev,
          loading: false,
          ok: false,
          message:
            json?.message ||
            json?.error ||
            `Failed to load Mock release status. HTTP ${res.status}`,
          canRelease: false,
          alreadyReleased: false,
          blockers: [],
          release: null,
        }));
        return;
      }

      setMockReleaseStatus((prev) => ({
        ...prev,
        loading: false,
        ok: true,
        message: json.alreadyReleased
          ? "This sealed Mock has been released to parents."
          : json.canRelease
            ? "This sealed Mock is ready for parent release."
            : "This Mock is not ready for parent release.",
        canRelease: !!json.canRelease,
        alreadyReleased: !!json.alreadyReleased,
        blockers: Array.isArray(json.blockers) ? json.blockers : [],
        release: json.release ?? null,
      }));
    } catch {
      setMockReleaseStatus((prev) => ({
        ...prev,
        loading: false,
        ok: false,
        message: "Failed to load Mock release status.",
        canRelease: false,
      }));
    }
  }

async function loadMockNotifyStatus(nextSessionId?: string | null) {
  const targetSessionId =
    cleanStr(nextSessionId) ||
    cleanStr(broadsheet?.session?.id) ||
    cleanStr(sessionId);

  if (!targetSessionId) {
    setMockNotifyStatus({ ...emptyMockNotifyStatus });
    return;
  }

  try {
    setMockNotifyStatus((prev) => ({
      ...prev,
      loading: true,
      message: "",
    }));

    const res = await fetch(
      `/api/headteacher/assessment/mock/release/notify?sessionId=${encodeURIComponent(
        targetSessionId,
      )}`,
      { cache: "no-store", credentials: "include" },
    );

    const json = (await res
      .json()
      .catch(() => null)) as MockReleaseNotifyApiResponse | null;

    if (!res.ok || !json?.ok) {
      setMockNotifyStatus((prev) => ({
        ...prev,
        loading: false,
        queueing: false,
        ok: false,
        message:
          json?.message ||
          json?.error ||
          `Failed to load Mock SMS notification status. HTTP ${res.status}`,
        alreadyNotified: !!json?.alreadyNotified,
        canQueue: !!json?.canQueue,
        blockers: Array.isArray(json?.blockers) ? json.blockers : [],
        existingJob: json?.existingJob ?? null,
        totals: json?.totals ?? null,
        release: json?.release ?? null,
      }));
      return;
    }

    setMockNotifyStatus({
      loading: false,
      queueing: false,
      ok: true,
      message: "",
      alreadyNotified: !!json.alreadyNotified,
      canQueue: !!json.canQueue,
      blockers: Array.isArray(json.blockers) ? json.blockers : [],
      existingJob: json.existingJob ?? null,
      totals: json.totals ?? null,
      release: json.release ?? null,
    });
  } catch {
    setMockNotifyStatus((prev) => ({
      ...prev,
      loading: false,
      queueing: false,
      ok: false,
      message: "Failed to load Mock SMS notification status.",
    }));
  }
}

async function loadMockInterventions(nextSessionId?: string) {
  const targetSessionId =
    cleanStr(nextSessionId) ||
    cleanStr(broadsheet?.session?.id) ||
    cleanStr(sessionId);

  if (!targetSessionId) {
    setMockInterventions({ ...emptyMockInterventions });
    return;
  }

  try {
    setMockInterventions((prev) => ({
      ...prev,
      loading: true,
      message: "Loading Mock intervention cases...",
    }));

    const res = await fetch(
      `/api/headteacher/assessment/mock/interventions?sessionId=${encodeURIComponent(
        targetSessionId,
      )}`,
      { cache: "no-store", credentials: "include" },
    );

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setMockInterventions({
        loading: false,
        ok: false,
        message:
          json?.message ||
          json?.error ||
          `Failed to load Mock interventions. HTTP ${res.status}`,
        items: [],
      });
      return;
    }

    setMockInterventions({
      loading: false,
      ok: true,
      message: "",
      items: Array.isArray(json.items) ? json.items : [],
    });
  } catch {
    setMockInterventions({
      loading: false,
      ok: false,
      message: "Failed to load Mock interventions.",
      items: [],
    });
  }
}

async function createMockIntervention(learner: MockTrendLearner) {
  if (!broadsheet) return;

  const key = learner.studentId;

  try {
    setInterventionCreateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: true,
        ok: null,
        message: "Creating rescue case...",
      },
    }));

    const res = await fetch("/api/headteacher/assessment/mock/interventions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sessionId: broadsheet.session.id,
        studentId: learner.studentId,
        studentName: learner.name,
        trendLabel: learner.trendLabel,
        aggregateMovement: learner.aggregateMovement,
        averageScoreMovement: learner.averageScoreMovement,
        declinedSubjects: learner.declinedSubjects,
        improvedSubjects: learner.improvedSubjects,
        nearGradeOpportunities: learner.nearGradeOpportunities,
        recommendedAction: learner.recommendedAction,
        priority:
          learner.trendLabel === "DECLINING"
            ? "HIGH"
            : learner.trendLabel === "INCOMPLETE"
              ? "MEDIUM"
              : learner.persistentWeakSubjects.length > 0
                ? "MEDIUM"
                : "LOW",
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setInterventionCreateStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: false,
          message:
            json?.message ||
            json?.error ||
            `Failed to create rescue case. HTTP ${res.status}`,
        },
      }));
      return;
    }

    setInterventionCreateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        ok: true,
        message: json.reused
          ? "Existing rescue case reused."
          : "Rescue case created.",
      },
    }));

    if (json.item) {
      setMockInterventions((prev) => {
        const nextItems = [
          json.item as MockInterventionCase,
          ...prev.items.filter((item) => item.id !== json.item.id),
        ];

        return {
          loading: false,
          ok: true,
          message: "",
          items: nextItems,
        };
      });
    }

    void loadMockInterventions(broadsheet.session.id);
  } catch {
    setInterventionCreateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        ok: false,
        message: "Failed to create rescue case.",
      },
    }));
  }
}

async function updateMockInterventionCase(
  item: MockInterventionCase,
  action: MockInterventionLifecycleAction,
) {
  if (!broadsheet) return;

  const key = item.id;
  let note = "";

  if (action !== "START") {
    const prompted = window.prompt(lifecyclePrompt(action), "");
    note = cleanStr(prompted);

    if (note.length < 10) {
      setInterventionUpdateStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: false,
          message: "Add a clear evidence/reason note of at least 10 characters.",
        },
      }));
      return;
    }
  }

  try {
    setInterventionUpdateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: true,
        ok: null,
        message:
          action === "START"
            ? "Starting rescue case..."
            : action === "RESOLVE"
              ? "Resolving rescue case..."
              : action === "ESCALATE"
                ? "Escalating rescue case..."
                : action === "REOPEN"
                  ? "Reopening rescue case..."
                  : "Cancelling rescue case...",
      },
    }));

    const res = await fetch("/api/headteacher/assessment/mock/interventions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sessionId: broadsheet.session.id,
        caseId: item.id,
        action,
        note,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setInterventionUpdateStatus((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          ok: false,
          message:
            json?.message ||
            json?.error ||
            `Failed to update rescue case. HTTP ${res.status}`,
        },
      }));
      return;
    }

    setInterventionUpdateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        ok: true,
        message:
          action === "START"
            ? "Rescue case started."
            : action === "RESOLVE"
              ? "Rescue case resolved with evidence."
              : action === "ESCALATE"
                ? "Rescue case escalated."
                : action === "REOPEN"
                  ? "Rescue case reopened."
                  : "Rescue case cancelled.",
      },
    }));

    if (json.item) {
      setMockInterventions((prev) => ({
        ...prev,
        ok: true,
        message: "",
        items: prev.items.map((existing) =>
          existing.id === item.id ? (json.item as MockInterventionCase) : existing,
        ),
      }));
    }

    void loadMockInterventions(broadsheet.session.id);
  } catch {
    setInterventionUpdateStatus((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        ok: false,
        message: "Failed to update rescue case.",
      },
    }));
  }
}

async function queueMockReleaseSms(nextSessionId?: string | null) {
  const targetSessionId =
    cleanStr(nextSessionId) ||
    cleanStr(broadsheet?.session?.id) ||
    cleanStr(sessionId);

  if (!targetSessionId) return;

  const confirmed = window.confirm(
    "Notify currently eligible parents that this sealed Mock readiness report has been released? EduLife OS will recheck Essential School Alerts permission again before each queued SMS is sent.",
  );

  if (!confirmed) return;

  try {
    setMockNotifyStatus((prev) => ({
      ...prev,
      queueing: true,
      message: "Queueing Mock SMS notification...",
    }));

    const res = await fetch("/api/headteacher/assessment/mock/release/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionId: targetSessionId }),
    });

    const json = (await res
      .json()
      .catch(() => null)) as MockReleaseNotifyApiResponse | null;

    if (!res.ok || !json?.ok) {
      setMockNotifyStatus((prev) => ({
        ...prev,
        queueing: false,
        ok: false,
        message:
          json?.message ||
          json?.error ||
          `Failed to queue Mock SMS notification. HTTP ${res.status}`,
        blockers: Array.isArray(json?.blockers)
          ? json.blockers
          : prev.blockers,
        existingJob: json?.existingJob ?? prev.existingJob,
        totals: json?.totals ?? prev.totals,
        release: json?.release ?? prev.release,
      }));
      return;
    }

    setMockNotifyStatus((prev) => ({
      ...prev,
      loading: false,
      queueing: false,
      ok: true,
      message: json.alreadyQueued
        ? "SMS notification job was already queued."
        : "SMS notification job has been queued. Eligibility will be rechecked before delivery.",
      alreadyNotified: !!json.alreadyNotified,
      canQueue: !!json.canQueue,
      blockers: Array.isArray(json.blockers) ? json.blockers : [],
      existingJob: json.existingJob ?? null,
      totals: json.totals ?? null,
      release: json.release ?? null,
    }));

    void loadMockNotifyStatus(targetSessionId);
  } catch {
    setMockNotifyStatus((prev) => ({
      ...prev,
      queueing: false,
      ok: false,
      message: "Failed to queue Mock SMS notification.",
    }));
  }
}

  async function releaseMockToParents() {
    if (!broadsheet?.session?.id) return;

    try {
      setMockReleaseStatus((prev) => ({
        ...prev,
        releasing: true,
        message: "Releasing sealed Mock readiness to parents...",
      }));

      const res = await fetch("/api/headteacher/assessment/mock/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: broadsheet.session.id,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setMockReleaseStatus((prev) => ({
          ...prev,
          releasing: false,
          ok: false,
          message:
            json?.message ||
            json?.error ||
            `Failed to release Mock to parents. HTTP ${res.status}`,
          blockers: Array.isArray(json?.blockers) ? json.blockers : prev.blockers,
        }));
        return;
      }

      setMockReleaseStatus((prev) => ({
        ...prev,
        releasing: false,
        ok: true,
        message: json.alreadyReleased
          ? "This Mock was already released to parents."
          : "Mock readiness released to parents successfully.",
        canRelease: false,
        alreadyReleased: true,
        blockers: [],
        release: json.release ?? prev.release,
      }));

      void loadMockReleaseStatus(broadsheet.session.id);
      void loadMockNotifyStatus(broadsheet.session.id);
    } catch {
      setMockReleaseStatus((prev) => ({
        ...prev,
        releasing: false,
        ok: false,
        message: "Failed to release Mock to parents.",
      }));
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!classroomId) return;
    if (!visibleClassrooms.some((c) => c.id === classroomId)) {
      const next = visibleClassrooms[0]?.id ?? "";
      if (next) {
        setClassroomId(next);
        setSessionId("");
        void loadOverview({ nextClassroomId: next, nextSessionId: "" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMultiStream, visibleClassrooms]);

  return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                Headteacher • BECE Mock Intelligence
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                JHS3 Mock overview
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                View the full JHS3 Mock readiness picture across all subjects,
                learners, missing evidence, subject averages, and aggregate
                readiness.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/headteacher/dashboard" className={darkButton}>
                Headteacher dashboard
              </Link>

              <Link
                href="/headteacher/assessment/overview"
                className={darkButton}
              >
                Assessment overview
              </Link>

              <Link href="/teacher/assessment/mock" className={darkButton}>
                Teacher Mock cockpit
              </Link>

              {mockExcelExportHref ? (
                <a
                  href={mockExcelExportHref}
                  target="_blank"
                  rel="noreferrer"
                  className={darkButton}
                >
                  Download Excel
                </a>
              ) : (
                <button type="button" disabled className={darkButton}>
                  Download Excel
                </button>
              )}

              {mockPdfExportHref ? (
                <a
                  href={mockPdfExportHref}
                  target="_blank"
                  rel="noreferrer"
                  className={darkButton}
                >
                  Download PDF
                </a>
              ) : (
                <button type="button" disabled className={darkButton}>
                  Download PDF
                </button>
              )}

              <button
                type="button"
                onClick={() => loadOverview()}
                disabled={loading}
                className={goldButton}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-semibold text-[#AEB6C4]">
                  JHS3 classroom
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
                onChange={(e) => {
                  const next = e.target.value;
                  setClassroomId(next);
                  setSessionId("");
                  void loadOverview({
                    nextClassroomId: next,
                    nextSessionId: "",
                  });
                }}
                className={darkInput}
              >
                <option value="">Select JHS3</option>
                {visibleClassrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.label || classroom.name || "JHS3"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Academic year filter
              </label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                onBlur={() =>
                  loadOverview({
                    nextClassroomId: classroomId,
                    nextSessionId: "",
                    nextAcademicYear: academicYear,
                  })
                }
                placeholder="Leave blank for all"
                className={darkInput}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Mock session
              </label>
              <select
                value={sessionId}
                onChange={(e) => {
                  const next = e.target.value;
                  setSessionId(next);
                  void loadOverview({
                    nextClassroomId: classroomId,
                    nextSessionId: next,
                  });
                }}
                className={darkInput}
              >
                <option value="">Select session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} • {session.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </div>

        {!broadsheet ? (
          <div
            className={
              shellCard + " px-5 py-12 text-center text-sm text-[#AEB6C4]"
            }
          >
            {loading
              ? "Loading Mock overview..."
              : "No Mock session found for this JHS3 selection yet."}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <MetricCard
                label="Students"
                value={broadsheet.summary.totalStudents}
                hint="Active JHS3 learners"
              />
              <MetricCard
                label="Subjects"
                value={broadsheet.summary.totalSubjects}
                hint="All Mock columns"
              />
              <MetricCard
                label="Completion"
                value={formatNumber(broadsheet.summary.completionPercent, "%")}
                hint={`${broadsheet.summary.scoredCells}/${broadsheet.summary.possibleCells} cells`}
              />
              <MetricCard
                label="Placement-ready"
                value={broadsheet.summary.placementReadyCount}
                hint="Learners with full placement aggregate"
              />
              <div className={softPanel + " p-4"}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
                  Class readiness
                </div>
                <div
                  className={[
                    "mt-2 inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold",
                    readinessClass(broadsheet.summary.classReadiness.code),
                  ].join(" ")}
                >
                  {broadsheet.summary.classReadiness.label}
                </div>
                <div className="mt-2 text-[11px] text-[#AEB6C4]">
                  {broadsheet.summary.classReadiness.action}
                </div>
              </div>
            </div>

            {broadsheet.warnings.message ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
                {broadsheet.warnings.message}
              </div>
            ) : null}

            <SectionCard
              title="Multi-Mock trend intelligence"
              subtitle="Compares sealed Mock sessions only. This protects the headteacher from treating editable scores as official trend evidence."
            >
              {!broadsheet.trend ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-[12px] text-[#AEB6C4]">
                  Trend intelligence has not been returned for this Mock session yet.
                </div>
              ) : !broadsheet.trend.available ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-[12px] leading-5 text-amber-100">
                    <div className="font-semibold">
                      Trend intelligence is not available yet.
                    </div>
                    <div className="mt-1">
                      {broadsheet.trend.reason ||
                        "At least two sealed Mock sessions are needed before trend movement can be calculated."}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard
                      label="Sealed mocks"
                      value={broadsheet.trend.lockedSessionCount}
                      hint="Minimum needed: 2"
                    />
                    <MetricCard
                      label="Tracked learners"
                      value={broadsheet.trend.summary.trackedLearners}
                      hint="Available after trend opens"
                    />
                    <MetricCard
                      label="Selected Mock"
                      value={broadsheet.session.mockLabel}
                      hint={broadsheet.session.status}
                    />
                  </div>

                  <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 px-4 py-3 text-[12px] leading-5 text-sky-100">
                    Next leadership move: create and seal the next Mock session
                    after teachers complete score entry. EduLife OS will then
                    compare Mock-to-Mock movement automatically.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-5">
                    <MetricCard
                      label="Tracked"
                      value={broadsheet.trend.summary.trackedLearners}
                      hint="Learners compared"
                    />
                    <MetricCard
                      label="Improving"
                      value={broadsheet.trend.summary.improvingCount}
                      hint="Aggregate/score movement up"
                    />
                    <MetricCard
                      label="Declining"
                      value={broadsheet.trend.summary.decliningCount}
                      hint="Needs fast review"
                    />
                    <MetricCard
                      label="Stable"
                      value={broadsheet.trend.summary.stableCount}
                      hint="Push grade boundary"
                    />
                    <MetricCard
                      label="Incomplete"
                      value={broadsheet.trend.summary.incompleteCount}
                      hint="Missing trend evidence"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={panelCard + " p-4"}>
                      <div className="text-sm font-semibold text-[#F7F4ED]">
                        Class movement
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-[#8F98A8]">
                            Avg aggregate movement
                          </div>
                          <div
                            className={[
                              "mt-1 text-lg font-semibold",
                              movementTone(
                                broadsheet.trend.summary.averageAggregateMovement,
                                "aggregate",
                              ),
                            ].join(" ")}
                          >
                            {movementText(
                              broadsheet.trend.summary.averageAggregateMovement,
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-[#AEB6C4]">
                            {aggregateMovementHint(
                              broadsheet.trend.summary.averageAggregateMovement,
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-[#8F98A8]">
                            Avg score movement
                          </div>
                          <div
                            className={[
                              "mt-1 text-lg font-semibold",
                              movementTone(
                                broadsheet.trend.summary.averageScoreMovement,
                                "score",
                              ),
                            ].join(" ")}
                          >
                            {movementText(
                              broadsheet.trend.summary.averageScoreMovement,
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-[#AEB6C4]">
                            {scoreMovementHint(
                              broadsheet.trend.summary.averageScoreMovement,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={panelCard + " p-4"}>
                      <div className="text-sm font-semibold text-[#F7F4ED]">
                        Compared sessions
                      </div>
                      <div className="mt-3 space-y-2">
                        {broadsheet.trend.sessionSummaries.length === 0 ? (
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-[#AEB6C4]">
                            No sealed comparison sessions returned.
                          </div>
                        ) : (
                          broadsheet.trend.sessionSummaries.map((session) => (
                            <div
                              key={session.id}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[12px] font-semibold text-[#F7F4ED]">
                                    {session.title}
                                  </div>
                                  <div className="mt-1 text-[11px] text-[#AEB6C4]">
                                    {session.mockLabel} • {session.status}
                                  </div>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                                  {formatNumber(session.completionPercent, "%")}
                                </span>
                              </div>
                              <div className="mt-2 text-[10px] text-[#8F98A8]">
                                Placement-ready: {session.placementReadyCount} •
                                Class avg agg:{" "}
                                {formatNumber(session.classAveragePlacementAggregate)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                                          <div className="rounded-2xl border border-white/10 bg-[#08111C]/85 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                          Mock intervention accountability board
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-[#AEB6C4]">
                          Headteacher command view for open, active, escalated,
                          and evidence-closed Mock rescue cases.
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                          {mockInterventionBoard.total} total case(s)
                        </span>

                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                          {mockInterventionBoard.activeCount} active
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      <MetricCard
                        label="Open"
                        value={mockInterventionBoard.openCount}
                        hint="Awaiting action"
                      />

                      <MetricCard
                        label="In progress"
                        value={mockInterventionBoard.inProgressCount}
                        hint="Action started"
                      />

                      <MetricCard
                        label="Resolved"
                        value={mockInterventionBoard.resolvedCount}
                        hint="Evidence closed"
                      />

                      <MetricCard
                        label="Escalated"
                        value={mockInterventionBoard.escalatedCount}
                        hint="Needs higher attention"
                      />

                      <MetricCard
                        label="Closure rate"
                        value={formatNumber(
                          mockInterventionBoard.closureRate,
                          "%",
                        )}
                        hint={
                          mockInterventionBoard.total > 0
                            ? `${mockInterventionBoard.resolvedCount}/${mockInterventionBoard.total} case(s)`
                            : "No cases yet"
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#F7F4ED]">
                              Cases needing follow-up
                            </div>
                            <div className="mt-1 text-[11px] text-[#8F98A8]">
                              Sorted by priority, then latest update.
                            </div>
                          </div>

                          <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                            {mockInterventionBoard.followUpCases.length} active
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {mockInterventionBoard.followUpCases.length === 0 ? (
                            <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-3 text-[12px] text-emerald-100">
                              No active rescue case is waiting for follow-up.
                            </div>
                          ) : (
                            mockInterventionBoard.followUpCases
                              .slice(0, 5)
                              .map((item) => {
                                const event = latestCaseEvent(item);

                                return (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="text-[12px] font-semibold text-[#F7F4ED]">
                                          {interventionStudentName(item)}
                                        </div>
                                        <div className="mt-1 text-[10px] text-[#8F98A8]">
                                          {item.title}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap gap-1">
                                        <span
                                          className={[
                                            "rounded-full border px-2 py-1 text-[10px] font-semibold",
                                            interventionStatusClass(item.status),
                                          ].join(" ")}
                                        >
                                          {item.status}
                                        </span>

                                        <span
                                          className={[
                                            "rounded-full border px-2 py-1 text-[10px] font-semibold",
                                            interventionPriorityClass(
                                              item.priority,
                                            ),
                                          ].join(" ")}
                                        >
                                          {item.priority}
                                        </span>
                                      </div>
                                    </div>

                                    {event ? (
                                      <div className="mt-2 text-[10px] leading-4 text-[#AEB6C4]">
                                        Latest:{" "}
                                        <span className="font-semibold text-[#F7F4ED]">
                                          {event.eventType}
                                        </span>{" "}
                                        • {formatDateTime(event.createdAt)}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                          Board signals
                        </div>

                        <div className="mt-3 space-y-2 text-[11px] text-[#C9CDD6]">
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            Rescue candidates:{" "}
                            <span className="font-semibold text-[#F7F4ED]">
                              {mockInterventionBoard.rescueCandidateCount}
                            </span>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            Candidates without linked case:{" "}
                            <span
                              className={[
                                "font-semibold",
                                mockInterventionBoard.unlinkedCandidateCount > 0
                                  ? "text-amber-100"
                                  : "text-emerald-100",
                              ].join(" ")}
                            >
                              {mockInterventionBoard.unlinkedCandidateCount}
                            </span>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            Active workload:{" "}
                            <span className="font-semibold text-[#F7F4ED]">
                              {mockInterventionBoard.activeCount}
                            </span>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            Cancelled:{" "}
                            <span className="font-semibold text-[#F7F4ED]">
                              {mockInterventionBoard.cancelledCount}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-[11px] leading-5 text-sky-100">
                          Latest action:{" "}
                          {mockInterventionBoard.recentEvents[0] ? (
                            <>
                              <span className="font-semibold">
                                {
                                  mockInterventionBoard.recentEvents[0].event
                                    .eventType
                                }
                              </span>{" "}
                              for{" "}
                              <span className="font-semibold">
                                {interventionStudentName(
                                  mockInterventionBoard.recentEvents[0].item,
                                )}
                              </span>
                              <span className="block pt-1 text-sky-100/75">
                                {formatDateTime(
                                  mockInterventionBoard.recentEvents[0].event
                                    .createdAt,
                                )}
                              </span>
                            </>
                          ) : (
                            "No case event yet."
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                          Mock rescue intervention bridge
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-[#AEB6C4]">
                          Convert declining trend evidence into accountable
                          rescue cases for headteacher follow-up before the next
                          Mock.
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                          {mockInterventions.loading
                            ? "Loading cases..."
                            : `${mockInterventions.items.length} linked case(s)`}
                        </span>

                        <button
                          type="button"
                          className={darkButton}
                          onClick={() =>
                            loadMockInterventions(broadsheet.session.id)
                          }
                          disabled={mockInterventions.loading}
                        >
                          Refresh cases
                        </button>
                      </div>
                    </div>

                    {mockInterventions.message ? (
                      <div
                        className={[
                          "mt-3 rounded-xl border px-3 py-2 text-[11px]",
                          mockInterventions.ok === false
                            ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                            : "border-white/10 bg-white/[0.04] text-[#AEB6C4]",
                        ].join(" ")}
                      >
                        {mockInterventions.message}
                      </div>
                    ) : null}
                  </div>

                  <div className="overflow-auto rounded-2xl border border-white/10">
                    <table className="min-w-[1320px] w-full border-collapse text-left text-[12px]">
                      <thead className="bg-white/[0.05] text-[#AEB6C4]">
                        <tr>
                          <th className="border-b border-white/10 px-3 py-2">
                            Learner
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Trend
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Aggregate movement
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Score movement
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Improved subjects
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Declined subjects
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
                            Next action
                          </th>
                          <th className="border-b border-white/10 px-3 py-2">
  Intervention
</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadsheet.trend.learners.slice(0, 20).map((learner) => {
  const existingCase = mockInterventionsByStudentId.get(learner.studentId);
  const createStatus = interventionCreateStatus[learner.studentId];
  const existingCaseStatus = existingCase
  ? cleanStr(existingCase.status).toUpperCase()
  : "";
const caseUpdateStatus = existingCase
  ? interventionUpdateStatus[existingCase.id]
  : undefined;
const latestEvent = existingCase ? latestCaseEvent(existingCase) : null;
  const canCreateIntervention = learnerNeedsIntervention(learner);

  return (
                          <tr
                            key={learner.studentId}
                            className="border-b border-white/5"
                          >
                            <td className="px-3 py-2 font-semibold text-[#F7F4ED]">
                              {learner.name}
                              <div className="mt-1 text-[10px] font-normal text-[#8F98A8]">
                                {learner.previousMockLabel ?? "Previous"} →{" "}
                                {learner.latestMockLabel}
                              </div>
                            </td>

                            <td className="px-3 py-2">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold",
                                  trendClass(learner.trendLabel),
                                ].join(" ")}
                              >
                                {learner.trendLabel}
                              </span>
                              <div className="mt-1 max-w-[220px] text-[10px] leading-4 text-[#AEB6C4]">
                                {learner.trendReason}
                              </div>
                            </td>

                            <td className="px-3 py-2">
                              <div
                                className={[
                                  "font-semibold",
                                  movementTone(
                                    learner.aggregateMovement,
                                    "aggregate",
                                  ),
                                ].join(" ")}
                              >
                                {movementText(learner.aggregateMovement)}
                              </div>
                              <div className="mt-1 text-[10px] text-[#8F98A8]">
                                {learner.previousPlacementAggregate ?? "—"} →{" "}
                                {learner.latestPlacementAggregate ?? "—"}
                              </div>
                            </td>

                            <td className="px-3 py-2">
                              <div
                                className={[
                                  "font-semibold",
                                  movementTone(
                                    learner.averageScoreMovement,
                                    "score",
                                  ),
                                ].join(" ")}
                              >
                                {movementText(learner.averageScoreMovement)}
                              </div>
                              <div className="mt-1 text-[10px] text-[#8F98A8]">
                                {formatNumber(learner.previousAverageScore)} →{" "}
                                {formatNumber(learner.latestAverageScore)}
                              </div>
                            </td>

                            <td className="px-3 py-2 text-[#C9CDD6]">
                              {learner.improvedSubjects.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {learner.improvedSubjects.slice(0, 3).map(
                                    (subject) => (
                                      <span
                                        key={`${learner.studentId}:up:${subject.canonicalSubject}`}
                                        className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-100"
                                      >
                                        {subject.subject}{" "}
                                        {movementText(subject.scoreMovement)}
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="px-3 py-2 text-[#C9CDD6]">
                              {learner.declinedSubjects.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {learner.declinedSubjects.slice(0, 3).map(
                                    (subject) => (
                                      <span
                                        key={`${learner.studentId}:down:${subject.canonicalSubject}`}
                                        className="rounded-full border border-rose-300/20 bg-rose-400/10 px-2 py-1 text-[10px] text-rose-100"
                                      >
                                        {subject.subject}{" "}
                                        {movementText(subject.scoreMovement)}
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="px-3 py-2">
                              <div className="max-w-[280px] text-[11px] leading-5 text-[#C9CDD6]">
                                {learner.recommendedAction}
                              </div>

                              {learner.nearGradeOpportunities.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {learner.nearGradeOpportunities
                                    .slice(0, 2)
                                    .map((subject) => (
                                      <span
                                        key={`${learner.studentId}:near:${subject.canonicalSubject}`}
                                        className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-100"
                                      >
                                        {subject.subject}:{" "}
                                        {subject.pointsToNextGrade} mark(s)
                                      </span>
                                    ))}
                                </div>
                              ) : null}
                            </td>
                                                        <td className="px-3 py-2">
                              {existingCase ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1">
                                    <span
                                      className={[
                                        "rounded-full border px-2 py-1 text-[10px] font-semibold",
                                        interventionStatusClass(
                                          existingCase.status,
                                        ),
                                      ].join(" ")}
                                    >
                                      {existingCase.status}
                                    </span>

                                    <span
                                      className={[
                                        "rounded-full border px-2 py-1 text-[10px] font-semibold",
                                        interventionPriorityClass(
                                          existingCase.priority,
                                        ),
                                      ].join(" ")}
                                    >
                                      {existingCase.priority}
                                    </span>
                                  </div>

                                  <div className="max-w-[240px] text-[10px] leading-4 text-[#AEB6C4]">
                                    {existingCase.title}
                                  </div>

                                  <div className="text-[10px] text-[#8F98A8]">
                                    Opened {formatDateTime(existingCase.createdAt)}
                                  </div>
                                                                    {latestEvent ? (
                                    <div className="max-w-[240px] rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] leading-4 text-[#AEB6C4]">
                                      <div className="font-semibold text-[#F7F4ED]">
                                        Latest event: {latestEvent.eventType}
                                      </div>
                                      <div className="mt-1">
                                        {latestEvent.note ||
                                          `${latestEvent.fromStatus ?? "—"} → ${
                                            latestEvent.toStatus ?? "—"
                                          }`}
                                      </div>
                                      <div className="mt-1 text-[#8F98A8]">
                                        {formatDateTime(latestEvent.createdAt)}
                                      </div>
                                    </div>
                                  ) : null}

                                  <div className="flex flex-wrap gap-1">
                                    {caseCanStart(existingCaseStatus) ? (
                                      <button
                                        type="button"
                                        className={darkButton}
                                        onClick={() =>
                                          updateMockInterventionCase(
                                            existingCase,
                                            "START",
                                          )
                                        }
                                        disabled={caseUpdateStatus?.loading}
                                      >
                                        Start
                                      </button>
                                    ) : null}

                                    {caseCanResolve(existingCaseStatus) ? (
                                      <button
                                        type="button"
                                        className={goldButton}
                                        onClick={() =>
                                          updateMockInterventionCase(
                                            existingCase,
                                            "RESOLVE",
                                          )
                                        }
                                        disabled={caseUpdateStatus?.loading}
                                      >
                                        Resolve with evidence
                                      </button>
                                    ) : null}

                                    {caseCanEscalate(existingCaseStatus) ? (
                                      <button
                                        type="button"
                                        className={darkButton}
                                        onClick={() =>
                                          updateMockInterventionCase(
                                            existingCase,
                                            "ESCALATE",
                                          )
                                        }
                                        disabled={caseUpdateStatus?.loading}
                                      >
                                        Escalate
                                      </button>
                                    ) : null}

                                    {caseCanReopen(existingCaseStatus) ? (
                                      <button
                                        type="button"
                                        className={darkButton}
                                        onClick={() =>
                                          updateMockInterventionCase(
                                            existingCase,
                                            "REOPEN",
                                          )
                                        }
                                        disabled={caseUpdateStatus?.loading}
                                      >
                                        Reopen
                                      </button>
                                    ) : null}
                                  </div>

                                  {caseUpdateStatus?.message ? (
                                    <div
                                      className={[
                                        "max-w-[240px] text-[10px] leading-4",
                                        caseUpdateStatus.ok === false
                                          ? "text-rose-100"
                                          : caseUpdateStatus.ok === true
                                            ? "text-emerald-100"
                                            : "text-[#AEB6C4]",
                                      ].join(" ")}
                                    >
                                      {caseUpdateStatus.message}
                                    </div>
                                  ) : null}
                                </div>
                              ) : canCreateIntervention ? (
                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    className={goldButton}
                                    onClick={() => createMockIntervention(learner)}
                                    disabled={createStatus?.loading}
                                  >
                                    {createStatus?.loading
                                      ? "Creating..."
                                      : "Create rescue case"}
                                  </button>

                                  {createStatus?.message ? (
                                    <div
                                      className={[
                                        "max-w-[220px] text-[10px] leading-4",
                                        createStatus.ok === false
                                          ? "text-rose-100"
                                          : createStatus.ok === true
                                            ? "text-emerald-100"
                                            : "text-[#AEB6C4]",
                                      ].join(" ")}
                                    >
                                      {createStatus.message}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="max-w-[220px] text-[10px] leading-4 text-[#8F98A8]">
                                  No intervention required from current trend.
                                </div>
                              )}
                            </td>
                            </tr>
  );
})}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Mock evidence seal"
              subtitle="Finalize only when required subject evidence, owner accountability, and placement readiness are complete."
              right={
                <button
                  type="button"
                  onClick={finalizeMockSession}
                  disabled={
                    finalizeStatus.loading ||
                    !sealReadiness ||
                    sealReadiness.sealed ||
                    !sealReadiness.ready
                  }
                  className={goldButton}
                >
                  {finalizeStatus.loading
                    ? "Finalizing..."
                    : sealReadiness?.sealed
                      ? "Sealed"
                      : "Finalize Mock"}
                </button>
              }
            >
              <div className="space-y-3">
                <div
                  className={[
                    "rounded-2xl border px-4 py-3 text-[12px] leading-5",
                    sealReadiness?.sealed
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                      : sealReadiness?.ready
                        ? "border-sky-300/20 bg-sky-400/10 text-sky-100"
                        : "border-amber-300/20 bg-amber-400/10 text-amber-100",
                  ].join(" ")}
                >
                  <div className="font-semibold">
                    {sealReadiness?.sealed
                      ? "This Mock session is sealed."
                      : sealReadiness?.ready
                        ? "Ready to finalize."
                        : "Not ready to finalize."}
                  </div>
                  <div className="mt-1">
                    {sealReadiness?.sealed
                      ? "Scores and subject columns are now protected from ordinary edits."
                      : sealReadiness?.ready
                        ? "All local readiness checks passed. Finalization will hard-lock the session and subject items."
                        : "Resolve the blockers below before sealing this Mock as official evidence."}
                  </div>
                </div>

                {!sealReadiness?.sealed && sealReadiness?.blockers.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {sealReadiness.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : null}

                {finalizeStatus.message ? (
                  <div
                    className={[
                      "rounded-xl border px-3 py-2 text-[11px]",
                      finalizeStatus.ok
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                        : finalizeStatus.ok === false
                          ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                          : "border-white/10 bg-white/[0.04] text-[#C9CDD6]",
                    ].join(" ")}
                  >
                    {finalizeStatus.message}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              title="Parent Mock release"
              subtitle="Parents can only see Mock readiness after the headteacher releases a sealed Mock session."
              right={
                <button
                  type="button"
                  onClick={releaseMockToParents}
                  disabled={
                    mockReleaseStatus.loading ||
                    mockReleaseStatus.releasing ||
                    mockReleaseStatus.alreadyReleased ||
                    !mockReleaseStatus.canRelease ||
                    !isSealedMockStatus(broadsheet.session.status)
                  }
                  className={goldButton}
                >
                  {mockReleaseStatus.releasing
                    ? "Releasing..."
                    : mockReleaseStatus.alreadyReleased
                      ? "Released"
                      : "Release to parents"}
                </button>
              }
            >
              <div className="space-y-3">
                <div
                  className={[
                    "rounded-2xl border px-4 py-3 text-[12px] leading-5",
                    mockReleaseStatus.alreadyReleased
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                      : mockReleaseStatus.canRelease
                        ? "border-sky-300/20 bg-sky-400/10 text-sky-100"
                        : "border-amber-300/20 bg-amber-400/10 text-amber-100",
                  ].join(" ")}
                >
                  <div className="font-semibold">
                    {mockReleaseStatus.loading
                      ? "Checking release status..."
                      : mockReleaseStatus.alreadyReleased
                        ? "This Mock has been released to parents."
                        : mockReleaseStatus.canRelease
                          ? "This sealed Mock is ready for parent release."
                          : "This Mock is not ready for parent release."}
                  </div>

                  <div className="mt-1">
                    {mockReleaseStatus.alreadyReleased
                      ? "Parent visibility is now approved for this sealed Mock session. Use the SMS notification card below to confirm notification status."
                      : mockReleaseStatus.canRelease
                        ? "Release will make this sealed Mock session eligible for parent-facing BECE readiness views. SMS notification is controlled separately below."
                        : "Seal the Mock first and resolve any release blockers before exposing readiness to parents."}
                  </div>
                </div>

                {mockReleaseStatus.release ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]">
                      Released:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {formatDateTime(mockReleaseStatus.release.releasedAt)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]">
                      Released by:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {cleanStr(mockReleaseStatus.release.releasedByUser?.name) ||
                          cleanStr(mockReleaseStatus.release.releasedByUser?.email) ||
                          "Headteacher/Admin"}
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]">
                      Snapshot hash:{" "}
                      <span className="font-mono text-[10px] text-[#F7F4ED]">
                        {mockReleaseStatus.release.releaseSnapshotHash.slice(0, 16)}...
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]">
                      SMS status:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockReleaseStatus.release.smsNotifiedAt
                          ? `Sent ${formatDateTime(mockReleaseStatus.release.smsNotifiedAt)}`
                          : "Not sent yet"}
                      </span>
                    </div>
                  </div>
                ) : null}

                {!mockReleaseStatus.alreadyReleased &&
                mockReleaseStatus.blockers.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {mockReleaseStatus.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : null}

                {mockReleaseStatus.message ? (
                  <div
                    className={[
                      "rounded-xl border px-3 py-2 text-[11px]",
                      mockReleaseStatus.ok
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                        : mockReleaseStatus.ok === false
                          ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                          : "border-white/10 bg-white/[0.04] text-[#C9CDD6]",
                    ].join(" ")}
                  >
                    {mockReleaseStatus.message}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              title="Parent SMS notification"
              subtitle="Uses current Essential School Alerts permission. Eligible siblings in the same verified family share one SMS destination."
            >
              <div className="space-y-4">
                {mockNotifyStatus.message ? (
                  <div
                    className={[
                      "rounded-2xl border px-4 py-3 text-[12px]",
                      mockNotifyStatus.ok === false
                        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                        : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
                    ].join(" ")}
                  >
                    {mockNotifyStatus.message}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-5">
                  <MetricCard
                    label="Eligible phones"
                    value={mockNotifyStatus.totals?.eligibleGuardianPhones ?? "—"}
                    hint="One SMS per verified family phone"
                  />

                  <MetricCard
                    label="Eligible learners"
                    value={mockNotifyStatus.totals?.eligibleLearners ?? "—"}
                    hint="Currently covered by SMS"
                  />

                  <MetricCard
                    label="Not enabled"
                    value={mockNotifyStatus.totals?.notEligibleLearners ?? "—"}
                    hint="Essential Alerts not current"
                  />

                  <MetricCard
                    label="No phone"
                    value={mockNotifyStatus.totals?.skippedNoPhone ?? "—"}
                    hint="Missing guardian phone"
                  />

                  <MetricCard
                    label="Family check"
                    value={mockNotifyStatus.totals?.ambiguousFamilyLearners ?? "—"}
                    hint="Shared phone could not be safely grouped"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] text-[#C9CDD6]">
                  <div className="font-semibold text-[#F7F4ED]">
                    Notification status
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      Job:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.existingJob?.status ?? "Not queued"}
                      </span>
                    </div>

                    <div>
                      SMS notified:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.alreadyNotified ? "Yes" : "No"}
                      </span>
                    </div>

                    <div>
                      Sent:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.existingJob?.sentCount ?? 0}
                      </span>
                    </div>

                    <div>
                      Failed:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.existingJob?.failedCount ?? 0}
                      </span>
                    </div>

                    <div>
                      Skipped:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.existingJob?.skippedCount ?? 0}
                      </span>
                    </div>

                    <div>
                      Targets:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {mockNotifyStatus.existingJob?.totalTargets ?? 0}
                      </span>
                    </div>
                  </div>

                  {mockNotifyStatus.release?.smsNotifiedAt ? (
                    <div className="mt-2 text-[#AEB6C4]">
                      Completed:{" "}
                      {formatDateTime(mockNotifyStatus.release.smsNotifiedAt)}
                    </div>
                  ) : null}
                </div>

                {mockNotifyStatus.blockers.length > 0 ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
                    <div className="font-semibold">SMS blockers</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {mockNotifyStatus.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadMockNotifyStatus()}
                    disabled={mockNotifyStatus.loading}
                    className={darkButton}
                  >
                    {mockNotifyStatus.loading
                      ? "Refreshing..."
                      : "Refresh SMS status"}
                  </button>

                  <button
                    type="button"
                    onClick={() => queueMockReleaseSms()}
                    disabled={
                      mockNotifyStatus.loading ||
                      mockNotifyStatus.queueing ||
                      !mockNotifyStatus.canQueue ||
                      mockNotifyStatus.alreadyNotified
                    }
                    className={goldButton}
                  >
                    {mockNotifyStatus.alreadyNotified
                      ? "Parents already notified"
                      : mockNotifyStatus.queueing
                        ? "Queueing..."
                        : "Notify eligible parents"}
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Evidence completeness command map"
              subtitle="Bank-grade action surface: what is missing, who owns it, and where to act next."
            >
              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#08111C]/85 p-4 md:grid-cols-[220px_1fr]">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                      Reminder deadline
                    </label>
                    <input
                      type="date"
                      value={reminderDeadline}
                      onChange={(e) => setReminderDeadline(e.target.value)}
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                      Optional headteacher note
                    </label>
                    <input
                      value={reminderNote}
                      onChange={(e) => setReminderNote(e.target.value)}
                      placeholder="Example: Complete before Friday’s readiness review."
                      className={darkInput}
                    />
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {broadsheet.evidenceActions.headlineActions.map((action) => (
                    <div
                      key={`${action.code}:${action.title}:${action.subject ?? action.studentId ?? ""}`}
                      className="rounded-2xl border border-white/10 bg-[#08111C]/85 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-[#F7F4ED]">
                              {action.title}
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[#C9CDD6]">
                              {actionModeLabel(action.mode)}
                            </span>
                          </div>

                          <div className="mt-2 text-[12px] leading-5 text-[#AEB6C4]">
                            {action.detail}
                          </div>
                        </div>

                        <span
                          className={[
                            "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold",
                            priorityClass(action.priority),
                          ].join(" ")}
                        >
                          {action.priority}
                        </span>
                      </div>

                      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-[#C9CDD6]">
                        Owner:{" "}
                        <span className="font-semibold text-[#F7F4ED]">
                          {action.owner}
                        </span>
                      </div>

                      <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
                        Primary action:{" "}
                        <span className="font-semibold">
                          {action.primaryAction}
                        </span>
                      </div>

                      {action.mode === "NOTIFY_TEACHER" ||
                      action.mode === "REMIND_TEACHER" ? (
                        <div
                          className={[
                            "mt-2 rounded-xl border px-3 py-2 text-[11px]",
                            action.ownerStatus?.hasOwner === false
                              ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                              : "border-emerald-300/15 bg-emerald-400/10 text-emerald-100",
                          ].join(" ")}
                        >
                          Owner status:{" "}
                          <span className="font-semibold">
                            {action.ownerStatus?.hasOwner === false
                              ? "No assigned teacher found"
                              : action.ownerStatus?.owners?.length
                                ? action.ownerStatus.owners
                                    .map(
                                      (owner) =>
                                        cleanStr(owner.name) || "Teacher",
                                    )
                                    .join(", ")
                                : "Owner check pending"}
                          </span>
                          {action.ownerStatus?.hasOwner === false ? (
                            <span className="block pt-1 text-rose-100/75">
                              Assign this subject to a teacher before sending
                              reminders.
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {action.mode === "NOTIFY_TEACHER" ||
                      action.mode === "REMIND_TEACHER" ? (
                        <div className="mt-2 rounded-xl border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-[11px] text-sky-100">
                          Reminder status:{" "}
                          <span className="font-semibold">
                            {reminderAuditLabel(action)}
                          </span>
                          {action.reminderAudit?.sentAt ? (
                            <span className="block pt-1 text-sky-100/75">
                              Sent:{" "}
                              {formatDateTime(action.reminderAudit.sentAt)}
                            </span>
                          ) : null}
                          {action.reminderAudit?.recipients?.length ? (
                            <span className="block pt-1 text-sky-100/75">
                              Recipient(s):{" "}
                              {action.reminderAudit.recipients
                                .map(
                                  (recipient) =>
                                    cleanStr(recipient.name) || "Teacher",
                                )
                                .join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {action.lastResortAction ? (
                        <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                          Last resort:{" "}
                          <span className="font-semibold">
                            {action.lastResortAction}
                          </span>
                        </div>
                      ) : null}

                      {action.ownerStatus?.hasOwner === false ? (
                        <Link
                          href={action.ownerStatus.assignmentHref}
                          className="inline-flex items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/15"
                        >
                          Assign subject owner
                        </Link>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {action.mode === "NOTIFY_TEACHER" ||
                        action.mode === "REMIND_TEACHER" ? (
                          <button
                            type="button"
                            onClick={() => sendTeacherReminder(action)}
                            disabled={
                              !canSendTeacherReminder(action) ||
                              !!reminderStatus[actionKey(action)]?.loading
                            }
                            title={
                              canSendTeacherReminder(action)
                                ? "Send official in-app reminder to the assigned teacher."
                                : "This action needs a specific subject before a teacher reminder can be sent."
                            }
                            className={[
                              "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                              canSendTeacherReminder(action)
                                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                                : "border-white/10 bg-white/[0.03] text-[#8F98A8]",
                            ].join(" ")}
                          >
                            {reminderButtonLabel(
                              action,
                              reminderStatus[actionKey(action)],
                            )}
                          </button>
                        ) : null}

                        <Link
                          href={action.href}
                          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
                        >
                          {action.mode === "LEARNER_SUPPORT_REVIEW"
                            ? "Open learner profile"
                            : action.mode === "REVIEW_ONLY"
                              ? "Review"
                              : "Open last-resort cockpit"}
                        </Link>
                      </div>

                      {reminderStatus[actionKey(action)]?.message ? (
                        <div
                          className={[
                            "mt-2 rounded-xl border px-3 py-2 text-[11px]",
                            reminderStatus[actionKey(action)]?.ok
                              ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                              : reminderStatus[actionKey(action)]?.ok === false
                                ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                                : "border-white/10 bg-white/[0.03] text-[#C9CDD6]",
                          ].join(" ")}
                        >
                          {reminderStatus[actionKey(action)]?.message}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Missing core columns
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {broadsheet.evidenceActions.missingCoreSubjectColumns
                        .length === 0 ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                          Core columns created
                        </span>
                      ) : (
                        broadsheet.evidenceActions.missingCoreSubjectColumns.map(
                          (subject) => (
                            <span
                              key={subject}
                              className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-[11px] text-rose-100"
                            >
                              {subject}
                            </span>
                          ),
                        )
                      )}
                    </div>
                  </div>

                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Missing school aggregate columns
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {broadsheet.evidenceActions.missingSchoolAggregateColumns
                        .length === 0 ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                          School aggregate columns created
                        </span>
                      ) : (
                        broadsheet.evidenceActions.missingSchoolAggregateColumns.map(
                          (subject) => (
                            <span
                              key={subject}
                              className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-100"
                            >
                              {subject}
                            </span>
                          ),
                        )
                      )}
                    </div>
                  </div>

                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Elective sufficiency
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[#AEB6C4]">
                      Placement aggregate requires at least{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {
                          broadsheet.evidenceActions.requiredSubjectColumns
                            .placementElectiveMinimum
                        }
                      </span>{" "}
                      elective subjects.
                    </div>

                    <div className="mt-3">
                      {broadsheet.evidenceActions.missingElectiveColumnCount >
                      0 ? (
                        <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-100">
                          Add{" "}
                          {
                            broadsheet.evidenceActions
                              .missingElectiveColumnCount
                          }{" "}
                          more elective column(s)
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                          Elective minimum satisfied
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className={panelCard + " p-4"}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                          Subject score gaps
                        </div>
                        <div className="mt-1 text-[11px] text-[#8F98A8]">
                          Subjects with missing learner scores.
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {broadsheet.evidenceActions.subjectScoreGaps.length ===
                      0 ? (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100">
                          No subject score gaps.
                        </div>
                      ) : (
                        broadsheet.evidenceActions.subjectScoreGaps
                          .slice(0, 8)
                          .map((gap) => (
                            <Link
                              key={gap.itemId}
                              href={gap.href}
                              className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.06]"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[12px] font-semibold text-[#F7F4ED]">
                                    {gap.subject}
                                  </div>
                                  <div className="text-[11px] text-[#AEB6C4]">
                                    {gap.scoredCount} scored •{" "}
                                    {gap.missingCount} missing
                                  </div>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                                  {formatNumber(gap.completionPercent, "%")}
                                </span>
                              </div>
                            </Link>
                          ))
                      )}
                    </div>
                  </div>

                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Learner evidence gaps
                    </div>
                    <div className="mt-1 text-[11px] text-[#8F98A8]">
                      Learners missing the most visible Mock subject scores.
                    </div>

                    <div className="mt-3 space-y-2">
                      {broadsheet.evidenceActions.learnerScoreGaps.length ===
                      0 ? (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100">
                          No learner evidence gaps.
                        </div>
                      ) : (
                        broadsheet.evidenceActions.learnerScoreGaps
                          .slice(0, 8)
                          .map((gap) => (
                            <div
                              key={gap.studentId}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[12px] font-semibold text-[#F7F4ED]">
                                    {gap.name}
                                  </div>
                                  <div className="text-[11px] text-[#AEB6C4]">
                                    {gap.scoredSubjectCount} scored •{" "}
                                    {gap.missingSubjectCount} missing
                                  </div>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                                  Avg {formatNumber(gap.averageScore)}
                                </span>
                              </div>

                              {gap.missingForPlacement.length > 0 ? (
                                <div className="mt-2 text-[10px] text-[#8F98A8]">
                                  Missing for placement:{" "}
                                  {gap.missingForPlacement.join(", ")}
                                </div>
                              ) : null}
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                <div className={panelCard + " p-4"}>
                  <div className="text-sm font-semibold text-[#F7F4ED]">
                    Early learner support signals
                  </div>
                  <div className="mt-1 text-[11px] text-[#8F98A8]">
                    Based only on scores already entered. These are provisional
                    support flags, not final BECE readiness judgments.
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {broadsheet.evidenceActions.learnerRiskSignals.length ===
                    0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-[#AEB6C4]">
                        No low-average learner signal yet.
                      </div>
                    ) : (
                      broadsheet.evidenceActions.learnerRiskSignals.map(
                        (signal) => (
                          <Link
                            key={signal.studentId}
                            href={`/headteacher/student/${signal.studentId}`}
                            className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 transition hover:bg-rose-400/15"
                          >
                            <div className="text-[12px] font-semibold text-rose-100">
                              {signal.name}
                            </div>
                            <div className="mt-1 text-[11px] text-rose-100/80">
                              Avg {formatNumber(signal.averageScore)} •{" "}
                              {signal.scoredSubjectCount} scored
                            </div>
                            <div className="mt-2 text-[10px] text-rose-100/70">
                              Provisional support signal. Review learner
                              context, then follow up with the responsible
                              subject teacher.
                            </div>
                          </Link>
                        ),
                      )
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Candidate rescue profiles"
              subtitle="Learner-by-learner BECE Mock rescue lens: missing evidence, weak subjects, near-grade opportunities, and next action."
            >
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard
                    label="Critical rescue"
                    value={
                      broadsheet.candidateRescueProfiles.filter(
                        (profile) => profile.priority === "CRITICAL",
                      ).length
                    }
                    hint="Missing evidence or severe weakness"
                  />
                  <MetricCard
                    label="High rescue"
                    value={
                      broadsheet.candidateRescueProfiles.filter(
                        (profile) => profile.priority === "HIGH",
                      ).length
                    }
                    hint="Weak subject drag"
                  />
                  <MetricCard
                    label="Improvement chances"
                    value={
                      broadsheet.candidateRescueProfiles.filter(
                        (profile) => profile.priority === "MEDIUM",
                      ).length
                    }
                    hint="Near next grade"
                  />
                  <MetricCard
                    label="Stable monitor"
                    value={
                      broadsheet.candidateRescueProfiles.filter(
                        (profile) => profile.priority === "LOW",
                      ).length
                    }
                    hint="No urgent signal"
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {broadsheet.candidateRescueProfiles.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-[12px] text-[#AEB6C4]">
                      No candidate rescue profiles available yet.
                    </div>
                  ) : (
                    broadsheet.candidateRescueProfiles
                      .slice(0, 12)
                      .map((profile) => (
                        <div
                          key={profile.studentId}
                          className={panelCard + " p-4"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[#F7F4ED]">
                                {profile.name}
                              </div>
                              <div className="mt-1 text-[11px] text-[#AEB6C4]">
                                Avg {formatNumber(profile.averageScore)} •{" "}
                                {profile.scoredSubjectCount} scored •{" "}
                                {profile.missingSubjectCount} missing
                              </div>
                            </div>

                            <span
                              className={[
                                "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold",
                                rescuePriorityClass(profile.priority),
                              ].join(" ")}
                            >
                              {profile.priorityLabel}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8F98A8]">
                                School agg.
                              </div>
                              <div className="mt-1 text-[13px] font-semibold text-[#F7F4ED]">
                                {profile.schoolAggregate.aggregate ??
                                  "Incomplete"}
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8F98A8]">
                                Placement agg.
                              </div>
                              <div className="mt-1 text-[13px] font-semibold text-[#F7F4ED]">
                                {profile.placementAggregate.aggregate ??
                                  "Incomplete"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-[11px] leading-5 text-sky-100">
                            <span className="font-semibold">Why: </span>
                            {profile.reason}
                          </div>

                          <div className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-[11px] leading-5 text-emerald-100">
                            <span className="font-semibold">Next action: </span>
                            {profile.nextAction}
                          </div>

                          {profile.missingSubjects.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] font-semibold text-[#F7F4ED]">
                                Missing evidence
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {profile.missingSubjects.map((subject) => (
                                  <span
                                    key={`${profile.studentId}:missing:${subject}`}
                                    className="rounded-full border border-rose-300/20 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-100"
                                  >
                                    {subject}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {profile.weakSubjects.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] font-semibold text-[#F7F4ED]">
                                Weak subjects
                              </div>
                              <div className="mt-2 space-y-2">
                                {profile.weakSubjects.map((subject) => (
                                  <div
                                    key={`${profile.studentId}:weak:${subject.canonicalSubject}`}
                                    className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-semibold">
                                        {subject.subject}
                                      </span>
                                      <span>
                                        {formatNumber(subject.score)} •{" "}
                                        {subject.gradeLabel ?? "—"}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-rose-100/75">
                                      Owner: {subjectOwnerLine(subject)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {profile.nearGradeOpportunities.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] font-semibold text-[#F7F4ED]">
                                Fast improvement opportunities
                              </div>
                              <div className="mt-2 space-y-2">
                                {profile.nearGradeOpportunities.map(
                                  (subject) => (
                                    <div
                                      key={`${profile.studentId}:near:${subject.canonicalSubject}`}
                                      className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold">
                                          {subject.subject}
                                        </span>
                                        <span>
                                          {subject.pointsToNextGrade} mark(s) to
                                          Grade {subject.nextGrade}
                                        </span>
                                      </div>
                                      <div className="mt-1 text-amber-100/75">
                                        Owner: {subjectOwnerLine(subject)}
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : null}

                          {profile.strongSubjects.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] font-semibold text-[#F7F4ED]">
                                Strengths to protect
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {profile.strongSubjects.map((subject) => (
                                  <span
                                    key={`${profile.studentId}:strong:${subject.canonicalSubject}`}
                                    className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                                  >
                                    {subject.subject} •{" "}
                                    {subject.gradeLabel ?? "—"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-3">
                            <Link
                              href={`/headteacher/student/${profile.studentId}?focus=mock-readiness`}
                              className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/[0.08]"
                            >
                              Open learner profile
                            </Link>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </SectionCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard
                title="Subject readiness"
                subtitle="Averages, missing scores, and strongest/weakest subjects."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {broadsheet.subjectSummaries.length === 0 ? (
                    <div className="text-sm text-[#AEB6C4]">
                      No Mock subjects created yet.
                    </div>
                  ) : (
                    broadsheet.subjectSummaries.map((summary) => (
                      <div key={summary.itemId} className={panelCard + " p-4"}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#F7F4ED]">
                              {summary.subject}
                            </div>
                            <div className="mt-1 text-[11px] text-[#8F98A8]">
                              {summary.scoredCount} scored •{" "}
                              {summary.missingCount} missing
                            </div>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                            {summary.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <MetricCard
                            label="Avg score"
                            value={formatNumber(summary.averageScore)}
                          />
                          <MetricCard
                            label="Avg grade"
                            value={formatNumber(summary.averageGrade)}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="Leadership focus"
                subtitle="Where the headteacher should pay attention first."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Weakest subjects
                    </div>
                    <div className="mt-3 space-y-2">
                      {broadsheet.weakestSubjects.length === 0 ? (
                        <div className="text-[12px] text-[#AEB6C4]">
                          Not enough subject evidence yet.
                        </div>
                      ) : (
                        broadsheet.weakestSubjects.map((subject) => (
                          <div
                            key={subject.itemId}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                          >
                            <div className="text-[12px] font-semibold text-[#F7F4ED]">
                              {subject.subject}
                            </div>
                            <div className="text-[11px] text-[#AEB6C4]">
                              Avg grade {formatNumber(subject.averageGrade)} •
                              Avg score {formatNumber(subject.averageScore)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      Strongest subjects
                    </div>
                    <div className="mt-3 space-y-2">
                      {broadsheet.topSubjects.length === 0 ? (
                        <div className="text-[12px] text-[#AEB6C4]">
                          Not enough subject evidence yet.
                        </div>
                      ) : (
                        broadsheet.topSubjects.map((subject) => (
                          <div
                            key={subject.itemId}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                          >
                            <div className="text-[12px] font-semibold text-[#F7F4ED]">
                              {subject.subject}
                            </div>
                            <div className="text-[11px] text-[#AEB6C4]">
                              Avg grade {formatNumber(subject.averageGrade)} •
                              Avg score {formatNumber(subject.averageScore)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Learner readiness broadsheet"
              subtitle="Placement-style aggregate stays incomplete until all required subjects exist."
            >
              <div className="overflow-auto rounded-2xl border border-white/10">
                <table className="min-w-[980px] w-full border-collapse text-left text-[12px]">
                  <thead className="bg-white/[0.05] text-[#AEB6C4]">
                    <tr>
                      <th className="border-b border-white/10 px-3 py-2">
                        Learner
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        Scored subjects
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        Average
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        School agg.
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        Placement agg.
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        Readiness
                      </th>
                      <th className="border-b border-white/10 px-3 py-2">
                        Missing for placement
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadsheet.students.map((student) => (
                      <tr
                        key={student.studentId}
                        className="border-b border-white/5"
                      >
                        <td className="px-3 py-2 font-semibold text-[#F7F4ED]">
                          {student.name}
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.scoredSubjectCount} scored •{" "}
                          {student.missingSubjectCount} missing
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {formatNumber(student.averageScore)}
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.schoolAggregate.aggregate ?? "Incomplete"}
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.placementAggregate.aggregate ?? "Incomplete"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold",
                              readinessClass(student.readiness.code),
                            ].join(" ")}
                          >
                            {student.readiness.code}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#AEB6C4]">
                          {student.placementAggregate.missingSubjects?.length
                            ? student.placementAggregate.missingSubjects.join(
                                ", ",
                              )
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}
