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
  noBackgroundPolling: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
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
  return actorRole === "SISSO" ? "/circuit/dashboard" : "/district/dashboard";
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
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedCircuitId, setSelectedCircuitId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [showSavedRecords, setShowSavedRecords] = useState(false);
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
      setQueue(body.queue);
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

  const loadWorkspace = useCallback(
    async (
      id: string,
      preservePosition?: { sectionIndex: number; itemIndex: number },
    ) => {
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
    [],
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

  const queueSchools = useMemo(() => {
    if (!queue || !selectedCircuitId) return [];
    const schools = new Map<
      string,
      {
        schoolId: string;
        schoolName: string;
        headteacherName: string;
        appraisalCount: number;
      }
    >();

    for (const item of queue.items) {
      if (item.circuitId !== selectedCircuitId) continue;
      const current = schools.get(item.schoolId) ?? {
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        headteacherName: item.targetName || "Headteacher",
        appraisalCount: 0,
      };
      current.appraisalCount += 1;
      schools.set(item.schoolId, current);
    }

    return [...schools.values()].sort((left, right) =>
      left.schoolName.localeCompare(right.schoolName),
    );
  }, [queue, selectedCircuitId]);

  const selectedQueueItems = useMemo(() => {
    if (!queue) return [];
    return queue.items.filter(
      (item) =>
        (!selectedCircuitId || item.circuitId === selectedCircuitId) &&
        (!selectedSchoolId || item.schoolId === selectedSchoolId),
    );
  }, [queue, selectedCircuitId, selectedSchoolId]);

  const selectedQueueItem = selectedQueueItems[0] ?? null;
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
    }
  }, [queue, selectedCircuitId]);

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
      setNotice("Assessment submitted and locked for review.");
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

  async function createRevision() {
    if (!workspace || !assessmentId || !workspace.lifecycle.canCreateRevision) {
      return;
    }
    const confirmed = window.confirm(
      "Create a correction copy? The returned version will remain preserved as history.",
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
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
      setNotice("Correction copy created. Review and resubmit it.");
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
    const selectedCircuit = queue?.circuits.find(
      (circuit) => circuit.circuitId === selectedCircuitId,
    );
    const savedItems = queue?.items.filter(
      (item) => item.supervisory.assessmentId != null,
    ) ?? [];

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

          <section className="grid grid-cols-4 gap-1.5 md:gap-4">
            {[
              ["Circuits", queue?.summary.circuits ?? 0],
              ["Schools", queue?.summary.schools ?? 0],
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
                  Selecting a school automatically selects the Headteacher in the approved appraisal cycle.
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
                      {selectedQueueItem?.schoolName || selectedCircuit?.circuitName || "Choose a school"}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {selectedQueueItem
                        ? `${selectedQueueItem.targetName || "Headteacher"} · ${selectedQueueItem.circuitName}`
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

              {selectedQueueItems.length === 0 ? (
                <section className="rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                  <h3 className="text-lg font-semibold text-white">No school selected</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Choose a circuit and school to open the Headteacher appraisal record.
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
                              ? "border-fuchsia-300/40 bg-fuchsia-400/20 text-fuchsia-50"
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
                          ? "border-amber-300/40 bg-amber-400/20 text-amber-50"
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
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">Complete the official 4-section, 34-indicator form. Answers autosave securely as you score.</p>
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
                  <p className="mt-1 text-sm leading-6 text-slate-300">Submitted scores are locked and sent to the Director’s review queue. The Director cannot rewrite them.</p>
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

              {workspace.lifecycle.canCreateRevision ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createRevision()}
                  className="mt-5 min-h-14 w-full rounded-2xl border border-amber-300/25 bg-amber-400/15 px-5 text-base font-bold text-amber-50 hover:bg-amber-400/20 disabled:opacity-50"
                >
                  Create correction copy
                </button>
              ) : null}

              {!workspace.assessment.canFinalize && editable ? (
                <p className="mt-4 text-xs leading-5 text-slate-400">Answer every indicator or mark it N/A. Then review the completed assessment before final submission.</p>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-slate-400">Answers autosave securely. Offline changes retry while this page remains open.</p>
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
              className="min-h-12 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 py-3 text-sm font-bold text-fuchsia-50 disabled:opacity-40"
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
                <h2 className="mt-1 text-xl font-bold text-white">
                  Review Before you Submit
                </h2>
                <p className="mt-1 text-sm leading-6 text-emerald-50/90">
                  This is the complete native Monitoring and Inspection Sheet.
                  Scroll sideways on a small screen to inspect every score column.
                </p>
              </div>
              <button
                type="button"
                onClick={returnToAssessment}
                className="min-h-12 rounded-2xl border border-white/15 bg-black/20 px-5 text-sm font-bold text-white hover:bg-black/30"
              >
                Return to assessment
              </button>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
