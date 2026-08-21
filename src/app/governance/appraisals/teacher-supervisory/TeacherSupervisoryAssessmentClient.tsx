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
    targetUserId: string;
    targetTenantId: string;
    dateObserved: string;
    generalComment: string | null;
    canEdit: boolean;
    canFinalize: boolean;
    commentsAllowed: true;
    progress: {
      totalSections: number;
      completedSections: number;
      totalItems: number;
      answeredItems: number;
      notApplicableItems: number;
      completionPercentage: number;
      missingItemKeys: string[];
    };
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
    returnedAssessmentRequiresRevision: true;
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
    teacherAssignmentVerified: boolean;
    curriculumSelectionVerified: boolean;
  };
  generalComment: string | null;
  sections: WorkspaceSection[];
};

type TeacherQueueCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  teacherCount: number;
};

type TeacherQueueItem = {
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  eligible: true;
};

type TeacherQueue = {
  actorRole: string;
  officeLabel: string;
  selection: {
    mode: "ASSIGNED_CIRCUIT_TEACHERS" | "DISTRICT_CIRCUIT_SCHOOL_TEACHERS";
    requiresCircuitSelection: boolean;
    requiresSchoolSelection: true;
    assignedCircuitId: string | null;
    assignedCircuitName: string | null;
  };
  summary: {
    circuits: number;
    schools: number;
    teachers: number;
  };
  circuits: TeacherQueueCircuit[];
  items: TeacherQueueItem[];
  readOnlyDiscovery: true;
  legacyTeacherAppraisalIncluded: false;
  assessmentEvidenceIncluded: false;
  contactDetailsIncluded: false;
  noBackgroundPolling: true;
};

type TeacherAssessmentRecord = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  status: "DRAFT" | "FINALIZED" | "RETURNED";
  state: "NEEDS_CORRECTION" | "IN_PROGRESS" | "SUBMITTED";
  label: string;
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  dateObserved: string;
  answeredItems: number;
  totalItems: number;
  completionPercentage: number;
  overallPercentage: number | null;
  finalizedAt: string | null;
  correction: {
    reason: string;
    revisionRequired: true;
  } | null;
  workspaceUrl: string;
};

type TeacherAssessmentRecords = {
  actorRole: string;
  officeLabel: string;
  summary: {
    total: number;
    needsCorrection: number;
    inProgress: number;
    submitted: number;
  };
  items: TeacherAssessmentRecord[];
  actorAssessmentOnly: true;
  progressOnly: true;
  individualScoresIncluded: false;
  generalCommentsIncluded: false;
  contactDetailsIncluded: false;
  legacyTeacherAppraisalIncluded: false;
  reviewEvidenceIncluded: false;
  noBackgroundPolling: true;
};

type ObservationSubStrandOption = {
  curriculumSubStrandId: string;
  code: string | null;
  title: string;
  strandId: string;
  strandCode: string | null;
  strandTitle: string;
};

type ObservationSubjectOption = {
  curriculumSubjectId: string;
  subject: string;
  phase: "KG" | "PRIMARY" | "JHS";
  level: string;
  subStrands: ObservationSubStrandOption[];
};

type ObservationClassOption = {
  classroomId: string;
  classTaught: string;
  phase: "KG" | "PRIMARY" | "JHS";
  level: string;
  subjects: ObservationSubjectOption[];
};

type TeacherObservationOptions = {
  actorRole: string;
  officeLabel: string;
  target: {
    targetUserId: string;
    targetName: string | null;
    targetTenantId: string;
    schoolName: string;
    circuitId: string;
    circuitName: string;
    districtId: string;
    districtName: string;
  };
  observationDate: string;
  classes: ObservationClassOption[];
  readOnly: true;
  assignmentVerified: true;
  curriculumVerified: true;
  historicalLessonEvidenceIncluded: false;
  contactDetailsIncluded: false;
  providerCalled: false;
};

type ObservationDraft = {
  yearsInService: string;
  yearsInPresentSchool: string;
  dateObserved: string;
  durationMinutes: string;
  totalEnrolment: string;
  girls: string;
  boys: string;
  classroomId: string;
  curriculumSubjectId: string;
  curriculumSubStrandId: string;
};

type ValidatedObservation = {
  yearsInService: number;
  yearsInPresentSchool: number;
  dateObserved: string;
  durationMinutes: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
  classroomId: string;
  curriculumSubjectId: string;
  curriculumSubStrandId: string;
};

type ApiFailure = {
  ok?: false;
  error?: string;
  message?: string;
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

type PendingCommentSave = {
  generalComment: string | null;
  signature: string;
};

type DraftAttempt = {
  signature: string;
  observationKey: string;
};

type ClientProps = {
  initialAssessmentId: string;
};

type LiveSectionScore = {
  rawScore: number;
  applicableMaximum: number;
  answeredItems: number;
  notApplicableItems: number;
  complete: boolean;
  percentage: number | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function answerKey(sectionKey: string, itemKey: string) {
  return `${sectionKey}::${itemKey}`;
}

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
  return `${Math.round(Number(value))}%`;
}

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

function parseRequiredWholeNumber(
  value: string,
  label: string,
  maximum = 80,
) {
  const raw = value.trim();
  if (!raw) {
    return { ok: false as const, message: `${label} is required.` };
  }
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false as const,
      message: `${label} must be a whole number from 0 to ${maximum}.`,
    };
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    return {
      ok: false as const,
      message: `${label} must be a whole number from 0 to ${maximum}.`,
    };
  }
  return { ok: true as const, value: parsed };
}

function parseRequiredNonNegativeWholeNumber(value: string, label: string) {
  const raw = value.trim();
  if (!raw) {
    return { ok: false as const, message: `${label} is required.` };
  }
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false as const,
      message: `${label} must be a non-negative whole number.`,
    };
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return {
      ok: false as const,
      message: `${label} must be a non-negative whole number.`,
    };
  }
  return { ok: true as const, value: parsed };
}

