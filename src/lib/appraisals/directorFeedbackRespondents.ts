import { createHash } from "crypto";
import {
  AppraisalCycleStatus,
  AppraisalParticipantStatus,
  AppraisalResponseStatus,
  Prisma,
} from "@prisma/client";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY = {
  workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
  municipalMinimum: DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses,
  circuitDisclosureThreshold:
    DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
  allowedCycleStatuses: [
    AppraisalCycleStatus.UNDER_REVIEW,
    AppraisalCycleStatus.RELEASED,
  ],
  expectedSectionCount: 7,
  expectedItemCount: 35,
  maskedKeyLength: 24,
  maskSeedVersion: 1,
  labelsGeneratedAfterClosure: true,
  labelsAreNotSubmissionOrder: true,
  respondentIdentityVisible: false,
  schoolIdentityVisible: false,
  submissionTimeVisible: false,
  responseOrderVisible: false,
  contactDetailsVisible: false,
  nonRespondentListVisible: false,
} as const;

type JsonRecord = Record<string, unknown>;

type MaskedInstrumentItemSource = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
  isRequired: boolean;
};

type MaskedInstrumentSectionSource = {
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: MaskedInstrumentItemSource[];
};

type MaskedScoreSource = {
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

type MaskedResponseSource = {
  status: AppraisalResponseStatus;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  responseHash: string | null;
  scores: MaskedScoreSource[];
};

export type DirectorFeedbackMaskedParticipantSource = {
  id: string;
  status: AppraisalParticipantStatus;
  eligibilitySnapshotJson: unknown;
  response: MaskedResponseSource | null;
};

type MaskedAggregateSource = {
  version: number;
  finalizedResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  sourceHash: string;
  metadata: unknown;
};

export type DirectorFeedbackMaskedCycleSource = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetRoleSnapshot: string | null;
  reviewStartedAt: Date | null;
  instrumentVersionId: string;
  instrumentVersion: {
    version: number;
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
    sections: MaskedInstrumentSectionSource[];
  };
  aggregate: MaskedAggregateSource | null;
  participants: DirectorFeedbackMaskedParticipantSource[];
};

export type DirectorFeedbackMaskedRespondentSummary = {
  maskedRespondentKey: string;
  maskedLabel: string;
};

export type DirectorFeedbackMaskedFormItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  isRequired: boolean;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

export type DirectorFeedbackMaskedFormSection = {
  sectionKey: string;
  sectionTitle: string;
  description: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  items: DirectorFeedbackMaskedFormItem[];
};

export type DirectorFeedbackMaskedRespondentList = {
  mode: "LIST";
  cycleId: string;
  cycleStatus: AppraisalCycleStatus;
  circuit: {
    circuitZoneId: string;
    circuitName: string;
    finalizedResponses: number;
    threshold: number;
  };
  respondents: DirectorFeedbackMaskedRespondentSummary[];
  evidence: {
    aggregateVersion: number;
    aggregateSourceFingerprint: string;
    maskingMode: "POST_CLOSURE_HASH_ORDER";
  };
  privacy: DirectorFeedbackMaskedPrivacy;
};

export type DirectorFeedbackMaskedRespondentForm = {
  mode: "FORM";
  cycleId: string;
  cycleStatus: AppraisalCycleStatus;
  circuit: {
    circuitZoneId: string;
    circuitName: string;
    finalizedResponses: number;
    threshold: number;
  };
  respondent: {
    maskedRespondentKey: string;
    maskedLabel: string;
  };
  officialForm: {
    documentTitle: string;
    directorateName: string | null;
    instructions: string | null;
    scale: {
      minimum: number;
      maximum: number;
      allowNotApplicable: boolean;
    };
    overallPercentage: number | null;
    sections: DirectorFeedbackMaskedFormSection[];
  };
  evidence: {
    aggregateVersion: number;
    aggregateSourceFingerprint: string;
    maskingMode: "POST_CLOSURE_HASH_ORDER";
  };
  privacy: DirectorFeedbackMaskedPrivacy;
};

