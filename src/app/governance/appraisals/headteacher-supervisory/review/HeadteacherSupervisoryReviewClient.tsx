"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type ReviewQueueItem = {
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
  assessorRole: "SISSO" | "BASIC_SCHOOL_COORDINATOR";
  assessorOfficeLabel: string;
  state: "READY_TO_START" | "READY_TO_REVIEW";
  nextAction: "START_REVIEW" | "CONTINUE_REVIEW";
  eligible: true;
};

type ReviewQueue = {
  actorRole: string;
  officeLabel: string;
  summary: {
    assessments: number;
    circuits: number;
    schools: number;
  };
  items: ReviewQueueItem[];
  readOnlyDiscovery: true;
  supervisoryEvidenceIncluded: false;
  staffFeedbackIncluded: false;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  contactDetailsIncluded: false;
  assessorUserIdIncluded: false;
  targetUserIdIncluded: false;
  reviewIdIncluded: false;
  assignmentIdsIncluded: false;
  proofHashesIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

type ReviewItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  score: number | null;
  notApplicable: boolean;
  percentage: number | null;
};

type ReviewSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionDescription: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  rawScore: number;
  applicableMaximum: number;
  notApplicableItems: number;
  items: ReviewItem[];
};

type ReviewPackage = {
  schemaVersion: 1;
  audience: "HEAD_OF_SUPERVISION";
  lifecycleState: "READY_TO_START" | "READY_TO_REVIEW";
  cycle: {
    id: string;
    status: "CLOSED" | "UNDER_REVIEW";
    targetName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
  };
  review: null | {
    stage: 1;
    decision: "PENDING";
    startedAt: string;
  };
  assessment: {
    id: string;
    revision: number;
    status: "FINALIZED";
    dateObserved: string;
    finalizedAt: string;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    assessor: {
      name: string;
      role: "SISSO" | "BASIC_SCHOOL_COORDINATOR";
      office: string;
      scopeLevel: "CIRCUIT" | "DISTRICT";
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
    sections: ReviewSection[];
  };
  privacy: {
    staffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    participantListIncluded: false;
    contactDetailsIncluded: false;
    assessorUserIdIncluded: false;
    targetUserIdIncluded: false;
    reviewerUserIdIncluded: false;
    assignmentIdsIncluded: false;
    proofHashesIncluded: false;
  };
  integrity: {
    finalizedAssessmentVerified: true;
    assessmentHashVerified: true;
    visitContextHashVerified: true;
    calculationsVerified: true;
    instrumentVerified: true;
    currentTargetScopeVerified: true;
    currentHosAssignmentVerified: true;
    noExistingReviewCustody: boolean;
    activeReviewCustodyVerified: boolean;
    reviewerMayRewriteScores: false;
    scoreMutationAllowed: false;
    separateFromStaffFeedback: true;
    combinedWeightingDefined: false;
    providerCalled: false;
  };
};

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
  details?: unknown;
};

type QueueResponse =
  | { ok: true; reviewQueue: ReviewQueue }
  | ApiFailure;

type PackageResponse =
  | { ok: true; reviewPackage: ReviewPackage }
  | ApiFailure;

type StartResponse =
  | {
      ok: true;
      result: {
        outcome: "STARTED" | "EXISTING_REVIEW";
      };
    }
  | ApiFailure;

type DecisionOutcome =
  | "RETURNED"
  | "FORWARDED"
  | "EXISTING_RETURNED"
  | "EXISTING_FORWARDED";

type DecisionResponse =
  | {
      ok: true;
      result: {
        outcome: DecisionOutcome;
        assessmentStatus: "RETURNED" | "FINALIZED";
        cycleStatus: "UNDER_REVIEW";
        reviewDecision: "RETURNED" | "ACCEPTED";
        revisionRequired: boolean;
        nextReviewCreated: false;
      };
    }
  | ApiFailure;

type Props = {
  initialAssessmentId?: string;
};

