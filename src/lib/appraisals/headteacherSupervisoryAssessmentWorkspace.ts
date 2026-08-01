// src/lib/appraisals/headteacherSupervisoryAssessmentWorkspace.ts
import { prisma } from "@/lib/prisma";
import {
  loadHeadteacherSupervisoryAssessment,
  type HeadteacherSupervisoryAssessmentView,
  type HeadteacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentScoring";
import {
  readHeadteacherSupervisoryAssessorState,
  type HeadteacherSupervisoryAssessorReadState,
  type HeadteacherSupervisoryRevisionDatabase,
} from "@/lib/appraisals/headteacherSupervisoryAssessmentRevision";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
  type HeadteacherSupervisoryVisitDetailsSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";

export const HEADTEACHER_SUPERVISORY_WORKSPACE_POLICY = {
  schemaVersion: 2,
  audience: "ORIGINAL_GOVERNANCE_ASSESSOR",
  interaction: "RESPONSIVE_SECTION_CARDS",
  saveMode: "SERIALIZED_AUTOSAVE",
  pollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  commentsAllowed: false,
  scoreValuesVisibleToAssessor: true,
  officialVisitDetailsVisible: true,
  legacyVisitContextReadable: true,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  reviewerIdentityIncluded: false,
  providerCallsAllowed: false,
  databaseWritesAllowed: false,
} as const;

export type HeadteacherSupervisoryWorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

export type HeadteacherSupervisoryWorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: HeadteacherSupervisoryWorkspaceItem[];
};

export type HeadteacherSupervisoryWorkspaceVisit = {
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

export type HeadteacherSupervisoryWorkspace = {
  policy: typeof HEADTEACHER_SUPERVISORY_WORKSPACE_POLICY;
  assessment: HeadteacherSupervisoryAssessmentView;
  lifecycle: HeadteacherSupervisoryAssessorReadState;
  visit: HeadteacherSupervisoryWorkspaceVisit;
  sections: HeadteacherSupervisoryWorkspaceSection[];
  privacy: {
    staffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
    reviewerIdentityIncluded: false;
    contactDetailsIncluded: false;
  };
};

export type LoadHeadteacherSupervisoryWorkspaceInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  workspaceDatabase?: HeadteacherSupervisoryWorkspaceDatabase;
  scoringDatabase?: HeadteacherSupervisoryScoringDatabase;
  revisionDatabase?: Pick<
    HeadteacherSupervisoryRevisionDatabase,
    "appraisalAssessment"
  >;
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

export type HeadteacherSupervisoryWorkspaceRecord = {
  id: string;
  cycleId: string;
  assessorUserId: string;
  status: string;
  revision: number;
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

export type HeadteacherSupervisoryWorkspaceDatabase = {
  appraisalAssessment: {
    findUnique(
      args: unknown,
    ): Promise<HeadteacherSupervisoryWorkspaceRecord | null>;
  };
};

type VisitContext = {
  schemaVersion?: unknown;
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
    visitDetails?: unknown;
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requireIdentifier(value: unknown, fieldName: string) {
  const identifier = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(identifier)) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return identifier;
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

function visitContext(value: unknown): VisitContext {
  return objectValue(value) as VisitContext;
}

function contextSchemaVersion(value: unknown): 1 | 2 {
  const version = Number(value);

  if (version === 1 || version === 2) {
    return version;
  }

  fail("HEADTEACHER_SUPERVISORY_WORKSPACE_CONTEXT_SCHEMA_UNSUPPORTED", 409, {
    fieldName: "evidenceSnapshotJson.schemaVersion",
  });
}

function buildWorkspaceVisit(input: {
  evidenceSnapshotJson: unknown;
  assessmentDateObserved: string;
}): HeadteacherSupervisoryWorkspaceVisit {
  const context = visitContext(input.evidenceSnapshotJson);
  const schemaVersion = contextSchemaVersion(context.schemaVersion);
  const targetName = clean(context.target?.name) || null;
  const schoolName = clean(context.target?.schoolName);
  const circuitName = clean(context.jurisdiction?.circuitName);
  const districtName = clean(context.jurisdiction?.districtName);
  const dateObserved = clean(context.observation?.dateObserved);
  const assessorRole = clean(context.assessor?.role);

  if (
    !schoolName ||
    !circuitName ||
    !districtName ||
    !dateObserved ||
    !assessorRole
  ) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_VISIT_CONTEXT_INVALID", 409);
  }

  if (dateObserved !== input.assessmentDateObserved) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_OBSERVATION_DATE_DRIFT", 409, {
      fieldName: "dateObserved",
    });
  }

  const visitDetails = visitDetailsFromEvidenceSnapshot(
    input.evidenceSnapshotJson,
  );

  if (
    schemaVersion ===
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion &&
    !visitDetails
  ) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_VISIT_DETAILS_MISSING", 409);
  }

  return {
    contextSchemaVersion: schemaVersion,
    officialDetailsAvailable: visitDetails !== null,
    targetName,
    schoolName,
    circuitName,
    districtName,
    dateObserved,
    assessorRole,
    arrivalTime: visitDetails?.arrivalTime ?? null,
    staffStrength: visitDetails?.staffStrength ?? null,
    totalEnrolment: visitDetails?.totalEnrolment ?? null,
    girls: visitDetails?.girls ?? null,
    boys: visitDetails?.boys ?? null,
    teachersPresentAtVisit:
      visitDetails?.teachersPresentAtVisit ?? null,
  };
}

