import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalCycleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES,
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackPendingCycleHasNoParticipants,
  assertHeadteacherFeedbackRequestAuthority,
} from "@/lib/appraisals/headteacherFeedback";

export type HeadteacherFeedbackRequestMeta = {
  reqId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type RequestHeadteacherFeedbackCycleInput =
  HeadteacherFeedbackRequestMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    actorTenantId: string;
    targetHeadteacherUserId?: string | null;
    requestKey: string;
    requestReason?: string | null;
    requestedRespondentUserIds?: unknown;
    now?: Date;
    database?: HeadteacherFeedbackRequestDatabase;
  };

export type HeadteacherFeedbackRequestCycleSummary = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetTenantId: string;
  targetName: string | null;
  targetRole: "HEADTEACHER";
  schoolName: string;
  circuitZoneId: string;
  circuitName: string;
  districtZoneId: string;
  districtName: string;
  requestedAt: string;
  responseWindowDays: number;
  minimumResponses: number;
  openedAt: string | null;
  deadlineAt: string | null;
};

export type RequestHeadteacherFeedbackCycleResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  cycle: HeadteacherFeedbackRequestCycleSummary;
};

type TargetMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
  };
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

type PendingCycleRecord = {
  id: string;
  status: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  targetSchoolNameSnapshot: string | null;
  targetZoneId: string | null;
  targetZoneNameSnapshot: string | null;
  scopeZoneId: string;
  requestedAt: Date;
  openedAt: Date | null;
  deadlineAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
  metadata: unknown;
  _count: {
    participants: number;
  };
};

type TransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<PendingCycleRecord | null>;
    findFirst(args: unknown): Promise<PendingCycleRecord | null>;
    create(args: unknown): Promise<PendingCycleRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherFeedbackRequestDatabase = {
  membership: {
    findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  };
  appraisalInstrumentVersion: {
    findFirst(args: unknown): Promise<InstrumentVersionRecord | null>;
  };
  appraisalCycle: TransactionClient["appraisalCycle"];
  $transaction<T>(
    operation: (tx: TransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type ResolvedTarget = {
  membershipId: string;
  userId: string;
  tenantId: string;
  displayName: string | null;
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

function normalizeRequestKey(value: unknown) {
  const key = clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  if (key.length < 8) {
    fail("HEADTEACHER_FEEDBACK_REQUEST_KEY_INVALID", 400);
  }

  return key;
}

function requestIdempotencyKey(input: {
  targetUserId: string;
  targetTenantId: string;
  requestKey: string;
}) {
  const digest = createHash("sha256")
    .update(
      [input.targetTenantId, input.targetUserId, input.requestKey].join(":"),
      "utf8",
    )
    .digest("hex");

  return `headteacher-feedback-request:${digest}`;
}

function displayName(user: TargetMembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    clean(user.email) ||
    null
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jurisdictionSnapshot(cycle: PendingCycleRecord) {
  const metadata = objectValue(cycle.metadata);
  const districtZoneId = clean(metadata.districtZoneId) || cycle.scopeZoneId;
  const districtName = clean(metadata.districtName) || "District jurisdiction";
  const circuitZoneId = clean(metadata.circuitZoneId) || clean(cycle.targetZoneId);
  const circuitName =
    clean(metadata.circuitName) ||
    clean(cycle.targetZoneNameSnapshot) ||
    "Circuit jurisdiction";

  return {
    districtZoneId,
    districtName,
    circuitZoneId,
    circuitName,
  };
}

function safeRequestCycleSummary(
  cycle: PendingCycleRecord,
): HeadteacherFeedbackRequestCycleSummary {
  const status = cycle.status as AppraisalCycleStatus;

  if (
    cycle.targetRoleSnapshot !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    cycle.responseWindowDays !==
      HEADTEACHER_FEEDBACK_POLICY.responseWindowDays ||
    cycle.minimumResponses !==
      HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses
  ) {
    fail("HEADTEACHER_FEEDBACK_REQUEST_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }

  if (status === "DRAFT" || status === "PENDING_APPROVAL") {
    assertHeadteacherFeedbackPendingCycleHasNoParticipants({
      status,
      participantCount: cycle._count.participants,
    });

    if (cycle.openedAt !== null || cycle.deadlineAt !== null) {
      fail("HEADTEACHER_FEEDBACK_PENDING_CYCLE_TIMESTAMPS_INVALID", 409, {
        cycleId: cycle.id,
      });
    }
  }

  const targetTenantId = clean(cycle.targetTenantId);
  const targetUserId = clean(cycle.targetUserId);
  const schoolName = clean(cycle.targetSchoolNameSnapshot);
  const jurisdiction = jurisdictionSnapshot(cycle);

  if (
    !targetTenantId ||
    !targetUserId ||
    !schoolName ||
    !jurisdiction.circuitZoneId ||
    !jurisdiction.districtZoneId
  ) {
    fail("HEADTEACHER_FEEDBACK_PENDING_CYCLE_SNAPSHOT_INCOMPLETE", 409, {
      cycleId: cycle.id,
    });
  }

  return {
    id: cycle.id,
    status,
    targetUserId,
    targetTenantId,
    targetName: cycle.targetNameSnapshot,
    targetRole: "HEADTEACHER",
    schoolName,
    circuitZoneId: jurisdiction.circuitZoneId,
    circuitName: jurisdiction.circuitName,
    districtZoneId: jurisdiction.districtZoneId,
    districtName: jurisdiction.districtName,
    requestedAt: cycle.requestedAt.toISOString(),
    responseWindowDays: cycle.responseWindowDays,
    minimumResponses: cycle.minimumResponses,
    openedAt: cycle.openedAt?.toISOString() ?? null,
    deadlineAt: cycle.deadlineAt?.toISOString() ?? null,
  };
}

async function resolveTargetHeadteacher(
  database: HeadteacherFeedbackRequestDatabase,
  input: {
    targetUserId: string;
    targetTenantId: string;
  },
): Promise<ResolvedTarget> {
  const membership = await database.membership.findFirst({
    where: {
      userId: input.targetUserId,
      tenantId: input.targetTenantId,
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
    fail("HEADTEACHER_FEEDBACK_ACTIVE_TARGET_NOT_FOUND", 404, {
      targetUserId: input.targetUserId,
      targetTenantId: input.targetTenantId,
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
    expectedUserId: input.targetUserId,
    expectedTenantId: input.targetTenantId,
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
    fail("HEADTEACHER_FEEDBACK_TARGET_JURISDICTION_NOT_FOUND", 409, {
      targetTenantId: input.targetTenantId,
    });
  }

  return {
    membershipId: target.membershipId,
    userId: target.userId,
    tenantId: target.tenantId,
    displayName: displayName(membership.user),
    schoolName: membership.tenant.name,
    circuitZoneId: circuit.id,
    circuitName: circuit.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

async function resolvePublishedInstrument(
  database: HeadteacherFeedbackRequestDatabase,
) {
  assertHeadteacherFeedbackInstrumentReady();

  const version = await database.appraisalInstrumentVersion.findFirst({
    where: {
      version: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
      status: "ACTIVE",
      instrument: {
        code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
        isActive: true,
      },
    },
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
  });

  if (!version) {
    fail("HEADTEACHER_FEEDBACK_PUBLISHED_INSTRUMENT_NOT_FOUND", 409);
  }

  return version;
}

const pendingCycleSelect = {
  id: true,
  status: true,
  targetUserId: true,
  targetTenantId: true,
  targetNameSnapshot: true,
  targetRoleSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneId: true,
  targetZoneNameSnapshot: true,
  scopeZoneId: true,
  requestedAt: true,
  openedAt: true,
  deadlineAt: true,
  responseWindowDays: true,
  minimumResponses: true,
  metadata: true,
  _count: {
    select: {
      participants: true,
    },
  },
} as const;

async function findCycleByIdempotencyKey(
  database: Pick<HeadteacherFeedbackRequestDatabase, "appraisalCycle">,
  idempotencyKey: string,
) {
  return database.appraisalCycle.findUnique({
    where: {
      idempotencyKey,
    },
    select: pendingCycleSelect,
  });
}

async function findActiveTargetCycle(
  database: Pick<HeadteacherFeedbackRequestDatabase, "appraisalCycle">,
  input: {
    targetUserId: string;
    targetTenantId: string;
  },
) {
  return database.appraisalCycle.findFirst({
    where: {
      targetUserId: input.targetUserId,
      targetTenantId: input.targetTenantId,
      targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
      instrumentVersion: {
        instrument: {
          code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
        },
      },
      status: {
        in: [...ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES],
      },
    },
    select: pendingCycleSelect,
  });
}

export async function requestHeadteacherFeedbackCycle(
  input: RequestHeadteacherFeedbackCycleInput,
): Promise<RequestHeadteacherFeedbackCycleResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackRequestDatabase);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const requestKey = normalizeRequestKey(input.requestKey);
  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_INVALID_REQUESTED_AT", 400);
  }

  const authority = assertHeadteacherFeedbackRequestAuthority({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    targetHeadteacherUserId: input.targetHeadteacherUserId,
    requestedRespondentUserIds: input.requestedRespondentUserIds,
  });

  const target = await resolveTargetHeadteacher(database, {
    targetUserId: authority.targetHeadteacherUserId,
    targetTenantId: actorTenantId,
  });

  const instrumentVersion = await resolvePublishedInstrument(database);
  const idempotencyKey = requestIdempotencyKey({
    targetUserId: target.userId,
    targetTenantId: target.tenantId,
    requestKey,
  });

  const existing = await findCycleByIdempotencyKey(database, idempotencyKey);

  if (existing) {
    return {
      outcome: "EXISTING_MATCH",
      cycle: safeRequestCycleSummary(existing),
    };
  }

  const conflicting = await findActiveTargetCycle(database, {
    targetUserId: target.userId,
    targetTenantId: target.tenantId,
  });

  if (conflicting) {
    fail("HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS", 409, {
      cycleId: conflicting.id,
      status: conflicting.status,
    });
  }

  try {
    return await database.$transaction(
      async (tx) => {
        const racedMatch = await findCycleByIdempotencyKey(
          tx as unknown as Pick<
            HeadteacherFeedbackRequestDatabase,
            "appraisalCycle"
          >,
          idempotencyKey,
        );

        if (racedMatch) {
          return {
            outcome: "EXISTING_MATCH" as const,
            cycle: safeRequestCycleSummary(racedMatch),
          };
        }

        const racedConflict = await findActiveTargetCycle(
          tx as unknown as Pick<
            HeadteacherFeedbackRequestDatabase,
            "appraisalCycle"
          >,
          {
            targetUserId: target.userId,
            targetTenantId: target.tenantId,
          },
        );

        if (racedConflict) {
          fail("HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS", 409, {
            cycleId: racedConflict.id,
            status: racedConflict.status,
          });
        }

        const cycle = await tx.appraisalCycle.create({
          data: {
            instrumentVersionId: instrumentVersion.id,
            scopeZoneId: target.districtZoneId,
            targetUserId: target.userId,
            targetTenantId: target.tenantId,
            targetZoneId: target.circuitZoneId,
            targetGovernanceAssignmentId: null,
            status: "PENDING_APPROVAL",
            identityVisibility:
              HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue,
            idempotencyKey,
            responseWindowDays:
              HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
            minimumResponses:
              HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
            extensionCount: 0,
            requestReason: clean(input.requestReason).slice(0, 500) || null,
            targetNameSnapshot: target.displayName,
            targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
            targetSchoolNameSnapshot: target.schoolName,
            targetZoneNameSnapshot: target.circuitName,
            requestedByUserId: authority.actorUserId,
            requestedAt: now,
            metadata: {
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              requestKey,
              requestedByRole: authority.actorRole,
              targetMembershipId: target.membershipId,
              districtZoneId: target.districtZoneId,
              districtName: target.districtName,
              circuitZoneId: target.circuitZoneId,
              circuitName: target.circuitName,
              participantSelection:
                HEADTEACHER_FEEDBACK_POLICY.participantSelection,
              participantFreezeStatus:
                HEADTEACHER_FEEDBACK_POLICY.participantFreezeStatus,
              participantsFrozen: false,
              notificationsSeeded: false,
            },
          },
          select: pendingCycleSelect,
        });

        assertHeadteacherFeedbackPendingCycleHasNoParticipants({
          status: "PENDING_APPROVAL",
          participantCount: cycle._count.participants,
        });

        await tx.auditLog.create({
          data: {
            tenantId: target.tenantId,
            userId: authority.actorUserId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REQUESTED,
            resource: "AppraisalCycle",
            resourceId: cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REQUESTED,
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              actorRole: authority.actorRole,
              cycleId: cycle.id,
              priorStatus: null,
              nextStatus: "PENDING_APPROVAL",
              instrumentCode:
                HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
              instrumentVersion:
                HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
              targetUserId: target.userId,
              targetTenantId: target.tenantId,
              targetZoneId: target.circuitZoneId,
              scopeZoneId: target.districtZoneId,
              participantCount: 0,
              participantsFrozen: false,
              notificationsSeeded: false,
            },
          },
        });

        return {
          outcome: "CREATED" as const,
          cycle: safeRequestCycleSummary(cycle),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  } catch (error) {
    const racedMatch = await findCycleByIdempotencyKey(
      database,
      idempotencyKey,
    );

    if (racedMatch) {
      return {
        outcome: "EXISTING_MATCH",
        cycle: safeRequestCycleSummary(racedMatch),
      };
    }

    const racedConflict = await findActiveTargetCycle(database, {
      targetUserId: target.userId,
      targetTenantId: target.tenantId,
    });

    if (racedConflict) {
      fail("HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS", 409, {
        cycleId: racedConflict.id,
        status: racedConflict.status,
      });
    }

    throw error;
  }
}
