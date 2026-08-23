// src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Fragment,
  type ChangeEvent,
} from "react";
import type {
  HeadteacherDirectorGovernanceQueue,
  HeadteacherDirectorGovernanceQueueItem,
  HeadteacherDirectorGovernanceReviewPackage,
} from "@/lib/appraisals/headteacherDirectorGovernanceReview";
import type { HeadteacherDirectorAnonymousResponsesView } from "@/lib/appraisals/headteacherDirectorAnonymousResponses";

type DecisionMode = "RETURN" | "HOLD" | "RELEASE";
type QueuePanel = "ALL" | "APPROVAL" | "COMPLETE" | "READY" | "OPEN";
type ReviewMode = "HOME" | "STAFF";
type GovernanceFocus = "TEACHER" | "HEADTEACHER" | "MINE";
type StaffLevel = "CIRCUIT" | "SCHOOL" | "RESPONDENTS" | "FORM";

type DirectorQueueItem = {
  cycleId: string;
  cycleStatus: string;
  label: string;
  targetHeadteacherName: string | null;
  schoolName: string;
  circuitName: string | null;
  requestMode: "HEADTEACHER_REQUEST" | "DIRECT_OPEN" | "UNKNOWN";
  requestedAt: string;
  openedAt: string | null;
  deadlineAt: string | null;
  closedAt: string | null;
  releasedAt: string | null;
  participantCount: number;
  eligibleParticipantCount: number;
  finalizedResponseCount: number;
  feedbackWindowExpired: boolean;
  feedbackDeadlineExtensionCount: 0 | 1;
  canExtendFeedbackWindow: boolean;
  canDirectReleaseOwnAssessment: boolean;
  directReleaseAssessmentId: string | null;
  governanceAssessmentDirectReleased: boolean;
  governanceAssessmentId: string | null;
  staffFeedbackReviewState:
    | "NOT_STARTED"
    | "PENDING"
    | "RETURNED"
    | "HELD"
    | "RELEASED";
  staffFeedbackReviewId: string | null;
  staffFeedbackReviewStage: number | null;
  canStartStaffFeedbackReview: boolean;
  canDecideStaffFeedbackReview: boolean;
  staffFeedbackReleasedAt: string | null;
};

type DirectorQueue = {
  pendingApprovalCount: number;
  openCount: number;
  items: DirectorQueueItem[];
};

type DirectorQueueApiResponse =
  | { ok: true; reqId: string; queue: DirectorQueue }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type StaffFeedbackReviewState = {
  cycleId: string;
  snapshotId: string;
  lifecycleState:
    | "READY_TO_START"
    | "PENDING_DECISION"
    | "RETURNED_TO_QUEUE"
    | "HELD_CONTINUATION"
    | "RELEASED";
  latestReviewId: string | null;
  latestStage: number | null;
  latestDecision: "PENDING" | "RETURNED" | "HELD" | "ACCEPTED" | null;
  canStartReview: boolean;
  canDecide: boolean;
  releasedAt: string | null;
  releaseProofHash: string | null;
  governanceAssessmentRequired: false;
  carrierCycleStatusMutationPerformed: false;
};

type StaffReviewStartApiResponse =
  | {
      ok: true;
      reqId: string;
      result: {
        outcome: "STARTED" | "EXISTING_PENDING";
        state: StaffFeedbackReviewState;
        reviewId: string;
        stage: number;
        snapshotId: string;
        reviewEvidenceHash: string;
        providerCalled: false;
      };
    }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type StaffReviewDecisionResult = {
  outcome: string;
  cycleId: string;
  sourceReviewId: string;
  sourceReviewStage: number;
  sourceReviewDecision: "RETURNED" | "HELD" | "ACCEPTED";
  snapshotId: string;
  nextReviewId: string | null;
  nextReviewStage: number | null;
  releaseProofHash: string | null;
  releasedAt: string | null;
};

type StaffReviewDecisionApiResponse =
  | {
      ok: true;
      reqId: string;
      result: StaffReviewDecisionResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      releaseCommitted?: boolean;
      retrySafe?: boolean;
      result?: StaffReviewDecisionResult;
    };

type DirectorGovernanceWorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

type DirectorGovernanceWorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: DirectorGovernanceWorkspaceItem[];
};

type DirectorGovernanceWorkspace = {
  assessment: {
    assessmentId: string;
    cycleId: string;
    revision: number;
    status: string;
    dateObserved: string;
    canEdit: boolean;
    canFinalize: boolean;
    progress: {
      totalSections: number;
      completedSections: number;
      totalItems: number;
      answeredItems: number;
      notApplicableItems: number;
      completionPercentage: number;
      missingItemKeys: string[];
    };
  };
  lifecycle: {
    state: string;
    label: string;
    description: string;
    readOnly: boolean;
    canEdit: boolean;
    canCreateRevision: boolean;
    returnReason: string | null;
  };
  visit: {
    contextSchemaVersion: 1 | 2;
    officialDetailsAvailable: boolean;
    targetName: string | null;
    schoolName: string;
    circuitName: string;
    districtName: string;
    dateObserved: string;
    assessorRole: string;
    arrivalTime: string | null;
    staffStrength: number | null;
    totalEnrolment: number | null;
    girls: number | null;
    boys: number | null;
    teachersPresentAtVisit: number | null;
  };
  sections: DirectorGovernanceWorkspaceSection[];
};

type DirectorGovernanceWorkspaceApiResponse =
  | { ok: true; reqId: string; workspace: DirectorGovernanceWorkspace }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type DirectorGovernanceQueueApiResponse =
  | { ok: true; reqId: string; queue: HeadteacherDirectorGovernanceQueue }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type TeacherDirectorReviewQueueItem = {
  cycleId: string;
  assessmentId: string;
  revision: number;
  dateObserved: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  assessorRole:
    | "SISSO"
    | "BASIC_SCHOOL_COORDINATOR"
    | "HEAD_OF_SUPERVISION"
    | "DISTRICT_DIRECTOR";
  assessorOfficeLabel: string;
  state: "READY_TO_START" | "READY_TO_REVIEW" | "READY_TO_RELEASE";
  nextAction: "START_REVIEW" | "CONTINUE_REVIEW" | "DIRECT_RELEASE";
  eligible: true;
};

type TeacherDirectorReviewQueue = {
  actorRole: string;
  officeLabel: string;
  summary: {
    assessments: number;
    readyToStart: number;
    readyToReview: number;
    readyToRelease: number;
    circuits: number;
    schools: number;
  };
  items: TeacherDirectorReviewQueueItem[];
  readOnlyDiscovery: true;
  assessmentEvidenceIncluded: false;
  scoresIncluded: false;
  generalCommentIncluded: false;
  observationDetailsIncluded: false;
  classEnrolmentEvidenceIncluded: false;
  contactDetailsIncluded: false;
  assessorUserIdIncluded: false;
  targetUserIdIncluded: false;
  reviewIdIncluded: false;
  assignmentIdsIncluded: false;
  proofHashesIncluded: false;
  legacyTeacherAppraisalIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

type TeacherDirectorReviewQueueApiResponse =
  | { ok: true; reqId: string; reviewQueue: TeacherDirectorReviewQueue }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type DirectorGovernanceReviewPackageApiResponse =
  | {
      ok: true;
      reqId: string;
      reviewPackage: HeadteacherDirectorGovernanceReviewPackage;
    }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type DirectReleaseInspection = {
  item: HeadteacherDirectorGovernanceQueueItem;
  workspace: DirectorGovernanceWorkspace;
};

type DeadlineExtensionApiResponse =
  | {
      ok: true;
      reqId: string;
      result: {
        outcome: "EXTENDED" | "EXISTING_EXTENDED";
        newDeadlineAt: string;
        extensionDays: number;
      };
    }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type AnonymousResponsesApiResponse =
  | {
      ok: true;
      reqId: string;
      anonymousResponses: HeadteacherDirectorAnonymousResponsesView;
    }
  | { ok: false; reqId?: string; error: string; details?: unknown };

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
  detail?: string;
  releaseCommitted?: boolean;
  closureCommitted?: boolean;
};

type AnonymousSelectedResponse = NonNullable<
  HeadteacherDirectorAnonymousResponsesView["selectedResponse"]
>;

const API_BASE = "/api/district/headteacher-appraisals";
const TEACHER_REVIEW_QUEUE_API =
  "/api/governance/appraisals/teacher-supervisory/review-queue";
const TEACHER_REVIEW_WORKSPACE =
  "/governance/appraisals/teacher-supervisory/review";


const DIRECTOR_REVIEW_UI_POLICY = Object.freeze({
  audience: "DISTRICT_DIRECTOR",
  presentation: "NATIVE_EVIDENCE_FIRST",
  backgroundPollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  respondentIdentitiesIncluded: false,
  anonymousIndividualFormsIncluded: true,
  realIdentityAudience: "SUPERADMIN_ONLY",
  reviewerMayRewriteScores: false,
  combinedScoreIncluded: false,
  providerDeliveryIncluded: false,
  stageSelectionMode: "SERVER_QUEUE_DERIVED_ON_LOAD",
  attentionBadgeDoesNotSelectStage: true,
  directorAuthoredDecisionPath: "DIRECT_RELEASE_NO_SELF_REVIEW",
  appraisalChannels: ["STAFF_FEEDBACK", "GOVERNANCE_SUPERVISORY"],
  directReleaseInspectionRequired: true,
  directReleaseMutationFromInspectionOnly: true,
  governanceReviewedDecisionPath: "ASSESSMENT_KEYED_ROLE_SCOPED_RETURN_HOLD_RELEASE",
  governanceReturnAssessorRole: "HEAD_OF_SUPERVISION",
  governanceHosForwardedDecisionPath: "HOLD_RELEASE_ONLY",
  governanceStaffFeedbackPrerequisite: false,
  governanceNativeFormReadOnly: true,
  bbcGovernanceQueueVersion: 3,
  governanceReleasedHistoryCollapsedByDefault: true,
  governanceStateSpecificActions: true,
  governanceCompactCards: true,
  governanceReturnedCorrectionTracking: true,
  governanceCorrectionReceivedNotification: true,
  governanceStageNumberPrimaryStatus: false,
  bbcGovernanceFocusVersion: 1,
  governanceFocusGroups: [
    "TEACHER_APPRAISALS",
    "HEADTEACHER_APPRAISALS",
    "MY_ASSESSMENTS",
  ],
  teacherReviewQueueIntegrated: true,
  teacherReviewWorkspaceReused: true,
  teacherReviewBackendModified: false,
  onlySelectedGovernanceGroupExpanded: true,
});

