// src/lib/finance/provider-event-recovery.ts
import { PaymentProvider, Prisma, ProviderEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { finalizePaystackChargeSuccess } from "@/lib/finance/core";

type ReprocessResult =
  | {
      ok: true;
      eventId: string;
      alreadyProcessed?: boolean;
      result?: unknown;
    }
  | {
      ok: true;
      eventId: string;
      skipped: true;
      reason: string;
    };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

function extractWebhookPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!isRecord(rawPayload)) return null;

  if (isRecord(rawPayload.webhook)) return rawPayload.webhook;

  if (clean(rawPayload.event) || isRecord(rawPayload.data)) {
    return rawPayload;
  }

  return null;
}

async function verifyPaystackReference(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 500,
      error: "PAYSTACK_SECRET_KEY_MISSING",
      raw: null,
    };
  }

  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
    return {
      ok: false as const,
      status: 500,
      error: "PAYSTACK_SECRET_KEY_INVALID_PREFIX",
      raw: null,
    };
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const raw = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  } | null;

  if (!res.ok || !raw?.status || !raw.data) {
    return {
      ok: false as const,
      status: res.status || 502,
      error: raw?.message || "PAYSTACK_VERIFY_FAILED",
      raw,
    };
  }

  return {
    ok: true as const,
    data: raw.data,
    raw,
  };
}

export async function reprocessPaymentProviderEvent(input: {
  eventId: string;
  actorUserId?: string | null;
}): Promise<ReprocessResult> {
  const event = await prisma.paymentProviderEvent.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      tenantId: true,
      provider: true,
      eventType: true,
      providerReference: true,
      signature: true,
      rawPayload: true,
      processingStatus: true,
    },
  });

  if (!event) {
    throw new Error("PAYMENT_PROVIDER_EVENT_NOT_FOUND");
  }

  if (event.processingStatus === ProviderEventStatus.PROCESSED) {
    return {
      ok: true,
      eventId: event.id,
      alreadyProcessed: true,
    };
  }

  if (event.provider !== PaymentProvider.PAYSTACK) {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.IGNORED,
        processingError: "UNSUPPORTED_PROVIDER_FOR_REPROCESS",
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "UNSUPPORTED_PROVIDER_FOR_REPROCESS",
    };
  }

  if (event.eventType !== "charge.success") {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.IGNORED,
        processingError: "UNSUPPORTED_EVENT_TYPE_FOR_REPROCESS",
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "UNSUPPORTED_EVENT_TYPE_FOR_REPROCESS",
    };
  }

  const webhookPayload = extractWebhookPayload(event.rawPayload);
  const reference =
    clean(event.providerReference) ||
    (webhookPayload && isRecord(webhookPayload.data)
      ? clean(webhookPayload.data.reference)
      : "");

  if (!reference) {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.FAILED,
        processingError: "REFERENCE_REQUIRED_FOR_REPROCESS",
        isSuspicious: true,
        suspiciousReason: "REFERENCE_REQUIRED_FOR_REPROCESS",
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "REFERENCE_REQUIRED_FOR_REPROCESS",
    };
  }

  const verified = await verifyPaystackReference(reference);

  if (!verified.ok) {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.FAILED,
        processingError: `PAYSTACK_VERIFY_FAILED_${verified.status}`,
        rawPayload: toInputJson({
          original: event.rawPayload,
          recoveryVerification: verified.raw,
        }),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "PAYSTACK_VERIFY_FAILED",
    };
  }

  const verifiedReference = clean(verified.data.reference);
  const verifiedStatus = clean(verified.data.status).toLowerCase();

  if (verifiedReference !== reference) {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.FAILED,
        processingError: "PAYSTACK_REFERENCE_MISMATCH_ON_REPROCESS",
        isSuspicious: true,
        suspiciousReason: "PAYSTACK_REFERENCE_MISMATCH_ON_REPROCESS",
        processedAt: new Date(),
        rawPayload: toInputJson({
          original: event.rawPayload,
          recoveryVerification: verified.raw,
        }),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "PAYSTACK_REFERENCE_MISMATCH_ON_REPROCESS",
    };
  }

  if (verifiedStatus !== "success") {
    await prisma.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: ProviderEventStatus.IGNORED,
        processingError: `PAYSTACK_STATUS_${verifiedStatus || "UNKNOWN"}`,
        processedAt: new Date(),
        rawPayload: toInputJson({
          original: event.rawPayload,
          recoveryVerification: verified.raw,
        }),
      },
    });

    return {
      ok: true,
      eventId: event.id,
      skipped: true,
      reason: "PAYSTACK_PAYMENT_NOT_SUCCESSFUL",
    };
  }

  const result = await finalizePaystackChargeSuccess({
    event: {
      event: "charge.success",
      data: verified.data,
      source: "provider_event_reprocess",
      originalProviderEventId: event.id,
      recoveryVerificationRaw: verified.raw,
    },
    signature: event.signature ?? `RECOVERY:${event.id}`,
  });

  await prisma.paymentProviderEvent.update({
    where: { id: event.id },
    data: {
      processingStatus: ProviderEventStatus.PROCESSED,
      processingError: null,
      processedAt: new Date(),
      rawPayload: toInputJson({
        original: event.rawPayload,
        recoveryVerification: verified.raw,
        recoveryResult: result,
        recoveredByUserId: input.actorUserId ?? null,
      }),
    },
  });

  return {
    ok: true,
    eventId: event.id,
    result,
  };
}