//src/lib/appraisals/directorFeedbackResponse.ts
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";

export const DIRECTOR_FEEDBACK_RESPONSE_POLICY = {
  saveUnit: "SECTION",
  commentsAllowed: false,
  finalizedResponsesAreImmutable: true,
  repeatedIdenticalSectionSaveCreatesNoDuplicateAudit: true,
  responseTransactionMaxWaitMs: 5_000,
  responseTransactionTimeoutMs: 15_000,
} as const;

export type DirectorFeedbackResponseMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type DirectorFeedbackScoreInput = {
  itemKey: string;
  score?: number | null;
  notApplicable?: boolean | null;
};

export type SaveDirectorFeedbackSectionInput =
  DirectorFeedbackResponseMeta & {
    actorUserId: string;
    cycleId: string;
    sectionKey: string;
    scores: readonly DirectorFeedbackScoreInput[];
    now?: Date;
    database?: DirectorFeedbackResponseDatabase;
  };

export type FinalizeDirectorFeedbackResponseInput =
  DirectorFeedbackResponseMeta & {
    actorUserId: string;
    cycleId: string;
    now?: Date;
    database?: DirectorFeedbackResponseDatabase;
  };

export type LoadDirectorFeedbackResponseInput = {
  actorUserId: string;
  cycleId: string;
  now?: Date;
  database?: DirectorFeedbackResponseDatabase;
};

export type ListDirectorFeedbackAssignmentsInput = {
  actorUserId: string;
  now?: Date;
  database?: DirectorFeedbackResponseDatabase;
};

export type DirectorFeedbackSectionProgress = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  totalItems: number;
  answeredItems: number;
  complete: boolean;
};

export type DirectorFeedbackResponseProgress = {
  totalSections: number;
  completedSections: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  completionPercentage: number;
  missingItemKeys: string[];
  sections: DirectorFeedbackSectionProgress[];
};

export type DirectorFeedbackOfficialFormItem = {
  instrumentItemId: string;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  isRequired: boolean;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

export type DirectorFeedbackOfficialFormSection = {
  sectionKey: string;
  sectionTitle: string;
  description: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  items: DirectorFeedbackOfficialFormItem[];
};

export type DirectorFeedbackOfficialForm = {
  documentTitle: string;
  jurisdictionName: string;
  directorName: string | null;
  instructions: string | null;
  scale: {
    minimum: number;
    maximum: number;
    allowNotApplicable: boolean;
  };
  sections: DirectorFeedbackOfficialFormSection[];
  overallPercentage: number | null;
};

export type DirectorFeedbackResponseView = {
  cycleId: string;
  participantId: string;
  responseId: string | null;
  cycleStatus: string;
  participantStatus: string;
  responseStatus: "NOT_STARTED" | "DRAFT" | "FINALIZED";
  openedAt: string | null;
  deadlineAt: string | null;
  canEdit: boolean;
  canFinalize: boolean;
  confidentiality: {
    directorCanSeeIdentity: false;
    schoolIdentityShownToDirector: false;
    freeTextCommentsAllowed: false;
    identityAccessRole: "SUPERADMIN";
  };
  progress: DirectorFeedbackResponseProgress;
  officialForm: DirectorFeedbackOfficialForm;
};

export type DirectorFeedbackAssignmentSummary = {
  cycleId: string;
  cycleStatus: string;
  participantStatus: string;
  responseStatus: "NOT_STARTED" | "DRAFT" | "FINALIZED";
  directorName: string | null;
  jurisdictionName: string;
  openedAt: string | null;
  deadlineAt: string | null;
  canContinue: boolean;
  completionPercentage: number;
};

export type SaveDirectorFeedbackSectionResult = {
  outcome: "SAVED" | "UNCHANGED";
  responseId: string;
  sectionKey: string;
  savedItems: number;
  participantStatus: "IN_PROGRESS" | "FINALIZED";
  progress: DirectorFeedbackResponseProgress;
};

export type FinalizeDirectorFeedbackResponseResult = {
  outcome: "FINALIZED" | "EXISTING_FINALIZED";
  responseId: string;
  finalizedAt: string;
  responseHash: string;
  overallPercentage: number | null;
  sectionPercentages: Record<string, number | null>;
  progress: DirectorFeedbackResponseProgress;
};

type InstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
  isRequired: boolean;
};

