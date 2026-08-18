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
import type { HeadteacherDirectorReviewPackage } from "@/lib/appraisals/headteacherDirectorReviewPackage";
import type { HeadteacherDirectorAnonymousResponsesView } from "@/lib/appraisals/headteacherDirectorAnonymousResponses";

type DecisionMode = "RETURN" | "HOLD" | "RELEASE";
type QueuePanel = "ALL" | "APPROVAL" | "COMPLETE" | "READY" | "OPEN";
type ReviewMode = "HOME" | "STAFF" | "SUPERVISORY" | "ANALYTICS";
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
};

type DirectorQueue = {
  pendingApprovalCount: number;
  openCount: number;
  items: DirectorQueueItem[];
};

type DirectorQueueApiResponse =
  | { ok: true; reqId: string; queue: DirectorQueue }
  | { ok: false; reqId?: string; error: string; details?: unknown };

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

type DirectReleaseInspection = {
  item: DirectorQueueItem;
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

type ReviewPackageApiResponse =
  | {
      ok: true;
      reqId: string;
      reviewPackage: HeadteacherDirectorReviewPackage;
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

type SupervisorySection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  rawScore: number;
  applicableMaximum: number;
  notApplicableItems: number;
  items: HeadteacherDirectorReviewPackage["supervisoryAssessment"]["items"];
};

type AnonymousSelectedResponse = NonNullable<
  HeadteacherDirectorAnonymousResponsesView["selectedResponse"]
>;

const API_BASE = "/api/district/headteacher-appraisals";

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

function differenceLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Not comparable";
  const rounded = Math.round(value);
  if (rounded === 0) return "No difference";
  return `${rounded > 0 ? "+" : ""}${rounded} points`;
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

function fullReviewFailureText(value: unknown, fallback: string) {
  const candidate = value as ApiFailure | null;
  if (
    candidate?.error ===
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CYCLE_NOT_ACTIVE"
  ) {
    return (
      "This appraisal is ready, but the full Director review has not started. " +
      "Use Start full decision review on the record, confirm the action, then load the evidence package."
    );
  }
  if (
    candidate?.error ===
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED"
  ) {
    return (
      "The staff feedback is ready, but the separate governance assessment " +
      "has not yet been finalized. Review the anonymous staff forms now, or " +
      "start the full decision review after the governance assessment is finalized."
    );
  }
  return errorText(value, fallback);
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

function buildSupervisorySections(
  reviewPackage: HeadteacherDirectorReviewPackage | null,
): SupervisorySection[] {
  if (!reviewPackage) return [];

  const grouped = new Map<string, SupervisorySection>();
  const percentages = reviewPackage.supervisoryAssessment.sectionPercentages;

  for (const item of reviewPackage.supervisoryAssessment.items) {
    const current = grouped.get(item.sectionKey) ?? {
      sectionKey: item.sectionKey,
      sectionTitle: item.sectionTitle,
      sectionOrder: item.sectionOrder,
      sectionMaxScore: 0,
      percentage: percentages[item.sectionKey] ?? null,
      rawScore: 0,
      applicableMaximum: 0,
      notApplicableItems: 0,
      items: [],
    };

    current.items.push(item);
    current.sectionMaxScore += item.itemMaxScore;
    if (item.notApplicable) {
      current.notApplicableItems += 1;
    } else {
      current.rawScore += item.score ?? 0;
      current.applicableMaximum += item.itemMaxScore;
    }
    grouped.set(item.sectionKey, current);
  }

  return [...grouped.values()].sort(
    (left, right) => left.sectionOrder - right.sectionOrder,
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
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={
        props.primary
          ? "min-h-11 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-50"
          : "min-h-11 rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm font-black text-slate-100 disabled:cursor-wait disabled:opacity-50"
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
  onStart: () => void;
  onLoad: () => void;
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
  const hasDirectorOwnGovernanceAssessment = Boolean(
    item.governanceAssessmentId,
  );

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
                  ? `Responses closed ${formatDate(item.closedAt)}`
                  : item.cycleStatus === "UNDER_REVIEW"
                    ? "Director review already started"
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
          {item.cycleStatus === "CLOSED" ? (
            <>
              <ActionButton
                primary
                disabled={props.busy}
                onClick={props.onReviewStaff}
              >
                Review staff feedback
              </ActionButton>
              {!hasDirectorOwnGovernanceAssessment ? (
                <ActionButton disabled={props.busy} onClick={props.onStart}>
                  Start full decision review
                </ActionButton>
              ) : null}
            </>
          ) : null}
          {item.cycleStatus === "UNDER_REVIEW" &&
          !hasDirectorOwnGovernanceAssessment ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onLoad}
            >
              Load review package
            </ActionButton>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GovernanceQueueRecord(props: {
  item: DirectorQueueItem;
  selected: boolean;
  busy: boolean;
  onInspect: () => void;
}) {
  const { item } = props;

  return (
    <article
      className={
        props.selected
          ? "rounded-2xl border border-cyan-300/40 bg-cyan-300/8 p-4"
          : "rounded-2xl border border-white/10 bg-slate-950/75 p-4"
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100">
              Governance assessment
            </span>
            <h3 className="truncate text-base font-black text-slate-50">
              {item.targetHeadteacherName || "Headteacher"}
            </h3>
            {item.governanceAssessmentDirectReleased ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black text-emerald-100">
                Released
              </span>
            ) : item.canDirectReleaseOwnAssessment ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black text-amber-100">
                Ready for final inspection
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-300">
                Recorded
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {item.schoolName}
            {item.circuitName ? ` · ${item.circuitName}` : ""}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-cyan-200">
            Official governance assessment of the Headteacher. It is independent of confidential Staff Feedback and follows its own release path.
          </p>
          {item.governanceAssessmentDirectReleased ? (
            <p className="mt-2 text-xs leading-5 text-emerald-200">
              This governance assessment has already been released. The separate confidential Staff Feedback appraisal continues on its own state.
            </p>
          ) : item.canDirectReleaseOwnAssessment ? (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Inspect the complete locked native form before publishing this governance assessment to the Headteacher.
            </p>
          ) : null}
        </div>

        {item.canDirectReleaseOwnAssessment && item.directReleaseAssessmentId ? (
          <ActionButton
            primary
            disabled={props.busy}
            onClick={props.onInspect}
          >
            Review governance assessment
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
}) {
  const base = props.compact
    ? "min-h-11 flex-1 rounded-xl px-3 py-2 text-xs font-black"
    : "min-h-12 rounded-xl px-4 py-2.5 text-sm font-black";

  return (
    <div className={props.compact ? "flex gap-2" : "grid grid-cols-3 gap-2"}>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChoose("RETURN")}
        className={`${base} border border-rose-300/25 bg-rose-400/10 text-rose-100 disabled:opacity-45`}
      >
        Return
      </button>
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
  reason: string;
  releaseNote: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onReleaseNoteChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title =
    props.mode === "RETURN"
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
              Director decision
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
                ? "Reason for correction"
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

function EvidenceGateway(props: {
  reviewPackage: HeadteacherDirectorReviewPackage;
  onStaff: () => void;
  onSupervisory: () => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <button
        type="button"
        onClick={props.onStaff}
        className="group rounded-[26px] border border-violet-300/20 bg-[linear-gradient(145deg,rgba(76,29,149,0.24),rgba(15,23,42,0.96))] p-5 text-left transition hover:border-violet-300/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">
              Confidential evidence
            </p>
            <h2 className="mt-2 text-xl font-black text-white">Staff feedback</h2>
          </div>
          <span className="rounded-full border border-violet-200/20 bg-black/20 px-3 py-1 text-xs font-black text-violet-100">
            {props.reviewPackage.staffFeedback.finalizedResponses} respondent
            {props.reviewPackage.staffFeedback.finalizedResponses === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-violet-50/80">
          Open circuit, school and anonymous Respondent 1…N forms. Real Teacher identities remain hidden from the Director.
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-violet-200/70">Aggregate evidence</p>
            <p className="mt-1 text-3xl font-black text-white">
              {wholePercentage(props.reviewPackage.staffFeedback.overallPercentage)}
            </p>
          </div>
          <span className="text-sm font-black text-violet-100 group-hover:translate-x-1">
            Open native forms →
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={props.onSupervisory}
        className="group rounded-[26px] border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,145,178,0.20),rgba(15,23,42,0.96))] p-5 text-left transition hover:border-cyan-300/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
              Governance evidence
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Supervisory assessment
            </h2>
          </div>
          <span className="rounded-full border border-cyan-200/20 bg-black/20 px-3 py-1 text-xs font-black text-cyan-100">
            34 indicators
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-cyan-50/80">
          Open the exact four-section Monitoring and Inspection Sheet with immutable, colour-coded SISSO scores.
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-cyan-200/70">Final supervisory result</p>
            <p className="mt-1 text-3xl font-black text-white">
              {wholePercentage(
                props.reviewPackage.supervisoryAssessment.overallPercentage,
              )}
            </p>
          </div>
          <span className="text-sm font-black text-cyan-100 group-hover:translate-x-1">
            Open official form →
          </span>
        </div>
      </button>
    </section>
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

function SupervisoryForm(props: {
  reviewPackage: HeadteacherDirectorReviewPackage;
  sections: SupervisorySection[];
  onBack: () => void;
}) {
  const assessment = props.reviewPackage.supervisoryAssessment;
  const visit = assessment.visit;
  const cycle = props.reviewPackage.cycle;
  const officialMaximum = props.sections.reduce(
    (sum, section) => sum + section.sectionMaxScore,
    0,
  );
  const applicableMaximum = props.sections.reduce(
    (sum, section) => sum + section.applicableMaximum,
    0,
  );
  const rawTotal = props.sections.reduce(
    (sum, section) => sum + section.rawScore,
    0,
  );
  const totalNotApplicable = props.sections.reduce(
    (sum, section) => sum + section.notApplicableItems,
    0,
  );

  return (
    <section className="space-y-4">
      <div className={panel("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
              Official supervisory evidence · read-only
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Native Monitoring and Inspection Sheet
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This is the Director&apos;s paper-form view of the finalized SISSO assessment. Scores are immutable and colour-coded only to improve review speed.
            </p>
          </div>
          <ActionButton onClick={props.onBack}>Back to evidence</ActionButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
        <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
          <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
            <p className="text-[13px] font-black uppercase tracking-[0.12em]">
              {cycle.districtName || "District Education Directorate"}
            </p>
            <h3 className="mt-1 text-[16px] font-black uppercase">
              Monitoring and Inspection Sheet (Headteachers)
            </h3>
          </div>

          <table className="w-full border-collapse text-[12px] leading-5">
            <tbody>
              {[
                [
                  "Name of School",
                  cycle.schoolName,
                  "Staff Strength",
                  visit.staffStrength,
                ],
                [
                  "Name of Circuit",
                  cycle.circuitName,
                  "Total Enrolment",
                  visit.totalEnrolment,
                ],
                ["Name of Head", cycle.targetName, "Girls", visit.girls],
                [
                  "Date of Visit",
                  formatDate(assessment.dateObserved),
                  "Boys",
                  visit.boys,
                ],
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
              Official visit particulars were captured when this assessment was created and are displayed from the immutable evidence snapshot.
            </div>
          ) : (
            <div className="border-x border-b border-slate-300 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-950">
              This version-1 historical assessment predates the expanded visit header. Missing arrival-time, staffing and enrolment values are shown as not captured rather than reconstructed.
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
              {props.sections.map((section) => (
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
                    const options: Array<{ score: number | null; notApplicable: boolean; label: string }> = [
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
                            : !item.notApplicable && item.score === option.score;

                          return (
                            <td
                              key={option.label}
                              className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${paperScoreCellTone({
                                selected,
                                score: option.score,
                                notApplicable: option.notApplicable,
                              })}`}
                              aria-label={selected ? `Selected ${option.label}` : undefined}
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
                  {wholePercentage(assessment.overallPercentage)}
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
              <p className="mt-1 text-base font-black">{wholePercentage(assessment.overallPercentage)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={panel("grid gap-3 p-4 sm:grid-cols-4 sm:p-5")}>
        <EvidenceField label="Assessor" value={assessment.assessor.name} />
        <EvidenceField label="Office" value={assessment.assessor.office} />
        <EvidenceField label="Status" value="Finalized and locked" />
        <EvidenceField label="Finalized" value={formatDate(assessment.finalizedAt)} />
      </div>
    </section>
  );
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

function DirectReleaseNativeForm(props: {
  inspection: DirectReleaseInspection;
  busy: boolean;
  onBack: () => void;
  onRelease: () => void;
}) {
  const workspace = props.inspection.workspace;
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
              Review the official assessment before release
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This is the same native 4-section, 34-indicator Monitoring and Inspection Sheet used at the assessor stage. This screen is read-only. Nothing on the official form can be changed here.
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
    </section>
  );
}

function StaffNativeForm(props: {
  data: HeadteacherDirectorAnonymousResponsesView;
  selected: AnonymousSelectedResponse;
  onBack: () => void;
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
  staffOnly?: boolean;
}) {
  const selected = props.data.selectedResponse;

  return (
    <section className="space-y-4">
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
            {props.staffOnly ? "Back to work queue" : "Back to evidence"}
          </ActionButton>
        </div>
      </div>

      {props.staffOnly ? (
        <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4 text-sm leading-6 text-violet-50">
          <p className="font-black">Staff evidence review only</p>
          <p className="mt-1">
            The anonymous staff-feedback stream is complete and may be inspected
            now. Return, Hold and Release remain unavailable until the separate
            governance assessment is finalized and the full decision review is
            started.
          </p>
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
          onBack={() => props.onLevel("RESPONDENTS")}
        />
      ) : null}
    </section>
  );
}

function AnalyticsView(props: {
  reviewPackage: HeadteacherDirectorReviewPackage;
  currentItemIndex: number;
  onCurrentItemIndex: (value: number) => void;
  onBack: () => void;
}) {
  const comparison = props.reviewPackage.comparison;
  const currentItem = comparison.items[props.currentItemIndex] ?? null;

  return (
    <section className="space-y-4">
      <div className={panel("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
              Appraisal analytics
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Evidence comparison
            </h2>
          </div>
          <ActionButton onClick={props.onBack}>Back to native forms</ActionButton>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Analytics support the Director’s judgment. No combined appraisal score or automatic decision is created.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <EvidenceField
          label="Staff feedback"
          value={wholePercentage(comparison.overall.staffAveragePercentage)}
        />
        <EvidenceField
          label="Supervisory assessment"
          value={wholePercentage(comparison.overall.supervisoryPercentage)}
        />
        <EvidenceField
          label="Difference"
          value={differenceLabel(
            comparison.overall.supervisoryMinusStaffPercentagePoints,
          )}
        />
      </div>

      <div className={panel("p-4 sm:p-5")}>
        <h3 className="text-lg font-black text-white">Section summary</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {comparison.sections.map((section) => (
            <article
              key={section.sectionKey}
              className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"
            >
              <p className="font-black text-white">{section.sectionTitle}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <EvidenceField
                  label="Staff"
                  value={wholePercentage(section.staffAveragePercentage)}
                />
                <EvidenceField
                  label="Supervisory"
                  value={wholePercentage(section.supervisoryPercentage)}
                />
                <EvidenceField
                  label="Difference"
                  value={differenceLabel(
                    section.supervisoryMinusStaffPercentagePoints,
                  )}
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      {currentItem ? (
        <article className={panel("border-amber-300/25 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">
              Item {props.currentItemIndex + 1} of {comparison.items.length}
            </p>
            <p className="text-xs font-bold text-slate-400">{currentItem.sectionTitle}</p>
          </div>
          <h3 className="mt-3 text-lg font-black leading-7 text-white">
            <span className="mr-2 text-amber-300">{currentItem.itemKey}</span>
            {currentItem.itemLabel}
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <EvidenceField
              label="Staff feedback"
              value={
                currentItem.staffAveragePercentage == null
                  ? "N/A"
                  : wholePercentage(currentItem.staffAveragePercentage)
              }
            />
            <EvidenceField
              label="Supervisory assessment"
              value={
                currentItem.supervisoryNotApplicable
                  ? "N/A"
                  : wholePercentage(currentItem.supervisoryPercentage)
              }
            />
            <EvidenceField
              label="Difference"
              value={differenceLabel(
                currentItem.supervisoryMinusStaffPercentagePoints,
              )}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <ActionButton
              disabled={props.currentItemIndex === 0}
              onClick={() =>
                props.onCurrentItemIndex(Math.max(0, props.currentItemIndex - 1))
              }
            >
              Previous
            </ActionButton>
            <ActionButton
              primary
              disabled={props.currentItemIndex >= comparison.items.length - 1}
              onClick={() =>
                props.onCurrentItemIndex(
                  Math.min(comparison.items.length - 1, props.currentItemIndex + 1),
                )
              }
            >
              Next
            </ActionButton>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function EvidenceField(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-3.5">
      <p className="text-[11px] font-black uppercase tracking-[0.10em] text-slate-400">
        {props.label}
      </p>
      <p className="mt-1.5 text-sm font-black leading-5 text-white">{props.value}</p>
    </div>
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
  const [reviewPackage, setReviewPackage] =
    useState<HeadteacherDirectorReviewPackage | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("HOME");
  const [staffLevel, setStaffLevel] = useState<StaffLevel>("CIRCUIT");
  const [anonymousResponses, setAnonymousResponses] =
    useState<HeadteacherDirectorAnonymousResponsesView | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [decisionMode, setDecisionMode] = useState<DecisionMode | null>(null);
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
          item.cycleStatus === "CLOSED" ||
          item.cycleStatus === "UNDER_REVIEW",
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
    () => queue?.items.filter((item) => Boolean(item.governanceAssessmentId)) ?? [],
    [queue],
  );
  const governanceReadyItems = useMemo(
    () => governanceItems.filter((item) => item.canDirectReleaseOwnAssessment),
    [governanceItems],
  );
  const supervisorySections = useMemo(
    () => buildSupervisorySections(reviewPackage),
    [reviewPackage],
  );

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

  useEffect(() => {
    void loadQueue();
    if (initialCycleId) void loadPackage(initialCycleId);
    // One explicit initial load only. No polling or background traffic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadQueue]);

  async function loadPackage(cycleIdOverride?: string) {
    const selectedCycleId = clean(cycleIdOverride ?? cycleId);
    clearMessages();
    if (!selectedCycleId) {
      setFailure("Choose an appraisal from the work queue.");
      return;
    }

    setCycleId(selectedCycleId);
    setBusy(true);
    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/review-package`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readJson<ReviewPackageApiResponse>(response);
      if (!response.ok || !payload?.ok) {
        setReviewPackage(null);
        setAnonymousResponses(null);
        setFailure(
          fullReviewFailureText(
            payload,
            "The review package is not ready. Start the review or try again.",
          ),
        );
        return;
      }

      setReviewPackage(payload.reviewPackage);
      setAnonymousResponses(null);
      setDirectReleaseInspection(null);
      setReviewMode("HOME");
      setStaffLevel("CIRCUIT");
      setCurrentItemIndex(0);
      setDecisionMode(null);
      setReason("");
      setReleaseNote("");
      setNotice("Review evidence loaded securely.");
    } catch {
      setFailure(
        "Network interrupted. Nothing was changed. Check the connection and load the package again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function inspectDirectReleaseAssessment(item: DirectorQueueItem) {
    const assessmentId = clean(item.directReleaseAssessmentId);
    clearMessages();

    if (!item.canDirectReleaseOwnAssessment || !assessmentId) {
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
      setReviewPackage(null);
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

  async function directReleaseOwnAssessment(item: DirectorQueueItem) {
    const assessmentId = clean(item.directReleaseAssessmentId);
    clearMessages();
    if (!item.canDirectReleaseOwnAssessment || !assessmentId) {
      setFailure(
        "This record is not eligible for the Director-authored direct-release path.",
      );
      return;
    }

    if (
      !directReleaseInspection ||
      clean(directReleaseInspection.item.directReleaseAssessmentId) !==
        assessmentId ||
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
      setReviewPackage(null);
      setAnonymousResponses(null);
      setDirectReleaseInspection(null);
      setReviewMode("HOME");
      setNotice(
        "Your finalized governance assessment was released directly. No self-review was created, and the confidential Staff Feedback appraisal remains unchanged.",
      );
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the release blindly. Refresh the work queue first; the protected endpoint is retry-safe.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startReview(cycleIdToStart: string) {
    const selectedCycleId = clean(cycleIdToStart);
    clearMessages();
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Start the full Director decision review now? This requires both the sealed staff-feedback evidence and the finalized governance assessment.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/review-start`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        setFailure(
          fullReviewFailureText(
            payload,
            "The full Director decision review could not be started.",
          ),
        );
        return;
      }
      await loadPackage(selectedCycleId);
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Load the package to confirm the current state before repeating the action.",
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

  async function loadAnonymousResponses(
    respondentKey?: string,
    cycleIdOverride?: string,
  ) {
    const selectedCycleId = clean(
      cycleIdOverride ??
        anonymousResponses?.cycle.id ??
        reviewPackage?.cycle.id ??
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
        setReviewPackage(null);
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

  function openDecision(mode: DecisionMode) {
    clearMessages();
    setDecisionMode(mode);
    setReason("");
    setReleaseNote("");
  }

  async function submitDecision() {
    if (!reviewPackage || !decisionMode) return;
    const selectedCycleId = reviewPackage.cycle.id;
    const reviewId = reviewPackage.review.id;

    if (
      (decisionMode === "RETURN" || decisionMode === "HOLD") &&
      reason.trim().length < 3
    ) {
      setFailure("Write a clear reason of at least 3 characters.");
      return;
    }

    const confirmationText =
      decisionMode === "RETURN"
        ? "Return this supervisory assessment for a correction revision?"
        : decisionMode === "HOLD"
          ? "Hold this appraisal and create the next Director review stage?"
          : "Release this appraisal as the official Headteacher result?";

    if (!window.confirm(confirmationText)) return;

    setBusy(true);
    clearMessages();
    try {
      const isRelease = decisionMode === "RELEASE";
      const endpoint = isRelease ? "release" : "return-hold";
      const body = isRelease
        ? { reviewId, note: releaseNote.trim() || null, confirm: true }
        : {
            reviewId,
            decision: decisionMode,
            note: reason.trim(),
            confirm: true,
          };
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(selectedCycleId)}/${endpoint}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await readJson<ApiFailure>(response);
      if (!response.ok) {
        if (
          payload?.error ===
            "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED" &&
          payload.releaseCommitted === true
        ) {
          setFailure(
            "The appraisal was released, but the Headteacher notification still needs retrying. Repeating release will not duplicate the official result.",
          );
          return;
        }
        setFailure(errorText(payload, "The Director decision was not recorded."));
        return;
      }

      const completed =
        decisionMode === "RETURN"
          ? "Assessment returned. The assessor must create a correction revision."
          : decisionMode === "HOLD"
            ? "Appraisal held. The next Director review stage is ready."
            : "Appraisal released. The Headteacher notification was queued safely.";

      setNotice(completed);
      setDecisionMode(null);
      setReason("");
      setReleaseNote("");

      if (decisionMode === "HOLD") {
        await loadPackage(selectedCycleId);
      } else {
        setReviewPackage(null);
        setAnonymousResponses(null);
        setReviewMode("HOME");
      }
      await loadQueue();
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the decision blindly. Load the package to confirm the server state.",
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
                Headteacher appraisals
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">
                Two independent appraisal channels are shown separately below: confidential Staff Feedback and official Governance Assessments.
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
                  Governance ready
                </p>
                <p className="mt-0.5 text-xl font-black text-cyan-50">
                  {governanceReadyItems.length}
                </p>
              </div>
              <ActionButton disabled={queueLoading} onClick={() => void loadQueue()}>
                {queueLoading ? "Refreshing…" : "Refresh"}
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
                    onReviewStaff={() =>
                      void loadAnonymousResponses(undefined, item.cycleId)
                    }
                    onStart={() => void startReview(item.cycleId)}
                    onLoad={() => void loadPackage(item.cycleId)}
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

        <section className={panel("p-4 sm:p-5")}>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                  Governance Appraisals
                </p>
                <h2 className="mt-1 text-lg font-black text-white">
                  Official governance assessments of Headteachers
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                  This channel contains finalized assessments completed by authorized governance officers. Governance release is independent of Teacher Staff Feedback; the two outcomes meet later only for analytics.
                </p>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                {governanceItems.length} record{governanceItems.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {governanceItems.length ? (
              governanceItems.map((item) => (
                <GovernanceQueueRecord
                  key={`governance-${item.cycleId}`}
                  item={item}
                  selected={
                    directReleaseInspection?.item.cycleId === item.cycleId
                  }
                  busy={busy}
                  onInspect={() => void inspectDirectReleaseAssessment(item)}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-sm leading-6 text-slate-300">
                No Director-authored governance assessment is currently ready or released in this work list.
              </p>
            )}
          </div>
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

        {reviewMode === "STAFF" && anonymousResponses ? (
          <StaffEvidence
            data={anonymousResponses}
            level={staffLevel}
            busy={busy}
            staffOnly={!reviewPackage}
            onLevel={setStaffLevel}
            onRespondent={(key) =>
              void loadAnonymousResponses(key, anonymousResponses.cycle.id)
            }
            onBackHome={() => {
              setReviewMode("HOME");
              if (!reviewPackage) setAnonymousResponses(null);
            }}
          />
        ) : null}

        {reviewPackage && reviewMode !== "STAFF" ? (
          <>
            <section className={panel("p-4 sm:p-5")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">
                    Current review · stage {reviewPackage.review.stage}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    {reviewPackage.cycle.targetName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {reviewPackage.cycle.schoolName} · {reviewPackage.cycle.circuitName}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ActionButton onClick={() => setReviewMode("HOME")}>
                    Native evidence
                  </ActionButton>
                  <ActionButton
                    primary={reviewMode === "ANALYTICS"}
                    onClick={() => setReviewMode("ANALYTICS")}
                  >
                    Appraisal analytics
                  </ActionButton>
                </div>
              </div>
            </section>

            <div className="sticky top-3 z-40 hidden rounded-2xl border border-white/15 bg-slate-950/95 p-3 shadow-2xl backdrop-blur md:block">
              <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                <div>
                  <p className="text-xs font-black text-white">Director decision</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Always available while reviewing this package.
                  </p>
                </div>
                <DecisionButtons disabled={busy} onChoose={openDecision} />
              </div>
            </div>

            {reviewMode === "HOME" ? (
              <EvidenceGateway
                reviewPackage={reviewPackage}
                onStaff={() => void loadAnonymousResponses()}
                onSupervisory={() => setReviewMode("SUPERVISORY")}
              />
            ) : null}

            {reviewMode === "SUPERVISORY" ? (
              <SupervisoryForm
                reviewPackage={reviewPackage}
                sections={supervisorySections}
                onBack={() => setReviewMode("HOME")}
              />
            ) : null}

            {reviewMode === "ANALYTICS" ? (
              <AnalyticsView
                reviewPackage={reviewPackage}
                currentItemIndex={currentItemIndex}
                onCurrentItemIndex={setCurrentItemIndex}
                onBack={() => setReviewMode("HOME")}
              />
            ) : null}

            <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/15 bg-slate-950/95 p-3 shadow-2xl backdrop-blur md:hidden">
              <DecisionButtons compact disabled={busy} onChoose={openDecision} />
            </div>
          </>
        ) : null}

        <footer className={panel("p-4 text-xs leading-5 text-slate-400")}>
          Staff Feedback Appraisals and Governance Appraisals remain independent channels. No background polling. No combined appraisal score. Anonymous individual staff forms use cycle-scoped Respondent 1…N labels; real Teacher identities are not available to the District Director.
          <span className="sr-only">{JSON.stringify(DIRECTOR_REVIEW_UI_POLICY)}</span>
        </footer>
      </div>

      {decisionMode ? (
        <DecisionDialog
          mode={decisionMode}
          reason={reason}
          releaseNote={releaseNote}
          busy={busy}
          onReasonChange={setReason}
          onReleaseNoteChange={setReleaseNote}
          onClose={() => setDecisionMode(null)}
          onConfirm={() => void submitDecision()}
        />
      ) : null}
    </main>
  );
}
