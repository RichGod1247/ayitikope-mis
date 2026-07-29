"use client";

import { useState } from "react";
import type { HeadteacherReleasedResult } from "@/lib/appraisals/headteacherReleasedResult";
import type { HeadteacherOwnAppraisalReadState } from "@/lib/appraisals/headteacherFeedbackReadStates";

export const HEADTEACHER_RELEASED_RESULT_UI_POLICY = {
  audience: "HEADTEACHER",
  expectedSections: 4,
  presentation: "OVERALL_THEN_FOUR_SECTIONS",
  loadingMode: "EXPLICIT_BUTTON_ONLY",
  backgroundPollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  comparisonDirection: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
  comparisonThresholdsDefined: false,
  combinedScoreIncluded: false,
  responseCountsIncluded: false,
  itemLevelValuesIncluded: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  reviewerIdentityIncluded: false,
  assessorIdentityIncluded: false,
  resultMutationAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

type ReleasedResultApiResponse =
  | {
      ok: true;
      reqId: string;
      item: HeadteacherReleasedResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

type Props = {
  initialState: HeadteacherOwnAppraisalReadState | null;
};

type AppraisalStatusApiResponse =
  | {
      ok: true;
      reqId: string;
      state: HeadteacherOwnAppraisalReadState;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

type AppraisalRequestApiResponse =
  | {
      ok: true;
      reqId: string;
      state: HeadteacherOwnAppraisalReadState;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

function panelClass(extra = "") {
  return `rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] ${extra}`;
}

function percentage(value: number) {
  return `${Number(value).toFixed(1)}%`;
}

function difference(value: number) {
  const amount = Number(value);
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${amount.toFixed(1)} percentage points`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function stateGuidance(state: HeadteacherOwnAppraisalReadState | null) {
  if (!state) {
    return {
      title: "Appraisal status unavailable",
      message: "The status could not be loaded. Return to the dashboard and try again when the network is stable.",
    };
  }

  switch (state.state) {
    case "REQUEST_APPRAISAL":
      return {
        title: "No released appraisal yet",
        message: "This screen will show your official result after the appraisal is completed and released by the Director.",
      };
    case "REQUEST_PROCESSING":
      return {
        title: "Request processing",
        message: "Your appraisal request is being prepared. No released result is available yet.",
      };
    case "AWAITING_DIRECTOR_APPROVAL":
      return {
        title: "Awaiting Director approval",
        message: "The request has not yet been opened for confidential staff feedback.",
      };
    case "FEEDBACK_PERIOD_OPEN":
      return {
        title: "Feedback period open",
        message: "Confidential staff feedback is still being collected. Individual responses are not visible here.",
      };
    case "RESPONSES_CLOSED_AWAITING_REVIEW":
      return {
        title: "Responses closed",
        message: "The feedback period has ended and the evidence is waiting for official review.",
      };
    case "DIRECTOR_REVIEWING_APPRAISAL":
      return {
        title: "Director review in progress",
        message: "The evidence is under official review. The result will appear here only after release.",
      };
    case "VIEW_RELEASED_APPRAISAL":
      return {
        title: "Released result ready",
        message: "Load the verified result below. It contains overall and section evidence only.",
      };
    case "REQUEST_CLOSED":
      return {
        title: "Request closed",
        message: "This appraisal request was closed without a released result.",
      };
  }
}

function errorMessage(error: string) {
  if (error === "UNAUTHORIZED") return "Your session has expired. Sign in again.";
  if (error === "FORBIDDEN") return "This result is not available to this account.";
  if (error === "INVALID_CYCLE_ID") return "The appraisal reference is invalid.";
  if (error.startsWith("HEADTEACHER_RELEASED_RESULT_")) {
    return "The official result is not available or its release proof could not be verified.";
  }
  return "The result could not be loaded. Check the network and try again.";
}

function requestErrorMessage(error: string) {
  if (error === "UNAUTHORIZED") return "Your session has expired. Sign in again.";
  if (error === "FORBIDDEN") return "Only the Headteacher can request this appraisal.";
  if (error === "HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS") {
    return "An appraisal request already exists. Refresh the status below.";
  }
  if (error.startsWith("HEADTEACHER_FEEDBACK_")) {
    return "The appraisal request could not be opened. Review the status and try again.";
  }
  return "The appraisal request could not be completed. Check the network and try again.";
}

function newRequestKey() {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `HEADTEACHER-APPRAISAL-${randomPart}`;
}

function lifecycleStep(
  state: HeadteacherOwnAppraisalReadState | null,
  acceptedStates: HeadteacherOwnAppraisalReadState["state"][],
) {
  return state ? acceptedStates.includes(state.state) : false;
}

export default function HeadteacherReleasedResultClient({ initialState }: Props) {
  const [appraisalState, setAppraisalState] =
    useState<HeadteacherOwnAppraisalReadState | null>(initialState);
  const [result, setResult] = useState<HeadteacherReleasedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const guidance = stateGuidance(appraisalState);
  const released =
    appraisalState?.canViewReleasedAppraisal === true &&
    appraisalState.cycleStatus === "RELEASED" &&
    Boolean(appraisalState.cycleId);

  async function loadReleasedResult() {
    if (!released || !appraisalState?.cycleId || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/headteacher/headteacher-appraisal/${encodeURIComponent(appraisalState.cycleId)}/released-result`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      let payload: ReleasedResultApiResponse;
      try {
        payload = (await response.json()) as ReleasedResultApiResponse;
      } catch {
        throw new Error("INVALID_SERVER_RESPONSE");
      }

      if (!response.ok || !payload.ok) {
        setResult(null);
        setError(errorMessage(payload.ok ? "REQUEST_FAILED" : payload.error));
        return;
      }

      setResult(payload.item);
    } catch {
      setResult(null);
      setError("The result could not be loaded. Check the network and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    if (statusLoading) return;

    setStatusLoading(true);
    setError(null);
    setRequestNotice(null);

    try {
      const response = await fetch("/api/headteacher/headteacher-appraisal", {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | AppraisalStatusApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          requestErrorMessage(
            payload && !payload.ok ? payload.error : "STATUS_REFRESH_FAILED",
          ),
        );
        return;
      }

      setAppraisalState(payload.state);
      setRequestNotice("Appraisal status refreshed.");
    } catch {
      setError("The appraisal status could not load. Check the network and try again.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function requestAppraisal() {
    if (!appraisalState?.canRequestNewCycle || requesting) return;

    const confirmed = window.confirm(
      "Request a Headteacher appraisal now? The Director must approve it before confidential staff feedback opens.",
    );

    if (!confirmed) return;

    const requestKey = newRequestKey();
    setRequesting(true);
    setError(null);
    setRequestNotice(null);

    try {
      const response = await fetch("/api/headteacher/headteacher-appraisal", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          confirm: true,
          requestKey,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | AppraisalRequestApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          requestErrorMessage(
            payload && !payload.ok ? payload.error : "REQUEST_FAILED",
          ),
        );
        return;
      }

      setAppraisalState(payload.state);
      setResult(null);
      setRequestNotice(
        "Request submitted. The Director will review it before staff feedback opens.",
      );
    } catch {
      setError(
        "The connection was interrupted. Refresh the status before trying again so the request is not duplicated.",
      );
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.94),rgba(7,26,61,0.96),rgba(5,7,11,0.97))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="absolute -left-12 top-0 h-44 w-44 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#D4AF37]/14 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
            Headteacher · My Appraisal
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] sm:text-3xl">
            {guidance.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
            {guidance.message}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[#F7F4ED]">
              Status: {appraisalState?.label ?? "Unavailable"}
            </span>
            {appraisalState?.releasedAt ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[#F7F4ED]">
                Released: {dateLabel(appraisalState.releasedAt)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className={panelClass("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Appraisal action</h2>
            <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
              Request the appraisal here, then follow its progress without contacting staff individually.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {appraisalState?.canRequestNewCycle ? (
              <button
                type="button"
                disabled={requesting}
                onClick={() => void requestAppraisal()}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-extrabold text-[#071A3D] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
              >
                {requesting ? "Submitting request…" : "Request appraisal"}
              </button>
            ) : null}

            <button
              type="button"
              disabled={statusLoading}
              onClick={() => void refreshStatus()}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-70"
            >
              {statusLoading ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>

        {requestNotice ? (
          <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
            {requestNotice}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      <section className={panelClass("p-4 sm:p-5")}>
        <h2 className="text-lg font-bold text-[#F7F4ED]">Appraisal journey</h2>
        <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
          The current stage is highlighted. Staff identities and individual answers remain hidden throughout.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "1. Request",
              complete: Boolean(appraisalState?.requestedAt),
              active: lifecycleStep(appraisalState, ["REQUEST_APPRAISAL", "REQUEST_PROCESSING"]),
            },
            {
              label: "2. Director approval",
              complete: Boolean(appraisalState?.approvedAt),
              active: lifecycleStep(appraisalState, ["AWAITING_DIRECTOR_APPROVAL"]),
            },
            {
              label: "3. Staff feedback",
              complete: Boolean(appraisalState?.closedAt),
              active: lifecycleStep(appraisalState, ["FEEDBACK_PERIOD_OPEN"]),
            },
            {
              label: "4. Official review",
              complete: Boolean(appraisalState?.releasedAt),
              active: lifecycleStep(appraisalState, [
                "RESPONSES_CLOSED_AWAITING_REVIEW",
                "DIRECTOR_REVIEWING_APPRAISAL",
              ]),
            },
            {
              label: "5. Released result",
              complete: Boolean(appraisalState?.releasedAt),
              active: lifecycleStep(appraisalState, ["VIEW_RELEASED_APPRAISAL"]),
            },
          ].map((step) => (
            <div
              key={step.label}
              className={
                step.active
                  ? "rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3"
                  : step.complete
                    ? "rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3"
                    : "rounded-2xl border border-white/10 bg-[#0C1730] p-3"
              }
            >
              <p className="text-sm font-bold text-[#F7F4ED]">{step.label}</p>
              <p className="mt-1 text-xs text-[#C9CDD6]">
                {step.active ? "Current stage" : step.complete ? "Completed" : "Not reached"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={panelClass("p-4 sm:p-5")}>
        <h2 className="text-base font-bold text-[#F7F4ED]">Privacy boundary</h2>
        <p className="mt-2 text-sm leading-7 text-[#C9CDD6]">
          This screen does not show individual staff responses, respondent identities, response counts, reviewer identity, assessor identity, or item-level ratings.
        </p>
      </section>

      {released ? (
        <section className={panelClass("p-4 sm:p-5")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#F7F4ED]">Official released result</h2>
              <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                Load only when you are ready. The page does not poll or refresh in the background.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadReleasedResult()}
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-extrabold text-[#071A3D] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "Loading verified result…" : result ? "Reload verified result" : "Load my released result"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
              {error}
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <section className={panelClass("p-4 sm:p-5")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  Verified release
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-[#F7F4ED]">
                  {result.cycle.schoolName}
                </h2>
                <p className="mt-1 text-sm text-[#C9CDD6]">{result.cycle.districtName}</p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                Release record verified
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">Released</p>
                <p className="mt-2 text-sm font-bold text-[#F7F4ED]">{dateLabel(result.cycle.releasedAt)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">Observation date</p>
                <p className="mt-2 text-sm font-bold text-[#F7F4ED]">{dateLabel(result.supervisoryAssessment.dateObserved)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">Proof reference</p>
                <p className="mt-2 font-mono text-sm font-bold text-[#F7F4ED]">
                  {result.release.releaseProofHash.slice(0, 12)}…
                </p>
              </div>
            </div>
          </section>

          <section className={panelClass("p-4 sm:p-5")}>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Overall evidence</h2>
            <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
              The two evidence streams remain separate. No combined appraisal score is created.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Staff feedback</p>
                <p className="mt-2 text-3xl font-extrabold text-[#F7F4ED]">
                  {percentage(result.comparison.overall.staffFeedbackPercentage)}
                </p>
              </div>
              <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-100">Supervisory assessment</p>
                <p className="mt-2 text-3xl font-extrabold text-[#F7F4ED]">
                  {percentage(result.comparison.overall.supervisoryPercentage)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C9CDD6]">Difference</p>
                <p className="mt-2 text-xl font-extrabold text-[#F7F4ED]">
                  {difference(result.comparison.overall.supervisoryMinusStaffPercentagePoints)}
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-2xl border border-white/10 bg-[#0C1730] p-4 text-sm leading-7 text-[#C9CDD6]">
              Difference means supervisory percentage minus staff-feedback percentage. A positive value means the supervisory percentage is higher; a negative value means the staff-feedback percentage is higher. No performance threshold is applied.
            </p>
          </section>

          <section className={panelClass("p-4 sm:p-5")}>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Four-section comparison</h2>
            <p className="mt-1 text-sm leading-6 text-[#C9CDD6]">
              Read each section calmly. The figures describe two separate evidence sources.
            </p>

            <div className="mt-4 space-y-3">
              {result.comparison.sections.map((section) => (
                <article
                  key={section.sectionKey}
                  className="rounded-[24px] border border-white/10 bg-[#0C1730] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8F98A8]">
                        Section {section.sectionOrder}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-[#F7F4ED]">
                        {section.sectionTitle}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-3">
                      <p className="text-xs text-cyan-100">Staff feedback</p>
                      <p className="mt-1 text-xl font-extrabold text-[#F7F4ED]">
                        {percentage(section.staffFeedbackPercentage)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-indigo-300/15 bg-indigo-400/8 p-3">
                      <p className="text-xs text-indigo-100">Supervisory</p>
                      <p className="mt-1 text-xl font-extrabold text-[#F7F4ED]">
                        {percentage(section.supervisoryPercentage)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-xs text-[#C9CDD6]">Difference</p>
                      <p className="mt-1 text-sm font-extrabold text-[#F7F4ED]">
                        {difference(section.supervisoryMinusStaffPercentagePoints)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={panelClass("p-4 sm:p-5")}>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Director’s release note</h2>
            <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/10 bg-[#0C1730] p-4 text-sm leading-7 text-[#F7F4ED]">
              {result.release.releaseNote || "No release note was included."}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
