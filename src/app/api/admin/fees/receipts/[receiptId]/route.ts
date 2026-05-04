// src/app/api/admin/fees/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentTransactionView = {
  id: string;
  provider: string;
  providerReference: string;
  providerTransactionId: string | null;
  status: string;
  currency: string;
  providerPaidAt: Date | string | null;
} | null;

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function classLabel(classroom?: {
  name: string | null;
  grade: string | null;
  arm: string | null;
} | null) {
  if (!classroom) return null;

  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    null
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const { receiptId } = await params;

  if (!receiptId?.trim()) {
    return jsonNoStore(400, { ok: false, error: "RECEIPT_ID_REQUIRED" });
  }

  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        status: true,
        reversedAt: true,
        reversalReason: true,
        note: true,
        feePaymentId: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            status: true,
            paymentTransaction: {
              select: {
                id: true,
                provider: true,
                providerReference: true,
                providerTransactionId: true,
                status: true,
                currency: true,
                providerPaidAt: true,
              },
            },
            refunds: {
              where: {
                status: {
                  in: ["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"],
                },
              },
              select: {
                id: true,
                amountPesewas: true,
                status: true,
                reason: true,
                approvalNote: true,
                provider: true,
                providerRefundReference: true,
                requestedAt: true,
                approvedAt: true,
                processingAt: true,
                processedAt: true,
                failedAt: true,
                failureReason: true,
              },
              orderBy: { requestedAt: "desc" },
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
            ledgerEntries: {
              select: {
                id: true,
                entryType: true,
                direction: true,
                amountPesewas: true,
                description: true,
                journalRef: true,
                createdAt: true,
                feePaymentId: true,
                feeRefundId: true,
                receiptId: true,
              },
              orderBy: { createdAt: "asc" },
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
                  select: { name: true, grade: true, arm: true },
                },
              },
            },
          },
        },
        issuedBy: {
          select: { name: true, firstName: true, lastName: true },
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
      return jsonNoStore(404, { ok: false, error: "RECEIPT_NOT_FOUND" });
    }

    const student = receipt.invoice.student;
    const studentName = fullName(student.firstName, student.lastName) || "Student";

    const issuedByName =
      fullName(receipt.issuedBy?.firstName, receipt.issuedBy?.lastName) ||
      receipt.issuedBy?.name ||
      "System";

    const refunds = receipt.feePayment?.refunds ?? [];

    const succeededRefundPesewas = refunds
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amountPesewas, 0);

    const reservedRefundPesewas = refunds
      .filter((r) =>
        ["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"].includes(r.status)
      )
      .reduce((sum, r) => sum + r.amountPesewas, 0);

    const originalAmountPesewas = receipt.feePayment?.amountPesewas ?? 0;
    const netAmountPesewas = Math.max(
      0,
      originalAmountPesewas - succeededRefundPesewas
    );
    const remainingRefundablePesewas = Math.max(
      0,
      originalAmountPesewas - reservedRefundPesewas
    );

    const refundState =
      succeededRefundPesewas <= 0
        ? "NOT_REFUNDED"
        : succeededRefundPesewas >= originalAmountPesewas
          ? "FULLY_REFUNDED"
          : "PARTIALLY_REFUNDED";

    const paymentTransaction = (receipt.feePayment?.paymentTransaction ??
      null) as PaymentTransactionView;

    return jsonNoStore(200, {
      ok: true,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt.toISOString(),
        issuedToName: receipt.issuedToName,
        issuedToPhone: receipt.issuedToPhone,
        status: receipt.status,
        reversedAt: toIso(receipt.reversedAt),
        reversalReason: receipt.reversalReason,
        note: receipt.note,

        refundSummary: {
          state: refundState,
          originalAmountPesewas,
          succeededRefundPesewas,
          reservedRefundPesewas,
          netAmountPesewas,
          remainingRefundablePesewas,
          hasPendingRefund: refunds.some((r) =>
            ["REQUESTED", "APPROVED", "PROCESSING"].includes(r.status)
          ),
        },

        refunds: refunds.map((r) => ({
          id: r.id,
          amountPesewas: r.amountPesewas,
          status: r.status,
          reason: r.reason,
          approvalNote: r.approvalNote,
          provider: r.provider,
          providerRefundReference: r.providerRefundReference,
          requestedAt: r.requestedAt.toISOString(),
          approvedAt: toIso(r.approvedAt),
          processingAt: toIso(r.processingAt),
          processedAt: toIso(r.processedAt),
          failedAt: toIso(r.failedAt),
          failureReason: r.failureReason,
        })),

        payment: {
          id: receipt.feePayment?.id ?? null,
          amountPesewas: originalAmountPesewas,
          netAmountPesewas,
          method: receipt.feePayment?.method ?? null,
          reference: receipt.feePayment?.reference ?? null,
          channel: receipt.feePayment?.channel ?? null,
          status: receipt.feePayment?.status ?? null,
          paidAt: toIso(receipt.feePayment?.paidAt),
          provider: paymentTransaction?.provider ?? null,
          providerReference: paymentTransaction?.providerReference ?? null,
          providerTransactionId:
            paymentTransaction?.providerTransactionId ?? null,
          providerStatus: paymentTransaction?.status ?? null,
          providerCurrency: paymentTransaction?.currency ?? null,
          providerPaidAt: toIso(paymentTransaction?.providerPaidAt),
        },

        invoice: {
          id: receipt.invoice.id,
          term: receipt.invoice.term,
          academicYear: receipt.invoice.academicYear,
          status: receipt.invoice.status,
          totalBilledPesewas: receipt.invoice.totalBilledPesewas ?? 0,
          totalWaivedPesewas: receipt.invoice.totalWaivedPesewas ?? 0,
          totalPaidPesewas: receipt.invoice.totalPaidPesewas ?? 0,
          outstandingPesewas: receipt.invoice.balancePesewas ?? 0,
          lines: receipt.invoice.lines.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            amountPesewas: line.amountPesewas,
            waivedPesewas: line.waivedPesewas,
          })),
          ledgerEntries: receipt.invoice.ledgerEntries.map((entry) => ({
            id: entry.id,
            entryType: entry.entryType,
            direction: entry.direction,
            amountPesewas: entry.amountPesewas,
            description: entry.description,
            journalRef: entry.journalRef,
            feePaymentId: entry.feePaymentId,
            feeRefundId: entry.feeRefundId,
            receiptId: entry.receiptId,
            createdAt: entry.createdAt.toISOString(),
          })),
        },

        student: {
          id: student.id,
          name: studentName,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          guardianPhoneNorm: student.guardianPhoneNorm,
          classLabel: classLabel(student.classroom),
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
    console.error("[ADMIN_RECEIPT_GET_ERROR]", err);
    return jsonNoStore(500, { ok: false, error: "FAILED_TO_LOAD_RECEIPT" });
  }
}