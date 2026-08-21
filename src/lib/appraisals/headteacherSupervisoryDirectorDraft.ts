import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
  decideHeadteacherSupervisoryAssessmentAuthority,
  inspectHeadteacherSupervisoryInstrument,
  type HeadteacherSupervisoryGovernanceAssignment,
  type HeadteacherSupervisoryTarget,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY,
  buildHeadteacherSupervisoryVisitDetailsSnapshot,
  type HeadteacherSupervisoryVisitDetailsSnapshot,
} from "@/lib/appraisals/headteacherSupervisoryVisitDetails";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY = {
  schemaVersion: 1,
  visitContextSchemaVersion:
    HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion,
  carrierKind: "DIRECTOR_GOVERNANCE_ONLY",
  initialRevision: 1,
  initialAssessmentStatus: "DRAFT",
  initialCycleStatus: "OPEN",
  requiredActorRole: "DISTRICT_DIRECTOR",
  cycleAndAssessmentAtomic: true,
  identityVisibility: "AUTHORIZED_GOVERNANCE_ONLY",
  respondentWorkflow: false,
  responseWindowDays: 0,
  minimumResponses: 0,
  participantSelection: "NONE",
  visitContextImmutable: true,
  scoreRowsCreatedAtDraft: false,
  commentsCreatedAtDraft: false,
  reviewRowsCreatedAtDraft: false,
  aggregateRowsCreatedAtDraft: false,
  notificationRowsCreatedAtDraft: false,
  staffFeedbackRequired: false,
  staffFeedbackAccessed: false,
  separateFromStaffFeedback: true,
  combinedWeightingDefined: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 60_000,
} as const;

const DIRECT_CYCLE_OPENED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_DIRECTOR_GOVERNANCE_CYCLE_OPENED";
const DIRECT_DRAFT_CREATED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_DIRECTOR_GOVERNANCE_DRAFT_CREATED";
const RELEASES_METADATA_KEY = "headteacherSupervisoryReleases";

export type CreateHeadteacherSupervisoryDirectorDraftInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  targetUserId: string;
  targetTenantId: string;
  directAssessmentKey: string;
  dateObserved: Date | string;
  arrivalTime?: unknown;
  staffStrength?: unknown;
  totalEnrolment?: unknown;
  girls?: unknown;
  boys?: unknown;
  teachersPresentAtVisit?: unknown;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryDirectorDraftDatabase;
};

export type HeadteacherSupervisoryDirectorDraftSummary = {
  cycleId: string;
  cycleStatus: "OPEN";
  assessmentId: string;
  assessmentStatus: AppraisalAssessmentStatus;
  revision: number;
  assessorUserId: string;
  assessorAssignmentId: string;
  targetUserId: string;
  targetTenantId: string;
  dateObserved: string;
  visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
  instrumentVersionId: string;
  instrumentCode: string;
  instrumentVersion: number;
  visitContextSchemaVersion: number;
  visitContextHash: string;
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT";
  carrierKind: "DIRECTOR_GOVERNANCE_ONLY";
  cycleCreatedAt: string;
  assessmentCreatedAt: string;
  scoreRowsCreatedAtDraft: false;
  participantRowsCreated: false;
  notificationRowsCreated: false;
  providerCalled: false;
};

export type CreateHeadteacherSupervisoryDirectorDraftResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  draft: HeadteacherSupervisoryDirectorDraftSummary;
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

type ActorUserRecord = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
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

type SupervisoryInstrumentVersionRecord = {
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
};

type CycleRecord = {
  id: string;
  instrumentVersionId: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  targetGovernanceAssignmentId: string | null;
  status: string;
  identityVisibility: string;
  idempotencyKey: string;
  responseWindowDays: number;
  minimumResponses: number;
  extensionCount: number;
  targetNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  requestedByUserId: string;
  openedByUserId: string | null;
  requestedAt: Date;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  _count: { participants: number };
};

type ExistingDirectCycleRecord = CycleRecord & {
  instrumentVersion: SupervisoryInstrumentVersionRecord;
  assessments: Array<{
    id: string;
    status: string;
    revision: number;
    createdAt: Date;
  }>;
};

type AssessmentRecord = {
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
  _count: { scores: number; reviews: number };
};

type AppraisalCycleDelegate = {
  findUnique(args: unknown): Promise<CycleRecord | null>;
  findMany(args: unknown): Promise<ExistingDirectCycleRecord[]>;
  create(args: unknown): Promise<CycleRecord>;
};