type InstrumentSectionRecord = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: InstrumentItemRecord[];
};

type ResponseScoreRecord = {
  id: string;
  responseId: string;
  instrumentItemId: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  score: number | null;
  notApplicable: boolean;
};

type ResponseRecord = {
  id: string;
  cycleId: string;
  participantId: string;
  instrumentVersionId: string;
  status: "DRAFT" | "FINALIZED";
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  responseHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  scores: ResponseScoreRecord[];
};

type ParticipantContextRecord = {
  id: string;
  cycleId: string;
  respondentUserId: string;
  respondentTenantId: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINALIZED" | "EXPIRED" | "REVOKED";
  startedAt: Date | null;
  finalizedAt: Date | null;
  eligibilitySnapshotJson: unknown;
  cycle: {
    id: string;
    status: string;
    openedAt: Date | null;
    deadlineAt: Date | null;
    targetUserId: string;
    targetNameSnapshot: string | null;
    targetZoneNameSnapshot: string | null;
    instrumentVersionId: string;
    metadata: unknown;
    instrumentVersion: {
      id: string;
      status: string;
      title: string;
      directorateName: string | null;
      instructions: string | null;
      scaleMin: number;
      scaleMax: number;
      allowNotApplicable: boolean;
      allowComments: boolean;
      instrument: {
        code: string;
        isActive: boolean;
      };
      sections: InstrumentSectionRecord[];
    };
  };
  response: ResponseRecord | null;
};

type ParticipantMutationRecord = {
  id: string;
  status: string;
  startedAt: Date | null;
  finalizedAt: Date | null;
};

type ResponseMutationRecord = {
  id: string;
  status: "DRAFT" | "FINALIZED";
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  responseHash: string | null;
  finalizedAt: Date | null;
};

