// src/app/api/parent/payments/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { finalizePaystackChargeSuccess } from "@/lib/finance/core";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECEIPT_SMS_TEMPLATE = "PAYMENT_RECEIPT_CONFIRMATION";

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

function cedis(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
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
    return { ok: false as const, status: 500, error: "PAYSTACK_SECRET_KEY_MISSING" };
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

async function smsAlreadySent(tenantId: string, reference: string) {
  const client = prisma as any;

  try {
    const found = await client.sMSSendAudit?.findFirst?.({
      where: {
        tenantId,
        template: RECEIPT_SMS_TEMPLATE,
        payload: {
          path: ["reference"],
          equals: reference,
        },
      },
      select: { id: true },
    });

    return Boolean(found);
  } catch {
    return false;
  }
}

async function sendReceiptSmsOnce(input: {
  tenantId: string;
  reference: string;
}) {
  const { tenantId, reference } = input;

  if (await smsAlreadySent(tenantId, reference)) {
    return { ok: true, skipped: true, reason: "SMS_ALREADY_SENT" };
  }

  const payment = await prisma.feePayment.findFirst({
    where: {
      tenantId,
      reference,
      status: "SUCCESS",
    },
    select: {
      id: true,
      amountPesewas: true,
      invoice: {
        select: {
          balancePesewas: true,
          term: true,
          academicYear: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianPhone: true,
              guardianPhoneNorm: true,
            },
          },
        },
      },
      receipt: {
        select: {
          id: true,
          receiptNumber: true,
        },
      },
      tenant: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!payment?.receipt) {
    return { ok: false, skipped: true, reason: "PAYMENT_OR_RECEIPT_NOT_READY" };
  }

  const to =
    payment.invoice.student.guardianPhoneNorm ||
    payment.invoice.student.guardianPhone ||
    "";

  if (!to) {
    return { ok: false, skipped: true, reason: "NO_GUARDIAN_PHONE" };
  }

  const studentName =
    [payment.invoice.student.firstName, payment.invoice.student.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "your ward";

  const message =
    `EduLifeOS Receipt\n` +
    `Payment received: ${cedis(payment.amountPesewas)}\n` +
    `Student: ${studentName}\n` +
    `Receipt: ${payment.receipt.receiptNumber}\n` +
    `Balance: ${cedis(payment.invoice.balancePesewas)}\n` +
    `Ref: ${reference}`;

  return sendSms({
    tenantId,
    to,
    message,
    template: RECEIPT_SMS_TEMPLATE,
    payload: {
      reference,
      feePaymentId: payment.id,
      receiptId: payment.receipt.id,
      receiptNumber: payment.receipt.receiptNumber,
      amountPesewas: payment.amountPesewas,
      balancePesewas: payment.invoice.balancePesewas,
      studentName,
      term: payment.invoice.term,
      academicYear: payment.invoice.academicYear,
      schoolName: payment.tenant.name,
    },
  });
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

  let smsResult: unknown = null;

  try {
    smsResult = await sendReceiptSmsOnce({ tenantId, reference });
  } catch (err) {
    console.error("[PAYMENT_RECEIPT_SMS_FAILED]", err);
    smsResult = { ok: false, error: "PAYMENT_RECEIPT_SMS_FAILED" };
  }

  return json(200, {
    ok: true,
    verified: true,
    reference,
    result,
    sms: smsResult,
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