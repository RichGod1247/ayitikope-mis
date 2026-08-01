//src/lib/appraisals/headteacherSupervisoryAssessmentScoring.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateAppraisalScores } from "@/lib/appraisals/scoring";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  visitDetailsFromEvidenceSnapshot,
  type HeadteacherSupervisoryVisitDetailsSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  decideHeadteacherSupervisoryAssessmentAuthority,
  decideHeadteacherSupervisoryScoreMutation,
  type HeadteacherSupervisoryGovernanceAssignment,
  type HeadteacherSupervisoryTarget,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";

export const HEADTEACHER_SUPERVISORY_SCORING_POLICY = {
  schemaVersion: 1,
  assessmentHashSchemaVersion: 1,
  saveUnit: "SECTION",
  partialSectionSaveAllowed: true,
  commentsAllowed: false,
  eligibleDraftCycleStatuses: ["OPEN", "CLOSED"] as const,
  expectedSectionCount: 4,
  expectedItemCount: 34,
  expectedSectionMaximums: [55, 45, 40, 30] as const,
  scaleMinimum: 1,
  scaleMaximum: 5,
  allowNotApplicable: true,
  finalizedScoresImmutable: true,
  returnedAssessmentRequiresRevision: true,
  reviewerMayRewriteScores: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 60_000,
} as const;

const SUPERVISORY_DRAFT_SAVED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_ASSESSMENT_DRAFT_SAVED";
const SUPERVISORY_FINALIZED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_ASSESSMENT_FINALIZED";

type EligibleDraftCycleStatus =
  (typeof HEADTEACHER_SUPERVISORY_SCORING_POLICY.eligibleDraftCycleStatuses)[number];

export type HeadteacherSupervisoryScoreInput = {
  itemKey: string;
  score?: number | null;
  notApplicable?: boolean | null;
};

export type LoadHeadteacherSupervisoryAssessmentInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  now?: Date;
  database?: HeadteacherSupervisoryScoringDatabase;
};

export type SaveHeadteacherSupervisorySectionInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  sectionKey: string;
  scores: readonly HeadteacherSupervisoryScoreInput[];
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryScoringDatabase;
};

export type FinalizeHeadteacherSupervisoryAssessmentInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryScoringDatabase;
};

export type HeadteacherSupervisorySectionProgress = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  complete: boolean;
  percentage: number | null;
};

export type HeadteacherSupervisoryProgress = {
  totalSections: number;
  completedSections: number;
  totalItems: number;
  answeredItems: number;
  notApplicableItems: number;
  completionPercentage: number;
  missingItemKeys: string[];
  sections: HeadteacherSupervisorySectionProgress[];
};

export type HeadteacherSupervisoryAssessmentView = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  status: AppraisalAssessmentStatus;
  assessorUserId: string;
  assessorAssignmentId: string;
  targetUserId: string;
  targetTenantId: string;
  instrumentCode: string;
  instrumentVersion: number;
  dateObserved: string;
  visitContextHash: string;
  assessmentHash: string | null;
  finalizedAt: string | null;
  canEdit: boolean;
  canFinalize: boolean;
  commentsAllowed: false;
  separateFromStaffFeedback: true;
  combinedWeightingDefined: false;
  progress: HeadteacherSupervisoryProgress;
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
};

export type SaveHeadteacherSupervisorySectionResult = {
  outcome: "SAVED" | "UNCHANGED";
  assessmentId: string;
  sectionKey: string;
  savedItems: number;
  progress: HeadteacherSupervisoryProgress;
};

