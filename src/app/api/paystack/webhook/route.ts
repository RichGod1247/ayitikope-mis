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

export async function POST(req: NextRequest) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

  if (!paystackSecret) {
    console.error("[PAYSTACK_WEBHOOK] PAYSTACK_SECRET_KEY not set");
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

  const eventType = String(event.event ?? "").trim();
  const data = (event.data ?? {}) as Record<string, unknown>;
  const providerReference =
    typeof data.reference === "string" ? data.reference.trim() : null;

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
      message: `Event '${eventType}' acknowledged`,
    });
  }

  try {
    const result = await finalizePaystackChargeSuccess({
      event,
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