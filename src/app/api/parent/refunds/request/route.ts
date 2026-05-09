// src/app/api/parent/refunds/request/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { requestFeeRefund } from "@/lib/finance/refunds";
import { FinanceError } from "@/lib/finance/core";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

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

function amount(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : NaN;
}

function parentOwnsStudent(input: {
  parentE164: string;
  parentSuffix9: string;
  studentGuardianPhone?: string | null;
  studentGuardianPhoneNorm?: string | null;
}) {
  const parentDigits = digitsOnly(input.parentE164);
  const parentLast9 = parentDigits.slice(-9);
  const suffix9 = digitsOnly(input.parentSuffix9);

  const sNorm = digitsOnly(input.studentGuardianPhoneNorm ?? "");
  const sRaw = digitsOnly(input.studentGuardianPhone ?? "");

  return (
    (parentLast9.length >= 7 &&
      (sNorm.endsWith(parentLast9) || sRaw.endsWith(parentLast9))) ||
    (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)))
  );
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Student";
}

export async function POST(req: NextRequest) {
  const ipLimit = await checkRateLimit({
    scope: "parent_refund_request_ip",
    keyParts: [getClientIp(req)],
    limit: 20,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/parent/refunds/request" },
  });

  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
  if (!gate.ok) return gate.res as NextResponse;

  const sess = gate.session;
  const tenantId = sess.tenantId;
  const parentE164 = clean(sess.guardianPhoneE164);
  const parentSuffix9 = clean(sess.guardianSuffix9);

  const parentLimit = await checkRateLimit({
    scope: "parent_refund_request_session",
    keyParts: [tenantId, parentE164, parentSuffix9],
    limit: 6,
    windowSeconds: 300,
    blockSeconds: 900,
    metadata: { route: "/api/parent/refunds/request", tenantId },
  });

  if (!parentLimit.ok) return rateLimitResponse(parentLimit);

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => null)) as {
    feePaymentId?: unknown;
    receiptId?: unknown;
    amountPesewas?: unknown;
    reason?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const feePaymentIdInput = clean(body?.feePaymentId);
  const receiptIdInput = clean(body?.receiptId);
  const amountPesewas = amount(body?.amountPesewas);
  const reason = clean(body?.reason);
  const suppliedKey = clean(req.headers.get("x-idempotency-key") ?? body?.idempotencyKey);

  if (!feePaymentIdInput && !receiptIdInput) {
    return json(400, { ok: false, error: "FEE_PAYMENT_OR_RECEIPT_REQUIRED" });
  }

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return json(400, { ok: false, error: "REFUND_AMOUNT_INVALID" });
  }

  if (!reason) {
    return json(400, { ok: false, error: "REFUND_REASON_REQUIRED" });
  }

  try {
    const payment = receiptIdInput
      ? (
          await prisma.receipt.findFirst({
            where: { id: receiptIdInput, tenantId },
            select: {
              feePayment: {
                select: {
                  id: true,
                  tenantId: true,
                  amountPesewas: true,
                  status: true,
                  receipt: { select: { id: true, receiptNumber: true } },
                  invoice: {
                    select: {
                      id: true,
                      term: true,
                      academicYear: true,
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
                  },
                },
              },
            },
          })
        )?.feePayment ?? null
      : await prisma.feePayment.findFirst({
          where: { id: feePaymentIdInput, tenantId },
          select: {
            id: true,
            tenantId: true,
            amountPesewas: true,
            status: true,
            receipt: { select: { id: true, receiptNumber: true } },
            invoice: {
              select: {
                id: true,
                term: true,
                academicYear: true,
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
            },
          },
        });

    if (!payment) {
      return json(404, { ok: false, error: "PAYMENT_NOT_FOUND" });
    }

    if (!payment.receipt) {
      return json(409, { ok: false, error: "PAYMENT_WITHOUT_RECEIPT" });
    }

    const student = payment.invoice.student;

    const allowed = parentOwnsStudent({
      parentE164,
      parentSuffix9,
      studentGuardianPhone: student.guardianPhone,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
    });

    if (!allowed) {
      return json(403, { ok: false, error: "FORBIDDEN_PAYMENT" });
    }

    const idempotencyKey =
      suppliedKey ||
      crypto
        .createHash("sha256")
        .update(
          [
            "parent-refund-request",
            tenantId,
            parentE164 || parentSuffix9,
            payment.id,
            amountPesewas,
            reason,
          ].join(":")
        )
        .digest("hex");

    const refund = await requestFeeRefund({
      tenantId,
      feePaymentId: payment.id,
      amountPesewas,
      reason,
      requestedByUserId: null,
      idempotencyKey,
      metadata: {
        refundRequestSource: "parent_portal",
        parentGuardianPhoneE164: parentE164 || null,
        parentGuardianSuffix9: parentSuffix9 || null,
        studentId: student.id,
        studentName: fullName(student.firstName, student.lastName),
        invoiceId: payment.invoice.id,
        term: payment.invoice.term,
        academicYear: payment.invoice.academicYear,
        receiptId: payment.receipt.id,
        receiptNumber: payment.receipt.receiptNumber,
      },
    });

    return json(201, { ok: true, refund });
  } catch (err) {
    if (err instanceof FinanceError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[PARENT_REFUND_REQUEST_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_REQUEST_REFUND" });
  }
}