export type FinalizeHeadteacherSupervisoryAssessmentResult = {
  outcome: "FINALIZED" | "EXISTING_FINALIZED";
  assessmentId: string;
  finalizedAt: string;
  assessmentHash: string;
  overallPercentage: number | null;
  sectionPercentages: Record<string, number | null>;
  answeredItems: number;
  notApplicableItems: number;
  progress: HeadteacherSupervisoryProgress;
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

type AssessmentContextRecord = {
  id: string;
  cycleId: string;
  instrumentVersionId: string;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  status: string;
  revision: number;
  priorAssessmentId: string | null;
  dateObserved: Date | null;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  evidenceSnapshotJson: unknown;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  scores: AssessmentScoreRecord[];
  cycle: {
    id: string;
    scopeZoneId: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    status: string;
    openedAt: Date | null;
    closedAt: Date | null;
    reviewStartedAt: Date | null;
    releasedAt: Date | null;
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

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: {
    id: string;
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

type AssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  zoneId: string;
  zone: {
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

type AssessmentMutationRecord = {
  id: string;
  status: string;
  overallPercentage: number | null;
  sectionPercentagesJson: unknown;
  generalComment: string | null;
  assessmentHash: string | null;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  metadata: unknown;
};

type HeadteacherSupervisoryScoringTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentContextRecord | null>;
    update(args: unknown): Promise<AssessmentMutationRecord>;
  };
  appraisalAssessmentScore: {
    upsert(args: unknown): Promise<AssessmentScoreRecord>;
  };
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryScoringDatabase = {
  appraisalAssessment: HeadteacherSupervisoryScoringTransactionClient["appraisalAssessment"];
  appraisalAssessmentScore: HeadteacherSupervisoryScoringTransactionClient["appraisalAssessmentScore"];
  membership: HeadteacherSupervisoryScoringTransactionClient["membership"];
  governanceOfficerAssignment: HeadteacherSupervisoryScoringTransactionClient["governanceOfficerAssignment"];
  auditLog: HeadteacherSupervisoryScoringTransactionClient["auditLog"];
  $transaction<T>(
    operation: (
      tx: HeadteacherSupervisoryScoringTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type VisitContextSnapshot = {
  schemaVersion: 1 | 2;
  workflow: string;
  evidenceStream: string;
  cycle: {
    id: string;
    statusAtDraft: string;
    openedAt: string;
    deadlineAt: string | null;
    closedAt: string | null;
  };
  target: {
    userId: string;
    role: string;
    tenantId: string;
    name: string | null;
    schoolName: string;
  };
  assessor: {
    userId: string;
    name: string | null;
    role: string;
    assignmentId: string;
    assignmentRole: string;
    scopeLevel: string;
  };
  jurisdiction: {
    districtZoneId: string;
    districtName: string;
    circuitZoneId: string;
    circuitName: string;
    assignmentZoneId: string;
    assignmentZoneName: string;
    assignmentParentZoneId: string | null;
    assignmentParentZoneName: string | null;
  };
  instrument: {
    instrumentId: string;
    instrumentVersionId: string;
    code: string;
    version: number;
    contentHash: string;
  };
  observation: {
    dateObserved: string;
    visitDetails?: HeadteacherSupervisoryVisitDetailsSnapshot;
  };
};

const assessmentSelect = {
  id: true,
  cycleId: true,
  instrumentVersionId: true,
  assessorUserId: true,
  assessorAssignmentId: true,
  status: true,
  revision: true,
  priorAssessmentId: true,
  dateObserved: true,
  overallPercentage: true,
  sectionPercentagesJson: true,
  generalComment: true,
  evidenceSnapshotJson: true,
  assessmentHash: true,
  finalizedByUserId: true,
  finalizedAt: true,
  metadata: true,
  createdAt: true,
  scores: {
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
    orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
  },
  cycle: {
    select: {
      id: true,
      scopeZoneId: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      status: true,
      openedAt: true,
      closedAt: true,
      reviewStartedAt: true,
      releasedAt: true,
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
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_INVALID_CURRENT_TIME", 400);
  }
  return date;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
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

function assertCommentsAbsent(value: unknown) {
  const record = objectValue(value);
  for (const key of ["comment", "comments", "generalComment", "note"]) {
    const candidate = record[key];
    if (candidate != null && clean(candidate)) {
      fail("HEADTEACHER_SUPERVISORY_COMMENTS_FORBIDDEN", 400, { field: key });
    }
  }
}

function assertDraftCycleBoundary(record: AssessmentContextRecord) {
  const status = normalized(record.cycle.status);
  if (
    !HEADTEACHER_SUPERVISORY_SCORING_POLICY.eligibleDraftCycleStatuses.includes(
      status as EligibleDraftCycleStatus,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE", 409, {
      cycleId: record.cycle.id,
      status,
    });
  }
  if (!record.cycle.openedAt) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_CYCLE_NOT_OPENED", 409);
  }
  if (
    record.cycle.reviewStartedAt ||
    record.cycle.releasedAt ||
    record.cycle.cancelledAt
  ) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_REVIEW_BOUNDARY_CLOSED", 409);
  }
  if (status === "CLOSED" && !record.cycle.closedAt) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_CLOSED_TIMESTAMP_MISSING", 409);
  }
}

function assertOwner(record: AssessmentContextRecord, actorUserId: string) {
  if (record.assessorUserId !== actorUserId) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_ASSESSOR_ONLY", 403);
  }
}

function assertDraftOwnerMutation(
  record: AssessmentContextRecord,
  actorUserId: string,
) {
  const decision = decideHeadteacherSupervisoryScoreMutation({
    status: record.status,
    actorUserId,
    assessorUserId: record.assessorUserId,
  });
  if (!decision.allowed) {
    fail(`HEADTEACHER_SUPERVISORY_SCORING_${decision.reason}`, 409, {
      reason: decision.reason,
    });
  }
}

function assertInstrumentStructure(record: AssessmentContextRecord) {
  const version = record.instrumentVersion;
  const expected = HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY;
  if (
    record.instrumentVersionId !== version.id ||
    version.version !== expected.instrumentVersion ||
    version.status !== "ACTIVE" ||
    version.instrument.code !== expected.instrumentCode ||
    version.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    version.instrument.subjectType !== "HEADTEACHER" ||
    version.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/i.test(clean(version.contentHash))
  ) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_INSTRUMENT_INVALID", 409);
  }

  const sections = [...version.sections].sort((a, b) => a.order - b.order);
  if (sections.length !== expected.expectedSectionCount) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_COUNT_DRIFT", 409);
  }

  const sectionKeys = new Set<string>();
  const sectionOrders = new Set<number>();
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
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
      fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_STRUCTURE_DRIFT", 409, {
        sectionKey: section.key,
      });
    }
    sectionKeys.add(section.key);
    sectionOrders.add(section.order);

    const items = [...section.items].sort((a, b) => a.order - b.order);
    const rawMaximum = items.reduce((sum, item) => sum + item.maxScore, 0);
    if (rawMaximum !== section.maxScore) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_MAXIMUM_DRIFT", 409, {
        sectionKey: section.key,
      });
    }

    const itemOrders = new Set<number>();

    items.forEach((item) => {
      if (
        !clean(item.id) ||
        !clean(item.key) ||
        !clean(item.label) ||
        itemIds.has(item.id) ||
        itemKeys.has(item.key) ||
        !Number.isInteger(item.order) ||
        item.order < 1 ||
        itemOrders.has(item.order) ||
        item.maxScore !== expected.scaleMaximum ||
        item.isRequired !== true
      ) {
        fail("HEADTEACHER_SUPERVISORY_SCORING_ITEM_STRUCTURE_DRIFT", 409, {
          itemKey: item.key,
        });
      }
      itemIds.add(item.id);
      itemKeys.add(item.key);
      itemOrders.add(item.order);
      itemCount += 1;
    });
  });

  if (itemCount !== expected.expectedItemCount) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_ITEM_COUNT_DRIFT", 409, {
      itemCount,
    });
  }

  return sections;
}

