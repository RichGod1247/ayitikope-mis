import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES,
  HEADTEACHER_FEEDBACK_POLICY,
  resolveEligibleHeadteacherFeedbackTeachers,
  type HeadteacherFeedbackGovernanceScope,
  type HeadteacherFeedbackTeacherCandidate,
} from "@/lib/appraisals/headteacherFeedback";
import {
  readHeadteacherFeedbackDirectOpenTargets,
  type HeadteacherFeedbackDirectOpenTarget,
} from "@/lib/appraisals/headteacherFeedbackDirectOpen";
import {
  HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY,
  directOpenHeadteacherFeedbackCycleWithNotifications,
  ensureHeadteacherFeedbackCycleNotifications,
  type HeadteacherFeedbackNotificationDatabase,
  type HeadteacherFeedbackOpenedWithNotificationsResult,
} from "@/lib/appraisals/headteacherFeedbackNotifications";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY = {
  schemaVersion: 1,
  audience: "DISTRICT_DIRECTOR",
  scopeLevels: ["DISTRICT", "CIRCUIT", "SCHOOL"] as const,
  multipleCircuitsAllowed: true,
  multipleSchoolsAllowed: true,
  maximumSelectedScopeIds: 100,
  previewReadOnly: true,
  previewReturnsRespondentCountsOnly: true,
  respondentIdentitiesReturned: false,
  individualStaffResponsesReturned: false,
  browserSelectedRespondentsAllowed: false,
  browserSelectedHeadteacherIdsAllowed: false,
  browserSelectedScopeIdsAllowed: true,
  participantSelection: HEADTEACHER_FEEDBACK_POLICY.participantSelection,
  participantFreezeStatus: HEADTEACHER_FEEDBACK_POLICY.participantFreezeStatus,
  responseWindowDays: HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
  partialSuccessAllowed: true,
  oneTargetTransactionAtATime: true,
  sharedOpenedAtAcrossNewCycles: true,
  boundedConcurrency: 3,
  notificationChannels: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.channels,
  notificationRecipientsDerivedFromLockedScope: true,
  existingOpenNotificationRepairAllowed: true,
  providerCallsAllowed: false,
} as const;

export type HeadteacherFeedbackBulkScopeLevel =
  (typeof HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.scopeLevels)[number];

export type HeadteacherFeedbackBulkScope = {
  level: HeadteacherFeedbackBulkScopeLevel;
  ids?: readonly string[] | null;
};

export type HeadteacherFeedbackBulkPreviewDisposition =
  | "OPEN_NEW"
  | "KEEP_EXISTING"
  | "SKIP";

export type HeadteacherFeedbackBulkPreviewRow = {
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  eligibleRespondentCount: number;
  disposition: HeadteacherFeedbackBulkPreviewDisposition;
  reason:
    | "NO_ACTIVE_CYCLE"
    | "ACTIVE_CYCLE_EXISTS"
    | "CLOSED_OR_UNDER_REVIEW"
    | "NO_ELIGIBLE_TEACHERS"
    | "AMBIGUOUS_HEADTEACHER_MEMBERSHIP"
    | "ELIGIBILITY_DATA_INVALID";
  existingCycleId: string | null;
  existingCycleStatus: string | null;
};

export type HeadteacherFeedbackBulkPreview = {
  actorRole: "DISTRICT_DIRECTOR";
  scope: {
    level: HeadteacherFeedbackBulkScopeLevel;
    ids: string[];
  };
  summary: {
    schools: number;
    headteachers: number;
    eligibleRespondents: number;
    willOpen: number;
    keepExisting: number;
    willSkip: number;
  };
  rows: HeadteacherFeedbackBulkPreviewRow[];
  readOnly: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  notificationChannels: readonly ["IN_APP", "SMS", "EMAIL"];
  notificationRecipientsDerivedFromLockedScope: true;
  providerCalled: false;
};