function validObservationDate(value: string) {
  const dateObserved = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateObserved)) return false;
  const parsedDate = new Date(`${dateObserved}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === dateObserved &&
    dateObserved <= today()
  );
}

function validateObservation(
  draft: ObservationDraft,
  options: TeacherObservationOptions | null,
):
  | { ok: true; values: ValidatedObservation }
  | { ok: false; message: string } {
  const dateObserved = draft.dateObserved.trim();
  if (!validObservationDate(dateObserved)) {
    return { ok: false, message: "Select a valid observation date that is not in the future." };
  }

  const yearsInService = parseRequiredWholeNumber(
    draft.yearsInService,
    "Years in service",
  );
  if (!yearsInService.ok) return yearsInService;

  const yearsInPresentSchool = parseRequiredWholeNumber(
    draft.yearsInPresentSchool,
    "Years in present school",
  );
  if (!yearsInPresentSchool.ok) return yearsInPresentSchool;

  const durationMinutes = parseRequiredWholeNumber(
    draft.durationMinutes,
    "Lesson duration",
  );
  if (!durationMinutes.ok) return durationMinutes;

  const totalEnrolment = parseRequiredNonNegativeWholeNumber(
    draft.totalEnrolment,
    "Total enrolment",
  );
  if (!totalEnrolment.ok) return totalEnrolment;

  const girls = parseRequiredNonNegativeWholeNumber(draft.girls, "Girls");
  if (!girls.ok) return girls;

  const boys = parseRequiredNonNegativeWholeNumber(draft.boys, "Boys");
  if (!boys.ok) return boys;

  if (girls.value + boys.value !== totalEnrolment.value) {
    return {
      ok: false,
      message: "Girls plus boys must equal total enrolment.",
    };
  }

  if (!options || options.observationDate !== dateObserved) {
    return {
      ok: false,
      message: "Wait for the Teacher's verified class and curriculum options to load.",
    };
  }

  const classroom = options.classes.find(
    (candidate) => candidate.classroomId === draft.classroomId,
  );
  if (!classroom) {
    return { ok: false, message: "Choose a verified class taught by this Teacher." };
  }

  const subject = classroom.subjects.find(
    (candidate) => candidate.curriculumSubjectId === draft.curriculumSubjectId,
  );
  if (!subject) {
    return { ok: false, message: "Choose a verified subject for the selected class." };
  }

  const subStrand = subject.subStrands.find(
    (candidate) =>
      candidate.curriculumSubStrandId === draft.curriculumSubStrandId,
  );
  if (!subStrand) {
    return {
      ok: false,
      message: "Choose a curriculum sub-strand for the selected class and subject.",
    };
  }

  return {
    ok: true,
    values: {
      yearsInService: yearsInService.value,
      yearsInPresentSchool: yearsInPresentSchool.value,
      dateObserved,
      durationMinutes: durationMinutes.value,
      totalEnrolment: totalEnrolment.value,
      girls: girls.value,
      boys: boys.value,
      classroomId: classroom.classroomId,
      curriculumSubjectId: subject.curriculumSubjectId,
      curriculumSubStrandId: subStrand.curriculumSubStrandId,
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
  const code = clean(failure?.error);
  if (status != null && status >= 500) {
    return "The server is temporarily busy. Keep this page open and try again.";
  }
  if (code === "SERVER_TEMPORARILY_BUSY") {
    return "The server is temporarily busy. Keep this page open and try again.";
  }
  return failure?.message || code || "The request could not be completed. Please try again.";
}

function sectionSaveSignature(scores: SectionSaveScore[]) {
  return JSON.stringify(scores);
}

function commentSaveSignature(generalComment: string | null) {
  return JSON.stringify(generalComment);
}

function normalizeComment(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized || null;
}

function newObservationKey() {
  return `teacher-observation:${crypto.randomUUID()}`;
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

function ratingButtonTone(score: number, selected: boolean) {
  switch (score) {
    case 1:
      return selected
        ? "border-rose-300/70 bg-rose-500/30 text-rose-50"
        : "border-rose-300/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20";
    case 2:
      return selected
        ? "border-orange-300/70 bg-orange-500/30 text-orange-50"
        : "border-orange-300/25 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20";
    case 3:
      return selected
        ? "border-amber-300/70 bg-amber-400/30 text-amber-50"
        : "border-amber-300/25 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20";
    case 4:
      return selected
        ? "border-cyan-300/70 bg-cyan-400/30 text-cyan-50"
        : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20";
    case 5:
      return selected
        ? "border-emerald-300/70 bg-emerald-400/30 text-emerald-50"
        : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20";
    default:
      return "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]";
  }
}

export default function TeacherSupervisoryAssessmentClient({
  initialAssessmentId,
}: ClientProps) {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId);
  const [queue, setQueue] = useState<TeacherQueue | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [records, setRecords] = useState<TeacherAssessmentRecords | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedCircuitId, setSelectedCircuitId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState("");
  const [observationDraft, setObservationDraft] = useState<ObservationDraft>({
    yearsInService: "",
    yearsInPresentSchool: "",
    dateObserved: today(),
    durationMinutes: "",
    totalEnrolment: "",
    girls: "",
    boys: "",
    classroomId: "",
    curriculumSubjectId: "",
    curriculumSubStrandId: "",
  });
  const [observationOptions, setObservationOptions] =
    useState<TeacherObservationOptions | null>(null);
  const [observationOptionsLoading, setObservationOptionsLoading] =
    useState(false);
  const [observationOptionsError, setObservationOptionsError] = useState("");
  const [savedAssessmentsOpen, setSavedAssessmentsOpen] = useState(false);
  const [correctionNotificationsOpen, setCorrectionNotificationsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [answers, setAnswers] = useState<Record<string, ScoreDraft>>({});
  const [generalComment, setGeneralComment] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sectionAutosaveState, setSectionAutosaveState] =
    useState<AutosaveState>("idle");
  const [commentAutosaveState, setCommentAutosaveState] =
    useState<AutosaveState>("idle");
  const [reviewMode, setReviewMode] = useState(false);

  const workspaceRef = useRef<Workspace | null>(null);
  const answersRef = useRef<Record<string, ScoreDraft>>({});
  const commentRef = useRef("");
  const pendingSectionSavesRef = useRef(
    new Map<string, PendingSectionSave>(),
  );
  const savedSectionSignaturesRef = useRef(new Map<string, string>());
  const sectionAutosaveTimerRef = useRef<number | null>(null);
  const sectionRetryTimerRef = useRef<number | null>(null);
  const sectionAutosaveRunningRef = useRef(false);
  const pendingCommentSaveRef = useRef<PendingCommentSave | null>(null);
  const savedCommentSignatureRef = useRef(commentSaveSignature(null));
  const commentAutosaveTimerRef = useRef<number | null>(null);
  const commentRetryTimerRef = useRef<number | null>(null);
  const commentAutosaveRunningRef = useRef(false);
  const draftAttemptRef = useRef<DraftAttempt | null>(null);
  const observationOptionsRequestRef = useRef(0);
  const nativeReviewRef = useRef<HTMLElement | null>(null);

  const clearWorkspaceForAssessmentChange = useCallback(() => {
    for (const timer of [
      sectionAutosaveTimerRef,
      sectionRetryTimerRef,
      commentAutosaveTimerRef,
      commentRetryTimerRef,
    ]) {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }

    sectionAutosaveRunningRef.current = false;
    commentAutosaveRunningRef.current = false;
    pendingSectionSavesRef.current.clear();
    savedSectionSignaturesRef.current.clear();
    pendingCommentSaveRef.current = null;
    savedCommentSignatureRef.current = commentSaveSignature(null);
    workspaceRef.current = null;
    answersRef.current = {};
    commentRef.current = "";

    setWorkspace(null);
    setAnswers({});
    setGeneralComment("");
    setSectionAutosaveState("idle");
    setCommentAutosaveState("idle");
    setReviewMode(false);
    setSectionIndex(0);
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/governance/appraisals/teacher-supervisory",
        { cache: "no-store" },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; queue: TeacherQueue }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      setQueue(body.queue);
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "The authorized Teacher list could not be loaded.",
      );
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const response = await fetch(
        "/api/governance/appraisals/teacher-supervisory/records",
        { cache: "no-store" },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; records: TeacherAssessmentRecords }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      setRecords(body.records);
    } catch (recordsError) {
      setError(
        recordsError instanceof Error
          ? recordsError.message
          : "Your saved Teacher assessments could not be loaded.",
      );
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(
    async (id: string, preserveSectionIndex?: number) => {
      if (workspaceRef.current?.assessment.assessmentId !== id) {
        clearWorkspaceForAssessmentChange();
      }

      setBusy(true);
      setError("");
      try {
        const response = await fetch(
          `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(id)}`,
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
            if (!item.answered) continue;
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
          if (savedScores.length > 0) {
            nextSavedSignatures.set(
              section.sectionKey,
              sectionSaveSignature(savedScores),
            );
          }
        }

        const nextComment = body.workspace.generalComment ?? "";
        answersRef.current = nextAnswers;
        commentRef.current = nextComment;
        setAnswers(nextAnswers);
        setGeneralComment(nextComment);
        savedSectionSignaturesRef.current = nextSavedSignatures;
        pendingSectionSavesRef.current.clear();
        pendingCommentSaveRef.current = null;
        savedCommentSignatureRef.current = commentSaveSignature(
          body.workspace.generalComment,
        );
        setSectionAutosaveState("saved");
        setCommentAutosaveState("saved");
        setSectionIndex(
          Math.min(
            preserveSectionIndex ?? 0,
            Math.max(body.workspace.sections.length - 1, 0),
          ),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The Teacher assessment could not be loaded.",
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
      void loadRecords();
    }
  }, [assessmentId, loadQueue, loadRecords]);

  useEffect(() => {
    if (assessmentId) void loadWorkspace(assessmentId);
  }, [assessmentId, loadWorkspace]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    commentRef.current = generalComment;
  }, [generalComment]);

  const queueSchools = useMemo(() => {
    if (!queue || !selectedCircuitId) return [];
    const schools = new Map<
      string,
      { schoolId: string; schoolName: string; teacherCount: number }
    >();
    for (const item of queue.items) {
      if (item.circuitId !== selectedCircuitId) continue;
      const current = schools.get(item.schoolId) ?? {
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        teacherCount: 0,
      };
      current.teacherCount += 1;
      schools.set(item.schoolId, current);
    }
    return [...schools.values()].sort((left, right) =>
      left.schoolName.localeCompare(right.schoolName),
    );
  }, [queue, selectedCircuitId]);

  const queueTeachers = useMemo(() => {
    if (!queue || !selectedCircuitId || !selectedSchoolId) return [];
    return queue.items
      .filter(
        (item) =>
          item.circuitId === selectedCircuitId &&
          item.schoolId === selectedSchoolId,
      )
      .sort((left, right) =>
        (left.targetName || "Teacher").localeCompare(
          right.targetName || "Teacher",
        ),
      );
  }, [queue, selectedCircuitId, selectedSchoolId]);

  const selectedTeacher = useMemo(
    () =>
      queueTeachers.find(
        (item) => item.targetUserId === selectedTeacherUserId,
      ) ?? null,
    [queueTeachers, selectedTeacherUserId],
  );
  const observationOptionsTargetUserId = selectedTeacher?.targetUserId ?? "";
  const observationOptionsTargetTenantId = selectedTeacher?.schoolId ?? "";

  useEffect(() => {
    const requestId = observationOptionsRequestRef.current + 1;
    observationOptionsRequestRef.current = requestId;
    setObservationOptions(null);
    setObservationOptionsError("");
    setObservationDraft((current) => ({
      ...current,
      classroomId: "",
      curriculumSubjectId: "",
      curriculumSubStrandId: "",
    }));

    if (
      !observationOptionsTargetUserId ||
      !observationOptionsTargetTenantId ||
      !validObservationDate(observationDraft.dateObserved)
    ) {
      setObservationOptionsLoading(false);
      return;
    }

    const targetUserId = observationOptionsTargetUserId;
    const targetTenantId = observationOptionsTargetTenantId;
    const dateObserved = observationDraft.dateObserved.trim();
    setObservationOptionsLoading(true);

    const params = new URLSearchParams({
      targetUserId,
      targetTenantId,
      dateObserved,
    });

    void fetch(
      `/api/governance/appraisals/teacher-supervisory/observation-options?${params.toString()}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const body = (await readApiBody(response)) as
          | { ok: true; options: TeacherObservationOptions }
          | ApiFailure;
        if (!response.ok || body.ok !== true) {
          throw new Error(messageFromFailure(body, response.status));
        }
        if (observationOptionsRequestRef.current !== requestId) return;
        setObservationOptions(body.options);
        if (!body.options.classes.length) {
          setObservationOptionsError(
            "No verified class, subject and curriculum sub-strand combination is available for this Teacher on the selected date.",
          );
        }
      })
      .catch((loadError) => {
        if (observationOptionsRequestRef.current !== requestId) return;
        setObservationOptionsError(
          loadError instanceof Error
            ? loadError.message
            : "The Teacher's verified class and curriculum options could not be loaded.",
        );
      })
      .finally(() => {
        if (observationOptionsRequestRef.current === requestId) {
          setObservationOptionsLoading(false);
        }
      });
  }, [
    observationOptionsTargetUserId,
    observationOptionsTargetTenantId,
    observationDraft.dateObserved,
  ]);

  useEffect(() => {
    if (!queue) return;
    const selectedCircuitStillExists = queue.circuits.some(
      (circuit) => circuit.circuitId === selectedCircuitId,
    );
    const nextCircuitId =
      queue.selection.assignedCircuitId ||
      (selectedCircuitStillExists ? selectedCircuitId : "") ||
      (queue.circuits.length === 1 ? queue.circuits[0].circuitId : "");
    if (nextCircuitId !== selectedCircuitId) {
      setSelectedCircuitId(nextCircuitId);
      setSelectedSchoolId("");
      setSelectedTeacherUserId("");
    }
  }, [queue, selectedCircuitId]);

  useEffect(() => {
    if (!selectedCircuitId) {
      setSelectedSchoolId("");
      setSelectedTeacherUserId("");
      return;
    }
    const schoolStillExists = queueSchools.some(
      (school) => school.schoolId === selectedSchoolId,
    );
    const nextSchoolId = schoolStillExists
      ? selectedSchoolId
      : queueSchools.length === 1
        ? queueSchools[0].schoolId
        : "";
    if (nextSchoolId !== selectedSchoolId) {
      setSelectedSchoolId(nextSchoolId);
      setSelectedTeacherUserId("");
    }
  }, [queueSchools, selectedCircuitId, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setSelectedTeacherUserId("");
      return;
    }
    const teacherStillExists = queueTeachers.some(
      (teacher) => teacher.targetUserId === selectedTeacherUserId,
    );
    if (!teacherStillExists && queueTeachers.length === 1) {
      setSelectedTeacherUserId(queueTeachers[0].targetUserId);
    } else if (!teacherStillExists && selectedTeacherUserId) {
      setSelectedTeacherUserId("");
    }
  }, [queueTeachers, selectedSchoolId, selectedTeacherUserId]);

  const currentSection = workspace?.sections[sectionIndex] ?? null;
  const localAnsweredItems = useMemo(() => Object.keys(answers).length, [answers]);
  const totalItems = workspace?.assessment.progress.totalItems ?? 34;
  const localCompletionPercentage = workspace
    ? Math.round((localAnsweredItems / workspace.assessment.progress.totalItems) * 100)
    : 0;
  const allItemsAnswered = Boolean(
    workspace && localAnsweredItems === workspace.assessment.progress.totalItems,
  );

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

      scores.set(section.sectionKey, {
        rawScore,
        applicableMaximum,
        answeredItems,
        notApplicableItems,
        complete: answeredItems === section.items.length,
        percentage:
          applicableMaximum > 0
            ? round2((rawScore / applicableMaximum) * 100)
            : null,
      });
    }
    return scores;
  }, [answers, workspace]);

  const completedOverallPercentage = useMemo(() => {
    if (!workspace || !allItemsAnswered) return null;
    const valid: number[] = [];
    for (const section of workspace.sections) {
      const sectionScore = liveSectionScores.get(section.sectionKey);
      if (!sectionScore?.complete || sectionScore.percentage == null) continue;
      valid.push(sectionScore.percentage);
    }
    if (!valid.length) return null;
    return round2(valid.reduce((sum, value) => sum + value, 0) / valid.length);
  }, [allItemsAnswered, liveSectionScores, workspace]);

  const combinedAutosaveState = useMemo<AutosaveState>(() => {
    const states = [sectionAutosaveState, commentAutosaveState];
    if (states.includes("waiting")) return "waiting";
    if (states.includes("saving")) return "saving";
    if (states.includes("queued")) return "queued";
    if (states.every((state) => state === "saved" || state === "idle")) {
      return states.includes("saved") ? "saved" : "idle";
    }
    return "idle";
  }, [commentAutosaveState, sectionAutosaveState]);

  const processSectionAutosaveQueue = useCallback(async () => {
    if (!assessmentId || sectionAutosaveRunningRef.current) return;
    sectionAutosaveRunningRef.current = true;
    try {
      while (pendingSectionSavesRef.current.size > 0) {
        const entry = pendingSectionSavesRef.current.entries().next().value as
          | [string, PendingSectionSave]
          | undefined;
        if (!entry) break;
        const [sectionKey, pending] = entry;

        if (
          savedSectionSignaturesRef.current.get(sectionKey) === pending.signature
        ) {
          pendingSectionSavesRef.current.delete(sectionKey);
          continue;
        }

        setSectionAutosaveState("saving");
        try {
          const response = await fetch(
            `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(assessmentId)}/section`,
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

          savedSectionSignaturesRef.current.set(sectionKey, pending.signature);
          const latest = pendingSectionSavesRef.current.get(sectionKey);
          if (latest?.signature === pending.signature) {
            pendingSectionSavesRef.current.delete(sectionKey);
          }
          setSectionAutosaveState(
            pendingSectionSavesRef.current.size > 0 ? "queued" : "saved",
          );
          setNotice("Saved securely.");
        } catch (saveError) {
          setSectionAutosaveState("waiting");
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Score autosave is waiting for the connection.",
          );
          if (sectionRetryTimerRef.current != null) {
            window.clearTimeout(sectionRetryTimerRef.current);
          }
          sectionRetryTimerRef.current = window.setTimeout(() => {
            sectionRetryTimerRef.current = null;
            void processSectionAutosaveQueue();
          }, 5000);
          break;
        }
      }
    } finally {
      sectionAutosaveRunningRef.current = false;
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
      if (!scores.length) return;

      pendingSectionSavesRef.current.set(sectionKey, {
        sectionKey,
        scores,
        signature: sectionSaveSignature(scores),
      });
      setSectionAutosaveState("queued");
      setNotice("");
      if (sectionAutosaveTimerRef.current != null) {
        window.clearTimeout(sectionAutosaveTimerRef.current);
      }
      sectionAutosaveTimerRef.current = window.setTimeout(() => {
        sectionAutosaveTimerRef.current = null;
        void processSectionAutosaveQueue();
      }, delay);
    },
    [processSectionAutosaveQueue],
  );

  const processCommentAutosaveQueue = useCallback(async () => {
    if (!assessmentId || commentAutosaveRunningRef.current) return;
    const pending = pendingCommentSaveRef.current;
    if (!pending) return;
    if (savedCommentSignatureRef.current === pending.signature) {
      pendingCommentSaveRef.current = null;
      setCommentAutosaveState("saved");
      return;
    }

    commentAutosaveRunningRef.current = true;
    setCommentAutosaveState("saving");
    try {
      const response = await fetch(
        `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(assessmentId)}/comment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generalComment: pending.generalComment }),
        },
      );
      const body = (await readApiBody(response)) as
        | { ok: true; result: { outcome: string; generalComment: string | null } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      savedCommentSignatureRef.current = pending.signature;
      if (pendingCommentSaveRef.current?.signature === pending.signature) {
        pendingCommentSaveRef.current = null;
      }
      setCommentAutosaveState(
        pendingCommentSaveRef.current ? "queued" : "saved",
      );
      setNotice("Saved securely.");
      if (pendingCommentSaveRef.current) {
        window.setTimeout(() => void processCommentAutosaveQueue(), 0);
      }
    } catch (commentError) {
      setCommentAutosaveState("waiting");
      setError(
        commentError instanceof Error
          ? commentError.message
          : "Comment autosave is waiting for the connection.",
      );
      if (commentRetryTimerRef.current != null) {
        window.clearTimeout(commentRetryTimerRef.current);
      }
      commentRetryTimerRef.current = window.setTimeout(() => {
        commentRetryTimerRef.current = null;
        void processCommentAutosaveQueue();
      }, 5000);
    } finally {
      commentAutosaveRunningRef.current = false;
    }
  }, [assessmentId]);

  const queueCommentAutosave = useCallback(
    (nextComment: string, delay = 1200) => {
      if (workspaceRef.current?.assessment.canEdit !== true) return;
      const normalized = normalizeComment(nextComment);
      pendingCommentSaveRef.current = {
        generalComment: normalized,
        signature: commentSaveSignature(normalized),
      };
      setCommentAutosaveState("queued");
      setNotice("");
      if (commentAutosaveTimerRef.current != null) {
        window.clearTimeout(commentAutosaveTimerRef.current);
      }
      commentAutosaveTimerRef.current = window.setTimeout(() => {
        commentAutosaveTimerRef.current = null;
        void processCommentAutosaveQueue();
      }, delay);
    },
    [processCommentAutosaveQueue],
  );

  useEffect(() => {
    const retryWhenOnline = () => {
      if (pendingSectionSavesRef.current.size > 0) {
        void processSectionAutosaveQueue();
      }
      if (pendingCommentSaveRef.current) {
        void processCommentAutosaveQueue();
      }
    };
    const markOffline = () => {
      if (pendingSectionSavesRef.current.size > 0) {
        setSectionAutosaveState("waiting");
      }
      if (pendingCommentSaveRef.current) {
        setCommentAutosaveState("waiting");
      }
    };
    window.addEventListener("online", retryWhenOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [processCommentAutosaveQueue, processSectionAutosaveQueue]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (
        pendingSectionSavesRef.current.size > 0 ||
        sectionAutosaveRunningRef.current ||
        pendingCommentSaveRef.current ||
        commentAutosaveRunningRef.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      for (const timer of [
        sectionAutosaveTimerRef,
        sectionRetryTimerRef,
        commentAutosaveTimerRef,
        commentRetryTimerRef,
      ]) {
        if (timer.current != null) window.clearTimeout(timer.current);
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
      [answerKey(sectionKey, itemKey)]: { score, notApplicable },
    };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setNotice("");
    queueSectionAutosave(sectionKey, nextAnswers);
  }

  function updateObservationField(field: keyof ObservationDraft, value: string) {
    setObservationDraft((current) => {
      if (field === "classroomId") {
        return {
          ...current,
          classroomId: value,
          curriculumSubjectId: "",
          curriculumSubStrandId: "",
        };
      }
      if (field === "curriculumSubjectId") {
        return {
          ...current,
          curriculumSubjectId: value,
          curriculumSubStrandId: "",
        };
      }
      return { ...current, [field]: value };
    });
    setError("");
    setNotice("");
  }

  async function createDraft() {
    if (!selectedTeacher) {
      setError("Choose the Teacher you are observing.");
      return;
    }

    const validation = validateObservation(observationDraft, observationOptions);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const signature = JSON.stringify({
      targetUserId: selectedTeacher.targetUserId,
      targetTenantId: selectedTeacher.schoolId,
      ...validation.values,
    });
    if (draftAttemptRef.current?.signature !== signature) {
      draftAttemptRef.current = {
        signature,
        observationKey: newObservationKey(),
      };
    }
    const attempt = draftAttemptRef.current;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/governance/appraisals/teacher-supervisory",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: selectedTeacher.targetUserId,
            targetTenantId: selectedTeacher.schoolId,
            observationKey: attempt.observationKey,
            ...validation.values,
          }),
        },
      );
      const body = (await readApiBody(response)) as
        | {
            ok: true;
            result: {
              outcome: "CREATED" | "EXISTING_MATCH";
              draft: { assessmentId: string };
            };
          }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }

      const nextId = body.result.draft.assessmentId;
      draftAttemptRef.current = null;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/teacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The secure Teacher assessment draft could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createCorrectionRevision(record: TeacherAssessmentRecord) {
    if (
      record.state !== "NEEDS_CORRECTION" ||
      record.status !== "RETURNED" ||
      !record.correction?.revisionRequired
    ) {
      setError("This Teacher assessment is not waiting for a correction revision.");
      return;
    }

    const confirmed = window.confirm(
      `Create correction Revision ${record.revision + 1}? Revision ${record.revision} will remain preserved and locked while a new editable revision is created.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(record.assessmentId)}/revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmRevision: true }),
        },
      );
      const body = (await readApiBody(response)) as
        | {
            ok: true;
            result: { outcome: "CREATED" | "EXISTING_MATCH" };
            workspaceUrl: string;
          }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body, response.status));
      }
      if (
        body.result.outcome !== "CREATED" &&
        body.result.outcome !== "EXISTING_MATCH"
      ) {
        throw new Error("The correction revision response could not be verified.");
      }

      const handoff = new URL(body.workspaceUrl, window.location.origin);
      const nextId = clean(handoff.searchParams.get("assessmentId"));
      if (
        handoff.origin !== window.location.origin ||
        handoff.pathname !== "/governance/appraisals/teacher-supervisory" ||
        !nextId
      ) {
        throw new Error("The correction revision workspace could not be verified.");
      }

      const safeWorkspaceUrl =
        `/governance/appraisals/teacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`;
      clearWorkspaceForAssessmentChange();
      setAssessmentId(nextId);
      router.replace(safeWorkspaceUrl);
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "The correction revision could not be created. Try again without leaving this page.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewCompletedAssessment() {
    if (!workspace || !assessmentId) return;
    for (const section of workspace.sections) {
      queueSectionAutosave(section.sectionKey, answersRef.current, 0);
    }
    queueCommentAutosave(commentRef.current, 0);
    await processSectionAutosaveQueue();
    await processCommentAutosaveQueue();

    if (
      pendingSectionSavesRef.current.size > 0 ||
      pendingCommentSaveRef.current
    ) {
      setError(
        "Some changes are still waiting for the connection. Keep this page open and try review again after autosave completes.",
      );
      return;
    }

    await loadWorkspace(assessmentId, sectionIndex);
    setReviewMode(true);
    setNotice("Everything is saved. Review the complete official form before submitting.");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        nativeReviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  async function finalizeAssessment() {
    if (!workspace || !assessmentId || workspace.assessment.canFinalize !== true) {
      return;
    }
    const confirmed = window.confirm(
      "Submit and lock this Teacher assessment? You will not be able to edit this version afterward.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(assessmentId)}/finalize`,
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
      setNotice("Assessment submitted and locked.");
      setReviewMode(false);
      await loadWorkspace(assessmentId);
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "The Teacher assessment could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!assessmentId) {
    const actorRole = queue?.actorRole || records?.actorRole;
    const correctionRecords =
      records?.items.filter((record) => record.state === "NEEDS_CORRECTION") ?? [];
    const savedRecords =
      records?.items.filter((record) => record.state !== "NEEDS_CORRECTION") ?? [];
    const selectedCircuit = queue?.circuits.find(
      (circuit) => circuit.circuitId === selectedCircuitId,
    );
    const selectedSchool = queueSchools.find(
      (school) => school.schoolId === selectedSchoolId,
    );
    const observationValidation = validateObservation(observationDraft, observationOptions);
    const selectedObservationClass = observationOptions?.classes.find(
      (candidate) => candidate.classroomId === observationDraft.classroomId,
    ) ?? null;
    const selectedObservationSubject = selectedObservationClass?.subjects.find(
      (candidate) =>
        candidate.curriculumSubjectId === observationDraft.curriculumSubjectId,
    ) ?? null;

    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                  EduLife OS · {queue?.officeLabel || "Governance assessor"}
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                  Teacher Appraisal
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                  Choose the circuit, school and Teacher you are observing. Then record the official lesson-observation particulars and open the 6-section assessment form.
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
                  disabled={queueLoading || recordsLoading}
                  onClick={() => {
                    void loadQueue();
                    void loadRecords();
                  }}
                  className="rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  {queueLoading || recordsLoading ? "Refreshing…" : "Refresh work list"}
                </button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {correctionRecords.length ? (
            <section className="flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setCorrectionNotificationsOpen((open) => !open)
                }
                aria-expanded={correctionNotificationsOpen}
                aria-controls="teacher-correction-notifications"
                aria-label="Correction notifications"
                title="Correction notifications"
                className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300 text-slate-950 shadow-[0_10px_28px_rgba(251,191,36,0.18)] transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200/70"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#070B12] bg-rose-500 px-1 text-[10px] font-black leading-none text-white">
                  {records?.summary.needsCorrection ?? correctionRecords.length}
                </span>
              </button>

              {correctionNotificationsOpen ? (
                <div
                  id="teacher-correction-notifications"
                  className="w-full max-w-3xl space-y-2 rounded-[22px] border border-amber-200/20 bg-[#11100B] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.24)] md:p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                        Correction notifications
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {correctionRecords.length === 1
                          ? "1 returned Teacher report needs attention."
                          : `${correctionRecords.length} returned Teacher reports need attention.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCorrectionNotificationsOpen(false)}
                      className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-white hover:bg-white/[0.08]"
                    >
                      Close
                    </button>
                  </div>

                  {correctionRecords.map((record) => (
                    <article
                      key={record.assessmentId}
                      className="rounded-2xl border border-amber-200/20 bg-amber-950/20 p-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="font-bold text-white">
                              {record.targetName || "Teacher"}
                            </p>
                            <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                              Revision {record.revision}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {record.schoolName} · {record.circuitName}
                          </p>
                          <div className="mt-2 rounded-xl border border-amber-200/20 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
                              Reason for correction
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-amber-50">
                              {record.correction?.reason || "A correction reason was not available."}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void createCorrectionRevision(record)}
                          className="min-h-11 shrink-0 rounded-xl border border-amber-200/30 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 md:self-end"
                        >
                          {busy ? "Please wait…" : "Create correction revision"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  My saved assessments
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {records?.summary.inProgress ?? 0} to continue · {records?.summary.submitted ?? 0} submitted
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSavedAssessmentsOpen((open) => !open)}
                aria-expanded={savedAssessmentsOpen}
                className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                {savedAssessmentsOpen
                  ? "Hide saved assessments"
                  : `Show saved assessments (${savedRecords.length})`}
              </button>
            </div>

            {savedAssessmentsOpen ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                {recordsLoading && !records ? (
                  <p className="text-sm text-slate-300">Loading your saved assessments…</p>
                ) : savedRecords.length ? (
                  <div className="space-y-2">
                    {savedRecords.map((record) => (
                      <a
                        key={record.assessmentId}
                        href={record.workspaceUrl}
                        className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 transition hover:bg-white/[0.08] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {record.targetName || "Teacher"}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {record.schoolName} · {record.dateObserved}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs">
                          <span
                            className={cx(
                              "rounded-full border px-2 py-1 font-bold",
                              record.state === "IN_PROGRESS"
                                ? "border-cyan-300/25 bg-cyan-400/15 text-cyan-100"
                                : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
                            )}
                          >
                            {record.state === "IN_PROGRESS"
                              ? `${record.answeredItems}/${record.totalItems} saved`
                              : record.overallPercentage == null
                                ? "SUBMITTED"
                                : formatPercent(record.overallPercentage)}
                          </span>
                          <span className="font-bold text-white">
                            {record.state === "IN_PROGRESS" ? "Continue →" : "View →"}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/15 bg-black/10 p-3 text-sm text-slate-300">
                    No saved Teacher assessment yet.
                  </p>
                )}
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  This saved-work list shows progress only. Individual scores, General Comments, contact details and review evidence are not loaded here. Returned correction instructions appear only in the Needs correction section above.
                </p>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-3 gap-2 md:gap-4">
            {[
              ["Circuits", queue?.summary.circuits ?? 0],
              ["Schools", queue?.summary.schools ?? 0],
              ["Teachers", queue?.summary.teachers ?? 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3 text-center md:rounded-[28px] md:p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">
                  {label}
                </p>
                <p className="mt-1 text-lg font-bold text-white md:text-2xl">
                  {value}
                </p>
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
                  Authorized area
                </h2>
                <div className="mt-4 space-y-2">
                  {queue?.circuits.map((circuit) => {
                    const selected = circuit.circuitId === selectedCircuitId;
                    const fixed = queue.selection.assignedCircuitId === circuit.circuitId;
                    return (
                      <button
                        key={circuit.circuitId}
                        type="button"
                        onClick={() => {
                          setSelectedCircuitId(circuit.circuitId);
                          setSelectedSchoolId("");
                          setSelectedTeacherUserId("");
                        }}
                        className={cx(
                          "w-full rounded-2xl border p-3 text-left transition",
                          selected
                            ? "border-cyan-300/40 bg-cyan-400/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{circuit.circuitName}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {circuit.schoolCount} school{circuit.schoolCount === 1 ? "" : "s"} · {circuit.teacherCount} Teacher{circuit.teacherCount === 1 ? "" : "s"}
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
                <h2 className="mt-1 text-lg font-semibold text-white">School</h2>
                {!selectedCircuitId ? (
                  <p className="mt-4 text-sm text-slate-300">Choose a circuit first.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {queueSchools.map((school) => (
                      <button
                        key={school.schoolId}
                        type="button"
                        onClick={() => {
                          setSelectedSchoolId(school.schoolId);
                          setSelectedTeacherUserId("");
                        }}
                        className={cx(
                          "w-full rounded-2xl border p-3 text-left transition",
                          school.schoolId === selectedSchoolId
                            ? "border-emerald-300/40 bg-emerald-400/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                        )}
                      >
                        <p className="font-semibold text-white">{school.schoolName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {school.teacherCount} eligible Teacher{school.teacherCount === 1 ? "" : "s"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  3. Choose Teacher
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">Teacher observed</h2>
                {!selectedSchoolId ? (
                  <p className="mt-4 text-sm text-slate-300">Choose a school first.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {queueTeachers.map((teacher) => (
                      <button
                        key={teacher.targetUserId}
                        type="button"
                        onClick={() => setSelectedTeacherUserId(teacher.targetUserId)}
                        className={cx(
                          "w-full rounded-2xl border p-3 text-left transition",
                          teacher.targetUserId === selectedTeacherUserId
                            ? "border-fuchsia-300/40 bg-fuchsia-400/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                        )}
                      >
                        <p className="font-semibold text-white">
                          {teacher.targetName || "Teacher"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <main>
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  4. Observation particulars
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {selectedTeacher?.targetName || "Choose the Teacher first"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {selectedTeacher
                    ? `${selectedTeacher.schoolName} · ${selectedTeacher.circuitName}`
                    : selectedSchool?.schoolName || selectedCircuit?.circuitName || "The selected Teacher and school will appear here."}
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-sm font-semibold text-slate-200">
                    Number of years in the service
                    <input
                      type="number"
                      min="0"
                      max="80"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.yearsInService}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("yearsInService", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Number of years in present school
                    <input
                      type="number"
                      min="0"
                      max="80"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.yearsInPresentSchool}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("yearsInPresentSchool", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Date observed
                    <input
                      type="date"
                      max={today()}
                      required
                      value={observationDraft.dateObserved}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("dateObserved", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Class taught
                    <select
                      required
                      disabled={!selectedTeacher || observationOptionsLoading || !observationOptions}
                      value={observationDraft.classroomId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateObservationField("classroomId", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50 disabled:opacity-50"
                    >
                      <option value="">Choose class</option>
                      {observationOptions?.classes.map((option) => (
                        <option key={option.classroomId} value={option.classroomId}>
                          {option.classTaught}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Subject being observed
                    <select
                      required
                      disabled={!selectedObservationClass}
                      value={observationDraft.curriculumSubjectId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateObservationField("curriculumSubjectId", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50 disabled:opacity-50"
                    >
                      <option value="">Choose subject</option>
                      {selectedObservationClass?.subjects.map((option) => (
                        <option
                          key={option.curriculumSubjectId}
                          value={option.curriculumSubjectId}
                        >
                          {option.subject}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Sub-strand
                    <select
                      required
                      disabled={!selectedObservationSubject}
                      value={observationDraft.curriculumSubStrandId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateObservationField("curriculumSubStrandId", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50 disabled:opacity-50"
                    >
                      <option value="">Choose sub-strand</option>
                      {selectedObservationSubject?.subStrands.map((option) => (
                        <option
                          key={option.curriculumSubStrandId}
                          value={option.curriculumSubStrandId}
                        >
                          {option.strandTitle} · {option.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Duration of lesson (minutes)
                    <input
                      type="number"
                      min="0"
                      max="80"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.durationMinutes}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("durationMinutes", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Total enrolment
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.totalEnrolment}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("totalEnrolment", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Girls
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.girls}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("girls", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-200">
                    Boys
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      required
                      value={observationDraft.boys}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateObservationField("boys", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-base text-white outline-none focus:border-cyan-300/50"
                    />
                  </label>
                </div>

                {observationOptionsLoading ? (
                  <p className="mt-3 text-xs text-cyan-100">
                    Loading this Teacher&apos;s verified class and curriculum options…
                  </p>
                ) : observationOptionsError ? (
                  <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                    {observationOptionsError}
                  </p>
                ) : selectedTeacher && observationOptions ? (
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Class and subject authority comes from the Teacher&apos;s current assignment scope; sub-strands come from the matching curriculum. Old schemes, lesson notes and lesson deliveries do not widen this list.
                  </p>
                ) : null}

                <div
                  className={cx(
                    "mt-5 rounded-2xl border p-4 text-sm",
                    selectedTeacher && observationValidation.ok
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      : "border-amber-300/25 bg-amber-400/10 text-amber-100",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {!selectedTeacher
                    ? "Choose the Teacher you are observing."
                    : observationValidation.ok
                      ? "Ready. Teacher, school, circuit, assignment, curriculum selection and enrolment balance have all passed the consistency gate. These particulars will be frozen when the draft is created."
                      : observationValidation.message}
                </div>

                <button
                  type="button"
                  disabled={busy || observationOptionsLoading || !selectedTeacher || !observationValidation.ok}
                  onClick={() => void createDraft()}
                  className="mt-5 min-h-14 w-full rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-5 text-base font-bold text-cyan-50 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Creating secure draft…" : "Start Teacher appraisal"}
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  The same start attempt keeps one stable observation key so a weak-network retry cannot silently create a duplicate observation.
                </p>
              </section>
            </main>
          </section>

          <p className="text-xs leading-5 text-slate-400">
            Teacher discovery and saved records refresh only when requested. No background polling, contact details, individual scores, General Comments or legacy Teacher Appraisal evidence is loaded into this work list.
          </p>
        </div>
      </div>
    );
  }

  if (!workspace || !currentSection) {
    return (
      <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h1 className="text-2xl font-semibold text-white">Teacher appraisal</h1>
            <p className="mt-4 text-slate-300">
              {busy ? "Loading assessment…" : error || "Assessment unavailable."}
            </p>
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
  const safeSectionIndex = Math.min(
    sectionIndex,
    renderedWorkspace.sections.length - 1,
  );
  const mobileSection = renderedWorkspace.sections[safeSectionIndex];

  function sectionAnsweredCount(section: WorkspaceSection) {
    return section.items.filter(
      (item) => answers[answerKey(section.sectionKey, item.itemKey)],
    ).length;
  }

  function scrollToRenderedSection(section: WorkspaceSection) {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const targetId = `teacher-supervisory-section-${
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
    const bounded = Math.max(
      0,
      Math.min(renderedWorkspace.sections.length - 1, nextIndex),
    );
    const nextSection = renderedWorkspace.sections[bounded];
    if (!nextSection) return;
    if (currentSection) {
      queueSectionAutosave(currentSection.sectionKey, answersRef.current, 0);
    }
    setReviewMode(false);
    setSectionIndex(bounded);
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
    const liveScore = liveSectionScores.get(section.sectionKey);
    return (
      <section
        id={`teacher-supervisory-section-${mobileOnly ? "mobile" : "desktop"}-${section.sectionKey}`}
        key={`${mobileOnly ? "mobile" : "desktop"}:${section.sectionKey}`}
        className={cx(
          "scroll-mt-28 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:scroll-mt-32 md:p-5",
          mobileOnly ? "md:hidden" : "hidden md:block",
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#E8C96A]">
          Section {section.order} · {section.maxScore} marks
        </p>
        <h3 className="mt-1 text-base font-semibold text-white">{section.title}</h3>
        {section.description ? (
          <p className="mt-1 text-xs leading-5 text-slate-400">{section.description}</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {section.items.map((item) => {
            const answer = answers[answerKey(section.sectionKey, item.itemKey)];
            return (
              <article
                key={item.itemKey}
                className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 lg:max-w-[65%]">
                    <p className="text-xs font-bold text-[#E8C96A]">{item.itemKey}</p>
                    <p className="mt-1 text-base font-semibold leading-7 text-slate-100">
                      {item.label}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((score) => {
                      const selected =
                        answer?.notApplicable !== true && answer?.score === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          disabled={!editable || busy}
                          aria-pressed={selected}
                          onClick={() =>
                            chooseItemScore(
                              section.sectionKey,
                              item.itemKey,
                              score,
                              false,
                            )
                          }
                          className={cx(
                            "h-11 w-11 rounded-2xl border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                            ratingButtonTone(score, selected),
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
                      onClick={() =>
                        chooseItemScore(
                          section.sectionKey,
                          item.itemKey,
                          null,
                          true,
                        )
                      }
                      className={cx(
                        "h-11 rounded-2xl border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                        answer?.notApplicable === true
                          ? "border-slate-300/50 bg-slate-300/20 text-slate-100"
                          : "border-slate-300/20 bg-slate-300/[0.06] text-slate-300 hover:bg-slate-300/10",
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
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Answered</p>
            <p className="mt-1 text-lg font-bold text-white">{answered}/{section.items.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Section total</p>
            <p className="mt-1 text-lg font-bold text-white">
              {liveScore?.rawScore ?? 0}/{liveScore?.applicableMaximum ?? section.maxScore}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Section result</p>
            <p className="mt-1 text-lg font-bold text-white">
              {formatPercent(liveScore?.percentage)}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const autosaveLabel =
    combinedAutosaveState === "saving"
      ? "Autosaving…"
      : combinedAutosaveState === "queued"
        ? "Autosave queued"
        : combinedAutosaveState === "waiting"
          ? "Waiting for network"
          : combinedAutosaveState === "saved"
            ? "Saved securely"
            : "Autosave ready";

  return (
    <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(20,34,46,0.96),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                Monitoring and Inspection Sheet · Teachers
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                {workspace.observation.targetName || "Teacher"}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {workspace.observation.schoolName} · {workspace.observation.circuitName}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                Complete the official 6-section, 34-indicator Teacher appraisal. Scores and General Comments autosave securely.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/governance/appraisals/teacher-supervisory"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]"
              >
                ← Teacher list
              </Link>
              <span className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white">
                {workspace.assessment.status.replaceAll("_", " ")}
              </span>
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
            ["Sections", workspace.sections.length],
            ["Answered", `${localAnsweredItems}/${totalItems}`],
            ["Completion", `${localCompletionPercentage}%`],
            ["Overall", allItemsAnswered ? formatPercent(completedOverallPercentage) : "After 34/34"],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-[20px] border border-white/10 bg-white/[0.04] p-2.5 text-center md:rounded-[28px] md:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-xs">
                {label}
              </p>
              <p className="mt-1 text-sm font-bold text-white md:text-xl">{value}</p>
            </div>
          ))}
        </section>

        <section className="sticky top-2 z-20 md:hidden">
          <div className="rounded-[24px] border border-cyan-300/20 bg-[#08151B]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E8C96A]">
                  Section {safeSectionIndex + 1} of {workspace.sections.length}
                </p>
                <h2 className="mt-1 truncate text-base font-semibold text-white">
                  {mobileSection.title}
                </h2>
              </div>
              <p className="shrink-0 text-sm font-bold text-white">
                {localAnsweredItems}/{totalItems}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#22D3EE,#34D399)] transition-all duration-300"
                style={{ width: `${localCompletionPercentage}%` }}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[360px_1fr] xl:gap-6">
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                1. Observation record
              </p>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["Name of Teacher", workspace.observation.targetName || "Teacher"],
                  ["Years in service", workspace.observation.yearsInService],
                  ["Name of school", workspace.observation.schoolName],
                  ["Years in present school", workspace.observation.yearsInPresentSchool],
                  ["Name of circuit", workspace.observation.circuitName],
                  ["Subject being observed", workspace.observation.subjectBeingObserved],
                  ["Date observed", workspace.observation.dateObserved],
                  ["Sub-strand", workspace.observation.subStrand],
                  ["Class taught", workspace.observation.classTaught],
                  ["Duration of lesson", workspace.observation.durationMinutes == null ? null : `${workspace.observation.durationMinutes} minutes`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="mt-1 font-semibold text-white">
                      {value == null || value === "" ? "Not provided" : String(value)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100">
                  Class Enrollment Data
                </p>
                {workspace.observation.contextSchemaVersion === 2 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Total", workspace.observation.totalEnrolment],
                      ["Girls", workspace.observation.girls],
                      ["Boys", workspace.observation.boys],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">{label}</p>
                        <p className="mt-1 font-bold text-white">{String(value ?? "—")}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-cyan-50/80">
                    Legacy v1 draft: enrolment breakdown was not captured in this immutable version.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                2. Sections
              </p>
              <div className="mt-4 space-y-2">
                {workspace.sections.map((section, index) => {
                  const answered = sectionAnsweredCount(section);
                  return (
                    <button
                      key={section.sectionKey}
                      type="button"
                      onClick={() => goToSection(index)}
                      className={cx(
                        "w-full rounded-2xl border p-3 text-left transition",
                        index === safeSectionIndex
                          ? "border-cyan-300/40 bg-cyan-400/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.08]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-[#E8C96A]">Section {section.order}</p>
                          <p className="mt-1 text-sm font-semibold leading-5 text-white">{section.title}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-bold text-white">
                          {answered}/{section.items.length}
                        </span>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                    3. Score the lesson observation
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Official 1–5 rating scale</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    1 Very Poor · 2 Poor · 3 Acceptable · 4 Good · 5 Very Good · N/A Not applicable
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Overall result</p>
                  <p className="mt-1 text-base font-bold text-white">
                    {allItemsAnswered ? formatPercent(completedOverallPercentage) : "Shown after 34/34"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3" aria-label="Overall completion">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#22D3EE,#34D399)] transition-all duration-300"
                    style={{ width: `${localCompletionPercentage}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-bold text-white">
                  {localAnsweredItems}/{totalItems} · {localCompletionPercentage}%
                </span>
              </div>
            </section>

            {workspace.sections.map((section) => renderSection(section, false))}
            {renderSection(mobileSection, true)}

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                4. General Comments
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">General Comments</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Add the assessor&apos;s official general comment. It autosaves separately and becomes part of the locked final evidence.
              </p>
              <textarea
                value={generalComment}
                disabled={!editable || busy}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  const next = event.target.value;
                  commentRef.current = next;
                  setGeneralComment(next);
                  setReviewMode(false);
                  queueCommentAutosave(next);
                }}
                rows={5}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-[#0B1220] p-4 text-base leading-7 text-white outline-none focus:border-cyan-300/50 disabled:opacity-60"
                placeholder="Enter the official general comment, if any."
              />
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                    5. Review and submit
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Secure finalization</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    Submitted scores and General Comments are locked. Review every entry before final submission.
                  </p>
                </div>
                <div
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-bold",
                    combinedAutosaveState === "waiting"
                      ? "border-amber-300/25 bg-amber-400/15 text-amber-100"
                      : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {autosaveLabel}
                </div>
              </div>

              {editable && allItemsAnswered && !reviewMode ? (
                <button
                  type="button"
                  disabled={busy || combinedAutosaveState === "saving"}
                  onClick={() => void reviewCompletedAssessment()}
                  className="mt-5 min-h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-base font-bold text-white hover:bg-white/[0.1] disabled:opacity-50"
                >
                  Review Before you Submit
                </button>
              ) : null}

              {!allItemsAnswered && editable ? (
                <p className="mt-4 text-xs leading-5 text-slate-400">
                  Answer every indicator or mark it N/A. The overall result appears only after all 34 indicators are complete.
                </p>
              ) : null}

              {!editable && workspace.assessment.status === "FINALIZED" ? (
                <button
                  type="button"
                  onClick={() => setReviewMode(true)}
                  className="mt-5 min-h-14 w-full rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 text-base font-bold text-emerald-50 hover:bg-emerald-400/20"
                >
                  View finalized assessment
                </button>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-slate-400">
                Autosave retries while this page remains open. There is no background polling or persistent browser storage.
              </p>
            </section>
          </main>
        </section>

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
              className="min-h-12 rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 py-3 text-sm font-bold text-cyan-50 disabled:opacity-40"
            >
              Next section
            </button>
          </div>
        </section>

        {reviewMode ? (
          <section
            ref={nativeReviewRef}
            className="scroll-mt-24 rounded-[30px] border border-white/10 bg-white/[0.03] p-3 md:scroll-mt-28 md:p-5"
          >
            <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  Final review · read-only preview
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">Review Before you Submit</h2>
                <p className="mt-1 text-sm leading-6 text-emerald-50/90">
                  Check the full official Teacher form, all six section results and the General Comments before locking this version.
                </p>
              </div>
              {editable ? (
                <button
                  type="button"
                  onClick={returnToAssessment}
                  className="min-h-12 rounded-2xl border border-white/15 bg-black/20 px-5 text-sm font-bold text-white hover:bg-black/30"
                >
                  Return to assessment
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-[24px] border border-slate-300 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
              <div className="min-w-[1120px] bg-white text-slate-950">
                <header className="border-b-2 border-slate-900 px-8 py-7 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.18em]">
                    {workspace.observation.districtName}
                  </p>
                  <h3 className="mt-2 text-xl font-black uppercase">
                    Monitoring and Inspection Sheet (Teachers)
                  </h3>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-800">
                    Governance Teacher observation · final review copy
                  </p>
                </header>

                <div className="grid grid-cols-[190px_1fr_210px_1fr] border-b border-slate-300 text-sm">
                  {[
                    ["Name of Teacher", workspace.observation.targetName || "Teacher"],
                    ["Number of Years in the Service", workspace.observation.yearsInService],
                    ["Name of School", workspace.observation.schoolName],
                    ["Number of Years in Present School", workspace.observation.yearsInPresentSchool],
                    ["Name of Circuit", workspace.observation.circuitName],
                    ["Subject Being Observed", workspace.observation.subjectBeingObserved],
                    ["Date Observed", workspace.observation.dateObserved],
                    ["Sub-strand", workspace.observation.subStrand],
                    ["Class Taught", workspace.observation.classTaught],
                    ["Duration of Lesson", workspace.observation.durationMinutes == null ? null : `${workspace.observation.durationMinutes} minutes`],
                  ].map(([label, value], index) => (
                    <div key={`${String(label)}:${index}`} className="contents">
                      <div className="border-b border-r border-slate-300 bg-slate-100 px-4 py-3 text-xs font-black uppercase">
                        {label}
                      </div>
                      <div className="border-b border-r border-slate-300 px-4 py-3 font-semibold">
                        {value == null || value === "" ? "Not provided" : String(value)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-b-2 border-slate-900 bg-cyan-50 px-6 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-900">
                    Class Enrollment Data
                  </p>
                  {workspace.observation.contextSchemaVersion === 2 ? (
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      {[
                        ["Total enrolment", workspace.observation.totalEnrolment],
                        ["Girls", workspace.observation.girls],
                        ["Boys", workspace.observation.boys],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="border border-cyan-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-black uppercase text-cyan-900">{label}</p>
                          <p className="mt-1 text-base font-black text-slate-950">{String(value ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Legacy v1 draft — enrolment breakdown was not captured in this immutable version.
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
                  {["N/A", "1", "2", "3", "4", "5", "Final score"].map((label) => (
                    <div key={label} className="border-r border-slate-300 px-2 py-4 last:border-r-0">
                      {label}
                    </div>
                  ))}
                </div>

                {workspace.sections.map((section) => {
                  const sectionScore = liveSectionScores.get(section.sectionKey);
                  return (
                    <div key={`native:${section.sectionKey}`}>
                      <div className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] bg-[#304C6E] text-sm font-black text-white">
                        <div className="border-r border-white/20 px-3 py-3 text-center">
                          {section.order}.0
                        </div>
                        <div className="col-span-8 px-4 py-3 uppercase">{section.title}</div>
                      </div>

                      {section.items.map((item) => {
                        const answer = answers[answerKey(section.sectionKey, item.itemKey)];
                        return (
                          <div
                            key={`native:${section.sectionKey}:${item.itemKey}`}
                            className="grid grid-cols-[68px_1fr_62px_repeat(5,62px)_78px] border-b border-slate-300 text-sm"
                          >
                            <div className="border-r border-slate-300 px-3 py-3 text-center font-bold">{item.itemKey}</div>
                            <div className="border-r border-slate-300 px-4 py-3 font-medium">{item.label}</div>
                            {[null, 1, 2, 3, 4, 5].map((score) => {
                              const selected =
                                score == null
                                  ? answer?.notApplicable === true
                                  : answer?.notApplicable !== true && answer?.score === score;
                              return (
                                <div
                                  key={`${item.itemKey}:${score ?? "NA"}`}
                                  className={cx(
                                    "border-r border-slate-300 px-2 py-3 text-center text-xl font-black",
                                    selected
                                      ? nativeScoreTone(answer?.score, answer?.notApplicable === true)
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
                                nativeScoreTone(answer?.score, answer?.notApplicable === true),
                              )}
                            >
                              {answer?.notApplicable ? "N/A" : answer?.score ?? "—"}
                            </div>
                          </div>
                        );
                      })}

                      <div className="grid grid-cols-[1fr_260px] border-b-2 border-slate-900 bg-slate-50 text-sm">
                        <div className="px-4 py-3 text-right font-black uppercase">Section {section.order} total</div>
                        <div className="grid grid-cols-2">
                          <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                            {sectionScore?.rawScore ?? 0}/{sectionScore?.applicableMaximum ?? section.maxScore}
                          </div>
                          <div className="border-l border-slate-300 px-4 py-3 text-center font-black">
                            {formatPercent(sectionScore?.percentage)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="border-t-2 border-slate-900 bg-slate-50 px-6 py-5">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">General Comments</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                    {normalizeComment(generalComment) || "No General Comment entered."}
                  </p>
                </div>

                <footer className="grid grid-cols-[1fr_320px] border-t-2 border-slate-900 bg-cyan-50">
                  <div className="px-6 py-5 text-right text-base font-black uppercase">Overall Teacher appraisal result</div>
                  <div className="border-l-2 border-slate-900 px-6 py-5 text-center text-2xl font-black text-cyan-900">
                    {formatPercent(
                      workspace.assessment.status === "FINALIZED"
                        ? workspace.assessment.overallPercentage
                        : completedOverallPercentage,
                    )}
                  </div>
                </footer>
              </div>
            </div>

            {editable ? (
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
                    pendingSectionSavesRef.current.size > 0 ||
                    pendingCommentSaveRef.current !== null
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