function parseVisitContext(record: AssessmentContextRecord): VisitContextSnapshot {
  const context = objectValue(record.evidenceSnapshotJson);
  const metadata = objectValue(record.metadata);
  const visitContextHash = clean(metadata.visitContextHash).toLowerCase();
  if (
    !/^[a-f0-9]{64}$/.test(visitContextHash) ||
    hashJson(record.evidenceSnapshotJson) !== visitContextHash
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_CONTEXT_HASH_INVALID", 409);
  }

  const typed = context as unknown as VisitContextSnapshot;
  const schemaVersion = Number(typed.schemaVersion);
  const supportedSchemaVersion =
    schemaVersion === 1 ||
    schemaVersion ===
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion;
  const instrumentHash = clean(record.instrumentVersion.contentHash).toLowerCase();
  if (
    !supportedSchemaVersion ||
    typed.workflow !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    typed.evidenceStream !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    typed.cycle?.id !== record.cycleId ||
    typed.target?.userId !== record.cycle.targetUserId ||
    typed.target?.tenantId !== record.cycle.targetTenantId ||
    normalized(typed.target?.role) !== "HEADTEACHER" ||
    typed.assessor?.userId !== record.assessorUserId ||
    typed.assessor?.assignmentId !== record.assessorAssignmentId ||
    typed.instrument?.instrumentId !== record.instrumentVersion.instrument.id ||
    typed.instrument?.instrumentVersionId !== record.instrumentVersionId ||
    typed.instrument?.code !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    typed.instrument?.version !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    clean(typed.instrument?.contentHash).toLowerCase() !== instrumentHash ||
    !record.dateObserved ||
    typed.observation?.dateObserved !== isoDateOnly(record.dateObserved)
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_CONTEXT_DRIFT", 409);
  }

  const visitDetails = visitDetailsFromEvidenceSnapshot(
    record.evidenceSnapshotJson,
  );

  if (
    schemaVersion ===
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion
  ) {
    const metadataSchemaVersion = Number(metadata.visitContextSchemaVersion);
    const visitDetailsSchemaVersion = Number(
      metadata.visitDetailsSchemaVersion,
    );

    if (
      !visitDetails ||
      metadataSchemaVersion !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion ||
      visitDetailsSchemaVersion !==
        HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.schemaVersion ||
      metadata.officialVisitDetailsIncluded !== true
    ) {
      fail("HEADTEACHER_SUPERVISORY_VISIT_DETAILS_INVALID", 409);
    }
  }

  return typed;
}

