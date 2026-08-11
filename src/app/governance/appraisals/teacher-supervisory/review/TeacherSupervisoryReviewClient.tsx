"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type WorkState =
  | "READY_TO_START"
  | "READY_TO_REVIEW"
  | "READY_TO_RELEASE";

type NextAction =
  | "START_REVIEW"
  | "CONTINUE_REVIEW"
  | "DIRECT_RELEASE";

type ReviewWorkItem = {
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
  assessorRole: string;
  assessorOfficeLabel: string;
  state: WorkState;
  nextAction: NextAction;
  eligible: true;
};

type ReviewWorkQueue = {
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
  items: ReviewWorkItem[];
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

type ReviewPackageItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
};

type ReviewPackageSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  percentage: number | null;
  items: ReviewPackageItem[];
};

type BrowserReviewPackage = {
  schemaVersion: 1;
  lifecycleState: "READY_FOR_REVIEW_DECISION";
  review: {
    reviewerRole: string;
  };
  assessment: {
    id: string;
    cycleId: string;
    revision: number;
    finalizedAt: string;
    assessorOffice: string;
    dateObserved: string;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    generalComment: string | null;
    sections: ReviewPackageSection[];
  };
  observation: {
    contextSchemaVersion: 1 | 2;
    teacherName: string | null;
    schoolName: string;
    circuitName: string;
    districtName: string;
    dateObserved: string;
    yearsInService: number | null;
    yearsInPresentSchool: number | null;
    subjectBeingObserved: string | null;
    subStrand: string | null;
    classTaught: string | null;
    durationMinutes: number | null;
    totalEnrolment: number | null;
    girls: number | null;
    boys: number | null;
  };
  readOnly: true;
};

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
};

