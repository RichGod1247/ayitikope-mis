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
  overallPercentage: number | null;
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

type BrowserPackageBase = {
  schemaVersion: 1;
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

type BrowserReviewDecisionPackage = BrowserPackageBase & {
  lifecycleState: "READY_FOR_REVIEW_DECISION";
  review: {
    reviewerRole: string;
  };
};

type BrowserDirectInspectionPackage = BrowserPackageBase & {
  lifecycleState: "READY_FOR_DIRECT_RELEASE";
  inspection: {
    actorRole: "DISTRICT_DIRECTOR";
  };
};

type BrowserReviewPackage =
  | BrowserReviewDecisionPackage
  | BrowserDirectInspectionPackage;

type DirectInspectionWorkspace = {
  assessment: {
    assessmentId: string;
    cycleId: string;
    revision: number;
    status: string;
    canEdit: boolean;
    canFinalize: boolean;
    sectionPercentages: Record<string, number | null>;
    overallPercentage: number | null;
    finalizedAt: string | null;
  };
  lifecycle: {
    assessmentId: string;
    cycleId: string;
    revision: number;
    status: string;
    originalAssessorOnly: true;
    canEdit: boolean;
    canFinalize: boolean;
    reviewControlsIncluded: false;
  };
  observation: {
    contextSchemaVersion: 1 | 2;
    targetName: string | null;
    schoolName: string;
    circuitName: string;
    districtName: string;
    assessorRole: string;
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
  generalComment: string | null;
  sections: Array<{
    sectionKey: string;
    title: string;
    description: string | null;
    order: number;
    maxScore: number;
    items: Array<{
      itemKey: string;
      label: string;
      order: number;
      maxScore: number;
      score: number | null;
      notApplicable: boolean;
    }>;
  }>;
};

type HosDecisionAction = "RETURN" | "FORWARD";

type HosDecisionOutcome =
  | "RETURNED"
  | "FORWARDED"
  | "EXISTING_RETURNED"
  | "EXISTING_FORWARDED";


type DirectorDecisionAction = "RETURN" | "RELEASE";

type DirectorDecisionOutcome =
  | "RETURNED"
  | "RELEASED"
  | "EXISTING_RETURNED"
  | "EXISTING_RELEASED";

type DirectReleaseOutcome = "RELEASED" | "EXISTING_RELEASED";

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
};

type ClientProps = {
  initialAssessmentId: string;
};

type DirectReleaseSchoolGroup = {
  schoolId: string;
  schoolName: string;
  items: ReviewWorkItem[];
};

type DirectReleaseCircuitGroup = {
  circuitId: string;
  circuitName: string;
  schools: DirectReleaseSchoolGroup[];
};

type DirectReleaseDayGroup = {
  dateObserved: string;
  circuits: DirectReleaseCircuitGroup[];
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

function formatObservationDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Date not provided";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function buildDirectReleaseDayGroups(
  items: ReviewWorkItem[],
): DirectReleaseDayGroup[] {
  const dayMap = new Map<
    string,
    Map<
      string,
      {
        circuitId: string;
        circuitName: string;
        schools: Map<string, DirectReleaseSchoolGroup>;
      }
    >
  >();

  for (const item of items) {
    if (item.state !== "READY_TO_RELEASE" || item.nextAction !== "DIRECT_RELEASE") {
      continue;
    }

    const dateKey = item.dateObserved || "Date not provided";
    const circuits = dayMap.get(dateKey) ?? new Map();
    const circuit = circuits.get(item.circuitId) ?? {
      circuitId: item.circuitId,
      circuitName: item.circuitName,
      schools: new Map<string, DirectReleaseSchoolGroup>(),
    };
    const school = circuit.schools.get(item.schoolId) ?? {
      schoolId: item.schoolId,
      schoolName: item.schoolName,
      items: [],
    };

    school.items.push(item);
    circuit.schools.set(item.schoolId, school);
    circuits.set(item.circuitId, circuit);
    dayMap.set(dateKey, circuits);
  }

  return Array.from(dayMap.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dateObserved, circuits]) => ({
      dateObserved,
      circuits: Array.from(circuits.values())
        .sort((left, right) => left.circuitName.localeCompare(right.circuitName))
        .map((circuit) => ({
          circuitId: circuit.circuitId,
          circuitName: circuit.circuitName,
          schools: Array.from(circuit.schools.values())
            .sort((left, right) => left.schoolName.localeCompare(right.schoolName))
            .map((school) => ({
              ...school,
              items: [...school.items].sort((left, right) =>
                (left.targetName || "Teacher").localeCompare(
                  right.targetName || "Teacher",
                ),
              ),
            })),
        })),
    }));
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

function sectionRawScore(section: ReviewPackageSection) {
  return section.items.reduce(
    (sum, item) =>
      item.notApplicable || item.score == null ? sum : sum + item.score,
    0,
  );
}

function sectionApplicableMaximum(section: ReviewPackageSection) {
  return section.items.reduce(
    (sum, item) => (item.notApplicable ? sum : sum + item.maxScore),
    0,
  );
}

function hosDecisionBody(action: HosDecisionAction, reason: string) {
  if (action === "RETURN") {
    return { action, reason, confirm: true as const };
  }
  return { action, confirm: true as const };
}