function targetFromMembership(
  record: AssessmentContextRecord,
  membership: TargetMembershipRecord,
): HeadteacherSupervisoryTarget {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;
  if (
    membership.userId !== record.cycle.targetUserId ||
    membership.tenantId !== record.cycle.targetTenantId ||
    membership.tenant.id !== record.cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    zone.id !== record.cycle.targetZoneId ||
    district.id !== record.cycle.scopeZoneId
  ) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_TARGET_CONTEXT_INVALID", 409);
  }

  return {
    userId: membership.userId,
    roleName: membership.role.name,
    isActive: true,
    tenantId: membership.tenantId,
    tenantStatus: membership.tenant.status,
    circuitZoneId: zone.id,
    circuitName: zone.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

function assignmentInputs(
  assignments: AssignmentRecord[],
): HeadteacherSupervisoryGovernanceAssignment[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    userId: assignment.userId,
    role: assignment.role,
    zoneId: assignment.zoneId,
    zoneName: assignment.zone.name,
    zoneLevel: assignment.zone.zoneType.level,
    parentZoneId: assignment.zone.parentZoneId,
    parentZoneName: assignment.zone.parentZone?.name ?? null,
    status: assignment.status,
    isActive: assignment.zone.isActive,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  }));
}

async function assertCurrentAuthority(
  tx: HeadteacherSupervisoryScoringTransactionClient,
  record: AssessmentContextRecord,
  input: { actorUserId: string; actorRoleName: string; now: Date },
) {
  const membership = await tx.membership.findFirst({
    where: {
      userId: record.cycle.targetUserId,
      tenantId: record.cycle.targetTenantId,
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: { select: { name: true } },
      tenant: {
        select: {
          id: true,
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
    },
  });
  if (!membership) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_TARGET_NOT_FOUND", 404);
  }

  const assignments = await tx.governanceOfficerAssignment.findMany({
    where: { userId: input.actorUserId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      startsAt: true,
      endsAt: true,
      zoneId: true,
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
  });

  const decision = decideHeadteacherSupervisoryAssessmentAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    target: targetFromMembership(record, membership),
    assignments: assignmentInputs(assignments),
    now: input.now,
  });
  if (!decision.allowed) {
    fail(`HEADTEACHER_SUPERVISORY_SCORING_AUTHORITY_${decision.reason}`, 403, {
      reason: decision.reason,
    });
  }
  if (decision.assignmentId !== record.assessorAssignmentId) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_ASSIGNMENT_DRIFT", 409);
  }

  const context = parseVisitContext(record);
  if (
    context.assessor.assignmentId !== decision.assignmentId ||
    normalized(context.assessor.role) !== decision.effectiveRole ||
    normalized(context.assessor.assignmentRole) !== decision.effectiveRole ||
    normalized(context.assessor.scopeLevel) !== decision.scopeLevel
  ) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_AUTHORITY_CONTEXT_DRIFT", 409);
  }

  return { decision, context };
}

function validateStoredScores(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  const items = sections.flatMap((section) =>
    section.items.map((item) => ({ section, item })),
  );
  const byItemId = new Map(items.map((row) => [row.item.id, row]));
  const seen = new Set<string>();

  for (const score of record.scores) {
    const expected = byItemId.get(score.instrumentItemId);
    if (
      score.assessmentId !== record.id ||
      !expected ||
      seen.has(score.instrumentItemId) ||
      score.sectionKey !== expected.section.key ||
      score.sectionTitle !== expected.section.title ||
      score.sectionOrder !== expected.section.order ||
      score.sectionMaxScore !== expected.section.maxScore ||
      score.itemKey !== expected.item.key ||
      score.itemLabel !== expected.item.label ||
      score.itemOrder !== expected.item.order ||
      score.itemMaxScore !== expected.item.maxScore ||
      (score.notApplicable && score.score != null) ||
      (!score.notApplicable &&
        score.score != null &&
        (!Number.isInteger(score.score) ||
          score.score < HEADTEACHER_SUPERVISORY_SCORING_POLICY.scaleMinimum ||
          score.score > expected.item.maxScore))
    ) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_STORED_SCORE_DRIFT", 409, {
        itemKey: score.itemKey,
      });
    }
    seen.add(score.instrumentItemId);
  }

  return { items, byItemId };
}

