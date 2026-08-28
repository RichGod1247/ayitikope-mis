// src/lib/appraisals/directorFeedbackNotifications.ts
import {
  AppraisalCycleStatus,
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  AppraisalParticipantStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  DIRECTOR_FEEDBACK_POLICY,
  openDirectorFeedbackCycle,
} from "@/lib/appraisals/directorFeedback";
import {
  getStaffEssentialAlertEligibilityMap,
  type StaffEssentialAlertEligibility,
} from "@/lib/essentialAlerts/enrollment";

export const DIRECTOR_FEEDBACK_NOTIFICATION_POLICY = {
  notificationType: AppraisalNotificationType.CYCLE_OPENED,
  channels: [
    AppraisalNotificationChannel.IN_APP,
    AppraisalNotificationChannel.SMS,
    AppraisalNotificationChannel.EMAIL,
  ] as const,
  inAppHref: "/headteacher/director-feedback",
  maximumAttempts: 5,
  priority: 3,
  auditAction: "DIRECTOR_FEEDBACK_NOTIFICATIONS_SEEDED",
} as const;

const ACTIVE_DIRECTOR_FEEDBACK_STATUSES: AppraisalCycleStatus[] = [
  AppraisalCycleStatus.DRAFT,
  AppraisalCycleStatus.PENDING_APPROVAL,
  AppraisalCycleStatus.OPEN,
  AppraisalCycleStatus.CLOSED,
  AppraisalCycleStatus.UNDER_REVIEW,
];

type NotificationParticipant = {
  id: string;
  respondentUserId: string;
  respondentTenantId: string | null;
  eligibilitySnapshotJson: Prisma.JsonValue;
  respondent: {
    email: string;
  };
};

export type DirectorFeedbackNotificationChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

export type DirectorFeedbackNotificationSummary = {
  totalParticipants: number;
  invitedParticipants: number;
  channels: {
    inApp: DirectorFeedbackNotificationChannelSummary;
    sms: DirectorFeedbackNotificationChannelSummary;
    email: DirectorFeedbackNotificationChannelSummary;
  };
};

export type DirectorFeedbackRequestStatus = {
  cycle: null | {
    id: string;
    status: string;
    directorName: string | null;
    jurisdictionName: string | null;
    openedAt: string | null;
    deadlineAt: string | null;
    responseWindowDays: number;
    minimumResponses: number;
    participantCount: number;
    finalizedResponses: number;
    expiredResponses: number;
    circuitCount: number;
    extensionCount: number;
    allResponsesFinalized: boolean;
    canCloseEarly: boolean;
    canExtendFeedbackWindow: boolean;
    canRequestNewCycle: boolean;
  };
  notifications: DirectorFeedbackNotificationSummary;
};

export type RequestDirectorFeedbackInput = {
  actorUserId: string;
  actorRoleName: unknown;
  cycleKey: string;
  requestReason?: string | null;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export type RequestDirectorFeedbackResult = {
  outcome: "CREATED" | "EXISTING_MATCH" | "EXISTING_ACTIVE";
  status: DirectorFeedbackRequestStatus;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }
  return value as Record<string, Prisma.JsonValue>;
}

function safeEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  if (!email || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}


// Historical QA vocabulary only: SMS_OPT_OUT and PHONE_UNAVAILABLE are no longer SMS authority rules.
const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;
const OFFICIAL_APPRAISAL_SMS_AUTHORITY =
  "STAFF_ESSENTIAL_ALERT_ENROLLMENT" as const;
const OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY = 8;

function staffEligibilityKey(tenantId: string, userId: string) {
  return `${tenantId}\u0000${userId}`;
}

async function resolveOfficialAppraisalSmsEligibility(
  participants: NotificationParticipant[],
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

  for (
    let offset = 0;
    offset < entries.length;
    offset += OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY
  ) {
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
    DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    input.channel,
  ].join(":");
}

function compactDate(value: Date | null) {
  if (!value) return "the stated deadline";
  return value.toISOString().slice(0, 10);
}

