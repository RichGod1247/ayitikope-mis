// src/app/api/admin/fees/outbox/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType, FinanceOutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { retryFinanceOutboxEvent } from "@/lib/finance/outbox";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ADMIN_RETRY_TYPES: FinanceOutboxEventType[] = [
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
    scope: "admin_finance_outbox_retry",
    keyParts: [getClientIp(req), auth.ctx.tenantId, auth.ctx.userId],
    limit: 30,
    windowSeconds: 60,
    blockSeconds: 300,
    metadata: { route: "/api/admin/fees/outbox/retry" },
  });

  if (!limit.ok) return rateLimitResponse(limit);

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = await req.json().catch(() => ({}));
  const eventId = String(body.eventId ?? "").trim();

  if (!eventId) {
    return jsonNoStore({ ok: false, error: "EVENT_ID_REQUIRED" }, 400);
  }

  const event = await prisma.financeOutboxEvent.findFirst({
    where: {
      id: eventId,
      tenantId: auth.ctx.tenantId,
      type: { in: SAFE_ADMIN_RETRY_TYPES },
    },
    select: {
      id: true,
      type: true,
      status: true,
    },
  });

  if (!event) {
    return jsonNoStore({ ok: false, error: "OUTBOX_EVENT_NOT_FOUND" }, 404);
  }

  if (event.status === FinanceOutboxStatus.COMPLETED || event.status === FinanceOutboxStatus.CANCELLED) {
    return jsonNoStore({ ok: false, error: `CANNOT_RETRY_${event.status}` }, 409);
  }

  if (event.status === FinanceOutboxStatus.PROCESSING) {
    return jsonNoStore({ ok: false, error: "CANNOT_RETRY_PROCESSING" }, 409);
  }

  await retryFinanceOutboxEvent(event.id);

  const dispatch = await runFinanceOutboxWorker({
    workerId: `admin-outbox-retry:${auth.ctx.userId}`,
    limit: 1,
    types: [event.type],
    tenantId: auth.ctx.tenantId,
    eventId: event.id,
    staleProcessingAfterMinutes: 15,
  });

  return jsonNoStore({
    ok: true,
    dispatch,
  });
}