function calculationRows(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  const stored = new Map(
    record.scores.map((score) => [score.instrumentItemId, score]),
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

function sectionPercentageMap(value: unknown) {
  const object = objectValue(value);
  return Object.fromEntries(
    Object.entries(object).map(([key, raw]) => [
      key,
      raw == null ? null : Number(raw),
    ]),
  ) as Record<string, number | null>;
}

function progressFor(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
): HeadteacherSupervisoryProgress {
  const stored = new Map(record.scores.map((score) => [score.instrumentItemId, score]));
  const missingItemKeys: string[] = [];
  const sectionProgress = sections.map((section) => {
    let answeredItems = 0;
    let notApplicableItems = 0;
    for (const item of section.items) {
      const score = stored.get(item.id);
      if (score?.notApplicable) {
        answeredItems += 1;
        notApplicableItems += 1;
      } else if (score?.score != null) {
        answeredItems += 1;
      } else {
        missingItemKeys.push(item.key);
      }
    }
    const sectionCalculation = calculateAppraisalScores(
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
      { requireComplete: false },
    );
    if (!sectionCalculation.ok) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_PROGRESS_INVALID", 409, {
        scoreError: sectionCalculation.code,
      });
    }
    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      totalItems: section.items.length,
      answeredItems,
      notApplicableItems,
      complete: answeredItems === section.items.length,
      percentage:
        sectionCalculation.value.sectionPercentages[section.key] ?? null,
    };
  });
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const answeredItems = totalItems - missingItemKeys.length;
  const notApplicableItems = sectionProgress.reduce(
    (sum, section) => sum + section.notApplicableItems,
    0,
  );
  return {
    totalSections: sections.length,
    completedSections: sectionProgress.filter((section) => section.complete).length,
    totalItems,
    answeredItems,
    notApplicableItems,
    completionPercentage:
      totalItems > 0 ? round2((answeredItems / totalItems) * 100) : 0,
    missingItemKeys,
    sections: sectionProgress,
  };
}

