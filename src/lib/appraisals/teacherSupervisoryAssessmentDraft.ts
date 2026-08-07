// src/lib/appraisals/teacherSupervisoryAssessmentDraft.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  decideTeacherSupervisoryAssessmentAuthority,
  inspectTeacherSupervisoryInstrument,
  type TeacherSupervisoryGovernanceAssignment,
  type TeacherSupervisoryTarget,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import {
  buildTeacherSupervisoryObservationDetailsSnapshot,
  type TeacherSupervisoryObservationDetailsSnapshot,
} from "@/lib/appraisals/teacherSupervisoryObservationDetails";

export const TEACHER_SUPERVISORY_DRAFT_POLICY = {
  schemaVersion: 1,
  observationContextSchemaVersion: 1,
  initialRevision: 1,
  initialAssessmentStatus: "DRAFT",
  initialCycleStatus: "OPEN",
  cycleAndAssessmentAtomic: true,
  identityVisibility: "AUTHORIZED_GOVERNANCE_ONLY",
  respondentWorkflow: false,
  responseWindowDays: 0,
  minimumResponses: 0,
  participantSelection: "NONE",
  observationContextImmutable: true,
  scoreRowsCreatedAtDraft: false,
  commentsCreatedAtDraft: false,
  reviewRowsCreatedAtDraft: false,
  aggregateRowsCreatedAtDraft: false,
  notificationRowsCreatedAtDraft: false,
  legacyTeacherAppraisalMutationAllowed: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 60_000,
} as const;

const TEACHER_SUPERVISORY_CYCLE_OPENED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_OBSERVATION_CYCLE_OPENED";
const TEACHER_SUPERVISORY_DRAFT_CREATED_AUDIT_ACTION =
  "TEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED";

export type CreateTeacherSupervisoryDraftInput = {
  actorUserId: string;
  actorRoleName: unknown;
  targetUserId: string;
  targetTenantId: string;
  observationKey: string;
  dateObserved: unknown;
  yearsInService?: unknown;
  yearsInPresentSchool?: unknown;
  subjectBeingObserved?: unknown;
  subject?: unknown;
  subStrand?: unknown;
  classTaught?: unknown;
  durationMinutes?: unknown;
  durationOfLesson?: unknown;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: TeacherSupervisoryDraftDatabase;
};

export type TeacherSupervisoryDraftSummary = {
  cycleId: string;
  cycleStatus: string;
  assessmentId: string;
  assessmentStatus: AppraisalAssessmentStatus;
  revision: number;
  assessorUserId: string;
  assessorAssignmentId: string;
  targetUserId: string;
  targetTenantId: string;
  observationDetails: TeacherSupervisoryObservationDetailsSnapshot;
  instrumentVersionId: string;
  instrumentCode: string;
  instrumentVersion: number;
  observationContextHash: string;
  evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION";
  cycleCreatedAt: string;
  assessmentCreatedAt: string;
  scoreRowsCreatedAtDraft: false;
  participantRowsCreated: false;
  providerCalled: false;
};

export type CreateTeacherSupervisoryDraftResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  draft: TeacherSupervisoryDraftSummary;
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

type TeacherInstrumentVersionRecord = {
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
  metadata: unknown;
  createdAt: Date;
  _count: { participants: number };
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
  create(args: unknown): Promise<CycleRecord>;
};

type AppraisalAssessmentDelegate = {
  findUnique(args: unknown): Promise<AssessmentRecord | null>;
  create(args: unknown): Promise<AssessmentRecord>;
};

