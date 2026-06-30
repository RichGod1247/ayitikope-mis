// src/lib/finance/outbox-worker.ts
import {
  FinanceOutboxEvent,
  FinanceOutboxEventType,
  FinanceOutboxStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
  claimFinanceOutboxEvents,
  markFinanceOutboxCompleted,
  markFinanceOutboxFailed,
} from "@/lib/finance/outbox";
import { reprocessPaymentProviderEvent } from "@/lib/finance/provider-event-recovery";

type WorkerResult = {
  claimed: number;
  completed: number;
  failed: number;
};

type OutboxHealthArgs = {
  tenantId?: string | null;
  types?: FinanceOutboxEventType[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { value: String(value) };
  }
}

function readProviderMessageId(result: unknown): string | null {
  if (!isRecord(result)) return null;

  return (
    readString(result, "messageId") ||
    readString(result, "providerMessageId") ||
    readString(result, "message_id") ||
    readString(result, "id")
  );
}

function readProviderStatus(result: unknown): number | null {
  if (!isRecord(result)) return null;

  return (
    readNumber(result, "status") ||
    readNumber(result, "providerStatus") ||
    readNumber(result, "statusCode")
  );
}

function readProviderStatusDescription(result: unknown): string | null {
  if (!isRecord(result)) return null;

  return (
    readString(result, "providerStatusDescription") ||
    readString(result, "statusDescription") ||
    readString(result, "description") ||
    readString(result, "message") ||
    readString(result, "error")
  );
}

async function handleSmsEvent(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("SMS outbox payload must be an object.");
  }

  const tenantId = event.tenantId ?? readString(event.payload, "tenantId");
  const to = readString(event.payload, "to");
  const message = readString(event.payload, "message");
  const actorId = readString(event.payload, "actorId");
  const template = readString(event.payload, "template");

  if (!tenantId) throw new Error("SMS outbox payload missing tenantId.");
  if (!to) throw new Error("SMS outbox payload missing to.");
  if (!message) throw new Error("SMS outbox payload missing message.");

  const result = await sendSms({
    tenantId,
    actorId,
    to,
    message,
    template,
    payload: event.payload,
  });

  if (!result.ok) {
    throw new Error(result.error ?? result.providerStatusDescription ?? "SMS send failed.");
  }
}

async function refreshMockResultsReleaseNotifyJob(args: {
  jobId: string;
  releaseId: string;
  lastError?: string | null;
}) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const [sentCount, failedCount, pendingCount, job] = await Promise.all([
      tx.mockResultsReleaseNotifyRecipient.count({
        where: { jobId: args.jobId, status: "SENT" },
      }),
      tx.mockResultsReleaseNotifyRecipient.count({
        where: { jobId: args.jobId, status: "FAILED" },
      }),
      tx.mockResultsReleaseNotifyRecipient.count({
        where: { jobId: args.jobId, status: "PENDING" },
      }),
      tx.mockResultsReleaseNotifyJob.findUnique({
        where: { id: args.jobId },
        select: {
          id: true,
          totalTargets: true,
          skippedCount: true,
        },
      }),
    ]);

    if (!job) return;

    const nextStatus =
      pendingCount > 0
        ? "PROCESSING"
        : failedCount > 0
          ? "FAILED"
          : "COMPLETED";

    await tx.mockResultsReleaseNotifyJob.update({
      where: { id: args.jobId },
      data: {
        status: nextStatus,
        sentCount,
        failedCount,
        lastError: args.lastError ?? undefined,
        startedAt: { set: now },
        completedAt: pendingCount === 0 ? now : null,
      },
    });

    if (pendingCount === 0 && failedCount === 0) {
      await tx.mockResultsRelease.update({
        where: { id: args.releaseId },
        data: {
          smsNotifiedAt: now,
        },
      });
    }
  });
}

