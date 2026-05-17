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
  tenantId?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  eventId?: string | null;
  staleProcessingAfterMinutes?: number;
};

function cleanIdempotencyKey(value: string): string {
  return String(value ?? "").trim().slice(0, 180);
}

function cleanWorkerId(value: string): string {
  return String(value ?? "finance-worker").trim().slice(0, 120);
}

function cleanOptional(value: unknown, max = 120): string | null {
  const cleaned = String(value ?? "").trim().slice(0, max);
  return cleaned || null;
}

function safePayload(payload: JsonInput | undefined): JsonInput {
  if (payload === undefined || payload === null) return {};
  return payload;
}

function isUniqueConstraintError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function canReviveStatus(status: FinanceOutboxStatus) {
  return (
    status === FinanceOutboxStatus.PENDING ||
    status === FinanceOutboxStatus.FAILED ||
    status === FinanceOutboxStatus.DEAD
  );
}

/**
 * Bank-grade idempotency rule:
 * - COMPLETED is never silently reopened.
 * - PROCESSING is never reset by enqueue; the worker stale-lock policy handles crashes.
 * - CANCELLED is not casually revived.
 * - PENDING/FAILED/DEAD may be refreshed because they represent incomplete work.
 */
export async function enqueueFinanceOutboxEvent(args: EnqueueFinanceOutboxArgs) {
  const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);

  if (!idempotencyKey) {
    throw new Error("Finance outbox idempotencyKey is required.");
  }

  try {
    return await prisma.financeOutboxEvent.create({
      data: {
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
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;

    const existing = await prisma.financeOutboxEvent.findUnique({
      where: {
        type_idempotencyKey: {
          type: args.type,
          idempotencyKey,
        },
      },
    });

    if (!existing) throw err;

    if (!canReviveStatus(existing.status)) {
      return existing;
    }

    return prisma.financeOutboxEvent.update({
      where: { id: existing.id },
      data: {
        tenantId: args.tenantId ?? existing.tenantId,
        aggregateType: args.aggregateType ?? existing.aggregateType,
        aggregateId: args.aggregateId ?? existing.aggregateId,
        payload: safePayload(args.payload),
        priority: args.priority ?? existing.priority,
        maxAttempts: args.maxAttempts ?? existing.maxAttempts,
        nextAttemptAt: args.nextAttemptAt ?? new Date(),
        status: FinanceOutboxStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastError: null,
      },
    });
  }
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

  const tenantId = cleanOptional(args.tenantId);
  const aggregateType = cleanOptional(args.aggregateType, 80);
  const aggregateId = cleanOptional(args.aggregateId);
  const eventId = cleanOptional(args.eventId);

  const staleMinutes = Math.max(5, Math.min(args.staleProcessingAfterMinutes ?? 15, 120));
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000);

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
          (
            (
              "status" in ('PENDING'::"FinanceOutboxStatus", 'FAILED'::"FinanceOutboxStatus")
              and "nextAttemptAt" <= now()
            )
            or
            (
              "status" = 'PROCESSING'::"FinanceOutboxStatus"
              and "lockedAt" is not null
              and "lockedAt" < ${staleBefore}
            )
          )
          and "attempts" < "maxAttempts"
          and (
            ${types.length} = 0
            or "type" = any(${types}::"FinanceOutboxEventType"[])
          )
          and (
            ${tenantId}::text is null
            or "tenantId" = ${tenantId}
          )
          and (
            ${aggregateType}::text is null
            or "aggregateType" = ${aggregateType}
          )
          and (
            ${aggregateId}::text is null
            or "aggregateId" = ${aggregateId}
          )
          and (
            ${eventId}::text is null
            or "id" = ${eventId}
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
      status: true,
    },
  });

  if (!existing) return null;

  if (
    existing.status === FinanceOutboxStatus.COMPLETED ||
    existing.status === FinanceOutboxStatus.CANCELLED
  ) {
    return null;
  }

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
  return prisma.$transaction(async (tx) => {
    const event = await tx.financeOutboxEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!event) {
      throw new Error("OUTBOX_EVENT_NOT_FOUND");
    }

    if (
      event.status === FinanceOutboxStatus.COMPLETED ||
      event.status === FinanceOutboxStatus.CANCELLED
    ) {
      throw new Error(`CANNOT_RETRY_${event.status}`);
    }

    if (event.status === FinanceOutboxStatus.PROCESSING) {
      throw new Error("CANNOT_RETRY_PROCESSING");
    }

    return tx.financeOutboxEvent.update({
      where: { id: event.id },
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
  });
}

export async function cancelFinanceOutboxEvent(eventId: string) {
  return prisma.financeOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: FinanceOutboxStatus.CANCELLED,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}