export type HeadteacherFeedbackBulkOpenTargetResult = {
  targetHeadteacherUserId: string;
  targetHeadteacherName: string | null;
  targetTenantId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  outcome:
    | "DIRECTLY_OPENED"
    | "EXISTING_OPEN"
    | "KEPT_EXISTING"
    | "SKIPPED"
    | "RETRY_REQUIRED";
  reason: string | null;
  cycleId: string | null;
  cycleStatus: string | null;
  participantCount: number;
  notificationsSeeded: boolean;
  notificationRecipientCount: number;
  notificationChannels: readonly ["IN_APP", "SMS", "EMAIL"];
};

export type HeadteacherFeedbackBulkOpenResult = {
  actorRole: "DISTRICT_DIRECTOR";
  bulkOpenKey: string;
  scope: {
    level: HeadteacherFeedbackBulkScopeLevel;
    ids: string[];
  };
  openedAt: string;
  responseWindowDays: number;
  summary: {
    selectedTargets: number;
    directlyOpened: number;
    existingOpen: number;
    keptExisting: number;
    skipped: number;
    retryRequired: number;
    participantCount: number;
    notificationRecipientCount: number;
  };
  results: HeadteacherFeedbackBulkOpenTargetResult[];
  partialSuccess: boolean;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
  notificationChannels: readonly ["IN_APP", "SMS", "EMAIL"];
  notificationRecipientsDerivedFromLockedScope: true;
  providerCalled: false;
};

type BulkCycleRecord = {
  id: string;
  targetUserId: string;
  targetTenantId: string | null;
  status: string;
  requestedAt: Date;
  openedAt: Date | null;
  deadlineAt: Date | null;
  _count: { participants: number };
};

type BulkTeacherMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
};

export type HeadteacherFeedbackBulkOpenDatabase = {
  membership: {
    findMany(args: unknown): Promise<BulkTeacherMembershipRecord[]>;
  };
  appraisalCycle: {
    findMany(args: unknown): Promise<BulkCycleRecord[]>;
  };
};

type BulkDependencies = {
  readTargets: typeof readHeadteacherFeedbackDirectOpenTargets;
  directOpenWithNotifications: typeof directOpenHeadteacherFeedbackCycleWithNotifications;
  ensureNotifications: typeof ensureHeadteacherFeedbackCycleNotifications;
};

export type PreviewHeadteacherFeedbackBulkOpenInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  scope: HeadteacherFeedbackBulkScope;
  database?: HeadteacherFeedbackBulkOpenDatabase;
  dependencies?: Pick<BulkDependencies, "readTargets">;
};

export type BulkOpenHeadteacherFeedbackCyclesInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  scope: HeadteacherFeedbackBulkScope;
  bulkOpenKey: string;
  confirm: boolean;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherFeedbackBulkOpenDatabase;
  notificationDatabase?: HeadteacherFeedbackNotificationDatabase;
  dependencies?: BulkDependencies;
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
    fail("HEADTEACHER_FEEDBACK_BULK_INVALID_IDENTIFIER", 400, { fieldName });
  }
  return id;
}

function normalizeBulkOpenKey(value: unknown) {
  const key = clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  if (key.length < 8) {
    fail("HEADTEACHER_FEEDBACK_BULK_OPEN_KEY_INVALID", 400);
  }
  return key;
}

function normalizeScope(scope: HeadteacherFeedbackBulkScope) {
  const level = clean(scope?.level).toUpperCase() as HeadteacherFeedbackBulkScopeLevel;
  if (!HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.scopeLevels.includes(level)) {
    fail("HEADTEACHER_FEEDBACK_BULK_SCOPE_INVALID", 400, {
      fieldName: "scopeType",
    });
  }

  const sourceIds = Array.isArray(scope?.ids) ? scope.ids : [];
  const ids = [...new Set(sourceIds.map(clean).filter(Boolean))].map((id) =>
    requireIdentifier(id, "scopeIds"),
  );

  if (ids.length > HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.maximumSelectedScopeIds) {
    fail("HEADTEACHER_FEEDBACK_BULK_SCOPE_TOO_LARGE", 400, {
      fieldName: "scopeIds",
    });
  }

  if (level === "DISTRICT" && ids.length > 1) {
    fail("HEADTEACHER_FEEDBACK_BULK_DISTRICT_SCOPE_AMBIGUOUS", 400, {
      fieldName: "scopeIds",
    });
  }

  if (level !== "DISTRICT" && ids.length === 0) {
    fail("HEADTEACHER_FEEDBACK_BULK_SCOPE_IDS_REQUIRED", 400, {
      fieldName: "scopeIds",
    });
  }

  return { level, ids };
}

