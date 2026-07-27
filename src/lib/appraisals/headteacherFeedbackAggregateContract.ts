import { createHash } from "crypto";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";

export const HEADTEACHER_FEEDBACK_AGGREGATE_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
  instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
  instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
  minimumFinalizedResponses:
    HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
  cycleStatusRequired: "CLOSED",
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedRawMaximum: 170,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  scaleMinimum: 1,
  scaleMaximum: 5,
  notApplicableExcludedFromDenominator: true,
  finalizedResponsesOnly: true,
  commentsAllowed: false,
  identityFieldsAllowed: false,
  responseHashesExposed: false,
  snapshotHashAlgorithm: "SHA-256",
} as const;

export type HeadteacherFeedbackAggregateParticipantStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "FINALIZED"
  | "EXPIRED"
  | "REVOKED";

export type HeadteacherFeedbackAggregateResponseStatus =
  | "DRAFT"
  | "FINALIZED";

export type HeadteacherFeedbackAggregateScoreInput = {
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

export type HeadteacherFeedbackAggregateResponseInput = {
  status: HeadteacherFeedbackAggregateResponseStatus | string;
  responseHash: string | null;
  overallPercentage: number | null;
  sectionPercentages: unknown;
  generalComment?: unknown;
  scores: readonly HeadteacherFeedbackAggregateScoreInput[];
};

export type HeadteacherFeedbackAggregateParticipantInput = {
  status: HeadteacherFeedbackAggregateParticipantStatus | string;
  response: HeadteacherFeedbackAggregateResponseInput | null;
};

export type CalculateHeadteacherFeedbackAggregateInput = {
  cycleId: string;
  cycleStatus: string;
  workflow: string;
  instrumentCode: string;
  instrumentVersion: number;
  instrumentDefinitionHash: string;
  minimumResponses: number;
  participants: readonly HeadteacherFeedbackAggregateParticipantInput[];
};

export type HeadteacherFeedbackAggregateItemEvidence = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  sectionKey: string;
  sectionOrder: number;
  applicableResponses: number;
  notApplicableResponses: number;
  averageScore: number | null;
  averagePercentage: number | null;
};

export type HeadteacherFeedbackAggregateSectionEvidence = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  finalizedResponses: number;
  averagePercentage: number;
};

export type HeadteacherFeedbackAggregateSnapshotContract = {
  schemaVersion: 1;
  cycleId: string;
  workflow: typeof HEADTEACHER_FEEDBACK_POLICY.workflow;
  instrumentCode: typeof HEADTEACHER_FEEDBACK_POLICY.instrumentCode;
  instrumentVersion: typeof HEADTEACHER_FEEDBACK_POLICY.instrumentVersion;
  instrumentDefinitionHash: string;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  revokedResponses: number;
  minimumResponses: number;
  releaseEligible: true;
  overallPercentage: number;
  sectionAverages: Record<string, number>;
  itemAverages: Record<string, number | null>;
  sectionEvidence: Record<string, HeadteacherFeedbackAggregateSectionEvidence>;
  itemEvidence: Record<string, HeadteacherFeedbackAggregateItemEvidence>;
  sourceHash: string;
  privacy: {
    containsRespondentIdentity: false;
    containsIndividualScores: false;
    containsResponseHashes: false;
    containsSubmissionTimestamps: false;
  };
};

export type HeadteacherFeedbackAggregateReadiness = {
  readiness: "READY" | "INSUFFICIENT_RESPONSES";
  cycleId: string;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  revokedResponses: number;
  minimumResponses: number;
  snapshot: HeadteacherFeedbackAggregateSnapshotContract | null;
};