type ClientProps = {
  initialAssessmentId: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${round2(Number(value))}%`;
}

function dashboardHref(actorRole: string | undefined) {
  switch (actorRole) {
    case "HEAD_OF_SUPERVISION":
      return "/district/hos/dashboard";
    case "DISTRICT_DIRECTOR":
      return "/district/dashboard";
    default:
      return "/app";
  }
}

function stateLabel(state: WorkState) {
  switch (state) {
    case "READY_TO_START":
      return "New report";
    case "READY_TO_REVIEW":
      return "Continue review";
    case "READY_TO_RELEASE":
      return "Ready to release";
  }
}

function stateHelp(state: WorkState) {
  switch (state) {
    case "READY_TO_START":
      return "This finalized assessment is waiting for you to begin its independent review.";
    case "READY_TO_REVIEW":
      return "This review is already in your custody and can be reopened safely after a browser or network interruption.";
    case "READY_TO_RELEASE":
      return "This is your own finalized Director assessment. It does not enter self-review.";
  }
}

function stateTone(state: WorkState) {
  switch (state) {
    case "READY_TO_START":
      return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
    case "READY_TO_REVIEW":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "READY_TO_RELEASE":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
}

function officeLabel(role: string) {
  switch (role) {
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "Not provided";
  return String(value);
}

async function readApiBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: false,
      error:
        response.status >= 500
          ? "SERVER_TEMPORARILY_BUSY"
          : "EMPTY_SERVER_RESPONSE",
    } satisfies ApiFailure;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      error:
        response.status >= 500
          ? "SERVER_TEMPORARILY_BUSY"
          : "INVALID_SERVER_RESPONSE",
    } satisfies ApiFailure;
  }
}

function messageFromFailure(value: unknown, status?: number) {
  const failure = value as ApiFailure;
  const code = clean(failure?.error);

  if (status != null && status >= 500) {
    return "The server is temporarily busy. Keep this page open and try again.";
  }

  if (code === "SERVER_TEMPORARILY_BUSY") {
    return "The server is temporarily busy. Keep this page open and try again.";
  }

  return (
    failure?.message ||
    code ||
    "The request could not be completed. Please try again."
  );
}

function scoreLabel(item: ReviewPackageItem) {
  return item.notApplicable ? "N/A" : String(item.score ?? "—");
}

export default function TeacherSupervisoryReviewClient({
  initialAssessmentId,
}: ClientProps) {
  const [queue, setQueue] = useState<ReviewWorkQueue | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(
    clean(initialAssessmentId),
  );
  const [reviewPackage, setReviewPackage] =
    useState<BrowserReviewPackage | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState("");

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError("");

    try {
      const response = await fetch(
        "/api/governance/appraisals/teacher-supervisory/review-queue",
        { cache: "no-store" },
      );

      const body = (await readApiBody(response)) as
        | { ok: true; reviewQueue: ReviewWorkQueue }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      setQueue(body.reviewQueue);
    } catch (loadError) {
      setQueueError(
        loadError instanceof Error
          ? loadError.message
          : "Your Teacher review work could not be loaded.",
      );
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadReviewPackage = useCallback(async (assessmentId: string) => {
    setPackageLoading(true);
    setPackageError("");

    try {
      const response = await fetch(
        `/api/governance/appraisals/teacher-supervisory/review-queue/${encodeURIComponent(
          assessmentId,
        )}/package`,
        { cache: "no-store" },
      );

      const body = (await readApiBody(response)) as
        | { ok: true; reviewPackage: BrowserReviewPackage }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      setReviewPackage(body.reviewPackage);
      setSelectedAssessmentId(assessmentId);
    } catch (loadError) {
      setReviewPackage(null);
      setPackageError(
        loadError instanceof Error
          ? loadError.message
          : "The read-only Teacher review package could not be loaded.",
      );
    } finally {
      setPackageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!queue || !selectedAssessmentId || reviewPackage || packageLoading) {
      return;
    }

    const item = queue.items.find(
      (candidate) => candidate.assessmentId === selectedAssessmentId,
    );

    if (item?.state === "READY_TO_REVIEW") {
      void loadReviewPackage(item.assessmentId);
    }
  }, [
    loadReviewPackage,
    packageLoading,
    queue,
    reviewPackage,
    selectedAssessmentId,
  ]);

  const workGroups = useMemo(
    () => [
      {
        state: "READY_TO_REVIEW" as const,
        title: "Continue review",
        description:
          "Reports already in your custody. Open these first if you were interrupted.",
        items:
          queue?.items.filter((item) => item.state === "READY_TO_REVIEW") ?? [],
      },
      {
        state: "READY_TO_START" as const,
        title: "New reports",
        description:
          "Finalized assessments waiting for independent review admission.",
        items:
          queue?.items.filter((item) => item.state === "READY_TO_START") ?? [],
      },
      {
        state: "READY_TO_RELEASE" as const,
        title: "Ready to release",
        description:
          "Director-authored finalized assessments that bypass self-review.",
        items:
          queue?.items.filter((item) => item.state === "READY_TO_RELEASE") ?? [],
      },
    ],
    [queue],
  );

  function closePackage() {
    setReviewPackage(null);
    setPackageError("");
    setSelectedAssessmentId("");
  }

  if (reviewPackage) {
    const observation = reviewPackage.observation;
    const assessment = reviewPackage.assessment;

    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  Teacher review · read-only
                </p>
                <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                  {observation.teacherName || "Teacher"}
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  {observation.schoolName} · {observation.circuitName}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Assessed by {assessment.assessorOffice}. You are reviewing a
                  locked official assessment. Nothing on this screen changes
                  the Teacher&apos;s scores or General Comment.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={closePackage}
                  className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-bold text-white hover:bg-white/[0.09]"
                >
                  ← Back to work list
                </button>
                <button
                  type="button"
                  disabled={packageLoading}
                  onClick={() => void loadReviewPackage(assessment.id)}
                  className="min-h-12 rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  {packageLoading ? "Refreshing…" : "Refresh report"}
                </button>
              </div>
            </div>
          </section>

          {packageError ? (
            <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              {packageError}
            </div>
          ) : null}

          <section className="grid grid-cols-3 gap-2 md:gap-4">
            {[
              ["Revision", assessment.revision],
              ["Observed", observation.dateObserved],
              ["Overall", formatPercent(assessment.overallPercentage)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3 text-center md:rounded-[26px] md:p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-white md:text-xl">
                  {String(value)}
                </p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <aside className="space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#E8C96A]">
                  Observation record
                </p>

                <div className="mt-4 space-y-2">
                  {[
                    ["Teacher", observation.teacherName || "Teacher"],
                    ["School", observation.schoolName],
                    ["Circuit", observation.circuitName],
                    ["District", observation.districtName],
                    ["Years in service", observation.yearsInService],
                    ["Years in present school", observation.yearsInPresentSchool],
                    ["Subject observed", observation.subjectBeingObserved],
                    ["Sub-strand", observation.subStrand],
                    ["Class taught", observation.classTaught],
                    [
                      "Lesson duration",
                      observation.durationMinutes == null
                        ? null
                        : `${observation.durationMinutes} minutes`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-2xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {displayValue(value)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-100">
                    Class enrolment
                  </p>
                  {observation.contextSchemaVersion === 2 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {[
                        ["Total", observation.totalEnrolment],
                        ["Girls", observation.girls],
                        ["Boys", observation.boys],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl border border-white/10 bg-black/20 p-2"
                        >
                          <p className="text-[9px] uppercase tracking-[0.08em] text-slate-400">
                            {label}
                          </p>
                          <p className="mt-1 font-bold text-white">
                            {String(value ?? "—")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-cyan-50/80">
                      This older immutable assessment did not capture the
                      enrolment breakdown.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-emerald-300/20 bg-emerald-400/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-100">
                  Review custody
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {officeLabel(reviewPackage.review.reviewerRole)}
                </p>
                <p className="mt-2 text-xs leading-5 text-emerald-50/85">
                  This slice is deliberately read-only. Return, Forward and
                  Release controls will be wired only through their existing
                  server-authoritative decision endpoints.
                </p>
              </div>
            </aside>

            <main className="space-y-4">
              {assessment.sections.map((section) => (
                <section
                  key={section.sectionKey}
                  className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#E8C96A]">
                        Section {section.order}
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-white">
                        {section.title}
                      </h2>
                      {section.description ? (
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          {section.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                      <p className="text-[9px] uppercase tracking-[0.08em] text-slate-400">
                        Section result
                      </p>
                      <p className="mt-1 font-bold text-white">
                        {formatPercent(section.percentage)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {section.items.map((item) => (
                      <article
                        key={item.itemKey}
                        className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div>
                          <p className="text-xs font-bold text-[#E8C96A]">
                            {item.itemKey}
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-100">
                            {item.label}
                          </p>
                        </div>

                        <div
                          className={cx(
                            "min-w-20 rounded-xl border px-3 py-2 text-center text-sm font-black",
                            item.notApplicable
                              ? "border-slate-300/20 bg-slate-300/10 text-slate-100"
                              : "border-cyan-300/25 bg-cyan-400/10 text-cyan-50",
                          )}
                        >
                          {scoreLabel(item)}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}

              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#E8C96A]">
                  General Comment
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                  {assessment.generalComment?.trim() ||
                    "No General Comment was entered."}
                </p>
              </section>

              <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4">
                <p className="text-sm font-bold text-amber-50">
                  Read-only review shell
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-50/85">
                  No review decision is changed in this step. The next phase
                  will connect the correct HOS or District Director action to
                  the existing server-side decision service with explicit
                  confirmation.
                </p>
              </section>
            </main>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                EduLife OS · {queue?.officeLabel || "Teacher review"}
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                Review Teacher Reports
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                See what needs your attention. This work list restores your
                responsibility after a browser restart or weak-network
                interruption without storing review data in the browser.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={dashboardHref(queue?.actorRole)}
                className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.09]"
              >
                ← Dashboard
              </Link>
              <button
                type="button"
                disabled={queueLoading}
                onClick={() => void loadQueue()}
                className="min-h-12 rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {queueLoading ? "Refreshing…" : "Refresh work list"}
              </button>
            </div>
          </div>
        </section>

        {queueError ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
            {queueError}
          </div>
        ) : null}

        {packageError ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
            {packageError}
          </div>
        ) : null}

        <section className="grid grid-cols-3 gap-2 md:gap-4">
          {[
            ["New", queue?.summary.readyToStart ?? 0],
            ["In review", queue?.summary.readyToReview ?? 0],
            ["Ready to release", queue?.summary.readyToRelease ?? 0],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3 text-center md:rounded-[26px] md:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">
                {label}
              </p>
              <p className="mt-1 text-lg font-black text-white md:text-2xl">
                {String(value)}
              </p>
            </div>
          ))}
        </section>

        {queueLoading && !queue ? (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-slate-300">Loading your review work…</p>
          </section>
        ) : queue?.items.length ? (
          <div className="space-y-5">
            {workGroups.map((group) => (
              <section
                key={group.state}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#E8C96A]">
                      {group.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {group.description}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-white">
                    {group.items.length}
                  </span>
                </div>

                {group.items.length ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {group.items.map((item) => (
                      <article
                        key={item.assessmentId}
                        className="rounded-[22px] border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-white">
                              {item.targetName || "Teacher"}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {item.schoolName}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {item.circuitName} · {item.dateObserved}
                            </p>
                          </div>

                          <span
                            className={cx(
                              "rounded-full border px-3 py-1 text-xs font-bold",
                              stateTone(item.state),
                            )}
                          >
                            {stateLabel(item.state)}
                          </span>
                        </div>

                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                            Assessed by
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {item.assessorOfficeLabel}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-400">
                            {stateHelp(item.state)}
                          </p>
                        </div>

                        {item.state === "READY_TO_REVIEW" ? (
                          <button
                            type="button"
                            disabled={packageLoading}
                            onClick={() =>
                              void loadReviewPackage(item.assessmentId)
                            }
                            className="mt-4 min-h-12 w-full rounded-2xl border border-amber-300/25 bg-amber-400/15 px-4 text-sm font-bold text-amber-50 hover:bg-amber-400/20 disabled:opacity-50"
                          >
                            {packageLoading &&
                            selectedAssessmentId === item.assessmentId
                              ? "Opening report…"
                              : "Open report"}
                          </button>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs font-semibold text-slate-300">
                            Action wiring comes in the next controlled step.
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/10 p-4 text-sm text-slate-400">
                    Nothing in this group right now.
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-lg font-bold text-white">No review work waiting</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Use Refresh work list when you expect a newly finalized or
              forwarded Teacher report. This page does not poll in the
              background.
            </p>
          </section>
        )}

        <p className="text-xs leading-5 text-slate-400">
          Work-list responses contain compact responsibility metadata only.
          Scores and General Comments load only after an existing review is
          opened through the read-only package endpoint. No persistent browser
          storage or background polling is used.
        </p>
      </div>
    </div>
  );
}