function assertDirector(actorRoleName: unknown): "DISTRICT_DIRECTOR" {
  const actorRole = effectiveRole(actorRoleName);
  if (actorRole !== "DISTRICT_DIRECTOR") {
    fail("HEADTEACHER_FEEDBACK_BULK_ROLE_FORBIDDEN", 403, { actorRole });
  }
  return "DISTRICT_DIRECTOR";
}

function targetInScope(
  target: HeadteacherFeedbackDirectOpenTarget,
  scope: ReturnType<typeof normalizeScope>,
) {
  if (scope.level === "DISTRICT") {
    return scope.ids.length === 0 || target.districtId === scope.ids[0];
  }
  if (scope.level === "CIRCUIT") return scope.ids.includes(target.circuitId);
  return scope.ids.includes(target.targetTenantId);
}

function assertSelectedScopeIdsResolved(input: {
  scope: ReturnType<typeof normalizeScope>;
  discovery: Awaited<ReturnType<typeof readHeadteacherFeedbackDirectOpenTargets>>;
}) {
  if (input.scope.level === "DISTRICT") {
    if (input.scope.ids.length === 0) return;
    const districtIds = new Set(input.discovery.targets.map((target) => target.districtId));
    if (!districtIds.has(input.scope.ids[0])) {
      fail("HEADTEACHER_FEEDBACK_BULK_SCOPE_NOT_AUTHORIZED", 403, {
        fieldName: "scopeIds",
      });
    }
    return;
  }

  const available = new Set(
    input.scope.level === "CIRCUIT"
      ? input.discovery.targets.map((target) => target.circuitId)
      : input.discovery.targets.map((target) => target.targetTenantId),
  );
  const unresolved = input.scope.ids.filter((id) => !available.has(id));
  if (unresolved.length > 0) {
    fail("HEADTEACHER_FEEDBACK_BULK_SCOPE_NOT_AUTHORIZED", 403, {
      fieldName: "scopeIds",
    });
  }
}

function candidateFromMembership(
  row: BulkTeacherMembershipRecord,
): HeadteacherFeedbackTeacherCandidate {
  return {
    membershipId: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    membershipStatus: row.status,
    roleName: row.role.name,
    tenantStatus: row.tenant.status,
  };
}

function errorCode(error: unknown) {
  return clean((error as { code?: unknown; message?: unknown })?.code) ||
    clean((error as { message?: unknown })?.message) ||
    "UNKNOWN_ERROR";
}

function previewReasonForEligibility(error: unknown) {
  const code = errorCode(error);
  if (code === "HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS") {
    return "NO_ELIGIBLE_TEACHERS" as const;
  }
  return "ELIGIBILITY_DATA_INVALID" as const;
}

function latestCycleForTarget(
  cycles: readonly BulkCycleRecord[],
  target: HeadteacherFeedbackDirectOpenTarget,
) {
  return cycles
    .filter(
      (cycle) =>
        cycle.targetUserId === target.targetHeadteacherUserId &&
        cycle.targetTenantId === target.targetTenantId,
    )
    .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())[0] ?? null;
}

function classifyExistingCycle(cycle: BulkCycleRecord | null) {
  if (!cycle) {
    return {
      disposition: "OPEN_NEW" as const,
      reason: "NO_ACTIVE_CYCLE" as const,
    };
  }

  const status = clean(cycle.status).toUpperCase();
  if (status === "CLOSED" || status === "UNDER_REVIEW") {
    return {
      disposition: "KEEP_EXISTING" as const,
      reason: "CLOSED_OR_UNDER_REVIEW" as const,
    };
  }

  return {
    disposition: "KEEP_EXISTING" as const,
    reason: "ACTIVE_CYCLE_EXISTS" as const,
  };
}

