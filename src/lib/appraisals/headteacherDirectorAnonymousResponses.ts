// src/lib/appraisals/headteacherDirectorAnonymousResponses.ts
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackTargetInGovernanceScope,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { HEADTEACHER_DIRECTOR_REVIEW_POLICY } from "@/lib/appraisals/headteacherDirectorReview";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY = {
  schemaVersion: 1,
  audience: "DISTRICT_DIRECTOR",
  requiredCapability: HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
  requiredCycleStatus: "UNDER_REVIEW",
  requiredResponseStatus: "FINALIZED",
  respondentLabelsAreCycleScoped: true,
  respondentLabelsAreNotCrossCycleIdentifiers: true,
  stableOrderingBasis: "FINALIZED_RESPONSE_HASH",
  realRespondentIdentitiesIncluded: false,
  respondentUserIdsIncluded: false,
  participantIdsIncluded: false,
  responseIdsIncluded: false,
  responseHashesIncluded: false,
  submissionTimestampsIncluded: false,
  freeTextCommentsIncluded: false,
  individualFinalizedFormsIncluded: true,
  superadminIdentityPathSeparate: true,
  readOnly: true,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type HeadteacherDirectorAnonymousRespondentSummary = {
  respondentKey: string;
  label: string;
  status: "FINALIZED";
};

export type HeadteacherDirectorAnonymousFormItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  isRequired: boolean;
  score: number | null;
  notApplicable: boolean;
  answered: true;
};

export type HeadteacherDirectorAnonymousFormSection = {
  sectionKey: string;
  sectionTitle: string;
  description: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  items: HeadteacherDirectorAnonymousFormItem[];
};

export type HeadteacherDirectorAnonymousResponseForm = {
  respondentKey: string;
  label: string;
  responseStatus: "FINALIZED";
  officialForm: {
    documentTitle: string;
    schoolName: string;
    circuitName: string;
    headteacherName: string;
    instructions: string | null;
    scale: {
      minimum: number;
      maximum: number;
      allowNotApplicable: boolean;
    };
    sections: HeadteacherDirectorAnonymousFormSection[];
    overallPercentage: number;
  };
};

export type HeadteacherDirectorAnonymousResponsesView = {
  schemaVersion: 1;
  audience: "DISTRICT_DIRECTOR";
  cycle: {
    id: string;
    status: "UNDER_REVIEW";
    schoolId: string;
    schoolName: string;
    circuitId: string;
    circuitName: string;
    districtId: string;
    districtName: string;
    headteacherName: string;
  };
  respondents: HeadteacherDirectorAnonymousRespondentSummary[];
  selectedResponse: HeadteacherDirectorAnonymousResponseForm | null;
  privacy: {
    realRespondentIdentitiesIncluded: false;
    respondentUserIdsIncluded: false;
    participantIdsIncluded: false;
    responseIdsIncluded: false;
    responseHashesIncluded: false;
    submissionTimestampsIncluded: false;
    freeTextCommentsIncluded: false;
    anonymousLabelsAreCycleScoped: true;
    superadminIdentityPathSeparate: true;
  };
  integrity: {
    finalizedResponsesOnly: true;
    aggregateResponseCountMatched: true;
    responseHashesVerifiedInternally: true;
    readOnly: true;
  };
};

export type ReadHeadteacherDirectorAnonymousResponsesInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  respondentKey?: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  database?: HeadteacherDirectorAnonymousResponsesDatabase;
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

type CycleRecord = {
  id: string;
  status: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetNameSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  minimumResponses: number;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  scopeZone: {
    id: string;
    name: string;
    isActive: boolean;
    zoneType: {
      level: number;
      countryCode: string;
    };
  };
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
      purpose: string;
      subjectType: string;
      isActive: boolean;
    };
    sections: InstrumentSectionRecord[];
  };
};

type SnapshotRecord = {
  id: string;
  version: number;
  finalizedResponses: number;
  sourceHash: string;
};

type ResponseScoreRecord = {
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
  status: string;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  responseHash: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  participant: {
    id: string;
    status: string;
  };
  scores: ResponseScoreRecord[];
};

export type HeadteacherDirectorAnonymousResponsesDatabase = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findMany(args: unknown): Promise<SnapshotRecord[]>;
  };
  appraisalResponse: {
    findMany(args: unknown): Promise<ResponseRecord[]>;
  };
};

