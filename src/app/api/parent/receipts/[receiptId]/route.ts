// src/app/api/parent/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, RefundStatus } from "@prisma/client";
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

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
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

function toIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function computedReceiptStatus(input: {
  storedStatus: string | null;
  paymentAmountPesewas: number;
  succeededRefundPesewas: number;
}) {
  const stored = String(input.storedStatus ?? "").trim();

  if (input.paymentAmountPesewas > 0) {
    if (input.succeededRefundPesewas >= input.paymentAmountPesewas) {
      return "REFUNDED";
    }

    if (input.succeededRefundPesewas > 0) {
      return "PARTIALLY_REFUNDED";
    }
  }

  return stored || "ISSUED";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  try {
    const gate = requireParentSession(
      req as Parameters<typeof requireParentSession>[0]
    );

    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const { receiptId } = await params;

    if (!receiptId?.trim()) {
      return noStore(400, { ok: false, error: "RECEIPT_ID_REQUIRED" });
    }

    const receipt = await prisma.receipt.findFirst({
      where: {
        id: receiptId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        invoiceId: true,
        feePaymentId: true,
        receiptNumber: true,
        status: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        createdAt: true,
        reversedAt: true,
        reversalReason: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            status: true,
            paidAt: true,
            paymentTransaction: {
              select: {
                provider: true,
                providerReference: true,
                providerTransactionId: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            status: true,
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
            totalPaidPesewas: true,
            balancePesewas: true,
            lines: {
              select: {
                id: true,
                category: true,
                description: true,
                amountPesewas: true,
                waivedPesewas: true,
                sortOrder: true,
              },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                    arm: true,
                  },
                },
              },
            },
          },
        },
        issuedBy: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            name: true,
            schoolCode: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
    });

    if (!receipt) {
      return noStore(404, { ok: false, error: "RECEIPT_NOT_FOUND" });
    }

    const student = receipt.invoice.student;

    const ownsStudent = parentOwnsStudent({
      parentE164: String(sess.guardianPhoneE164 ?? ""),
      parentSuffix9: String(sess.guardianSuffix9 ?? ""),
      studentGuardianPhone: student.guardianPhone,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
    });

    if (!ownsStudent) {
      return noStore(403, { ok: false, error: "FORBIDDEN_RECEIPT" });
    }

    const paymentId = receipt.feePayment?.id ?? receipt.feePaymentId;
    const originalPaymentPesewas = receipt.feePayment?.amountPesewas ?? 0;

    const refundRows = await prisma.feeRefund.findMany({
      where: {
        tenantId,
        OR: [{ feePaymentId: paymentId }, { receiptId: receipt.id }],
      },
      select: {
        id: true,
        amountPesewas: true,
        currency: true,
        status: true,
        provider: true,
        providerReference: true,
        providerRefundReference: true,
        reason: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        failureReason: true,
        cancellationReason: true,
      },
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
    });

    const succeededRefundPesewas = refundRows
      .filter((r) => r.status === RefundStatus.SUCCEEDED)
      .reduce((sum, r) => sum + r.amountPesewas, 0);

    const pendingRefundStatuses: ReadonlySet<RefundStatus> = new Set([
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
]);

const failedOrCancelledRefundStatuses: ReadonlySet<RefundStatus> = new Set([
  RefundStatus.FAILED,
  RefundStatus.CANCELLED,
]);

const pendingRefundPesewas = refundRows
  .filter((r) => pendingRefundStatuses.has(r.status))
  .reduce((sum, r) => sum + r.amountPesewas, 0);

