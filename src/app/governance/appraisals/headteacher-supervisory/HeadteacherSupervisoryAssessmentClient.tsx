// src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ScoreDraft = {
  score: number | null;
  notApplicable: boolean;
};

type WorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

type WorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: WorkspaceItem[];
};

type Workspace = {
  assessment: {
    assessmentId: string;
    cycleId: string;
    revision: number;
    status: string;
    dateObserved: string;
    canEdit: boolean;
    canFinalize: boolean;
    progress: {
      totalSections: number;
      completedSections: number;
      totalItems: number;
      answeredItems: number;
      notApplicableItems: number;
      completionPercentage: number;
      missingItemKeys: string[];
    };
  };
  lifecycle: {
    state: string;
    label: string;
    description: string;
    readOnly: boolean;
    canEdit: boolean;
    canCreateRevision: boolean;
    returnReason: string | null;
  };
  visit: {
    contextSchemaVersion: 1 | 2;
    officialDetailsAvailable: boolean;
    targetName: string | null;
    schoolName: string;
    circuitName: string;
    districtName: string;
    dateObserved: string;
    assessorRole: string;
    arrivalTime: string | null;
    staffStrength: number | null;
    totalEnrolment: number | null;
    girls: number | null;
    boys: number | null;
    teachersPresentAtVisit: number | null;
  };
  sections: WorkspaceSection[];
};

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
  releaseCommitted?: boolean;
  retrySafe?: boolean;
};

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

type SupervisoryQueueState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "RETURNED"
  | "READ_ONLY";

type SupervisoryQueueCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  appraisalCount: number;
};

type SupervisoryQueueItem = {
  cycleId: string;
  cycleStatus: string;
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  staffFeedbackLabel: string;
  supervisory: {
    state: SupervisoryQueueState;
    label: string;
    assessmentId: string | null;
    revision: number | null;
    dateObserved: string | null;
    answeredItems: number;
    totalItems: number;
    completionPercentage: number;
    overallPercentage: number | null;
  };
  action: {
    label: string;
    url: string | null;
    enabled: boolean;
  };
  release: {
    canDirectRelease: boolean;
    releasedToHeadteacher: boolean;
  };
};

type SupervisoryDirectTarget = {
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
};

type SupervisoryQueue = {
  actorRole: string;
  officeLabel: string;
  selection: {
    mode: "ASSIGNED_CIRCUIT_SCHOOLS" | "DISTRICT_CIRCUIT_SCHOOLS";
    requiresCircuitSelection: boolean;
    requiresSchoolSelection: true;
    assignedCircuitId: string | null;
    assignedCircuitName: string | null;
  };
  summary: {
    circuits: number;
    schools: number;
    appraisals: number;
    notStarted: number;
    inProgress: number;
    returned: number;
    submitted: number;
    readOnly: number;
  };
  circuits: SupervisoryQueueCircuit[];
  items: SupervisoryQueueItem[];
  directTargets: SupervisoryDirectTarget[];
  noBackgroundPolling: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
};

type DirectOpenTarget = {
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
};

type DirectOpenTargetCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  targetCount: number;
};

type DirectOpenTargets = {
  actorRole: "DISTRICT_DIRECTOR" | "SUPERADMIN";
  circuits: DirectOpenTargetCircuit[];
  targets: DirectOpenTarget[];
  readOnly: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  providerCalled: false;
};

type HeadteacherFeedbackBulkScopeLevel = "DISTRICT" | "CIRCUIT" | "SCHOOL";

type HeadteacherFeedbackBulkPreviewRow = {
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  eligibleRespondentCount: number;
  disposition: "OPEN_NEW" | "KEEP_EXISTING" | "SKIP";
  reason: string;
  existingCycleId: string | null;
  existingCycleStatus: string | null;
};

type HeadteacherFeedbackBulkPreview = {
  actorRole: "DISTRICT_DIRECTOR";
  scope: {
    level: HeadteacherFeedbackBulkScopeLevel;
    ids: string[];
  };
  summary: {
    schools: number;
    headteachers: number;
    eligibleRespondents: number;
    willOpen: number;
    keepExisting: number;
    willSkip: number;
  };
  rows: HeadteacherFeedbackBulkPreviewRow[];
  readOnly: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  notificationChannels: readonly ["IN_APP", "SMS", "EMAIL"];
  notificationRecipientsDerivedFromLockedScope: true;
  providerCalled: false;
};

type HeadteacherFeedbackBulkOpenResult = {
  actorRole: "DISTRICT_DIRECTOR";
  bulkOpenKey: string;
  scope: {
    level: HeadteacherFeedbackBulkScopeLevel;
    ids: string[];
  };
  openedAt: string;
  responseWindowDays: number;
  summary: {
    selectedTargets: number;
    directlyOpened: number;
    existingOpen: number;
    keptExisting: number;
    skipped: number;
    retryRequired: number;
    participantCount: number;
    notificationRecipientCount: number;
  };
  partialSuccess: boolean;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  notificationChannels: readonly ["IN_APP", "SMS", "EMAIL"];
  notificationRecipientsDerivedFromLockedScope: true;
  providerCalled: false;
};

type HeadteacherSupervisoryDirectorDraftResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  draft: {
    cycleId: string;
    cycleStatus: "OPEN";
    assessmentId: string;
    assessmentStatus: string;
    revision: number;
    targetUserId: string;
    targetTenantId: string;
    dateObserved: string;
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT";
    carrierKind: "DIRECTOR_GOVERNANCE_ONLY";
  };
};

type HeadteacherSupervisoryOfficerDraftResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  draft: {
    cycleId: string;
    cycleStatus: "CLOSED";
    assessmentId: string;
    assessmentStatus: string;
    revision: number;
    targetUserId: string;
    targetTenantId: string;
    dateObserved: string;
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT";
    carrierKind: "OFFICER_GOVERNANCE_ONLY";
  };
};

type ClientProps = {
  initialAssessmentId: string;
  initialCycleId: string;
};


type VisitDetailsDraft = {
  arrivalTime: string;
  staffStrength: string;
  totalEnrolment: string;
  girls: string;
  boys: string;
  teachersPresentAtVisit: string;
};

type ValidatedVisitDetails = {
  arrivalTime: string;
  staffStrength: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
  teachersPresentAtVisit: number;
};

