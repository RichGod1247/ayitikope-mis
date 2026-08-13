//src/lib/appraisals/headteacherReleasedResult.ts
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
  inspectHeadteacherSupervisoryInstrument,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY,
  computeHeadteacherDirectorDirectReleaseDecisionContractHash,
  computeHeadteacherDirectorDirectReleaseEvidenceHash,
  computeHeadteacherDirectorDirectReleaseProofHashFromMetadata,
  computeHeadteacherDirectorDirectReleaseRequestHash,
  type HeadteacherDirectorDirectReleaseHashEvidence,
} from "@/lib/appraisals/headteacherDirectorDirectRelease";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import {
  visitDetailsFromEvidenceSnapshot,
  type HeadteacherSupervisoryVisitDetailsSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_RELEASED_RESULT_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_HEADTEACHER",
  requiredRole: "HEADTEACHER",
  requiredCycleStatus: "RELEASED",
  requiredReviewDecision: "ACCEPTED",
  reviewedReleaseMode: "REVIEWED_DIRECTOR_RELEASE",
  directorAuthoredDirectReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
  dualReleaseModesSupported: true,
  requiredAssessmentStatus: "FINALIZED",
  releaseProofSchemaVersion: 1,
  aggregateSnapshotVersion: 1,
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  releaseNoteIncluded: true,
  responseCountsIncluded: false,
  staffItemAveragesIncluded: false,
  supervisoryItemScoresIncluded: true,
  supervisoryItemScoresReadOnly: true,
  supervisoryVisitDetailsIncluded: true,
  supervisoryVisitDetailsSource: "IMMUTABLE_EVIDENCE_SNAPSHOT",
  version1VisitCompatibility: "NULL_NOT_RECONSTRUCTED",
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  responseHashesIncluded: false,
  reviewerIdentityIncluded: false,
  assessorIdentityIncluded: false,
  reviewerContactDetailsIncluded: false,
  assessorContactDetailsIncluded: false,
  comparisonDirection: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
  comparisonThresholdsDefined: false,
  combinedWeightingDefined: false,
  scoreMutationAllowed: false,
  readOnly: true,
  databaseWritesAllowed: false,
  transactionRequired: false,
  databaseReadShape: "SEQUENTIAL_FOUR_READS",
  concurrentPrismaReadsAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

const RELEASE_METADATA_KEY = "headteacherDirectorRelease";

export type ReadHeadteacherReleasedResultInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  cycleId: string;
  database?: HeadteacherReleasedResultDatabase;
};

export type HeadteacherReleasedResultSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  staffFeedbackPercentage: number;
  supervisoryPercentage: number;
  supervisoryMinusStaffPercentagePoints: number;
};

export type HeadteacherReleasedResult = {
  schemaVersion: 1;
  audience: "RELEASED_HEADTEACHER";
  lifecycleState: "RELEASED";
  cycle: {
    id: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
    headteacherName: string;
    releasedAt: string;
  };
  release: {
    releaseProofHash: string;
    proofSchemaVersion: 1;
    releaseMode: "REVIEWED_DIRECTOR_RELEASE" | "DIRECTOR_AUTHORED_DIRECT_RELEASE";
    reviewStage: number | null;
    releaseNote: string | null;
    releaseNoteIncluded: boolean;
    integrityVerified: true;
  };
  staffFeedback: {
    overallPercentage: number;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      sectionMaxScore: number;
      averagePercentage: number;
    }>;
  };
  supervisoryAssessment: {
    revision: number;
    dateObserved: string;
    visit: HeadteacherSupervisoryVisitDetailsSnapshot | null;
    finalizedAt: string;
    overallPercentage: number;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      sectionMaxScore: number;
      percentage: number;
      items: Array<{
        itemKey: string;
        itemLabel: string;
        itemOrder: number;
        itemMaxScore: number;
        score: number | null;
        notApplicable: boolean;
      }>;
    }>;
  };
  comparison: {
    direction: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS";
    thresholdsDefined: false;
    combinedOverallPercentage: null;
    overall: {
      staffFeedbackPercentage: number;
      supervisoryPercentage: number;
      supervisoryMinusStaffPercentagePoints: number;
    };
    sections: HeadteacherReleasedResultSection[];
  };
  privacy: {
    responseCountsIncluded: false;
    staffItemAveragesIncluded: false;
    supervisoryItemScoresIncluded: true;
    respondentIdentitiesIncluded: false;
    individualStaffResponsesIncluded: false;
    participantListIncluded: false;
    responseHashesIncluded: false;
    reviewerIdentityIncluded: false;
    assessorIdentityIncluded: false;
    contactDetailsIncluded: false;
  };
  integrity: {
    cycleReviewProofCopiesMatch: true;
    releaseProofHashVerified: true;
    releaseRequestHashVerified: true;
    releaseNoteHashVerified: true;
    reviewEvidenceHashVerified: true;
    staffSnapshotProofAnchored: true;
    supervisoryAssessmentHashRecomputed: true;
    supervisoryItemScoresVerified: true;
    supervisoryVisitEvidenceVerified: true;
    separateEvidenceStreams: true;
    combinedWeightingDefined: false;
    scoreMutationAllowed: false;
  };
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  tenant: {
    id: string;
    name: string;
    status: string;
    zone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: { level: number; countryCode: string };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: { level: number; countryCode: string };
      };
    };
  };
};

type ReleasedCycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  status: string;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type SnapshotRecord = {
  id: string;
  cycleId: string;
  version: number;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: unknown;
  itemAveragesJson: unknown;
  sourceHash: string;
  generatedByUserId: string | null;
  generatedAt: Date;
  metadata: unknown;
};

type InstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
};

type InstrumentSectionRecord = {
  id: string;
  key: string;
  title: string;
  order: number;
  maxScore: number;
  items: InstrumentItemRecord[];
};

type AssessmentScoreRecord = {
  id: string;
  assessmentId: string;
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

type AssessmentRecord = {
  id: string;
  cycleId: string;
  instrumentVersionId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  dateObserved: Date | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  evidenceSnapshotJson: unknown;
  scores: AssessmentScoreRecord[];
  reviews: ReviewRecord[];
  instrumentVersion: {
    id: string;
    version: number;
    status: string;
    contentHash: string | null;
    instrument: {
      id: string;
      code: string;
      purpose: string;
      subjectType: string;
      isActive: boolean;
    };
    sections: InstrumentSectionRecord[];
  };
};

type ReviewRecord = {
  id: string;
  cycleId: string;
  assessmentId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string | null;
  stage: number;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

export type HeadteacherReleasedResultDatabase = {
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<ReleasedCycleRecord | null>;
  };
  appraisalAggregateSnapshot: {
    findUnique(args: unknown): Promise<SnapshotRecord | null>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
};

export class HeadteacherReleasedResultError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherReleasedResultError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  tenantId: true,
  status: true,
  role: { select: { name: true } },
  user: {
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
    },
  },
  tenant: {
    select: {
      id: true,
      name: true,
      status: true,
      zone: {
        select: {
          id: true,
          name: true,
          isActive: true,
          parentZoneId: true,
          zoneType: { select: { level: true, countryCode: true } },
          parentZone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              zoneType: { select: { level: true, countryCode: true } },
            },
          },
        },
      },
    },
  },
} as const;

const CYCLE_SELECT = {
  id: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetRoleSnapshot: true,
  status: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
} as const;

const SNAPSHOT_SELECT = {
  id: true,
  cycleId: true,
  version: true,
  eligibleResponses: true,
  finalizedResponses: true,
  expiredResponses: true,
  minimumResponses: true,
  releaseEligible: true,
  overallPercentage: true,
  sectionAveragesJson: true,
  itemAveragesJson: true,
  sourceHash: true,
  generatedByUserId: true,
  generatedAt: true,
  metadata: true,
} as const;

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  instrumentVersionId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  status: true,
  revision: true,
  dateObserved: true,
  overallPercentage: true,
  sectionPercentagesJson: true,
  generalComment: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  metadata: true,
  evidenceSnapshotJson: true,
  reviews: {
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      cycleId: true,
      assessmentId: true,
      reviewerUserId: true,
      reviewerAssignmentId: true,
      stage: true,
      decision: true,
      note: true,
      decidedAt: true,
      metadata: true,
      createdAt: true,
    },
  },
  scores: {
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
    select: {
      id: true,
      assessmentId: true,
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
  instrumentVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      contentHash: true,
      instrument: {
        select: {
          id: true,
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
            },
          },
        },
      },
    },
  },
} as const;


