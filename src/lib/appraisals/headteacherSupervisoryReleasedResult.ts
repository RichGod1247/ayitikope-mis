import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import {
  HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY,
  HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY,
  computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash,
  computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash,
  computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata,
  computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash,
  type HeadteacherSupervisoryDirectorDirectReleaseHashEvidence,
} from "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease";
import {
  HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY,
  computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata,
  isHeadteacherDirectorGovernanceReviewedReleaseMetadata,
  type HeadteacherDirectorGovernanceAssessorOffice,
  type HeadteacherDirectorGovernanceAssessorRole,
} from "@/lib/appraisals/headteacherDirectorGovernanceReview";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_HEADTEACHER_GOVERNANCE",
  requiredRole: "HEADTEACHER",
  requiredAssessmentStatus: "FINALIZED",
  minimumAssessmentRevision: 1,
  acceptedReleaseModes: [
    "DIRECTOR_AUTHORED_DIRECT_RELEASE",
    "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE",
  ] as const,
  carrierCycleReleasedStatusRequired: false,
  independentReleaseProofRequired: true,
  releaseProofReverificationRequired: true,
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedRawMaximum: 170,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  commentsIncluded: false,
  assessorOfficeIncluded: true,
  assessorIdentityIncluded: false,
  reviewerIdentityIncluded: false,
  reviewerAssignmentIncluded: false,
  staffFeedbackIncluded: false,
  staffResponsesIncluded: false,
  respondentIdentitiesIncluded: false,
  rawEvidenceSnapshotIncluded: false,
  rawMetadataIncluded: false,
  contactDetailsIncluded: false,
  combinedScoreIncluded: false,
  separateEvidenceStreams: true,
  staffFeedbackPrerequisite: false,
  combinedWeightingDefined: false,
  scoreMutationAllowed: false,
  readOnly: true,
  databaseWritesAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

export type ReadHeadteacherSupervisoryReleasedResultInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  assessmentId: string;
  database?: HeadteacherSupervisoryReleasedResultDatabase;
};

