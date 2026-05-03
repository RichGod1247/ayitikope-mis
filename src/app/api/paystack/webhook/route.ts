// src/app/api/paystack/webhook/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  FinanceOutboxEventType,
  PaymentProvider,
  Prisma,
  SettlementPayoutStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  finalizePaystackChargeSuccess,
  recordProviderEventOnly,
} from "@/lib/finance/core";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSFER_EVENTS = new Set([
  "transfer.success",
  "transfer.failed",
  "transfer.reversed",
]);

const WEBHOOK_MAX_EVENT_AGE_MINUTES = Number.parseInt(
  process.env.PAYSTACK_WEBHOOK_MAX_EVENT_AGE_MINUTES ?? "1440",
  10
);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b) return false;

  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");

    if (aBuf.length !== bBuf.length) return false;

    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function parsePaystackDate(value: unknown): Date | null {
  const raw = clean(value);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function amountToPesewas(value: unknown): number {
  const n =
    typeof value === "number" ? value : Number.parseInt(clean(value), 10);

  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function extractProviderEventId(event: Record<string, unknown>) {
  const data = isObject(event.data) ? event.data : {};

  return (
    clean(event.id) ||
    clean(data.id) ||
    clean(data.event_id) ||
    clean(data.eventId) ||
    null
  );
}

function extractWebhookEventTime(event: Record<string, unknown>) {
  const data = isObject(event.data) ? event.data : {};

  return (
    parsePaystackDate(data.paid_at) ||
    parsePaystackDate(data.paidAt) ||
    parsePaystackDate(data.transferred_at) ||
    parsePaystackDate(data.transferredAt) ||
    parsePaystackDate(data.created_at) ||
    parsePaystackDate(data.createdAt) ||
    parsePaystackDate(data.updated_at) ||
    parsePaystackDate(data.updatedAt) ||
    null
  );
}

function getWebhookStaleness(eventTime: Date | null) {
  if (!eventTime) {
    return {
      stale: true,
      reason: "PAYSTACK_EVENT_TIME_MISSING",
      ageMinutes: null as number | null,
    };
  }

  const ageMs = Date.now() - eventTime.getTime();
  const ageMinutes = Math.floor(ageMs / 60_000);

  if (ageMs < -5 * 60_000) {
    return {
      stale: true,
      reason: "PAYSTACK_EVENT_TIME_IN_FUTURE",
      ageMinutes,
    };
  }

  if (
    Number.isFinite(WEBHOOK_MAX_EVENT_AGE_MINUTES) &&
    WEBHOOK_MAX_EVENT_AGE_MINUTES > 0 &&
    ageMinutes > WEBHOOK_MAX_EVENT_AGE_MINUTES
  ) {
    return {
      stale: true,
      reason: "PAYSTACK_EVENT_TOO_OLD",
      ageMinutes,
    };
  }

  return {
    stale: false,
    reason: null as string | null,
    ageMinutes,
  };
}

async function verifyWithPaystack(reference: string, secret: string) {
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

  const raw = (await res.json().catch(() => null)) as unknown;

  if (!res.ok || !isObject(raw) || !raw.status || !raw.data) {
    return {
      ok: false as const,
      status: res.status || 502,
      raw,
    };
  }

  return {
    ok: true as const,
    data: raw.data as Record<string, unknown>,
    raw,
  };
}

async function drainReceiptSmsOutbox(providerReference: string | null) {
  try {
    return await runFinanceOutboxWorker({
      workerId: `paystack-webhook:${providerReference ?? "unknown"}`,
      limit: 10,
      types: [FinanceOutboxEventType.SMS_RECEIPT],
    });
  } catch (err) {
    console.error("[PAYSTACK_WEBHOOK_SMS_OUTBOX_DRAIN_ERROR]", err);

    return {
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function transferStatusFromEvent(
  eventType: string,
  data: Record<string, unknown>
) {
  const rawStatus = clean(data.status).toLowerCase();

  if (eventType === "transfer.success" || rawStatus === "success") {
    return SettlementPayoutStatus.PAID;
  }

  if (eventType === "transfer.failed" || rawStatus === "failed") {
    return SettlementPayoutStatus.FAILED;
  }

  if (eventType === "transfer.reversed" || rawStatus === "reversed") {
    return SettlementPayoutStatus.REVERSED;
  }

  if (rawStatus === "pending") {
    return SettlementPayoutStatus.PENDING;
  }

  return SettlementPayoutStatus.PROCESSING;
}

function extractTransferFields(data: Record<string, unknown>) {
  const recipient = isObject(data.recipient) ? data.recipient : {};
  const metadata = isObject(data.metadata) ? data.metadata : {};
  const failures = isObject(data.failures) ? data.failures : null;

  const providerTransferCode =
    clean(data.transfer_code) ||
    clean(data.transferCode) ||
    clean(data.code) ||
    null;

  const providerTransferId =
    clean(data.id) ||
    clean(data.transfer_id) ||
    clean(data.transferId) ||
    null;

  const providerRecipientCode =
    clean(data.recipient_code) ||
    clean(recipient.recipient_code) ||
    clean(recipient.recipientCode) ||
    null;

  const providerReference =
    clean(data.reference) ||
    clean(data.transfer_reference) ||
    clean(data.transferReference) ||
    providerTransferCode ||
    null;

  const tenantId =
    clean(metadata.tenantId) ||
    clean(metadata.tenant_id) ||
    clean(data.tenantId) ||
    clean(data.tenant_id) ||
    null;

  const settlementAccountId =
    clean(metadata.settlementAccountId) ||
    clean(metadata.settlement_account_id) ||
    clean(data.settlementAccountId) ||
    clean(data.settlement_account_id) ||
    null;

  const providerSubaccountCode =
    clean(metadata.providerSubaccountCode) ||
    clean(metadata.provider_subaccount_code) ||
    clean(data.subaccount_code) ||
    clean(data.subaccountCode) ||
    null;

  const failureReason =
    clean(data.reason) ||
    clean(data.failure_reason) ||
    clean(data.failureReason) ||
    (failures ? clean(failures.reason) || clean(failures.message) : "") ||
    null;

  return {
    metadata,
    tenantId,
    settlementAccountId,
    providerSubaccountCode,
    providerTransferCode,
    providerTransferId,
    providerRecipientCode,
    providerReference,
    amountPesewas: amountToPesewas(data.amount),
    currency: clean(data.currency) || "GHS",
    failureReason,
    eventTime:
      parsePaystackDate(data.updatedAt) ||
      parsePaystackDate(data.updated_at) ||
      parsePaystackDate(data.transferred_at) ||
      parsePaystackDate(data.transferredAt) ||
      parsePaystackDate(data.createdAt) ||
      parsePaystackDate(data.created_at) ||
      new Date(),
  };
}

async function resolveSettlementContext(input: {
  tenantId: string | null;
  settlementAccountId: string | null;
  providerSubaccountCode: string | null;
}) {
  if (input.settlementAccountId && input.tenantId) {
    const account = await prisma.tenantSettlementAccount.findFirst({
      where: {
        id: input.settlementAccountId,
        tenantId: input.tenantId,
      },
      select: { id: true, tenantId: true },
    });

    if (account) return account;
  }

  if (input.providerSubaccountCode) {
    const account = await prisma.tenantSettlementAccount.findFirst({
      where: {
        provider: PaymentProvider.PAYSTACK,
        providerSubaccountCode: input.providerSubaccountCode,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      },
      select: { id: true, tenantId: true },
    });

    if (account) return account;
  }

  if (input.tenantId) {
    const account = await prisma.tenantSettlementAccount.findFirst({
      where: {
        tenantId: input.tenantId,
        provider: PaymentProvider.PAYSTACK,
        isPrimary: true,
      },
      select: { id: true, tenantId: true },
    });

    if (account) return account;

    const tenantExists = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });

    if (tenantExists) {
      return { id: null, tenantId: tenantExists.id };
    }
  }

  return null;
}

async function recordSuspiciousAudit(params: {
  tenantId?: string | null;
  action: string;
  providerReference?: string | null;
  eventType?: string | null;
  providerEventId?: string | null;
  eventTime?: Date | null;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId ?? null,
      action: params.action,
      resource: "PaymentProviderEvent",
      resourceId: params.providerReference ?? null,
      metadata: toJsonValue({
        eventType: params.eventType ?? null,
        providerReference: params.providerReference ?? null,
        providerEventId: params.providerEventId ?? null,
        eventTime: params.eventTime?.toISOString() ?? null,
        reason: params.reason,
        ...(params.metadata ?? {}),
      }),
    },
  });
}

async function recordTransferWebhook(params: {
  eventType: string;
  signature: string;
  event: Record<string, unknown>;
  data: Record<string, unknown>;
  providerEventId: string | null;
  eventTime: Date | null;
}) {
  const fields = extractTransferFields(params.data);
  const status = transferStatusFromEvent(params.eventType, params.data);

  const context = await resolveSettlementContext({
    tenantId: fields.tenantId,
    settlementAccountId: fields.settlementAccountId,
    providerSubaccountCode: fields.providerSubaccountCode,
  });

  if (!context) {
    await recordProviderEventOnly({
      eventType: params.eventType,
      providerReference: fields.providerReference,
      signature: params.signature,
      rawPayload: params.event,
      processingStatus: "IGNORED",
      processingError: "PAYOUT_TENANT_UNRESOLVED",
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYOUT_TENANT_UNRESOLVED",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_TRANSFER_WEBHOOK_UNRESOLVED_TENANT",
      providerReference: fields.providerReference,
      eventType: params.eventType,
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
      reason: "PAYOUT_TENANT_UNRESOLVED",
    });

    return {
      ok: true,
      skipped: true,
      reason: "PAYOUT_TENANT_UNRESOLVED",
    };
  }

  if (!fields.amountPesewas) {
    await recordProviderEventOnly({
      tenantId: context.tenantId,
      eventType: params.eventType,
      providerReference: fields.providerReference,
      signature: params.signature,
      rawPayload: params.event,
      processingStatus: "FAILED",
      processingError: "PAYOUT_AMOUNT_REQUIRED",
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYOUT_AMOUNT_REQUIRED",
    });

    await recordSuspiciousAudit({
      tenantId: context.tenantId,
      action: "PAYSTACK_TRANSFER_WEBHOOK_AMOUNT_REQUIRED",
      providerReference: fields.providerReference,
      eventType: params.eventType,
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
      reason: "PAYOUT_AMOUNT_REQUIRED",
    });

    return {
      ok: true,
      skipped: true,
      reason: "PAYOUT_AMOUNT_REQUIRED",
    };
  }

  const paidAt = status === SettlementPayoutStatus.PAID ? fields.eventTime : null;
  const failedAt = status === SettlementPayoutStatus.FAILED ? fields.eventTime : null;
  const reversedAt =
    status === SettlementPayoutStatus.REVERSED ? fields.eventTime : null;

  const providerRaw = toJsonValue(params.event);
  const metadata = toJsonValue({
    webhookEventType: params.eventType,
    webhookMetadata: fields.metadata,
    inferredFrom: {
      tenantId: fields.tenantId,
      settlementAccountId: fields.settlementAccountId,
      providerSubaccountCode: fields.providerSubaccountCode,
      providerRecipientCode: fields.providerRecipientCode,
    },
  });

  try {
    const existing = await prisma.settlementPayout.findFirst({
      where: {
        tenantId: context.tenantId,
        provider: PaymentProvider.PAYSTACK,
        OR: [
          ...(fields.providerTransferCode
            ? [{ providerTransferCode: fields.providerTransferCode }]
            : []),
          ...(fields.providerReference
            ? [{ providerReference: fields.providerReference }]
            : []),
          ...(fields.providerTransferId
            ? [{ providerTransferId: fields.providerTransferId }]
            : []),
        ],
      },
      select: { id: true },
    });

    const payout = existing
      ? await prisma.settlementPayout.update({
          where: { id: existing.id },
          data: {
            settlementAccountId: context.id,
            providerTransferCode: fields.providerTransferCode,
            providerTransferId: fields.providerTransferId,
            providerRecipientCode: fields.providerRecipientCode,
            providerReference: fields.providerReference,
            amountPesewas: fields.amountPesewas,
            currency: fields.currency,
            status,
            paidAt,
            failedAt,
            reversedAt,
            failureReason: fields.failureReason,
            providerRaw,
            metadata,
          },
        })
      : await prisma.settlementPayout.create({
          data: {
            tenantId: context.tenantId,
            settlementAccountId: context.id,
            provider: PaymentProvider.PAYSTACK,
            providerTransferCode: fields.providerTransferCode,
            providerTransferId: fields.providerTransferId,
            providerRecipientCode: fields.providerRecipientCode,
            providerReference: fields.providerReference,
            amountPesewas: fields.amountPesewas,
            currency: fields.currency,
            status,
            paidAt,
            failedAt,
            reversedAt,
            failureReason: fields.failureReason,
            providerRaw,
            metadata,
          },
        });

    await recordProviderEventOnly({
      tenantId: context.tenantId,
      eventType: params.eventType,
      providerReference: fields.providerReference,
      signature: params.signature,
      rawPayload: params.event,
      processingStatus: "PROCESSED",
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: context.tenantId,
        action: "FINANCE_SETTLEMENT_PAYOUT_WEBHOOK_RECORDED",
        resource: "SettlementPayout",
        resourceId: payout.id,
        metadata: toJsonValue({
          eventType: params.eventType,
          status,
          amountPesewas: fields.amountPesewas,
          providerTransferCode: fields.providerTransferCode,
          providerTransferId: fields.providerTransferId,
          providerRecipientCode: fields.providerRecipientCode,
          providerReference: fields.providerReference,
          settlementAccountId: context.id,
        }),
      },
    });

    return {
      ok: true,
      processed: true,
      payoutId: payout.id,
      status,
    };
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      const existing = await prisma.settlementPayout.findFirst({
        where: {
          tenantId: context.tenantId,
          provider: PaymentProvider.PAYSTACK,
          providerTransferCode: fields.providerTransferCode,
        },
        select: { id: true, status: true },
      });

      return {
        ok: true,
        alreadyProcessed: true,
        payoutId: existing?.id ?? null,
        status: existing?.status ?? status,
      };
    }

    console.error("[PAYSTACK_TRANSFER_WEBHOOK_PROCESSING_ERROR]", err);

    await recordProviderEventOnly({
      tenantId: context.tenantId,
      eventType: params.eventType,
      providerReference: fields.providerReference,
      signature: params.signature,
      rawPayload: params.event,
      processingStatus: "FAILED",
      processingError: "PAYOUT_WEBHOOK_PROCESSING_FAILED",
      providerEventId: params.providerEventId,
      eventTime: params.eventTime ?? fields.eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYOUT_WEBHOOK_PROCESSING_FAILED",
    });

    return json(500, {
      error: "PAYSTACK_TRANSFER_WEBHOOK_PROCESSING_FAILED",
    });
  }
}

