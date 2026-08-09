import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  TEACHER_SUPERVISORY_REVIEW_POLICY,
  decideTeacherSupervisoryReviewAuthority,
  teacherSupervisoryReviewChainForAssessor,
  type TeacherSupervisoryReviewerRole,
} from "@/lib/appraisals/teacherSupervisoryReview";
import {
  computeTeacherSupervisoryReviewEvidenceHash,
} from "@/lib/appraisals/teacherSupervisoryReviewAdmission";
import {
  verifyTeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryFinalizedAssessmentEvidence,
  type TeacherSupervisoryScoringDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentScoring";
import {
  readTeacherSupervisoryObservationDetailsSnapshot,
  type TeacherSupervisoryObservationDetailsSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationDetails";
import {
  readTeacherSupervisoryObservationSelectionSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationOptions";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  audience: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"] as const,
  requiredCycleStatus: "UNDER_REVIEW",
  currentReviewStageMode: "CURRENT_PENDING_REVIEW",
  requiredReviewDecision: "PENDING",
  expectedSectionCount: 6,
  expectedItemCount: 34,
  officialObservationDetailsIncluded: true,
  governanceEnrolmentEvidenceIncludedWhenAvailable: true,
  generalCommentIncluded: true,
  scoreValuesIncluded: true,
  readOnly: true,
  reviewerMayRewriteScores: false,
  reviewerMayRewriteComment: false,
  reviewerMayRewriteObservationDetails: false,
  reviewerMayRewriteGovernanceEnrolmentEvidence: false,
  reviewerMayRewriteTeacherAssignmentProvenance: false,
  reviewerMayRewriteCurriculumProvenance: false,
  rawEvidenceSnapshotIncluded: false,
  rawMetadataIncluded: false,
  contactDetailsIncluded: false,
  confidentialStaffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  databaseWritesAllowed: false,
  transactionRequired: false,
  providerCallsAllowed: false,
} as const;

export type TeacherSupervisoryReviewPackageInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: TeacherSupervisoryReviewPackageDatabase;
  verificationDatabase?: Pick<
    TeacherSupervisoryScoringDatabase,
    "appraisalAssessment"
  >;
};

export type TeacherSupervisoryReviewPackageItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
};

export type TeacherSupervisoryReviewPackageSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  percentage: number | null;
  items: TeacherSupervisoryReviewPackageItem[];
};

export type TeacherSupervisoryReviewPackageObservation = {
  contextSchemaVersion: 1 | 2;
  teacherName: string | null;
  schoolName: string;
  circuitName: string;
  districtName: string;
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
  totalEnrolment: number | null;
  girls: number | null;
  boys: number | null;
  teacherAssignmentVerified: boolean;
  curriculumSelectionVerified: boolean;
};

export type TeacherSupervisoryReviewPackage = {
  schemaVersion: 1;
  lifecycleState: "READY_FOR_REVIEW_DECISION";
  review: {
    id: string;
    stage: number;
    decision: "PENDING";
    reviewerRole: TeacherSupervisoryReviewerRole;
    createdAt: string;
  };
  assessment: {
    id: string;
    cycleId: string;
    revision: number;
    status: "FINALIZED";
    finalizedAt: string;
    assessorOffice: string;
    assessorScopeLevel: string;
    instrumentCode: string;
    instrumentVersion: number;
    dateObserved: string;
    overallPercentage: number | null;
    sectionPercentages: Record<string, number | null>;
    generalComment: string | null;
    sections: TeacherSupervisoryReviewPackageSection[];
  };
  observation: TeacherSupervisoryReviewPackageObservation;
  integrity: {
    immutableFinalizedEvidenceVerified: true;
    assessmentHash: string;
    observationContextHash: string;
    reviewEvidenceHash: string;
    instrumentContentHash: string;
    generalCommentIncludedInAssessmentHash: true;
    reviewerMayRewriteScores: false;
    reviewerMayRewriteComment: false;
    reviewerMayRewriteObservationDetails: false;
    reviewerMayRewriteGovernanceEnrolmentEvidence: false;
    reviewerMayRewriteTeacherAssignmentProvenance: false;
    reviewerMayRewriteCurriculumProvenance: false;
    legacyTeacherAppraisalIncluded: false;
    combinedWeightingDefined: false;
  };
  privacy: {
    contactDetailsIncluded: false;
    rawEvidenceSnapshotIncluded: false;
    rawMetadataIncluded: false;
    confidentialStaffFeedbackIncluded: false;
    respondentIdentitiesIncluded: false;
  };
  readOnly: true;
  providerCalled: false;
};