export type HeadteacherSupervisoryReleasedResult = {
  schemaVersion: 1;
  audience: "RELEASED_HEADTEACHER_GOVERNANCE";
  lifecycleState: "RELEASED";
  context: {
    headteacherName: string;
    schoolName: string;
    circuitName: string;
    districtName: string;
  };
  release: {
    releasedAt: string;
    integrityVerified: true;
  };
  assessment: {
    assessmentId: string;
    revision: number;
    dateObserved: string;
    finalizedAt: string;
    assessorOffice: HeadteacherDirectorGovernanceAssessorOffice;
    instrumentCode: string;
    instrumentVersion: 1;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    sections: Array<{
      sectionKey: string;
      sectionTitle: string;
      sectionDescription: string | null;
      sectionOrder: number;
      sectionMaxScore: number;
      percentage: number | null;
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
  visit: {
    contextSchemaVersion: 1 | 2;
    officialDetailsAvailable: boolean;
    arrivalTime: string | null;
    staffStrength: number | null;
    totalEnrolment: number | null;
    girls: number | null;
    boys: number | null;
    teachersPresentAtVisit: number | null;
  };
  privacy: {
    assessorIdentityIncluded: false;
    reviewerIdentityIncluded: false;
    reviewerAssignmentIncluded: false;
    staffResponsesIncluded: false;
    respondentIdentitiesIncluded: false;
    rawEvidenceSnapshotIncluded: false;
    rawMetadataIncluded: false;
    contactDetailsIncluded: false;
  };
  integrity: {
    separateEvidenceStreams: true;
    staffFeedbackPrerequisite: false;
    combinedWeightingDefined: false;
  };
};

type MembershipRecord = {
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

type ScoreRecord = {
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

type AssessmentRecord = {
  id: string;
  cycleId: string;
  priorAssessmentId: string | null;
  instrumentVersionId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  dateObserved: Date | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  scores: ScoreRecord[];
  reviews: ReviewRecord[];
  cycle: {
    id: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    targetRoleSnapshot: string | null;
    status: string;
    openedAt: Date | null;
    cancelledAt: Date | null;
    metadata: unknown;
  };
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

export type HeadteacherSupervisoryReleasedResultDatabase = {
  membership: {
    findMany(args: unknown): Promise<MembershipRecord[]>;
  };
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
};

export class HeadteacherSupervisoryReleasedResultError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherSupervisoryReleasedResultError";
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

const ASSESSMENT_SELECT = {
  id: true,
  cycleId: true,
  priorAssessmentId: true,
  instrumentVersionId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  status: true,
  revision: true,
  dateObserved: true,
  overallPercentage: true,
  sectionPercentagesJson: true,
  generalComment: true,
  evidenceSnapshotJson: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  metadata: true,
  scores: {
    select: {
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
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
  },
  reviews: {
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
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  },
  cycle: {
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      targetRoleSnapshot: true,
      status: true,
      openedAt: true,
      cancelledAt: true,
      metadata: true,
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
        select: {
          id: true,
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
              isRequired: true,
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

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  throw new HeadteacherSupervisoryReleasedResultError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function sectionPercentageMap(value: unknown) {
  const object = objectValue(value);
  return Object.fromEntries(
    Object.entries(object).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function displayName(user: MembershipRecord["user"]) {
  const direct = clean(user.name);
  if (direct) return direct;
  const full = [clean(user.firstName), clean(user.lastName)]
    .filter(Boolean)
    .join(" ");
  return full || "Headteacher";
}

function assertInstrument(record: AssessmentRecord) {
  const expected = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  const version = record.instrumentVersion;

  if (
    record.instrumentVersionId !== version.id ||
    version.version !== expected.instrumentVersion ||
    version.instrument.code !== expected.instrumentCode ||
    version.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    version.instrument.subjectType !== "HEADTEACHER" ||
    !isSha256(version.contentHash)
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_INSTRUMENT_INVALID", 409);
  }

  const sections = [...version.sections].sort((a, b) => a.order - b.order);
  if (sections.length !== expected.expectedSectionCount) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SECTION_COUNT_DRIFT", 409);
  }

  const sectionKeys = new Set<string>();
  const sectionOrders = new Set<number>();
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  let rawMaximum = 0;
  let itemCount = 0;

  sections.forEach((section, index) => {
    if (
      !clean(section.id) ||
      !clean(section.key) ||
      !clean(section.title) ||
      sectionKeys.has(section.key) ||
      sectionOrders.has(section.order) ||
      section.order !== index + 1 ||
      section.maxScore !== expected.expectedSectionMaximums[index]
    ) {
      fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SECTION_STRUCTURE_DRIFT", 409, {
        sectionKey: section.key,
      });
    }

    sectionKeys.add(section.key);
    sectionOrders.add(section.order);
    rawMaximum += section.maxScore;

    const itemOrders = new Set<number>();
    const items = [...section.items].sort((a, b) => a.order - b.order);
    const sectionRawMaximum = items.reduce((sum, item) => sum + item.maxScore, 0);

    if (sectionRawMaximum !== section.maxScore) {
      fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SECTION_MAXIMUM_DRIFT", 409, {
        sectionKey: section.key,
      });
    }

    for (const item of items) {
      if (
        !clean(item.id) ||
        !clean(item.key) ||
        !clean(item.label) ||
        itemIds.has(item.id) ||
        itemKeys.has(item.key) ||
        itemOrders.has(item.order) ||
        !Number.isInteger(item.order) ||
        item.order < 1 ||
        item.maxScore !== expected.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_ITEM_STRUCTURE_DRIFT", 409, {
          itemKey: item.key,
        });
      }
      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemOrders.add(item.order);
      itemCount += 1;
    }
  });

  if (
    itemCount !== expected.expectedItemCount ||
    rawMaximum !== expected.expectedRawMaximum
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_FORM_STRUCTURE_DRIFT", 409, {
      itemCount,
      rawMaximum,
    });
  }

  return sections;
}

function scoreMapFor(
  record: AssessmentRecord,
  sections: InstrumentSectionRecord[],
) {
  const expectedByItemId = new Map(
    sections.flatMap((section) =>
      section.items.map((item) => [item.id, { section, item }] as const),
    ),
  );
  const scores = new Map<string, ScoreRecord>();

  for (const score of record.scores) {
    const expected = expectedByItemId.get(score.instrumentItemId);
    if (
      score.assessmentId !== record.id ||
      !expected ||
      scores.has(score.instrumentItemId) ||
      score.sectionKey !== expected.section.key ||
      score.sectionTitle !== expected.section.title ||
      score.sectionOrder !== expected.section.order ||
      score.sectionMaxScore !== expected.section.maxScore ||
      score.itemKey !== expected.item.key ||
      score.itemLabel !== expected.item.label ||
      score.itemOrder !== expected.item.order ||
      score.itemMaxScore !== expected.item.maxScore ||
      (score.notApplicable && score.score !== null) ||
      (!score.notApplicable &&
        (typeof score.score !== "number" ||
          !Number.isInteger(score.score) ||
          score.score < HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.scaleMinimum ||
          score.score > expected.item.maxScore))
    ) {
      fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SCORE_DRIFT", 409, {
        itemKey: score.itemKey,
      });
    }
    scores.set(score.instrumentItemId, score);
  }

  if (scores.size !== HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.expectedItemCount) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SCORE_COUNT_DRIFT", 409, {
      scoreCount: scores.size,
    });
  }

  return scores;
}

