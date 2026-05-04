// src/app/api/admin/fees/provider-events/reprocess/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { reprocessPaymentProviderEvent } from "@/lib/finance/provider-event-recovery";
import { enqueueProviderEventRecoveryOutbox } from "@/lib/finance/outbox";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

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
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ipLimit = await checkRateLimit({
    scope: "admin_provider_event_reprocess_ip",
    keyParts: [getClientIp(req)],
    limit: 30,
    windowSeconds: 60,
    blockSeconds: 300,
    metadata: { route: "/api/admin/fees/provider-events/reprocess" },
  });

  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const userLimit = await checkRateLimit({
    scope: "admin_provider_event_reprocess_user",
    keyParts: [auth.ctx.tenantId, auth.ctx.userId],
    limit: 15,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: {
      route: "/api/admin/fees/provider-events/reprocess",
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
    },
  });

  if (!userLimit.ok) return rateLimitResponse(userLimit);

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => null)) as {
    eventId?: unknown;
    async?: unknown;
  } | null;

  const eventId = clean(body?.eventId);
  const runAsync = body?.async === true;

  if (!eventId) {
    return json(400, { ok: false, error: "EVENT_ID_REQUIRED" });
  }

  const event = await prisma.paymentProviderEvent.findFirst({
    where: {
      id: eventId,
      tenantId: auth.ctx.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      processingStatus: true,
    },
  });

  if (!event) {
    return json(404, { ok: false, error: "PAYMENT_PROVIDER_EVENT_NOT_FOUND" });
  }

  if (runAsync) {
    const outbox = await enqueueProviderEventRecoveryOutbox({
      tenantId: auth.ctx.tenantId,
      eventId,
      actorUserId: auth.ctx.userId,
    });

    return json(202, {
      ok: true,
      queued: true,
      outboxEventId: outbox.id,
    });
  }

  const result = await reprocessPaymentProviderEvent({
    eventId,
    actorUserId: auth.ctx.userId,
  });

  const smsDispatch = await runFinanceOutboxWorker({
    workerId: `provider-event-reprocess:${eventId}`,
    limit: 10,
    types: [
      FinanceOutboxEventType.SMS_RECEIPT,
      FinanceOutboxEventType.SMS_REFUND_NOTICE,
    ],
  });

  return json(200, {
    ok: true,
    result,
    smsDispatch,
  });
}