type PackageAssessmentScoreRecord = {
  assessmentId: string;
  instrumentItemId: string;
  itemKey: string;
  score: number | null;
  notApplicable: boolean;
};

type PackageInstrumentItemRecord = {
  id: string;
  key: string;
  label: string;
  order: number;
  maxScore: number;
};

type PackageInstrumentSectionRecord = {
  key: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: PackageInstrumentItemRecord[];
};

type PackageAssessmentRecord = {
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
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  scores: PackageAssessmentScoreRecord[];
  instrumentVersion: {
    id: string;
    version: number;
    contentHash: string | null;
    instrument: {
      code: string;
    };
    sections: PackageInstrumentSectionRecord[];
  };
};

type PackageCycleRecord = {
  id: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  status: string;
  closedAt: Date | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type PackageReviewRecord = {
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

type PackageReviewerAssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  revokedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  zoneId: string;
  zone: {
    id: string;
    isActive: boolean;
    zoneType: {
      level: number;
    };
  };
};

export type TeacherSupervisoryReviewPackageDatabase = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<PackageAssessmentRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<PackageCycleRecord | null>;
  };
  appraisalReview: {
    findMany(args: unknown): Promise<PackageReviewRecord[]>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<PackageReviewerAssignmentRecord[]>;
  };
};

type ObservationContext = {
  schemaVersion?: unknown;
  workflow?: unknown;
  evidenceStream?: unknown;
  target?: {
    userId?: unknown;
    tenantId?: unknown;
    name?: unknown;
    schoolName?: unknown;
  };
  assessor?: {
    userId?: unknown;
    role?: unknown;
    assignmentId?: unknown;
    scopeLevel?: unknown;
  };
  jurisdiction?: {
    circuitZoneId?: unknown;
    circuitName?: unknown;
    districtZoneId?: unknown;
    districtName?: unknown;
  };
  instrument?: {
    instrumentVersionId?: unknown;
    code?: unknown;
    version?: unknown;
    contentHash?: unknown;
  };
  observation?: {
    dateObserved?: unknown;
    details?: unknown;
    selection?: unknown;
  };
};