const QUEUE_ENDPOINT =
  "/api/governance/appraisals/headteacher-supervisory/review-queue";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function friendlyError(payload: ApiFailure | null, fallback: string) {
  const message = clean(payload?.message);
  if (message) return message;

  const code = clean(payload?.error);
  if (!code) return fallback;

  const known: Record<string, string> = {
    UNAUTHORIZED: "Your session has expired. Please sign in again.",
    FORBIDDEN: "This Headteacher review action is not authorized for your role.",
    INVALID_ASSESSMENT_ID: "This Headteacher report reference is invalid.",
    HEADTEACHER_SUPERVISORY_REVIEW_START_CONFIRMATION_REQUIRED:
      "Please confirm before starting this review.",
    HEADTEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_REQUIRED:
      "Enter a clear correction reason before returning this report.",
    HEADTEACHER_SUPERVISORY_HOS_DECISION_RETURN_REASON_TOO_LONG:
      "The correction reason is too long.",
  };

  return known[code] ?? `${fallback} (${code})`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function formatDate(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return "—";
  return text;
}

function paperValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function wholePercentage(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value)}%`;
}

function itemScoreLabel(item: ReviewItem) {
  if (item.notApplicable) return "N/A";
  return item.score === null ? "—" : String(item.score);
}

function reviewScoreTone(score: number | null, notApplicable: boolean) {
  if (notApplicable) return "bg-slate-200 text-slate-900";

  if (score === 1) return "bg-rose-100 text-rose-950";
  if (score === 2) return "bg-orange-100 text-orange-950";
  if (score === 3) return "bg-amber-100 text-amber-950";
  if (score === 4) return "bg-cyan-100 text-cyan-950";
  if (score === 5) return "bg-emerald-100 text-emerald-950";

  return "bg-slate-50 text-slate-700";
}

function queueStateLabel(item: ReviewQueueItem) {
  return item.state === "READY_TO_START" ? "New report" : "Review in progress";
}

function queueStateTone(item: ReviewQueueItem) {
  return item.state === "READY_TO_START"
    ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
    : "border-sky-300/30 bg-sky-400/12 text-sky-100";
}

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-slate-950/55 shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${extra}`;
}

