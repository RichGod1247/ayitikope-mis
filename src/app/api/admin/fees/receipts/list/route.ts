// src/app/api/admin/fees/receipts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentStatus,
  ReceiptStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RefundStateFilter =
  | "ALL"
  | "NOT_REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FULLY_REFUNDED"
  | "HAS_PENDING_REFUND";

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function classLabel(classroom?: {
  name: string | null;
  grade: string | null;
  arm?: string | null;
} | null) {
  if (!classroom) return "Unassigned";

  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    "Class"
  );
}

function clampTake(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 300;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}

function parseRefundState(raw: unknown): RefundStateFilter {
  const v = clean(raw).toUpperCase();

  if (
    v === "NOT_REFUNDED" ||
    v === "PARTIALLY_REFUNDED" ||
    v === "FULLY_REFUNDED" ||
    v === "HAS_PENDING_REFUND"
  ) {
    return v;
  }

  return "ALL";
}

function expectedReceiptStatus(input: {
  originalAmountPesewas: number;
  succeededRefundPesewas: number;
}) {
  if (input.succeededRefundPesewas <= 0) return ReceiptStatus.ISSUED;

  if (input.succeededRefundPesewas >= input.originalAmountPesewas) {
    return ReceiptStatus.REFUNDED;
  }

  return ReceiptStatus.PARTIALLY_REFUNDED;
}

