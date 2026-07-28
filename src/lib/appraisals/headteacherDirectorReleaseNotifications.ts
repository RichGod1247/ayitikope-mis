import { createHash, randomUUID } from "crypto";
import {
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";

export const HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY = {
  schemaVersion: 1,
  notificationType: AppraisalNotificationType.FEEDBACK_RELEASED,
  channels: [
    AppraisalNotificationChannel.IN_APP,
    AppraisalNotificationChannel.SMS,
    AppraisalNotificationChannel.EMAIL,
  ] as const,
  recipientRole: "HEADTEACHER",
  requiredCycleStatus: "RELEASED",
  requiredReleaseProofVersion: 1,
  releaseMetadataKey: "headteacherDirectorRelease",
  requiredNotificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
  inAppHref: "/headteacher/teacher-appraisal",
  smsTemplate: "headteacher-appraisal-feedback-released",
  maximumAttempts: 5,
  priority: 2,
  providerCallsAllowed: false,
  recipientIdentityReturned: false,
  contactDestinationsReturned: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  scoreValuesIncluded: false,
  releaseNoteIncluded: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

const RELEASE_NOTIFICATION_AUDIT_RESOURCE = "AppraisalCycle";

type ReleaseTargetProfile = {
  tenantId: string;
  phone: string;
};

type ReleasedCycleRecord = {
  id: string;
  status: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  releasedAt: Date | null;
  metadata: unknown;
  targetUser: {
    email: string;
    phone: string | null;
    phoneNorm: string | null;
    smsOptIn: boolean;
    teacherProfiles: ReleaseTargetProfile[];
  };
};

type ActiveTargetMembership = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
};

type NotificationSummaryRow = {
  channel: AppraisalNotificationChannel;
  status: AppraisalNotificationStatus;
};

type CountResult = { count: number };

type ReleasedCycleDelegate = {
  findUnique(args: unknown): Promise<ReleasedCycleRecord | null>;
};

type MembershipDelegate = {
  findFirst(args: unknown): Promise<ActiveTargetMembership | null>;
};

type ReleaseNotificationDelegate = {
  createMany(args: unknown): Promise<CountResult>;
  findMany(args: unknown): Promise<NotificationSummaryRow[]>;
};

type ReleaseAuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

export type HeadteacherDirectorReleaseNotificationTransactionClient = {
  appraisalNotification: ReleaseNotificationDelegate;
  auditLog: ReleaseAuditDelegate;
};

export type HeadteacherDirectorReleaseNotificationDatabase = {
  appraisalCycle: ReleasedCycleDelegate;
  membership: MembershipDelegate;
  appraisalNotification: ReleaseNotificationDelegate;
  $transaction<T>(
    operation: (
      tx: HeadteacherDirectorReleaseNotificationTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type HeadteacherDirectorReleaseNotificationChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

export type HeadteacherDirectorReleaseNotificationSummary = {
  recipientCount: 1;
  channels: {
    inApp: HeadteacherDirectorReleaseNotificationChannelSummary;
    sms: HeadteacherDirectorReleaseNotificationChannelSummary;
    email: HeadteacherDirectorReleaseNotificationChannelSummary;
  };
};

export type EnsureHeadteacherDirectorReleaseNotificationsInput = {
  cycleId: string;
  actorUserId: string;
  releaseProofHash: string;
  releasedAt: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherDirectorReleaseNotificationDatabase;
};

export type EnsureHeadteacherDirectorReleaseNotificationsResult = {
  outcome: "SEEDED" | "EXISTING_MATCH";
  cycleId: string;
  rowsInserted: number;
  summary: HeadteacherDirectorReleaseNotificationSummary;
  providerCalled: false;
  recipientIdentityReturned: false;
  contactDestinationsReturned: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
};

export class HeadteacherDirectorReleaseNotificationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherDirectorReleaseNotificationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

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
  throw new HeadteacherDirectorReleaseNotificationError(code, status, details);
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireSha256(value: unknown, fieldName: string) {
  const hash = clean(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_INVALID_HASH", 400, {
      fieldName,
    });
  }
  return hash;
}

function safeEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  if (!email || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function safePhone(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("233")) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function targetPhone(cycle: ReleasedCycleRecord) {
  const direct =
    safePhone(cycle.targetUser.phoneNorm) ?? safePhone(cycle.targetUser.phone);
  if (direct) return direct;

  const matchingProfile = cycle.targetUser.teacherProfiles.find(
    (profile) => profile.tenantId === cycle.targetTenantId,
  );

  return (
    safePhone(matchingProfile?.phone) ??
    safePhone(cycle.targetUser.teacherProfiles[0]?.phone)
  );
}

function idempotencyKey(input: {
  cycleId: string;
  recipientUserId: string;
  channel: AppraisalNotificationChannel;
  releaseProofHash: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        HEADTEACHER_FEEDBACK_POLICY.workflow,
        input.cycleId,
        input.recipientUserId,
        HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
        input.channel,
        input.releaseProofHash,
      ].join("|"),
      "utf8",
    )
    .digest("hex");

  return [
    "appraisal",
    "feedback-released",
    input.channel,
    digest,
  ].join(":");
}

function commonPayload(input: {
  cycleId: string;
  releasedAt: string;
  releaseProofHash: string;
}) {
  return {
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    event: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
    cycleId: input.cycleId,
    href: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.inAppHref,
    title: "Headteacher appraisal result released",
    message:
      "Your official Headteacher appraisal result has been released. Sign in to EduLife OS to view it.",
    releasedAt: input.releasedAt,
    releaseProofHash: input.releaseProofHash,
    privacy: {
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      scoreValuesIncluded: false,
      releaseNoteIncluded: false,
      providerCalled: false,
    },
  } satisfies Prisma.InputJsonObject;
}

export function buildHeadteacherDirectorReleaseNotificationRows(input: {
  cycle: ReleasedCycleRecord;
  releasedAt: string;
  releaseProofHash: string;
  now: Date;
}): Prisma.AppraisalNotificationCreateManyInput[] {
  const common = commonPayload({
    cycleId: input.cycle.id,
    releasedAt: input.releasedAt,
    releaseProofHash: input.releaseProofHash,
  });
  const email = safeEmail(input.cycle.targetUser.email);
  const phone = targetPhone(input.cycle);
  const smsAllowed = input.cycle.targetUser.smsOptIn !== false;
  const keyInput = {
    cycleId: input.cycle.id,
    recipientUserId: input.cycle.targetUserId,
    releaseProofHash: input.releaseProofHash,
  };

  return [
    {
      cycleId: input.cycle.id,
      recipientUserId: input.cycle.targetUserId,
      recipientTenantId: input.cycle.targetTenantId,
      channel: AppraisalNotificationChannel.IN_APP,
      type: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
      status: AppraisalNotificationStatus.SENT,
      idempotencyKey: idempotencyKey({
        ...keyInput,
        channel: AppraisalNotificationChannel.IN_APP,
      }),
      payload: common,
      attempts: 0,
      maxAttempts: 1,
      priority: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.priority,
      sentAt: input.now,
    },
    {
      cycleId: input.cycle.id,
      recipientUserId: input.cycle.targetUserId,
      recipientTenantId: input.cycle.targetTenantId,
      channel: AppraisalNotificationChannel.SMS,
      type: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
      status:
        phone && smsAllowed
          ? AppraisalNotificationStatus.PENDING
          : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: idempotencyKey({
        ...keyInput,
        channel: AppraisalNotificationChannel.SMS,
      }),
      payload: {
        ...common,
        delivery: phone
          ? {
              destination: phone,
              text:
                "Your Headteacher appraisal result has been released in EduLife OS. Sign in to view it.",
              template:
                HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.smsTemplate,
            }
          : null,
      },
      attempts: 0,
      maxAttempts:
        HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.priority,
      lastError: !smsAllowed
        ? "SMS_OPT_OUT"
        : phone
          ? null
          : "PHONE_UNAVAILABLE",
    },
    {
      cycleId: input.cycle.id,
      recipientUserId: input.cycle.targetUserId,
      recipientTenantId: input.cycle.targetTenantId,
      channel: AppraisalNotificationChannel.EMAIL,
      type: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
      status: email
        ? AppraisalNotificationStatus.PENDING
        : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: idempotencyKey({
        ...keyInput,
        channel: AppraisalNotificationChannel.EMAIL,
      }),
      payload: {
        ...common,
        delivery: email
          ? {
              destination: email,
              subject: "Headteacher appraisal result released",
              text:
                "Your official Headteacher appraisal result has been released in EduLife OS. Sign in to view it.",
            }
          : null,
      },
      attempts: 0,
      maxAttempts:
        HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.priority,
      lastError: email ? null : "EMAIL_UNAVAILABLE",
    },
  ];
}

function emptyChannelSummary(): HeadteacherDirectorReleaseNotificationChannelSummary {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    dead: 0,
    cancelled: 0,
  };
}

function incrementStatus(
  summary: HeadteacherDirectorReleaseNotificationChannelSummary,
  status: AppraisalNotificationStatus,
) {
  summary.total += 1;
  switch (status) {
    case AppraisalNotificationStatus.PENDING:
      summary.pending += 1;
      break;
    case AppraisalNotificationStatus.PROCESSING:
      summary.processing += 1;
      break;
    case AppraisalNotificationStatus.SENT:
      summary.sent += 1;
      break;
    case AppraisalNotificationStatus.SKIPPED:
      summary.skipped += 1;
      break;
    case AppraisalNotificationStatus.FAILED:
      summary.failed += 1;
      break;
    case AppraisalNotificationStatus.DEAD:
      summary.dead += 1;
      break;
    case AppraisalNotificationStatus.CANCELLED:
      summary.cancelled += 1;
      break;
  }
}

export function summarizeHeadteacherDirectorReleaseNotifications(input: {
  rows: NotificationSummaryRow[];
}): HeadteacherDirectorReleaseNotificationSummary {
  const summary: HeadteacherDirectorReleaseNotificationSummary = {
    recipientCount: 1,
    channels: {
      inApp: emptyChannelSummary(),
      sms: emptyChannelSummary(),
      email: emptyChannelSummary(),
    },
  };

  for (const row of input.rows) {
    if (row.channel === AppraisalNotificationChannel.IN_APP) {
      incrementStatus(summary.channels.inApp, row.status);
    } else if (row.channel === AppraisalNotificationChannel.SMS) {
      incrementStatus(summary.channels.sms, row.status);
    } else if (row.channel === AppraisalNotificationChannel.EMAIL) {
      incrementStatus(summary.channels.email, row.status);
    }
  }

  return summary;
}

function releaseProofFromCycle(cycle: ReleasedCycleRecord) {
  return objectValue(
    objectValue(cycle.metadata)[
      HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.releaseMetadataKey
    ],
  );
}

function assertReleasedCycle(input: {
  cycle: ReleasedCycleRecord;
  releaseProofHash: string;
  releasedAt: string;
  actorUserId: string;
}) {
  const release = releaseProofFromCycle(input.cycle);
  const actualReleasedAt = input.cycle.releasedAt?.toISOString() ?? "";

  if (
    normalized(input.cycle.status) !==
      HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.requiredCycleStatus ||
    normalized(input.cycle.targetRoleSnapshot) !==
      HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.recipientRole ||
    !input.cycle.targetTenantId ||
    !actualReleasedAt ||
    actualReleasedAt !== input.releasedAt ||
    Number(release.proofSchemaVersion) !==
      HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.requiredReleaseProofVersion ||
    clean(release.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    clean(release.cycleId) !== input.cycle.id ||
    normalized(release.reviewDecision) !== "ACCEPTED" ||
    normalized(release.assessmentStatus) !== "FINALIZED" ||
    clean(release.reviewerUserId) !== input.actorUserId ||
    clean(release.releasedAt) !== actualReleasedAt ||
    clean(release.releaseProofHash).toLowerCase() !== input.releaseProofHash ||
    release.notificationsSeeded !== false ||
    release.notificationReadiness !==
      HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.requiredNotificationReadiness ||
    release.providerCalled !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.scoreMutationPerformed !== false
  ) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_RELEASE_PROOF_DRIFT", 409, {
      cycleId: input.cycle.id,
    });
  }
}