function basePayload(input: {
  cycleId: string;
  deadlineAt: Date | null;
  jurisdictionName: string | null;
}) {
  return {
    workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
    event: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    cycleId: input.cycleId,
    href: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.inAppHref,
    title: "Confidential Director feedback requested",
    message:
      "The Municipal Director has opened a confidential leadership-feedback exercise. Sign in to EduLife OS to respond.",
    deadlineAt: input.deadlineAt?.toISOString() ?? null,
    jurisdictionName: input.jurisdictionName,
    identityProtection: {
      directorCanSeeIdentity: false,
      schoolIdentityShownToDirector: false,
      identityAccessRole: "SUPERADMIN",
    },
  } satisfies Prisma.InputJsonObject;
}

export function buildDirectorFeedbackNotificationRows(input: {
  cycleId: string;
  deadlineAt: Date | null;
  jurisdictionName: string | null;
  participants: NotificationParticipant[];
  smsEligibilityByRecipient?: Map<string, StaffEssentialAlertEligibility>;
  now: Date;
}): Prisma.AppraisalNotificationCreateManyInput[] {
  const common = basePayload(input);
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
    const smsLastError = officialAppraisalSmsLastError({
      tenantId: recipientTenantId,
      eligibility: smsEligibility,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.IN_APP,
      type: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
      status: AppraisalNotificationStatus.SENT,
      idempotencyKey: notificationKey({
        cycleId: input.cycleId,
        respondentUserId: participant.respondentUserId,
        channel: AppraisalNotificationChannel.IN_APP,
      }),
      payload: common,
      attempts: 0,
      maxAttempts: 1,
      priority: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.priority,
      sentAt: input.now,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.SMS,
      type: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
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
              text: `Confidential Director feedback is open in EduLife OS. Submit by ${compactDate(
                input.deadlineAt,
              )}. Sign in to respond.`,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.maximumAttempts,
      priority: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.priority,
      lastError: smsLastError,
    });

    rows.push({
      cycleId: input.cycleId,
      recipientUserId: participant.respondentUserId,
      recipientTenantId: participant.respondentTenantId,
      channel: AppraisalNotificationChannel.EMAIL,
      type: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
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
              subject: "Confidential Director feedback requested",
              text:
                "A confidential Director leadership-feedback exercise is now open in EduLife OS. " +
                `Please sign in and submit by ${compactDate(input.deadlineAt)}.`,
            }
          : null,
      },
      attempts: 0,
      maxAttempts: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.maximumAttempts,
      priority: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.priority,
      lastError: email ? null : "EMAIL_UNAVAILABLE",
    });
  }

  return rows;
}