async function loadPreviewEvidence(input: {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: HeadteacherFeedbackGovernanceScope;
  scope: ReturnType<typeof normalizeScope>;
  database: HeadteacherFeedbackBulkOpenDatabase;
  readTargets: typeof readHeadteacherFeedbackDirectOpenTargets;
}) {
  const discovery = await input.readTargets({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    governanceScope: input.governanceScope,
    database: input.database as unknown as Parameters<
      typeof readHeadteacherFeedbackDirectOpenTargets
    >[0]["database"],
  });

  assertSelectedScopeIdsResolved({ scope: input.scope, discovery });

  const targets = discovery.targets.filter((target) =>
    targetInScope(target, input.scope),
  );
  const tenantIds = [...new Set(targets.map((target) => target.targetTenantId))];

  const [teacherMemberships, cycles] = await Promise.all([
    tenantIds.length
      ? input.database.membership.findMany({
          where: {
            tenantId: { in: tenantIds },
            status: "ACTIVE",
            role: { name: { equals: "TEACHER", mode: "insensitive" } },
            tenant: { status: "ACTIVE" },
          },
          select: {
            id: true,
            userId: true,
            tenantId: true,
            status: true,
            role: { select: { name: true } },
            tenant: { select: { id: true, status: true } },
          },
        })
      : Promise.resolve([] as BulkTeacherMembershipRecord[]),
    tenantIds.length
      ? input.database.appraisalCycle.findMany({
          where: {
            targetTenantId: { in: tenantIds },
            targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
            instrumentVersion: {
              instrument: { code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode },
            },
            status: { in: [...ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES] },
          },
          select: {
            id: true,
            targetUserId: true,
            targetTenantId: true,
            status: true,
            requestedAt: true,
            openedAt: true,
            deadlineAt: true,
            _count: { select: { participants: true } },
          },
          orderBy: { requestedAt: "desc" },
        })
      : Promise.resolve([] as BulkCycleRecord[]),
  ]);

  return { targets, teacherMemberships, cycles };
}

