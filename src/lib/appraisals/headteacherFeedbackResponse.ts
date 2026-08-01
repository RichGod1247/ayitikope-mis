//src/lib/appraisals/headteacherFeedbackResponse.ts
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackInstrumentReady,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_FEEDBACK_ANONYMITY_NOTICE } from "@/lib/appraisals/headteacherFeedbackReadStates";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_RESPONSE_POLICY = {
  saveUnit: "SECTION",
  commentsAllowed: false,
  partialSectionSaveAllowed: true,
  finalizedResponsesAreImmutable: true,
  repeatedIdenticalSectionSaveCreatesNoDuplicateAudit: true,
  responseTransactionMaxWaitMs: 5_000,
  responseTransactionTimeoutMs: 60_000,
  responseTransactionIsolation: "Serializable",
} as const;

export type HeadteacherFeedbackResponseMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type HeadteacherFeedbackScoreInput = {
  itemKey: string;
  score?: number | null;
  notApplicable?: boolean | null;
};

export type LoadTeacherHeadteacherFeedbackResponseInput = {
  actorUserId: string;
  actorRoleName: unknown;
  tenantId: string;
  cycleId: string;
  now?: Date;
  database?: HeadteacherFeedbackResponseDatabase;
};

export type SaveTeacherHeadteacherFeedbackSectionInput =
  HeadteacherFeedbackResponseMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    tenantId: string;
    cycleId: string;
    sectionKey: string;
    scores: readonly HeadteacherFeedbackScoreInput[];
    now?: Date;
    database?: HeadteacherFeedbackResponseDatabase;
  };

export type FinalizeTeacherHeadteacherFeedbackResponseInput =
  HeadteacherFeedbackResponseMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    tenantId: string;
    cycleId: string;
    now?: Date;
    database?: HeadteacherFeedbackResponseDatabase;
  };

export type HeadteacherFeedbackSectionProgress = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  totalItems: number;
  answeredItems: number;
  complete: boolean;
};

export type HeadteacherFeedbackResponseProgress = {
  totalSections: number;
  completedSections: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  completionPercentage: number;
  missingItemKeys: string[];
  sections: HeadteacherFeedbackSectionProgress[];
};

export type HeadteacherFeedbackOfficialFormItem = {
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

export type HeadteacherFeedbackOfficialFormSection = {
  sectionKey: string;
  sectionTitle: string;
  description: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  items: HeadteacherFeedbackOfficialFormItem[];
};

export type TeacherHeadteacherFeedbackResponseView = {
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
    headteacherCanSeeIdentity: false;
    directorIdentityAccessRequiresAuthorizedAudit: true;
    freeTextCommentsAllowed: false;
    notice: string;
  };
  progress: HeadteacherFeedbackResponseProgress;
  officialForm: {
    documentTitle: string;
    schoolName: string;
    circuitName: string | null;
    headteacherName: string | null;
    instructions: string | null;
    scale: {
      minimum: number;
      maximum: number;
      allowNotApplicable: boolean;
    };
    sections: HeadteacherFeedbackOfficialFormSection[];
    overallPercentage: number | null;
  };
};

export type SaveTeacherHeadteacherFeedbackSectionResult = {
  outcome: "SAVED" | "UNCHANGED";
  responseId: string;
  sectionKey: string;
  savedItems: number;
  participantStatus: "IN_PROGRESS" | "FINALIZED";
  progress: HeadteacherFeedbackResponseProgress;
};

export type FinalizeTeacherHeadteacherFeedbackResponseResult = {
  outcome: "FINALIZED" | "EXISTING_FINALIZED";
  responseId: string;
  finalizedAt: string;
  responseHash: string;
  overallPercentage: number | null;
  sectionPercentages: Record<string, number | null>;
  progress: HeadteacherFeedbackResponseProgress;
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
  metadata: unknown;
  scores: ResponseScoreRecord[];
};