function calculationRows(
  sections: InstrumentSectionRecord[],
  scores: Map<string, ScoreRecord>,
) {
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = scores.get(item.id);
      if (!score) {
        fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SCORE_MISSING", 409, {
          itemKey: item.key,
        });
      }
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: score.score,
        notApplicable: score.notApplicable,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

type VerifiedVisitContext = {
  schemaVersion: 1 | 2;
  targetName: string;
  schoolName: string;
  circuitName: string;
  districtName: string;
  assessorRole: HeadteacherDirectorGovernanceAssessorRole;
  visitContextHash: string;
};

function assessorOffice(
  role: HeadteacherDirectorGovernanceAssessorRole,
): HeadteacherDirectorGovernanceAssessorOffice {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
  }
}

function verifyVisitContext(input: {
  record: AssessmentRecord;
  membership: MembershipRecord;
}): VerifiedVisitContext {
  const { record, membership } = input;
  const context = objectValue(record.evidenceSnapshotJson);
  const metadata = objectValue(record.metadata);
  const target = objectValue(context.target);
  const assessor = objectValue(context.assessor);
  const jurisdiction = objectValue(context.jurisdiction);
  const instrument = objectValue(context.instrument);
  const observation = objectValue(context.observation);
  const schemaVersion = Number(context.schemaVersion);
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  const instrumentContentHash = clean(record.instrumentVersion.contentHash).toLowerCase();
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;
  const assessorRole = canonicalHeadteacherSupervisoryAssessorRole(
    clean(assessor.role) || clean(assessor.assignmentRole),
  );
  const supportedAssessorRole = [
    "SISSO",
    "BASIC_SCHOOL_COORDINATOR",
    "HEAD_OF_SUPERVISION",
    "DISTRICT_DIRECTOR",
  ].includes(assessorRole);

  if (
    (schemaVersion !== 1 &&
      schemaVersion !== HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion) ||
    !isSha256(visitContextHash) ||
    hashJson(record.evidenceSnapshotJson) !== visitContextHash ||
    clean(context.workflow) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(context.evidenceStream) !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    clean(objectValue(context.cycle).id) !== record.cycleId ||
    clean(target.userId) !== record.cycle.targetUserId ||
    clean(target.tenantId) !== record.cycle.targetTenantId ||
    normalized(target.role) !== "HEADTEACHER" ||
    clean(assessor.userId) !== record.assessorUserId ||
    clean(assessor.assignmentId) !== clean(record.assessorAssignmentId) ||
    !supportedAssessorRole ||
    clean(jurisdiction.circuitZoneId) !== clean(record.cycle.targetZoneId) ||
    clean(jurisdiction.districtZoneId) !== record.cycle.scopeZoneId ||
    !zone ||
    !district ||
    zone.id !== clean(record.cycle.targetZoneId) ||
    district.id !== record.cycle.scopeZoneId ||
    clean(instrument.instrumentId) !== record.instrumentVersion.instrument.id ||
    clean(instrument.instrumentVersionId) !== record.instrumentVersionId ||
    clean(instrument.code) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    Number(instrument.version) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(instrument.contentHash).toLowerCase() !== instrumentContentHash ||
    !record.dateObserved ||
    clean(observation.dateObserved) !== record.dateObserved.toISOString().slice(0, 10)
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_VISIT_CONTEXT_DRIFT", 409);
  }

  if (
    schemaVersion === HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion
  ) {
    if (
      Number(metadata.visitContextSchemaVersion) !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion ||
      Number(metadata.visitDetailsSchemaVersion) !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.schemaVersion ||
      metadata.officialVisitDetailsIncluded !== true
    ) {
      fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_VISIT_DETAILS_METADATA_DRIFT", 409);
    }
  }

  return {
    schemaVersion: schemaVersion as 1 | 2,
    targetName: clean(target.name) || displayName(membership.user),
    schoolName: clean(target.schoolName) || membership.tenant.name,
    circuitName: clean(jurisdiction.circuitName) || zone.name,
    districtName: clean(jurisdiction.districtName) || district.name,
    assessorRole: assessorRole as HeadteacherDirectorGovernanceAssessorRole,
    visitContextHash,
  };
}

