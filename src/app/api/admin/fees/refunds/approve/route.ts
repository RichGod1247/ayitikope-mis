// src/app/api/admin/fees/refunds/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { FinanceError } from "@/lib/finance/core";
import { approveFeeRefund } from "@/lib/finance/refunds";
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const limit = await checkRateLimit({
    scope: "admin_refund_approve",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 10,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/admin/fees/refunds/approve" },
  });

  if (!limit.ok) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as {
    refundId?: unknown;
    approvalNote?: unknown;
  } | null;

  const refundId = clean(body?.refundId);

  if (!refundId) {
    return json(400, { ok: false, error: "REFUND_ID_REQUIRED" });
  }

  try {
    const refund = await approveFeeRefund({
      tenantId: auth.ctx.tenantId,
      refundId,
      approvedByUserId: auth.ctx.userId,
      approvalNote: clean(body?.approvalNote) || null,
    });

    return json(200, { ok: true, refund });
  } catch (err) {
    if (err instanceof FinanceError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[REFUND_APPROVE_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_APPROVE_REFUND" });
  }
}