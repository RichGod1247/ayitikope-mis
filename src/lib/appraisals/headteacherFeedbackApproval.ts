import { randomUUID } from "crypto";
import { Prisma, type AppraisalCycleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackApprovalAuthority,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackPendingCycleHasNoParticipants,
  headteacherFeedbackDeadline,
  headteacherFeedbackParticipantsFreezeOnTransition,
  resolveEligibleHeadteacherFeedbackTeachers,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import { assertAppraisalCycleTransition } from "@/lib/appraisals/workflow";

export type HeadteacherFeedbackApprovalMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type ApproveAndOpenHeadteacherFeedbackCycleInput =
  HeadteacherFeedbackApprovalMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    cycleId: string;
    approvalNote?: string | null;
    requestedRespondentUserIds?: unknown;
    now?: Date;
    database?: HeadteacherFeedbackApprovalDatabase;
  };

export type HeadteacherFeedbackOpenedCycleSummary = {
  id: string;
  status: "OPEN";
  targetUserId: string;
  targetTenantId: string;
  targetName: string | null;
  targetRole: "HEADTEACHER";
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
  approvedAt: string;
  openedAt: string;
  deadlineAt: string;
  responseWindowDays: number;
  minimumResponses: number;
  participantCount: number;
  notificationsSeeded: false;
};

export type ApproveAndOpenHeadteacherFeedbackCycleResult = {
  outcome: "APPROVED_AND_OPENED" | "EXISTING_OPEN";
  cycle: HeadteacherFeedbackOpenedCycleSummary;
};

type InstrumentVersionRecord = {
  id: string;
  version: number;
  status: string;
  instrument: {
    id: string;
    code: string;
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
  status: string;
  identityVisibility: string;
  targetNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  requestedByUserId: string;
  requestedAt: Date;
  approvedByUserId: string | null;
  openedByUserId: string | null;
  approvedAt: Date | null;
  openedAt: Date | null;
  deadlineAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
  approvalNote: string | null;
  metadata: unknown;
  instrumentVersion: InstrumentVersionRecord;
  _count: {
    participants: number;
  };
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
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
      zoneType: {
        level: number;
        countryCode: string;
      };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: {
          level: number;
          countryCode: string;
        };
      };
    };
  };
};

type TeacherMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
  };
  tenant: {
    id: string;
    status: string;
  };
};

type MembershipDelegate = {
  findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  findMany(args: unknown): Promise<TeacherMembershipRecord[]>;
};

type AppraisalCycleDelegate = {
  findUnique(args: unknown): Promise<CycleRecord | null>;
  update(args: unknown): Promise<CycleRecord>;
};

type AppraisalParticipantDelegate = {
  createMany(args: unknown): Promise<{ count: number }>;
};

type AuditLogDelegate = {
  create(args: unknown): Promise<unknown>;
};

export type HeadteacherFeedbackOpenTransactionClient = {
  membership: MembershipDelegate;
  appraisalCycle: AppraisalCycleDelegate;
  appraisalParticipant: AppraisalParticipantDelegate;
  auditLog: AuditLogDelegate;
};

export type HeadteacherFeedbackApprovalDatabase = {
  appraisalCycle: AppraisalCycleDelegate;
  $transaction<T>(
    operation: (tx: HeadteacherFeedbackOpenTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type VerifiedCurrentTarget = {
  userId: string;
  tenantId: string;
  membershipId: string;
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
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
    fail("HEADTEACHER_FEEDBACK_INVALID_IDENTIFIER", 400, { fieldName });
  }

  return id;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function assertNoCallerSelectedRespondents(value: unknown) {
  if (value !== undefined && value !== null) {
    fail("HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN", 400);
  }
}

const cycleSelect = {
  id: true,
  instrumentVersionId: true,
  scopeZoneId: true,
  targetUserId: true,
  targetTenantId: true,
  targetZoneId: true,
  status: true,
  identityVisibility: true,
  targetNameSnapshot: true,
  targetRoleSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  requestedByUserId: true,
  requestedAt: true,
  approvedByUserId: true,
  openedByUserId: true,
  approvedAt: true,
  openedAt: true,
  deadlineAt: true,
  responseWindowDays: true,
  minimumResponses: true,
  approvalNote: true,
  metadata: true,
  instrumentVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      instrument: {
        select: {
          id: true,
          code: true,
          isActive: true,
        },
      },
    },
  },
  _count: {
    select: {
      participants: true,
    },
  },
} as const;

async function findCycle(
  database: Pick<HeadteacherFeedbackApprovalDatabase, "appraisalCycle">,
  cycleId: string,
) {
  return database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: cycleSelect,
  });
}

