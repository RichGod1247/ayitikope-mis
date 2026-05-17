// src/app/api/admin/fees/disputes/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentStatus,
  ReconciliationExceptionKind,
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

type DisputeDisposition =
  | "NEW_RISK"
  | "ALREADY_IN_RECONCILIATION"
  | "DISMISSED_IN_RECONCILIATION";

type DisputeDraft = {
  kind: DisputeKind;
  reconciliationKind: ReconciliationExceptionKind;
  severity: Severity;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  refundId: string | null;
  providerEventId: string | null;
  studentName: string;
  term: string | null;
  academicYear: string | null;
  providerReference: string | null;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
  description: string;
  caseDescription: string;
  evidence: string[];
  recommendedAction: string;
};

type Dispute = Omit<DisputeDraft, "caseDescription"> & {
  handledByReconciliation: boolean;
  disposition: DisputeDisposition;
  reconciliationExceptionId: string | null;
  reconciliationBatchId: string | null;
  reconciliationStatus: string | null;
  reconciliationBatchStatus: string | null;
  reconciliationBatchDate: string | null;
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

function caseKey(input: {
  reconciliationKind: ReconciliationExceptionKind | string;
  invoiceId: string | null;
  providerReference: string | null;
  caseDescription: string;
}) {
  return [
    input.reconciliationKind,
    input.invoiceId ?? "NO_INVOICE",
    clean(input.providerReference) || "NO_REFERENCE",
    input.caseDescription,
  ].join("::");
}

function recommendedAction(kind: DisputeKind) {
  const map: Record<DisputeKind, string> = {
    OVERPAYMENT:
      "Open reconciliation, investigate the invoice, and verify whether a refund, waiver, or correction is required.",
    PAYMENT_WITHOUT_RECEIPT:
      "Open reconciliation and use the controlled repair action to create the missing receipt if the payment is valid.",
    RECEIPT_WITHOUT_PAYMENT:
      "Investigate immediately. A receipt without payment evidence should not be dismissed without proof.",
    DUPLICATE_REFERENCE:
      "Verify provider/reference evidence. Duplicate payment references require investigation before any dismissal.",
    STORED_TOTAL_MISMATCH:
      "Recalculate or repair the invoice through the finance workflow. The stored invoice truth disagrees with derived evidence.",
    PAYMENT_WITHOUT_LEDGER:
      "Investigate ledger truth. A successful payment must have matching PAYMENT_CREDIT ledger evidence.",
    REFUND_WITHOUT_LEDGER_ENTRY:
      "Verify refund completion and ensure the REVERSAL_DEBIT ledger entry exists exactly once.",
    REFUND_AMOUNT_MISMATCH:
      "Investigate refund and ledger totals. Net paid must equal gross successful payments minus succeeded refunds.",
    PROVIDER_EVENT_NEEDS_REVIEW:
      "Review provider event recovery/reprocess tools. Suspicious or failed provider events must not be ignored.",
  };

  return map[kind];
}

function pushDispute(
  disputes: DisputeDraft[],
  input: Omit<
    DisputeDraft,
    | "invoiceId"
    | "paymentId"
    | "receiptId"
    | "refundId"
    | "providerEventId"
    | "studentName"
    | "term"
    | "academicYear"
    | "providerReference"
    | "expectedPesewas"
    | "actualPesewas"
    | "deltaPesewas"
    | "evidence"
    | "recommendedAction"
  > &
    Partial<DisputeDraft>
) {
  disputes.push({
    kind: input.kind,
    reconciliationKind: input.reconciliationKind,
    severity: input.severity,
    invoiceId: input.invoiceId ?? null,
    paymentId: input.paymentId ?? null,
    receiptId: input.receiptId ?? null,
    refundId: input.refundId ?? null,
    providerEventId: input.providerEventId ?? null,
    studentName: input.studentName ?? "Unknown",
    term: input.term ?? null,
    academicYear: input.academicYear ?? null,
    providerReference: input.providerReference ?? null,
    expectedPesewas: input.expectedPesewas ?? null,
    actualPesewas: input.actualPesewas ?? null,
    deltaPesewas: input.deltaPesewas ?? null,
    description: input.description,
    caseDescription: input.caseDescription ?? input.description,
    evidence: input.evidence ?? [],
    recommendedAction: input.recommendedAction ?? recommendedAction(input.kind),
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

    const drafts: DisputeDraft[] = [];

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
        pushDispute(drafts, {
          kind: "STORED_TOTAL_MISMATCH",
          reconciliationKind: ReconciliationExceptionKind.AMOUNT_MISMATCH,
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
          caseDescription:
            "Invoice paid total does not equal successful payments minus succeeded refunds.",
          evidence: [
            `Invoice ID: ${inv.id}`,
            `Gross successful payments: ${grossPaid}`,
            `Succeeded refunds: ${succeededRefunds}`,
            `Expected net paid: ${netPaid}`,
            `Stored paid total: ${inv.totalPaidPesewas}`,
          ],
        });
      }

      if (inv.balancePesewas !== expectedBalance) {
        pushDispute(drafts, {
          kind: "STORED_TOTAL_MISMATCH",
          reconciliationKind: ReconciliationExceptionKind.AMOUNT_MISMATCH,
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
          caseDescription:
            "Invoice balance does not equal net billed minus net paid after succeeded refunds.",
          evidence: [
            `Invoice ID: ${inv.id}`,
            `Net billed: ${netBilled}`,
            `Net paid: ${netPaid}`,
            `Expected balance: ${expectedBalance}`,
            `Stored balance: ${inv.balancePesewas}`,
          ],
        });
      }

      if (netPaid > netBilled) {
        pushDispute(drafts, {
          kind: "OVERPAYMENT",
          reconciliationKind: ReconciliationExceptionKind.OVERPAYMENT,
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
          caseDescription: "Net payments after refunds exceed net billed amount.",
          evidence: [
            `Invoice ID: ${inv.id}`,
            `Net billed: ${netBilled}`,
            `Net paid: ${netPaid}`,
            `Overpaid amount: ${netPaid - netBilled}`,
          ],
        });
      }

      const receiptByPaymentId = new Map(inv.receipts.map((r) => [r.feePaymentId, r]));
      const paymentIds = new Set(inv.payments.map((p) => p.id));

      for (const payment of successfulPayments) {
        if (!receiptByPaymentId.has(payment.id)) {
          pushDispute(drafts, {
            kind: "PAYMENT_WITHOUT_RECEIPT",
            reconciliationKind: ReconciliationExceptionKind.PAYMENT_WITHOUT_RECEIPT,
            severity: "CRITICAL",
            invoiceId: inv.id,
            paymentId: payment.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: payment.amountPesewas,
            actualPesewas: 0,
            deltaPesewas: payment.amountPesewas,
            description: "Successful payment exists without an official receipt.",
            caseDescription: "Successful payment exists without receipt.",
            evidence: [
              `Invoice ID: ${inv.id}`,
              `Payment ID: ${payment.id}`,
              `Payment method: ${payment.method}`,
              `Payment reference: ${payment.reference ?? "—"}`,
              `Payment amount: ${payment.amountPesewas}`,
            ],
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
          pushDispute(drafts, {
            kind: "PAYMENT_WITHOUT_LEDGER",
            reconciliationKind: ReconciliationExceptionKind.MISSING_LEDGER_ENTRY,
            severity: "CRITICAL",
            invoiceId: inv.id,
            paymentId: payment.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: payment.amountPesewas,
            actualPesewas: paymentLedgerTotal,
            deltaPesewas: payment.amountPesewas - paymentLedgerTotal,
            description: "Successful payment does not have matching PAYMENT_CREDIT ledger truth.",
            caseDescription: "Payment does not have matching PAYMENT_CREDIT ledger entry.",
            evidence: [
              `Invoice ID: ${inv.id}`,
              `Payment ID: ${payment.id}`,
              `Payment reference: ${payment.reference ?? "—"}`,
              `Expected payment ledger total: ${payment.amountPesewas}`,
              `Actual payment ledger total: ${paymentLedgerTotal}`,
            ],
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
            pushDispute(drafts, {
              kind: "REFUND_WITHOUT_LEDGER_ENTRY",
              reconciliationKind: ReconciliationExceptionKind.REFUND_WITHOUT_LEDGER_ENTRY,
              severity: "CRITICAL",
              invoiceId: inv.id,
              paymentId: payment.id,
              refundId: refund.id,
              studentName: name,
              term: inv.term,
              academicYear: inv.academicYear,
              providerReference: payment.reference,
              expectedPesewas: refund.amountPesewas,
              actualPesewas: refundLedgerTotal,
              deltaPesewas: refund.amountPesewas - refundLedgerTotal,
              description: "Succeeded refund does not have matching REVERSAL_DEBIT ledger truth.",
              caseDescription: "Refund does not have matching REVERSAL_DEBIT ledger entry.",
              evidence: [
                `Invoice ID: ${inv.id}`,
                `Payment ID: ${payment.id}`,
                `Refund ID: ${refund.id}`,
                `Provider refund reference: ${refund.providerRefundReference ?? "—"}`,
                `Expected refund ledger total: ${refund.amountPesewas}`,
                `Actual refund ledger total: ${refundLedgerTotal}`,
              ],
            });
          }
        }
      }

      for (const receipt of inv.receipts) {
        if (!paymentIds.has(receipt.feePaymentId)) {
          pushDispute(drafts, {
            kind: "RECEIPT_WITHOUT_PAYMENT",
            reconciliationKind: ReconciliationExceptionKind.RECEIPT_WITHOUT_PAYMENT,
            severity: "CRITICAL",
            invoiceId: inv.id,
            receiptId: receipt.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            expectedPesewas: null,
            actualPesewas: null,
            deltaPesewas: null,
            description: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
            caseDescription: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
            evidence: [
              `Invoice ID: ${inv.id}`,
              `Receipt ID: ${receipt.id}`,
              `Receipt number: ${receipt.receiptNumber}`,
              `Missing payment ID: ${receipt.feePaymentId}`,
              `Receipt status: ${receipt.status}`,
            ],
          });
        }
      }

      const paymentCreditTotal = inv.ledgerEntries
        .filter((entry) => entry.entryType === "PAYMENT_CREDIT" && entry.direction === "CREDIT")
        .reduce((sum, entry) => sum + entry.amountPesewas, 0);

      const refundLedgerTotal = inv.ledgerEntries
        .filter((entry) => entry.entryType === "REVERSAL_DEBIT" && entry.direction === "DEBIT")
        .reduce((sum, entry) => sum + entry.amountPesewas, 0);

      const ledgerNetTotal = Math.max(0, paymentCreditTotal - refundLedgerTotal);

      if (ledgerNetTotal !== netPaid) {
        pushDispute(drafts, {
          kind: "REFUND_AMOUNT_MISMATCH",
          reconciliationKind: ReconciliationExceptionKind.REFUND_AMOUNT_MISMATCH,
          severity: "CRITICAL",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          expectedPesewas: netPaid,
          actualPesewas: ledgerNetTotal,
          deltaPesewas: netPaid - ledgerNetTotal,
          description: "Ledger net does not equal gross payments minus succeeded refunds.",
          caseDescription: "Ledger net does not equal gross payments minus succeeded refunds.",
          evidence: [
            `Invoice ID: ${inv.id}`,
            `Payment ledger total: ${paymentCreditTotal}`,
            `Refund ledger total: ${refundLedgerTotal}`,
            `Ledger net total: ${ledgerNetTotal}`,
            `Expected net paid: ${netPaid}`,
          ],
        });
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

      pushDispute(drafts, {
        kind: "DUPLICATE_REFERENCE",
        reconciliationKind: ReconciliationExceptionKind.DUPLICATE_PROVIDER_REFERENCE,
        severity: "CRITICAL",
        invoiceId: payments[0]?.invoiceId ?? null,
        paymentId: payments[0]?.id ?? null,
        studentName: studentName(payments[0]?.invoice?.student),
        term: payments[0]?.invoice?.term ?? null,
        academicYear: payments[0]?.invoice?.academicYear ?? null,
        providerReference: reference,
        expectedPesewas: payments[0]?.amountPesewas ?? null,
        actualPesewas: total,
        deltaPesewas: total - (payments[0]?.amountPesewas ?? 0),
        description: "More than one payment uses the same provider reference.",
        caseDescription: "More than one payment uses the same provider reference.",
        evidence: [
          `Provider reference: ${reference}`,
          `Matching payment count: ${payments.length}`,
          `Matching payment IDs: ${payments.map((p) => p.id).join(", ")}`,
        ],
      });
    }

    const providerEvents = await prisma.paymentProviderEvent.findMany({
      where: {
        tenantId,
        OR: [{ processingStatus: { in: ["RECEIVED", "FAILED"] } }, { isSuspicious: true }],
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
      const caseDescription =
        `Provider event ${event.eventType} is ${event.processingStatus}` +
        (event.processingError ? `: ${event.processingError}` : "") +
        (event.suspiciousReason ? ` Suspicion: ${event.suspiciousReason}` : ".");

      pushDispute(drafts, {
        kind: "PROVIDER_EVENT_NEEDS_REVIEW",
        reconciliationKind: event.isSuspicious
          ? ReconciliationExceptionKind.SUSPICIOUS_PROVIDER_EVENT
          : ReconciliationExceptionKind.UNMATCHED_PROVIDER_EVENT,
        severity: event.processingStatus === "FAILED" || event.isSuspicious ? "HIGH" : "MEDIUM",
        invoiceId: null,
        providerEventId: event.id,
        studentName: "Provider Event",
        providerReference: event.providerReference,
        description: caseDescription,
        caseDescription,
        evidence: [
          `Provider event ID: ${event.id}`,
          `Event type: ${event.eventType}`,
          `Processing status: ${event.processingStatus}`,
          `Suspicious: ${event.isSuspicious ? "yes" : "no"}`,
          `Error: ${event.processingError ?? "—"}`,
          `Suspicious reason: ${event.suspiciousReason ?? "—"}`,
        ],
      });
    }

    const existingExceptions = await prisma.reconciliationException.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "INVESTIGATING", "DISMISSED"] },
      },
      select: {
        id: true,
        batchId: true,
        kind: true,
        status: true,
        invoiceId: true,
        providerReference: true,
        description: true,
        batch: {
          select: {
            status: true,
            batchDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const exceptionByCaseKey = new Map<string, (typeof existingExceptions)[number]>();

    for (const exception of existingExceptions) {
      const key = caseKey({
        reconciliationKind: exception.kind,
        invoiceId: exception.invoiceId,
        providerReference: exception.providerReference,
        caseDescription: exception.description,
      });

      if (!exceptionByCaseKey.has(key)) {
        exceptionByCaseKey.set(key, exception);
      }
    }

    const disputes: Dispute[] = drafts.map((draft) => {
      const matchedException = exceptionByCaseKey.get(
        caseKey({
          reconciliationKind: draft.reconciliationKind,
          invoiceId: draft.invoiceId,
          providerReference: draft.providerReference,
          caseDescription: draft.caseDescription,
        })
      );

      const disposition: DisputeDisposition = !matchedException
        ? "NEW_RISK"
        : matchedException.status === "DISMISSED"
          ? "DISMISSED_IN_RECONCILIATION"
          : "ALREADY_IN_RECONCILIATION";

      return {
        ...draft,
        handledByReconciliation: Boolean(matchedException),
        disposition,
        reconciliationExceptionId: matchedException?.id ?? null,
        reconciliationBatchId: matchedException?.batchId ?? null,
        reconciliationStatus: matchedException?.status ?? null,
        reconciliationBatchStatus: matchedException?.batch?.status ?? null,
        reconciliationBatchDate: matchedException?.batch?.batchDate?.toISOString() ?? null,
      };
    });

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

    const criticalCount = disputes.filter((d) => d.severity === "CRITICAL").length;
    const highCount = disputes.filter((d) => d.severity === "HIGH").length;
    const newRiskCount = disputes.filter((d) => d.disposition === "NEW_RISK").length;
    const alreadyInReconciliationCount = disputes.filter(
      (d) => d.disposition === "ALREADY_IN_RECONCILIATION"
    ).length;
    const dismissedInReconciliationCount = disputes.filter(
      (d) => d.disposition === "DISMISSED_IN_RECONCILIATION"
    ).length;

    return json(200, {
      ok: true,
      isClean: disputes.length === 0,
      count: disputes.length,
      highestSeverity,
      scannedInvoices: invoices.length,
      summary: {
        criticalCount,
        highCount,
        newRiskCount,
        alreadyInReconciliationCount,
        dismissedInReconciliationCount,
      },
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
      summary: {
        criticalCount: 0,
        highCount: 0,
        newRiskCount: 0,
        alreadyInReconciliationCount: 0,
        dismissedInReconciliationCount: 0,
      },
      disputes: [],
    });
  }
}