function assessmentHashPayload(input: {
  record: AssessmentRecord;
  sections: InstrumentSectionRecord[];
  scores: Map<string, ScoreRecord>;
  visitContextHash: string;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: input.record.id,
      cycleId: input.record.cycleId,
      revision: input.record.revision,
      assessorUserId: input.record.assessorUserId,
      assessorAssignmentId: input.record.assessorAssignmentId,
      dateObserved: input.record.dateObserved
        ? input.record.dateObserved.toISOString().slice(0, 10)
        : null,
      visitContextHash: input.visitContextHash,
    },
    instrument: {
      instrumentVersionId: input.record.instrumentVersionId,
      code: input.record.instrumentVersion.instrument.code,
      version: input.record.instrumentVersion.version,
      contentHash: clean(input.record.instrumentVersion.contentHash).toLowerCase(),
    },
    scores: input.sections.flatMap((section) =>
      section.items.map((item) => {
        const score = input.scores.get(item.id);
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

function verifyFinalizedAssessment(input: {
  record: AssessmentRecord;
  sections: InstrumentSectionRecord[];
  scores: Map<string, ScoreRecord>;
  visitContextHash: string;
}) {
  const { record, sections, scores, visitContextHash } = input;

  if (
    normalized(record.status) !== "FINALIZED" ||
    !Number.isInteger(record.revision) ||
    record.revision < HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.minimumAssessmentRevision ||
    !record.assessorAssignmentId ||
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    !isSha256(record.assessmentHash) ||
    clean(record.generalComment)
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_FINALIZED_EVIDENCE_INVALID", 409);
  }

  const calculated = calculateAppraisalScores(calculationRows(sections, scores), {
    requireComplete: true,
  });
  if (!calculated.ok) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_CALCULATION_INVALID", 409, {
      scoreError: calculated.code,
      itemKeys: calculated.itemKeys,
    });
  }

  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameJson(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_CALCULATION_DRIFT", 409);
  }

  const expectedAssessmentHash = hashJson(
    assessmentHashPayload({
      record,
      sections,
      scores,
      visitContextHash,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );

  if (expectedAssessmentHash !== clean(record.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_ASSESSMENT_HASH_DRIFT", 409);
  }

  return calculated.value;
}

function releaseEntry(cycleMetadata: unknown, assessmentId: string) {
  const metadata = objectValue(cycleMetadata);
  const releasesRaw = metadata[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY];

  if (releasesRaw == null) return {};
  if (!releasesRaw || typeof releasesRaw !== "object" || Array.isArray(releasesRaw)) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_MAP_DRIFT", 409);
  }

  const releases = releasesRaw as Record<string, unknown>;
  const raw = releases[assessmentId];
  if (raw == null) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_ENTRY_DRIFT", 409);
  }
  return raw as Record<string, unknown>;
}

function reviewMetadata(review: ReviewRecord) {
  return objectValue(review.metadata);
}

function isDirectorGovernanceReview(review: ReviewRecord) {
  const metadata = reviewMetadata(review);
  return (
    clean(metadata.reviewType) === "DIRECTOR_GOVERNANCE_REVIEW" &&
    normalized(metadata.reviewerRole) === "DISTRICT_DIRECTOR" &&
    metadata.staffFeedbackIncluded === false &&
    metadata.respondentIdentitiesIncluded === false &&
    metadata.reviewerMayRewriteScores === false &&
    metadata.scoreMutationAllowed === false &&
    metadata.providerCalled === false
  );
}

function verifyDirectRelease(input: {
  record: AssessmentRecord;
  visitContext: VerifiedVisitContext;
  release: Record<string, unknown>;
}) {
  const { record, visitContext, release } = input;
  const releasedAt = clean(release.releasedAt);
  const releasedDate = new Date(releasedAt);
  const releaserAssignmentId = requireIdentifier(
    release.releaserAssignmentId,
    "releaserAssignmentId",
  );
  const assessmentHash = clean(record.assessmentHash).toLowerCase();
  const assessorAssignmentId = requireIdentifier(
    record.assessorAssignmentId,
    "assessorAssignmentId",
  );

  if (!releasedAt || Number.isNaN(releasedDate.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_TIMESTAMP_INVALID", 409);
  }

  const evidence: HeadteacherSupervisoryDirectorDirectReleaseHashEvidence = {
    cycleId: record.cycleId,
    assessmentId: record.id,
    assessmentRevision: 1,
    assessmentHash,
    visitContextHash: visitContext.visitContextHash,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId,
  };

  const decisionContractHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash();
  const releaseRequestHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash({
      evidence,
      releaserAssignmentId,
      decisionContractHash,
    });
  const releaseEvidenceHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash({
      evidence,
      releaseRequestHash,
    });
  const expectedProofHash =
    computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata(release);

  if (
    record.revision !== 1 ||
    record.priorAssessmentId !== null ||
    visitContext.assessorRole !== "DISTRICT_DIRECTOR" ||
    Number(release.proofSchemaVersion) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.proofSchemaVersion ||
    clean(release.releaseMode) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode ||
    clean(release.workflow) !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(release.evidenceStream) !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    clean(release.cycleId) !== record.cycleId ||
    clean(release.assessmentId) !== record.id ||
    Number(release.assessmentRevision) !== 1 ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !== assessmentHash ||
    clean(release.visitContextHash).toLowerCase() !== visitContext.visitContextHash ||
    clean(release.assessorUserId) !== record.assessorUserId ||
    clean(release.assessorAssignmentId) !== assessorAssignmentId ||
    normalized(release.assessorRole) !== "DISTRICT_DIRECTOR" ||
    release.reviewRowsRequired !== false ||
    release.reviewRowsPresent !== false ||
    release.selfReviewPerformed !== false ||
    record.reviews.length !== 0 ||
    clean(release.releaserUserId) !== record.assessorUserId ||
    releaserAssignmentId !== assessorAssignmentId ||
    normalized(release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    clean(release.decisionContractHash).toLowerCase() !== decisionContractHash ||
    clean(release.releaseRequestHash).toLowerCase() !== releaseRequestHash ||
    clean(release.releaseEvidenceHash).toLowerCase() !== releaseEvidenceHash ||
    release.releaseNoteIncluded !== false ||
    release.assessmentStatusMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.visitContextMutationPerformed !== false ||
    release.staffFeedbackRequired !== false ||
    release.staffFeedbackAccessed !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.carrierCycleStatusMutationPerformed !== false ||
    release.carrierCycleTimestampMutationPerformed !== false ||
    release.participantMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.separateEvidenceStreams !== true ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.providerCalled !== false ||
    !isSha256(release.releaseProofHash) ||
    clean(release.releaseProofHash).toLowerCase() !== expectedProofHash
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_PROOF_DRIFT", 409);
  }

  return {
    releasedAt: releasedDate.toISOString(),
    assessorOffice: "District Director" as const,
  };
}

function reviewedReviewEvidenceHash(input: {
  review: ReviewRecord;
  record: AssessmentRecord;
  visitContext: VerifiedVisitContext;
}) {
  const metadata = reviewMetadata(input.review);
  const sourceReviewId = clean(metadata.admittedFromReviewId) || null;
  const sourceReviewStageRaw = Number(metadata.admittedFromReviewStage);
  const sourceReviewStage = Number.isInteger(sourceReviewStageRaw)
    ? sourceReviewStageRaw
    : null;
  const sourceReviewEvidenceHash =
    clean(metadata.admittedFromReviewEvidenceHash).toLowerCase() || null;
  const sourceDecisionRequestHash =
    clean(metadata.admittedFromDecisionRequestHash).toLowerCase() || null;
  const sourceDecisionEvidenceHash =
    clean(metadata.admittedFromDecisionEvidenceHash).toLowerCase() || null;

  return hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    assessment: {
      id: input.record.id,
      cycleId: input.record.cycleId,
      revision: input.record.revision,
      assessmentHash: clean(input.record.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContext.visitContextHash,
      assessorRole: input.visitContext.assessorRole,
      assessorAssignmentId: input.record.assessorAssignmentId,
    },
    review: {
      stage: input.review.stage,
      reviewerUserId: input.review.reviewerUserId,
      reviewerAssignmentId: input.review.reviewerAssignmentId,
      reviewerRole: "DISTRICT_DIRECTOR",
    },
    admission: {
      type: clean(metadata.admissionType),
      sourceReviewId,
      sourceReviewStage,
      sourceReviewEvidenceHash,
      sourceDecisionRequestHash,
      sourceDecisionEvidenceHash,
    },
    jurisdiction: {
      districtZoneId: input.record.cycle.scopeZoneId,
      targetTenantId: input.record.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
  });
}

function reviewedDecisionContractHash(input: {
  review: ReviewRecord;
  record: AssessmentRecord;
}) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    evidenceStream: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.record.id,
    assessmentRevision: input.record.revision,
    action: "RELEASE",
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
    combinedWeightingDefined: false,
  });
}

function reviewedReleaseRequestHash(input: {
  review: ReviewRecord;
  record: AssessmentRecord;
  decisionContractHash: string;
}) {
  const note = clean(input.review.note);
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    assessmentId: input.record.id,
    assessmentRevision: input.record.revision,
    assessmentHash: clean(input.record.assessmentHash).toLowerCase(),
    reviewEvidenceHash: clean(reviewMetadata(input.review).reviewEvidenceHash).toLowerCase(),
    decisionContractHash: input.decisionContractHash,
    action: "RELEASE",
    note: note || null,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
  });
}

