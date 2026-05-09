// src/app/api/admin/fees/refunds/execute/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import { FinanceError } from "@/lib/finance/core";
import { executeApprovedFeeRefund } from "@/lib/finance/refunds";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const limit = await checkRateLimit({
    scope: "admin_refund_execute",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 8,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/admin/fees/refunds/execute" },
  });
  if (!limit.ok) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as { refundId?: unknown } | null;
  const refundId = clean(body?.refundId);

  if (!refundId) return json(400, { ok: false, error: "REFUND_ID_REQUIRED" });

  try {
    const refund = await executeApprovedFeeRefund({
      tenantId: auth.ctx.tenantId,
      refundId,
      actorUserId: auth.ctx.userId,
    });

    const smsDispatch = await runFinanceOutboxWorker({
      workerId: `refund-execute:${refundId}`,
      limit: 1,
      types: [FinanceOutboxEventType.SMS_REFUND_NOTICE],
      tenantId: auth.ctx.tenantId,
      aggregateType: "FeeRefund",
      aggregateId: refundId,
    });

    return json(200, { ok: true, refund, smsDispatch });
  } catch (err) {
    if (err instanceof FinanceError) return json(err.status, { ok: false, error: err.code });
    console.error("[REFUND_EXECUTE_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_EXECUTE_REFUND" });
  }
}