type ParticipantContextRecord = {
  id: string;
  cycleId: string;
  respondentUserId: string;
  respondentTenantId: string | null;
  respondentRoleSnapshot: string;
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
    targetTenantId: string | null;
    targetNameSnapshot: string | null;
    targetRoleSnapshot: string | null;
    targetSchoolNameSnapshot: string | null;
    targetZoneNameSnapshot: string | null;
    instrumentVersionId: string;
    metadata: unknown;
    instrumentVersion: {
      id: string;
      version: number;
      status: string;
      title: string;
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

type HeadteacherFeedbackResponseTransactionClient = {
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

export type HeadteacherFeedbackResponseDatabase = {
  appraisalParticipant: {
    findFirst(args: unknown): Promise<ParticipantContextRecord | null>;
    update(args: unknown): Promise<ParticipantMutationRecord>;
  };
  appraisalResponse: HeadteacherFeedbackResponseTransactionClient["appraisalResponse"];
  appraisalResponseScore: HeadteacherFeedbackResponseTransactionClient["appraisalResponseScore"];
  auditLog: HeadteacherFeedbackResponseTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherFeedbackResponseTransactionClient,
    ) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
    },
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

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);

  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }

  return id;
}

function requireTeacherRole(value: unknown) {
  const role = effectiveRole(value);
  if (role !== "TEACHER") {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_TEACHER_ONLY", 403, { role });
  }
  return role;
}

function requireValidDate(value: Date | undefined, code: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) fail(code, 400);
  return date;
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

function assertCommentsAbsent(input: unknown) {
  const record = objectValue(input);
  for (const key of ["comment", "comments", "generalComment"]) {
    if (record[key] !== undefined && record[key] !== null) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_COMMENTS_FORBIDDEN", 400, {
        fieldName: key,
      });
    }
  }
}

function participantContextSelect() {
  return {
    id: true,
    cycleId: true,
    respondentUserId: true,
    respondentTenantId: true,
    respondentRoleSnapshot: true,
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
        targetTenantId: true,
        targetNameSnapshot: true,
        targetRoleSnapshot: true,
        targetSchoolNameSnapshot: true,
        targetZoneNameSnapshot: true,
        instrumentVersionId: true,
        metadata: true,
        instrumentVersion: {
          select: {
            id: true,
            version: true,
            status: true,
            title: true,
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
        metadata: true,
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
  database: Pick<HeadteacherFeedbackResponseDatabase, "appraisalParticipant">,
  input: {
    actorUserId: string;
    tenantId: string;
    cycleId: string;
  },
) {
  const participant = await database.appraisalParticipant.findFirst({
    where: {
      cycleId: input.cycleId,
      respondentUserId: input.actorUserId,
      respondentTenantId: input.tenantId,
    },
    select: participantContextSelect(),
  });

  if (!participant) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND", 404, {
      cycleId: input.cycleId,
      tenantId: input.tenantId,
    });
  }

  assertParticipantContract(participant, input);
  return participant;
}

function assertParticipantContract(
  participant: ParticipantContextRecord,
  input: {
    actorUserId: string;
    tenantId: string;
    cycleId: string;
  },
) {
  assertHeadteacherFeedbackInstrumentReady();

  const eligibility = objectValue(participant.eligibilitySnapshotJson);
  const eligibilityTenantId = clean(eligibility.tenantId);
  const selectionBasis = clean(eligibility.selectionBasis);
  const targetTenantId = clean(participant.cycle.targetTenantId);
  const respondentTenantId = clean(participant.respondentTenantId);

  if (
    participant.id.length < 1 ||
    participant.cycleId !== input.cycleId ||
    participant.respondentUserId !== input.actorUserId ||
    respondentTenantId !== input.tenantId ||
    targetTenantId !== input.tenantId ||
    eligibilityTenantId !== input.tenantId
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_TENANT_BINDING_INVALID", 409);
  }

  if (
    participant.respondentRoleSnapshot !==
      HEADTEACHER_FEEDBACK_POLICY.respondentRole ||
    participant.cycle.targetRoleSnapshot !==
      HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    selectionBasis !== "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN"
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_ELIGIBILITY_SNAPSHOT_INVALID", 409);
  }

  if (
    participant.cycle.instrumentVersion.id !==
      participant.cycle.instrumentVersionId ||
    participant.cycle.instrumentVersion.version !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    participant.cycle.instrumentVersion.instrument.code !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    participant.cycle.instrumentVersion.status !== "ACTIVE" ||
    participant.cycle.instrumentVersion.instrument.isActive !== true
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_INSTRUMENT_NOT_ACTIVE", 409);
  }

  if (
    participant.cycle.instrumentVersion.allowComments ||
    HEADTEACHER_FEEDBACK_POLICY.commentsAllowed
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_COMMENTS_MUST_BE_DISABLED", 409);
  }

  if (participant.cycle.targetUserId === participant.respondentUserId) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_SELF_FEEDBACK_FORBIDDEN", 403);
  }

  if (participant.response) {
    if (
      participant.response.cycleId !== participant.cycleId ||
      participant.response.participantId !== participant.id ||
      participant.response.instrumentVersionId !==
        participant.cycle.instrumentVersionId ||
      participant.response.generalComment != null
    ) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_LINK_INVALID", 409);
    }

    if (
      participant.response.status === "FINALIZED" &&
      (!participant.response.responseHash ||
        !participant.response.finalizedAt ||
        !participant.response.finalizedByUserId)
    ) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_FINALIZED_PROOF_INVALID", 409);
    }
  }

  if (
    participant.status === "FINALIZED" &&
    participant.response?.status !== "FINALIZED"
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPANT_STATE_INVALID", 409);
  }
}

