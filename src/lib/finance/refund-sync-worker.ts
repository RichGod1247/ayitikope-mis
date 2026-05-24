// src/lib/finance/refund-sync-worker.ts
import {
  FinanceOutboxEventType,
  PaymentProvider,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FinanceError } from "@/lib/finance/core";
import { syncPaystackRefundStatus } from "@/lib/finance/refunds";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_MIN_AGE_MINUTES = 2;
const MAX_MIN_AGE_MINUTES = 180;

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function errorCode(error: unknown) {
  if (error instanceof FinanceError) return error.code;
  if (error instanceof Error) return error.message;
  return String(error || "UNKNOWN_ERROR");
}

function terminalRefundStatus(status: RefundStatus | string | null | undefined) {
  return (
    status === RefundStatus.SUCCEEDED ||
    status === RefundStatus.FAILED ||
    status === RefundStatus.CANCELLED
  );
}

function staleProcessingWhere(args?: {
  tenantId?: string | null;
  minAgeMinutes?: number;
}): Prisma.FeeRefundWhereInput {
  const tenantId = clean(args?.tenantId);
  const minAgeMinutes = clampInt(
    args?.minAgeMinutes,
    DEFAULT_MIN_AGE_MINUTES,
    1,
    MAX_MIN_AGE_MINUTES
  );

  const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);

  return {
    provider: PaymentProvider.PAYSTACK,
    status: RefundStatus.PROCESSING,
    ...(tenantId ? { tenantId } : {}),
    AND: [
      {
        OR: [
          { providerRefundReference: { not: null } },
          { providerReference: { not: null } },
        ],
      },
      {
        OR: [
          { processingAt: { lte: cutoff } },
          { processingAt: null, updatedAt: { lte: cutoff } },
        ],
      },
    ],
  };
}

export async function getPaystackRefundSyncHealth(args?: {
  tenantId?: string | null;
  minAgeMinutes?: number;
}) {
  const tenantId = clean(args?.tenantId);
  const minAgeMinutes = clampInt(
    args?.minAgeMinutes,
    DEFAULT_MIN_AGE_MINUTES,
    1,
    MAX_MIN_AGE_MINUTES
  );

  const baseWhere: Prisma.FeeRefundWhereInput = {
    provider: PaymentProvider.PAYSTACK,
    ...(tenantId ? { tenantId } : {}),
  };

  const staleWhere = staleProcessingWhere({ tenantId, minAgeMinutes });

  const [processing, staleProcessing, succeeded, failed] = await Promise.all([
    prisma.feeRefund.count({
      where: {
        ...baseWhere,
        status: RefundStatus.PROCESSING,
      },
    }),
    prisma.feeRefund.count({ where: staleWhere }),
    prisma.feeRefund.count({
      where: {
        ...baseWhere,
        status: RefundStatus.SUCCEEDED,
      },
    }),
    prisma.feeRefund.count({
      where: {
        ...baseWhere,
        status: RefundStatus.FAILED,
      },
    }),
  ]);

  return {
    provider: "PAYSTACK",
    processing,
    staleProcessing,
    succeeded,
    failed,
    minAgeMinutes,
    staleCutoff: new Date(Date.now() - minAgeMinutes * 60_000).toISOString(),
  };
}

export async function runPaystackRefundSyncWorker(args?: {
  workerId?: string;
  tenantId?: string | null;
  limit?: number;
  minAgeMinutes?: number;
}) {
  const workerId = clean(args?.workerId || "paystack-refund-sync-cron", 120);
  const tenantId = clean(args?.tenantId);
  const limit = clampInt(args?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const minAgeMinutes = clampInt(
    args?.minAgeMinutes,
    DEFAULT_MIN_AGE_MINUTES,
    1,
    MAX_MIN_AGE_MINUTES
  );

  const candidates = await prisma.feeRefund.findMany({
    where: staleProcessingWhere({ tenantId, minAgeMinutes }),
    orderBy: [{ processingAt: "asc" }, { updatedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      tenantId: true,
      status: true,
      providerReference: true,
      providerRefundReference: true,
      amountPesewas: true,
      processingAt: true,
      updatedAt: true,
    },
  });

  let synced = 0;
  let terminal = 0;
  let failed = 0;
  let smsCompleted = 0;
  let smsFailed = 0;

  const items: Array<{
    refundId: string;
    tenantId: string;
    beforeStatus: RefundStatus;
    afterStatus: RefundStatus | null;
    ok: boolean;
    terminal: boolean;
    error?: string;
    smsDispatch?: unknown;
  }> = [];

  for (const refund of candidates) {
    try {
      await syncPaystackRefundStatus({
        tenantId: refund.tenantId,
        refundId: refund.id,
        actorUserId: null,
      });

      synced += 1;

      const after = await prisma.feeRefund.findUnique({
        where: { id: refund.id },
        select: {
          status: true,
        },
      });

      const isTerminal = terminalRefundStatus(after?.status);
      if (isTerminal) terminal += 1;

      const smsDispatch = await runFinanceOutboxWorker({
        workerId: `${workerId}:sms:${refund.id}`,
        limit: 2,
        types: [FinanceOutboxEventType.SMS_REFUND_NOTICE],
        tenantId: refund.tenantId,
        aggregateType: "FeeRefund",
        aggregateId: refund.id,
        staleProcessingAfterMinutes: 15,
      });

      smsCompleted += smsDispatch.completed;
      smsFailed += smsDispatch.failed;

      items.push({
        refundId: refund.id,
        tenantId: refund.tenantId,
        beforeStatus: refund.status,
        afterStatus: after?.status ?? null,
        ok: true,
        terminal: isTerminal,
        smsDispatch,
      });
    } catch (error) {
      failed += 1;

      items.push({
        refundId: refund.id,
        tenantId: refund.tenantId,
        beforeStatus: refund.status,
        afterStatus: null,
        ok: false,
        terminal: false,
        error: errorCode(error).slice(0, 500),
      });

      console.error("[PAYSTACK_REFUND_SYNC_WORKER_ITEM_FAILED]", {
        workerId,
        refundId: refund.id,
        tenantId: refund.tenantId,
        error,
      });
    }
  }

  return {
    workerId,
    provider: "PAYSTACK",
    scanned: candidates.length,
    attempted: candidates.length,
    synced,
    terminal,
    failed,
    smsCompleted,
    smsFailed,
    minAgeMinutes,
    items,
  };
}