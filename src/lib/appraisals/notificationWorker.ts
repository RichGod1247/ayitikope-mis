// src/lib/appraisals/notificationWorker.ts
import {
  AppraisalNotification,
  AppraisalNotificationChannel,
  Prisma,
} from "@prisma/client";
import { sendEmail } from "@/lib/email/sendEmail";
import { sendSms } from "@/lib/sms";
import {
  claimAppraisalNotifications,
  getAppraisalNotificationHealth,
  markAppraisalNotificationFailed,
  markAppraisalNotificationSent,
  quarantineAmbiguousAppraisalNotifications,
} from "@/lib/appraisals/notificationOutbox";

type DeliveryPayload = {
  destination: string;
  text: string;
  subject?: string;
  template?: string;
};

const DEFAULT_APPRAISAL_SMS_DELIVERY = {
  template: "director-feedback-cycle-opened",
} as const;

export type AppraisalNotificationWorkerResult = {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  ambiguousSmsDead: number;
  expiredEmailDead: number;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(
  value: Record<string, unknown>,
  key: string,
) {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function deliveryPayload(
  payload: Prisma.JsonValue,
): DeliveryPayload {
  if (!isRecord(payload) || !isRecord(payload.delivery)) {
    throw new Error("APPRAISAL_NOTIFICATION_DELIVERY_PAYLOAD_MISSING");
  }

  const destination = readString(
    payload.delivery,
    "destination",
  );
  const text = readString(payload.delivery, "text");
  const subject = readString(payload.delivery, "subject");
  const template = readString(payload.delivery, "template");

  if (!destination) {
    throw new Error(
      "APPRAISAL_NOTIFICATION_DESTINATION_MISSING",
    );
  }

  if (!text) {
    throw new Error(
      "APPRAISAL_NOTIFICATION_MESSAGE_MISSING",
    );
  }

  return {
    destination,
    text,
    subject: subject ?? undefined,
    template: template ?? undefined,
  };
}

async function deliverSms(
  notification: AppraisalNotification,
) {
  const delivery = deliveryPayload(notification.payload);

  if (!notification.recipientTenantId) {
    throw new Error(
      "APPRAISAL_NOTIFICATION_SMS_TENANT_MISSING",
    );
  }

  const result = await sendSms({
    tenantId: notification.recipientTenantId,
    actorId: null,
    to: delivery.destination,
    message: delivery.text,
    template: delivery.template ?? DEFAULT_APPRAISAL_SMS_DELIVERY.template,
    payload: {
      notificationId: notification.id,
      cycleId: notification.cycleId,
      type: notification.type,
      channel: notification.channel,
      idempotencyKey: notification.idempotencyKey,
    },
  });

  if (!result.ok) {
    const providerDescription =
      "providerStatusDescription" in result &&
      typeof result.providerStatusDescription === "string"
        ? result.providerStatusDescription
        : null;

    throw new Error(
      result.error ??
        providerDescription ??
        "APPRAISAL_NOTIFICATION_SMS_NOT_ACCEPTED",
    );
  }
}

async function deliverEmail(
  notification: AppraisalNotification,
) {
  const delivery = deliveryPayload(notification.payload);

  if (!delivery.subject) {
    throw new Error(
      "APPRAISAL_NOTIFICATION_EMAIL_SUBJECT_MISSING",
    );
  }

  const result = await sendEmail({
    to: delivery.destination,
    subject: delivery.subject,
    text: delivery.text,
    idempotencyKey: notification.idempotencyKey,
    meta: {
      notificationId: notification.id,
      cycleId: notification.cycleId,
      type: notification.type,
      channel: notification.channel,
    },
  });

  if (!result.ok) {
    throw new Error(
      result.error ??
        "APPRAISAL_NOTIFICATION_EMAIL_NOT_ACCEPTED",
    );
  }
}

async function deliverNotification(
  notification: AppraisalNotification,
) {
  if (
    notification.channel ===
    AppraisalNotificationChannel.SMS
  ) {
    await deliverSms(notification);
    return;
  }

  if (
    notification.channel ===
    AppraisalNotificationChannel.EMAIL
  ) {
    await deliverEmail(notification);
    return;
  }

  throw new Error(
    `APPRAISAL_NOTIFICATION_CHANNEL_NOT_DELIVERABLE:${notification.channel}`,
  );
}

export async function runAppraisalNotificationWorker(input?: {
  workerId?: string;
  limit?: number;
  staleProcessingAfterMinutes?: number;
}): Promise<AppraisalNotificationWorkerResult> {
  const workerId =
    String(
      input?.workerId ??
        `appraisal-notification-worker-${process.pid}`,
    )
      .trim()
      .slice(0, 120) ||
    `appraisal-notification-worker-${process.pid}`;

  const quarantine =
    await quarantineAmbiguousAppraisalNotifications({
      staleProcessingAfterMinutes:
        input?.staleProcessingAfterMinutes ?? 15,
    });

  const notifications = await claimAppraisalNotifications({
    workerId,
    limit: input?.limit ?? 20,
    staleProcessingAfterMinutes:
      input?.staleProcessingAfterMinutes ?? 15,
  });

  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const notification of notifications) {
    try {
      await deliverNotification(notification);

      const updated = await markAppraisalNotificationSent({
        notificationId: notification.id,
        workerId,
      });

      if (updated.count === 1) sent += 1;
    } catch (error) {
      const retryable =
        notification.channel ===
        AppraisalNotificationChannel.EMAIL;

      const updated =
        await markAppraisalNotificationFailed({
          notificationId: notification.id,
          workerId,
          error,
          retryable,
        });

      if (updated?.status === "DEAD") {
        dead += 1;
      } else if (updated) {
        failed += 1;
      }
    }
  }

  return {
    claimed: notifications.length,
    sent,
    failed,
    dead,
    ambiguousSmsDead:
      quarantine.ambiguousSmsDead,
    expiredEmailDead:
      quarantine.expiredEmailDead,
  };
}

export { getAppraisalNotificationHealth };