export type DirectorFeedbackMaskedPrivacy = {
  respondentNameIncluded: false;
  schoolNameIncluded: false;
  contactDetailsIncluded: false;
  submissionTimeIncluded: false;
  responseOrderIncluded: false;
  participantIdIncluded: false;
  responseIdIncluded: false;
  nonRespondentListIncluded: false;
};

export type DirectorFeedbackMaskedRespondentResult =
  | DirectorFeedbackMaskedRespondentList
  | DirectorFeedbackMaskedRespondentForm;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
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

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[A-Za-z0-9:_-]{5,180}$/.test(value)) {
    fail("DIRECTOR_FEEDBACK_MASKED_INVALID_IDENTIFIER", 400, { fieldName });
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function numericLabel(index: number) {
  return `Respondent ${index + 1}`;
}

function privacyContract(): DirectorFeedbackMaskedPrivacy {
  return {
    respondentNameIncluded: false,
    schoolNameIncluded: false,
    contactDetailsIncluded: false,
    submissionTimeIncluded: false,
    responseOrderIncluded: false,
    participantIdIncluded: false,
    responseIdIncluded: false,
    nonRespondentListIncluded: false,
  };
}

function circuitSnapshot(value: unknown) {
  const snapshot = objectValue(value);
  return {
    circuitZoneId: clean(snapshot.circuitZoneId) || null,
    circuitName: clean(snapshot.circuitName) || null,
  };
}

function visibleCircuitFromSnapshot(
  aggregate: MaskedAggregateSource,
  circuitZoneId: string,
) {
  const disclosure = objectValue(objectValue(aggregate.metadata).circuitDisclosure);
  const threshold = Math.max(
    1,
    integer(
      disclosure.threshold,
      DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.circuitDisclosureThreshold,
    ),
  );

  const visible = arrayValue(disclosure.visibleCircuits)
    .map((raw) => objectValue(raw))
    .find((row) => clean(row.circuitZoneId) === circuitZoneId);

  if (!visible) {
    fail("DIRECTOR_FEEDBACK_CIRCUIT_NOT_DISCLOSED", 404);
  }

  const circuitName = clean(visible.circuitName);
  const finalizedResponses = Math.max(
    0,
    integer(visible.finalizedResponses),
  );

  if (
    !circuitName ||
    finalizedResponses < threshold ||
    threshold < DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.circuitDisclosureThreshold
  ) {
    fail("DIRECTOR_FEEDBACK_CIRCUIT_THRESHOLD_NOT_MET", 409);
  }

  return {
    circuitZoneId,
    circuitName,
    finalizedResponses,
    threshold,
  };
}

function sectionPercentageMap(response: MaskedResponseSource) {
  const raw = objectValue(response.sectionPercentagesJson);
  const percentages: Record<string, number | null> = {};

  for (const [sectionKey, value] of Object.entries(raw)) {
    percentages[sectionKey] = numeric(value);
  }

  return percentages;
}

function assertCycleContract(cycle: DirectorFeedbackMaskedCycleSource) {
  if (
    !DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.allowedCycleStatuses.includes(
      cycle.status as "UNDER_REVIEW" | "RELEASED",
    ) ||
    !cycle.reviewStartedAt
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_REVIEW_NOT_AVAILABLE", 409, {
      status: cycle.status,
    });
  }

  if (
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR" ||
    cycle.instrumentVersion.version !== DIRECTOR_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.instrument.code !==
      DIRECTOR_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    cycle.instrumentVersion.allowComments === true
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_CYCLE_CONTRACT_INVALID", 409);
  }

  const sectionCount = cycle.instrumentVersion.sections.length;
  const itemCount = cycle.instrumentVersion.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  if (
    sectionCount !==
      DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.expectedSectionCount ||
    itemCount !== DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.expectedItemCount
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_INSTRUMENT_SHAPE_INVALID", 409, {
      sectionCount,
      itemCount,
    });
  }

  if (
    !cycle.aggregate ||
    !cycle.aggregate.releaseEligible ||
    cycle.aggregate.finalizedResponses < cycle.aggregate.minimumResponses ||
    cycle.aggregate.finalizedResponses <
      DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.municipalMinimum
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_MUNICIPAL_THRESHOLD_NOT_MET", 409);
  }
}

