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
import {
  FinanceError,
  recalculateInvoiceTotals,
  recordProviderEventOnly,
} from "@/lib/finance/core";

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

function recordFromJson(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
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
    throw new FinanceError(
      "PAYMENT_AMOUNT_INVALID",
      400,
      "Refund amount must be a positive integer in pesewas."
    );
  }

  return n;
}

function formatCedis(pesewas: number) {
  return (Math.max(0, Math.floor(pesewas)) / 100).toFixed(2);
}

async function lockFeePayment(
  tx: TxClient,
  tenantId: string,
  feePaymentId: string
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeePayment"
    where "id" = ${feePaymentId} and "tenantId" = ${tenantId}
    for update
  `;

  if (!rows.length) {
    throw new FinanceError(
      "PAYMENT_INTENT_NOT_FOUND",
      404,
      "Fee payment not found."
    );
  }
}

async function lockRefund(tx: TxClient, tenantId: string, refundId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeeRefund"
    where "id" = ${refundId} and "tenantId" = ${tenantId}
    for update
  `;

  if (!rows.length) {
    throw new FinanceError(
      "PAYMENT_INTENT_NOT_FOUND",
      404,
      "Refund not found."
    );
  }
}

async function lockInvoice(tx: TxClient, tenantId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id" from "FeeInvoice"
    where "id" = ${invoiceId} and "tenantId" = ${tenantId}
    for update
  `;

  if (!rows.length) {
    throw new FinanceError("INVOICE_NOT_FOUND", 404);
  }
}

async function refundableExposure(
  tx: TxClient,
  tenantId: string,
  feePaymentId: string
) {
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
      where: {
        tenantId,
        feePaymentId,
        status: RefundStatus.SUCCEEDED,
      },
      _sum: { amountPesewas: true },
    }),
  ]);

  return {
    reservedPesewas: reserved._sum.amountPesewas ?? 0,
    succeededPesewas: succeeded._sum.amountPesewas ?? 0,
  };
}

function refundRequestHash(input: {
  tenantId: string;
  feePaymentId: string;
  amountPesewas: number;
  reason: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: clean(input.tenantId),
        feePaymentId: clean(input.feePaymentId),
        amountPesewas: input.amountPesewas,
        reason: clean(input.reason),
      })
    )
    .digest("hex");
}

function buildRefundRequestSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  receiptNumber: string | null;
  schoolName: string;
}) {
  return `EduLife OS: We have received your refund request of GHS ${formatCedis(
    input.amountPesewas
  )} for ${input.studentName}. ${
    input.receiptNumber ? `Receipt: ${input.receiptNumber}. ` : ""
  }School: ${input.schoolName}. The school will review it and update you.`;
}

function buildRefundProcessingSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  receiptNumber: string | null;
  schoolName: string;
}) {
  return `EduLife OS: Your approved refund of GHS ${formatCedis(
    input.amountPesewas
  )} for ${input.studentName} has been submitted for processing. ${
    input.receiptNumber ? `Receipt: ${input.receiptNumber}. ` : ""
  }School: ${input.schoolName}. You will receive final confirmation when completed.`;
}

function buildRefundSuccessSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  receiptNumber: string | null;
  schoolName: string;
}) {
  return `EduLife OS: Refund of GHS ${formatCedis(
    input.amountPesewas
  )} has been processed for ${input.studentName}. ${
    input.receiptNumber ? `Original receipt: ${input.receiptNumber}. ` : ""
  }School: ${input.schoolName}. Keep this SMS as proof.`;
}

function buildRefundFailedSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  receiptNumber: string | null;
  schoolName: string;
}) {
  return `EduLife OS: Your refund of GHS ${formatCedis(
    input.amountPesewas
  )} for ${input.studentName} could not be completed by the payment provider. ${
    input.receiptNumber ? `Receipt: ${input.receiptNumber}. ` : ""
  }School: ${input.schoolName}. Please contact the school office for support.`;
}

async function enqueueRefundSms(
  tx: TxClient,
  input: {
    tenantId: string;
    actorId?: string | null;
    refundId: string;
    receiptId: string | null;
    feePaymentId: string;
    invoiceId: string;
    to: string | null;
    message: string;
    kind: "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
template:
  | "FEES_REFUND_REQUESTED"
  | "FEES_REFUND_PROCESSING"
  | "FEES_REFUND_SUCCEEDED"
  | "FEES_REFUND_FAILED";
  }
) {
  if (!input.to?.trim()) return null;

  const idempotencyKey = `refund-sms:${input.refundId}:${input.kind}`;

  return tx.financeOutboxEvent.upsert({
    where: {
      type_idempotencyKey: {
        type: FinanceOutboxEventType.SMS_REFUND_NOTICE,
        idempotencyKey,
      },
    },
    create: {
      tenantId: input.tenantId,
      type: FinanceOutboxEventType.SMS_REFUND_NOTICE,
      status: "PENDING",
      idempotencyKey,
      aggregateType: "FeeRefund",
      aggregateId: input.refundId,
      payload: toJson({
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        to: input.to,
        message: input.message,
        template: input.template,
        refundStage: input.kind,
        refundId: input.refundId,
        receiptId: input.receiptId,
        feePaymentId: input.feePaymentId,
        invoiceId: input.invoiceId,
      }),
      priority: input.kind === "REQUESTED" ? 2 : 3,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

async function createRefundLedgerOnce(
  tx: TxClient,
  input: {
    tenantId: string;
    invoiceId: string;
    studentId: string;
    feePaymentId: string;
    receiptId: string | null;
    feeRefundId: string;
    amountPesewas: number;
    actorUserId?: string | null;
  }
) {
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
        journalRef: `REF-${new Date()
          .toISOString()
          .replace(/[-:.TZ]/g, "")
          .slice(0, 14)}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
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
  requestedByUserId?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const tenantId = clean(input.tenantId);
  const feePaymentId = clean(input.feePaymentId);
  const reason = clean(input.reason);
  const amountPesewas = assertAmount(input.amountPesewas);
  const idempotencyKey = clean(input.idempotencyKey);

  if (!tenantId) {
    throw new FinanceError("PAYMENT_AMOUNT_INVALID", 400, "tenantId is required.");
  }

  if (!feePaymentId) {
    throw new FinanceError(
      "PAYMENT_INTENT_NOT_FOUND",
      400,
      "feePaymentId is required."
    );
  }

  if (!reason) {
    throw new FinanceError(
      "PAYMENT_AMOUNT_INVALID",
      400,
      "Refund reason is required."
    );
  }

  if (!idempotencyKey) {
    throw new FinanceError(
      "DUPLICATE_PAYMENT_REFERENCE",
      400,
      "idempotencyKey is required."
    );
  }

  const requestHash = refundRequestHash({
    tenantId,
    feePaymentId,
    amountPesewas,
    reason,
  });

  return prisma.$transaction(async (tx) => {
    await lockFeePayment(tx, tenantId, feePaymentId);

    const payment = await tx.feePayment.findFirst({
      where: {
        id: feePaymentId,
        tenantId,
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
            tenant: {
              select: {
                name: true,
              },
            },
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

    if (!payment) {
      throw new FinanceError(
        "PAYMENT_INTENT_NOT_FOUND",
        404,
        "Refundable payment not found."
      );
    }

    if (!payment.receipt) {
      throw new FinanceError(
        "PAYMENT_AMOUNT_INVALID",
        409,
        "Cannot refund payment without receipt."
      );
    }

    await lockInvoice(tx, tenantId, payment.invoiceId);

    const existingByIdempotencyKey = await tx.feeRefund.findFirst({
      where: {
        tenantId,
        idempotencyKey,
      },
      select: {
        id: true,
        feePaymentId: true,
        amountPesewas: true,
        reason: true,
        metadata: true,
      },
    });

    if (existingByIdempotencyKey) {
      const metadata = recordFromJson(existingByIdempotencyKey.metadata);
      const existingHash = clean(metadata.refundRequestHash);

      const sameRequest =
        existingByIdempotencyKey.feePaymentId === payment.id &&
        existingByIdempotencyKey.amountPesewas === amountPesewas &&
        clean(existingByIdempotencyKey.reason) === reason;

      if (existingHash === requestHash || sameRequest) {
        return tx.feeRefund.findUniqueOrThrow({
          where: { id: existingByIdempotencyKey.id },
        });
      }

      throw new FinanceError(
        "DUPLICATE_PAYMENT_REFERENCE",
        409,
        "This refund idempotency key was already used for a different refund request."
      );
    }

    const exposure = await refundableExposure(tx, tenantId, payment.id);
    const available = payment.amountPesewas - exposure.reservedPesewas;

    if (amountPesewas > available) {
      throw new FinanceError(
        "PAYMENT_EXCEEDS_BALANCE",
        409,
        "Refund exceeds remaining refundable amount."
      );
    }

    const provider = payment.paymentTransaction?.provider ?? PaymentProvider.MANUAL;
    const providerReference =
      payment.paymentTransaction?.providerReference ?? payment.reference ?? null;

    const extraMetadata = recordFromJson(input.metadata);

    try {
      const refund = await tx.feeRefund.create({
        data: {
          tenantId,
          feePaymentId: payment.id,
          paymentTransactionId: payment.paymentTransaction?.id ?? null,
          receiptId: payment.receipt.id,
          provider,
          providerReference,
          idempotencyKey,
          amountPesewas,
          currency: payment.paymentTransaction?.currency ?? "GHS",
          status: RefundStatus.REQUESTED,
          reason,
          requestedByUserId: input.requestedByUserId ?? null,
          metadata: toJson({
            ...extraMetadata,
            refundRequestHash: requestHash,
            originalPaymentAmountPesewas: payment.amountPesewas,
            reservedBeforePesewas: exposure.reservedPesewas,
            availableBeforePesewas: available,
            receiptNumber: payment.receipt.receiptNumber,
            invoiceId: payment.invoiceId,
            receiptId: payment.receipt.id,
            studentId: payment.invoice.student?.id ?? null,
            studentName:
              [
                payment.invoice.student?.firstName,
                payment.invoice.student?.lastName,
              ]
                .filter(Boolean)
                .join(" ")
                .trim() || "Student",
            term: payment.invoice.term,
            academicYear: payment.invoice.academicYear,
          }),
        },
      });

      const studentName =
        [payment.invoice.student?.firstName, payment.invoice.student?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Student";

      const guardianPhone =
        payment.invoice.student?.guardianPhoneNorm ||
        payment.invoice.student?.guardianPhone ||
        payment.receipt.issuedToPhone ||
        null;

      await enqueueRefundSms(tx, {
        tenantId,
        actorId: input.requestedByUserId ?? null,
        refundId: refund.id,
        receiptId: payment.receipt.id,
        feePaymentId: payment.id,
        invoiceId: payment.invoiceId,
        to: guardianPhone,
        kind: "REQUESTED",
        template: "FEES_REFUND_REQUESTED",
        message: buildRefundRequestSmsMessage({
          amountPesewas,
          studentName,
          receiptNumber: payment.receipt.receiptNumber,
          schoolName: payment.invoice.tenant.name,
        }),
      });

      return refund;
    } catch (err) {
      if (!isUniqueError(err)) throw err;

      const raced = await tx.feeRefund.findFirst({
        where: {
          tenantId,
          idempotencyKey,
        },
      });

      if (raced) return raced;
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

    if (!refund) {
      throw new FinanceError(
        "PAYMENT_INTENT_NOT_FOUND",
        404,
        "Refund not found."
      );
    }

    if (refund.status === RefundStatus.APPROVED) return refund;

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new FinanceError(
        "PAYMENT_ALREADY_PROCESSED",
        409,
        "Only REQUESTED refunds can be approved."
      );
    }

    if (
      refund.requestedByUserId &&
      refund.requestedByUserId === input.approvedByUserId
    ) {
      throw new FinanceError(
        "PAYMENT_ALREADY_PROCESSED",
        409,
        "Requester cannot approve their own refund."
      );
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

  if (!secret) {
    throw new FinanceError("PAYMENT_SERVICE_NOT_CONFIGURED", 500);
  }

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

export async function finalizeRefundSuccess(
  tx: TxClient,
  input: {
    tenantId: string;
    refundId: string;
    actorUserId?: string | null;
    providerRaw?: unknown;
  }
) {
  const refund = await tx.feeRefund.findFirst({
    where: { id: input.refundId, tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      feePaymentId: true,
      receiptId: true,
      amountPesewas: true,
      reason: true,
      status: true,
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
              tenant: {
                select: {
                  name: true,
                },
              },
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

  if (!refund) {
    throw new FinanceError(
      "PAYMENT_INTENT_NOT_FOUND",
      404,
      "Refund not found."
    );
  }

  if (refund.status === RefundStatus.SUCCEEDED) {
    return tx.feeRefund.findUniqueOrThrow({ where: { id: refund.id } });
  }

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
      providerRaw:
        input.providerRaw === undefined ? undefined : toJson(input.providerRaw),
      failureReason: null,
    },
  });

  await tx.receipt.updateMany({
    where: { id: refund.receiptId ?? "", tenantId: input.tenantId },
    data: {
      status: fullRefunded
        ? ReceiptStatus.REFUNDED
        : ReceiptStatus.PARTIALLY_REFUNDED,
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
    kind: "SUCCEEDED",
    template: "FEES_REFUND_SUCCEEDED",
    message: buildRefundSuccessSmsMessage({
      amountPesewas: refund.amountPesewas,
      studentName,
      receiptNumber: refund.receipt?.receiptNumber ?? null,
      schoolName: refund.feePayment.invoice.tenant.name,
    }),
  });

  return tx.feeRefund.findUniqueOrThrow({ where: { id: refund.id } });
}

function numberFromUnknown(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(clean(value), 10);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractRefundEventFields(data: Record<string, unknown>) {
  const transaction = readRecord(data.transaction);

  const providerRefundReference =
    clean(data.id) ||
    clean(data.reference) ||
    clean(data.refund_reference) ||
    clean(data.refundReference) ||
    null;

  const providerReference =
    clean(transaction.reference) ||
    clean(data.transaction_reference) ||
    clean(data.transactionReference) ||
    clean(data.transaction) ||
    null;

  const amountPesewas = numberFromUnknown(data.amount);
  const rawStatus = clean(data.status).toLowerCase();

  return {
    providerRefundReference,
    providerReference,
    amountPesewas,
    status: rawStatus,
  };
}

async function enqueueRefundFailedSms(
  tx: TxClient,
  input: {
    tenantId: string;
    actorId?: string | null;
    refundId: string;
  }
) {
  const refund = await tx.feeRefund.findFirst({
    where: { id: input.refundId, tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      feePaymentId: true,
      receiptId: true,
      amountPesewas: true,
      feePayment: {
        select: {
          invoiceId: true,
          invoice: {
            select: {
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

  if (!refund) return null;

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

  return enqueueRefundSms(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    refundId: refund.id,
    receiptId: refund.receiptId,
    feePaymentId: refund.feePaymentId,
    invoiceId: refund.feePayment.invoiceId,
    to: guardianPhone,
    kind: "FAILED",
    template: "FEES_REFUND_FAILED",
    message: buildRefundFailedSmsMessage({
      amountPesewas: refund.amountPesewas,
      studentName,
      receiptNumber: refund.receipt?.receiptNumber ?? null,
      schoolName: refund.feePayment.invoice.tenant.name,
    }),
  });
}

export async function applyPaystackRefundStatus(input: {
  eventType: string;
  data: Record<string, unknown>;
  rawPayload?: unknown;
  signature?: string | null;
  actorUserId?: string | null;
}) {
  const fields = extractRefundEventFields(input.data);

  if (!fields.providerRefundReference && !fields.providerReference) {
    await recordProviderEventOnly({
      eventType: input.eventType,
      providerReference: null,
      signature: input.signature,
      rawPayload: input.rawPayload ?? { event: input.eventType, data: input.data },
      processingStatus: "FAILED",
      processingError: "REFUND_REFERENCE_REQUIRED",
      isSuspicious: true,
      suspiciousReason: "REFUND_REFERENCE_REQUIRED",
    });

    return {
      ok: true,
      skipped: true,
      reason: "REFUND_REFERENCE_REQUIRED",
    };
  }

  const refund = await prisma.feeRefund.findFirst({
    where: {
      provider: PaymentProvider.PAYSTACK,
      OR: [
        ...(fields.providerRefundReference
          ? [{ providerRefundReference: fields.providerRefundReference }]
          : []),
        ...(fields.providerReference
          ? [
              {
                providerReference: fields.providerReference,
                ...(fields.amountPesewas > 0
                  ? { amountPesewas: fields.amountPesewas }
                  : {}),
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      amountPesewas: true,
      providerReference: true,
      providerRefundReference: true,
    },
  });

  if (!refund) {
    await recordProviderEventOnly({
      eventType: input.eventType,
      providerReference: fields.providerReference,
      signature: input.signature,
      rawPayload: input.rawPayload ?? { event: input.eventType, data: input.data },
      processingStatus: "FAILED",
      processingError: "REFUND_NOT_FOUND",
      isSuspicious: true,
      suspiciousReason: "REFUND_NOT_FOUND",
    });

    return {
      ok: true,
      skipped: true,
      reason: "REFUND_NOT_FOUND",
      providerRefundReference: fields.providerRefundReference,
      providerReference: fields.providerReference,
    };
  }

  const rawPayload = input.rawPayload ?? {
    event: input.eventType,
    data: input.data,
    source: "paystack_refund_status_apply",
  };

  if (fields.amountPesewas > 0 && fields.amountPesewas !== refund.amountPesewas) {
    await recordProviderEventOnly({
      tenantId: refund.tenantId,
      eventType: input.eventType,
      providerReference: fields.providerReference,
      signature: input.signature,
      rawPayload,
      processingStatus: "FAILED",
      processingError: "REFUND_AMOUNT_MISMATCH",
      isSuspicious: true,
      suspiciousReason: "REFUND_AMOUNT_MISMATCH",
    });

    return {
      ok: true,
      skipped: true,
      reason: "REFUND_AMOUNT_MISMATCH",
      expectedPesewas: refund.amountPesewas,
      actualPesewas: fields.amountPesewas,
    };
  }

  if (input.eventType === "refund.processed" || fields.status === "processed") {
    const finalized = await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refund.tenantId, refund.id);

      const current = await tx.feeRefund.findFirst({
        where: { id: refund.id, tenantId: refund.tenantId },
        select: { status: true },
      });

      if (current?.status === RefundStatus.SUCCEEDED) {
        return tx.feeRefund.findUniqueOrThrow({ where: { id: refund.id } });
      }

      await tx.feeRefund.update({
        where: { id: refund.id },
        data: {
          providerRefundReference:
            fields.providerRefundReference ?? refund.providerRefundReference,
          providerRaw: toJson(rawPayload),
        },
      });

      return finalizeRefundSuccess(tx, {
        tenantId: refund.tenantId,
        refundId: refund.id,
        actorUserId: input.actorUserId ?? null,
        providerRaw: rawPayload,
      });
    }, TX_LONG);

    await recordProviderEventOnly({
      tenantId: refund.tenantId,
      eventType: input.eventType,
      providerReference: fields.providerReference ?? refund.providerReference,
      signature: input.signature,
      rawPayload,
      processingStatus: "PROCESSED",
    });

    return {
      ok: true,
      processed: true,
      refundId: finalized.id,
      tenantId: finalized.tenantId,
      status: finalized.status,
    };
  }

  if (input.eventType === "refund.failed" || fields.status === "failed") {
    const failed = await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refund.tenantId, refund.id);

      const updated = await tx.feeRefund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.FAILED,
          failedAt: new Date(),
          failureReason: "PAYSTACK_REFUND_FAILED",
          providerRefundReference:
            fields.providerRefundReference ?? refund.providerRefundReference,
          providerRaw: toJson(rawPayload),
        },
      });

      await enqueueRefundFailedSms(tx, {
        tenantId: refund.tenantId,
        actorId: input.actorUserId ?? null,
        refundId: refund.id,
      });

      return updated;
    }, TX_LONG);

    await recordProviderEventOnly({
      tenantId: refund.tenantId,
      eventType: input.eventType,
      providerReference: fields.providerReference ?? refund.providerReference,
      signature: input.signature,
      rawPayload,
      processingStatus: "PROCESSED",
    });

    return {
      ok: true,
      processed: true,
      refundId: failed.id,
      tenantId: failed.tenantId,
      status: failed.status,
    };
  }

  const updated = await prisma.feeRefund.update({
    where: { id: refund.id },
    data: {
      status: RefundStatus.PROCESSING,
      providerRefundReference:
        fields.providerRefundReference ?? refund.providerRefundReference,
      providerRaw: toJson(rawPayload),
      processingAt: refund.status === RefundStatus.PROCESSING ? undefined : new Date(),
    },
  });

  await recordProviderEventOnly({
    tenantId: refund.tenantId,
    eventType: input.eventType,
    providerReference: fields.providerReference ?? refund.providerReference,
    signature: input.signature,
    rawPayload,
    processingStatus: "PROCESSED",
  });

  return {
    ok: true,
    processed: true,
    refundId: updated.id,
    tenantId: updated.tenantId,
    status: updated.status,
  };
}

async function fetchPaystackRefund(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    throw new FinanceError("PAYMENT_SERVICE_NOT_CONFIGURED", 500);
  }

  const res = await fetch(
    `https://api.paystack.co/refund/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const raw = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: unknown;
    data?: Record<string, unknown>;
  } | null;

  if (!res.ok || !raw?.status || !raw.data) {
    throw new FinanceError(
      "PAYMENT_GATEWAY_FAILED",
      502,
      `Paystack refund fetch failed: ${clean(raw?.message) || res.status}`
    );
  }

  return raw;
}

export async function syncPaystackRefundStatus(input: {
  tenantId: string;
  refundId: string;
  actorUserId?: string | null;
}) {
  const refund = await prisma.feeRefund.findFirst({
    where: {
      id: input.refundId,
      tenantId: input.tenantId,
      provider: PaymentProvider.PAYSTACK,
    },
    select: {
      id: true,
      tenantId: true,
      providerRefundReference: true,
      providerReference: true,
      status: true,
    },
  });

  if (!refund) {
    throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404, "Refund not found.");
  }

  if (refund.status === RefundStatus.SUCCEEDED || refund.status === RefundStatus.FAILED) {
    return refund;
  }

  const reference = refund.providerRefundReference || refund.providerReference;

  if (!reference) {
    throw new FinanceError(
      "DUPLICATE_PAYMENT_REFERENCE",
      409,
      "Paystack refund reference is missing."
    );
  }

  const raw = await fetchPaystackRefund(reference);
  const data = raw.data ?? {};
  const status = clean(data.status).toLowerCase();
  const eventType =
    status === "processed"
      ? "refund.processed"
      : status === "failed"
        ? "refund.failed"
        : status === "processing"
          ? "refund.processing"
          : "refund.pending";

  return applyPaystackRefundStatus({
    eventType,
    data,
    rawPayload: {
      event: eventType,
      data,
      source: "paystack_refund_status_sync",
      paystackRaw: raw,
    },
    actorUserId: input.actorUserId ?? null,
  });
}

export async function executeApprovedFeeRefund(input: {
  tenantId: string;
  refundId: string;
  actorUserId: string;
}) {
  const transactionResult = await prisma.$transaction(async (tx) => {
    await lockRefund(tx, input.tenantId, input.refundId);

    const refund = await tx.feeRefund.findFirst({
      where: { id: input.refundId, tenantId: input.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        provider: true,
        providerReference: true,
        amountPesewas: true,
        currency: true,
        reason: true,
        feePaymentId: true,
        feePayment: {
          select: {
            invoiceId: true,
            invoice: {
              select: {
                tenant: {
                  select: {
                    name: true,
                  },
                },
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

    if (!refund) {
      throw new FinanceError(
        "PAYMENT_INTENT_NOT_FOUND",
        404,
        "Refund not found."
      );
    }

    if (refund.status === RefundStatus.SUCCEEDED) {
      return refund;
    }

    if (refund.status === RefundStatus.PROCESSING) {
      return refund;
    }

    if (refund.status !== RefundStatus.APPROVED) {
      throw new FinanceError(
        "PAYMENT_ALREADY_PROCESSED",
        409,
        "Only APPROVED refunds can be executed."
      );
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

        throw new FinanceError(
          "DUPLICATE_PAYMENT_REFERENCE",
          409,
          "Paystack transaction reference required."
        );
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

        throw new FinanceError(
          "PAYMENT_GATEWAY_FAILED",
          502,
          "Paystack refund creation failed."
        );
      }

      const updated = await tx.feeRefund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.PROCESSING,
          providerRefundReference: ps.providerRefundReference,
          providerRaw: toJson(ps.raw),
        },
      });

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
        receiptId: refund.receipt?.id ?? null,
        feePaymentId: refund.feePaymentId,
        invoiceId: refund.feePayment.invoiceId,
        to: guardianPhone,
        kind: "PROCESSING",
        template: "FEES_REFUND_PROCESSING",
        message: buildRefundProcessingSmsMessage({
          amountPesewas: refund.amountPesewas,
          studentName,
          receiptNumber: refund.receipt?.receiptNumber ?? null,
          schoolName: refund.feePayment.invoice.tenant.name,
        }),
      });

      return updated;
    }

    return finalizeRefundSuccess(tx, {
      tenantId: input.tenantId,
      refundId: refund.id,
      actorUserId: input.actorUserId,
      providerRaw: {
        provider: "MANUAL",
        completedByUserId: input.actorUserId,
      },
    });
  }, TX_LONG);

  if (
    transactionResult.status === RefundStatus.PROCESSING &&
    transactionResult.provider === PaymentProvider.PAYSTACK
  ) {
    return syncPaystackRefundStatus({
      tenantId: input.tenantId,
      refundId: transactionResult.id,
      actorUserId: input.actorUserId,
    });
  }

  return transactionResult;
}