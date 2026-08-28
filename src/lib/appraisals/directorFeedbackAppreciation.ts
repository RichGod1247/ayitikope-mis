import { randomUUID } from "crypto";
import {
  AppraisalCycleStatus,
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  AppraisalParticipantStatus,
  Prisma,
} from "@prisma/client";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";
import {
  getStaffEssentialAlertEligibilityMap,
  type StaffEssentialAlertEligibility,
} from "@/lib/essentialAlerts/enrollment";

export const DIRECTOR_FEEDBACK_APPRECIATION_POLICY = {
  notificationType: AppraisalNotificationType.PARTICIPATION_APPRECIATION,
  channels: [
    AppraisalNotificationChannel.IN_APP,
    AppraisalNotificationChannel.SMS,
    AppraisalNotificationChannel.EMAIL,
  ] as const,
  inAppHref: "/headteacher/director-feedback",
  maximumAttempts: 5,
  priority: 3,
  auditAction: "DIRECTOR_FEEDBACK_PARTICIPATION_APPRECIATION_SEEDED",
  smsTemplate: "director-feedback-participation-appreciation",
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 15_000,
  providerDeliveryTriggered: false,
} as const;

const APPRECIATION_TITLE = "Thank you for your valued participation";
const APPRECIATION_MESSAGE =
  "Thank you for taking part in my confidential leadership feedback exercise. " +
  "I sincerely appreciate your time, honesty and trust. Your feedback will help me strengthen my leadership and better support our schools. " +
  "Thank you for your commitment to continuous improvement.";
const APPRECIATION_SMS =
  "Thank you for taking part in my confidential leadership feedback. I value your time, honesty and trust. Your feedback will help me better support our schools.";

type AppreciationParticipant = {
  respondentUserId: string;
  respondentTenantId: string | null;
  respondent: {
    email: string;
  };
};

export type DirectorFeedbackAppreciationChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

export type DirectorFeedbackAppreciationStatus = {
  cycleId: string;
  participantCount: number;
  dispatched: boolean;
  channels: {
    inApp: DirectorFeedbackAppreciationChannelSummary;
    sms: DirectorFeedbackAppreciationChannelSummary;
    email: DirectorFeedbackAppreciationChannelSummary;
  };
};