function hosDecisionSuccessMessage(outcome: HosDecisionOutcome) {
  return outcome === "RETURNED" || outcome === "EXISTING_RETURNED"
    ? "Teacher appraisal returned for correction. The original assessor must create a new revision before review continues."
    : "Teacher appraisal forwarded to the District Director for review.";
}


function directorDecisionBody(action: DirectorDecisionAction, reason: string) {
  if (action === "RETURN") {
    return { action, reason, confirm: true as const };
  }
  return { action, confirm: true as const };
}

function directorDecisionSuccessMessage(outcome: DirectorDecisionOutcome) {
  return outcome === "RETURNED" || outcome === "EXISTING_RETURNED"
    ? "Correction requested from the original assessor. Prior completed review stages remain recorded; Director review will resume after the corrected revision is finalized."
    : "Teacher appraisal released successfully. The locked result is now available through the released-result workflow.";
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
  const [startReviewBusyId, setStartReviewBusyId] = useState("");
  const [directReleaseBusyId, setDirectReleaseBusyId] = useState("");
  const [selectedReleaseDay, setSelectedReleaseDay] = useState("");
  const [selectedReleaseCircuitId, setSelectedReleaseCircuitId] = useState("");
  const [selectedReleaseSchoolId, setSelectedReleaseSchoolId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState<
    HosDecisionAction | DirectorDecisionAction | ""
  >("");

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

  const loadDirectReleaseInspectionPackage = useCallback(
    async (item: ReviewWorkItem) => {
      if (
        item.state !== "READY_TO_RELEASE" ||
        item.nextAction !== "DIRECT_RELEASE"
      ) {
        setPackageError(
          "This assessment is no longer waiting for direct release. Refresh the work list.",
        );
        return;
      }

      setPackageLoading(true);
      setSelectedAssessmentId(item.assessmentId);
      setPackageError("");
      setActionError("");
      setActionNotice("");

      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(
            item.assessmentId,
          )}`,
          { cache: "no-store" },
        );

        const body = (await readApiBody(response)) as
          | { ok: true; workspace: DirectInspectionWorkspace }
          | ApiFailure;

        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        const workspace = body.workspace;
        if (
          workspace.assessment.assessmentId !== item.assessmentId ||
          workspace.lifecycle.assessmentId !== item.assessmentId ||
          workspace.assessment.cycleId !== item.cycleId ||
          workspace.lifecycle.cycleId !== item.cycleId ||
          workspace.assessment.revision !== item.revision ||
          workspace.lifecycle.revision !== item.revision ||
          workspace.assessment.status !== "FINALIZED" ||
          workspace.lifecycle.status !== "FINALIZED" ||
          workspace.assessment.canEdit !== false ||
          workspace.assessment.canFinalize !== false ||
          workspace.lifecycle.canEdit !== false ||
          workspace.lifecycle.canFinalize !== false ||
          workspace.lifecycle.originalAssessorOnly !== true ||
          workspace.lifecycle.reviewControlsIncluded !== false ||
          workspace.observation.assessorRole !== "DISTRICT_DIRECTOR" ||
          workspace.observation.dateObserved !== item.dateObserved ||
          !workspace.assessment.finalizedAt
        ) {
          throw new Error(
            "The finalized assessment changed before final inspection. Refresh the work list.",
          );
        }

        const inspectionPackage: BrowserDirectInspectionPackage = {
          schemaVersion: 1,
          lifecycleState: "READY_FOR_DIRECT_RELEASE",
          inspection: {
            actorRole: "DISTRICT_DIRECTOR",
          },
          assessment: {
            id: workspace.assessment.assessmentId,
            cycleId: workspace.assessment.cycleId,
            revision: workspace.assessment.revision,
            finalizedAt: workspace.assessment.finalizedAt,
            assessorOffice: item.assessorOfficeLabel,
            dateObserved: workspace.observation.dateObserved,
            overallPercentage: workspace.assessment.overallPercentage,
            sectionPercentages: workspace.assessment.sectionPercentages,
            generalComment: workspace.generalComment,
            sections: workspace.sections.map((section) => ({
              sectionKey: section.sectionKey,
              title: section.title,
              description: section.description,
              order: section.order,
              maxScore: section.maxScore,
              percentage:
                workspace.assessment.sectionPercentages[section.sectionKey] ??
                null,
              items: section.items.map((scoreItem) => ({
                itemKey: scoreItem.itemKey,
                label: scoreItem.label,
                order: scoreItem.order,
                maxScore: scoreItem.maxScore,
                score: scoreItem.score,
                notApplicable: scoreItem.notApplicable,
              })),
            })),
          },
          observation: {
            contextSchemaVersion: workspace.observation.contextSchemaVersion,
            teacherName: workspace.observation.targetName,
            schoolName: workspace.observation.schoolName,
            circuitName: workspace.observation.circuitName,
            districtName: workspace.observation.districtName,
            dateObserved: workspace.observation.dateObserved,
            yearsInService: workspace.observation.yearsInService,
            yearsInPresentSchool:
              workspace.observation.yearsInPresentSchool,
            subjectBeingObserved:
              workspace.observation.subjectBeingObserved,
            subStrand: workspace.observation.subStrand,
            classTaught: workspace.observation.classTaught,
            durationMinutes: workspace.observation.durationMinutes,
            totalEnrolment: workspace.observation.totalEnrolment,
            girls: workspace.observation.girls,
            boys: workspace.observation.boys,
          },
          readOnly: true,
        };

        setReviewPackage(inspectionPackage);
        setSelectedAssessmentId(item.assessmentId);
      } catch (loadError) {
        setReviewPackage(null);
        setSelectedAssessmentId("");
        setPackageError(
          loadError instanceof Error
            ? loadError.message
            : "The finalized Teacher assessment could not be opened for inspection.",
        );
      } finally {
        setPackageLoading(false);
      }
    },
    [],
  );

  const startReview = useCallback(
    async (item: ReviewWorkItem) => {
      if (item.state !== "READY_TO_START" || item.nextAction !== "START_REVIEW") {
        setActionError(
          "This report is no longer waiting to start review. Refresh the work list.",
        );
        return;
      }

      const confirmed = window.confirm(
        "Start independent review of this Teacher appraisal? This places the locked report in your review custody. It does not change any score or General Comment.",
      );

      if (!confirmed) return;

      setStartReviewBusyId(item.assessmentId);
      setSelectedAssessmentId(item.assessmentId);
      setActionError("");
      setActionNotice("");
      setPackageError("");

      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/review-queue/${encodeURIComponent(
            item.assessmentId,
          )}/start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          },
        );

        const body = (await readApiBody(response)) as
          | {
              ok: true;
              result: {
                outcome: "STARTED" | "EXISTING_REVIEW";
              };
            }
          | ApiFailure;

        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        setActionNotice(
          body.result.outcome === "EXISTING_REVIEW"
            ? "Your review was already started. Reopening the locked report."
            : "Review started securely. Opening the locked report.",
        );

        await loadQueue();
        await loadReviewPackage(item.assessmentId);
      } catch (startError) {
        setActionError(
          startError instanceof Error
            ? startError.message
            : "The review could not be started. Refresh the work list before trying again.",
        );
      } finally {
        setStartReviewBusyId("");
      }
    },
    [loadQueue, loadReviewPackage],
  );

  const submitHosDecision = useCallback(
    async (action: HosDecisionAction) => {
      const currentPackage = reviewPackage;
      if (!currentPackage) return;

      if (
        currentPackage.lifecycleState !== "READY_FOR_REVIEW_DECISION" ||
        currentPackage.review.reviewerRole !== "HEAD_OF_SUPERVISION"
      ) {
        setActionError(
          "These review actions are available only to the Head of Supervision.",
        );
        return;
      }

      const normalizedReason = returnReason.trim();
      if (action === "RETURN") {
        if (normalizedReason.length < 3) {
          setActionError(
            "Enter a correction reason of at least 3 characters before returning this report.",
          );
          return;
        }
        if (normalizedReason.length > 2000) {
          setActionError(
            "The correction reason is too long. Keep it within 2,000 characters.",
          );
          return;
        }
      }

      const confirmed = window.confirm(
        action === "RETURN"
          ? "Return this Teacher appraisal for correction? A new revision will be required, while the current scores and observation evidence remain locked."
          : "Forward this locked Teacher appraisal to the District Director for review?",
      );
      if (!confirmed) return;

      setDecisionBusy(action);
      setActionError("");
      setActionNotice("");
      setPackageError("");

      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/review-queue/${encodeURIComponent(
            currentPackage.assessment.id,
          )}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(hosDecisionBody(action, normalizedReason)),
          },
        );

        const body = (await readApiBody(response)) as
          | {
              ok: true;
              result: { outcome: HosDecisionOutcome };
            }
          | ApiFailure;

        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        const notice = hosDecisionSuccessMessage(body.result.outcome);
        setReviewPackage(null);
        setSelectedAssessmentId("");
        setReturnReason("");
        setActionNotice(notice);
        await loadQueue();
      } catch (decisionError) {
        setActionError(
          decisionError instanceof Error
            ? decisionError.message
            : "The review decision could not be completed. Keep this report open and try again.",
        );
      } finally {
        setDecisionBusy("");
      }
    },
    [loadQueue, returnReason, reviewPackage],
  );

  const submitDirectorDecision = useCallback(
    async (action: DirectorDecisionAction) => {
      const currentPackage = reviewPackage;
      if (!currentPackage) return;

      if (
        currentPackage.lifecycleState !== "READY_FOR_REVIEW_DECISION" ||
        currentPackage.review.reviewerRole !== "DISTRICT_DIRECTOR"
      ) {
        setActionError(
          "These review actions are available only to the District Director.",
        );
        return;
      }

      const normalizedReason = returnReason.trim();
      if (action === "RETURN") {
        if (normalizedReason.length < 3) {
          setActionError(
            "Enter a correction reason of at least 3 characters before returning this report.",
          );
          return;
        }
        if (normalizedReason.length > 2000) {
          setActionError(
            "The correction reason is too long. Keep it within 2,000 characters.",
          );
          return;
        }
      }

      const confirmed = window.confirm(
        action === "RETURN"
          ? "Request a correction from the original assessor? Prior completed review stages remain recorded. A new assessor revision will be required, while the locked scores and observation evidence remain preserved."
          : "Release this locked Teacher appraisal result? This completes the District Director review and makes the released result available through the protected result workflow.",
      );
      if (!confirmed) return;

      setDecisionBusy(action);
      setActionError("");
      setActionNotice("");
      setPackageError("");

      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/review-queue/${encodeURIComponent(
            currentPackage.assessment.id,
          )}/director-decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              directorDecisionBody(action, normalizedReason),
            ),
          },
        );

        const body = (await readApiBody(response)) as
          | {
              ok: true;
              result: { outcome: DirectorDecisionOutcome };
            }
          | ApiFailure;

        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        const notice = directorDecisionSuccessMessage(body.result.outcome);
        setReviewPackage(null);
        setSelectedAssessmentId("");
        setReturnReason("");
        setActionNotice(notice);
        await loadQueue();
      } catch (decisionError) {
        setActionError(
          decisionError instanceof Error
            ? decisionError.message
            : "The Director review decision could not be completed. Keep this report open and try again.",
        );
      } finally {
        setDecisionBusy("");
      }
    },
    [loadQueue, returnReason, reviewPackage],
  );

  const directRelease = useCallback(
    async (item: ReviewWorkItem) => {
      if (
        item.state !== "READY_TO_RELEASE" ||
        item.nextAction !== "DIRECT_RELEASE"
      ) {
        setActionError(
          "This finalized assessment is no longer ready for direct release. Refresh the work list.",
        );
        return;
      }

      const confirmed = window.confirm(
        "Release your own finalized Teacher appraisal now? You have inspected the locked form above. This is a direct release, not a review or approval. No review record will be created, and no score or General Comment will be changed.",
      );
      if (!confirmed) return;

      setDirectReleaseBusyId(item.assessmentId);
      setActionError("");
      setActionNotice("");
      setPackageError("");

      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(
            item.assessmentId,
          )}/direct-release`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          },
        );

        const body = (await readApiBody(response)) as
          | {
              ok: true;
              result: { outcome: DirectReleaseOutcome };
            }
          | ApiFailure;

        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        setActionNotice(
          body.result.outcome === "EXISTING_RELEASED"
            ? "This finalized Teacher appraisal was already released. The work list has been refreshed."
            : "Your finalized Teacher appraisal was released successfully. The Teacher can now view the protected released result.",
        );

        setReviewPackage(null);
        setSelectedAssessmentId("");
        setSelectedReleaseSchoolId("");
        await loadQueue();
      } catch (releaseError) {
        setActionError(
          releaseError instanceof Error
            ? releaseError.message
            : "The finalized Teacher appraisal could not be released. Refresh the work list before trying again.",
        );
      } finally {
        setDirectReleaseBusyId("");
      }
    },
    [loadQueue],
  );

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
        state: "READY_TO_START" as const,
        title: "New reports",
        description:
          "Finalized assessments waiting for you to begin independent review.",
        items:
          queue?.items.filter((item) => item.state === "READY_TO_START") ?? [],
      },
      {
        state: "READY_TO_REVIEW" as const,
        title: "Continue review",
        description:
          "Reports already in your custody. Reopen them safely after an interruption.",
        items:
          queue?.items.filter((item) => item.state === "READY_TO_REVIEW") ?? [],
      },
    ],
    [queue],
  );

  const activeWorkGroups = useMemo(
    () => workGroups.filter((group) => group.items.length > 0),
    [workGroups],
  );

  const directReleaseItems = useMemo(
    () =>
      queue?.items.filter(
        (item) =>
          item.state === "READY_TO_RELEASE" &&
          item.nextAction === "DIRECT_RELEASE",
      ) ?? [],
    [queue],
  );

  const directReleaseDayGroups = useMemo(
    () => buildDirectReleaseDayGroups(directReleaseItems),
    [directReleaseItems],
  );

  const selectedDirectReleaseDay = useMemo(
    () =>
      directReleaseDayGroups.find(
        (day) => day.dateObserved === selectedReleaseDay,
      ) ?? null,
    [directReleaseDayGroups, selectedReleaseDay],
  );

  const selectedDirectReleaseCircuit = useMemo(
    () =>
      selectedDirectReleaseDay?.circuits.find(
        (circuit) => circuit.circuitId === selectedReleaseCircuitId,
      ) ?? null,
    [selectedDirectReleaseDay, selectedReleaseCircuitId],
  );

  const selectedDirectReleaseSchool = useMemo(
    () =>
      selectedDirectReleaseCircuit?.schools.find(
        (school) => school.schoolId === selectedReleaseSchoolId,
      ) ?? null,
    [selectedDirectReleaseCircuit, selectedReleaseSchoolId],
  );

  const currentDirectReleaseItem = useMemo(
    () =>
      directReleaseItems.find(
        (item) => item.assessmentId === selectedAssessmentId,
      ) ?? null,
    [directReleaseItems, selectedAssessmentId],
  );

  function showReleaseDays() {
    setSelectedReleaseDay("");
    setSelectedReleaseCircuitId("");
    setSelectedReleaseSchoolId("");
  }

  function showReleaseCircuits(dateObserved: string) {
    setSelectedReleaseDay(dateObserved);
    setSelectedReleaseCircuitId("");
    setSelectedReleaseSchoolId("");
  }

  function showReleaseSchools(circuitId: string) {
    setSelectedReleaseCircuitId(circuitId);
    setSelectedReleaseSchoolId("");
  }

  function showReleaseTeachers(schoolId: string) {
    setSelectedReleaseSchoolId(schoolId);
  }

  function closePackage() {
    setReviewPackage(null);
    setPackageError("");
    setSelectedAssessmentId("");
    setReturnReason("");
    setActionError("");
  }

  function renderWorkCard(item: ReviewWorkItem) {
    return (
      <article
        key={item.assessmentId}
        className="w-full rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(13,20,31,0.96),rgba(7,12,20,0.96))] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.2)] md:p-4"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(190px,230px)] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-black text-white md:text-lg">
                {item.targetName || "Teacher"}
              </p>
              <span
                className={cx(
                  "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                  stateTone(item.state),
                )}
              >
                {stateLabel(item.state)}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-200">
              {item.schoolName}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {item.circuitName} · {item.dateObserved}
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

          <div className="lg:justify-self-stretch">
            {item.state === "READY_TO_START" ? (
              <button
                type="button"
                disabled={
                  Boolean(startReviewBusyId) ||
                  Boolean(directReleaseBusyId) ||
                  packageLoading ||
                  queueLoading
                }
                onClick={() => void startReview(item)}
                className="min-h-12 w-full rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-black text-cyan-50 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {startReviewBusyId === item.assessmentId
                  ? "Starting review…"
                  : "Start review"}
              </button>
            ) : item.state === "READY_TO_REVIEW" ? (
              <button
                type="button"
                disabled={
                  packageLoading ||
                  Boolean(startReviewBusyId) ||
                  Boolean(directReleaseBusyId)
                }
                onClick={() => void loadReviewPackage(item.assessmentId)}
                className="min-h-12 w-full rounded-2xl border border-amber-300/25 bg-amber-400/15 px-4 text-sm font-black text-amber-50 hover:bg-amber-400/20 disabled:opacity-50"
              >
                {packageLoading && selectedAssessmentId === item.assessmentId
                  ? "Opening report…"
                  : "Open report"}
              </button>
            ) : (
              <span className="block rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-xs font-bold text-slate-300">
                Final inspection required
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  if (reviewPackage) {
    const observation = reviewPackage.observation;
    const assessment = reviewPackage.assessment;
    const directReleaseInspection =
      reviewPackage.lifecycleState === "READY_FOR_DIRECT_RELEASE";

    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  {directReleaseInspection
                    ? "Final inspection · read-only"
                    : "Teacher review · read-only"}
                </p>
                <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                  {observation.teacherName || "Teacher"}
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  {observation.schoolName} · {observation.circuitName}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Assessed by {assessment.assessorOffice}. {directReleaseInspection
                    ? "Inspect your complete locked assessment below before making the separate release decision."
                    : "Review the familiar official Teacher form below."} This copy is locked: no score, observation particular or General Comment can be changed here.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(decisionBusy)}
                  onClick={closePackage}
                  className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-bold text-white hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {directReleaseInspection
                    ? "← Back to Teachers"
                    : "← Back to work list"}
                </button>
                {!directReleaseInspection ? (
                  <button
                    type="button"
                    disabled={packageLoading || Boolean(decisionBusy)}
                    onClick={() => void loadReviewPackage(assessment.id)}
                    className="min-h-12 rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {packageLoading ? "Refreshing…" : "Refresh report"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {packageError ? (
            <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              {packageError}
            </div>
          ) : null}
          {actionError ? (
            <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              {actionError}
            </div>
          ) : null}

          {!directReleaseInspection ? (
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
          ) : null}

          <section className="overflow-x-auto rounded-[24px] border border-slate-300 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            <div className="min-w-[1120px] bg-white text-slate-950">
              <header className="border-b-2 border-slate-900 px-8 py-7 text-center">
                <p className="text-sm font-black uppercase tracking-[0.18em]">
                  {observation.districtName}
                </p>
                <h2 className="mt-2 text-xl font-black uppercase">
                  Monitoring and Inspection Sheet (Teachers)
                </h2>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-800">
                  {directReleaseInspection
                    ? "Governance Teacher observation · final inspection copy"
                    : "Governance Teacher observation · independent review copy"}
                </p>
              </header>

              <div className="grid grid-cols-[190px_1fr_210px_1fr] border-b border-slate-300 text-sm">
                {[
                  ["Name of Teacher", observation.teacherName || "Teacher"],
                  ["Number of Years in the Service", observation.yearsInService],
                  ["Name of School", observation.schoolName],
                  ["Number of Years in Present School", observation.yearsInPresentSchool],
                  ["Name of Circuit", observation.circuitName],
                  ["Subject Being Observed", observation.subjectBeingObserved],
                  ["Date Observed", observation.dateObserved],
                  ["Sub-strand", observation.subStrand],
                  ["Class Taught", observation.classTaught],
                  [
                    "Duration of Lesson",
                    observation.durationMinutes == null
                      ? null
                      : `${observation.durationMinutes} minutes`,
                  ],
                ].map(([label, value], index) => (
                  <div key={`${String(label)}:${index}`} className="contents">
                    <div className="border-b border-r border-slate-300 bg-slate-100 px-4 py-3 text-xs font-black uppercase">
                      {label}
                    </div>
                    <div className="border-b border-r border-slate-300 px-4 py-3 font-semibold">
                      {displayValue(value)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b-2 border-slate-900 bg-cyan-50 px-6 py-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-900">
                  Class Enrollment Data
                </p>
                {observation.contextSchemaVersion === 2 ? (
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    {[
                      ["Total enrolment", observation.totalEnrolment],
                      ["Girls", observation.girls],
                      ["Boys", observation.boys],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="border border-cyan-200 bg-white px-4 py-3"
                      >
                        <p className="text-[11px] font-black uppercase text-cyan-900">
                          {label}
                        </p>
                        <p className="mt-1 text-base font-black text-slate-950">
                          {String(value ?? "—")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Legacy v1 assessment — enrolment breakdown was not captured
                    in this immutable version.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] border-b-2 border-slate-900 bg-slate-100 text-center text-sm font-black">
                <div className="border-r border-slate-300 px-2 py-4">S/N</div>
                <div className="border-r border-slate-300 px-4 py-4 text-left">
                  Behavioural competence
                  <span className="mt-1 block text-[11px] font-semibold">
                    1—Very Poor · 2—Poor · 3—Acceptable · 4—Good · 5—Very Good
                  </span>
                </div>
                {["N/A", "1", "2", "3", "4", "5", "Final score"].map(
                  (label) => (
                    <div
                      key={label}
                      className="border-r border-slate-300 px-2 py-4 last:border-r-0"
                    >
                      {label}
                    </div>
                  ),
                )}
              </div>

              {assessment.sections.map((section) => (
                <div key={`native-review:${section.sectionKey}`}>
                  <div className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] bg-[#304C6E] text-sm font-black text-white">
                    <div className="border-r border-white/20 px-3 py-3 text-center">
                      {section.order}.0
                    </div>
                    <div className="col-span-8 px-4 py-3 uppercase">
                      {section.title}
                    </div>
                  </div>

                  {section.items.map((item) => (
                    <div
                      key={`native-review:${section.sectionKey}:${item.itemKey}`}
                      className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] border-b border-slate-300 text-sm"
                    >
                      <div className="border-r border-slate-300 px-3 py-3 text-center font-bold">
                        {item.itemKey}
                      </div>
                      <div className="border-r border-slate-300 px-4 py-3 font-medium">
                        {item.label}
                      </div>
                      {[null, 1, 2, 3, 4, 5].map((score) => {
                        const selected =
                          score == null
                            ? item.notApplicable
                            : !item.notApplicable && item.score === score;
                        return (
                          <div
                            key={`${item.itemKey}:${score ?? "NA"}`}
                            className={cx(
                              "border-r border-slate-300 px-2 py-3 text-center text-xl font-black",
                              selected
                                ? nativeScoreTone(item.score, item.notApplicable)
                                : "bg-white text-slate-300",
                            )}
                          >
                            {selected ? "✓" : ""}
                          </div>
                        );
                      })}
                      <div
                        className={cx(
                          "px-2 py-3 text-center text-base font-black",
                          nativeScoreTone(item.score, item.notApplicable),
                        )}
                      >
                        {scoreLabel(item)}
                      </div>
                    </div>
                  ))}

                  <div className="grid grid-cols-[1fr_260px] border-b-2 border-slate-900 bg-slate-50 text-sm">
                    <div className="px-4 py-3 text-right font-black uppercase">
                      Section {section.order} total
                    </div>
                    <div className="grid grid-cols-2">
                      <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                        {sectionRawScore(section)}/{sectionApplicableMaximum(section)}
                      </div>
                      <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                        {formatPercent(section.percentage)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="border-t-2 border-slate-900 bg-slate-50 px-6 py-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                  General Comments
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                  {assessment.generalComment?.trim() ||
                    "No General Comment entered."}
                </p>
              </div>

              <footer className="grid grid-cols-[1fr_320px] border-t-2 border-slate-900 bg-cyan-50">
                <div className="px-6 py-5 text-right text-base font-black uppercase">
                  Overall Teacher appraisal result
                </div>
                <div className="border-l-2 border-slate-900 px-6 py-5 text-center text-2xl font-black text-cyan-900">
                  {formatPercent(assessment.overallPercentage)}
                </div>
              </footer>
            </div>
          </section>

          {reviewPackage.lifecycleState === "READY_FOR_REVIEW_DECISION" &&
          reviewPackage.review.reviewerRole === "HEAD_OF_SUPERVISION" ? (
            <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/[0.07] p-4 md:p-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#E8C96A]">
                    HOS review decision
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Choose what happens next
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    The assessment itself stays locked. Return it when the
                    assessor must correct the scores, or forward the unchanged
                    report to the District Director for the next review stage.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-200">
                  Scores remain read-only
                </span>
              </div>

              <label className="mt-5 block text-sm font-bold text-slate-100">
                Reason for correction
                <span className="ml-2 text-xs font-semibold text-slate-400">
                  Required only when returning · 3–2,000 characters
                </span>
                <textarea
                  value={returnReason}
                  maxLength={2000}
                  disabled={Boolean(decisionBusy)}
                  onChange={(event) => {
                    setReturnReason(event.target.value);
                    setActionError("");
                  }}
                  rows={4}
                  placeholder="State clearly what the original assessor must correct."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B1220] p-4 text-base leading-7 text-white outline-none focus:border-amber-300/50 disabled:opacity-50"
                />
              </label>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>Forwarding does not send this reason.</span>
                <span className="font-bold">
                  {returnReason.trim().length}/2000
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={
                    Boolean(decisionBusy) ||
                    returnReason.trim().length < 3 ||
                    returnReason.trim().length > 2000
                  }
                  onClick={() => void submitHosDecision("RETURN")}
                  className="min-h-14 rounded-2xl border border-rose-300/25 bg-rose-500/15 px-5 text-base font-black text-rose-50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {decisionBusy === "RETURN"
                    ? "Returning report…"
                    : "Return for correction"}
                </button>

                <button
                  type="button"
                  disabled={Boolean(decisionBusy)}
                  onClick={() => void submitHosDecision("FORWARD")}
                  className="min-h-14 rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 text-base font-black text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {decisionBusy === "FORWARD"
                    ? "Forwarding report…"
                    : "Forward to Director"}
                </button>
              </div>
            </section>
          ) : null}

          {reviewPackage.lifecycleState === "READY_FOR_REVIEW_DECISION" &&
          reviewPackage.review.reviewerRole === "DISTRICT_DIRECTOR" ? (
            <section className="rounded-[28px] border border-cyan-300/20 bg-cyan-400/[0.07] p-4 md:p-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">
                    District Director review decision
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Choose the final review action
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    The assessment stays locked. Request an assessor correction
                    only when the original assessor must amend the report before
                    final release. Prior completed review stages remain recorded.
                    Otherwise, release the unchanged result as the District
                    Director&apos;s final decision.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-200">
                  Scores remain read-only
                </span>
              </div>

              <label className="mt-5 block text-sm font-bold text-slate-100">
                Reason for correction
                <span className="ml-2 text-xs font-semibold text-slate-400">
                  Required only when returning · 3–2,000 characters
                </span>
                <textarea
                  value={returnReason}
                  maxLength={2000}
                  disabled={Boolean(decisionBusy)}
                  onChange={(event) => {
                    setReturnReason(event.target.value);
                    setActionError("");
                  }}
                  rows={4}
                  placeholder="State clearly what the original assessor must correct."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B1220] p-4 text-base leading-7 text-white outline-none focus:border-cyan-300/50 disabled:opacity-50"
                />
              </label>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>Releasing does not send this reason.</span>
                <span className="font-bold">
                  {returnReason.trim().length}/2000
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={
                    Boolean(decisionBusy) ||
                    returnReason.trim().length < 3 ||
                    returnReason.trim().length > 2000
                  }
                  onClick={() => void submitDirectorDecision("RETURN")}
                  className="min-h-14 rounded-2xl border border-rose-300/25 bg-rose-500/15 px-5 text-base font-black text-rose-50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {decisionBusy === "RETURN"
                    ? "Requesting correction…"
                    : "Request assessor correction"}
                </button>

                <button
                  type="button"
                  disabled={Boolean(decisionBusy)}
                  onClick={() => void submitDirectorDecision("RELEASE")}
                  className="min-h-14 rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 text-base font-black text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {decisionBusy === "RELEASE"
                    ? "Releasing result…"
                    : "Release result"}
                </button>
              </div>
            </section>
          ) : null}

          {directReleaseInspection ? (
            <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-400/[0.07] p-4 md:p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                Final release
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                Release only after checking the form above
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                This is your own finalized assessment. Releasing it does not
                create a review or approval record, and the locked scores and
                General Comment will not be changed.
              </p>

              <button
                type="button"
                disabled={
                  !currentDirectReleaseItem ||
                  Boolean(directReleaseBusyId) ||
                  packageLoading ||
                  queueLoading
                }
                onClick={() => {
                  if (currentDirectReleaseItem) {
                    void directRelease(currentDirectReleaseItem);
                  }
                }}
                className="mt-5 min-h-14 w-full rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-5 text-base font-black text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {directReleaseBusyId === assessment.id
                  ? "Releasing assessment…"
                  : "Release my finalized assessment"}
              </button>
            </section>
          ) : null}

          <p className="text-xs leading-5 text-slate-400">
            This {directReleaseInspection ? "final-inspection" : "review"} form is read-only. No score, General Comment,
            observation particular, review authority ID or integrity hash is
            editable or displayed here.
          </p>
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
                New reports appear first. Review custody remains durable on the
                server after a browser restart or weak-network interruption.
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
        {actionError ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
            {actionError}
          </div>
        ) : null}
        {actionNotice ? (
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {actionNotice}
          </div>
        ) : null}

        {!(
          queue?.actorRole === "DISTRICT_DIRECTOR" &&
          directReleaseDayGroups.length > 0 &&
          activeWorkGroups.length === 0
        ) ? (
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
        ) : null}

        {queueLoading && !queue ? (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-slate-300">Loading your review work…</p>
          </section>
        ) : queue?.items.length ? (
          <div className="space-y-4">
            {activeWorkGroups.map((group) => (
              <section
                key={group.state}
                className={cx(
                  "rounded-[28px] border bg-white/[0.04] p-4 md:p-5",
                  group.state === "READY_TO_START"
                    ? "border-cyan-300/15"
                    : "border-white/10",
                )}
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#E8C96A]">
                      {group.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {group.description}
                    </p>
                  </div>
                  <span className="text-sm font-black text-white">
                    {group.items.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {group.items.map((item) => renderWorkCard(item))}
                </div>
              </section>
            ))}
          </div>
        ) : queue ? null : null}

        {queue?.actorRole === "DISTRICT_DIRECTOR" &&
        directReleaseDayGroups.length > 0 ? (
          <section className="overflow-hidden rounded-[24px] border border-emerald-300/20 bg-[#091414]">
            <div className="border-b border-white/10 px-4 py-4 md:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">
                    Final inspections before release
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white md:text-xl">
                    My finalized Teacher assessments
                  </h2>
                </div>
                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-sm font-black text-emerald-100">
                  {directReleaseItems.length}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Choose one item at a time. Only the current step is shown.
              </p>
            </div>

            {!selectedReleaseDay ? (
              <div className="divide-y divide-white/10">
                {directReleaseDayGroups.map((day) => {
                  const reportCount = day.circuits.reduce(
                    (circuitTotal, circuit) =>
                      circuitTotal +
                      circuit.schools.reduce(
                        (schoolTotal, school) =>
                          schoolTotal + school.items.length,
                        0,
                      ),
                    0,
                  );

                  return (
                    <button
                      key={day.dateObserved}
                      type="button"
                      onClick={() => showReleaseCircuits(day.dateObserved)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-white/[0.05] md:px-5"
                    >
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                          Supervision day
                        </p>
                        <p className="mt-1 text-base font-black text-white md:text-lg">
                          {formatObservationDay(day.dateObserved)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-emerald-100">
                        {reportCount} {reportCount === 1 ? "report" : "reports"} ›
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : selectedDirectReleaseDay && !selectedReleaseCircuitId ? (
              <div>
                <div className="border-b border-white/10 px-4 py-3 md:px-5">
                  <button
                    type="button"
                    onClick={showReleaseDays}
                    className="text-sm font-bold text-cyan-100 hover:text-white"
                  >
                    ← Back to supervision days
                  </button>
                  <p className="mt-3 text-lg font-black text-white">
                    {formatObservationDay(selectedDirectReleaseDay.dateObserved)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Choose a circuit visited on this day.
                  </p>
                </div>

                <div className="divide-y divide-white/10">
                  {selectedDirectReleaseDay.circuits.map((circuit) => {
                    const reportCount = circuit.schools.reduce(
                      (sum, school) => sum + school.items.length,
                      0,
                    );
                    return (
                      <button
                        key={circuit.circuitId}
                        type="button"
                        onClick={() => showReleaseSchools(circuit.circuitId)}
                        className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-white/[0.05] md:px-5"
                      >
                        <span className="text-base font-black text-white">
                          {circuit.circuitName}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-slate-300">
                          {reportCount} {reportCount === 1 ? "report" : "reports"} ›
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : selectedDirectReleaseCircuit && !selectedReleaseSchoolId ? (
              <div>
                <div className="border-b border-white/10 px-4 py-3 md:px-5">
                  <button
                    type="button"
                    onClick={() => showReleaseCircuits(selectedReleaseDay)}
                    className="text-sm font-bold text-cyan-100 hover:text-white"
                  >
                    ← Back to circuits
                  </button>
                  <p className="mt-3 text-lg font-black text-white">
                    {selectedDirectReleaseCircuit.circuitName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Choose a school visited in this circuit.
                  </p>
                </div>

                <div className="divide-y divide-white/10">
                  {selectedDirectReleaseCircuit.schools.map((school) => (
                    <button
                      key={school.schoolId}
                      type="button"
                      onClick={() => showReleaseTeachers(school.schoolId)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-white/[0.05] md:px-5"
                    >
                      <span className="text-base font-black text-white">
                        {school.schoolName}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-slate-300">
                        {school.items.length} {school.items.length === 1 ? "Teacher" : "Teachers"} ›
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : selectedDirectReleaseSchool ? (
              <div>
                <div className="border-b border-white/10 px-4 py-3 md:px-5">
                  <button
                    type="button"
                    onClick={() => showReleaseSchools(selectedReleaseCircuitId)}
                    className="text-sm font-bold text-cyan-100 hover:text-white"
                  >
                    ← Back to schools
                  </button>
                  <p className="mt-3 text-lg font-black text-white">
                    {selectedDirectReleaseSchool.schoolName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Choose a Teacher to inspect the complete locked appraisal.
                  </p>
                </div>

                <div className="divide-y divide-white/10">
                  {selectedDirectReleaseSchool.items.length ? (
                    selectedDirectReleaseSchool.items.map((item) => (
                      <button
                        key={item.assessmentId}
                        type="button"
                        disabled={packageLoading}
                        onClick={() =>
                          void loadDirectReleaseInspectionPackage(item)
                        }
                        className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50 md:px-5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">
                            {packageLoading &&
                            selectedAssessmentId === item.assessmentId
                              ? "Opening appraisal…"
                              : item.targetName || "Teacher"}
                          </p>
                        </div>
                        <span className="shrink-0 text-base font-black text-emerald-100">
                          {formatPercent(item.overallPercentage)} ›
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-5 text-sm text-slate-300 md:px-5">
                      No finalized Teacher assessment remains in this school.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {queue &&
        queue.items.length === 0 ? (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-lg font-bold text-white">No review work waiting</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Use Refresh work list when you expect a newly finalized or
              forwarded Teacher report. This page does not poll in the background.
            </p>
          </section>
        ) : null}

        <p className="text-xs leading-5 text-slate-400">
          Work-list responses contain compact responsibility metadata only.
          Starting review sends only explicit confirmation; reviewer identity,
          assignment, stage and evidence authority are re-established by the
          server. Scores and General Comments load only through the read-only
          package endpoint. No persistent browser storage or background polling
          is used.
        </p>
      </div>
    </div>
  );
}