function reviewedReleaseEvidenceHash(input: {
  review: ReviewRecord;
  record: AssessmentRecord;
  visitContextHash: string;
  releaseRequestHash: string;
}) {
  return hashJson({
    schemaVersion: 1,
    assessmentId: input.record.id,
    assessmentRevision: input.record.revision,
    assessmentHash: clean(input.record.assessmentHash).toLowerCase(),
    visitContextHash: input.visitContextHash,
    reviewId: input.review.id,
    reviewStage: input.review.stage,
    reviewEvidenceHash: clean(reviewMetadata(input.review).reviewEvidenceHash).toLowerCase(),
    releaseRequestHash: input.releaseRequestHash,
    staffFeedbackIncluded: false,
  });
}

function verifyReviewedGovernanceRelease(input: {
  record: AssessmentRecord;
  visitContext: VerifiedVisitContext;
  release: Record<string, unknown>;
}) {
  const { record, visitContext, release } = input;
  const releasedAt = clean(release.releasedAt);
  const releasedDate = new Date(releasedAt);
  if (!releasedAt || Number.isNaN(releasedDate.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_TIMESTAMP_INVALID", 409);
  }

  if (
    !["SISSO", "BASIC_SCHOOL_COORDINATOR", "HEAD_OF_SUPERVISION"].includes(
      visitContext.assessorRole,
    ) ||
    !isHeadteacherDirectorGovernanceReviewedReleaseMetadata(release)
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_REVIEWED_RELEASE_ORIGIN_DRIFT", 409);
  }

  const releaseReviewId = requireIdentifier(release.reviewId, "releaseReviewId");
  const releaseReviewerAssignmentId = requireIdentifier(
    release.releaserAssignmentId,
    "releaserAssignmentId",
  );
  const assessorAssignmentId = requireIdentifier(
    record.assessorAssignmentId,
    "assessorAssignmentId",
  );
  const reviewMatches = record.reviews.filter((review) => review.id === releaseReviewId);
  if (reviewMatches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_REVIEWED_RELEASE_REVIEW_DRIFT", 409);
  }
  const review = reviewMatches[0];
  const metadata = reviewMetadata(review);
  const assessmentHash = clean(record.assessmentHash).toLowerCase();
  const reviewEvidenceHash = clean(metadata.reviewEvidenceHash).toLowerCase();
  const expectedReviewEvidenceHash = reviewedReviewEvidenceHash({
    review,
    record,
    visitContext,
  });
  const note = clean(review.note);

  const decisionContractHash = reviewedDecisionContractHash({ review, record });
  const releaseRequestHash = reviewedReleaseRequestHash({
    review,
    record,
    decisionContractHash,
  });
  const releaseEvidenceHash = reviewedReleaseEvidenceHash({
    review,
    record,
    visitContextHash: visitContext.visitContextHash,
    releaseRequestHash,
  });
  const expectedProofHash =
    computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata(release);
  const pendingDirectorReview = record.reviews.some(
    (candidate) =>
      isDirectorGovernanceReview(candidate) &&
      normalized(candidate.decision) === "PENDING",
  );

  if (
    review.cycleId !== record.cycleId ||
    review.assessmentId !== record.id ||
    normalized(review.decision) !== "ACCEPTED" ||
    !review.decidedAt ||
    review.decidedAt.toISOString() !== releasedDate.toISOString() ||
    !isDirectorGovernanceReview(review) ||
    review.reviewerAssignmentId !== releaseReviewerAssignmentId ||
    clean(release.releaserUserId) !== review.reviewerUserId ||
    normalized(release.releaserRole) !== "DISTRICT_DIRECTOR" ||
    review.reviewerUserId === record.assessorUserId ||
    Number(metadata.reviewStage) !== review.stage ||
    clean(metadata.assessmentId) !== record.id ||
    Number(metadata.assessmentRevision) !== record.revision ||
    clean(metadata.assessmentHash).toLowerCase() !== assessmentHash ||
    clean(metadata.visitContextHash).toLowerCase() !== visitContext.visitContextHash ||
    normalized(metadata.assessorRole) !== visitContext.assessorRole ||
    clean(metadata.reviewEvidenceHash).toLowerCase() !== reviewEvidenceHash ||
    reviewEvidenceHash !== expectedReviewEvidenceHash ||
    clean(metadata.decisionAction) !== "RELEASE" ||
    clean(metadata.decisionContractHash).toLowerCase() !== decisionContractHash ||
    clean(metadata.decisionRequestHash).toLowerCase() !== releaseRequestHash ||
    clean(metadata.decidedByRole) !== "DISTRICT_DIRECTOR" ||
    clean(metadata.decidedAt) !== releasedDate.toISOString() ||
    metadata.revisionRequired !== false ||
    metadata.releasePerformed !== true ||
    metadata.immutableEvidenceReverified !== true ||
    metadata.staffFeedbackIncluded !== false ||
    metadata.respondentIdentitiesIncluded !== false ||
    metadata.reviewerMayRewriteScores !== false ||
    metadata.reviewerMayRewriteVisitEvidence !== false ||
    metadata.scoreMutationAllowed !== false ||
    metadata.assessmentMutationAllowed !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false ||
    pendingDirectorReview ||
    Number(release.proofSchemaVersion) !==
      HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.proofSchemaVersion ||
    clean(release.releaseMode) !== HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.releaseMode ||
    clean(release.workflow) !== HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.workflow ||
    clean(release.evidenceStream) !== HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.evidenceStream ||
    clean(release.cycleId) !== record.cycleId ||
    clean(release.assessmentId) !== record.id ||
    Number(release.assessmentRevision) !== record.revision ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.assessmentHash).toLowerCase() !== assessmentHash ||
    clean(release.visitContextHash).toLowerCase() !== visitContext.visitContextHash ||
    normalized(release.assessorRole) !== visitContext.assessorRole ||
    clean(release.assessorAssignmentId) !== assessorAssignmentId ||
    release.reviewRowsRequired !== true ||
    release.reviewRowsPresent !== true ||
    Number(release.reviewStage) !== review.stage ||
    normalized(release.reviewDecision) !== "ACCEPTED" ||
    clean(release.reviewEvidenceHash).toLowerCase() !== reviewEvidenceHash ||
    clean(release.decisionContractHash).toLowerCase() !== decisionContractHash ||
    clean(release.releaseRequestHash).toLowerCase() !== releaseRequestHash ||
    clean(release.releaseEvidenceHash).toLowerCase() !== releaseEvidenceHash ||
    release.releaseNoteIncluded !== Boolean(note) ||
    (note
      ? clean(release.releaseNoteHash).toLowerCase() !== hashJson({ note })
      : release.releaseNoteHash !== null) ||
    release.selfReviewPerformed !== false ||
    release.assessmentStatusMutationPerformed !== false ||
    release.scoreMutationPerformed !== false ||
    release.visitContextMutationPerformed !== false ||
    release.staffFeedbackRequired !== false ||
    release.staffFeedbackAccessed !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.carrierCycleStatusMutationPerformed !== false ||
    release.carrierCycleTimestampMutationPerformed !== false ||
    release.participantMutationPerformed !== false ||
    release.reviewerMayRewriteScores !== false ||
    release.separateEvidenceStreams !== true ||
    release.combinedWeightingDefined !== false ||
    release.notificationsSeeded !== false ||
    release.providerCalled !== false ||
    !isSha256(release.releaseProofHash) ||
    clean(release.releaseProofHash).toLowerCase() !== expectedProofHash
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_REVIEWED_RELEASE_PROOF_DRIFT", 409);
  }

  return {
    releasedAt: releasedDate.toISOString(),
    assessorOffice: assessorOffice(visitContext.assessorRole),
  };
}

