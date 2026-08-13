// src/app/teacher/headteacher-appraisal/HeadteacherFeedbackClient.tsx
"use client";

import type {
  FinalizeTeacherHeadteacherFeedbackResponseResult,
  HeadteacherFeedbackOfficialFormItem,
  HeadteacherFeedbackOfficialFormSection,
  SaveTeacherHeadteacherFeedbackSectionResult,
  TeacherHeadteacherFeedbackResponseView,
} from "@/lib/appraisals/headteacherFeedbackResponse";
import type { TeacherHeadteacherAppraisalAssignmentReadState } from "@/lib/appraisals/headteacherFeedbackReadStates";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type AssignmentResponse =
  | {
      ok: true;
      reqId: string;
      state: TeacherHeadteacherAppraisalAssignmentReadState;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      details?: Record<string, unknown>;
    };

type LoadResponse =
  | {
      ok: true;
      reqId: string;
      item: TeacherHeadteacherFeedbackResponseView;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      details?: Record<string, unknown>;
    };

type SaveResponse =
  | {
      ok: true;
      reqId: string;
      result: SaveTeacherHeadteacherFeedbackSectionResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      details?: Record<string, unknown>;
    };

type FinalizeResponse =
  | {
      ok: true;
      reqId: string;
      result: FinalizeTeacherHeadteacherFeedbackResponseResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      details?: Record<string, unknown>;
    };

type Screen = "INTRO" | "FORM" | "REVIEW";
type BusyAction = "ASSIGNMENT" | "LOAD" | "FINALIZE" | null;
type AutosaveStatus = "IDLE" | "PENDING" | "SAVING" | "SAVED" | "ERROR";

type Answer = {
  score: number | null;
  notApplicable: boolean;
};

type AnswerMap = Record<string, Answer>;

const AUTOSAVE_DELAY_MS = 650;

const RATING_LABELS: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Acceptable",
  4: "Good",
  5: "Very Good",
};

const RATING_TONES: Record<number, string> = {
  1: "border-rose-300/45 bg-rose-400/15 text-rose-50",
  2: "border-orange-300/45 bg-orange-400/15 text-orange-50",
  3: "border-amber-300/45 bg-amber-400/15 text-amber-50",
  4: "border-teal-300/45 bg-teal-400/15 text-teal-50",
  5: "border-emerald-300/45 bg-emerald-400/15 text-emerald-50",
};

