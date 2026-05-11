// src/app/api/admin/fees/provider-events/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  ProviderEventStatus,
  RefundStatus,
  type PaymentProviderEvent,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function json(status: number, payload: unknown) {
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

function parseStatus(value: unknown): ProviderEventStatus | undefined {
  const v = clean(value).toUpperCase();

  if (
    v === ProviderEventStatus.RECEIVED ||
    v === ProviderEventStatus.PROCESSED ||
    v === ProviderEventStatus.FAILED ||
    v === ProviderEventStatus.IGNORED
  ) {
    return v;
  }

  return undefined;
}

function clampLimit(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(Math.floor(n), 1), 200);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childObject(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) return null;
  const child = value[key];
  return isObject(child) ? child : null;
}

function readString(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const v = value[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNumberish(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const v = value[key];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function deriveProviderReference(rawPayload: Prisma.JsonValue, fallback: string | null) {
  const root = isObject(rawPayload) ? rawPayload : {};
  const data = childObject(root, "data") ?? root;
  const tx = childObject(data, "transaction");

  return (
    fallback ||
    readString(data, "reference") ||
    readString(data, "transaction_reference") ||
    readString(tx, "reference") ||
    null
  );
}

function deriveProviderRefundReference(rawPayload: Prisma.JsonValue) {
  const root = isObject(rawPayload) ? rawPayload : {};
  const data = childObject(root, "data") ?? root;

  return (
    readNumberish(data, "id") ||
    readString(data, "reference") ||
    readString(data, "refund_reference") ||
    null
  );
}

function eventCategory(eventType: string) {
  const e = clean(eventType).toLowerCase();

  if (e.startsWith("refund.")) return "REFUND";
  if (e === "charge.success" || e.startsWith("charge.")) return "PAYMENT";
  if (e.includes("transfer")) return "TRANSFER";
  return "OTHER";
}

function humanEventSummary(input: {
  eventType: string;
  processingStatus: ProviderEventStatus;
  isReplay: boolean;
  duplicateCount: number;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  processingError: string | null;
}) {
  const parts: string[] = [];

  const category = eventCategory(input.eventType);

  if (category === "REFUND") {
    parts.push("Refund provider event");
  } else if (category === "PAYMENT") {
    parts.push("Payment provider event");
  } else if (category === "TRANSFER") {
    parts.push("Transfer/settlement provider event");
  } else {
    parts.push("Provider event");
  }

  parts.push(`status: ${input.processingStatus}`);

  if (input.isReplay) {
    parts.push(`replay detected (${input.duplicateCount} duplicate hit${input.duplicateCount === 1 ? "" : "s"})`);
  }

  if (input.isSuspicious) {
    parts.push(`suspicious: ${input.suspiciousReason ?? "manual review needed"}`);
  }

  if (input.processingError) {
    parts.push(`error: ${input.processingError}`);
  }

  return parts.join(" · ");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const tenantId = auth.ctx.tenantId;

  const status = parseStatus(url.searchParams.get("status"));
  const suspiciousOnly = clean(url.searchParams.get("suspicious")) === "1";
  const reference = clean(url.searchParams.get("reference"));
  const eventType = clean(url.searchParams.get("eventType"));
  const includeRaw = clean(url.searchParams.get("includeRaw")) === "1";
  const limit = clampLimit(url.searchParams.get("limit"));

  try {
    const where: Prisma.PaymentProviderEventWhereInput = {
      tenantId,
      ...(status ? { processingStatus: status } : {}),
      ...(suspiciousOnly ? { isSuspicious: true } : {}),
      ...(reference ? { providerReference: reference } : {}),
      ...(eventType ? { eventType } : {}),
    };

    const rows = await prisma.paymentProviderEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        provider: true,
        eventType: true,
        providerReference: true,
        providerEventId: true,
        processingStatus: true,
        processingError: true,
        isReplay: true,
        isSuspicious: true,
        suspiciousReason: true,
        duplicateCount: true,
        receivedAt: true,
        eventTime: true,
        processedAt: true,
        rawPayload: true,
      },
    });

    const paymentReferences = new Set<string>();
    const refundReferences = new Set<string>();

    for (const row of rows) {
      const paymentRef = deriveProviderReference(row.rawPayload, row.providerReference);
      const refundRef = deriveProviderRefundReference(row.rawPayload);

      if (paymentRef) paymentReferences.add(paymentRef);
      if (refundRef) refundReferences.add(refundRef);
    }

    const [transactions, payments, refunds] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: {
          tenantId,
          providerReference: { in: [...paymentReferences] },
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
      }),
      prisma.feePayment.findMany({
        where: {
          tenantId,
          reference: { in: [...paymentReferences] },
        },
        select: {
          id: true,
          invoiceId: true,
          amountPesewas: true,
          reference: true,
          method: true,
          channel: true,
          status: true,
          paidAt: true,
          invoice: {
            select: {
              term: true,
              academicYear: true,
              student: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        take: 500,
      }),
      prisma.feeRefund.findMany({
        where: {
          tenantId,
          OR: [
            { providerReference: { in: [...paymentReferences] } },
            { providerRefundReference: { in: [...refundReferences] } },
          ],
        },
        select: {
          id: true,
          amountPesewas: true,
          currency: true,
          status: true,
          providerReference: true,
          providerRefundReference: true,
          reason: true,
          requestedAt: true,
          approvedAt: true,
          processingAt: true,
          processedAt: true,
          failedAt: true,
          feePayment: {
            select: {
              id: true,
              reference: true,
              invoice: {
                select: {
                  term: true,
                  academicYear: true,
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
        take: 500,
      }),
    ]);

    const transactionByReference = new Map(
      transactions.map((tx) => [tx.providerReference, tx])
    );

    const paymentByReference = new Map(
      payments
        .filter((payment) => payment.reference)
        .map((payment) => [String(payment.reference), payment])
    );

    const refundByProviderRefundReference = new Map(
      refunds
        .filter((refund) => refund.providerRefundReference)
        .map((refund) => [String(refund.providerRefundReference), refund])
    );

    const refundsByPaymentReference = new Map<string, typeof refunds>();

    for (const refund of refunds) {
      const ref =
        clean(refund.providerReference) ||
        clean(refund.feePayment?.reference);

      if (!ref) continue;

      const bucket = refundsByPaymentReference.get(ref) ?? [];
      bucket.push(refund);
      refundsByPaymentReference.set(ref, bucket);
    }

    const mapped = rows.map((row) => {
      const paymentReference = deriveProviderReference(row.rawPayload, row.providerReference);
      const providerRefundReference = deriveProviderRefundReference(row.rawPayload);
      const category = eventCategory(row.eventType);

      const relatedTransaction = paymentReference
        ? transactionByReference.get(paymentReference) ?? null
        : null;

      const relatedPayment = paymentReference
        ? paymentByReference.get(paymentReference) ?? null
        : null;

      const relatedRefund =
        (providerRefundReference
          ? refundByProviderRefundReference.get(providerRefundReference) ?? null
          : null) ||
        (paymentReference
          ? refundsByPaymentReference.get(paymentReference)?.[0] ?? null
          : null);

      const refundLifecycleComplete =
        relatedRefund?.status === RefundStatus.SUCCEEDED;

      const student =
        relatedPayment?.invoice?.student ||
        relatedRefund?.feePayment?.invoice?.student ||
        null;

      const studentName = [student?.firstName, student?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        id: row.id,
        tenantId: row.tenantId,
        provider: row.provider,
        eventType: row.eventType,
        category,
        providerReference: row.providerReference,
        derivedPaymentReference: paymentReference,
        providerRefundReference,
        providerEventId: row.providerEventId,
        processingStatus: row.processingStatus,
        processingError: row.processingError,
        isReplay: row.isReplay,
        isSuspicious: row.isSuspicious,
        suspiciousReason: row.suspiciousReason,
        duplicateCount: row.duplicateCount,
        receivedAt: row.receivedAt.toISOString(),
        eventTime: row.eventTime?.toISOString() ?? null,
        processedAt: row.processedAt?.toISOString() ?? null,

        humanSummary: humanEventSummary({
          eventType: row.eventType,
          processingStatus: row.processingStatus,
          isReplay: row.isReplay,
          duplicateCount: row.duplicateCount,
          isSuspicious: row.isSuspicious,
          suspiciousReason: row.suspiciousReason,
          processingError: row.processingError,
        }),

        relatedPayment: relatedPayment
          ? {
              id: relatedPayment.id,
              invoiceId: relatedPayment.invoiceId,
              amountPesewas: relatedPayment.amountPesewas,
              reference: relatedPayment.reference,
              method: relatedPayment.method,
              channel: relatedPayment.channel,
              status: relatedPayment.status,
              paidAt: relatedPayment.paidAt.toISOString(),
              term: relatedPayment.invoice.term,
              academicYear: relatedPayment.invoice.academicYear,
            }
          : null,

        relatedTransaction: relatedTransaction
          ? {
              id: relatedTransaction.id,
              provider: relatedTransaction.provider,
              providerReference: relatedTransaction.providerReference,
              providerTransactionId: relatedTransaction.providerTransactionId,
              amountPesewas: relatedTransaction.amountPesewas,
              currency: relatedTransaction.currency,
              status: relatedTransaction.status,
              feePaymentId: relatedTransaction.feePaymentId,
              createdAt: relatedTransaction.createdAt.toISOString(),
            }
          : null,

        relatedRefund: relatedRefund
          ? {
              id: relatedRefund.id,
              amountPesewas: relatedRefund.amountPesewas,
              currency: relatedRefund.currency,
              status: relatedRefund.status,
              providerReference: relatedRefund.providerReference,
              providerRefundReference: relatedRefund.providerRefundReference,
              reason: relatedRefund.reason,
              requestedAt: relatedRefund.requestedAt.toISOString(),
              approvedAt: relatedRefund.approvedAt?.toISOString() ?? null,
              processingAt: relatedRefund.processingAt?.toISOString() ?? null,
              processedAt: relatedRefund.processedAt?.toISOString() ?? null,
              failedAt: relatedRefund.failedAt?.toISOString() ?? null,
              refundLifecycleComplete,
            }
          : null,

        studentName: studentName || null,
        needsAdminAttention:
          row.processingStatus === ProviderEventStatus.FAILED ||
          row.processingStatus === ProviderEventStatus.RECEIVED ||
          row.isSuspicious ||
          row.isReplay ||
          (category === "REFUND" && !refundLifecycleComplete),

        rawPayload: includeRaw ? row.rawPayload : undefined,
      };
    });

    const summary = {
      total: mapped.length,
      received: mapped.filter((row) => row.processingStatus === ProviderEventStatus.RECEIVED).length,
      processed: mapped.filter((row) => row.processingStatus === ProviderEventStatus.PROCESSED).length,
      failed: mapped.filter((row) => row.processingStatus === ProviderEventStatus.FAILED).length,
      ignored: mapped.filter((row) => row.processingStatus === ProviderEventStatus.IGNORED).length,
      suspicious: mapped.filter((row) => row.isSuspicious).length,
      replay: mapped.filter((row) => row.isReplay).length,
      refundEvents: mapped.filter((row) => row.category === "REFUND").length,
      paymentEvents: mapped.filter((row) => row.category === "PAYMENT").length,
      needsAdminAttention: mapped.filter((row) => row.needsAdminAttention).length,
    };

    return json(200, {
      ok: true,
      summary,
      rows: mapped,
    });
  } catch (err) {
    console.error("[ADMIN_PROVIDER_EVENTS_LIST_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_PROVIDER_EVENTS",
      rows: [],
    });
  }
}