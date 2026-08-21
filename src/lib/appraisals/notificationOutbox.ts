// src/lib/appraisals/notificationOutbox.ts

import {
  AppraisalNotification,
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const RELEASE_DELIVERY_CONTRACT =
  "HEADTEACHER_RELEASE_NOTIFICATION_V3";

function deliverableTypeWhere() {
  return {
    OR: [
      { type: AppraisalNotificationType.CYCLE_OPENED },
      {
        type: AppraisalNotificationType.FEEDBACK_RELEASED,
        payload: {
          path: ["deliveryContract"],
          equals: RELEASE_DELIVERY_CONTRACT,
        },
      },
    ],
  };
}

export type ClaimAppraisalNotificationsInput = {
  workerId: string;
  limit?: number;
  staleProcessingAfterMinutes?: number;
};

export type AppraisalNotificationHealth = {
  inApp: Record<AppraisalNotificationStatus, number>;
  sms: Record<AppraisalNotificationStatus, number>;
  email: Record<AppraisalNotificationStatus, number>;
};

function cleanWorkerId(value: unknown) {
  return String(value ?? "appraisal-notification-worker")
    .trim()
    .slice(0, 120);
}

function boundedLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(Math.trunc(parsed), 50));
}

function boundedStaleMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15;
  return Math.max(5, Math.min(Math.trunc(parsed), 120));
}

function safeError(value: unknown) {
  const message =
    value instanceof Error ? value.message : String(value ?? "UNKNOWN_ERROR");
  return message
    .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 1200);
}

function emptyStatusRecord(): Record<AppraisalNotificationStatus, number> {
  return {
    PENDING: 0,
    PROCESSING: 0,
    SENT: 0,
    FAILED: 0,
    SKIPPED: 0,
    CANCELLED: 0,
    DEAD: 0,
  };
}

/**
 * SMS has no provider-level idempotency contract in the current integration.
 * A stale PROCESSING SMS is therefore ambiguous: it may have reached Hubtel
 * before the worker crashed. It is quarantined as DEAD rather than resent.
 *
 * Email retries use Resend's Idempotency-Key. That provider key expires after
 * 24 hours, so email work that remains ambiguous for 23 hours is also
 * quarantined instead of being resent outside the safe retry window.
 */
export async function quarantineAmbiguousAppraisalNotifications(input?: {
  staleProcessingAfterMinutes?: number;
}) {
  const staleMinutes = boundedStaleMinutes(
    input?.staleProcessingAfterMinutes,
  );
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000);
  const emailIdempotencyFloor = new Date(
    Date.now() - 23 * 60 * 60_000,
  );

  const [smsDead, emailDead] = await prisma.$transaction([
    prisma.appraisalNotification.updateMany({
      where: {
        ...deliverableTypeWhere(),
        channel: AppraisalNotificationChannel.SMS,
        status: AppraisalNotificationStatus.PROCESSING,
        lockedAt: { lt: staleBefore },
      },
      data: {
        status: AppraisalNotificationStatus.DEAD,
        attempts: { increment: 1 },
        lockedAt: null,
        lockedBy: null,
        lastError:
          "AMBIGUOUS_SMS_PROVIDER_RESULT_MANUAL_REVIEW_REQUIRED",
      },
    }),
    prisma.appraisalNotification.updateMany({
      where: {
        ...deliverableTypeWhere(),
        channel: AppraisalNotificationChannel.EMAIL,
        status: AppraisalNotificationStatus.PROCESSING,
        lockedAt: { lt: emailIdempotencyFloor },
      },
      data: {
        status: AppraisalNotificationStatus.DEAD,
        attempts: { increment: 1 },
        lockedAt: null,
        lockedBy: null,
        lastError:
          "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED_MANUAL_REVIEW_REQUIRED",
      },
    }),
  ]);

  return {
    ambiguousSmsDead: smsDead.count,
    expiredEmailDead: emailDead.count,
  };
}