type AppraisalAssessmentDelegate = {
  findUnique(args: unknown): Promise<AssessmentRecord | null>;
  create(args: unknown): Promise<AssessmentRecord>;
};

export type HeadteacherSupervisoryDirectorDraftTransactionClient = {
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
  user: {
    findUnique(args: unknown): Promise<ActorUserRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  appraisalInstrumentVersion: {
    findFirst(args: unknown): Promise<SupervisoryInstrumentVersionRecord | null>;
  };
  appraisalCycle: AppraisalCycleDelegate;
  appraisalAssessment: AppraisalAssessmentDelegate;
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryDirectorDraftDatabase = {
  appraisalCycle: AppraisalCycleDelegate;
  appraisalAssessment: AppraisalAssessmentDelegate;
  $transaction<T>(
    operation: (
      tx: HeadteacherSupervisoryDirectorDraftTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type ResolvedTarget = {
  target: HeadteacherSupervisoryTarget;
  membershipId: string;
  name: string | null;
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
};

type VisitContextSnapshot = {
  schemaVersion: number;
  workflow: string;
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT";
  cycle: {
    id: string;
    statusAtDraft: "OPEN";
    openedAt: string;
    deadlineAt: null;
    closedAt: null;
  };
  target: {
    userId: string;
    role: "HEADTEACHER";
    tenantId: string;
    name: string | null;
    schoolName: string;
  };
  assessor: {
    userId: string;
    name: string | null;
    role: "DISTRICT_DIRECTOR";
    assignmentId: string;
    assignmentRole: "DISTRICT_DIRECTOR";
    scopeLevel: "DISTRICT";
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
    visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
  };
};

const cycleSelect = {
  id: true,
  instrumentVersionId: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetZoneId: true,
  targetGovernanceAssignmentId: true,
  status: true,
  identityVisibility: true,
  idempotencyKey: true,
  responseWindowDays: true,
  minimumResponses: true,
  extensionCount: true,
  targetNameSnapshot: true,
  targetRoleSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  requestedByUserId: true,
  openedByUserId: true,
  requestedAt: true,
  openedAt: true,
  deadlineAt: true,
  closedAt: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
  createdAt: true,
  _count: { select: { participants: true } },
} as const;

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
  _count: { select: { scores: true, reviews: true } },
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
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireDirectAssessmentKey(value: unknown) {
  const key = clean(value);
  if (
    key.length < 8 ||
    key.length > 120 ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_KEY_INVALID", 400, {
      fieldName: "directAssessmentKey",
    });
  }
  return key;
}

function safeDisplayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    null
  );
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateFromDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function requireObservationDate(value: Date | string, now: Date) {
  const raw =
    value instanceof Date ? isoDateOnly(value) : clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail("HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_YYYY_MM_DD",
    });
  }
  const observed = dateFromDateOnly(raw);
  if (Number.isNaN(observed.getTime()) || isoDateOnly(observed) !== raw) {
    fail("HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_REAL_CALENDAR_DATE",
    });
  }
  const today = dateFromDateOnly(isoDateOnly(now));
  if (observed.getTime() > today.getTime()) {
    fail("HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_FUTURE", 400);
  }
  return observed;
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