type ResponseTransactionClient = {
  appraisalParticipant: {
    findFirst(args: unknown): Promise<ParticipantContextRecord | null>;
    update(args: unknown): Promise<ParticipantMutationRecord>;
  };
  appraisalResponse: {
    findUnique(args: unknown): Promise<ResponseRecord | null>;
    create(args: unknown): Promise<ResponseRecord>;
    update(args: unknown): Promise<ResponseMutationRecord>;
  };
  appraisalResponseScore: {
    upsert(args: unknown): Promise<ResponseScoreRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type DirectorFeedbackResponseDatabase = {
  appraisalParticipant: {
    findMany(args: unknown): Promise<ParticipantContextRecord[]>;
    findFirst(args: unknown): Promise<ParticipantContextRecord | null>;
    update(args: unknown): Promise<ParticipantMutationRecord>;
  };
  appraisalResponse: ResponseTransactionClient["appraisalResponse"];
  appraisalResponseScore: ResponseTransactionClient["appraisalResponseScore"];
  auditLog: ResponseTransactionClient["auditLog"];
  $transaction<T>(
    operation: (tx: ResponseTransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: string },
  ): Promise<T>;
};

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(value)) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_INVALID_IDENTIFIER", 400, { fieldName });
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function participantContextSelect() {
  return {
    id: true,
    cycleId: true,
    respondentUserId: true,
    respondentTenantId: true,
    status: true,
    startedAt: true,
    finalizedAt: true,
    eligibilitySnapshotJson: true,
    cycle: {
      select: {
        id: true,
        status: true,
        openedAt: true,
        deadlineAt: true,
        targetUserId: true,
        targetNameSnapshot: true,
        targetZoneNameSnapshot: true,
        instrumentVersionId: true,
        metadata: true,
        instrumentVersion: {
          select: {
            id: true,
            status: true,
            title: true,
            directorateName: true,
            instructions: true,
            scaleMin: true,
            scaleMax: true,
            allowNotApplicable: true,
            allowComments: true,
            instrument: {
              select: {
                code: true,
                isActive: true,
              },
            },
            sections: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                key: true,
                title: true,
                description: true,
                order: true,
                maxScore: true,
                items: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    key: true,
                    label: true,
                    order: true,
                    maxScore: true,
                    isRequired: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    response: {
      select: {
        id: true,
        cycleId: true,
        participantId: true,
        instrumentVersionId: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        responseHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        scores: {
          orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
          select: {
            id: true,
            responseId: true,
            instrumentItemId: true,
            sectionKey: true,
            sectionTitle: true,
            sectionOrder: true,
            sectionMaxScore: true,
            itemKey: true,
            itemLabel: true,
            itemOrder: true,
            itemMaxScore: true,
            score: true,
            notApplicable: true,
          },
        },
      },
    },
  };
}

async function findParticipantContext(
  database: Pick<DirectorFeedbackResponseDatabase, "appraisalParticipant">,
  actorUserId: string,
  cycleId: string,
) {
  const participant = await database.appraisalParticipant.findFirst({
    where: {
      cycleId,
      respondentUserId: actorUserId,
    },
    select: participantContextSelect(),
  });

  if (!participant) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND", 404, {
      cycleId,
    });
  }

  assertParticipantContract(participant);
  return participant;
}

function assertParticipantContract(participant: ParticipantContextRecord) {
  if (participant.cycle.instrumentVersion.id !== participant.cycle.instrumentVersionId) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_VERSION_LINK_INVALID", 409);
  }

  if (
    participant.cycle.instrumentVersion.instrument.code !==
      DIRECTOR_FEEDBACK_POLICY.instrumentCode ||
    participant.cycle.instrumentVersion.status !== "ACTIVE" ||
    participant.cycle.instrumentVersion.instrument.isActive !== true
  ) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_INSTRUMENT_NOT_ACTIVE", 409);
  }

  if (participant.cycle.instrumentVersion.allowComments) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_COMMENTS_MUST_BE_DISABLED", 409);
  }

  if (participant.cycle.targetUserId === participant.respondentUserId) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_SELF_FEEDBACK_FORBIDDEN", 403);
  }

  const eligibility = objectValue(participant.eligibilitySnapshotJson);
  if (clean(eligibility.selectionBasis) !== "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN") {
    fail("DIRECTOR_FEEDBACK_RESPONSE_ELIGIBILITY_SNAPSHOT_INVALID", 409);
  }
}

function responseStatus(participant: ParticipantContextRecord) {
  return participant.response?.status ?? "NOT_STARTED";
}

function deadlineOpen(participant: ParticipantContextRecord, now: Date) {
  const deadline = participant.cycle.deadlineAt;
  return (
    participant.cycle.status === "OPEN" &&
    (!deadline || now.getTime() <= deadline.getTime())
  );
}

function assertEditable(participant: ParticipantContextRecord, now: Date) {
  if (participant.status === "REVOKED") {
    fail("DIRECTOR_FEEDBACK_RESPONSE_PARTICIPATION_REVOKED", 403);
  }
  if (participant.status === "EXPIRED") {
    fail("DIRECTOR_FEEDBACK_RESPONSE_PARTICIPATION_EXPIRED", 409);
  }
  if (participant.status === "FINALIZED" || participant.response?.status === "FINALIZED") {
    fail("DIRECTOR_FEEDBACK_RESPONSE_ALREADY_FINALIZED", 409);
  }
  if (!deadlineOpen(participant, now)) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_WINDOW_CLOSED", 409, {
      cycleStatus: participant.cycle.status,
      deadlineAt: participant.cycle.deadlineAt?.toISOString() ?? null,
    });
  }
}

function scoreMap(response: ResponseRecord | null) {
  return new Map(
    (response?.scores ?? []).map((score) => [score.instrumentItemId, score]),
  );
}