function finalizedCircuitParticipants(
  cycle: DirectorFeedbackMaskedCycleSource,
  circuitZoneId: string,
) {
  return cycle.participants.filter((participant) => {
    const circuit = circuitSnapshot(participant.eligibilitySnapshotJson);
    const response = participant.response;

    return (
      circuit.circuitZoneId === circuitZoneId &&
      participant.status === AppraisalParticipantStatus.FINALIZED &&
      response?.status === AppraisalResponseStatus.FINALIZED &&
      clean(response.responseHash).length === 64
    );
  });
}

function maskedRows(
  cycle: DirectorFeedbackMaskedCycleSource,
  circuitZoneId: string,
) {
  return finalizedCircuitParticipants(cycle, circuitZoneId)
    .map((participant) => {
      const responseHash = clean(participant.response?.responseHash);
      const seed = sha256(
        [
          "director-feedback-mask",
          DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.maskSeedVersion,
          cycle.id,
          participant.id,
          responseHash,
        ].join("|"),
      );

      return {
        participant,
        seed,
        maskedRespondentKey: seed.slice(
          0,
          DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.maskedKeyLength,
        ),
      };
    })
    .sort((left, right) => left.seed.localeCompare(right.seed))
    .map((row, index) => ({
      ...row,
      maskedLabel: numericLabel(index),
    }));
}

function buildOfficialForm(
  cycle: DirectorFeedbackMaskedCycleSource,
  response: MaskedResponseSource,
) {
  const byItem = new Map(
    response.scores.map((score) => [score.instrumentItemId, score]),
  );
  const percentages = sectionPercentageMap(response);
  let answeredItems = 0;

  const sections = cycle.instrumentVersion.sections.map((section) => ({
    sectionKey: section.key,
    sectionTitle: section.title,
    description: section.description,
    sectionOrder: section.order,
    sectionMaxScore: section.maxScore,
    percentage: percentages[section.key] ?? null,
    items: section.items.map((item) => {
      const saved = byItem.get(item.id);
      const answered = Boolean(
        saved && (saved.notApplicable || saved.score != null),
      );
      if (answered) answeredItems += 1;

      return {
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        isRequired: item.isRequired,
        score: saved?.score ?? null,
        notApplicable: saved?.notApplicable ?? false,
        answered,
      };
    }),
  }));

  if (
    answeredItems !== DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.expectedItemCount
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_RESPONSE_INCOMPLETE", 409, {
      answeredItems,
    });
  }

  return {
    documentTitle: cycle.instrumentVersion.title,
    directorateName: cycle.instrumentVersion.directorateName,
    instructions: cycle.instrumentVersion.instructions,
    scale: {
      minimum: cycle.instrumentVersion.scaleMin,
      maximum: cycle.instrumentVersion.scaleMax,
      allowNotApplicable: cycle.instrumentVersion.allowNotApplicable,
    },
    overallPercentage: response.overallPercentage,
    sections,
  };
}

