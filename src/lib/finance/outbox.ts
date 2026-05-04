// src/lib/finance/outbox.ts
import {
  FinanceOutboxEventType,
  FinanceOutboxStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type JsonInput = Prisma.InputJsonValue;

type EnqueueFinanceOutboxArgs = {
  tenantId?: string | null;
  type: FinanceOutboxEventType;
  idempotencyKey: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: JsonInput;
  priority?: number;
  maxAttempts?: number;
  nextAttemptAt?: Date;
};

type ClaimFinanceOutboxArgs = {
  workerId: string;
  limit?: number;
  types?: FinanceOutboxEventType[];
};

function cleanIdempotencyKey(value: string): string {
  return String(value ?? "").trim().slice(0, 180);
}

function cleanWorkerId(value: string): string {
  return String(value ?? "finance-worker").trim().slice(0, 120);
}

function safePayload(payload: JsonInput | undefined): JsonInput {
  if (payload === undefined || payload === null) return {};
  return payload;
}

export async function enqueueFinanceOutboxEvent(args: EnqueueFinanceOutboxArgs) {
  const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);

  if (!idempotencyKey) {
    throw new Error("Finance outbox idempotencyKey is required.");
  }

  return prisma.financeOutboxEvent.upsert({
    where: {
      type_idempotencyKey: {
        type: args.type,
        idempotencyKey,
      },
    },
    create: {
      tenantId: args.tenantId ?? null,
      type: args.type,
      idempotencyKey,
      aggregateType: args.aggregateType ?? null,
      aggregateId: args.aggregateId ?? null,
      payload: safePayload(args.payload),
      priority: args.priority ?? 5,
      maxAttempts: args.maxAttempts ?? 5,
      nextAttemptAt: args.nextAttemptAt ?? new Date(),
      status: FinanceOutboxStatus.PENDING,
    },
    update: {
      tenantId: args.tenantId ?? null,
      aggregateType: args.aggregateType ?? null,
      aggregateId: args.aggregateId ?? null,
      payload: safePayload(args.payload),
      priority: args.priority ?? 5,
      maxAttempts: args.maxAttempts ?? 5,
      nextAttemptAt: args.nextAttemptAt ?? new Date(),
      status: FinanceOutboxStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      lastError: null,
    },
  });
}

export async function enqueueProviderEventRecoveryOutbox(args: {
  tenantId?: string | null;
  eventId: string;
  actorUserId?: string | null;
  nextAttemptAt?: Date;
}) {
  const eventId = String(args.eventId ?? "").trim();

  if (!eventId) {
    throw new Error("eventId is required for provider event recovery outbox.");
  }

  return enqueueFinanceOutboxEvent({
    tenantId: args.tenantId ?? null,
    type: FinanceOutboxEventType.PAYSTACK_WEBHOOK_CHARGE_SUCCESS,
    idempotencyKey: `provider-event-reprocess:${eventId}`,
    aggregateType: "PaymentProviderEvent",
    aggregateId: eventId,
    payload: {
      eventId,
      actorUserId: args.actorUserId ?? null,
    },
    priority: 2,
    maxAttempts: 5,
    nextAttemptAt: args.nextAttemptAt ?? new Date(),
  });
}

export async function claimFinanceOutboxEvents(args: ClaimFinanceOutboxArgs) {
  const limit = Math.max(1, Math.min(args.limit ?? 10, 50));
  const workerId = cleanWorkerId(args.workerId);
  const types = args.types ?? [];

  return prisma.$transaction(async (tx) => {
    const claimedIds = await tx.$queryRaw<Array<{ id: string }>>`
      update "FinanceOutboxEvent" foe
      set
        "status" = 'PROCESSING'::"FinanceOutboxStatus",
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "updatedAt" = now()
      where foe."id" in (
        select "id"
        from "FinanceOutboxEvent"
        where
          "status" in ('PENDING'::"FinanceOutboxStatus", 'FAILED'::"FinanceOutboxStatus")
          and "nextAttemptAt" <= now()
          and "attempts" < "maxAttempts"
          and (
            ${types.length} = 0
            or "type" = any(${types}::"FinanceOutboxEventType"[])
          )
        order by "priority" asc, "nextAttemptAt" asc, "createdAt" asc
        limit ${limit}
        for update skip locked
      )
      returning foe."id";
    `;

    const ids = claimedIds.map((row) => row.id);
    if (!ids.length) return [];

    return tx.financeOutboxEvent.findMany({
      where: {
        id: { in: ids },
        status: FinanceOutboxStatus.PROCESSING,
        lockedBy: workerId,
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  });
}

export async function markFinanceOutboxCompleted(eventId: string) {
  return prisma.financeOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: FinanceOutboxStatus.COMPLETED,
      processedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

export async function markFinanceOutboxFailed(eventId: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);

  const existing = await prisma.financeOutboxEvent.findUnique({
    where: { id: eventId },
    select: {
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!existing) return null;

  const attempts = existing.attempts + 1;
  const isDead = attempts >= existing.maxAttempts;
  const delayMinutes = Math.min(60, Math.pow(2, Math.max(0, attempts - 1)));

  return prisma.financeOutboxEvent.update({
    where: { id: eventId },
    data: {
      attempts,
      status: isDead ? FinanceOutboxStatus.DEAD : FinanceOutboxStatus.FAILED,
      lastError: msg.slice(0, 5000),
      nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export async function retryFinanceOutboxEvent(eventId: string) {
  return prisma.financeOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: FinanceOutboxStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      processedAt: null,
    },
  });
}

export async function cancelFinanceOutboxEvent(eventId: string) {
  return prisma.financeOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: FinanceOutboxStatus.CANCELLED,
      lockedAt: null,
      lockedBy: null,
    },
  });
}