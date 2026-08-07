// src/lib/appraisals/teacherSupervisoryAssessmentWorkspace.ts
import { prisma } from "@/lib/prisma";
import {
  loadTeacherSupervisoryAssessment,
  type TeacherSupervisoryAssessmentView,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  readTeacherSupervisoryObservationDetailsSnapshot,
  type TeacherSupervisoryObservationDetailsSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationDetails";
import { TEACHER_SUPERVISORY_ASSESSMENT_POLICY } from "@/lib/appraisals/teacherSupervisoryAssessment";

export const TEACHER_SUPERVISORY_WORKSPACE_POLICY = {
  schemaVersion: 1,
  audience: "ORIGINAL_GOVERNANCE_ASSESSOR",
  interaction: "RESPONSIVE_SECTION_CARDS",
  saveMode: "SERIALIZED_AUTOSAVE",
  pollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  commentsAllowed: true,
  scoreValuesVisibleToAssessor: true,
  officialObservationDetailsVisible: true,
  legacyTeacherAppraisalIncluded: false,
  confidentialStaffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  reviewerIdentityIncluded: false,
  reviewControlsIncluded: false,
  providerCallsAllowed: false,
  databaseWritesAllowed: false,
} as const;

export type TeacherSupervisoryWorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

export type TeacherSupervisoryWorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: TeacherSupervisoryWorkspaceItem[];
};

export type TeacherSupervisoryWorkspaceObservation = {
  contextSchemaVersion: 1;
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
};

export type TeacherSupervisoryWorkspaceLifecycle = {
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

export type TeacherSupervisoryWorkspace = {
  policy: typeof TEACHER_SUPERVISORY_WORKSPACE_POLICY;
  assessment: TeacherSupervisoryAssessmentView;
  lifecycle: TeacherSupervisoryWorkspaceLifecycle;
  observation: TeacherSupervisoryWorkspaceObservation;
  generalComment: string | null;
  sections: TeacherSupervisoryWorkspaceSection[];
  privacy: {
    legacyTeacherAppraisalIncluded: false;
    confidentialStaffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
    reviewerIdentityIncluded: false;
    contactDetailsIncluded: false;
  };
};

export type LoadTeacherSupervisoryWorkspaceInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  now?: Date;
  workspaceDatabase?: TeacherSupervisoryWorkspaceDatabase;
  scoringDatabase?: TeacherSupervisoryScoringDatabase;
};

type WorkspaceScoreRecord = {
  instrumentItemId: string;
  itemKey: string;
  score: number | null;
  notApplicable: boolean;
};

type WorkspaceItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
};

type WorkspaceSectionRecord = {
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: WorkspaceItemRecord[];
};

export type TeacherSupervisoryWorkspaceRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  status: string;
  revision: number;
  generalComment: string | null;
  evidenceSnapshotJson: unknown;
  scores: WorkspaceScoreRecord[];
  instrumentVersion: {
    id: string;
    version: number;
    instrument: {
      code: string;
    };
    sections: WorkspaceSectionRecord[];
  };
};

export type TeacherSupervisoryWorkspaceDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<TeacherSupervisoryWorkspaceRecord | null>;
  };
};

type ObservationContext = {
  schemaVersion?: unknown;
  workflow?: unknown;
  evidenceStream?: unknown;
  target?: {
    name?: unknown;
    schoolName?: unknown;
  };
  assessor?: {
    role?: unknown;
  };
  jurisdiction?: {
    circuitName?: unknown;
    districtName?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
    details?: unknown;
  };
};

