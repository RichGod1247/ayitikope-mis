// src/app/api/admin/fees/outbox/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType, FinanceOutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ADMIN_OUTBOX_TYPES: FinanceOutboxEventType[] = [
  FinanceOutboxEventType.SMS_RECEIPT,
  FinanceOutboxEventType.SMS_REFUND_NOTICE,
  FinanceOutboxEventType.SMS_ARREARS_NOTICE,
  FinanceOutboxEventType.SMS_RESULTS_RELEASE,
];

const SAFE_STATUSES = new Set<string>([
  FinanceOutboxStatus.PENDING,
  FinanceOutboxStatus.PROCESSING,
  FinanceOutboxStatus.COMPLETED,
  FinanceOutboxStatus.FAILED,
  FinanceOutboxStatus.DEAD,
  FinanceOutboxStatus.CANCELLED,
]);

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function readPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPayloadNumber(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function studentName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function normalizeProvider(value: unknown) {
  const provider = clean(value).toUpperCase();
  return provider || null;
}

function isPaystackProvider(value: unknown) {
  return normalizeProvider(value) === "PAYSTACK";
}

function looksLikePaystackChannel(value: unknown) {
  const v = clean(value).toUpperCase();
  return v.includes("PAYSTACK") || v.includes("CARD") || v.includes("MOBILE_MONEY");
}

function outboxTruthSource(input: {
  type: FinanceOutboxEventType;
  provider: string | null;
  paymentMethod: string | null;
  paymentChannel: string | null;
  providerReference: string | null;
  providerRefundReference: string | null;
  truthSource: string | null;
}) {
  if (input.truthSource) return input.truthSource;

  const providerLooksPaystack =
    isPaystackProvider(input.provider) ||
    Boolean(input.providerReference) ||
    Boolean(input.providerRefundReference) ||
    looksLikePaystackChannel(input.paymentMethod) ||
    looksLikePaystackChannel(input.paymentChannel);

  if (input.type === FinanceOutboxEventType.SMS_REFUND_NOTICE) {
    if (providerLooksPaystack) {
      return input.providerRefundReference
        ? "Paystack refund SMS notice. Verify Paystack refund lifecycle/provider event before treating this as final payout proof."
        : "Paystack-linked refund SMS notice. Provider refund reference was not found on this outbox row; verify via refunds/provider events.";
    }

    return "School-recorded manual/cash refund SMS notice. This is not Paystack settlement proof.";
  }

  if (input.type === FinanceOutboxEventType.SMS_RECEIPT) {
    if (providerLooksPaystack) {
      return "Paystack/online receipt SMS notice. Confirm provider event/transaction evidence for external payment proof.";
    }

    return "Manual/cash receipt SMS notice. This proves school-recorded receipt delivery, not Paystack settlement.";
  }

  return "Finance SMS notice. Check linked finance record for the source of truth.";
}

function eventLinkedReceiptId(event: {
  aggregateType: string | null;
  aggregateId: string | null;
  payload: unknown;
}) {
  return (
    readPayloadString(event.payload, "receiptId") ||
    (event.aggregateType === "Receipt" ? event.aggregateId : null)
  );
}

function eventLinkedRefundId(event: {
  aggregateType: string | null;
  aggregateId: string | null;
  payload: unknown;
}) {
  return (
    readPayloadString(event.payload, "refundId") ||
    (event.aggregateType === "FeeRefund" ? event.aggregateId : null)
  );
}

function eventLinkedFeePaymentId(event: { payload: unknown }) {
  return readPayloadString(event.payload, "feePaymentId");
}

function eventLinkedProviderReference(event: { payload: unknown }) {
  return readPayloadString(event.payload, "providerReference");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);
  const rawType = url.searchParams.get("type")?.trim() ?? "";
  const rawStatus = url.searchParams.get("status")?.trim() ?? "";

  const selectedTypes =
    rawType && SAFE_ADMIN_OUTBOX_TYPES.includes(rawType as FinanceOutboxEventType)
      ? [rawType as FinanceOutboxEventType]
      : SAFE_ADMIN_OUTBOX_TYPES;

  const selectedStatus = SAFE_STATUSES.has(rawStatus)
    ? (rawStatus as FinanceOutboxStatus)
    : null;

  const where = {
    tenantId,
    type: { in: selectedTypes },
    ...(selectedStatus ? { status: selectedStatus } : {}),
  };

  const [events, counts, typeCounts] = await Promise.all([
    prisma.financeOutboxEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        tenant: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.financeOutboxEvent.groupBy({
      by: ["status"],
      where: {
        tenantId,
        type: { in: SAFE_ADMIN_OUTBOX_TYPES },
      },
      _count: { _all: true },
    }),
    prisma.financeOutboxEvent.groupBy({
      by: ["type"],
      where: {
        tenantId,
        type: { in: SAFE_ADMIN_OUTBOX_TYPES },
      },
      _count: { _all: true },
    }),
  ]);

  const receiptIds = new Set<string>();
  const refundIds = new Set<string>();
  const feePaymentIds = new Set<string>();
  const providerReferences = new Set<string>();

  for (const event of events) {
    const receiptId = eventLinkedReceiptId(event);
    const refundId = eventLinkedRefundId(event);
    const feePaymentId = eventLinkedFeePaymentId(event);
    const providerReference = eventLinkedProviderReference(event);

    if (receiptId) receiptIds.add(receiptId);
    if (refundId) refundIds.add(refundId);
    if (feePaymentId) feePaymentIds.add(feePaymentId);
    if (providerReference) providerReferences.add(providerReference);
  }

  const [receipts, refunds] = await Promise.all([
    receiptIds.size
      ? prisma.receipt.findMany({
          where: {
            tenantId,
            id: { in: [...receiptIds] },
          },
          select: {
            id: true,
            receiptNumber: true,
            feePayment: {
              select: {
                id: true,
                amountPesewas: true,
                method: true,
                channel: true,
                reference: true,
                invoiceId: true,
                invoice: {
                  select: {
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),

    refundIds.size
      ? prisma.feeRefund.findMany({
          where: {
            tenantId,
            id: { in: [...refundIds] },
          },
          select: {
            id: true,
            amountPesewas: true,
            status: true,
            provider: true,
            providerReference: true,
            providerRefundReference: true,
            feePayment: {
              select: {
                id: true,
                method: true,
                channel: true,
                reference: true,
                invoiceId: true,
                invoice: {
                  select: {
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
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
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  for (const receipt of receipts) {
    if (receipt.feePayment?.id) feePaymentIds.add(receipt.feePayment.id);
    if (receipt.feePayment?.reference) providerReferences.add(receipt.feePayment.reference);
  }

  for (const refund of refunds) {
    if (refund.feePayment?.id) feePaymentIds.add(refund.feePayment.id);
    if (refund.providerReference) providerReferences.add(refund.providerReference);
    if (refund.feePayment?.reference) providerReferences.add(refund.feePayment.reference);
  }

  const transactions =
    feePaymentIds.size || providerReferences.size
      ? await prisma.paymentTransaction.findMany({
          where: {
            tenantId,
            OR: [
              ...(feePaymentIds.size ? [{ feePaymentId: { in: [...feePaymentIds] } }] : []),
              ...(providerReferences.size
                ? [{ providerReference: { in: [...providerReferences] } }]
                : []),
            ],
          },
          select: {
            id: true,
            provider: true,
            providerReference: true,
            providerTransactionId: true,
            amountPesewas: true,
            currency: true,
            status: true,
            feePaymentId: true,
            createdAt: true,
          },
          take: 500,
        })
      : [];

  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  const refundById = new Map(refunds.map((refund) => [refund.id, refund]));

  const transactionByFeePaymentId = new Map<string, (typeof transactions)[number]>();
  const transactionByProviderReference = new Map<string, (typeof transactions)[number]>();

  for (const tx of transactions) {
    if (tx.feePaymentId) transactionByFeePaymentId.set(tx.feePaymentId, tx);
    if (tx.providerReference) transactionByProviderReference.set(tx.providerReference, tx);
  }

  return jsonNoStore({
    ok: true,
    safeTypes: SAFE_ADMIN_OUTBOX_TYPES,
    selectedTypes,
    selectedStatus,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    typeCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    eventTypeCounts: Object.fromEntries(typeCounts.map((c) => [c.type, c._count._all])),
    events: events.map((event) => {
      const payloadReceiptId = eventLinkedReceiptId(event);
      const payloadRefundId = eventLinkedRefundId(event);
      const payloadFeePaymentId = eventLinkedFeePaymentId(event);
      const payloadProviderReference = eventLinkedProviderReference(event);

      const receipt = payloadReceiptId ? receiptById.get(payloadReceiptId) ?? null : null;
      const refund = payloadRefundId ? refundById.get(payloadRefundId) ?? null : null;

      const receiptFeePayment = receipt?.feePayment ?? null;
      const refundFeePayment = refund?.feePayment ?? null;

      const feePaymentId =
        readPayloadString(event.payload, "feePaymentId") ||
        receiptFeePayment?.id ||
        refundFeePayment?.id ||
        null;

      const providerReference =
        readPayloadString(event.payload, "providerReference") ||
        refund?.providerReference ||
        payloadProviderReference ||
        receiptFeePayment?.reference ||
        refundFeePayment?.reference ||
        null;

      const transaction =
        (feePaymentId ? transactionByFeePaymentId.get(feePaymentId) ?? null : null) ||
        (providerReference
          ? transactionByProviderReference.get(providerReference) ?? null
          : null);

      const receiptStudent = receiptFeePayment?.invoice?.student;
      const refundStudent = refundFeePayment?.invoice?.student;

      const hydratedStudentName =
        studentName(receiptStudent?.firstName, receiptStudent?.lastName) ||
        studentName(refundStudent?.firstName, refundStudent?.lastName);

      const paymentMethod =
        readPayloadString(event.payload, "paymentMethod") ||
        receiptFeePayment?.method ||
        refundFeePayment?.method ||
        null;

      const paymentChannel =
        readPayloadString(event.payload, "paymentChannel") ||
        receiptFeePayment?.channel ||
        refundFeePayment?.channel ||
        null;

      const provider =
        readPayloadString(event.payload, "provider") ||
        (refund?.provider ? String(refund.provider) : null) ||
        (transaction?.provider ? String(transaction.provider) : null) ||
        (looksLikePaystackChannel(paymentMethod) || looksLikePaystackChannel(paymentChannel)
          ? "PAYSTACK"
          : null);

      const providerRefundReference =
        readPayloadString(event.payload, "providerRefundReference") ||
        refund?.providerRefundReference ||
        null;

      const truthSource = readPayloadString(event.payload, "truthSource");

      return {
        id: event.id,
        tenantId: event.tenantId,
        tenantName: event.tenant?.name ?? null,
        type: event.type,
        status: event.status,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,

        receiptNumber:
          readPayloadString(event.payload, "receiptNumber") ||
          receipt?.receiptNumber ||
          refund?.receipt?.receiptNumber ||
          null,

        receiptId: payloadReceiptId || refund?.receipt?.id || null,
        refundId: payloadRefundId,

        feePaymentId,

        invoiceId:
          readPayloadString(event.payload, "invoiceId") ||
          receiptFeePayment?.invoiceId ||
          refundFeePayment?.invoiceId ||
          null,

        studentName:
          readPayloadString(event.payload, "studentName") || hydratedStudentName,

        to: readPayloadString(event.payload, "to"),
        message: readPayloadString(event.payload, "message"),
        template: readPayloadString(event.payload, "template"),

        refundStage:
          readPayloadString(event.payload, "refundStage") ||
          (refund?.status ? String(refund.status) : null),

        paymentMethod,
        paymentChannel,
        provider,

        providerReference:
          readPayloadString(event.payload, "providerReference") ||
          transaction?.providerReference ||
          refund?.providerReference ||
          null,

        providerTransactionId: transaction?.providerTransactionId ?? null,
        providerRefundReference,

        amountPesewas:
          readPayloadNumber(event.payload, "amountPesewas") ??
          readPayloadNumber(event.payload, "refundAmountPesewas") ??
          readPayloadNumber(event.payload, "netAmountPesewas") ??
          refund?.amountPesewas ??
          receiptFeePayment?.amountPesewas ??
          transaction?.amountPesewas ??
          null,

        currency: transaction?.currency ?? null,
        providerTransactionStatus: transaction?.status ?? null,

        truthSource: outboxTruthSource({
          type: event.type,
          provider,
          paymentMethod,
          paymentChannel,
          providerReference:
            readPayloadString(event.payload, "providerReference") ||
            transaction?.providerReference ||
            refund?.providerReference ||
            null,
          providerRefundReference,
          truthSource,
        }),

        attempts: event.attempts,
        maxAttempts: event.maxAttempts,
        lastError: event.lastError,
        createdAt: event.createdAt.toISOString(),
        lockedAt: event.lockedAt?.toISOString() ?? null,
        lockedBy: event.lockedBy,
        processedAt: event.processedAt?.toISOString() ?? null,
        nextAttemptAt: event.nextAttemptAt.toISOString(),
      };
    }),
  });
}