function responseStatus(participant: ParticipantContextRecord) {
  return participant.response?.status ?? "NOT_STARTED";
}

function responseWindowOpen(participant: ParticipantContextRecord, now: Date) {
  const deadline = participant.cycle.deadlineAt;
  return (
    participant.cycle.status === "OPEN" &&
    (!deadline || now.getTime() <= deadline.getTime())
  );
}

function assertEditable(participant: ParticipantContextRecord, now: Date) {
  if (participant.status === "REVOKED") {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPATION_REVOKED", 403);
  }
  if (participant.status === "EXPIRED") {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPATION_EXPIRED", 409);
  }
  if (
    participant.status === "FINALIZED" ||
    participant.response?.status === "FINALIZED"
  ) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_ALREADY_FINALIZED", 409);
  }
  if (!responseWindowOpen(participant, now)) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_WINDOW_CLOSED", 409, {
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
    out[key] =
      typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return out;
}

function buildProgress(
  participant: ParticipantContextRecord,
): HeadteacherFeedbackResponseProgress {
  const scores = scoreMap(participant.response);
  const sections: HeadteacherFeedbackSectionProgress[] = [];
  const missingItemKeys: string[] = [];
  let answeredItems = 0;
  let notApplicableItems = 0;
  let totalItems = 0;

  for (const section of participant.cycle.instrumentVersion.sections) {
    let sectionAnswered = 0;
    for (const item of section.items) {
      totalItems += 1;
      const saved = scores.get(item.id);
      const answered = Boolean(
        saved && (saved.notApplicable || saved.score != null),
      );
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
    completionPercentage:
      totalItems > 0 ? round2((answeredItems / totalItems) * 100) : 0,
    missingItemKeys,
    sections,
  };
}

function buildView(
  participant: ParticipantContextRecord,
  now: Date,
): TeacherHeadteacherFeedbackResponseView {
  const progress = buildProgress(participant);
  const scores = scoreMap(participant.response);
  const percentages = sectionPercentageMap(participant.response);
  const editable =
    participant.status !== "FINALIZED" &&
    participant.status !== "EXPIRED" &&
    participant.status !== "REVOKED" &&
    participant.response?.status !== "FINALIZED" &&
    responseWindowOpen(participant, now);

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
      headteacherCanSeeIdentity: false,
      directorIdentityAccessRequiresAuthorizedAudit: true,
      freeTextCommentsAllowed: false,
      notice: HEADTEACHER_FEEDBACK_ANONYMITY_NOTICE,
    },
    progress,
    officialForm: {
      documentTitle: participant.cycle.instrumentVersion.title,
      schoolName:
        participant.cycle.targetSchoolNameSnapshot ?? "School snapshot",
      circuitName: participant.cycle.targetZoneNameSnapshot,
      headteacherName: participant.cycle.targetNameSnapshot,
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
            answered: Boolean(
              saved && (saved.notApplicable || saved.score != null),
            ),
          };
        }),
      })),
      overallPercentage: participant.response?.overallPercentage ?? null,
    },
  };
}