function computedRefundState(input: {
  originalAmountPesewas: number;
  succeededRefundPesewas: number;
  pendingRefundPesewas: number;
}): Exclude<RefundStateFilter, "ALL"> {
  if (input.succeededRefundPesewas >= input.originalAmountPesewas && input.originalAmountPesewas > 0) {
    return "FULLY_REFUNDED";
  }

  if (input.succeededRefundPesewas > 0) {
    return "PARTIALLY_REFUNDED";
  }

  if (input.pendingRefundPesewas > 0) {
    return "HAS_PENDING_REFUND";
  }

  return "NOT_REFUNDED";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const term = clean(url.searchParams.get("term")) || null;
  const academicYear = clean(url.searchParams.get("academicYear")) || null;
  const studentId = clean(url.searchParams.get("studentId")) || null;
  const method = clean(url.searchParams.get("method")).toLowerCase() || null;
  const q = clean(url.searchParams.get("q")) || null;
  const refundState = parseRefundState(url.searchParams.get("refundState"));
  const take = clampTake(url.searchParams.get("take"));

  try {
    const invoiceFilter: Prisma.FeeInvoiceWhereInput = {};

    if (term) invoiceFilter.term = term;
    if (academicYear) invoiceFilter.academicYear = academicYear;
    if (studentId) invoiceFilter.studentId = studentId;

    const where: Prisma.ReceiptWhereInput = {
      tenantId,
      ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
      ...(method ? { feePayment: { method } } : {}),
    };

    if (q) {
      where.OR = [
        { receiptNumber: { contains: q, mode: "insensitive" } },
        { issuedToName: { contains: q, mode: "insensitive" } },
        { issuedToPhone: { contains: q, mode: "insensitive" } },
        { feePayment: { reference: { contains: q, mode: "insensitive" } } },
        { invoice: { student: { firstName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { lastName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianPhone: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianPhoneNorm: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const receipts = await prisma.receipt.findMany({
      where,
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
                provider: true,
                providerReference: true,
                providerTransactionId: true,
                amountPesewas: true,
                currency: true,
                status: true,
              },
            },
            refunds: {
              where: {
                status: {
                  in: [
                    RefundStatus.REQUESTED,
                    RefundStatus.APPROVED,
                    RefundStatus.PROCESSING,
                    RefundStatus.SUCCEEDED,
                    RefundStatus.FAILED,
                    RefundStatus.CANCELLED,
                  ],
                },
              },
              select: {
                id: true,
                amountPesewas: true,
                status: true,
                reason: true,
                provider: true,
                providerReference: true,
                providerRefundReference: true,
                requestedAt: true,
                approvedAt: true,
                processingAt: true,
                processedAt: true,
                failedAt: true,
                cancelledAt: true,
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
      },
      orderBy: [{ issuedAt: "desc" }],
      take,
    });

    const mapped = receipts.map((r) => {
      const refunds = r.feePayment?.refunds ?? [];
      const originalAmountPesewas = r.feePayment?.amountPesewas ?? 0;

      const succeededRefundPesewas = refunds
        .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
        .reduce((sum, refund) => sum + refund.amountPesewas, 0);

      const pendingRefundPesewas = refunds
        .filter(
          (refund) =>
            refund.status === RefundStatus.REQUESTED ||
            refund.status === RefundStatus.APPROVED ||
            refund.status === RefundStatus.PROCESSING
        )
        .reduce((sum, refund) => sum + refund.amountPesewas, 0);

      const failedRefundPesewas = refunds
        .filter((refund) => refund.status === RefundStatus.FAILED)
        .reduce((sum, refund) => sum + refund.amountPesewas, 0);

      const cancelledRefundPesewas = refunds
        .filter((refund) => refund.status === RefundStatus.CANCELLED)
        .reduce((sum, refund) => sum + refund.amountPesewas, 0);

      const reservedRefundPesewas = succeededRefundPesewas + pendingRefundPesewas;
      const netAmountPesewas = Math.max(0, originalAmountPesewas - succeededRefundPesewas);
      const remainingRefundablePesewas = Math.max(0, originalAmountPesewas - reservedRefundPesewas);

      const refundStateValue = computedRefundState({
        originalAmountPesewas,
        succeededRefundPesewas,
        pendingRefundPesewas,
      });

      const expectedStatus = expectedReceiptStatus({
        originalAmountPesewas,
        succeededRefundPesewas,
      });

      const studentName =
        fullName(r.invoice?.student?.firstName, r.invoice?.student?.lastName) ||
        "Unknown";

      const issuedByName =
        fullName(r.issuedBy?.firstName, r.issuedBy?.lastName) ||
        r.issuedBy?.name ||
        "System";

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        issuedAt: r.issuedAt.toISOString(),
        issuedToName: r.issuedToName,
        issuedToPhone: r.issuedToPhone,
        status: r.status,
        expectedStatus,
        statusMatchesRefundTruth: r.status === expectedStatus,
        reversedAt: r.reversedAt?.toISOString() ?? null,
        reversalReason: r.reversalReason,
        note: r.note,

        amountPesewas: originalAmountPesewas,
        originalAmountPesewas,
        grossPaidPesewas: originalAmountPesewas,
        refundedPesewas: succeededRefundPesewas,
        succeededRefundPesewas,
        pendingRefundPesewas,
        failedRefundPesewas,
        cancelledRefundPesewas,
        reservedRefundPesewas,
        netAmountPesewas,
        netPaidPesewas: netAmountPesewas,
        remainingRefundablePesewas,
        refundState: refundStateValue,

        method: r.feePayment?.method ?? null,
        reference: r.feePayment?.reference ?? null,
        channel: r.feePayment?.channel ?? null,
        paidAt: r.feePayment?.paidAt?.toISOString() ?? null,
        paymentStatus: r.feePayment?.status ?? null,
        isSuccessfulPayment:
          r.feePayment?.status === PaymentStatus.SUCCESS ||
          r.feePayment?.status === PaymentStatus.REFUNDED,

        provider: r.feePayment?.paymentTransaction?.provider ?? null,
        providerReference:
          r.feePayment?.paymentTransaction?.providerReference ??
          r.feePayment?.reference ??
          null,
        providerTransactionId:
          r.feePayment?.paymentTransaction?.providerTransactionId ?? null,
        providerPaymentStatus: r.feePayment?.paymentTransaction?.status ?? null,
        currency: r.feePayment?.paymentTransaction?.currency ?? "GHS",

        invoiceId: r.invoice?.id ?? null,
        invoiceStatus: r.invoice?.status ?? null,
        invoiceTotalBilledPesewas: r.invoice?.totalBilledPesewas ?? null,
        invoiceTotalWaivedPesewas: r.invoice?.totalWaivedPesewas ?? null,
        invoiceTotalPaidPesewas: r.invoice?.totalPaidPesewas ?? null,
        invoiceBalancePesewas: r.invoice?.balancePesewas ?? null,
        term: r.invoice?.term ?? null,
        academicYear: r.invoice?.academicYear ?? null,

        studentId: r.invoice?.student?.id ?? null,
        studentName,
        guardianName: r.invoice?.student?.guardianName ?? null,
        guardianPhone:
          r.invoice?.student?.guardianPhoneNorm ??
          r.invoice?.student?.guardianPhone ??
          null,
        classLabel: classLabel(r.invoice?.student?.classroom),

        issuedByName,

        refunds: refunds.map((refund) => ({
          id: refund.id,
          amountPesewas: refund.amountPesewas,
          status: refund.status,
          reason: refund.reason,
          provider: refund.provider,
          providerReference: refund.providerReference,
          providerRefundReference: refund.providerRefundReference,
          requestedAt: refund.requestedAt.toISOString(),
          approvedAt: refund.approvedAt?.toISOString() ?? null,
          processingAt: refund.processingAt?.toISOString() ?? null,
          processedAt: refund.processedAt?.toISOString() ?? null,
          failedAt: refund.failedAt?.toISOString() ?? null,
          cancelledAt: refund.cancelledAt?.toISOString() ?? null,
        })),
      };
    });

    const items =
      refundState === "ALL"
        ? mapped
        : mapped.filter((item) => item.refundState === refundState);

    return jsonNoStore(200, {
      ok: true,
      count: items.length,
      take,
      filters: {
        term,
        academicYear,
        studentId,
        method,
        q,
        refundState,
      },
      totalAmountPesewas: items.reduce((sum, item) => sum + item.originalAmountPesewas, 0),
      totalRefundedPesewas: items.reduce((sum, item) => sum + item.succeededRefundPesewas, 0),
      totalPendingRefundPesewas: items.reduce((sum, item) => sum + item.pendingRefundPesewas, 0),
      totalNetAmountPesewas: items.reduce((sum, item) => sum + item.netAmountPesewas, 0),
      inconsistentReceiptStatusCount: items.filter((item) => !item.statusMatchesRefundTruth).length,
      receipts: items,
      items,
    });
  } catch (err) {
    console.error("[ADMIN_RECEIPTS_LIST_ERROR]", err);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPTS",
      receipts: [],
      items: [],
    });
  }
}