function panel(extra = "") {
  return `rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(7,18,34,0.98))] shadow-[0_18px_55px_rgba(0,0,0,0.22)] ${extra}`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function wholePercentage(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value)}%`;
}

function errorText(value: unknown, fallback: string) {
  const candidate = value as ApiFailure | null;
  return (
    clean(candidate?.detail) ||
    clean(candidate?.message) ||
    clean(candidate?.error) ||
    fallback
  );
}

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function anonymousContractSafe(value: HeadteacherDirectorAnonymousResponsesView) {
  const privacy = value.privacy;
  return (
    value.audience === "DISTRICT_DIRECTOR" &&
    privacy.realRespondentIdentitiesIncluded === false &&
    privacy.respondentUserIdsIncluded === false &&
    privacy.participantIdsIncluded === false &&
    privacy.responseIdsIncluded === false &&
    privacy.responseHashesIncluded === false &&
    privacy.submissionTimestampsIncluded === false &&
    privacy.freeTextCommentsIncluded === false &&
    privacy.anonymousLabelsAreCycleScoped === true &&
    privacy.superadminIdentityPathSeparate === true
  );
}

function teacherReviewQueueContractSafe(
  value: TeacherDirectorReviewQueue,
) {
  const actorRole = clean(value.actorRole)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return (
    actorRole === "DISTRICT_DIRECTOR" &&
    value.readOnlyDiscovery === true &&
    value.assessmentEvidenceIncluded === false &&
    value.scoresIncluded === false &&
    value.generalCommentIncluded === false &&
    value.observationDetailsIncluded === false &&
    value.classEnrolmentEvidenceIncluded === false &&
    value.contactDetailsIncluded === false &&
    value.assessorUserIdIncluded === false &&
    value.targetUserIdIncluded === false &&
    value.reviewIdIncluded === false &&
    value.assignmentIdsIncluded === false &&
    value.proofHashesIncluded === false &&
    value.legacyTeacherAppraisalIncluded === false &&
    value.noBackgroundPolling === true &&
    value.providerCalled === false &&
    value.items.every((item) => {
      if (!clean(item.assessmentId) || item.eligible !== true) return false;
      if (
        item.state === "READY_TO_START" &&
        item.nextAction !== "START_REVIEW"
      ) {
        return false;
      }
      if (
        item.state === "READY_TO_REVIEW" &&
        item.nextAction !== "CONTINUE_REVIEW"
      ) {
        return false;
      }
      if (
        item.state === "READY_TO_RELEASE" &&
        (item.nextAction !== "DIRECT_RELEASE" ||
          item.assessorRole !== "DISTRICT_DIRECTOR")
      ) {
        return false;
      }
      return true;
    })
  );
}

function deriveQueuePanel(queue: DirectorQueue): QueuePanel {
  const pendingApproval = queue.items.some(
    (item) => item.cycleStatus === "PENDING_APPROVAL",
  );
  if (pendingApproval) return "APPROVAL";

  const openItems = queue.items.filter((item) => item.cycleStatus === "OPEN");
  const collecting = openItems.some(
    (item) =>
      item.feedbackWindowExpired ||
      item.eligibleParticipantCount < 1 ||
      item.finalizedResponseCount !== item.eligibleParticipantCount,
  );
  if (collecting) return "OPEN";

  const completedOpen = openItems.some(
    (item) =>
      !item.feedbackWindowExpired &&
      item.eligibleParticipantCount > 0 &&
      item.finalizedResponseCount === item.eligibleParticipantCount,
  );
  if (completedOpen) return "COMPLETE";

  const ready = queue.items.some(
    (item) =>
      item.cycleStatus === "CLOSED" || item.cycleStatus === "UNDER_REVIEW",
  );
  if (ready) return "READY";

  return "ALL";
}

function SummaryCard(props: {
  label: string;
  value: number;
  description: string;
  active: boolean;
  attention?: boolean;
  onClick: () => void;
}) {
  const hasAttention = props.attention === true && props.value > 0;

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "min-h-[144px] rounded-[22px] border border-amber-300/45 bg-amber-300/12 p-4 text-left shadow-[0_14px_35px_rgba(245,196,69,0.10)]"
          : hasAttention
            ? "min-h-[144px] rounded-[22px] border border-white/10 bg-slate-900/85 p-4 text-left transition hover:border-amber-200/45 hover:bg-slate-900"
            : "min-h-[144px] rounded-[22px] border border-white/10 bg-slate-900/85 p-4 text-left transition hover:border-white/20 hover:bg-slate-900"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          {props.label}
        </p>
        <span
          className={
            hasAttention
              ? "flex h-12 min-w-12 items-center justify-center rounded-2xl border border-amber-100/70 bg-amber-300 px-3 text-xl font-black text-slate-950 shadow-[0_0_0_5px_rgba(245,196,69,0.12),0_10px_28px_rgba(245,196,69,0.24)]"
              : props.value > 0
                ? "flex h-11 min-w-11 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-300/15 px-3 text-lg font-black text-cyan-50 shadow-[0_8px_24px_rgba(34,211,238,0.10)]"
                : "flex h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-3 text-lg font-black text-slate-300"
          }
          aria-label={`${props.value} ${props.label}`}
        >
          {props.value}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold leading-5 text-slate-200">
        {props.description}
      </p>
    </button>
  );
}

function ActionButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  mobileFullWidth?: boolean;
}) {
  const width = props.mobileFullWidth ? "w-full sm:w-auto" : "";

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={
        props.primary
          ? `${width} min-h-11 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-50`
          : `${width} min-h-11 rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm font-black text-slate-100 disabled:cursor-wait disabled:opacity-50`
      }
    >
      {props.children}
    </button>
  );
}

function QueueRecord(props: {
  item: DirectorQueueItem;
  selected: boolean;
  busy: boolean;
  onApprove: () => void;
  onExtend: () => void;
  onCloseEarly: () => void;
  onWait: () => void;
  onReviewStaff: () => void;
}) {
  const { item } = props;
  const feedbackWindowExpired =
    item.cycleStatus === "OPEN" && item.feedbackWindowExpired;
  const allResponsesFinalized =
    item.cycleStatus === "OPEN" &&
    !feedbackWindowExpired &&
    item.eligibleParticipantCount > 0 &&
    item.finalizedResponseCount === item.eligibleParticipantCount;
  const frozenPopulationSuffix =
    item.participantCount === item.eligibleParticipantCount
      ? ""
      : ` · ${item.participantCount} originally selected`;
  return (
    <article
      className={
        props.selected
          ? "rounded-2xl border border-violet-300/35 bg-violet-300/8 p-4"
          : "rounded-2xl border border-white/10 bg-slate-950/75 p-4"
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100">
              Staff feedback
            </span>
            <h3 className="truncate text-base font-black text-slate-50">
              {item.schoolName}
            </h3>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-300">
              {item.cycleStatus.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {item.targetHeadteacherName || "Headteacher"}
            {item.circuitName ? ` · ${item.circuitName}` : ""}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-violet-200">
            Confidential Teacher feedback about the Headteacher. This channel has its own respondents, deadline and release lifecycle.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {item.cycleStatus === "PENDING_APPROVAL"
              ? `Requested ${formatDate(item.requestedAt)}`
              : item.cycleStatus === "OPEN"
                ? feedbackWindowExpired
                  ? `Deadline reached · ${item.finalizedResponseCount} of ${item.eligibleParticipantCount} eligible responses finalized${frozenPopulationSuffix}${item.feedbackDeadlineExtensionCount > 0 ? " · extension already used" : ""}`
                  : allResponsesFinalized
                    ? `All ${item.finalizedResponseCount} eligible responses finalized${frozenPopulationSuffix} · deadline ${formatDate(item.deadlineAt)}`
                    : `${item.finalizedResponseCount} of ${item.eligibleParticipantCount} eligible responses finalized${frozenPopulationSuffix} · deadline ${formatDate(item.deadlineAt)}`
                : item.cycleStatus === "CLOSED"
                  ? item.staffFeedbackReviewState === "RELEASED"
                    ? `Staff-feedback result released ${formatDate(item.staffFeedbackReleasedAt)}`
                    : item.staffFeedbackReviewState === "PENDING"
                      ? `Independent Staff Feedback review · stage ${item.staffFeedbackReviewStage ?? 1}`
                      : item.staffFeedbackReviewState === "RETURNED"
                        ? "Staff Feedback review returned to queue"
                        : `Responses closed ${formatDate(item.closedAt)}`
                  : item.cycleStatus === "UNDER_REVIEW"
                    ? item.staffFeedbackReviewState === "RELEASED"
                      ? `Staff-feedback result released ${formatDate(item.staffFeedbackReleasedAt)}`
                      : "Legacy combined review exists · Staff Feedback remains independent"
                    : item.releasedAt
                      ? `Staff-feedback result released ${formatDate(item.releasedAt)}`
                      : item.label}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {item.cycleStatus === "PENDING_APPROVAL" ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onApprove}
            >
              Approve and open
            </ActionButton>
          ) : null}
          {feedbackWindowExpired && item.canExtendFeedbackWindow ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onExtend}
            >
              Extend feedback 7 days
            </ActionButton>
          ) : null}
          {allResponsesFinalized ? (
            <>
              <ActionButton
                primary
                disabled={props.busy}
                onClick={props.onCloseEarly}
              >
                Close and prepare review
              </ActionButton>
              <ActionButton disabled={props.busy} onClick={props.onWait}>
                Wait until deadline
              </ActionButton>
            </>
          ) : null}
          {item.cycleStatus === "CLOSED" || item.cycleStatus === "UNDER_REVIEW" ? (
            <ActionButton
              primary={item.staffFeedbackReviewState !== "RELEASED"}
              disabled={props.busy}
              onClick={props.onReviewStaff}
            >
              {item.staffFeedbackReviewState === "PENDING"
                ? "Continue staff review"
                : item.staffFeedbackReviewState === "RETURNED"
                  ? "Review staff feedback again"
                  : item.staffFeedbackReviewState === "RELEASED"
                    ? "View released staff evidence"
                    : "Review staff feedback"}
            </ActionButton>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GovernanceFocusButton(props: {
  label: string;
  count: number;
  helper: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={
        props.active
          ? "min-h-[92px] rounded-2xl border border-amber-200/45 bg-amber-300/12 p-3 text-left shadow-[0_12px_30px_rgba(245,196,69,0.10)]"
          : "min-h-[92px] rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-left transition hover:border-white/20"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-white">{props.label}</span>
        <span
          className={
            props.count > 0
              ? "flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-300 px-2 text-xs font-black text-slate-950"
              : "flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 text-xs font-black text-slate-300"
          }
        >
          {props.count}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{props.helper}</p>
    </button>
  );
}

function TeacherQueueRecord(props: {
  item: TeacherDirectorReviewQueueItem;
  busy: boolean;
  onOpen: () => void;
}) {
  const { item } = props;
  const directorAuthored = item.assessorRole === "DISTRICT_DIRECTOR";
  const stateLabel =
    item.state === "READY_TO_RELEASE"
      ? "Your assessment · ready to release"
      : item.state === "READY_TO_REVIEW"
        ? "Ready for your decision"
        : "Needs your review";
  const actionLabel =
    item.nextAction === "DIRECT_RELEASE"
      ? "Inspect & release"
      : item.nextAction === "CONTINUE_REVIEW"
        ? "Continue review"
        : "Open & start review";

  return (
    <article className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100">
              Teacher
            </span>
            <h3 className="text-base font-black text-slate-50">
              {item.targetName || "Teacher"}
            </h3>
            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-black text-amber-100">
              {stateLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-300">
            {item.schoolName}
            {item.circuitName ? ` · ${item.circuitName}` : ""}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-cyan-200">
            {directorAuthored
              ? "Your Teacher assessment"
              : `${item.assessorOfficeLabel} assessment`}{" "}
            · Observed {formatDate(item.dateObserved)} · Rev {item.revision}
          </p>
        </div>

        <ActionButton
          primary
          mobileFullWidth
          disabled={props.busy}
          onClick={props.onOpen}
        >
          {actionLabel}
        </ActionButton>
      </div>
    </article>
  );
}

function GovernanceQueueRecord(props: {
  item: HeadteacherDirectorGovernanceQueueItem;
  selected: boolean;
  busy: boolean;
  onInspect: () => void;
}) {
  const { item } = props;
  const correctionReceived =
    !item.directorAuthored &&
    item.state === "READY_TO_DECIDE" &&
    item.revision > 1;
  const waitingForCorrection = item.state === "RETURNED_FOR_CORRECTION";
  const held = item.state === "HELD";
  const actionReady =
    item.canDirectRelease || item.canStartReview || item.canDecide || held;
  const stateLabel =
    item.state === "RELEASED"
      ? "Released"
      : item.state === "DIRECT_RELEASE_READY"
        ? "Your assessment · ready to release"
        : item.state === "READY_TO_START"
          ? "Needs your review"
          : correctionReceived
            ? "Correction received"
            : item.state === "READY_TO_DECIDE"
              ? "Ready for your decision"
              : held
                ? "Held"
                : "Waiting for correction";
  const actionLabel = item.canDirectRelease
    ? "Inspect & release"
    : item.canStartReview
      ? "Open & start review"
      : item.canDecide
        ? correctionReceived
          ? "Review corrected report"
          : "Continue review"
        : held
          ? "View held report"
          : null;
  const sourceLabel = item.directorAuthored
    ? "Your assessment"
    : `${item.assessorOffice} assessment`;

  return (
    <article
      className={
        props.selected
          ? "rounded-xl border border-cyan-300/40 bg-cyan-300/8 p-3"
          : correctionReceived
            ? "rounded-xl border border-amber-300/35 bg-amber-400/8 p-3"
            : "rounded-xl border border-white/10 bg-slate-950/70 p-3"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-50">
              {item.targetHeadteacherName || "Headteacher"}
            </h3>
            <span
              className={
                item.state === "RELEASED"
                  ? "rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-black text-emerald-100"
                  : waitingForCorrection
                    ? "rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-0.5 text-[11px] font-black text-rose-100"
                    : held
                      ? "rounded-full border border-amber-200/45 bg-amber-300/15 px-2 py-0.5 text-[11px] font-black text-amber-100"
                      : correctionReceived
                      ? "rounded-full border border-amber-200/45 bg-amber-300/15 px-2 py-0.5 text-[11px] font-black text-amber-100"
                      : "rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-black text-amber-100"
              }
            >
              {stateLabel}
            </span>
            {correctionReceived ? (
              <span
                aria-label="1 corrected Governance appraisal needs your action"
                className="flex h-7 min-w-7 items-center justify-center rounded-full border border-amber-100/70 bg-amber-300 px-2 text-xs font-black text-slate-950 shadow-[0_0_0_4px_rgba(245,196,69,0.10)]"
              >
                1
              </span>
            ) : null}
          </div>

          <p className="mt-1 truncate text-sm text-slate-300">
            {item.schoolName}
            {item.circuitName ? ` · ${item.circuitName}` : ""}
          </p>

          {correctionReceived ? (
            <>
              <p className="mt-1 text-sm font-semibold leading-5 text-amber-100">
                {item.assessorOffice} has corrected and resubmitted this appraisal.
              </p>
              <p className="mt-1 text-xs font-black leading-5 text-cyan-200">
                Revision {item.revision} · Ready for your final decision
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs font-semibold leading-5 text-cyan-200">
              {sourceLabel} · Visit {formatDate(item.dateObserved)} · Rev {item.revision}
            </p>
          )}

          {waitingForCorrection ? (
            <p className="mt-1 text-xs leading-5 text-rose-200">
              Waiting for {item.assessorOffice} to correct and resubmit this appraisal.
            </p>
          ) : null}

          {held ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-100">
              Unhold to release results.
            </p>
          ) : null}

          {item.state === "RELEASED" ? (
            <p className="mt-1 text-xs leading-5 text-emerald-200">
              Released {formatDate(item.releasedAt)}
            </p>
          ) : null}
        </div>

        {actionReady && actionLabel ? (
          <ActionButton
            primary
            mobileFullWidth
            disabled={props.busy}
            onClick={props.onInspect}
          >
            {actionLabel}
          </ActionButton>
        ) : null}
      </div>
    </article>
  );
}
function DecisionButtons(props: {
  disabled: boolean;
  onChoose: (mode: DecisionMode) => void;
  compact?: boolean;
  allowReturn?: boolean;
}) {
  const base = props.compact
    ? "min-h-11 flex-1 rounded-xl px-3 py-2 text-xs font-black"
    : "min-h-12 rounded-xl px-4 py-2.5 text-sm font-black";
  const allowReturn = props.allowReturn !== false;

  return (
    <div
      className={
        props.compact
          ? "flex gap-2"
          : allowReturn
            ? "grid grid-cols-3 gap-2"
            : "grid grid-cols-2 gap-2"
      }
    >
      {allowReturn ? (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onChoose("RETURN")}
          className={`${base} border border-rose-300/25 bg-rose-400/10 text-rose-100 disabled:opacity-45`}
        >
          Return
        </button>
      ) : null}
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChoose("HOLD")}
        className={`${base} border border-amber-300/25 bg-amber-400/10 text-amber-100 disabled:opacity-45`}
      >
        Hold
      </button>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChoose("RELEASE")}
        className={`${base} border border-emerald-300/25 bg-emerald-400/10 text-emerald-100 disabled:opacity-45`}
      >
        Release
      </button>
    </div>
  );
}

function DecisionDialog(props: {
  mode: DecisionMode;
  stream?: "STAFF" | "GOVERNANCE";
  reason: string;
  releaseNote: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onReleaseNoteChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const staffStream = props.stream === "STAFF";
  const title = staffStream
    ? props.mode === "RETURN"
      ? "Return staff review to queue"
      : props.mode === "HOLD"
        ? "Hold staff feedback review"
        : "Release staff feedback"
    : props.mode === "RETURN"
      ? "Return for correction"
      : props.mode === "HOLD"
        ? "Hold Director review"
        : "Release official result";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <section className="w-full max-w-lg rounded-[26px] border border-white/15 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
              {staffStream ? "Staff Feedback decision" : "Governance decision"}
            </p>
            <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
          </div>
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onClose}
            className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-slate-200 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        {props.mode === "RETURN" || props.mode === "HOLD" ? (
          <div className="mt-5">
            <label htmlFor="director-decision-reason" className="text-sm font-black">
              {props.mode === "RETURN"
                ? staffStream
                  ? "Reason for return"
                  : "Reason for correction"
                : "Reason for hold"}
            </label>
            <textarea
              id="director-decision-reason"
              rows={5}
              maxLength={2000}
              value={props.reason}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                props.onReasonChange(event.target.value)
              }
              placeholder="Write a clear institutional reason."
              className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-amber-300"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {props.reason.length}/2000
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <label htmlFor="director-release-note" className="text-sm font-black">
              Release note — optional
            </label>
            <textarea
              id="director-release-note"
              rows={4}
              maxLength={2000}
              value={props.releaseNote}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                props.onReleaseNoteChange(event.target.value)
              }
              placeholder="Leave blank when no note is required."
              className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-amber-300"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {props.releaseNote.length}/2000
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={props.busy}
          onClick={props.onConfirm}
          className="mt-5 min-h-12 w-full rounded-2xl bg-amber-300 px-5 py-3 text-base font-black text-slate-950 disabled:cursor-wait disabled:opacity-50"
        >
          {props.busy ? "Recording decision…" : `Confirm ${title.toLowerCase()}`}
        </button>
      </section>
    </div>
  );
}

function paperScoreCellTone(input: {
  selected: boolean;
  score: number | null;
  notApplicable: boolean;
}) {
  if (!input.selected) return "bg-white text-slate-300";
  if (input.notApplicable) return "bg-sky-100 text-sky-900";

  switch (input.score) {
    case 1:
      return "bg-rose-100 text-rose-900";
    case 2:
      return "bg-orange-100 text-orange-900";
    case 3:
      return "bg-amber-100 text-amber-950";
    case 4:
      return "bg-teal-100 text-teal-950";
    case 5:
      return "bg-emerald-100 text-emerald-950";
    default:
      return "bg-slate-100 text-slate-900";
  }
}

function paperValue(value: unknown) {
  return clean(value) || "Not captured in this historical record";
}

type DirectReleasePaperSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  rawScore: number;
  applicableMaximum: number;
  notApplicableItems: number;
  items: DirectorGovernanceWorkspaceItem[];
};

function buildDirectReleasePaperSections(
  workspace: DirectorGovernanceWorkspace,
): DirectReleasePaperSection[] {
  return [...workspace.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const items = [...section.items].sort(
        (left, right) => left.order - right.order,
      );
      const applicableItems = items.filter((item) => !item.notApplicable);
      const applicableMaximum = applicableItems.reduce(
        (sum, item) => sum + item.maxScore,
        0,
      );
      const rawScore = applicableItems.reduce(
        (sum, item) => sum + (item.score ?? 0),
        0,
      );
      const percentage =
        applicableMaximum > 0
          ? Math.round((rawScore / applicableMaximum) * 10_000) / 100
          : null;

      return {
        sectionKey: section.sectionKey,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        percentage,
        rawScore,
        applicableMaximum,
        notApplicableItems: items.filter((item) => item.notApplicable).length,
        items,
      };
    });
}

function directReleaseOverallPercentage(
  sections: DirectReleasePaperSection[],
) {
  const percentages = sections
    .map((section) => section.percentage)
    .filter((value): value is number => value !== null);
  if (percentages.length !== sections.length || percentages.length === 0) {
    return null;
  }
  return (
    Math.round(
      (percentages.reduce((sum, value) => sum + value, 0) /
        percentages.length) *
        100,
    ) / 100
  );
}

function GovernanceNativePaper(props: {
  workspace: DirectorGovernanceWorkspace;
  busy: boolean;
  onBack: () => void;
  heading: string;
  copy: string;
  footer: React.ReactNode;
}) {
  const workspace = props.workspace;
  const visit = workspace.visit;
  const sections = buildDirectReleasePaperSections(workspace);
  const overallPercentage = directReleaseOverallPercentage(sections);
  const officialMaximum = sections.reduce(
    (sum, section) => sum + section.sectionMaxScore,
    0,
  );
  const applicableMaximum = sections.reduce(
    (sum, section) => sum + section.applicableMaximum,
    0,
  );
  const rawTotal = sections.reduce(
    (sum, section) => sum + section.rawScore,
    0,
  );
  const totalNotApplicable = sections.reduce(
    (sum, section) => sum + section.notApplicableItems,
    0,
  );

  return (
    <section id="governance-final-inspection" className="space-y-4 scroll-mt-4">
      <div className={panel("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
              Governance appraisal · final inspection · read-only
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              {props.heading}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {props.copy}
            </p>
          </div>
          <ActionButton onClick={props.onBack}>
            Back to Governance Appraisals
          </ActionButton>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-sm leading-6 text-cyan-100">
        The confidential Staff Feedback appraisal remains separate and unchanged. Teacher respondents, feedback deadlines and anonymous responses are not part of this governance release.
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
        <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
          <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
            <p className="text-[13px] font-black uppercase tracking-[0.12em]">
              {visit.districtName || "District Education Directorate"}
            </p>
            <h3 className="mt-1 text-[16px] font-black uppercase">
              Monitoring and Inspection Sheet (Headteachers)
            </h3>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.10em] text-cyan-800">
              Governance supervisory assessment · final release inspection copy
            </p>
          </div>

          <table className="w-full border-collapse text-[12px] leading-5">
            <tbody>
              {[
                ["Name of School", visit.schoolName, "Staff Strength", visit.staffStrength],
                ["Name of Circuit", visit.circuitName, "Total Enrolment", visit.totalEnrolment],
                ["Name of Head", visit.targetName, "Girls", visit.girls],
                ["Date of Visit", formatDate(visit.dateObserved), "Boys", visit.boys],
                [
                  "Arrival Time",
                  visit.arrivalTime,
                  "Teachers Present at the Time of Visit",
                  visit.teachersPresentAtVisit,
                ],
              ].map((row) => (
                <tr key={String(row[0])}>
                  <th className="w-[16%] border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-black uppercase">
                    {row[0]}
                  </th>
                  <td className="w-[34%] border border-slate-300 px-3 py-2 font-semibold">
                    {paperValue(row[1])}
                  </td>
                  <th className="w-[24%] border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-black uppercase">
                    {row[2]}
                  </th>
                  <td className="w-[26%] border border-slate-300 px-3 py-2 font-semibold text-slate-600">
                    {paperValue(row[3])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visit.officialDetailsAvailable ? (
            <div className="border-x border-b border-slate-300 bg-emerald-50 px-4 py-3 text-[11px] leading-5 text-emerald-950">
              Official visit particulars are displayed from the locked assessment workspace. They cannot be edited during release inspection.
            </div>
          ) : (
            <div className="border-x border-b border-slate-300 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-950">
              This historical assessment predates the expanded visit header. Missing values are shown as not captured rather than reconstructed.
            </div>
          )}

          <table className="w-full border-collapse text-[11px] leading-4">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[58%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-3 text-center font-black">S/N</th>
                <th className="border border-slate-300 px-3 py-3 text-left">
                  <div className="text-[15px] font-black uppercase tracking-[0.04em]">
                    Behavioural Competence
                  </div>
                  <div className="mt-1 text-[10px] font-semibold normal-case">
                    [1—Very Poor] [2—Poor] [3—Acceptable] [4—Good] [5—Very Good]
                  </div>
                </th>
                <th className="border border-slate-300 px-1 py-3 text-center font-black">N/A</th>
                {[1, 2, 3, 4, 5].map((score) => (
                  <th key={score} className="border border-slate-300 px-1 py-3 text-center font-black">
                    {score}
                  </th>
                ))}
                <th className="border border-slate-300 px-2 py-3 text-center font-black">
                  Final Score
                </th>
              </tr>
            </thead>

            <tbody>
              {sections.map((section) => (
                <Fragment key={section.sectionKey}>
                  <tr className="bg-[#344A67] text-white">
                    <td className="border border-slate-300 px-2 py-2 text-center font-black">
                      {section.sectionOrder}.0
                    </td>
                    <td colSpan={8} className="border border-slate-300 px-3 py-2 font-black uppercase tracking-[0.03em]">
                      {section.sectionTitle}
                    </td>
                  </tr>

                  {section.items.map((item) => {
                    const options: Array<{
                      score: number | null;
                      notApplicable: boolean;
                      label: string;
                    }> = [
                      { score: null, notApplicable: true, label: "N/A" },
                      ...[1, 2, 3, 4, 5].map((score) => ({
                        score,
                        notApplicable: false,
                        label: String(score),
                      })),
                    ];

                    return (
                      <tr key={item.itemKey} className="align-middle">
                        <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          {item.itemKey}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-[12px] font-medium leading-5">
                          {item.label}
                        </td>
                        {options.map((option) => {
                          const selected = option.notApplicable
                            ? item.notApplicable
                            : !item.notApplicable && item.score === option.score;

                          return (
                            <td
                              key={option.label}
                              className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${paperScoreCellTone({
                                selected,
                                score: option.score,
                                notApplicable: option.notApplicable,
                              })}`}
                              aria-label={
                                selected ? `Selected ${option.label}` : undefined
                              }
                            >
                              {selected ? "✓" : ""}
                            </td>
                          );
                        })}
                        <td
                          className={`border border-slate-300 px-2 py-2 text-center text-[13px] font-black ${paperScoreCellTone({
                            selected: true,
                            score: item.score,
                            notApplicable: item.notApplicable,
                          })}`}
                          aria-label={
                            item.notApplicable
                              ? "Final score: Not applicable"
                              : `Final score: ${item.score ?? "Not scored"}`
                          }
                        >
                          {item.notApplicable ? "N/A" : item.score ?? "—"}
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-slate-50">
                    <td colSpan={8} className="border border-slate-300 px-3 py-2 text-right font-black uppercase">
                      Total score
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center text-[12px] font-black">
                      {section.rawScore} / {section.applicableMaximum}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={8} className="border border-slate-300 px-3 py-2 text-right font-black uppercase">
                      Percentage score
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center text-[12px] font-black">
                      {wholePercentage(section.percentage)}
                    </td>
                  </tr>
                  <tr className="bg-sky-50 text-sky-950">
                    <td colSpan={9} className="border border-slate-300 px-3 py-2 text-right text-[10px] font-semibold">
                      Official section maximum: {section.sectionMaxScore}. Applicable maximum after {section.notApplicableItems} N/A exclusion{section.notApplicableItems === 1 ? "" : "s"}: {section.applicableMaximum}.
                    </td>
                  </tr>
                </Fragment>
              ))}

              <tr className="bg-[#22344F] text-white">
                <td colSpan={8} className="border border-slate-300 px-3 py-3 text-right text-[12px] font-black uppercase">
                  Overall percentage — average of the four official section percentages
                </td>
                <td className="border border-slate-300 px-2 py-3 text-center text-[14px] font-black">
                  {wholePercentage(overallPercentage)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-4 border-x border-b border-slate-300 bg-slate-50 text-[11px]">
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">Raw total</p>
              <p className="mt-1 text-base font-black">{rawTotal} / {applicableMaximum}</p>
            </div>
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">Official maximum</p>
              <p className="mt-1 text-base font-black">{officialMaximum}</p>
            </div>
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">N/A exclusions</p>
              <p className="mt-1 text-base font-black">{totalNotApplicable}</p>
            </div>
            <div className="px-3 py-3">
              <p className="font-black uppercase text-slate-500">Final result</p>
              <p className="mt-1 text-base font-black">{wholePercentage(overallPercentage)}</p>
            </div>
          </div>
        </div>
      </div>

      {props.footer}
    </section>
  );
}