function assertActiveTargetMembership(input: {
  cycle: ReleasedCycleRecord;
  membership: ActiveTargetMembership | null;
}) {
  if (
    !input.membership ||
    input.membership.userId !== input.cycle.targetUserId ||
    input.membership.tenantId !== input.cycle.targetTenantId ||
    normalized(input.membership.status) !== "ACTIVE" ||
    normalized(input.membership.role.name) !== "HEADTEACHER" ||
    input.membership.tenant.id !== input.cycle.targetTenantId ||
    normalized(input.membership.tenant.status) !== "ACTIVE"
  ) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_TARGET_INACTIVE", 409, {
      cycleId: input.cycle.id,
    });
  }
}

async function notificationSummary(input: {
  database: HeadteacherDirectorReleaseNotificationDatabase;
  cycleId: string;
}) {
  const rows = await input.database.appraisalNotification.findMany({
    where: {
      cycleId: input.cycleId,
      type: HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
    },
    select: { channel: true, status: true },
  });

  return summarizeHeadteacherDirectorReleaseNotifications({ rows });
}

function isTransactionConflict(error: unknown) {
  return clean((error as { code?: unknown })?.code) === "P2034";
}

async function seedNotificationRows(input: {
  database: HeadteacherDirectorReleaseNotificationDatabase;
  rows: Prisma.AppraisalNotificationCreateManyInput[];
  cycle: ReleasedCycleRecord;
  actorUserId: string;
  releaseProofHash: string;
  reqId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return input.database.$transaction(
    async (tx) => {
      const created = await tx.appraisalNotification.createMany({
        data: input.rows,
        skipDuplicates: true,
      });

      if (created.count > 0) {
        await tx.auditLog.create({
          data: {
            tenantId: input.cycle.targetTenantId,
            userId: input.actorUserId,
            action: APPRAISAL_AUDIT_ACTIONS.NOTIFICATION_QUEUED,
            resource: RELEASE_NOTIFICATION_AUDIT_RESOURCE,
            resourceId: input.cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId: input.reqId,
              cycleId: input.cycle.id,
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              event:
                HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
              releaseProofHash: input.releaseProofHash,
              recipientCount: 1,
              rowsCreated: created.count,
              channels:
                HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.channels,
              recipientIdentityIncluded: false,
              contactDestinationsIncluded: false,
              respondentIdentitiesIncluded: false,
              individualStaffResponsesIncluded: false,
              scoreValuesIncluded: false,
              releaseNoteIncluded: false,
              providerCalled: false,
            },
          },
        });
      }

      return created.count;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.transactionTimeoutMs,
    },
  );
}