export async function previewHeadteacherFeedbackBulkOpen(
  input: PreviewHeadteacherFeedbackBulkOpenInput,
): Promise<HeadteacherFeedbackBulkPreview> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = assertDirector(input.actorRoleName);
  const scope = normalizeScope(input.scope);
  const database =
    input.database ?? (prisma as unknown as HeadteacherFeedbackBulkOpenDatabase);
  const readTargets =
    input.dependencies?.readTargets ?? readHeadteacherFeedbackDirectOpenTargets;

  const { targets, teacherMemberships, cycles } = await loadPreviewEvidence({
    actorUserId,
    actorRoleName: actorRole,
    governanceScope: input.governanceScope,
    scope,
    database,
    readTargets,
  });

  const targetCountByTenant = new Map<string, number>();
  for (const target of targets) {
    targetCountByTenant.set(
      target.targetTenantId,
      (targetCountByTenant.get(target.targetTenantId) ?? 0) + 1,
    );
  }

  const rows: HeadteacherFeedbackBulkPreviewRow[] = targets.map((target) => {
    const ambiguous = (targetCountByTenant.get(target.targetTenantId) ?? 0) > 1;
    const latestCycle = latestCycleForTarget(cycles, target);
    const existing = classifyExistingCycle(latestCycle);

    let eligibleRespondentCount = 0;
    let disposition: HeadteacherFeedbackBulkPreviewDisposition = existing.disposition;
    let reason: HeadteacherFeedbackBulkPreviewRow["reason"] = existing.reason;

    if (ambiguous) {
      disposition = "SKIP";
      reason = "AMBIGUOUS_HEADTEACHER_MEMBERSHIP";
    } else {
      const candidates = teacherMemberships
        .filter((row) => row.tenantId === target.targetTenantId)
        .map(candidateFromMembership);

      try {
        const eligible = resolveEligibleHeadteacherFeedbackTeachers({
          targetHeadteacherUserId: target.targetHeadteacherUserId,
          targetTenantId: target.targetTenantId,
          candidates,
        });
        eligibleRespondentCount = eligible.length;
      } catch (error) {
        disposition = "SKIP";
        reason = previewReasonForEligibility(error);
      }
    }

    return {
      ...target,
      eligibleRespondentCount,
      disposition,
      reason,
      existingCycleId: latestCycle?.id ?? null,
      existingCycleStatus: latestCycle?.status ?? null,
    };
  });

  rows.sort((left, right) =>
    left.districtName.localeCompare(right.districtName) ||
    left.circuitName.localeCompare(right.circuitName) ||
    left.schoolName.localeCompare(right.schoolName) ||
    (left.targetHeadteacherName ?? "").localeCompare(
      right.targetHeadteacherName ?? "",
    ),
  );

  return {
    actorRole,
    scope,
    summary: {
      schools: new Set(rows.map((row) => row.targetTenantId)).size,
      headteachers: rows.length,
      eligibleRespondents: rows.reduce(
        (sum, row) => sum + row.eligibleRespondentCount,
        0,
      ),
      willOpen: rows.filter((row) => row.disposition === "OPEN_NEW").length,
      keepExisting: rows.filter((row) => row.disposition === "KEEP_EXISTING").length,
      willSkip: rows.filter((row) => row.disposition === "SKIP").length,
    },
    rows,
    readOnly: true,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    notificationChannels: ["IN_APP", "SMS", "EMAIL"],
    notificationRecipientsDerivedFromLockedScope: true,
    providerCalled: false,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function run() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(values.length, 1)) },
      () => run(),
    ),
  );
  return results;
}

function directOpenOutcome(
  opened: HeadteacherFeedbackOpenedWithNotificationsResult,
): "DIRECTLY_OPENED" | "EXISTING_OPEN" {
  if (opened.outcome === "DIRECTLY_OPENED" || opened.outcome === "EXISTING_OPEN") {
    return opened.outcome;
  }
  fail("HEADTEACHER_FEEDBACK_BULK_UNEXPECTED_OPEN_OUTCOME", 409, {
    reason: opened.outcome,
  });
}

function resultFromOpened(
  row: HeadteacherFeedbackBulkPreviewRow,
  opened: HeadteacherFeedbackOpenedWithNotificationsResult,
): HeadteacherFeedbackBulkOpenTargetResult {
  return {
    targetHeadteacherUserId: row.targetHeadteacherUserId,
    targetHeadteacherName: row.targetHeadteacherName,
    targetTenantId: row.targetTenantId,
    schoolName: row.schoolName,
    circuitId: row.circuitId,
    circuitName: row.circuitName,
    districtId: row.districtId,
    districtName: row.districtName,
    outcome: directOpenOutcome(opened),
    reason: null,
    cycleId: opened.cycle.id,
    cycleStatus: opened.cycle.status,
    participantCount: opened.cycle.participantCount,
    notificationsSeeded: opened.cycle.notificationsSeeded,
    notificationRecipientCount: opened.notifications.summary.participantCount,
    notificationChannels: ["IN_APP", "SMS", "EMAIL"],
  };
}