function DirectReleaseNativeForm(props: {
  inspection: DirectReleaseInspection;
  busy: boolean;
  onBack: () => void;
  onRelease: () => void;
}) {
  return (
    <GovernanceNativePaper
      workspace={props.inspection.workspace}
      busy={props.busy}
      onBack={props.onBack}
      heading="Your assessment — inspect before release"
      copy="This is the assessment you authored as District Director. There is no Start Governance review step and no self-review. Read the locked 4-section, 34-indicator form, then use Release governance assessment at the bottom."
      footer={
        <div className={panel("p-4 sm:p-5")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                Final release
              </p>
              <h3 className="mt-1 text-lg font-black text-white">
                Release only after checking the complete form above
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Releasing publishes this governance assessment only. No self-review will be created, and the confidential Staff Feedback appraisal will remain unchanged.
              </p>
            </div>
            <ActionButton primary disabled={props.busy} onClick={props.onRelease}>
              Release governance assessment
            </ActionButton>
          </div>
        </div>
      }
    />
  );
}

function governanceReviewWorkspace(
  reviewPackage: HeadteacherDirectorGovernanceReviewPackage,
): DirectorGovernanceWorkspace {
  const sections = reviewPackage.assessment.sections.map((section) => ({
    sectionKey: section.sectionKey,
    title: section.title,
    description: section.description,
    order: section.order,
    maxScore: section.maxScore,
    items: section.items.map((item) => ({
      itemKey: item.itemKey,
      label: item.label,
      order: item.order,
      maxScore: item.maxScore,
      score: item.score,
      notApplicable: item.notApplicable,
      answered: true,
    })),
  }));
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const notApplicableItems = sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.notApplicable).length,
    0,
  );

  return {
    assessment: {
      assessmentId: reviewPackage.assessment.assessmentId,
      cycleId: reviewPackage.cycle.id,
      revision: reviewPackage.assessment.revision,
      status: reviewPackage.assessment.status,
      dateObserved: reviewPackage.assessment.dateObserved,
      canEdit: false,
      canFinalize: false,
      progress: {
        totalSections: sections.length,
        completedSections: sections.length,
        totalItems,
        answeredItems: totalItems,
        notApplicableItems,
        completionPercentage: totalItems === 34 ? 100 : 0,
        missingItemKeys: [],
      },
    },
    lifecycle: {
      state: reviewPackage.lifecycleState,
      label: "Director governance review",
      description: "Read-only finalized governance assessment",
      readOnly: true,
      canEdit: false,
      canCreateRevision: false,
      returnReason: null,
    },
    visit: {
      contextSchemaVersion: reviewPackage.assessment.visit.contextSchemaVersion,
      officialDetailsAvailable:
        reviewPackage.assessment.visit.officialDetailsAvailable,
      targetName: reviewPackage.cycle.targetName,
      schoolName: reviewPackage.cycle.schoolName,
      circuitName: reviewPackage.cycle.circuitName,
      districtName: reviewPackage.cycle.districtName,
      dateObserved: reviewPackage.assessment.dateObserved,
      assessorRole: reviewPackage.assessment.assessorOffice,
      arrivalTime: reviewPackage.assessment.visit.arrivalTime,
      staffStrength: reviewPackage.assessment.visit.staffStrength,
      totalEnrolment: reviewPackage.assessment.visit.totalEnrolment,
      girls: reviewPackage.assessment.visit.girls,
      boys: reviewPackage.assessment.visit.boys,
      teachersPresentAtVisit:
        reviewPackage.assessment.visit.teachersPresentAtVisit,
    },
    sections,
  };
}