export type TeacherSupervisoryDraftTransactionClient = {
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  user: {
    findUnique(args: unknown): Promise<ActorUserRecord | null>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  appraisalInstrumentVersion: {
    findFirst(args: unknown): Promise<TeacherInstrumentVersionRecord | null>;
  };
  appraisalCycle: AppraisalCycleDelegate;
  appraisalAssessment: AppraisalAssessmentDelegate;
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type TeacherSupervisoryDraftDatabase = {
  appraisalCycle: AppraisalCycleDelegate;
  appraisalAssessment: AppraisalAssessmentDelegate;
  $transaction<T>(
    operation: (tx: TeacherSupervisoryDraftTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type ResolvedTarget = {
  target: TeacherSupervisoryTarget;
  membershipId: string;
  name: string | null;
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
};

type ObservationContextSnapshot = {
  schemaVersion: 1;
  workflow: string;
  evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION";
  cycle: {
    id: string;
    statusAtDraft: "OPEN";
    openedAt: string;
  };
  target: {
    userId: string;
    role: "TEACHER";
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
    scopeLevel: "DISTRICT" | "CIRCUIT";
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
    details: TeacherSupervisoryObservationDetailsSnapshot;
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
    fail("TEACHER_SUPERVISORY_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function requireObservationKey(value: unknown) {
  const key = clean(value);
  if (
    key.length < 8 ||
    key.length > 120 ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_KEY_INVALID", 400);
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

function assertObservationNotFuture(dateObserved: string, now: Date) {
  const observed = dateFromDateOnly(dateObserved);
  const today = dateFromDateOnly(isoDateOnly(now));
  if (observed.getTime() > today.getTime()) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DATE_FUTURE", 400);
  }
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

function observationKeyHash(observationKey: string) {
  return createHash("sha256").update(observationKey, "utf8").digest("hex");
}

function cycleIdempotencyKey(input: {
  targetTenantId: string;
  targetUserId: string;
  assessorUserId: string;
  observationKey: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        input.targetTenantId,
        input.targetUserId,
        input.assessorUserId,
        input.observationKey,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
  return `teacher-supervisory-observation:${digest}`;
}

function isUniqueConflict(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function assignmentInputs(records: AssignmentRecord[]) {
  return records.map(
    (record): TeacherSupervisoryGovernanceAssignment => ({
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
    normalized(membership.role.name) !== "TEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    fail("TEACHER_SUPERVISORY_TARGET_CONTEXT_INVALID", 409);
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
    fail("TEACHER_SUPERVISORY_ASSIGNMENT_SNAPSHOT_INVALID", 409, {
      assignmentId,
      count: matches.length,
    });
  }

  const assignment = matches[0];
  if (
    assignment.zone.isActive !== true ||
    (assignment.zone.parentZone && assignment.zone.parentZone.isActive !== true)
  ) {
    fail("TEACHER_SUPERVISORY_ASSIGNMENT_ZONE_INACTIVE", 409, {
      assignmentId,
    });
  }
  return assignment;
}

function assertInstrument(instrumentVersion: TeacherInstrumentVersionRecord | null) {
  const sourceContract = inspectTeacherSupervisoryInstrument();
  if (!sourceContract.valid) {
    fail("TEACHER_SUPERVISORY_SOURCE_INSTRUMENT_INVALID", 409, {
      issues: [...sourceContract.issues],
    });
  }

  const contentHash = clean(instrumentVersion?.contentHash).toLowerCase();
  if (
    !instrumentVersion ||
    instrumentVersion.version !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    instrumentVersion.status !== "ACTIVE" ||
    instrumentVersion.instrument.code !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    instrumentVersion.instrument.purpose !== "TEACHER_OBSERVATION" ||
    instrumentVersion.instrument.subjectType !== "TEACHER" ||
    instrumentVersion.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  ) {
    fail("TEACHER_SUPERVISORY_PUBLISHED_INSTRUMENT_INVALID", 409);
  }

  return { ...instrumentVersion, contentHash };
}

function buildObservationContext(input: {
  cycleId: string;
  openedAt: Date;
  target: ResolvedTarget;
  actor: ActorUserRecord;
  actorRole: string;
  assignment: AssignmentRecord;
  scopeLevel: "DISTRICT" | "CIRCUIT";
  instrumentVersion: TeacherInstrumentVersionRecord & { contentHash: string };
  observationDetails: TeacherSupervisoryObservationDetailsSnapshot;
}): ObservationContextSnapshot {
  const assignmentParent = input.assignment.zone.parentZone;

  return {
    schemaVersion:
      TEACHER_SUPERVISORY_DRAFT_POLICY.observationContextSchemaVersion,
    workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
    cycle: {
      id: input.cycleId,
      statusAtDraft: "OPEN",
      openedAt: input.openedAt.toISOString(),
    },
    target: {
      userId: input.target.target.userId,
      role: "TEACHER",
      tenantId: input.target.target.tenantId,
      name: input.target.name,
      schoolName: input.target.schoolName,
    },
    assessor: {
      userId: input.actor.id,
      name: safeDisplayName(input.actor),
      role: input.actorRole,
      assignmentId: input.assignment.id,
      assignmentRole: normalized(input.assignment.role),
      scopeLevel: input.scopeLevel,
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
      dateObserved: input.observationDetails.dateObserved,
      details: input.observationDetails,
    },
  };
}

function assertExistingCycleContext(input: {
  cycle: CycleRecord;
  idempotencyKey: string;
  observationKeyHash: string;
  target: ResolvedTarget;
  actorUserId: string;
  actorRole: string;
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
    input.cycle.identityVisibility !==
      TEACHER_SUPERVISORY_DRAFT_POLICY.identityVisibility ||
    input.cycle.responseWindowDays !==
      TEACHER_SUPERVISORY_DRAFT_POLICY.responseWindowDays ||
    input.cycle.minimumResponses !==
      TEACHER_SUPERVISORY_DRAFT_POLICY.minimumResponses ||
    input.cycle.extensionCount !== 0 ||
    normalized(input.cycle.targetRoleSnapshot) !== "TEACHER" ||
    clean(input.cycle.targetSchoolNameSnapshot) !== input.target.schoolName ||
    input.cycle.targetZoneNameSnapshot !== input.target.circuitName ||
    input.cycle.requestedByUserId !== input.actorUserId ||
    input.cycle.openedByUserId !== input.actorUserId ||
    !input.cycle.openedAt ||
    input.cycle.deadlineAt !== null ||
    input.cycle._count.participants !== 0 ||
    clean(metadata.workflow) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow ||
    clean(metadata.evidenceStream) !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream ||
    clean(metadata.observationKeyHash).toLowerCase() !==
      input.observationKeyHash ||
    clean(metadata.assessorRole) !== input.actorRole ||
    clean(metadata.assessorAssignmentId) !== input.assignmentId ||
    metadata.respondentWorkflow !== false ||
    clean(metadata.participantSelection) !== "NONE" ||
    metadata.legacyTeacherAppraisalIncluded !== false ||
    metadata.combinedWeightingDefined !== false ||
    metadata.providerCalled !== false
  ) {
    fail("TEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT", 409, {
      cycleId: input.cycle.id,
    });
  }
}

function buildDraftSummary(input: {
  cycle: CycleRecord;
  assessment: AssessmentRecord;
  instrumentVersion: TeacherInstrumentVersionRecord & { contentHash: string };
  expectedAssignmentId: string;
  expectedContext: ObservationContextSnapshot;
  expectedContextHash: string;
  targetTenantId: string;
}): TeacherSupervisoryDraftSummary {
  const metadata = objectValue(input.assessment.metadata);
  const storedContextHash = clean(metadata.observationContextHash).toLowerCase();
  const snapshotHash = hashJson(input.assessment.evidenceSnapshotJson);
  const observed = input.assessment.dateObserved
    ? isoDateOnly(input.assessment.dateObserved)
    : "";

  if (
    input.assessment.cycleId !== input.cycle.id ||
    input.assessment.instrumentVersionId !== input.instrumentVersion.id ||
    input.assessment.assessorAssignmentId !== input.expectedAssignmentId ||
    input.assessment.revision !== TEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision ||
    input.assessment.priorAssessmentId !== null ||
    observed !== input.expectedContext.observation.dateObserved ||
    storedContextHash !== input.expectedContextHash ||
    snapshotHash !== input.expectedContextHash ||
    JSON.stringify(stableValue(input.assessment.evidenceSnapshotJson)) !==
      JSON.stringify(stableValue(input.expectedContext))
  ) {
    fail("TEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT", 409, {
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
    fail("TEACHER_SUPERVISORY_DRAFT_PREMATURE_EVIDENCE", 409, {
      assessmentId: input.assessment.id,
    });
  }

  return {
    cycleId: input.cycle.id,
    cycleStatus: input.cycle.status,
    assessmentId: input.assessment.id,
    assessmentStatus: input.assessment.status as AppraisalAssessmentStatus,
    revision: input.assessment.revision,
    assessorUserId: input.assessment.assessorUserId,
    assessorAssignmentId: input.expectedAssignmentId,
    targetUserId: input.cycle.targetUserId,
    targetTenantId: input.targetTenantId,
    observationDetails: input.expectedContext.observation.details,
    instrumentVersionId: input.instrumentVersion.id,
    instrumentCode: input.instrumentVersion.instrument.code,
    instrumentVersion: input.instrumentVersion.version,
    observationContextHash: input.expectedContextHash,
    evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
    cycleCreatedAt: input.cycle.createdAt.toISOString(),
    assessmentCreatedAt: input.assessment.createdAt.toISOString(),
    scoreRowsCreatedAtDraft: false,
    participantRowsCreated: false,
    providerCalled: false,
  };
}

async function performDraftTransaction(input: {
  database: TeacherSupervisoryDraftDatabase;
  actorUserId: string;
  actorRoleName: string;
  targetUserId: string;
  targetTenantId: string;
  idempotencyKey: string;
  observationKeyHash: string;
  observationDetails: TeacherSupervisoryObservationDetailsSnapshot;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
}) {
  return input.database.$transaction(
    async (
      tx: TeacherSupervisoryDraftTransactionClient,
    ): Promise<CreateTeacherSupervisoryDraftResult> => {
      const membership = await tx.membership.findFirst({
        where: {
          userId: input.targetUserId,
          tenantId: input.targetTenantId,
          status: "ACTIVE",
          role: { name: "TEACHER" },
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
      });
      if (!membership) {
        fail("TEACHER_SUPERVISORY_TARGET_NOT_FOUND", 404);
      }
      const target = targetSnapshot(membership, {
        targetUserId: input.targetUserId,
        targetTenantId: input.targetTenantId,
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
        fail("TEACHER_SUPERVISORY_ASSESSOR_NOT_FOUND", 404);
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

      const authority = decideTeacherSupervisoryAssessmentAuthority({
        actorUserId: input.actorUserId,
        actorRoleName: input.actorRoleName,
        target: target.target,
        assignments: assignmentInputs(assignments),
        now: input.now,
      });
      if (!authority.allowed) {
        fail(`TEACHER_SUPERVISORY_AUTHORITY_${authority.reason}`, 403, {
          reason: authority.reason,
        });
      }
      const assignment = findAssignment(assignments, authority.assignmentId);

      const instrumentVersion = assertInstrument(
        await tx.appraisalInstrumentVersion.findFirst({
          where: {
            version: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
            status: "ACTIVE",
            instrument: {
              code: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
              purpose: "TEACHER_OBSERVATION",
              subjectType: "TEACHER",
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
          observationKeyHash: input.observationKeyHash,
          target,
          actorUserId: actor.id,
          actorRole: authority.effectiveRole,
          assignmentId: assignment.id,
          instrumentVersionId: instrumentVersion.id,
        });

        const existingAssessment = await tx.appraisalAssessment.findUnique({
          where: {
            cycleId_assessorUserId_revision: {
              cycleId: existingCycle.id,
              assessorUserId: actor.id,
              revision: TEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision,
            },
          },
          select: assessmentSelect,
        });
        if (!existingAssessment) {
          fail("TEACHER_SUPERVISORY_ATOMIC_DRAFT_INCOMPLETE", 409, {
            cycleId: existingCycle.id,
          });
        }

        const context = buildObservationContext({
          cycleId: existingCycle.id,
          openedAt: existingCycle.openedAt!,
          target,
          actor,
          actorRole: authority.effectiveRole,
          assignment,
          scopeLevel: authority.scopeLevel,
          instrumentVersion,
          observationDetails: input.observationDetails,
        });
        const contextHash = hashJson(context);

        return {
          outcome: "EXISTING_MATCH",
          draft: buildDraftSummary({
            cycle: existingCycle,
            assessment: existingAssessment,
            instrumentVersion,
            expectedAssignmentId: assignment.id,
            expectedContext: context,
            expectedContextHash: contextHash,
            targetTenantId: target.target.tenantId,
          }),
        };
      }

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
            TEACHER_SUPERVISORY_DRAFT_POLICY.identityVisibility,
          idempotencyKey: input.idempotencyKey,
          responseWindowDays:
            TEACHER_SUPERVISORY_DRAFT_POLICY.responseWindowDays,
          minimumResponses: TEACHER_SUPERVISORY_DRAFT_POLICY.minimumResponses,
          extensionCount: 0,
          requestReason: null,
          approvalNote: null,
          releaseNote: null,
          cancellationReason: null,
          lastExtensionReason: null,
          targetNameSnapshot: target.name,
          targetRoleSnapshot: "TEACHER",
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
            workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
            observationKeyHash: input.observationKeyHash,
            assessorRole: authority.effectiveRole,
            assessorAssignmentId: assignment.id,
            scopeLevel: authority.scopeLevel,
            targetMembershipId: target.membershipId,
            districtZoneId: target.districtZoneId,
            circuitZoneId: target.circuitZoneId,
            respondentWorkflow: false,
            participantSelection: "NONE",
            participantsFrozen: false,
            legacyTeacherAppraisalIncluded: false,
            combinedWeightingDefined: false,
            providerCalled: false,
          },
        },
        select: cycleSelect,
      });

      if (
        cycle.status !== "OPEN" ||
        !cycle.openedAt ||
        cycle._count.participants !== 0
      ) {
        fail("TEACHER_SUPERVISORY_ATOMIC_CYCLE_CONTRACT_INVALID", 409, {
          cycleId: cycle.id,
        });
      }

      const context = buildObservationContext({
        cycleId: cycle.id,
        openedAt: cycle.openedAt,
        target,
        actor,
        actorRole: authority.effectiveRole,
        assignment,
        scopeLevel: authority.scopeLevel,
        instrumentVersion,
        observationDetails: input.observationDetails,
      });
      const observationContextHash = hashJson(context);

      const assessment = await tx.appraisalAssessment.create({
        data: {
          cycleId: cycle.id,
          instrumentVersionId: instrumentVersion.id,
          assessorUserId: actor.id,
          assessorAssignmentId: assignment.id,
          status: "DRAFT",
          revision: TEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision,
          priorAssessmentId: null,
          dateObserved: dateFromDateOnly(input.observationDetails.dateObserved),
          overallPercentage: null,
          sectionPercentagesJson: {},
          generalComment: null,
          evidenceSnapshotJson: context,
          assessmentHash: null,
          finalizedByUserId: null,
          finalizedAt: null,
          metadata: {
            workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
            observationContextSchemaVersion:
              TEACHER_SUPERVISORY_DRAFT_POLICY.observationContextSchemaVersion,
            observationContextHash,
            observationContextImmutable: true,
            observationDetailsSchemaVersion:
              input.observationDetails.schemaVersion,
            officialObservationDetailsIncluded: true,
            targetMembershipId: target.membershipId,
            separateFromLegacyTeacherAppraisal: true,
            legacyTeacherAppraisalMutationAllowed: false,
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
          action: TEACHER_SUPERVISORY_CYCLE_OPENED_AUDIT_ACTION,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            reqId: input.reqId,
            action: TEACHER_SUPERVISORY_CYCLE_OPENED_AUDIT_ACTION,
            workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            actorRole: authority.effectiveRole,
            assessorAssignmentId: assignment.id,
            scopeLevel: authority.scopeLevel,
            targetRole: "TEACHER",
            targetTenantId: target.target.tenantId,
            targetCircuitZoneId: target.circuitZoneId,
            targetDistrictZoneId: target.districtZoneId,
            instrumentCode: instrumentVersion.instrument.code,
            instrumentVersion: instrumentVersion.version,
            observationKeyHash: input.observationKeyHash,
            observationContextHash,
            participantCount: 0,
            respondentWorkflow: false,
            contactFieldsIncluded: false,
            legacyTeacherAppraisalIncluded: false,
            providerCalled: false,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: target.target.tenantId,
          userId: actor.id,
          action: TEACHER_SUPERVISORY_DRAFT_CREATED_AUDIT_ACTION,
          resource: "AppraisalAssessment",
          resourceId: assessment.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            reqId: input.reqId,
            action: TEACHER_SUPERVISORY_DRAFT_CREATED_AUDIT_ACTION,
            workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            revision: assessment.revision,
            status: "DRAFT",
            assessorRole: authority.effectiveRole,
            assessorAssignmentId: assignment.id,
            scopeLevel: authority.scopeLevel,
            targetRole: "TEACHER",
            targetTenantId: target.target.tenantId,
            targetCircuitZoneId: target.circuitZoneId,
            targetDistrictZoneId: target.districtZoneId,
            instrumentCode: instrumentVersion.instrument.code,
            instrumentVersion: instrumentVersion.version,
            dateObserved: input.observationDetails.dateObserved,
            observationContextHash,
            observationDetailsSchemaVersion:
              input.observationDetails.schemaVersion,
            scoreCount: 0,
            reviewCount: 0,
            contactFieldsIncluded: false,
            legacyTeacherAppraisalIncluded: false,
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
          expectedContextHash: observationContextHash,
          targetTenantId: target.target.tenantId,
        }),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: TEACHER_SUPERVISORY_DRAFT_POLICY.transactionMaxWaitMs,
      timeout: TEACHER_SUPERVISORY_DRAFT_POLICY.transactionTimeoutMs,
    },
  );
}

export async function createTeacherSupervisoryAssessmentDraft(
  input: CreateTeacherSupervisoryDraftInput,
): Promise<CreateTeacherSupervisoryDraftResult> {
  const database =
    input.database ?? (prisma as unknown as TeacherSupervisoryDraftDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const targetUserId = requireIdentifier(input.targetUserId, "targetUserId");
  const targetTenantId = requireIdentifier(
    input.targetTenantId,
    "targetTenantId",
  );
  const actorRoleName = normalized(input.actorRoleName);
  const observationKey = requireObservationKey(input.observationKey);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("TEACHER_SUPERVISORY_INVALID_CURRENT_TIME", 400);
  }

  const observationDetails = buildTeacherSupervisoryObservationDetailsSnapshot({
    dateObserved: input.dateObserved,
    yearsInService: input.yearsInService,
    yearsInPresentSchool: input.yearsInPresentSchool,
    subjectBeingObserved: input.subjectBeingObserved ?? input.subject,
    subStrand: input.subStrand,
    classTaught: input.classTaught,
    durationMinutes: input.durationMinutes ?? input.durationOfLesson,
  });
  assertObservationNotFuture(observationDetails.dateObserved, now);

  const idempotencyKey = cycleIdempotencyKey({
    targetTenantId,
    targetUserId,
    assessorUserId: actorUserId,
    observationKey,
  });
  const hashedObservationKey = observationKeyHash(observationKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await performDraftTransaction({
        database,
        actorUserId,
        actorRoleName,
        targetUserId,
        targetTenantId,
        idempotencyKey,
        observationKeyHash: hashedObservationKey,
        observationDetails,
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

  fail("TEACHER_SUPERVISORY_DRAFT_CONCURRENT_CREATE_FAILED", 409);
}
