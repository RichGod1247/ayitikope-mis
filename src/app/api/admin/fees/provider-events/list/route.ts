// src/app/api/admin/fees/provider-events/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ProviderEventStatus, RefundStatus, type Prisma } from "@prisma/client";
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

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && Number.isFinite(value.getTime())) return value;

  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
}

function readDate(value: unknown, key: string): Date | null {
  if (!isObject(value)) return null;
  return parseDateValue(value[key]);
}

function derivePayloadEventTime(rawPayload: Prisma.JsonValue): {
  date: Date | null;
  source: string | null;
} {
  const root = isObject(rawPayload) ? rawPayload : {};
  const data = childObject(root, "data") ?? root;
  const tx = childObject(data, "transaction");
  const refund = childObject(data, "refund");

  const candidates: Array<[Date | null, string]> = [
    [readDate(data, "created_at"), "payload.data.created_at"],
    [readDate(data, "createdAt"), "payload.data.createdAt"],
    [readDate(data, "paid_at"), "payload.data.paid_at"],
    [readDate(data, "paidAt"), "payload.data.paidAt"],
    [readDate(data, "processed_at"), "payload.data.processed_at"],
    [readDate(data, "processedAt"), "payload.data.processedAt"],
    [readDate(tx, "created_at"), "payload.data.transaction.created_at"],
    [readDate(tx, "paid_at"), "payload.data.transaction.paid_at"],
    [readDate(refund, "created_at"), "payload.data.refund.created_at"],
    [readDate(refund, "processed_at"), "payload.data.refund.processed_at"],
  ];

  for (const [date, source] of candidates) {
    if (date) return { date, source };
  }

  return { date: null, source: null };
}

function deriveProviderReference(rawPayload: Prisma.JsonValue, fallback: string | null) {
  const root = isObject(rawPayload) ? rawPayload : {};
  const data = childObject(root, "data") ?? root;
  const tx = childObject(data, "transaction");
  const authorization = childObject(data, "authorization");

  return (
    fallback ||
    readString(data, "reference") ||
    readString(data, "transaction_reference") ||
    readString(data, "payment_reference") ||
    readString(tx, "reference") ||
    readString(authorization, "reference") ||
    null
  );
}

