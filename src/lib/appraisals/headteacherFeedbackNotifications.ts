import { randomUUID } from "crypto";
import {
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  AppraisalParticipantStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getStaffEssentialAlertEligibilityMap,
  type StaffEssentialAlertEligibility,
} from "@/lib/essentialAlerts/enrollment";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  HEADTEACHER_FEEDBACK_POLICY,
  assertHeadteacherFeedbackInstrumentReady,
} from "@/lib/appraisals/headteacherFeedback";
import {
  approveAndOpenHeadteacherFeedbackCycle,
  type ApproveAndOpenHeadteacherFeedbackCycleInput,
  type ApproveAndOpenHeadteacherFeedbackCycleResult,
} from "@/lib/appraisals/headteacherFeedbackApproval";
import {
  directOpenHeadteacherFeedbackCycle,
  type DirectOpenHeadteacherFeedbackCycleInput,
  type DirectOpenHeadteacherFeedbackCycleResult,
} from "@/lib/appraisals/headteacherFeedbackDirectOpen";

export const HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY = {
  notificationType: AppraisalNotificationType.CYCLE_OPENED,
  channels: [
    AppraisalNotificationChannel.IN_APP,
    AppraisalNotificationChannel.SMS,
    AppraisalNotificationChannel.EMAIL,
  ] as const,
  inAppHref: "/teacher/headteacher-appraisal",
  smsTemplate: "headteacher-feedback-cycle-opened",
  maximumAttempts: 5,
  priority: 3,
  auditAction: APPRAISAL_AUDIT_ACTIONS.NOTIFICATION_QUEUED,
} as const;

type NotificationCycleRecord = {
  id: string;
  status: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  openedAt: Date | null;
  deadlineAt: Date | null;
  responseWindowDays: number;
  minimumResponses: number;
  metadata: unknown;
  instrumentVersion: {
    version: number;
    status: string;
    instrument: {
      code: string;
      isActive: boolean;
    };
  };
};

type NotificationParticipantRecord = {
  id: string;
  respondentUserId: string;
  respondentTenantId: string | null;
  status: string;
  invitedAt: Date | null;
  respondent: {
    email: string;
  };
};

type AppraisalCycleDelegate = {
  findUnique(args: unknown): Promise<NotificationCycleRecord | null>;
};

