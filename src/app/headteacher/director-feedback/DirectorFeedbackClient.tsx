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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
type BusyAction = "LIST" | "LOAD" | "FINALIZE" | null;

type Answer = {
  score: number | null;
  notApplicable: boolean;
};

type AnswerMap = Record<string, Answer>;

type AutosaveState = "idle" | "queued" | "saving" | "saved" | "waiting";

type SectionSaveScore = {
  itemKey: string;
  score: number | null;
  notApplicable: boolean;
};

type PendingSectionSave = {
  sectionKey: string;
  scores: SectionSaveScore[];
  signature: string;
};

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
    : `${Math.round(Math.max(0, Math.min(100, value)))}%`;
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

function sectionSaveSignature(scores: SectionSaveScore[]) {
  return JSON.stringify(scores);
}

function sectionAnsweredCount(
  section: DirectorFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  return section.items.filter((item) =>
    answerIsComplete(answerFor(answers, item)),
  ).length;
}

type LiveSectionScore = {
  rawScore: number;
  applicableMaximum: number;
  answeredItems: number;
  notApplicableItems: number;
  complete: boolean;
  percentage: number | null;
};

function sectionScoreSummary(
  section: DirectorFeedbackOfficialFormSection,
  answers: AnswerMap,
): LiveSectionScore {
  let rawScore = 0;
  let applicableMaximum = section.items.reduce(
    (sum, item) => sum + item.itemMaxScore,
    0,
  );
  let answeredItems = 0;
  let notApplicableItems = 0;

  for (const item of section.items) {
    const answer = answerFor(answers, item);
    if (!answerIsComplete(answer)) continue;

    answeredItems += 1;
    if (answer.notApplicable) {
      notApplicableItems += 1;
      applicableMaximum -= item.itemMaxScore;
      continue;
    }

    if (answer.score != null) rawScore += answer.score;
  }

  return {
    rawScore,
    applicableMaximum,
    answeredItems,
    notApplicableItems,
    complete: answeredItems === section.items.length,
    percentage:
      applicableMaximum > 0
        ? Number(((rawScore / applicableMaximum) * 100).toFixed(2))
        : null,
  };
}

function sectionPercentage(
  section: DirectorFeedbackOfficialFormSection,
  answers: AnswerMap,
) {
  return sectionScoreSummary(section, answers).percentage;
}

