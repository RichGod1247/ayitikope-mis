// src/app/api/admin/fees/outbox/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType, FinanceOutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ADMIN_OUTBOX_TYPES: FinanceOutboxEventType[] = [
  FinanceOutboxEventType.SMS_RECEIPT,
  FinanceOutboxEventType.SMS_REFUND_NOTICE,
  FinanceOutboxEventType.SMS_ARREARS_NOTICE,
  FinanceOutboxEventType.SMS_RESULTS_RELEASE,
];

const SAFE_STATUSES = new Set<string>([
  FinanceOutboxStatus.PENDING,
  FinanceOutboxStatus.PROCESSING,
  FinanceOutboxStatus.COMPLETED,
  FinanceOutboxStatus.FAILED,
  FinanceOutboxStatus.DEAD,
  FinanceOutboxStatus.CANCELLED,
]);

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function readPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPayloadNumber(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);
  const rawType = url.searchParams.get("type")?.trim() ?? "";
  const rawStatus = url.searchParams.get("status")?.trim() ?? "";

  const selectedTypes =
    rawType && SAFE_ADMIN_OUTBOX_TYPES.includes(rawType as FinanceOutboxEventType)
      ? [rawType as FinanceOutboxEventType]
      : SAFE_ADMIN_OUTBOX_TYPES;

  const selectedStatus = SAFE_STATUSES.has(rawStatus) ? (rawStatus as FinanceOutboxStatus) : null;

  const where = {
    tenantId,
    type: { in: selectedTypes },
    ...(selectedStatus ? { status: selectedStatus } : {}),
  };

  const [events, counts, typeCounts] = await Promise.all([
    prisma.financeOutboxEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.financeOutboxEvent.groupBy({
      by: ["status"],
      where: {
        tenantId,
        type: { in: SAFE_ADMIN_OUTBOX_TYPES },
      },
      _count: { _all: true },
    }),
    prisma.financeOutboxEvent.groupBy({
      by: ["type"],
      where: {
        tenantId,
        type: { in: SAFE_ADMIN_OUTBOX_TYPES },
      },
      _count: { _all: true },
    }),
  ]);

  return jsonNoStore({
    ok: true,
    safeTypes: SAFE_ADMIN_OUTBOX_TYPES,
    selectedTypes,
    selectedStatus,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    typeCounts: Object.fromEntries(typeCounts.map((c) => [c.type, c._count._all])),
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      status: event.status,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      receiptNumber: readPayloadString(event.payload, "receiptNumber"),
      refundId: readPayloadString(event.payload, "refundId"),
      studentName: readPayloadString(event.payload, "studentName"),
      to: readPayloadString(event.payload, "to"),
      message: readPayloadString(event.payload, "message"),
      amountPesewas:
        readPayloadNumber(event.payload, "amountPesewas") ??
        readPayloadNumber(event.payload, "netAmountPesewas"),
      attempts: event.attempts,
      maxAttempts: event.maxAttempts,
      lastError: event.lastError,
      createdAt: event.createdAt.toISOString(),
      lockedAt: event.lockedAt?.toISOString() ?? null,
      lockedBy: event.lockedBy,
      processedAt: event.processedAt?.toISOString() ?? null,
      nextAttemptAt: event.nextAttemptAt.toISOString(),
    })),
  });
}