function directAssessmentKeyHash(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function cycleIdempotencyKey(input: {
  targetTenantId: string;
  targetUserId: string;
  assessorUserId: string;
  directAssessmentKey: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        input.targetTenantId,
        input.targetUserId,
        input.assessorUserId,
        input.directAssessmentKey,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
  return `headteacher-supervisory-direct:${digest}`;
}

function isUniqueConflict(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function assertGovernanceScope(input: {
  scope: GovernanceScope;
  targetTenantId: string;
  circuitZoneId: string;
  districtZoneId: string;
}) {
  const tenantIds = new Set(
    input.scope.tenantIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.has(input.targetTenantId)) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TENANT_OUT_OF_SCOPE", 403);
  }
  if (input.scope.isSuperAdmin) return;

  const zoneIds = new Set(input.scope.zoneIds.map(clean).filter(Boolean));
  if (
    !zoneIds.has(input.circuitZoneId) &&
    !zoneIds.has(input.districtZoneId)
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ZONE_OUT_OF_SCOPE", 403);
  }
}

function assignmentInputs(records: AssignmentRecord[]) {
  return records.map(
    (record): HeadteacherSupervisoryGovernanceAssignment => ({
      id: record.id,
      userId: record.userId,
      role: String(record.role),
      zoneId: record.zone.id,
      zoneName: record.zone.name,
      zoneLevel: record.zone.zoneType.level,
      parentZoneId: record.zone.parentZone?.id ?? record.zone.parentZoneId,
      parentZoneName: record.zone.parentZone?.name ?? null,
      status: String(record.status),
      isActive: record.zone.isActive,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
    }),
  );
}

function targetSnapshot(
  membership: TargetMembershipRecord,
  expected: { targetUserId: string; targetTenantId: string },
): ResolvedTarget {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  if (
    membership.userId !== expected.targetUserId ||
    membership.tenantId !== expected.targetTenantId ||
    membership.user.id !== membership.userId ||
    membership.tenant.id !== membership.tenantId ||
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
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_CONTEXT_INVALID", 409);
  }

  return {
    target: {
      userId: membership.userId,
      roleName: membership.role.name,
      isActive: true,
      tenantId: membership.tenantId,
      tenantStatus: membership.tenant.status,
      circuitZoneId: zone.id,
      circuitName: zone.name,
      districtZoneId: district.id,
      districtName: district.name,
    },
    membershipId: membership.id,
    name: safeDisplayName(membership.user),
    schoolName: membership.tenant.name,
    circuitZoneId: zone.id,
    circuitName: zone.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

function findAssignment(records: AssignmentRecord[], assignmentId: string) {
  const matches = records.filter((record) => record.id === assignmentId);
  if (matches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ASSIGNMENT_SNAPSHOT_INVALID", 409, {
      reason: "EXACT_ASSIGNMENT_REQUIRED",
    });
  }
  const assignment = matches[0];
  if (
    assignment.zone.isActive !== true ||
    (assignment.zone.parentZone && assignment.zone.parentZone.isActive !== true)
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ASSIGNMENT_ZONE_INACTIVE", 409);
  }
  return assignment;
}

function assertInstrument(
  instrumentVersion: SupervisoryInstrumentVersionRecord | null,
) {
  const sourceContract = inspectHeadteacherSupervisoryInstrument();
  if (!sourceContract.valid) {
    fail("HEADTEACHER_SUPERVISORY_SOURCE_INSTRUMENT_INVALID", 409, {
      reason: "SOURCE_CONTRACT_DRIFT",
    });
  }

  const contentHash = clean(instrumentVersion?.contentHash).toLowerCase();
  if (
    !instrumentVersion ||
    instrumentVersion.version !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    normalized(instrumentVersion.status) !== "ACTIVE" ||
    instrumentVersion.instrument.code !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    instrumentVersion.instrument.purpose !==
      "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    instrumentVersion.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  ) {
    fail("HEADTEACHER_SUPERVISORY_PUBLISHED_INSTRUMENT_INVALID", 409);
  }

  return { ...instrumentVersion, contentHash };
}

function buildVisitContext(input: {
  cycleId: string;
  openedAt: Date;
  target: ResolvedTarget;
  actor: ActorUserRecord;
  assignment: AssignmentRecord;
  instrumentVersion: SupervisoryInstrumentVersionRecord & { contentHash: string };
  dateObserved: Date;
  visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
}): VisitContextSnapshot {
  const assignmentParent = input.assignment.zone.parentZone;

  return {
    schemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.visitContextSchemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    cycle: {
      id: input.cycleId,
      statusAtDraft: "OPEN",
      openedAt: input.openedAt.toISOString(),
      deadlineAt: null,
      closedAt: null,
    },
    target: {
      userId: input.target.target.userId,
      role: "HEADTEACHER",
      tenantId: input.target.target.tenantId,
      name: input.target.name,
      schoolName: input.target.schoolName,
    },
    assessor: {
      userId: input.actor.id,
      name: safeDisplayName(input.actor),
      role: "DISTRICT_DIRECTOR",
      assignmentId: input.assignment.id,
      assignmentRole: "DISTRICT_DIRECTOR",
      scopeLevel: "DISTRICT",
    },
    jurisdiction: {
      districtZoneId: input.target.districtZoneId,
      districtName: input.target.districtName,
      circuitZoneId: input.target.circuitZoneId,
      circuitName: input.target.circuitName,
      assignmentZoneId: input.assignment.zone.id,
      assignmentZoneName: input.assignment.zone.name,
      assignmentParentZoneId:
        assignmentParent?.id ?? input.assignment.zone.parentZoneId,
      assignmentParentZoneName: assignmentParent?.name ?? null,
    },
    instrument: {
      instrumentId: input.instrumentVersion.instrument.id,
      instrumentVersionId: input.instrumentVersion.id,
      code: input.instrumentVersion.instrument.code,
      version: input.instrumentVersion.version,
      contentHash: input.instrumentVersion.contentHash,
    },
    observation: {
      dateObserved: isoDateOnly(input.dateObserved),
      visitDetails: input.visitDetails,
    },
  };
}

function releasedAssessmentInCycle(
  cycle: ExistingDirectCycleRecord,
  assessment: ExistingDirectCycleRecord["assessments"][number],
) {
  const releases = objectValue(
    objectValue(cycle.metadata)[RELEASES_METADATA_KEY],
  );
  const release = objectValue(releases[assessment.id]);
  return (
    normalized(assessment.status) === "FINALIZED" &&
    clean(release.releaseMode) === "DIRECTOR_AUTHORED_DIRECT_RELEASE" &&
    clean(release.assessmentId) === assessment.id &&
    clean(release.workflow) ===
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
    release.staffFeedbackRequired === false &&
    release.staffFeedbackAccessed === false &&
    release.carrierCycleStatusMutationPerformed === false &&
    /^[a-f0-9]{64}$/i.test(clean(release.releaseProofHash))
  );
}

function isGovernanceOnlyCarrier(cycle: ExistingDirectCycleRecord) {
  const metadata = objectValue(cycle.metadata);
  const instrument = cycle.instrumentVersion.instrument;
  return (
    clean(metadata.workflow) ===
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
    clean(metadata.evidenceStream) === "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    clean(metadata.carrierKind) ===
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind &&
    cycle.instrumentVersion.version ===
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion &&
    normalized(cycle.instrumentVersion.status) === "ACTIVE" &&
    instrument.code === HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode &&
    instrument.purpose === "HEADTEACHER_SUPERVISORY_ASSESSMENT" &&
    instrument.subjectType === "HEADTEACHER" &&
    instrument.isActive === true
  );
}

function assertNoOtherUnfinishedDirectAssessment(
  cycles: ExistingDirectCycleRecord[],
) {
  for (const cycle of cycles) {
    if (!isGovernanceOnlyCarrier(cycle)) continue;

    const assessment =
      cycle.assessments.find((row) => normalized(row.status) !== "SUPERSEDED") ??
      cycle.assessments[0] ??
      null;

    if (!assessment) {
      fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ATOMIC_CYCLE_INCOMPLETE", 409, {
        cycleId: cycle.id,
      });
    }

    if (releasedAssessmentInCycle(cycle, assessment)) {
      continue;
    }

    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_EXISTING_ACTIVE", 409, {
      cycleId: cycle.id,
      assessmentId: assessment.id,
      status: normalized(assessment.status),
      reason: "CONTINUE_OR_RELEASE_EXISTING_GOVERNANCE_ASSESSMENT",
    });
  }
}