export type HeadteacherFeedbackAggregateFailureCode =
  | "INVALID_CYCLE_ID"
  | "CYCLE_NOT_CLOSED"
  | "WORKFLOW_MISMATCH"
  | "INSTRUMENT_MISMATCH"
  | "INSTRUMENT_DEFINITION_HASH_INVALID"
  | "MINIMUM_RESPONSES_MISMATCH"
  | "PARTICIPANTS_REQUIRED"
  | "PARTICIPANT_STATUS_INVALID_AFTER_CLOSURE"
  | "FINALIZED_PARTICIPANT_RESPONSE_MISSING"
  | "FINALIZED_RESPONSE_PARTICIPANT_MISMATCH"
  | "FINALIZED_RESPONSE_HASH_INVALID"
  | "DUPLICATE_FINALIZED_RESPONSE_HASH"
  | "FREE_TEXT_COMMENT_FORBIDDEN"
  | "FINALIZED_RESPONSE_ITEM_COUNT_MISMATCH"
  | "FINALIZED_RESPONSE_SECTION_COUNT_MISMATCH"
  | "FINALIZED_RESPONSE_ITEM_DUPLICATE"
  | "FINALIZED_RESPONSE_SCORE_INVALID"
  | "FINALIZED_RESPONSE_SECTION_CONTRACT_INVALID"
  | "FINALIZED_RESPONSE_STRUCTURE_DRIFT"
  | "FINALIZED_RESPONSE_PERCENTAGE_MISMATCH";

export type HeadteacherFeedbackAggregateResult =
  | { ok: true; value: HeadteacherFeedbackAggregateReadiness }
  | {
      ok: false;
      code: HeadteacherFeedbackAggregateFailureCode;
      details?: Record<string, unknown>;
    };

type NormalizedScore = HeadteacherFeedbackAggregateScoreInput & {
  sectionKey: string;
  sectionTitle: string;
  itemKey: string;
  itemLabel: string;
};

type ValidatedFinalizedResponse = {
  responseHash: string;
  sectionPercentages: Record<string, number>;
  overallPercentage: number;
  scores: NormalizedScore[];
  structureSignature: string;
};

