import {
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const HEADTEACHER_APPRAISAL_MESSAGE_POLICY = {
  supportedType: AppraisalNotificationType.PARTICIPATION_APPRECIATION,
  channel: AppraisalNotificationChannel.IN_APP,
  deliveredStatus: AppraisalNotificationStatus.SENT,
  readReceiptKey: "inAppReceipt",
  maximumInboxItems: 50,
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 15_000,
} as const;

type JsonRecord = Record<string, unknown>;

export type HeadteacherAppraisalMessage = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type HeadteacherAppraisalMessageSummary = {
  total: number;
  unread: number;
  latest: {
    id: string;
    title: string;
    sentAt: string | null;
    createdAt: string;
  } | null;
};

export type HeadteacherAppraisalMessageInbox = {
  items: HeadteacherAppraisalMessage[];
  count: number;
  unread: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function payloadString(payload: Prisma.JsonValue, key: string) {
  const candidate = objectValue(payload)[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function safeInternalHref(payload: Prisma.JsonValue) {
  const raw = payloadString(payload, "href");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;

  try {
    const base = new URL("https://edulife.local");
    const resolved = new URL(raw, base);

    if (resolved.origin !== base.origin || !resolved.pathname.startsWith("/")) {
      return null;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function readAtFromPayload(payload: Prisma.JsonValue) {
  const receipt = objectValue(
    objectValue(payload)[HEADTEACHER_APPRAISAL_MESSAGE_POLICY.readReceiptKey],
  );
  const raw = typeof receipt.readAt === "string" ? receipt.readAt.trim() : "";
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function titleFromPayload(payload: Prisma.JsonValue) {
  return payloadString(payload, "title") || "Appraisal message";
}

function messageFromPayload(payload: Prisma.JsonValue) {
  return (
    payloadString(payload, "message") ||
    "A new appraisal-related message is available in EduLife OS."
  );
}

const MESSAGE_WHERE = {
  channel: HEADTEACHER_APPRAISAL_MESSAGE_POLICY.channel,
  type: HEADTEACHER_APPRAISAL_MESSAGE_POLICY.supportedType,
  status: HEADTEACHER_APPRAISAL_MESSAGE_POLICY.deliveredStatus,
} as const;

function mapMessage(row: {
  id: string;
  payload: Prisma.JsonValue;
  sentAt: Date | null;
  createdAt: Date;
}): HeadteacherAppraisalMessage {
  return {
    id: row.id,
    title: titleFromPayload(row.payload),
    message: messageFromPayload(row.payload),
    href: safeInternalHref(row.payload),
    readAt: readAtFromPayload(row.payload),
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getHeadteacherAppraisalMessageSummary(input: {
  actorUserId: string;
}): Promise<HeadteacherAppraisalMessageSummary> {
  const actorUserId = clean(input.actorUserId);
  if (!actorUserId) {
    return { total: 0, unread: 0, latest: null };
  }

  const rows = await prisma.appraisalNotification.findMany({
    where: {
      recipientUserId: actorUserId,
      ...MESSAGE_WHERE,
    },
    select: {
      id: true,
      payload: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });

  const unread = rows.reduce(
    (count, row) => count + (readAtFromPayload(row.payload) ? 0 : 1),
    0,
  );
  const latest = rows[0] ?? null;

  return {
    total: rows.length,
    unread,
    latest: latest
      ? {
          id: latest.id,
          title: titleFromPayload(latest.payload),
          sentAt: latest.sentAt?.toISOString() ?? null,
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
  };
}

export async function listHeadteacherAppraisalMessages(input: {
  actorUserId: string;
  take?: number;
}): Promise<HeadteacherAppraisalMessageInbox> {
  const actorUserId = clean(input.actorUserId);
  if (!actorUserId) {
    return { items: [], count: 0, unread: 0 };
  }

  const requestedTake = Number(input.take ?? 20);
  const take = Number.isFinite(requestedTake)
    ? Math.max(
        1,
        Math.min(
          HEADTEACHER_APPRAISAL_MESSAGE_POLICY.maximumInboxItems,
          Math.floor(requestedTake),
        ),
      )
    : 20;

  const rows = await prisma.appraisalNotification.findMany({
    where: {
      recipientUserId: actorUserId,
      ...MESSAGE_WHERE,
    },
    select: {
      id: true,
      payload: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take,
  });

  const items = rows.map(mapMessage);

  return {
    items,
    count: items.length,
    unread: items.filter((item) => !item.readAt).length,
  };
}

export async function markHeadteacherAppraisalMessageRead(input: {
  actorUserId: string;
  notificationId: string;
  now?: Date;
}) {
  const actorUserId = clean(input.actorUserId);
  const notificationId = clean(input.notificationId);
  const now = input.now ? new Date(input.now) : new Date();

  if (!actorUserId || !notificationId) {
    const error = new Error("APPRAISAL_MESSAGE_NOT_FOUND") as Error & {
      code?: string;
      status?: number;
    };
    error.code = "APPRAISAL_MESSAGE_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const row = await tx.appraisalNotification.findFirst({
        where: {
          id: notificationId,
          recipientUserId: actorUserId,
          ...MESSAGE_WHERE,
        },
        select: {
          id: true,
          payload: true,
        },
      });

      if (!row) {
        const error = new Error("APPRAISAL_MESSAGE_NOT_FOUND") as Error & {
          code?: string;
          status?: number;
        };
        error.code = "APPRAISAL_MESSAGE_NOT_FOUND";
        error.status = 404;
        throw error;
      }

      const existingReadAt = readAtFromPayload(row.payload);
      if (existingReadAt) {
        return {
          outcome: "ALREADY_READ" as const,
          readAt: existingReadAt,
        };
      }

      const payload = objectValue(row.payload);
      const existingReceipt = objectValue(
        payload[HEADTEACHER_APPRAISAL_MESSAGE_POLICY.readReceiptKey],
      );
      const readAt = now.toISOString();

      await tx.appraisalNotification.update({
        where: { id: row.id },
        data: {
          payload: {
            ...payload,
            [HEADTEACHER_APPRAISAL_MESSAGE_POLICY.readReceiptKey]: {
              ...existingReceipt,
              readAt,
            },
          } as Prisma.InputJsonObject,
        },
      });

      return {
        outcome: "MARKED_READ" as const,
        readAt,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: HEADTEACHER_APPRAISAL_MESSAGE_POLICY.transactionMaxWaitMs,
      timeout: HEADTEACHER_APPRAISAL_MESSAGE_POLICY.transactionTimeoutMs,
    },
  );
}