const packageAssessmentSelect = {
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
  evidenceSnapshotJson: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  scores: {
    select: {
      assessmentId: true,
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
      contentHash: true,
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
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return identifier;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function canonicalReviewerRole(
  value: unknown,
): TeacherSupervisoryReviewerRole | null {
  const role = normalized(value);
  return TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles.includes(
    role as TeacherSupervisoryReviewerRole,
  )
    ? (role as TeacherSupervisoryReviewerRole)
    : null;
}

function officeLabel(role: string) {
  switch (normalized(role)) {
    case "SISSO":
      return "SISSO";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role);
  }
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

function assertGovernanceScope(input: {
  governanceScope: GovernanceScope;
  tenantId: string;
  circuitId: string;
  districtId: string;
  reviewerAssignmentId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
}) {
  const tenantIds = new Set(
    input.governanceScope.tenantIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.has(input.tenantId)) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_TENANT_OUT_OF_SCOPE", 403);
  }

  if (!input.governanceScope.isSuperAdmin) {
    const zoneIds = new Set(
      input.governanceScope.zoneIds.map(clean).filter(Boolean),
    );
    if (!zoneIds.has(input.circuitId) && !zoneIds.has(input.districtId)) {
      fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_ZONE_OUT_OF_SCOPE", 403);
    }
  }

  const scopeAssignment = input.governanceScope.assignments.find(
    (assignment) =>
      assignment.id === input.reviewerAssignmentId &&
      normalized(assignment.role) === input.reviewerRole &&
      assignment.zoneId === input.districtId &&
      assignment.zoneLevel ===
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel,
  );

  if (!input.governanceScope.isSuperAdmin && !scopeAssignment) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSIGNMENT_OUT_OF_SCOPE", 403);
  }
}

function assignmentIsCurrent(input: {
  assignment: PackageReviewerAssignmentRecord;
  actorUserId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewerAssignmentId: string;
  districtId: string;
  now: Date;
}) {
  const { assignment } = input;
  if (
    assignment.id !== input.reviewerAssignmentId ||
    assignment.userId !== input.actorUserId ||
    normalized(assignment.role) !== input.reviewerRole ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtId ||
    assignment.zone.id !== input.districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    return false;
  }
  if (
    assignment.startsAt &&
    assignment.startsAt.getTime() > input.now.getTime()
  ) {
    return false;
  }
  if (
    assignment.endsAt &&
    assignment.endsAt.getTime() <= input.now.getTime()
  ) {
    return false;
  }
  return true;
}

function buildObservation(input: {
  record: PackageAssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}): TeacherSupervisoryReviewPackageObservation {
  const snapshot = objectValue(
    input.record.evidenceSnapshotJson,
  ) as unknown as ObservationContext;
  const schemaVersion = Number(snapshot.schemaVersion);

  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    clean(snapshot.workflow) !== TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
    clean(snapshot.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
    clean(snapshot.target?.userId) !== input.evidence.targetUserId ||
    clean(snapshot.target?.tenantId) !== input.evidence.targetTenantId ||
    clean(snapshot.jurisdiction?.circuitZoneId) !==
      input.evidence.targetCircuitZoneId ||
    clean(snapshot.jurisdiction?.districtZoneId) !==
      input.evidence.targetDistrictZoneId ||
    clean(snapshot.assessor?.userId) !== input.evidence.assessorUserId ||
    clean(snapshot.assessor?.assignmentId) !==
      input.evidence.assessorAssignmentId ||
    clean(snapshot.instrument?.instrumentVersionId) !==
      input.evidence.instrumentVersionId ||
    clean(snapshot.instrument?.code) !== input.evidence.instrumentCode ||
    Number(snapshot.instrument?.version) !== input.evidence.instrumentVersion ||
    clean(snapshot.instrument?.contentHash).toLowerCase() !==
      input.evidence.instrumentContentHash ||
    clean(snapshot.observation?.dateObserved) !== input.evidence.dateObserved ||
    hashJson(input.record.evidenceSnapshotJson) !==
      input.evidence.observationContextHash
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_OBSERVATION_CONTEXT_DRIFT", 409);
  }

  const schoolName = clean(snapshot.target?.schoolName);
  const circuitName = clean(snapshot.jurisdiction?.circuitName);
  const districtName = clean(snapshot.jurisdiction?.districtName);
  if (!schoolName || !circuitName || !districtName) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_OBSERVATION_NAMES_MISSING", 409);
  }

  const details: TeacherSupervisoryObservationDetailsSnapshot | null =
    readTeacherSupervisoryObservationDetailsSnapshot(
      snapshot.observation?.details,
    );

  if (
    !details ||
    Number(details.schemaVersion) !== schemaVersion ||
    details.dateObserved !== input.evidence.dateObserved
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_OBSERVATION_DETAILS_INVALID", 409);
  }

  let teacherAssignmentVerified = false;
  let curriculumSelectionVerified = false;

  if (schemaVersion === 2) {
    const selection = readTeacherSupervisoryObservationSelectionSnapshot(
      snapshot.observation?.selection,
    );
    if (
      !selection ||
      selection.classTaught !== details.classTaught ||
      selection.subjectBeingObserved !== details.subjectBeingObserved ||
      selection.subStrand !== details.subStrand
    ) {
      fail(
        "TEACHER_SUPERVISORY_REVIEW_PACKAGE_OBSERVATION_SELECTION_INVALID",
        409,
      );
    }
    teacherAssignmentVerified = true;
    curriculumSelectionVerified = true;
  }

  return {
    contextSchemaVersion: schemaVersion as 1 | 2,
    teacherName: clean(snapshot.target?.name) || null,
    schoolName,
    circuitName,
    districtName,
    dateObserved: input.evidence.dateObserved,
    yearsInService: details.yearsInService,
    yearsInPresentSchool: details.yearsInPresentSchool,
    subjectBeingObserved: details.subjectBeingObserved,
    subStrand: details.subStrand,
    classTaught: details.classTaught,
    durationMinutes: details.durationMinutes,
    totalEnrolment: details.schemaVersion === 2 ? details.totalEnrolment : null,
    girls: details.schemaVersion === 2 ? details.girls : null,
    boys: details.schemaVersion === 2 ? details.boys : null,
    teacherAssignmentVerified,
    curriculumSelectionVerified,
  };
}