export class HeadteacherDirectorAnonymousResponsesError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorAnonymousResponsesError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CYCLE_SELECT = {
  id: true,
  status: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetZoneId: true,
  targetNameSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  targetRoleSnapshot: true,
  minimumResponses: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
  scopeZone: {
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: {
        select: {
          level: true,
          countryCode: true,
        },
      },
    },
  },
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
          purpose: true,
          subjectType: true,
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
} as const;

const SNAPSHOT_SELECT = {
  id: true,
  version: true,
  finalizedResponses: true,
  sourceHash: true,
} as const;

const RESPONSE_SELECT = {
  id: true,
  cycleId: true,
  participantId: true,
  instrumentVersionId: true,
  status: true,
  overallPercentage: true,
  sectionPercentagesJson: true,
  generalComment: true,
  responseHash: true,
  finalizedAt: true,
  metadata: true,
  participant: {
    select: {
      id: true,
      status: true,
    },
  },
  scores: {
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
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
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherDirectorAnonymousResponsesError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireSha256(value: unknown, code: string) {
  const hash = clean(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    fail(code, 409);
  }
  return hash;
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sectionPercentageMap(value: unknown) {
  const raw = objectValue(value);
  const percentages: Record<string, number | null> = {};
  for (const [key, nested] of Object.entries(raw)) {
    percentages[key] =
      typeof nested === "number" && Number.isFinite(nested) ? nested : null;
  }
  return percentages;
}

function responseHashPayload(input: {
  response: ResponseRecord;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number;
}) {
  const scoreByItemId = new Map(
    input.response.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    cycleId: input.response.cycleId,
    participantId: input.response.participantId,
    instrumentVersionId: input.response.instrumentVersionId,
    scores: input.sections.flatMap((section) =>
      section.items.map((item) => {
        const saved = scoreByItemId.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          score: saved?.score ?? null,
          notApplicable: saved?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages: input.sectionPercentages,
    overallPercentage: input.overallPercentage,
  };
}

function calculationRows(
  response: ResponseRecord,
  sections: InstrumentSectionRecord[],
) {
  const scoreByItemId = new Map(
    response.scores.map((score) => [score.instrumentItemId, score]),
  );
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const saved = scoreByItemId.get(item.id);
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

function assertCycleContract(cycle: CycleRecord) {
  const metadata = objectValue(cycle.metadata);
  if (
    clean(metadata.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    normalized(cycle.status) !==
      HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.requiredCycleStatus ||
    normalized(cycle.targetRoleSnapshot) !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    !clean(cycle.targetTenantId) ||
    !clean(cycle.targetZoneId) ||
    !clean(cycle.targetNameSnapshot) ||
    !clean(cycle.targetSchoolNameSnapshot) ||
    !clean(cycle.targetZoneNameSnapshot) ||
    cycle.minimumResponses !== 1 ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt ||
    cycle.cancelledAt ||
    cycle.scopeZone.id !== cycle.scopeZoneId ||
    cycle.scopeZone.zoneType.level !== 2 ||
    cycle.scopeZone.isActive !== true ||
    cycle.instrumentVersion.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    normalized(cycle.instrumentVersion.status) !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !== HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.purpose !== "HEADTEACHER_STAFF_FEEDBACK" ||
    cycle.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    cycle.instrumentVersion.allowComments !== false
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_CYCLE_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  const itemCount = cycle.instrumentVersion.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  if (cycle.instrumentVersion.sections.length < 1 || itemCount < 1) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_INSTRUMENT_EMPTY", 409);
  }
}

function verifyResponse(input: { response: ResponseRecord; cycle: CycleRecord }) {
  const { response, cycle } = input;
  const sections = cycle.instrumentVersion.sections;

  if (
    response.cycleId !== cycle.id ||
    response.instrumentVersionId !== cycle.instrumentVersion.id ||
    normalized(response.status) !== "FINALIZED" ||
    normalized(response.participant.status) !== "FINALIZED" ||
    response.participant.id !== response.participantId ||
    clean(response.generalComment) ||
    !response.finalizedAt ||
    typeof response.overallPercentage !== "number" ||
    !Number.isFinite(response.overallPercentage)
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_INVALID", 409);
  }

  const expectedItems = sections.flatMap((section) => section.items);
  const uniqueScoreIds = new Set(
    response.scores.map((score) => score.instrumentItemId),
  );
  if (
    response.scores.length !== expectedItems.length ||
    uniqueScoreIds.size !== expectedItems.length
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_SCORE_COUNT_DRIFT", 409);
  }

  const scoreByItemId = new Map(
    response.scores.map((score) => [score.instrumentItemId, score]),
  );

  for (const section of sections) {
    for (const item of section.items) {
      const saved = scoreByItemId.get(item.id);
      if (!saved) {
        fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_SCORE_MISSING", 409, {
          itemKey: item.key,
        });
      }
      const numericScore = Number(saved.score);
      if (
        saved.sectionKey !== section.key ||
        saved.sectionTitle !== section.title ||
        saved.sectionOrder !== section.order ||
        saved.sectionMaxScore !== section.maxScore ||
        saved.itemKey !== item.key ||
        saved.itemLabel !== item.label ||
        saved.itemOrder !== item.order ||
        saved.itemMaxScore !== item.maxScore ||
        (saved.notApplicable && saved.score !== null) ||
        (!saved.notApplicable &&
          (!Number.isInteger(numericScore) ||
            numericScore < cycle.instrumentVersion.scaleMin ||
            numericScore > item.maxScore))
      ) {
        fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_SCORE_DRIFT", 409, {
          itemKey: item.key,
        });
      }
    }
  }

  const calculated = calculateAppraisalScores(
    calculationRows(response, sections),
    { requireComplete: true },
  );
  if (!calculated.ok || calculated.value.overallPercentage === null) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_CALCULATION_INVALID", 409, {
      scoreError: calculated.ok ? "OVERALL_NULL" : calculated.code,
    });
  }

  const storedSections = sectionPercentageMap(response.sectionPercentagesJson);
  const calculatedSections =
    calculated.value.sectionPercentages as Record<string, number | null>;

  if (
    JSON.stringify(stableValue(storedSections)) !==
      JSON.stringify(stableValue(calculatedSections)) ||
    !closeEnough(
      response.overallPercentage,
      calculated.value.overallPercentage,
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_CALCULATION_DRIFT", 409);
  }

  const expectedHash = sha256(
    responseHashPayload({
      response,
      sections,
      sectionPercentages: calculatedSections,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );

  if (
    expectedHash !==
    requireSha256(
      response.responseHash,
      "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_HASH_INVALID",
    )
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_HASH_DRIFT", 409);
  }

  return {
    response,
    responseHash: expectedHash,
    sectionPercentages: calculatedSections,
    overallPercentage: calculated.value.overallPercentage,
  };
}

function respondentOrdinal(value: unknown, maximum: number) {
  const key = clean(value);
  if (!key) return null;

  const match = /^respondent-([1-9]\d{0,3})$/.exec(key);
  if (!match) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_KEY_INVALID", 400);
  }

  const ordinal = Number(match[1]);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > maximum) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_NOT_FOUND", 404);
  }
  return ordinal;
}

function anonymousSummary(index: number) {
  const ordinal = index + 1;
  return {
    respondentKey: `respondent-${ordinal}`,
    label: `Respondent ${ordinal}`,
    status: "FINALIZED" as const,
  };
}

function responseForm(input: {
  verified: ReturnType<typeof verifyResponse>;
  cycle: CycleRecord;
  index: number;
}): HeadteacherDirectorAnonymousResponseForm {
  const { verified, cycle, index } = input;
  const summary = anonymousSummary(index);
  const scoreByItemId = new Map(
    verified.response.scores.map((score) => [score.instrumentItemId, score]),
  );

  return {
    ...summary,
    responseStatus: "FINALIZED",
    officialForm: {
      documentTitle: cycle.instrumentVersion.title,
      schoolName: clean(cycle.targetSchoolNameSnapshot),
      circuitName: clean(cycle.targetZoneNameSnapshot),
      headteacherName: clean(cycle.targetNameSnapshot),
      instructions: cycle.instrumentVersion.instructions,
      scale: {
        minimum: cycle.instrumentVersion.scaleMin,
        maximum: cycle.instrumentVersion.scaleMax,
        allowNotApplicable: cycle.instrumentVersion.allowNotApplicable,
      },
      sections: cycle.instrumentVersion.sections.map((section) => ({
        sectionKey: section.key,
        sectionTitle: section.title,
        description: section.description,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        percentage: verified.sectionPercentages[section.key] ?? null,
        items: section.items.map((item) => {
          const saved = scoreByItemId.get(item.id);
          if (!saved) {
            fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_SCORE_MISSING", 409, {
              itemKey: item.key,
            });
          }
          return {
            itemKey: item.key,
            itemLabel: item.label,
            itemOrder: item.order,
            itemMaxScore: item.maxScore,
            isRequired: item.isRequired,
            score: saved.notApplicable ? null : saved.score,
            notApplicable: saved.notApplicable,
            answered: true as const,
          };
        }),
      })),
      overallPercentage: round2(verified.overallPercentage),
    },
  };
}