export async function ensureHeadteacherDirectorReleaseNotifications(
  input: EnsureHeadteacherDirectorReleaseNotificationsInput,
): Promise<EnsureHeadteacherDirectorReleaseNotificationsResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherDirectorReleaseNotificationDatabase);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const releaseProofHash = requireSha256(
    input.releaseProofHash,
    "releaseProofHash",
  );
  const releasedAt = clean(input.releasedAt);
  const releasedAtDate = new Date(releasedAt);
  const now = input.now ? new Date(input.now) : new Date();
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");

  if (
    !releasedAt ||
    Number.isNaN(releasedAtDate.getTime()) ||
    releasedAtDate.toISOString() !== releasedAt
  ) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_RELEASE_TIME_INVALID", 400);
  }
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_TIME_INVALID", 400);
  }

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      status: true,
      targetUserId: true,
      targetTenantId: true,
      targetRoleSnapshot: true,
      releasedAt: true,
      metadata: true,
      targetUser: {
        select: {
          email: true,
          phone: true,
          phoneNorm: true,
          smsOptIn: true,
          teacherProfiles: {
            select: { tenantId: true, phone: true },
          },
        },
      },
    },
  });

  if (!cycle) {
    fail("HEADTEACHER_RELEASE_NOTIFICATION_CYCLE_NOT_FOUND", 404, {
      cycleId,
    });
  }

  assertReleasedCycle({
    cycle,
    releaseProofHash,
    releasedAt,
    actorUserId,
  });

  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );
  const membership = await database.membership.findFirst({
    where: {
      userId: cycle.targetUserId,
      tenantId: targetTenantId,
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
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
  });
  assertActiveTargetMembership({ cycle, membership });

  const rows = buildHeadteacherDirectorReleaseNotificationRows({
    cycle,
    releasedAt,
    releaseProofHash,
    now,
  });

  let rowsInserted: number;
  try {
    rowsInserted = await seedNotificationRows({
      database,
      rows,
      cycle,
      actorUserId,
      releaseProofHash,
      reqId,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  } catch (error) {
    if (!isTransactionConflict(error)) throw error;
    rowsInserted = await seedNotificationRows({
      database,
      rows,
      cycle,
      actorUserId,
      releaseProofHash,
      reqId,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  return {
    outcome: rowsInserted > 0 ? "SEEDED" : "EXISTING_MATCH",
    cycleId,
    rowsInserted,
    summary: await notificationSummary({ database, cycleId }),
    providerCalled: false,
    recipientIdentityReturned: false,
    contactDestinationsReturned: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
  };
}
