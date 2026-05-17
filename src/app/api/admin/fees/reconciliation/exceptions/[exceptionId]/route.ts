// src/app/api/admin/fees/reconciliation/exceptions/[exceptionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentStatus,
  RefundStatus,
  ReconciliationExceptionKind,
  type Prisma,
  type ReconciliationExceptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set<ReconciliationExceptionStatus>([
  "INVESTIGATING",
  "RESOLVED",
  "DISMISSED",
]);

type ExceptionForControlCheck = {
  id: string;
  status: ReconciliationExceptionStatus;
  batchId: string | null;
  invoiceId: string | null;
  providerReference: string | null;
  kind: ReconciliationExceptionKind;
  severity: string;
  expectedPesewas: number | null;
  actualPesewas: number | null;
  deltaPesewas: number | null;
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function toAuditJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
}

function isSuccessfulOrRefundedPayment(status: PaymentStatus) {
  return status === PaymentStatus.SUCCESS || status === PaymentStatus.REFUNDED;
}

async function getParams(ctx: {
  params: Promise<{ exceptionId: string }> | { exceptionId: string };
}) {
  return await ctx.params;
}

async function getInvoiceEvidence(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    invoiceId: string;
  }
) {
  const invoice = await tx.feeInvoice.findFirst({
    where: {
      id: input.invoiceId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
      totalPaidPesewas: true,
      balancePesewas: true,
      payments: {
        select: {
          id: true,
          amountPesewas: true,
          status: true,
          reference: true,
          receipt: { select: { id: true } },
          refunds: {
            select: {
              id: true,
              amountPesewas: true,
              status: true,
            },
          },
        },
      },
      receipts: {
        select: {
          id: true,
          feePaymentId: true,
          receiptNumber: true,
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
          receiptId: true,
        },
      },
    },
  });

  if (!invoice) return null;

  const successfulPayments = invoice.payments.filter((payment) =>
    isSuccessfulOrRefundedPayment(payment.status)
  );

  const grossPaymentTotal = successfulPayments.reduce(
    (sum, payment) => sum + payment.amountPesewas,
    0
  );

  const succeededRefundTotal = successfulPayments.reduce(
    (sum, payment) =>
      sum +
      payment.refunds
        .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
        .reduce((refundSum, refund) => refundSum + refund.amountPesewas, 0),
    0
  );

  const netPaymentTotal = Math.max(0, grossPaymentTotal - succeededRefundTotal);

  const paymentCreditTotal = invoice.ledgerEntries
    .filter((entry) => entry.entryType === "PAYMENT_CREDIT" && entry.direction === "CREDIT")
    .reduce((sum, entry) => sum + entry.amountPesewas, 0);

  const refundLedgerTotal = invoice.ledgerEntries
    .filter((entry) => entry.entryType === "REVERSAL_DEBIT" && entry.direction === "DEBIT")
    .reduce((sum, entry) => sum + entry.amountPesewas, 0);

  const ledgerNetTotal = Math.max(0, paymentCreditTotal - refundLedgerTotal);

  const netBilled = Math.max(0, invoice.totalBilledPesewas - invoice.totalWaivedPesewas);
  const expectedBalance = Math.max(0, netBilled - netPaymentTotal);

  return {
    invoice,
    successfulPayments,
    grossPaymentTotal,
    succeededRefundTotal,
    netPaymentTotal,
    paymentCreditTotal,
    refundLedgerTotal,
    ledgerNetTotal,
    netBilled,
    expectedBalance,
  };
}

