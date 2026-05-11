// src/app/api/admin/fees/refunds/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import { FinanceError } from "@/lib/finance/core";
import { syncPaystackRefundStatus } from "@/lib/finance/refunds";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const limit = await checkRateLimit({
    scope: "admin_refund_sync",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 15,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/admin/fees/refunds/sync" },
  });

  if (!limit.ok) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as {
    refundId?: unknown;
  } | null;

  const refundId = clean(body?.refundId);

  if (!refundId) {
    return json(400, { ok: false, error: "REFUND_ID_REQUIRED" });
  }

  try {
    const refund = await syncPaystackRefundStatus({
      tenantId: auth.ctx.tenantId,
      refundId,
      actorUserId: auth.ctx.userId,
    });

    const smsDispatch = await runFinanceOutboxWorker({
      workerId: `refund-sync:${refundId}`,
      limit: 2,
      types: [FinanceOutboxEventType.SMS_REFUND_NOTICE],
      tenantId: auth.ctx.tenantId,
      aggregateType: "FeeRefund",
      aggregateId: refundId,
    });

    return json(200, {
      ok: true,
      refund,
      smsDispatch,
    });
  } catch (err) {
    if (err instanceof FinanceError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[REFUND_SYNC_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_SYNC_REFUND",
    });
  }
}