function assertExistingCycleContext(input: {
  cycle: CycleRecord;
  idempotencyKey: string;
  keyHash: string;
  target: ResolvedTarget;
  actorUserId: string;
  assignmentId: string;
  instrumentVersionId: string;
}) {
  const metadata = objectValue(input.cycle.metadata);

  if (
    input.cycle.idempotencyKey !== input.idempotencyKey ||
    input.cycle.instrumentVersionId !== input.instrumentVersionId ||
    input.cycle.scopeZoneId !== input.target.districtZoneId ||
    input.cycle.targetUserId !== input.target.target.userId ||
    input.cycle.targetTenantId !== input.target.target.tenantId ||
    input.cycle.targetZoneId !== input.target.circuitZoneId ||
    input.cycle.targetGovernanceAssignmentId !== null ||
    normalized(input.cycle.status) !== "OPEN" ||
    input.cycle.identityVisibility !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.identityVisibility ||
    input.cycle.responseWindowDays !== 0 ||
    input.cycle.minimumResponses !== 0 ||
    input.cycle.extensionCount !== 0 ||
    normalized(input.cycle.targetRoleSnapshot) !== "HEADTEACHER" ||
    clean(input.cycle.targetSchoolNameSnapshot) !== input.target.schoolName ||
    clean(input.cycle.targetZoneNameSnapshot) !== input.target.circuitName ||
    input.cycle.requestedByUserId !== input.actorUserId ||
    input.cycle.openedByUserId !== input.actorUserId ||
    !input.cycle.openedAt ||
    input.cycle.deadlineAt !== null ||
    input.cycle.closedAt !== null ||
    input.cycle.reviewStartedAt !== null ||
    input.cycle.releasedAt !== null ||
    input.cycle.cancelledAt !== null ||
    input.cycle._count.participants !== 0 ||
    clean(metadata.workflow) !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(metadata.evidenceStream) !== "GOVERNANCE_SUPERVISORY_ASSESSMENT" ||
    clean(metadata.carrierKind) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind ||
    clean(metadata.directAssessmentKeyHash).toLowerCase() !== input.keyHash ||
    clean(metadata.assessorRole) !== "DISTRICT_DIRECTOR" ||
    clean(metadata.assessorAssignmentId) !== input.assignmentId ||
    metadata.respondentWorkflow !== false ||
    clean(metadata.participantSelection) !== "NONE" ||
    metadata.staffFeedbackRequired !== false ||
    metadata.staffFeedbackAccessed !== false ||
    metadata.separateFromStaffFeedback !== true ||
    metadata.combinedWeightingDefined !== false ||
    metadata.notificationRowsCreated !== false ||
    metadata.providerCalled !== false
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_CONTEXT_DRIFT", 409, {
      cycleId: input.cycle.id,
    });
  }
}