function GovernanceReviewNativeForm(props: {
  reviewPackage: HeadteacherDirectorGovernanceReviewPackage;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
  onUnhold: () => void;
  onChooseDecision: (mode: DecisionMode) => void;
}) {
  const workspace = governanceReviewWorkspace(props.reviewPackage);
  const readyToStart = props.reviewPackage.lifecycleState === "READY_TO_START";
  const held = props.reviewPackage.lifecycleState === "HELD";
  const correctionReceived =
    props.reviewPackage.lifecycleState === "READY_TO_DECIDE" &&
    props.reviewPackage.assessment.revision > 1;
  const directorReturnAllowed =
    props.reviewPackage.assessment.assessorRole ===
    DIRECTOR_REVIEW_UI_POLICY.governanceReturnAssessorRole;
  const decisionCopy = directorReturnAllowed
    ? "Return, Hold or Release"
    : "Hold or Release";

  return (
    <GovernanceNativePaper
      workspace={workspace}
      busy={props.busy}
      onBack={props.onBack}
      heading={
        held
          ? "Governance result held"
          : correctionReceived
            ? `Correction received from ${props.reviewPackage.assessment.assessorOffice}`
            : `${props.reviewPackage.assessment.assessorOffice} assessment — Director review`
      }
      copy={
        readyToStart
          ? "This assessment was submitted by a governance officer. Read the locked 4-section, 34-indicator form, then scroll to the bottom and click Start Governance review."
          : held
            ? "This result is held. Unhold to release results."
            : correctionReceived
              ? `${props.reviewPackage.assessment.assessorOffice} has corrected and resubmitted the appraisal for ${props.reviewPackage.cycle.targetName}. Read the locked corrected form, then choose ${decisionCopy} at the bottom.`
              : `This governance review is already in progress. Read the locked form, then use ${decisionCopy} at the bottom.`
      }
      footer={
        <div className={panel("p-4 sm:p-5")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                Independent Governance decision
              </p>
              <h3 className="mt-1 text-lg font-black text-white">
                {readyToStart
                  ? "Start the Director review after checking the complete form"
                  : held
                    ? "Held"
                    : correctionReceived
                      ? "Correction received · ready for your final review"
                      : "Ready for your decision"}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {readyToStart
                  ? `Review the ${props.reviewPackage.assessment.assessorOffice}'s appraisal report for ${props.reviewPackage.cycle.targetName}.`
                  : held
                    ? "Unhold to release results."
                    : correctionReceived
                      ? `Review the corrected appraisal for ${props.reviewPackage.cycle.targetName}, then choose ${decisionCopy}.`
                      : `Review the ${props.reviewPackage.assessment.assessorOffice}'s appraisal report for ${props.reviewPackage.cycle.targetName}, then choose ${decisionCopy}.`}
              </p>
              {!readyToStart && !held && !directorReturnAllowed ? (
                <p className="mt-2 max-w-3xl rounded-xl border border-cyan-300/20 bg-cyan-400/8 px-3 py-2 text-xs font-semibold leading-5 text-cyan-100">
                  HOS quality review is complete. The Director may hold this report for further consideration or release it. Correction return is no longer available for SISSO/BSC-authored work.
                </p>
              ) : null}
            </div>
            {readyToStart ? (
              <ActionButton primary disabled={props.busy} onClick={props.onStart}>
                Start Governance review
              </ActionButton>
            ) : held ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={props.onUnhold}
                  className="min-h-12 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-2.5 text-sm font-black text-amber-100 disabled:opacity-45"
                >
                  Unhold
                </button>
                <button
                  type="button"
                  disabled
                  className="min-h-12 rounded-xl border border-emerald-300/15 bg-emerald-400/5 px-4 py-2.5 text-sm font-black text-emerald-100 opacity-40"
                >
                  Release
                </button>
              </div>
            ) : (
              <DecisionButtons
                disabled={props.busy}
                allowReturn={directorReturnAllowed}
                onChoose={props.onChooseDecision}
              />
            )}
          </div>
        </div>
      }
    />
  );
}