function sectionPercentageMap(response: ResponseRecord | null) {
  const raw = objectValue(response?.sectionPercentagesJson);
  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return out;
}

function buildProgress(participant: ParticipantContextRecord): DirectorFeedbackResponseProgress {
  const scores = scoreMap(participant.response);
  const sections: DirectorFeedbackSectionProgress[] = [];
  const missingItemKeys: string[] = [];
  let answeredItems = 0;
  let notApplicableItems = 0;
  let totalItems = 0;

  for (const section of participant.cycle.instrumentVersion.sections) {
    let sectionAnswered = 0;
    for (const item of section.items) {
      totalItems += 1;
      const saved = scores.get(item.id);
      const answered = Boolean(saved && (saved.notApplicable || saved.score != null));
      if (answered) {
        answeredItems += 1;
        sectionAnswered += 1;
        if (saved?.notApplicable) notApplicableItems += 1;
      } else if (item.isRequired) {
        missingItemKeys.push(item.key);
      }
    }

    sections.push({
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      totalItems: section.items.length,
      answeredItems: sectionAnswered,
      complete: sectionAnswered === section.items.length,
    });
  }

  return {
    totalSections: sections.length,
    completedSections: sections.filter((section) => section.complete).length,
    totalItems,
    answeredItems,
    notApplicableItems,
    completionPercentage: totalItems > 0 ? round2((answeredItems / totalItems) * 100) : 0,
    missingItemKeys,
    sections,
  };
}

function buildOfficialForm(
  participant: ParticipantContextRecord,
): DirectorFeedbackOfficialForm {
  const scores = scoreMap(participant.response);
  const percentages = sectionPercentageMap(participant.response);

  return {
    documentTitle: participant.cycle.instrumentVersion.title,
    jurisdictionName:
      participant.cycle.targetZoneNameSnapshot ?? "District jurisdiction",
    directorName: participant.cycle.targetNameSnapshot,
    instructions: participant.cycle.instrumentVersion.instructions,
    scale: {
      minimum: participant.cycle.instrumentVersion.scaleMin,
      maximum: participant.cycle.instrumentVersion.scaleMax,
      allowNotApplicable:
        participant.cycle.instrumentVersion.allowNotApplicable,
    },
    sections: participant.cycle.instrumentVersion.sections.map((section) => ({
      sectionKey: section.key,
      sectionTitle: section.title,
      description: section.description,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      percentage: percentages[section.key] ?? null,
      items: section.items.map((item) => {
        const saved = scores.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          itemLabel: item.label,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          isRequired: item.isRequired,
          score: saved?.score ?? null,
          notApplicable: saved?.notApplicable ?? false,
          answered: Boolean(saved && (saved.notApplicable || saved.score != null)),
        };
      }),
    })),
    overallPercentage: participant.response?.overallPercentage ?? null,
  };
}

function buildView(
  participant: ParticipantContextRecord,
  now: Date,
): DirectorFeedbackResponseView {
  const progress = buildProgress(participant);
  const editable =
    participant.status !== "REVOKED" &&
    participant.status !== "EXPIRED" &&
    participant.status !== "FINALIZED" &&
    participant.response?.status !== "FINALIZED" &&
    deadlineOpen(participant, now);

  return {
    cycleId: participant.cycleId,
    participantId: participant.id,
    responseId: participant.response?.id ?? null,
    cycleStatus: participant.cycle.status,
    participantStatus: participant.status,
    responseStatus: responseStatus(participant),
    openedAt: participant.cycle.openedAt?.toISOString() ?? null,
    deadlineAt: participant.cycle.deadlineAt?.toISOString() ?? null,
    canEdit: editable,
    canFinalize: editable && progress.missingItemKeys.length === 0,
    confidentiality: {
      directorCanSeeIdentity: false,
      schoolIdentityShownToDirector: false,
      freeTextCommentsAllowed: false,
      identityAccessRole: "SUPERADMIN",
    },
    progress,
    officialForm: buildOfficialForm(participant),
  };
}