async function handleMockResultsReleaseSmsEvent(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("Mock results release SMS payload must be an object.");
  }

  const tenantId = event.tenantId ?? readString(event.payload, "tenantId");
  const jobId = readString(event.payload, "jobId");
  const releaseId = readString(event.payload, "releaseId");
  const guardianPhoneNorm = readString(event.payload, "guardianPhoneNorm");
  const to = readString(event.payload, "to");
  const message =
    readString(event.payload, "message") || readString(event.payload, "body");

  if (!tenantId) throw new Error("Mock results SMS payload missing tenantId.");
  if (!jobId) throw new Error("Mock results SMS payload missing jobId.");
  if (!releaseId) throw new Error("Mock results SMS payload missing releaseId.");
  if (!guardianPhoneNorm) {
    throw new Error("Mock results SMS payload missing guardianPhoneNorm.");
  }
  if (!to) throw new Error("Mock results SMS payload missing to.");
  if (!message) throw new Error("Mock results SMS payload missing message/body.");

  const recipient = await prisma.mockResultsReleaseNotifyRecipient.findFirst({
    where: {
      jobId,
      tenantId,
      guardianPhoneNorm,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!recipient) {
    throw new Error("Mock results SMS recipient row was not found.");
  }

  if (recipient.status === "SENT") {
    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
    });
    return;
  }

  await prisma.mockResultsReleaseNotifyJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  const result = await sendSms({
    tenantId,
    actorId: readString(event.payload, "actorId"),
    to,
    message,
    template: readString(event.payload, "template") ?? "mock-results-release",
    payload: event.payload,
  });

  if (!result.ok) {
    const errorMessage =
      result.error ?? result.providerStatusDescription ?? "Mock results SMS send failed.";

    await prisma.mockResultsReleaseNotifyRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        providerMessageId: readProviderMessageId(result),
        providerStatus: readProviderStatus(result),
        providerStatusDescription:
          readProviderStatusDescription(result) ?? errorMessage,
        providerRaw: asJson(result),
      },
    });

    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
      lastError: errorMessage,
    });

    throw new Error(errorMessage);
  }

  await prisma.mockResultsReleaseNotifyRecipient.update({
    where: { id: recipient.id },
    data: {
      status: "SENT",
      providerMessageId: readProviderMessageId(result),
      providerStatus: readProviderStatus(result),
      providerStatusDescription: readProviderStatusDescription(result),
      providerRaw: asJson(result),
    },
  });

  await refreshMockResultsReleaseNotifyJob({
    jobId,
    releaseId,
  });
}

async function handleProviderEventReprocess(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("Provider event recovery payload must be an object.");
  }

  const eventId =
    readString(event.payload, "eventId") ||
    readString(event.payload, "paymentProviderEventId") ||
    event.aggregateId;

  if (!eventId) {
    throw new Error("Provider event recovery payload missing eventId.");
  }

  await reprocessPaymentProviderEvent({
    eventId,
    actorUserId: readString(event.payload, "actorUserId"),
  });
}

async function processFinanceOutboxEvent(event: FinanceOutboxEvent) {
  switch (event.type) {
    case FinanceOutboxEventType.SMS_RECEIPT:
    case FinanceOutboxEventType.SMS_REFUND_NOTICE:
    case FinanceOutboxEventType.SMS_ARREARS_NOTICE:
    case FinanceOutboxEventType.SMS_RESULTS_RELEASE:
      await handleSmsEvent(event);
      return;

    case FinanceOutboxEventType.SMS_MOCK_RESULTS_RELEASE:
      await handleMockResultsReleaseSmsEvent(event);
      return;

    case FinanceOutboxEventType.PAYSTACK_WEBHOOK_CHARGE_SUCCESS:
      await handleProviderEventReprocess(event);
      return;

    case FinanceOutboxEventType.PAYSTACK_WEBHOOK_TRANSFER_EVENT:
      throw new Error(
        "Transfer webhook recovery is not implemented in shared core yet. Keep this event failed/dead for admin review."
      );

    case FinanceOutboxEventType.SETTLEMENT_PAYOUT_VERIFY:
      throw new Error("Settlement payout verification handler not implemented yet.");

    case FinanceOutboxEventType.RECONCILIATION_RECHECK:
      throw new Error("Reconciliation recheck handler not implemented yet.");

    default:
      throw new Error(`Unknown finance outbox event type: ${String(event.type)}`);
  }
}

export async function runFinanceOutboxWorker(args?: {
  workerId?: string;
  limit?: number;
  types?: FinanceOutboxEventType[];
  tenantId?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  eventId?: string | null;
  staleProcessingAfterMinutes?: number;
}): Promise<WorkerResult> {
  const workerId = args?.workerId ?? `finance-worker-${process.pid}`;

  const events = await claimFinanceOutboxEvents({
    workerId,
    limit: args?.limit ?? 10,
    types: args?.types,
    tenantId: args?.tenantId,
    aggregateType: args?.aggregateType,
    aggregateId: args?.aggregateId,
    eventId: args?.eventId,
    staleProcessingAfterMinutes: args?.staleProcessingAfterMinutes ?? 15,
  });

  let completed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await processFinanceOutboxEvent(event);
      await markFinanceOutboxCompleted(event.id);
      completed += 1;
    } catch (error) {
      await markFinanceOutboxFailed(event.id, error);
      failed += 1;
    }
  }

  return {
    claimed: events.length,
    completed,
    failed,
  };
}

export async function getFinanceOutboxHealth(args?: OutboxHealthArgs) {
  const where = {
    ...(args?.tenantId ? { tenantId: args.tenantId } : {}),
    ...(args?.types?.length ? { type: { in: args.types } } : {}),
  };

  const rows = await prisma.financeOutboxEvent.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const base: Record<FinanceOutboxStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    DEAD: 0,
    CANCELLED: 0,
  };

  for (const row of rows) {
    base[row.status] = row._count._all;
  }

  return {
    pending: base.PENDING,
    processing: base.PROCESSING,
    completed: base.COMPLETED,
    failed: base.FAILED,
    dead: base.DEAD,
    cancelled: base.CANCELLED,
  };
}