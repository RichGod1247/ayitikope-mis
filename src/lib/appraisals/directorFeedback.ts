//src\lib\appraisals\directorFeedback.ts
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { APPRAISAL_INSTRUMENT_CODES } from "@/lib/appraisals/instruments";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_POLICY = {
  workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK",
  instrumentCode:
    APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1,
  instrumentVersion: 1,
  responseWindowDays: 7,
  minimumMunicipalResponses: 5,
  preferredMunicipalResponses: 10,
  circuitDisclosureThreshold: 5,
  commentsAllowed: false,
  directorMayOpenOwnCycle: true,
  directorMayExtendOrReopen: false,
  superadminMayExtendOrReopen: true,
  identityAccessRole: "SUPERADMIN",
  identityVisibilityStorageValue: "AUTHORIZED_GOVERNANCE_ONLY",
  schoolIdentityVisibleToDirector: false,
  circuitIdentityVisibleToDirector: true,
  maskedRespondentsGeneratedAfterClosure: true,
} as const;

const ACTIVE_CYCLE_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED",
  "UNDER_REVIEW",
] as const;

export type DirectorFeedbackRequestMeta = {
  reqId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type OpenDirectorFeedbackCycleInput = DirectorFeedbackRequestMeta & {
  actorUserId: string;
  actorRoleName: unknown;
  targetDirectorUserId?: string | null;
  cycleKey: string;
  requestReason?: string | null;
  now?: Date;
  database?: DirectorFeedbackDatabase;
};

export type ExtendDirectorFeedbackCycleInput = DirectorFeedbackRequestMeta & {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  reason: string;
  additionalDays?: number;
  now?: Date;
  database?: DirectorFeedbackDatabase;
};

export type DirectorFeedbackMunicipalReleaseBand =
  | "BLOCKED"
  | "LIMITED"
  | "PREFERRED";

export type DirectorFeedbackCircuitDisclosure = {
  visible: boolean;
  exactResponseCount: number | null;
  maskedRespondentsVisible: boolean;
  individualFormsVisible: boolean;
};

export type DirectorFeedbackCycleSafeSummary = {
  id: string;
  status: string;
  targetRole: "DISTRICT_DIRECTOR";
  targetName: string | null;
  jurisdictionZoneId: string;
  jurisdictionName: string;
  openedAt: string | null;
  deadlineAt: string | null;
  responseWindowDays: number;
  minimumResponses: number;
  preferredResponses: number;
  circuitDisclosureThreshold: number;
  eligibleHeadteachers: number;
  eligibleCircuits: number;
  privacy: {
    identityAccessRole: "SUPERADMIN";
    schoolsVisibleToDirector: false;
    respondentIdentityVisibleToDirector: false;
    freeTextCommentsAllowed: false;
  };
};

export type OpenDirectorFeedbackCycleResult = {
  outcome: "CREATED" | "EXISTING_MATCH";
  cycle: DirectorFeedbackCycleSafeSummary;
};

export type ExtendDirectorFeedbackCycleResult = {
  outcome: "EXTENDED" | "REOPENED";
  cycleId: string;
  priorStatus: "OPEN" | "CLOSED";
  nextStatus: "OPEN";
  deadlineAt: string;
  extensionCount: number;
};

type DirectorAssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  revokedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  title: string | null;
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  zone: {
    id: string;
    name: string;
    countryCode: string;
    isActive: boolean;
    zoneType: {
      level: number;
      name: string;
      countryCode: string;
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

type HeadteacherMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  user: { id: string };
  tenant: {
    id: string;
    name: string;
    status: string;
    zone: {
      id: string;
      name: string;
      parentZoneId: string | null;
      isActive: boolean;
      zoneType: {
        level: number;
        countryCode: string;
      };
    } | null;
  };
};

type CycleSummaryRecord = {
  id: string;
  status: string;
  targetNameSnapshot: string | null;
  targetRoleSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  scopeZoneId: string;
  openedAt: Date | null;
  deadlineAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
  extensionCount: number;
  closedAt?: Date | null;
  closedByUserId?: string | null;
  metadata: unknown;
  _count: { participants: number };
  participants: Array<{
    eligibilitySnapshotJson: unknown;
  }>;
};

type CycleMutationRecord = {
  id: string;
  status: string;
  deadlineAt: Date | null;
  extensionCount: number;
};

type TransactionClient = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleSummaryRecord | null>;
    findFirst(args: unknown): Promise<CycleSummaryRecord | null>;
    create(args: unknown): Promise<CycleSummaryRecord>;
    update(args: unknown): Promise<CycleMutationRecord>;
  };
  appraisalParticipant: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type DirectorFeedbackDatabase = {
  governanceOfficerAssignment: {
    findFirst(args: unknown): Promise<DirectorAssignmentRecord | null>;
  };
  appraisalInstrumentVersion: {
    findFirst(args: unknown): Promise<InstrumentVersionRecord | null>;
  };
  membership: {
    findMany(args: unknown): Promise<HeadteacherMembershipRecord[]>;
  };
  appraisalCycle: TransactionClient["appraisalCycle"];
  $transaction<T>(
    operation: (tx: TransactionClient) => Promise<T>,
    options?: { isolationLevel?: string; maxWait?: number; timeout?: number },
  ): Promise<T>;
};

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCycleKey(value: unknown) {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(value)) {
    fail("DIRECTOR_FEEDBACK_INVALID_IDENTIFIER", 400, { fieldName });
  }
}