function normalizeSectionPayload(
  section: InstrumentSectionRecord,
  scores: readonly HeadteacherFeedbackScoreInput[],
) {
  if (!Array.isArray(scores) || scores.length < 1) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_SECTION_SCORES_REQUIRED", 400);
  }

  const itemByKey = new Map(section.items.map((item) => [item.key, item]));
  const seen = new Set<string>();

  return scores.map((row) => {
    const itemKey = clean(row?.itemKey);
    const item = itemByKey.get(itemKey);

    if (!item) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_ITEM_OUTSIDE_SECTION", 400, {
        sectionKey: section.key,
        itemKey,
      });
    }

    if (seen.has(itemKey)) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_DUPLICATE_ITEM", 400, {
        itemKey,
      });
    }
    seen.add(itemKey);

    const notApplicable = row.notApplicable === true;
    const rawScore = row.score;

    if (notApplicable) {
      if (rawScore !== undefined && rawScore !== null) {
        fail("HEADTEACHER_FEEDBACK_RESPONSE_NA_WITH_SCORE", 400, {
          itemKey,
        });
      }

      return {
        item,
        score: null,
        notApplicable: true,
      };
    }

    const score = Number(rawScore);
    if (
      !Number.isInteger(score) ||
      score < participantScaleMinimum(section) ||
      score > item.maxScore
    ) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_SCORE_INVALID", 400, {
        itemKey,
        minimum: 1,
        maximum: item.maxScore,
      });
    }

    return {
      item,
      score,
      notApplicable: false,
    };
  });
}

function participantScaleMinimum(_section: InstrumentSectionRecord) {
  return 1;
}

function scoresEqual(
  current: ResponseScoreRecord | undefined,
  next: {
    score: number | null;
    notApplicable: boolean;
  },
) {
  return Boolean(
    current &&
      current.score === next.score &&
      current.notApplicable === next.notApplicable,
  );
}

function responseSelect() {
  return participantContextSelect().response.select;
}

async function createResponseSafely(
  tx: HeadteacherFeedbackResponseTransactionClient,
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
          workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
          commentsAllowed: false,
          responseSchemaVersion: 1,
        },
      },
      select: responseSelect(),
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const raced = await tx.appraisalResponse.findUnique({
      where: { participantId: participant.id },
      select: responseSelect(),
    });

    if (!raced) throw error;
    return raced;
  }
}

function withResponse(
  participant: ParticipantContextRecord,
  response: ResponseRecord,
): ParticipantContextRecord {
  return {
    ...participant,
    response,
  };
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
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
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

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: HEADTEACHER_FEEDBACK_RESPONSE_POLICY.responseTransactionMaxWaitMs,
    timeout:
      HEADTEACHER_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
  };
}

export async function loadTeacherHeadteacherFeedbackResponse(
  input: LoadTeacherHeadteacherFeedbackResponseInput,
): Promise<TeacherHeadteacherFeedbackResponseView> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackResponseDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const tenantId = requireIdentifier(input.tenantId, "tenantId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const now = requireValidDate(
    input.now,
    "HEADTEACHER_FEEDBACK_RESPONSE_INVALID_LOAD_TIME",
  );

  requireTeacherRole(input.actorRoleName);

  const participant = await findParticipantContext(database, {
    actorUserId,
    tenantId,
    cycleId,
  });

  return buildView(participant, now);
}

