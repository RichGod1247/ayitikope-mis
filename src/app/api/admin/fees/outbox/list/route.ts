// src/app/api/admin/fees/outbox/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const [events, counts] = await Promise.all([
    prisma.financeOutboxEvent.findMany({
      where: {
        tenantId,
        type: FinanceOutboxEventType.SMS_RECEIPT,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.financeOutboxEvent.groupBy({
      by: ["status"],
      where: {
        tenantId,
        type: FinanceOutboxEventType.SMS_RECEIPT,
      },
      _count: { _all: true },
    }),
  ]);

  return jsonNoStore({
    ok: true,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      status: event.status,
      receiptNumber: readPayloadString(event.payload, "receiptNumber"),
      to: readPayloadString(event.payload, "to"),
      message: readPayloadString(event.payload, "message"),
      attempts: event.attempts,
      maxAttempts: event.maxAttempts,
      lastError: event.lastError,
      createdAt: event.createdAt,
      processedAt: event.processedAt,
      nextAttemptAt: event.nextAttemptAt,
    })),
  });
}