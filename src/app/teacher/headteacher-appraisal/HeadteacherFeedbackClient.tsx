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
import { useEffect, useMemo, useState } from "react";

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
type BusyAction = "ASSIGNMENT" | "LOAD" | "SAVE" | "FINALIZE" | null;

type Answer = {
  score: number | null;
  notApplicable: boolean;
};

type AnswerMap = Record<string, Answer>;

const RATING_LABELS: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Acceptable",
  4: "Good",
  5: "Very Good",
};

const RATING_TONES: Record<number, string> = {
  1: "border-rose-300/35 bg-rose-400/12 text-rose-100",
  2: "border-orange-300/35 bg-orange-400/12 text-orange-100",
  3: "border-amber-300/35 bg-amber-400/12 text-amber-100",
  4: "border-teal-300/35 bg-teal-400/12 text-teal-100",
  5: "border-emerald-300/35 bg-emerald-400/12 text-emerald-100",
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
      return "The section could not be saved. Refresh the page and try again.";
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

function sectionPercentage(
  section: HeadteacherFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  let score = 0;
  let maximum = 0;

  for (const item of section.items) {
    const answer = answerFor(answers, item);
    if (answer.notApplicable || answer.score == null) continue;
    score += answer.score;
    maximum += item.itemMaxScore;
  }

  return maximum > 0 ? Number(((score / maximum) * 100).toFixed(2)) : null;
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

function responseLabel(answer: Answer) {
  if (answer.notApplicable) return "N/A";
  if (answer.score == null) return "Not answered";
  return `${answer.score} — ${RATING_LABELS[answer.score] ?? "Rated"}`;
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
      className={`min-h-12 rounded-2xl border px-2 py-2 text-center text-[12px] font-semibold leading-4 transition disabled:cursor-not-allowed disabled:opacity-55 ${
        props.selected
          ? `${props.tone} ring-2 ring-[#E8C96A]/45`
          : "border-white/10 bg-[#0A1628] text-[#D9DEE8] hover:bg-white/8"
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

export default function HeadteacherFeedbackClient() {
  const [assignment, setAssignment] =
    useState<TeacherHeadteacherAppraisalAssignmentReadState | null>(null);
  const [view, setView] =
    useState<TeacherHeadteacherFeedbackResponseView | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [screen, setScreen] = useState<Screen>("INTRO");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BusyAction>("ASSIGNMENT");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);

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
    ? Math.round((localAnsweredItems / Math.max(1, view.progress.totalItems)) * 100)
    : 0;

  const allLocallyComplete =
    !!view && localAnsweredItems === view.progress.totalItems;

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

    setView(payload.item);
    setAnswers(buildAnswerMap(payload.item));
    setDirtySections(new Set());
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
    // Intentionally load once. No polling or background traffic on weak networks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateAnswer(
    item: HeadteacherFeedbackOfficialFormItem,
    answer: Answer,
  ) {
    if (!view?.canEdit) return;

    setAnswers((current) => ({
      ...current,
      [item.instrumentItemId]: answer,
    }));

    const section = view.officialForm.sections.find((candidate) =>
      candidate.items.some(
        (candidateItem) => candidateItem.instrumentItemId === item.instrumentItemId,
      ),
    );

    if (section) {
      setDirtySections((current) => {
        const next = new Set(current);
        next.add(section.sectionKey);
        return next;
      });
    }

    setNotice(null);
    setError(null);
  }

  async function saveCurrentSection(moveNext: boolean) {
    if (!view || !currentSection || !view.canEdit) return;

    const scores = currentSection.items
      .map((item) => ({ item, answer: answerFor(answers, item) }))
      .filter(({ answer }) => answerIsComplete(answer))
      .map(({ item, answer }) => ({
        itemKey: item.itemKey,
        score: answer.notApplicable ? null : answer.score,
        notApplicable: answer.notApplicable,
      }));

    if (!scores.length) {
      setError("Answer at least one question in this section before saving.");
      return;
    }

    setBusy("SAVE");
    setError(null);
    setNotice(null);

    const payload = await fetchJson<SaveResponse>(
      `/api/teacher/headteacher-appraisal/${encodeURIComponent(
        view.cycleId,
      )}/section`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: currentSection.sectionKey,
          scores,
        }),
      },
    );

    if (!payload.ok) {
      setError(plainError(payload.error));
      setBusy(null);
      return;
    }

    setView((current) =>
      current
        ? {
            ...current,
            participantStatus: payload.result.participantStatus,
            responseStatus:
              payload.result.participantStatus === "FINALIZED"
                ? "FINALIZED"
                : "DRAFT",
            progress: payload.result.progress,
          }
        : current,
    );

    setDirtySections((current) => {
      const next = new Set(current);
      next.delete(currentSection.sectionKey);
      return next;
    });

    setNotice(
      payload.result.outcome === "UNCHANGED"
        ? "This section was already saved."
        : "Section saved safely.",
    );
    setBusy(null);

    if (moveNext && sectionIndex < allSections.length - 1) {
      setSectionIndex((current) => current + 1);
    }
  }

  async function openReview() {
    if (!view) return;

    if (dirtySections.size > 0) {
      setError("Save every changed section before opening final review.");
      return;
    }

    const refreshed = await loadView(view.cycleId);
    if (refreshed) {
      setScreen("REVIEW");
      setConfirmFinal(false);
      setError(null);
    }
  }

  async function finalize() {
    if (!view || !confirmFinal || !view.canFinalize) return;

    setBusy("FINALIZE");
    setError(null);
    setNotice(null);

    const payload = await fetchJson<FinalizeResponse>(
      `/api/teacher/headteacher-appraisal/${encodeURIComponent(
        view.cycleId,
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

    const refreshed = await loadView(view.cycleId);
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
        <button type="button" className={`${primaryButton} mt-5`} onClick={() => void loadAssignment()}>
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
            This card becomes available only after the Headteacher requests an appraisal and the Director opens it, or when the Director opens it directly.
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
        <button type="button" className={`${primaryButton} mt-5`} onClick={() => void loadView(assignment.cycleId!)}>
          Try again
        </button>
      </section>
    );
  }

  const formLocked = !view.canEdit;

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
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100" aria-live="polite">
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
              <p>Choose N/A only when you do not have enough direct knowledge to score an item.</p>
              <p>Save one section at a time. Saved sections survive weak-network interruptions.</p>
              <p>After final submission, the response is locked and cannot be edited.</p>
            </div>

            {formLocked ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/8 p-4 text-sm leading-6 text-amber-50">
                This response is read-only because it has been submitted or the response period has closed.
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={primaryButton}
                onClick={() => setScreen(view.responseStatus === "FINALIZED" ? "REVIEW" : "FORM")}
              >
                {view.responseStatus === "FINALIZED"
                  ? "View submitted response"
                  : view.progress.answeredItems > 0
                    ? "Continue appraisal"
                    : "Start appraisal"}
              </button>
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
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold">
                {sectionAnsweredCount(currentSection, answers)} / {currentSection.items.length}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-3 sm:p-6">
            {currentSection.items.map((item, itemIndex) => {
              const answer = answerFor(answers, item);

              return (
                <fieldset
                  key={item.instrumentItemId}
                  className="rounded-[24px] border border-white/10 bg-[#08182B] p-4 sm:p-5"
                  disabled={formLocked || busy !== null}
                >
                  <legend className="sr-only">{item.itemLabel}</legend>
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E8C96A]/25 bg-[#E8C96A]/10 text-xs font-black text-[#F5D97D]">
                      {itemIndex + 1}
                    </div>
                    <p className="pt-1 text-sm font-semibold leading-6 text-[#F7F4ED]">
                      {item.itemLabel}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
                      tone="border-sky-300/35 bg-sky-400/12 text-sky-100"
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
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className={secondaryButton}
                disabled={busy !== null || sectionIndex === 0}
                onClick={() => setSectionIndex((current) => Math.max(0, current - 1))}
              >
                Previous section
              </button>

              {!formLocked ? (
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy !== null}
                  onClick={() => void saveCurrentSection(false)}
                >
                  {busy === "SAVE" ? "Saving…" : "Save section"}
                </button>
              ) : null}

              {!formLocked && sectionIndex < allSections.length - 1 ? (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy !== null}
                  onClick={() => void saveCurrentSection(true)}
                >
                  Save &amp; next
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy !== null || dirtySections.size > 0}
                  onClick={() => void openReview()}
                >
                  Review all answers
                </button>
              )}
            </div>

            {dirtySections.has(currentSection.sectionKey) ? (
              <p className="mt-3 text-xs font-semibold text-amber-100">
                Unsaved changes in this section.
              </p>
            ) : (
              <p className="mt-3 text-xs text-[#AAB3C2]">
                Sections save only when you press a save button. There is no background data use.
              </p>
            )}
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
                  Check every response
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold">
                Overall {percentageLabel(overallPercentage(allSections, answers))}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {allSections.map((section) => (
                <details
                  key={section.sectionKey}
                  className="rounded-2xl border border-white/10 bg-[#08182B] p-4"
                  open={!section.items.every((item) => answerIsComplete(answerFor(answers, item)))}
                >
                  <summary className="cursor-pointer list-none font-bold">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{section.sectionTitle}</span>
                      <span className="text-xs text-[#C9CDD6]">
                        {sectionAnsweredCount(section, answers)} / {section.items.length} · {percentageLabel(sectionPercentage(section, answers))}
                      </span>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <div key={item.instrumentItemId} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                        <p className="text-sm leading-6 text-[#E5E8EE]">{item.itemLabel}</p>
                        <p className="mt-1 text-xs font-bold text-[#F5D97D]">
                          {responseLabel(answerFor(answers, item))}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
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
                    I have reviewed my answers. I understand that final submission locks this response and it cannot be edited.
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
                  {busy === "FINALIZE" ? "Submitting…" : "Submit final response"}
                </button>
              ) : null}
            </div>

            {!allLocallyComplete && view.responseStatus !== "FINALIZED" ? (
              <p className="mt-3 text-xs font-semibold text-amber-100">
                Some questions are unanswered. Return to the form and answer each one or choose N/A.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
