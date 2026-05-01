// src/app/api/paystack/webhook/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  finalizePaystackChargeSuccess,
  recordProviderEventOnly,
} from "@/lib/finance/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");

  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
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

  const raw = (await res.json().catch(() => null)) as any;

  if (!res.ok || !raw?.status || !raw?.data) {
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
  const data = (event.data ?? {}) as Record<string, unknown>;
  const providerReference = clean(data.reference) || null;

  if (eventType !== "charge.success") {
    await recordProviderEventOnly({
      eventType: eventType || "UNKNOWN_EVENT",
      providerReference,
      signature,
      rawPayload: event,
      processingStatus: "IGNORED",
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
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "PAYSTACK_VERIFY_FAILED",
    });
  }

  const verifiedReference = clean(verified.data.reference);
  const verifiedStatus = clean(verified.data.status).toLowerCase();

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
    });

    return json(200, {
      ok: true,
      skipped: true,
      reason: "PAYSTACK_REFERENCE_MISMATCH",
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

    return json(200, result);
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      console.warn("[PAYSTACK_WEBHOOK] Duplicate provider reference race.");

      return json(200, {
        ok: true,
        alreadyProcessed: true,
      });
    }

    console.error("[PAYSTACK_WEBHOOK_PROCESSING_ERROR]", err);

    return json(500, {
      error: "PAYSTACK_WEBHOOK_PROCESSING_FAILED",
    });
  }
}