export type SendDirectorFeedbackAppreciationResult = {
  outcome: "DISPATCHED" | "ALREADY_DISPATCHED";
  rowsInserted: number;
  status: DirectorFeedbackAppreciationStatus;
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

function safeEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  if (!email || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}


const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;
const OFFICIAL_APPRAISAL_SMS_AUTHORITY =
  "STAFF_ESSENTIAL_ALERT_ENROLLMENT" as const;
const OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY = 8;

function staffEligibilityKey(tenantId: string, userId: string) {
  return `${tenantId}\u0000${userId}`;
}

async function resolveOfficialAppraisalSmsEligibility(
  participants: AppreciationParticipant[],
) {
  const byTenant = new Map<string, Set<string>>();

  for (const participant of participants) {
    const tenantId = clean(participant.respondentTenantId);
    const userId = clean(participant.respondentUserId);
    if (!tenantId || !userId) continue;
    const users = byTenant.get(tenantId) ?? new Set<string>();
    users.add(userId);
    byTenant.set(tenantId, users);
  }

  const output = new Map<string, StaffEssentialAlertEligibility>();
  const entries = [...byTenant.entries()];

  for (let offset = 0; offset < entries.length; offset += OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY) {
    const batch = entries.slice(
      offset,
      offset + OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY,
    );
    const resolved = await Promise.all(
      batch.map(async ([tenantId, users]) => ({
        tenantId,
        values: await getStaffEssentialAlertEligibilityMap({
          tenantId,
          purpose: OFFICIAL_APPRAISAL_PURPOSE,
          userIds: [...users],
        }),
      })),
    );

    for (const result of resolved) {
      for (const [userId, eligibility] of result.values) {
        output.set(staffEligibilityKey(result.tenantId, userId), eligibility);
      }
    }
  }

  return output;
}

function officialAppraisalSmsLastError(input: {
  tenantId: string | null;
  eligibility: StaffEssentialAlertEligibility | undefined;
}) {
  if (!input.tenantId) {
    return "ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_TENANT_UNAVAILABLE";
  }
  if (!input.eligibility) {
    return "ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_NOT_REVALIDATED";
  }
  if (!input.eligibility.eligible || !input.eligibility.phoneNorm) {
    return `ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_${input.eligibility.reason}`;
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
    input.cycleId,
    input.respondentUserId,
    DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
    input.channel,
  ].join(":");
}

function commonPayload(input: {
  cycleId: string;
  jurisdictionName: string | null;
}) {
  return {
    workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
    event: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
    cycleId: input.cycleId,
    href: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.inAppHref,
    title: APPRECIATION_TITLE,
    message: APPRECIATION_MESSAGE,
    jurisdictionName: input.jurisdictionName,
    confidentiality: {
      respondentIdentityDisclosedToDirector: false,
      schoolIdentityDisclosedToDirector: false,
      scoreValuesIncluded: false,
      individualAnswersIncluded: false,
    },
  } satisfies Prisma.InputJsonObject;
}

export function buildDirectorFeedbackAppreciationRows(input: {
  cycleId: string;
  jurisdictionName: string | null;
  participants: AppreciationParticipant[];
  smsEligibilityByRecipient?: Map<string, StaffEssentialAlertEligibility>;
  now: Date;
}): Prisma.AppraisalNotificationCreateManyInput[] {
  const common = commonPayload(input);
  const rows: Prisma.AppraisalNotificationCreateManyInput[] = [];

  for (const participant of input.participants) {
    const email = safeEmail(participant.respondent.email);
    const recipientTenantId = clean(participant.respondentTenantId) || null;
    const smsEligibility = recipientTenantId
      ? input.smsEligibilityByRecipient?.get(
          staffEligibilityKey(recipientTenantId, participant.respondentUserId),
        )
      : undefined;
    const smsDestination =
      smsEligibility?.eligible && smsEligibility.phoneNorm
        ? smsEligibility.phoneNorm
        : null;
    const smsDeliverable = Boolean(recipientTenantId && smsDestination);
    const smsLastError = officialAppraisalSmsLastError({
      tenantId: recipientTenantId,
      eligibility: smsEligibility,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.IN_APP,
      type: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
      status: AppraisalNotificationStatus.SENT,
      idempotencyKey: notificationKey({
        cycleId: input.cycleId,
        respondentUserId: participant.respondentUserId,
        channel: AppraisalNotificationChannel.IN_APP,
      }),
      payload: common,
      attempts: 0,
      maxAttempts: 1,
      priority: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.priority,
      sentAt: input.now,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.SMS,
      type: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
      status: smsDeliverable
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
        delivery: smsDeliverable
          ? {
              destination: smsDestination!,
              text: APPRECIATION_SMS,
              template: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.smsTemplate,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.maximumAttempts,
      priority: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.priority,
      lastError: smsLastError,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.EMAIL,
      type: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
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
              subject: APPRECIATION_TITLE,
              text: `${APPRECIATION_MESSAGE}\n\nMunicipal Director`,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.maximumAttempts,
      priority: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.priority,
      lastError: email ? null : "EMAIL_UNAVAILABLE",
    });
  }

  return rows;
}

function emptyChannelSummary(): DirectorFeedbackAppreciationChannelSummary {
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
  summary: DirectorFeedbackAppreciationChannelSummary,
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

function summarizeRows(input: {
  cycleId: string;
  participantCount: number;
  rows: Array<{
    channel: AppraisalNotificationChannel;
    status: AppraisalNotificationStatus;
  }>;
}): DirectorFeedbackAppreciationStatus {
  const status: DirectorFeedbackAppreciationStatus = {
    cycleId: input.cycleId,
    participantCount: input.participantCount,
    dispatched:
      input.participantCount > 0 &&
      input.rows.length ===
        input.participantCount *
          DIRECTOR_FEEDBACK_APPRECIATION_POLICY.channels.length,
    channels: {
      inApp: emptyChannelSummary(),
      sms: emptyChannelSummary(),
      email: emptyChannelSummary(),
    },
  };

  for (const row of input.rows) {
    if (row.channel === AppraisalNotificationChannel.IN_APP) {
      incrementStatus(status.channels.inApp, row.status);
    } else if (row.channel === AppraisalNotificationChannel.SMS) {
      incrementStatus(status.channels.sms, row.status);
    } else if (row.channel === AppraisalNotificationChannel.EMAIL) {
      incrementStatus(status.channels.email, row.status);
    }
  }

  return status;
}

const APPRECIATION_CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetRoleSnapshot: true,
  targetZoneNameSnapshot: true,
  instrumentVersion: {
    select: {
      version: true,
      instrument: {
        select: {
          code: true,
        },
      },
    },
  },
} as const satisfies Prisma.AppraisalCycleSelect;

type AppreciationCycleRecord = Prisma.AppraisalCycleGetPayload<{
  select: typeof APPRECIATION_CYCLE_SELECT;
}>;

function assertDirectorAppreciationScope(
  cycle: AppreciationCycleRecord,
  actorUserId: string,
) {
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR" ||
    cycle.instrumentVersion.version !== DIRECTOR_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.instrument.code !== DIRECTOR_FEEDBACK_POLICY.instrumentCode
  ) {
    fail("DIRECTOR_FEEDBACK_APPRECIATION_SCOPE_FORBIDDEN", 403);
  }

  if (cycle.status !== AppraisalCycleStatus.RELEASED) {
    fail("DIRECTOR_FEEDBACK_APPRECIATION_REVIEW_NOT_COMPLETED", 409, {
      status: cycle.status,
    });
  }
}

async function finalizedParticipants(cycleId: string) {
  return prisma.appraisalParticipant.findMany({
    where: {
      cycleId,
      status: AppraisalParticipantStatus.FINALIZED,
    },
    select: {
      respondentUserId: true,
      respondentTenantId: true,
      respondent: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });
}

async function appreciationStatusForCycle(input: {
  cycleId: string;
  participantCount: number;
}) {
  const rows = await prisma.appraisalNotification.findMany({
    where: {
      cycleId: input.cycleId,
      type: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
    },
    select: {
      channel: true,
      status: true,
    },
  });

  return summarizeRows({
    cycleId: input.cycleId,
    participantCount: input.participantCount,
    rows,
  });
}

function assertDirectorAuthority(input: {
  actorUserId: string;
  actorRoleName: unknown;
}) {
  const actorRole = effectiveRole(input.actorRoleName);

  assertAppraisalAuthority(
    {
      actorUserId: input.actorUserId,
      roleName: actorRole,
    },
    "VIEW_DIRECTOR_FEEDBACK_RESULTS",
  );

  return actorRole;
}

export async function getDirectorFeedbackAppreciationStatus(input: {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
}): Promise<DirectorFeedbackAppreciationStatus> {
  const actorUserId = clean(input.actorUserId);
  const cycleId = clean(input.cycleId);

  assertDirectorAuthority({
    actorUserId,
    actorRoleName: input.actorRoleName,
  });

  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: APPRECIATION_CYCLE_SELECT,
  });

  if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
  assertDirectorAppreciationScope(cycle, actorUserId);

  const participants = await finalizedParticipants(cycle.id);

  return appreciationStatusForCycle({
    cycleId: cycle.id,
    participantCount: participants.length,
  });
}