function QueueCard({
  item,
  busy,
  onOpen,
}: {
  item: ReviewQueueItem;
  busy: boolean;
  onOpen: (item: ReviewQueueItem) => void;
}) {
  return (
    <article className="w-full rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(13,20,31,0.96),rgba(7,12,20,0.96))] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(190px,230px)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black text-white md:text-lg">
              {item.targetName || "Headteacher"}
            </p>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${queueStateTone(item)}`}
            >
              {queueStateLabel(item)}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-200">
            {item.schoolName}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {item.circuitName} · {formatDate(item.dateObserved)} · Rev {item.revision}
          </p>
        </div>

        <div className="border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Assessed by
          </p>
          <p className="mt-1 text-sm font-black text-white">
            {item.assessorOfficeLabel}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onOpen(item)}
          className="min-h-12 w-full rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-black text-cyan-50 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-55"
        >
          Open report
        </button>
      </div>
    </article>
  );
}

function QueueGroup({
  title,
  copy,
  items,
  busy,
  onOpen,
}: {
  title: string;
  copy: string;
  items: ReviewQueueItem[];
  busy: boolean;
  onOpen: (item: ReviewQueueItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#E8C96A]">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-300">{copy}</p>
        </div>
        <span className="text-sm font-black text-white">{items.length}</span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <QueueCard
            key={item.assessmentId}
            item={item}
            busy={busy}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function OfficialReviewPaper({ reviewPackage }: { reviewPackage: ReviewPackage }) {
  const assessment = reviewPackage.assessment;
  const visit = assessment.visit;
  const sections = assessment.sections;
  const rawTotal = sections.reduce((sum, section) => sum + section.rawScore, 0);
  const applicableMaximum = sections.reduce(
    (sum, section) => sum + section.applicableMaximum,
    0,
  );
  const officialMaximum = sections.reduce(
    (sum, section) => sum + section.sectionMaxScore,
    0,
  );
  const notApplicableItems = sections.reduce(
    (sum, section) => sum + section.notApplicableItems,
    0,
  );

  return (
    <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-4">
      <div className="min-w-[1040px] overflow-hidden rounded-[20px] bg-white text-slate-950 shadow-[0_16px_55px_rgba(0,0,0,0.30)]">
        <div className="border-b-2 border-slate-900 px-6 py-5 text-center">
          <p className="text-[13px] font-black uppercase tracking-[0.12em]">
            {reviewPackage.cycle.districtName || "District Education Directorate"}
          </p>
          <h3 className="mt-1 text-[16px] font-black uppercase">
            Monitoring and Inspection Sheet (Headteachers)
          </h3>
          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.10em] text-indigo-800">
            Head of Supervision review copy · read-only
          </p>
        </div>

        <table className="w-full border-collapse text-[12px] leading-5">
          <tbody>
            {[
              [
                "Name of School",
                reviewPackage.cycle.schoolName,
                "Staff Strength",
                visit.staffStrength,
              ],
              [
                "Name of Circuit",
                reviewPackage.cycle.circuitName,
                "Total Enrolment",
                visit.totalEnrolment,
              ],
              [
                "Name of Head",
                reviewPackage.cycle.targetName,
                "Girls",
                visit.girls,
              ],
              [
                "Date of Visit",
                formatDate(assessment.dateObserved),
                "Boys",
                visit.boys,
              ],
              [
                "Arrival Time",
                formatTime(visit.arrivalTime),
                "Teachers Present at the Time of Visit",
                visit.teachersPresentAtVisit,
              ],
              [
                "Assessor",
                `${assessment.assessor.name} · ${assessment.assessor.office}`,
                "Revision",
                assessment.revision,
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

        <div
          className={`border-x border-b border-slate-300 px-4 py-3 text-[11px] leading-5 ${
            visit.officialDetailsAvailable
              ? "bg-emerald-50 text-emerald-950"
              : "bg-amber-50 text-amber-950"
          }`}
        >
          {visit.officialDetailsAvailable
            ? "Official visit particulars are displayed from the locked finalized assessment. They cannot be edited during HOS review."
            : "This historical assessment predates the expanded visit header. Missing values are shown as not captured rather than reconstructed."}
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
            {sections.map((section) => (
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
                    label: string;
                    score: number | null;
                    notApplicable: boolean;
                  }> = [
                    { label: "N/A", score: null, notApplicable: true },
                    ...[1, 2, 3, 4, 5].map((score) => ({
                      label: String(score),
                      score,
                      notApplicable: false,
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
                            aria-label={
                              selected
                                ? `Selected ${option.label}`
                                : `Not selected ${option.label}`
                            }
                            className={`border border-slate-300 px-1 py-2 text-center text-[15px] font-black ${
                              selected
                                ? reviewScoreTone(
                                    option.score,
                                    option.notApplicable,
                                  )
                                : "text-slate-300"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </td>
                        );
                      })}
                      <td
                        className={`border border-slate-300 px-2 py-2 text-center text-[12px] font-black ${reviewScoreTone(
                          item.score,
                          item.notApplicable,
                        )}`}
                      >
                        {itemScoreLabel(item)}
                      </td>
                    </tr>
                  );
                })}

                <tr className="bg-slate-100">
                  <td
                    colSpan={8}
                    className="border border-slate-300 px-3 py-2 text-right font-black uppercase"
                  >
                    Total score
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-center text-[12px] font-black">
                    {section.rawScore} / {section.applicableMaximum}
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
              </Fragment>
            ))}

            <tr className="bg-[#22344F] text-white">
              <td
                colSpan={8}
                className="border border-slate-300 px-3 py-3 text-right text-[12px] font-black uppercase"
              >
                Overall percentage — average of the four official section percentages
              </td>
              <td className="border border-slate-300 px-2 py-3 text-center text-[14px] font-black">
                {wholePercentage(assessment.overallPercentage)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-4 border-x border-b border-slate-300 bg-slate-50 text-[11px]">
          <div className="border-r border-slate-300 px-3 py-3">
            <p className="font-black uppercase text-slate-500">Raw total</p>
            <p className="mt-1 text-base font-black">
              {rawTotal} / {applicableMaximum}
            </p>
          </div>
          <div className="border-r border-slate-300 px-3 py-3">
            <p className="font-black uppercase text-slate-500">Official maximum</p>
            <p className="mt-1 text-base font-black">{officialMaximum}</p>
          </div>
          <div className="border-r border-slate-300 px-3 py-3">
            <p className="font-black uppercase text-slate-500">N/A exclusions</p>
            <p className="mt-1 text-base font-black">{notApplicableItems}</p>
          </div>
          <div className="px-3 py-3">
            <p className="font-black uppercase text-slate-500">Final result</p>
            <p className="mt-1 text-base font-black">
              {wholePercentage(assessment.overallPercentage)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeadteacherSupervisoryReviewClient({
  initialAssessmentId = "",
}: Props) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [reviewPackage, setReviewPackage] = useState<ReviewPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const groups = useMemo(() => {
    const items = queue?.items ?? [];
    return {
      newReports: items.filter((item) => item.state === "READY_TO_START"),
      continueReview: items.filter((item) => item.state === "READY_TO_REVIEW"),
    };
  }, [queue]);

  async function loadReviewPackage(
    assessmentId: string,
    fallbackItem?: ReviewQueueItem | null,
  ) {
    const id = clean(assessmentId);
    if (!id) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    setReturnOpen(false);
    setReturnReason("");

    try {
      const response = await fetch(
        `${QUEUE_ENDPOINT}/${encodeURIComponent(id)}/package`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readJson<PackageResponse>(response);
      if (!response.ok || !payload || payload.ok !== true) {
        setError(
          friendlyError(
            payload as ApiFailure | null,
            "The Headteacher report could not be opened.",
          ),
        );
        return;
      }

      const queueItem =
        fallbackItem ??
        queue?.items.find((item) => item.assessmentId === id) ??
        null;
      setSelectedItem(queueItem);
      setReviewPackage(payload.reviewPackage);
    } catch {
      setError(
        "Network interrupted while opening this report. Nothing was changed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadQueue(preferredAssessmentId?: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(QUEUE_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await readJson<QueueResponse>(response);
      if (!response.ok || !payload || payload.ok !== true) {
        setQueue(null);
        setError(
          friendlyError(
            payload as ApiFailure | null,
            "Headteacher review work could not be loaded.",
          ),
        );
        return;
      }

      setQueue(payload.reviewQueue);

      const preferredId = clean(preferredAssessmentId);
      if (preferredId) {
        const preferred = payload.reviewQueue.items.find(
          (item) => item.assessmentId === preferredId,
        );
        if (preferred) {
          await loadReviewPackage(preferred.assessmentId, preferred);
        }
      }
    } catch {
      setQueue(null);
      setError(
        "Network interrupted while loading Headteacher review work. Try Refresh.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue(initialAssessmentId);
    // One explicit initial read only. No interval, polling or browser persistence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssessmentId]);

  async function startReview() {
    if (
      !selectedItem ||
      selectedItem.state !== "READY_TO_START" ||
      selectedItem.nextAction !== "START_REVIEW" ||
      reviewPackage?.lifecycleState !== "READY_TO_START"
    ) {
      setError("Refresh this report before starting review.");
      return;
    }

    if (
      !window.confirm(
        `Start the Head of Supervision review of ${selectedItem.targetName || "this Headteacher"}'s finalized report? Scores remain read-only.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `${QUEUE_ENDPOINT}/${encodeURIComponent(selectedItem.assessmentId)}/start`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = await readJson<StartResponse>(response);
      if (!response.ok || !payload || payload.ok !== true) {
        setError(
          friendlyError(
            payload as ApiFailure | null,
            "The Headteacher review could not be started.",
          ),
        );
        return;
      }

      setNotice(
        payload.result.outcome === "STARTED"
          ? "Review started securely. The report remains read-only."
          : "This review was already started. The existing review has been reopened safely.",
      );
      await loadQueue(selectedItem.assessmentId);
    } catch {
      setError(
        "Network interrupted. Do not repeat the action blindly. Refresh first; the protected start endpoint is retry-safe.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision(action: "RETURN" | "FORWARD") {
    if (
      !selectedItem ||
      reviewPackage?.lifecycleState !== "READY_TO_REVIEW" ||
      reviewPackage.review?.decision !== "PENDING"
    ) {
      setError("Refresh this report before making a review decision.");
      return;
    }

    const reason = clean(returnReason);
    if (action === "RETURN" && (reason.length < 3 || reason.length > 2_000)) {
      setError("Return reason must be between 3 and 2,000 characters.");
      return;
    }

    const confirmation =
      action === "RETURN"
        ? `Return this report to ${reviewPackage.assessment.assessor.office} for correction? The finalized scores will not be rewritten by the reviewer.`
        : `Forward this finalized Headteacher report to the District Director? The HOS review will be recorded as accepted and the scores will remain unchanged.`;

    if (!window.confirm(confirmation)) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `${QUEUE_ENDPOINT}/${encodeURIComponent(selectedItem.assessmentId)}/decision`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            action === "RETURN"
              ? { action: "RETURN", reason, confirm: true }
              : { action: "FORWARD", confirm: true },
          ),
        },
      );
      const payload = await readJson<DecisionResponse>(response);
      if (!response.ok || !payload || payload.ok !== true) {
        setError(
          friendlyError(
            payload as ApiFailure | null,
            action === "RETURN"
              ? "The report could not be returned for correction."
              : "The report could not be forwarded to the District Director.",
          ),
        );
        return;
      }

      setReviewPackage(null);
      setSelectedItem(null);
      setReturnOpen(false);
      setReturnReason("");
      setNotice(
        action === "RETURN"
          ? "Report returned for correction. The original SISSO or Basic School Coordinator must create and finalize the correction revision."
          : "Report forwarded to the District Director. Your HOS review is recorded and the assessment remains unchanged.",
      );
      await loadQueue();
    } catch {
      setError(
        "Network interrupted. Refresh the queue before retrying so you do not duplicate a completed decision.",
      );
    } finally {
      setBusy(false);
    }
  }

  function backToQueue() {
    setSelectedItem(null);
    setReviewPackage(null);
    setReturnOpen(false);
    setReturnReason("");
    setError(null);
  }

  const showingReport = Boolean(reviewPackage);

  return (
    <main className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                EduLife OS · {queue?.officeLabel || "Headteacher review"}
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                Review Headteacher Reports
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                New reports from SISSO and Basic School Coordinators appear first.
                Review custody remains durable on the server after a browser restart
                or weak-network interruption.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/district/hos/dashboard"
                className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.09]"
              >
                ← Dashboard
              </Link>
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => void loadQueue()}
                className="min-h-12 rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh work list"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 p-4 text-sm leading-6 text-rose-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/12 p-4 text-sm leading-6 text-emerald-100">
            {notice}
          </div>
        ) : null}

        {!showingReport ? (
          <>
            {queue ? (
              <section className="grid grid-cols-3 gap-2 md:gap-4">
                {[
                  ["New", groups.newReports.length],
                  ["In review", groups.continueReview.length],
                  ["Total reports", queue.summary.assessments],
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
            ) : null}

            {loading ? (
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                <p className="text-sm text-slate-300">Loading your review work…</p>
              </section>
            ) : null}

            {!loading && queue && queue.items.length === 0 ? (
              <div className={panel("p-6 text-center")}>
                <p className="text-lg font-black text-white">No Headteacher reports need HOS review.</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Finalized SISSO or Basic School Coordinator reports will appear here
                  when they enter your authorized district review queue.
                </p>
              </div>
            ) : null}

            <QueueGroup
              title="New reports"
              copy="Open the finalized report, inspect the complete official form, then start review."
              items={groups.newReports}
              busy={busy}
              onOpen={(item) => void loadReviewPackage(item.assessmentId, item)}
            />

            <QueueGroup
              title="Continue review"
              copy="These reports are already in your HOS custody and can be reopened after refresh or browser restart."
              items={groups.continueReview}
              busy={busy}
              onOpen={(item) => void loadReviewPackage(item.assessmentId, item)}
            />
          </>
        ) : null}

        {reviewPackage ? (
          <section className="space-y-4">
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                    Headteacher review · read-only
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                    {reviewPackage.cycle.targetName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {reviewPackage.cycle.schoolName} · {reviewPackage.cycle.circuitName}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Assessed by {reviewPackage.assessment.assessor.office}.{" "}
                    {reviewPackage.lifecycleState === "READY_TO_START"
                      ? "Inspect the complete locked appraisal below, then start HOS review."
                      : "Review stage 1 is active. Inspect the same locked appraisal, then return it for correction or forward it to the District Director."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={backToQueue}
                  className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.09] disabled:opacity-55"
                >
                  ← Back to work list
                </button>
              </div>
            </div>

            <section className="grid grid-cols-3 gap-2 md:gap-4">
              {[
                ["Revision", reviewPackage.assessment.revision],
                ["Observed", formatDate(reviewPackage.assessment.dateObserved)],
                ["Overall", wholePercentage(reviewPackage.assessment.overallPercentage)],
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

            <OfficialReviewPaper reviewPackage={reviewPackage} />

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              {reviewPackage.lifecycleState === "READY_TO_START" ? (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                      HOS review admission
                    </p>
                    <h3 className="mt-1 text-lg font-black text-white">
                      Start review after checking the complete form
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      Starting review takes custody of this finalized report. It does
                      not change any score or visit evidence.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startReview()}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-black text-[#071A3D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {busy ? "Starting review…" : "Start review"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                      HOS decision · stage 1
                    </p>
                    <h3 className="mt-1 text-lg font-black text-white">
                      Return for correction or forward to Director
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      You cannot rewrite the assessor&apos;s scores. Return requires a
                      clear correction reason. Forward records HOS acceptance and
                      passes the governance report to the District Director.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setReturnOpen((current) => !current)}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-55"
                    >
                      Return for correction
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitDecision("FORWARD")}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-sm font-black text-[#071A3D] transition hover:brightness-105 disabled:opacity-55"
                    >
                      {busy ? "Working…" : "Forward to Director"}
                    </button>
                  </div>

                  {returnOpen ? (
                    <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4">
                      <label
                        htmlFor="headteacher-hos-return-reason"
                        className="text-sm font-black text-white"
                      >
                        Reason for correction
                      </label>
                      <p className="mt-1 text-xs leading-5 text-rose-100/80">
                        Be specific enough for the SISSO or Basic School Coordinator
                        to know what must be corrected. 3–2,000 characters.
                      </p>
                      <textarea
                        id="headteacher-hos-return-reason"
                        value={returnReason}
                        onChange={(event) => setReturnReason(event.target.value)}
                        maxLength={2_000}
                        rows={4}
                        disabled={busy}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm leading-6 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-rose-300/50 disabled:opacity-55"
                        placeholder="State the exact correction required…"
                      />
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-rose-100/70">
                          {returnReason.length} / 2,000
                        </span>
                        <button
                          type="button"
                          disabled={busy || clean(returnReason).length < 3}
                          onClick={() => void submitDecision("RETURN")}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {busy ? "Returning…" : "Confirm return"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <p className="pb-2 text-center text-xs leading-5 text-slate-500">
          Explicit actions only · no background polling · no persistent browser storage
        </p>
      </div>
    </main>
  );
}