type VisitDetailsValidation =
  | { ok: true; values: ValidatedVisitDetails; message: "" }
  | { ok: false; values: null; message: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function answerKey(sectionKey: string, itemKey: string) {
  return `${sectionKey}::${itemKey}`;
}


function validateVisitDetails(
  dateObserved: string,
  draft: VisitDetailsDraft,
): VisitDetailsValidation {
  if (!dateObserved) {
    return {
      ok: false,
      values: null,
      message: "Select the date of the visit.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateObserved)) {
    return {
      ok: false,
      values: null,
      message: "Enter a valid visit date.",
    };
  }

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(draft.arrivalTime.trim());
  if (!timeMatch) {
    return {
      ok: false,
      values: null,
      message: "Enter the arrival time in 24-hour format.",
    };
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return {
      ok: false,
      values: null,
      message: "Enter a valid arrival time.",
    };
  }

  const numberFields: Array<{
    key: keyof Omit<VisitDetailsDraft, "arrivalTime">;
    label: string;
  }> = [
    { key: "staffStrength", label: "staff strength" },
    { key: "totalEnrolment", label: "total enrolment" },
    { key: "girls", label: "girls" },
    { key: "boys", label: "boys" },
    {
      key: "teachersPresentAtVisit",
      label: "teachers present at the visit",
    },
  ];

  const parsed = new Map<string, number>();
  for (const field of numberFields) {
    const raw = draft[field.key].trim();
    if (!/^\d+$/.test(raw)) {
      return {
        ok: false,
        values: null,
        message: `Enter ${field.label} as a whole number of zero or more.`,
      };
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
      return {
        ok: false,
        values: null,
        message: `Enter a valid value for ${field.label}.`,
      };
    }
    parsed.set(field.key, value);
  }

  const staffStrength = parsed.get("staffStrength") ?? 0;
  const totalEnrolment = parsed.get("totalEnrolment") ?? 0;
  const girls = parsed.get("girls") ?? 0;
  const boys = parsed.get("boys") ?? 0;
  const teachersPresentAtVisit =
    parsed.get("teachersPresentAtVisit") ?? 0;

  if (girls + boys !== totalEnrolment) {
    return {
      ok: false,
      values: null,
      message: `Girls and boys currently total ${girls + boys}. This must equal the total enrolment of ${totalEnrolment}.`,
    };
  }

  if (teachersPresentAtVisit > staffStrength) {
    return {
      ok: false,
      values: null,
      message:
        "Teachers present at the visit cannot exceed the staff strength.",
    };
  }

  return {
    ok: true,
    message: "",
    values: {
      arrivalTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      staffStrength,
      totalEnrolment,
      girls,
      boys,
      teachersPresentAtVisit,
    },
  };
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
  const code = String(failure?.error ?? "").trim();

  if (status != null && status >= 500) {
    return "The server is temporarily busy. Your answers remain on this screen and autosave will retry.";
  }

  if (code === "SERVER_TEMPORARILY_BUSY") {
    return "The server is temporarily busy. Your answers remain on this screen and autosave will retry.";
  }

  if (code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_EXISTING_ACTIVE") {
    return "This Headteacher already has an unfinished Governance assessment. Continue or release that assessment before starting another one.";
  }

  if (
    code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_AMBIGUOUS" ||
    code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_CONTEXT_INVALID"
  ) {
    return "This school does not have one clear active Headteacher record. Ask MIS to correct the Headteacher assignment, then refresh this page.";
  }

  if (code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_NOT_FOUND") {
    return "The Headteacher record has changed. Refresh the list and choose the Headteacher again.";
  }

  if (
    code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TENANT_OUT_OF_SCOPE" ||
    code === "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ZONE_OUT_OF_SCOPE" ||
    code.startsWith("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_AUTHORITY_")
  ) {
    return "This Headteacher is outside your current appraisal authority. Refresh the list and try again.";
  }

  return (
    failure?.message ||
    code ||
    "The request could not be completed. Please try again."
  );
}

function sectionSaveSignature(scores: SectionSaveScore[]) {
  return JSON.stringify(scores);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${Math.round(Number(value))}%`;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function formatScorePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value))}%`;
}

function staffFeedbackResultMessage(result: HeadteacherFeedbackBulkOpenResult) {
  const opened = result.summary.directlyOpened;
  const kept = result.summary.existingOpen + result.summary.keptExisting;
  const skipped = result.summary.skipped;
  const recipients = result.summary.notificationRecipientCount;

  if (opened === 0) {
    const parts = ["No new staff feedback was started."];

    if (kept === 1) {
      parts.push("The existing appraisal was left unchanged.");
    } else if (kept > 1) {
      parts.push(`${kept} existing appraisals were left unchanged.`);
    }

    if (recipients === 0) {
      parts.push("No new Teacher notices were sent.");
    } else {
      parts.push(
        `Notices for ${recipients} Teacher${recipients === 1 ? "" : "s"} were checked or completed for the existing exercise.`,
      );
    }

    if (skipped > 0) {
      parts.push(
        `${skipped} school${skipped === 1 ? " was" : "s were"} skipped safely.`,
      );
    }

    return parts.join(" ");
  }

  const parts = [
    `Staff feedback started for ${opened} Headteacher${opened === 1 ? "" : "s"}.`,
    `Teachers have 7 days to respond.`,
  ];

  if (recipients > 0) {
    parts.push(
      `Notices were prepared for ${recipients} Teacher${recipients === 1 ? "" : "s"}.`,
    );
  }
  if (kept > 0) {
    parts.push(
      `${kept} existing appraisal${kept === 1 ? " was" : "s were"} left unchanged.`,
    );
  }
  if (skipped > 0) {
    parts.push(
      `${skipped} school${skipped === 1 ? " was" : "s were"} skipped safely.`,
    );
  }

  return parts.join(" ");
}

type LiveSectionScore = {
  sectionKey: string;
  rawScore: number;
  applicableMaximum: number;
  answeredItems: number;
  notApplicableItems: number;
  complete: boolean;
  percentage: number | null;
};

function dashboardHref(actorRole: string | undefined) {
  switch (actorRole) {
    case "SISSO":
    case "CIRCUIT_SUPERVISOR":
      return "/circuit/dashboard";
    case "HEAD_OF_SUPERVISION":
      return "/district/hos/dashboard";
    case "BASIC_SCHOOL_COORDINATOR":
      return "/district/bsc/dashboard";
    default:
      return "/district/dashboard";
  }
}

function queueStateTone(state: SupervisoryQueueState) {
  switch (state) {
    case "RETURNED":
      return "border-amber-300/25 bg-amber-400/15 text-amber-100";
    case "SUBMITTED":
      return "border-emerald-300/25 bg-emerald-400/15 text-emerald-100";
    case "IN_PROGRESS":
      return "border-sky-300/25 bg-sky-400/15 text-sky-100";
    case "NOT_STARTED":
      return "border-fuchsia-300/25 bg-fuchsia-400/15 text-fuchsia-100";
    default:
      return "border-white/10 bg-white/[0.06] text-slate-200";
  }
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

function editableScoreTone(score: number) {
  switch (score) {
    case 1:
      return "border-rose-300/55 bg-rose-500/30 text-rose-50";
    case 2:
      return "border-orange-300/55 bg-orange-500/30 text-orange-50";
    case 3:
      return "border-amber-300/55 bg-amber-400/30 text-amber-50";
    case 4:
      return "border-cyan-300/55 bg-cyan-400/30 text-cyan-50";
    case 5:
      return "border-emerald-300/55 bg-emerald-400/30 text-emerald-50";
    default:
      return "border-white/10 bg-white/[0.03] text-slate-300";
  }
}
export default function HeadteacherSupervisoryAssessmentClient({
  initialAssessmentId,
  initialCycleId,
}: ClientProps) {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId);
  const [cycleId] = useState(initialCycleId);
  const [dateObserved, setDateObserved] = useState(today());
  const [visitDetails, setVisitDetails] = useState<VisitDetailsDraft>({
    arrivalTime: "",
    staffStrength: "",
    totalEnrolment: "",
    girls: "",
    boys: "",
    teachersPresentAtVisit: "",
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [answers, setAnswers] = useState<Record<string, ScoreDraft>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<SupervisoryQueue | null>(null);
  const [directOpenTargets, setDirectOpenTargets] =
    useState<DirectOpenTargets | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [openingCycle, setOpeningCycle] = useState(false);
  const [selectedCircuitId, setSelectedCircuitId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [showSavedRecords, setShowSavedRecords] = useState(false);
  const [hosLandingPanel, setHosLandingPanel] =
    useState<"RETURNED" | "NEW" | null>(null);
  const [directorLandingPanel, setDirectorLandingPanel] =
    useState<"SUBMITTED" | "NEW" | null>(null);
  const [directOpenTargetsError, setDirectOpenTargetsError] = useState("");
  const [directOpenTargetsLoading, setDirectOpenTargetsLoading] =
    useState(false);
  const [feedbackAudienceMode, setFeedbackAudienceMode] =
    useState<"DISTRICT" | "CIRCUIT">("DISTRICT");
  const [feedbackSelectedCircuitIds, setFeedbackSelectedCircuitIds] =
    useState<string[]>([]);
  const [feedbackSelectedSchoolIds, setFeedbackSelectedSchoolIds] =
    useState<string[]>([]);
  const [feedbackSingleCircuitAllSchools, setFeedbackSingleCircuitAllSchools] =
    useState(true);
  const [feedbackSchoolFilter, setFeedbackSchoolFilter] = useState("");
  const [feedbackPreview, setFeedbackPreview] =
    useState<HeadteacherFeedbackBulkPreview | null>(null);
  const [feedbackPreviewExpanded, setFeedbackPreviewExpanded] = useState(false);
  const [feedbackBulkResult, setFeedbackBulkResult] =
    useState<HeadteacherFeedbackBulkOpenResult | null>(null);
  const [feedbackPreviewLoading, setFeedbackPreviewLoading] = useState(false);
  const [feedbackOpening, setFeedbackOpening] = useState(false);
  const [directorNewWorkPath, setDirectorNewWorkPath] =
    useState<"STAFF" | "GOVERNANCE" | null>(null);
  const [directorDirectSearch, setDirectorDirectSearch] = useState("");
  const [directorDirectCircuitId, setDirectorDirectCircuitId] = useState("");
  const [directorDirectSchoolId, setDirectorDirectSchoolId] = useState("");
  const [directorDirectTargetKey, setDirectorDirectTargetKey] = useState("");
  const [directorDirectStarting, setDirectorDirectStarting] = useState(false);
  const [officerDirectTargetKey, setOfficerDirectTargetKey] = useState("");
  const [officerDirectStarting, setOfficerDirectStarting] = useState(false);
  const [directorReleasingAssessmentId, setDirectorReleasingAssessmentId] =
    useState("");
  const [autosaveState, setAutosaveState] =
    useState<AutosaveState>("idle");
  const [reviewMode, setReviewMode] = useState(false);

  const answersRef = useRef<Record<string, ScoreDraft>>({});
  const workspaceRef = useRef<Workspace | null>(null);
  const pendingSectionSavesRef = useRef(
    new Map<string, PendingSectionSave>(),
  );
  const savedSectionSignaturesRef = useRef(new Map<string, string>());
  const autosaveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const autosaveRunningRef = useRef(false);
  const nativeReviewRef = useRef<HTMLElement | null>(null);
  const directOpenKeysRef = useRef(new Map<string, string>());
  const feedbackBulkOpenKeysRef = useRef(new Map<string, string>());
  const directorDirectAssessmentKeysRef = useRef(new Map<string, string>());
  const officerDirectAssessmentKeysRef = useRef(new Map<string, string>());

  const clearWorkspaceForAssessmentChange = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    autosaveRunningRef.current = false;
    pendingSectionSavesRef.current.clear();
    savedSectionSignaturesRef.current.clear();
    workspaceRef.current = null;
    answersRef.current = {};

    setWorkspace(null);
    setAnswers({});
    setAutosaveState("idle");
    setReviewMode(false);
    setSectionIndex(0);
    setItemIndex(0);
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/governance/appraisals/headteacher-supervisory",
        { cache: "no-store" },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; queue: SupervisoryQueue }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      const nextQueue = body.queue;
      setQueue(nextQueue);
      if (nextQueue.actorRole !== "DISTRICT_DIRECTOR") {
        setDirectOpenTargets(null);
        setDirectOpenTargetsError("");
      }
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "The supervisory work queue could not be loaded.",
      );
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadDirectOpenTargets = useCallback(async () => {
    setDirectOpenTargetsLoading(true);
    setDirectOpenTargetsError("");
    try {
      const response = await fetch(
        "/api/district/headteacher-appraisals",
        { cache: "no-store" },
      );
      const body = (await readApiBody(response)) as
        | {
            ok: true;
            directOpenTargets: DirectOpenTargets;
          }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      setDirectOpenTargets(body.directOpenTargets);
      setFeedbackPreview(null);
    } catch (targetError) {
      setDirectOpenTargets(null);
      setDirectOpenTargetsError(
        targetError instanceof Error
          ? targetError.message
          : "New Headteacher appraisal targets could not be loaded.",
      );
    } finally {
      setDirectOpenTargetsLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(
    async (
      id: string,
      preservePosition?: { sectionIndex: number; itemIndex: number },
    ) => {
      if (workspaceRef.current?.assessment.assessmentId !== id) {
        clearWorkspaceForAssessmentChange();
      }

      setBusy(true);
      setError("");
      try {
        const response = await fetch(
          `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const body = (await readApiBody(response)) as
          | { ok: true; workspace: Workspace }
          | ApiFailure;
        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }

        workspaceRef.current = body.workspace;
        setWorkspace(body.workspace);

        const nextAnswers: Record<string, ScoreDraft> = {};
        const nextSavedSignatures = new Map<string, string>();

        for (const section of body.workspace.sections) {
          const savedScores: SectionSaveScore[] = [];
          for (const item of section.items) {
            if (item.answered) {
              const answer = {
                score: item.score,
                notApplicable: item.notApplicable,
              };
              nextAnswers[answerKey(section.sectionKey, item.itemKey)] = answer;
              savedScores.push({
                itemKey: item.itemKey,
                score: item.notApplicable ? null : item.score,
                notApplicable: item.notApplicable,
              });
            }
          }
          if (savedScores.length > 0) {
            nextSavedSignatures.set(
              section.sectionKey,
              sectionSaveSignature(savedScores),
            );
          }
        }

        answersRef.current = nextAnswers;
        setAnswers(nextAnswers);
        savedSectionSignaturesRef.current = nextSavedSignatures;
        pendingSectionSavesRef.current.clear();
        setAutosaveState("saved");
        setReviewMode(body.workspace.assessment.status === "FINALIZED");

        if (preservePosition) {
          setSectionIndex(
            Math.min(
              preservePosition.sectionIndex,
              Math.max(body.workspace.sections.length - 1, 0),
            ),
          );
          const targetSection =
            body.workspace.sections[preservePosition.sectionIndex] ??
            body.workspace.sections[0];
          setItemIndex(
            Math.min(
              preservePosition.itemIndex,
              Math.max((targetSection?.items.length ?? 1) - 1, 0),
            ),
          );
        } else {
          setSectionIndex(0);
          setItemIndex(0);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The assessment could not be loaded.",
        );
      } finally {
        setBusy(false);
      }
    },
    [clearWorkspaceForAssessmentChange],
  );

  useEffect(() => {
    if (!assessmentId) {
      void loadQueue();
    }
  }, [assessmentId, loadQueue]);

  useEffect(() => {
    if (assessmentId) {
      void loadWorkspace(assessmentId);
    }
  }, [assessmentId, loadWorkspace]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const currentSection = workspace?.sections[sectionIndex] ?? null;

  const localAnsweredItems = useMemo(() => Object.keys(answers).length, [answers]);
  const localCompletionPercentage = workspace
    ? Math.round(
        (localAnsweredItems / workspace.assessment.progress.totalItems) * 100,
      )
    : 0;

  const liveSectionScores = useMemo(() => {
    const scores = new Map<string, LiveSectionScore>();
    if (!workspace) return scores;

    for (const section of workspace.sections) {
      let rawScore = 0;
      let applicableMaximum = section.maxScore;
      let answeredItems = 0;
      let notApplicableItems = 0;

      for (const item of section.items) {
        const answer = answers[answerKey(section.sectionKey, item.itemKey)];
        if (!answer) continue;

        answeredItems += 1;
        if (answer.notApplicable) {
          notApplicableItems += 1;
          applicableMaximum -= item.maxScore;
        } else if (answer.score != null) {
          rawScore += answer.score;
        }
      }

      const percentage =
        applicableMaximum > 0
          ? round2((rawScore / applicableMaximum) * 100)
          : null;

      scores.set(section.sectionKey, {
        sectionKey: section.sectionKey,
        rawScore,
        applicableMaximum,
        answeredItems,
        notApplicableItems,
        complete: answeredItems === section.items.length,
        percentage,
      });
    }

    return scores;
  }, [answers, workspace]);

  const liveScoreSummary = useMemo(() => {
    if (!workspace) {
      return {
        rawScore: 0,
        applicableMaximum: 0,
        overallPercentage: null as number | null,
      };
    }

    let rawScore = 0;
    let applicableMaximum = 0;
    const sectionPercentages: number[] = [];

    for (const section of workspace.sections) {
      const score = liveSectionScores.get(section.sectionKey);
      if (!score) continue;

      rawScore += score.rawScore;
      applicableMaximum += score.applicableMaximum;

      if (score.complete && score.applicableMaximum === 0) {
        continue;
      }

      sectionPercentages.push(score.percentage ?? 0);
    }

    return {
      rawScore,
      applicableMaximum,
      overallPercentage:
        sectionPercentages.length > 0
          ? round2(
              sectionPercentages.reduce((sum, value) => sum + value, 0) /
                sectionPercentages.length,
            )
          : null,
    };
  }, [liveSectionScores, workspace]);

  const selectableCircuits = useMemo(() => {
    const circuits = new Map<string, SupervisoryQueueCircuit>();

    for (const circuit of queue?.circuits ?? []) {
      circuits.set(circuit.circuitId, circuit);
    }

    for (const target of queue?.directTargets ?? []) {
      const current = circuits.get(target.circuitId);
      circuits.set(target.circuitId, {
        circuitId: target.circuitId,
        circuitName: target.circuitName,
        districtId: target.districtId,
        districtName: target.districtName,
        schoolCount: current?.schoolCount ?? 0,
        appraisalCount: current?.appraisalCount ?? 0,
      });
    }

    for (const circuit of directOpenTargets?.circuits ?? []) {
      const current = circuits.get(circuit.circuitId);
      circuits.set(circuit.circuitId, {
        circuitId: circuit.circuitId,
        circuitName: circuit.circuitName,
        districtId: circuit.districtId,
        districtName: circuit.districtName,
        schoolCount: Math.max(current?.schoolCount ?? 0, circuit.schoolCount),
        appraisalCount: current?.appraisalCount ?? 0,
      });
    }

    return [...circuits.values()].sort((left, right) =>
      left.circuitName.localeCompare(right.circuitName),
    );
  }, [directOpenTargets, queue]);

  const availableSchoolCount = useMemo(() => {
    const schoolIds = new Set<string>();
    for (const item of queue?.items ?? []) schoolIds.add(item.schoolId);
    for (const target of queue?.directTargets ?? []) {
      schoolIds.add(target.schoolId);
    }
    for (const target of directOpenTargets?.targets ?? []) {
      schoolIds.add(target.targetTenantId);
    }
    return schoolIds.size;
  }, [directOpenTargets, queue]);

  const queueSchools = useMemo(() => {
    if (!selectedCircuitId) return [];
    const schools = new Map<
      string,
      {
        schoolId: string;
        schoolName: string;
        headteacherName: string;
        appraisalCount: number;
        canDirectOpen: boolean;
      }
    >();

    for (const item of queue?.items ?? []) {
      if (item.circuitId !== selectedCircuitId) continue;
      const current = schools.get(item.schoolId) ?? {
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        headteacherName: item.targetName || "Headteacher",
        appraisalCount: 0,
        canDirectOpen: false,
      };
      current.appraisalCount += 1;
      current.canDirectOpen = false;
      schools.set(item.schoolId, current);
    }

    for (const target of queue?.directTargets ?? []) {
      if (target.circuitId !== selectedCircuitId) continue;
      const current = schools.get(target.schoolId);
      if (current) continue;

      schools.set(target.schoolId, {
        schoolId: target.schoolId,
        schoolName: target.schoolName,
        headteacherName: target.targetName || "Headteacher",
        appraisalCount: 0,
        canDirectOpen: true,
      });
    }

    for (const target of directOpenTargets?.targets ?? []) {
      if (target.circuitId !== selectedCircuitId) continue;
      const current = schools.get(target.targetTenantId);
      if (current) continue;

      schools.set(target.targetTenantId, {
        schoolId: target.targetTenantId,
        schoolName: target.schoolName,
        headteacherName: target.targetHeadteacherName || "Headteacher",
        appraisalCount: 0,
        canDirectOpen: true,
      });
    }

    return [...schools.values()].sort((left, right) =>
      left.schoolName.localeCompare(right.schoolName),
    );
  }, [directOpenTargets, queue, selectedCircuitId]);

  const selectedQueueItems = useMemo(() => {
    if (!queue) return [];
    return queue.items.filter(
      (item) =>
        (!selectedCircuitId || item.circuitId === selectedCircuitId) &&
        (!selectedSchoolId || item.schoolId === selectedSchoolId),
    );
  }, [queue, selectedCircuitId, selectedSchoolId]);

  const selectedQueueItem = selectedQueueItems[0] ?? null;
  const selectedDirectOpenTarget =
    directOpenTargets?.targets.find(
      (target) =>
        target.circuitId === selectedCircuitId &&
        target.targetTenantId === selectedSchoolId,
    ) ?? null;
  const cycleQueueItem = queue?.items.find((item) => item.cycleId === cycleId) ?? null;
  const visitDetailsValidation = useMemo(
    () => validateVisitDetails(dateObserved, visitDetails),
    [dateObserved, visitDetails],
  );

  function updateVisitDetail(
    field: keyof VisitDetailsDraft,
    value: string,
  ) {
    setVisitDetails((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }

  useEffect(() => {
    if (!queue) return;

    const selectedCircuitStillExists = selectableCircuits.some(
      (circuit) => circuit.circuitId === selectedCircuitId,
    );
    const nextCircuitId =
      queue.selection.assignedCircuitId ||
      (selectedCircuitStillExists ? selectedCircuitId : "") ||
      (selectableCircuits.length === 1 ? selectableCircuits[0].circuitId : "");

    if (nextCircuitId !== selectedCircuitId) {
      setSelectedCircuitId(nextCircuitId);
      setSelectedSchoolId("");
    }
  }, [queue, selectableCircuits, selectedCircuitId]);

  useEffect(() => {
    if (!selectedCircuitId) {
      if (selectedSchoolId) setSelectedSchoolId("");
      return;
    }

    const selectedSchoolStillExists = queueSchools.some(
      (school) => school.schoolId === selectedSchoolId,
    );
    const nextSchoolId = selectedSchoolStillExists
      ? selectedSchoolId
      : queueSchools.length === 1
        ? queueSchools[0].schoolId
        : "";

    if (nextSchoolId !== selectedSchoolId) {
      setSelectedSchoolId(nextSchoolId);
    }
  }, [queueSchools, selectedCircuitId, selectedSchoolId]);

  const processAutosaveQueue = useCallback(async () => {
    if (!assessmentId || autosaveRunningRef.current) return;

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
        setError("");

        try {
          const response = await fetch(
            `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/section`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sectionKey: pending.sectionKey,
                scores: pending.scores,
              }),
            },
          );
          const body = (await readApiBody(response)) as
            | { ok: true; result: { outcome: string } }
            | ApiFailure;

          if (!response.ok || body.ok !== true) {
            throw new Error(messageFromFailure(body, response.status));
          }

          savedSectionSignaturesRef.current.set(
            sectionKey,
            pending.signature,
          );

          const latest = pendingSectionSavesRef.current.get(sectionKey);
          if (latest?.signature === pending.signature) {
            pendingSectionSavesRef.current.delete(sectionKey);
          }

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
  }, [assessmentId]);

  const queueSectionAutosave = useCallback(
    (sectionKey: string, nextAnswers: Record<string, ScoreDraft>, delay = 1200) => {
      const activeWorkspace = workspaceRef.current;
      const section = activeWorkspace?.sections.find(
        (candidate) => candidate.sectionKey === sectionKey,
      );
      if (!section || activeWorkspace?.assessment.canEdit !== true) return;

      const scores = section.items.flatMap((item) => {
        const answer = nextAnswers[answerKey(section.sectionKey, item.itemKey)];
        return answer
          ? [
              {
                itemKey: item.itemKey,
                score: answer.notApplicable ? null : answer.score,
                notApplicable: answer.notApplicable,
              },
            ]
          : [];
      });

      if (scores.length === 0) return;

      pendingSectionSavesRef.current.set(sectionKey, {
        sectionKey,
        scores,
        signature: sectionSaveSignature(scores),
      });
      setAutosaveState("queued");
      setNotice("");

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
      if (pendingSectionSavesRef.current.size > 0) {
        void processAutosaveQueue();
      }
    };

    const markOffline = () => {
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

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (
        pendingSectionSavesRef.current.size > 0 ||
        autosaveRunningRef.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  function chooseItemScore(
    sectionKey: string,
    itemKey: string,
    score: number | null,
    notApplicable: boolean,
  ) {
    if (workspace?.assessment.canEdit !== true) return;

    setReviewMode(false);
    const nextAnswers = {
      ...answersRef.current,
      [answerKey(sectionKey, itemKey)]: {
        score,
        notApplicable,
      },
    };

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setNotice("");
    queueSectionAutosave(sectionKey, nextAnswers);
  }

  function sectionAnsweredCount(section: WorkspaceSection) {
    return section.items.filter(
      (item) => answers[answerKey(section.sectionKey, item.itemKey)],
    ).length;
  }

  async function reviewCompletedAssessment() {
    if (!workspace || !assessmentId) return;

    for (const section of workspace.sections) {
      queueSectionAutosave(section.sectionKey, answersRef.current, 0);
    }
    await processAutosaveQueue();

    if (pendingSectionSavesRef.current.size > 0) {
      setError(
        "Some answers are still waiting for the connection. Keep this page open and try review again after autosave completes.",
      );
      return;
    }

    await loadWorkspace(assessmentId, { sectionIndex, itemIndex });
    setReviewMode(true);
    setNotice(
      "All answers are saved. Review the complete native form before submitting.",
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        nativeReviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  function directOpenKeyFor(target: DirectOpenTarget) {
    const targetKey = `${target.targetTenantId}:${target.targetHeadteacherUserId}`;
    const existing = directOpenKeysRef.current.get(targetKey);
    if (existing) return existing;

    const generated = `HEADTEACHER-DIRECT-OPEN:${window.crypto.randomUUID()}`;
    directOpenKeysRef.current.set(targetKey, generated);
    return generated;
  }

  async function directOpenSelectedHeadteacher() {
    if (!selectedDirectOpenTarget || queue?.actorRole !== "DISTRICT_DIRECTOR") {
      return;
    }

    const confirmed = window.confirm(
      `Open the Headteacher appraisal cycle for ${selectedDirectOpenTarget.targetHeadteacherName || "this Headteacher"} at ${selectedDirectOpenTarget.schoolName}? This opens the confidential 7-day staff-feedback window, freezes the currently eligible Teachers as respondents, and queues their notifications.`,
    );
    if (!confirmed) return;

    setOpeningCycle(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/district/headteacher-appraisals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "DIRECT_OPEN",
            targetHeadteacherUserId:
              selectedDirectOpenTarget.targetHeadteacherUserId,
            targetTenantId: selectedDirectOpenTarget.targetTenantId,
            directOpenKey: directOpenKeyFor(selectedDirectOpenTarget),
            confirm: true,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { outcome: string } }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      setNotice(
        "Appraisal cycle opened. Confidential staff feedback is active and the supervisory assessment is now available.",
      );
      await loadQueue();
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "The Headteacher appraisal cycle could not be opened.",
      );
    } finally {
      setOpeningCycle(false);
    }
  }

  function resetFeedbackBulkReview() {
    setFeedbackPreview(null);
    setFeedbackPreviewExpanded(false);
    setFeedbackBulkResult(null);
    setError("");
    setNotice("");
  }

  function chooseFeedbackAudience(mode: "DISTRICT" | "CIRCUIT") {
    setFeedbackAudienceMode(mode);
    setFeedbackSelectedCircuitIds([]);
    setFeedbackSelectedSchoolIds([]);
    setFeedbackSingleCircuitAllSchools(true);
    setFeedbackSchoolFilter("");
    resetFeedbackBulkReview();
  }

  function toggleFeedbackCircuit(circuitId: string) {
    setFeedbackSelectedCircuitIds((current) =>
      current.includes(circuitId)
        ? current.filter((id) => id !== circuitId)
        : [...current, circuitId],
    );
    setFeedbackSelectedSchoolIds([]);
    setFeedbackSingleCircuitAllSchools(true);
    setFeedbackSchoolFilter("");
    resetFeedbackBulkReview();
  }

  function chooseSingleCircuitSchoolMode(allSchools: boolean) {
    setFeedbackSingleCircuitAllSchools(allSchools);
    setFeedbackSelectedSchoolIds([]);
    setFeedbackSchoolFilter("");
    resetFeedbackBulkReview();
  }

  function toggleFeedbackSchool(schoolId: string) {
    setFeedbackSelectedSchoolIds((current) =>
      current.includes(schoolId)
        ? current.filter((id) => id !== schoolId)
        : [...current, schoolId],
    );
    resetFeedbackBulkReview();
  }

  function currentFeedbackScopeLevel(): HeadteacherFeedbackBulkScopeLevel {
    if (feedbackAudienceMode === "DISTRICT") return "DISTRICT";
    if (
      feedbackSelectedCircuitIds.length === 1 &&
      !feedbackSingleCircuitAllSchools
    ) {
      return "SCHOOL";
    }
    return "CIRCUIT";
  }

  function currentFeedbackScopeIds() {
    const level = currentFeedbackScopeLevel();
    if (level === "DISTRICT") return [] as string[];
    if (level === "CIRCUIT") {
      return [...feedbackSelectedCircuitIds].sort();
    }
    return [...feedbackSelectedSchoolIds].sort();
  }

  function feedbackScopeSignature() {
    return `${currentFeedbackScopeLevel()}:${currentFeedbackScopeIds().join(",")}`;
  }

  function feedbackBulkOpenKeyForCurrentScope() {
    const signature = feedbackScopeSignature();
    const existing = feedbackBulkOpenKeysRef.current.get(signature);
    if (existing) return existing;

    const generated = `HEADTEACHER-BULK-OPEN:${window.crypto.randomUUID()}`;
    feedbackBulkOpenKeysRef.current.set(signature, generated);
    return generated;
  }

  function feedbackScopeReady() {
    if (feedbackAudienceMode === "DISTRICT") return true;
    if (feedbackSelectedCircuitIds.length === 0) return false;
    if (
      feedbackSelectedCircuitIds.length === 1 &&
      !feedbackSingleCircuitAllSchools
    ) {
      return feedbackSelectedSchoolIds.length > 0;
    }
    return true;
  }

  async function previewHeadteacherStaffFeedback() {
    if (queue?.actorRole !== "DISTRICT_DIRECTOR" || !feedbackScopeReady()) {
      return;
    }

    setFeedbackPreviewLoading(true);
    setFeedbackBulkResult(null);
    setError("");
    setNotice("");

    try {
      const params = new URLSearchParams({
        mode: "BULK_PREVIEW",
        scopeType: currentFeedbackScopeLevel(),
      });
      for (const scopeId of currentFeedbackScopeIds()) {
        params.append("scopeId", scopeId);
      }

      const response = await fetch(
        `/api/district/headteacher-appraisals?${params.toString()}`,
        { cache: "no-store" },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; preview: HeadteacherFeedbackBulkPreview }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      setFeedbackPreview(body.preview);
      setFeedbackPreviewExpanded(false);
    } catch (previewError) {
      setFeedbackPreview(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "The staff-feedback preview could not be loaded.",
      );
    } finally {
      setFeedbackPreviewLoading(false);
    }
  }

  async function confirmHeadteacherStaffFeedback() {
    if (queue?.actorRole !== "DISTRICT_DIRECTOR" || !feedbackPreview) return;

    const currentIds = currentFeedbackScopeIds();
    const commandScopeLevel = currentFeedbackScopeLevel();
    const commandScopeSignature = `${commandScopeLevel}:${currentIds.join(",")}`;
    const commandBulkOpenKey = feedbackBulkOpenKeyForCurrentScope();
    const previewIds = [...feedbackPreview.scope.ids].sort();
    if (
      feedbackPreview.scope.level !== commandScopeLevel ||
      JSON.stringify(previewIds) !== JSON.stringify(currentIds)
    ) {
      setFeedbackPreview(null);
      setError("The selected scope changed. Preview it again before opening.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm this 7-day staff-feedback exercise? EduLife OS will open ${feedbackPreview.summary.willOpen} new Headteacher cycle(s), keep ${feedbackPreview.summary.keepExisting} existing cycle(s), skip ${feedbackPreview.summary.willSkip}, freeze eligible Teachers server-side, and queue in-app, SMS and email notifications with the same deadline.`,
    );
    if (!confirmed) return;

    setFeedbackOpening(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/district/headteacher-appraisals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "BULK_DIRECT_OPEN",
            scopeType: commandScopeLevel,
            scopeIds: currentIds,
            bulkOpenKey: commandBulkOpenKey,
            confirm: true,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | {
            ok: true;
            result: HeadteacherFeedbackBulkOpenResult;
            directOpenTargets: DirectOpenTargets;
          }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      feedbackBulkOpenKeysRef.current.delete(commandScopeSignature);
      setDirectOpenTargets(body.directOpenTargets);
      setFeedbackBulkResult(body.result);
      setFeedbackPreview(null);
      setFeedbackPreviewExpanded(false);
      setNotice(staffFeedbackResultMessage(body.result));

      // The District endpoint returns the Staff Feedback director queue, not the
      // Governance supervisory queue rendered by this client. Refresh the latter
      // only through its own no-store endpoint so incompatible queue shapes can
      // never replace the current supervisory state after a bulk command.
      await loadQueue();
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "The staff-feedback exercise could not be opened.",
      );
    } finally {
      setFeedbackOpening(false);
    }
  }

  function directorDirectTargetFromKey() {
    if (!directorDirectTargetKey) return null;
    return (
      directOpenTargets?.targets.find(
        (target) =>
          `${target.targetTenantId}:${target.targetHeadteacherUserId}` ===
          directorDirectTargetKey,
      ) ?? null
    );
  }

  function directorDirectCommandSignature(
    target: DirectOpenTarget,
    values: ValidatedVisitDetails,
  ) {
    return JSON.stringify({
      targetTenantId: target.targetTenantId,
      targetHeadteacherUserId: target.targetHeadteacherUserId,
      dateObserved,
      ...values,
    });
  }

  function directorDirectAssessmentKeyFor(
    target: DirectOpenTarget,
    values: ValidatedVisitDetails,
  ) {
    const signature = directorDirectCommandSignature(target, values);
    const existing = directorDirectAssessmentKeysRef.current.get(signature);
    if (existing) return { key: existing, signature };

    const key = `HEADTEACHER-GOVERNANCE-DIRECT:${window.crypto.randomUUID()}`;
    directorDirectAssessmentKeysRef.current.set(signature, key);
    return { key, signature };
  }

  async function startDirectorDirectAssessment() {
    if (queue?.actorRole !== "DISTRICT_DIRECTOR") return;

    const target = directorDirectTargetFromKey();
    if (!target) {
      setError("Choose the Headteacher you want to assess.");
      return;
    }

    const validation = validateVisitDetails(dateObserved, visitDetails);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const confirmed = window.confirm(
      `Start the official Headteacher assessment for ${target.targetHeadteacherName || "this Headteacher"} at ${target.schoolName}?`,
    );
    if (!confirmed) return;

    const command = directorDirectAssessmentKeyFor(target, validation.values);
    setDirectorDirectStarting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/governance/appraisals/headteacher-supervisory/direct",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: target.targetHeadteacherUserId,
            targetTenantId: target.targetTenantId,
            directAssessmentKey: command.key,
            dateObserved,
            ...validation.values,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: HeadteacherSupervisoryDirectorDraftResult }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      directorDirectAssessmentKeysRef.current.delete(command.signature);
      const nextId = body.result.draft.assessmentId;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "The Headteacher assessment could not be started.",
      );
    } finally {
      setDirectorDirectStarting(false);
    }
  }

  function officerDirectTargetFromKey() {
    if (!officerDirectTargetKey) return null;
    return (
      queue?.directTargets.find(
        (target) =>
          `${target.schoolId}:${target.targetUserId}` === officerDirectTargetKey,
      ) ?? null
    );
  }

  function officerDirectCommandSignature(
    target: SupervisoryDirectTarget,
    values: ValidatedVisitDetails,
  ) {
    return JSON.stringify({
      actorRole: queue?.actorRole ?? "",
      targetTenantId: target.schoolId,
      targetUserId: target.targetUserId,
      dateObserved,
      ...values,
    });
  }

  function officerDirectAssessmentKeyFor(
    target: SupervisoryDirectTarget,
    values: ValidatedVisitDetails,
  ) {
    const signature = officerDirectCommandSignature(target, values);
    const existing = officerDirectAssessmentKeysRef.current.get(signature);
    if (existing) return { key: existing, signature };

    const key = `HEADTEACHER-GOVERNANCE-OFFICER:${window.crypto.randomUUID()}`;
    officerDirectAssessmentKeysRef.current.set(signature, key);
    return { key, signature };
  }

  async function startOfficerDirectAssessment() {
    const actorRole = queue?.actorRole;
    if (
      actorRole !== "SISSO" &&
      actorRole !== "BASIC_SCHOOL_COORDINATOR" &&
      actorRole !== "HEAD_OF_SUPERVISION"
    ) {
      return;
    }

    const target = officerDirectTargetFromKey();
    if (!target) {
      setError("Choose the Headteacher you want to assess.");
      return;
    }

    const validation = validateVisitDetails(dateObserved, visitDetails);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const confirmed = window.confirm(
      `Start the official Headteacher assessment for ${target.targetName || "this Headteacher"} at ${target.schoolName}?`,
    );
    if (!confirmed) return;

    const command = officerDirectAssessmentKeyFor(target, validation.values);
    setOfficerDirectStarting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/governance/appraisals/headteacher-supervisory/direct",
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetUserId: target.targetUserId,
            targetTenantId: target.schoolId,
            directAssessmentKey: command.key,
            dateObserved,
            ...validation.values,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: HeadteacherSupervisoryOfficerDraftResult }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      officerDirectAssessmentKeysRef.current.delete(command.signature);
      const nextId = body.result.draft.assessmentId;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "The Headteacher assessment could not be started.",
      );
    } finally {
      setOfficerDirectStarting(false);
    }
  }

  async function releaseDirectorSubmittedAssessment(
    item: SupervisoryQueueItem,
  ) {
    const submittedAssessmentId = item.supervisory.assessmentId;
    if (
      queue?.actorRole !== "DISTRICT_DIRECTOR" ||
      item.supervisory.state !== "SUBMITTED" ||
      !submittedAssessmentId ||
      item.release.canDirectRelease !== true
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Release the locked Governance assessment for ${item.targetName || "this Headteacher"} at ${item.schoolName}? The Headteacher will be able to see this result. Staff feedback remains separate.`,
    );
    if (!confirmed) return;

    setDirectorReleasingAssessmentId(submittedAssessmentId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(submittedAssessmentId)}/direct-release`,
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
              outcome: "RELEASED" | "EXISTING_RELEASED";
              governanceReleaseStatus: "RELEASED";
              assessmentId: string;
            };
          }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        const payload = body as ApiFailure;

        if (
          payload.error ===
            "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED" &&
          payload.releaseCommitted === true &&
          payload.retrySafe === true
        ) {
          setError(
            "The appraisal was released, but the Headteacher notification still needs retrying. Repeating release will not duplicate the official result.",
          );
          return;
        }

        throw new Error(messageFromFailure(body, response.status));
      }

      setNotice(
        body.result.outcome === "EXISTING_RELEASED"
          ? "This assessment was already released to the Headteacher. The Headteacher notification was queued safely."
          : "Assessment released to the Headteacher. The Headteacher notification was queued safely.",
      );
      await loadQueue();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "The assessment could not be released to the Headteacher.",
      );
    } finally {
      setDirectorReleasingAssessmentId("");
    }
  }

  async function createDraft() {
    if (!cycleId) return;

    const validation = validateVisitDetails(dateObserved, visitDetails);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/governance/appraisals/headteacher-supervisory",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId,
            dateObserved,
            ...validation.values,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { assessment: { id: string } } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      const nextId = body.result.assessment.id;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The assessment draft could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finalizeAssessment() {
    if (!workspace || !assessmentId || workspace.assessment.canFinalize !== true) {
      return;
    }
    const confirmed = window.confirm(
      "Submit this supervisory assessment? You cannot edit the submitted version.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmFinalization: true }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { outcome: string } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      setNotice(
        workspace.visit.assessorRole === "DISTRICT_DIRECTOR"
          ? "Assessment submitted and locked. Return to the work list to release it to the Headteacher."
          : "Assessment submitted and locked for review.",
      );
      await loadWorkspace(assessmentId);
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "The assessment could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startReturnedCorrection(item: SupervisoryQueueItem) {
    const returnedAssessmentId = item.supervisory.assessmentId;
    if (
      item.supervisory.state !== "RETURNED" ||
      !returnedAssessmentId
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const inspectResponse = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(returnedAssessmentId)}`,
        { cache: "no-store" },
      );
      const inspectBody = (await readApiBody(inspectResponse)) as
        | { ok: true; workspace: Workspace }
        | ApiFailure;

      if (!inspectResponse.ok || inspectBody.ok !== true) {
        throw new Error(
          messageFromFailure(inspectBody, inspectResponse.status),
        );
      }

      if (inspectBody.workspace.lifecycle.canCreateRevision !== true) {
        throw new Error(
          "This returned assessment is not ready for a correction revision.",
        );
      }

      const returnReason =
        inspectBody.workspace.lifecycle.returnReason?.trim() ||
        "The reviewer requested a correction.";

      const confirmed = window.confirm(
        `Start correction for ${item.targetName || "this Headteacher"}?\n\nReason returned: ${returnReason}\n\nA new editable revision will be created. The returned version stays locked as history.`,
      );
      if (!confirmed) return;

      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(returnedAssessmentId)}/revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmRevision: true }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { revision: { id: string } } }
        | ApiFailure;

      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      const nextId = body.result.revision.id;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
      setNotice(
        "Correction opened. Change only what was returned, then review and resubmit.",
      );
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "The correction could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createRevision() {
    if (!workspace || !assessmentId || !workspace.lifecycle.canCreateRevision) {
      return;
    }
    const confirmed = window.confirm(
      "Start correction? A new editable revision will be created. The returned version will remain preserved as history.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmRevision: true }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { revision: { id: string } } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      const nextId = body.result.revision.id;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
      setNotice("Correction opened. Change only what was returned, then review and resubmit.");
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "The correction copy could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!assessmentId && !cycleId) {
    const actorRole = queue?.actorRole;
    const usesCompactOwnHeadteacherLanding =
      actorRole === "SISSO" ||
      actorRole === "HEAD_OF_SUPERVISION" ||
      actorRole === "BASIC_SCHOOL_COORDINATOR";
    const compactOfficerLabel =
      actorRole === "SISSO"
        ? "SISSO"
        : actorRole === "BASIC_SCHOOL_COORDINATOR"
          ? "Basic School Coordinator"
          : "Head of Supervision";
    const selectedCircuit = selectableCircuits.find(
      (circuit) => circuit.circuitId === selectedCircuitId,
    );
    const savedItems = queue?.items.filter(
      (item) => item.supervisory.assessmentId != null,
    ) ?? [];

    const hosReturnedItems =
      usesCompactOwnHeadteacherLanding
        ? (queue?.items.filter(
            (item) =>
              item.supervisory.state === "RETURNED" &&
              item.supervisory.assessmentId != null,
          ) ?? [])
        : [];

    const hosNewOrActiveItems =
      usesCompactOwnHeadteacherLanding
        ? (queue?.items.filter(
            (item) => item.supervisory.state === "IN_PROGRESS",
          ) ?? [])
        : [];
    const officerNewTargets =
      usesCompactOwnHeadteacherLanding ? (queue?.directTargets ?? []) : [];
    const hosNewAvailableCount =
      hosNewOrActiveItems.length + officerNewTargets.length;

    const hosNewCircuitIds = new Set([
      ...hosNewOrActiveItems.map((item) => item.circuitId),
      ...officerNewTargets.map((target) => target.circuitId),
    ]);
    const hosNewCircuits = selectableCircuits.filter((circuit) =>
      hosNewCircuitIds.has(circuit.circuitId),
    );
    const hosNewSchoolIds = new Set([
      ...hosNewOrActiveItems
        .filter(
          (item) =>
            !selectedCircuitId || item.circuitId === selectedCircuitId,
        )
        .map((item) => item.schoolId),
      ...officerNewTargets
        .filter(
          (target) =>
            !selectedCircuitId || target.circuitId === selectedCircuitId,
        )
        .map((target) => target.schoolId),
    ]);
    const hosNewSchools = queueSchools.filter((school) =>
      hosNewSchoolIds.has(school.schoolId),
    );
    const hosSelectedNewItems = hosNewOrActiveItems.filter(
      (item) =>
        (!selectedCircuitId || item.circuitId === selectedCircuitId) &&
        (!selectedSchoolId || item.schoolId === selectedSchoolId),
    );
    const hosSelectedDirectTargets = officerNewTargets.filter(
      (target) =>
        (!selectedCircuitId || target.circuitId === selectedCircuitId) &&
        (!selectedSchoolId || target.schoolId === selectedSchoolId),
    );
    const officerDirectSelectedTarget = officerDirectTargetFromKey();
    const officerDirectVisitValidation = validateVisitDetails(
      dateObserved,
      visitDetails,
    );

    if (usesCompactOwnHeadteacherLanding) {
      return (
        <div
          data-hos-own-headteacher-appraisal-ui="bbc-v2"
          data-bsc-own-headteacher-appraisal-ui={
            actorRole === "BASIC_SCHOOL_COORDINATOR" ? "bbc-v1" : undefined
          }
          data-sisso-own-headteacher-appraisal-ui={
            actorRole === "SISSO" ? "bbc-v1" : undefined
          }
          data-compact-headteacher-appraisal-role={actorRole}
          className="min-h-screen bg-[#070B12] px-4 py-5 text-[#F7F4ED] sm:px-6"
        >
          <div className="mx-auto max-w-5xl space-y-4">
            <section className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.97),rgba(28,19,48,0.92))] p-4 shadow-xl sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E8C96A]">
                    {compactOfficerLabel}
                  </p>
                  <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
                    Headteacher Appraisal
                  </h1>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Choose what you want to do. Only that task will open.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={dashboardHref(actorRole)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white hover:bg-white/[0.08]"
                  >
                    ← Dashboard
                  </Link>
                  <button
                    type="button"
                    disabled={queueLoading}
                    onClick={() => void loadQueue()}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 text-sm font-bold text-fuchsia-50 disabled:opacity-50"
                  >
                    {queueLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
            </section>

            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-rose-100"
              >
                {error}
              </div>
            ) : null}

            {notice ? (
              <div
                role="status"
                className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm text-emerald-100"
              >
                {notice}
              </div>
            ) : null}

            <section
              aria-label="Headteacher appraisal tasks"
              className="grid gap-3 sm:grid-cols-2"
            >
              <button
                type="button"
                aria-expanded={hosLandingPanel === "RETURNED"}
                aria-controls="hos-returned-correction-panel"
                onClick={() =>
                  setHosLandingPanel((current) =>
                    current === "RETURNED" ? null : "RETURNED",
                  )
                }
                className={cx(
                  "min-h-28 rounded-2xl border p-4 text-left transition",
                  hosLandingPanel === "RETURNED"
                    ? "border-amber-300/45 bg-amber-400/15"
                    : "border-amber-300/20 bg-amber-400/[0.07] hover:bg-amber-400/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-white">
                      ↩ Returned for correction
                    </p>
                    <p className="mt-1 text-sm leading-5 text-amber-50/80">
                      {hosReturnedItems.length === 0
                        ? "No appraisal is waiting for correction."
                        : hosReturnedItems.length === 1
                          ? "1 appraisal needs your correction."
                          : `${hosReturnedItems.length} appraisals need your correction.`}
                    </p>
                  </div>
                  <span
                    aria-label={`${hosReturnedItems.length} returned appraisals need correction`}
                    className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-amber-200/40 bg-amber-300 px-2 text-sm font-black text-slate-950"
                  >
                    {hosReturnedItems.length}
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-amber-100">
                  {hosLandingPanel === "RETURNED" ? "Close" : "Open"} →
                </p>
              </button>

              <button
                type="button"
                aria-expanded={hosLandingPanel === "NEW"}
                aria-controls="hos-new-headteacher-appraisal-panel"
                onClick={() =>
                  setHosLandingPanel((current) =>
                    current === "NEW" ? null : "NEW",
                  )
                }
                className={cx(
                  "min-h-28 rounded-2xl border p-4 text-left transition",
                  hosLandingPanel === "NEW"
                    ? "border-fuchsia-300/45 bg-fuchsia-400/15"
                    : "border-fuchsia-300/20 bg-fuchsia-400/[0.07] hover:bg-fuchsia-400/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-white">
                      ＋ New Headteacher appraisal
                    </p>
                    <p className="mt-1 text-sm leading-5 text-fuchsia-50/80">
                      Start a new assessment or continue a draft.
                    </p>
                  </div>
                  <span className="rounded-full border border-fuchsia-200/25 bg-fuchsia-300/10 px-2.5 py-1 text-[11px] font-black text-fuchsia-100">
                    {hosNewAvailableCount} available
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-fuchsia-100">
                  {hosLandingPanel === "NEW" ? "Close" : "Open"} →
                </p>
              </button>
            </section>

            {hosLandingPanel === "RETURNED" ? (
              <section
                id="hos-returned-correction-panel"
                className="rounded-[24px] border border-amber-300/25 bg-amber-400/[0.06] p-3 sm:p-4"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">
                    Returned work
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white">
                    Correct and resubmit
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Start correction creates a new editable revision. The returned version stays locked as history.
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  {hosReturnedItems.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                      Nothing has been returned to you.
                    </p>
                  ) : (
                    hosReturnedItems.map((item) => (
                      <article
                        key={`returned:${item.cycleId}:${item.supervisory.assessmentId}`}
                        className="rounded-xl border border-white/10 bg-black/25 p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-white">
                              {item.targetName || "Headteacher"}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {item.schoolName} · {item.circuitName}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-amber-200">
                              {item.supervisory.label}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void startReturnedCorrection(item)}
                            className="min-h-11 w-full rounded-xl bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                          >
                            {busy ? "Opening…" : "Start correction"}
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {hosLandingPanel === "NEW" ? (
              <section
                id="hos-new-headteacher-appraisal-panel"
                className="rounded-[24px] border border-fuchsia-300/25 bg-fuchsia-400/[0.06] p-3 sm:p-4"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-fuchsia-200">
                    New or unfinished work
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white">
                    Choose Headteacher
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Choose the circuit, then the school. Returned corrections are kept in the other card.
                  </p>
                </div>

                {hosNewAvailableCount === 0 ? (
                  <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    No new or unfinished Headteacher appraisal is available.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        1. Circuit
                      </p>
                      <div className="mt-2 space-y-2">
                        {hosNewCircuits.map((circuit) => (
                          <button
                            key={`hos-new-circuit:${circuit.circuitId}`}
                            type="button"
                            onClick={() => {
                              setSelectedCircuitId(circuit.circuitId);
                              setSelectedSchoolId("");
                              setOfficerDirectTargetKey("");
                            }}
                            className={cx(
                              "w-full rounded-xl border p-3 text-left text-sm font-bold",
                              circuit.circuitId === selectedCircuitId
                                ? "border-fuchsia-300/40 bg-fuchsia-400/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-slate-200",
                            )}
                          >
                            {circuit.circuitName}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        2. School
                      </p>
                      {!selectedCircuitId ? (
                        <p className="mt-2 text-sm text-slate-300">
                          Choose a circuit first.
                        </p>
                      ) : hosNewSchools.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-300">
                          No new or unfinished appraisal is available in this circuit.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {hosNewSchools.map((school) => (
                            <button
                              key={`hos-new-school:${school.schoolId}`}
                              type="button"
                              onClick={() => {
                                setSelectedSchoolId(school.schoolId);
                                const directMatches = officerNewTargets.filter(
                                  (target) =>
                                    target.circuitId === selectedCircuitId &&
                                    target.schoolId === school.schoolId,
                                );
                                setOfficerDirectTargetKey(
                                  directMatches.length === 1
                                    ? `${directMatches[0].schoolId}:${directMatches[0].targetUserId}`
                                    : "",
                                );
                              }}
                              className={cx(
                                "w-full rounded-xl border p-3 text-left",
                                school.schoolId === selectedSchoolId
                                  ? "border-emerald-300/40 bg-emerald-400/10"
                                  : "border-white/10 bg-white/[0.03]",
                              )}
                            >
                              <p className="text-sm font-black text-white">
                                {school.schoolName}
                              </p>
                              <p className="mt-1 text-xs text-slate-300">
                                {school.headteacherName}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedSchoolId ? (
                  <div className="mt-3 space-y-2">
                    {hosSelectedNewItems.length === 0 &&
                    hosSelectedDirectTargets.length === 0 ? (
                      <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                        Choose a school with new or unfinished work.
                      </p>
                    ) : (
                      <>
                        {hosSelectedNewItems.map((item) => (
                          <article
                            key={`hos-new-item:${item.cycleId}:${item.supervisory.assessmentId ?? "none"}`}
                            className="rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-black text-white">
                                  {item.targetName || "Headteacher"}
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  {item.schoolName}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-sky-200">
                                  Draft {item.supervisory.completionPercentage}% complete
                                </p>
                              </div>
                              {item.action.enabled && item.action.url ? (
                                <a
                                  href={item.action.url}
                                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-black text-slate-950 sm:w-auto"
                                >
                                  Continue assessment
                                </a>
                              ) : (
                                <span className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-400">
                                  {item.action.label}
                                </span>
                              )}
                            </div>
                          </article>
                        ))}

                        {hosSelectedDirectTargets.map((target) => {
                          const targetKey = `${target.schoolId}:${target.targetUserId}`;
                          const selected =
                            officerDirectTargetKey === targetKey;
                          return (
                            <button
                              key={`officer-direct-target:${targetKey}`}
                              type="button"
                              onClick={() => {
                                setOfficerDirectTargetKey(targetKey);
                                setError("");
                              }}
                              className={cx(
                                "w-full rounded-xl border p-3 text-left",
                                selected
                                  ? "border-fuchsia-200/45 bg-fuchsia-300/15"
                                  : "border-white/10 bg-black/25",
                              )}
                            >
                              <p className="font-black text-white">
                                {target.targetName || "Headteacher"}
                              </p>
                              <p className="mt-1 text-sm text-slate-300">
                                {target.schoolName} · {target.circuitName}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-fuchsia-200">
                                {selected
                                  ? "Selected for a new Governance appraisal"
                                  : "Ready for a new Governance appraisal"}
                              </p>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {officerDirectSelectedTarget ? (
                      <div
                        data-officer-governance-direct-start="independent-v1"
                        className="rounded-xl border border-fuchsia-300/20 bg-black/25 p-3"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-fuchsia-200">
                          Visit details
                        </p>
                        <p
                          data-officer-governance-server-recheck="selected-target"
                          className="mt-1 text-xs leading-5 text-slate-400"
                        >
                          EduLife OS will check your current assignment, circuit or district, school and Headteacher again before starting.
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <label className="text-[11px] font-bold text-slate-300">
                            Date
                            <input
                              type="date"
                              value={dateObserved}
                              max={today()}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                setDateObserved(event.target.value);
                                setError("");
                              }}
                              className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                            />
                          </label>

                          <label className="text-[11px] font-bold text-slate-300">
                            Arrival time
                            <input
                              type="time"
                              value={visitDetails.arrivalTime}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                updateVisitDetail("arrivalTime", event.target.value)
                              }
                              className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                            />
                          </label>

                          {[
                            ["staffStrength", "Staff strength"],
                            ["teachersPresentAtVisit", "Teachers present"],
                            ["totalEnrolment", "Total enrolment"],
                            ["girls", "Girls"],
                            ["boys", "Boys"],
                          ].map(([field, label]) => (
                            <label
                              key={`officer-visit:${field}`}
                              className="text-[11px] font-bold text-slate-300"
                            >
                              {label}
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={
                                  visitDetails[
                                    field as keyof Omit<
                                      VisitDetailsDraft,
                                      "arrivalTime"
                                    >
                                  ]
                                }
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  updateVisitDetail(
                                    field as keyof VisitDetailsDraft,
                                    event.target.value,
                                  )
                                }
                                className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                              />
                            </label>
                          ))}
                        </div>

                        <p
                          className={cx(
                            "mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-4",
                            officerDirectVisitValidation.ok
                              ? "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100"
                              : "border-amber-300/20 bg-amber-400/[0.06] text-amber-100",
                          )}
                        >
                          {officerDirectVisitValidation.ok
                            ? "Visit details are ready."
                            : officerDirectVisitValidation.message}
                        </p>

                        <button
                          type="button"
                          disabled={
                            officerDirectStarting ||
                            !officerDirectVisitValidation.ok
                          }
                          onClick={() => void startOfficerDirectAssessment()}
                          className="mt-2 min-h-11 w-full rounded-lg border border-fuchsia-200/30 bg-fuchsia-300 px-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {officerDirectStarting
                            ? "Starting assessment…"
                            : "Start official assessment"}
                        </button>
                        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                          No staff-feedback exercise is opened. No respondents are invited. This starts only your official Governance assessment.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            <p className="text-center text-xs leading-5 text-slate-500">
              Explicit actions only · no background polling · no persistent browser storage
            </p>
          </div>
        </div>
      );
    }


    if (actorRole === "DISTRICT_DIRECTOR") {
      const directorSubmittedItems =
        queue?.items.filter(
          (item) =>
            item.supervisory.state === "SUBMITTED" &&
            item.supervisory.assessmentId != null,
        ) ?? [];
      const directorContinuableItems =
        queue?.items.filter(
          (item) =>
            (item.supervisory.state === "IN_PROGRESS" ||
              item.supervisory.state === "RETURNED") &&
            item.supervisory.assessmentId != null,
        ) ?? [];
      const feedbackCircuits = [...(directOpenTargets?.circuits ?? [])].sort(
        (left, right) => left.circuitName.localeCompare(right.circuitName),
      );
      const feedbackSchoolMap = new Map<
        string,
        {
          schoolId: string;
          schoolName: string;
          circuitId: string;
          circuitName: string;
          districtId: string;
          districtName: string;
          headteacherNames: string[];
        }
      >();

      for (const target of directOpenTargets?.targets ?? []) {
        const current = feedbackSchoolMap.get(target.targetTenantId) ?? {
          schoolId: target.targetTenantId,
          schoolName: target.schoolName,
          circuitId: target.circuitId,
          circuitName: target.circuitName,
          districtId: target.districtId,
          districtName: target.districtName,
          headteacherNames: [],
        };
        const targetName = target.targetHeadteacherName || "Headteacher";
        if (!current.headteacherNames.includes(targetName)) {
          current.headteacherNames.push(targetName);
        }
        feedbackSchoolMap.set(target.targetTenantId, current);
      }

      const feedbackSchools = [...feedbackSchoolMap.values()].sort(
        (left, right) =>
          left.circuitName.localeCompare(right.circuitName) ||
          left.schoolName.localeCompare(right.schoolName),
      );
      const normalizedSchoolFilter = feedbackSchoolFilter.trim().toLowerCase();
      const selectedSingleCircuit =
        feedbackSelectedCircuitIds.length === 1
          ? feedbackCircuits.find(
              (circuit) => circuit.circuitId === feedbackSelectedCircuitIds[0],
            ) ?? null
          : null;
      const singleCircuitSchools = selectedSingleCircuit
        ? feedbackSchools.filter(
            (school) => school.circuitId === selectedSingleCircuit.circuitId,
          )
        : [];
      const filteredSingleCircuitSchools = normalizedSchoolFilter
        ? singleCircuitSchools.filter((school) =>
            [school.schoolName, ...school.headteacherNames]
              .join(" ")
              .toLowerCase()
              .includes(normalizedSchoolFilter),
          )
        : singleCircuitSchools;
      const districtNames = [
        ...new Set(feedbackSchools.map((school) => school.districtName)),
      ];
      const effectiveFeedbackScopeLevel = currentFeedbackScopeLevel();
      const selectedFeedbackCount =
        feedbackAudienceMode === "DISTRICT"
          ? feedbackSchools.length
          : effectiveFeedbackScopeLevel === "SCHOOL"
            ? feedbackSelectedSchoolIds.length
            : feedbackSelectedCircuitIds.length;
      const previewButtonLabel =
        feedbackAudienceMode === "DISTRICT"
          ? `Preview district`
          : effectiveFeedbackScopeLevel === "SCHOOL"
            ? `Preview ${selectedFeedbackCount || "selected"} school${selectedFeedbackCount === 1 ? "" : "s"}`
            : `Preview ${selectedFeedbackCount || "selected"} circuit${selectedFeedbackCount === 1 ? "" : "s"}`;

      const directorDirectTargets = [...(directOpenTargets?.targets ?? [])].sort(
        (left, right) =>
          left.circuitName.localeCompare(right.circuitName) ||
          left.schoolName.localeCompare(right.schoolName) ||
          (left.targetHeadteacherName || "").localeCompare(
            right.targetHeadteacherName || "",
          ),
      );
      const directorDirectCircuits = [...(directOpenTargets?.circuits ?? [])].sort(
        (left, right) => left.circuitName.localeCompare(right.circuitName),
      );
      const directorDirectSchoolMap = new Map<string, {
        schoolId: string;
        schoolName: string;
        circuitId: string;
        circuitName: string;
      }>();
      for (const target of directorDirectTargets) {
        if (
          directorDirectCircuitId &&
          target.circuitId !== directorDirectCircuitId
        ) {
          continue;
        }
        directorDirectSchoolMap.set(target.targetTenantId, {
          schoolId: target.targetTenantId,
          schoolName: target.schoolName,
          circuitId: target.circuitId,
          circuitName: target.circuitName,
        });
      }
      const directorDirectSchools = [...directorDirectSchoolMap.values()].sort(
        (left, right) => left.schoolName.localeCompare(right.schoolName),
      );
      const directorDirectSchoolTargets = directorDirectTargets.filter(
        (target) =>
          (!directorDirectCircuitId ||
            target.circuitId === directorDirectCircuitId) &&
          (!directorDirectSchoolId ||
            target.targetTenantId === directorDirectSchoolId),
      );
      const normalizedDirectSearch = directorDirectSearch.trim().toLowerCase();
      const directorDirectSearchResults = normalizedDirectSearch
        ? directorDirectTargets
            .filter((target) =>
              [
                target.targetHeadteacherName || "",
                target.schoolName,
                target.circuitName,
              ]
                .join(" ")
                .toLowerCase()
                .includes(normalizedDirectSearch),
            )
            .slice(0, 12)
        : [];
      const directorDirectSelectedTarget = directorDirectTargetFromKey();
      const directorDirectVisitValidation = validateVisitDetails(
        dateObserved,
        visitDetails,
      );

      return (
        <div
          data-director-own-headteacher-appraisal-ui="bbc-v2"
          data-director-staff-feedback-bulk-ui="multi-scope-v1"
          className="min-h-screen bg-[#070B12] px-4 py-5 text-[#F7F4ED] sm:px-6"
        >
          <div className="mx-auto max-w-5xl space-y-4">
            <section className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.97),rgba(28,19,48,0.92))] p-4 shadow-xl sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E8C96A]">
                    District Director
                  </p>
                  <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
                    Headteacher Appraisal
                  </h1>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Choose one task. Only that work opens, so the screen stays simple on phones and weak networks.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/district/dashboard"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white hover:bg-white/[0.08]"
                  >
                    ← Dashboard
                  </Link>
                  <button
                    type="button"
                    disabled={queueLoading || directOpenTargetsLoading}
                    onClick={() => {
                      void loadQueue();
                      if (directorLandingPanel === "NEW") {
                        void loadDirectOpenTargets();
                      }
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 text-sm font-bold text-fuchsia-50 disabled:opacity-50"
                  >
                    {queueLoading || directOpenTargetsLoading
                      ? "Refreshing…"
                      : "Refresh"}
                  </button>
                </div>
              </div>
            </section>

            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-rose-100"
              >
                {error}
              </div>
            ) : null}

            {notice ? (
              <div
                role="status"
                className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm text-emerald-100"
              >
                {notice}
              </div>
            ) : null}

            <section
              aria-label="District Director Headteacher appraisal tasks"
              className="grid gap-3 sm:grid-cols-2"
            >
              <button
                type="button"
                aria-expanded={directorLandingPanel === "SUBMITTED"}
                aria-controls="director-submitted-headteacher-appraisals"
                onClick={() => {
                  setDirectorNewWorkPath(null);
                  setDirectorLandingPanel((current) =>
                    current === "SUBMITTED" ? null : "SUBMITTED",
                  );
                }}
                className={cx(
                  "min-h-28 rounded-2xl border p-4 text-left transition",
                  directorLandingPanel === "SUBMITTED"
                    ? "border-emerald-300/45 bg-emerald-400/15"
                    : "border-emerald-300/20 bg-emerald-400/[0.07] hover:bg-emerald-400/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-white">
                      ✓ Submitted assessments
                    </p>
                    <p className="mt-1 text-sm leading-5 text-emerald-50/80">
                      Open locked assessments in the native white form.
                    </p>
                  </div>
                  <span className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-300 px-2 text-sm font-black text-slate-950">
                    {directorSubmittedItems.length}
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-emerald-100">
                  {directorLandingPanel === "SUBMITTED" ? "Close" : "Open"} →
                </p>
              </button>

              <button
                type="button"
                aria-expanded={directorLandingPanel === "NEW"}
                aria-controls="director-new-headteacher-appraisal"
                onClick={() => {
                  const nextPanel =
                    directorLandingPanel === "NEW" ? null : "NEW";
                  setDirectorLandingPanel(nextPanel);
                  setDirectorNewWorkPath(null);
                  if (nextPanel === "NEW") {
                    void loadDirectOpenTargets();
                  }
                }}
                className={cx(
                  "min-h-28 rounded-2xl border p-4 text-left transition",
                  directorLandingPanel === "NEW"
                    ? "border-fuchsia-300/45 bg-fuchsia-400/15"
                    : "border-fuchsia-300/20 bg-fuchsia-400/[0.07] hover:bg-fuchsia-400/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-white">
                      ＋ New Headteacher appraisal
                    </p>
                    <p className="mt-1 text-sm leading-5 text-fuchsia-50/80">
                      Invite confidential staff feedback or work on a direct Governance assessment.
                    </p>
                  </div>
                  <span className="rounded-full border border-fuchsia-200/25 bg-fuchsia-300/10 px-2.5 py-1 text-[11px] font-black text-fuchsia-100">
                    2 choices
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-fuchsia-100">
                  {directorLandingPanel === "NEW" ? "Close" : "Open"} →
                </p>
              </button>
            </section>

            {directorLandingPanel === "SUBMITTED" ? (
              <section
                id="director-submitted-headteacher-appraisals"
                className="rounded-[24px] border border-emerald-300/25 bg-emerald-400/[0.06] p-3 sm:p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                  Submitted assessments
                </p>
                <h2 className="mt-1 text-lg font-black text-white">
                  Review and release locked assessments
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-300">
                  Opening a submitted assessment shows the native white read-only form, not the questionnaire.
                </p>

                <div className="mt-3 space-y-2">
                  {directorSubmittedItems.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                      No submitted Headteacher assessment is available.
                    </p>
                  ) : (
                    directorSubmittedItems.map((item) => (
                      <article
                        key={`director-submitted:${item.cycleId}:${item.supervisory.assessmentId}`}
                        className="rounded-xl border border-white/10 bg-black/25 p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-white">
                              {item.targetName || "Headteacher"}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {item.schoolName} · {item.circuitName}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-emerald-200">
                              {item.release.releasedToHeadteacher
                                ? item.supervisory.overallPercentage == null
                                  ? "Released to Headteacher"
                                  : `Released to Headteacher · ${formatPercent(item.supervisory.overallPercentage)}`
                                : item.supervisory.overallPercentage == null
                                  ? "Submitted and locked"
                                  : `Submitted result · ${formatPercent(item.supervisory.overallPercentage)}`}
                            </p>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <a
                              href={`/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
                                item.supervisory.assessmentId || "",
                              )}`}
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-200/25 bg-emerald-300 px-4 text-sm font-black text-slate-950 hover:bg-emerald-200 sm:w-auto"
                            >
                              View submitted assessment
                            </a>
                            {item.release.canDirectRelease ? (
                              <button
                                type="button"
                                disabled={
                                  directorReleasingAssessmentId ===
                                  item.supervisory.assessmentId
                                }
                                onClick={() =>
                                  void releaseDirectorSubmittedAssessment(item)
                                }
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-200/30 bg-sky-300 px-4 text-sm font-black text-slate-950 hover:bg-sky-200 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                              >
                                {directorReleasingAssessmentId ===
                                item.supervisory.assessmentId
                                  ? "Releasing…"
                                  : "Release to Headteacher"}
                              </button>
                            ) : item.release.releasedToHeadteacher ? (
                              <span className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-200/25 bg-emerald-400/10 px-4 text-sm font-black text-emerald-100 sm:w-auto">
                                Released to Headteacher
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {directorLandingPanel === "NEW" ? (
              <section
                id="director-new-headteacher-appraisal"
                data-director-new-work-paths="compact-accordion-v1"
                className="space-y-2 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/[0.05] p-2.5 sm:p-3"
              >
                <p className="px-1 text-xs leading-5 text-slate-300">
                  Choose one. Staff feedback and the Governance assessment stay separate.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-expanded={directorNewWorkPath === "STAFF"}
                    onClick={() =>
                      setDirectorNewWorkPath((current) =>
                        current === "STAFF" ? null : "STAFF",
                      )
                    }
                    className={cx(
                      "rounded-xl border p-2.5 text-left transition",
                      directorNewWorkPath === "STAFF"
                        ? "border-amber-200/45 bg-amber-300/15"
                        : "border-amber-200/20 bg-amber-300/[0.07] hover:bg-amber-300/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white">
                          📣 Invite staff feedback · 7 days
                        </p>
                        <p className="mt-0.5 text-xs text-slate-300">
                          District or one/more circuits
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-amber-200/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-black text-amber-100">
                        Ready
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-amber-100">
                      {directorNewWorkPath === "STAFF" ? "Hide" : "Open"} →
                    </p>
                  </button>

                  <button
                    type="button"
                    aria-expanded={directorNewWorkPath === "GOVERNANCE"}
                    onClick={() =>
                      setDirectorNewWorkPath((current) =>
                        current === "GOVERNANCE" ? null : "GOVERNANCE",
                      )
                    }
                    className={cx(
                      "rounded-xl border p-2.5 text-left transition",
                      directorNewWorkPath === "GOVERNANCE"
                        ? "border-fuchsia-200/45 bg-fuchsia-300/15"
                        : "border-fuchsia-200/20 bg-fuchsia-300/[0.07] hover:bg-fuchsia-300/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white">
                          📝 Assess Headteacher directly
                        </p>
                        <p className="mt-0.5 text-xs text-slate-300">
                          Official 4/34 Governance form
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-fuchsia-200/25 bg-fuchsia-300/10 px-2 py-0.5 text-[10px] font-black text-fuchsia-100">
                        Separate
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-fuchsia-100">
                      {directorNewWorkPath === "GOVERNANCE" ? "Hide" : "Open"} →
                    </p>
                  </button>
                </div>

                {directorNewWorkPath === "STAFF" ? (
                  <section
                    data-headteacher-feedback-audience="district-or-circuits"
                    className="rounded-xl border border-amber-300/20 bg-black/15 p-2.5"
                  >
                    {directOpenTargetsError ? (
                      <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-2.5 text-xs text-amber-100">
                        <p className="font-bold text-white">Scope list could not load.</p>
                        <p className="mt-1 leading-5">{directOpenTargetsError}</p>
                        <button
                          type="button"
                          onClick={() => void loadDirectOpenTargets()}
                          className="mt-2 min-h-9 rounded-lg border border-amber-200/25 bg-amber-300 px-3 text-xs font-black text-slate-950"
                        >
                          Try again
                        </button>
                      </div>
                    ) : null}

                    {directOpenTargetsLoading ? (
                      <p className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs text-slate-300">
                        Loading circuits and schools…
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2" aria-label="Staff feedback audience">
                          <button
                            type="button"
                            aria-pressed={feedbackAudienceMode === "DISTRICT"}
                            disabled={feedbackPreviewLoading || feedbackOpening}
                            onClick={() => chooseFeedbackAudience("DISTRICT")}
                            className={cx(
                              "rounded-lg border p-2.5 text-left disabled:cursor-wait disabled:opacity-50",
                              feedbackAudienceMode === "DISTRICT"
                                ? "border-amber-200/50 bg-amber-300/15"
                                : "border-white/10 bg-black/20",
                            )}
                          >
                            <p className="text-sm font-black text-white">Entire district</p>
                            <p className="mt-0.5 text-[11px] text-slate-300">
                              {feedbackSchools.length} school(s)
                            </p>
                          </button>
                          <button
                            type="button"
                            aria-pressed={feedbackAudienceMode === "CIRCUIT"}
                            disabled={feedbackPreviewLoading || feedbackOpening}
                            onClick={() => chooseFeedbackAudience("CIRCUIT")}
                            className={cx(
                              "rounded-lg border p-2.5 text-left disabled:cursor-wait disabled:opacity-50",
                              feedbackAudienceMode === "CIRCUIT"
                                ? "border-amber-200/50 bg-amber-300/15"
                                : "border-white/10 bg-black/20",
                            )}
                          >
                            <p className="text-sm font-black text-white">Circuit(s)</p>
                            <p className="mt-0.5 text-[11px] text-slate-300">
                              Choose one or more
                            </p>
                          </button>
                        </div>

                        {feedbackAudienceMode === "DISTRICT" ? (
                          <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs leading-5 text-slate-300">
                            {districtNames.length === 1
                              ? districtNames[0]
                              : "Your authorized district"} · all discoverable schools.
                          </p>
                        ) : null}

                        {feedbackAudienceMode === "CIRCUIT" ? (
                          <div
                            data-feedback-circuit-selection="one-or-many"
                            className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-white">
                                Choose one or more circuits
                              </p>
                              <span className="text-[11px] font-bold text-amber-100">
                                {feedbackSelectedCircuitIds.length} selected
                              </span>
                            </div>
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {feedbackCircuits.map((circuit) => {
                                const selected = feedbackSelectedCircuitIds.includes(
                                  circuit.circuitId,
                                );
                                return (
                                  <label
                                    key={`feedback-circuit:${circuit.circuitId}`}
                                    className={cx(
                                      "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2",
                                      selected
                                        ? "border-amber-200/45 bg-amber-300/10"
                                        : "border-white/10 bg-white/[0.03]",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={feedbackPreviewLoading || feedbackOpening}
                                      onChange={() =>
                                        toggleFeedbackCircuit(circuit.circuitId)
                                      }
                                      className="h-4 w-4 shrink-0"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-black text-white">
                                        {circuit.circuitName}
                                      </span>
                                      <span className="block text-[11px] text-slate-400">
                                        {circuit.schoolCount} school(s)
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>

                            {feedbackSelectedCircuitIds.length === 1 &&
                            selectedSingleCircuit ? (
                              <div
                                data-single-circuit-school-mode="all-or-selected"
                                className="mt-2 rounded-lg border border-amber-200/20 bg-amber-300/[0.05] p-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-xs font-black text-white">
                                    {selectedSingleCircuit.circuitName}
                                  </p>
                                  <span className="shrink-0 text-[11px] text-slate-300">
                                    {singleCircuitSchools.length} school(s)
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    aria-pressed={feedbackSingleCircuitAllSchools}
                                    disabled={feedbackPreviewLoading || feedbackOpening}
                                    onClick={() => chooseSingleCircuitSchoolMode(true)}
                                    className={cx(
                                      "rounded-lg border px-2.5 py-2 text-xs font-black",
                                      feedbackSingleCircuitAllSchools
                                        ? "border-amber-200/45 bg-amber-300/15 text-white"
                                        : "border-white/10 bg-black/20 text-slate-300",
                                    )}
                                  >
                                    All schools
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={!feedbackSingleCircuitAllSchools}
                                    disabled={feedbackPreviewLoading || feedbackOpening}
                                    onClick={() => chooseSingleCircuitSchoolMode(false)}
                                    className={cx(
                                      "rounded-lg border px-2.5 py-2 text-xs font-black",
                                      !feedbackSingleCircuitAllSchools
                                        ? "border-amber-200/45 bg-amber-300/15 text-white"
                                        : "border-white/10 bg-black/20 text-slate-300",
                                    )}
                                  >
                                    Choose schools
                                  </button>
                                </div>

                                {!feedbackSingleCircuitAllSchools ? (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="min-w-0 flex-1">
                                        <span className="sr-only">Search schools in selected circuit</span>
                                        <input
                                          type="search"
                                          value={feedbackSchoolFilter}
                                          disabled={feedbackPreviewLoading || feedbackOpening}
                                          onChange={(event) =>
                                            setFeedbackSchoolFilter(event.target.value)
                                          }
                                          placeholder="Search school name"
                                          className="min-h-9 w-full rounded-lg border border-white/10 bg-[#0B101A] px-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-300/50"
                                        />
                                      </label>
                                      <span className="shrink-0 text-[11px] font-bold text-amber-100">
                                        {feedbackSelectedSchoolIds.length} selected
                                      </span>
                                    </div>
                                    <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto pr-1">
                                      {filteredSingleCircuitSchools.length === 0 ? (
                                        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-slate-300">
                                          No school matches this search.
                                        </p>
                                      ) : (
                                        filteredSingleCircuitSchools.map((school) => {
                                          const selected =
                                            feedbackSelectedSchoolIds.includes(
                                              school.schoolId,
                                            );
                                          return (
                                            <label
                                              key={`feedback-school:${school.schoolId}`}
                                              className={cx(
                                                "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2",
                                                selected
                                                  ? "border-amber-200/45 bg-amber-300/10"
                                                  : "border-white/10 bg-white/[0.03]",
                                              )}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={
                                                  feedbackPreviewLoading || feedbackOpening
                                                }
                                                onChange={() =>
                                                  toggleFeedbackSchool(school.schoolId)
                                                }
                                                className="h-4 w-4 shrink-0"
                                              />
                                              <span className="min-w-0">
                                                <span className="block truncate text-xs font-black text-white">
                                                  {school.schoolName}
                                                </span>
                                                <span className="block truncate text-[11px] text-slate-400">
                                                  {school.headteacherNames.join(", ")}
                                                </span>
                                              </span>
                                            </label>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-1.5 text-[11px] leading-4 text-slate-300">
                                    All schools in this circuit will be resolved by the server.
                                  </p>
                                )}
                              </div>
                            ) : null}

                            {feedbackSelectedCircuitIds.length > 1 ? (
                              <p
                                data-multi-circuit-school-selection="all-auto"
                                className="mt-2 rounded-lg border border-sky-300/20 bg-sky-400/[0.07] px-2.5 py-2 text-[11px] leading-4 text-sky-100"
                              >
                                All schools in the selected circuits are included automatically.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] leading-4 text-slate-400">
                            Selection is local. Preview makes one request.
                          </p>
                          <button
                            type="button"
                            disabled={
                              feedbackPreviewLoading ||
                              feedbackOpening ||
                              !feedbackScopeReady()
                            }
                            onClick={() => void previewHeadteacherStaffFeedback()}
                            className="min-h-9 shrink-0 rounded-lg border border-amber-200/25 bg-amber-300 px-3 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {feedbackPreviewLoading
                              ? "Preparing…"
                              : previewButtonLabel}
                          </button>
                        </div>
                      </>
                    )}

                    {feedbackPreview ? (
                      <section
                        data-headteacher-feedback-bulk-preview="compact-toggle"
                        className="mt-2 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.07] p-2"
                      >
                        <button
                          type="button"
                          data-feedback-preview-toggle="compact"
                          aria-expanded={feedbackPreviewExpanded}
                          onClick={() =>
                            setFeedbackPreviewExpanded((current) => !current)
                          }
                          className="w-full rounded-lg px-1 py-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-white">
                                Preview ready
                              </p>
                              <p className="mt-0.5 text-[11px] leading-4 text-slate-300">
                                {feedbackPreview.summary.schools} school(s) · {feedbackPreview.summary.eligibleRespondents} Teacher(s) · {feedbackPreview.summary.willOpen} new · {feedbackPreview.summary.keepExisting} kept · {feedbackPreview.summary.willSkip} skip
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-black text-emerald-100">
                              {feedbackPreviewExpanded ? "Hide ↑" : "Details ↓"}
                            </span>
                          </div>
                        </button>

                        {feedbackPreviewExpanded ? (
                          <div data-feedback-preview-details="collapsible" className="mt-1.5 space-y-1.5">
                            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                              {feedbackPreview.rows.map((row) => (
                                <article
                                  key={`${row.targetTenantId}:${row.targetHeadteacherUserId}`}
                                  className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-black text-white">
                                        {row.schoolName}
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                        {row.circuitName} · {row.eligibleRespondentCount} Teacher(s)
                                      </p>
                                    </div>
                                    <span
                                      className={cx(
                                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black",
                                        row.disposition === "OPEN_NEW"
                                          ? "border-emerald-200/30 bg-emerald-300/15 text-emerald-100"
                                          : row.disposition === "SKIP"
                                            ? "border-rose-200/30 bg-rose-300/10 text-rose-100"
                                            : "border-amber-200/30 bg-amber-300/10 text-amber-100",
                                      )}
                                    >
                                      {row.disposition === "OPEN_NEW"
                                        ? "Open"
                                        : row.disposition === "SKIP"
                                          ? "Skip"
                                          : "Keep"}
                                    </span>
                                  </div>
                                  {row.disposition !== "OPEN_NEW" ? (
                                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                      {row.reason.replaceAll("_", " ")}
                                    </p>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                            <p className="rounded-lg border border-sky-300/15 bg-sky-400/[0.06] px-2.5 py-2 text-[10px] leading-4 text-sky-100">
                              Frozen Teachers receive the 7-day exercise notice in-app; SMS/email follow existing contact and consent rules.
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-1.5 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={feedbackOpening}
                            onClick={() => {
                              setFeedbackPreview(null);
                              setFeedbackPreviewExpanded(false);
                            }}
                            className="min-h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white disabled:opacity-50"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            disabled={feedbackOpening}
                            onClick={() => void confirmHeadteacherStaffFeedback()}
                            className="min-h-9 rounded-lg border border-emerald-200/25 bg-emerald-300 px-3 text-xs font-black text-slate-950 disabled:cursor-wait disabled:opacity-50"
                          >
                            {feedbackOpening ? "Opening…" : "Confirm and notify"}
                          </button>
                        </div>
                      </section>
                    ) : null}

                    {feedbackBulkResult ? (
                      <section
                        data-headteacher-feedback-bulk-result="summary-only"
                        className="mt-2 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] px-2.5 py-2"
                      >
                        <p className="text-xs font-black text-white">
                          Staff feedback update
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-emerald-100">
                          {staffFeedbackResultMessage(feedbackBulkResult)}
                        </p>
                      </section>
                    ) : null}
                  </section>
                ) : null}

                {directorNewWorkPath === "GOVERNANCE" ? (
                  <section
                    data-director-governance-direct-start="independent-v1"
                    className="rounded-xl border border-fuchsia-300/20 bg-black/15 p-2.5"
                  >
                    <p className="text-xs leading-5 text-slate-300">
                      Staff feedback is not a prerequisite and its score is never combined with this 4-section / 34-indicator Governance assessment.
                    </p>

                    {directorContinuableItems.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        <p className="px-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-fuchsia-200">
                          Continue existing work
                        </p>
                        {directorContinuableItems.map((item) => (
                          <article
                            key={`director-existing-governance:${item.cycleId}:${item.supervisory.assessmentId}`}
                            className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-white">
                                  {item.targetName || "Headteacher"}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                  {item.schoolName} · {item.circuitName} · {item.supervisory.label}
                                </p>
                              </div>
                              {item.action.enabled && item.action.url ? (
                                <a
                                  href={item.action.url}
                                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-fuchsia-300 px-3 text-xs font-black text-slate-950 sm:w-auto"
                                >
                                  {item.supervisory.state === "RETURNED"
                                    ? "Open returned work"
                                    : "Continue"}
                                </a>
                              ) : (
                                <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-400">
                                  {item.action.label}
                                </span>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}

                    {directOpenTargetsError ? (
                      <div className="mt-2 rounded-lg border border-rose-300/20 bg-rose-400/[0.07] p-2.5 text-xs text-rose-100">
                        <p>Headteacher list could not load.</p>
                        <button
                          type="button"
                          onClick={() => void loadDirectOpenTargets()}
                          className="mt-2 min-h-9 rounded-lg bg-fuchsia-300 px-3 font-black text-slate-950"
                        >
                          Try again
                        </button>
                      </div>
                    ) : null}

                    {directOpenTargetsLoading ? (
                      <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs text-slate-300">
                        Loading Headteachers…
                      </p>
                    ) : (
                      <>
                        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
                          <label className="block text-xs font-black text-white" htmlFor="director-headteacher-search">
                            Search Headteacher or school
                            <input
                              id="director-headteacher-search"
                              type="search"
                              value={directorDirectSearch}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                setDirectorDirectSearch(event.target.value)
                              }
                              placeholder="Type a name or school"
                              className="mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-3 text-sm text-white outline-none focus:border-fuchsia-300/50"
                            />
                          </label>

                          {normalizedDirectSearch ? (
                            <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
                              {directorDirectSearchResults.length === 0 ? (
                                <p className="rounded-lg border border-white/10 px-2.5 py-2 text-[11px] text-slate-400">
                                  No matching Headteacher found in your district.
                                </p>
                              ) : (
                                directorDirectSearchResults.map((target) => {
                                  const targetKey = `${target.targetTenantId}:${target.targetHeadteacherUserId}`;
                                  return (
                                    <button
                                      key={`director-direct-search:${targetKey}`}
                                      type="button"
                                      onClick={() => {
                                        setDirectorDirectCircuitId(target.circuitId);
                                        setDirectorDirectSchoolId(target.targetTenantId);
                                        setDirectorDirectTargetKey(targetKey);
                                        setDirectorDirectSearch("");
                                        setError("");
                                      }}
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]"
                                    >
                                      <p className="truncate text-xs font-black text-white">
                                        {target.targetHeadteacherName || "Headteacher"}
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                        {target.schoolName} · {target.circuitName}
                                      </p>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="block text-xs font-black text-white" htmlFor="director-direct-circuit">
                            Circuit
                            <select
                              id="director-direct-circuit"
                              value={directorDirectCircuitId}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                                setDirectorDirectCircuitId(event.target.value);
                                setDirectorDirectSchoolId("");
                                setDirectorDirectTargetKey("");
                                setError("");
                              }}
                              className="mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-3 text-sm text-white"
                            >
                              <option value="">Choose circuit</option>
                              {directorDirectCircuits.map((circuit) => (
                                <option key={circuit.circuitId} value={circuit.circuitId}>
                                  {circuit.circuitName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-xs font-black text-white" htmlFor="director-direct-school">
                            School
                            <select
                              id="director-direct-school"
                              value={directorDirectSchoolId}
                              disabled={!directorDirectCircuitId}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                                const nextSchoolId = event.target.value;
                                setDirectorDirectSchoolId(nextSchoolId);
                                const schoolTargets = directorDirectTargets.filter(
                                  (target) =>
                                    target.circuitId === directorDirectCircuitId &&
                                    target.targetTenantId === nextSchoolId,
                                );
                                setDirectorDirectTargetKey(
                                  schoolTargets.length === 1
                                    ? `${schoolTargets[0].targetTenantId}:${schoolTargets[0].targetHeadteacherUserId}`
                                    : "",
                                );
                                setError("");
                              }}
                              className="mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-3 text-sm text-white disabled:opacity-50"
                            >
                              <option value="">Choose school</option>
                              {directorDirectSchools.map((school) => (
                                <option key={school.schoolId} value={school.schoolId}>
                                  {school.schoolName}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {directorDirectSchoolId && directorDirectSchoolTargets.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="px-0.5 text-[11px] font-black text-slate-300">
                              Headteacher
                            </p>
                            {directorDirectSchoolTargets.map((target) => {
                              const targetKey = `${target.targetTenantId}:${target.targetHeadteacherUserId}`;
                              const selected = directorDirectTargetKey === targetKey;
                              return (
                                <button
                                  key={`director-direct-target:${targetKey}`}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => {
                                    setDirectorDirectTargetKey(targetKey);
                                    setError("");
                                  }}
                                  className={cx(
                                    "w-full rounded-lg border px-2.5 py-2 text-left",
                                    selected
                                      ? "border-fuchsia-200/45 bg-fuchsia-300/15"
                                      : "border-white/10 bg-black/20",
                                  )}
                                >
                                  <p className="text-xs font-black text-white">
                                    {target.targetHeadteacherName || "Headteacher"}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {target.schoolName} · {target.circuitName}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        {directorDirectSelectedTarget ? (
                          <p
                            data-director-governance-server-recheck="selected-target"
                            className="mt-1.5 px-0.5 text-[10px] leading-4 text-slate-400"
                          >
                            EduLife OS will check your choice again before starting.
                          </p>
                        ) : null}

                        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
                          <p className="text-xs font-black text-white">Visit details</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Enter what you observed before the official form opens.
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <label className="text-[11px] font-bold text-slate-300">
                              Date
                              <input
                                type="date"
                                value={dateObserved}
                                max={today()}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                  setDateObserved(event.target.value);
                                  setError("");
                                }}
                                className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                              />
                            </label>
                            <label className="text-[11px] font-bold text-slate-300">
                              Arrival time
                              <input
                                type="time"
                                value={visitDetails.arrivalTime}
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  updateVisitDetail("arrivalTime", event.target.value)
                                }
                                className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                              />
                            </label>
                            {[
                              ["staffStrength", "Staff strength"],
                              ["teachersPresentAtVisit", "Teachers present"],
                              ["totalEnrolment", "Total enrolment"],
                              ["girls", "Girls"],
                              ["boys", "Boys"],
                            ].map(([field, label]) => (
                              <label key={field} className="text-[11px] font-bold text-slate-300">
                                {label}
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  value={visitDetails[field as keyof Omit<VisitDetailsDraft, "arrivalTime">]}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    updateVisitDetail(
                                      field as keyof VisitDetailsDraft,
                                      event.target.value,
                                    )
                                  }
                                  className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-[#0B1220] px-2 text-sm text-white"
                                />
                              </label>
                            ))}
                          </div>
                          <p
                            className={cx(
                              "mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-4",
                              directorDirectVisitValidation.ok
                                ? "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100"
                                : "border-amber-300/20 bg-amber-400/[0.06] text-amber-100",
                            )}
                          >
                            {directorDirectVisitValidation.ok
                              ? "Visit details are ready."
                              : directorDirectVisitValidation.message}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={
                            directorDirectStarting ||
                            !directorDirectSelectedTarget ||
                            !directorDirectVisitValidation.ok
                          }
                          onClick={() => void startDirectorDirectAssessment()}
                          className="mt-2 min-h-11 w-full rounded-lg border border-fuchsia-200/30 bg-fuchsia-300 px-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {directorDirectStarting
                            ? "Starting assessment…"
                            : "Start official assessment"}
                        </button>
                        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                          No Teachers are invited here. No 7-day feedback window is opened. The official 4/34 form starts directly.
                        </p>
                      </>
                    )}
                  </section>
                ) : null}
              </section>
            ) : null}

            <p className="text-xs leading-5 text-slate-400">
              Explicit actions only · no background polling · no persistent browser storage · scope changes stay local until Preview.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(28,19,48,0.94),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
            <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                  EduLife OS · {queue?.officeLabel || "Governance assessor"}
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
                  Headteacher Appraisal
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                  Select an authorized circuit and school. EduLife OS resolves the approved Headteacher appraisal record and opens the official Monitoring and Inspection Sheet.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={dashboardHref(actorRole)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]"
                >
                  ← Dashboard
                </Link>
                <button
                  type="button"
                  disabled={queueLoading}
                  onClick={() => void loadQueue()}
                  className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 py-3 text-sm font-semibold text-fuchsia-50 hover:bg-fuchsia-400/20 disabled:opacity-50"
                >
                  {queueLoading ? "Refreshing…" : "Refresh work list"}
                </button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          <section className="grid grid-cols-4 gap-1.5 md:gap-4">
            {[
              ["Circuits", selectableCircuits.length],
              ["Schools", availableSchoolCount],
              ["Drafts", (queue?.summary.inProgress ?? 0) + (queue?.summary.returned ?? 0)],
              ["Submitted", queue?.summary.submitted ?? 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[20px] border border-white/10 bg-white/[0.04] p-2.5 text-center md:rounded-[28px] md:p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">
                  {label}
                </p>
                <p className="mt-1 text-lg font-bold text-white md:text-2xl">{value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[360px_1fr] xl:gap-6">
            <aside className="space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  1. Choose circuit
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Authorized jurisdiction
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {queue?.selection.mode === "ASSIGNED_CIRCUIT_SCHOOLS"
                    ? "Your SISSO circuit is fixed by your active assignment."
                    : "Choose the circuit whose Headteacher appraisal you will complete."}
                </p>

                {queueLoading && !queue ? (
                  <p className="mt-4 text-sm text-slate-300">Loading authorized work…</p>
                ) : null}

                <div className="mt-4 space-y-2">
                  {selectableCircuits.map((circuit) => {
                    const selected = circuit.circuitId === selectedCircuitId;
                    const fixed = queue?.selection.assignedCircuitId === circuit.circuitId;
                    return (
                      <button
                        key={circuit.circuitId}
                        type="button"
                        onClick={() => {
                          setSelectedCircuitId(circuit.circuitId);
                          setSelectedSchoolId("");
                        }}
                        className={cx(
                          "w-full rounded-2xl border p-3 text-left transition",
                          selected
                            ? "border-fuchsia-300/40 bg-fuchsia-400/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{circuit.circuitName}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {circuit.schoolCount} school{circuit.schoolCount === 1 ? "" : "s"} · {circuit.appraisalCount} appraisal{circuit.appraisalCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          {fixed ? (
                            <span className="rounded-full border border-[#E8C96A]/25 bg-[#E8C96A]/10 px-2 py-1 text-[10px] font-bold text-[#F5D979]">
                              Assigned
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  2. Choose school
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Headteacher to appraise
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {queue?.actorRole === "DISTRICT_DIRECTOR"
                    ? "Select an authorized school. If no appraisal cycle exists yet, you can open the standard confidential cycle here."
                    : "Selecting a school automatically selects the Headteacher in the approved appraisal cycle."}
                </p>

                {!selectedCircuitId ? (
                  <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    Choose a circuit first.
                  </p>
                ) : queueSchools.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    No eligible Headteacher appraisal is currently available in this circuit.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {queueSchools.map((school) => {
                      const selected = school.schoolId === selectedSchoolId;
                      return (
                        <button
                          key={school.schoolId}
                          type="button"
                          onClick={() => setSelectedSchoolId(school.schoolId)}
                          className={cx(
                            "w-full rounded-2xl border p-3 text-left transition",
                            selected
                              ? "border-emerald-300/40 bg-emerald-400/10"
                              : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                          )}
                        >
                          <p className="font-semibold text-white">{school.schoolName}</p>
                          <p className="mt-1 text-xs text-slate-300">{school.headteacherName}</p>
                          {school.canDirectOpen ? (
                            <p className="mt-1 text-[11px] font-semibold text-amber-200">
                              Ready to open appraisal cycle
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Saved records</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {savedItems.length} saved assessment{savedItems.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSavedRecords((value) => !value)}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-white hover:bg-white/[0.1] xl:hidden"
                  >
                    {showSavedRecords ? "Hide" : "Show"}
                  </button>
                </div>
                <div className={cx("mt-3 space-y-2 xl:block", showSavedRecords ? "block" : "hidden")}>
                  {savedItems.length === 0 ? (
                    <p className="text-sm text-slate-300">No saved supervisory assessment yet.</p>
                  ) : null}
                  {savedItems.slice(0, 12).map((item) => (
                    <a
                      key={`${item.cycleId}:${item.supervisory.assessmentId}`}
                      href={item.action.url || "#"}
                      className="block rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/[0.08]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-white">{item.schoolName}</p>
                        <span className={cx("rounded-full border px-2 py-1 text-[10px] font-bold", queueStateTone(item.supervisory.state))}>
                          {item.supervisory.state.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{item.targetName || "Headteacher"}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.supervisory.label}</p>
                    </a>
                  ))}
                </div>
              </div>
            </aside>

            <main className="space-y-4">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                      3. Open appraisal
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                      {selectedQueueItem?.schoolName ||
                        selectedDirectOpenTarget?.schoolName ||
                        selectedCircuit?.circuitName ||
                        "Choose a school"}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {selectedQueueItem
                        ? `${selectedQueueItem.targetName || "Headteacher"} · ${selectedQueueItem.circuitName}`
                        : selectedDirectOpenTarget
                          ? `${selectedDirectOpenTarget.targetHeadteacherName || "Headteacher"} · ${selectedDirectOpenTarget.circuitName}`
                          : "The approved Headteacher and official form will appear here."}
                    </p>
                  </div>
                  {selectedQueueItem ? (
                    <span className={cx("w-fit rounded-full border px-3 py-1 text-xs font-bold", queueStateTone(selectedQueueItem.supervisory.state))}>
                      {selectedQueueItem.supervisory.state.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>
              </section>

              {selectedQueueItems.length === 0 && !selectedDirectOpenTarget ? (
                <section className="rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                  <h3 className="text-lg font-semibold text-white">No school selected</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Choose a circuit and school to open the Headteacher appraisal record.
                  </p>
                </section>
              ) : null}

              {selectedQueueItems.length === 0 && selectedDirectOpenTarget ? (
                <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/[0.08] p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        School and Headteacher
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {selectedDirectOpenTarget.schoolName}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {selectedDirectOpenTarget.targetHeadteacherName || "Headteacher"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedDirectOpenTarget.circuitName} · {selectedDirectOpenTarget.districtName}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        First-cycle setup
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        Confidential staff-feedback cycle not yet open
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        Opening the cycle freezes the currently eligible Teachers as confidential respondents, starts the 7-day feedback window, and queues their notifications.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={openingCycle}
                    onClick={() => void directOpenSelectedHeadteacher()}
                    className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300 px-5 text-center text-base font-bold text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {openingCycle ? "Opening appraisal cycle…" : "Open Headteacher appraisal cycle"}
                  </button>

                  <p className="mt-3 text-center text-xs leading-5 text-slate-400">
                    Explicit confirmation is required. EduLife OS selects eligible respondents server-side; this screen cannot choose them.
                  </p>
                </section>
              ) : null}

              {selectedQueueItems.map((item) => (
                <article
                  key={item.cycleId}
                  className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">School and Headteacher</p>
                      <p className="mt-2 font-semibold text-white">{item.schoolName}</p>
                      <p className="mt-1 text-sm text-slate-300">{item.targetName || "Headteacher"}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.circuitName} · {item.districtName}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Evidence readiness</p>
                      <p className="mt-2 font-semibold text-white">{item.staffFeedbackLabel}</p>
                      <p className="mt-1 text-sm text-slate-300">{item.supervisory.label}</p>
                    </div>
                  </div>

                  {item.supervisory.state === "IN_PROGRESS" || item.supervisory.state === "RETURNED" ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                        <span>Saved progress</span>
                        <span>{item.supervisory.completionPercentage}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#E879F9,#34D399)] transition-all duration-300"
                          style={{ width: `${item.supervisory.completionPercentage}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {item.supervisory.overallPercentage != null ? (
                    <p className="mt-4 text-sm font-semibold text-emerald-100">
                      Submitted result: {formatPercent(item.supervisory.overallPercentage)}
                    </p>
                  ) : null}

                  {item.action.enabled && item.action.url ? (
                    <a
                      href={item.action.url}
                      className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-5 text-center text-base font-bold text-fuchsia-50 hover:bg-fuchsia-400/20"
                    >
                      {item.action.label}
                    </a>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-center font-semibold text-slate-400">
                      {item.action.label}
                    </div>
                  )}
                </article>
              ))}
            </main>
          </section>

          <p className="text-xs leading-5 text-slate-400">
            Work records refresh only when requested. No background polling or respondent identity data is used.
          </p>
        </div>
      </div>
    );
  }

  if (!assessmentId) {
    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(28,19,48,0.94),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
            <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Governance assessor</p>
                <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Start Headteacher Appraisal</h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                  Confirm the visit before opening the official Monitoring and Inspection Sheet.
                </p>
              </div>
              <Link
                href="/governance/appraisals/headteacher-supervisory"
                className="w-fit rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]"
              >
                ← Work list
              </Link>
            </div>
          </section>

          {error ? (
            <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
          ) : null}

          <section className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">1. School and Headteacher</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Approved appraisal target</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                These identities come from the authorized appraisal cycle and cannot be changed on this form.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["School", cycleQueueItem?.schoolName || "Approved school"],
                  ["Circuit", cycleQueueItem?.circuitName || "Authorized circuit"],
                  ["District", cycleQueueItem?.districtName || "Authorized district"],
                  ["Headteacher", cycleQueueItem?.targetName || "Approved Headteacher"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="mt-2 font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">2. Official visit details</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Record what was observed</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Enter the figures exactly as observed. They will be validated, hashed and locked when the draft is created.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm font-semibold text-slate-200" htmlFor="dateObserved">
                  Date of visit
                  <input
                    id="dateObserved"
                    type="date"
                    value={dateObserved}
                    max={today()}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setDateObserved(event.target.value);
                      setError("");
                    }}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200" htmlFor="arrivalTime">
                  Arrival time
                  <input
                    id="arrivalTime"
                    type="time"
                    value={visitDetails.arrivalTime}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("arrivalTime", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200" htmlFor="staffStrength">
                  Staff strength
                  <input
                    id="staffStrength"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visitDetails.staffStrength}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("staffStrength", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200" htmlFor="totalEnrolment">
                  Total enrolment
                  <input
                    id="totalEnrolment"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visitDetails.totalEnrolment}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("totalEnrolment", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200" htmlFor="girls">
                  Girls
                  <input
                    id="girls"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visitDetails.girls}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("girls", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200" htmlFor="boys">
                  Boys
                  <input
                    id="boys"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visitDetails.boys}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("boys", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-200 sm:col-span-2 lg:col-span-1" htmlFor="teachersPresentAtVisit">
                  Teachers present at visit
                  <input
                    id="teachersPresentAtVisit"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visitDetails.teachersPresentAtVisit}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateVisitDetail("teachersPresentAtVisit", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-fuchsia-300/50"
                  />
                </label>
              </div>

              <div className={cx(
                "mt-5 rounded-2xl border p-4 text-sm",
                visitDetailsValidation.ok
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  : "border-amber-300/25 bg-amber-400/10 text-amber-100",
              )} role="status" aria-live="polite">
                {visitDetailsValidation.ok
                  ? `Visit details are valid. Girls and boys total ${visitDetailsValidation.values.totalEnrolment}; ${visitDetailsValidation.values.teachersPresentAtVisit} of ${visitDetailsValidation.values.staffStrength} teachers were present.`
                  : visitDetailsValidation.message}
              </div>

              <button
                type="button"
                disabled={busy || !visitDetailsValidation.ok}
                onClick={() => void createDraft()}
                className="mt-5 min-h-14 w-full rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-5 text-base font-bold text-fuchsia-50 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Creating secure draft…" : "Create draft and open official form"}
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                Visit details cannot be edited after draft creation. Check every figure before continuing.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!workspace || !currentSection) {
    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h1 className="text-2xl font-semibold text-white">Headteacher supervisory assessment</h1>
            <p className="mt-4 text-slate-300">{busy ? "Loading assessment…" : error || "Assessment unavailable."}</p>
            <button
              type="button"
              onClick={() => void loadWorkspace(assessmentId)}
              className="mt-6 min-h-12 rounded-2xl border border-white/10 bg-white/[0.06] px-5 font-semibold text-white"
            >
              Try again
            </button>
          </section>
        </div>
      </div>
    );
  }

  const renderedWorkspace = workspace;
  const editable = renderedWorkspace.assessment.canEdit === true;
  const submittedNativeView =
    renderedWorkspace.assessment.status === "FINALIZED" && reviewMode;
  const safeSectionIndex = Math.min(
    sectionIndex,
    renderedWorkspace.sections.length - 1,
  );
  const mobileSection = renderedWorkspace.sections[safeSectionIndex];

  function scrollToRenderedSection(section: WorkspaceSection) {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const targetId = `supervisory-section-${
      desktop ? "desktop" : "mobile"
    }-${section.sectionKey}`;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  function goToSection(nextIndex: number) {
    if (!workspace) return;

    const bounded = Math.max(
      0,
      Math.min(workspace.sections.length - 1, nextIndex),
    );
    const nextSection = workspace.sections[bounded];
    if (!nextSection) return;

    if (currentSection) {
      queueSectionAutosave(currentSection.sectionKey, answersRef.current, 0);
    }

    setReviewMode(false);
    setSectionIndex(bounded);
    setItemIndex(0);
    scrollToRenderedSection(nextSection);
  }

  function returnToAssessment() {
    setReviewMode(false);
    setNotice("You can continue checking or changing the assessment.");

    const section =
      renderedWorkspace.sections[safeSectionIndex] ??
      renderedWorkspace.sections[0];
    if (section) scrollToRenderedSection(section);
  }

  function renderSection(section: WorkspaceSection, mobileOnly = false) {
    const answered = sectionAnsweredCount(section);
    const completion = Math.round((answered / section.items.length) * 100);
    const liveScore = liveSectionScores.get(section.sectionKey) ?? {
      sectionKey: section.sectionKey,
      rawScore: 0,
      applicableMaximum: section.maxScore,
      answeredItems: answered,
      notApplicableItems: 0,
      complete: answered === section.items.length,
      percentage: 0,
    };

    return (
      <section
        id={`supervisory-section-${
          mobileOnly ? "mobile" : "desktop"
        }-${section.sectionKey}`}
        key={`${mobileOnly ? "mobile" : "desktop"}:${section.sectionKey}`}
        className={cx(
          "scroll-mt-28 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:scroll-mt-32 md:p-5",
          mobileOnly ? "md:hidden" : "hidden md:block",
        )}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#E8C96A]">
            Section {section.order} · {section.maxScore} marks
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{section.title}</h3>
          {section.description ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">{section.description}</p>
          ) : null}
        </div>

        <div className="mt-4 space-y-3">
          {section.items.map((item) => {
            const answer = answers[answerKey(section.sectionKey, item.itemKey)];
            return (
              <article key={item.itemKey} className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 lg:max-w-[65%]">
                    <p className="text-xs font-bold text-[#E8C96A]">{item.itemKey}</p>
                    <p className="mt-1 text-base font-semibold leading-7 text-slate-100">{item.label}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((score) => {
                      const selected = answer?.notApplicable !== true && answer?.score === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          disabled={!editable || busy}
                          aria-pressed={selected}
                          onClick={() => chooseItemScore(section.sectionKey, item.itemKey, score, false)}
                          className={cx(
                            "h-11 w-11 rounded-2xl border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                            selected
                              ? editableScoreTone(score)
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]",
                          )}
                        >
                          {score}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={!editable || busy}
                      aria-pressed={answer?.notApplicable === true}
                      onClick={() => chooseItemScore(section.sectionKey, item.itemKey, null, true)}
                      className={cx(
                        "h-11 rounded-2xl border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                        answer?.notApplicable === true
                          ? "border-slate-300/45 bg-slate-400/20 text-slate-100"
                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]",
                      )}
                    >
                      N/A
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2 rounded-2xl border border-[#E8C96A]/20 bg-[#E8C96A]/[0.06] p-3 sm:grid-cols-3 md:p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Total score
            </p>
            <p className="mt-1 text-lg font-bold text-white">
              {liveScore.rawScore} / {liveScore.applicableMaximum}
            </p>
            {liveScore.notApplicableItems > 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                {liveScore.notApplicableItems} N/A excluded from the maximum
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Section percentage
            </p>
            <p className="mt-1 text-lg font-bold text-white">
              {formatScorePercent(liveScore.percentage)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {liveScore.complete ? "Official section result" : "Live provisional result"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Answered
            </p>
            <p className="mt-1 text-lg font-bold text-white">
              {answered} / {section.items.length}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">{completion}% complete</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(28,19,48,0.94),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">Monitoring and Inspection Sheet · Headteachers</p>
              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{workspace.visit.targetName || "Headteacher"}</h1>
              <p className="mt-1 text-sm text-slate-300">{workspace.visit.schoolName} · {workspace.visit.circuitName}</p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                {workspace.assessment.status === "FINALIZED"
                  ? "This submitted assessment is locked. The native white read-only form is shown below."
                  : workspace.lifecycle.canCreateRevision
                    ? "This returned version is locked to preserve history. Start correction below to create an editable revision."
                    : "Complete the official 4-section, 34-indicator form. Answers autosave securely as you score."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/governance/appraisals/headteacher-supervisory" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]">← Work list</Link>
              <span className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white">{workspace.lifecycle.label}</span>
            </div>
          </div>
        </section>

        {error ? <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {notice ? <div className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div> : null}
        {workspace.lifecycle.returnReason ? (
          <div className="rounded-3xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p className="font-bold text-white">Reason returned</p>
            <p className="mt-1 leading-6">{workspace.lifecycle.returnReason}</p>
            {workspace.lifecycle.canCreateRevision ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createRevision()}
                className="mt-4 min-h-12 w-full rounded-xl bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Opening correction…" : "Start correction"}
              </button>
            ) : null}
          </div>
        ) : null}

        <section className="grid grid-cols-4 gap-1.5 md:gap-4">
          {[
            ["Sections", workspace.sections.length],
            ["Answered", `${localAnsweredItems}/${workspace.assessment.progress.totalItems}`],
            ["Live score", formatScorePercent(liveScoreSummary.overallPercentage)],
            ["Revision", workspace.assessment.revision],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-2.5 text-center md:rounded-[28px] md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">{label}</p>
              <p className="mt-1 text-base font-bold text-white md:text-2xl">{value}</p>
            </div>
          ))}
        </section>

        <section className="sticky top-2 z-20 md:hidden">
          <div className="rounded-[24px] border border-fuchsia-300/20 bg-[#100A19]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E8C96A]">Section {safeSectionIndex + 1} of {workspace.sections.length}</p>
                <h2 className="mt-1 truncate text-base font-semibold text-white">{mobileSection.title}</h2>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Live score</p>
                <p className="text-sm font-bold text-white">{formatScorePercent(liveScoreSummary.overallPercentage)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#E879F9,#34D399)] transition-all duration-300" style={{ width: `${localCompletionPercentage}%` }} />
              </div>
              <span className="shrink-0 text-[11px] font-bold text-slate-300">{localAnsweredItems}/{workspace.assessment.progress.totalItems}</span>
            </div>
          </div>
        </section>

        {!submittedNativeView ? (
          <section className="grid gap-4 xl:grid-cols-[360px_1fr] xl:gap-6">
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">1. School and Headteacher</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Visit record</h2>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["School", workspace.visit.schoolName],
                  ["Circuit", workspace.visit.circuitName],
                  ["District", workspace.visit.districtName],
                  ["Headteacher", workspace.visit.targetName || "Headteacher"],
                  ["Date of visit", workspace.visit.dateObserved],
                  ["Arrival time", workspace.visit.arrivalTime],
                  ["Staff strength", workspace.visit.staffStrength],
                  ["Total enrolment", workspace.visit.totalEnrolment],
                  ["Girls", workspace.visit.girls],
                  ["Boys", workspace.visit.boys],
                  ["Teachers present", workspace.visit.teachersPresentAtVisit],
                  ["Assessor office", workspace.visit.assessorRole.replaceAll("_", " ")],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="mt-1 font-semibold text-white">
                      {value == null ? "Not captured in this historical record" : String(value)}
                    </p>
                  </div>
                ))}
                {!workspace.visit.officialDetailsAvailable ? (
                  <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                    This is a version-1 historical draft. The expanded official visit details were not captured when it was created and have not been invented.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100">
                    Official visit details are frozen in this assessment evidence snapshot.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">2. Sections</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Inspection areas</h2>
              <div className="mt-4 space-y-2">
                {workspace.sections.map((section, index) => {
                  const answered = sectionAnsweredCount(section);
                  const selected = index === safeSectionIndex;
                  return (
                    <button
                      key={section.sectionKey}
                      type="button"
                      onClick={() => goToSection(index)}
                      className={cx(
                        "w-full rounded-2xl border p-3 text-left transition",
                        selected
                          ? "border-fuchsia-300/40 bg-fuchsia-400/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-[#E8C96A]">Section {section.order}</p>
                          <p className="mt-1 text-sm font-semibold leading-5 text-white">{section.title}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-bold text-white">{answered}/{section.items.length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            <section className="sticky top-2 z-20 hidden rounded-[28px] border border-white/10 bg-[#0D1118]/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur md:block md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">3. Score the inspection</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Official 1–5 rating scale</h2>
                  <p className="mt-1 text-sm text-slate-300">1 Very Poor · 2 Poor · 3 Acceptable · 4 Good · 5 Very Good · N/A Not applicable</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Live overall</p>
                    <p className="mt-1 text-base font-bold text-white">{formatScorePercent(liveScoreSummary.overallPercentage)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Raw total</p>
                    <p className="mt-1 text-base font-bold text-white">{liveScoreSummary.rawScore}/{liveScoreSummary.applicableMaximum}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Answered</p>
                    <p className="mt-1 text-base font-bold text-white">{localAnsweredItems}/{workspace.assessment.progress.totalItems}</p>
                  </div>
                </div>
              </div>
              <div
                className="mt-4 flex items-center gap-3"
                aria-label="Overall completion"
              >
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#E879F9,#34D399)] transition-all duration-300"
                    style={{ width: `${localCompletionPercentage}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-bold text-white">
                  {localAnsweredItems}/{workspace.assessment.progress.totalItems}
                  {" · "}
                  {localCompletionPercentage}%
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                Live score is provisional until all four sections are complete. Final overall score is the average of the four official section percentages.
              </p>
            </section>

            {workspace.sections.map((section) => renderSection(section, false))}
            {renderSection(mobileSection, true)}

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">4. Review and submit</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Secure finalization</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {workspace.visit.assessorRole === "DISTRICT_DIRECTOR"
                      ? "Submitting locks this Governance assessment. Release the locked result to the Headteacher from the work list."
                      : "Submitted scores are locked and sent to the Director’s review queue. The Director cannot rewrite them."}
                  </p>
                </div>
                <div className={cx(
                  "rounded-full border px-3 py-1 text-xs font-bold",
                  autosaveState === "waiting"
                    ? "border-amber-300/25 bg-amber-400/15 text-amber-100"
                    : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
                )} role="status" aria-live="polite">
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

              {editable &&
              localAnsweredItems === workspace.assessment.progress.totalItems &&
              !reviewMode ? (
                <button
                  type="button"
                  disabled={busy || autosaveState === "saving"}
                  onClick={() => void reviewCompletedAssessment()}
                  className="mt-5 min-h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-base font-bold text-white hover:bg-white/[0.1] disabled:opacity-50"
                >
                  Review Before you Submit
                </button>
              ) : null}

              {workspace.assessment.canFinalize && reviewMode ? (
                <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                  The complete native form is open below. Check every selected score,
                  section total and visit detail before locking the assessment.
                </p>
              ) : null}

              {!workspace.assessment.canFinalize && editable ? (
                <p className="mt-4 text-xs leading-5 text-slate-400">Answer every indicator or mark it N/A. Then review the completed assessment before final submission.</p>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-slate-400">Answers autosave securely. Offline changes retry while this page remains open.</p>
            </section>
          </main>
        </section>
        ) : null}

        {!submittedNativeView ? (
          <section className="md:hidden">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={safeSectionIndex === 0}
              onClick={() => goToSection(safeSectionIndex - 1)}
              className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              Previous section
            </button>
            <button
              type="button"
              disabled={safeSectionIndex === workspace.sections.length - 1}
              onClick={() => goToSection(safeSectionIndex + 1)}
              className="min-h-12 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 py-3 text-sm font-bold text-fuchsia-50 disabled:opacity-40"
            >
              Next section
            </button>
          </div>
        </section>
        ) : null}

        {reviewMode ? (
          <section
            ref={nativeReviewRef}
            className="scroll-mt-24 rounded-[30px] border border-white/10 bg-white/[0.03] p-3 md:scroll-mt-28 md:p-5"
          >
            <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  {submittedNativeView
                    ? "Submitted assessment · read-only"
                    : "Final review · read-only preview"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {submittedNativeView
                    ? "Submitted Headteacher assessment"
                    : "Review Before you Submit"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-emerald-50/90">
                  {submittedNativeView
                    ? "This locked assessment is shown directly in the native Monitoring and Inspection Sheet."
                    : "This is the complete native Monitoring and Inspection Sheet. Scroll sideways on a small screen to inspect every score column."}
                </p>
              </div>
              {submittedNativeView ? (
                <Link
                  href="/governance/appraisals/headteacher-supervisory"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-black/20 px-5 text-sm font-bold text-white hover:bg-black/30"
                >
                  ← Work list
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={returnToAssessment}
                  className="min-h-12 rounded-2xl border border-white/15 bg-black/20 px-5 text-sm font-bold text-white hover:bg-black/30"
                >
                  Return to assessment
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-[24px] border border-slate-300 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
              <div className="min-w-[1120px] bg-white text-slate-950">
                <header className="border-b-2 border-slate-900 px-8 py-7 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.18em]">
                    {workspace.visit.districtName}
                  </p>
                  <h3 className="mt-2 text-xl font-black uppercase">
                    Monitoring and Inspection Sheet (Headteachers)
                  </h3>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
                    Supervisory assessment · native final review copy
                  </p>
                </header>

                <div className="grid grid-cols-[180px_1fr_220px_1fr] border-b border-slate-300 text-sm">
                  {[
                    ["Name of school", workspace.visit.schoolName],
                    [
                      "Staff strength",
                      workspace.visit.staffStrength == null
                        ? "Not captured in this historical record"
                        : String(workspace.visit.staffStrength),
                    ],
                    ["Name of circuit", workspace.visit.circuitName],
                    [
                      "Total enrolment",
                      workspace.visit.totalEnrolment == null
                        ? "Not captured in this historical record"
                        : String(workspace.visit.totalEnrolment),
                    ],
                    ["Name of Head", workspace.visit.targetName || "Headteacher"],
                    [
                      "Girls",
                      workspace.visit.girls == null
                        ? "Not captured in this historical record"
                        : String(workspace.visit.girls),
                    ],
                    ["Date of visit", workspace.visit.dateObserved],
                    [
                      "Boys",
                      workspace.visit.boys == null
                        ? "Not captured in this historical record"
                        : String(workspace.visit.boys),
                    ],
                    [
                      "Arrival time",
                      workspace.visit.arrivalTime ??
                        "Not captured in this historical record",
                    ],
                    [
                      "Teachers present at the time of visit",
                      workspace.visit.teachersPresentAtVisit == null
                        ? "Not captured in this historical record"
                        : String(workspace.visit.teachersPresentAtVisit),
                    ],
                  ].map(([label, value], index) => (
                    <div
                      key={`${String(label)}:${index}`}
                      className={cx(
                        "contents",
                        index % 2 === 0 ? "" : "",
                      )}
                    >
                      <div className="border-b border-r border-slate-300 bg-slate-100 px-4 py-3 text-xs font-black uppercase">
                        {label}
                      </div>
                      <div className="border-b border-r border-slate-300 px-4 py-3 font-semibold">
                        {value}
                      </div>
                    </div>
                  ))}
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

                {workspace.sections.map((section) => {
                  const sectionScore = liveSectionScores.get(section.sectionKey);
                  return (
                    <div key={`native:${section.sectionKey}`}>
                      <div className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] bg-[#304C6E] text-sm font-black text-white">
                        <div className="border-r border-white/20 px-3 py-3 text-center">
                          {section.order}.0
                        </div>
                        <div className="col-span-8 px-4 py-3 uppercase">
                          {section.title}
                        </div>
                      </div>

                      {section.items.map((item) => {
                        const answer =
                          answers[
                            answerKey(section.sectionKey, item.itemKey)
                          ];
                        return (
                          <div
                            key={`native:${section.sectionKey}:${item.itemKey}`}
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
                                  ? answer?.notApplicable === true
                                  : answer?.notApplicable !== true &&
                                    answer?.score === score;
                              return (
                                <div
                                  key={`${item.itemKey}:${score ?? "NA"}`}
                                  className={cx(
                                    "border-r border-slate-300 px-2 py-3 text-center text-xl font-black",
                                    selected
                                      ? nativeScoreTone(
                                          answer?.score,
                                          answer?.notApplicable === true,
                                        )
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
                                nativeScoreTone(
                                  answer?.score,
                                  answer?.notApplicable === true,
                                ),
                              )}
                            >
                              {answer?.notApplicable
                                ? "N/A"
                                : answer?.score ?? "—"}
                            </div>
                          </div>
                        );
                      })}

                      <div className="grid grid-cols-[1fr_260px] border-b-2 border-slate-900 bg-slate-50 text-sm">
                        <div className="px-4 py-3 text-right font-black uppercase">
                          Section {section.order} total
                        </div>
                        <div className="grid grid-cols-2">
                          <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                            {sectionScore?.rawScore ?? 0}/
                            {sectionScore?.applicableMaximum ?? section.maxScore}
                          </div>
                          <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                            {formatScorePercent(sectionScore?.percentage)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <footer className="grid grid-cols-[1fr_320px] border-t-2 border-slate-900 bg-indigo-50">
                  <div className="px-6 py-5 text-right text-base font-black uppercase">
                    Overall supervisory result
                  </div>
                  <div className="border-l-2 border-slate-900 px-6 py-5 text-center text-2xl font-black text-indigo-900">
                    {formatScorePercent(liveScoreSummary.overallPercentage)}
                  </div>
                </footer>
              </div>
            </div>

            {!submittedNativeView ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={returnToAssessment}
                  className="min-h-14 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-base font-bold text-white hover:bg-white/[0.1]"
                >
                  Return to assessment
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    workspace.assessment.canFinalize !== true ||
                    pendingSectionSavesRef.current.size > 0
                  }
                  onClick={() => void finalizeAssessment()}
                  className="min-h-14 rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 text-base font-bold text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Submit and lock assessment
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
