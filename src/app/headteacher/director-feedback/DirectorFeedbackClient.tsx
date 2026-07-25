// src/app/headteacher/director-feedback/DirectorFeedbackClient.tsx
"use client";

import type {
  DirectorFeedbackAssignmentSummary,
  DirectorFeedbackOfficialFormItem,
  DirectorFeedbackOfficialFormSection,
  DirectorFeedbackResponseView,
  FinalizeDirectorFeedbackResponseResult,
  SaveDirectorFeedbackSectionResult,
} from "@/lib/appraisals/directorFeedbackResponse";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ListResponse =
  | {
      ok: true;
      reqId: string;
      items: DirectorFeedbackAssignmentSummary[];
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
      item: DirectorFeedbackResponseView;
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
      result: SaveDirectorFeedbackSectionResult;
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
      result: FinalizeDirectorFeedbackResponseResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
      details?: Record<string, unknown>;
    };

type Screen = "LIST" | "INTRO" | "FORM" | "REVIEW";
type BusyAction = "LIST" | "LOAD" | "SAVE" | "FINALIZE" | null;

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
    headers,
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (payload) return payload;

  return {
    ok: false,
    error: "INVALID_SERVER_RESPONSE",
  } as T;
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

function plainError(code: string | null | undefined) {
  switch (code) {
    case "UNAUTHORIZED":
      return "Your session has expired. Sign in again.";
    case "DIRECTOR_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND":
      return "This feedback exercise is not assigned to you.";
    case "DIRECTOR_FEEDBACK_RESPONSE_WINDOW_CLOSED":
      return "The response period has closed. Your saved answers remain protected.";
    case "DIRECTOR_FEEDBACK_RESPONSE_PARTICIPATION_EXPIRED":
      return "Your response period has expired.";
    case "DIRECTOR_FEEDBACK_RESPONSE_PARTICIPATION_REVOKED":
      return "This feedback assignment is no longer active.";
    case "DIRECTOR_FEEDBACK_RESPONSE_ALREADY_FINALIZED":
      return "This response has already been submitted and cannot be changed.";
    case "DIRECTOR_FEEDBACK_RESPONSE_INCOMPLETE":
      return "Answer every question or mark it N/A before final submission.";
    case "CONTENT_TYPE_MUST_BE_JSON":
    case "INVALID_JSON_BODY":
    case "INVALID_SECTION_SCORES":
      return "The form could not be saved. Refresh the page and try again.";
    case "FINAL_SUBMISSION_CONFIRMATION_REQUIRED":
      return "Please confirm that you are ready to submit.";
    default:
      return "The request could not be completed. Check your connection and try again.";
  }
}