function StaffNativeForm(props: {
  data: HeadteacherDirectorAnonymousResponsesView;
  selected: AnonymousSelectedResponse;
  busy: boolean;
  showDecisionButtons: boolean;
  onBack: () => void;
  onChooseDecision: (mode: DecisionMode) => void;
}) {
  const sections = props.selected.officialForm.sections;
  const officialMaximum = sections.reduce(
    (sum, section) => sum + section.sectionMaxScore,
    0,
  );
  const applicableMaximum = sections.reduce(
    (sum, section) =>
      sum +
      section.items.reduce(
        (sectionSum, item) =>
          sectionSum + (item.notApplicable ? 0 : item.itemMaxScore),
        0,
      ),
    0,
  );
  const rawTotal = sections.reduce(
    (sum, section) =>
      sum +
      section.items.reduce(
        (sectionSum, item) =>
          sectionSum + (item.notApplicable ? 0 : item.score ?? 0),
        0,
      ),
    0,
  );
  const totalNotApplicable = sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.notApplicable).length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className={panel("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
              {props.selected.label} · finalized and locked
            </p>
            <h3 className="mt-2 text-xl font-black text-white">
              Native Monitoring and Inspection Sheet
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This finalized staff-feedback form is displayed under a
              cycle-scoped anonymous label. The respondent&apos;s real identity
              is not available to the District Director.
            </p>
          </div>
          <ActionButton onClick={props.onBack}>Back to respondents</ActionButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
        <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
          <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
            <p className="text-[13px] font-black uppercase tracking-[0.12em]">
              {props.data.cycle.districtName ||
                "District Education Directorate"}
            </p>
            <h3 className="mt-1 text-[16px] font-black uppercase">
              {props.selected.officialForm.documentTitle}
            </h3>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.10em] text-violet-800">
              Confidential staff feedback · anonymous read-only copy
            </p>
          </div>

          <table className="w-full border-collapse text-[12px] leading-5">
            <tbody>
              {[
                [
                  "Name of School",
                  props.selected.officialForm.schoolName,
                  "Anonymous Respondent",
                  props.selected.label,
                ],
                [
                  "Name of Circuit",
                  props.selected.officialForm.circuitName,
                  "Status",
                  "Finalized and locked",
                ],
                [
                  "Name of Head",
                  props.selected.officialForm.headteacherName,
                  "Overall Response",
                  wholePercentage(
                    props.selected.officialForm.overallPercentage,
                  ),
                ],
              ].map((row) => (
                <tr key={String(row[0])}>
                  <th className="w-[16%] border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-black uppercase">
                    {row[0]}
                  </th>
                  <td className="w-[34%] border border-slate-300 px-3 py-2 font-semibold">
                    {paperValue(row[1])}
                  </td>
                  <th className="w-[24%] border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-black uppercase">
                    {row[2]}
                  </th>
                  <td className="w-[26%] border border-slate-300 px-3 py-2 font-semibold">
                    {paperValue(row[3])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-x border-b border-slate-300 bg-violet-50 px-4 py-3 text-[11px] leading-5 text-violet-950">
            This form is presented under a cycle-scoped anonymous respondent
            label. No Teacher identity, respondent identifier, response hash or
            submission timestamp is available in this Director view.
          </div>

          <table className="w-full border-collapse text-[11px] leading-4">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[58%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-3 text-center font-black">
                  S/N
                </th>
                <th className="border border-slate-300 px-3 py-3 text-left">
                  <div className="text-[15px] font-black uppercase tracking-[0.04em]">
                    Behavioural Competence
                  </div>
                  <div className="mt-1 text-[10px] font-semibold normal-case">
                    [1—Very Poor] [2—Poor] [3—Acceptable] [4—Good]
                    [5—Very Good]
                  </div>
                </th>
                <th className="border border-slate-300 px-1 py-3 text-center font-black">
                  N/A
                </th>
                {[1, 2, 3, 4, 5].map((score) => (
                  <th
                    key={score}
                    className="border border-slate-300 px-1 py-3 text-center font-black"
                  >
                    {score}
                  </th>
                ))}
                <th className="border border-slate-300 px-2 py-3 text-center font-black">
                  Final Score
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const rawScore = section.items.reduce(
                  (sum, item) =>
                    sum + (item.notApplicable ? 0 : item.score ?? 0),
                  0,
                );
                const sectionApplicableMaximum = section.items.reduce(
                  (sum, item) =>
                    sum + (item.notApplicable ? 0 : item.itemMaxScore),
                  0,
                );
                const notApplicableItems = section.items.filter(
                  (item) => item.notApplicable,
                ).length;

                return (
                  <Fragment key={section.sectionKey}>
                    <tr className="bg-[#344A67] text-white">
                      <td className="border border-slate-300 px-2 py-2 text-center font-black">
                        {section.sectionOrder}.0
                      </td>
                      <td
                        colSpan={8}
                        className="border border-slate-300 px-3 py-2 font-black uppercase tracking-[0.03em]"
                      >
                        {section.sectionTitle}
                      </td>
                    </tr>
                    {section.items.map((item) => {
                      const options: Array<{
                        score: number | null;
                        notApplicable: boolean;
                        label: string;
                      }> = [
                        { score: null, notApplicable: true, label: "N/A" },
                        ...[1, 2, 3, 4, 5].map((score) => ({
                          score,
                          notApplicable: false,
                          label: String(score),
                        })),
                      ];

                      return (
                        <tr key={item.itemKey} className="align-middle">
                          <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                            {item.itemKey}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-[12px] font-medium leading-5">
                            {item.itemLabel}
                          </td>
                          {options.map((option) => {
                            const selected = option.notApplicable
                              ? item.notApplicable
                              : !item.notApplicable &&
                                item.score === option.score;
                            return (
                              <td
                                key={option.label}
                                className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${paperScoreCellTone({
                                  selected,
                                  score: option.score,
                                  notApplicable: option.notApplicable,
                                })}`}
                                aria-label={
                                  selected
                                    ? `Selected ${option.label}`
                                    : undefined
                                }
                              >
                                {selected ? "✓" : ""}
                              </td>
                            );
                          })}
                          <td
                            className={`border border-slate-300 px-2 py-2 text-center text-[13px] font-black ${paperScoreCellTone({
                              selected: true,
                              score: item.score,
                              notApplicable: item.notApplicable,
                            })}`}
                            aria-label={
                              item.notApplicable
                                ? "Final score: Not applicable"
                                : `Final score: ${item.score ?? "Not scored"}`
                            }
                          >
                            {item.notApplicable ? "N/A" : item.score ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50">
                      <td
                        colSpan={8}
                        className="border border-slate-300 px-3 py-2 text-right font-black uppercase"
                      >
                        Total score
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center text-[12px] font-black">
                        {rawScore} / {sectionApplicableMaximum}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td
                        colSpan={8}
                        className="border border-slate-300 px-3 py-2 text-right font-black uppercase"
                      >
                        Percentage score
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center text-[12px] font-black">
                        {wholePercentage(section.percentage)}
                      </td>
                    </tr>
                    <tr className="bg-violet-50 text-violet-950">
                      <td
                        colSpan={9}
                        className="border border-slate-300 px-3 py-2 text-right text-[10px] font-semibold"
                      >
                        Official section maximum: {section.sectionMaxScore}.
                        Applicable maximum after {notApplicableItems} N/A
                        exclusion{notApplicableItems === 1 ? "" : "s"}:{" "}
                        {sectionApplicableMaximum}.
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="bg-[#22344F] text-white">
                <td
                  colSpan={8}
                  className="border border-slate-300 px-3 py-3 text-right text-[12px] font-black uppercase"
                >
                  Overall percentage — average of the four official section
                  percentages
                </td>
                <td className="border border-slate-300 px-2 py-3 text-center text-[14px] font-black">
                  {wholePercentage(
                    props.selected.officialForm.overallPercentage,
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-4 border-x border-b border-slate-300 bg-slate-50 text-[11px]">
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">Raw total</p>
              <p className="mt-1 text-base font-black">
                {rawTotal} / {applicableMaximum}
              </p>
            </div>
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">
                Official maximum
              </p>
              <p className="mt-1 text-base font-black">{officialMaximum}</p>
            </div>
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">
                N/A exclusions
              </p>
              <p className="mt-1 text-base font-black">
                {totalNotApplicable}
              </p>
            </div>
            <div className="px-3 py-3">
              <p className="font-black uppercase text-slate-500">
                Final result
              </p>
              <p className="mt-1 text-base font-black">
                {wholePercentage(
                  props.selected.officialForm.overallPercentage,
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {props.showDecisionButtons ? (
        <div
          aria-label="Staff Feedback decision controls"
          className="flex justify-end"
        >
          <div className="w-full sm:max-w-md">
            <DecisionButtons
              disabled={props.busy}
              onChoose={props.onChooseDecision}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StaffEvidence(props: {
  data: HeadteacherDirectorAnonymousResponsesView;
  level: StaffLevel;
  busy: boolean;
  onLevel: (level: StaffLevel) => void;
  onRespondent: (key: string) => void;
  onBackHome: () => void;
  reviewState: StaffFeedbackReviewState | null;
  onChooseDecision: (mode: DecisionMode) => void;
}) {
  const selected = props.data.selectedResponse;

  return (
    <section id="staff-evidence-review" className="scroll-mt-4 space-y-4">
      <div className={panel("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
              Anonymous staff evidence · read-only
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Headteacher staff-feedback forms
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Only cycle-scoped labels such as Respondent 1 are visible. Real
              Teacher identities are not available to the District Director.
            </p>
          </div>
          <ActionButton onClick={props.onBackHome}>
            Back to work queue
          </ActionButton>
        </div>
      </div>

      {props.reviewState?.lifecycleState === "RELEASED" ? (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm font-semibold leading-6 text-emerald-100">
          Staff Feedback released independently {formatDate(props.reviewState.releasedAt)}. Governance Appraisals remain unchanged.
        </div>
      ) : props.reviewState?.lifecycleState === "RETURNED_TO_QUEUE" ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          This Staff Feedback review was returned to the queue. Use Review staff feedback again when ready to begin the next review stage.
        </div>
      ) : null}

      {props.level === "CIRCUIT" ? (
        <div className={panel("p-5")}>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Choose circuit
          </p>
          <button
            type="button"
            onClick={() => props.onLevel("SCHOOL")}
            className="mt-4 w-full rounded-2xl border border-violet-300/25 bg-violet-400/10 p-5 text-left"
          >
            <p className="text-lg font-black text-white">
              {props.data.cycle.circuitName}
            </p>
            <p className="mt-2 text-sm text-violet-100">
              1 school · {props.data.respondents.length} finalized respondent
              {props.data.respondents.length === 1 ? "" : "s"}
            </p>
          </button>
        </div>
      ) : null}

      {props.level === "SCHOOL" ? (
        <div className={panel("p-5")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              {props.data.cycle.circuitName} · choose school
            </p>
            <button
              type="button"
              onClick={() => props.onLevel("CIRCUIT")}
              className="text-xs font-black text-violet-200"
            >
              Back to circuits
            </button>
          </div>
          <button
            type="button"
            onClick={() => props.onLevel("RESPONDENTS")}
            className="mt-4 w-full rounded-2xl border border-violet-300/25 bg-violet-400/10 p-5 text-left"
          >
            <p className="text-lg font-black text-white">
              {props.data.cycle.schoolName}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {props.data.cycle.headteacherName}
            </p>
            <p className="mt-3 text-xs font-black text-violet-100">
              {props.data.respondents.length} anonymous finalized form
              {props.data.respondents.length === 1 ? "" : "s"}
            </p>
          </button>
        </div>
      ) : null}

      {props.level === "RESPONDENTS" ? (
        <div className={panel("p-5")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                {props.data.cycle.schoolName}
              </p>
              <h3 className="mt-1 text-lg font-black text-white">
                Anonymous respondents
              </h3>
            </div>
            <button
              type="button"
              onClick={() => props.onLevel("SCHOOL")}
              className="text-xs font-black text-violet-200"
            >
              Back to schools
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {props.data.respondents.map((respondent) => (
              <button
                key={respondent.respondentKey}
                type="button"
                disabled={props.busy}
                onClick={() => props.onRespondent(respondent.respondentKey)}
                className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-left transition hover:border-violet-300/35 disabled:opacity-50"
              >
                <p className="text-base font-black text-white">
                  {respondent.label}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Finalized · open native form
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {props.level === "FORM" && selected ? (
        <StaffNativeForm
          data={props.data}
          selected={selected}
          busy={props.busy}
          showDecisionButtons={
            props.reviewState?.lifecycleState === "PENDING_DECISION"
          }
          onBack={() => props.onLevel("RESPONDENTS")}
          onChooseDecision={props.onChooseDecision}
        />
      ) : null}
    </section>
  );
}

export default function HeadteacherDirectorReviewClient({
  initialCycleId,
}: {
  initialCycleId: string;
}) {
  const [cycleId, setCycleId] = useState(initialCycleId);
  const [queue, setQueue] = useState<DirectorQueue | null>(null);
  const [queuePanel, setQueuePanel] = useState<QueuePanel>("ALL");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFailure, setQueueFailure] = useState("");
  const [governanceQueue, setGovernanceQueue] =
    useState<HeadteacherDirectorGovernanceQueue | null>(null);
  const [governanceQueueLoading, setGovernanceQueueLoading] = useState(false);
  const [governanceQueueFailure, setGovernanceQueueFailure] = useState("");
  const [teacherReviewQueue, setTeacherReviewQueue] =
    useState<TeacherDirectorReviewQueue | null>(null);
  const [teacherReviewQueueLoading, setTeacherReviewQueueLoading] =
    useState(false);
  const [teacherReviewQueueFailure, setTeacherReviewQueueFailure] =
    useState("");
  const [governanceFocus, setGovernanceFocus] =
    useState<GovernanceFocus>("TEACHER");
  const [governanceReviewPackage, setGovernanceReviewPackage] =
    useState<HeadteacherDirectorGovernanceReviewPackage | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("HOME");
  const [staffLevel, setStaffLevel] = useState<StaffLevel>("CIRCUIT");
  const [anonymousResponses, setAnonymousResponses] =
    useState<HeadteacherDirectorAnonymousResponsesView | null>(null);
  const [staffReviewState, setStaffReviewState] =
    useState<StaffFeedbackReviewState | null>(null);
  const [governanceExpanded, setGovernanceExpanded] = useState(false);
  const [governanceDecisionMode, setGovernanceDecisionMode] =
    useState<DecisionMode | null>(null);
  const [staffDecisionMode, setStaffDecisionMode] = useState<DecisionMode | null>(null);
  const [reason, setReason] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [directReleaseInspection, setDirectReleaseInspection] =
    useState<DirectReleaseInspection | null>(null);

  const pendingApprovalItems = useMemo(
    () => queue?.items.filter((item) => item.cycleStatus === "PENDING_APPROVAL") ?? [],
    [queue],
  );
  const readyItems = useMemo(
    () =>
      queue?.items.filter(
        (item) =>
          (item.cycleStatus === "CLOSED" ||
            item.cycleStatus === "UNDER_REVIEW") &&
          item.staffFeedbackReviewState !== "RELEASED",
      ) ?? [],
    [queue],
  );
  const openItems = useMemo(
    () => queue?.items.filter((item) => item.cycleStatus === "OPEN") ?? [],
    [queue],
  );
  const completedOpenItems = useMemo(
    () =>
      openItems.filter(
        (item) =>
          item.eligibleParticipantCount > 0 &&
          item.finalizedResponseCount === item.eligibleParticipantCount,
      ),
    [openItems],
  );
  const collectingOpenItems = useMemo(
    () =>
      openItems.filter(
        (item) =>
          item.eligibleParticipantCount < 1 ||
          item.finalizedResponseCount !== item.eligibleParticipantCount,
      ),
    [openItems],
  );
  const visibleQueueItems = useMemo(() => {
    if (!queue) return [];
    if (queuePanel === "APPROVAL") return pendingApprovalItems;
    if (queuePanel === "COMPLETE") return completedOpenItems;
    if (queuePanel === "READY") return readyItems;
    if (queuePanel === "OPEN") return collectingOpenItems;
    return queue.items;
  }, [
    collectingOpenItems,
    completedOpenItems,
    pendingApprovalItems,
    queue,
    queuePanel,
    readyItems,
  ]);
  const governanceItems = useMemo(
    () => governanceQueue?.items ?? [],
    [governanceQueue],
  );
  const governanceCorrectionReceivedItems = useMemo(
    () =>
      governanceItems.filter(
        (item) =>
          !item.directorAuthored &&
          item.state === "READY_TO_DECIDE" &&
          item.revision > 1,
      ),
    [governanceItems],
  );
  const governanceWaitingItems = useMemo(
    () =>
      governanceItems.filter(
        (item) => item.state === "RETURNED_FOR_CORRECTION",
      ),
    [governanceItems],
  );
  const governanceReleasedItems = useMemo(
    () => governanceItems.filter((item) => item.state === "RELEASED"),
    [governanceItems],
  );
  const teacherReviewItems = useMemo(
    () => teacherReviewQueue?.items ?? [],
    [teacherReviewQueue],
  );
  const teacherAppraisalItems = useMemo(
    () =>
      teacherReviewItems.filter(
        (item) => item.assessorRole !== "DISTRICT_DIRECTOR",
      ),
    [teacherReviewItems],
  );
  const directorOwnTeacherItems = useMemo(
    () =>
      teacherReviewItems.filter(
        (item) =>
          item.assessorRole === "DISTRICT_DIRECTOR" &&
          item.state === "READY_TO_RELEASE",
      ),
    [teacherReviewItems],
  );
  const headteacherAppraisalItems = useMemo(
    () => governanceItems.filter((item) => !item.directorAuthored),
    [governanceItems],
  );
  const headteacherReadyItems = useMemo(
    () =>
      headteacherAppraisalItems.filter(
        (item) => item.canStartReview || item.canDecide,
      ),
    [headteacherAppraisalItems],
  );
  const headteacherHeldItems = useMemo(
    () =>
      headteacherAppraisalItems.filter(
        (item) => item.state === "HELD",
      ),
    [headteacherAppraisalItems],
  );
  const headteacherWaitingItems = useMemo(
    () =>
      headteacherAppraisalItems.filter(
        (item) => item.state === "RETURNED_FOR_CORRECTION",
      ),
    [headteacherAppraisalItems],
  );
  const headteacherReleasedItems = useMemo(
    () =>
      headteacherAppraisalItems.filter((item) => item.state === "RELEASED"),
    [headteacherAppraisalItems],
  );
  const directorOwnHeadteacherItems = useMemo(
    () => governanceItems.filter((item) => item.directorAuthored),
    [governanceItems],
  );
  const directorOwnHeadteacherReadyItems = useMemo(
    () =>
      directorOwnHeadteacherItems.filter((item) => item.canDirectRelease),
    [directorOwnHeadteacherItems],
  );
  const directorOwnHeadteacherReleasedItems = useMemo(
    () =>
      directorOwnHeadteacherItems.filter((item) => item.state === "RELEASED"),
    [directorOwnHeadteacherItems],
  );
  const myAssessmentActionCount =
    directorOwnTeacherItems.length + directorOwnHeadteacherReadyItems.length;
  const directorGovernanceActionCount =
    teacherAppraisalItems.length +
    headteacherReadyItems.length +
    myAssessmentActionCount;
  const visibleGovernanceItems = useMemo(() => {
    if (governanceFocus === "HEADTEACHER") {
      return governanceExpanded
        ? headteacherAppraisalItems
        : [
            ...headteacherReadyItems,
            ...headteacherHeldItems,
            ...headteacherWaitingItems,
          ];
    }
    if (governanceFocus === "MINE") {
      return governanceExpanded
        ? directorOwnHeadteacherItems
        : directorOwnHeadteacherReadyItems;
    }
    return [];
  }, [
    directorOwnHeadteacherItems,
    directorOwnHeadteacherReadyItems,
    governanceExpanded,
    governanceFocus,
    headteacherAppraisalItems,
    headteacherHeldItems,
    headteacherReadyItems,
    headteacherWaitingItems,
  ]);
  const selectedReleasedCount =
    governanceFocus === "HEADTEACHER"
      ? headteacherReleasedItems.length
      : governanceFocus === "MINE"
        ? directorOwnHeadteacherReleasedItems.length
        : 0;
  const governanceIsCurrentFocus =
    directorGovernanceActionCount > 0 ||
    governanceWaitingItems.length > 0 ||
    Boolean(directReleaseInspection) ||
    Boolean(governanceReviewPackage);
  const showGovernanceAppraisals =
    governanceIsCurrentFocus ||
    governanceExpanded ||
    governanceReleasedItems.length > 0 ||
    governanceQueueLoading ||
    teacherReviewQueueLoading ||
    Boolean(governanceQueueFailure) ||
    Boolean(teacherReviewQueueFailure) ||
    Boolean(teacherReviewQueue);

  function clearMessages() {
    setNotice("");
    setFailure("");
  }

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueFailure("");
    try {
      const response = await fetch(API_BASE, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await readJson<DirectorQueueApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setQueue(null);
        setQueueFailure(errorText(payload, "The appraisal work queue could not load."));
        return;
      }
      setQueue(payload.queue);
      setQueuePanel(deriveQueuePanel(payload.queue));
    } catch {
      setQueue(null);
      setQueueFailure(
        "The appraisal work queue could not load. Check the connection and refresh it manually.",
      );
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadGovernanceQueue = useCallback(async () => {
    setGovernanceQueueLoading(true);
    setGovernanceQueueFailure("");
    try {
      const response = await fetch(`${API_BASE}/governance-review`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await readJson<DirectorGovernanceQueueApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setGovernanceQueue(null);
        setGovernanceQueueFailure(
          errorText(payload, "The Governance appraisal queue could not load."),
        );
        return;
      }
      setGovernanceQueue(payload.queue);
    } catch {
      setGovernanceQueue(null);
      setGovernanceQueueFailure(
        "The Governance appraisal queue could not load. Check the connection and refresh it manually.",
      );
    } finally {
      setGovernanceQueueLoading(false);
    }
  }, []);

  const loadTeacherReviewQueue = useCallback(async () => {
    setTeacherReviewQueueLoading(true);
    setTeacherReviewQueueFailure("");
    try {
      const response = await fetch(TEACHER_REVIEW_QUEUE_API, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload =
        await readJson<TeacherDirectorReviewQueueApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setTeacherReviewQueue(null);
        setTeacherReviewQueueFailure(
          errorText(payload, "The Teacher appraisal review queue could not load."),
        );
        return;
      }
      if (!teacherReviewQueueContractSafe(payload.reviewQueue)) {
        setTeacherReviewQueue(null);
        setTeacherReviewQueueFailure(
          "The Teacher review queue failed its read-only Director contract. Nothing was opened.",
        );
        return;
      }
      setTeacherReviewQueue(payload.reviewQueue);
    } catch {
      setTeacherReviewQueue(null);
      setTeacherReviewQueueFailure(
        "The Teacher appraisal review queue could not load. Check the connection and refresh it manually.",
      );
    } finally {
      setTeacherReviewQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
    void loadGovernanceQueue();
    void loadTeacherReviewQueue();
    // One explicit initial load only. No polling or background traffic.
  }, [loadGovernanceQueue, loadQueue, loadTeacherReviewQueue]);

  function openTeacherReviewWorkspace(item: TeacherDirectorReviewQueueItem) {
    const assessmentId = clean(item.assessmentId);
    clearMessages();
    if (!assessmentId) {
      setFailure("This Teacher appraisal does not have a valid assessment reference.");
      return;
    }
    window.location.assign(
      `${TEACHER_REVIEW_WORKSPACE}?assessmentId=${encodeURIComponent(assessmentId)}`,
    );
  }

  async function loadGovernanceReviewPackage(
    item: HeadteacherDirectorGovernanceQueueItem,
  ) {
    const assessmentId = clean(item.assessmentId);
    clearMessages();
    if (!assessmentId || item.directorAuthored) {
      setFailure("This governance assessment does not use the reviewed-release path.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `${API_BASE}/governance-review/${encodeURIComponent(assessmentId)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload =
        await readJson<DirectorGovernanceReviewPackageApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setGovernanceReviewPackage(null);
        setFailure(
          errorText(payload, "The Governance review package could not be loaded."),
        );
        return;
      }

      const reviewPackage = payload.reviewPackage;
      const itemCount = reviewPackage.assessment.sections.reduce(
        (sum, section) => sum + section.items.length,
        0,
      );
      if (
        reviewPackage.audience !== "DISTRICT_DIRECTOR" ||
        clean(reviewPackage.assessment.assessmentId) !== assessmentId ||
        clean(reviewPackage.cycle.id) !== item.cycleId ||
        reviewPackage.assessment.status !== "FINALIZED" ||
        reviewPackage.assessment.sections.length !== 4 ||
        itemCount !== 34 ||
        reviewPackage.privacy.staffFeedbackIncluded !== false ||
        reviewPackage.privacy.respondentIdentitiesIncluded !== false ||
        reviewPackage.privacy.assessorIdentityIncluded !== false ||
        reviewPackage.privacy.reviewerIdentityIncluded !== false ||
        reviewPackage.integrity.reviewerMayRewriteScores !== false ||
        reviewPackage.integrity.scoreMutationAllowed !== false ||
        reviewPackage.integrity.separateFromStaffFeedback !== true ||
        reviewPackage.integrity.combinedWeightingDefined !== false
      ) {
        setGovernanceReviewPackage(null);
        setFailure(
          "The Governance review package failed the locked independent 4-section, 34-indicator contract. Nothing was changed.",
        );
        return;
      }

      setCycleId(item.cycleId);
      setGovernanceReviewPackage(reviewPackage);
      setDirectReleaseInspection(null);
      setAnonymousResponses(null);
      setStaffReviewState(null);
      setReviewMode("HOME");
      setGovernanceDecisionMode(null);
      setReason("");
      setReleaseNote("");
      setNotice(
        "Governance assessment loaded read-only. Staff Feedback was not loaded or compared.",
      );

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById("governance-final-inspection")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    } catch {
      setFailure(
        "Network interrupted while loading the Governance review. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startGovernanceReview() {
    if (
      !governanceReviewPackage ||
      governanceReviewPackage.lifecycleState !== "READY_TO_START"
    ) {
      return;
    }
    if (
      !window.confirm(
        "Start the independent Director review for this Governance assessment? Staff Feedback will not be loaded or changed.",
      )
    ) {
      return;
    }

    const assessmentId = governanceReviewPackage.assessment.assessmentId;
    setBusy(true);
    clearMessages();
    try {
      const response = await fetch(
        `${API_BASE}/governance-review/${encodeURIComponent(assessmentId)}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "START", confirm: true }),
        },
      );
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        setFailure(errorText(payload, "The Governance review could not be started."));
        return;
      }
      const item = governanceItems.find(
        (candidate) => candidate.assessmentId === assessmentId,
      );
      if (item) await loadGovernanceReviewPackage(item);
      await loadGovernanceQueue();
      const returnAllowed =
        governanceReviewPackage.assessment.assessorRole ===
        DIRECTOR_REVIEW_UI_POLICY.governanceReturnAssessorRole;
      setNotice(
        returnAllowed
          ? "Independent Governance review started. Return, Hold and Release are available below the locked form."
          : "Independent Governance review started. HOS quality review is complete; Hold and Release are available below the locked form.",
      );
    } catch {
      setFailure(
        "Network interrupted. Refresh the Governance queue before repeating the start action.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openGovernanceDecision(mode: DecisionMode) {
    clearMessages();
    if (
      mode === "RETURN" &&
      governanceReviewPackage?.assessment.assessorRole !==
      DIRECTOR_REVIEW_UI_POLICY.governanceReturnAssessorRole
    ) {
      setFailure(
        "This appraisal was authored by SISSO/BSC and has already passed HOS quality review. The Director may Hold or Release it, but cannot send it back for another correction.",
      );
      return;
    }
    setGovernanceDecisionMode(mode);
    setReason("");
    setReleaseNote("");
  }

  async function submitGovernanceDecision() {
    if (!governanceReviewPackage || !governanceDecisionMode) return;
    const review = governanceReviewPackage.review;
    if (!review) {
      setFailure("Start the Governance review before recording a Director decision.");
      return;
    }
    if (
      governanceDecisionMode === "RETURN" &&
      governanceReviewPackage.assessment.assessorRole !==
      DIRECTOR_REVIEW_UI_POLICY.governanceReturnAssessorRole
    ) {
      setGovernanceDecisionMode(null);
      setFailure(
        "Director correction return is permitted only when the Head of Supervision authored the appraisal. This HOS-reviewed SISSO/BSC report may only be Held or Released.",
      );
      return;
    }
    if (
      (governanceDecisionMode === "RETURN" || governanceDecisionMode === "HOLD") &&
      reason.trim().length < 3
    ) {
      setFailure("Write a clear reason of at least 3 characters.");
      return;
    }

    const confirmationText =
      governanceDecisionMode === "RETURN"
        ? "Return this Governance assessment for a correction revision?"
        : governanceDecisionMode === "HOLD"
          ? "Hold this Governance result?"
          : "Release this Governance assessment to the Headteacher? Staff Feedback remains separate.";
    if (!window.confirm(confirmationText)) return;

    const assessmentId = governanceReviewPackage.assessment.assessmentId;
    const action = governanceDecisionMode;
    const note =
      action === "RELEASE" ? releaseNote.trim() : reason.trim();
    setBusy(true);
    clearMessages();
    try {
      const response = await fetch(
        `${API_BASE}/governance-review/${encodeURIComponent(assessmentId)}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reviewId: review.id,
            note: note || null,
            confirm: true,
          }),
        },
      );
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        setFailure(errorText(payload, "The Governance decision was not recorded."));
        return;
      }

      setGovernanceDecisionMode(null);
      setReason("");
      setReleaseNote("");
      if (action === "HOLD") {
        const item = governanceItems.find(
          (candidate) => candidate.assessmentId === assessmentId,
        );
        await loadGovernanceQueue();
        if (item) await loadGovernanceReviewPackage(item);
        setNotice("Governance result held. Unhold to release results.");
      } else {
        setGovernanceReviewPackage(null);
        await loadGovernanceQueue();
        setNotice(
          action === "RETURN"
            ? "Governance assessment returned. The original governance assessor must finalize a correction revision before Director review resumes."
            : "Governance assessment released independently. The Headteacher can read it in Governance Appraisal Reports.",
        );
      }
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the Governance decision blindly. Refresh the Governance queue first.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unholdGovernanceReview() {
    if (!governanceReviewPackage || governanceReviewPackage.lifecycleState !== "HELD") {
      return;
    }
    const review = governanceReviewPackage.review;
    if (!review) {
      setFailure("The held Governance review could not be verified.");
      return;
    }
    if (!window.confirm("Unhold this Governance result so it can be released?")) {
      return;
    }

    const assessmentId = governanceReviewPackage.assessment.assessmentId;
    setBusy(true);
    clearMessages();
    try {
      const response = await fetch(
        `${API_BASE}/governance-review/${encodeURIComponent(assessmentId)}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "UNHOLD",
            reviewId: review.id,
            confirm: true,
          }),
        },
      );
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        setFailure(errorText(payload, "The Governance result could not be unheld."));
        return;
      }

      const item = governanceItems.find(
        (candidate) => candidate.assessmentId === assessmentId,
      );
      await loadGovernanceQueue();
      if (item) await loadGovernanceReviewPackage(item);
      setNotice("Governance result unheld. Release is now available.");
    } catch {
      setFailure(
        "Network interrupted. Refresh the Governance queue before repeating Unhold.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function inspectDirectReleaseAssessment(item: HeadteacherDirectorGovernanceQueueItem) {
    const assessmentId = clean(item.assessmentId);
    clearMessages();

    if (!item.canDirectRelease || !assessmentId) {
      setFailure(
        "This governance assessment is not ready for Director final inspection.",
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload =
        await readJson<DirectorGovernanceWorkspaceApiResponse>(response);

      if (!response.ok || !payload?.ok) {
        setFailure(
          errorText(
            payload,
            "The finalized governance assessment could not be loaded for inspection.",
          ),
        );
        return;
      }

      const workspace = payload.workspace;
      if (
        clean(workspace.assessment.assessmentId) !== assessmentId ||
        clean(workspace.assessment.cycleId) !== item.cycleId ||
        clean(workspace.assessment.status).toUpperCase() !== "FINALIZED" ||
        workspace.assessment.canEdit !== false ||
        workspace.lifecycle.readOnly !== true ||
        workspace.lifecycle.canEdit !== false ||
        workspace.assessment.progress.totalSections !== 4 ||
        workspace.assessment.progress.totalItems !== 34 ||
        workspace.assessment.progress.answeredItems !== 34 ||
        workspace.assessment.progress.completionPercentage !== 100 ||
        workspace.sections.length !== 4 ||
        workspace.sections.reduce(
          (sum, section) => sum + section.items.length,
          0,
        ) !== 34
      ) {
        setFailure(
          "The finalized governance assessment did not match the locked 4-section, 34-indicator release contract. Nothing was released.",
        );
        return;
      }

      setCycleId(item.cycleId);
      setGovernanceReviewPackage(null);
      setAnonymousResponses(null);
      setReviewMode("HOME");
      setDirectReleaseInspection({ item, workspace });
      setNotice(
        "Governance assessment loaded read-only. Inspect the complete native form before release.",
      );

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById("governance-final-inspection")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    } catch {
      setFailure(
        "Network interrupted while loading the governance assessment. Nothing was changed. Try the read-only inspection again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function directReleaseOwnAssessment(item: HeadteacherDirectorGovernanceQueueItem) {
    const assessmentId = clean(item.assessmentId);
    clearMessages();
    if (!item.canDirectRelease || !assessmentId) {
      setFailure(
        "This record is not eligible for the Director-authored direct-release path.",
      );
      return;
    }

    if (
      !directReleaseInspection ||
      clean(directReleaseInspection.item.assessmentId) !== assessmentId ||
      clean(directReleaseInspection.workspace.assessment.assessmentId) !==
        assessmentId
    ) {
      setFailure(
        "Review the complete governance assessment first. Release is available only from the final inspection screen.",
      );
      return;
    }

    if (
      !window.confirm(
        `Release this finalized governance assessment for ${item.targetHeadteacherName || "this Headteacher"}? This publishes the governance assessment only. No self-review will be created, and the confidential Staff Feedback appraisal will remain unchanged.`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/direct-release`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = await readJson<ApiFailure>(response);

      if (!response.ok) {
        setFailure(
          errorText(
            payload,
            "Your finalized Director assessment could not be released.",
          ),
        );
        return;
      }

      setCycleId(item.cycleId);
      setGovernanceReviewPackage(null);
      setAnonymousResponses(null);
      setDirectReleaseInspection(null);
      setReviewMode("HOME");
      setNotice(
        "Your finalized governance assessment was released directly. No self-review was created, and the confidential Staff Feedback appraisal remains unchanged.",
      );
      await loadGovernanceQueue();
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the release blindly. Refresh the work queue first; the protected endpoint is retry-safe.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveAndOpen(cycleIdToOpen: string) {
    const selectedCycleId = clean(cycleIdToOpen);
    clearMessages();
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Approve this request and open the seven-day confidential staff-feedback period?",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE_AND_OPEN",
          cycleId: selectedCycleId,
          confirm: true,
        }),
      });
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        setFailure(errorText(payload, "The request could not be approved and opened."));
        return;
      }
      setNotice(
        "Request approved. Eligible Teachers can now complete confidential feedback.",
      );
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Refresh the queue before repeating the approval.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function extendFeedbackWindow(cycleIdToExtend: string) {
    const selectedCycleId = clean(cycleIdToExtend);
    clearMessages();
    if (!selectedCycleId) return;

    if (
      !window.confirm(
        "The original response deadline has passed. Extend this same frozen Teacher feedback window by seven days? Existing saved and finalized responses will be preserved.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/extend-feedback`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = await readJson<DeadlineExtensionApiResponse>(response);

      if (!response.ok || !payload?.ok) {
        setFailure(
          errorText(
            payload,
            "The expired staff-feedback window could not be extended.",
          ),
        );
        return;
      }

      setNotice(
        `Feedback reopened until ${formatDate(payload.result.newDeadlineAt)}. The same frozen Teachers and any saved responses were preserved.`,
      );
      setQueuePanel("OPEN");
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Refresh the queue to confirm the current deadline before repeating the extension.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function closeCompletedEarly(cycleIdToClose: string) {
    const selectedCycleId = clean(cycleIdToClose);
    clearMessages();
    if (!selectedCycleId) return;

    if (
      !window.confirm(
        "All eligible Teachers have finalized. Close staff feedback now and seal the anonymous aggregate for review? The separate governance assessment will not be changed.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CLOSE_COMPLETED_EARLY",
          cycleId: selectedCycleId,
          confirm: true,
        }),
      });
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        if (payload?.closureCommitted === true) {
          setFailure(
            "Staff feedback closed safely, but the aggregate still needs retrying. Refresh the queue before repeating the action.",
          );
          return;
        }
        setFailure(
          errorText(
            payload,
            "The completed staff-feedback period could not be closed.",
          ),
        );
        return;
      }

      setNotice(
        "Staff feedback closed and the anonymous aggregate was sealed. The separate governance assessment was not changed.",
      );
      setQueuePanel("READY");
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Refresh the queue to confirm the current state before repeating early closure.",
      );
    } finally {
      setBusy(false);
    }
  }

  function waitUntilDeadline(item: DirectorQueueItem) {
    clearMessages();
    setNotice(
      `No data was changed. This feedback period remains open until ${formatDate(item.deadlineAt)}.`,
    );
  }

  function staffReviewStateFromQueueItem(
    item: DirectorQueueItem,
  ): StaffFeedbackReviewState {
    const lifecycleState =
      item.staffFeedbackReviewState === "RELEASED"
        ? "RELEASED"
        : item.staffFeedbackReviewState === "PENDING"
          ? "PENDING_DECISION"
          : item.staffFeedbackReviewState === "RETURNED"
            ? "RETURNED_TO_QUEUE"
            : item.staffFeedbackReviewState === "HELD"
              ? "HELD_CONTINUATION"
              : "READY_TO_START";
    return {
      cycleId: item.cycleId,
      snapshotId: "",
      lifecycleState,
      latestReviewId: item.staffFeedbackReviewId,
      latestStage: item.staffFeedbackReviewStage,
      latestDecision:
        item.staffFeedbackReviewState === "RELEASED"
          ? "ACCEPTED"
          : item.staffFeedbackReviewState === "PENDING"
            ? "PENDING"
            : item.staffFeedbackReviewState === "RETURNED"
              ? "RETURNED"
              : item.staffFeedbackReviewState === "HELD"
                ? "HELD"
                : null,
      canStartReview: item.canStartStaffFeedbackReview,
      canDecide: item.canDecideStaffFeedbackReview,
      releasedAt: item.staffFeedbackReleasedAt,
      releaseProofHash: null,
      governanceAssessmentRequired: false,
      carrierCycleStatusMutationPerformed: false,
    };
  }

  async function reviewStaffFeedback(item: DirectorQueueItem) {
    const selectedCycleId = clean(item.cycleId);
    clearMessages();
    if (!selectedCycleId) return;

    setCycleId(selectedCycleId);
    setBusy(true);
    try {
      if (item.staffFeedbackReviewState === "RELEASED") {
        setStaffReviewState(staffReviewStateFromQueueItem(item));
      } else {
        const response = await fetch(
          `${API_BASE}/${encodeURIComponent(selectedCycleId)}/staff-review/start`,
          {
            method: "POST",
            cache: "no-store",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ confirm: true }),
          },
        );
        const payload = await readJson<StaffReviewStartApiResponse>(response);
        if (!response.ok || !payload?.ok) {
          setFailure(
            errorText(
              payload,
              "The independent Staff Feedback review could not start.",
            ),
          );
          return;
        }
        setStaffReviewState(payload.result.state);
      }

      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/anonymous-responses`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readJson<AnonymousResponsesApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setFailure(
          errorText(payload, "Anonymous staff-feedback forms could not be loaded."),
        );
        return;
      }
      if (!anonymousContractSafe(payload.anonymousResponses)) {
        setFailure(
          "The anonymous-response privacy contract could not be verified. No form was displayed.",
        );
        return;
      }

      setGovernanceReviewPackage(null);
      setAnonymousResponses(payload.anonymousResponses);
      setDirectReleaseInspection(null);
      setReviewMode("STAFF");
      setStaffLevel("CIRCUIT");
      setNotice(
        item.staffFeedbackReviewState === "RELEASED"
          ? "Released Staff Feedback evidence loaded read-only."
          : "Independent Staff Feedback review opened. Return, Hold and Release are available without Governance Appraisal evidence.",
      );

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById("staff-evidence-review")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    } catch {
      setFailure(
        "Network interrupted. Nothing was changed blindly. Refresh the work queue before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadAnonymousResponses(
    respondentKey?: string,
    cycleIdOverride?: string,
  ) {
    const selectedCycleId = clean(
      cycleIdOverride ??
        anonymousResponses?.cycle.id ??
        cycleId,
    );
    clearMessages();
    if (!selectedCycleId) {
      setFailure("Choose a closed or under-review appraisal from the work queue.");
      return;
    }

    setBusy(true);
    try {
      const query = respondentKey
        ? `?respondentKey=${encodeURIComponent(respondentKey)}`
        : "";
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/anonymous-responses${query}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readJson<AnonymousResponsesApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setFailure(
          errorText(payload, "Anonymous staff-feedback forms could not be loaded."),
        );
        return;
      }
      if (!anonymousContractSafe(payload.anonymousResponses)) {
        setFailure(
          "The anonymous-response privacy contract could not be verified. No form was displayed.",
        );
        return;
      }

      setCycleId(selectedCycleId);
      setAnonymousResponses(payload.anonymousResponses);
      setReviewMode("STAFF");
      setStaffLevel(respondentKey ? "FORM" : "CIRCUIT");
      if (payload.anonymousResponses.cycle.status === "CLOSED") {
        setGovernanceReviewPackage(null);
        setNotice(
          "Staff feedback loaded read-only. The separate governance assessment is not required for this inspection.",
        );
      }
    } catch {
      setFailure(
        "Network interrupted. No identity or response data was cached. Try loading the anonymous forms again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openStaffDecision(mode: DecisionMode) {
    clearMessages();
    if (!staffReviewState?.canDecide || !staffReviewState.latestReviewId) {
      setFailure("Open the independent Staff Feedback review before recording a decision.");
      return;
    }
    setStaffDecisionMode(mode);
    setReason("");
    setReleaseNote("");
  }

  async function submitStaffDecision() {
    if (!staffReviewState?.latestReviewId || !staffDecisionMode) return;
    const selectedCycleId = clean(staffReviewState.cycleId || cycleId);
    const reviewId = staffReviewState.latestReviewId;
    const note =
      staffDecisionMode === "RELEASE"
        ? releaseNote.trim()
        : reason.trim();

    if (staffDecisionMode !== "RELEASE" && note.length < 3) {
      setFailure("Write a clear reason of at least 3 characters.");
      return;
    }

    const confirmationText =
      staffDecisionMode === "RETURN"
        ? "Return this Staff Feedback review to the Director queue for later reconsideration? Finalized anonymous forms will remain locked."
        : staffDecisionMode === "HOLD"
          ? "Hold this Staff Feedback review and create the next review stage? Governance Appraisals will not change."
          : "Release this confidential Staff Feedback aggregate to the Headteacher? Governance Appraisals will not change.";
    if (!window.confirm(confirmationText)) return;

    setBusy(true);
    clearMessages();
    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/staff-review/decision`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reviewId,
            decision: staffDecisionMode,
            note: note || null,
            confirm: true,
          }),
        },
      );
      const payload = await readJson<StaffReviewDecisionApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        if (
          payload &&
          !payload.ok &&
          payload.error ===
            "HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_RETRY_REQUIRED" &&
          payload.releaseCommitted === true
        ) {
          setFailure(
            "Staff Feedback was released, but the Headteacher notification still needs retrying. Refresh the queue before repeating anything.",
          );
          await loadQueue();
          return;
        }
        setFailure(
          errorText(payload, "The independent Staff Feedback decision was not recorded."),
        );
        return;
      }

      const result = payload.result;
      if (result.sourceReviewDecision === "HELD" && result.nextReviewId) {
        setStaffReviewState({
          ...staffReviewState,
          lifecycleState: "PENDING_DECISION",
          latestReviewId: result.nextReviewId,
          latestStage: result.nextReviewStage,
          latestDecision: "PENDING",
          canStartReview: false,
          canDecide: true,
          releasedAt: null,
          releaseProofHash: null,
        });
        setNotice("Staff Feedback held. The next independent review stage is ready.");
      } else if (result.sourceReviewDecision === "RETURNED") {
        setStaffReviewState({
          ...staffReviewState,
          lifecycleState: "RETURNED_TO_QUEUE",
          latestReviewId: result.sourceReviewId,
          latestStage: result.sourceReviewStage,
          latestDecision: "RETURNED",
          canStartReview: true,
          canDecide: false,
          releasedAt: null,
          releaseProofHash: null,
        });
        setNotice(
          "Staff Feedback review returned to the queue. Finalized anonymous forms remain locked and unchanged.",
        );
      } else {
        setStaffReviewState({
          ...staffReviewState,
          lifecycleState: "RELEASED",
          latestReviewId: result.sourceReviewId,
          latestStage: result.sourceReviewStage,
          latestDecision: "ACCEPTED",
          canStartReview: false,
          canDecide: false,
          releasedAt: result.releasedAt,
          releaseProofHash: result.releaseProofHash,
        });
        setNotice(
          "Staff Feedback released independently. The Governance Appraisal stream was not changed.",
        );
      }

      setStaffDecisionMode(null);
      setReason("");
      setReleaseNote("");
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the Staff Feedback decision blindly. Refresh the work queue first.",
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="min-h-screen bg-slate-950 pb-28 text-slate-50 md:pb-10">
      <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
        <header className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(7,26,61,0.98),rgba(15,23,42,0.98))] px-4 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.24)] sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
                Director workspace
              </p>
              <h1 className="mt-1 text-xl font-black sm:text-2xl">
                District appraisal reviews
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">
                Confidential Staff Feedback stays separate. Governance work is grouped into Teacher Appraisals, Headteacher Appraisals and assessments you authored.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="rounded-2xl border border-violet-200/25 bg-violet-300/10 px-3 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.10em] text-violet-100/80">
                  Staff review ready
                </p>
                <p className="mt-0.5 text-xl font-black text-violet-50">
                  {readyItems.length}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-200/25 bg-cyan-300/10 px-3 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.10em] text-cyan-100/80">
                  Governance action
                </p>
                <p className="mt-0.5 text-xl font-black text-cyan-50">
                  {directorGovernanceActionCount}
                </p>
              </div>
              <ActionButton
                disabled={
                  queueLoading ||
                  governanceQueueLoading ||
                  teacherReviewQueueLoading
                }
                onClick={() => {
                  void loadQueue();
                  void loadGovernanceQueue();
                  void loadTeacherReviewQueue();
                }}
              >
                {queueLoading ||
                governanceQueueLoading ||
                teacherReviewQueueLoading
                  ? "Refreshing…"
                  : "Refresh"}
              </ActionButton>
            </div>
          </div>
        </header>

        <section className={panel("p-4 sm:p-5")}>
          <div className="rounded-2xl border border-violet-300/20 bg-violet-400/8 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">
              Staff Feedback Appraisals
            </p>
            <h2 className="mt-1 text-lg font-black text-white">
              Confidential Teacher feedback about Headteachers
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              This channel manages Teacher respondents, approval, feedback deadlines, anonymous forms and the later staff-feedback result. It does not control release of a completed governance assessment.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard
              label="Appraisal work queue"
              value={queue?.items.length ?? 0}
              description="All controlled Staff Feedback records."
              active={queuePanel === "ALL"}
              onClick={() => setQueuePanel("ALL")}
            />
            <SummaryCard
              label="Requests awaiting approval"
              value={pendingApprovalItems.length}
              description="Requests that can open the confidential feedback period."
              active={queuePanel === "APPROVAL"}
              attention
              onClick={() => setQueuePanel("APPROVAL")}
            />
            <SummaryCard
              label="Feedback in progress"
              value={collectingOpenItems.length}
              description="Open staff-feedback cycles collecting responses or awaiting a deadline extension."
              active={queuePanel === "OPEN"}
              onClick={() => setQueuePanel("OPEN")}
            />
            <SummaryCard
              label="All responses received"
              value={completedOpenItems.length}
              description="Every eligible frozen Teacher respondent has finalized before the deadline."
              active={queuePanel === "COMPLETE"}
              attention
              onClick={() => setQueuePanel("COMPLETE")}
            />
            <SummaryCard
              label="Ready for Director review"
              value={readyItems.length}
              description="Closed or under-review staff-feedback packages requiring attention."
              active={queuePanel === "READY"}
              attention
              onClick={() => setQueuePanel("READY")}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-200">
                  {queuePanel === "ALL"
                    ? "Staff Feedback work queue"
                    : queuePanel === "APPROVAL"
                      ? "Staff Feedback requests awaiting approval"
                      : queuePanel === "COMPLETE"
                        ? "Staff Feedback — all responses received"
                        : queuePanel === "READY"
                          ? "Staff Feedback ready for Director review"
                          : "Staff Feedback in progress"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Select the institutional Staff Feedback record below. No governance release action appears inside this channel.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">
                {visibleQueueItems.length} record{visibleQueueItems.length === 1 ? "" : "s"}
              </span>
            </div>

            {queueFailure ? (
              <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4 text-sm text-rose-100">
                {queueFailure}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {visibleQueueItems.length ? (
                visibleQueueItems.map((item) => (
                  <QueueRecord
                    key={item.cycleId}
                    item={item}
                    selected={item.cycleId === cycleId}
                    busy={busy}
                    onApprove={() => void approveAndOpen(item.cycleId)}
                    onExtend={() => void extendFeedbackWindow(item.cycleId)}
                    onCloseEarly={() => void closeCompletedEarly(item.cycleId)}
                    onWait={() => waitUntilDeadline(item)}
                    onReviewStaff={() => void reviewStaffFeedback(item)}
                  />
                ))
              ) : (
                <p className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-sm text-slate-300">
                  No Staff Feedback record is currently available in this category.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className={panel("p-3 sm:p-4")}>
          {showGovernanceAppraisals ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-black text-white sm:text-lg">
                      Governance
                    </h2>
                    {governanceCorrectionReceivedItems.length > 0 ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/45 bg-amber-300/15 px-2.5 py-1 text-xs font-black text-amber-100">
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] text-slate-950">
                          {governanceCorrectionReceivedItems.length}
                        </span>
                        Correction received
                      </span>
                    ) : null}
                    {directorGovernanceActionCount > 0 ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-xs font-black text-amber-100">
                        {directorGovernanceActionCount} need your action
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-black text-emerald-100">
                        No action due
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Open only the assessment you need to act on.
                  </p>
                </div>

                {selectedReleasedCount > 0 ? (
                  <ActionButton
                    onClick={() => setGovernanceExpanded((current) => !current)}
                  >
                    {governanceExpanded
                      ? "Hide released"
                      : `Show released (${selectedReleasedCount})`}
                  </ActionButton>
                ) : null}
              </div>

              <div
                aria-label="Governance appraisal filters"
                className="mt-3 grid gap-2 sm:grid-cols-3"
              >
                <GovernanceFocusButton
                  label="Teacher Appraisals"
                  count={teacherAppraisalItems.length}
                  helper="Teacher reports ready for Director action."
                  active={governanceFocus === "TEACHER"}
                  onClick={() => {
                    setGovernanceFocus("TEACHER");
                    setGovernanceExpanded(false);
                  }}
                />
                <GovernanceFocusButton
                  label="Headteacher Appraisals"
                  count={headteacherReadyItems.length + headteacherHeldItems.length}
                  helper="Headteacher reports from governance officers."
                  active={governanceFocus === "HEADTEACHER"}
                  onClick={() => {
                    setGovernanceFocus("HEADTEACHER");
                    setGovernanceExpanded(false);
                  }}
                />
                <GovernanceFocusButton
                  label="My Assessments"
                  count={myAssessmentActionCount}
                  helper="Assessments you authored and must inspect before release."
                  active={governanceFocus === "MINE"}
                  onClick={() => {
                    setGovernanceFocus("MINE");
                    setGovernanceExpanded(false);
                  }}
                />
              </div>

              <div className="mt-3 space-y-2">
                {governanceFocus === "TEACHER" ? (
                  teacherReviewQueueLoading ? (
                    <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
                      Loading Teacher Appraisals…
                    </p>
                  ) : teacherReviewQueueFailure ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-300/25 bg-rose-400/10 p-3 text-sm text-rose-100"
                    >
                      {teacherReviewQueueFailure}
                    </div>
                  ) : teacherAppraisalItems.length ? (
                    teacherAppraisalItems.map((item) => (
                      <TeacherQueueRecord
                        key={`teacher-${item.assessmentId}`}
                        item={item}
                        busy={busy}
                        onOpen={() => openTeacherReviewWorkspace(item)}
                      />
                    ))
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-5 text-slate-300">
                      No Teacher appraisal currently needs your action.
                    </p>
                  )
                ) : governanceQueueLoading ? (
                  <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
                    Loading Governance…
                  </p>
                ) : governanceQueueFailure ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-300/25 bg-rose-400/10 p-3 text-sm text-rose-100"
                  >
                    {governanceQueueFailure}
                  </div>
                ) : governanceFocus === "MINE" ? (
                  directorOwnTeacherItems.length > 0 ||
                  visibleGovernanceItems.length > 0 ? (
                    <>
                      {directorOwnTeacherItems.map((item) => (
                        <TeacherQueueRecord
                          key={`my-teacher-${item.assessmentId}`}
                          item={item}
                          busy={busy}
                          onOpen={() => openTeacherReviewWorkspace(item)}
                        />
                      ))}
                      {visibleGovernanceItems.map((item) => (
                        <GovernanceQueueRecord
                          key={`my-headteacher-${item.assessmentId}`}
                          item={item}
                          selected={
                            directReleaseInspection?.item.assessmentId ===
                              item.assessmentId ||
                            governanceReviewPackage?.assessment.assessmentId ===
                              item.assessmentId
                          }
                          busy={busy}
                          onInspect={() =>
                            void inspectDirectReleaseAssessment(item)
                          }
                        />
                      ))}
                    </>
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-5 text-slate-300">
                      None of your own finalized assessments currently needs release.
                    </p>
                  )
                ) : visibleGovernanceItems.length ? (
                  visibleGovernanceItems.map((item) => (
                    <GovernanceQueueRecord
                      key={`governance-${item.assessmentId}`}
                      item={item}
                      selected={
                        directReleaseInspection?.item.assessmentId ===
                          item.assessmentId ||
                        governanceReviewPackage?.assessment.assessmentId ===
                          item.assessmentId
                      }
                      busy={busy}
                      onInspect={() =>
                        void loadGovernanceReviewPackage(item)
                      }
                    />
                  ))
                ) : (
                  <p className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-5 text-slate-300">
                    No Headteacher appraisal currently needs your action.
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-400">
                Teacher Appraisals open the existing Teacher review workspace. Headteacher Appraisals keep their independent Governance review path. My Assessments use <span className="font-bold text-slate-200">Inspect & release</span> without self-review. <span className="font-bold text-amber-100">Correction received</span> means the officer has finished the returned work and it is ready for your final review. Staff Feedback stays separate.
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-black text-white">Governance</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Nothing needs your attention here.
                </p>
              </div>
              {governanceReleasedItems.length > 0 ? (
                <ActionButton onClick={() => setGovernanceExpanded(true)}>
                  Show released ({governanceReleasedItems.length})
                </ActionButton>
              ) : null}
            </div>
          )}
        </section>

        {notice ? (
          <div role="status" className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-100">
            {notice}
          </div>
        ) : null}
        {failure ? (
          <div role="alert" className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4 text-sm font-semibold text-rose-100">
            {failure}
          </div>
        ) : null}

        {directReleaseInspection ? (
          <DirectReleaseNativeForm
            inspection={directReleaseInspection}
            busy={busy}
            onBack={() => {
              setDirectReleaseInspection(null);
              clearMessages();
            }}
            onRelease={() =>
              void directReleaseOwnAssessment(directReleaseInspection.item)
            }
          />
        ) : null}

        {governanceReviewPackage ? (
          <GovernanceReviewNativeForm
            reviewPackage={governanceReviewPackage}
            busy={busy}
            onBack={() => {
              setGovernanceReviewPackage(null);
              setGovernanceDecisionMode(null);
              clearMessages();
            }}
            onStart={() => void startGovernanceReview()}
            onUnhold={() => void unholdGovernanceReview()}
            onChooseDecision={openGovernanceDecision}
          />
        ) : null}

        {reviewMode === "STAFF" && anonymousResponses ? (
          <StaffEvidence
            data={anonymousResponses}
            level={staffLevel}
            busy={busy}
            reviewState={staffReviewState}
            onChooseDecision={openStaffDecision}
            onLevel={setStaffLevel}
            onRespondent={(key) =>
              void loadAnonymousResponses(key, anonymousResponses.cycle.id)
            }
            onBackHome={() => {
              setReviewMode("HOME");
              setAnonymousResponses(null);
              setStaffReviewState(null);
            }}
          />
        ) : null}


        <footer className={panel("p-4 text-xs leading-5 text-slate-400")}>
          Staff Feedback Appraisals and Governance Appraisals remain independent channels. No background polling. No combined appraisal score. Anonymous individual staff forms use cycle-scoped Respondent 1…N labels; real Teacher identities are not available to the District Director.
          <span className="sr-only">{JSON.stringify(DIRECTOR_REVIEW_UI_POLICY)}</span>
        </footer>
      </div>

      {staffDecisionMode ? (
        <DecisionDialog
          mode={staffDecisionMode}
          stream="STAFF"
          reason={reason}
          releaseNote={releaseNote}
          busy={busy}
          onReasonChange={setReason}
          onReleaseNoteChange={setReleaseNote}
          onClose={() => setStaffDecisionMode(null)}
          onConfirm={() => void submitStaffDecision()}
        />
      ) : null}

      {governanceDecisionMode ? (
        <DecisionDialog
          mode={governanceDecisionMode}
          stream="GOVERNANCE"
          reason={reason}
          releaseNote={releaseNote}
          busy={busy}
          onReasonChange={setReason}
          onReleaseNoteChange={setReleaseNote}
          onClose={() => setGovernanceDecisionMode(null)}
          onConfirm={() => void submitGovernanceDecision()}
        />
      ) : null}
    </main>
  );
}
