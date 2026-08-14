// src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DirectorFeedbackPetalChart from "./DirectorFeedbackPetalChart";
import DirectorFeedbackMaskedRespondents from "./DirectorFeedbackMaskedRespondents";

type Section = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number | null;
  averagePercentage: number | null;
  validResponses: number;
};

type AnalysisItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  maxScore: number;
  averageScore: number | null;
  averagePercentage: number | null;
  validResponses: number;
  notApplicableResponses: number;
  band: string;
  bandLabel: string;
};

type AnalysisSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  maxScore: number;
  averagePercentage: number | null;
  validResponses: number;
  band: string;
  bandLabel: string;
  interpretation: string;
  strongestItemKey: string | null;
  lowestItemKey: string | null;
  items: AnalysisItem[];
};

type Analysis = {
  instrument: {
    code: string;
    version: number;
    title: string;
    sectionCount: number;
    itemCount: number;
    scale: {
      minimum: number;
      maximum: number;
      notApplicableAllowed: true;
      labels: Record<string, string>;
    };
  };
  overall: {
    percentage: number | null;
    band: string;
    bandLabel: string;
    interpretation: string;
  };
  participation: {
    eligibleResponses: number;
    finalizedResponses: number;
    expiredResponses: number;
    participationPercentage: number | null;
  };
  evidence: {
    snapshotVersion: number;
    generatedAt: string;
    sourceFingerprint: string;
    municipalBand: "BLOCKED" | "LIMITED" | "PREFERRED";
  };
  guide: Array<{
    band: string;
    label: string;
    minimumPercentage: number | null;
    maximumPercentage: number | null;
    interpretation: string;
  }>;
  strongestSectionKey: string | null;
  lowestSectionKey: string | null;
  sections: AnalysisSection[];
  limitations: {
    individualAnswersAvailable: false;
    scoreFrequencyDistributionAvailable: false;
    rawResponsesQueried: false;
    presentationBandsAreOfficialGrades: false;
  };
};

type Circuit = {
  circuitZoneId: string;
  circuitName: string;
  finalizedResponses: number;
  overallPercentage: number | null;
  sections: Section[];
};

type Workspace = {
  cycle: null | {
    id: string;
    status: string;
    directorName: string | null;
    jurisdictionName: string | null;
    openedAt: string | null;
    deadlineAt: string | null;
    closedAt: string | null;
    reviewStartedAt: string | null;
    releasedAt: string | null;
  };
  readiness: {
    reviewAvailable: boolean;
    canBeginReview: boolean;
    canViewScores: boolean;
    canRelease: boolean;
    reasons: string[];
    releaseReasons: string[];
  };
  aggregate: null | {
    version: number;
    generatedAt: string;
    eligibleResponses: number;
    finalizedResponses: number;
    expiredResponses: number;
    minimumResponses: number;
    releaseEligible: boolean;
    municipalBand: "BLOCKED" | "LIMITED" | "PREFERRED";
    sourceFingerprint: string;
    overallPercentage: number | null;
    sections: Section[];
    analysis: Analysis | null;
    circuits: {
      threshold: number;
      visibleCircuits: Circuit[];
      hiddenCircuitCount: number;
      hiddenCircuitsIncludedInMunicipalAggregate: true;
      exactCountsForHiddenCircuitsIncluded: false;
    };
  };
  privacy: {
    respondentNamesIncluded: false;
    schoolNamesIncluded: false;
    contactDetailsIncluded: false;
    submissionTimesIncluded: false;
    responseOrderIncluded: false;
    individualAnswersIncluded: false;
    individualFormsAvailable: boolean;
  };
};