export function buildDirectorFeedbackMaskedRespondentWorkspace(input: {
  cycle: DirectorFeedbackMaskedCycleSource;
  circuitZoneId: string;
  maskedRespondentKey?: string | null;
}): DirectorFeedbackMaskedRespondentResult {
  const cycle = input.cycle;
  const circuitZoneId = clean(input.circuitZoneId);
  const requestedKey = clean(input.maskedRespondentKey);

  assertIdentifier(circuitZoneId, "circuitZoneId");
  if (requestedKey) assertIdentifier(requestedKey, "maskedRespondentKey");

  assertCycleContract(cycle);
  const aggregate = cycle.aggregate!;
  const circuit = visibleCircuitFromSnapshot(aggregate, circuitZoneId);
  const rows = maskedRows(cycle, circuitZoneId);

  if (rows.length !== circuit.finalizedResponses) {
    fail("DIRECTOR_FEEDBACK_MASKED_SOURCE_COUNT_MISMATCH", 409, {
      snapshotCount: circuit.finalizedResponses,
      finalizedResponseCount: rows.length,
    });
  }

  const evidence = {
    aggregateVersion: aggregate.version,
    aggregateSourceFingerprint: clean(aggregate.sourceHash).slice(0, 12),
    maskingMode: "POST_CLOSURE_HASH_ORDER" as const,
  };

  if (!requestedKey) {
    return {
      mode: "LIST",
      cycleId: cycle.id,
      cycleStatus: cycle.status,
      circuit,
      respondents: rows.map((row) => ({
        maskedRespondentKey: row.maskedRespondentKey,
        maskedLabel: row.maskedLabel,
      })),
      evidence,
      privacy: privacyContract(),
    };
  }

  const selected = rows.find(
    (row) => row.maskedRespondentKey === requestedKey,
  );
  if (!selected?.participant.response) {
    fail("DIRECTOR_FEEDBACK_MASKED_RESPONDENT_NOT_FOUND", 404);
  }

  return {
    mode: "FORM",
    cycleId: cycle.id,
    cycleStatus: cycle.status,
    circuit,
    respondent: {
      maskedRespondentKey: selected.maskedRespondentKey,
      maskedLabel: selected.maskedLabel,
    },
    officialForm: buildOfficialForm(cycle, selected.participant.response),
    evidence,
    privacy: privacyContract(),
  };
}

const MASKED_CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetRoleSnapshot: true,
  reviewStartedAt: true,
  instrumentVersionId: true,
  instrumentVersion: {
    select: {
      version: true,
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
  aggregates: {
    orderBy: { version: "desc" },
    take: 1,
    select: {
      version: true,
      finalizedResponses: true,
      minimumResponses: true,
      releaseEligible: true,
      sourceHash: true,
      metadata: true,
    },
  },
  participants: {
    where: {
      status: AppraisalParticipantStatus.FINALIZED,
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      eligibilitySnapshotJson: true,
      response: {
        select: {
          status: true,
          overallPercentage: true,
          sectionPercentagesJson: true,
          responseHash: true,
          scores: {
            orderBy: [
              { sectionOrder: "asc" },
              { itemOrder: "asc" },
            ],
            select: {
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
    },
  },
} as const satisfies Prisma.AppraisalCycleSelect;

type MaskedCycleRecord = Prisma.AppraisalCycleGetPayload<{
  select: typeof MASKED_CYCLE_SELECT;
}>;

function toMaskedCycleSource(
  cycle: MaskedCycleRecord,
): DirectorFeedbackMaskedCycleSource {
  return {
    id: cycle.id,
    status: cycle.status,
    targetUserId: cycle.targetUserId,
    targetRoleSnapshot: cycle.targetRoleSnapshot,
    reviewStartedAt: cycle.reviewStartedAt,
    instrumentVersionId: cycle.instrumentVersionId,
    instrumentVersion: cycle.instrumentVersion,
    aggregate: cycle.aggregates[0] ?? null,
    participants: cycle.participants,
  };
}

export async function getDirectorFeedbackMaskedRespondents(input: {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  circuitZoneId: string;
  maskedRespondentKey?: string | null;
}): Promise<DirectorFeedbackMaskedRespondentResult> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = effectiveRole(input.actorRoleName);
  const cycleId = clean(input.cycleId);
  const circuitZoneId = clean(input.circuitZoneId);
  const maskedRespondentKey = clean(input.maskedRespondentKey) || null;

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(cycleId, "cycleId");
  assertIdentifier(circuitZoneId, "circuitZoneId");
  if (maskedRespondentKey) {
    assertIdentifier(maskedRespondentKey, "maskedRespondentKey");
  }

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "VIEW_DIRECTOR_FEEDBACK_RESULTS",
  );

  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: MASKED_CYCLE_SELECT,
  });

  if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR"
  ) {
    fail("DIRECTOR_FEEDBACK_MASKED_SCOPE_FORBIDDEN", 403);
  }

  return buildDirectorFeedbackMaskedRespondentWorkspace({
    cycle: toMaskedCycleSource(cycle),
    circuitZoneId,
    maskedRespondentKey,
  });
}