function normalizeScore(
  input: DirectorFeedbackScoreInput,
  item: InstrumentItemRecord,
) {
  const notApplicable = input.notApplicable === true;
  if (notApplicable) {
    return { score: null as number | null, notApplicable: true };
  }

  if (input.score == null || clean(input.score) === "") {
    return { score: null as number | null, notApplicable: false };
  }

  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > item.maxScore) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_SCORE_INVALID", 400, {
      itemKey: item.key,
      maximum: item.maxScore,
    });
  }

  return { score, notApplicable: false };
}

function normalizedSectionPayload(
  section: InstrumentSectionRecord,
  inputs: readonly DirectorFeedbackScoreInput[],
) {
  if (!inputs.length) {
    fail("DIRECTOR_FEEDBACK_RESPONSE_SECTION_SCORES_REQUIRED", 400);
  }

  const byKey = new Map(section.items.map((item) => [item.key, item]));
  const seen = new Set<string>();

  return inputs.map((input) => {
    const itemKey = clean(input.itemKey);
    if (!itemKey) {
      fail("DIRECTOR_FEEDBACK_RESPONSE_ITEM_KEY_REQUIRED", 400);
    }
    if (seen.has(itemKey)) {
      fail("DIRECTOR_FEEDBACK_RESPONSE_DUPLICATE_ITEM", 400, { itemKey });
    }
    seen.add(itemKey);

    const item = byKey.get(itemKey);
    if (!item) {
      fail("DIRECTOR_FEEDBACK_RESPONSE_ITEM_OUTSIDE_SECTION", 400, {
        sectionKey: section.key,
        itemKey,
      });
    }

    return {
      item,
      ...normalizeScore(input, item),
    };
  });
}

function scoresEqual(
  existing: ResponseScoreRecord | undefined,
  next: { score: number | null; notApplicable: boolean },
) {
  return Boolean(
    existing &&
      existing.score === next.score &&
      existing.notApplicable === next.notApplicable,
  );
}

