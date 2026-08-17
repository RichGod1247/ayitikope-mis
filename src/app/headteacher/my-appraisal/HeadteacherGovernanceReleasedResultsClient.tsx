"use client";

import { Fragment, useState } from "react";

export const HEADTEACHER_GOVERNANCE_RELEASED_RESULTS_CLIENT_POLICY = {
  schemaVersion: 1,
  audience: "HEADTEACHER",
  sectionTitle: "Governance Appraisal Reports",
  automaticLoadingAllowed: false,
  backgroundPollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  resultMutationAllowed: false,
  commentsIncluded: false,
  assessorIdentityIncluded: false,
  assessorOfficeIncluded: true,
  reviewerIdentityIncluded: false,
  staffResponsesIncluded: false,
  respondentIdentitiesIncluded: false,
  combinedScoreIncluded: false,
  staffFeedbackPrerequisite: false,
  lowNetworkMode: "EXPLICIT_LOAD",
  nativeFormParity: "DIRECTOR_FINAL_RELEASE_INSPECTION_FORM",
  recipientCopyLabelOnlyDiffers: true,
} as const;

type ReleasedSummary = {
  assessmentId: string;
  dateObserved: string;
  releasedAt: string;
  assessorOffice: "District Director";
  overallPercentage: number | null;
  schoolName: string;
  circuitName: string;
  districtName: string;
  releaseStatus: "RELEASED";
};

type ReleasedResult = {
  schemaVersion: 1;
  audience: "RELEASED_HEADTEACHER_GOVERNANCE";
  lifecycleState: "RELEASED";
  context: {
    headteacherName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
  };
  release: {
    releasedAt: string;
    integrityVerified: true;
  };
  assessment: {
    assessmentId: string;
    revision: 1;
    dateObserved: string;
    finalizedAt: string;
    assessorOffice: "District Director";
    instrumentCode: string;
    instrumentVersion: 1;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionDescription: string | null;
      sectionOrder: number;
      sectionMaxScore: number;
      percentage: number | null;
      items: Array<{
        itemKey: string;
        itemLabel: string;
        itemOrder: number;
        itemMaxScore: number;
        score: number | null;
        notApplicable: boolean;
      }>;
    }>;
  };
  visit: {
    contextSchemaVersion: 1 | 2;
    officialDetailsAvailable: boolean;
    arrivalTime: string | null;
    staffStrength: number | null;
    totalEnrolment: number | null;
    girls: number | null;
    boys: number | null;
    teachersPresentAtVisit: number | null;
  };
  privacy: {
    assessorIdentityIncluded: false;
    reviewerIdentityIncluded: false;
    reviewerAssignmentIncluded: false;
    staffResponsesIncluded: false;
    respondentIdentitiesIncluded: false;
    rawEvidenceSnapshotIncluded: false;
    rawMetadataIncluded: false;
    contactDetailsIncluded: false;
  };
  integrity: {
    separateEvidenceStreams: true;
    staffFeedbackPrerequisite: false;
    combinedWeightingDefined: false;
  };
};

type ListResponse =
  | { ok: true; items: ReleasedSummary[] }
  | { ok: false; error: string };

type DetailResponse =
  | { ok: true; result: ReleasedResult }
  | { ok: false; error: string };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

async function apiJson<T>(input: RequestInfo): Promise<T> {
  const response = await fetch(input, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error ?? "")
        : "";
    throw new Error(error || `Request failed (${response.status})`);
  }
  return payload as T;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function percentageLabel(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)}%`
    : "—";
}

function scoredTotal(
  items: Array<{ score: number | null; notApplicable: boolean }>,
) {
  return items.reduce((sum, item) => {
    if (item.notApplicable || typeof item.score !== "number") return sum;
    return sum + item.score;
  }, 0);
}

function applicableMaximum(
  items: Array<{ itemMaxScore: number; notApplicable: boolean }>,
) {
  return items.reduce(
    (sum, item) => sum + (item.notApplicable ? 0 : item.itemMaxScore),
    0,
  );
}

function wholePercentage(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value)}%`;
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
  return String(value ?? "").trim() || "Not captured in this historical record";
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100"
    >
      {message}
    </div>
  );
}