const workspaceSelect = {
  id: true,
  cycleId: true,
  assessorUserId: true,
  status: true,
  revision: true,
  generalComment: true,
  evidenceSnapshotJson: true,
  scores: {
    select: {
      instrumentItemId: true,
      itemKey: true,
      score: true,
      notApplicable: true,
    },
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
  },
  instrumentVersion: {
    select: {
      id: true,
      version: true,
      instrument: {
        select: {
          code: true,
        },
      },
      sections: {
        select: {
          key: true,
          title: true,
          description: true,
          order: true,
          maxScore: true,
          items: {
            select: {
              id: true,
              key: true,
              label: true,
              order: true,
              maxScore: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  },
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function requireIdentifier(value: unknown, fieldName: string) {
  const identifier = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(identifier)) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return identifier;
}

function context(value: unknown) {
  return objectValue(value) as ObservationContext;
}

function buildWorkspaceObservation(input: {
  evidenceSnapshotJson: unknown;
  assessmentDateObserved: string;
}): TeacherSupervisoryWorkspaceObservation {
  const snapshot = context(input.evidenceSnapshotJson);
  const schemaVersion = Number(snapshot.schemaVersion);
  const targetName = clean(snapshot.target?.name) || null;
  const schoolName = clean(snapshot.target?.schoolName);
  const circuitName = clean(snapshot.jurisdiction?.circuitName);
  const districtName = clean(snapshot.jurisdiction?.districtName);
  const assessorRole = clean(snapshot.assessor?.role);
  const dateObserved = clean(snapshot.observation?.dateObserved);

  if (
    schemaVersion !== 1 ||
    clean(snapshot.workflow) !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(snapshot.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    !schoolName ||
    !circuitName ||
    !districtName ||
    !assessorRole ||
    !dateObserved
  ) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_OBSERVATION_CONTEXT_INVALID", 409);
  }

  if (dateObserved !== input.assessmentDateObserved) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_OBSERVATION_DATE_DRIFT", 409, {
      fieldName: "dateObserved",
    });
  }

  const details: TeacherSupervisoryObservationDetailsSnapshot | null =
    readTeacherSupervisoryObservationDetailsSnapshot(
      snapshot.observation?.details,
    );

  if (!details || details.dateObserved !== dateObserved) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_OBSERVATION_DETAILS_INVALID", 409);
  }

  return {
    contextSchemaVersion: 1,
    targetName,
    schoolName,
    circuitName,
    districtName,
    assessorRole,
    dateObserved,
    yearsInService: details.yearsInService,
    yearsInPresentSchool: details.yearsInPresentSchool,
    subjectBeingObserved: details.subjectBeingObserved,
    subStrand: details.subStrand,
    classTaught: details.classTaught,
    durationMinutes: details.durationMinutes,
  };
}

export function buildTeacherSupervisoryWorkspace(args: {
  record: TeacherSupervisoryWorkspaceRecord;
  assessment: TeacherSupervisoryAssessmentView;
}): TeacherSupervisoryWorkspace {
  const { record, assessment } = args;

  if (
    record.id !== assessment.assessmentId ||
    record.cycleId !== assessment.cycleId ||
    record.revision !== assessment.revision ||
    clean(record.status).toUpperCase() !== clean(assessment.status).toUpperCase() ||
    record.assessorUserId !== assessment.assessorUserId ||
    !clean(record.instrumentVersion.id)
  ) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_SOURCE_DRIFT", 409);
  }

  if (
    record.instrumentVersion.version !== assessment.instrumentVersion ||
    record.instrumentVersion.instrument.code !== assessment.instrumentCode ||
    record.instrumentVersion.instrument.code !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode
  ) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_INSTRUMENT_DRIFT", 409);
  }

  if (record.generalComment !== assessment.generalComment) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_COMMENT_DRIFT", 409);
  }

  const scoreByItemId = new Map(
    record.scores.map((score) => [score.instrumentItemId, score]),
  );
  const seenItemKeys = new Set<string>();
  let itemCount = 0;

  const sections = [...record.instrumentVersion.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      sectionKey: section.key,
      title: section.title,
      description: section.description,
      order: section.order,
      maxScore: section.maxScore,
      items: [...section.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => {
          if (seenItemKeys.has(item.key)) {
            fail("TEACHER_SUPERVISORY_WORKSPACE_DUPLICATE_ITEM", 409, {
              itemKey: item.key,
            });
          }

          seenItemKeys.add(item.key);
          itemCount += 1;

          const saved = scoreByItemId.get(item.id);
          if (saved && saved.itemKey !== item.key) {
            fail("TEACHER_SUPERVISORY_WORKSPACE_SCORE_DRIFT", 409, {
              itemKey: item.key,
            });
          }

          return {
            itemKey: item.key,
            label: item.label,
            order: item.order,
            maxScore: item.maxScore,
            score: saved?.score ?? null,
            notApplicable: saved?.notApplicable === true,
            answered:
              saved?.notApplicable === true || Number.isInteger(saved?.score),
          };
        }),
    }));

  if (
    sections.length !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionCount ||
    itemCount !== TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount ||
    JSON.stringify(sections.map((section) => section.maxScore)) !==
      JSON.stringify(
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionMaximums,
      )
  ) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_FORM_STRUCTURE_DRIFT", 409, {
      sectionCount: sections.length,
      itemCount,
      sectionMaximums: sections.map((section) => section.maxScore),
    });
  }

  const observation = buildWorkspaceObservation({
    evidenceSnapshotJson: record.evidenceSnapshotJson,
    assessmentDateObserved: assessment.dateObserved,
  });

  return {
    policy: TEACHER_SUPERVISORY_WORKSPACE_POLICY,
    assessment,
    lifecycle: {
      assessmentId: assessment.assessmentId,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      status: assessment.status,
      originalAssessorOnly: true,
      canEdit: assessment.canEdit,
      canFinalize: assessment.canFinalize,
      returnedAssessmentRequiresRevision: true,
      reviewControlsIncluded: false,
    },
    observation,
    generalComment: assessment.generalComment,
    sections,
    privacy: {
      legacyTeacherAppraisalIncluded: false,
      confidentialStaffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      reviewerIdentityIncluded: false,
      contactDetailsIncluded: false,
    },
  };
}

export async function loadTeacherSupervisoryAssessmentWorkspace(
  input: LoadTeacherSupervisoryWorkspaceInput,
): Promise<TeacherSupervisoryWorkspace> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const workspaceDatabase =
    input.workspaceDatabase ??
    (prisma as unknown as TeacherSupervisoryWorkspaceDatabase);

  const assessment = await loadTeacherSupervisoryAssessment({
    actorUserId,
    actorRoleName: input.actorRoleName,
    assessmentId,
    now: input.now,
    database:
      input.scoringDatabase ??
      (prisma as unknown as TeacherSupervisoryScoringDatabase),
  });

  const record = await workspaceDatabase.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: workspaceSelect,
  });

  if (!record) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_NOT_FOUND", 404);
  }

  if (record.assessorUserId !== actorUserId) {
    fail("TEACHER_SUPERVISORY_WORKSPACE_ASSESSOR_ONLY", 403);
  }

  return buildTeacherSupervisoryWorkspace({
    record,
    assessment,
  });
}
