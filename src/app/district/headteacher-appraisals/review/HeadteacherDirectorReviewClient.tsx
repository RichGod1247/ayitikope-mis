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
type QueuePanel = "ALL" | "APPROVAL" | "READY" | "OPEN";
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
  finalizedResponseCount: number;
};

type DirectorQueue = {
  pendingApprovalCount: number;
  openCount: number;
  items: DirectorQueueItem[];
};

type DirectorQueueApiResponse =
  | { ok: true; reqId: string; queue: DirectorQueue }
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

function SummaryCard(props: {
  label: string;
  value: number;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "min-h-[128px] rounded-[22px] border border-amber-300/45 bg-amber-300/12 p-4 text-left shadow-[0_14px_35px_rgba(245,196,69,0.10)]"
          : "min-h-[128px] rounded-[22px] border border-white/10 bg-slate-900/85 p-4 text-left transition hover:border-white/20 hover:bg-slate-900"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          {props.label}
        </p>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs font-black text-slate-100">
          {props.value}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-slate-200">
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
  onStart: () => void;
  onLoad: () => void;
}) {
  const { item } = props;
  return (
    <article
      className={
        props.selected
          ? "rounded-2xl border border-amber-300/35 bg-amber-300/8 p-4"
          : "rounded-2xl border border-white/10 bg-slate-950/75 p-4"
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {item.cycleStatus === "PENDING_APPROVAL"
              ? `Requested ${formatDate(item.requestedAt)}`
              : item.cycleStatus === "OPEN"
                ? `${item.finalizedResponseCount} of ${item.participantCount} responses finalized · deadline ${formatDate(item.deadlineAt)}`
                : item.cycleStatus === "CLOSED"
                  ? `Responses closed ${formatDate(item.closedAt)}`
                  : item.cycleStatus === "UNDER_REVIEW"
                    ? "Director review already started"
                    : item.releasedAt
                      ? `Released ${formatDate(item.releasedAt)}`
                      : item.label}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {item.cycleStatus === "PENDING_APPROVAL" ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onApprove}
            >
              Approve and open
            </ActionButton>
          ) : null}
          {item.cycleStatus === "CLOSED" ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onStart}
            >
              Start Director review
            </ActionButton>
          ) : null}
          {item.cycleStatus === "UNDER_REVIEW" ? (
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

function paperValue(value: string | null | undefined) {
  return clean(value) || "Not captured in this historical record";
}

function SupervisoryForm(props: {
  reviewPackage: HeadteacherDirectorReviewPackage;
  sections: SupervisorySection[];
  onBack: () => void;
}) {
  const assessment = props.reviewPackage.supervisoryAssessment;
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
                ["Name of School", cycle.schoolName, "Staff Strength", null],
                ["Name of Circuit", cycle.circuitName, "Total Enrolment", null],
                ["Name of Head", cycle.targetName, "Girls", null],
                ["Date of Visit", formatDate(assessment.dateObserved), "Boys", null],
                ["Arrival Time", null, "Teachers Present at the Time of Visit", null],
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

          <div className="border-x border-b border-slate-300 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-950">
            This version-1 historical assessment predates the expanded visit header. Missing arrival-time, staffing and enrolment values are shown as not captured rather than reconstructed.
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
          <ActionButton onClick={props.onBackHome}>Back to evidence</ActionButton>
        </div>
      </div>

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
  const [queuePanel, setQueuePanel] = useState<QueuePanel>("READY");
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

  const pendingApprovalItems = useMemo(
    () => queue?.items.filter((item) => item.cycleStatus === "PENDING_APPROVAL") ?? [],
    [queue],
  );
  const readyItems = useMemo(
    () =>
      queue?.items.filter(
        (item) => item.cycleStatus === "CLOSED" || item.cycleStatus === "UNDER_REVIEW",
      ) ?? [],
    [queue],
  );
  const openItems = useMemo(
    () => queue?.items.filter((item) => item.cycleStatus === "OPEN") ?? [],
    [queue],
  );
  const visibleQueueItems = useMemo(() => {
    if (!queue) return [];
    if (queuePanel === "APPROVAL") return pendingApprovalItems;
    if (queuePanel === "READY") return readyItems;
    if (queuePanel === "OPEN") return openItems;
    return queue.items;
  }, [openItems, pendingApprovalItems, queue, queuePanel, readyItems]);
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
          errorText(payload, "The review package is not ready. Start the review or try again."),
        );
        return;
      }

      setReviewPackage(payload.reviewPackage);
      setAnonymousResponses(null);
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

  async function startReview(cycleIdToStart: string) {
    const selectedCycleId = clean(cycleIdToStart);
    clearMessages();
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Start the Director review now? This verifies both evidence streams and moves the appraisal into review.",
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
        setFailure(errorText(payload, "The review could not be started."));
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

  async function loadAnonymousResponses(respondentKey?: string) {
    if (!reviewPackage) return;
    clearMessages();
    setBusy(true);
    try {
      const query = respondentKey
        ? `?respondentKey=${encodeURIComponent(respondentKey)}`
        : "";
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(reviewPackage.cycle.id)}/anonymous-responses${query}`,
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
      setAnonymousResponses(payload.anonymousResponses);
      setReviewMode("STAFF");
      setStaffLevel(respondentKey ? "FORM" : "CIRCUIT");
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
                Headteacher appraisal review
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">
                Approve requests, inspect native evidence forms and make the official Director decision.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Ready now
                </p>
                <p className="mt-0.5 text-xl font-black text-white">{readyItems.length}</p>
              </div>
              <ActionButton disabled={queueLoading} onClick={() => void loadQueue()}>
                {queueLoading ? "Refreshing…" : "Refresh"}
              </ActionButton>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label="Appraisal work queue"
            value={queue?.items.length ?? 0}
            description="All controlled Headteacher appraisal records."
            active={queuePanel === "ALL"}
            onClick={() => setQueuePanel("ALL")}
          />
          <SummaryCard
            label="Requests awaiting approval"
            value={pendingApprovalItems.length}
            description="Requests that can open the confidential feedback period."
            active={queuePanel === "APPROVAL"}
            onClick={() => setQueuePanel("APPROVAL")}
          />
          <SummaryCard
            label="Ready for Director review"
            value={readyItems.length}
            description="Closed or under-review packages requiring attention."
            active={queuePanel === "READY"}
            onClick={() => setQueuePanel("READY")}
          />
          <SummaryCard
            label="Feedback in progress"
            value={openItems.length}
            description="Open cycles still collecting confidential responses."
            active={queuePanel === "OPEN"}
            onClick={() => setQueuePanel("OPEN")}
          />
        </section>

        <section className={panel("p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                {queuePanel === "ALL"
                  ? "Appraisal work queue"
                  : queuePanel === "APPROVAL"
                    ? "Requests awaiting approval"
                    : queuePanel === "READY"
                      ? "Ready for Director review"
                      : "Feedback in progress"}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Select the institutional record below. No reference number is typed manually.
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
                  onStart={() => void startReview(item.cycleId)}
                  onLoad={() => void loadPackage(item.cycleId)}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-sm text-slate-300">
                No record is currently available in this category.
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

        {reviewPackage ? (
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

            {reviewMode === "STAFF" && anonymousResponses ? (
              <StaffEvidence
                data={anonymousResponses}
                level={staffLevel}
                busy={busy}
                onLevel={setStaffLevel}
                onRespondent={(key) => void loadAnonymousResponses(key)}
                onBackHome={() => setReviewMode("HOME")}
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
          No background polling. No combined appraisal score. Anonymous individual staff forms use cycle-scoped Respondent 1…N labels; real Teacher identities are not available to the District Director.
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