export async function POST(req: NextRequest) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!paystackSecret) {
    console.error("[PAYSTACK_WEBHOOK] PAYSTACK_SECRET_KEY not set");
    return json(500, { error: "SERVER_MISCONFIGURATION" });
  }

  if (!paystackSecret.startsWith("sk_test_") && !paystackSecret.startsWith("sk_live_")) {
    console.error("[PAYSTACK_WEBHOOK] Invalid secret key prefix");
    return json(500, { error: "SERVER_MISCONFIGURATION" });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  const expected = crypto
    .createHmac("sha512", paystackSecret)
    .update(rawBody)
    .digest("hex");

  if (!timingSafeEqualHex(signature, expected)) {
    console.warn("[PAYSTACK_WEBHOOK] Invalid HMAC signature");
    return json(400, { error: "INVALID_SIGNATURE" });
  }

  let event: Record<string, unknown>;

  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const eventType = clean(event.event);
  const data = isObject(event.data) ? event.data : {};
  const providerReference = clean(data.reference) || null;
  const providerEventId = extractProviderEventId(event);
  const eventTime = extractWebhookEventTime(event);
  const staleness = getWebhookStaleness(eventTime);

  if (staleness.stale) {
    await recordProviderEventOnly({
      eventType: eventType || "UNKNOWN_EVENT",
      providerReference,
      signature,
      rawPayload: event,
      processingStatus: "IGNORED",
      processingError: staleness.reason ?? "STALE_PROVIDER_EVENT",
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: staleness.reason ?? "STALE_PROVIDER_EVENT",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_WEBHOOK_SUSPICIOUS_EVENT_BLOCKED",
      providerReference,
      eventType,
      providerEventId,
      eventTime,
      reason: staleness.reason ?? "STALE_PROVIDER_EVENT",
      metadata: {
        ageMinutes: staleness.ageMinutes,
      },
    });

    return json(200, {
      ok: true,
      ignored: true,
      suspicious: true,
      reason: staleness.reason,
    });
  }

  if (TRANSFER_EVENTS.has(eventType)) {
    const result = await recordTransferWebhook({
      eventType,
      signature,
      event,
      data,
      providerEventId,
      eventTime,
    });

    return result instanceof NextResponse ? result : json(200, result);
  }

  if (eventType !== "charge.success") {
    await recordProviderEventOnly({
      eventType: eventType || "UNKNOWN_EVENT",
      providerReference,
      signature,
      rawPayload: event,
      processingStatus: "IGNORED",
      providerEventId,
      eventTime,
    });

    return json(200, {
      ok: true,
      message: `Event '${eventType || "UNKNOWN_EVENT"}' acknowledged`,
    });
  }

  if (!providerReference) {
    await recordProviderEventOnly({
      eventType,
      providerReference: null,
      signature,
      rawPayload: event,
      processingStatus: "FAILED",
      processingError: "REFERENCE_REQUIRED",
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: "REFERENCE_REQUIRED",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_WEBHOOK_REFERENCE_REQUIRED",
      eventType,
      providerEventId,
      eventTime,
      reason: "REFERENCE_REQUIRED",
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "REFERENCE_REQUIRED",
    });
  }

  const verified = await verifyWithPaystack(providerReference, paystackSecret);

  if (!verified.ok) {
    await recordProviderEventOnly({
      eventType,
      providerReference,
      signature,
      rawPayload: {
        webhook: event,
        verification: verified.raw,
      },
      processingStatus: "FAILED",
      processingError: `PAYSTACK_VERIFY_FAILED_${verified.status}`,
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYSTACK_VERIFY_FAILED",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_WEBHOOK_VERIFY_FAILED",
      providerReference,
      eventType,
      providerEventId,
      eventTime,
      reason: "PAYSTACK_VERIFY_FAILED",
      metadata: {
        verifyStatus: verified.status,
      },
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "PAYSTACK_VERIFY_FAILED",
    });
  }

  const verifiedReference = clean(verified.data.reference);
  const verifiedStatus = clean(verified.data.status).toLowerCase();
  const verifiedAmount = amountToPesewas(verified.data.amount);
  const webhookAmount = amountToPesewas(data.amount);

  if (verifiedReference !== providerReference) {
    await recordProviderEventOnly({
      eventType,
      providerReference,
      signature,
      rawPayload: {
        webhook: event,
        verification: verified.raw,
      },
      processingStatus: "FAILED",
      processingError: "PAYSTACK_REFERENCE_MISMATCH",
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYSTACK_REFERENCE_MISMATCH",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_WEBHOOK_REFERENCE_MISMATCH",
      providerReference,
      eventType,
      providerEventId,
      eventTime,
      reason: "PAYSTACK_REFERENCE_MISMATCH",
      metadata: {
        verifiedReference,
      },
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "PAYSTACK_REFERENCE_MISMATCH",
    });
  }

  if (webhookAmount > 0 && verifiedAmount > 0 && webhookAmount !== verifiedAmount) {
    await recordProviderEventOnly({
      eventType,
      providerReference,
      signature,
      rawPayload: {
        webhook: event,
        verification: verified.raw,
      },
      processingStatus: "FAILED",
      processingError: "PAYSTACK_AMOUNT_MISMATCH",
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYSTACK_AMOUNT_MISMATCH",
    });

    await recordSuspiciousAudit({
      action: "PAYSTACK_WEBHOOK_AMOUNT_MISMATCH",
      providerReference,
      eventType,
      providerEventId,
      eventTime,
      reason: "PAYSTACK_AMOUNT_MISMATCH",
      metadata: {
        webhookAmount,
        verifiedAmount,
      },
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "PAYSTACK_AMOUNT_MISMATCH",
    });
  }

  if (verifiedStatus !== "success") {
    await recordProviderEventOnly({
      eventType,
      providerReference,
      signature,
      rawPayload: {
        webhook: event,
        verification: verified.raw,
      },
      processingStatus: "IGNORED",
      processingError: `PAYSTACK_STATUS_${verifiedStatus || "UNKNOWN"}`,
      providerEventId,
      eventTime,
    });

    return json(200, {
      ok: true,
      pending: true,
      reason: "PAYSTACK_PAYMENT_NOT_SUCCESSFUL",
      gatewayStatus: verifiedStatus,
    });
  }

  try {
    const result = await finalizePaystackChargeSuccess({
      event: {
        ...event,
        data: verified.data,
        source: "paystack_webhook_verified",
        verificationRaw: verified.raw,
      },
      signature,
    });

    const smsDispatch = await drainReceiptSmsOutbox(providerReference);

    return json(200, {
      ...result,
      smsDispatch,
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      console.warn("[PAYSTACK_WEBHOOK] Duplicate provider reference race.");

      await recordProviderEventOnly({
        eventType,
        providerReference,
        signature,
        rawPayload: event,
        processingStatus: "IGNORED",
        processingError: "DUPLICATE_PROVIDER_REFERENCE_RACE",
        providerEventId,
        eventTime,
        isSuspicious: true,
        suspiciousReason: "DUPLICATE_PROVIDER_REFERENCE_RACE",
      });

      const smsDispatch = await drainReceiptSmsOutbox(providerReference);

      return json(200, {
        ok: true,
        alreadyProcessed: true,
        smsDispatch,
      });
    }

    console.error("[PAYSTACK_WEBHOOK_PROCESSING_ERROR]", err);

    await recordProviderEventOnly({
      eventType,
      providerReference,
      signature,
      rawPayload: event,
      processingStatus: "FAILED",
      processingError: "PAYSTACK_WEBHOOK_PROCESSING_FAILED",
      providerEventId,
      eventTime,
      isSuspicious: true,
      suspiciousReason: "PAYSTACK_WEBHOOK_PROCESSING_FAILED",
    });

    return json(500, {
      error: "PAYSTACK_WEBHOOK_PROCESSING_FAILED",
    });
  }
}