function verifyIndependentRelease(input: {
  record: AssessmentRecord;
  visitContext: VerifiedVisitContext;
}) {
  const release = releaseEntry(input.record.cycle.metadata, input.record.id);
  if (!Object.keys(release).length) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_NOT_RELEASED", 409);
  }

  const releaseMode = clean(release.releaseMode);
  if (
    releaseMode === HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode
  ) {
    return verifyDirectRelease({ ...input, release });
  }
  if (
    releaseMode === HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY.releaseMode
  ) {
    return verifyReviewedGovernanceRelease({ ...input, release });
  }

  fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_MODE_FORBIDDEN", 409, {
    releaseMode,
  });
}

function buildSections(input: {
  sections: InstrumentSectionRecord[];
  scores: Map<string, ScoreRecord>;
  sectionPercentages: Record<string, number | null>;
}) {
  return input.sections.map((section) => ({
    sectionKey: section.key,
    sectionTitle: section.title,
    sectionDescription: section.description,
    sectionOrder: section.order,
    sectionMaxScore: section.maxScore,
    percentage: input.sectionPercentages[section.key] ?? null,
    items: section.items.map((item) => {
      const score = input.scores.get(item.id);
      if (!score) {
        fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_SCORE_MISSING", 409, {
          itemKey: item.key,
        });
      }
      return {
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        score: score.score,
        notApplicable: score.notApplicable,
      };
    }),
  }));
}