function buildSections(input: {
  record: PackageAssessmentRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
}): TeacherSupervisoryReviewPackageSection[] {
  const scoreByItemId = new Map<string, PackageAssessmentScoreRecord>();

  for (const score of input.record.scores) {
    if (
      score.assessmentId !== input.record.id ||
      !clean(score.instrumentItemId) ||
      scoreByItemId.has(score.instrumentItemId)
    ) {
      fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_SCORE_PROJECTION_DRIFT", 409, {
        itemKey: score.itemKey,
      });
    }
    scoreByItemId.set(score.instrumentItemId, score);
  }

  let itemCount = 0;
  const seenKeys = new Set<string>();

  const sections = [...input.record.instrumentVersion.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const items = [...section.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => {
          const score = scoreByItemId.get(item.id);
          if (
            !score ||
            score.itemKey !== item.key ||
            seenKeys.has(item.key) ||
            (score.notApplicable && score.score !== null) ||
            (!score.notApplicable && score.score === null)
          ) {
            fail(
              "TEACHER_SUPERVISORY_REVIEW_PACKAGE_ITEM_PROJECTION_DRIFT",
              409,
              { itemKey: item.key },
            );
          }

          seenKeys.add(item.key);
          itemCount += 1;

          return {
            itemKey: item.key,
            label: item.label,
            order: item.order,
            maxScore: item.maxScore,
            score: score.score,
            notApplicable: score.notApplicable,
          };
        });

      return {
        sectionKey: section.key,
        title: section.title,
        description: section.description,
        order: section.order,
        maxScore: section.maxScore,
        percentage:
          input.evidence.sectionPercentages[section.key] ?? null,
        items,
      };
    });

  if (
    sections.length !==
      TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.expectedSectionCount ||
    itemCount !== TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.expectedItemCount ||
    scoreByItemId.size !== itemCount
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_FORM_STRUCTURE_DRIFT", 409, {
      sectionCount: sections.length,
      itemCount,
      scoreCount: scoreByItemId.size,
    });
  }

  return sections;
}

function assertAssessmentProjection(
  record: PackageAssessmentRecord,
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence,
) {
  if (
    record.id !== evidence.assessmentId ||
    record.cycleId !== evidence.cycleId ||
    record.instrumentVersionId !== evidence.instrumentVersionId ||
    record.assessorUserId !== evidence.assessorUserId ||
    clean(record.assessorAssignmentId) !== evidence.assessorAssignmentId ||
    normalized(record.status) !== "FINALIZED" ||
    record.revision !== evidence.revision ||
    !record.dateObserved ||
    record.dateObserved.toISOString().slice(0, 10) !== evidence.dateObserved ||
    record.overallPercentage !== evidence.overallPercentage ||
    record.finalizedByUserId !== evidence.assessorUserId ||
    !record.finalizedAt ||
    record.finalizedAt.toISOString() !== evidence.finalizedAt ||
    clean(record.assessmentHash).toLowerCase() !== evidence.assessmentHash ||
    record.instrumentVersion.id !== evidence.instrumentVersionId ||
    record.instrumentVersion.version !== evidence.instrumentVersion ||
    record.instrumentVersion.instrument.code !== evidence.instrumentCode ||
    clean(record.instrumentVersion.contentHash).toLowerCase() !==
      evidence.instrumentContentHash
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_PROJECTION_DRIFT", 409);
  }

  const storedPercentages = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    JSON.stringify(stableValue(storedPercentages)) !==
    JSON.stringify(stableValue(evidence.sectionPercentages))
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_PERCENTAGE_DRIFT", 409);
  }
}

