// src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Section = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number | null;
  averagePercentage: number | null;
  validResponses: number;
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
  };
  readiness: {
    reviewAvailable: boolean;
    canBeginReview: boolean;
    canViewScores: boolean;
    reasons: string[];
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
    individualFormsAvailable: false;
  };
};

type ApiResponse =
  | {
      ok: true;
      reqId: string;
      outcome?: "STARTED" | "ALREADY_STARTED";
      workspace: Workspace;
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
  return `${value.toFixed(1)}%`;
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
      return "This review does not belong to your Director account.";
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
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const cycle = workspace?.cycle ?? null;
  const aggregate = workspace?.aggregate ?? null;
  const readiness = workspace?.readiness ?? null;

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
          cannot begin until the connection returns.
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
                  Review started
                </div>
                <div className="mt-1 text-sm font-bold">
                  {formatDate(cycle.reviewStartedAt)}
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
              submission times, response order or individual answers in this
              workspace.
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
                  I understand that the results are confidential, aggregated
                  and not a substitute for the Regional Director&apos;s official
                  appraisal.
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
                sections and circuit details remain hidden. The Director cannot
                extend or reopen this cycle; only Superadmin may do so with a
                written reason and audit trail.
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