type AppraisalParticipantDelegate = {
  findMany(args: unknown): Promise<NotificationParticipantRecord[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

type AppraisalNotificationDelegate = {
  createMany(args: unknown): Promise<{ count: number }>;
  findMany(args: unknown): Promise<
    Array<{
      channel: AppraisalNotificationChannel;
      status: AppraisalNotificationStatus;
    }>
  >;
};

type AuditLogDelegate = {
  create(args: unknown): Promise<unknown>;
};

export type HeadteacherFeedbackNotificationTransactionClient = {
  appraisalParticipant: AppraisalParticipantDelegate;
  appraisalNotification: AppraisalNotificationDelegate;
  auditLog: AuditLogDelegate;
};

export type HeadteacherFeedbackNotificationDatabase = {
  appraisalCycle: AppraisalCycleDelegate;
  appraisalParticipant: AppraisalParticipantDelegate;
  appraisalNotification: AppraisalNotificationDelegate;
  $transaction<T>(
    operation: (
      tx: HeadteacherFeedbackNotificationTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type HeadteacherFeedbackNotificationChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

export type HeadteacherFeedbackNotificationSummary = {
  participantCount: number;
  invitedParticipantCount: number;
  channels: {
    inApp: HeadteacherFeedbackNotificationChannelSummary;
    sms: HeadteacherFeedbackNotificationChannelSummary;
    email: HeadteacherFeedbackNotificationChannelSummary;
  };
};

export type EnsureHeadteacherFeedbackNotificationsInput = {
  cycleId: string;
  actorUserId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherFeedbackNotificationDatabase;
  essentialAlertEligibilityResolver?: StaffEssentialAlertEligibilityResolver;
};

export type EnsureHeadteacherFeedbackNotificationsResult = {
  outcome: "SEEDED" | "EXISTING_MATCH";
  cycleId: string;
  rowsInserted: number;
  participantsInvited: number;
  summary: HeadteacherFeedbackNotificationSummary;
};

export type ApproveHeadteacherFeedbackWithNotificationsInput =
  ApproveAndOpenHeadteacherFeedbackCycleInput & {
    notificationDatabase?: HeadteacherFeedbackNotificationDatabase;
    essentialAlertEligibilityResolver?: StaffEssentialAlertEligibilityResolver;
  };

export type DirectOpenHeadteacherFeedbackWithNotificationsInput =
  DirectOpenHeadteacherFeedbackCycleInput & {
    notificationDatabase?: HeadteacherFeedbackNotificationDatabase;
    essentialAlertEligibilityResolver?: StaffEssentialAlertEligibilityResolver;
  };

export type HeadteacherFeedbackOpenedWithNotificationsResult = {
  outcome:
    | ApproveAndOpenHeadteacherFeedbackCycleResult["outcome"]
    | DirectOpenHeadteacherFeedbackCycleResult["outcome"];
  cycle: Omit<
    ApproveAndOpenHeadteacherFeedbackCycleResult["cycle"],
    "notificationsSeeded"
  > & {
    notificationsSeeded: true;
  };
  notifications: EnsureHeadteacherFeedbackNotificationsResult;
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

function safeEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  if (!email || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function compactDate(value: Date) {
  return value.toISOString().slice(0, 10);
}


const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;
const OFFICIAL_APPRAISAL_SMS_AUTHORITY =
  "STAFF_ESSENTIAL_ALERT_ENROLLMENT" as const;

type StaffEssentialAlertEligibilityResolver =
  typeof getStaffEssentialAlertEligibilityMap;

function officialAppraisalSmsLastError(
  eligibility: StaffEssentialAlertEligibility | undefined,
) {
  if (!eligibility) {
    return "ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_NOT_REVALIDATED";
  }
  if (!eligibility.eligible || !eligibility.phoneNorm) {
    return `ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_${eligibility.reason}`;
  }
  return null;
}

function notificationKey(input: {
  cycleId: string;
  respondentUserId: string;
  channel: AppraisalNotificationChannel;
}) {
  return [
    "appraisal",
    HEADTEACHER_FEEDBACK_POLICY.workflow,
    input.cycleId,
    input.respondentUserId,
    HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    input.channel,
  ].join(":");
}

function commonPayload(input: {
  cycleId: string;
  deadlineAt: Date;
}) {
  return {
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    event: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    cycleId: input.cycleId,
    href: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.inAppHref,
    title: "Confidential Headteacher appraisal feedback",
    message:
      "A confidential Headteacher feedback assignment is available. Sign in to EduLife OS to respond.",
    deadlineAt: input.deadlineAt.toISOString(),
    confidentiality: {
      headteacherCanSeeRespondentIdentity: false,
      headteacherCanSeeCompletionList: false,
      directorIdentityAccessRequiresAuthorizedAudit: true,
      absoluteAnonymityPromised: false,
    },
  } satisfies Prisma.InputJsonObject;
}

export function buildHeadteacherFeedbackNotificationRows(input: {
  cycleId: string;
  deadlineAt: Date;
  participants: NotificationParticipantRecord[];
  smsEligibilityByUserId?: Map<string, StaffEssentialAlertEligibility>;
  now: Date;
}): Prisma.AppraisalNotificationCreateManyInput[] {
  const common = commonPayload(input);
  const rows: Prisma.AppraisalNotificationCreateManyInput[] = [];

  for (const participant of input.participants) {
    const email = safeEmail(participant.respondent.email);
    const smsEligibility = input.smsEligibilityByUserId?.get(
      participant.respondentUserId,
    );
    const smsDestination =
      smsEligibility?.eligible && smsEligibility.phoneNorm
        ? smsEligibility.phoneNorm
        : null;
    const smsLastError = officialAppraisalSmsLastError(smsEligibility);

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.IN_APP,
      type: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
      status: AppraisalNotificationStatus.SENT,
      idempotencyKey: notificationKey({
        cycleId: input.cycleId,
        respondentUserId: participant.respondentUserId,
        channel: AppraisalNotificationChannel.IN_APP,
      }),
      payload: common,
      attempts: 0,
      maxAttempts: 1,
      priority: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.priority,
      sentAt: input.now,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.SMS,
      type: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
      status: smsDestination
        ? AppraisalNotificationStatus.PENDING
        : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: notificationKey({
        cycleId: input.cycleId,
        respondentUserId: participant.respondentUserId,
        channel: AppraisalNotificationChannel.SMS,
      }),
      payload: {
        ...common,
        essentialAlertPurpose: OFFICIAL_APPRAISAL_PURPOSE,
        essentialAlertAuthority: OFFICIAL_APPRAISAL_SMS_AUTHORITY,
        essentialAlertEligibility: smsEligibility?.reason ?? null,
        delivery: smsDestination
          ? {
              destination: smsDestination,
              text: `Confidential Headteacher feedback is open in EduLife OS. Submit by ${compactDate(
                input.deadlineAt,
              )}. Sign in to respond.`,
              template:
                HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.smsTemplate,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.priority,
      lastError: smsLastError,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.EMAIL,
      type: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
      status: email
        ? AppraisalNotificationStatus.PENDING
        : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: notificationKey({
        cycleId: input.cycleId,
        respondentUserId: participant.respondentUserId,
        channel: AppraisalNotificationChannel.EMAIL,
      }),
      payload: {
        ...common,
        delivery: email
          ? {
              destination: email,
              subject: "Confidential Headteacher appraisal feedback",
              text:
                "A confidential Headteacher feedback assignment is open in EduLife OS. " +
                `Please sign in and submit by ${compactDate(input.deadlineAt)}.`,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.priority,
      lastError: email ? null : "EMAIL_UNAVAILABLE",
    });
  }

  return rows;
}

function emptyChannelSummary(): HeadteacherFeedbackNotificationChannelSummary {
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
  summary: HeadteacherFeedbackNotificationChannelSummary,
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

export function summarizeHeadteacherFeedbackNotifications(input: {
  participantCount: number;
  invitedParticipantCount: number;
  rows: Array<{
    channel: AppraisalNotificationChannel;
    status: AppraisalNotificationStatus;
  }>;
}): HeadteacherFeedbackNotificationSummary {
  const result: HeadteacherFeedbackNotificationSummary = {
    participantCount: input.participantCount,
    invitedParticipantCount: input.invitedParticipantCount,
    channels: {
      inApp: emptyChannelSummary(),
      sms: emptyChannelSummary(),
      email: emptyChannelSummary(),
    },
  };

  for (const row of input.rows) {
    if (row.channel === AppraisalNotificationChannel.IN_APP) {
      incrementStatus(result.channels.inApp, row.status);
    } else if (row.channel === AppraisalNotificationChannel.SMS) {
      incrementStatus(result.channels.sms, row.status);
    } else if (row.channel === AppraisalNotificationChannel.EMAIL) {
      incrementStatus(result.channels.email, row.status);
    }
  }

  return result;
}

function assertCycleContract(cycle: NotificationCycleRecord) {
  assertHeadteacherFeedbackInstrumentReady();
  const metadata = objectValue(cycle.metadata);

  if (
    cycle.status !== "OPEN" ||
    cycle.targetRoleSnapshot !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    cycle.instrumentVersion.version !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !==
      HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    cycle.responseWindowDays !==
      HEADTEACHER_FEEDBACK_POLICY.responseWindowDays ||
    cycle.minimumResponses !==
      HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses ||
    metadata.workflow !== HEADTEACHER_FEEDBACK_POLICY.workflow ||
    metadata.participantsFrozen !== true ||
    !cycle.targetTenantId ||
    !cycle.openedAt ||
    !cycle.deadlineAt ||
    cycle.deadlineAt.getTime() <= cycle.openedAt.getTime()
  ) {
    fail("HEADTEACHER_FEEDBACK_NOTIFICATION_CYCLE_INVALID", 409, {
      cycleId: cycle.id,
    });
  }
}

async function readNotificationSummary(input: {
  database: HeadteacherFeedbackNotificationDatabase;
  cycleId: string;
  participantCount: number;
}) {
  const participants = await input.database.appraisalParticipant.findMany({
    where: {
      cycleId: input.cycleId,
      status: { not: AppraisalParticipantStatus.REVOKED },
    },
    select: { invitedAt: true },
  });

  const rows = await input.database.appraisalNotification.findMany({
    where: {
      cycleId: input.cycleId,
      type: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    },
    select: { channel: true, status: true },
  });

  return summarizeHeadteacherFeedbackNotifications({
    participantCount: input.participantCount,
    invitedParticipantCount: participants.filter(
      (participant) => participant.invitedAt,
    ).length,
    rows,
  });
}

export async function ensureHeadteacherFeedbackCycleNotifications(
  input: EnsureHeadteacherFeedbackNotificationsInput,
): Promise<EnsureHeadteacherFeedbackNotificationsResult> {
  const database =
    input.database ??
    (prisma as unknown as HeadteacherFeedbackNotificationDatabase);
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_FEEDBACK_NOTIFICATION_TIME_INVALID", 400);
  }

  const cycle = await database.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      status: true,
      targetTenantId: true,
      targetRoleSnapshot: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      metadata: true,
      instrumentVersion: {
        select: {
          version: true,
          status: true,
          instrument: {
            select: { code: true, isActive: true },
          },
        },
      },
    },
  });

  if (!cycle) {
    fail("HEADTEACHER_FEEDBACK_NOTIFICATION_CYCLE_NOT_FOUND", 404, {
      cycleId,
    });
  }

  assertCycleContract(cycle);
  const targetTenantId = requireIdentifier(
    cycle.targetTenantId,
    "targetTenantId",
  );
  const deadlineAt = cycle.deadlineAt as Date;

  const participants = await database.appraisalParticipant.findMany({
    where: {
      cycleId,
      status: { not: AppraisalParticipantStatus.REVOKED },
    },
    orderBy: [{ selectedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      respondentUserId: true,
      respondentTenantId: true,
      status: true,
      invitedAt: true,
      respondent: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!participants.length) {
    fail("HEADTEACHER_FEEDBACK_NOTIFICATION_PARTICIPANTS_MISSING", 409, {
      cycleId,
    });
  }

  const seen = new Set<string>();
  for (const participant of participants) {
    if (
      participant.respondentTenantId !== targetTenantId ||
      seen.has(participant.respondentUserId)
    ) {
      fail("HEADTEACHER_FEEDBACK_NOTIFICATION_PARTICIPANT_DRIFT", 409, {
        cycleId,
      });
    }
    seen.add(participant.respondentUserId);
  }

  const eligibilityResolver =
    input.essentialAlertEligibilityResolver ??
    getStaffEssentialAlertEligibilityMap;
  const smsEligibilityByUserId = await eligibilityResolver({
    tenantId: targetTenantId,
    purpose: OFFICIAL_APPRAISAL_PURPOSE,
    userIds: participants.map((participant) => participant.respondentUserId),
  });

  const rows = buildHeadteacherFeedbackNotificationRows({
    cycleId,
    deadlineAt,
    participants,
    smsEligibilityByUserId,
    now,
  });

  const written = await database.$transaction(
    async (
      tx: HeadteacherFeedbackNotificationTransactionClient,
    ) => {
      const created = await tx.appraisalNotification.createMany({
        data: rows,
        skipDuplicates: true,
      });

      const invited = await tx.appraisalParticipant.updateMany({
        where: {
          cycleId,
          status: { not: AppraisalParticipantStatus.REVOKED },
          invitedAt: null,
        },
        data: { invitedAt: now },
      });

      if (created.count > 0) {
        await tx.auditLog.create({
          data: {
            tenantId: targetTenantId,
            userId: actorUserId,
            action: HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.auditAction,
            resource: "AppraisalCycle",
            resourceId: cycleId,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              cycleId,
              workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
              event:
                HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.notificationType,
              participantCount: participants.length,
              rowsCreated: created.count,
              channels:
                HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY.channels,
              essentialAlertPurpose: OFFICIAL_APPRAISAL_PURPOSE,
              smsAuthority: OFFICIAL_APPRAISAL_SMS_AUTHORITY,
              legacySmsOptInAuthoritative: false,
              respondentIdentitiesIncluded: false,
              contactDestinationsIncluded: false,
              individualStatusesIncluded: false,
              providerCalled: false,
            },
          },
        });
      }

      return {
        rowsInserted: created.count,
        participantsInvited: invited.count,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  return {
    outcome: written.rowsInserted > 0 ? "SEEDED" : "EXISTING_MATCH",
    cycleId,
    rowsInserted: written.rowsInserted,
    participantsInvited: written.participantsInvited,
    summary: await readNotificationSummary({
      database,
      cycleId,
      participantCount: participants.length,
    }),
  };
}

export async function approveAndOpenHeadteacherFeedbackCycleWithNotifications(
  input: ApproveHeadteacherFeedbackWithNotificationsInput,
): Promise<HeadteacherFeedbackOpenedWithNotificationsResult> {
  const opened = await approveAndOpenHeadteacherFeedbackCycle(input);
  const notifications = await ensureHeadteacherFeedbackCycleNotifications({
    cycleId: opened.cycle.id,
    actorUserId: input.actorUserId,
    reqId: input.reqId,
    ip: input.ip,
    userAgent: input.userAgent,
    now: input.now,
    database: input.notificationDatabase,
    essentialAlertEligibilityResolver:
      input.essentialAlertEligibilityResolver,
  });

  return {
    outcome: opened.outcome,
    cycle: {
      ...opened.cycle,
      notificationsSeeded: true,
    },
    notifications,
  };
}

export async function directOpenHeadteacherFeedbackCycleWithNotifications(
  input: DirectOpenHeadteacherFeedbackWithNotificationsInput,
): Promise<HeadteacherFeedbackOpenedWithNotificationsResult> {
  const opened = await directOpenHeadteacherFeedbackCycle(input);
  const notifications = await ensureHeadteacherFeedbackCycleNotifications({
    cycleId: opened.cycle.id,
    actorUserId: input.actorUserId,
    reqId: input.reqId,
    ip: input.ip,
    userAgent: input.userAgent,
    now: input.now,
    database: input.notificationDatabase,
    essentialAlertEligibilityResolver:
      input.essentialAlertEligibilityResolver,
  });

  return {
    outcome: opened.outcome,
    cycle: {
      ...opened.cycle,
      notificationsSeeded: true,
    },
    notifications,
  };
}