const primaryButton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-sm font-bold text-[#071A3D] shadow-[0_16px_40px_rgba(212,175,55,0.20)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto";
const secondaryButton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto";

function panelClass(extra = "") {
  return `rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] shadow-[0_18px_60px_rgba(0,0,0,0.22)] ${extra}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers,
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (payload) return payload;

  return {
    ok: false,
    error: "INVALID_SERVER_RESPONSE",
  } as T;
}

function plainError(code: string | null | undefined) {
  switch (code) {
    case "UNAUTHORIZED":
      return "Your session has expired. Sign in again.";
    case "FORBIDDEN":
    case "HEADTEACHER_FEEDBACK_RESPONSE_TEACHER_ONLY":
      return "Only an assigned teacher may use this form.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND":
      return "This Headteacher appraisal is not assigned to you.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_WINDOW_CLOSED":
      return "The response period has closed. Your saved answers remain protected.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPATION_EXPIRED":
      return "Your response period has expired.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPATION_REVOKED":
      return "This appraisal assignment is no longer active.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_ALREADY_FINALIZED":
      return "This response has already been submitted and cannot be changed.";
    case "HEADTEACHER_FEEDBACK_RESPONSE_INCOMPLETE":
      return "Answer every question or mark it N/A before final submission.";
    case "CONTENT_TYPE_MUST_BE_JSON":
    case "INVALID_JSON_BODY":
    case "INVALID_SECTION_SCORES":
      return "Your latest answer was not saved. Check your connection and retry.";
    case "FINAL_SUBMISSION_CONFIRMATION_REQUIRED":
      return "Confirm that you are ready before final submission.";
    default:
      return "The request could not be completed. Check your connection and try again.";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function percentageLabel(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function buildAnswerMap(view: TeacherHeadteacherFeedbackResponseView): AnswerMap {
  const result: AnswerMap = {};

  for (const section of view.officialForm.sections) {
    for (const item of section.items) {
      result[item.instrumentItemId] = {
        score: item.score,
        notApplicable: item.notApplicable,
      };
    }
  }

  return result;
}

function answerFor(
  answers: AnswerMap,
  item: HeadteacherFeedbackOfficialFormItem,
): Answer {
  return (
    answers[item.instrumentItemId] ?? {
      score: item.score,
      notApplicable: item.notApplicable,
    }
  );
}

function answerIsComplete(answer: Answer) {
  return answer.notApplicable || answer.score != null;
}

function sectionAnsweredCount(
  section: HeadteacherFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  return section.items.filter((item) =>
    answerIsComplete(answerFor(answers, item)),
  ).length;
}

function sectionScoreSummary(
  section: HeadteacherFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  let score = 0;
  let maximum = 0;
  let notApplicable = 0;

  for (const item of section.items) {
    const answer = answerFor(answers, item);

    if (answer.notApplicable) {
      notApplicable += 1;
      continue;
    }

    if (answer.score == null) continue;

    score += answer.score;
    maximum += item.itemMaxScore;
  }

  return {
    score,
    maximum,
    notApplicable,
    percentage:
      maximum > 0 ? Number(((score / maximum) * 100).toFixed(2)) : null,
  };
}

function sectionPercentage(
  section: HeadteacherFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  return sectionScoreSummary(section, answers).percentage;
}

function overallPercentage(
  sections: HeadteacherFeedbackOfficialFormSection[],
  answers: AnswerMap,
) {
  const values = sections
    .map((section) => sectionPercentage(section, answers))
    .filter((value): value is number => value != null);

  if (!values.length) return null;

  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function ProgressBar({ percentage }: { percentage: number }) {
  const safe = Math.max(0, Math.min(100, percentage));

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-white/8"
      aria-label={`${safe}% complete`}
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#57D6C4)] transition-[width]"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function RatingButton(props: {
  selected: boolean;
  disabled: boolean;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={`min-h-16 rounded-2xl border px-3 py-3 text-center text-sm font-bold leading-5 transition disabled:cursor-not-allowed disabled:opacity-55 ${
        props.selected
          ? `${props.tone} ring-2 ring-[#F5D97D]/60 shadow-[0_10px_30px_rgba(0,0,0,0.18)]`
          : "border-white/12 bg-[#0A1628] text-[#E6EAF1] hover:border-white/25 hover:bg-white/8"
      }`}
    >
      {props.label}
    </button>
  );
}

function ConfidentialityCard(props: {
  confidentiality: TeacherHeadteacherFeedbackResponseView["confidentiality"];
}) {
  const contract = props.confidentiality;
  const safe =
    contract.headteacherCanSeeIdentity === false &&
    contract.directorCanSeeIdentity === false &&
    contract.directorReceivesCycleScopedAnonymousLabelsOnly === true &&
    contract.realIdentityAudience === "SUPERADMIN_ONLY" &&
    contract.superadminIdentityAccessRequiresSeparateAuthorizedAudit === true &&
    contract.freeTextCommentsAllowed === false;

  if (!safe) {
    return (
      <div className="rounded-[24px] border border-rose-300/25 bg-rose-400/10 p-4">
        <div className="text-sm font-bold text-rose-100">
          Privacy protection could not be verified
        </div>
        <p className="mt-2 text-[13px] leading-6 text-rose-50">
          Do not continue. Refresh the page or contact EduLife OS support.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/8 p-4">
      <div className="text-sm font-bold text-emerald-100">
        Confidential staff feedback
      </div>
      <p className="mt-2 text-[13px] leading-6 text-[#D9F4EA]">
        {contract.notice}
      </p>
    </div>
  );
}

function selectedReviewCellClass(
  answer: Answer,
  value: "NA" | 1 | 2 | 3 | 4 | 5,
) {
  const selected =
    value === "NA"
      ? answer.notApplicable
      : !answer.notApplicable && answer.score === value;

  if (!selected) return "bg-white text-slate-300";

  switch (value) {
    case "NA":
      return "bg-sky-100 text-sky-950";
    case 1:
      return "bg-rose-100 text-rose-950";
    case 2:
      return "bg-orange-100 text-orange-950";
    case 3:
      return "bg-amber-100 text-amber-950";
    case 4:
      return "bg-teal-100 text-teal-950";
    case 5:
      return "bg-emerald-100 text-emerald-950";
  }
}

function NativeFinalReview(props: {
  view: TeacherHeadteacherFeedbackResponseView;
  answers: AnswerMap;
}) {
  const sections = props.view.officialForm.sections;
  const overall = overallPercentage(sections, props.answers);

  return (
    <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-[#020817] p-2 sm:p-4">
      <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_22px_70px_rgba(0,0,0,0.35)]">
        <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">
            Confidential staff feedback · native final review
          </p>
          <h3 className="mt-2 text-xl font-black uppercase">
            {props.view.officialForm.documentTitle}
          </h3>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
            Your selected answers · read-only review copy
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-300 text-sm">
          <div className="grid grid-cols-[190px_1fr] border-r border-slate-300">
            <div className="border-r border-slate-300 bg-slate-100 px-4 py-3 font-black uppercase">
              Name of school
            </div>
            <div className="px-4 py-3 font-semibold">
              {props.view.officialForm.schoolName}
            </div>
          </div>
          <div className="grid grid-cols-[190px_1fr]">
            <div className="border-r border-slate-300 bg-slate-100 px-4 py-3 font-black uppercase">
              Name of circuit
            </div>
            <div className="px-4 py-3 font-semibold">
              {props.view.officialForm.circuitName ?? "Not included"}
            </div>
          </div>
          <div className="grid grid-cols-[190px_1fr] border-r border-t border-slate-300">
            <div className="border-r border-slate-300 bg-slate-100 px-4 py-3 font-black uppercase">
              Headteacher
            </div>
            <div className="px-4 py-3 font-semibold">
              {props.view.officialForm.headteacherName ?? "Not included"}
            </div>
          </div>
          <div className="grid grid-cols-[190px_1fr] border-t border-slate-300">
            <div className="border-r border-slate-300 bg-slate-100 px-4 py-3 font-black uppercase">
              Response window
            </div>
            <div className="px-4 py-3 font-semibold">
              {formatDate(props.view.openedAt)} – {formatDate(props.view.deadlineAt)}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="w-20 border-b border-r border-slate-300 px-3 py-3 text-center font-black">
                S/N
              </th>
              <th className="border-b border-r border-slate-300 px-4 py-3 text-left font-black">
                Behavioural competence
                <span className="ml-2 text-xs font-semibold text-slate-600">
                  1—Very Poor · 2—Poor · 3—Acceptable · 4—Good · 5—Very Good
                </span>
              </th>
              {["N/A", "1", "2", "3", "4", "5"].map((heading) => (
                <th
                  key={heading}
                  className="w-14 border-b border-r border-slate-300 px-2 py-3 text-center font-black last:border-r-0"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sections.map((section) => {
              const summary = sectionScoreSummary(section, props.answers);

              return (
                <Fragment key={section.sectionKey}>
                  <tr className="bg-[#294563] text-white">
                    <td className="border-r border-white/20 px-3 py-3 text-center font-black">
                      {section.sectionOrder}.0
                    </td>
                    <td colSpan={7} className="px-4 py-3 font-black uppercase">
                      {section.sectionTitle}
                    </td>
                  </tr>

                  {section.items.map((item) => {
                    const answer = answerFor(props.answers, item);

                    return (
                      <tr key={item.instrumentItemId}>
                        <td className="border-b border-r border-slate-300 px-3 py-3 text-center font-bold">
                          {item.itemKey}
                        </td>
                        <td className="border-b border-r border-slate-300 px-4 py-3 font-medium leading-6">
                          {item.itemLabel}
                        </td>
                        {(["NA", 1, 2, 3, 4, 5] as const).map((value) => {
                          const selected =
                            value === "NA"
                              ? answer.notApplicable
                              : !answer.notApplicable && answer.score === value;

                          return (
                            <td
                              key={value}
                              className={`border-b border-r border-slate-300 px-2 py-3 text-center text-xl font-black last:border-r-0 ${selectedReviewCellClass(
                                answer,
                                value,
                              )}`}
                            >
                              {selected ? "✓" : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  <tr className="bg-slate-50">
                    <td
                      colSpan={2}
                      className="border-b border-r border-slate-300 px-4 py-3 text-right font-black uppercase"
                    >
                      Section total
                    </td>
                    <td
                      colSpan={3}
                      className="border-b border-r border-slate-300 px-4 py-3 text-center font-bold"
                    >
                      {summary.score} / {summary.maximum}
                    </td>
                    <td
                      colSpan={3}
                      className="border-b border-slate-300 px-4 py-3 text-center font-black"
                    >
                      {percentageLabel(summary.percentage)}
                      {summary.notApplicable > 0
                        ? ` · ${summary.notApplicable} N/A excluded`
                        : ""}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_280px] border-t-2 border-slate-900 bg-slate-100">
          <div className="px-5 py-4 text-right text-sm font-black uppercase">
            Overall average of four section percentages
          </div>
          <div className="border-l-2 border-slate-900 px-5 py-4 text-center text-xl font-black">
            {percentageLabel(overall)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AutosaveNotice(props: {
  status: AutosaveStatus;
  dirty: boolean;
  disabled: boolean;
  onRetry: () => void;
}) {
  if (props.status === "ERROR") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-rose-100">
          Not saved. Check your connection, then retry.
        </p>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-rose-200/30 bg-rose-100/10 px-4 py-2 text-sm font-black text-rose-50"
          disabled={props.disabled}
          onClick={props.onRetry}
        >
          Retry save
        </button>
      </div>
    );
  }

  const text =
    props.status === "SAVING"
      ? "Saving securely…"
      : props.status === "PENDING" || props.dirty
        ? "Waiting a moment to save your latest answer…"
        : props.status === "SAVED"
          ? "Saved automatically."
          : "Automatic saving is on. Each answer is saved after you select it.";

  return (
    <div
      className="rounded-2xl border border-emerald-300/18 bg-emerald-400/7 px-4 py-3 text-sm font-semibold text-emerald-50"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

export default function HeadteacherFeedbackClient() {
  const [assignment, setAssignment] =
    useState<TeacherHeadteacherAppraisalAssignmentReadState | null>(null);
  const [view, setView] =
    useState<TeacherHeadteacherFeedbackResponseView | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [screen, setScreen] = useState<Screen>("INTRO");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());
  const [autosaveStates, setAutosaveStates] = useState<
    Record<string, AutosaveStatus>
  >({});
  const [busy, setBusy] = useState<BusyAction>("ASSIGNMENT");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);

  const answersRef = useRef<AnswerMap>({});
  const viewRef = useRef<TeacherHeadteacherFeedbackResponseView | null>(null);
  const dirtySectionsRef = useRef<Set<string>>(new Set());
  const autosaveTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const autosaveChainsRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const sectionVersionsRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  const currentSection = view?.officialForm.sections[sectionIndex] ?? null;
  const allSections = view?.officialForm.sections ?? [];

  const localAnsweredItems = useMemo(() => {
    if (!view) return 0;
    return view.officialForm.sections.reduce(
      (sum, section) => sum + sectionAnsweredCount(section, answers),
      0,
    );
  }, [answers, view]);

  const localCompletionPercentage = view
    ? Math.round(
        (localAnsweredItems / Math.max(1, view.progress.totalItems)) * 100,
      )
    : 0;

  const allLocallyComplete =
    !!view && localAnsweredItems === view.progress.totalItems;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    const autosaveTimers = autosaveTimersRef.current;

    return () => {
      mountedRef.current = false;
      for (const timer of autosaveTimers.values()) {
        clearTimeout(timer);
      }
      autosaveTimers.clear();
    };
  }, []);

  function replaceDirtySections(next: Set<string>) {
    dirtySectionsRef.current = next;
    if (mountedRef.current) setDirtySections(next);
  }

  function setSectionAutosaveStatus(
    sectionKey: string,
    status: AutosaveStatus,
  ) {
    if (!mountedRef.current) return;

    setAutosaveStates((current) => ({
      ...current,
      [sectionKey]: status,
    }));
  }

  function clearAutosaveTimers() {
    for (const timer of autosaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    autosaveTimersRef.current.clear();
  }

  function resetLocalResponseState(item: TeacherHeadteacherFeedbackResponseView) {
    clearAutosaveTimers();
    const nextAnswers = buildAnswerMap(item);
    answersRef.current = nextAnswers;
    viewRef.current = item;
    dirtySectionsRef.current = new Set();
    sectionVersionsRef.current.clear();
    setView(item);
    setAnswers(nextAnswers);
    setDirtySections(new Set());
    setAutosaveStates({});
  }

  async function loadView(cycleId: string) {
    setBusy("LOAD");
    const payload = await fetchJson<LoadResponse>(
      `/api/teacher/headteacher-appraisal/${encodeURIComponent(cycleId)}`,
    );

    if (!payload.ok) {
      setError(plainError(payload.error));
      setBusy(null);
      return null;
    }

    resetLocalResponseState(payload.item);
    setBusy(null);
    return payload.item;
  }

  async function loadAssignment() {
    setBusy("ASSIGNMENT");
    setError(null);

    const payload = await fetchJson<AssignmentResponse>(
      "/api/teacher/headteacher-appraisal",
    );

    if (!payload.ok) {
      setError(plainError(payload.error));
      setBusy(null);
      return;
    }

    setAssignment(payload.state);

    if (payload.state.cycleId) {
      const item = await loadView(payload.state.cycleId);
      if (item?.responseStatus === "FINALIZED") setScreen("REVIEW");
    } else {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadAssignment();
    // Load once only. Autosave is answer-triggered; there is no polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sectionScores(
    section: HeadteacherFeedbackOfficialFormSection,
    snapshot: AnswerMap,
  ) {
    return section.items
      .map((item) => ({ item, answer: answerFor(snapshot, item) }))
      .filter(({ answer }) => answerIsComplete(answer))
      .map(({ item, answer }) => ({
        itemKey: item.itemKey,
        score: answer.notApplicable ? null : answer.score,
        notApplicable: answer.notApplicable,
      }));
  }

  async function performSectionAutosave(
    sectionKey: string,
    version: number,
  ): Promise<boolean> {
    const activeView = viewRef.current;
    if (!activeView?.canEdit) return false;

    const section = activeView.officialForm.sections.find(
      (candidate) => candidate.sectionKey === sectionKey,
    );
    if (!section) return false;

    const scores = sectionScores(section, answersRef.current);
    if (!scores.length) return true;

    setSectionAutosaveStatus(sectionKey, "SAVING");
    setError(null);

    const payload = await fetchJson<SaveResponse>(
      `/api/teacher/headteacher-appraisal/${encodeURIComponent(
        activeView.cycleId,
      )}/section`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey,
          scores,
        }),
      },
    );

    if (!payload.ok) {
      setSectionAutosaveStatus(sectionKey, "ERROR");
      setError(plainError(payload.error));
      return false;
    }

    if (mountedRef.current) {
      setView((current) => {
        if (!current) return current;

        const next = {
          ...current,
          participantStatus: payload.result.participantStatus,
          responseStatus:
            payload.result.participantStatus === "FINALIZED"
              ? ("FINALIZED" as const)
              : ("DRAFT" as const),
          progress: payload.result.progress,
        };
        viewRef.current = next;
        return next;
      });
    }

    const latestVersion = sectionVersionsRef.current.get(sectionKey) ?? 0;

    if (latestVersion === version) {
      const nextDirty = new Set(dirtySectionsRef.current);
      nextDirty.delete(sectionKey);
      replaceDirtySections(nextDirty);
      setSectionAutosaveStatus(sectionKey, "SAVED");
      setNotice("Your latest answers were saved automatically.");
    } else {
      setSectionAutosaveStatus(sectionKey, "PENDING");
    }

    return true;
  }

  function queueSectionAutosave(
    sectionKey: string,
    version: number,
  ): Promise<boolean> {
    const previous =
      autosaveChainsRef.current.get(sectionKey) ?? Promise.resolve(true);

    const next = previous
      .catch(() => false)
      .then(() => performSectionAutosave(sectionKey, version));

    autosaveChainsRef.current.set(sectionKey, next);

    void next.then(
      () => {
        if (autosaveChainsRef.current.get(sectionKey) === next) {
          autosaveChainsRef.current.delete(sectionKey);
        }
      },
      () => {
        if (autosaveChainsRef.current.get(sectionKey) === next) {
          autosaveChainsRef.current.delete(sectionKey);
        }
      },
    );

    return next;
  }

  function scheduleSectionAutosave(
    sectionKey: string,
    delay = AUTOSAVE_DELAY_MS,
  ) {
    const existing = autosaveTimersRef.current.get(sectionKey);
    if (existing) clearTimeout(existing);

    setSectionAutosaveStatus(sectionKey, "PENDING");

    const timer = setTimeout(() => {
      autosaveTimersRef.current.delete(sectionKey);
      const version = sectionVersionsRef.current.get(sectionKey) ?? 0;
      void queueSectionAutosave(sectionKey, version);
    }, delay);

    autosaveTimersRef.current.set(sectionKey, timer);
  }

  async function saveSectionNow(sectionKey: string) {
    const timer = autosaveTimersRef.current.get(sectionKey);
    if (timer) {
      clearTimeout(timer);
      autosaveTimersRef.current.delete(sectionKey);
    }

    const version = sectionVersionsRef.current.get(sectionKey) ?? 0;
    return queueSectionAutosave(sectionKey, version);
  }

  async function flushPendingAutosaves() {
    const keys = [...dirtySectionsRef.current];

    const results = await Promise.all(
      keys.map((sectionKey) => saveSectionNow(sectionKey)),
    );

    const outstanding = [...autosaveChainsRef.current.values()];
    if (outstanding.length) await Promise.all(outstanding);

    return (
      results.every(Boolean) &&
      dirtySectionsRef.current.size === 0
    );
  }

  function updateAnswer(
    item: HeadteacherFeedbackOfficialFormItem,
    answer: Answer,
  ) {
    const activeView = viewRef.current;
    if (!activeView?.canEdit || busy !== null) return;

    const nextAnswers = {
      ...answersRef.current,
      [item.instrumentItemId]: answer,
    };

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);

    const section = activeView.officialForm.sections.find((candidate) =>
      candidate.items.some(
        (candidateItem) =>
          candidateItem.instrumentItemId === item.instrumentItemId,
      ),
    );

    if (section) {
      const nextDirty = new Set(dirtySectionsRef.current);
      nextDirty.add(section.sectionKey);
      replaceDirtySections(nextDirty);

      const nextVersion =
        (sectionVersionsRef.current.get(section.sectionKey) ?? 0) + 1;
      sectionVersionsRef.current.set(section.sectionKey, nextVersion);
      scheduleSectionAutosave(section.sectionKey);
    }

    setNotice(null);
    setError(null);
  }

  async function openReview() {
    const activeView = viewRef.current;
    if (!activeView) return;

    if (!allLocallyComplete) {
      setError(
        "Answer every question or choose N/A before opening final review.",
      );
      return;
    }

    setBusy("LOAD");
    setError(null);
    setNotice("Checking that every answer is safely saved…");

    const saved = await flushPendingAutosaves();
    if (!saved) {
      setBusy(null);
      setNotice(null);
      setError(
        "At least one answer is not saved yet. Retry the failed save before final review.",
      );
      return;
    }

    const refreshed = await loadView(activeView.cycleId);
    if (!refreshed) return;

    if (
      refreshed.progress.missingItemKeys.length > 0 ||
      !refreshed.canFinalize
    ) {
      setError(
        "Some answers have not reached the server yet. Return to the form and retry.",
      );
      return;
    }

    setScreen("REVIEW");
    setConfirmFinal(false);
    setNotice("All 34 answers are saved. Review the native form before submitting.");
    setError(null);
  }

  async function finalize() {
    const activeView = viewRef.current;
    if (!activeView || !confirmFinal || !activeView.canFinalize) return;

    setBusy("FINALIZE");
    setError(null);
    setNotice(null);

    const payload = await fetchJson<FinalizeResponse>(
      `/api/teacher/headteacher-appraisal/${encodeURIComponent(
        activeView.cycleId,
      )}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    );

    if (!payload.ok) {
      setError(plainError(payload.error));
      setBusy(null);
      return;
    }

    const refreshed = await loadView(activeView.cycleId);
    if (refreshed) {
      setAssignment((current) =>
        current
          ? {
              ...current,
              state: "SUBMITTED_READ_ONLY",
              label: "Submitted / read-only",
              assignmentActive: false,
              readOnly: true,
              participantStatus: "FINALIZED",
              finalizedAt: payload.result.finalizedAt,
            }
          : current,
      );
      setNotice("Your confidential response has been submitted and locked.");
      setConfirmFinal(false);
      setScreen("REVIEW");
    }

    setBusy(null);
  }

  if (busy === "ASSIGNMENT" && !assignment) {
    return (
      <section className={panelClass("p-5 sm:p-7")}>
        <p className="text-sm text-[#C9CDD6]">Loading your assignment…</p>
      </section>
    );
  }

  if (!assignment) {
    return (
      <section className={panelClass("p-5 sm:p-7")}>
        <h1 className="text-2xl font-black">Headteacher Appraisal</h1>
        <p className="mt-3 text-sm leading-6 text-[#C9CDD6]">
          {error ?? "Your assignment could not be loaded."}
        </p>
        <button
          type="button"
          className={`${primaryButton} mt-5`}
          onClick={() => void loadAssignment()}
        >
          Try again
        </button>
      </section>
    );
  }

  if (!assignment.cycleId) {
    return (
      <div className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8C96A]">
              Teacher workspace
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              Headteacher Appraisal
            </h1>
          </div>
          <Link href="/teacher/dashboard" className={secondaryButton}>
            Back to dashboard
          </Link>
        </header>

        <section className={panelClass("p-5 sm:p-7")}>
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-[#D9DEE8]">
            {assignment.label}
          </div>
          <h2 className="mt-4 text-xl font-black">No active assignment</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
            This card becomes available only after the Headteacher requests an
            appraisal and the Director opens it, or when the Director opens it
            directly.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
            Teachers cannot start a Headteacher appraisal themselves.
          </p>
        </section>
      </div>
    );
  }

  if (!view) {
    return (
      <section className={panelClass("p-5 sm:p-7")}>
        <h1 className="text-2xl font-black">Headteacher Appraisal</h1>
        <p className="mt-3 text-sm leading-6 text-[#C9CDD6]">
          {error ?? "Loading the official form…"}
        </p>
        <button
          type="button"
          className={`${primaryButton} mt-5`}
          onClick={() => void loadView(assignment.cycleId!)}
        >
          Try again
        </button>
      </section>
    );
  }

  const formLocked = !view.canEdit;
  const deadlineExpiredWhileOpen =
    assignment.state === "CLOSED" &&
    assignment.cycleStatus === "OPEN" &&
    (assignment.participantStatus === "NOT_STARTED" ||
      assignment.participantStatus === "IN_PROGRESS");
  const currentAutosaveStatus = currentSection
    ? (autosaveStates[currentSection.sectionKey] ?? "IDLE")
    : "IDLE";

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8C96A]">
            Teacher workspace
          </p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">
            Headteacher Appraisal
          </h1>
          <p className="mt-2 text-sm text-[#C9CDD6]">
            {assignment.schoolName ?? view.officialForm.schoolName}
          </p>
        </div>
        <Link href="/teacher/dashboard" className={secondaryButton}>
          Back to dashboard
        </Link>
      </header>

      <section className={panelClass("p-4 sm:p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#AAB3C2]">
              Progress
            </p>
            <p className="mt-1 text-lg font-black">
              {localAnsweredItems} of {view.progress.totalItems} answered
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold">
            {assignment.label}
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar percentage={localCompletionPercentage} />
        </div>
        <div className="mt-3 grid gap-2 text-xs text-[#C9CDD6] sm:grid-cols-2">
          <p>Opened: {formatDate(view.openedAt)}</p>
          <p>Deadline: {formatDate(view.deadlineAt)}</p>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          className="rounded-2xl border border-emerald-300/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100"
          aria-live="polite"
        >
          {notice}
        </div>
      ) : null}

      {screen === "INTRO" ? (
        <div className="space-y-4">
          <ConfidentialityCard confidentiality={view.confidentiality} />

          <section className={panelClass("p-5 sm:p-7")}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
              Before you begin
            </p>
            <h2 className="mt-2 text-xl font-black">
              Give fair, evidence-based feedback
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-[#D9DEE8]">
              <p>Answer all four sections using 1 to 5.</p>
              <p>
                Choose N/A only when you do not have enough direct knowledge to
                score an item.
              </p>
              <p>
                Automatic saving is on. Each answer is saved securely after you
                select it.
              </p>
              <p>
                After final submission, the response is locked and cannot be
                edited.
              </p>
            </div>

            {formLocked ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/8 p-4 text-sm leading-6 text-amber-50">
                {deadlineExpiredWhileOpen
                  ? "The response window has ended. Wait for the Director to extend the feedback period, then refresh availability. Your saved answers remain protected."
                  : "This response is read-only because it has been submitted or the response period has closed."}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {view.responseStatus === "FINALIZED" ? (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => setScreen("REVIEW")}
                >
                  View submitted response
                </button>
              ) : deadlineExpiredWhileOpen ? (
                <>
                  <button
                    type="button"
                    className={primaryButton}
                    disabled
                  >
                    Response window closed
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy !== null}
                    onClick={() => void loadAssignment()}
                  >
                    Refresh availability
                  </button>
                </>
              ) : formLocked ? (
                <button
                  type="button"
                  className={primaryButton}
                  disabled
                >
                  Read-only
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => setScreen("FORM")}
                >
                  {view.progress.answeredItems > 0
                    ? "Continue appraisal"
                    : "Start appraisal"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {screen === "FORM" && currentSection ? (
        <section className={panelClass("overflow-hidden")}>
          <div className="border-b border-white/10 bg-white/[0.025] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
                  Section {sectionIndex + 1} of {allSections.length}
                </p>
                <h2 className="mt-2 text-xl font-black sm:text-2xl">
                  {currentSection.sectionTitle}
                </h2>
                {currentSection.description ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                    {currentSection.description}
                  </p>
                ) : null}
              </div>
              <div className="rounded-full border border-[#E8C96A]/35 bg-[#E8C96A]/12 px-4 py-2 text-sm font-black text-[#F5D97D]">
                {sectionAnsweredCount(currentSection, answers)} /{" "}
                {currentSection.items.length}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-3 sm:p-6">
            {currentSection.items.map((item) => {
              const answer = answerFor(answers, item);

              return (
                <fieldset
                  key={item.instrumentItemId}
                  className="rounded-[24px] border border-white/10 bg-[#08182B] p-4 sm:p-5"
                  disabled={formLocked || busy !== null}
                >
                  <legend className="sr-only">{item.itemLabel}</legend>
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#E8C96A]/40 bg-[#E8C96A]/12 px-2 text-base font-black text-[#F5D97D] shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                      {item.itemKey}
                    </div>
                    <p className="pt-1 text-base font-bold leading-7 text-[#F7F4ED] sm:text-[17px]">
                      {item.itemLabel}
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <RatingButton
                        key={score}
                        selected={!answer.notApplicable && answer.score === score}
                        disabled={formLocked || busy !== null}
                        label={`${score} · ${RATING_LABELS[score]}`}
                        tone={RATING_TONES[score]}
                        onClick={() =>
                          updateAnswer(item, {
                            score,
                            notApplicable: false,
                          })
                        }
                      />
                    ))}
                    <RatingButton
                      selected={answer.notApplicable}
                      disabled={formLocked || busy !== null}
                      label="N/A · Not enough knowledge"
                      tone="border-sky-300/45 bg-sky-400/15 text-sky-50"
                      onClick={() =>
                        updateAnswer(item, {
                          score: null,
                          notApplicable: true,
                        })
                      }
                    />
                  </div>
                </fieldset>
              );
            })}
          </div>

          <div className="border-t border-white/10 bg-[#071426] p-4 sm:p-6">
            {!formLocked ? (
              <AutosaveNotice
                status={currentAutosaveStatus}
                dirty={dirtySections.has(currentSection.sectionKey)}
                disabled={busy !== null}
                onRetry={() => void saveSectionNow(currentSection.sectionKey)}
              />
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className={secondaryButton}
                disabled={busy !== null || sectionIndex === 0}
                onClick={() =>
                  setSectionIndex((current) => Math.max(0, current - 1))
                }
              >
                Previous section
              </button>

              {sectionIndex < allSections.length - 1 ? (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy !== null}
                  onClick={() =>
                    setSectionIndex((current) =>
                      Math.min(allSections.length - 1, current + 1),
                    )
                  }
                >
                  Next section
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy !== null || !allLocallyComplete}
                  onClick={() => void openReview()}
                >
                  {busy === "LOAD"
                    ? "Checking saved answers…"
                    : "Review all answers"}
                </button>
              )}
            </div>

            <p className="mt-3 text-xs leading-5 text-[#AAB3C2]">
              No polling is used. Network activity happens only after you choose
              an answer, retry a failed save, load the form, or submit it.
            </p>
          </div>
        </section>
      ) : null}

      {screen === "REVIEW" ? (
        <div className="space-y-4">
          <ConfidentialityCard confidentiality={view.confidentiality} />

          <section className={panelClass("p-4 sm:p-6")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
                  Final review
                </p>
                <h2 className="mt-2 text-xl font-black sm:text-2xl">
                  Review Before you Submit
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                  Your 34 selected answers are shown on the official form below.
                  Scroll sideways on a phone to inspect every score column.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black">
                Overall{" "}
                {percentageLabel(overallPercentage(allSections, answers))}
              </div>
            </div>

            <div className="mt-5">
              <NativeFinalReview view={view} answers={answers} />
            </div>

            {view.responseStatus !== "FINALIZED" ? (
              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/8 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-amber-50">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-white/20 bg-[#071426]"
                    checked={confirmFinal}
                    onChange={(event) => setConfirmFinal(event.target.checked)}
                  />
                  <span>
                    I have reviewed my answers. I understand that final
                    submission locks this response and it cannot be edited.
                  </span>
                </label>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/8 p-4 text-sm leading-6 text-emerald-50">
                Submitted. This confidential response is now read-only.
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {view.responseStatus !== "FINALIZED" ? (
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy !== null}
                  onClick={() => setScreen("FORM")}
                >
                  Return to form
                </button>
              ) : null}

              {view.responseStatus !== "FINALIZED" ? (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={
                    busy !== null ||
                    !confirmFinal ||
                    !allLocallyComplete ||
                    !view.canFinalize
                  }
                  onClick={() => void finalize()}
                >
                  {busy === "FINALIZE"
                    ? "Submitting…"
                    : "Submit final response"}
                </button>
              ) : null}
            </div>

            {!allLocallyComplete && view.responseStatus !== "FINALIZED" ? (
              <p className="mt-3 text-xs font-semibold text-amber-100">
                Some questions are unanswered. Return to the form and answer
                each one or choose N/A.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
