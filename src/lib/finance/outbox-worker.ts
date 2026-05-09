// src/lib/finance/outbox-worker.ts
import {
  FinanceOutboxEvent,
  FinanceOutboxEventType,
  FinanceOutboxStatus,
} from "@prisma/client";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
}): Promise<WorkerResult> {
  const workerId = args?.workerId ?? `finance-worker-${process.pid}`;

  const events = await claimFinanceOutboxEvents({
    workerId,
    limit: args?.limit ?? 10,
    types: args?.types,
    tenantId: args?.tenantId,
    aggregateType: args?.aggregateType,
    aggregateId: args?.aggregateId,
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

export async function getFinanceOutboxHealth() {
  return {
    pending: await countByStatus(FinanceOutboxStatus.PENDING),
    processing: await countByStatus(FinanceOutboxStatus.PROCESSING),
    failed: await countByStatus(FinanceOutboxStatus.FAILED),
    dead: await countByStatus(FinanceOutboxStatus.DEAD),
  };
}

async function countByStatus(status: FinanceOutboxStatus) {
  const { prisma } = await import("@/lib/prisma");

  return prisma.financeOutboxEvent.count({
    where: { status },
  });
}