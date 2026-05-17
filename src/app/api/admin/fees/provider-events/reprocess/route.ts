// src/app/api/admin/fees/provider-events/reprocess/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType, type Prisma } from "@prisma/client";
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

function errorCode(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "PROVIDER_EVENT_REPROCESS_FAILED";
}

function toAuditMetadata(value: Record<string, unknown>): Prisma.InputJsonObject {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
  } catch {
    return {
      serializationError: true,
      fallbackMessage: "Audit metadata could not be serialized safely.",
    };
  }
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
      provider: true,
      eventType: true,
      providerReference: true,
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

    await prisma.auditLog.create({
      data: {
        tenantId: auth.ctx.tenantId,
        userId: auth.ctx.userId,
        action: "FINANCE_PROVIDER_EVENT_REPROCESS_QUEUED",
        resource: "PaymentProviderEvent",
        resourceId: eventId,
        metadata: toAuditMetadata({
          eventType: event.eventType,
          provider: event.provider,
          providerReference: event.providerReference,
          previousProcessingStatus: event.processingStatus,
          outboxEventId: outbox.id,
        }),
      },
    });

    return json(202, {
      ok: true,
      queued: true,
      outboxEventId: outbox.id,
    });
  }

  try {
    const result = await reprocessPaymentProviderEvent({
      eventId,
      actorUserId: auth.ctx.userId,
    });

    const smsDispatch = await runFinanceOutboxWorker({
      workerId: `provider-event-reprocess:${eventId}`,
      limit: 10,
      tenantId: auth.ctx.tenantId,
      types: [
        FinanceOutboxEventType.SMS_RECEIPT,
        FinanceOutboxEventType.SMS_REFUND_NOTICE,
      ],
    });

    await prisma.auditLog.create({
      data: {
        tenantId: auth.ctx.tenantId,
        userId: auth.ctx.userId,
        action: "FINANCE_PROVIDER_EVENT_REPROCESSED",
        resource: "PaymentProviderEvent",
        resourceId: eventId,
        metadata: toAuditMetadata({
          eventType: event.eventType,
          provider: event.provider,
          providerReference: event.providerReference,
          previousProcessingStatus: event.processingStatus,
          result,
          smsDispatch,
        }),
      },
    });

    return json(200, {
      ok: true,
      result,
      smsDispatch,
    });
  } catch (err) {
    const code = errorCode(err);

    await prisma.auditLog.create({
      data: {
        tenantId: auth.ctx.tenantId,
        userId: auth.ctx.userId,
        action: "FINANCE_PROVIDER_EVENT_REPROCESS_FAILED",
        resource: "PaymentProviderEvent",
        resourceId: eventId,
        metadata: toAuditMetadata({
          eventType: event.eventType,
          provider: event.provider,
          providerReference: event.providerReference,
          previousProcessingStatus: event.processingStatus,
          error: code,
        }),
      },
    });

    return json(500, {
      ok: false,
      error: code,
    });
  }
}