export async function bulkOpenHeadteacherFeedbackCycles(
  input: BulkOpenHeadteacherFeedbackCyclesInput,
): Promise<HeadteacherFeedbackBulkOpenResult> {
  if (input.confirm !== true) {
    fail("HEADTEACHER_FEEDBACK_BULK_CONFIRMATION_REQUIRED", 400);
  }

  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorRole = assertDirector(input.actorRoleName);
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const scope = normalizeScope(input.scope);
  const bulkOpenKey = normalizeBulkOpenKey(input.bulkOpenKey);
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_BULK_INVALID_OPEN_TIME", 400);
  }

  const database =
    input.database ?? (prisma as unknown as HeadteacherFeedbackBulkOpenDatabase);
  const dependencies: BulkDependencies = input.dependencies ?? {
    readTargets: readHeadteacherFeedbackDirectOpenTargets,
    directOpenWithNotifications:
      directOpenHeadteacherFeedbackCycleWithNotifications,
    ensureNotifications: ensureHeadteacherFeedbackCycleNotifications,
  };

  const preview = await previewHeadteacherFeedbackBulkOpen({
    actorUserId,
    actorRoleName: actorRole,
    governanceScope: input.governanceScope,
    scope,
    database,
    dependencies: { readTargets: dependencies.readTargets },
  });

  const candidates = preview.rows.filter((row) => row.disposition !== "SKIP");
  const skippedRows = preview.rows
    .filter((row) => row.disposition === "SKIP")
    .map(
      (row): HeadteacherFeedbackBulkOpenTargetResult => ({
        targetHeadteacherUserId: row.targetHeadteacherUserId,
        targetHeadteacherName: row.targetHeadteacherName,
        targetTenantId: row.targetTenantId,
        schoolName: row.schoolName,
        circuitId: row.circuitId,
        circuitName: row.circuitName,
        districtId: row.districtId,
        districtName: row.districtName,
        outcome: "SKIPPED",
        reason: row.reason,
        cycleId: row.existingCycleId,
        cycleStatus: row.existingCycleStatus,
        participantCount: 0,
        notificationsSeeded: false,
        notificationRecipientCount: 0,
        notificationChannels: ["IN_APP", "SMS", "EMAIL"],
      }),
    );

  const attempted = await mapWithConcurrency(
    candidates,
    HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.boundedConcurrency,
    async (row): Promise<HeadteacherFeedbackBulkOpenTargetResult> => {
      try {
        if (row.disposition === "KEEP_EXISTING") {
          if (clean(row.existingCycleStatus).toUpperCase() !== "OPEN" || !row.existingCycleId) {
            return {
              targetHeadteacherUserId: row.targetHeadteacherUserId,
              targetHeadteacherName: row.targetHeadteacherName,
              targetTenantId: row.targetTenantId,
              schoolName: row.schoolName,
              circuitId: row.circuitId,
              circuitName: row.circuitName,
              districtId: row.districtId,
              districtName: row.districtName,
              outcome: "KEPT_EXISTING",
              reason: row.reason,
              cycleId: row.existingCycleId,
              cycleStatus: row.existingCycleStatus,
              participantCount: 0,
              notificationsSeeded: false,
              notificationRecipientCount: 0,
              notificationChannels: ["IN_APP", "SMS", "EMAIL"],
            };
          }

          const notifications = await dependencies.ensureNotifications({
            cycleId: row.existingCycleId,
            actorUserId,
            reqId,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            now,
            ...(input.notificationDatabase
              ? { database: input.notificationDatabase }
              : {}),
          });

          return {
            targetHeadteacherUserId: row.targetHeadteacherUserId,
            targetHeadteacherName: row.targetHeadteacherName,
            targetTenantId: row.targetTenantId,
            schoolName: row.schoolName,
            circuitId: row.circuitId,
            circuitName: row.circuitName,
            districtId: row.districtId,
            districtName: row.districtName,
            outcome: "EXISTING_OPEN",
            reason: row.reason,
            cycleId: row.existingCycleId,
            cycleStatus: "OPEN",
            participantCount: notifications.summary.participantCount,
            notificationsSeeded: true,
            notificationRecipientCount: notifications.summary.participantCount,
            notificationChannels: ["IN_APP", "SMS", "EMAIL"],
          };
        }

        const opened = await dependencies.directOpenWithNotifications({
          actorUserId,
          actorRoleName: actorRole,
          governanceScope: input.governanceScope,
          targetHeadteacherUserId: row.targetHeadteacherUserId,
          targetTenantId: row.targetTenantId,
          directOpenKey: bulkOpenKey,
          openingNote: null,
          requestedRespondentUserIds: undefined,
          reqId,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          now,
          ...(input.notificationDatabase
            ? { notificationDatabase: input.notificationDatabase }
            : {}),
        });
        return resultFromOpened(row, opened);
      } catch (error) {
        const code = errorCode(error);
        if (code === "HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS") {
          return {
            targetHeadteacherUserId: row.targetHeadteacherUserId,
            targetHeadteacherName: row.targetHeadteacherName,
            targetTenantId: row.targetTenantId,
            schoolName: row.schoolName,
            circuitId: row.circuitId,
            circuitName: row.circuitName,
            districtId: row.districtId,
            districtName: row.districtName,
            outcome: "KEPT_EXISTING",
            reason: row.reason,
            cycleId: row.existingCycleId,
            cycleStatus: row.existingCycleStatus,
            participantCount: 0,
            notificationsSeeded: false,
            notificationRecipientCount: 0,
            notificationChannels: ["IN_APP", "SMS", "EMAIL"],
          };
        }

        if (code === "HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS") {
          return {
            targetHeadteacherUserId: row.targetHeadteacherUserId,
            targetHeadteacherName: row.targetHeadteacherName,
            targetTenantId: row.targetTenantId,
            schoolName: row.schoolName,
            circuitId: row.circuitId,
            circuitName: row.circuitName,
            districtId: row.districtId,
            districtName: row.districtName,
            outcome: "SKIPPED",
            reason: "NO_ELIGIBLE_TEACHERS",
            cycleId: null,
            cycleStatus: null,
            participantCount: 0,
            notificationsSeeded: false,
            notificationRecipientCount: 0,
            notificationChannels: ["IN_APP", "SMS", "EMAIL"],
          };
        }

        return {
          targetHeadteacherUserId: row.targetHeadteacherUserId,
          targetHeadteacherName: row.targetHeadteacherName,
          targetTenantId: row.targetTenantId,
          schoolName: row.schoolName,
          circuitId: row.circuitId,
          circuitName: row.circuitName,
          districtId: row.districtId,
          districtName: row.districtName,
          outcome: "RETRY_REQUIRED",
          reason: code,
          cycleId: null,
          cycleStatus: null,
          participantCount: 0,
          notificationsSeeded: false,
          notificationRecipientCount: 0,
          notificationChannels: ["IN_APP", "SMS", "EMAIL"],
        };
      }
    },
  );

  const results = [...attempted, ...skippedRows].sort((left, right) =>
    left.districtName.localeCompare(right.districtName) ||
    left.circuitName.localeCompare(right.circuitName) ||
    left.schoolName.localeCompare(right.schoolName) ||
    (left.targetHeadteacherName ?? "").localeCompare(
      right.targetHeadteacherName ?? "",
    ),
  );

  const summary = {
    selectedTargets: preview.rows.length,
    directlyOpened: results.filter((row) => row.outcome === "DIRECTLY_OPENED")
      .length,
    existingOpen: results.filter((row) => row.outcome === "EXISTING_OPEN").length,
    keptExisting: results.filter((row) => row.outcome === "KEPT_EXISTING").length,
    skipped: results.filter((row) => row.outcome === "SKIPPED").length,
    retryRequired: results.filter((row) => row.outcome === "RETRY_REQUIRED").length,
    participantCount: results.reduce((sum, row) => sum + row.participantCount, 0),
    notificationRecipientCount: results.reduce(
      (sum, row) => sum + row.notificationRecipientCount,
      0,
    ),
  };

  return {
    actorRole,
    bulkOpenKey,
    scope,
    openedAt: now.toISOString(),
    responseWindowDays: HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
    summary,
    results,
    partialSuccess:
      summary.retryRequired > 0 || summary.skipped > 0 || summary.keptExisting > 0,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    notificationChannels: ["IN_APP", "SMS", "EMAIL"],
    notificationRecipientsDerivedFromLockedScope: true,
    providerCalled: false,
  };
}