export async function claimAppraisalNotifications(
  input: ClaimAppraisalNotificationsInput,
): Promise<AppraisalNotification[]> {
  const workerId = cleanWorkerId(input.workerId);
  const limit = boundedLimit(input.limit);
  const staleMinutes = boundedStaleMinutes(
    input.staleProcessingAfterMinutes,
  );
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000);
  const emailIdempotencyFloor = new Date(
    Date.now() - 23 * 60 * 60_000,
  );

  return prisma.$transaction(async (tx) => {
    const claimedIds = await tx.$queryRaw<Array<{ id: string }>>`
      update "appraisal_notification" notification
      set
        "status" = 'PROCESSING'::"AppraisalNotificationStatus",
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "updatedAt" = now()
      where notification."id" in (
        select "id"
        from "appraisal_notification"
        where
          (
            "type" = 'CYCLE_OPENED'::"AppraisalNotificationType"
            or (
              "type" = 'FEEDBACK_RELEASED'::"AppraisalNotificationType"
              and "payload" ->> 'deliveryContract' =
                'HEADTEACHER_RELEASE_NOTIFICATION_V3'
            )
          )
          and "channel" in (
            'SMS'::"AppraisalNotificationChannel",
            'EMAIL'::"AppraisalNotificationChannel"
          )
          and (
            (
              "status" in (
                'PENDING'::"AppraisalNotificationStatus",
                'FAILED'::"AppraisalNotificationStatus"
              )
              and "nextAttemptAt" <= now()
              and (
                "channel" = 'SMS'::"AppraisalNotificationChannel"
                or "updatedAt" >= ${emailIdempotencyFloor}
              )
            )
            or
            (
              "status" = 'PROCESSING'::"AppraisalNotificationStatus"
              and "channel" = 'EMAIL'::"AppraisalNotificationChannel"
              and "lockedAt" is not null
              and "lockedAt" < ${staleBefore}
              and "lockedAt" >= ${emailIdempotencyFloor}
            )
          )
          and "attempts" < "maxAttempts"
        order by "priority" asc, "nextAttemptAt" asc, "createdAt" asc
        limit ${limit}
        for update skip locked
      )
      returning notification."id";
    `;

    const ids = claimedIds.map((row) => row.id);
    if (!ids.length) return [];

    return tx.appraisalNotification.findMany({
      where: {
        id: { in: ids },
        status: AppraisalNotificationStatus.PROCESSING,
        lockedBy: workerId,
      },
      orderBy: [
        { priority: "asc" },
        { nextAttemptAt: "asc" },
        { createdAt: "asc" },
      ],
    });
  });
}

export async function markAppraisalNotificationSent(input: {
  notificationId: string;
  workerId: string;
}) {
  const workerId = cleanWorkerId(input.workerId);
  return prisma.appraisalNotification.updateMany({
    where: {
      id: input.notificationId,
      status: AppraisalNotificationStatus.PROCESSING,
      lockedBy: workerId,
    },
    data: {
      status: AppraisalNotificationStatus.SENT,
      attempts: { increment: 1 },
      sentAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

export async function markAppraisalNotificationFailed(input: {
  notificationId: string;
  workerId: string;
  error: unknown;
  retryable: boolean;
}) {
  const workerId = cleanWorkerId(input.workerId);
  const existing = await prisma.appraisalNotification.findFirst({
    where: {
      id: input.notificationId,
      status: AppraisalNotificationStatus.PROCESSING,
      lockedBy: workerId,
    },
    select: {
      id: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!existing) return null;

  const attempts = existing.attempts + 1;
  const dead = !input.retryable || attempts >= existing.maxAttempts;
  const delayMinutes = Math.min(
    60,
    Math.pow(2, Math.max(0, attempts - 1)),
  );

  return prisma.appraisalNotification.update({
    where: { id: existing.id },
    data: {
      attempts,
      status: dead
        ? AppraisalNotificationStatus.DEAD
        : AppraisalNotificationStatus.FAILED,
      nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
      lockedAt: null,
      lockedBy: null,
      lastError: safeError(input.error),
    },
  });
}

export async function getAppraisalNotificationHealth(): Promise<AppraisalNotificationHealth> {
  const rows = await prisma.appraisalNotification.groupBy({
    by: ["channel", "status"],
    where: deliverableTypeWhere(),
    _count: { _all: true },
  });

  const health: AppraisalNotificationHealth = {
    inApp: emptyStatusRecord(),
    sms: emptyStatusRecord(),
    email: emptyStatusRecord(),
  };

  for (const row of rows) {
    const target =
      row.channel === AppraisalNotificationChannel.IN_APP
        ? health.inApp
        : row.channel === AppraisalNotificationChannel.SMS
          ? health.sms
          : health.email;

    target[row.status] = row._count._all;
  }

  return health;
}