function buildDraftSummary(input: {
  cycle: CycleRecord;
  assessment: AssessmentRecord;
  instrumentVersion: SupervisoryInstrumentVersionRecord & { contentHash: string };
  expectedAssignmentId: string;
  expectedContext: VisitContextSnapshot;
  expectedContextHash: string;
  keyHash: string;
  targetTenantId: string;
}): HeadteacherSupervisoryDirectorDraftSummary {
  const metadata = objectValue(input.assessment.metadata);
  const storedContextHash = clean(metadata.visitContextHash).toLowerCase();
  const snapshotHash = hashJson(input.assessment.evidenceSnapshotJson);
  const observed = input.assessment.dateObserved
    ? isoDateOnly(input.assessment.dateObserved)
    : "";

  if (
    input.assessment.cycleId !== input.cycle.id ||
    input.assessment.instrumentVersionId !== input.instrumentVersion.id ||
    input.assessment.assessorAssignmentId !== input.expectedAssignmentId ||
    input.assessment.revision !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.initialRevision ||
    input.assessment.priorAssessmentId !== null ||
    observed !== input.expectedContext.observation.dateObserved ||
    storedContextHash !== input.expectedContextHash ||
    snapshotHash !== input.expectedContextHash ||
    clean(metadata.directAssessmentKeyHash).toLowerCase() !== input.keyHash ||
    clean(metadata.carrierKind) !==
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind ||
    JSON.stringify(stableValue(input.assessment.evidenceSnapshotJson)) !==
      JSON.stringify(stableValue(input.expectedContext))
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_CONTEXT_DRIFT", 409, {
      assessmentId: input.assessment.id,
    });
  }

  if (
    normalized(input.assessment.status) === "DRAFT" &&
    (input.assessment.overallPercentage !== null ||
      input.assessment.generalComment !== null ||
      input.assessment.assessmentHash !== null ||
      input.assessment.finalizedByUserId !== null ||
      input.assessment.finalizedAt !== null ||
      input.assessment._count.scores !== 0 ||
      input.assessment._count.reviews !== 0)
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_PREMATURE_EVIDENCE", 409, {
      assessmentId: input.assessment.id,
    });
  }

  return {
    cycleId: input.cycle.id,
    cycleStatus: "OPEN",
    assessmentId: input.assessment.id,
    assessmentStatus: input.assessment.status as AppraisalAssessmentStatus,
    revision: input.assessment.revision,
    assessorUserId: input.assessment.assessorUserId,
    assessorAssignmentId: input.expectedAssignmentId,
    targetUserId: input.cycle.targetUserId,
    targetTenantId: input.targetTenantId,
    dateObserved: observed,
    visitDetails: input.expectedContext.observation.visitDetails,
    instrumentVersionId: input.instrumentVersion.id,
    instrumentCode: input.instrumentVersion.instrument.code,
    instrumentVersion: input.instrumentVersion.version,
    visitContextSchemaVersion:
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.visitContextSchemaVersion,
    visitContextHash: input.expectedContextHash,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    carrierKind: "DIRECTOR_GOVERNANCE_ONLY",
    cycleCreatedAt: input.cycle.createdAt.toISOString(),
    assessmentCreatedAt: input.assessment.createdAt.toISOString(),
    scoreRowsCreatedAtDraft: false,
    participantRowsCreated: false,
    notificationRowsCreated: false,
    providerCalled: false,
  };
}

