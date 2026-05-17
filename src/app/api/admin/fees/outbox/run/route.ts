// src/app/api/admin/fees/outbox/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  getFinanceOutboxHealth,
  runFinanceOutboxWorker,
} from "@/lib/finance/outbox-worker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ADMIN_OUTBOX_TYPES: FinanceOutboxEventType[] = [
  FinanceOutboxEventType.SMS_RECEIPT,
  FinanceOutboxEventType.SMS_REFUND_NOTICE,
  FinanceOutboxEventType.SMS_ARREARS_NOTICE,
  FinanceOutboxEventType.SMS_RESULTS_RELEASE,
];

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const limit = await checkRateLimit({
    scope: "admin_finance_outbox_run",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 20,
    windowSeconds: 60,
    blockSeconds: 300,
    metadata: { route: "/api/admin/fees/outbox/run" },
  });

  if (!limit.ok) return rateLimitResponse(limit);

  const before = await getFinanceOutboxHealth({
    tenantId: auth.ctx.tenantId,
    types: SAFE_ADMIN_OUTBOX_TYPES,
  });

  const result = await runFinanceOutboxWorker({
    workerId: `admin-outbox-run:${auth.ctx.userId}`,
    limit: 10,
    types: SAFE_ADMIN_OUTBOX_TYPES,
    tenantId: auth.ctx.tenantId,
    staleProcessingAfterMinutes: 15,
  });

  const after = await getFinanceOutboxHealth({
    tenantId: auth.ctx.tenantId,
    types: SAFE_ADMIN_OUTBOX_TYPES,
  });

  return jsonNoStore({
    ok: true,
    before,
    result,
    after,
    safeTypes: SAFE_ADMIN_OUTBOX_TYPES,
  });
}