function NativeReleasedResult({ result }: { result: ReleasedResult }) {
  const officialMaximum = result.assessment.sections.reduce(
    (sum, section) => sum + section.sectionMaxScore,
    0,
  );
  const applicableMaximumTotal = result.assessment.sections.reduce(
    (sum, section) => sum + applicableMaximum(section.items),
    0,
  );
  const rawTotal = result.assessment.sections.reduce(
    (sum, section) => sum + scoredTotal(section.items),
    0,
  );
  const totalNotApplicable = result.assessment.sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.notApplicable).length,
    0,
  );

  return (
    <article className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
      <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
        <header className="border-b-2 border-slate-900 px-6 py-5 text-center">
          <p className="text-[13px] font-black uppercase tracking-[0.12em]">
            {result.context.districtName || "District Education Directorate"}
          </p>
          <h3 className="mt-1 text-[16px] font-black uppercase">
            Monitoring and Inspection Sheet (Headteachers)
          </h3>
          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.10em] text-cyan-800">
            Governance supervisory assessment · Released result copy
          </p>
        </header>

        <table className="w-full border-collapse text-[12px] leading-5">
          <tbody>
            {[
              [
                "Name of School",
                result.context.schoolName,
                "Staff Strength",
                result.visit.staffStrength,
              ],
              [
                "Name of Circuit",
                result.context.circuitName,
                "Total Enrolment",
                result.visit.totalEnrolment,
              ],
              [
                "Name of Head",
                result.context.headteacherName,
                "Girls",
                result.visit.girls,
              ],
              [
                "Date of Visit",
                dateLabel(result.assessment.dateObserved),
                "Boys",
                result.visit.boys,
              ],
              [
                "Arrival Time",
                result.visit.arrivalTime,
                "Teachers Present at the Time of Visit",
                result.visit.teachersPresentAtVisit,
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

        {result.visit.officialDetailsAvailable ? (
          <div className="border-x border-b border-slate-300 bg-emerald-50 px-4 py-3 text-[11px] leading-5 text-emerald-950">
            Official visit particulars are displayed from the locked assessment
            evidence. They are read-only in this released result.
          </div>
        ) : (
          <div className="border-x border-b border-slate-300 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-950">
            This version-1 historical assessment predates the expanded visit
            header. Missing arrival-time, staffing and enrolment values are shown
            as not captured rather than reconstructed.
          </div>
        )}

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
                  [1—Very Poor] [2—Poor] [3—Acceptable] [4—Good] [5—Very Good]
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
            {result.assessment.sections.map((section) => {
              const rawScore = scoredTotal(section.items);
              const sectionApplicableMaximum = applicableMaximum(section.items);
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
                            : !item.notApplicable && item.score === option.score;

                          return (
                            <td
                              key={option.label}
                              className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${paperScoreCellTone(
                                {
                                  selected,
                                  score: option.score,
                                  notApplicable: option.notApplicable,
                                },
                              )}`}
                              aria-label={
                                selected ? `Selected ${option.label}` : undefined
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
                  <tr className="bg-sky-50 text-sky-950">
                    <td
                      colSpan={9}
                      className="border border-slate-300 px-3 py-2 text-right text-[10px] font-semibold"
                    >
                      Official section maximum: {section.sectionMaxScore}. Applicable
                      maximum after {notApplicableItems} N/A exclusion
                      {notApplicableItems === 1 ? "" : "s"}: {sectionApplicableMaximum}.
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
                Overall percentage — average of the four official section percentages
              </td>
              <td className="border border-slate-300 px-2 py-3 text-center text-[14px] font-black">
                {wholePercentage(result.assessment.overallPercentage)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-4 border-x border-b border-slate-300 bg-slate-50 text-[11px]">
          <div className="border-r border-slate-300 px-3 py-3">
            <p className="font-black uppercase text-slate-500">Raw total</p>
            <p className="mt-1 text-base font-black">
              {rawTotal} / {applicableMaximumTotal}
            </p>
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
            <p className="mt-1 text-base font-black">
              {wholePercentage(result.assessment.overallPercentage)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HeadteacherGovernanceReleasedResultsClient() {
  const [items, setItems] = useState<ReleasedSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [result, setResult] = useState<ReleasedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiJson<ListResponse>(
        "/api/headteacher/appraisals/governance-released",
      );
      if (response.ok === false) throw new Error(response.error);

      setItems(response.items);
      setLoaded(true);

      if (
        selectedAssessmentId &&
        !response.items.some(
          (item) => item.assessmentId === selectedAssessmentId,
        )
      ) {
        setSelectedAssessmentId("");
        setResult(null);
      }
    } catch (caught) {
      setLoaded(true);
      setItems([]);
      setSelectedAssessmentId("");
      setResult(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load governance appraisal reports.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function viewReport(assessmentId: string) {
    if (selectedAssessmentId === assessmentId && result) {
      setSelectedAssessmentId("");
      setResult(null);
      return;
    }

    setDetailLoadingId(assessmentId);
    setError(null);

    try {
      const response = await apiJson<DetailResponse>(
        `/api/headteacher/appraisals/governance-released/${encodeURIComponent(assessmentId)}`,
      );
      if (response.ok === false) throw new Error(response.error);

      setSelectedAssessmentId(assessmentId);
      setResult(response.result);
    } catch (caught) {
      setSelectedAssessmentId("");
      setResult(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the released governance result.",
      );
    } finally {
      setDetailLoadingId("");
    }
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-[0.15em] text-[#E8C96A]">
              Governance Appraisal Reports
            </h2>
            {loaded ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-100">
                {items.length} released
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
            Official supervisory assessments released by governance appear here.
            They remain separate from confidential staff-feedback appraisals.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/12 px-4 py-2 text-sm font-bold text-[#F7E7A9] transition hover:bg-[#D4AF37]/18 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Loading…"
            : loaded
              ? "Refresh reports"
              : "Load governance reports"}
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#8F9AAC]">
        Low-network mode: reports load only when you request them. There is no
        background polling.
      </p>

      {error ? <div className="mt-4"><ErrorCard message={error} /></div> : null}

      {loaded && !loading && !error && items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[#C9CDD6]">
          No independently released governance appraisal is available yet.
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const active = selectedAssessmentId === item.assessmentId;
            const busy = detailLoadingId === item.assessmentId;

            return (
              <div
                key={item.assessmentId}
                className={cx(
                  "rounded-2xl border p-3 sm:p-4",
                  active
                    ? "border-cyan-300/30 bg-cyan-400/10"
                    : "border-white/10 bg-black/15",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-100">
                        Released
                      </span>
                      <span className="text-sm font-black text-white">
                        {percentageLabel(item.overallPercentage)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#F7F4ED]">
                      {item.assessorOffice}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#AEB6C4]">
                      Visit {dateLabel(item.dateObserved)} · Released {dateLabel(item.releasedAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#8F9AAC]">
                      {item.schoolName} · {item.circuitName}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => viewReport(item.assessmentId)}
                    disabled={Boolean(detailLoadingId)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy
                      ? "Opening…"
                      : active && result
                        ? "Hide governance result"
                        : "View governance result"}
                  </button>
                </div>

                {active && result ? (
                  <div className="mt-4">
                    <NativeReleasedResult result={result} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