function addCalendarDays(value: Date, days: number) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function displayName(user: DirectorAssignmentRecord["user"]) {
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

function circuitSnapshot(
  value: unknown,
): { circuitZoneId: string; circuitName: string } | null {
  const snapshot = objectValue(value);
  const circuitZoneId = clean(snapshot.circuitZoneId);
  const circuitName = clean(snapshot.circuitName);
  if (!circuitZoneId || !circuitName) return null;
  return { circuitZoneId, circuitName };
}

function countCircuits(cycle: CycleSummaryRecord) {
  const ids = new Set<string>();
  for (const participant of cycle.participants) {
    const snapshot = circuitSnapshot(participant.eligibilitySnapshotJson);
    if (snapshot) ids.add(snapshot.circuitZoneId);
  }
  return ids.size;
}

function safeCycleSummary(cycle: CycleSummaryRecord): DirectorFeedbackCycleSafeSummary {
  return {
    id: cycle.id,
    status: cycle.status,
    targetRole: "DISTRICT_DIRECTOR",
    targetName: cycle.targetNameSnapshot,
    jurisdictionZoneId: cycle.scopeZoneId,
    jurisdictionName: cycle.targetZoneNameSnapshot ?? "District jurisdiction",
    openedAt: cycle.openedAt?.toISOString() ?? null,
    deadlineAt: cycle.deadlineAt?.toISOString() ?? null,
    responseWindowDays: cycle.responseWindowDays,
    minimumResponses: cycle.minimumResponses,
    preferredResponses: DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses,
    circuitDisclosureThreshold:
      DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
    eligibleHeadteachers: cycle._count.participants,
    eligibleCircuits: countCircuits(cycle),
    privacy: {
      identityAccessRole: "SUPERADMIN",
      schoolsVisibleToDirector: false,
      respondentIdentityVisibleToDirector: false,
      freeTextCommentsAllowed: false,
    },
  };
}

export function directorFeedbackMunicipalReleaseBand(
  finalizedResponses: number,
): DirectorFeedbackMunicipalReleaseBand {
  if (finalizedResponses < DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses) {
    return "BLOCKED";
  }
  if (finalizedResponses < DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses) {
    return "LIMITED";
  }
  return "PREFERRED";
}

export function directorFeedbackCircuitDisclosure(
  finalizedResponses: number,
): DirectorFeedbackCircuitDisclosure {
  const visible =
    finalizedResponses >= DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold;
  return {
    visible,
    exactResponseCount: visible ? finalizedResponses : null,
    maskedRespondentsVisible: visible,
    individualFormsVisible: visible,
  };
}

async function resolveDirectorAssignment(
  database: DirectorFeedbackDatabase,
  targetUserId: string,
  now: Date,
) {
  const assignment = await database.governanceOfficerAssignment.findFirst({
    where: {
      userId: targetUserId,
      role: "DISTRICT_DIRECTOR",
      status: "ACTIVE",
      revokedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      revokedAt: true,
      startsAt: true,
      endsAt: true,
      title: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      zone: {
        select: {
          id: true,
          name: true,
          countryCode: true,
          isActive: true,
          zoneType: {
            select: { level: true, name: true, countryCode: true },
          },
        },
      },
    },
  });

  if (
    !assignment ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !== 2
  ) {
    fail("DIRECTOR_FEEDBACK_ACTIVE_DISTRICT_DIRECTOR_NOT_FOUND", 404, {
      targetUserId,
    });
  }

  return assignment;
}

async function resolvePublishedDirectorInstrument(
  database: DirectorFeedbackDatabase,
) {
  const version = await database.appraisalInstrumentVersion.findFirst({
    where: {
      version: DIRECTOR_FEEDBACK_POLICY.instrumentVersion,
      status: "ACTIVE",
      instrument: {
        code: DIRECTOR_FEEDBACK_POLICY.instrumentCode,
        isActive: true,
      },
    },
    select: {
      id: true,
      version: true,
      status: true,
      instrument: { select: { id: true, code: true, isActive: true } },
    },
  });

  if (!version) {
    fail("DIRECTOR_FEEDBACK_PUBLISHED_INSTRUMENT_NOT_FOUND", 409);
  }

  return version;
}

async function resolveEligibleHeadteachers(
  database: DirectorFeedbackDatabase,
  districtZoneId: string,
  countryCode: string,
  targetDirectorUserId: string,
) {
  const rows = await database.membership.findMany({
    where: {
      status: "ACTIVE",
      userId: { not: targetDirectorUserId },
      role: { name: "HEADTEACHER" },
      tenant: {
        status: "ACTIVE",
        zone: {
          isActive: true,
          parentZoneId: districtZoneId,
          zoneType: { level: 1, countryCode },
        },
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: { select: { name: true } },
      user: { select: { id: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
          zone: {
            select: {
              id: true,
              name: true,
              parentZoneId: true,
              isActive: true,
              zoneType: { select: { level: true, countryCode: true } },
            },
          },
        },
      },
    },
    orderBy: [{ tenant: { name: "asc" } }, { userId: "asc" }],
  });

  const validRows = rows.filter(
    (row) =>
      row.status === "ACTIVE" &&
      row.role.name === "HEADTEACHER" &&
      row.tenant.status === "ACTIVE" &&
      row.tenant.zone?.isActive === true &&
      row.tenant.zone.parentZoneId === districtZoneId &&
      row.tenant.zone.zoneType.level === 1,
  );

  const byUser = new Map<string, HeadteacherMembershipRecord[]>();
  for (const row of validRows) {
    const current = byUser.get(row.userId) ?? [];
    current.push(row);
    byUser.set(row.userId, current);
  }

  const duplicates = [...byUser.entries()]
    .filter(([, memberships]) => memberships.length > 1)
    .map(([userId, memberships]) => ({
      userId,
      tenantIds: memberships.map((row) => row.tenantId),
    }));

  if (duplicates.length) {
    fail("DIRECTOR_FEEDBACK_DUPLICATE_HEADTEACHER_ASSIGNMENT", 409, {
      duplicates,
    });
  }

  if (!validRows.length) {
    fail("DIRECTOR_FEEDBACK_NO_ELIGIBLE_HEADTEACHERS", 409, {
      districtZoneId,
    });
  }

  return validRows;
}

function participantCreateRows(
  memberships: readonly HeadteacherMembershipRecord[],
  districtZoneId: string,
) {
  return memberships.map((membership) => {
    const zone = membership.tenant.zone;
    if (!zone) fail("DIRECTOR_FEEDBACK_HEADTEACHER_CIRCUIT_MISSING", 409);

    return {
      respondentUserId: membership.userId,
      respondentTenantId: membership.tenantId,
      status: "NOT_STARTED",
      respondentRoleSnapshot: "HEADTEACHER",
      eligibilitySnapshotJson: {
        membershipId: membership.id,
        tenantId: membership.tenantId,
        tenantName: membership.tenant.name,
        circuitZoneId: zone.id,
        circuitName: zone.name,
        districtZoneId,
        selectionBasis: "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
      },
      metadata: {
        identityPolicy: "SUPERADMIN_ONLY",
        directorFacingSchoolIdentity: "HIDDEN",
      },
    };
  });
}

async function findExistingCycle(
  database: Pick<DirectorFeedbackDatabase, "appraisalCycle">,
  idempotencyKey: string,
) {
  return database.appraisalCycle.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      status: true,
      targetNameSnapshot: true,
      targetRoleSnapshot: true,
      targetZoneNameSnapshot: true,
      scopeZoneId: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      extensionCount: true,
      closedAt: true,
      closedByUserId: true,
      metadata: true,
      _count: { select: { participants: true } },
      participants: {
        select: { eligibilitySnapshotJson: true },
      },
    },
  });
}