function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function personName(user: TargetMembershipRecord["user"]) {
  const preferred = clean(user.name);
  if (preferred) return preferred;

  return (
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    "Headteacher"
  );
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

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherReleasedResultError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_RELEASED_RESULT_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function sectionPercentageMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(objectValue(value)).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function calculationRows(
  assessment: AssessmentRecord,
  sections: InstrumentSectionRecord[],
) {
  const stored = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = stored.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: score?.score ?? null,
        notApplicable: score?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function assessmentHashPayload(input: {
  assessment: AssessmentRecord;
  visitContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(
    input.assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
      dateObserved: input.assessment.dateObserved
        ? isoDateOnly(input.assessment.dateObserved)
        : null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.assessment.instrumentVersionId,
      code: input.assessment.instrumentVersion.instrument.code,
      version: input.assessment.instrumentVersion.version,
      contentHash: clean(
        input.assessment.instrumentVersion.contentHash,
      ).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      section.items.map((item) => {
        const score = stored.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score?.score ?? null,
          notApplicable: score?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages: input.sectionPercentages,
    overallPercentage: input.overallPercentage,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function verifyAssessment(assessment: AssessmentRecord) {
  const policy = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  const instrumentContract = inspectHeadteacherSupervisoryInstrument();
  if (!instrumentContract.valid) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_INSTRUMENT_DRIFT", 409);
  }
  if (
    normalized(assessment.status) !== "FINALIZED" ||
    !assessment.finalizedAt ||
    assessment.finalizedByUserId !== assessment.assessorUserId ||
    !assessment.assessorAssignmentId ||
    !assessment.dateObserved ||
    clean(assessment.generalComment) ||
    !isSha256(assessment.assessmentHash) ||
    assessment.instrumentVersionId !== assessment.instrumentVersion.id ||
    assessment.instrumentVersion.version !== policy.instrumentVersion ||
    normalized(assessment.instrumentVersion.status) !== "ACTIVE" ||
    assessment.instrumentVersion.instrument.code !== policy.instrumentCode ||
    assessment.instrumentVersion.instrument.purpose !==
      "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    assessment.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    assessment.instrumentVersion.instrument.isActive !== true ||
    !isSha256(assessment.instrumentVersion.contentHash)
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_EVIDENCE_INVALID", 409);
  }

  const sections = [...assessment.instrumentVersion.sections].sort(
    (left, right) => left.order - right.order,
  );
  const itemCount = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  if (
    sections.length !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedSectionCount ||
    itemCount !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedItemCount ||
    JSON.stringify(sections.map((section) => section.maxScore)) !==
      JSON.stringify(HEADTEACHER_RELEASED_RESULT_POLICY.expectedSectionMaximums)
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_STRUCTURE_DRIFT", 409);
  }

  const uniqueScoreIds = new Set(
    assessment.scores.map((score) => score.instrumentItemId),
  );
  if (
    assessment.scores.length !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedItemCount ||
    uniqueScoreIds.size !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedItemCount
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_SCORE_COUNT_DRIFT", 409);
  }

  const calculated = calculateAppraisalScores(
    calculationRows(assessment, sections),
    { requireComplete: true },
  );
  if (!calculated.ok) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_SCORES_INVALID", 409, {
      scoreError: calculated.code,
    });
  }

  const storedSections = sectionPercentageMap(
    assessment.sectionPercentagesJson,
  );
  if (
    !sameJson(storedSections, calculated.value.sectionPercentages) ||
    assessment.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_CALCULATION_DRIFT", 409);
  }

  const visitContextHash = clean(
    objectValue(assessment.metadata).visitContextHash,
  ).toLowerCase();
  if (!isSha256(visitContextHash)) {
    fail("HEADTEACHER_RELEASED_RESULT_VISIT_CONTEXT_HASH_INVALID", 409);
  }
  const expectedHash = hashJson(
    assessmentHashPayload({
      assessment,
      visitContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(assessment.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_HASH_DRIFT", 409);
  }

  return {
    hash: expectedHash,
    sections,
    sectionPercentages: calculated.value.sectionPercentages,
    overallPercentage: calculated.value.overallPercentage,
  };
}

function snapshotSections(snapshot: SnapshotRecord) {
  const metadata = objectValue(snapshot.metadata);
  const privacy = objectValue(metadata.privacy);
  const sourceIntegrity = objectValue(metadata.sourceIntegrity);
  if (
    snapshot.version !== 1 ||
    snapshot.releaseEligible !== true ||
    snapshot.minimumResponses !== 1 ||
    snapshot.finalizedResponses < 1 ||
    typeof snapshot.overallPercentage !== "number" ||
    !isSha256(snapshot.sourceHash) ||
    snapshot.generatedByUserId !== null ||
    clean(metadata.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    Number(metadata.aggregateSchemaVersion) !== 1 ||
    clean(metadata.instrumentCode) !== HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    Number(metadata.instrumentVersion) !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    !isSha256(metadata.instrumentDefinitionHash) ||
    normalized(metadata.readiness) !== "READY" ||
    privacy.respondentIdentitiesIncluded !== false ||
    privacy.individualScoresIncluded !== false ||
    privacy.responseHashesIncluded !== false ||
    privacy.submissionTimestampsIncluded !== false ||
    privacy.participantListIncluded !== false ||
    sourceIntegrity.finalizedResponsesOnly !== true ||
    sourceIntegrity.finalizedResponseHashesVerified !== true ||
    sourceIntegrity.storedCalculationsRecomputed !== true ||
    Number(sourceIntegrity.immutableSnapshotVersion) !== 1
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_STAFF_SNAPSHOT_INVALID", 409);
  }

  const sectionRows = Object.values(objectValue(snapshot.sectionAveragesJson))
    .map((value) => objectValue(value))
    .sort((left, right) => Number(left.sectionOrder) - Number(right.sectionOrder));
  const itemRows = Object.values(objectValue(snapshot.itemAveragesJson))
    .map((value) => objectValue(value));

  if (
    sectionRows.length !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedSectionCount ||
    itemRows.length !== HEADTEACHER_RELEASED_RESULT_POLICY.expectedItemCount ||
    JSON.stringify(sectionRows.map((row) => Number(row.sectionMaxScore))) !==
      JSON.stringify(HEADTEACHER_RELEASED_RESULT_POLICY.expectedSectionMaximums)
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_STAFF_SNAPSHOT_STRUCTURE_DRIFT", 409);
  }

  return { sectionRows, itemRows };
}

function assertSharedItemBank(input: {
  assessmentSections: InstrumentSectionRecord[];
  snapshotSections: Record<string, unknown>[];
  snapshotItems: Record<string, unknown>[];
}) {
  const officialItems = input.assessmentSections.flatMap((section) =>
    section.items.map((item) => ({
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
    })),
  );
  const snapshotItems = [...input.snapshotItems].sort((left, right) => {
    const sectionDelta = Number(left.sectionOrder) - Number(right.sectionOrder);
    return sectionDelta || Number(left.itemOrder) - Number(right.itemOrder);
  });
  for (let index = 0; index < officialItems.length; index += 1) {
    const official = officialItems[index];
    const row = snapshotItems[index];
    if (
      clean(row.sectionKey) !== official.sectionKey ||
      Number(row.sectionOrder) !== official.sectionOrder ||
      clean(row.itemKey) !== official.itemKey ||
      clean(row.itemLabel) !== official.itemLabel ||
      Number(row.itemOrder) !== official.itemOrder ||
      Number(row.itemMaxScore) !== official.itemMaxScore
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_SHARED_ITEM_BANK_DRIFT", 409, {
        itemKey: official.itemKey,
      });
    }
  }

  for (let index = 0; index < input.assessmentSections.length; index += 1) {
    const official = input.assessmentSections[index];
    const row = input.snapshotSections[index];
    if (
      clean(row.sectionKey) !== official.key ||
      clean(row.sectionTitle) !== official.title ||
      Number(row.sectionOrder) !== official.order ||
      Number(row.sectionMaxScore) !== official.maxScore ||
      typeof row.averagePercentage !== "number"
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_SHARED_SECTION_BANK_DRIFT", 409, {
        sectionKey: official.key,
      });
    }
  }
}

function releaseProofPayload(release: Record<string, unknown>) {
  return {
    proofSchemaVersion: release.proofSchemaVersion,
    workflow: release.workflow,
    cycleId: release.cycleId,
    reviewId: release.reviewId,
    reviewStage: release.reviewStage,
    reviewDecision: release.reviewDecision,
    assessmentId: release.assessmentId,
    assessmentStatus: release.assessmentStatus,
    snapshotId: release.snapshotId,
    reviewEvidenceHash: release.reviewEvidenceHash,
    staffSourceHash: release.staffSourceHash,
    supervisoryAssessmentHash: release.supervisoryAssessmentHash,
    decisionContractHash: release.decisionContractHash,
    releaseRequestHash: release.releaseRequestHash,
    reviewerUserId: release.reviewerUserId,
    reviewerAssignmentId: release.reviewerAssignmentId,
    releasedAt: release.releasedAt,
    assessmentMutationPerformed: release.assessmentMutationPerformed,
    scoreMutationPerformed: release.scoreMutationPerformed,
    respondentIdentitiesAccessed: release.respondentIdentitiesAccessed,
    individualStaffResponsesAccessed: release.individualStaffResponsesAccessed,
    reviewerMayRewriteScores: release.reviewerMayRewriteScores,
    separateEvidenceStreams: release.separateEvidenceStreams,
    combinedWeightingDefined: release.combinedWeightingDefined,
    notificationsSeeded: release.notificationsSeeded,
    notificationReadiness: release.notificationReadiness,
    providerCalled: release.providerCalled,
  };
}

function reviewEvidenceAnchors(review: ReviewRecord) {
  const metadata = objectValue(review.metadata);
  const evidence = objectValue(metadata.evidence);
  const staff = objectValue(evidence.staffFeedback);
  const supervisory = objectValue(evidence.supervisoryAssessment);
  const reviewerAssignmentId = clean(review.reviewerAssignmentId);
  const payload = {
    schemaVersion: Number(metadata.schemaVersion),
    workflow: clean(metadata.workflow),
    cycleId: review.cycleId,
    reviewerUserId: review.reviewerUserId,
    reviewerAssignmentId,
    staffFeedback: {
      snapshotId: clean(staff.snapshotId),
      snapshotVersion: Number(staff.snapshotVersion),
      sourceHash: clean(staff.sourceHash).toLowerCase(),
      finalizedResponses: Number(staff.finalizedResponses),
      minimumResponses: Number(staff.minimumResponses),
    },
    supervisoryAssessment: {
      assessmentId: clean(supervisory.assessmentId),
      revision: Number(supervisory.revision),
      assessmentHash: clean(supervisory.assessmentHash).toLowerCase(),
      assessorAssignmentId: clean(supervisory.assessorAssignmentId),
      directorAuthored: supervisory.directorAuthored === true,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  };
  const expectedHash = hashJson(payload);
  if (
    !reviewerAssignmentId ||
    payload.schemaVersion !== 1 ||
    payload.workflow !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    payload.staffFeedback.snapshotVersion !== 1 ||
    payload.staffFeedback.finalizedResponses < 1 ||
    payload.staffFeedback.minimumResponses !== 1 ||
    !payload.staffFeedback.snapshotId ||
    !isSha256(payload.staffFeedback.sourceHash) ||
    payload.supervisoryAssessment.assessmentId !== review.assessmentId ||
    payload.supervisoryAssessment.revision < 1 ||
    !payload.supervisoryAssessment.assessorAssignmentId ||
    !isSha256(payload.supervisoryAssessment.assessmentHash) ||
    metadata.respondentIdentitiesAccessed !== false ||
    metadata.individualStaffResponsesAccessed !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.separateEvidenceStreams !== true ||
    metadata.combinedWeightingDefined !== false ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !== expectedHash
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_REVIEW_EVIDENCE_DRIFT", 409);
  }
  return {
    reviewEvidenceHash: expectedHash,
    snapshotId: payload.staffFeedback.snapshotId,
    staffSourceHash: payload.staffFeedback.sourceHash,
    assessmentHash: payload.supervisoryAssessment.assessmentHash,
  };
}

function releaseRequestHash(input: {
  cycleId: string;
  review: ReviewRecord;
  release: Record<string, unknown>;
  note: string;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    cycleId: input.cycleId,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.review.assessmentId,
    reviewerUserId: clean(input.release.reviewerUserId),
    reviewerAssignmentId: clean(input.release.reviewerAssignmentId),
    reviewEvidenceHash: clean(input.release.reviewEvidenceHash).toLowerCase(),
    snapshotId: clean(input.release.snapshotId),
    staffSourceHash: clean(input.release.staffSourceHash).toLowerCase(),
    supervisoryAssessmentHash: clean(
      input.release.supervisoryAssessmentHash,
    ).toLowerCase(),
    decisionContractHash: clean(
      input.release.decisionContractHash,
    ).toLowerCase(),
    decision: "RELEASE",
    note: input.note || null,
    cycleNextStatus: "RELEASED",
    reviewNextDecision: "ACCEPTED",
    assessmentNextStatus: "FINALIZED",
    assessmentMutationAllowed: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
}

function verifyReviewChain(reviews: ReviewRecord[], accepted: ReviewRecord) {
  const ordered = [...reviews].sort((left, right) => left.stage - right.stage);
  if (ordered.length === 0 || ordered.at(-1)?.id !== accepted.id) {
    fail("HEADTEACHER_RELEASED_RESULT_CURRENT_REVIEW_DRIFT", 409);
  }
  ordered.forEach((review, index) => {
    const expectedStage = index + 1;
    const isCurrent = review.id === accepted.id;
    if (
      review.stage !== expectedStage ||
      review.cycleId !== accepted.cycleId ||
      review.assessmentId !== accepted.assessmentId ||
      (isCurrent
        ? normalized(review.decision) !== "ACCEPTED"
        : normalized(review.decision) !== "HELD") ||
      !review.decidedAt ||
      (!isCurrent && !clean(review.note))
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_REVIEW_CHAIN_DRIFT", 409, {
        reviewStage: review.stage,
      });
    }
  });
}

export async function readHeadteacherReleasedResult(
  input: ReadHeadteacherReleasedResultInput,
): Promise<HeadteacherReleasedResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRole = effectiveRole(input.actorRoleName);
  if (actorRole !== HEADTEACHER_RELEASED_RESULT_POLICY.requiredRole) {
    fail("HEADTEACHER_RELEASED_RESULT_ROLE_FORBIDDEN", 403, { actorRole });
  }

  const database =
    input.database ?? (prisma as unknown as HeadteacherReleasedResultDatabase);
  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: CYCLE_SELECT,
  });
  if (!cycle) fail("HEADTEACHER_RELEASED_RESULT_CYCLE_NOT_FOUND", 404);
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetTenantId !== actorTenantId ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER"
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_TARGET_FORBIDDEN", 403);
  }
  if (
    normalized(cycle.status) !== "RELEASED" ||
    !cycle.releasedAt ||
    cycle.cancelledAt
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_NOT_RELEASED", 409, {
      cycleStatus: normalized(cycle.status),
    });
  }

  const memberships = await database.membership.findMany({
    where: {
      userId: actorUserId,
      tenantId: actorTenantId,
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: { status: "ACTIVE" },
    },
    select: MEMBERSHIP_SELECT,
  });
  if (memberships.length !== 1) {
    fail("HEADTEACHER_RELEASED_RESULT_ACTIVE_MEMBERSHIP_REQUIRED", 403, {
      matches: memberships.length,
    });
  }
  const membership = memberships[0];
  const zone = membership.tenant.zone;
  if (
    membership.userId !== actorUserId ||
    membership.tenantId !== actorTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    !zone.isActive ||
    zone.zoneType.level !== 1 ||
    zone.parentZoneId !== cycle.scopeZoneId ||
    !zone.parentZone ||
    !zone.parentZone.isActive ||
    zone.parentZone.id !== cycle.scopeZoneId ||
    zone.parentZone.zoneType.level !== 2
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_MEMBERSHIP_SCOPE_DRIFT", 409);
  }

  const cycleMetadata = objectValue(cycle.metadata);
  const cycleRelease = objectValue(cycleMetadata[RELEASE_METADATA_KEY]);
  const directRelease =
    clean(cycleRelease.releaseMode) ===
    HEADTEACHER_RELEASED_RESULT_POLICY.directorAuthoredDirectReleaseMode;
  const releaseMode = directRelease
    ? HEADTEACHER_RELEASED_RESULT_POLICY.directorAuthoredDirectReleaseMode
    : HEADTEACHER_RELEASED_RESULT_POLICY.reviewedReleaseMode;
  const assessmentId = requireIdentifier(
    cycleRelease.assessmentId,
    "assessmentId",
  );
  const snapshotId = requireIdentifier(cycleRelease.snapshotId, "snapshotId");
  const reviewId = directRelease
    ? null
    : requireIdentifier(cycleRelease.reviewId, "reviewId");

  const assessment = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: ASSESSMENT_SELECT,
  });
  if (!assessment) {
    fail("HEADTEACHER_RELEASED_RESULT_ASSESSMENT_NOT_FOUND", 409);
  }
  if (
    assessment.cycleId !== cycleId ||
    normalized(assessment.status) !== "FINALIZED"
  ) {
    fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_EVIDENCE_INVALID", 409);
  }

  const snapshot = await database.appraisalAggregateSnapshot.findUnique({
    where: { id: snapshotId },
    select: SNAPSHOT_SELECT,
  });
  if (!snapshot) fail("HEADTEACHER_RELEASED_RESULT_SNAPSHOT_NOT_FOUND", 409);
  if (snapshot.cycleId !== cycleId) {
    fail("HEADTEACHER_RELEASED_RESULT_SNAPSHOT_CYCLE_DRIFT", 409);
  }

  const verifiedAssessment = verifyAssessment(assessment);
  const visitContextHash = clean(
    objectValue(assessment.metadata).visitContextHash,
  ).toLowerCase();
  const visitDetails = visitDetailsFromEvidenceSnapshot(
    assessment.evidenceSnapshotJson,
  );
  const verifiedSnapshot = snapshotSections(snapshot);
  assertSharedItemBank({
    assessmentSections: verifiedAssessment.sections,
    snapshotSections: verifiedSnapshot.sectionRows,
    snapshotItems: verifiedSnapshot.itemRows,
  });

  let review: ReviewRecord | null = null;
  let reviewStage: number | null = null;
  let releaseNote = "";
  let releaseNoteIncluded = false;
  let expectedRequestHash = "";
  let expectedProofHash = "";

  if (directRelease) {
    if (assessment.reviews.length !== 0) {
      fail("HEADTEACHER_RELEASED_RESULT_DIRECT_RELEASE_REVIEW_ROWS_PRESENT", 409, {
        reviewRows: assessment.reviews.length,
      });
    }

    const frozen = objectValue(assessment.evidenceSnapshotJson);
    const frozenAssessor = objectValue(frozen.assessor);
    const frozenJurisdiction = objectValue(frozen.jurisdiction);
    const frozenRole = canonicalHeadteacherSupervisoryAssessorRole(
      clean(frozenAssessor.role) || clean(frozenAssessor.assignmentRole),
    );
    const assessorAssignmentId = clean(assessment.assessorAssignmentId);
    const releaserAssignmentId = clean(cycleRelease.releaserAssignmentId);
    const cycleReview = objectValue(cycleMetadata.headteacherSupervisoryReview);

    if (
      frozenRole !== "DISTRICT_DIRECTOR" ||
      clean(frozenAssessor.userId) !== assessment.assessorUserId ||
      clean(frozenAssessor.assignmentId) !== assessorAssignmentId ||
      clean(frozenJurisdiction.districtZoneId) !== cycle.scopeZoneId ||
      Number(cycleRelease.proofSchemaVersion) !== 1 ||
      clean(cycleRelease.releaseMode) !==
        HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
      clean(cycleRelease.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
      clean(cycleRelease.evidenceStream) !==
        HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.evidenceStream ||
      clean(cycleRelease.cycleId) !== cycleId ||
      clean(cycleRelease.assessmentId) !== assessment.id ||
      Number(cycleRelease.assessmentRevision) !== 1 ||
      assessment.revision !== 1 ||
      normalized(cycleRelease.assessmentStatus) !== "FINALIZED" ||
      clean(cycleRelease.assessmentHash).toLowerCase() !==
        verifiedAssessment.hash ||
      clean(cycleRelease.visitContextHash).toLowerCase() !== visitContextHash ||
      clean(cycleRelease.snapshotId) !== snapshot.id ||
      Number(cycleRelease.snapshotVersion) !== 1 ||
      clean(cycleRelease.staffSourceHash).toLowerCase() !==
        clean(snapshot.sourceHash).toLowerCase() ||
      Number(cycleRelease.finalizedResponses) !== snapshot.finalizedResponses ||
      Number(cycleRelease.minimumResponses) !== snapshot.minimumResponses ||
      clean(cycleRelease.assessorUserId) !== assessment.assessorUserId ||
      clean(cycleRelease.assessorAssignmentId) !== assessorAssignmentId ||
      clean(cycleRelease.assessorRole) !== "DISTRICT_DIRECTOR" ||
      cycleRelease.reviewRowsRequired !== false ||
      cycleRelease.reviewRowsPresent !== false ||
      cycleRelease.selfReviewPerformed !== false ||
      clean(cycleRelease.releaserUserId) !== assessment.assessorUserId ||
      !releaserAssignmentId ||
      releaserAssignmentId !== assessorAssignmentId ||
      clean(cycleRelease.releaserRole) !== "DISTRICT_DIRECTOR" ||
      clean(cycleRelease.releasedAt) !== cycle.releasedAt.toISOString() ||
      cycleRelease.releaseNoteIncluded !== false ||
      cycleRelease.releaseNoteHash !== null ||
      cycleRelease.assessmentMutationPerformed !== false ||
      cycleRelease.scoreMutationPerformed !== false ||
      cycleRelease.visitContextMutationPerformed !== false ||
      cycleRelease.reviewerMayRewriteScores !== false ||
      cycleRelease.respondentIdentitiesAccessed !== false ||
      cycleRelease.individualStaffResponsesAccessed !== false ||
      cycleRelease.separateEvidenceStreams !== true ||
      cycleRelease.combinedWeightingDefined !== false ||
      cycleRelease.notificationsSeeded !== false ||
      cycleRelease.notificationReadiness !== "READY_FOR_POST_RELEASE_SEEDING" ||
      cycleRelease.providerCalled !== false ||
      clean(cycleReview.state) !== "RELEASED" ||
      clean(cycleReview.releaseMode) !==
        HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
      cycleReview.currentReviewId !== null ||
      cycleReview.currentReviewStage !== null ||
      cycleReview.currentReviewDecision !== null ||
      cycleReview.currentReviewerRole !== null ||
      cycleReview.currentReviewerAssignmentId !== null ||
      cycleReview.reviewEvidenceHash !== null ||
      cycleReview.reviewRowsRequired !== false ||
      cycleReview.reviewRowsPresent !== false ||
      cycleReview.selfReviewPerformed !== false ||
      clean(cycleReview.admittedAssessmentId) !== assessment.id ||
      Number(cycleReview.admittedAssessmentRevision) !== 1 ||
      clean(cycleReview.assessmentHash).toLowerCase() !== verifiedAssessment.hash ||
      clean(cycleReview.visitContextHash).toLowerCase() !== visitContextHash ||
      clean(cycleReview.staffSnapshotId) !== snapshot.id ||
      clean(cycleReview.staffSourceHash).toLowerCase() !==
        clean(snapshot.sourceHash).toLowerCase() ||
      clean(cycleReview.directReleasedByUserId) !== assessment.assessorUserId ||
      clean(cycleReview.directReleasedByAssignmentId) !== assessorAssignmentId ||
      clean(cycleReview.directReleasedByRole) !== "DISTRICT_DIRECTOR" ||
      cycleReview.awaitingRevision !== false ||
      cycleReview.awaitingDirectorAdmission !== false ||
      cycleReview.directorReviewCreated !== false ||
      cycleReview.reviewerMayRewriteScores !== false ||
      cycleReview.separateEvidenceStreams !== true ||
      cycleReview.combinedWeightingDefined !== false ||
      cycleReview.respondentIdentitiesAccessed !== false ||
      cycleReview.individualStaffResponsesAccessed !== false ||
      cycleReview.notificationsSeeded !== false ||
      cycleReview.providerCalled !== false ||
      clean(cycleReview.releasedAt) !== cycle.releasedAt.toISOString()
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_DIRECT_RELEASE_PROOF_INVALID", 409);
    }

    const hashEvidence: HeadteacherDirectorDirectReleaseHashEvidence = {
      cycleId,
      assessmentId: assessment.id,
      assessmentRevision: assessment.revision,
      assessmentHash: verifiedAssessment.hash,
      visitContextHash,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId,
      snapshotId: snapshot.id,
      snapshotVersion: snapshot.version,
      staffSourceHash: clean(snapshot.sourceHash).toLowerCase(),
      finalizedResponses: snapshot.finalizedResponses,
      minimumResponses: snapshot.minimumResponses,
    };
    const decisionContractHash =
      computeHeadteacherDirectorDirectReleaseDecisionContractHash();
    expectedRequestHash = computeHeadteacherDirectorDirectReleaseRequestHash({
      evidence: hashEvidence,
      releaserAssignmentId,
      decisionContractHash,
    });
    const expectedEvidenceHash =
      computeHeadteacherDirectorDirectReleaseEvidenceHash({
        evidence: hashEvidence,
        releaseRequestHash: expectedRequestHash,
      });
    expectedProofHash =
      computeHeadteacherDirectorDirectReleaseProofHashFromMetadata(cycleRelease);

    if (
      clean(cycleRelease.decisionContractHash).toLowerCase() !==
        decisionContractHash ||
      clean(cycleRelease.releaseRequestHash).toLowerCase() !==
        expectedRequestHash ||
      clean(cycleRelease.releaseEvidenceHash).toLowerCase() !==
        expectedEvidenceHash ||
      !isSha256(cycleRelease.releaseProofHash) ||
      clean(cycleRelease.releaseProofHash).toLowerCase() !== expectedProofHash ||
      clean(cycleReview.releaseProofHash).toLowerCase() !== expectedProofHash
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_DIRECT_RELEASE_HASH_DRIFT", 409);
    }
  } else {
    review = assessment.reviews.find((row) => row.id === reviewId) ?? null;
    if (!review) fail("HEADTEACHER_RELEASED_RESULT_REVIEW_NOT_FOUND", 409);
    verifyReviewChain(assessment.reviews, review);

    const reviewRelease = objectValue(
      objectValue(review.metadata)[RELEASE_METADATA_KEY],
    );
    if (!sameJson(cycleRelease, reviewRelease)) {
      fail("HEADTEACHER_RELEASED_RESULT_RELEASE_PROOF_COPY_DRIFT", 409);
    }
    if (
      review.cycleId !== cycleId ||
      review.assessmentId !== assessmentId ||
      normalized(review.decision) !== "ACCEPTED" ||
      !review.decidedAt ||
      review.decidedAt.toISOString() !== cycle.releasedAt.toISOString() ||
      Number(cycleRelease.proofSchemaVersion) !== 1 ||
      clean(cycleRelease.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
      clean(cycleRelease.cycleId) !== cycleId ||
      clean(cycleRelease.reviewId) !== review.id ||
      Number(cycleRelease.reviewStage) !== review.stage ||
      normalized(cycleRelease.reviewDecision) !== "ACCEPTED" ||
      clean(cycleRelease.assessmentId) !== assessment.id ||
      normalized(cycleRelease.assessmentStatus) !== "FINALIZED" ||
      clean(cycleRelease.snapshotId) !== snapshot.id ||
      clean(cycleRelease.releasedAt) !== cycle.releasedAt.toISOString() ||
      cycleRelease.assessmentMutationPerformed !== false ||
      cycleRelease.scoreMutationPerformed !== false ||
      cycleRelease.respondentIdentitiesAccessed !== false ||
      cycleRelease.individualStaffResponsesAccessed !== false ||
      cycleRelease.reviewerMayRewriteScores !== false ||
      cycleRelease.separateEvidenceStreams !== true ||
      cycleRelease.combinedWeightingDefined !== false ||
      cycleRelease.notificationsSeeded !== false ||
      cycleRelease.notificationReadiness !== "READY_FOR_POST_RELEASE_SEEDING" ||
      cycleRelease.providerCalled !== false ||
      !isSha256(cycleRelease.decisionContractHash) ||
      !isSha256(cycleRelease.releaseRequestHash) ||
      !isSha256(cycleRelease.releaseProofHash)
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_RELEASE_PROOF_INVALID", 409);
    }

    const anchors = reviewEvidenceAnchors(review);
    if (
      anchors.snapshotId !== snapshot.id ||
      anchors.staffSourceHash !== clean(snapshot.sourceHash).toLowerCase() ||
      anchors.assessmentHash !== verifiedAssessment.hash ||
      clean(cycleRelease.reviewEvidenceHash).toLowerCase() !==
        anchors.reviewEvidenceHash ||
      clean(cycleRelease.staffSourceHash).toLowerCase() !==
        anchors.staffSourceHash ||
      clean(cycleRelease.supervisoryAssessmentHash).toLowerCase() !==
        anchors.assessmentHash
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_EVIDENCE_ANCHOR_DRIFT", 409);
    }

    releaseNote = clean(review.note);
    releaseNoteIncluded = cycleRelease.releaseNoteIncluded === true;
    const expectedNoteHash = releaseNote ? hashJson({ note: releaseNote }) : null;
    if (
      releaseNoteIncluded !== Boolean(releaseNote) ||
      (expectedNoteHash
        ? clean(cycleRelease.releaseNoteHash).toLowerCase() !== expectedNoteHash
        : cycleRelease.releaseNoteHash !== null)
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_RELEASE_NOTE_HASH_DRIFT", 409);
    }

    expectedRequestHash = releaseRequestHash({
      cycleId,
      review,
      release: cycleRelease,
      note: releaseNote,
    });
    if (
      clean(cycleRelease.releaseRequestHash).toLowerCase() !==
      expectedRequestHash
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_RELEASE_REQUEST_HASH_DRIFT", 409);
    }
    expectedProofHash = hashJson(releaseProofPayload(cycleRelease));
    if (
      clean(cycleRelease.releaseProofHash).toLowerCase() !== expectedProofHash
    ) {
      fail("HEADTEACHER_RELEASED_RESULT_RELEASE_PROOF_HASH_DRIFT", 409);
    }
    reviewStage = review.stage;
  }

  const staffSections = verifiedSnapshot.sectionRows.map((row) => ({
    sectionKey: clean(row.sectionKey),
    sectionTitle: clean(row.sectionTitle),
    sectionOrder: Number(row.sectionOrder),
    sectionMaxScore: Number(row.sectionMaxScore),
    averagePercentage: Number(row.averagePercentage),
  }));
  const supervisoryScoreByItemId = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  const supervisorySections = verifiedAssessment.sections.map((section) => {
    const percentage = verifiedAssessment.sectionPercentages[section.key];
    if (typeof percentage !== "number") {
      fail("HEADTEACHER_RELEASED_RESULT_SECTION_PERCENTAGE_INVALID", 409, {
        sectionKey: section.key,
      });
    }

    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      percentage,
      items: section.items.map((item) => {
        const saved = supervisoryScoreByItemId.get(item.id);
        if (!saved) {
          fail("HEADTEACHER_RELEASED_RESULT_SUPERVISORY_ITEM_MISSING", 409, {
            itemKey: item.key,
          });
        }
        return {
          itemKey: item.key,
          itemLabel: item.label,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: saved.score,
          notApplicable: saved.notApplicable,
        };
      }),
    };
  });
  const comparisonSections = staffSections.map((staff, index) => {
    const supervisory = supervisorySections[index];
    return {
      sectionKey: staff.sectionKey,
      sectionTitle: staff.sectionTitle,
      sectionOrder: staff.sectionOrder,
      sectionMaxScore: staff.sectionMaxScore,
      staffFeedbackPercentage: staff.averagePercentage,
      supervisoryPercentage: supervisory.percentage,
      supervisoryMinusStaffPercentagePoints: round2(
        supervisory.percentage - staff.averagePercentage,
      ),
    };
  });

  return {
    schemaVersion: 1,
    audience: "RELEASED_HEADTEACHER",
    lifecycleState: "RELEASED",
    cycle: {
      id: cycle.id,
      schoolName: membership.tenant.name,
      circuitName: zone.name,
      districtName: zone.parentZone.name,
      headteacherName: personName(membership.user),
      releasedAt: cycle.releasedAt.toISOString(),
    },
    release: {
      releaseProofHash: expectedProofHash,
      proofSchemaVersion: 1,
      releaseMode,
      reviewStage,
      releaseNote: releaseNote || null,
      releaseNoteIncluded,
      integrityVerified: true,
    },
    staffFeedback: {
      overallPercentage: snapshot.overallPercentage!,
      sections: staffSections,
    },
    supervisoryAssessment: {
      revision: assessment.revision,
      dateObserved: isoDateOnly(assessment.dateObserved!),
      visit: visitDetails,
      finalizedAt: assessment.finalizedAt!.toISOString(),
      overallPercentage: verifiedAssessment.overallPercentage!,
      sections: supervisorySections,
    },
    comparison: {
      direction: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
      thresholdsDefined: false,
      combinedOverallPercentage: null,
      overall: {
        staffFeedbackPercentage: snapshot.overallPercentage!,
        supervisoryPercentage: verifiedAssessment.overallPercentage!,
        supervisoryMinusStaffPercentagePoints: round2(
          verifiedAssessment.overallPercentage! - snapshot.overallPercentage!,
        ),
      },
      sections: comparisonSections,
    },
    privacy: {
      responseCountsIncluded: false,
      staffItemAveragesIncluded: false,
      supervisoryItemScoresIncluded: true,
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      participantListIncluded: false,
      responseHashesIncluded: false,
      reviewerIdentityIncluded: false,
      assessorIdentityIncluded: false,
      contactDetailsIncluded: false,
    },
    integrity: {
      cycleReviewProofCopiesMatch: true,
      releaseProofHashVerified: true,
      releaseRequestHashVerified: true,
      releaseNoteHashVerified: true,
      reviewEvidenceHashVerified: true,
      staffSnapshotProofAnchored: true,
      supervisoryAssessmentHashRecomputed: true,
      supervisoryItemScoresVerified: true,
      supervisoryVisitEvidenceVerified: true,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      scoreMutationAllowed: false,
    },
  };
}
