// src/app/api/parent/payments/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { finalizePaystackChargeSuccess } from "@/lib/finance/core";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";

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

function ownsStudent(input: {
  guardianPhoneE164?: string | null;
  guardianSuffix9?: string | null;
  studentGuardianPhone?: string | null;
  studentGuardianPhoneNorm?: string | null;
}) {
  const parentDigits = digitsOnly(input.guardianPhoneE164 ?? "");
  const suffix9 =
    digitsOnly(input.guardianSuffix9 ?? "") || parentDigits.slice(-9);

  if (suffix9.length < 7) return false;

  const studentNorm = digitsOnly(input.studentGuardianPhoneNorm ?? "");
  const studentRaw = digitsOnly(input.studentGuardianPhone ?? "");

  return studentNorm.endsWith(suffix9) || studentRaw.endsWith(suffix9);
}

async function verifyWithPaystack(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 500,
      error: "PAYSTACK_SECRET_KEY_MISSING",
    };
  }

  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
    return {
      ok: false as const,
      status: 500,
      error: "PAYSTACK_SECRET_KEY_INVALID_PREFIX",
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

  const data = (await res.json().catch(() => null)) as any;

  if (!res.ok || !data?.status) {
    return {
      ok: false as const,
      status: res.status || 502,
      error: data?.message || "PAYSTACK_VERIFY_FAILED",
      raw: data ?? null,
    };
  }

  return {
    ok: true as const,
    data: data.data as Record<string, unknown>,
    raw: data,
  };
}

async function drainReceiptSmsOutbox(reference: string) {
  try {
    return await runFinanceOutboxWorker({
      workerId: `parent-payment-verify:${reference}`,
      limit: 10,
      types: [FinanceOutboxEventType.SMS_RECEIPT],
    });
  } catch (err) {
    console.error("[PARENT_PAYMENT_VERIFY_SMS_OUTBOX_DRAIN_ERROR]", err);

    return {
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleVerify(req: NextRequest, referenceInput: string) {
  const gate = requireParentSession(req as any);
  if (!gate.ok) return gate.res as any;

  const session = gate.session;
  const tenantId = session.tenantId;
  const reference = clean(referenceInput);

  if (!reference) {
    return json(400, { ok: false, error: "REFERENCE_REQUIRED" });
  }

  const intent = await prisma.paymentIntent.findFirst({
    where: {
      tenantId,
      provider: "PAYSTACK",
      providerReference: reference,
    },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      invoiceId: true,
      providerReference: true,
      amountPesewas: true,
      currency: true,
      status: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          guardianPhone: true,
          guardianPhoneNorm: true,
        },
      },
    },
  });

  if (!intent) {
    return json(404, { ok: false, error: "PAYMENT_INTENT_NOT_FOUND" });
  }

  const allowed = ownsStudent({
    guardianPhoneE164: session.guardianPhoneE164,
    guardianSuffix9: session.guardianSuffix9,
    studentGuardianPhone: intent.student?.guardianPhone,
    studentGuardianPhoneNorm: intent.student?.guardianPhoneNorm,
  });

  if (!allowed) {
    return json(403, { ok: false, error: "FORBIDDEN_PAYMENT_INTENT" });
  }

  const verified = await verifyWithPaystack(reference);

  if (!verified.ok) {
    return json(verified.status, {
      ok: false,
      error: verified.error,
      raw: verified.raw ?? null,
    });
  }

  const paystackData = verified.data;
  const gatewayStatus = clean(paystackData.status).toLowerCase();
  const verifiedReference = clean(paystackData.reference);
  const verifiedAmount = Number(paystackData.amount ?? NaN);

  if (verifiedReference !== reference) {
    return json(409, { ok: false, error: "PAYSTACK_REFERENCE_MISMATCH" });
  }

  if (gatewayStatus !== "success") {
    return json(202, {
      ok: false,
      pending: true,
      error: "PAYSTACK_PAYMENT_NOT_SUCCESSFUL_YET",
      gatewayStatus,
    });
  }

  if (!Number.isFinite(verifiedAmount) || verifiedAmount !== intent.amountPesewas) {
    return json(409, {
      ok: false,
      error: "PAYSTACK_AMOUNT_MISMATCH",
      expectedPesewas: intent.amountPesewas,
      actualPesewas: Number.isFinite(verifiedAmount) ? verifiedAmount : null,
    });
  }

  const result = await finalizePaystackChargeSuccess({
    event: {
      event: "charge.success",
      data: paystackData,
      source: "parent_callback_verify",
    },
    signature: "SERVER_SIDE_VERIFY",
  });

  const smsDispatch = await drainReceiptSmsOutbox(reference);

  return json(200, {
    ok: true,
    verified: true,
    reference,
    result,
    smsDispatch,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handleVerify(req, clean(body.reference));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return handleVerify(req, clean(url.searchParams.get("reference")));
}