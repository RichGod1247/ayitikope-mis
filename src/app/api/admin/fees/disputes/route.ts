// src/app/api/admin/fees/disputes/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisputeKind =
  | "OVERPAYMENT"
  | "PAYMENT_WITHOUT_RECEIPT"
  | "RECEIPT_WITHOUT_PAYMENT"
  | "DUPLICATE_REFERENCE"
  | "STORED_TOTAL_MISMATCH"
  | "PAYMENT_WITHOUT_LEDGER"
  | "REFUND_WITHOUT_LEDGER_ENTRY"
  | "REFUND_AMOUNT_MISMATCH"
  | "PROVIDER_EVENT_NEEDS_REVIEW";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Dispute = {
  kind: DisputeKind;
  severity: Severity;
  invoiceId: string | null;
  studentName: string;
  term: string | null;
  academicYear: string | null;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function studentName(s?: { firstName: string | null; lastName: string | null } | null) {
  return [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function clampLimit(v: string | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 500;
  return Math.min(Math.max(Math.floor(n), 1), 2000);
}

function isSuccessfulOrRefundedPayment(status: PaymentStatus) {
  return status === PaymentStatus.SUCCESS || status === PaymentStatus.REFUNDED;
}

function pushDispute(
  disputes: Dispute[],
  input: Omit<
    Dispute,
    | "invoiceId"
    | "studentName"
    | "term"
    | "academicYear"
    | "providerReference"
    | "expectedPesewas"
    | "actualPesewas"
    | "deltaPesewas"
  > &
    Partial<Dispute>
) {
  disputes.push({
    kind: input.kind,
    severity: input.severity,
    invoiceId: input.invoiceId ?? null,
    studentName: input.studentName ?? "Unknown",
    term: input.term ?? null,
    academicYear: input.academicYear ?? null,
    providerReference: input.providerReference ?? null,
    expectedPesewas: input.expectedPesewas ?? null,
    actualPesewas: input.actualPesewas ?? null,
    deltaPesewas: input.deltaPesewas ?? null,
    description: input.description,
  });
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
  const limit = clampLimit(url.searchParams.get("limit"));

  try {
    const invoiceWhere: Prisma.FeeInvoiceWhereInput = { tenantId };
    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
        student: { select: { firstName: true, lastName: true } },
        payments: {
          select: {
            id: true,
            amountPesewas: true,
            status: true,
            method: true,
            reference: true,
            createdAt: true,
            refunds: {
              select: {
                id: true,
                amountPesewas: true,
                status: true,
                providerRefundReference: true,
              },
            },
          },
        },
        receipts: {
          select: {
            id: true,
            feePaymentId: true,
            receiptNumber: true,
            status: true,
            createdAt: true,
          },
        },
        ledgerEntries: {
          select: {
            id: true,
            entryType: true,
            direction: true,
            amountPesewas: true,
            feePaymentId: true,
            feeRefundId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const disputes: Dispute[] = [];

    for (const inv of invoices) {
      const name = studentName(inv.student);
      const successfulPayments = inv.payments.filter((p) =>
        isSuccessfulOrRefundedPayment(p.status)
      );

      const grossPaid = successfulPayments.reduce((sum, p) => sum + p.amountPesewas, 0);

      const succeededRefunds = successfulPayments.reduce(
        (sum, p) =>
          sum +
          p.refunds
            .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
            .reduce((rSum, refund) => rSum + refund.amountPesewas, 0),
        0
      );

      const netPaid = Math.max(0, grossPaid - succeededRefunds);
      const netBilled = Math.max(0, inv.totalBilledPesewas - inv.totalWaivedPesewas);
      const expectedBalance = Math.max(0, netBilled - netPaid);

      if (inv.totalPaidPesewas !== netPaid) {
        pushDispute(disputes, {
          kind: "STORED_TOTAL_MISMATCH",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          expectedPesewas: netPaid,
          actualPesewas: inv.totalPaidPesewas,
          deltaPesewas: inv.totalPaidPesewas - netPaid,
          description:
            "Invoice stored paid total does not equal successful payments minus succeeded refunds.",
        });
      }

      if (inv.balancePesewas !== expectedBalance) {
        pushDispute(disputes, {
          kind: "STORED_TOTAL_MISMATCH",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          expectedPesewas: expectedBalance,
          actualPesewas: inv.balancePesewas,
          deltaPesewas: inv.balancePesewas - expectedBalance,
          description:
            "Invoice stored balance does not equal billed minus waived minus refund-aware net paid.",
        });
      }

      if (netPaid > netBilled) {
        pushDispute(disputes, {
          kind: "OVERPAYMENT",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          expectedPesewas: netBilled,
          actualPesewas: netPaid,
          deltaPesewas: netPaid - netBilled,
          description:
            "Successful payments minus succeeded refunds still exceed net billed amount.",
        });
      }

      const receiptByPaymentId = new Map(inv.receipts.map((r) => [r.feePaymentId, r]));
      const paymentIds = new Set(inv.payments.map((p) => p.id));

      for (const payment of successfulPayments) {
        if (!receiptByPaymentId.has(payment.id)) {
          pushDispute(disputes, {
            kind: "PAYMENT_WITHOUT_RECEIPT",
            severity: "CRITICAL",
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: payment.amountPesewas,
            actualPesewas: 0,
            deltaPesewas: payment.amountPesewas,
            description: "Successful payment exists without an official receipt.",
          });
        }

        const paymentLedgerTotal = inv.ledgerEntries
          .filter(
            (entry) =>
              entry.feePaymentId === payment.id &&
              entry.entryType === "PAYMENT_CREDIT" &&
              entry.direction === "CREDIT"
          )
          .reduce((sum, entry) => sum + entry.amountPesewas, 0);

        if (paymentLedgerTotal !== payment.amountPesewas) {
          pushDispute(disputes, {
            kind: "PAYMENT_WITHOUT_LEDGER",
            severity: "CRITICAL",
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: payment.amountPesewas,
            actualPesewas: paymentLedgerTotal,
            deltaPesewas: payment.amountPesewas - paymentLedgerTotal,
            description: "Successful payment does not have matching PAYMENT_CREDIT ledger truth.",
          });
        }

        for (const refund of payment.refunds.filter((r) => r.status === RefundStatus.SUCCEEDED)) {
          const refundLedgerTotal = inv.ledgerEntries
            .filter(
              (entry) =>
                entry.feeRefundId === refund.id &&
                entry.entryType === "REVERSAL_DEBIT" &&
                entry.direction === "DEBIT"
            )
            .reduce((sum, entry) => sum + entry.amountPesewas, 0);

          if (refundLedgerTotal !== refund.amountPesewas) {
            pushDispute(disputes, {
              kind: "REFUND_WITHOUT_LEDGER_ENTRY",
              severity: "CRITICAL",
              invoiceId: inv.id,
              studentName: name,
              term: inv.term,
              academicYear: inv.academicYear,
              providerReference: payment.reference,
              expectedPesewas: refund.amountPesewas,
              actualPesewas: refundLedgerTotal,
              deltaPesewas: refund.amountPesewas - refundLedgerTotal,
              description: "Succeeded refund does not have matching REVERSAL_DEBIT ledger truth.",
            });
          }
        }
      }

      for (const receipt of inv.receipts) {
        if (!paymentIds.has(receipt.feePaymentId)) {
          pushDispute(disputes, {
            kind: "RECEIPT_WITHOUT_PAYMENT",
            severity: "CRITICAL",
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            expectedPesewas: null,
            actualPesewas: null,
            deltaPesewas: null,
            description: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
          });
        }
      }
    }

    const referencedPayments = await prisma.feePayment.findMany({
      where: { tenantId, reference: { not: null } },
      select: {
        id: true,
        invoiceId: true,
        reference: true,
        amountPesewas: true,
        invoice: {
          select: {
            term: true,
            academicYear: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
      take: 10000,
    });

    const byReference = new Map<string, typeof referencedPayments>();

    for (const payment of referencedPayments) {
      const ref = clean(payment.reference);
      if (!ref) continue;

      const bucket = byReference.get(ref) ?? [];
      bucket.push(payment);
      byReference.set(ref, bucket);
    }

    for (const [reference, payments] of byReference.entries()) {
      if (payments.length <= 1) continue;

      const total = payments.reduce((sum, p) => sum + p.amountPesewas, 0);

      pushDispute(disputes, {
        kind: "DUPLICATE_REFERENCE",
        severity: "CRITICAL",
        invoiceId: payments[0]?.invoiceId ?? null,
        studentName: studentName(payments[0]?.invoice?.student),
        term: payments[0]?.invoice?.term ?? null,
        academicYear: payments[0]?.invoice?.academicYear ?? null,
        providerReference: reference,
        expectedPesewas: payments[0]?.amountPesewas ?? null,
        actualPesewas: total,
        deltaPesewas: total - (payments[0]?.amountPesewas ?? 0),
        description: "More than one payment uses the same provider reference.",
      });
    }

    const providerEvents = await prisma.paymentProviderEvent.findMany({
      where: {
        tenantId,
        OR: [
          { processingStatus: { in: ["RECEIVED", "FAILED"] } },
          { isSuspicious: true },
        ],
      },
      select: {
        id: true,
        eventType: true,
        providerReference: true,
        processingStatus: true,
        processingError: true,
        isSuspicious: true,
        suspiciousReason: true,
      },
      take: 1000,
    });

    for (const event of providerEvents) {
      pushDispute(disputes, {
        kind: "PROVIDER_EVENT_NEEDS_REVIEW",
        severity:
          event.processingStatus === "FAILED" || event.isSuspicious
            ? "HIGH"
            : "MEDIUM",
        invoiceId: null,
        studentName: "Provider Event",
        providerReference: event.providerReference,
        description:
          `${event.eventType} is ${event.processingStatus}` +
          (event.processingError ? `: ${event.processingError}` : "") +
          (event.suspiciousReason ? ` Suspicion: ${event.suspiciousReason}` : "."),
      });
    }

    const rank: Record<Severity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    const highestSeverity =
      disputes.length === 0
        ? null
        : disputes.reduce<Severity>(
            (max, dispute) => (rank[dispute.severity] > rank[max] ? dispute.severity : max),
            disputes[0].severity
          );

    return json(200, {
      ok: true,
      isClean: disputes.length === 0,
      count: disputes.length,
      highestSeverity,
      scannedInvoices: invoices.length,
      disputes,
    });
  } catch (err) {
    console.error("[ADMIN_FEES_DISPUTES_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_SCAN_PAYMENT_DISPUTES",
      isClean: false,
      count: 0,
      highestSeverity: null,
      scannedInvoices: 0,
      disputes: [],
    });
  }
}