function resolveCurrentPendingReview(input: {
  reviews: PackageReviewRecord[];
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  actorUserId: string;
  reviewerRole: TeacherSupervisoryReviewerRole;
}) {
  const pending = input.reviews.filter(
    (review) => normalized(review.decision) === "PENDING",
  );

  if (pending.length !== 1) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_CURRENT_REVIEW_INVALID", 409, {
      pendingReviews: pending.length,
    });
  }

  const review = pending[0];
  if (
    review.assessmentId !== input.evidence.assessmentId ||
    review.cycleId !== input.evidence.cycleId ||
    review.reviewerUserId !== input.actorUserId ||
    !clean(review.reviewerAssignmentId) ||
    clean(review.note) ||
    review.decidedAt
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_REVIEW_CUSTODY_INVALID", 403);
  }

  const ordered = [...input.reviews].sort(
    (left, right) =>
      left.stage - right.stage ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  );

  if (
    ordered.length !== review.stage ||
    ordered.some((candidate, index) => candidate.stage !== index + 1) ||
    ordered[ordered.length - 1]?.id !== review.id
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_REVIEW_STAGE_DRIFT", 409);
  }

  for (const prior of ordered.slice(0, -1)) {
    const priorMetadata = objectValue(prior.metadata);
    if (
      normalized(prior.decision) !== "ACCEPTED" ||
      clean(prior.note) ||
      !prior.decidedAt ||
      clean(priorMetadata.workflow) !==
        TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
      clean(priorMetadata.evidenceStream) !==
        TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
      clean(priorMetadata.decisionAction) !== "FORWARD" ||
      clean(priorMetadata.nextReviewId) !== review.id ||
      Number(priorMetadata.nextReviewStage) !== review.stage ||
      clean(priorMetadata.nextReviewerRole) !== input.reviewerRole ||
      !/^[a-f0-9]{64}$/.test(
        clean(priorMetadata.decisionRequestHash).toLowerCase(),
      ) ||
      !/^[a-f0-9]{64}$/.test(
        clean(priorMetadata.decisionContractHash).toLowerCase(),
      ) ||
      !/^[a-f0-9]{64}$/.test(
        clean(priorMetadata.forwardedReviewEvidenceHash).toLowerCase(),
      ) ||
      clean(priorMetadata.forwardedReviewEvidenceHash).toLowerCase() !==
        clean(objectValue(review.metadata).reviewEvidenceHash).toLowerCase()
    ) {
      fail(
        "TEACHER_SUPERVISORY_REVIEW_PACKAGE_PRIOR_FORWARD_INVALID",
        409,
        { stage: prior.stage },
      );
    }
  }

  const chain = teacherSupervisoryReviewChainForAssessor(
    input.evidence.assessorRole,
  );
  const expectedStage = chain?.stages.find(
    (candidate) => candidate.stage === review.stage,
  );

  if (
    !chain ||
    !chain.requiresReviewRows ||
    !expectedStage ||
    expectedStage.reviewerRole !== input.reviewerRole
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_REVIEW_CHAIN_INVALID", 409);
  }

  const authority = decideTeacherSupervisoryReviewAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.reviewerRole,
    assessorUserId: input.evidence.assessorUserId,
    assessorRoleName: input.evidence.assessorRole,
    stage: review.stage,
  });

  if (!authority.allowed) {
    fail(
      `TEACHER_SUPERVISORY_REVIEW_PACKAGE_AUTHORITY_${authority.reason}`,
      403,
      { reason: authority.reason },
    );
  }

  return {
    review,
    reviewerAssignmentId: clean(review.reviewerAssignmentId),
    authority,
  };
}

