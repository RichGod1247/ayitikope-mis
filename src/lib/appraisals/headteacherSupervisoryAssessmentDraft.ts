//src/lib/appraisals/headteacherSupervisoryAssessmentDraft.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalAssessmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
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

export const HEADTEACHER_SUPERVISORY_DRAFT_POLICY = {
  schemaVersion: 2,
  visitContextSchemaVersion:
    HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion,
  initialRevision: 1,
  initialStatus: "DRAFT",
  eligibleCycleStatuses: ["OPEN", "CLOSED"] as const,
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
  visitContextImmutable: true,
  scoreRowsCreatedAtDraft: false,
  commentsCreatedAtDraft: false,
  providerCallsAllowed: false,
  transactionIsolation: "SERIALIZABLE",
  transactionTimeoutMs: 60_000,
} as const;

const SUPERVISORY_DRAFT_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED";

type EligibleCycleStatus =
  (typeof HEADTEACHER_SUPERVISORY_DRAFT_POLICY.eligibleCycleStatuses)[number];

export type CreateHeadteacherSupervisoryDraftInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
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
  database?: HeadteacherSupervisoryDraftDatabase;
};

export type HeadteacherSupervisoryDraftSummary = {
  id: string;
  cycleId: string;
  status: AppraisalAssessmentStatus;
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
  createdAt: string;
  scoreRowsCreated: false;
  providerCalled: false;
};

export type CreateHeadteacherSupervisoryDraftResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  assessment: HeadteacherSupervisoryDraftSummary;
};

type CycleRecord = {
  id: string;
  instrumentVersionId: string;
  scopeZoneId: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetZoneId: string | null;
  status: string;
  targetNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  requestedAt: Date;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
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
    email: string;
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
  email: string;
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
};

type AppraisalAssessmentDelegate = {
  findUnique(args: unknown): Promise<AssessmentRecord | null>;
  create(args: unknown): Promise<AssessmentRecord>;
};

export type HeadteacherSupervisoryDraftTransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
  };
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
    findFirst(args: unknown): Promise<SupervisoryInstrumentVersionRecord | null>;
  };
  appraisalAssessment: AppraisalAssessmentDelegate;
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryDraftDatabase = {
  appraisalAssessment: AppraisalAssessmentDelegate;
  $transaction<T>(
    operation: (tx: HeadteacherSupervisoryDraftTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type VisitContextSnapshot = {
  schemaVersion: 2;
  workflow: string;
  evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT";
  cycle: {
    id: string;
    statusAtDraft: EligibleCycleStatus;
    openedAt: string;
    deadlineAt: string | null;
    closedAt: string | null;
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
  status: true,
  targetNameSnapshot: true,
  targetRoleSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  requestedAt: true,
  openedAt: true,
  deadlineAt: true,
  closedAt: true,
  reviewStartedAt: true,
  releasedAt: true,
  cancelledAt: true,
  metadata: true,
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
    fail("HEADTEACHER_SUPERVISORY_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function displayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    clean(user.email) ||
    null
  );
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeObservationDate(value: Date | string, now: Date) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400);
  }
  const day = new Date(`${isoDateOnly(date)}T00:00:00.000Z`);
  const today = new Date(`${isoDateOnly(now)}T00:00:00.000Z`);
  if (day.getTime() > today.getTime()) {
    fail("HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_FUTURE", 400);
  }
  return day;
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

function draftKey(input: {
  cycleId: string;
  assessorUserId: string;
  assessorAssignmentId: string;
  instrumentVersionId: string;
  dateObserved: string;
  visitContextHash: string;
}) {
  return `headteacher-supervisory-draft:${createHash("sha256")
    .update(
      [
        input.cycleId,
        input.assessorUserId,
        input.assessorAssignmentId,
        input.instrumentVersionId,
        input.dateObserved,
        input.visitContextHash,
      ].join(":"),
      "utf8",
    )
    .digest("hex")}`;
}

function isUniqueConflict(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function assertEligibleCycle(cycle: CycleRecord) {
  const status = normalized(cycle.status);
  if (
    !HEADTEACHER_SUPERVISORY_DRAFT_POLICY.eligibleCycleStatuses.includes(
      status as EligibleCycleStatus,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_CYCLE_NOT_ELIGIBLE", 409, {
      cycleId: cycle.id,
      status,
    });
  }
  if (!cycle.openedAt) {
    fail("HEADTEACHER_SUPERVISORY_CYCLE_NOT_OPENED", 409, {
      cycleId: cycle.id,
    });
  }
  if (cycle.reviewStartedAt || cycle.releasedAt || cycle.cancelledAt) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_BOUNDARY_CLOSED", 409, {
      cycleId: cycle.id,
    });
  }
  if (status === "CLOSED" && !cycle.closedAt) {
    fail("HEADTEACHER_SUPERVISORY_CLOSED_TIMESTAMP_MISSING", 409, {
      cycleId: cycle.id,
    });
  }
  if (
    cycle.instrumentVersionId !== cycle.instrumentVersion.id ||
    cycle.instrumentVersion.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !== HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.purpose !== "HEADTEACHER_STAFF_FEEDBACK" ||
    cycle.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER"
  ) {
    fail("HEADTEACHER_SUPERVISORY_PARENT_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
}

function targetSnapshot(
  cycle: CycleRecord,
  membership: TargetMembershipRecord,
): {
  target: HeadteacherSupervisoryTarget;
  membershipId: string;
  name: string | null;
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
} {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;
  const targetTenantId = clean(cycle.targetTenantId);
  if (
    !targetTenantId ||
    membership.userId !== cycle.targetUserId ||
    membership.tenantId !== targetTenantId ||
    membership.tenant.id !== targetTenantId ||
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
    fail("HEADTEACHER_SUPERVISORY_TARGET_NOT_ACTIVE", 409, {
      cycleId: cycle.id,
    });
  }
  if (
    cycle.targetZoneId !== zone.id ||
    cycle.scopeZoneId !== district.id ||
    clean(cycle.targetSchoolNameSnapshot) !== clean(membership.tenant.name)
  ) {
    fail("HEADTEACHER_SUPERVISORY_TARGET_CONTEXT_DRIFT", 409, {
      cycleId: cycle.id,
    });
  }
  const name = displayName(membership.user);
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
    name,
    schoolName: membership.tenant.name,
    circuitZoneId: zone.id,
    circuitName: zone.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
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

function findAssignment(records: AssignmentRecord[], assignmentId: string) {
  const matches = records.filter((record) => record.id === assignmentId);
  if (matches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_ASSIGNMENT_SNAPSHOT_INVALID", 409, {
      assignmentId,
      count: matches.length,
    });
  }
  const assignment = matches[0];
  if (
    assignment.zone.isActive !== true ||
    (assignment.zone.parentZone && assignment.zone.parentZone.isActive !== true)
  ) {
    fail("HEADTEACHER_SUPERVISORY_ASSIGNMENT_ZONE_INACTIVE", 409, {
      assignmentId,
    });
  }
  return assignment;
}

function assertInstrument(
  instrumentVersion: SupervisoryInstrumentVersionRecord | null,
) {
  const sourceContract = inspectHeadteacherSupervisoryInstrument();
  if (!sourceContract.valid) {
    fail("HEADTEACHER_SUPERVISORY_SOURCE_INSTRUMENT_INVALID", 409, {
      issues: [...sourceContract.issues],
    });
  }
  const contentHash = clean(instrumentVersion?.contentHash).toLowerCase();
  if (
    !instrumentVersion ||
    instrumentVersion.version !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion ||
    instrumentVersion.status !== "ACTIVE" ||
    instrumentVersion.instrument.code !== HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode ||
    instrumentVersion.instrument.purpose !== "HEADTEACHER_SUPERVISORY_ASSESSMENT" ||
    instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    instrumentVersion.instrument.isActive !== true ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  ) {
    fail("HEADTEACHER_SUPERVISORY_PUBLISHED_INSTRUMENT_INVALID", 409);
  }
  return { ...instrumentVersion, contentHash };
}

function buildVisitContext(input: {
  cycle: CycleRecord;
  target: ReturnType<typeof targetSnapshot>;
  actor: ActorUserRecord;
  actorRole: string;
  assignment: AssignmentRecord;
  scopeLevel: "DISTRICT" | "CIRCUIT";
  instrumentVersion: SupervisoryInstrumentVersionRecord & { contentHash: string };
  dateObserved: Date;
  visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
}): VisitContextSnapshot {
  const assignmentParent = input.assignment.zone.parentZone;
  return {
    schemaVersion:
      HEADTEACHER_SUPERVISORY_DRAFT_POLICY.visitContextSchemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    cycle: {
      id: input.cycle.id,
      statusAtDraft: normalized(input.cycle.status) as EligibleCycleStatus,
      openedAt: input.cycle.openedAt!.toISOString(),
      deadlineAt: input.cycle.deadlineAt?.toISOString() ?? null,
      closedAt: input.cycle.closedAt?.toISOString() ?? null,
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
      name: displayName(input.actor),
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
      dateObserved: isoDateOnly(input.dateObserved),
      visitDetails: input.visitDetails,
    },
  };
}

function existingSummary(input: {
  record: AssessmentRecord;
  cycle: CycleRecord;
  instrumentVersion: SupervisoryInstrumentVersionRecord & { contentHash: string };
  expectedAssignmentId: string;
  expectedDateObserved: Date;
  expectedContext: VisitContextSnapshot;
  expectedContextHash: string;
  expectedDraftKey: string;
  targetTenantId: string;
}): HeadteacherSupervisoryDraftSummary {
  const metadata = objectValue(input.record.metadata);
  const storedContextHash = clean(metadata.visitContextHash).toLowerCase();
  const storedDraftKey = clean(metadata.draftKey);
  const storedContextHashFromSnapshot = hashJson(input.record.evidenceSnapshotJson);
  const observed = input.record.dateObserved
    ? isoDateOnly(input.record.dateObserved)
    : "";
  if (
    input.record.cycleId !== input.cycle.id ||
    input.record.instrumentVersionId !== input.instrumentVersion.id ||
    input.record.assessorAssignmentId !== input.expectedAssignmentId ||
    input.record.revision !== HEADTEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision ||
    input.record.priorAssessmentId !== null ||
    observed !== isoDateOnly(input.expectedDateObserved) ||
    storedContextHash !== input.expectedContextHash ||
    storedContextHashFromSnapshot !== input.expectedContextHash ||
    storedDraftKey !== input.expectedDraftKey ||
    JSON.stringify(stableValue(input.record.evidenceSnapshotJson)) !==
      JSON.stringify(stableValue(input.expectedContext))
  ) {
    fail("HEADTEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT", 409, {
      assessmentId: input.record.id,
    });
  }
  if (
    input.record.overallPercentage !== null ||
    input.record.generalComment !== null ||
    input.record.assessmentHash !== null
  ) {
    fail("HEADTEACHER_SUPERVISORY_DRAFT_PREMATURE_EVIDENCE", 409, {
      assessmentId: input.record.id,
    });
  }
  return {
    id: input.record.id,
    cycleId: input.record.cycleId,
    status: input.record.status as AppraisalAssessmentStatus,
    revision: input.record.revision,
    assessorUserId: input.record.assessorUserId,
    assessorAssignmentId: input.expectedAssignmentId,
    targetUserId: input.cycle.targetUserId,
    targetTenantId: input.targetTenantId,
    dateObserved: observed,
    visitDetails: input.expectedContext.observation.visitDetails,
    instrumentVersionId: input.instrumentVersion.id,
    instrumentCode: input.instrumentVersion.instrument.code,
    instrumentVersion: input.instrumentVersion.version,
    visitContextSchemaVersion:
      HEADTEACHER_SUPERVISORY_DRAFT_POLICY.visitContextSchemaVersion,
    visitContextHash: input.expectedContextHash,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    createdAt: input.record.createdAt.toISOString(),
    scoreRowsCreated: false,
    providerCalled: false,
  };
}

async function performDraftTransaction(input: {
  database: HeadteacherSupervisoryDraftDatabase;
  actorUserId: string;
  actorRoleName: string;
  cycleId: string;
  dateObserved: Date;
  visitDetails: HeadteacherSupervisoryVisitDetailsSnapshot;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
}) {
  return input.database.$transaction(
    async (
      tx: HeadteacherSupervisoryDraftTransactionClient,
    ): Promise<CreateHeadteacherSupervisoryDraftResult> => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: input.cycleId },
        select: cycleSelect,
      });
      if (!cycle) {
        fail("HEADTEACHER_SUPERVISORY_CYCLE_NOT_FOUND", 404);
      }
      assertEligibleCycle(cycle);
      if (input.dateObserved.getTime() < new Date(`${isoDateOnly(cycle.openedAt!)}T00:00:00.000Z`).getTime()) {
        fail("HEADTEACHER_SUPERVISORY_OBSERVATION_BEFORE_CYCLE_OPEN", 409, {
          cycleId: cycle.id,
        });
      }

      const membership = await tx.membership.findFirst({
        where: {
          userId: cycle.targetUserId,
          tenantId: cycle.targetTenantId,
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
              email: true,
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
        fail("HEADTEACHER_SUPERVISORY_TARGET_NOT_FOUND", 404);
      }
      const target = targetSnapshot(cycle, membership);

      const actor = await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
      if (!actor) {
        fail("HEADTEACHER_SUPERVISORY_ASSESSOR_NOT_FOUND", 404);
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
        fail(`HEADTEACHER_SUPERVISORY_AUTHORITY_${authority.reason}`, 403, {
          reason: authority.reason,
        });
      }
      const assignment = findAssignment(assignments, authority.assignmentId);

      const instrumentVersion = assertInstrument(
        await tx.appraisalInstrumentVersion.findFirst({
          where: {
            version: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
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

      const context = buildVisitContext({
        cycle,
        target,
        actor,
        actorRole: authority.effectiveRole,
        assignment,
        scopeLevel: authority.scopeLevel,
        instrumentVersion,
        dateObserved: input.dateObserved,
        visitDetails: input.visitDetails,
      });
      const visitContextHash = hashJson(context);
      const idempotencyKey = draftKey({
        cycleId: cycle.id,
        assessorUserId: actor.id,
        assessorAssignmentId: assignment.id,
        instrumentVersionId: instrumentVersion.id,
        dateObserved: isoDateOnly(input.dateObserved),
        visitContextHash,
      });

      const existing = await tx.appraisalAssessment.findUnique({
        where: {
          cycleId_assessorUserId_revision: {
            cycleId: cycle.id,
            assessorUserId: actor.id,
            revision: HEADTEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision,
          },
        },
        select: assessmentSelect,
      });
      if (existing) {
        return {
          outcome: "EXISTING_MATCH",
          assessment: existingSummary({
            record: existing,
            cycle,
            instrumentVersion,
            expectedAssignmentId: assignment.id,
            expectedDateObserved: input.dateObserved,
            expectedContext: context,
            expectedContextHash: visitContextHash,
            expectedDraftKey: idempotencyKey,
            targetTenantId: target.target.tenantId,
          }),
        };
      }

      const created = await tx.appraisalAssessment.create({
        data: {
          cycleId: cycle.id,
          instrumentVersionId: instrumentVersion.id,
          assessorUserId: actor.id,
          assessorAssignmentId: assignment.id,
          status: "DRAFT",
          revision: HEADTEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision,
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
            evidenceStream: HEADTEACHER_SUPERVISORY_DRAFT_POLICY.evidenceStream,
            draftKey: idempotencyKey,
            visitContextSchemaVersion:
              HEADTEACHER_SUPERVISORY_DRAFT_POLICY.visitContextSchemaVersion,
            visitContextHash,
            visitContextImmutable: true,
            visitDetailsSchemaVersion: input.visitDetails.schemaVersion,
            officialVisitDetailsIncluded: true,
            targetMembershipId: target.membershipId,
            separateFromStaffFeedback: true,
            combinedWeightingDefined: false,
            scoreRowsCreated: false,
            providerCalled: false,
          },
        },
        select: assessmentSelect,
      });

      await tx.auditLog.create({
        data: {
          tenantId: target.target.tenantId,
          userId: actor.id,
          action: SUPERVISORY_DRAFT_AUDIT_ACTION,
          resource: "AppraisalAssessment",
          resourceId: created.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            reqId: input.reqId,
            action: SUPERVISORY_DRAFT_AUDIT_ACTION,
            workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
            evidenceStream: HEADTEACHER_SUPERVISORY_DRAFT_POLICY.evidenceStream,
            cycleId: cycle.id,
            assessmentId: created.id,
            revision: created.revision,
            status: "DRAFT",
            assessorRole: authority.effectiveRole,
            assessorAssignmentId: assignment.id,
            scopeLevel: authority.scopeLevel,
            targetRole: "HEADTEACHER",
            targetTenantId: target.target.tenantId,
            targetCircuitZoneId: target.circuitZoneId,
            targetDistrictZoneId: target.districtZoneId,
            instrumentCode: instrumentVersion.instrument.code,
            instrumentVersion: instrumentVersion.version,
            dateObserved: isoDateOnly(input.dateObserved),
            visitContextHash,
            visitDetailsSchemaVersion: input.visitDetails.schemaVersion,
            officialVisitDetailsIncluded: true,
            scoreCount: 0,
            contactFieldsIncluded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "CREATED",
        assessment: existingSummary({
          record: created,
          cycle,
          instrumentVersion,
          expectedAssignmentId: assignment.id,
          expectedDateObserved: input.dateObserved,
          expectedContext: context,
          expectedContextHash: visitContextHash,
          expectedDraftKey: idempotencyKey,
          targetTenantId: target.target.tenantId,
        }),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: HEADTEACHER_SUPERVISORY_DRAFT_POLICY.transactionTimeoutMs,
    },
  );
}

export async function createHeadteacherSupervisoryAssessmentDraft(
  input: CreateHeadteacherSupervisoryDraftInput,
): Promise<CreateHeadteacherSupervisoryDraftResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryDraftDatabase);
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorRoleName = normalized(input.actorRoleName);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_INVALID_CURRENT_TIME", 400);
  }
  const dateObserved = normalizeObservationDate(input.dateObserved, now);
  const visitDetails = buildHeadteacherSupervisoryVisitDetailsSnapshot({
    arrivalTime: input.arrivalTime,
    staffStrength: input.staffStrength,
    totalEnrolment: input.totalEnrolment,
    girls: input.girls,
    boys: input.boys,
    teachersPresentAtVisit: input.teachersPresentAtVisit,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await performDraftTransaction({
        database,
        actorUserId,
        actorRoleName,
        cycleId,
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

  fail("HEADTEACHER_SUPERVISORY_DRAFT_CONCURRENT_CREATE_FAILED", 409);
}