function assessmentHashPayload(input: {
  record: AssessmentContextRecord;
  visitContextHash: string;
  sections: InstrumentSectionRecord[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
}) {
  const stored = new Map(
    input.record.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion:
      HEADTEACHER_SUPERVISORY_SCORING_POLICY.assessmentHashSchemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: input.record.id,
      cycleId: input.record.cycleId,
      revision: input.record.revision,
      assessorUserId: input.record.assessorUserId,
      assessorAssignmentId: input.record.assessorAssignmentId,
      dateObserved: input.record.dateObserved
        ? isoDateOnly(input.record.dateObserved)
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

function sameNumbers(
  left: Record<string, number | null>,
  right: Record<string, number | null>,
) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function verifyFinalizedAssessment(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
) {
  if (
    normalized(record.status) !== "FINALIZED" ||
    !record.finalizedAt ||
    record.finalizedByUserId !== record.assessorUserId ||
    !/^[a-f0-9]{64}$/i.test(clean(record.assessmentHash)) ||
    clean(record.generalComment)
  ) {
    fail("HEADTEACHER_SUPERVISORY_FINALIZED_EVIDENCE_INVALID", 409);
  }

  const calculated = calculateAppraisalScores(calculationRows(record, sections), {
    requireComplete: true,
  });
  if (!calculated.ok) {
    fail("HEADTEACHER_SUPERVISORY_FINALIZED_SCORES_INVALID", 409, {
      scoreError: calculated.code,
      itemKeys: calculated.itemKeys,
    });
  }

  const storedSections = sectionPercentageMap(record.sectionPercentagesJson);
  if (
    !sameNumbers(storedSections, calculated.value.sectionPercentages) ||
    record.overallPercentage !== calculated.value.overallPercentage
  ) {
    fail("HEADTEACHER_SUPERVISORY_FINALIZED_CALCULATION_DRIFT", 409);
  }

  const visitContextHash = clean(objectValue(record.metadata).visitContextHash).toLowerCase();
  const expectedHash = hashJson(
    assessmentHashPayload({
      record,
      visitContextHash,
      sections,
      sectionPercentages: calculated.value.sectionPercentages,
      overallPercentage: calculated.value.overallPercentage,
    }),
  );
  if (expectedHash !== clean(record.assessmentHash).toLowerCase()) {
    fail("HEADTEACHER_SUPERVISORY_ASSESSMENT_HASH_DRIFT", 409);
  }

  return calculated.value;
}

async function findAssessment(
  database: Pick<HeadteacherSupervisoryScoringDatabase, "appraisalAssessment">,
  assessmentId: string,
) {
  const assessment = await database.appraisalAssessment.findUnique({
    where: { id: assessmentId },
    select: assessmentSelect,
  });
  if (!assessment) {
    fail("HEADTEACHER_SUPERVISORY_ASSESSMENT_NOT_FOUND", 404);
  }
  return assessment;
}

function buildView(
  record: AssessmentContextRecord,
  sections: InstrumentSectionRecord[],
): HeadteacherSupervisoryAssessmentView {
  const progress = progressFor(record, sections);
  const status = normalized(record.status) as AppraisalAssessmentStatus;
  return {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    status,
    assessorUserId: record.assessorUserId,
    assessorAssignmentId: clean(record.assessorAssignmentId),
    targetUserId: record.cycle.targetUserId,
    targetTenantId: clean(record.cycle.targetTenantId),
    instrumentCode: record.instrumentVersion.instrument.code,
    instrumentVersion: record.instrumentVersion.version,
    dateObserved: record.dateObserved ? isoDateOnly(record.dateObserved) : "",
    visitContextHash: clean(objectValue(record.metadata).visitContextHash),
    assessmentHash: record.assessmentHash,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    canEdit: status === "DRAFT",
    canFinalize: status === "DRAFT" && progress.missingItemKeys.length === 0,
    commentsAllowed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
    progress,
    sectionPercentages: sectionPercentageMap(record.sectionPercentagesJson),
    overallPercentage: record.overallPercentage,
  };
}

function normalizeSectionPayload(
  section: InstrumentSectionRecord,
  inputs: readonly HeadteacherSupervisoryScoreInput[],
) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_SCORES_REQUIRED", 400);
  }
  if (inputs.length > section.items.length) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_TOO_MANY_SECTION_SCORES", 400);
  }

  const itemByKey = new Map(section.items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  return inputs.map((input) => {
    const itemKey = clean(input.itemKey);
    const item = itemByKey.get(itemKey);
    if (!item) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_ITEM_NOT_IN_SECTION", 400, {
        itemKey,
        sectionKey: section.key,
      });
    }
    if (seen.has(itemKey)) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_DUPLICATE_ITEM", 400, {
        itemKey,
      });
    }
    seen.add(itemKey);

    const notApplicable = input.notApplicable === true;
    const score = input.score == null ? null : Number(input.score);
    if (notApplicable && score != null) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_NA_WITH_SCORE", 400, { itemKey });
    }
    if (
      !notApplicable &&
      (!Number.isInteger(score) ||
        (score as number) < HEADTEACHER_SUPERVISORY_SCORING_POLICY.scaleMinimum ||
        (score as number) > item.maxScore)
    ) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_INVALID_SCORE", 400, { itemKey });
    }

    return {
      item,
      score: notApplicable ? null : (score as number),
      notApplicable,
    };
  });
}

function storedScoreEquals(
  existing: AssessmentScoreRecord | undefined,
  row: { score: number | null; notApplicable: boolean },
) {
  return Boolean(
    existing &&
      existing.score === row.score &&
      existing.notApplicable === row.notApplicable,
  );
}

function transactionOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: HEADTEACHER_SUPERVISORY_SCORING_POLICY.transactionMaxWaitMs,
    timeout: HEADTEACHER_SUPERVISORY_SCORING_POLICY.transactionTimeoutMs,
  };
}

export async function loadHeadteacherSupervisoryAssessment(
  input: LoadHeadteacherSupervisoryAssessmentInput,
): Promise<HeadteacherSupervisoryAssessmentView> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const now = requireNow(input.now);
  const actorRoleName = normalized(input.actorRoleName);
  const record = await findAssessment(database, assessmentId);
  assertOwner(record, actorUserId);
  const sections = assertInstrumentStructure(record);
  validateStoredScores(record, sections);
  parseVisitContext(record);

  if (normalized(record.status) === "DRAFT") {
    assertDraftCycleBoundary(record);
    await assertCurrentAuthority(database, record, {
      actorUserId,
      actorRoleName,
      now,
    });
  } else if (normalized(record.status) === "FINALIZED") {
    verifyFinalizedAssessment(record, sections);
  }

  return buildView(record, sections);
}