function deriveProviderRefundReference(rawPayload: Prisma.JsonValue) {
  const root = isObject(rawPayload) ? rawPayload : {};
  const data = childObject(root, "data") ?? root;
  const refund = childObject(data, "refund");

  return (
    readNumberish(data, "id") ||
    readString(data, "refund_reference") ||
    readString(data, "refundReference") ||
    readString(data, "reference") ||
    readNumberish(refund, "id") ||
    readString(refund, "reference") ||
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

function providerRefundSignal(eventType: string) {
  const e = clean(eventType).toLowerCase();

  if (e === "refund.success" || e === "refund.succeeded" || e === "refund.processed") {
    return {
      webhookRefundSignal: "SUCCEEDED",
      webhookRefundMeaning: "This historical webhook says Paystack had processed/succeeded this refund at that event time.",
    };
  }

  if (e === "refund.failed") {
    return {
      webhookRefundSignal: "FAILED",
      webhookRefundMeaning: "This historical webhook says Paystack failed this refund at that event time.",
    };
  }

  if (e === "refund.pending" || e === "refund.processing") {
    return {
      webhookRefundSignal: "PENDING",
      webhookRefundMeaning:
        "This historical webhook says the refund was pending/processing at that event time. It is not a live Paystack dashboard check.",
    };
  }

  if (e.startsWith("refund.")) {
    return {
      webhookRefundSignal: e.replace("refund.", "").toUpperCase(),
      webhookRefundMeaning:
        "This is a historical Paystack refund lifecycle webhook. Compare it with the current EduLife refund status.",
    };
  }

  return {
    webhookRefundSignal: null,
    webhookRefundMeaning: null,
  };
}

function attentionDecision(input: {
  category: string;
  processingStatus: ProviderEventStatus;
  isReplay: boolean;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  processingError: string | null;
  webhookRefundSignal: string | null;
  hasLinkedRefund: boolean;
  refundLifecycleComplete: boolean;
  internalRefundStatus: string | null;
}) {
  if (input.processingStatus === ProviderEventStatus.FAILED) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "HIGH",
      attentionReason:
        input.processingError || "EduLife OS failed to process this provider event.",
      recommendedAction:
        "Use Reprocess now. If it fails again, inspect the processing error and linked finance evidence.",
    };
  }

  if (input.processingStatus === ProviderEventStatus.RECEIVED) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "HIGH",
      attentionReason:
        "Provider event has been received but has not been finalized by EduLife OS.",
      recommendedAction:
        "Use Reprocess now or Queue recovery so EduLife OS can safely re-run the event handler.",
    };
  }

  if (input.isSuspicious) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "HIGH",
      attentionReason:
        input.suspiciousReason ||
        "This provider event was marked suspicious and needs finance review.",
      recommendedAction:
        "Compare provider reference, amount, event time, and linked finance records before trusting this event.",
    };
  }

  if (input.isReplay) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "MEDIUM",
      attentionReason:
        "This provider event appears to be a replay/duplicate provider delivery.",
      recommendedAction:
        "Confirm no duplicate receipt, ledger posting, refund, or SMS was created. If all evidence is clean, no action is required.",
    };
  }

  if (input.category === "REFUND" && !input.hasLinkedRefund) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "HIGH",
      attentionReason:
        "Paystack sent a refund event, but EduLife OS could not link it to an internal refund record.",
      recommendedAction:
        "Search refunds by provider refund reference or payment reference. If no internal refund exists, investigate before updating balances.",
    };
  }

  /*
    Bank-grade distinction:
    If the internal refund is now SUCCEEDED, an old refund.pending webhook remains historical evidence,
    but it must NOT continue to count as unresolved attention.
  */
  if (input.category === "REFUND" && input.refundLifecycleComplete) {
    return {
      needsAdminAttention: false,
      attentionSeverity: "NONE",
      attentionReason: null,
      recommendedAction:
        "No action required. Internal refund is complete; any older pending webhook is historical evidence only.",
    };
  }

  if (
    input.category === "REFUND" &&
    input.webhookRefundSignal &&
    input.webhookRefundSignal !== "SUCCEEDED"
  ) {
    return {
      needsAdminAttention: true,
      attentionSeverity: input.webhookRefundSignal === "FAILED" ? "HIGH" : "MEDIUM",
      attentionReason: `Historical webhook signal is ${input.webhookRefundSignal}, while internal refund status is ${
        input.internalRefundStatus ?? "unknown"
      }.`,
      recommendedAction:
        "Use Sync refund status to check Paystack’s latest state. Do not treat the historical webhook alone as live Paystack truth.",
    };
  }

  if (input.category === "REFUND" && !input.refundLifecycleComplete) {
    return {
      needsAdminAttention: true,
      attentionSeverity: "MEDIUM",
      attentionReason:
        "Refund provider event exists, but the internal EduLife refund lifecycle is not complete.",
      recommendedAction:
        "Open the refund record and sync or investigate the current refund status.",
    };
  }

  return {
    needsAdminAttention: false,
    attentionSeverity: "NONE",
    attentionReason: null,
    recommendedAction: "No action required.",
  };
}

function humanEventSummary(input: {
  category: string;
  processingStatus: ProviderEventStatus;
  webhookRefundSignal: string | null;
  internalRefundStatus: string | null;
  isReplay: boolean;
  duplicateCount: number;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  processingError: string | null;
}) {
  const parts: string[] = [];

  if (input.category === "REFUND") parts.push("Refund provider event");
  else if (input.category === "PAYMENT") parts.push("Payment provider event");
  else if (input.category === "TRANSFER") parts.push("Transfer/settlement provider event");
  else parts.push("Provider event");

  parts.push(`EduLife event handling: ${input.processingStatus}`);

  if (input.webhookRefundSignal) {
    parts.push(`Historical webhook signal: ${input.webhookRefundSignal}`);
  }

  if (input.internalRefundStatus) {
    parts.push(`Current internal refund status: ${input.internalRefundStatus}`);
  }

  if (input.isReplay) {
    parts.push(
      `replay detected (${input.duplicateCount} duplicate hit${
        input.duplicateCount === 1 ? "" : "s"
      })`
    );
  }

  if (input.isSuspicious) {
    parts.push(`suspicious: ${input.suspiciousReason ?? "manual review needed"}`);
  }

  if (input.processingError) {
    parts.push(`error: ${input.processingError}`);
  }

  return parts.join(" · ");
}

