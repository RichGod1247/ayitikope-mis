"use client";

import { Fragment, useState } from "react";
import type { HeadteacherReleasedResult } from "@/lib/appraisals/headteacherReleasedResult";
import type { HeadteacherOwnAppraisalReadState } from "@/lib/appraisals/headteacherFeedbackReadStates";

export const HEADTEACHER_RELEASED_RESULT_UI_POLICY = {
  audience: "HEADTEACHER",
  expectedSections: 4,
  expectedSupervisoryItems: 34,
  presentation: "AGGREGATE_STAFF_AND_NATIVE_SUPERVISORY",
  loadingMode: "EXPLICIT_BUTTON_ONLY",
  backgroundPollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  comparisonDirection: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
  comparisonThresholdsDefined: false,
  combinedScoreIncluded: false,
  responseCountsIncluded: false,
  staffItemAveragesIncluded: false,
  supervisoryItemScoresIncluded: true,
  supervisoryItemScoresReadOnly: true,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  reviewerIdentityIncluded: false,
  assessorIdentityIncluded: false,
  resultMutationAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  deterministicDateLocale: "en-GH",
  deterministicDateTimeZone: "Africa/Accra",
  staffPercentageExplanationIncluded: true,
  supervisoryVisitDetailsIncluded: true,
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

type ReleasedResultView =
  | "OVERVIEW"
  | "STAFF"
  | "SUPERVISORY"
  | "COMPARISON";

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
  return `${Math.round(Number(value))}%`;
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
  return new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(date);
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
        message:
          "Load the verified result below. It contains aggregate staff evidence and the finalized native supervisory form.",
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

function releasedResultContractSafe(item: HeadteacherReleasedResult) {
  return (
    item.audience === "RELEASED_HEADTEACHER" &&
    item.lifecycleState === "RELEASED" &&
    item.privacy.responseCountsIncluded === false &&
    item.privacy.staffItemAveragesIncluded === false &&
    item.privacy.supervisoryItemScoresIncluded === true &&
    item.privacy.respondentIdentitiesIncluded === false &&
    item.privacy.individualStaffResponsesIncluded === false &&
    item.privacy.participantListIncluded === false &&
    item.privacy.responseHashesIncluded === false &&
    item.privacy.reviewerIdentityIncluded === false &&
    item.privacy.assessorIdentityIncluded === false &&
    item.privacy.contactDetailsIncluded === false &&
    item.integrity.separateEvidenceStreams === true &&
    item.integrity.combinedWeightingDefined === false &&
    item.integrity.scoreMutationAllowed === false &&
    item.comparison.combinedOverallPercentage === null &&
    item.staffFeedback.sections.length === 4 &&
    item.supervisoryAssessment.sections.length === 4 &&
    item.supervisoryAssessment.sections.reduce(
      (sum, section) => sum + section.items.length,
      0,
    ) === 34 &&
    (item.supervisoryAssessment.visit === null ||
      (item.supervisoryAssessment.visit.schemaVersion === 1 &&
        /^\d{2}:\d{2}$/.test(
          item.supervisoryAssessment.visit.arrivalTime,
        )))
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
  return String(value ?? "").trim() || "Not included in this released record";
}

function ResultBackButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm font-black text-slate-100"
    >
      Back to evidence
    </button>
  );
}