async function createResponseSafely(
  tx: ResponseTransactionClient,
  participant: ParticipantContextRecord,
) {
  if (participant.response) return participant.response;

  try {
    return await tx.appraisalResponse.create({
      data: {
        cycleId: participant.cycleId,
        participantId: participant.id,
        instrumentVersionId: participant.cycle.instrumentVersionId,
        status: "DRAFT",
        overallPercentage: null,
        sectionPercentagesJson: {},
        generalComment: null,
        responseHash: null,
        metadata: {
          workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
          saveUnit: DIRECTOR_FEEDBACK_RESPONSE_POLICY.saveUnit,
          commentsAllowed: false,
        },
      },
      select: {
        id: true,
        cycleId: true,
        participantId: true,
        instrumentVersionId: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        responseHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        scores: {
          select: {
            id: true,
            responseId: true,
            instrumentItemId: true,
            sectionKey: true,
            sectionTitle: true,
            sectionOrder: true,
            sectionMaxScore: true,
            itemKey: true,
            itemLabel: true,
            itemOrder: true,
            itemMaxScore: true,
            score: true,
            notApplicable: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await tx.appraisalResponse.findUnique({
      where: { participantId: participant.id },
      select: {
        id: true,
        cycleId: true,
        participantId: true,
        instrumentVersionId: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        responseHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        scores: {
          select: {
            id: true,
            responseId: true,
            instrumentItemId: true,
            sectionKey: true,
            sectionTitle: true,
            sectionOrder: true,
            sectionMaxScore: true,
            itemKey: true,
            itemLabel: true,
            itemOrder: true,
            itemMaxScore: true,
            score: true,
            notApplicable: true,
          },
        },
      },
    });

    if (!existing) throw error;
    return existing;
  }
}

function withResponse(
  participant: ParticipantContextRecord,
  response: ResponseRecord,
): ParticipantContextRecord {
  return { ...participant, response };
}

export async function listHeadteacherDirectorFeedbackAssignments(
  input: ListDirectorFeedbackAssignmentsInput,
): Promise<DirectorFeedbackAssignmentSummary[]> {
  const database =
    input.database ?? (prisma as unknown as DirectorFeedbackResponseDatabase);
  const actorUserId = clean(input.actorUserId);
  const now = input.now ? new Date(input.now) : new Date();
  assertIdentifier(actorUserId, "actorUserId");

  const participants = await database.appraisalParticipant.findMany({
    where: {
      respondentUserId: actorUserId,
      cycle: {
        instrumentVersion: {
          instrument: {
            code: DIRECTOR_FEEDBACK_POLICY.instrumentCode,
          },
        },
      },
    },
    orderBy: [{ cycle: { openedAt: "desc" } }, { selectedAt: "desc" }],
    select: participantContextSelect(),
  });

  return participants.map((participant) => {
    assertParticipantContract(participant);
    const progress = buildProgress(participant);
    return {
      cycleId: participant.cycleId,
      cycleStatus: participant.cycle.status,
      participantStatus: participant.status,
      responseStatus: responseStatus(participant),
      directorName: participant.cycle.targetNameSnapshot,
      jurisdictionName:
        participant.cycle.targetZoneNameSnapshot ?? "District jurisdiction",
      openedAt: participant.cycle.openedAt?.toISOString() ?? null,
      deadlineAt: participant.cycle.deadlineAt?.toISOString() ?? null,
      canContinue:
        participant.status !== "FINALIZED" &&
        participant.response?.status !== "FINALIZED" &&
        participant.status !== "REVOKED" &&
        participant.status !== "EXPIRED" &&
        deadlineOpen(participant, now),
      completionPercentage: progress.completionPercentage,
    };
  });
}

export async function loadHeadteacherDirectorFeedbackResponse(
  input: LoadDirectorFeedbackResponseInput,
): Promise<DirectorFeedbackResponseView> {
  const database =
    input.database ?? (prisma as unknown as DirectorFeedbackResponseDatabase);
  const actorUserId = clean(input.actorUserId);
  const cycleId = clean(input.cycleId);
  const now = input.now ? new Date(input.now) : new Date();

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(cycleId, "cycleId");

  const participant = await findParticipantContext(database, actorUserId, cycleId);
  return buildView(participant, now);
}

export async function saveHeadteacherDirectorFeedbackSection(
  input: SaveDirectorFeedbackSectionInput,
): Promise<SaveDirectorFeedbackSectionResult> {
  const database =
    input.database ?? (prisma as unknown as DirectorFeedbackResponseDatabase);
  const actorUserId = clean(input.actorUserId);
  const cycleId = clean(input.cycleId);
  const sectionKey = clean(input.sectionKey);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(cycleId, "cycleId");
  assertIdentifier(reqId, "reqId");
  if (!sectionKey) fail("DIRECTOR_FEEDBACK_RESPONSE_SECTION_KEY_REQUIRED", 400);

  return database.$transaction(
    async (tx) => {
      const participant = await findParticipantContext(
        tx as unknown as Pick<
          DirectorFeedbackResponseDatabase,
          "appraisalParticipant"
        >,
        actorUserId,
        cycleId,
      );
      assertEditable(participant, now);

      const section = participant.cycle.instrumentVersion.sections.find(
        (candidate) => candidate.key === sectionKey,
      );
      if (!section) {
        fail("DIRECTOR_FEEDBACK_RESPONSE_SECTION_NOT_FOUND", 404, {
          sectionKey,
        });
      }

      const normalized = normalizedSectionPayload(section, input.scores);
      const response = await createResponseSafely(tx, participant);
      if (response.status === "FINALIZED") {
        fail("DIRECTOR_FEEDBACK_RESPONSE_ALREADY_FINALIZED", 409);
      }

      const existingByItem = new Map(
        response.scores.map((score) => [score.instrumentItemId, score]),
      );
      const changed = normalized.filter(
        (row) => !scoresEqual(existingByItem.get(row.item.id), row),
      );

      if (!changed.length) {
        const currentParticipant = withResponse(participant, response);
        return {
          outcome: "UNCHANGED" as const,
          responseId: response.id,
          sectionKey,
          savedItems: normalized.length,
          participantStatus:
            currentParticipant.status === "FINALIZED"
              ? "FINALIZED"
              : "IN_PROGRESS",
          progress: buildProgress(currentParticipant),
        };
      }

      const savedRows = new Map(existingByItem);
      for (const row of changed) {
        const saved = await tx.appraisalResponseScore.upsert({
          where: {
            responseId_instrumentItemId: {
              responseId: response.id,
              instrumentItemId: row.item.id,
            },
          },
          create: {
            responseId: response.id,
            instrumentItemId: row.item.id,
            sectionKey: section.key,
            sectionTitle: section.title,
            sectionOrder: section.order,
            sectionMaxScore: section.maxScore,
            itemKey: row.item.key,
            itemLabel: row.item.label,
            itemOrder: row.item.order,
            itemMaxScore: row.item.maxScore,
            score: row.score,
            notApplicable: row.notApplicable,
          },
          update: {
            score: row.score,
            notApplicable: row.notApplicable,
          },
          select: {
            id: true,
            responseId: true,
            instrumentItemId: true,
            sectionKey: true,
            sectionTitle: true,
            sectionOrder: true,
            sectionMaxScore: true,
            itemKey: true,
            itemLabel: true,
            itemOrder: true,
            itemMaxScore: true,
            score: true,
            notApplicable: true,
          },
        });
        savedRows.set(row.item.id, saved);
      }

      if (participant.status === "NOT_STARTED") {
        await tx.appraisalParticipant.update({
          where: { id: participant.id },
          data: {
            status: "IN_PROGRESS",
            startedAt: participant.startedAt ?? now,
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finalizedAt: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: participant.respondentTenantId ?? undefined,
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_DRAFT_SAVED,
          resource: "AppraisalResponse",
          resourceId: response.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            cycleId,
            participantId: participant.id,
            responseId: response.id,
            sectionKey,
            changedItems: changed.length,
            scoreValuesRecordedInAudit: false,
          },
        },
      });

      const nextResponse: ResponseRecord = {
        ...response,
        scores: [...savedRows.values()].sort(
          (left, right) =>
            left.sectionOrder - right.sectionOrder ||
            left.itemOrder - right.itemOrder,
        ),
      };
      const nextParticipant = withResponse(
        {
          ...participant,
          status: "IN_PROGRESS",
          startedAt: participant.startedAt ?? now,
        },
        nextResponse,
      );

      return {
        outcome: "SAVED" as const,
        responseId: response.id,
        sectionKey,
        savedItems: normalized.length,
        participantStatus: "IN_PROGRESS" as const,
        progress: buildProgress(nextParticipant),
      };
    },
    {
      maxWait: DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
    },
  );
}

function calculationRows(participant: ParticipantContextRecord) {
  const scores = scoreMap(participant.response);
  return participant.cycle.instrumentVersion.sections.flatMap((section) =>
    section.items.map((item) => {
      const saved = scores.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: saved?.score ?? null,
        notApplicable: saved?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function responseHashPayload(
  participant: ParticipantContextRecord,
  sectionPercentages: Record<string, number | null>,
  overallPercentage: number | null,
) {
  const scores = scoreMap(participant.response);
  return {
    schemaVersion: 1,
    cycleId: participant.cycleId,
    participantId: participant.id,
    instrumentVersionId: participant.cycle.instrumentVersionId,
    scores: participant.cycle.instrumentVersion.sections.flatMap((section) =>
      section.items.map((item) => {
        const saved = scores.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          score: saved?.score ?? null,
          notApplicable: saved?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages,
    overallPercentage,
  };
}

export async function finalizeHeadteacherDirectorFeedbackResponse(
  input: FinalizeDirectorFeedbackResponseInput,
): Promise<FinalizeDirectorFeedbackResponseResult> {
  const database =
    input.database ?? (prisma as unknown as DirectorFeedbackResponseDatabase);
  const actorUserId = clean(input.actorUserId);
  const cycleId = clean(input.cycleId);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(cycleId, "cycleId");
  assertIdentifier(reqId, "reqId");

  return database.$transaction(
    async (tx) => {
      const participant = await findParticipantContext(
        tx as unknown as Pick<
          DirectorFeedbackResponseDatabase,
          "appraisalParticipant"
        >,
        actorUserId,
        cycleId,
      );

      if (
        participant.status === "FINALIZED" &&
        participant.response?.status === "FINALIZED" &&
        participant.response.finalizedAt &&
        participant.response.responseHash
      ) {
        return {
          outcome: "EXISTING_FINALIZED" as const,
          responseId: participant.response.id,
          finalizedAt: participant.response.finalizedAt.toISOString(),
          responseHash: participant.response.responseHash,
          overallPercentage: participant.response.overallPercentage,
          sectionPercentages: sectionPercentageMap(participant.response),
          progress: buildProgress(participant),
        };
      }

      assertEditable(participant, now);
      if (!participant.response) {
        fail("DIRECTOR_FEEDBACK_RESPONSE_DRAFT_NOT_FOUND", 409);
      }

      const calculated = calculateAppraisalScores(calculationRows(participant), {
        requireComplete: true,
      });
      if (!calculated.ok) {
        fail("DIRECTOR_FEEDBACK_RESPONSE_INCOMPLETE", 409, {
          scoreError: calculated.code,
          itemKeys: calculated.itemKeys,
        });
      }

      const sectionPercentages = calculated.value.sectionPercentages;
      const overallPercentage = calculated.value.overallPercentage;
      const responseHash = sha256(
        responseHashPayload(
          participant,
          sectionPercentages,
          overallPercentage,
        ),
      );

      const finalized = await tx.appraisalResponse.update({
        where: { id: participant.response.id },
        data: {
          status: "FINALIZED",
          overallPercentage,
          sectionPercentagesJson: sectionPercentages,
          generalComment: null,
          responseHash,
          finalizedByUserId: actorUserId,
          finalizedAt: now,
          metadata: {
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            finalizedSchemaVersion: 1,
            commentsAllowed: false,
          },
        },
        select: {
          id: true,
          status: true,
          overallPercentage: true,
          sectionPercentagesJson: true,
          responseHash: true,
          finalizedAt: true,
        },
      });

      await tx.appraisalParticipant.update({
        where: { id: participant.id },
        data: {
          status: "FINALIZED",
          startedAt: participant.startedAt ?? now,
          finalizedAt: now,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          finalizedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: participant.respondentTenantId ?? undefined,
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_FINALIZED,
          resource: "AppraisalResponse",
          resourceId: participant.response.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: {
            reqId,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            cycleId,
            participantId: participant.id,
            responseId: participant.response.id,
            responseHash,
            answeredItems: calculated.value.answeredItems,
            notApplicableItems: calculated.value.notApplicableItems,
            overallPercentage,
            identityIncludedInDirectorPayload: false,
            scoreValuesRecordedInAudit: false,
          },
        },
      });

      const finalizedResponse: ResponseRecord = {
        ...participant.response,
        status: "FINALIZED",
        overallPercentage,
        sectionPercentagesJson: sectionPercentages,
        generalComment: null,
        responseHash,
        finalizedByUserId: actorUserId,
        finalizedAt: finalized.finalizedAt ?? now,
      };
      const finalizedParticipant = withResponse(
        {
          ...participant,
          status: "FINALIZED",
          startedAt: participant.startedAt ?? now,
          finalizedAt: now,
        },
        finalizedResponse,
      );

      return {
        outcome: "FINALIZED" as const,
        responseId: finalized.id,
        finalizedAt: (finalized.finalizedAt ?? now).toISOString(),
        responseHash,
        overallPercentage,
        sectionPercentages,
        progress: buildProgress(finalizedParticipant),
      };
    },
    {
      maxWait: DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
    },
  );
}