function emptyChannelSummary(): DirectorFeedbackNotificationChannelSummary {
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
  summary: DirectorFeedbackNotificationChannelSummary,
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

export function summarizeDirectorFeedbackNotifications(input: {
  totalParticipants: number;
  invitedParticipants: number;
  rows: Array<{
    channel: AppraisalNotificationChannel;
    status: AppraisalNotificationStatus;
  }>;
}): DirectorFeedbackNotificationSummary {
  const result: DirectorFeedbackNotificationSummary = {
    totalParticipants: input.totalParticipants,
    invitedParticipants: input.invitedParticipants,
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

function circuitKey(snapshot: Prisma.JsonValue) {
  const value = objectValue(snapshot);
  const candidates = [
    value.circuitZoneId,
    value.circuitId,
    value.circuitZoneName,
    value.circuitName,
  ];

  for (const candidate of candidates) {
    const key = clean(candidate);
    if (key) return key;
  }

  return null;
}

async function notificationSummaryForCycle(cycleId: string) {
  const participants = await prisma.appraisalParticipant.findMany({
    where: { cycleId },
    select: {
      invitedAt: true,
    },
  });

  const rows = await prisma.appraisalNotification.findMany({
    where: {
      cycleId,
      type: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    },
    select: {
      channel: true,
      status: true,
    },
  });

  return summarizeDirectorFeedbackNotifications({
    totalParticipants: participants.length,
    invitedParticipants: participants.filter((item) => item.invitedAt).length,
    rows,
  });
}

export async function ensureDirectorFeedbackCycleNotifications(input: {
  cycleId: string;
  actorUserId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const reqId = clean(input.reqId) || randomUUID();

  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: input.cycleId },
    select: {
      id: true,
      deadlineAt: true,
      targetZoneNameSnapshot: true,
    },
  });

  if (!cycle) {
    const error = new Error("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND");
    Object.assign(error, {
      code: "DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND",
      status: 404,
    });
    throw error;
  }

  const participants = await prisma.appraisalParticipant.findMany({
    where: { cycleId: cycle.id },
    select: {
      id: true,
      respondentUserId: true,
      respondentTenantId: true,
      eligibilitySnapshotJson: true,
      respondent: {
        select: {
          email: true,
        },
      },
    },
  });

  const smsEligibilityByRecipient =
    await resolveOfficialAppraisalSmsEligibility(participants);

  const rows = buildDirectorFeedbackNotificationRows({
    cycleId: cycle.id,
    deadlineAt: cycle.deadlineAt,
    jurisdictionName: cycle.targetZoneNameSnapshot,
    participants,
    smsEligibilityByRecipient,
    now,
  });

  const inserted = await prisma.$transaction(
    async (tx) => {
      const created = rows.length
        ? await tx.appraisalNotification.createMany({
            data: rows,
            skipDuplicates: true,
          })
        : { count: 0 };

      await tx.appraisalParticipant.updateMany({
        where: {
          cycleId: cycle.id,
          invitedAt: null,
        },
        data: {
          invitedAt: now,
        },
      });

      if (created.count > 0) {
        await tx.auditLog.create({
          data: {
            userId: input.actorUserId,
            action: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.auditAction,
            resource: "AppraisalCycle",
            resourceId: cycle.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              cycleId: cycle.id,
              event:
                DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
              rowsCreated: created.count,
              participants: participants.length,
              channels:
                DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.channels,
              essentialAlertPurpose: OFFICIAL_APPRAISAL_PURPOSE,
              smsAuthority: OFFICIAL_APPRAISAL_SMS_AUTHORITY,
              legacySmsOptInAuthoritative: false,
              contactIdentityReturnedToDirector: false,
            },
          },
        });
      }

      return created.count;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  const summary = await notificationSummaryForCycle(cycle.id);

  return {
    cycleId: cycle.id,
    rowsInserted: inserted,
    summary,
  };
}

async function findLatestDirectorCycle(input: {
  actorUserId: string;
  activeOnly: boolean;
}) {
  return prisma.appraisalCycle.findFirst({
    where: {
      targetUserId: input.actorUserId,
      targetRoleSnapshot: "DISTRICT_DIRECTOR",
      instrumentVersion: {
        version: DIRECTOR_FEEDBACK_POLICY.instrumentVersion,
        instrument: {
          code: DIRECTOR_FEEDBACK_POLICY.instrumentCode,
        },
      },
      ...(input.activeOnly
        ? {
            status: {
              in: ACTIVE_DIRECTOR_FEEDBACK_STATUSES,
            },
          }
        : {}),
    },
    orderBy: [{ openedAt: "desc" }, { requestedAt: "desc" }],
    select: {
      id: true,
      status: true,
      targetNameSnapshot: true,
      targetZoneNameSnapshot: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      extensionCount: true,
    },
  });
}

export async function getDirectorFeedbackRequestStatus(input: {
  actorUserId: string;
}): Promise<DirectorFeedbackRequestStatus> {
  const cycle = await findLatestDirectorCycle({
    actorUserId: input.actorUserId,
    activeOnly: false,
  });

  if (!cycle) {
    return {
      cycle: null,
      notifications: summarizeDirectorFeedbackNotifications({
        totalParticipants: 0,
        invitedParticipants: 0,
        rows: [],
      }),
    };
  }

  const participants = await prisma.appraisalParticipant.findMany({
    where: { cycleId: cycle.id },
    select: {
      status: true,
      eligibilitySnapshotJson: true,
    },
  });

  const notificationRows = await prisma.appraisalNotification.findMany({
    where: {
      cycleId: cycle.id,
      type: DIRECTOR_FEEDBACK_NOTIFICATION_POLICY.notificationType,
    },
    select: {
      channel: true,
      status: true,
    },
  });

  const circuits = new Set<string>();
  for (const participant of participants) {
    const key = circuitKey(participant.eligibilitySnapshotJson);
    if (key) circuits.add(key);
  }

  const finalizedResponses = participants.filter(
    (participant) =>
      participant.status === AppraisalParticipantStatus.FINALIZED,
  ).length;
  const expiredResponses = participants.filter(
    (participant) =>
      participant.status === AppraisalParticipantStatus.EXPIRED,
  ).length;
  const deadlineReached =
    Boolean(cycle.deadlineAt) &&
    cycle.deadlineAt!.getTime() <= Date.now();
  const eligibleParticipants = participants.filter(
    (participant) =>
      participant.status !== AppraisalParticipantStatus.REVOKED,
  );
  const allResponsesFinalized =
    eligibleParticipants.length > 0 &&
    eligibleParticipants.every(
      (participant) =>
        participant.status === AppraisalParticipantStatus.FINALIZED,
    );

  return {
    cycle: {
      id: cycle.id,
      status: cycle.status,
      directorName: cycle.targetNameSnapshot,
      jurisdictionName: cycle.targetZoneNameSnapshot,
      openedAt: cycle.openedAt?.toISOString() ?? null,
      deadlineAt: cycle.deadlineAt?.toISOString() ?? null,
      responseWindowDays: cycle.responseWindowDays,
      minimumResponses: cycle.minimumResponses,
      participantCount: participants.length,
      finalizedResponses,
      expiredResponses,
      circuitCount: circuits.size,
      extensionCount: cycle.extensionCount,
      allResponsesFinalized,
      canCloseEarly:
        cycle.status === AppraisalCycleStatus.OPEN &&
        !deadlineReached &&
        allResponsesFinalized,
      canExtendFeedbackWindow:
        cycle.status === AppraisalCycleStatus.CLOSED &&
        deadlineReached &&
        cycle.extensionCount === 0 &&
        expiredResponses > 0,
      canRequestNewCycle: !ACTIVE_DIRECTOR_FEEDBACK_STATUSES.includes(
        cycle.status,
      ),
    },
    notifications: summarizeDirectorFeedbackNotifications({
      totalParticipants: participants.length,
      invitedParticipants: notificationRows.filter(
        (row) =>
          row.channel === AppraisalNotificationChannel.IN_APP &&
          row.status === AppraisalNotificationStatus.SENT,
      ).length,
      rows: notificationRows,
    }),
  };
}

export async function requestDirectorFeedbackWithNotifications(
  input: RequestDirectorFeedbackInput,
): Promise<RequestDirectorFeedbackResult> {
  const reqId = clean(input.reqId) || randomUUID();

  const existingActive = await findLatestDirectorCycle({
    actorUserId: input.actorUserId,
    activeOnly: true,
  });

  let outcome: RequestDirectorFeedbackResult["outcome"];
  let cycleId: string;

  if (existingActive) {
    outcome = "EXISTING_ACTIVE";
    cycleId = existingActive.id;
  } else {
    try {
      const opened = await openDirectorFeedbackCycle({
        actorUserId: input.actorUserId,
        actorRoleName: input.actorRoleName,
        cycleKey: input.cycleKey,
        requestReason: input.requestReason,
        reqId,
        ip: input.ip,
        userAgent: input.userAgent,
        now: input.now,
      });

      outcome = opened.outcome;
      cycleId = opened.cycle.id;
    } catch (error) {
      const raced = await findLatestDirectorCycle({
        actorUserId: input.actorUserId,
        activeOnly: true,
      });

      if (!raced) throw error;

      outcome = "EXISTING_ACTIVE";
      cycleId = raced.id;
    }
  }

  await ensureDirectorFeedbackCycleNotifications({
    cycleId,
    actorUserId: input.actorUserId,
    reqId,
    ip: input.ip,
    userAgent: input.userAgent,
    now: input.now,
  });

  return {
    outcome,
    status: await getDirectorFeedbackRequestStatus({
      actorUserId: input.actorUserId,
    }),
  };
}