export async function readHeadteacherSupervisoryReleasedResult(
  input: ReadHeadteacherSupervisoryReleasedResultInput,
): Promise<HeadteacherSupervisoryReleasedResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY.requiredRole) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryReleasedResultDatabase);

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
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_ACTIVE_MEMBERSHIP_REQUIRED", 403, {
      matches: memberships.length,
    });
  }

  const membership = memberships[0];
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  if (
    membership.userId !== actorUserId ||
    membership.tenantId !== actorTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_MEMBERSHIP_SCOPE_INVALID", 409);
  }

  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: ASSESSMENT_SELECT,
  });

  if (!record) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_ASSESSMENT_NOT_FOUND", 404);
  }

  if (
    record.cycle.id !== record.cycleId ||
    record.cycle.targetUserId !== actorUserId ||
    clean(record.cycle.targetTenantId) !== actorTenantId ||
    normalized(record.cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    clean(record.cycle.targetZoneId) !== zone.id ||
    record.cycle.scopeZoneId !== district.id ||
    !record.cycle.openedAt ||
    record.cycle.cancelledAt !== null
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_TARGET_FORBIDDEN", 403);
  }

  const sections = assertInstrument(record);
  const scores = scoreMapFor(record, sections);
  const visitContext = verifyVisitContext({ record, membership });
  const calculated = verifyFinalizedAssessment({
    record,
    sections,
    scores,
    visitContextHash: visitContext.visitContextHash,
  });
  const releaseVerification = verifyIndependentRelease({
    record,
    visitContext,
  });
  const visitDetails = visitDetailsFromEvidenceSnapshot(record.evidenceSnapshotJson);

  return {
    schemaVersion: 1,
    audience: "RELEASED_HEADTEACHER_GOVERNANCE",
    lifecycleState: "RELEASED",
    context: {
      headteacherName: visitContext.targetName,
      schoolName: visitContext.schoolName,
      circuitName: visitContext.circuitName,
      districtName: visitContext.districtName,
    },
    release: {
      releasedAt: releaseVerification.releasedAt,
      integrityVerified: true,
    },
    assessment: {
      assessmentId: record.id,
      revision: record.revision,
      dateObserved: record.dateObserved?.toISOString().slice(0, 10) ?? "",
      finalizedAt: record.finalizedAt?.toISOString() ?? "",
      assessorOffice: releaseVerification.assessorOffice,
      instrumentCode: record.instrumentVersion.instrument.code,
      instrumentVersion: 1,
      overallPercentage: calculated.overallPercentage,
      sectionPercentages: calculated.sectionPercentages,
      sections: buildSections({
        sections,
        scores,
        sectionPercentages: calculated.sectionPercentages,
      }),
    },
    visit: {
      contextSchemaVersion: visitContext.schemaVersion,
      officialDetailsAvailable: Boolean(visitDetails),
      arrivalTime: visitDetails?.arrivalTime ?? null,
      staffStrength: visitDetails?.staffStrength ?? null,
      totalEnrolment: visitDetails?.totalEnrolment ?? null,
      girls: visitDetails?.girls ?? null,
      boys: visitDetails?.boys ?? null,
      teachersPresentAtVisit: visitDetails?.teachersPresentAtVisit ?? null,
    },
    privacy: {
      assessorIdentityIncluded: false,
      reviewerIdentityIncluded: false,
      reviewerAssignmentIncluded: false,
      staffResponsesIncluded: false,
      respondentIdentitiesIncluded: false,
      rawEvidenceSnapshotIncluded: false,
      rawMetadataIncluded: false,
      contactDetailsIncluded: false,
    },
    integrity: {
      separateEvidenceStreams: true,
      staffFeedbackPrerequisite: false,
      combinedWeightingDefined: false,
    },
  };
}