type ApiResponse =
  | {
      ok: true;
      reqId: string;
      outcome?:
        | "STARTED"
        | "ALREADY_STARTED"
        | "RELEASED"
        | "ALREADY_RELEASED";
      workspace: Workspace;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

type AppreciationChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

type AppreciationStatus = {
  cycleId: string;
  participantCount: number;
  dispatched: boolean;
  channels: {
    inApp: AppreciationChannelSummary;
    sms: AppreciationChannelSummary;
    email: AppreciationChannelSummary;
  };
};

type AppreciationApiResponse =
  | {
      ok: true;
      reqId: string;
      outcome?: "DISPATCHED" | "ALREADY_DISPATCHED";
      rowsInserted?: number;
      status: AppreciationStatus;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] ${extra}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percentage(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

function scoreOutOfFive(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} / 5`;
}

function channelSummaryText(summary: AppreciationChannelSummary) {
  const queued = summary.pending + summary.processing;
  const failed = summary.failed + summary.dead;
  const parts: string[] = [];

  if (summary.sent > 0) parts.push(`${summary.sent} sent`);
  if (queued > 0) parts.push(`${queued} queued`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} unavailable`);
  if (failed > 0) parts.push(`${failed} needs attention`);
  if (summary.cancelled > 0) parts.push(`${summary.cancelled} cancelled`);

  return parts.length ? parts.join(" · ") : "Not started";
}

function friendlyError(code: string) {
  switch (code) {
    case "DIRECTOR_FEEDBACK_REVIEW_CONFIRMATION_REQUIRED":
      return "Confirm that you understand the confidentiality rules before beginning review.";
    case "DIRECTOR_FEEDBACK_CYCLE_NOT_READY_FOR_REVIEW":
      return "This feedback exercise is not yet closed and ready for review.";
    case "DIRECTOR_FEEDBACK_AGGREGATE_SNAPSHOT_MISSING":
      return "The protected review summary is still being prepared. Refresh shortly.";
    case "DIRECTOR_FEEDBACK_MINIMUM_RESPONSES_NOT_MET":
      return "The minimum response threshold was not met, so scores remain protected.";
    case "DIRECTOR_FEEDBACK_REVIEW_SCOPE_FORBIDDEN":
    case "DIRECTOR_FEEDBACK_RELEASE_SCOPE_FORBIDDEN":
      return "This review does not belong to your Director account.";
    case "DIRECTOR_FEEDBACK_RELEASE_CONFIRMATION_REQUIRED":
      return "Confirm the developmental purpose before completing the review.";
    case "DIRECTOR_FEEDBACK_CYCLE_NOT_READY_FOR_RELEASE":
    case "DIRECTOR_FEEDBACK_REVIEW_NOT_STARTED":
      return "Begin the private review before completing it.";
    case "DIRECTOR_FEEDBACK_RELEASE_READINESS_BLOCKED":
      return "The review cannot be completed because its protected release checks did not pass.";
    case "DIRECTOR_FEEDBACK_APPRECIATION_CONFIRMATION_REQUIRED":
      return "Confirm the appreciation dispatch before sending.";
    case "DIRECTOR_FEEDBACK_APPRECIATION_REVIEW_NOT_COMPLETED":
      return "Complete and seal the private review before thanking participants.";
    case "DIRECTOR_FEEDBACK_APPRECIATION_SCOPE_FORBIDDEN":
      return "This completed feedback exercise does not belong to your Director account.";
    case "DIRECTOR_FEEDBACK_APPRECIATION_NO_FINALIZED_PARTICIPANTS":
      return "No finalized participant is available for an appreciation notice.";
    case "DIRECTOR_FEEDBACK_APPRECIATION_OUTBOX_INCOMPLETE":
      return "The appreciation notices were not prepared completely. Nothing should be retried manually; refresh and try again safely.";
    case "UNAUTHORIZED":
    case "GOVERNANCE_FORBIDDEN":
      return "Your Director session is not authorized for this review.";
    default:
      return "The review workspace could not be completed. Check the connection and try again.";
  }
}

function Metric(props: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[#F7F4ED]">
        {props.value}
      </div>
      {props.helper ? (
        <div className="mt-1 text-xs leading-5 text-[#C9CDD6]">
          {props.helper}
        </div>
      ) : null}
    </div>
  );
}