async function isExceptionStillActive(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    exception: ExceptionForControlCheck;
  }
): Promise<{ active: boolean; evidence: Record<string, unknown> }> {
  const { tenantId, exception } = input;

  if (exception.kind === ReconciliationExceptionKind.DUPLICATE_PROVIDER_REFERENCE) {
    const reference = clean(exception.providerReference);

    if (!reference) {
      return {
        active: false,
        evidence: { reason: "No provider reference on exception." },
      };
    }

    const payments = await tx.feePayment.findMany({
      where: {
        tenantId,
        reference,
      },
      select: {
        id: true,
        invoiceId: true,
        amountPesewas: true,
        status: true,
      },
      take: 20,
    });

    return {
      active: payments.length > 1,
      evidence: {
        providerReference: reference,
        matchingPaymentCount: payments.length,
        matchingPayments: payments.map((payment) => ({
          id: payment.id,
          invoiceId: payment.invoiceId,
          amountPesewas: payment.amountPesewas,
          status: payment.status,
        })),
      },
    };
  }

  if (
    exception.kind === ReconciliationExceptionKind.UNMATCHED_PROVIDER_EVENT ||
    exception.kind === ReconciliationExceptionKind.SUSPICIOUS_PROVIDER_EVENT
  ) {
    const reference = clean(exception.providerReference);

    const events = await tx.paymentProviderEvent.findMany({
      where: {
        tenantId,
        ...(reference ? { providerReference: reference } : {}),
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
        isSuspicious: true,
        suspiciousReason: true,
        processingError: true,
      },
      take: 10,
    });

    return {
      active: events.length > 0,
      evidence: {
        providerReference: reference || null,
        matchingProviderEventCount: events.length,
        events,
      },
    };
  }

  if (!exception.invoiceId) {
    return {
      active: false,
      evidence: { reason: "Exception has no invoiceId, so route cannot re-check invoice evidence." },
    };
  }

  const evidence = await getInvoiceEvidence(tx, {
    tenantId,
    invoiceId: exception.invoiceId,
  });

  if (!evidence) {
    return {
      active: false,
      evidence: { reason: "Invoice no longer exists or is outside tenant scope." },
    };
  }

  const {
    invoice,
    successfulPayments,
    grossPaymentTotal,
    succeededRefundTotal,
    netPaymentTotal,
    paymentCreditTotal,
    refundLedgerTotal,
    ledgerNetTotal,
    netBilled,
    expectedBalance,
  } = evidence;

  if (exception.kind === ReconciliationExceptionKind.PAYMENT_WITHOUT_RECEIPT) {
    const matchingPaymentsWithoutReceipt = successfulPayments.filter((payment) => {
      const referenceMatches =
        !exception.providerReference || payment.reference === exception.providerReference;

      const amountMatches =
        exception.expectedPesewas == null || payment.amountPesewas === exception.expectedPesewas;

      return referenceMatches && amountMatches && !payment.receipt;
    });

    return {
      active: matchingPaymentsWithoutReceipt.length > 0,
      evidence: {
        invoiceId: invoice.id,
        matchingPaymentsWithoutReceiptCount: matchingPaymentsWithoutReceipt.length,
        providerReference: exception.providerReference,
        expectedPesewas: exception.expectedPesewas,
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.MISSING_LEDGER_ENTRY) {
    const active = paymentCreditTotal !== grossPaymentTotal;

    return {
      active,
      evidence: {
        invoiceId: invoice.id,
        grossPaymentTotal,
        paymentCreditTotal,
        deltaPesewas: grossPaymentTotal - paymentCreditTotal,
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.REFUND_WITHOUT_LEDGER_ENTRY) {
    const active = refundLedgerTotal !== succeededRefundTotal;

    return {
      active,
      evidence: {
        invoiceId: invoice.id,
        succeededRefundTotal,
        refundLedgerTotal,
        deltaPesewas: succeededRefundTotal - refundLedgerTotal,
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.REFUND_AMOUNT_MISMATCH) {
    const active = ledgerNetTotal !== netPaymentTotal;

    return {
      active,
      evidence: {
        invoiceId: invoice.id,
        netPaymentTotal,
        ledgerNetTotal,
        deltaPesewas: netPaymentTotal - ledgerNetTotal,
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.AMOUNT_MISMATCH) {
    const paidMismatch = invoice.totalPaidPesewas !== netPaymentTotal;
    const balanceMismatch = invoice.balancePesewas !== expectedBalance;

    return {
      active: paidMismatch || balanceMismatch,
      evidence: {
        invoiceId: invoice.id,
        storedTotalPaidPesewas: invoice.totalPaidPesewas,
        expectedTotalPaidPesewas: netPaymentTotal,
        storedBalancePesewas: invoice.balancePesewas,
        expectedBalancePesewas: expectedBalance,
        paidMismatch,
        balanceMismatch,
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.OVERPAYMENT) {
    const active = netPaymentTotal > netBilled;

    return {
      active,
      evidence: {
        invoiceId: invoice.id,
        netBilled,
        netPaymentTotal,
        overpaidPesewas: Math.max(0, netPaymentTotal - netBilled),
      },
    };
  }

  if (exception.kind === ReconciliationExceptionKind.RECEIPT_WITHOUT_PAYMENT) {
    const paymentIds = new Set(invoice.payments.map((payment) => payment.id));
    const orphanReceipts = invoice.receipts.filter((receipt) => !paymentIds.has(receipt.feePaymentId));

    return {
      active: orphanReceipts.length > 0,
      evidence: {
        invoiceId: invoice.id,
        orphanReceiptCount: orphanReceipts.length,
        orphanReceipts,
      },
    };
  }

  return {
    active: false,
    evidence: {
      reason: `No active re-check rule is defined for ${exception.kind}.`,
    },
  };
}

async function autoCloseBatchIfReady(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    batchId: string | null;
    actorUserId: string;
    trigger: string;
    exceptionId: string;
    previousStatus: string;
    nextStatus: string;
  }
) {
  if (!input.batchId) return false;

  const activeCount = await tx.reconciliationException.count({
    where: {
      tenantId: input.tenantId,
      batchId: input.batchId,
      status: { in: ["OPEN", "INVESTIGATING"] },
    },
  });

  if (activeCount !== 0) return false;

  const closedAt = new Date();

  const updated = await tx.reconciliationBatch.updateMany({
    where: {
      id: input.batchId,
      tenantId: input.tenantId,
      closedAt: null,
      status: { not: "CLOSED" },
    },
    data: {
      status: "CLOSED",
      closedAt,
    },
  });

  if (updated.count === 0) return false;

  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "FINANCE_RECONCILIATION_BATCH_AUTO_CLOSED",
      resource: "ReconciliationBatch",
      resourceId: input.batchId,
      metadata: {
        trigger: input.trigger,
        exceptionId: input.exceptionId,
        previousExceptionStatus: input.previousStatus,
        nextExceptionStatus: input.nextStatus,
        activeExceptionCountAfterAction: activeCount,
        closedAt: closedAt.toISOString(),
      },
    },
  });

  return true;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ exceptionId: string }> | { exceptionId: string } }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { exceptionId } = await getParams(ctx);
  const tenantId = auth.ctx.tenantId;
  const actorUserId = auth.ctx.userId;

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: { status?: ReconciliationExceptionStatus; resolutionNote?: string } = {};

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" });
  }

  const nextStatus = body.status;
  const resolutionNote = clean(body.resolutionNote);

  if (!nextStatus || !allowedStatuses.has(nextStatus)) {
    return json(400, { ok: false, error: "INVALID_EXCEPTION_STATUS" });
  }

  if (resolutionNote.length < 8) {
    return json(400, { ok: false, error: "RESOLUTION_NOTE_TOO_SHORT" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.reconciliationException.findFirst({
        where: {
          id: exceptionId,
          tenantId,
        },
        select: {
          id: true,
          status: true,
          batchId: true,
          invoiceId: true,
          providerReference: true,
          kind: true,
          severity: true,
          expectedPesewas: true,
          actualPesewas: true,
          deltaPesewas: true,
          batch: { select: { id: true, status: true, closedAt: true } },
        },
      });

      if (!existing) {
        return { ok: false as const, status: 404, error: "EXCEPTION_NOT_FOUND" };
      }

      if (existing.batch?.closedAt || existing.batch?.status === "CLOSED") {
        return { ok: false as const, status: 409, error: "BATCH_ALREADY_CLOSED" };
      }

      if (existing.status === "RESOLVED" || existing.status === "DISMISSED") {
        return { ok: false as const, status: 409, error: "EXCEPTION_ALREADY_CLOSED" };
      }

      const isTerminal = nextStatus === "RESOLVED" || nextStatus === "DISMISSED";

      if (nextStatus === "RESOLVED") {
        const activeCheck = await isExceptionStillActive(tx, {
          tenantId,
          exception: existing,
        });

        if (activeCheck.active) {
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: actorUserId,
              action: "FINANCE_RECONCILIATION_EXCEPTION_RESOLVE_BLOCKED",
              resource: "ReconciliationException",
              resourceId: exceptionId,
              metadata: {
                attemptedStatus: nextStatus,
                currentStatus: existing.status,
                kind: existing.kind,
                severity: existing.severity,
                batchId: existing.batchId,
                invoiceId: existing.invoiceId,
                providerReference: existing.providerReference,
                resolutionNote,
                reason:
                  "Resolve was blocked because the underlying accounting/control issue is still active.",
                activeEvidence: toAuditJsonObject(activeCheck.evidence),
              },
            },
          });

          return {
            ok: false as const,
            status: 409,
            error: "EXCEPTION_STILL_ACTIVE_REPAIR_OR_DISMISS",
            evidence: activeCheck.evidence,
          };
        }
      }

      const updated = await tx.reconciliationException.update({
        where: { id: exceptionId },
        data: {
          status: nextStatus,
          resolutionNote,
          resolvedByUserId: isTerminal ? actorUserId : null,
          resolvedAt: isTerminal ? new Date() : null,
        },
        select: {
          id: true,
          status: true,
          resolutionNote: true,
          resolvedAt: true,
          resolvedBy: { select: { name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "FINANCE_RECONCILIATION_EXCEPTION_UPDATED",
          resource: "ReconciliationException",
          resourceId: exceptionId,
          metadata: {
            previousStatus: existing.status,
            nextStatus,
            kind: existing.kind,
            severity: existing.severity,
            batchId: existing.batchId,
            invoiceId: existing.invoiceId,
            providerReference: existing.providerReference,
            resolutionNote,
          },
        },
      });

      const batchAutoClosed = isTerminal
        ? await autoCloseBatchIfReady(tx, {
            tenantId,
            batchId: existing.batchId,
            actorUserId,
            trigger: "EXCEPTION_STATUS_UPDATE",
            exceptionId,
            previousStatus: existing.status,
            nextStatus,
          })
        : false;

      return { ok: true as const, exception: updated, batchAutoClosed };
    });

    if (!result.ok) {
      return json(result.status, {
        ok: false,
        error: result.error,
        evidence: "evidence" in result ? result.evidence : undefined,
      });
    }

    return json(200, {
      ok: true,
      batchAutoClosed: result.batchAutoClosed,
      exception: {
        ...result.exception,
        resolvedAt: result.exception.resolvedAt?.toISOString() ?? null,
        resolvedByName:
          result.exception.resolvedBy?.name ?? result.exception.resolvedBy?.email ?? null,
      },
    });
  } catch (err) {
    console.error("[RECONCILIATION_EXCEPTION_UPDATE_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_UPDATE_RECONCILIATION_EXCEPTION" });
  }
}