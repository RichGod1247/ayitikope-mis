//src/lib/appraisals/headteacherFeedbackDirectOpen.ts
import { createHash, randomUUID } from "crypto";
import { Prisma, type AppraisalCycleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { effectiveRole } from "@/lib/roleRouting";
import {
  ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES,
  HEADTEACHER_FEEDBACK_POLICY,
  assertActiveHeadteacherFeedbackTarget,
  assertHeadteacherFeedbackDirectOpenAuthority,
  assertHeadteacherFeedbackInstrumentReady,
  assertHeadteacherFeedbackPendingCycleHasNoParticipants,
  type HeadteacherFeedbackGovernanceScope,
} from "@/lib/appraisals/headteacherFeedback";
import {
  openHeadteacherFeedbackCycleWithinTransaction,
  type HeadteacherFeedbackOpenTransactionClient,
  type HeadteacherFeedbackOpenedCycleSummary,
} from "@/lib/appraisals/headteacherFeedbackApproval";

export type HeadteacherFeedbackDirectOpenMeta = {
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type DirectOpenHeadteacherFeedbackCycleInput =
  HeadteacherFeedbackDirectOpenMeta & {
    actorUserId: string;
    actorRoleName: unknown;
    governanceScope: HeadteacherFeedbackGovernanceScope;
    targetHeadteacherUserId: string;
    targetTenantId: string;
    directOpenKey: string;
    openingNote?: string | null;
    requestedRespondentUserIds?: unknown;
    now?: Date;
    database?: HeadteacherFeedbackDirectOpenDatabase;
  };

export type DirectOpenHeadteacherFeedbackCycleResult = {
  outcome: "DIRECTLY_OPENED" | "EXISTING_OPEN";
  cycle: HeadteacherFeedbackOpenedCycleSummary;
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

type DirectOpenCycleRecord = {
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

type AppraisalCycleDelegate = {
  findUnique(args: unknown): Promise<DirectOpenCycleRecord | null>;
  findFirst(args: unknown): Promise<DirectOpenCycleRecord | null>;
  create(args: unknown): Promise<DirectOpenCycleRecord>;
  update(args: unknown): Promise<DirectOpenCycleRecord>;
};

type DirectOpenTeacherMembershipRecord = {
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

type DirectOpenMembershipDelegate = {
  findFirst(args: unknown): Promise<TargetMembershipRecord | null>;
  findMany(args: unknown): Promise<DirectOpenTeacherMembershipRecord[]>;
};

type DirectOpenTransactionClient =
  Omit<
    HeadteacherFeedbackOpenTransactionClient,
    "membership" | "appraisalCycle"
  > & {
    membership: DirectOpenMembershipDelegate;
    appraisalInstrumentVersion: {
      findFirst(args: unknown): Promise<InstrumentVersionRecord | null>;
    };
    appraisalCycle: AppraisalCycleDelegate;
  };

export type HeadteacherFeedbackDirectOpenDatabase = {
  membership: DirectOpenMembershipDelegate;
  appraisalInstrumentVersion: {
    findFirst(args: unknown): Promise<InstrumentVersionRecord | null>;
  };
  appraisalCycle: AppraisalCycleDelegate;
  $transaction<T>(
    operation: (tx: DirectOpenTransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

type ResolvedDirectOpenTarget = {
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

export type HeadteacherFeedbackDirectOpenTarget = {
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
};

export type HeadteacherFeedbackDirectOpenTargetCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  targetCount: number;
};

export type HeadteacherFeedbackDirectOpenTargets = {
  actorRole: "DISTRICT_DIRECTOR" | "SUPERADMIN";
  circuits: HeadteacherFeedbackDirectOpenTargetCircuit[];
  targets: HeadteacherFeedbackDirectOpenTarget[];
  readOnly: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  providerCalled: false;
};

type HeadteacherFeedbackDirectOpenTargetDatabase = {
  membership: {
    findMany(args: unknown): Promise<TargetMembershipRecord[]>;
  };
};

type SharedOpenCycle = Parameters<
  typeof openHeadteacherFeedbackCycleWithinTransaction
>[0]["cycle"];

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

function normalizeDirectOpenKey(value: unknown) {
  const key = clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  if (key.length < 8) {
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_KEY_INVALID", 400);
  }

  return key;
}

function directOpenIdempotencyKey(input: {
  targetUserId: string;
  targetTenantId: string;
  directOpenKey: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        input.targetTenantId,
        input.targetUserId,
        input.directOpenKey,
      ].join(":"),
      "utf8",
    )
    .digest("hex");

  return `headteacher-feedback-direct-open:${digest}`;
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

function assertNoCallerSelectedRespondents(value: unknown) {
  if (value !== undefined && value !== null) {
    fail("HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN", 400);
  }
}

const directOpenCycleSelect = {
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

async function findCycleByIdempotencyKey(
  database: Pick<HeadteacherFeedbackDirectOpenDatabase, "appraisalCycle">,
  idempotencyKey: string,
) {
  return database.appraisalCycle.findUnique({
    where: { idempotencyKey },
    select: directOpenCycleSelect,
  });
}

async function findActiveTargetCycle(
  database: Pick<HeadteacherFeedbackDirectOpenDatabase, "appraisalCycle">,
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
    select: directOpenCycleSelect,
  });
}

async function resolveDirectOpenTarget(
  database: Pick<HeadteacherFeedbackDirectOpenDatabase, "membership">,
  input: {
    targetUserId: string;
    targetTenantId: string;
  },
): Promise<ResolvedDirectOpenTarget> {
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
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_TARGET_NOT_FOUND", 404, {
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
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_TARGET_JURISDICTION_INVALID", 409, {
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
  database: Pick<
    HeadteacherFeedbackDirectOpenDatabase,
    "appraisalInstrumentVersion"
  >,
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

function assertDirectOpenCycleContract(cycle: DirectOpenCycleRecord) {
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
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_CYCLE_CONTRACT_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
}

function safeDirectOpenSummary(
  cycle: DirectOpenCycleRecord,
): HeadteacherFeedbackOpenedCycleSummary {
  assertDirectOpenCycleContract(cycle);

  if (cycle.status !== "OPEN") {
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_NOT_OPEN", 409, {
      cycleId: cycle.id,
      status: cycle.status,
    });
  }

  const targetTenantId = clean(cycle.targetTenantId);
  const schoolName = clean(cycle.targetSchoolNameSnapshot);
  const metadata = objectValue(cycle.metadata);
  const circuitZoneId =
    clean(metadata.circuitZoneId) || clean(cycle.targetZoneId);
  const circuitName =
    clean(metadata.circuitName) ||
    clean(cycle.targetZoneNameSnapshot) ||
    "Circuit jurisdiction";
  const districtZoneId =
    clean(metadata.districtZoneId) || clean(cycle.scopeZoneId);
  const districtName =
    clean(metadata.districtName) || "District jurisdiction";

  if (
    !targetTenantId ||
    !schoolName ||
    !circuitZoneId ||
    !districtZoneId ||
    !cycle.approvedAt ||
    !cycle.openedAt ||
    !cycle.deadlineAt ||
    !cycle.approvedByUserId ||
    !cycle.openedByUserId ||
    cycle._count.participants < 1 ||
    metadata.participantsFrozen !== true
  ) {
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_CYCLE_INCOMPLETE", 409, {
      cycleId: cycle.id,
    });
  }

  if (
    cycle.approvedByUserId !== cycle.openedByUserId ||
    cycle.deadlineAt.getTime() <= cycle.openedAt.getTime() ||
    cycle.openedAt.getTime() < cycle.approvedAt.getTime()
  ) {
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_TIMELINE_INVALID", 409, {
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
    circuitZoneId,
    circuitName,
    districtZoneId,
    districtName,
    approvedAt: cycle.approvedAt.toISOString(),
    openedAt: cycle.openedAt.toISOString(),
    deadlineAt: cycle.deadlineAt.toISOString(),
    responseWindowDays: cycle.responseWindowDays,
    minimumResponses: cycle.minimumResponses,
    participantCount: cycle._count.participants,
    notificationsSeeded: false,
  };
}

function existingDirectOpenResult(cycle: DirectOpenCycleRecord) {
  if (cycle.status !== "OPEN") {
    fail("HEADTEACHER_FEEDBACK_DIRECT_OPEN_IDEMPOTENCY_STATE_INVALID", 409, {
      cycleId: cycle.id,
      status: cycle.status,
    });
  }

  return {
    outcome: "EXISTING_OPEN" as const,
    cycle: safeDirectOpenSummary(cycle),
  };
}

export async function readHeadteacherFeedbackDirectOpenTargets(input: {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  database?: HeadteacherFeedbackDirectOpenTargetDatabase;
}): Promise<HeadteacherFeedbackDirectOpenTargets> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (actorRole !== "DISTRICT_DIRECTOR" && actorRole !== "SUPERADMIN") {
    fail("HEADTEACHER_FEEDBACK_OPENER_ROLE_FORBIDDEN", 403, { actorRole });
  }

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean).filter(Boolean)),
  ].sort();

  if (!input.governanceScope.isSuperAdmin && tenantIds.length === 0) {
    return {
      actorRole,
      circuits: [],
      targets: [],
      readOnly: true,
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      providerCalled: false,
    };
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackDirectOpenTargetDatabase);

  const memberships = await database.membership.findMany({
    where: {
      ...(input.governanceScope.isSuperAdmin
        ? {}
        : { tenantId: { in: tenantIds } }),
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

  const targets: HeadteacherFeedbackDirectOpenTarget[] = [];
  const seen = new Set<string>();

  for (const membership of memberships) {
    if (membership.userId === actorUserId) continue;

    const target = assertActiveHeadteacherFeedbackTarget({
      target: {
        membershipId: membership.id,
        userId: membership.userId,
        tenantId: membership.tenantId,
        membershipStatus: membership.status,
        roleName: membership.role.name,
        tenantStatus: membership.tenant.status,
      },
      expectedUserId: membership.userId,
      expectedTenantId: membership.tenantId,
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
      continue;
    }

    assertHeadteacherFeedbackDirectOpenAuthority({
      actorUserId,
      actorRoleName: actorRole,
      targetHeadteacherUserId: target.userId,
      targetTenantId: target.tenantId,
      governanceScope: input.governanceScope,
    });

    const dedupeKey = `${target.tenantId}:${target.userId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    targets.push({
      targetHeadteacherUserId: target.userId,
      targetHeadteacherName: displayName(membership.user),
      targetTenantId: target.tenantId,
      schoolName: membership.tenant.name,
      circuitId: circuit.id,
      circuitName: circuit.name,
      districtId: district.id,
      districtName: district.name,
    });
  }

  targets.sort((left, right) =>
    left.districtName.localeCompare(right.districtName) ||
    left.circuitName.localeCompare(right.circuitName) ||
    left.schoolName.localeCompare(right.schoolName) ||
    (left.targetHeadteacherName ?? "").localeCompare(
      right.targetHeadteacherName ?? "",
    ) ||
    left.targetHeadteacherUserId.localeCompare(
      right.targetHeadteacherUserId,
    ),
  );

  const circuitMap = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtId: string;
      districtName: string;
      schoolIds: Set<string>;
      targetCount: number;
    }
  >();

  for (const target of targets) {
    const current = circuitMap.get(target.circuitId) ?? {
      circuitId: target.circuitId,
      circuitName: target.circuitName,
      districtId: target.districtId,
      districtName: target.districtName,
      schoolIds: new Set<string>(),
      targetCount: 0,
    };

    current.schoolIds.add(target.targetTenantId);
    current.targetCount += 1;
    circuitMap.set(target.circuitId, current);
  }

  const circuits = [...circuitMap.values()]
    .map((circuit) => ({
      circuitId: circuit.circuitId,
      circuitName: circuit.circuitName,
      districtId: circuit.districtId,
      districtName: circuit.districtName,
      schoolCount: circuit.schoolIds.size,
      targetCount: circuit.targetCount,
    }))
    .sort((left, right) =>
      left.districtName.localeCompare(right.districtName) ||
      left.circuitName.localeCompare(right.circuitName),
    );

  return {
    actorRole,
    circuits,
    targets,
    readOnly: true,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    providerCalled: false,
  };
}

export async function directOpenHeadteacherFeedbackCycle(
  input: DirectOpenHeadteacherFeedbackCycleInput,
): Promise<DirectOpenHeadteacherFeedbackCycleResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackDirectOpenDatabase);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const targetHeadteacherUserId = requireIdentifier(
    input.targetHeadteacherUserId,
    "targetHeadteacherUserId",
  );
  const targetTenantId = requireIdentifier(
    input.targetTenantId,
    "targetTenantId",
  );
  const directOpenKey = normalizeDirectOpenKey(input.directOpenKey);
  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_INVALID_DIRECT_OPEN_TIME", 400);
  }

  assertNoCallerSelectedRespondents(input.requestedRespondentUserIds);

  const authority = assertHeadteacherFeedbackDirectOpenAuthority({
    actorUserId,
    actorRoleName: input.actorRoleName,
    targetHeadteacherUserId,
    targetTenantId,
    governanceScope: input.governanceScope,
  });

  const idempotencyKey = directOpenIdempotencyKey({
    targetUserId: authority.targetHeadteacherUserId,
    targetTenantId: authority.targetTenantId,
    directOpenKey,
  });

  const existing = await findCycleByIdempotencyKey(database, idempotencyKey);
  if (existing) return existingDirectOpenResult(existing);

  const conflicting = await findActiveTargetCycle(database, {
    targetUserId: authority.targetHeadteacherUserId,
    targetTenantId: authority.targetTenantId,
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
            HeadteacherFeedbackDirectOpenDatabase,
            "appraisalCycle"
          >,
          idempotencyKey,
        );

        if (racedMatch) return existingDirectOpenResult(racedMatch);

        const racedConflict = await findActiveTargetCycle(
          tx as unknown as Pick<
            HeadteacherFeedbackDirectOpenDatabase,
            "appraisalCycle"
          >,
          {
            targetUserId: authority.targetHeadteacherUserId,
            targetTenantId: authority.targetTenantId,
          },
        );

        if (racedConflict) {
          fail("HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS", 409, {
            cycleId: racedConflict.id,
            status: racedConflict.status,
          });
        }

        const target = await resolveDirectOpenTarget(tx, {
          targetUserId: authority.targetHeadteacherUserId,
          targetTenantId: authority.targetTenantId,
        });

        if (
          !input.governanceScope.isSuperAdmin &&
          !input.governanceScope.tenantIds.includes(target.tenantId)
        ) {
          fail("HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE", 403, {
            targetTenantId: target.tenantId,
          });
        }

        const instrumentVersion = await resolvePublishedInstrument(tx);
        const openingNote = clean(input.openingNote).slice(0, 1000) || null;

        const draft = await tx.appraisalCycle.create({
          data: {
            instrumentVersionId: instrumentVersion.id,
            scopeZoneId: target.districtZoneId,
            targetUserId: target.userId,
            targetTenantId: target.tenantId,
            targetZoneId: target.circuitZoneId,
            targetGovernanceAssignmentId: null,
            status: "DRAFT",
            identityVisibility:
              HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue,
            idempotencyKey,
            responseWindowDays:
              HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
            minimumResponses:
              HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
            extensionCount: 0,
            requestReason: openingNote?.slice(0, 500) ?? null,
            targetNameSnapshot: target.displayName,
            targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
            targetSchoolNameSnapshot: target.schoolName,
            targetZoneNameSnapshot: target.circuitName,
            requestedByUserId: authority.actorUserId,
            requestedAt: now,
            metadata: {
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              openingMode: "DIRECT_OPEN",
              directOpenKey,
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
          select: directOpenCycleSelect,
        });

        assertHeadteacherFeedbackPendingCycleHasNoParticipants({
          status: draft.status as AppraisalCycleStatus,
          participantCount: draft._count.participants,
        });

        await tx.auditLog.create({
          data: {
            tenantId: target.tenantId,
            userId: authority.actorUserId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REQUESTED,
            resource: "AppraisalCycle",
            resourceId: draft.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REQUESTED,
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              openingMode: "DIRECT_OPEN",
              actorRole: authority.actorRole,
              cycleId: draft.id,
              priorStatus: null,
              nextStatus: "DRAFT",
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

        const opened =
          await openHeadteacherFeedbackCycleWithinTransaction({
            tx,
            cycle: draft as SharedOpenCycle,
            actorUserId: authority.actorUserId,
            actorRole: authority.actorRole as
              | "DISTRICT_DIRECTOR"
              | "SUPERADMIN",
            reqId,
            approvalNote: openingNote,
            ip: input.ip,
            userAgent: input.userAgent,
            now,
            openingMode: "DIRECT_OPEN",
          });

        return {
          outcome: "DIRECTLY_OPENED" as const,
          cycle: safeDirectOpenSummary(
            opened as unknown as DirectOpenCycleRecord,
          ),
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

    if (racedMatch) return existingDirectOpenResult(racedMatch);

    const racedConflict = await findActiveTargetCycle(database, {
      targetUserId: authority.targetHeadteacherUserId,
      targetTenantId: authority.targetTenantId,
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