function totalRawScore(
  sections: DirectorFeedbackOfficialFormSection[],
  answers: AnswerMap,
) {
  return sections.reduce(
    (total, section) => {
      const score = sectionScoreSummary(section, answers);
      return {
        rawScore: total.rawScore + score.rawScore,
        applicableMaximum:
          total.applicableMaximum + score.applicableMaximum,
      };
    },
    { rawScore: 0, applicableMaximum: 0 },
  );
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

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function nativeScoreTone(
  score: number | null | undefined,
  notApplicable: boolean,
) {
  if (notApplicable) return "bg-slate-200 text-slate-900";
  switch (score) {
    case 1:
      return "bg-rose-100 text-rose-950";
    case 2:
      return "bg-orange-100 text-orange-950";
    case 3:
      return "bg-amber-100 text-amber-950";
    case 4:
      return "bg-cyan-100 text-cyan-950";
    case 5:
      return "bg-emerald-100 text-emerald-950";
    default:
      return "bg-white text-slate-700";
  }
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
      className={`min-h-14 rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-5 transition disabled:cursor-not-allowed disabled:opacity-55 sm:text-base sm:leading-6 ${
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
  const [busy, setBusy] = useState<BusyAction>("LIST");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [online, setOnline] = useState(true);
  const [autosaveState, setAutosaveState] =
    useState<AutosaveState>("idle");

  const viewRef = useRef<DirectorFeedbackResponseView | null>(null);
  const answersRef = useRef<AnswerMap>({});
  const pendingSectionSavesRef = useRef(
    new Map<string, PendingSectionSave>(),
  );
  const savedSectionSignaturesRef = useRef(new Map<string, string>());
  const autosaveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const autosaveRunningRef = useRef(false);
  const sectionAnchorRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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
      if (
        pendingSectionSavesRef.current.size === 0 &&
        !autosaveRunningRef.current
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

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

      const nextAnswers = buildAnswerMap(payload.item);
      const nextSavedSignatures = new Map<string, string>();

      for (const section of payload.item.officialForm.sections) {
        const scores: SectionSaveScore[] = section.items.flatMap((item) =>
          item.answered
            ? [
                {
                  itemKey: item.itemKey,
                  score: item.notApplicable ? null : item.score,
                  notApplicable: item.notApplicable,
                },
              ]
            : [],
        );
        if (scores.length > 0) {
          nextSavedSignatures.set(
            section.sectionKey,
            sectionSaveSignature(scores),
          );
        }
      }

      viewRef.current = payload.item;
      answersRef.current = nextAnswers;
      pendingSectionSavesRef.current.clear();
      savedSectionSignaturesRef.current = nextSavedSignatures;
      setView(payload.item);
      setAnswers(nextAnswers);
      setAutosaveState(nextSavedSignatures.size > 0 ? "saved" : "idle");
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

  const processAutosaveQueue = useCallback(async () => {
    const activeView = viewRef.current;
    if (!activeView || autosaveRunningRef.current) return;

    autosaveRunningRef.current = true;
    try {
      while (pendingSectionSavesRef.current.size > 0) {
        const entry = pendingSectionSavesRef.current.entries().next().value as
          | [string, PendingSectionSave]
          | undefined;
        if (!entry) break;

        const [sectionKey, pending] = entry;
        if (
          savedSectionSignaturesRef.current.get(sectionKey) ===
          pending.signature
        ) {
          pendingSectionSavesRef.current.delete(sectionKey);
          continue;
        }

        setAutosaveState("saving");
        setError(null);

        try {
          const payload = await fetchJson<SaveResponse>(
            `/api/headteacher/director-feedback/${encodeURIComponent(
              activeView.cycleId,
            )}/section`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sectionKey: pending.sectionKey,
                scores: pending.scores,
              }),
            },
          );

          if (!payload.ok) {
            throw new Error(plainError(payload.error));
          }

          savedSectionSignaturesRef.current.set(
            sectionKey,
            pending.signature,
          );

          const latest = pendingSectionSavesRef.current.get(sectionKey);
          if (latest?.signature === pending.signature) {
            pendingSectionSavesRef.current.delete(sectionKey);
          }

          setView((current) => {
            if (!current) return current;
            const nextView = {
              ...current,
              responseId: payload.result.responseId,
              responseStatus: "DRAFT" as const,
              participantStatus: payload.result.participantStatus,
              progress: payload.result.progress,
            };
            viewRef.current = nextView;
            return nextView;
          });

          setNotice("Saved securely.");
          setAutosaveState(
            pendingSectionSavesRef.current.size > 0 ? "queued" : "saved",
          );
        } catch (saveError) {
          setAutosaveState("waiting");
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Autosave is waiting for the connection. Keep this page open.",
          );

          if (retryTimerRef.current != null) {
            window.clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void processAutosaveQueue();
          }, 5000);
          break;
        }
      }
    } finally {
      autosaveRunningRef.current = false;
    }
  }, []);

  const queueSectionAutosave = useCallback(
    (sectionKey: string, nextAnswers: AnswerMap, delay = 1200) => {
      const activeView = viewRef.current;
      const section = activeView?.officialForm.sections.find(
        (candidate) => candidate.sectionKey === sectionKey,
      );

      if (!section || activeView?.canEdit !== true) return;

      const scores = section.items.flatMap((item) => {
        const answer = nextAnswers[item.instrumentItemId];
        if (!answer || !answerIsComplete(answer)) return [];
        return [
          {
            itemKey: item.itemKey,
            score: answer.notApplicable ? null : answer.score,
            notApplicable: answer.notApplicable,
          },
        ];
      });

      if (!scores.length) return;

      pendingSectionSavesRef.current.set(sectionKey, {
        sectionKey,
        scores,
        signature: sectionSaveSignature(scores),
      });
      setAutosaveState("queued");
      setNotice(null);

      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = window.setTimeout(() => {
        autosaveTimerRef.current = null;
        void processAutosaveQueue();
      }, delay);
    },
    [processAutosaveQueue],
  );

  useEffect(() => {
    const retryWhenOnline = () => {
      setOnline(true);
      if (pendingSectionSavesRef.current.size > 0) {
        void processAutosaveQueue();
      }
    };

    const markOffline = () => {
      setOnline(false);
      if (pendingSectionSavesRef.current.size > 0) {
        setAutosaveState("waiting");
      }
    };

    window.addEventListener("online", retryWhenOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", retryWhenOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [processAutosaveQueue]);

  function changeAnswer(
    sectionKey: string,
    item: DirectorFeedbackOfficialFormItem,
    next: Answer,
  ) {
    if (!viewRef.current?.canEdit) return;

    const nextAnswers = {
      ...answersRef.current,
      [item.instrumentItemId]: next,
    };

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setError(null);
    setNotice(null);
    queueSectionAutosave(sectionKey, nextAnswers);
  }

  function scrollToCurrentSection() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        sectionAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  function goToSection(nextIndex: number) {
    if (!viewRef.current) return;

    const bounded = Math.max(
      0,
      Math.min(viewRef.current.officialForm.sections.length - 1, nextIndex),
    );

    if (currentSection) {
      queueSectionAutosave(
        currentSection.sectionKey,
        answersRef.current,
        0,
      );
    }

    setSectionIndex(bounded);
    setError(null);
    setNotice(null);
    scrollToCurrentSection();
  }

  async function openReview() {
    const activeView = viewRef.current;
    if (!activeView) return;

    for (const section of activeView.officialForm.sections) {
      queueSectionAutosave(section.sectionKey, answersRef.current, 0);
    }

    await processAutosaveQueue();

    if (pendingSectionSavesRef.current.size > 0) {
      setAutosaveState("waiting");
      setError(
        "Some answers are still waiting for the connection. Keep this page open and try review again after autosave completes.",
      );
      return;
    }

    setBusy("LOAD");
    setError(null);
    setNotice(null);

    try {
      const payload = await fetchJson<LoadResponse>(
        `/api/headteacher/director-feedback/${encodeURIComponent(
          activeView.cycleId,
        )}`,
      );

      if (!payload.ok) {
        setError(plainError(payload.error));
        return;
      }

      const nextAnswers = buildAnswerMap(payload.item);
      const nextSavedSignatures = new Map<string, string>();
      for (const section of payload.item.officialForm.sections) {
        const scores: SectionSaveScore[] = section.items.flatMap((item) =>
          item.answered
            ? [
                {
                  itemKey: item.itemKey,
                  score: item.notApplicable ? null : item.score,
                  notApplicable: item.notApplicable,
                },
              ]
            : [],
        );
        if (scores.length > 0) {
          nextSavedSignatures.set(
            section.sectionKey,
            sectionSaveSignature(scores),
          );
        }
      }

      viewRef.current = payload.item;
      answersRef.current = nextAnswers;
      savedSectionSignaturesRef.current = nextSavedSignatures;
      setView(payload.item);
      setAnswers(nextAnswers);
      setAutosaveState("saved");
      setScreen("REVIEW");
      setNotice(
        "All answers are saved. Review the complete official form before submitting.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("The saved official form could not be reloaded for review.");
    } finally {
      setBusy(null);
    }
  }

  async function finalizeResponse() {
    if (!view) return;

    if (
      pendingSectionSavesRef.current.size > 0 ||
      autosaveRunningRef.current
    ) {
      setError("Wait for autosave to finish before final submission.");
      return;
    }

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
        const nextAnswers = buildAnswerMap(refreshed.item);
        viewRef.current = refreshed.item;
        answersRef.current = nextAnswers;
        setView(refreshed.item);
        setAnswers(nextAnswers);
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

      pendingSectionSavesRef.current.clear();
      setAutosaveState("saved");
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
    if (
      pendingSectionSavesRef.current.size > 0 ||
      autosaveRunningRef.current
    ) {
      const leave = window.confirm(
        "Recent answers are still waiting to save. Leave now and lose only those unsaved changes?",
      );
      if (!leave) return;
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    pendingSectionSavesRef.current.clear();
    savedSectionSignaturesRef.current.clear();
    autosaveRunningRef.current = false;
    viewRef.current = null;
    answersRef.current = {};

    setScreen("LIST");
    setSelectedCycleId(null);
    setView(null);
    setAnswers({});
    setAutosaveState("idle");
    setError(null);
    setNotice(null);
    setConfirmFinal(false);
    void loadAssignments();
  }

  function editSection(index: number) {
    if (!view?.canEdit) return;
    setScreen("FORM");
    goToSection(index);
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
            Answers autosave securely as you work. If the network is weak, keep
            this page open; pending changes retry automatically. No background
            polling is used.
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
    const remainingInSection = currentSection.items.length - answeredCount;
    const currentSectionScore = sectionScoreSummary(currentSection, answers);
    const completedTotalScore = totalRawScore(
      view.officialForm.sections,
      answers,
    );
    const completedOverall = allAnswered
      ? overallPercentage(view.officialForm.sections, answers)
      : null;

    return (
      <div className="space-y-4 pb-8">
        <header
          ref={sectionAnchorRef}
          className={panelClass("scroll-mt-40 p-4 sm:p-6")}
        >
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
        </header>

        <div
          className="sticky top-[76px] z-30 rounded-[24px] border border-white/12 bg-[#06101F]/95 p-3 shadow-[0_14px_40px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-4"
          aria-label="Sticky appraisal progress"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="flex items-center gap-3"
                aria-label="Overall completion"
              >
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#57D6C4)] transition-all duration-300"
                    style={{ width: `${clientCompletion}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-bold text-[#F7F4ED]">
                  {totalAnswered}/{totalItems} · {clientCompletion}%
                </span>
              </div>
            </div>

            <div
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${
                autosaveState === "waiting"
                  ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
                  : "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
              }`}
              role="status"
              aria-live="polite"
            >
              {autosaveState === "saving"
                ? "Autosaving…"
                : autosaveState === "queued"
                  ? "Autosave queued"
                  : autosaveState === "waiting"
                    ? "Waiting for network"
                    : autosaveState === "saved"
                      ? "Saved securely"
                      : "Autosave ready"}
            </div>
          </div>

          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1"
            aria-label="Feedback sections"
          >
            {view.officialForm.sections.map((section, index) => {
              const answered = sectionAnsweredCount(section, answers);
              const selected = index === sectionIndex;
              return (
                <button
                  key={section.sectionKey}
                  type="button"
                  onClick={() => goToSection(index)}
                  className={`min-h-11 min-w-[104px] shrink-0 rounded-2xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-[#E8C96A]/45 bg-[#D4AF37]/12 text-[#FFF8DC]"
                      : "border-white/10 bg-[#0A1628] text-[#D9DEE8] hover:bg-white/8"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em]">
                    Section {section.sectionOrder}
                  </div>
                  <div className="mt-1 text-xs font-semibold">
                    {answered}/{section.items.length}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {!online ? (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            You are offline. Your answers stay on this screen and autosave will
            retry when the connection returns.
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

        <section
          id={`director-feedback-section-${currentSection.sectionKey}`}
          className="space-y-4 scroll-mt-24"
        >
          {currentSection.items.map((item, itemIndex) => {
            const answer = answerFor(answers, item);

            return (
              <article
                key={item.instrumentItemId}
                className={panelClass("p-4 sm:p-5")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 text-base font-bold text-[#E8C96A]">
                    {itemIndex + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#AEB6C5] sm:text-sm">
                      Question {item.itemKey}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold leading-8 text-[#F7F4ED] sm:text-xl sm:leading-8">
                      {item.itemLabel}
                    </h2>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {view.officialForm.scale.allowNotApplicable ? (
                    <RatingButton
                      selected={answer.notApplicable}
                      disabled={!view.canEdit}
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
                      disabled={!view.canEdit}
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

        <section className={panelClass("p-4 sm:p-5")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-[#F7F4ED]">
                Section {currentSection.sectionOrder}: {answeredCount}/{currentSection.items.length} answered
              </div>
              <p className="mt-1 text-xs leading-5 text-[#C9CDD6]">
                {sectionComplete
                  ? "This section is complete. Answers continue to autosave securely."
                  : `${remainingInSection} question(s) remain in this section.`}
              </p>
            </div>
            <div className="text-xs font-semibold text-[#C9CDD6]">
              No manual save needed
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8F98A8]">
                Section score
              </div>
              <div className="mt-1 text-lg font-bold text-[#F7F4ED]">
                {currentSectionScore.rawScore} / {currentSection.sectionMaxScore}
              </div>
              {currentSectionScore.notApplicableItems > 0 ? (
                <div className="mt-1 text-[11px] text-[#C9CDD6]">
                  {currentSectionScore.notApplicableItems} N/A item(s) excluded
                  from the percentage denominator; the official section maximum
                  remains {currentSection.sectionMaxScore}.
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8F98A8]">
                Section percentage
              </div>
              <div className="mt-1 text-lg font-bold text-[#F7F4ED]">
                {sectionComplete
                  ? percentageLabel(currentSectionScore.percentage)
                  : "In progress"}
              </div>
              <div className="mt-1 text-[11px] text-[#C9CDD6]">
                Confirmed when every question in this section is answered or marked N/A
              </div>
            </div>
          </div>

          {allAnswered ? (
            <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/8 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100">
                Complete form score
              </div>
              <div className="mt-2 flex flex-col gap-1 text-sm text-[#D9F4EA] sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Total score:{" "}
                  <strong>
                    {completedTotalScore.rawScore} /{" "}
                    {view.officialForm.sections.reduce(
                      (sum, section) => sum + section.sectionMaxScore,
                      0,
                    )}
                  </strong>
                </span>
                <span>
                  Overall percentage: <strong>{percentageLabel(completedOverall)}</strong>
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              className={secondaryButton}
              disabled={sectionIndex === 0}
              onClick={() => goToSection(sectionIndex - 1)}
            >
              Previous section
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={sectionIndex === view.officialForm.sections.length - 1}
              onClick={() => goToSection(sectionIndex + 1)}
            >
              Next section
            </button>
          </div>

          {allAnswered ? (
            <button
              type="button"
              className={`${secondaryButton} mt-3`}
              disabled={busy === "LOAD" || autosaveState === "saving"}
              onClick={() => void openReview()}
            >
              {busy === "LOAD" ? "Preparing review…" : "Review Before you Submit"}
            </button>
          ) : (
            <p className="mt-3 text-xs leading-5 text-[#8F98A8]">
              Complete all 35 questions, then review the full official form before
              final submission.
            </p>
          )}
        </section>
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
        <div className="overflow-x-auto">
          <div className="min-w-[1120px]">
            <div className="border-b-2 border-slate-950 px-6 py-5 text-center">
              <div className="text-sm font-black uppercase tracking-[0.08em]">
                {view.officialForm.jurisdictionName}
              </div>
              <div className="mt-1 text-sm font-black uppercase tracking-[0.08em]">
                Education Directorate
              </div>
              <div className="mt-2 text-xl font-black uppercase">
                {view.officialForm.documentTitle}
              </div>
            </div>

            <table className="w-full border-collapse text-[12px] leading-5">
              <thead>
                <tr className="bg-slate-100">
                  <th
                    rowSpan={2}
                    className="w-[64px] border border-slate-700 px-2 py-2 text-center font-black"
                  >
                    S/N
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-3 py-2 text-center font-black uppercase"
                  >
                    <div>Behavioural Competence</div>
                    <div className="mt-1 text-[10px] font-semibold normal-case tracking-normal">
                      [1—Very poor] [2—Poor] [3—Acceptable] [4—Good] [5—Very Good]
                    </div>
                  </th>
                  <th
                    colSpan={6}
                    className="border border-slate-700 px-2 py-2 text-center font-black"
                  >
                    SCORE
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[92px] border border-slate-700 px-2 py-2 text-center font-black"
                  >
                    FINAL SCORE
                  </th>
                </tr>
                <tr className="bg-slate-100">
                  {['N/A', '1', '2', '3', '4', '5'].map((label) => (
                    <th
                      key={label}
                      className="w-[48px] border border-slate-700 px-1 py-2 text-center font-black"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {view.officialForm.sections.flatMap((section, index) => {
                  const scoreSummary = sectionScoreSummary(section, answers);
                  const percent = finalized
                    ? section.percentage
                    : scoreSummary.percentage;
                  const rows: ReactNode[] = [];

                  rows.push(
                    <tr
                      key={`${section.sectionKey}:heading`}
                      className="bg-[#304C6E] text-white"
                    >
                      <td className="border border-white/25 px-2 py-2 text-center font-black">
                        {section.sectionOrder}.0
                      </td>
                      <td className="border border-white/25 px-3 py-2 font-black uppercase">
                        {section.sectionTitle}
                      </td>
                      <td colSpan={7} className="border border-white/25" />
                    </tr>,
                  );

                  for (const item of section.items) {
                    const answer = answerFor(answers, item);
                    const finalScore = answer.notApplicable
                      ? 'N/A'
                      : answer.score == null
                        ? '—'
                        : String(answer.score);

                    rows.push(
                      <tr key={item.instrumentItemId} className="bg-white">
                        <td className="border border-slate-500 px-2 py-2 text-center font-bold">
                          {item.itemKey}
                        </td>
                        <td className="border border-slate-500 px-3 py-2 align-top">
                          {item.itemLabel}
                        </td>
                        <td
                          className={cx(
                            "border border-slate-500 px-1 py-2 text-center font-black",
                            answer.notApplicable
                              ? nativeScoreTone(answer.score, true)
                              : "bg-white text-slate-300",
                          )}
                        >
                          {answer.notApplicable ? '✓' : ''}
                        </td>
                        {[1, 2, 3, 4, 5].map((score) => {
                          const selected =
                            !answer.notApplicable && answer.score === score;
                          return (
                            <td
                              key={`${item.instrumentItemId}:${score}`}
                              className={cx(
                                "border border-slate-500 px-1 py-2 text-center font-black",
                                selected
                                  ? nativeScoreTone(answer.score, false)
                                  : "bg-white text-slate-300",
                              )}
                            >
                              {selected ? '✓' : ''}
                            </td>
                          );
                        })}
                        <td
                          className={cx(
                            "border border-slate-500 px-2 py-2 text-center font-black",
                            nativeScoreTone(answer.score, answer.notApplicable),
                          )}
                        >
                          {finalScore}
                        </td>
                      </tr>,
                    );
                  }

                  rows.push(
                    <tr key={`${section.sectionKey}:total`} className="bg-slate-100">
                      <td colSpan={8} className="border border-slate-700 px-3 py-2 text-right font-black uppercase">
                        Total Score (Out of {section.sectionMaxScore})
                      </td>
                      <td className="border border-slate-700 px-2 py-2 text-center font-black">
                        {scoreSummary.rawScore}
                      </td>
                    </tr>,
                  );

                  rows.push(
                    <tr key={`${section.sectionKey}:percentage`} className="bg-slate-100">
                      <td colSpan={8} className="border border-slate-700 px-3 py-2 text-right font-black uppercase">
                        Percentage Score = (Total Score /{" "}
                        {scoreSummary.notApplicableItems > 0
                          ? `${scoreSummary.applicableMaximum} Applicable Maximum`
                          : section.sectionMaxScore}) × 100
                      </td>
                      <td className="border border-slate-700 px-2 py-2 text-center font-black">
                        {percentageLabel(percent)}
                      </td>
                    </tr>,
                  );

                  if (scoreSummary.notApplicableItems > 0) {
                    rows.push(
                      <tr key={`${section.sectionKey}:na-note`} className="bg-amber-50">
                        <td colSpan={9} className="border border-slate-500 px-3 py-1.5 text-right text-[10px] font-semibold text-slate-700">
                          {scoreSummary.notApplicableItems} N/A item(s) excluded from the digital percentage denominator.
                        </td>
                      </tr>,
                    );
                  }

                  if (!finalized && view.canEdit) {
                    rows.push(
                      <tr key={`${section.sectionKey}:edit`} className="bg-white">
                        <td colSpan={9} className="border border-slate-500 px-3 py-2 text-right">
                          <button
                            type="button"
                            className="min-h-11 rounded-xl border border-slate-500 bg-white px-4 py-2 font-bold"
                            onClick={() => editSection(index)}
                          >
                            Edit Section {section.sectionOrder}
                          </button>
                        </td>
                      </tr>,
                    );
                  }

                  return rows;
                })}

                <tr className="bg-indigo-50">
                  <td colSpan={8} className="border border-slate-700 px-3 py-2 text-right font-black uppercase">
                    Overall Percentage (1.0 + 2.0 + 3.0 + 4.0 + 5.0 + 6.0 + 7.0) ÷ 7
                  </td>
                  <td className="border border-slate-700 px-2 py-2 text-center font-black">
                    {percentageLabel(
                      finalized ? view.officialForm.overallPercentage : reviewOverall,
                    )}
                  </td>
                </tr>

                <tr className="bg-white">
                  <td className="border border-slate-700 px-2 py-3" />
                  <td colSpan={8} className="border border-slate-700 px-3 py-3">
                    <span className="font-black">General Comment(s):</span>{' '}
                    <span className="text-slate-600">Not enabled in this workflow.</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 border-t-2 border-slate-950 bg-cyan-50 text-sm">
              <div className="border-r border-slate-700 px-5 py-4">
                <div className="font-black uppercase">Total Score</div>
                <div className="mt-1 text-xl font-black">
                  {totalRawScore(view.officialForm.sections, answers).rawScore} /{' '}
                  {view.officialForm.sections.reduce(
                    (sum, section) => sum + section.sectionMaxScore,
                    0,
                  )}
                </div>
              </div>
              <div className="px-5 py-4 text-right">
                <div className="font-black uppercase">Overall Percentage</div>
                <div className="mt-1 text-xl font-black">
                  {percentageLabel(
                    finalized ? view.officialForm.overallPercentage : reviewOverall,
                  )}
                </div>
              </div>
            </div>
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
              Return to feedback list
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