function studentName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function buildRefundWhere(input: {
  tenantId: string;
  paymentReferences: string[];
  refundReferences: string[];
}): Prisma.FeeRefundWhereInput | null {
  const OR: Prisma.FeeRefundWhereInput[] = [];

  if (input.refundReferences.length) {
    OR.push({
      providerRefundReference: { in: input.refundReferences },
    });
  }

  if (input.paymentReferences.length) {
    OR.push({
      feePayment: {
        reference: { in: input.paymentReferences },
      },
    });

    OR.push({
      paymentTransaction: {
        providerReference: { in: input.paymentReferences },
      },
    });
  }

  if (!OR.length) return null;

  return {
    tenantId: input.tenantId,
    OR,
  };
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
  const attentionOnly = clean(url.searchParams.get("attention")) === "1";
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

    const providerEvents = await prisma.paymentProviderEvent.findMany({
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

    for (const event of providerEvents) {
      const paymentRef = deriveProviderReference(event.rawPayload, event.providerReference);
      const refundRef = deriveProviderRefundReference(event.rawPayload);

      if (paymentRef) paymentReferences.add(paymentRef);
      if (refundRef) refundReferences.add(refundRef);
    }

    const paymentRefList = [...paymentReferences];
    const refundRefList = [...refundReferences];

    const refundWhere = buildRefundWhere({
      tenantId,
      paymentReferences: paymentRefList,
      refundReferences: refundRefList,
    });

    const [transactions, payments, refunds] = await Promise.all([
      paymentRefList.length
        ? prisma.paymentTransaction.findMany({
            where: {
              tenantId,
              providerReference: { in: paymentRefList },
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
              feePayment: {
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
              },
            },
            take: 500,
          })
        : Promise.resolve([]),

      paymentRefList.length
        ? prisma.feePayment.findMany({
            where: {
              tenantId,
              reference: { in: paymentRefList },
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
              paymentTransaction: {
                select: {
                  provider: true,
                  providerReference: true,
                  providerTransactionId: true,
                  status: true,
                },
              },
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
          })
        : Promise.resolve([]),

      refundWhere
        ? prisma.feeRefund.findMany({
            where: refundWhere,
            select: {
              id: true,
              amountPesewas: true,
              currency: true,
              status: true,
              provider: true,
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
              paymentTransaction: {
                select: {
                  provider: true,
                  providerReference: true,
                  providerTransactionId: true,
                  status: true,
                },
              },
            },
            take: 500,
          })
        : Promise.resolve([]),
    ]);

    const transactionByReference = new Map(
      transactions.map((tx) => [tx.providerReference, tx])
    );

    const paymentByReference = new Map<string, (typeof payments)[number]>();

    for (const payment of payments) {
      if (payment.reference) {
        paymentByReference.set(payment.reference, payment);
      }

      if (payment.paymentTransaction?.providerReference) {
        paymentByReference.set(payment.paymentTransaction.providerReference, payment);
      }
    }

    for (const tx of transactions) {
      const payment = tx.feePayment;
      if (!payment) continue;

      const hydratedPayment = {
        ...payment,
        paymentTransaction: {
          provider: tx.provider,
          providerReference: tx.providerReference,
          providerTransactionId: tx.providerTransactionId,
          status: tx.status,
        },
      };

      if (tx.providerReference) {
        paymentByReference.set(tx.providerReference, hydratedPayment);
      }

      if (payment.reference) {
        paymentByReference.set(payment.reference, hydratedPayment);
      }
    }

    const refundByProviderRefundReference = new Map<string, (typeof refunds)[number]>();

    for (const refund of refunds) {
      if (refund.providerRefundReference) {
        refundByProviderRefundReference.set(refund.providerRefundReference, refund);
      }
    }

    const refundsByPaymentReference = new Map<string, Array<(typeof refunds)[number]>>();

    for (const refund of refunds) {
      const refs = [
        clean(refund.feePayment?.reference),
        clean(refund.paymentTransaction?.providerReference),
      ].filter(Boolean);

      for (const ref of refs) {
        const bucket = refundsByPaymentReference.get(ref) ?? [];
        bucket.push(refund);
        refundsByPaymentReference.set(ref, bucket);
      }
    }

    const mapped = providerEvents.map((event) => {
      const category = eventCategory(event.eventType);
      const paymentReference = deriveProviderReference(
        event.rawPayload,
        event.providerReference
      );
      const providerRefundReference = deriveProviderRefundReference(event.rawPayload);
      const refundSignal = providerRefundSignal(event.eventType);

      const payloadTime = derivePayloadEventTime(event.rawPayload);
      const effectiveEventTime = event.eventTime ?? payloadTime.date ?? event.receivedAt;
      const eventTimeSource = event.eventTime
        ? "paymentProviderEvent.eventTime"
        : payloadTime.source ?? "receivedAt fallback";

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

      const refundLifecycleComplete = relatedRefund?.status === RefundStatus.SUCCEEDED;
      const hasLinkedRefund = Boolean(relatedRefund);

      const learner =
        relatedPayment?.invoice?.student ||
        relatedRefund?.feePayment?.invoice?.student ||
        null;

      const internalRefundStatus = relatedRefund?.status ?? null;

      const attention = attentionDecision({
        category,
        processingStatus: event.processingStatus,
        isReplay: event.isReplay,
        isSuspicious: event.isSuspicious,
        suspiciousReason: event.suspiciousReason,
        processingError: event.processingError,
        webhookRefundSignal: refundSignal.webhookRefundSignal,
        hasLinkedRefund,
        refundLifecycleComplete,
        internalRefundStatus,
      });

      return {
        id: event.id,
        tenantId: event.tenantId,
        provider: event.provider,
        eventType: event.eventType,
        category,
        providerReference: event.providerReference,
        derivedPaymentReference: paymentReference,
        providerRefundReference,
        providerEventId: event.providerEventId,

        processingStatus: event.processingStatus,
        eventHandlingStatus: event.processingStatus,
        processingError: event.processingError,

        providerRefundStatus: refundSignal.webhookRefundSignal,
        providerRefundMeaning: refundSignal.webhookRefundMeaning,
        internalRefundStatus,

        isReplay: event.isReplay,
        isSuspicious: event.isSuspicious,
        suspiciousReason: event.suspiciousReason,
        duplicateCount: event.duplicateCount,

        receivedAt: event.receivedAt.toISOString(),
        eventTime: effectiveEventTime.toISOString(),
        eventTimeSource,
        processedAt: event.processedAt?.toISOString() ?? null,

        humanSummary: humanEventSummary({
          category,
          processingStatus: event.processingStatus,
          webhookRefundSignal: refundSignal.webhookRefundSignal,
          internalRefundStatus,
          isReplay: event.isReplay,
          duplicateCount: event.duplicateCount,
          isSuspicious: event.isSuspicious,
          suspiciousReason: event.suspiciousReason,
          processingError: event.processingError,
        }),

        relatedPayment: relatedPayment
          ? {
              id: relatedPayment.id,
              invoiceId: relatedPayment.invoiceId,
              amountPesewas: relatedPayment.amountPesewas,
              reference: relatedPayment.reference,
              method: relatedPayment.method,
              channel: relatedPayment.channel,
              provider: relatedPayment.paymentTransaction?.provider ?? null,
              providerReference:
                relatedPayment.paymentTransaction?.providerReference ?? null,
              providerTransactionId:
                relatedPayment.paymentTransaction?.providerTransactionId ?? null,
              providerStatus: relatedPayment.paymentTransaction?.status ?? null,
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
              provider: relatedRefund.provider,
              providerReference:
                relatedRefund.paymentTransaction?.providerReference ??
                relatedRefund.feePayment?.reference ??
                paymentReference ??
                null,
              providerRefundReference: relatedRefund.providerRefundReference,
              providerTransactionId:
                relatedRefund.paymentTransaction?.providerTransactionId ?? null,
              providerStatus: relatedRefund.paymentTransaction?.status ?? null,
              reason: relatedRefund.reason,
              requestedAt: relatedRefund.requestedAt.toISOString(),
              approvedAt: relatedRefund.approvedAt?.toISOString() ?? null,
              processingAt: relatedRefund.processingAt?.toISOString() ?? null,
              processedAt: relatedRefund.processedAt?.toISOString() ?? null,
              failedAt: relatedRefund.failedAt?.toISOString() ?? null,
              refundLifecycleComplete,
            }
          : null,

        studentName: studentName(learner?.firstName, learner?.lastName),

        needsAdminAttention: attention.needsAdminAttention,
        attentionReason: attention.attentionReason,
        recommendedAction: attention.recommendedAction,
        attentionSeverity: attention.attentionSeverity,

        rawPayload: includeRaw ? event.rawPayload : undefined,
      };
    });

    const visibleRows = attentionOnly
      ? mapped.filter((row) => row.needsAdminAttention)
      : mapped;

    const summary = {
      total: mapped.length,
      received: mapped.filter(
        (row) => row.processingStatus === ProviderEventStatus.RECEIVED
      ).length,
      processed: mapped.filter(
        (row) => row.processingStatus === ProviderEventStatus.PROCESSED
      ).length,
      failed: mapped.filter(
        (row) => row.processingStatus === ProviderEventStatus.FAILED
      ).length,
      ignored: mapped.filter(
        (row) => row.processingStatus === ProviderEventStatus.IGNORED
      ).length,
      suspicious: mapped.filter((row) => row.isSuspicious).length,
      replay: mapped.filter((row) => row.isReplay).length,
      refundEvents: mapped.filter((row) => row.category === "REFUND").length,
      paymentEvents: mapped.filter((row) => row.category === "PAYMENT").length,
      needsAdminAttention: mapped.filter((row) => row.needsAdminAttention).length,
    };

    return json(200, {
      ok: true,
      summary,
      rows: visibleRows,
      filters: {
        status: status ?? null,
        suspiciousOnly,
        attentionOnly,
        reference: reference || null,
        eventType: eventType || null,
        includeRaw,
        limit,
      },
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