function assertCycleInstrumentContract(cycle: CycleRecord) {
  assertHeadteacherFeedbackInstrumentReady();

  if (
    cycle.instrumentVersionId !== cycle.instrumentVersion.id ||
    cycle.instrumentVersion.version !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    cycle.targetRoleSnapshot !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    cycle.identityVisibility !==
      HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue ||
    cycle.responseWindowDays !==
      HEADTEACHER_FEEDBACK_POLICY.responseWindowDays ||
    cycle.minimumResponses !==
      HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses
  ) {
    fail("HEADTEACHER_FEEDBACK_APPROVAL_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
}

function jurisdictionFromCycle(cycle: CycleRecord) {
  const metadata = objectValue(cycle.metadata);

  return {
    districtZoneId: clean(metadata.districtZoneId) || cycle.scopeZoneId,
    districtName: clean(metadata.districtName) || "District jurisdiction",
    circuitZoneId: clean(metadata.circuitZoneId) || clean(cycle.targetZoneId),
    circuitName:
      clean(metadata.circuitName) ||
      clean(cycle.targetZoneNameSnapshot) ||
      "Circuit jurisdiction",
  };
}

function safeOpenedCycleSummary(
  cycle: CycleRecord,
): HeadteacherFeedbackOpenedCycleSummary {
  assertCycleInstrumentContract(cycle);

  if (cycle.status !== "OPEN") {
    fail("HEADTEACHER_FEEDBACK_CYCLE_NOT_OPEN", 409, {
      cycleId: cycle.id,
      status: cycle.status,
    });
  }

  const targetTenantId = clean(cycle.targetTenantId);
  const schoolName = clean(cycle.targetSchoolNameSnapshot);
  const jurisdiction = jurisdictionFromCycle(cycle);

  if (
    !targetTenantId ||
    !schoolName ||
    !jurisdiction.circuitZoneId ||
    !jurisdiction.districtZoneId ||
    !cycle.approvedAt ||
    !cycle.openedAt ||
    !cycle.deadlineAt ||
    !cycle.approvedByUserId ||
    !cycle.openedByUserId ||
    cycle._count.participants < 1
  ) {
    fail("HEADTEACHER_FEEDBACK_OPEN_CYCLE_INCOMPLETE", 409, {
      cycleId: cycle.id,
    });
  }

  if (
    cycle.deadlineAt.getTime() <= cycle.openedAt.getTime() ||
    cycle.openedAt.getTime() < cycle.approvedAt.getTime()
  ) {
    fail("HEADTEACHER_FEEDBACK_OPEN_CYCLE_TIMELINE_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  const metadata = objectValue(cycle.metadata);
  if (metadata.participantsFrozen !== true) {
    fail("HEADTEACHER_FEEDBACK_OPEN_CYCLE_FREEZE_MARKER_MISSING", 409, {
      cycleId: cycle.id,
    });
  }

  return {
    id: cycle.id,
    status: "OPEN",
    targetUserId: cycle.targetUserId,
    targetTenantId,
    targetName: cycle.targetNameSnapshot,
    targetRole: "HEADTEACHER",
    schoolName,
    circuitZoneId: jurisdiction.circuitZoneId,
    circuitName: jurisdiction.circuitName,
    districtZoneId: jurisdiction.districtZoneId,
    districtName: jurisdiction.districtName,
    approvedAt: cycle.approvedAt.toISOString(),
    openedAt: cycle.openedAt.toISOString(),
    deadlineAt: cycle.deadlineAt.toISOString(),
    responseWindowDays: cycle.responseWindowDays,
    minimumResponses: cycle.minimumResponses,
    participantCount: cycle._count.participants,
    notificationsSeeded: false,
  };
}

function assertOpenableCycle(
  cycle: CycleRecord,
  openingMode: "APPROVAL" | "DIRECT_OPEN",
) {
  assertCycleInstrumentContract(cycle);

  const expectedPriorStatus =
    openingMode === "APPROVAL" ? "PENDING_APPROVAL" : "DRAFT";

  if (cycle.status !== expectedPriorStatus) {
    fail(
      openingMode === "APPROVAL"
        ? "HEADTEACHER_FEEDBACK_CYCLE_NOT_PENDING_APPROVAL"
        : "HEADTEACHER_FEEDBACK_DIRECT_OPEN_CYCLE_NOT_DRAFT",
      409,
      {
        cycleId: cycle.id,
        status: cycle.status,
      },
    );
  }

  assertHeadteacherFeedbackPendingCycleHasNoParticipants({
    status: cycle.status as AppraisalCycleStatus,
    participantCount: cycle._count.participants,
  });

  if (
    cycle.approvedAt !== null ||
    cycle.approvedByUserId !== null ||
    cycle.openedAt !== null ||
    cycle.openedByUserId !== null ||
    cycle.deadlineAt !== null
  ) {
    fail("HEADTEACHER_FEEDBACK_PENDING_APPROVAL_TIMELINE_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  if (
    !clean(cycle.targetTenantId) ||
    !clean(cycle.targetZoneId) ||
    !clean(cycle.scopeZoneId) ||
    !clean(cycle.targetSchoolNameSnapshot)
  ) {
    fail("HEADTEACHER_FEEDBACK_PENDING_APPROVAL_SNAPSHOT_INCOMPLETE", 409, {
      cycleId: cycle.id,
    });
  }

  assertAppraisalCycleTransition(expectedPriorStatus, "OPEN");

  if (
    !headteacherFeedbackParticipantsFreezeOnTransition({
      from: expectedPriorStatus,
      to: "OPEN",
    })
  ) {
    fail("HEADTEACHER_FEEDBACK_FREEZE_TRANSITION_NOT_RECOGNIZED", 500);
  }
}

async function resolveCurrentTarget(
  tx: HeadteacherFeedbackOpenTransactionClient,
  cycle: CycleRecord,
): Promise<VerifiedCurrentTarget> {
  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );

  const membership = await tx.membership.findFirst({
    where: {
      userId: cycle.targetUserId,
      tenantId: targetTenantId,
      status: "ACTIVE",
      role: {
        name: {
          equals: "HEADTEACHER",
          mode: "insensitive",
        },
      },
      tenant: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: {
        select: {
          name: true,
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
              zoneType: {
                select: {
                  level: true,
                  countryCode: true,
                },
              },
              parentZone: {
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
            },
          },
        },
      },
    },
  });

  if (!membership) {
    fail("HEADTEACHER_FEEDBACK_ACTIVE_TARGET_NOT_FOUND_AT_APPROVAL", 404, {
      cycleId: cycle.id,
    });
  }

  const target = assertActiveHeadteacherFeedbackTarget({
    target: {
      membershipId: membership.id,
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipStatus: membership.status,
      roleName: membership.role.name,
      tenantStatus: membership.tenant.status,
    },
    expectedUserId: cycle.targetUserId,
    expectedTenantId: targetTenantId,
  });

  const circuit = membership.tenant.zone;
  const district = circuit?.parentZone;

  if (
    !circuit ||
    circuit.isActive !== true ||
    circuit.zoneType.level !== 1 ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !== 2 ||
    circuit.parentZoneId !== district.id ||
    circuit.zoneType.countryCode !== district.zoneType.countryCode
  ) {
    fail("HEADTEACHER_FEEDBACK_TARGET_JURISDICTION_NOT_FOUND_AT_APPROVAL", 409, {
      cycleId: cycle.id,
    });
  }

  if (
    cycle.targetZoneId !== circuit.id ||
    cycle.scopeZoneId !== district.id
  ) {
    fail("HEADTEACHER_FEEDBACK_JURISDICTION_CHANGED_SINCE_REQUEST", 409, {
      cycleId: cycle.id,
    });
  }

  return {
    userId: target.userId,
    tenantId: target.tenantId,
    membershipId: target.membershipId,
    schoolName: membership.tenant.name,
    circuitZoneId: circuit.id,
    circuitName: circuit.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

async function resolveCurrentTeachers(
  tx: HeadteacherFeedbackOpenTransactionClient,
  target: VerifiedCurrentTarget,
) {
  const rows = await tx.membership.findMany({
    where: {
      tenantId: target.tenantId,
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
          mode: "insensitive",
        },
      },
      tenant: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: {
        select: {
          name: true,
        },
      },
      tenant: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
  });

  return resolveEligibleHeadteacherFeedbackTeachers({
    targetHeadteacherUserId: target.userId,
    targetTenantId: target.tenantId,
    candidates: rows.map((row) => ({
      membershipId: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      membershipStatus: row.status,
      roleName: row.role.name,
      tenantStatus: row.tenant.status,
    })),
  });
}

/**
 * Shared opening core for D3.4C3 approval and the later D3.4C4 direct-open
 * wrapper. Callers must already be inside one serializable, bounded
 * transaction and must have enforced governance authority and idempotency.
 */
export async function openHeadteacherFeedbackCycleWithinTransaction(input: {
  tx: HeadteacherFeedbackOpenTransactionClient;
  cycle: CycleRecord;
  actorUserId: string;
  actorRole: "DISTRICT_DIRECTOR" | "SUPERADMIN";
  reqId: string;
  approvalNote?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now: Date;
  openingMode: "APPROVAL" | "DIRECT_OPEN";
}) {
  assertOpenableCycle(input.cycle, input.openingMode);

  const priorStatus =
    input.openingMode === "APPROVAL" ? "PENDING_APPROVAL" : "DRAFT";

  const target = await resolveCurrentTarget(input.tx, input.cycle);
  const eligibleParticipants = await resolveCurrentTeachers(input.tx, target);
  const deadlineAt = headteacherFeedbackDeadline(input.now);

  const participantRows = eligibleParticipants.map((participant) => ({
    cycleId: input.cycle.id,
    respondentUserId: participant.respondentUserId,
    respondentTenantId: participant.respondentTenantId,
    status: "NOT_STARTED" as const,
    respondentRoleSnapshot: participant.respondentRoleSnapshot,
    eligibilitySnapshotJson: participant.eligibilitySnapshot,
    selectedAt: input.now,
    invitedAt: null,
    metadata: {
      workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
      selectionBasis:
        participant.eligibilitySnapshot.selectionBasis,
      notificationSeeded: false,
    },
  }));

  const created = await input.tx.appraisalParticipant.createMany({
    data: participantRows,
  });

  if (created.count !== eligibleParticipants.length) {
    fail("HEADTEACHER_FEEDBACK_PARTICIPANT_FREEZE_COUNT_MISMATCH", 409, {
      cycleId: input.cycle.id,
      expected: eligibleParticipants.length,
      actual: created.count,
    });
  }

  const priorMetadata = objectValue(input.cycle.metadata);
  const approvalNote = clean(input.approvalNote).slice(0, 1000) || null;

  const updated = await input.tx.appraisalCycle.update({
    where: { id: input.cycle.id },
    data: {
      status: "OPEN",
      approvedByUserId: input.actorUserId,
      approvedAt: input.now,
      openedByUserId: input.actorUserId,
      openedAt: input.now,
      deadlineAt,
      approvalNote,
      targetSchoolNameSnapshot: target.schoolName,
      targetZoneNameSnapshot: target.circuitName,
      metadata: {
        ...priorMetadata,
        workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
        districtZoneId: target.districtZoneId,
        districtName: target.districtName,
        circuitZoneId: target.circuitZoneId,
        circuitName: target.circuitName,
        approvedByRole: input.actorRole,
        openedByRole: input.actorRole,
        approvedAt: input.now.toISOString(),
        openedAt: input.now.toISOString(),
        deadlineAt: deadlineAt.toISOString(),
        participantSelection:
          HEADTEACHER_FEEDBACK_POLICY.participantSelection,
        participantFreezeStatus:
          HEADTEACHER_FEEDBACK_POLICY.participantFreezeStatus,
        participantsFrozen: true,
        participantCount: eligibleParticipants.length,
        notificationsSeeded: false,
      },
    },
    select: cycleSelect,
  });

  const commonAuditMetadata = {
    reqId: input.reqId,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    actorRole: input.actorRole,
    cycleId: input.cycle.id,
    instrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
    instrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
    targetUserId: target.userId,
    targetTenantId: target.tenantId,
    targetZoneId: target.circuitZoneId,
    scopeZoneId: target.districtZoneId,
    participantCount: eligibleParticipants.length,
    openedAt: input.now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    notificationsSeeded: false,
  };

  await input.tx.auditLog.create({
    data: {
      tenantId: target.tenantId,
      userId: input.actorUserId,
      action: APPRAISAL_AUDIT_ACTIONS.CYCLE_APPROVED,
      resource: "AppraisalCycle",
      resourceId: input.cycle.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: {
        ...commonAuditMetadata,
        action: APPRAISAL_AUDIT_ACTIONS.CYCLE_APPROVED,
        priorStatus,
        nextStatus: "OPEN",
      },
    },
  });

  await input.tx.auditLog.create({
    data: {
      tenantId: target.tenantId,
      userId: input.actorUserId,
      action: APPRAISAL_AUDIT_ACTIONS.PARTICIPANTS_RESOLVED,
      resource: "AppraisalCycle",
      resourceId: input.cycle.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: {
        ...commonAuditMetadata,
        action: APPRAISAL_AUDIT_ACTIONS.PARTICIPANTS_RESOLVED,
        selectionBasis:
          "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
        participantIdentitiesIncluded: false,
      },
    },
  });

  await input.tx.auditLog.create({
    data: {
      tenantId: target.tenantId,
      userId: input.actorUserId,
      action: APPRAISAL_AUDIT_ACTIONS.CYCLE_OPENED,
      resource: "AppraisalCycle",
      resourceId: input.cycle.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: {
        ...commonAuditMetadata,
        action: APPRAISAL_AUDIT_ACTIONS.CYCLE_OPENED,
        priorStatus,
        nextStatus: "OPEN",
      },
    },
  });

  return updated;
}

export async function approveAndOpenHeadteacherFeedbackCycle(
  input: ApproveAndOpenHeadteacherFeedbackCycleInput,
): Promise<ApproveAndOpenHeadteacherFeedbackCycleResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackApprovalDatabase);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_INVALID_APPROVAL_TIME", 400);
  }

  assertNoCallerSelectedRespondents(input.requestedRespondentUserIds);

  const existing = await findCycle(database, cycleId);
  if (!existing) {
    fail("HEADTEACHER_FEEDBACK_CYCLE_NOT_FOUND", 404, { cycleId });
  }

  const targetTenantId = requireIdentifier(
    existing.targetTenantId,
    "targetTenantId",
  );

  const authority = assertHeadteacherFeedbackApprovalAuthority({
    actorUserId,
    actorRoleName: input.actorRoleName,
    targetHeadteacherUserId: existing.targetUserId,
    targetTenantId,
    governanceScope: input.governanceScope,
  });

  if (existing.status === "OPEN") {
    return {
      outcome: "EXISTING_OPEN",
      cycle: safeOpenedCycleSummary(existing),
    };
  }

  assertOpenableCycle(existing, "APPROVAL");

  try {
    return await database.$transaction(
      async (tx) => {
        const current = await findCycle(
          tx as unknown as Pick<
            HeadteacherFeedbackApprovalDatabase,
            "appraisalCycle"
          >,
          cycleId,
        );

        if (!current) {
          fail("HEADTEACHER_FEEDBACK_CYCLE_NOT_FOUND", 404, { cycleId });
        }

        if (current.status === "OPEN") {
          return {
            outcome: "EXISTING_OPEN" as const,
            cycle: safeOpenedCycleSummary(current),
          };
        }

        assertOpenableCycle(current, "APPROVAL");

        const updated = await openHeadteacherFeedbackCycleWithinTransaction({
          tx,
          cycle: current,
          actorUserId: authority.actorUserId,
          actorRole: authority.actorRole as
            | "DISTRICT_DIRECTOR"
            | "SUPERADMIN",
          reqId,
          approvalNote: input.approvalNote,
          ip: input.ip,
          userAgent: input.userAgent,
          now,
          openingMode: "APPROVAL",
        });

        return {
          outcome: "APPROVED_AND_OPENED" as const,
          cycle: safeOpenedCycleSummary(updated),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  } catch (error) {
    const raced = await findCycle(database, cycleId);

    if (raced?.status === "OPEN") {
      return {
        outcome: "EXISTING_OPEN",
        cycle: safeOpenedCycleSummary(raced),
      };
    }

    throw error;
  }
}