async function performDraftTransaction(input: {
  database: HeadteacherSupervisoryDirectorDraftDatabase;
  actorUserId: string;
  actorRoleName: string;
  governanceScope: GovernanceScope;
  targetUserId: string;
  targetTenantId: string;
  idempotencyKey: string;
  keyHash: string;
  dateObserved: Date;
  visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
}) {
  return input.database.$transaction(
    async (
      tx: HeadteacherSupervisoryDirectorDraftTransactionClient,
    ): Promise<CreateHeadteacherSupervisoryDirectorDraftResult> => {
      const memberships = await tx.membership.findMany({
        where: {
          tenantId: input.targetTenantId,
          status: "ACTIVE",
          role: { name: "HEADTEACHER" },
          tenant: { status: "ACTIVE" },
        },
        select: {
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
        },
        take: 2,
      });

      if (memberships.length === 0) {
        fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_NOT_FOUND", 404);
      }
      if (memberships.length !== 1) {
        fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_AMBIGUOUS", 409, {
          reason: "EXACT_ACTIVE_HEADTEACHER_MEMBERSHIP_REQUIRED",
        });
      }
      const target = targetSnapshot(memberships[0], {
        targetUserId: input.targetUserId,
        targetTenantId: input.targetTenantId,
      });

      assertGovernanceScope({
        scope: input.governanceScope,
        targetTenantId: target.target.tenantId,
        circuitZoneId: target.circuitZoneId,
        districtZoneId: target.districtZoneId,
      });

      const actor = await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      });
      if (!actor) {
        fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ASSESSOR_NOT_FOUND", 404);
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

      const authority = decideHeadteacherSupervisoryAssessmentAuthority({
        actorUserId: input.actorUserId,
        actorRoleName: input.actorRoleName,
        target: target.target,
        assignments: assignmentInputs(assignments),
        now: input.now,
      });
      if (!authority.allowed) {
        fail(`HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_AUTHORITY_${authority.reason}`, 403, {
          reason: authority.reason,
        });
      }
      if (
        authority.effectiveRole !==
          HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.requiredActorRole ||
        authority.scopeLevel !== "DISTRICT"
      ) {
        fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_DIRECTOR_ONLY", 403);
      }
      const assignment = findAssignment(assignments, authority.assignmentId);

      const instrumentVersion = assertInstrument(
        await tx.appraisalInstrumentVersion.findFirst({
          where: {
            version:
              HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
            status: "ACTIVE",
            instrument: {
              code: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
              purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
              subjectType: "HEADTEACHER",
              isActive: true,
            },
          },
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
          },
        }),
      );

      const existingCycle = await tx.appraisalCycle.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: cycleSelect,
      });

      if (existingCycle) {
        assertExistingCycleContext({
          cycle: existingCycle,
          idempotencyKey: input.idempotencyKey,
          keyHash: input.keyHash,
          target,
          actorUserId: actor.id,
          assignmentId: assignment.id,
          instrumentVersionId: instrumentVersion.id,
        });

        const existingAssessment = await tx.appraisalAssessment.findUnique({
          where: {
            cycleId_assessorUserId_revision: {
              cycleId: existingCycle.id,
              assessorUserId: actor.id,
              revision:
                HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.initialRevision,
            },
          },
          select: assessmentSelect,
        });
        if (!existingAssessment) {
          fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ATOMIC_CYCLE_INCOMPLETE", 409, {
            cycleId: existingCycle.id,
          });
        }

        const context = buildVisitContext({
          cycleId: existingCycle.id,
          openedAt: existingCycle.openedAt!,
          target,
          actor,
          assignment,
          instrumentVersion,
          dateObserved: input.dateObserved,
          visitDetails: input.visitDetails,
        });
        const visitContextHash = hashJson(context);

        return {
          outcome: "EXISTING_MATCH",
          draft: buildDraftSummary({
            cycle: existingCycle,
            assessment: existingAssessment,
            instrumentVersion,
            expectedAssignmentId: assignment.id,
            expectedContext: context,
            expectedContextHash: visitContextHash,
            keyHash: input.keyHash,
            targetTenantId: target.target.tenantId,
          }),
        };
      }

      const existingDirectCycles = await tx.appraisalCycle.findMany({
        where: {
          targetUserId: target.target.userId,
          targetTenantId: target.target.tenantId,
          targetRoleSnapshot: "HEADTEACHER",
          cancelledAt: null,
          status: { in: ["OPEN", "CLOSED", "UNDER_REVIEW", "RELEASED"] },
        },
        select: {
          ...cycleSelect,
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
            },
          },
          assessments: {
            where: { assessorUserId: actor.id },
            orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              status: true,
              revision: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
      });

      assertNoOtherUnfinishedDirectAssessment(existingDirectCycles);

      const cycle = await tx.appraisalCycle.create({
        data: {
          instrumentVersionId: instrumentVersion.id,
          scopeZoneId: target.districtZoneId,
          targetUserId: target.target.userId,
          targetTenantId: target.target.tenantId,
          targetZoneId: target.circuitZoneId,
          targetGovernanceAssignmentId: null,
          status: "OPEN",
          identityVisibility:
            HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.identityVisibility,
          idempotencyKey: input.idempotencyKey,
          responseWindowDays: 0,
          minimumResponses: 0,
          extensionCount: 0,
          requestReason: null,
          approvalNote: null,
          releaseNote: null,
          cancellationReason: null,
          lastExtensionReason: null,
          targetNameSnapshot: target.name,
          targetRoleSnapshot: "HEADTEACHER",
          targetSchoolNameSnapshot: target.schoolName,
          targetZoneNameSnapshot: target.circuitName,
          requestedByUserId: actor.id,
          approvedByUserId: null,
          openedByUserId: actor.id,
          closedByUserId: null,
          releasedByUserId: null,
          cancelledByUserId: null,
          lastExtendedByUserId: null,
          requestedAt: input.now,
          approvedAt: null,
          openedAt: input.now,
          deadlineAt: null,
          closedAt: null,
          reviewStartedAt: null,
          releasedAt: null,
          cancelledAt: null,
          lastExtendedAt: null,
          metadata: {
            workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
            carrierKind:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind,
            directAssessmentKeyHash: input.keyHash,
            assessorRole: "DISTRICT_DIRECTOR",
            assessorAssignmentId: assignment.id,
            scopeLevel: "DISTRICT",
            targetMembershipId: target.membershipId,
            districtZoneId: target.districtZoneId,
            circuitZoneId: target.circuitZoneId,
            respondentWorkflow: false,
            participantSelection: "NONE",
            participantsFrozen: false,
            staffFeedbackRequired: false,
            staffFeedbackAccessed: false,
            separateFromStaffFeedback: true,
            combinedWeightingDefined: false,
            notificationRowsCreated: false,
            providerCalled: false,
          },
        },
        select: cycleSelect,
      });

      if (
        normalized(cycle.status) !== "OPEN" ||
        !cycle.openedAt ||
        cycle.deadlineAt !== null ||
        cycle._count.participants !== 0
      ) {
        fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_ATOMIC_CYCLE_CONTRACT_INVALID", 409, {
          cycleId: cycle.id,
        });
      }

      const context = buildVisitContext({
        cycleId: cycle.id,
        openedAt: cycle.openedAt,
        target,
        actor,
        assignment,
        instrumentVersion,
        dateObserved: input.dateObserved,
        visitDetails: input.visitDetails,
      });
      const visitContextHash = hashJson(context);

      const assessment = await tx.appraisalAssessment.create({
        data: {
          cycleId: cycle.id,
          instrumentVersionId: instrumentVersion.id,
          assessorUserId: actor.id,
          assessorAssignmentId: assignment.id,
          status: "DRAFT",
          revision:
            HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.initialRevision,
          priorAssessmentId: null,
          dateObserved: input.dateObserved,
          overallPercentage: null,
          sectionPercentagesJson: {},
          generalComment: null,
          evidenceSnapshotJson: context,
          assessmentHash: null,
          finalizedByUserId: null,
          finalizedAt: null,
          metadata: {
            workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
            carrierKind:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind,
            directAssessmentKeyHash: input.keyHash,
            visitContextSchemaVersion:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.visitContextSchemaVersion,
            visitContextHash,
            visitContextImmutable: true,
            visitDetailsSchemaVersion: input.visitDetails.schemaVersion,
            officialVisitDetailsIncluded: true,
            targetMembershipId: target.membershipId,
            separateFromStaffFeedback: true,
            staffFeedbackRequired: false,
            staffFeedbackAccessed: false,
            combinedWeightingDefined: false,
            scoreRowsCreated: false,
            reviewRowsCreated: false,
            aggregateRowsCreated: false,
            notificationRowsCreated: false,
            providerCalled: false,
          },
        },
        select: assessmentSelect,
      });

      await tx.auditLog.create({
        data: {
          tenantId: target.target.tenantId,
          userId: actor.id,
          action: DIRECT_CYCLE_OPENED_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            reqId: input.reqId,
            action: DIRECT_CYCLE_OPENED_AUDIT_ACTION,
            workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
            carrierKind:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            actorRole: "DISTRICT_DIRECTOR",
            assessorAssignmentId: assignment.id,
            scopeLevel: "DISTRICT",
            targetRole: "HEADTEACHER",
            targetTenantId: target.target.tenantId,
            targetCircuitZoneId: target.circuitZoneId,
            targetDistrictZoneId: target.districtZoneId,
            instrumentCode: instrumentVersion.instrument.code,
            instrumentVersion: instrumentVersion.version,
            directAssessmentKeyHash: input.keyHash,
            visitContextHash,
            participantCount: 0,
            respondentWorkflow: false,
            staffFeedbackRequired: false,
            respondentIdentitiesIncluded: false,
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: target.target.tenantId,
          userId: actor.id,
          action: DIRECT_DRAFT_CREATED_AUDIT_ACTION,
          resource: "AppraisalAssessment",
          resourceId: assessment.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            reqId: input.reqId,
            action: DIRECT_DRAFT_CREATED_AUDIT_ACTION,
            workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
            carrierKind:
              HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.carrierKind,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            revision: 1,
            status: "DRAFT",
            assessorRole: "DISTRICT_DIRECTOR",
            assessorAssignmentId: assignment.id,
            scopeLevel: "DISTRICT",
            targetRole: "HEADTEACHER",
            targetTenantId: target.target.tenantId,
            targetCircuitZoneId: target.circuitZoneId,
            targetDistrictZoneId: target.districtZoneId,
            instrumentCode: instrumentVersion.instrument.code,
            instrumentVersion: instrumentVersion.version,
            dateObserved: isoDateOnly(input.dateObserved),
            directAssessmentKeyHash: input.keyHash,
            visitContextHash,
            visitDetailsSchemaVersion: input.visitDetails.schemaVersion,
            scoreCount: 0,
            reviewCount: 0,
            notificationCount: 0,
            staffFeedbackRequired: false,
            respondentIdentitiesIncluded: false,
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "CREATED",
        draft: buildDraftSummary({
          cycle,
          assessment,
          instrumentVersion,
          expectedAssignmentId: assignment.id,
          expectedContext: context,
          expectedContextHash: visitContextHash,
          keyHash: input.keyHash,
          targetTenantId: target.target.tenantId,
        }),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.transactionTimeoutMs,
    },
  );
}