function ReleasedEvidenceGateway(props: {
  result: HeadteacherReleasedResult;
  onView: (view: ReleasedResultView) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <button
        type="button"
        onClick={() => props.onView("STAFF")}
        className="group rounded-[26px] border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,145,178,0.20),rgba(15,23,42,0.96))] p-5 text-left transition hover:border-cyan-300/40"
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
          Confidential evidence
        </p>
        <h2 className="mt-2 text-xl font-black text-white">
          Staff feedback aggregate
        </h2>
        <p className="mt-3 text-sm leading-6 text-cyan-50/80">
          View only the official overall and four-section staff averages. No
          respondent, response count or individual form is included.
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="text-3xl font-black text-white">
            {percentage(props.result.staffFeedback.overallPercentage)}
          </p>
          <span className="text-sm font-black text-cyan-100 group-hover:translate-x-1">
            Open aggregate →
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => props.onView("SUPERVISORY")}
        className="group rounded-[26px] border border-indigo-300/20 bg-[linear-gradient(145deg,rgba(79,70,229,0.20),rgba(15,23,42,0.96))] p-5 text-left transition hover:border-indigo-300/40"
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">
          Official supervisory evidence
        </p>
        <h2 className="mt-2 text-xl font-black text-white">
          Native assessment sheet
        </h2>
        <p className="mt-3 text-sm leading-6 text-indigo-50/80">
          Open the finalized four-section, 34-indicator Monitoring and
          Inspection Sheet. Scores are read-only.
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="text-3xl font-black text-white">
            {percentage(
              props.result.supervisoryAssessment.overallPercentage,
            )}
          </p>
          <span className="text-sm font-black text-indigo-100 group-hover:translate-x-1">
            Open official form →
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => props.onView("COMPARISON")}
        className="group rounded-[26px] border border-amber-300/20 bg-[linear-gradient(145deg,rgba(180,83,9,0.20),rgba(15,23,42,0.96))] p-5 text-left transition hover:border-amber-300/40"
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">
          Evidence comparison
        </p>
        <h2 className="mt-2 text-xl font-black text-white">
          Compare without combining
        </h2>
        <p className="mt-3 text-sm leading-6 text-amber-50/80">
          Compare the two evidence streams overall and by section. No combined
          appraisal score or performance threshold is created.
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="text-lg font-black text-white">
            {difference(
              props.result.comparison.overall
                .supervisoryMinusStaffPercentagePoints,
            )}
          </p>
          <span className="text-sm font-black text-amber-100 group-hover:translate-x-1">
            Open comparison →
          </span>
        </div>
      </button>
    </section>
  );
}