const failedOrCancelledRefundPesewas = refundRows
  .filter((r) => failedOrCancelledRefundStatuses.has(r.status))
  .reduce((sum, r) => sum + r.amountPesewas, 0);

    const invoiceGrossPaidAgg = await prisma.feePayment.aggregate({
      where: {
        tenantId,
        invoiceId: receipt.invoiceId,
        status: {
          in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED],
        },
      },
      _sum: { amountPesewas: true },
    });

    const invoiceRefundedAgg = await prisma.feeRefund.aggregate({
      where: {
        tenantId,
        status: RefundStatus.SUCCEEDED,
        feePayment: {
          invoiceId: receipt.invoiceId,
        },
      },
      _sum: { amountPesewas: true },
    });

    const invoiceGrossPaidPesewas = invoiceGrossPaidAgg._sum.amountPesewas ?? 0;
    const invoiceRefundedPesewas = invoiceRefundedAgg._sum.amountPesewas ?? 0;
    const invoiceNetPaidPesewas = Math.max(
      0,
      invoiceGrossPaidPesewas - invoiceRefundedPesewas
    );

    const billed = receipt.invoice.totalBilledPesewas ?? 0;
    const waived = receipt.invoice.totalWaivedPesewas ?? 0;
    const netBilledPesewas = Math.max(0, billed - waived);
    const outstandingPesewas = Math.max(0, netBilledPesewas - invoiceNetPaidPesewas);

    const issuedByName =
      fullName(receipt.issuedBy?.firstName, receipt.issuedBy?.lastName) ||
      receipt.issuedBy?.name ||
      "School Office";

    const classLabel = student.classroom
      ? [student.classroom.name || student.classroom.grade, student.classroom.arm]
          .filter(Boolean)
          .join(" ")
      : null;

    const learnerName = fullName(student.firstName, student.lastName) || "Student";

    const netReceiptPaymentPesewas = Math.max(
      0,
      originalPaymentPesewas - succeededRefundPesewas
    );

    const refundableRemainingPesewas = Math.max(
      0,
      originalPaymentPesewas - succeededRefundPesewas - pendingRefundPesewas
    );

    const receiptTruthStatus = computedReceiptStatus({
      storedStatus: receipt.status,
      paymentAmountPesewas: originalPaymentPesewas,
      succeededRefundPesewas,
    });

    return noStore(200, {
      ok: true,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        status: receipt.status,
        computedStatus: receiptTruthStatus,
        issuedAt: receipt.issuedAt.toISOString(),
        issuedToName: receipt.issuedToName,
        issuedToPhone: receipt.issuedToPhone,
        note: receipt.note,
        reversedAt: toIso(receipt.reversedAt),
        reversalReason: receipt.reversalReason,

        payment: {
          id: receipt.feePayment?.id ?? null,
          amountPesewas: originalPaymentPesewas,
          grossAmountPesewas: originalPaymentPesewas,
          netAmountPesewas: netReceiptPaymentPesewas,
          succeededRefundPesewas,
          pendingRefundPesewas,
          refundableRemainingPesewas,
          method: receipt.feePayment?.method ?? null,
          reference: receipt.feePayment?.reference ?? null,
          channel: receipt.feePayment?.channel ?? null,
          status: receipt.feePayment?.status ?? null,
          paidAt: toIso(receipt.feePayment?.paidAt ?? null),
          provider: receipt.feePayment?.paymentTransaction?.provider ?? null,
          providerReference:
            receipt.feePayment?.paymentTransaction?.providerReference ?? null,
          providerTransactionId:
            receipt.feePayment?.paymentTransaction?.providerTransactionId ?? null,
        },

        refund: {
          succeededRefundPesewas,
          pendingRefundPesewas,
          failedOrCancelledRefundPesewas,
          netPaidPesewas: netReceiptPaymentPesewas,
          refundableRemainingPesewas,
          computedReceiptStatus: receiptTruthStatus,
          items: refundRows.map((r) => ({
            id: r.id,
            amountPesewas: r.amountPesewas,
            currency: r.currency,
            status: r.status,
            provider: r.provider,
            providerReference: r.providerReference,
            providerRefundReference: r.providerRefundReference,
            reason: r.reason,
            requestedAt: r.requestedAt.toISOString(),
            approvedAt: toIso(r.approvedAt),
            processingAt: toIso(r.processingAt),
            processedAt: toIso(r.processedAt),
            failedAt: toIso(r.failedAt),
            cancelledAt: toIso(r.cancelledAt),
            failureReason: r.failureReason,
            cancellationReason: r.cancellationReason,
          })),
        },

        invoice: {
          id: receipt.invoice.id,
          term: receipt.invoice.term,
          academicYear: receipt.invoice.academicYear,
          status: receipt.invoice.status,
          totalBilledPesewas: billed,
          totalWaivedPesewas: waived,
          grossPaidPesewas: invoiceGrossPaidPesewas,
          refundedPesewas: invoiceRefundedPesewas,
          totalPaidPesewas: invoiceNetPaidPesewas,
          outstandingPesewas,
          storedTotalPaidPesewas: receipt.invoice.totalPaidPesewas,
          storedBalancePesewas: receipt.invoice.balancePesewas,
          lines: receipt.invoice.lines.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            amountPesewas: line.amountPesewas,
            waivedPesewas: line.waivedPesewas,
          })),
        },

        student: {
          id: student.id,
          name: learnerName,
          guardianName: student.guardianName ?? null,
          classLabel,
        },

        school: {
          name: receipt.tenant.name,
          schoolCode: receipt.tenant.schoolCode,
          contactEmail: receipt.tenant.contactEmail,
          contactPhone: receipt.tenant.contactPhone,
        },

        issuedByName,
      },
    });
  } catch (err) {
    console.error("[PARENT_RECEIPT_GET_ERROR]", err);

    return noStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPT",
    });
  }
}