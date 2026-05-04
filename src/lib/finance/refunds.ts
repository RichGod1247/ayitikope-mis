// src/lib/finance/refunds.ts
import crypto from "crypto";
import {
  FinanceOutboxEventType,
  PaymentProvider,
  PaymentStatus,
  ReceiptStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FinanceError, recalculateInvoiceTotals } from "@/lib/finance/core";

type TxClient = Prisma.TransactionClient;

const TX_LONG = { maxWait: 10_000, timeout: 60_000 } as const;

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function toJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

function isUniqueError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function assertAmount(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new FinanceError("PAYMENT_AMOUNT_INVALID", 400, "Refund amount must be a positive integer in pesewas.");
  }
  return n;
}

function formatCedis(pesewas: number) {
  return (Math.max(0, Math.floor(pesewas)) / 100).toFixed(2);
}

async function lockFeePayment(tx: TxClient, tenantId: string, feePaymentId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeePayment"
    where "id" = ${feePaymentId} and "tenantId" = ${tenantId}
    for update
  `;
  if (!rows.length) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Fee payment not found.");
}

async function lockRefund(tx: TxClient, tenantId: string, refundId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeeRefund"
    where "id" = ${refundId} and "tenantId" = ${tenantId}
    for update
  `;
  if (!rows.length) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refund not found.");
}