function StaffAggregateView(props: {
  result: HeadteacherReleasedResult;
  onBack: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className={panelClass("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
              Confidential staff evidence · aggregate only
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Staff feedback summary
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
              This released view contains the verified overall and four-section
              averages only. It does not contain respondent labels, identities,
              response counts, individual forms or staff item-level averages.
            </p>
          </div>
          <ResultBackButton onClick={props.onBack} />
        </div>
      </div>

      <div className={panelClass("p-4 sm:p-5")}>
        <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">
            Overall staff-feedback average
          </p>
          <p className="mt-2 text-4xl font-black text-white">
            {percentage(props.result.staffFeedback.overallPercentage)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {props.result.staffFeedback.sections.map((section) => (
            <article
              key={section.sectionKey}
              className="rounded-[24px] border border-white/10 bg-[#0C1730] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">
                Section {section.sectionOrder}
              </p>
              <h3 className="mt-2 text-base font-black leading-6 text-white">
                {section.sectionTitle}
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <p className="text-xs text-[#8F98A8]">
                    Average section result
                  </p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {percentage(section.averagePercentage)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left sm:text-right">
                  <p className="text-xs font-semibold text-[#C9CDD6]">
                    Full section scale: {section.sectionMaxScore} points
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[#8F98A8]">
                    {Math.round(section.sectionMaxScore / 5)} indicators × 5
                  </p>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.055] px-3 py-2.5">
                <summary className="cursor-pointer text-xs font-bold text-cyan-100">
                  How this percentage was calculated
                </summary>
                <p className="mt-2 text-xs leading-6 text-[#C9CDD6]">
                  Each finalized respondent’s N/A indicators are excluded from
                  that person’s applicable maximum first. The percentages that
                  remain are then averaged for this section. The full scale is
                  shown for orientation; it is not a reconstructed raw score.
                </p>
              </details>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SupervisoryNativeForm(props: {
  result: HeadteacherReleasedResult;
  onBack: () => void;
}) {
  const sections = props.result.supervisoryAssessment.sections;
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
    <section className="space-y-4">
      <div className={panelClass("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">
              Official supervisory evidence · read-only
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Native Monitoring and Inspection Sheet
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
              This is the finalized supervisory form included in your released
              result. The scores are immutable, and no assessor identity or
              contact detail is included.
            </p>
          </div>
          <ResultBackButton onClick={props.onBack} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
        <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
          <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
            <p className="text-[13px] font-black uppercase tracking-[0.12em]">
              {props.result.cycle.districtName}
            </p>
            <h3 className="mt-1 text-[16px] font-black uppercase">
              Monitoring and Inspection Sheet (Headteachers)
            </h3>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.10em] text-indigo-800">
              Released supervisory evidence · verified read-only copy
            </p>
          </div>

          <table className="w-full border-collapse text-[12px] leading-5">
            <tbody>
              {[
                [
                  "Name of School",
                  props.result.cycle.schoolName,
                  "Staff Strength",
                  props.result.supervisoryAssessment.visit?.staffStrength,
                ],
                [
                  "Name of Circuit",
                  props.result.cycle.circuitName,
                  "Total Enrolment",
                  props.result.supervisoryAssessment.visit?.totalEnrolment,
                ],
                [
                  "Name of Head",
                  props.result.cycle.headteacherName,
                  "Girls",
                  props.result.supervisoryAssessment.visit?.girls,
                ],
                [
                  "Date of Visit",
                  dateLabel(
                    props.result.supervisoryAssessment.dateObserved,
                  ),
                  "Boys",
                  props.result.supervisoryAssessment.visit?.boys,
                ],
                [
                  "Arrival Time",
                  props.result.supervisoryAssessment.visit?.arrivalTime,
                  "Teachers Present at the Time of Visit",
                  props.result.supervisoryAssessment.visit
                    ?.teachersPresentAtVisit,
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

          <div className="border-x border-b border-slate-300 bg-indigo-50 px-4 py-3 text-[11px] leading-5 text-indigo-950">
            {props.result.supervisoryAssessment.visit
              ? "Official visit particulars were captured when this assessment was created and are displayed from the immutable evidence snapshot."
              : "This historical assessment predates official visit-particular capture. Missing values are shown as not included and are never reconstructed."}
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
                    sum +
                    (item.notApplicable ? 0 : item.itemMaxScore),
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
                        {
                          score: null,
                          notApplicable: true,
                          label: "N/A",
                        },
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
                                className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${paperScoreCellTone(
                                  {
                                    selected,
                                    score: option.score,
                                    notApplicable:
                                      option.notApplicable,
                                  },
                                )}`}
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
                            className={`border border-slate-300 px-2 py-2 text-center text-[13px] font-black ${paperScoreCellTone(
                              {
                                selected: true,
                                score: item.score,
                                notApplicable: item.notApplicable,
                              },
                            )}`}
                            aria-label={
                              item.notApplicable
                                ? "Final score: Not applicable"
                                : `Final score: ${
                                    item.score ?? "Not scored"
                                  }`
                            }
                          >
                            {item.notApplicable
                              ? "N/A"
                              : item.score ?? "—"}
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
                        {percentage(section.percentage)}
                      </td>
                    </tr>
                    <tr className="bg-indigo-50 text-indigo-950">
                      <td
                        colSpan={9}
                        className="border border-slate-300 px-3 py-2 text-right text-[10px] font-semibold"
                      >
                        Official section maximum:{" "}
                        {section.sectionMaxScore}. Applicable maximum after{" "}
                        {notApplicableItems} N/A exclusion
                        {notApplicableItems === 1 ? "" : "s"}:{" "}
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
                  {percentage(
                    props.result.supervisoryAssessment.overallPercentage,
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-4 border-x border-b border-slate-300 bg-slate-50 text-[11px]">
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">
                Raw total
              </p>
              <p className="mt-1 text-base font-black">
                {rawTotal} / {applicableMaximum}
              </p>
            </div>
            <div className="border-r border-slate-300 px-3 py-3">
              <p className="font-black uppercase text-slate-500">
                Official maximum
              </p>
              <p className="mt-1 text-base font-black">
                {officialMaximum}
              </p>
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
                {percentage(
                  props.result.supervisoryAssessment.overallPercentage,
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={panelClass("grid gap-3 p-4 sm:grid-cols-4 sm:p-5")}>
        <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-3">
          <p className="text-xs text-[#8F98A8]">Revision</p>
          <p className="mt-1 text-sm font-black text-white">
            {props.result.supervisoryAssessment.revision}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-3">
          <p className="text-xs text-[#8F98A8]">Status</p>
          <p className="mt-1 text-sm font-black text-white">
            Finalized and locked
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-3">
          <p className="text-xs text-[#8F98A8]">Finalized</p>
          <p className="mt-1 text-sm font-black text-white">
            {dateLabel(
              props.result.supervisoryAssessment.finalizedAt,
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-3">
          <p className="text-xs text-[#8F98A8]">Final result</p>
          <p className="mt-1 text-sm font-black text-white">
            {percentage(
              props.result.supervisoryAssessment.overallPercentage,
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function ComparisonView(props: {
  result: HeadteacherReleasedResult;
  onBack: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className={panelClass("p-4 sm:p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">
              Evidence comparison
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Compare without combining
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
              The staff aggregate and supervisory assessment remain separate.
              No combined appraisal score or performance threshold is created.
            </p>
          </div>
          <ResultBackButton onClick={props.onBack} />
        </div>
      </div>

      <div className={panelClass("p-4 sm:p-5")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Staff feedback
            </p>
            <p className="mt-2 text-3xl font-extrabold text-white">
              {percentage(
                props.result.comparison.overall.staffFeedbackPercentage,
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-100">
              Supervisory assessment
            </p>
            <p className="mt-2 text-3xl font-extrabold text-white">
              {percentage(
                props.result.comparison.overall.supervisoryPercentage,
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C9CDD6]">
              Difference
            </p>
            <p className="mt-2 text-xl font-extrabold text-white">
              {difference(
                props.result.comparison.overall
                  .supervisoryMinusStaffPercentagePoints,
              )}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-2xl border border-white/10 bg-[#0C1730] p-4 text-sm leading-7 text-[#C9CDD6]">
          Difference means supervisory percentage minus staff-feedback
          percentage. A positive value means the supervisory percentage is
          higher; a negative value means the staff-feedback percentage is
          higher.
        </p>

        <div className="mt-4 space-y-3">
          {props.result.comparison.sections.map((section) => (
            <article
              key={section.sectionKey}
              className="rounded-[24px] border border-white/10 bg-[#0C1730] p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8F98A8]">
                Section {section.sectionOrder}
              </p>
              <h3 className="mt-1 text-base font-bold text-white">
                {section.sectionTitle}
              </h3>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-3">
                  <p className="text-xs text-cyan-100">
                    Staff feedback
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-white">
                    {percentage(section.staffFeedbackPercentage)}
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-300/15 bg-indigo-400/8 p-3">
                  <p className="text-xs text-indigo-100">
                    Supervisory
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-white">
                    {percentage(section.supervisoryPercentage)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-[#C9CDD6]">Difference</p>
                  <p className="mt-1 text-sm font-extrabold text-white">
                    {difference(
                      section.supervisoryMinusStaffPercentagePoints,
                    )}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HeadteacherReleasedResultClient({ initialState }: Props) {
  const [appraisalState, setAppraisalState] =
    useState<HeadteacherOwnAppraisalReadState | null>(initialState);
  const [result, setResult] = useState<HeadteacherReleasedResult | null>(null);
  const [resultView, setResultView] =
    useState<ReleasedResultView>("OVERVIEW");
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

      if (!releasedResultContractSafe(payload.item)) {
        setResult(null);
        setError(
          "The released-result privacy or integrity contract could not be verified. No evidence was displayed.",
        );
        return;
      }

      setResult(payload.item);
      setResultView("OVERVIEW");
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
      setResultView("OVERVIEW");
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
          This screen does not show individual staff responses, respondent
          identities, response counts, staff item-level averages, reviewer
          identity, assessor identity, or contact details. The native
          supervisory sheet shows only the finalized official assessment scores
          in read-only form.
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
                <p className="mt-1 text-sm text-[#C9CDD6]">
                  {result.cycle.circuitName} · {result.cycle.districtName}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                Release record verified
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">Released</p>
                <p className="mt-2 text-sm font-bold text-[#F7F4ED]">
                  {dateLabel(result.cycle.releasedAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">
                  Observation date
                </p>
                <p className="mt-2 text-sm font-bold text-[#F7F4ED]">
                  {dateLabel(
                    result.supervisoryAssessment.dateObserved,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
                <p className="text-xs text-[#8F98A8]">
                  Proof reference
                </p>
                <p className="mt-2 font-mono text-sm font-bold text-[#F7F4ED]">
                  {result.release.releaseProofHash.slice(0, 12)}…
                </p>
              </div>
            </div>
          </section>

          <ReleasedEvidenceGateway
            result={result}
            onView={setResultView}
          />

          {resultView === "OVERVIEW" ? (
            <section className={panelClass("p-4 sm:p-5")}>
              <h2 className="text-lg font-bold text-[#F7F4ED]">
                Choose the evidence to review
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                Open the staff aggregate, the official supervisory form or the
                comparison. The evidence streams remain separate, and no
                combined appraisal score is created.
              </p>
            </section>
          ) : null}

          {resultView === "STAFF" ? (
            <StaffAggregateView
              result={result}
              onBack={() => setResultView("OVERVIEW")}
            />
          ) : null}

          {resultView === "SUPERVISORY" ? (
            <SupervisoryNativeForm
              result={result}
              onBack={() => setResultView("OVERVIEW")}
            />
          ) : null}

          {resultView === "COMPARISON" ? (
            <ComparisonView
              result={result}
              onBack={() => setResultView("OVERVIEW")}
            />
          ) : null}

          <section className={panelClass("p-4 sm:p-5")}>
            <h2 className="text-lg font-bold text-[#F7F4ED]">
              Director’s release note
            </h2>
            <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/10 bg-[#0C1730] p-4 text-sm leading-7 text-[#F7F4ED]">
              {result.release.releaseNote ||
                "No release note was included."}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