export async function saveHeadteacherSupervisoryAssessmentSection(
  input: SaveHeadteacherSupervisorySectionInput,
): Promise<SaveHeadteacherSupervisorySectionResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorRoleName = normalized(input.actorRoleName);
  const sectionKey = clean(input.sectionKey);
  const now = requireNow(input.now);
  assertCommentsAbsent(input);
  if (!sectionKey) {
    fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_KEY_REQUIRED", 400);
  }

  return database.$transaction(async (tx) => {
    const record = await findAssessment(tx, assessmentId);
    assertDraftOwnerMutation(record, actorUserId);
    assertDraftCycleBoundary(record);
    const sections = assertInstrumentStructure(record);
    validateStoredScores(record, sections);
    const { context } = await assertCurrentAuthority(tx, record, {
      actorUserId,
      actorRoleName,
      now,
    });

    const section = sections.find((candidate) => candidate.key === sectionKey);
    if (!section) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_SECTION_NOT_FOUND", 404, {
        sectionKey,
      });
    }
    const normalizedRows = normalizeSectionPayload(section, input.scores);
    const existingByItem = new Map(
      record.scores.map((score) => [score.instrumentItemId, score]),
    );
    const changed = normalizedRows.filter(
      (row) => !storedScoreEquals(existingByItem.get(row.item.id), row),
    );
    if (!changed.length) {
      return {
        outcome: "UNCHANGED" as const,
        assessmentId: record.id,
        sectionKey,
        savedItems: normalizedRows.length,
        progress: progressFor(record, sections),
      };
    }

    const savedByItem = new Map(existingByItem);
    for (const row of changed) {
      const saved = await tx.appraisalAssessmentScore.upsert({
        where: {
          assessmentId_instrumentItemId: {
            assessmentId: record.id,
            instrumentItemId: row.item.id,
          },
        },
        create: {
          assessmentId: record.id,
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
      });
      savedByItem.set(row.item.id, saved);
    }

    await tx.auditLog.create({
      data: {
        tenantId: record.cycle.targetTenantId,
        userId: actorUserId,
        action: SUPERVISORY_DRAFT_SAVED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: record.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: SUPERVISORY_DRAFT_SAVED_AUDIT_ACTION,
          workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
          cycleId: record.cycleId,
          assessmentId: record.id,
          revision: record.revision,
          sectionKey,
          changedItemCount: changed.length,
          assessorAssignmentId: record.assessorAssignmentId,
          scopeLevel: context.assessor.scopeLevel,
          visitContextHash: clean(objectValue(record.metadata).visitContextHash),
          scoreValuesRecordedInAudit: false,
          contactFieldsIncluded: false,
          providerCalled: false,
        },
      },
    });

    const updated: AssessmentContextRecord = {
      ...record,
      scores: [...savedByItem.values()].sort(
        (left, right) =>
          left.sectionOrder - right.sectionOrder ||
          left.itemOrder - right.itemOrder,
      ),
    };
    return {
      outcome: "SAVED" as const,
      assessmentId: record.id,
      sectionKey,
      savedItems: normalizedRows.length,
      progress: progressFor(updated, sections),
    };
  }, transactionOptions());
}