export async function createHeadteacherSupervisoryDirectorAssessmentDraft(
  input: CreateHeadteacherSupervisoryDirectorDraftInput,
): Promise<CreateHeadteacherSupervisoryDirectorDraftResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryDirectorDraftDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRoleName = canonicalHeadteacherSupervisoryAssessorRole(
    input.actorRoleName,
  );
  if (
    actorRoleName !==
    HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.requiredActorRole
  ) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_DIRECTOR_ONLY", 403);
  }

  const targetUserId = requireIdentifier(input.targetUserId, "targetUserId");
  const targetTenantId = requireIdentifier(
    input.targetTenantId,
    "targetTenantId",
  );
  const directAssessmentKey = requireDirectAssessmentKey(
    input.directAssessmentKey,
  );
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_INVALID_CURRENT_TIME", 400);
  }
  const dateObserved = requireObservationDate(input.dateObserved, now);
  const visitDetails = buildHeadteacherSupervisoryVisitDetailsSnapshot({
    arrivalTime: input.arrivalTime,
    staffStrength: input.staffStrength,
    totalEnrolment: input.totalEnrolment,
    girls: input.girls,
    boys: input.boys,
    teachersPresentAtVisit: input.teachersPresentAtVisit,
  });

  const idempotencyKey = cycleIdempotencyKey({
    targetTenantId,
    targetUserId,
    assessorUserId: actorUserId,
    directAssessmentKey,
  });
  const keyHash = directAssessmentKeyHash(directAssessmentKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await performDraftTransaction({
        database,
        actorUserId,
        actorRoleName,
        governanceScope: input.governanceScope,
        targetUserId,
        targetTenantId,
        idempotencyKey,
        keyHash,
        dateObserved,
        visitDetails,
        reqId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        now,
      });
    } catch (error) {
      if (attempt === 0 && isUniqueConflict(error)) continue;
      throw error;
    }
  }

  fail("HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_CONCURRENT_CREATE_FAILED", 409);
}