function assertReviewMetadata(input: {
  review: PackageReviewRecord;
  cycle: PackageCycleRecord;
  evidence: TeacherSupervisoryFinalizedAssessmentEvidence;
  reviewerRole: TeacherSupervisoryReviewerRole;
  reviewerAssignmentId: string;
  expectedReviewEvidenceHash: string;
}) {
  const reviewMetadata = objectValue(input.review.metadata);
  const cycleReviewMetadata = objectValue(
    objectValue(input.cycle.metadata).teacherSupervisoryReview,
  );

  if (
    Number(reviewMetadata.schemaVersion) !== 1 ||
    clean(reviewMetadata.workflow) !==
      TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow ||
    clean(reviewMetadata.evidenceStream) !==
      TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream ||
    Number(reviewMetadata.reviewStage) !== input.review.stage ||
    clean(reviewMetadata.reviewerRole) !== input.reviewerRole ||
    clean(reviewMetadata.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    clean(reviewMetadata.assessmentId) !== input.evidence.assessmentId ||
    Number(reviewMetadata.assessmentRevision) !== input.evidence.revision ||
    clean(reviewMetadata.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(reviewMetadata.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    reviewMetadata.immutableEvidenceReverified !== true ||
    reviewMetadata.generalCommentIncludedInAssessmentHash !== true ||
    reviewMetadata.reviewerMayRewriteScores !== false ||
    reviewMetadata.reviewerMayRewriteComment !== false ||
    reviewMetadata.reviewerMayRewriteObservationDetails !== false ||
    reviewMetadata.reviewerMayRewriteGovernanceEnrolmentEvidence !== false ||
    reviewMetadata.reviewerMayRewriteTeacherAssignmentProvenance !== false ||
    reviewMetadata.reviewerMayRewriteCurriculumProvenance !== false ||
    reviewMetadata.assessmentMutationPerformed !== false ||
    reviewMetadata.scoreMutationPerformed !== false ||
    reviewMetadata.legacyTeacherAppraisalIncluded !== false ||
    reviewMetadata.combinedWeightingDefined !== false ||
    reviewMetadata.providerCalled !== false ||
    clean(cycleReviewMetadata.currentReviewId) !== input.review.id ||
    Number(cycleReviewMetadata.currentReviewStage) !== input.review.stage ||
    clean(cycleReviewMetadata.currentReviewerRole) !== input.reviewerRole ||
    clean(cycleReviewMetadata.currentReviewerAssignmentId) !==
      input.reviewerAssignmentId ||
    clean(cycleReviewMetadata.reviewEvidenceHash).toLowerCase() !==
      input.expectedReviewEvidenceHash ||
    clean(cycleReviewMetadata.admittedAssessmentId) !==
      input.evidence.assessmentId ||
    Number(cycleReviewMetadata.admittedAssessmentRevision) !==
      input.evidence.revision ||
    clean(cycleReviewMetadata.assessmentHash).toLowerCase() !==
      input.evidence.assessmentHash ||
    clean(cycleReviewMetadata.observationContextHash).toLowerCase() !==
      input.evidence.observationContextHash ||
    cycleReviewMetadata.immutableEvidenceReverified !== true ||
    cycleReviewMetadata.generalCommentIncludedInAssessmentHash !== true ||
    cycleReviewMetadata.reviewerMayRewriteScores !== false ||
    cycleReviewMetadata.reviewerMayRewriteComment !== false ||
    cycleReviewMetadata.legacyTeacherAppraisalIncluded !== false ||
    cycleReviewMetadata.combinedWeightingDefined !== false ||
    cycleReviewMetadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_REVIEW_EVIDENCE_DRIFT", 409);
  }
}

export async function readTeacherSupervisoryReviewPackage(
  input: TeacherSupervisoryReviewPackageInput,
): Promise<TeacherSupervisoryReviewPackage> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const now = requireNow(input.now);
  const reviewerRole = canonicalReviewerRole(input.actorRoleName);

  if (!reviewerRole) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_REVIEWER_ROLE_FORBIDDEN", 403);
  }

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReviewPackageDatabase);
  const verificationDatabase =
    input.verificationDatabase ??
    (prisma as unknown as Pick<
      TeacherSupervisoryScoringDatabase,
      "appraisalAssessment"
    >);

  const record = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: packageAssessmentSelect,
  });
  if (!record) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_NOT_FOUND", 404);
  }

  const evidence =
    await verifyTeacherSupervisoryFinalizedAssessmentEvidence({
      assessmentId,
      database: verificationDatabase,
    });

  assertAssessmentProjection(record, evidence);

  const reviews = await database.appraisalReview.findMany({
    where: {
      assessmentId,
    },
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
    orderBy: {
      stage: "asc",
    },
  });

  const current = resolveCurrentPendingReview({
    reviews,
    evidence,
    actorUserId,
    reviewerRole,
  });

  const cycle = await database.appraisalCycle.findUnique({
    where: {
      id: evidence.cycleId,
    },
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      status: true,
      closedAt: true,
      reviewStartedAt: true,
      releasedAt: true,
      cancelledAt: true,
      metadata: true,
    },
  });
  if (!cycle) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_NOT_FOUND", 404);
  }

  if (
    cycle.id !== evidence.cycleId ||
    normalized(cycle.status) !==
      TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.requiredCycleStatus ||
    cycle.scopeZoneId !== evidence.targetDistrictZoneId ||
    cycle.targetUserId !== evidence.targetUserId ||
    cycle.targetTenantId !== evidence.targetTenantId ||
    cycle.targetZoneId !== evidence.targetCircuitZoneId ||
    !cycle.closedAt ||
    !cycle.reviewStartedAt ||
    cycle.releasedAt !== null ||
    cycle.cancelledAt !== null
  ) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_DRIFT", 409);
  }

  const expectedReviewEvidenceHash =
    computeTeacherSupervisoryReviewEvidenceHash({
      evidence,
      reviewerUserId: actorUserId,
      reviewerAssignmentId: current.reviewerAssignmentId,
      reviewerRole,
      reviewStage: current.review.stage,
    });

  assertReviewMetadata({
    review: current.review,
    cycle,
    evidence,
    reviewerRole,
    reviewerAssignmentId: current.reviewerAssignmentId,
    expectedReviewEvidenceHash,
  });

  assertGovernanceScope({
    governanceScope: input.governanceScope,
    tenantId: evidence.targetTenantId,
    circuitId: evidence.targetCircuitZoneId,
    districtId: evidence.targetDistrictZoneId,
    reviewerAssignmentId: current.reviewerAssignmentId,
    reviewerRole,
  });

  const reviewerAssignments =
    await database.governanceOfficerAssignment.findMany({
      where: {
        userId: actorUserId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        revokedAt: true,
        startsAt: true,
        endsAt: true,
        zoneId: true,
        zone: {
          select: {
            id: true,
            isActive: true,
            zoneType: {
              select: {
                level: true,
              },
            },
          },
        },
      },
    });

  const activeAssignment = reviewerAssignments.find((assignment) =>
    assignmentIsCurrent({
      assignment,
      actorUserId,
      reviewerRole,
      reviewerAssignmentId: current.reviewerAssignmentId,
      districtId: evidence.targetDistrictZoneId,
      now,
    }),
  );

  if (!activeAssignment) {
    fail("TEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }

  const observation = buildObservation({
    record,
    evidence,
  });
  const sections = buildSections({
    record,
    evidence,
  });

  return {
    schemaVersion: 1,
    lifecycleState: "READY_FOR_REVIEW_DECISION",
    review: {
      id: current.review.id,
      stage: current.review.stage,
      decision: "PENDING",
      reviewerRole,
      createdAt: current.review.createdAt.toISOString(),
    },
    assessment: {
      id: evidence.assessmentId,
      cycleId: evidence.cycleId,
      revision: evidence.revision,
      status: "FINALIZED",
      finalizedAt: evidence.finalizedAt,
      assessorOffice: officeLabel(evidence.assessorRole),
      assessorScopeLevel: evidence.assessorScopeLevel,
      instrumentCode: evidence.instrumentCode,
      instrumentVersion: evidence.instrumentVersion,
      dateObserved: evidence.dateObserved,
      overallPercentage: evidence.overallPercentage,
      sectionPercentages: evidence.sectionPercentages,
      generalComment: record.generalComment,
      sections,
    },
    observation,
    integrity: {
      immutableFinalizedEvidenceVerified: true,
      assessmentHash: evidence.assessmentHash,
      observationContextHash: evidence.observationContextHash,
      reviewEvidenceHash: expectedReviewEvidenceHash,
      instrumentContentHash: evidence.instrumentContentHash,
      generalCommentIncludedInAssessmentHash: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteComment: false,
      reviewerMayRewriteObservationDetails: false,
      reviewerMayRewriteGovernanceEnrolmentEvidence: false,
      reviewerMayRewriteTeacherAssignmentProvenance: false,
      reviewerMayRewriteCurriculumProvenance: false,
      legacyTeacherAppraisalIncluded: false,
      combinedWeightingDefined: false,
    },
    privacy: {
      contactDetailsIncluded: false,
      rawEvidenceSnapshotIncluded: false,
      rawMetadataIncluded: false,
      confidentialStaffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
    },
    readOnly: true,
    providerCalled: false,
  };
}