export async function finalizeHeadteacherSupervisoryAssessment(
  input: FinalizeHeadteacherSupervisoryAssessmentInput,
): Promise<FinalizeHeadteacherSupervisoryAssessmentResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryScoringDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorRoleName = normalized(input.actorRoleName);
  const now = requireNow(input.now);
  assertCommentsAbsent(input);

  return database.$transaction(async (tx) => {
    const record = await findAssessment(tx, assessmentId);
    assertOwner(record, actorUserId);
    const sections = assertInstrumentStructure(record);
    validateStoredScores(record, sections);
    parseVisitContext(record);

    if (normalized(record.status) === "FINALIZED") {
      const calculated = verifyFinalizedAssessment(record, sections);
      return {
        outcome: "EXISTING_FINALIZED" as const,
        assessmentId: record.id,
        finalizedAt: record.finalizedAt?.toISOString() ?? "",
        assessmentHash: clean(record.assessmentHash),
        overallPercentage: calculated.overallPercentage,
        sectionPercentages: calculated.sectionPercentages,
        answeredItems: calculated.answeredItems,
        notApplicableItems: calculated.notApplicableItems,
        progress: progressFor(record, sections),
      };
    }

    assertDraftOwnerMutation(record, actorUserId);
    assertDraftCycleBoundary(record);
    const { context } = await assertCurrentAuthority(tx, record, {
      actorUserId,
      actorRoleName,
      now,
    });

    const calculated = calculateAppraisalScores(calculationRows(record, sections), {
      requireComplete: true,
    });
    if (!calculated.ok) {
      fail("HEADTEACHER_SUPERVISORY_SCORING_INCOMPLETE", 409, {
        scoreError: calculated.code,
        itemKeys: calculated.itemKeys,
      });
    }

    const visitContextHash = clean(objectValue(record.metadata).visitContextHash).toLowerCase();
    const assessmentHash = hashJson(
      assessmentHashPayload({
        record,
        visitContextHash,
        sections,
        sectionPercentages: calculated.value.sectionPercentages,
        overallPercentage: calculated.value.overallPercentage,
      }),
    );
    const metadata = {
      ...objectValue(record.metadata),
      workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      scoringSchemaVersion: HEADTEACHER_SUPERVISORY_SCORING_POLICY.schemaVersion,
      assessmentHashSchemaVersion:
        HEADTEACHER_SUPERVISORY_SCORING_POLICY.assessmentHashSchemaVersion,
      assessmentHash,
      commentsAllowed: false,
      finalizedScoresImmutable: true,
      returnedAssessmentRequiresRevision: true,
      reviewerMayRewriteScores: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      answeredItemCount: calculated.value.answeredItems,
      notApplicableItemCount: calculated.value.notApplicableItems,
      providerCalled: false,
    };

    const finalized = await tx.appraisalAssessment.update({
      where: { id: record.id },
      data: {
        status: "FINALIZED",
        overallPercentage: calculated.value.overallPercentage,
        sectionPercentagesJson: calculated.value.sectionPercentages,
        generalComment: null,
        assessmentHash,
        finalizedByUserId: actorUserId,
        finalizedAt: now,
        metadata,
      },
      select: {
        id: true,
        status: true,
        overallPercentage: true,
        sectionPercentagesJson: true,
        generalComment: true,
        assessmentHash: true,
        finalizedByUserId: true,
        finalizedAt: true,
        metadata: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: record.cycle.targetTenantId,
        userId: actorUserId,
        action: SUPERVISORY_FINALIZED_AUDIT_ACTION,
        resource: "AppraisalAssessment",
        resourceId: record.id,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: {
          reqId,
          action: SUPERVISORY_FINALIZED_AUDIT_ACTION,
          workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
          evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
          cycleId: record.cycleId,
          assessmentId: record.id,
          revision: record.revision,
          assessorAssignmentId: record.assessorAssignmentId,
          scopeLevel: context.assessor.scopeLevel,
          visitContextHash,
          assessmentHash,
          answeredItemCount: calculated.value.answeredItems,
          notApplicableItemCount: calculated.value.notApplicableItems,
          scoreValuesRecordedInAudit: false,
          aggregateScoreRecordedInAudit: false,
          contactFieldsIncluded: false,
          providerCalled: false,
        },
      },
    });

    const finalizedRecord: AssessmentContextRecord = {
      ...record,
      status: finalized.status,
      overallPercentage: finalized.overallPercentage,
      sectionPercentagesJson: finalized.sectionPercentagesJson,
      generalComment: finalized.generalComment,
      assessmentHash: finalized.assessmentHash,
      finalizedByUserId: finalized.finalizedByUserId,
      finalizedAt: finalized.finalizedAt,
      metadata: finalized.metadata,
    };

    return {
      outcome: "FINALIZED" as const,
      assessmentId: finalized.id,
      finalizedAt: finalized.finalizedAt?.toISOString() ?? now.toISOString(),
      assessmentHash: finalized.assessmentHash ?? assessmentHash,
      overallPercentage: finalized.overallPercentage,
      sectionPercentages: sectionPercentageMap(finalized.sectionPercentagesJson),
      answeredItems: calculated.value.answeredItems,
      notApplicableItems: calculated.value.notApplicableItems,
      progress: progressFor(finalizedRecord, sections),
    };
  }, transactionOptions());
}