function percentageLabel(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function buildAnswerMap(view: DirectorFeedbackResponseView): AnswerMap {
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
  item: DirectorFeedbackOfficialFormItem,
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
  section: DirectorFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  return section.items.filter((item) =>
    answerIsComplete(answerFor(answers, item)),
  ).length;
}

function sectionPercentage(
  section: DirectorFeedbackOfficialFormSection,
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
  sections: DirectorFeedbackOfficialFormSection[],
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

function assignmentAction(item: DirectorFeedbackAssignmentSummary) {
  if (item.responseStatus === "FINALIZED") return "View submitted response";
  if (item.completionPercentage > 0) return "Continue feedback";
  return "Start feedback";
}

function statusLabel(item: DirectorFeedbackAssignmentSummary) {
  if (item.responseStatus === "FINALIZED") return "Submitted";
  if (!item.canContinue) return "Closed";
  if (item.completionPercentage > 0) return "In progress";
  return "Not started";
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
  confidentiality?: DirectorFeedbackResponseView["confidentiality"];
}) {
  const contract = props.confidentiality;

  const confidentialityIsSafe =
    !contract ||
    (contract.directorCanSeeIdentity === false &&
      contract.schoolIdentityShownToDirector === false &&
      contract.freeTextCommentsAllowed === false &&
      contract.identityAccessRole === "SUPERADMIN");

  if (!confidentialityIsSafe) {
    return (
      <div className="rounded-[24px] border border-rose-300/25 bg-rose-400/10 p-4">
        <div className="text-sm font-bold text-rose-100">
          Privacy protection could not be verified
        </div>
        <p className="mt-2 text-[13px] leading-6 text-rose-50">
          Do not continue with this feedback. Refresh the page or contact
          EduLife OS support.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/8 p-4">
      <div className="text-sm font-bold text-emerald-100">
        Your identity is protected
      </div>

      <div className="mt-2 space-y-2 text-[13px] leading-6 text-[#D9F4EA]">
        <p>
          The Director will not see your name, school, or exact submission time.
        </p>

        <p>
          Your response will appear only as a masked respondent after the cycle
          closes.
        </p>

        <p>
          Only Superadmin may exceptionally inspect identity for an audited
          accountability, legal, or support reason.
        </p>
      </div>
    </div>
  );
}

export default function DirectorFeedbackClient() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("LIST");
  const [assignments, setAssignments] = useState<
    DirectorFeedbackAssignmentSummary[]
  >([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [view, setView] = useState<DirectorFeedbackResponseView | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BusyAction>("LIST");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [online, setOnline] = useState(true);

  const currentSection =
    view?.officialForm.sections[sectionIndex] ?? null;

  const totalAnswered = useMemo(() => {
    if (!view) return 0;
    return view.officialForm.sections.reduce(
      (sum, section) => sum + sectionAnsweredCount(section, answers),
      0,
    );
  }, [answers, view]);

  const totalItems = view?.progress.totalItems ?? 0;
  const clientCompletion =
    totalItems > 0 ? Math.round((totalAnswered / totalItems) * 100) : 0;
  const allAnswered = totalItems > 0 && totalAnswered === totalItems;
  const hasUnsavedWork = dirtySections.size > 0;

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork]);

  useEffect(() => {
    void loadAssignments();
  }, []);

  async function loadAssignments() {
    setBusy("LIST");
    setError(null);

    try {
      const payload = await fetchJson<ListResponse>(
        "/api/headteacher/director-feedback",
      );

      if (!payload.ok) {
        setError(plainError(payload.error));
        return;
      }

      setAssignments(payload.items);
    } catch {
      setError("The feedback list could not load. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function openAssignment(cycleId: string) {
    setBusy("LOAD");
    setError(null);
    setNotice(null);
    setSelectedCycleId(cycleId);

    try {
      const payload = await fetchJson<LoadResponse>(
        `/api/headteacher/director-feedback/${encodeURIComponent(cycleId)}`,
      );

      if (!payload.ok) {
        setError(plainError(payload.error));
        return;
      }

      setView(payload.item);
      setAnswers(buildAnswerMap(payload.item));
      setDirtySections(new Set());
      setConfirmFinal(false);
      setSectionIndex(
        Math.max(
          0,
          payload.item.progress.sections.findIndex(
            (section) => !section.complete,
          ),
        ),
      );

      setScreen(
        payload.item.responseStatus === "FINALIZED" ? "REVIEW" : "INTRO",
      );
    } catch {
      setError("The official feedback form could not load.");
    } finally {
      setBusy(null);
    }
  }

  function changeAnswer(
    sectionKey: string,
    item: DirectorFeedbackOfficialFormItem,
    next: Answer,
  ) {
    if (!view?.canEdit) return;

    setAnswers((current) => ({
      ...current,
      [item.instrumentItemId]: next,
    }));

    setDirtySections((current) => {
      const nextSet = new Set(current);
      nextSet.add(sectionKey);
      return nextSet;
    });

    setError(null);
    setNotice(null);
  }

  async function saveCurrentSection(advance: boolean) {
    if (!view || !currentSection || !view.canEdit) return;

    const answered = sectionAnsweredCount(currentSection, answers);

    if (advance && answered !== currentSection.items.length) {
      setError(
        `Complete all ${currentSection.items.length} questions in this section, or use “Save for later”.`,
      );
      return;
    }

    if (!online) {
      setError("You are offline. Reconnect before saving.");
      return;
    }

    setBusy("SAVE");
    setError(null);
    setNotice(null);

    try {
      const payload = await fetchJson<SaveResponse>(
        `/api/headteacher/director-feedback/${encodeURIComponent(
          view.cycleId,
        )}/section`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sectionKey: currentSection.sectionKey,
            scores: currentSection.items.map((item) => {
              const answer = answerFor(answers, item);
              return {
                itemKey: item.itemKey,
                score: answer.score,
                notApplicable: answer.notApplicable,
              };
            }),
          }),
        },
      );

      if (!payload.ok) {
        setError(plainError(payload.error));
        return;
      }

      setView((current) => {
        if (!current) return current;

        return {
          ...current,
          responseId: payload.result.responseId,
          responseStatus: "DRAFT",
          participantStatus: payload.result.participantStatus,
          progress: payload.result.progress,
          officialForm: {
            ...current.officialForm,
            sections: current.officialForm.sections.map((section) =>
              section.sectionKey !== currentSection.sectionKey
                ? section
                : {
                    ...section,
                    percentage: sectionPercentage(section, answers),
                    items: section.items.map((item) => {
                      const answer = answerFor(answers, item);
                      return {
                        ...item,
                        score: answer.score,
                        notApplicable: answer.notApplicable,
                        answered: answerIsComplete(answer),
                      };
                    }),
                  },
            ),
          },
        };
      });

      setDirtySections((current) => {
        const nextSet = new Set(current);
        nextSet.delete(currentSection.sectionKey);
        return nextSet;
      });

      setNotice(
        payload.result.outcome === "UNCHANGED"
          ? "This section was already saved."
          : "Section saved safely.",
      );

      if (advance) {
        const nextIndex = sectionIndex + 1;
        if (nextIndex < view.officialForm.sections.length) {
          setSectionIndex(nextIndex);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setScreen("REVIEW");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    } catch {
      setError(
        "The section could not be saved. Your earlier saved sections are still safe.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function openReview() {
    if (!view) return;

    const dirtySection = view.officialForm.sections.find((section) =>
      dirtySections.has(section.sectionKey),
    );

    if (dirtySection) {
      const index = view.officialForm.sections.findIndex(
        (section) => section.sectionKey === dirtySection.sectionKey,
      );
      setSectionIndex(Math.max(0, index));
      setScreen("FORM");
      setError("Save your latest changes before opening the final review.");
      return;
    }

    setError(null);
    setNotice(null);
    setScreen("REVIEW");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finalizeResponse() {
    if (!view) return;

    if (!allAnswered) {
      setError("Answer every question or mark it N/A before final submission.");
      return;
    }

    if (!confirmFinal) {
      setError("Tick the confirmation box before submitting.");
      return;
    }

    if (!online) {
      setError("You are offline. Reconnect before submitting.");
      return;
    }

    setBusy("FINALIZE");
    setError(null);
    setNotice(null);

    try {
      const payload = await fetchJson<FinalizeResponse>(
        `/api/headteacher/director-feedback/${encodeURIComponent(
          view.cycleId,
        )}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        },
      );

      if (!payload.ok) {
        setError(plainError(payload.error));
        return;
      }

      const refreshed = await fetchJson<LoadResponse>(
        `/api/headteacher/director-feedback/${encodeURIComponent(
          view.cycleId,
        )}`,
      );

      if (refreshed.ok) {
        setView(refreshed.item);
        setAnswers(buildAnswerMap(refreshed.item));
      } else {
        setView((current) =>
          current
            ? {
                ...current,
                responseStatus: "FINALIZED",
                participantStatus: "FINALIZED",
                canEdit: false,
                canFinalize: false,
                progress: payload.result.progress,
                officialForm: {
                  ...current.officialForm,
                  overallPercentage: payload.result.overallPercentage,
                  sections: current.officialForm.sections.map((section) => ({
                    ...section,
                    percentage:
                      payload.result.sectionPercentages[section.sectionKey] ??
                      sectionPercentage(section, answers),
                  })),
                },
              }
            : current,
        );
      }

      setDirtySections(new Set());
      setConfirmFinal(false);
      setNotice(
        payload.result.outcome === "EXISTING_FINALIZED"
          ? "This response had already been submitted safely."
          : "Your confidential response has been submitted.",
      );

      setAssignments((current) =>
        current.map((item) =>
          item.cycleId === view.cycleId
            ? {
                ...item,
                responseStatus: "FINALIZED",
                participantStatus: "FINALIZED",
                canContinue: false,
                completionPercentage: 100,
              }
            : item,
        ),
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(
        "Final submission could not be confirmed. Do not submit again until your connection returns; the system safely handles repeated submissions.",
      );
    } finally {
      setBusy(null);
    }
  }

  function returnToList() {
    if (hasUnsavedWork) {
      const leave = window.confirm(
        "You have unsaved changes. Leave this form and lose only those unsaved changes?",
      );
      if (!leave) return;
    }

    setScreen("LIST");
    setSelectedCycleId(null);
    setView(null);
    setAnswers({});
    setDirtySections(new Set());
    setError(null);
    setNotice(null);
    setConfirmFinal(false);
    void loadAssignments();
  }

  function editSection(index: number) {
    if (!view?.canEdit) return;
    setSectionIndex(index);
    setScreen("FORM");
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (screen === "LIST") {
    return (
      <div className="space-y-5">
        <header className={panelClass("overflow-hidden p-5 sm:p-7")}>
          <div className="relative">
            <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full bg-[#D4AF37]/12 blur-3xl" />
            <div className="relative">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
                Headteacher • Confidential feedback
              </div>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                Director Leadership Feedback
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                Use the official seven-section form to give honest, protected
                feedback on the Municipal Director’s work.
              </p>
            </div>
          </div>
        </header>

        {!online ? (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            You are offline. Reconnect to load or save feedback.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <ConfidentialityCard />

        <section className={panelClass("p-4 sm:p-5")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Your assigned feedback</h2>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                Open one exercise at a time. Saved sections remain available
                after refresh.
              </p>
            </div>

            <button
              type="button"
              className={secondaryButton}
              disabled={busy === "LIST"}
              onClick={() => void loadAssignments()}
            >
              {busy === "LIST" ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {busy === "LIST" && assignments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4 text-sm text-[#C9CDD6]">
                Loading your assigned feedback…
              </div>
            ) : assignments.length ? (
              assignments.map((item) => (
                <article
                  key={item.cycleId}
                  className="rounded-[24px] border border-white/10 bg-[#0A1628] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8F98A8]">
                        {statusLabel(item)}
                      </div>
                      <h3 className="mt-1 text-lg font-bold">
                        {item.directorName ?? "Municipal Director"}
                      </h3>
                      <p className="mt-1 text-sm text-[#C9CDD6]">
                        {item.jurisdictionName}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left sm:text-right">
                      <div className="text-[11px] text-[#8F98A8]">Deadline</div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {formatDate(item.deadlineAt)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[12px]">
                      <span className="text-[#C9CDD6]">Progress</span>
                      <span className="font-bold text-[#F7F4ED]">
                        {item.completionPercentage}%
                      </span>
                    </div>
                    <ProgressBar percentage={item.completionPercentage} />
                  </div>

                  <button
                    type="button"
                    className={`${primaryButton} mt-4`}
                    disabled={busy === "LOAD"}
                    onClick={() => void openAssignment(item.cycleId)}
                  >
                    {busy === "LOAD" && selectedCycleId === item.cycleId
                      ? "Opening…"
                      : assignmentAction(item)}
                  </button>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-5 text-center">
                <div className="text-base font-bold">No feedback assigned</div>
                <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
                  A new exercise will appear here when the Director or
                  Superadmin opens one.
                </p>
              </div>
            )}
          </div>
        </section>

        <button
          type="button"
          className={secondaryButton}
          onClick={() => router.push("/headteacher/dashboard")}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!view) {
    return (
      <div className={panelClass("p-5")}>
        <div className="text-lg font-bold">Feedback form unavailable</div>
        <p className="mt-2 text-sm text-[#C9CDD6]">
          Return to the list and open the exercise again.
        </p>
        <button type="button" className={`${primaryButton} mt-4`} onClick={returnToList}>
          Return to feedback list
        </button>
      </div>
    );
  }

  if (screen === "INTRO") {
    return (
      <div className="space-y-5">
        <header className={panelClass("p-5 sm:p-7")}>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
            Before you begin
          </div>
          <h1 className="mt-2 text-2xl font-bold">
            Confidential feedback on {view.officialForm.directorName ?? "the Municipal Director"}
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
            Answer all 35 official questions honestly. Use N/A only when you do
            not have enough knowledge to make a fair judgment.
          </p>
        </header>

        <ConfidentialityCard confidentiality={view.confidentiality} />

        <section className={panelClass("p-5")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4">
              <div className="text-[11px] uppercase tracking-[0.15em] text-[#8F98A8]">
                Form
              </div>
              <div className="mt-2 text-xl font-bold">7 sections</div>
              <div className="mt-1 text-sm text-[#C9CDD6]">35 questions</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4">
              <div className="text-[11px] uppercase tracking-[0.15em] text-[#8F98A8]">
                Saved progress
              </div>
              <div className="mt-2 text-xl font-bold">
                {view.progress.completionPercentage}%
              </div>
              <div className="mt-1 text-sm text-[#C9CDD6]">
                {view.progress.answeredItems} of {view.progress.totalItems} answered
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4">
              <div className="text-[11px] uppercase tracking-[0.15em] text-[#8F98A8]">
                Deadline
              </div>
              <div className="mt-2 text-base font-bold">
                {formatDate(view.deadlineAt)}
              </div>
              <div className="mt-1 text-sm text-[#C9CDD6]">Seven-day window</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-sm leading-6 text-cyan-50">
            Work one section at a time. Tap “Save for later” when the network is
            weak, or “Save and continue” after completing the section.
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className={primaryButton}
              onClick={() => setScreen("FORM")}
            >
              {view.progress.answeredItems > 0 ? "Continue feedback" : "Begin feedback"}
            </button>
            <button type="button" className={secondaryButton} onClick={returnToList}>
              Back
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (screen === "FORM" && currentSection) {
    const answeredCount = sectionAnsweredCount(currentSection, answers);
    const sectionComplete = answeredCount === currentSection.items.length;

    return (
      <div className="space-y-4 pb-28 sm:pb-6">
        <header className={panelClass("p-4 sm:p-6")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
                Section {currentSection.sectionOrder} of{" "}
                {view.officialForm.sections.length}
              </div>
              <h1 className="mt-2 text-xl font-bold sm:text-2xl">
                {currentSection.sectionTitle}
              </h1>
              {currentSection.description ? (
                <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
                  {currentSection.description}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1628] px-4 py-3">
              <div className="text-[11px] text-[#8F98A8]">This section</div>
              <div className="mt-1 text-lg font-bold">
                {answeredCount}/{currentSection.items.length}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <ProgressBar percentage={clientCompletion} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#C9CDD6]">
              <span>{totalAnswered} of {totalItems} questions answered</span>
              <span>{clientCompletion}% complete</span>
            </div>
          </div>
        </header>

        {!online ? (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            You are offline. Choose answers if needed, but reconnect before saving.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}

        <section className="space-y-4">
          {currentSection.items.map((item, itemIndex) => {
            const answer = answerFor(answers, item);

            return (
              <article
                key={item.instrumentItemId}
                className={panelClass("p-4 sm:p-5")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 text-sm font-bold text-[#E8C96A]">
                    {itemIndex + 1}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#8F98A8]">
                      Question {item.itemKey}
                    </div>
                    <h2 className="mt-1 text-[15px] font-semibold leading-7 text-[#F7F4ED]">
                      {item.itemLabel}
                    </h2>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {view.officialForm.scale.allowNotApplicable ? (
                    <RatingButton
                      selected={answer.notApplicable}
                      disabled={!view.canEdit || busy === "SAVE"}
                      label="N/A"
                      tone="border-slate-300/35 bg-slate-400/12 text-slate-100"
                      onClick={() =>
                        changeAnswer(currentSection.sectionKey, item, {
                          score: null,
                          notApplicable: true,
                        })
                      }
                    />
                  ) : null}

                  {Array.from(
                    {
                      length:
                        view.officialForm.scale.maximum -
                        view.officialForm.scale.minimum +
                        1,
                    },
                    (_, offset) =>
                      view.officialForm.scale.minimum + offset,
                  ).map((score) => (
                    <RatingButton
                      key={score}
                      selected={!answer.notApplicable && answer.score === score}
                      disabled={!view.canEdit || busy === "SAVE"}
                      label={`${score} ${RATING_LABELS[score] ?? ""}`}
                      tone={RATING_TONES[score] ?? RATING_TONES[3]}
                      onClick={() =>
                        changeAnswer(currentSection.sectionKey, item, {
                          score,
                          notApplicable: false,
                        })
                      }
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#06101F]/95 p-3 backdrop-blur-xl sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className={secondaryButton}
              disabled={!view.canEdit || busy === "SAVE"}
              onClick={() => void saveCurrentSection(false)}
            >
              {busy === "SAVE" ? "Saving…" : "Save for later"}
            </button>

            <button
              type="button"
              className={primaryButton}
              disabled={!view.canEdit || busy === "SAVE"}
              onClick={() => void saveCurrentSection(true)}
            >
              {busy === "SAVE"
                ? "Saving…"
                : sectionIndex + 1 < view.officialForm.sections.length
                  ? "Save and continue"
                  : "Save and review"}
            </button>

            <button
              type="button"
              className={secondaryButton}
              disabled={busy === "SAVE"}
              onClick={() => void openReview()}
            >
              Review answers
            </button>
          </div>

          {!sectionComplete ? (
            <p className="mx-auto mt-2 max-w-6xl text-[11px] text-[#C9CDD6]">
              {currentSection.items.length - answeredCount} question(s) remain in
              this section.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const reviewOverall = overallPercentage(
    view.officialForm.sections,
    answers,
  );
  const finalized = view.responseStatus === "FINALIZED";

  return (
    <div className="space-y-5">
      <header className={panelClass("p-5 sm:p-7")}>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
          {finalized ? "Submitted confidential response" : "Review answers"}
        </div>
        <h1 className="mt-2 text-2xl font-bold">
          Complete official form preview
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
          Read every section exactly as it will be stored. Return to any section
          to correct an answer before final submission.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-300 bg-white text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="border-b-2 border-slate-900 px-4 py-5 text-center sm:px-8">
          <div className="text-sm font-black uppercase tracking-[0.12em]">
            {view.officialForm.jurisdictionName}
          </div>
          <div className="mt-2 text-xl font-black uppercase">
            {view.officialForm.documentTitle}
          </div>
          <div className="mt-3 grid gap-2 text-left text-sm sm:grid-cols-2">
            <div className="border-b border-slate-500 py-1">
              <span className="font-bold">Director:</span>{" "}
              {view.officialForm.directorName ?? "Municipal Director"}
            </div>
            <div className="border-b border-slate-500 py-1">
              <span className="font-bold">Respondent:</span> Confidential
            </div>
          </div>
        </div>

        <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-xs leading-5 sm:px-8">
          Rating scale: N/A, 1 Very Poor, 2 Poor, 3 Acceptable, 4 Good,
          5 Very Good.
        </div>

        <div className="divide-y-2 divide-slate-900">
          {view.officialForm.sections.map((section, index) => {
            const percent = finalized
              ? section.percentage
              : sectionPercentage(section, answers);
            const answered = sectionAnsweredCount(section, answers);

            return (
              <section key={section.sectionKey}>
                <div className="flex flex-col gap-2 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                      Section {section.sectionOrder}
                    </div>
                    <h2 className="mt-1 text-sm font-black uppercase sm:text-base">
                      {section.sectionTitle}
                    </h2>
                  </div>
                  <div className="text-sm font-bold">
                    {percentageLabel(percent)}
                  </div>
                </div>

                <div className="divide-y divide-slate-300">
                  {section.items.map((item) => {
                    const answer = answerFor(answers, item);

                    return (
                      <div
                        key={item.instrumentItemId}
                        className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_180px] sm:items-center sm:px-8"
                      >
                        <div className="leading-6">
                          <span className="mr-2 font-black">{item.itemKey}</span>
                          {item.itemLabel}
                        </div>
                        <div
                          className={`rounded-xl border px-3 py-2 text-center font-bold ${
                            answerIsComplete(answer)
                              ? "border-slate-400 bg-slate-100"
                              : "border-rose-400 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {responseLabel(answer)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t border-slate-400 bg-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <div className="font-bold">
                    Answered {answered} of {section.items.length}
                  </div>
                  {!finalized && view.canEdit ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-slate-500 bg-white px-4 py-2 font-bold"
                      onClick={() => editSection(index)}
                    >
                      Edit Section {section.sectionOrder}
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <div className="grid gap-2 border-t-2 border-slate-900 bg-slate-100 px-4 py-5 text-sm sm:grid-cols-2 sm:px-8">
          <div className="font-black">Overall percentage</div>
          <div className="text-left text-xl font-black sm:text-right">
            {percentageLabel(
              finalized ? view.officialForm.overallPercentage : reviewOverall,
            )}
          </div>
        </div>
      </section>

      {!finalized ? (
        <section className={panelClass("p-5")}>
          <div className="flex items-start gap-3">
            <input
              id="confirm-final-director-feedback"
              type="checkbox"
              checked={confirmFinal}
              onChange={(event) => setConfirmFinal(event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-white/20 bg-[#0A1628]"
            />
            <label
              htmlFor="confirm-final-director-feedback"
              className="text-sm leading-6 text-[#F7F4ED]"
            >
              I have reviewed the complete official form. I understand that
              final submission cannot be edited afterward.
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className={primaryButton}
              disabled={
                busy === "FINALIZE" ||
                !allAnswered ||
                !confirmFinal ||
                !view.canEdit
              }
              onClick={() => void finalizeResponse()}
            >
              {busy === "FINALIZE"
                ? "Submitting securely…"
                : "Submit confidential response"}
            </button>

            <button
              type="button"
              className={secondaryButton}
              disabled={busy === "FINALIZE"}
              onClick={() => editSection(0)}
            >
              Return to sections
            </button>

            <button
              type="button"
              className={secondaryButton}
              disabled={busy === "FINALIZE"}
              onClick={returnToList}
            >
              Save and leave
            </button>
          </div>

          {!allAnswered ? (
            <p className="mt-3 text-sm text-amber-100">
              {totalItems - totalAnswered} question(s) remain unanswered.
            </p>
          ) : null}
        </section>
      ) : (
        <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-400/10 p-5">
          <h2 className="text-lg font-bold text-emerald-100">
            Response submitted successfully
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#D9F4EA]">
            Your response is now read-only. The Director will see it only as a
            masked confidential respondent after the cycle closes and the
            anonymity threshold is met.
          </p>

          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={returnToList}
          >
            Return to feedback list
          </button>
        </section>
      )}
    </div>
  );
}