export async function readHeadteacherDirectorAnonymousResponses(
  input: ReadHeadteacherDirectorAnonymousResponsesInput,
): Promise<HeadteacherDirectorAnonymousResponsesView> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorAnonymousResponsesDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_DIRECTOR_ONLY", 403, {
      actorRole,
    });
  }

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.requiredCapability,
  );
  assertHeadteacherFeedbackInstrumentReady();

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: CYCLE_SELECT,
  });

  if (!cycle) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_CYCLE_NOT_FOUND", 404);
  }

  assertCycleContract(cycle);

  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );

  assertHeadteacherFeedbackTargetInGovernanceScope({
    governanceScope: input.governanceScope,
    targetTenantId,
  });

  const snapshots = await database.appraisalAggregateSnapshot.findMany({
    where: { cycleId },
    orderBy: { version: "desc" },
    take: 2,
    select: SNAPSHOT_SELECT,
  });

  if (
    snapshots.length !== 1 ||
    snapshots[0].version !== 1 ||
    !/^[a-f0-9]{64}$/.test(clean(snapshots[0].sourceHash).toLowerCase())
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_SNAPSHOT_INVALID", 409);
  }

  const responses = await database.appraisalResponse.findMany({
    where: {
      cycleId,
      status:
        HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.requiredResponseStatus,
      participant: {
        status:
          HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.requiredResponseStatus,
      },
    },
    select: RESPONSE_SELECT,
  });

  if (
    responses.length !== snapshots[0].finalizedResponses ||
    responses.length < 1
  ) {
    fail("HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_COUNT_DRIFT", 409, {
      aggregateFinalizedResponses: snapshots[0].finalizedResponses,
      actualFinalizedResponses: responses.length,
    });
  }

  const verified = responses
    .map((response) => verifyResponse({ response, cycle }))
    .sort(
      (left, right) =>
        left.responseHash.localeCompare(right.responseHash) ||
        left.response.id.localeCompare(right.response.id),
    );

  const respondents = verified.map((_, index) => anonymousSummary(index));
  const selectedOrdinal = respondentOrdinal(
    input.respondentKey,
    verified.length,
  );
  const selectedResponse =
    selectedOrdinal === null
      ? null
      : responseForm({
          verified: verified[selectedOrdinal - 1],
          cycle,
          index: selectedOrdinal - 1,
        });

  return {
    schemaVersion: 1,
    audience: "DISTRICT_DIRECTOR",
    cycle: {
      id: cycle.id,
      status: "UNDER_REVIEW",
      schoolId: targetTenantId,
      schoolName: clean(cycle.targetSchoolNameSnapshot),
      circuitId: requireIdentifier(cycle.targetZoneId, "targetZoneId"),
      circuitName: clean(cycle.targetZoneNameSnapshot),
      districtId: cycle.scopeZone.id,
      districtName: cycle.scopeZone.name,
      headteacherName: clean(cycle.targetNameSnapshot),
    },
    respondents,
    selectedResponse,
    privacy: {
      realRespondentIdentitiesIncluded: false,
      respondentUserIdsIncluded: false,
      participantIdsIncluded: false,
      responseIdsIncluded: false,
      responseHashesIncluded: false,
      submissionTimestampsIncluded: false,
      freeTextCommentsIncluded: false,
      anonymousLabelsAreCycleScoped: true,
      superadminIdentityPathSeparate: true,
    },
    integrity: {
      finalizedResponsesOnly: true,
      aggregateResponseCountMatched: true,
      responseHashesVerifiedInternally: true,
      readOnly: true,
    },
  };
}