export async function sendDirectorFeedbackAppreciation(input: {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}): Promise<SendDirectorFeedbackAppreciationResult> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = assertDirectorAuthority({
    actorUserId,
    actorRoleName: input.actorRoleName,
  });
  const cycleId = clean(input.cycleId);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();

  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: APPRECIATION_CYCLE_SELECT,
  });

  if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
  assertDirectorAppreciationScope(cycle, actorUserId);

  const participants = await finalizedParticipants(cycle.id);
  if (!participants.length) {
    fail("DIRECTOR_FEEDBACK_APPRECIATION_NO_FINALIZED_PARTICIPANTS", 409);
  }

  const smsEligibilityByRecipient =
    await resolveOfficialAppraisalSmsEligibility(participants);

  const rows = buildDirectorFeedbackAppreciationRows({
    cycleId: cycle.id,
    jurisdictionName: cycle.targetZoneNameSnapshot,
    participants,
    smsEligibilityByRecipient,
    now,
  });

  const rowsInserted = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const created = await tx.appraisalNotification.createMany({
        data: rows,
        skipDuplicates: true,
      });

      if (created.count > 0) {
        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.auditAction,
            resource: "AppraisalCycle",
            resourceId: cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              cycleId: cycle.id,
              workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
              actorRole,
              event: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.notificationType,
              finalizedParticipants: participants.length,
              rowsCreated: created.count,
              channels: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.channels,
              essentialAlertPurpose: OFFICIAL_APPRAISAL_PURPOSE,
              smsAuthority: OFFICIAL_APPRAISAL_SMS_AUTHORITY,
              legacySmsOptInAuthoritative: false,
              providerDeliveryTriggered: false,
              respondentIdentityReturnedToDirector: false,
              schoolIdentityReturnedToDirector: false,
              scoreValuesRecordedInAudit: false,
              individualAnswersRecordedInAudit: false,
            },
          },
        });
      }

      return created.count;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.transactionTimeoutMs,
    },
  );

  const status = await appreciationStatusForCycle({
    cycleId: cycle.id,
    participantCount: participants.length,
  });

  if (!status.dispatched) {
    fail("DIRECTOR_FEEDBACK_APPRECIATION_OUTBOX_INCOMPLETE", 409, {
      participantCount: status.participantCount,
      notificationRows:
        status.channels.inApp.total +
        status.channels.sms.total +
        status.channels.email.total,
    });
  }

  return {
    outcome: rowsInserted > 0 ? "DISPATCHED" : "ALREADY_DISPATCHED",
    rowsInserted,
    status,
  };
}