function failure(
  code: HeadteacherFeedbackAggregateFailureCode,
  details?: Record<string, unknown>,
): HeadteacherFeedbackAggregateResult {
  return details ? { ok: false, code, details } : { ok: false, code };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

function normalizeScore(
  row: HeadteacherFeedbackAggregateScoreInput,
): NormalizedScore | null {
  const sectionKey = clean(row.sectionKey);
  const sectionTitle = clean(row.sectionTitle);
  const itemKey = clean(row.itemKey);
  const itemLabel = clean(row.itemLabel);

  if (
    !sectionKey ||
    !sectionTitle ||
    !itemKey ||
    !itemLabel ||
    !Number.isInteger(row.sectionOrder) ||
    row.sectionOrder < 1 ||
    !Number.isInteger(row.sectionMaxScore) ||
    row.sectionMaxScore < 1 ||
    !Number.isInteger(row.itemOrder) ||
    row.itemOrder < 1 ||
    row.itemMaxScore !== HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.scaleMaximum
  ) {
    return null;
  }

  if (row.notApplicable) {
    if (row.score !== null) return null;
  } else if (
    !Number.isInteger(row.score) ||
    (row.score as number) < HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.scaleMinimum ||
    (row.score as number) > HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.scaleMaximum
  ) {
    return null;
  }

  return {
    ...row,
    sectionKey,
    sectionTitle,
    itemKey,
    itemLabel,
  };
}

function structurePayload(scores: readonly NormalizedScore[]) {
  return scores
    .map((row) => ({
      sectionKey: row.sectionKey,
      sectionTitle: row.sectionTitle,
      sectionOrder: row.sectionOrder,
      sectionMaxScore: row.sectionMaxScore,
      itemKey: row.itemKey,
      itemLabel: row.itemLabel,
      itemOrder: row.itemOrder,
      itemMaxScore: row.itemMaxScore,
    }))
    .sort((left, right) =>
      left.sectionOrder - right.sectionOrder ||
      left.itemOrder - right.itemOrder ||
      left.itemKey.localeCompare(right.itemKey),
    );
}

function validateFinalizedResponse(
  response: HeadteacherFeedbackAggregateResponseInput,
):
  | { ok: true; value: ValidatedFinalizedResponse }
  | { ok: false; code: HeadteacherFeedbackAggregateFailureCode } {
  const responseHash = clean(response.responseHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(responseHash)) {
    return { ok: false, code: "FINALIZED_RESPONSE_HASH_INVALID" };
  }

  if (clean(response.generalComment)) {
    return { ok: false, code: "FREE_TEXT_COMMENT_FORBIDDEN" };
  }

  if (
    !Array.isArray(response.scores) ||
    response.scores.length !==
      HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedItemCount
  ) {
    return { ok: false, code: "FINALIZED_RESPONSE_ITEM_COUNT_MISMATCH" };
  }

  const scores: NormalizedScore[] = [];
  const itemKeys = new Set<string>();

  for (const row of response.scores) {
    const normalized = normalizeScore(row);
    if (!normalized) {
      return { ok: false, code: "FINALIZED_RESPONSE_SCORE_INVALID" };
    }
    if (itemKeys.has(normalized.itemKey)) {
      return { ok: false, code: "FINALIZED_RESPONSE_ITEM_DUPLICATE" };
    }
    itemKeys.add(normalized.itemKey);
    scores.push(normalized);
  }

  const sectionMap = new Map<
    string,
    {
      title: string;
      order: number;
      maxScore: number;
      rows: NormalizedScore[];
    }
  >();

  for (const row of scores) {
    const existing = sectionMap.get(row.sectionKey);
    if (!existing) {
      sectionMap.set(row.sectionKey, {
        title: row.sectionTitle,
        order: row.sectionOrder,
        maxScore: row.sectionMaxScore,
        rows: [row],
      });
      continue;
    }

    if (
      existing.title !== row.sectionTitle ||
      existing.order !== row.sectionOrder ||
      existing.maxScore !== row.sectionMaxScore
    ) {
      return {
        ok: false,
        code: "FINALIZED_RESPONSE_SECTION_CONTRACT_INVALID",
      };
    }
    existing.rows.push(row);
  }

  if (
    sectionMap.size !==
    HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedSectionCount
  ) {
    return { ok: false, code: "FINALIZED_RESPONSE_SECTION_COUNT_MISMATCH" };
  }

  const orderedSections = [...sectionMap.entries()].sort(
    ([, left], [, right]) => left.order - right.order,
  );
  const sectionOrders = new Set(orderedSections.map(([, section]) => section.order));
  const sectionMaximums = orderedSections.map(([, section]) => section.maxScore);
  const rawMaximum = sectionMaximums.reduce((sum, value) => sum + value, 0);

  if (
    sectionOrders.size !==
      HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedSectionCount ||
    rawMaximum !== HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedRawMaximum ||
    sectionMaximums.some(
      (value, index) =>
        value !==
        HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedSectionMaximums[index],
    )
  ) {
    return {
      ok: false,
      code: "FINALIZED_RESPONSE_SECTION_CONTRACT_INVALID",
    };
  }

  const storedSections = recordValue(response.sectionPercentages);
  const sectionPercentages: Record<string, number> = {};

  for (const [sectionKey, section] of orderedSections) {
    const declaredItemMaximum = section.rows.reduce(
      (sum, row) => sum + row.itemMaxScore,
      0,
    );
    if (declaredItemMaximum !== section.maxScore) {
      return {
        ok: false,
        code: "FINALIZED_RESPONSE_SECTION_CONTRACT_INVALID",
      };
    }

    const applicable = section.rows.filter((row) => !row.notApplicable);
    if (applicable.length === 0) {
      return {
        ok: false,
        code: "FINALIZED_RESPONSE_SECTION_CONTRACT_INVALID",
      };
    }

    const earned = applicable.reduce(
      (sum, row) => sum + (row.score as number),
      0,
    );
    const possible = applicable.reduce(
      (sum, row) => sum + row.itemMaxScore,
      0,
    );
    const calculatedPercentage = round2((earned / possible) * 100);
    const storedPercentage = storedSections[sectionKey];

    if (
      typeof storedPercentage !== "number" ||
      !Number.isFinite(storedPercentage) ||
      !closeEnough(storedPercentage, calculatedPercentage)
    ) {
      return {
        ok: false,
        code: "FINALIZED_RESPONSE_PERCENTAGE_MISMATCH",
      };
    }

    sectionPercentages[sectionKey] = calculatedPercentage;
  }

  const calculatedOverall = round2(
    Object.values(sectionPercentages).reduce((sum, value) => sum + value, 0) /
      Object.keys(sectionPercentages).length,
  );

  if (
    typeof response.overallPercentage !== "number" ||
    !Number.isFinite(response.overallPercentage) ||
    !closeEnough(response.overallPercentage, calculatedOverall)
  ) {
    return {
      ok: false,
      code: "FINALIZED_RESPONSE_PERCENTAGE_MISMATCH",
    };
  }

  return {
    ok: true,
    value: {
      responseHash,
      sectionPercentages,
      overallPercentage: calculatedOverall,
      scores,
      structureSignature: sha256(structurePayload(scores)),
    },
  };
}

export function calculateHeadteacherFeedbackAggregate(
  input: CalculateHeadteacherFeedbackAggregateInput,
): HeadteacherFeedbackAggregateResult {
  const cycleId = clean(input.cycleId);
  if (!cycleId) return failure("INVALID_CYCLE_ID");

  if (clean(input.cycleStatus).toUpperCase() !== "CLOSED") {
    return failure("CYCLE_NOT_CLOSED");
  }

  if (clean(input.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow) {
    return failure("WORKFLOW_MISMATCH");
  }

  if (
    clean(input.instrumentCode) !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    input.instrumentVersion !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion
  ) {
    return failure("INSTRUMENT_MISMATCH");
  }

  const instrumentDefinitionHash = clean(
    input.instrumentDefinitionHash,
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(instrumentDefinitionHash)) {
    return failure("INSTRUMENT_DEFINITION_HASH_INVALID");
  }

  if (
    input.minimumResponses !==
    HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses
  ) {
    return failure("MINIMUM_RESPONSES_MISMATCH");
  }

  if (!Array.isArray(input.participants) || input.participants.length === 0) {
    return failure("PARTICIPANTS_REQUIRED");
  }

  const finalized: ValidatedFinalizedResponse[] = [];
  const responseHashes = new Set<string>();
  let expiredResponses = 0;
  let revokedResponses = 0;

  for (const participant of input.participants) {
    const participantStatus = clean(participant.status).toUpperCase();
    const responseStatus = clean(participant.response?.status).toUpperCase();

    if (
      participantStatus === "NOT_STARTED" ||
      participantStatus === "IN_PROGRESS" ||
      !["FINALIZED", "EXPIRED", "REVOKED"].includes(participantStatus)
    ) {
      return failure("PARTICIPANT_STATUS_INVALID_AFTER_CLOSURE");
    }

    if (participantStatus === "FINALIZED") {
      if (!participant.response || responseStatus !== "FINALIZED") {
        return failure("FINALIZED_PARTICIPANT_RESPONSE_MISSING");
      }

      const validated = validateFinalizedResponse(participant.response);
      if (!validated.ok) return failure(validated.code);

      if (responseHashes.has(validated.value.responseHash)) {
        return failure("DUPLICATE_FINALIZED_RESPONSE_HASH");
      }
      responseHashes.add(validated.value.responseHash);
      finalized.push(validated.value);
      continue;
    }

    if (responseStatus === "FINALIZED") {
      return failure("FINALIZED_RESPONSE_PARTICIPANT_MISMATCH");
    }

    if (participantStatus === "EXPIRED") expiredResponses += 1;
    if (participantStatus === "REVOKED") revokedResponses += 1;
  }

  const base: Omit<HeadteacherFeedbackAggregateReadiness, "readiness" | "snapshot"> = {
    cycleId,
    eligibleResponses: input.participants.length,
    finalizedResponses: finalized.length,
    expiredResponses,
    revokedResponses,
    minimumResponses: input.minimumResponses,
  };

  if (finalized.length < input.minimumResponses) {
    return {
      ok: true,
      value: {
        ...base,
        readiness: "INSUFFICIENT_RESPONSES",
        snapshot: null,
      },
    };
  }

  const structureSignatures = new Set(
    finalized.map((response) => response.structureSignature),
  );
  if (structureSignatures.size !== 1) {
    return failure("FINALIZED_RESPONSE_STRUCTURE_DRIFT");
  }

  const canonicalScores = structurePayload(finalized[0].scores);
  const sectionAverages: Record<string, number> = {};
  const sectionEvidence: Record<
    string,
    HeadteacherFeedbackAggregateSectionEvidence
  > = {};
  const itemAverages: Record<string, number | null> = {};
  const itemEvidence: Record<string, HeadteacherFeedbackAggregateItemEvidence> = {};

  const sectionRows = new Map<
    string,
    {
      sectionTitle: string;
      sectionOrder: number;
      sectionMaxScore: number;
    }
  >();

  for (const row of canonicalScores) {
    sectionRows.set(row.sectionKey, {
      sectionTitle: row.sectionTitle,
      sectionOrder: row.sectionOrder,
      sectionMaxScore: row.sectionMaxScore,
    });

    const applicableScores: number[] = [];
    let notApplicableResponses = 0;

    for (const response of finalized) {
      const score = response.scores.find(
        (candidate) => candidate.itemKey === row.itemKey,
      );
      if (!score) return failure("FINALIZED_RESPONSE_STRUCTURE_DRIFT");
      if (score.notApplicable) notApplicableResponses += 1;
      else applicableScores.push(score.score as number);
    }

    const averageScore =
      applicableScores.length > 0
        ? round2(
            applicableScores.reduce((sum, value) => sum + value, 0) /
              applicableScores.length,
          )
        : null;
    const averagePercentage =
      averageScore === null
        ? null
        : round2((averageScore / row.itemMaxScore) * 100);

    itemAverages[row.itemKey] = averageScore;
    itemEvidence[row.itemKey] = {
      itemKey: row.itemKey,
      itemLabel: row.itemLabel,
      itemOrder: row.itemOrder,
      itemMaxScore: row.itemMaxScore,
      sectionKey: row.sectionKey,
      sectionOrder: row.sectionOrder,
      applicableResponses: applicableScores.length,
      notApplicableResponses,
      averageScore,
      averagePercentage,
    };
  }

  for (const [sectionKey, section] of [...sectionRows.entries()].sort(
    ([, left], [, right]) => left.sectionOrder - right.sectionOrder,
  )) {
    const averagePercentage = round2(
      finalized.reduce(
        (sum, response) => sum + response.sectionPercentages[sectionKey],
        0,
      ) / finalized.length,
    );

    sectionAverages[sectionKey] = averagePercentage;
    sectionEvidence[sectionKey] = {
      sectionKey,
      sectionTitle: section.sectionTitle,
      sectionOrder: section.sectionOrder,
      sectionMaxScore: section.sectionMaxScore,
      finalizedResponses: finalized.length,
      averagePercentage,
    };
  }

  const overallPercentage = round2(
    Object.values(sectionAverages).reduce((sum, value) => sum + value, 0) /
      Object.keys(sectionAverages).length,
  );

  const sourceHash = sha256({
    schemaVersion: HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.schemaVersion,
    cycleId,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
    instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
    instrumentDefinitionHash,
    eligibleResponses: base.eligibleResponses,
    finalizedResponses: base.finalizedResponses,
    expiredResponses,
    revokedResponses,
    minimumResponses: input.minimumResponses,
    responseHashes: [...responseHashes].sort(),
    sectionAverages,
    itemAverages,
    sectionEvidence,
    itemEvidence,
    overallPercentage,
  });

  const snapshot: HeadteacherFeedbackAggregateSnapshotContract = {
    schemaVersion: 1,
    cycleId,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
    instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
    instrumentDefinitionHash,
    eligibleResponses: base.eligibleResponses,
    finalizedResponses: base.finalizedResponses,
    expiredResponses,
    revokedResponses,
    minimumResponses: input.minimumResponses,
    releaseEligible: true,
    overallPercentage,
    sectionAverages,
    itemAverages,
    sectionEvidence,
    itemEvidence,
    sourceHash,
    privacy: {
      containsRespondentIdentity: false,
      containsIndividualScores: false,
      containsResponseHashes: false,
      containsSubmissionTimestamps: false,
    },
  };

  return {
    ok: true,
    value: {
      ...base,
      readiness: "READY",
      snapshot,
    },
  };
}
