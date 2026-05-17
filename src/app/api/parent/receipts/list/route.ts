// src/app/api/parent/receipts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, RefundStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function parentStudentOwnershipWhere(input: {
  tenantId: string;
  e164: string;
  suffix9: string;
  studentId?: string | null;
}): Prisma.StudentWhereInput | null {
  const OR: Prisma.StudentWhereInput[] = [];
  const e164Digits = digitsOnly(input.e164);
  const last9 = e164Digits.slice(-9);
  const suffix9 = digitsOnly(input.suffix9);

  if (last9.length >= 7) {
    OR.push({ guardianPhone: { endsWith: last9 } });
    OR.push({ guardianPhoneNorm: { endsWith: last9 } });
  }

  if (suffix9.length >= 7 && suffix9 !== last9) {
    OR.push({ guardianPhone: { endsWith: suffix9 } });
    OR.push({ guardianPhoneNorm: { endsWith: suffix9 } });
  }

  if (OR.length === 0) return null;

  return {
    tenantId: input.tenantId,
    status: "ACTIVE",
    OR,
    ...(input.studentId ? { id: input.studentId } : {}),
  };
}

function studentName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function computeReceiptStatus(input: {
  grossAmountPesewas: number;
  succeededRefundPesewas: number;
}) {
  if (input.grossAmountPesewas > 0 && input.succeededRefundPesewas >= input.grossAmountPesewas) {
    return "REFUNDED";
  }

  if (input.succeededRefundPesewas > 0) {
    return "PARTIALLY_REFUNDED";
  }

  return "ISSUED";
}

function successfulPaymentStatus(status?: PaymentStatus | null) {
  return status === PaymentStatus.SUCCESS || status === PaymentStatus.REFUNDED;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);

    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;

    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim() || null;

    const where = parentStudentOwnershipWhere({
      tenantId,
      e164: String(sess.guardianPhoneE164 ?? ""),
      suffix9: String(sess.guardianSuffix9 ?? ""),
      studentId,
    });

    if (!where) {
      return noStore(200, { ok: true, receipts: [] });
    }

    const students = await prisma.student.findMany({
      where,
      select: { id: true },
      take: 50,
    });

    if (students.length === 0) {
      return noStore(200, { ok: true, receipts: [] });
    }

    const studentIds = students.map((s) => s.id);

    const receipts = await prisma.receipt.findMany({
      where: {
        tenantId,
        invoice: {
          studentId: { in: studentIds },
        },
      },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        status: true,
        feePayment: {
          select: {
            amountPesewas: true,
            status: true,
            method: true,
            reference: true,
            channel: true,
            refunds: {
              select: {
                id: true,
                amountPesewas: true,
                status: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            balancePesewas: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: [{ issuedAt: "desc" }],
      take: 200,
    });

    return noStore(200, {
      ok: true,
      receipts: receipts.map((r) => {
        const grossAmountPesewas = r.feePayment?.amountPesewas ?? 0;

        const succeededRefundPesewas =
          r.feePayment?.refunds
            .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
            .reduce((sum, refund) => sum + refund.amountPesewas, 0) ?? 0;

        const pendingRefundPesewas =
          r.feePayment?.refunds
            .filter(
              (refund) =>
                refund.status === RefundStatus.REQUESTED ||
                refund.status === RefundStatus.APPROVED ||
                refund.status === RefundStatus.PROCESSING
            )
            .reduce((sum, refund) => sum + refund.amountPesewas, 0) ?? 0;

        const failedOrCancelledRefundPesewas =
          r.feePayment?.refunds
            .filter(
              (refund) =>
                refund.status === RefundStatus.FAILED ||
                refund.status === RefundStatus.CANCELLED
            )
            .reduce((sum, refund) => sum + refund.amountPesewas, 0) ?? 0;

        const netAmountPesewas = Math.max(0, grossAmountPesewas - succeededRefundPesewas);
        const refundableRemainingPesewas = Math.max(
          0,
          grossAmountPesewas - succeededRefundPesewas - pendingRefundPesewas
        );

        return {
          id: r.id,
          receiptNumber: r.receiptNumber,
          issuedAt: r.issuedAt.toISOString(),
          issuedToName: r.issuedToName,

          amountPesewas: grossAmountPesewas,
          grossAmountPesewas,
          succeededRefundPesewas,
          pendingRefundPesewas,
          failedOrCancelledRefundPesewas,
          netAmountPesewas,
          refundableRemainingPesewas,

          computedStatus: computeReceiptStatus({
            grossAmountPesewas,
            succeededRefundPesewas,
          }),

          receiptStatus: r.status,
          paymentStatus: r.feePayment?.status ?? null,
          paymentIsSuccessful: successfulPaymentStatus(r.feePayment?.status ?? null),

          refundCount: r.feePayment?.refunds.length ?? 0,
          hasRefundActivity:
            succeededRefundPesewas > 0 ||
            pendingRefundPesewas > 0 ||
            failedOrCancelledRefundPesewas > 0,

          method: r.feePayment?.method ?? null,
          reference: r.feePayment?.reference ?? null,
          channel: r.feePayment?.channel ?? null,

          invoiceId: r.invoice?.id ?? null,
          term: r.invoice?.term ?? null,
          academicYear: r.invoice?.academicYear ?? null,
          outstandingPesewas: r.invoice?.balancePesewas ?? null,

          studentName: studentName(r.invoice?.student?.firstName, r.invoice?.student?.lastName),
        };
      }),
    });
  } catch (err) {
    console.error("[PARENT_RECEIPTS_LIST_ERROR]", err);

    return noStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPTS",
      receipts: [],
    });
  }
}