async function lockInvoice(tx: TxClient, tenantId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeeInvoice"
    where "id" = ${invoiceId} and "tenantId" = ${tenantId}
    for update
  `;
  if (!rows.length) throw new FinanceError("INVOICE_NOT_FOUND", 404);
}

async function refundableExposure(tx: TxClient, tenantId: string, feePaymentId: string) {
  const [reserved, succeeded] = await Promise.all([
    tx.feeRefund.aggregate({
      where: {
        tenantId,
        feePaymentId,
        status: {
          in: [
            RefundStatus.REQUESTED,
            RefundStatus.APPROVED,
            RefundStatus.PROCESSING,
            RefundStatus.SUCCEEDED,
          ],
        },
      },
      _sum: { amountPesewas: true },
    }),
    tx.feeRefund.aggregate({
      where: { tenantId, feePaymentId, status: RefundStatus.SUCCEEDED },
      _sum: { amountPesewas: true },
    }),
  ]);

  return {
    reservedPesewas: reserved._sum.amountPesewas ?? 0,
    succeededPesewas: succeeded._sum.amountPesewas ?? 0,
  };
}

function buildRefundSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  receiptNumber: string | null;
  schoolName: string;
}) {
  return `EduLife OS: Refund of GHS ${formatCedis(input.amountPesewas)} has been processed for ${input.studentName}. ${
    input.receiptNumber ? `Original receipt: ${input.receiptNumber}. ` : ""
  }School: ${input.schoolName}. Keep this SMS as proof.`;
}

async function enqueueRefundSms(tx: TxClient, input: {
  tenantId: string;
  actorId?: string | null;
  refundId: string;
  receiptId: string | null;
  feePaymentId: string;
  invoiceId: string;
  to: string | null;
  message: string;
}) {
  if (!input.to?.trim()) return null;

  return tx.financeOutboxEvent.upsert({
    where: {
      type_idempotencyKey: {
        type: FinanceOutboxEventType.SMS_REFUND_NOTICE,
        idempotencyKey: `refund-sms:${input.refundId}`,
      },
    },
    create: {
      tenantId: input.tenantId,
      type: FinanceOutboxEventType.SMS_REFUND_NOTICE,
      status: "PENDING",
      idempotencyKey: `refund-sms:${input.refundId}`,
      aggregateType: "FeeRefund",
      aggregateId: input.refundId,
      payload: toJson({
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        to: input.to,
        message: input.message,
        template: "FEES_REFUND",
        refundId: input.refundId,
        receiptId: input.receiptId,
        feePaymentId: input.feePaymentId,
        invoiceId: input.invoiceId,
      }),
      priority: 3,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

async function createRefundLedgerOnce(tx: TxClient, input: {
  tenantId: string;
  invoiceId: string;
  studentId: string;
  feePaymentId: string;
  receiptId: string | null;
  feeRefundId: string;
  amountPesewas: number;
  actorUserId?: string | null;
}) {
  const existing = await tx.ledgerEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      feeRefundId: input.feeRefundId,
      entryType: "REVERSAL_DEBIT",
      direction: "DEBIT",
    },
    select: { id: true },
  });

  if (existing) return existing;

  try {
    return await tx.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        studentId: input.studentId,
        feePaymentId: input.feePaymentId,
        receiptId: input.receiptId,
        feeRefundId: input.feeRefundId,
        entryType: "REVERSAL_DEBIT",
        direction: "DEBIT",
        amountPesewas: input.amountPesewas,
        description: "Refund reversal against successful fee payment",
        journalRef: `REF-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase()}`,
        createdByUserId: input.actorUserId ?? null,
      },
      select: { id: true },
    });
  } catch (err) {
    if (!isUniqueError(err)) throw err;

    const raced = await tx.ledgerEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        feeRefundId: input.feeRefundId,
        entryType: "REVERSAL_DEBIT",
        direction: "DEBIT",
      },
      select: { id: true },
    });

    if (raced) return raced;
    throw err;
  }
}

export async function requestFeeRefund(input: {
  tenantId: string;
  feePaymentId: string;
  amountPesewas: number;
  reason: string;
  requestedByUserId: string;
  idempotencyKey: string;
}) {
  const amountPesewas = assertAmount(input.amountPesewas);
  const idempotencyKey = clean(input.idempotencyKey);
  if (!idempotencyKey) throw new FinanceError("DUPLICATE_PAYMENT_REFERENCE", 400, "idempotencyKey is required.");

  return prisma.$transaction(async (tx) => {
    await lockFeePayment(tx, input.tenantId, input.feePaymentId);

    const payment = await tx.feePayment.findFirst({
      where: {
        id: input.feePaymentId,
        tenantId: input.tenantId,
        status: { in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
      },
      select: {
        id: true,
        tenantId: true,
        invoiceId: true,
        amountPesewas: true,
        reference: true,
        method: true,
        invoice: {
          select: {
            id: true,
            studentId: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
              },
            },
            tenant: { select: { name: true } },
          },
        },
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            status: true,
            issuedToPhone: true,
          },
        },
        paymentTransaction: {
          select: {
            id: true,
            provider: true,
            providerReference: true,
            providerTransactionId: true,
            currency: true,
          },
        },
      },
    });

    if (!payment) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refundable payment not found.");
    if (!payment.receipt) throw new FinanceError("PAYMENT_AMOUNT_INVALID", 409, "Cannot refund payment without receipt.");

    await lockInvoice(tx, input.tenantId, payment.invoiceId);

    const exposure = await refundableExposure(tx, input.tenantId, payment.id);
    const available = payment.amountPesewas - exposure.reservedPesewas;

    if (amountPesewas > available) {
      throw new FinanceError("PAYMENT_EXCEEDS_BALANCE", 409, "Refund exceeds remaining refundable amount.");
    }

    const provider = payment.paymentTransaction?.provider ?? PaymentProvider.MANUAL;
    const providerReference =
      payment.paymentTransaction?.providerReference ?? payment.reference ?? null;

    try {
      return await tx.feeRefund.create({
        data: {
          tenantId: input.tenantId,
          feePaymentId: payment.id,
          paymentTransactionId: payment.paymentTransaction?.id ?? null,
          receiptId: payment.receipt.id,
          provider,
          providerReference,
          idempotencyKey,
          amountPesewas,
          currency: payment.paymentTransaction?.currency ?? "GHS",
          status: RefundStatus.REQUESTED,
          reason: clean(input.reason) || null,
          requestedByUserId: input.requestedByUserId,
          metadata: toJson({
            originalPaymentAmountPesewas: payment.amountPesewas,
            reservedBeforePesewas: exposure.reservedPesewas,
            availableBeforePesewas: available,
            receiptNumber: payment.receipt.receiptNumber,
          }),
        },
      });
    } catch (err) {
      if (!isUniqueError(err)) throw err;

      const existing = await tx.feeRefund.findFirst({
  where: {
    tenantId: input.tenantId,
    idempotencyKey,
  },
});

      if (existing) return existing;
      throw err;
    }
  }, TX_LONG);
}

export async function approveFeeRefund(input: {
  tenantId: string;
  refundId: string;
  approvedByUserId: string;
  approvalNote?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await lockRefund(tx, input.tenantId, input.refundId);

    const refund = await tx.feeRefund.findFirst({
      where: { id: input.refundId, tenantId: input.tenantId },
      select: {
        id: true,
        status: true,
        requestedByUserId: true,
      },
    });

    if (!refund) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refund not found.");

    if (refund.status === RefundStatus.APPROVED) return refund;

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new FinanceError("PAYMENT_ALREADY_PROCESSED", 409, "Only REQUESTED refunds can be approved.");
    }

    if (refund.requestedByUserId === input.approvedByUserId) {
      throw new FinanceError("PAYMENT_ALREADY_PROCESSED", 409, "Requester cannot approve their own refund.");
    }

    return tx.feeRefund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.APPROVED,
        approvedByUserId: input.approvedByUserId,
        approvedAt: new Date(),
        approvalNote: clean(input.approvalNote) || null,
      },
    });
  }, TX_LONG);
}

async function callPaystackCreateRefund(input: {
  transaction: string;
  amountPesewas: number;
  currency: string;
  reason: string | null;
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) throw new FinanceError("PAYMENT_SERVICE_NOT_CONFIGURED", 500);

  const res = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: input.transaction,
      amount: input.amountPesewas,
      currency: input.currency,
      customer_note: input.reason ?? "School fees refund",
      merchant_note: input.reason ?? "EduLife OS approved refund",
    }),
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => null)) as {
  status?: boolean;
  data?: {
    reference?: unknown;
    id?: unknown;
    refund_reference?: unknown;
  };
  message?: unknown;
} | null;

  if (!res.ok || !raw?.status) {
    return {
      ok: false as const,
      status: res.status || 502,
      raw,
    };
  }

  return {
    ok: true as const,
    raw,
    providerRefundReference:
      clean(raw?.data?.reference) ||
      clean(raw?.data?.id) ||
      clean(raw?.data?.refund_reference) ||
      null,
  };
}

export async function finalizeRefundSuccess(tx: TxClient, input: {
  tenantId: string;
  refundId: string;
  actorUserId?: string | null;
  providerRaw?: unknown;
}) {
  const refund = await tx.feeRefund.findFirst({
    where: { id: input.refundId, tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      feePaymentId: true,
      receiptId: true,
      amountPesewas: true,
      reason: true,
      provider: true,
      providerReference: true,
      feePayment: {
        select: {
          id: true,
          invoiceId: true,
          amountPesewas: true,
          invoice: {
            select: {
              studentId: true,
              tenant: { select: { name: true } },
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
        },
      },
      receipt: {
        select: {
          id: true,
          receiptNumber: true,
          issuedToPhone: true,
        },
      },
    },
  });

  if (!refund) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refund not found.");

  await createRefundLedgerOnce(tx, {
    tenantId: input.tenantId,
    invoiceId: refund.feePayment.invoiceId,
    studentId: refund.feePayment.invoice.studentId,
    feePaymentId: refund.feePaymentId,
    receiptId: refund.receiptId,
    feeRefundId: refund.id,
    amountPesewas: refund.amountPesewas,
    actorUserId: input.actorUserId,
  });

  const exposure = await refundableExposure(tx, input.tenantId, refund.feePaymentId);
  const totalSucceededAfter = exposure.succeededPesewas + refund.amountPesewas;
  const fullRefunded = totalSucceededAfter >= refund.feePayment.amountPesewas;

  await tx.feeRefund.update({
    where: { id: refund.id },
    data: {
      status: RefundStatus.SUCCEEDED,
      processedAt: new Date(),
      providerRaw: input.providerRaw === undefined ? undefined : toJson(input.providerRaw),
      failureReason: null,
    },
  });

  await tx.receipt.updateMany({
    where: { id: refund.receiptId ?? "", tenantId: input.tenantId },
    data: {
      status: fullRefunded ? ReceiptStatus.REFUNDED : ReceiptStatus.PARTIALLY_REFUNDED,
      reversedAt: fullRefunded ? new Date() : undefined,
      reversedByUserId: fullRefunded ? input.actorUserId ?? null : undefined,
      reversalReason: refund.reason ?? "Fee refund processed",
    },
  });

  await tx.feePayment.update({
    where: { id: refund.feePaymentId },
    data: {
      status: fullRefunded ? PaymentStatus.REFUNDED : PaymentStatus.SUCCESS,
    },
  });

  await recalculateInvoiceTotals(tx, input.tenantId, refund.feePayment.invoiceId);

  const studentName =
    [
      refund.feePayment.invoice.student?.firstName,
      refund.feePayment.invoice.student?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Student";

  const guardianPhone =
    refund.feePayment.invoice.student?.guardianPhoneNorm ||
    refund.feePayment.invoice.student?.guardianPhone ||
    refund.receipt?.issuedToPhone ||
    null;

  await enqueueRefundSms(tx, {
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    refundId: refund.id,
    receiptId: refund.receiptId,
    feePaymentId: refund.feePaymentId,
    invoiceId: refund.feePayment.invoiceId,
    to: guardianPhone,
    message: buildRefundSmsMessage({
      amountPesewas: refund.amountPesewas,
      studentName,
      receiptNumber: refund.receipt?.receiptNumber ?? null,
      schoolName: refund.feePayment.invoice.tenant.name,
    }),
  });

  return tx.feeRefund.findUniqueOrThrow({ where: { id: refund.id } });
}

export async function executeApprovedFeeRefund(input: {
  tenantId: string;
  refundId: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockRefund(tx, input.tenantId, input.refundId);

    const refund = await tx.feeRefund.findFirst({
      where: { id: input.refundId, tenantId: input.tenantId },
      select: {
        id: true,
        status: true,
        provider: true,
        providerReference: true,
        amountPesewas: true,
        currency: true,
        reason: true,
        feePaymentId: true,
        feePayment: { select: { invoiceId: true } },
      },
    });

    if (!refund) throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refund not found.");

    if (refund.status === RefundStatus.SUCCEEDED || refund.status === RefundStatus.PROCESSING) {
      return refund;
    }

    if (refund.status !== RefundStatus.APPROVED) {
      throw new FinanceError("PAYMENT_ALREADY_PROCESSED", 409, "Only APPROVED refunds can be executed.");
    }

    await lockFeePayment(tx, input.tenantId, refund.feePaymentId);
    await lockInvoice(tx, input.tenantId, refund.feePayment.invoiceId);

    await tx.feeRefund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.PROCESSING,
        processingAt: new Date(),
      },
    });

    if (refund.provider === PaymentProvider.PAYSTACK) {
      if (!refund.providerReference) {
        await tx.feeRefund.update({
          where: { id: refund.id },
          data: {
            status: RefundStatus.FAILED,
            failedAt: new Date(),
            failureReason: "PAYSTACK_TRANSACTION_REFERENCE_REQUIRED",
          },
        });

        throw new FinanceError("DUPLICATE_PAYMENT_REFERENCE", 409, "Paystack transaction reference required.");
      }

      const ps = await callPaystackCreateRefund({
        transaction: refund.providerReference,
        amountPesewas: refund.amountPesewas,
        currency: refund.currency,
        reason: refund.reason,
      });

      if (!ps.ok) {
        await tx.feeRefund.update({
          where: { id: refund.id },
          data: {
            status: RefundStatus.FAILED,
            failedAt: new Date(),
            failureReason: `PAYSTACK_REFUND_FAILED_${ps.status}`,
            providerRaw: toJson(ps.raw),
          },
        });

        throw new FinanceError("PAYMENT_GATEWAY_FAILED", 502, "Paystack refund creation failed.");
      }

      return tx.feeRefund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.PROCESSING,
          providerRefundReference: ps.providerRefundReference,
          providerRaw: toJson(ps.raw),
        },
      });
    }

    return finalizeRefundSuccess(tx, {
      tenantId: input.tenantId,
      refundId: refund.id,
      actorUserId: input.actorUserId,
      providerRaw: { provider: "MANUAL", completedByUserId: input.actorUserId },
    });
  }, TX_LONG);
}