export async function saveTeacherHeadteacherFeedbackSection(
  input: SaveTeacherHeadteacherFeedbackSectionInput,
): Promise<SaveTeacherHeadteacherFeedbackSectionResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackResponseDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const tenantId = requireIdentifier(input.tenantId, "tenantId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reqId = requireIdentifier(
    clean(input.reqId) || randomUUID(),
    "reqId",
  );
  const sectionKey = clean(input.sectionKey);
  const now = requireValidDate(
    input.now,
    "HEADTEACHER_FEEDBACK_RESPONSE_INVALID_SAVE_TIME",
  );

  requireTeacherRole(input.actorRoleName);
  assertCommentsAbsent(input);

  if (!sectionKey) {
    fail("HEADTEACHER_FEEDBACK_RESPONSE_SECTION_KEY_REQUIRED", 400);
  }

  return database.$transaction(async (tx) => {
    const participant = await findParticipantContext(tx, {
      actorUserId,
      tenantId,
      cycleId,
    });
    assertEditable(participant, now);

    const section = participant.cycle.instrumentVersion.sections.find(
      (candidate) => candidate.key === sectionKey,
    );
    if (!section) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_SECTION_NOT_FOUND", 404, {
        sectionKey,
      });
    }

    const normalized = normalizeSectionPayload(section, input.scores);
    const response = await createResponseSafely(tx, participant);

    if (response.status === "FINALIZED") {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_ALREADY_FINALIZED", 409);
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
        tenantId,
        userId: actorUserId,
        action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_DRAFT_SAVED,
        resource: "AppraisalResponse",
        resourceId: response.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_DRAFT_SAVED,
          workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
          cycleId,
          participantId: participant.id,
          responseId: response.id,
          sectionKey,
          changedItemCount: changed.length,
          scoreValuesRecordedInAudit: false,
          respondentIdentityCopiedIntoAudit: false,
        },
      },
    });

    const updatedResponse: ResponseRecord = {
      ...response,
      scores: [...savedRows.values()].sort(
        (left, right) =>
          left.sectionOrder - right.sectionOrder ||
          left.itemOrder - right.itemOrder,
      ),
    };
    const updatedParticipant: ParticipantContextRecord = {
      ...participant,
      status:
        participant.status === "NOT_STARTED"
          ? "IN_PROGRESS"
          : participant.status,
      startedAt: participant.startedAt ?? now,
      response: updatedResponse,
    };

    return {
      outcome: "SAVED" as const,
      responseId: response.id,
      sectionKey,
      savedItems: normalized.length,
      participantStatus: "IN_PROGRESS" as const,
      progress: buildProgress(updatedParticipant),
    };
  }, transactionOptions());
}

export async function finalizeTeacherHeadteacherFeedbackResponse(
  input: FinalizeTeacherHeadteacherFeedbackResponseInput,
): Promise<FinalizeTeacherHeadteacherFeedbackResponseResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackResponseDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const tenantId = requireIdentifier(input.tenantId, "tenantId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reqId = requireIdentifier(
    clean(input.reqId) || randomUUID(),
    "reqId",
  );
  const now = requireValidDate(
    input.now,
    "HEADTEACHER_FEEDBACK_RESPONSE_INVALID_FINALIZE_TIME",
  );

  requireTeacherRole(input.actorRoleName);
  assertCommentsAbsent(input);

  return database.$transaction(async (tx) => {
    const participant = await findParticipantContext(tx, {
      actorUserId,
      tenantId,
      cycleId,
    });

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
      fail("HEADTEACHER_FEEDBACK_RESPONSE_DRAFT_NOT_FOUND", 409);
    }

    const calculated = calculateAppraisalScores(calculationRows(participant), {
      requireComplete: true,
    });
    if (!calculated.ok) {
      fail("HEADTEACHER_FEEDBACK_RESPONSE_INCOMPLETE", 409, {
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
          workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
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
        tenantId,
        userId: actorUserId,
        action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_FINALIZED,
        resource: "AppraisalResponse",
        resourceId: participant.response.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: APPRAISAL_AUDIT_ACTIONS.RESPONSE_FINALIZED,
          workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
          cycleId,
          participantId: participant.id,
          responseId: participant.response.id,
          responseHash,
          answeredItemCount: calculated.value.answeredItems,
          notApplicableItemCount: calculated.value.notApplicableItems,
          scoreValuesRecordedInAudit: false,
          aggregateScoreRecordedInAudit: false,
          respondentIdentityCopiedIntoAudit: false,
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
      finalizedAt: now,
      metadata: {
        workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
        finalizedSchemaVersion: 1,
        commentsAllowed: false,
      },
    };
    const finalizedParticipant: ParticipantContextRecord = {
      ...participant,
      status: "FINALIZED",
      startedAt: participant.startedAt ?? now,
      finalizedAt: now,
      response: finalizedResponse,
    };

    return {
      outcome: "FINALIZED" as const,
      responseId: finalized.id,
      finalizedAt: finalized.finalizedAt?.toISOString() ?? now.toISOString(),
      responseHash: finalized.responseHash ?? responseHash,
      overallPercentage: finalized.overallPercentage,
      sectionPercentages: sectionPercentageMap(finalizedResponse),
      progress: buildProgress(finalizedParticipant),
    };
  }, transactionOptions());
}