export async function openDirectorFeedbackCycle(
  input: OpenDirectorFeedbackCycleInput,
): Promise<OpenDirectorFeedbackCycleResult> {
  const database = input.database ?? (prisma as unknown as DirectorFeedbackDatabase);
  const actorUserId = clean(input.actorUserId);
  const reqId = clean(input.reqId) || randomUUID();
  const actorRole = effectiveRole(input.actorRoleName);
  const now = input.now ? new Date(input.now) : new Date();
  const cycleKey = normalizeCycleKey(input.cycleKey);

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(reqId, "reqId");
  if (cycleKey.length < 3) fail("DIRECTOR_FEEDBACK_CYCLE_KEY_REQUIRED", 400);

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "OPEN_DIRECTOR_FEEDBACK_CYCLE",
  );

  const requestedTarget = clean(input.targetDirectorUserId);
  const targetUserId = actorRole === "DISTRICT_DIRECTOR" ? actorUserId : requestedTarget;

  if (!targetUserId) {
    fail("DIRECTOR_FEEDBACK_TARGET_DIRECTOR_REQUIRED", 400);
  }
  assertIdentifier(targetUserId, "targetDirectorUserId");

  if (
    actorRole === "DISTRICT_DIRECTOR" &&
    requestedTarget &&
    requestedTarget !== actorUserId
  ) {
    fail("DIRECTOR_FEEDBACK_DIRECTOR_MAY_ONLY_OPEN_OWN_CYCLE", 403);
  }

  const [assignment, instrumentVersion] = await Promise.all([
    resolveDirectorAssignment(database, targetUserId, now),
    resolvePublishedDirectorInstrument(database),
  ]);

  const memberships = await resolveEligibleHeadteachers(
    database,
    assignment.zone.id,
    assignment.zone.countryCode,
    targetUserId,
  );

  const idempotencyKey = [
    "director-feedback",
    assignment.zone.id,
    targetUserId,
    cycleKey,
  ].join(":");

  const existing = await findExistingCycle(database, idempotencyKey);
  if (existing) {
    return { outcome: "EXISTING_MATCH", cycle: safeCycleSummary(existing) };
  }

  const conflicting = await database.appraisalCycle.findFirst({
    where: {
      scopeZoneId: assignment.zone.id,
      targetUserId,
      instrumentVersionId: instrumentVersion.id,
      status: { in: [...ACTIVE_CYCLE_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      targetNameSnapshot: true,
      targetRoleSnapshot: true,
      targetZoneNameSnapshot: true,
      scopeZoneId: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      extensionCount: true,
      closedAt: true,
      closedByUserId: true,
      metadata: true,
      _count: { select: { participants: true } },
      participants: { select: { eligibilitySnapshotJson: true } },
    },
  });

  if (conflicting) {
    fail("DIRECTOR_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS", 409, {
      cycleId: conflicting.id,
      status: conflicting.status,
    });
  }

  const deadlineAt = addCalendarDays(
    now,
    DIRECTOR_FEEDBACK_POLICY.responseWindowDays,
  );
  const participants = participantCreateRows(memberships, assignment.zone.id);

  try {
    return await database.$transaction(
      async (tx) => {
        const raced = await findExistingCycle(
          tx as unknown as Pick<DirectorFeedbackDatabase, "appraisalCycle">,
          idempotencyKey,
        );
        if (raced) {
          return {
            outcome: "EXISTING_MATCH" as const,
            cycle: safeCycleSummary(raced),
          };
        }

        const cycle = await tx.appraisalCycle.create({
          data: {
            instrumentVersionId: instrumentVersion.id,
            scopeZoneId: assignment.zone.id,
            targetUserId,
            targetTenantId: null,
            targetZoneId: assignment.zone.id,
            targetGovernanceAssignmentId: assignment.id,
            status: "OPEN",
            identityVisibility:
              DIRECTOR_FEEDBACK_POLICY.identityVisibilityStorageValue,
            idempotencyKey,
            responseWindowDays: DIRECTOR_FEEDBACK_POLICY.responseWindowDays,
            minimumResponses:
              DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses,
            extensionCount: 0,
            requestReason: clean(input.requestReason) || null,
            targetNameSnapshot: displayName(assignment.user),
            targetRoleSnapshot: "DISTRICT_DIRECTOR",
            targetZoneNameSnapshot: assignment.zone.name,
            requestedByUserId: actorUserId,
            openedByUserId: actorUserId,
            requestedAt: now,
            openedAt: now,
            deadlineAt,
            metadata: {
              workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
              cycleKey,
              preferredMunicipalResponses:
                DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses,
              circuitDisclosureThreshold:
                DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
              commentsAllowed: false,
              identityAccessRole: "SUPERADMIN",
              directorMayExtendOrReopen: false,
              participantSelection: "FROZEN_AT_OPEN",
              openedByRole: actorRole,
            },
            participants: { create: participants },
          },
          select: {
            id: true,
            status: true,
            targetNameSnapshot: true,
            targetRoleSnapshot: true,
            targetZoneNameSnapshot: true,
            scopeZoneId: true,
            openedAt: true,
            deadlineAt: true,
            responseWindowDays: true,
            minimumResponses: true,
            extensionCount: true,
            closedAt: true,
            closedByUserId: true,
            metadata: true,
            _count: { select: { participants: true } },
            participants: { select: { eligibilitySnapshotJson: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_OPENED,
            resource: "AppraisalCycle",
            resourceId: cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.CYCLE_OPENED,
              actorRole,
              cycleId: cycle.id,
              instrumentCode: DIRECTOR_FEEDBACK_POLICY.instrumentCode,
              instrumentVersion: DIRECTOR_FEEDBACK_POLICY.instrumentVersion,
              targetUserId,
              targetZoneId: assignment.zone.id,
              nextStatus: "OPEN",
              deadlineAt: deadlineAt.toISOString(),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: APPRAISAL_AUDIT_ACTIONS.PARTICIPANTS_RESOLVED,
            resource: "AppraisalCycle",
            resourceId: cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              action: APPRAISAL_AUDIT_ACTIONS.PARTICIPANTS_RESOLVED,
              actorRole,
              cycleId: cycle.id,
              targetUserId,
              targetZoneId: assignment.zone.id,
              eligibleHeadteachers: participants.length,
              eligibleCircuits: countCircuits(cycle),
              selectionBasis: "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
            },
          },
        });

        return { outcome: "CREATED" as const, cycle: safeCycleSummary(cycle) };
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    const raced = await findExistingCycle(database, idempotencyKey);
    if (raced) {
      return { outcome: "EXISTING_MATCH", cycle: safeCycleSummary(raced) };
    }
    throw error;
  }
}

export async function extendOrReopenDirectorFeedbackCycle(
  input: ExtendDirectorFeedbackCycleInput,
): Promise<ExtendDirectorFeedbackCycleResult> {
  const database = input.database ?? (prisma as unknown as DirectorFeedbackDatabase);
  const actorUserId = clean(input.actorUserId);
  const actorRole = effectiveRole(input.actorRoleName);
  const reqId = clean(input.reqId) || randomUUID();
  const cycleId = clean(input.cycleId);
  const reason = clean(input.reason);
  const now = input.now ? new Date(input.now) : new Date();
  const additionalDays = input.additionalDays ?? DIRECTOR_FEEDBACK_POLICY.responseWindowDays;

  assertIdentifier(actorUserId, "actorUserId");
  assertIdentifier(reqId, "reqId");
  if (!/^[0-9a-f-]{20,60}$/i.test(cycleId)) {
    fail("DIRECTOR_FEEDBACK_INVALID_CYCLE_ID", 400);
  }
  if (reason.length < 10) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_REASON_REQUIRED", 400);
  }
  if (!Number.isInteger(additionalDays) || additionalDays < 1 || additionalDays > 30) {
    fail("DIRECTOR_FEEDBACK_INVALID_EXTENSION_DAYS", 400);
  }

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "EXTEND_DIRECTOR_FEEDBACK_CYCLE",
  );

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      status: true,
      targetNameSnapshot: true,
      targetRoleSnapshot: true,
      targetZoneNameSnapshot: true,
      scopeZoneId: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      extensionCount: true,
      closedAt: true,
      closedByUserId: true,
      metadata: true,
      _count: { select: { participants: true } },
      participants: { select: { eligibilitySnapshotJson: true } },
    },
  });

  if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
  if (cycle.status !== "OPEN" && cycle.status !== "CLOSED") {
    fail("DIRECTOR_FEEDBACK_CYCLE_NOT_EXTENDABLE", 409, {
      status: cycle.status,
    });
  }

  const priorStatus = cycle.status as "OPEN" | "CLOSED";
  // CLOSED -> OPEN is deliberately not added to the global workflow map.
  // It remains a Director-feedback-only Superadmin exception, with reason,
  // prior closure evidence, and an audit record preserved below.

  const base =
    cycle.deadlineAt && cycle.deadlineAt.getTime() > now.getTime()
      ? cycle.deadlineAt
      : now;
  const deadlineAt = addCalendarDays(base, additionalDays);
  const priorMetadata = objectValue(cycle.metadata);
  const extensionCount = cycle.extensionCount + 1;

  const updated = await database.$transaction(
    async (tx) => {
      const result = await tx.appraisalCycle.update({
        where: { id: cycle.id },
        data: {
          status: "OPEN",
          deadlineAt,
          extensionCount: { increment: 1 },
          lastExtensionReason: reason,
          lastExtendedByUserId: actorUserId,
          lastExtendedAt: now,
          ...(priorStatus === "CLOSED"
            ? { closedAt: null, closedByUserId: null }
            : {}),
          metadata: {
            ...priorMetadata,
            lastControlledExtension: {
              priorStatus,
              reopened: priorStatus === "CLOSED",
              reason,
              additionalDays,
              actorRole,
              occurredAt: now.toISOString(),
              priorClosedAt: cycle.closedAt?.toISOString() ?? null,
              priorClosedByUserId: cycle.closedByUserId ?? null,
            },
          },
        },
        select: {
          id: true,
          status: true,
          deadlineAt: true,
          extensionCount: true,
        },
      });

      let restoredNotStarted = 0;
      let restoredInProgress = 0;

      if (priorStatus === "CLOSED") {
        const notStarted = await tx.appraisalParticipant.updateMany({
          where: {
            cycleId: cycle.id,
            status: "EXPIRED",
            startedAt: null,
            finalizedAt: null,
          },
          data: {
            status: "NOT_STARTED",
            expiredAt: null,
          },
        });

        const inProgress = await tx.appraisalParticipant.updateMany({
          where: {
            cycleId: cycle.id,
            status: "EXPIRED",
            startedAt: { not: null },
            finalizedAt: null,
          },
          data: {
            status: "IN_PROGRESS",
            expiredAt: null,
          },
        });

        restoredNotStarted = notStarted.count;
        restoredInProgress = inProgress.count;
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.CYCLE_EXTENDED,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_EXTENDED,
            actorRole,
            cycleId: cycle.id,
            reason,
            priorStatus,
            nextStatus: "OPEN",
            additionalDays,
            extensionCount,
            deadlineAt: deadlineAt.toISOString(),
            controlledReopen: priorStatus === "CLOSED",
            restoredNotStartedParticipants: restoredNotStarted,
            restoredInProgressParticipants: restoredInProgress,
          },
        },
      });

      return result;
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  );

  if (!updated.deadlineAt) {
    fail("DIRECTOR_FEEDBACK_EXTENSION_DEADLINE_MISSING", 500);
  }

  return {
    outcome: priorStatus === "CLOSED" ? "REOPENED" : "EXTENDED",
    cycleId: updated.id,
    priorStatus,
    nextStatus: "OPEN",
    deadlineAt: updated.deadlineAt.toISOString(),
    extensionCount: updated.extensionCount,
  };
}
