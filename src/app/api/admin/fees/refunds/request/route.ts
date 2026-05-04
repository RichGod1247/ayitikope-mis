// src/app/api/admin/fees/refunds/request/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { FinanceError } from "@/lib/finance/core";
import { requestFeeRefund } from "@/lib/finance/refunds";
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

function amount(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : NaN;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const limit = await checkRateLimit({
    scope: "admin_refund_request",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 12,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/admin/fees/refunds/request" },
  });
  if (!limit.ok) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as {
    feePaymentId?: unknown;
    amountPesewas?: unknown;
    reason?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const feePaymentId = clean(body?.feePaymentId);
  const amountPesewas = amount(body?.amountPesewas);
  const reason = clean(body?.reason);
  const suppliedKey = clean(req.headers.get("x-idempotency-key") ?? body?.idempotencyKey);

  if (!feePaymentId) return json(400, { ok: false, error: "FEE_PAYMENT_ID_REQUIRED" });
  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return json(400, { ok: false, error: "REFUND_AMOUNT_INVALID" });
  }
  if (!reason) return json(400, { ok: false, error: "REFUND_REASON_REQUIRED" });

  const idempotencyKey =
    suppliedKey ||
    crypto
      .createHash("sha256")
      .update([auth.ctx.tenantId, feePaymentId, amountPesewas, reason, auth.ctx.userId].join(":"))
      .digest("hex");

  try {
    const refund = await requestFeeRefund({
      tenantId: auth.ctx.tenantId,
      feePaymentId,
      amountPesewas,
      reason,
      requestedByUserId: auth.ctx.userId,
      idempotencyKey,
    });

    return json(201, { ok: true, refund });
  } catch (err) {
    if (err instanceof FinanceError) return json(err.status, { ok: false, error: err.code });
    console.error("[REFUND_REQUEST_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_REQUEST_REFUND" });
  }
}