const workspaceSelect = {
  id: true,
  cycleId: true,
  assessorUserId: true,
  status: true,
  revision: true,
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

export function buildHeadteacherSupervisoryWorkspace(args: {
  record: HeadteacherSupervisoryWorkspaceRecord;
  assessment: HeadteacherSupervisoryAssessmentView;
  lifecycle: HeadteacherSupervisoryAssessorReadState;
}): HeadteacherSupervisoryWorkspace {
  const { record, assessment, lifecycle } = args;

  if (
    record.id !== assessment.assessmentId ||
    record.id !== lifecycle.assessmentId ||
    record.cycleId !== assessment.cycleId ||
    record.cycleId !== lifecycle.cycleId ||
    record.revision !== assessment.revision ||
    record.revision !== lifecycle.revision ||
    clean(record.status).toUpperCase() !==
      clean(assessment.status).toUpperCase() ||
    clean(record.status).toUpperCase() !==
      clean(lifecycle.status).toUpperCase() ||
    record.assessorUserId !== assessment.assessorUserId ||
    !clean(record.instrumentVersion.id)
  ) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_SOURCE_DRIFT", 409);
  }

  if (
    record.instrumentVersion.version !== assessment.instrumentVersion ||
    record.instrumentVersion.instrument.code !== assessment.instrumentCode
  ) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_INSTRUMENT_DRIFT", 409);
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
            fail(
              "HEADTEACHER_SUPERVISORY_WORKSPACE_DUPLICATE_ITEM",
              409,
              {
                itemKey: item.key,
              },
            );
          }

          seenItemKeys.add(item.key);
          itemCount += 1;

          const saved = scoreByItemId.get(item.id);
          if (saved && saved.itemKey !== item.key) {
            fail("HEADTEACHER_SUPERVISORY_WORKSPACE_SCORE_DRIFT", 409, {
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
              saved?.notApplicable === true ||
              Number.isInteger(saved?.score),
          };
        }),
    }));

  if (sections.length !== 4 || itemCount !== 34) {
    fail(
      "HEADTEACHER_SUPERVISORY_WORKSPACE_FORM_STRUCTURE_DRIFT",
      409,
      {
        sectionCount: sections.length,
        itemCount,
      },
    );
  }

  const visit = buildWorkspaceVisit({
    evidenceSnapshotJson: record.evidenceSnapshotJson,
    assessmentDateObserved: assessment.dateObserved,
  });

  return {
    policy: HEADTEACHER_SUPERVISORY_WORKSPACE_POLICY,
    assessment,
    lifecycle,
    visit,
    sections,
    privacy: {
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      reviewerIdentityIncluded: false,
      contactDetailsIncluded: false,
    },
  };
}

export async function loadHeadteacherSupervisoryAssessmentWorkspace(
  input: LoadHeadteacherSupervisoryWorkspaceInput,
): Promise<HeadteacherSupervisoryWorkspace> {
  const actorUserId = requireIdentifier(
    input.actorUserId,
    "actorUserId",
  );
  const assessmentId = requireIdentifier(
    input.assessmentId,
    "assessmentId",
  );
  const workspaceDatabase =
    input.workspaceDatabase ??
    (prisma as unknown as HeadteacherSupervisoryWorkspaceDatabase);

  const assessment = await loadHeadteacherSupervisoryAssessment({
    actorUserId,
    actorRoleName: input.actorRoleName,
    assessmentId,
    database:
      input.scoringDatabase ??
      (prisma as unknown as HeadteacherSupervisoryScoringDatabase),
  });

  const lifecycle = await readHeadteacherSupervisoryAssessorState({
    actorUserId,
    assessmentId,
    database:
      input.revisionDatabase ??
      (prisma as unknown as Pick<
        HeadteacherSupervisoryRevisionDatabase,
        "appraisalAssessment"
      >),
  });

  const record = await workspaceDatabase.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: workspaceSelect,
  });

  if (!record) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_NOT_FOUND", 404);
  }

  if (record.assessorUserId !== actorUserId) {
    fail("HEADTEACHER_SUPERVISORY_WORKSPACE_ASSESSOR_ONLY", 403);
  }

  return buildHeadteacherSupervisoryWorkspace({
    record,
    assessment,
    lifecycle,
  });
}
