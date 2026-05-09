// src/app/api/admin/fees/refunds/[refundId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

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

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refundId: string }> }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { refundId } = await params;

  if (!refundId?.trim()) {
    return json(400, { ok: false, error: "REFUND_ID_REQUIRED" });
  }

  try {
    const refund = await prisma.feeRefund.findFirst({
      where: {
        id: refundId,
        tenantId: auth.ctx.tenantId,
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
        approvalNote: true,
        failureReason: true,
        cancellationReason: true,
        providerRaw: true,
        metadata: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,

        requestedBy: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
        approvedBy: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },

        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            status: true,
            issuedAt: true,
            issuedToName: true,
            issuedToPhone: true,
            reversedAt: true,
            reversalReason: true,
          },
        },

        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            status: true,
            paidAt: true,
            invoice: {
              select: {
                id: true,
                term: true,
                academicYear: true,
                totalBilledPesewas: true,
                totalPaidPesewas: true,
                balancePesewas: true,
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    guardianName: true,
                    guardianPhone: true,
                    guardianPhoneNorm: true,
                    classroom: { select: { name: true, grade: true, arm: true } },
                  },
                },
              },
            },
          },
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
            receiptId: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!refund) {
      return json(404, { ok: false, error: "REFUND_NOT_FOUND" });
    }

    const student = refund.feePayment.invoice.student;
    const classLabel =
      student.classroom?.name ||
      [student.classroom?.grade, student.classroom?.arm]
        .filter(Boolean)
        .join(" ") ||
      null;

    return json(200, {
      ok: true,
      refund: {
        id: refund.id,
        amountPesewas: refund.amountPesewas,
        currency: refund.currency,
        status: refund.status,
        provider: refund.provider,
        providerReference: refund.providerReference,
        providerRefundReference: refund.providerRefundReference,
        reason: refund.reason,
        approvalNote: refund.approvalNote,
        failureReason: refund.failureReason,
        cancellationReason: refund.cancellationReason,
        providerRaw: refund.providerRaw,
        metadata: refund.metadata,

        requestedAt: toIso(refund.requestedAt),
        approvedAt: toIso(refund.approvedAt),
        processingAt: toIso(refund.processingAt),
        processedAt: toIso(refund.processedAt),
        failedAt: toIso(refund.failedAt),
        cancelledAt: toIso(refund.cancelledAt),
        createdAt: toIso(refund.createdAt),
        updatedAt: toIso(refund.updatedAt),

        requestedBy: refund.requestedBy
          ? {
              id: refund.requestedBy.id,
              name:
                fullName(refund.requestedBy.firstName, refund.requestedBy.lastName) ??
                refund.requestedBy.name ??
                "Unknown",
            }
          : null,

        approvedBy: refund.approvedBy
          ? {
              id: refund.approvedBy.id,
              name:
                fullName(refund.approvedBy.firstName, refund.approvedBy.lastName) ??
                refund.approvedBy.name ??
                "Unknown",
            }
          : null,

        receipt: refund.receipt
          ? {
              id: refund.receipt.id,
              receiptNumber: refund.receipt.receiptNumber,
              status: refund.receipt.status,
              issuedAt: toIso(refund.receipt.issuedAt),
              issuedToName: refund.receipt.issuedToName,
              issuedToPhone: refund.receipt.issuedToPhone,
              reversedAt: toIso(refund.receipt.reversedAt),
              reversalReason: refund.receipt.reversalReason,
            }
          : null,

        payment: {
          id: refund.feePayment.id,
          amountPesewas: refund.feePayment.amountPesewas,
          method: refund.feePayment.method,
          reference: refund.feePayment.reference,
          channel: refund.feePayment.channel,
          status: refund.feePayment.status,
          paidAt: toIso(refund.feePayment.paidAt),
        },

        invoice: {
          id: refund.feePayment.invoice.id,
          term: refund.feePayment.invoice.term,
          academicYear: refund.feePayment.invoice.academicYear,
          totalBilledPesewas: refund.feePayment.invoice.totalBilledPesewas,
          totalPaidPesewas: refund.feePayment.invoice.totalPaidPesewas,
          balancePesewas: refund.feePayment.invoice.balancePesewas,
        },

        student: {
          id: student.id,
          name: fullName(student.firstName, student.lastName) ?? "Unknown",
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          guardianPhoneNorm: student.guardianPhoneNorm,
          classLabel,
        },

        ledgerEntries: refund.ledgerEntries.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          direction: entry.direction,
          amountPesewas: entry.amountPesewas,
          description: entry.description,
          journalRef: entry.journalRef,
          feePaymentId: entry.feePaymentId,
          receiptId: entry.receiptId,
          createdAt: toIso(entry.createdAt),
        })),
      },
    });
  } catch (err) {
    console.error("[ADMIN_REFUND_DETAIL_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_LOAD_REFUND" });
  }
}