export default function DirectorFeedbackReviewClient() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appreciation, setAppreciation] =
    useState<AppreciationStatus | null>(null);
  const [appreciationLoading, setAppreciationLoading] = useState(false);
  const [appreciationSending, setAppreciationSending] = useState(false);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
  const selectedBreakdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    const releasedCycleId =
      workspace?.cycle?.status === "RELEASED"
        ? workspace.cycle.id
        : null;

    if (!releasedCycleId) {
      setAppreciation(null);
      return;
    }

    void loadAppreciation(releasedCycleId);
  }, [workspace?.cycle?.id, workspace?.cycle?.status]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/district/director-feedback/review",
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_LOAD_DIRECTOR_FEEDBACK_REVIEW",
          ),
        );
        return;
      }

      setWorkspace(payload.workspace);
    } catch {
      setError("The review workspace could not load. Check the connection.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAppreciation(cycleId: string) {
    setAppreciationLoading(true);

    try {
      const response = await fetch(
        `/api/district/director-feedback/review/appreciation?cycleId=${encodeURIComponent(
          cycleId,
        )}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | AppreciationApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_LOAD_DIRECTOR_FEEDBACK_APPRECIATION",
          ),
        );
        return;
      }

      setAppreciation(payload.status);
    } catch {
      setError(
        "The appreciation status could not load. Check the connection and refresh safely.",
      );
    } finally {
      setAppreciationLoading(false);
    }
  }

  async function sendAppreciation() {
    const cycleId = workspace?.cycle?.id;
    if (!cycleId || workspace?.cycle?.status !== "RELEASED") {
      setError("Complete and seal the private review before thanking participants.");
      return;
    }
    if (!online) {
      setError("You are offline. Reconnect before sending appreciation.");
      return;
    }

    setAppreciationSending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/district/director-feedback/review/appreciation",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirm: true,
            cycleId,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | AppreciationApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_SEND_DIRECTOR_FEEDBACK_APPRECIATION",
          ),
        );
        return;
      }

      setAppreciation(payload.status);
      setNotice(
        payload.outcome === "DISPATCHED"
          ? "Thank-you notices were prepared safely for every participating Headteacher."
          : "The thank-you notices had already been prepared; no duplicate was created.",
      );
    } catch {
      setError(
        "The server response could not be confirmed. Refresh safely; appreciation dispatch is idempotent.",
      );
    } finally {
      setAppreciationSending(false);
    }
  }

  async function beginReview() {
    const cycleId = workspace?.cycle?.id;
    if (!cycleId || !confirmed) {
      setError("Confirm the confidentiality rules before beginning review.");
      return;
    }
    if (!online) {
      setError("You are offline. Reconnect before beginning review.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/district/director-feedback/review",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true, cycleId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_BEGIN_DIRECTOR_FEEDBACK_REVIEW",
          ),
        );
        return;
      }

      setWorkspace(payload.workspace);
      setConfirmed(false);
      setNotice(
        payload.outcome === "STARTED"
          ? "Private review started. The entry was recorded in the audit trail."
          : "This private review was already started and has reopened safely.",
      );
    } catch {
      setError(
        "The server response could not be confirmed. Refresh safely; beginning review is idempotent.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function completeReview() {
    const cycleId = workspace?.cycle?.id;
    if (!cycleId || !releaseConfirmed) {
      setError("Confirm the developmental purpose before completing review.");
      return;
    }
    if (!online) {
      setError("You are offline. Reconnect before completing review.");
      return;
    }

    setReleasing(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/district/director-feedback/review/release",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acknowledgeDevelopmentalPurpose: true,
            confirm: true,
            cycleId,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_RELEASE_DIRECTOR_FEEDBACK",
          ),
        );
        return;
      }

      setWorkspace(payload.workspace);
      setReleaseConfirmed(false);
      setNotice(
        payload.outcome === "RELEASED"
          ? "The private review was sealed and completed with an audit record."
          : "This private review was already completed and reopened safely.",
      );
    } catch {
      setError(
        "The server response could not be confirmed. Refresh safely; completion is idempotent.",
      );
    } finally {
      setReleasing(false);
    }
  }

  const cycle = workspace?.cycle ?? null;
  const aggregate = workspace?.aggregate ?? null;
  const analysis = aggregate?.analysis ?? null;
  const readiness = workspace?.readiness ?? null;
  const selectedAnalysisSection =
    analysis?.sections.find(
      (section) => section.sectionKey === selectedSectionKey,
    ) ?? null;

  function selectAnalysisSection(sectionKey: string) {
    setSelectedSectionKey(sectionKey);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        selectedBreakdownRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  return (
    <div className="space-y-5">
      <header className={panel("p-5 sm:p-7")}>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
          District Director • Private leadership review
        </div>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          Review Director Feedback
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
          Municipal results appear only after the exercise closes, the minimum
          response threshold is met, and you explicitly begin an audited review.
        </p>
      </header>

      {!online ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          You are offline. Existing information remains visible, but review
          cannot begin or be completed until the connection returns.
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

      {loading ? (
        <section className={panel("p-5 text-sm text-[#C9CDD6]")}>
          Checking the protected review evidence…
        </section>
      ) : !cycle ? (
        <section className={panel("p-5")}>
          <h2 className="text-lg font-bold">No Director feedback exercise</h2>
          <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
            Open a confidential feedback exercise before a review can exist.
          </p>
        </section>
      ) : (
        <>
          <section className={panel("p-5")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#57D6C4]">
                  Status: {cycle.status.replaceAll("_", " ")}
                </div>
                <h2 className="mt-2 text-xl font-bold">
                  {cycle.directorName ?? "Municipal Director"}
                </h2>
                <p className="mt-1 text-sm text-[#C9CDD6]">
                  {cycle.jurisdictionName ?? "Authorized municipality"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0A1628] px-4 py-3">
                <div className="text-[11px] text-[#8F98A8]">
                  {cycle.status === "RELEASED" ? "Review completed" : "Review started"}
                </div>
                <div className="mt-1 text-sm font-bold">
                  {formatDate(
                    cycle.status === "RELEASED"
                      ? cycle.releasedAt
                      : cycle.reviewStartedAt,
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Finalized"
                value={aggregate?.finalizedResponses ?? "—"}
                helper="Municipal total only"
              />
              <Metric
                label="Minimum"
                value={aggregate?.minimumResponses ?? "—"}
                helper="Required before review"
              />
              <Metric
                label="Expired"
                value={aggregate?.expiredResponses ?? "—"}
                helper="Unfinished responses"
              />
              <Metric
                label="Evidence"
                value={aggregate ? `v${aggregate.version}` : "—"}
                helper={
                  aggregate?.sourceFingerprint
                    ? `Proof ${aggregate.sourceFingerprint}`
                    : "Snapshot pending"
                }
              />
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-sm leading-6 text-cyan-50">
              You will never see respondent names, schools, contact details,
              submission times or response order. Complete finalized forms are
              available only under randomized masked labels inside circuits that
              independently meet the privacy threshold.
            </div>

            <button
              type="button"
              className="mt-4 min-h-12 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-55"
              disabled={loading}
              onClick={() => void loadWorkspace()}
            >
              Refresh protected status
            </button>
          </section>

          {cycle.status === "OPEN" ? (
            <section className={panel("p-5")}>
              <h2 className="text-lg font-bold">Responses are still open</h2>
              <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
                The exercise closes on {formatDate(cycle.deadlineAt)}. No scores
                or circuit details are available before closure.
              </p>
            </section>
          ) : null}

          {readiness?.canBeginReview ? (
            <section className={panel("p-5")}>
              <h2 className="text-lg font-bold">Begin private review</h2>
              <p className="mt-3 text-sm leading-6 text-[#D9DEE8]">
                The exercise is closed, the protected aggregate exists, and at
                least {aggregate?.minimumResponses ?? 5} finalized responses
                were received. Beginning review changes the cycle to Under
                Director review and writes an audit record.
              </p>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0A1628] p-4">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span className="text-sm leading-6">
                  I understand that these feedback results are confidential and
                  protected.
                </span>
              </label>

              <button
                type="button"
                disabled={!confirmed || submitting || !online}
                onClick={() => void beginReview()}
                className="mt-5 min-h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-bold text-[#071A3D] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
              >
                {submitting ? "Beginning safely…" : "Begin Private Review"}
              </button>
            </section>
          ) : null}

          {aggregate && !aggregate.releaseEligible ? (
            <section className="rounded-[28px] border border-amber-300/25 bg-amber-400/10 p-5">
              <h2 className="text-lg font-bold text-amber-50">
                Review protected by minimum threshold
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-100/90">
                {aggregate.finalizedResponses} finalized response(s) were
                received, but {aggregate.minimumResponses} are required. Scores,
                sections and circuit details remain hidden. Return to Appraisal
                Request to see whether the one-time 7-day recovery extension is
                still available for unfinished respondents. Broader controlled
                extend/reopen authority remains restricted to Superadmin.
              </p>
            </section>
          ) : null}

          {readiness?.canViewScores && aggregate ? (
            <>
              <section className={panel("p-5")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#57D6C4]">
                      Municipal aggregate
                    </div>
                    <h2 className="mt-2 text-xl font-bold">
                      Leadership feedback summary
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-center">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/75">
                      Overall
                    </div>
                    <div className="mt-1 text-3xl font-bold text-emerald-50">
                      {percentage(aggregate.overallPercentage)}
                    </div>
                    <div className="mt-1 text-xs text-emerald-100/80">
                      {aggregate.municipalBand === "PREFERRED"
                        ? "Preferred response strength"
                        : "Limited response strength"}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {aggregate.sections.map((section) => (
                    <article
                      key={section.sectionKey}
                      className="rounded-2xl border border-white/10 bg-[#0A1628] p-4"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8F98A8]">
                        Section {section.sectionOrder ?? "—"}
                      </div>
                      <h3 className="mt-2 text-sm font-bold leading-6">
                        {section.sectionTitle}
                      </h3>
                      <div className="mt-3 text-2xl font-bold text-[#E8C96A]">
                        {percentage(section.averagePercentage)}
                      </div>
                      <div className="mt-1 text-xs text-[#C9CDD6]">
                        {section.validResponses} valid response(s)
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {analysis ? (
                <>
                  <section className={panel("p-5")}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#57D6C4]">
                          Seven-section leadership profile
                        </div>
                        <h2 className="mt-2 text-xl font-bold">
                          Leadership profile
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                          Each petal represents one official section. A longer
                          petal means a stronger municipal aggregate rating.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0A1628] px-4 py-3 text-sm">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#8F98A8]">
                          Participation
                        </div>
                        <div className="mt-1 text-xl font-bold text-[#E8C96A]">
                          {percentage(
                            analysis.participation.participationPercentage,
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <DirectorFeedbackPetalChart
                        overallPercentage={analysis.overall.percentage}
                        sections={analysis.sections}
                        selectedSectionKey={selectedSectionKey}
                        onSelectSection={selectAnalysisSection}
                      />
                    </div>

                    {selectedAnalysisSection ? (
                      <div
                        ref={selectedBreakdownRef}
                        className="mt-5 scroll-mt-24 rounded-[24px] border border-[#57D6C4]/30 bg-[#071426] p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#57D6C4]">
                              Section {selectedAnalysisSection.sectionOrder} question breakdown
                            </div>
                            <h3 className="mt-2 text-lg font-bold leading-7 text-[#F7F4ED]">
                              {selectedAnalysisSection.sectionTitle}
                            </h3>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                              These are aggregate Headteacher ratings only. No row
                              identifies which Headteacher or school gave a score.
                            </p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-[#0A1628] px-4 py-3 text-left sm:text-right">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8F98A8]">
                              Section result
                            </div>
                            <div className="mt-1 text-2xl font-black text-[#E8C96A]">
                              {percentage(selectedAnalysisSection.averagePercentage)}
                            </div>
                            <div className="mt-1 text-xs text-[#C9CDD6]">
                              {selectedAnalysisSection.bandLabel}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3 md:hidden">
                          {selectedAnalysisSection.items.map((item) => (
                            <article
                              key={item.itemKey}
                              className="rounded-2xl border border-white/10 bg-[#0A1628] p-4"
                            >
                              <div className="text-xs font-black text-[#E8C96A]">
                                {item.itemKey}
                              </div>
                              <p className="mt-1 text-base font-semibold leading-7 text-[#F7F4ED]">
                                {item.itemLabel}
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-xl bg-white/5 p-3">
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#8F98A8]">
                                    Average score
                                  </div>
                                  <div className="mt-1 font-bold">
                                    {scoreOutOfFive(item.averageScore)}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/5 p-3">
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#8F98A8]">
                                    Result
                                  </div>
                                  <div className="mt-1 font-bold text-[#57D6C4]">
                                    {percentage(item.averagePercentage)}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/5 p-3">
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#8F98A8]">
                                    Valid heads
                                  </div>
                                  <div className="mt-1 font-bold">
                                    {item.validResponses}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/5 p-3">
                                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#8F98A8]">
                                    N/A
                                  </div>
                                  <div className="mt-1 font-bold">
                                    {item.notApplicableResponses}
                                  </div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>

                        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
                          <table className="w-full min-w-[820px] border-collapse text-left">
                            <thead className="bg-white/5 text-[11px] uppercase tracking-[0.1em] text-[#AEB6C4]">
                              <tr>
                                <th className="px-4 py-3 font-bold">Question</th>
                                <th className="px-4 py-3 text-center font-bold">Average score</th>
                                <th className="px-4 py-3 text-center font-bold">Result</th>
                                <th className="px-4 py-3 text-center font-bold">Valid heads</th>
                                <th className="px-4 py-3 text-center font-bold">N/A</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedAnalysisSection.items.map((item) => (
                                <tr
                                  key={item.itemKey}
                                  className="border-t border-white/8 align-top"
                                >
                                  <td className="px-4 py-4">
                                    <div className="text-xs font-black text-[#E8C96A]">
                                      {item.itemKey}
                                    </div>
                                    <div className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#F7F4ED]">
                                      {item.itemLabel}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-center text-sm font-bold">
                                    {scoreOutOfFive(item.averageScore)}
                                  </td>
                                  <td className="px-4 py-4 text-center text-sm font-black text-[#57D6C4]">
                                    {percentage(item.averagePercentage)}
                                  </td>
                                  <td className="px-4 py-4 text-center text-sm font-bold">
                                    {item.validResponses}
                                  </td>
                                  <td className="px-4 py-4 text-center text-sm font-bold">
                                    {item.notApplicableResponses}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-[#57D6C4]/20 bg-[#57D6C4]/8 p-4 text-sm leading-6 text-cyan-50">
                        Select any petal or numbered section card to open its
                        questionnaire-level aggregate breakdown.
                      </div>
                    )}

                    <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                      The labels below are developmental guides, not official
                      disciplinary grades. This analysis explains the sealed
                      aggregate and does not recalculate confidential answers.
                    </div>

                    <h3 className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-[#E8C96A]">
                      Developmental guide
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {analysis.guide
                        .filter((entry) => entry.band !== "NO_DATA")
                        .map((entry) => (
                          <div
                            key={entry.band}
                            className="rounded-2xl border border-white/10 bg-[#0A1628] p-4"
                          >
                            <div className="text-sm font-bold">{entry.label}</div>
                            <div className="mt-1 text-xs text-[#E8C96A]">
                              {entry.minimumPercentage ?? 0}%–
                              {entry.maximumPercentage ?? 100}%
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#C9CDD6]">
                              {entry.interpretation}
                            </p>
                          </div>
                        ))}
                    </div>
                  </section>

                </>
              ) : null}

              <section className={panel("p-5")}>
                <h2 className="text-lg font-bold">Threshold-safe circuits</h2>
                <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
                  A circuit appears only when it has at least{" "}
                  {aggregate.circuits.threshold} finalized responses. Smaller
                  circuits remain hidden but still contribute to the municipal
                  aggregate.
                </p>

                <div className="mt-4 space-y-3">
                  {aggregate.circuits.visibleCircuits.length ? (
                    aggregate.circuits.visibleCircuits.map((circuit) => (
                      <article
                        key={circuit.circuitZoneId}
                        className="rounded-2xl border border-white/10 bg-[#0A1628] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-bold">{circuit.circuitName}</h3>
                            <p className="mt-1 text-xs text-[#C9CDD6]">
                              {circuit.finalizedResponses} finalized responses
                            </p>
                          </div>
                          <div className="text-2xl font-bold text-[#E8C96A]">
                            {percentage(circuit.overallPercentage)}
                          </div>
                        </div>


                        {workspace?.privacy.individualFormsAvailable ? (
                          <DirectorFeedbackMaskedRespondents
                            cycleId={cycle.id}
                            circuitZoneId={circuit.circuitZoneId}
                            circuitName={circuit.circuitName}
                          />
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4 text-sm text-[#C9CDD6]">
                      No circuit independently reached the disclosure threshold.
                    </div>
                  )}
                </div>

                {aggregate.circuits.hiddenCircuitCount > 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                    {aggregate.circuits.hiddenCircuitCount} circuit(s) remain
                    hidden because their individual response totals are below
                    the privacy threshold. Their responses remain included in
                    the municipal result.
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {readiness?.canRelease && aggregate ? (
            <section className={panel("p-5")}>
              <h2 className="text-lg font-bold">Complete private review</h2>
              <p className="mt-3 text-sm leading-6 text-[#D9DEE8]">
                Completing the review seals this protected aggregate as the
                final developmental feedback record. Respondent and school
                identities remain protected.
              </p>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0A1628] p-4">
                <input
                  type="checkbox"
                  checked={releaseConfirmed}
                  onChange={(event) => setReleaseConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span className="text-sm leading-6">
                  I have reviewed the protected findings and understand that
                  completing this review seals the confidential feedback record.
                </span>
              </label>

              <button
                type="button"
                disabled={!releaseConfirmed || releasing || !online}
                onClick={() => void completeReview()}
                className="mt-5 min-h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-bold text-[#071A3D] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
              >
                {releasing ? "Completing safely…" : "Seal and Complete Review"}
              </button>
            </section>
          ) : null}

          {cycle.status === "RELEASED" ? (
            <>
              <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-400/10 p-5">
                <h2 className="text-lg font-bold text-emerald-50">
                  Private review completed
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-100/90">
                  This feedback record was sealed on {formatDate(cycle.releasedAt)}.
                  The aggregate remains available as read-only evidence, while
                  respondent and school identities remain protected.
                </p>
              </section>

              <section className={panel("p-5")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#E8C96A]">
                      Close the participation loop
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-[#F7F4ED]">
                      Thank participating Headteachers
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                      Send EduLife OS&apos;s prepared appreciation message to every
                      Headteacher who finalized this confidential feedback exercise.
                      Recipient names, schools and scores are never shown here.
                    </p>
                  </div>

                  {appreciation?.dispatched ? (
                    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-center">
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-100/75">
                        Appreciation
                      </div>
                      <div className="mt-1 text-sm font-black text-emerald-50">
                        Dispatched ✓
                      </div>
                    </div>
                  ) : null}
                </div>

                {appreciationLoading ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#0A1628] p-4 text-sm text-[#C9CDD6]">
                    Checking appreciation status…
                  </div>
                ) : appreciation?.dispatched ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      label="Headteachers thanked"
                      value={appreciation.participantCount}
                      helper="Finalized participants only"
                    />
                    <Metric
                      label="In-app"
                      value={channelSummaryText(appreciation.channels.inApp)}
                      helper="Available immediately"
                    />
                    <Metric
                      label="SMS"
                      value={channelSummaryText(appreciation.channels.sms)}
                      helper="Opt-in and phone availability respected"
                    />
                    <Metric
                      label="Email"
                      value={channelSummaryText(appreciation.channels.email)}
                      helper="Delivered by the notification worker"
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-sm leading-6 text-cyan-50">
                    The prepared message thanks participants for their time, honesty
                    and trust, and explains that their feedback will help strengthen
                    leadership and support for schools.
                  </div>
                )}

                {!appreciation?.dispatched ? (
                  <button
                    type="button"
                    disabled={
                      appreciationLoading || appreciationSending || !online
                    }
                    onClick={() => void sendAppreciation()}
                    className="mt-5 min-h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-bold text-[#071A3D] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                  >
                    {appreciationSending
                      ? "Sending appreciation…"
                      : "Send appreciation"}
                  </button>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/district/director-feedback"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-[#F7F4ED] hover:bg-white/10"
        >
          Back to appraisal request
        </Link>
        <Link
          href="/district/dashboard"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-[#F7F4ED] hover:bg-white/10"
        >
          Back to district dashboard
        </Link>
      </div>
    </div>
  );
}
