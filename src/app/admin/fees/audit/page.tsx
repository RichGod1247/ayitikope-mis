// src/app/admin/fees/audit/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FinanceOutboxEventType,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Financial Audit Trail | Admin | EduLife OS",
};

type SearchParams = Promise<{
  type?: string;
  q?: string;
}>;

type EvidenceEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  at: Date;
  actor: string;
  learner: string;
  amountPesewas: number | null;
  status: string;
  reference: string | null;
  evidence: string[];
};

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function formatCedis(pesewas: number | null | undefined) {
  if (typeof pesewas !== "number") return "—";

  const sign = pesewas < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(pesewas) / 100).toFixed(2)}`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function actorName(user?: {
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!user) return "System";

  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.name ||
    user.email ||
    "System"
  );
}

function readableType(type: string) {
  return type.replaceAll("_", " ");
}

function evidenceClass(type: string, status: string) {
  const t = type.toUpperCase();
  const s = status.toUpperCase();

  if (s.includes("FAILED") || s.includes("ERROR") || s.includes("CANCELLED") || s === "DEAD") {
    return "border-red-300 bg-red-50 text-red-800";
  }

  if (t.includes("REFUND") && ["REQUESTED", "APPROVED", "PROCESSING", "PENDING"].includes(s)) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (
    t.includes("PAYMENT") ||
    t.includes("RECEIPT") ||
    t.includes("LEDGER") ||
    s.includes("SUCCEEDED") ||
    s.includes("SUCCESS") ||
    s.includes("COMPLETED")
  ) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (t.includes("SMS") || t.includes("OUTBOX")) {
    return "border-blue-300 bg-blue-50 text-blue-800";
  }

  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

function jsonPreview(value: unknown) {
  if (value === null || value === undefined) return "—";

  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 700 ? `${text.slice(0, 700)}…` : text;
  } catch {
    return "Unreadable JSON";
  }
}

function matchesSearch(event: EvidenceEvent, q: string) {
  if (!q) return true;

  const haystack = [
    event.type,
    event.title,
    event.description,
    event.actor,
    event.learner,
    event.status,
    event.reference,
    ...event.evidence,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q.toLowerCase());
}

export default async function AdminFeesAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.tenantId) redirect("/login");

  const params = await searchParams;
  const tenantId = auth.tenantId;
  const typeFilter = clean(params.type);
  const q = clean(params.q);

  const auditWhere: Prisma.AuditLogWhereInput = {
    tenantId,
  };

  const [
    payments,
    receipts,
    refunds,
    reversalLedgerEntries,
    refundOutboxEvents,
    refundSmsLogs,
    refundSmsAuditRows,
    auditLogs,
  ] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCESS,
      },
      select: {
        id: true,
        providerReference: true,
        providerTransactionId: true,
        amountPesewas: true,
        channel: true,
        status: true,
        providerPaidAt: true,
        createdAt: true,
        feePayment: {
          select: {
            id: true,
            reference: true,
            method: true,
            paidAt: true,
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
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
                    guardianName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),

    prisma.receipt.findMany({
      where: { tenantId },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        reversedAt: true,
        reversalReason: true,
        feePayment: {
          select: {
            amountPesewas: true,
            method: true,
            reference: true,
            paymentTransaction: {
              select: {
                provider: true,
                providerReference: true,
              },
            },
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
                guardianName: true,
              },
            },
          },
        },
        issuedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reversedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),

    prisma.feeRefund.findMany({
      where: { tenantId },
      select: {
        id: true,
        amountPesewas: true,
        status: true,
        provider: true,
        providerReference: true,
        providerRefundReference: true,
        reason: true,
        approvalNote: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        failureReason: true,
        cancellationReason: true,
        requestedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        approvedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        feePayment: {
          select: {
            id: true,
            reference: true,
            amountPesewas: true,
            method: true,
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
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
                    guardianName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),

    prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        entryType: "REVERSAL_DEBIT",
        direction: "DEBIT",
      },
      select: {
        id: true,
        entryType: true,
        direction: true,
        amountPesewas: true,
        description: true,
        journalRef: true,
        createdAt: true,
        feeRefundId: true,
        feePaymentId: true,
        receipt: {
          select: {
            receiptNumber: true,
            status: true,
          },
        },
        feeRefund: {
          select: {
            id: true,
            status: true,
            providerRefundReference: true,
            reason: true,
            feePayment: {
              select: {
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
        },
        createdBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),

    prisma.financeOutboxEvent.findMany({
      where: {
        tenantId,
        type: FinanceOutboxEventType.SMS_REFUND_NOTICE,
      },
      select: {
        id: true,
        type: true,
        status: true,
        aggregateType: true,
        aggregateId: true,
        idempotencyKey: true,
        attempts: true,
        maxAttempts: true,
        payload: true,
        lastError: true,
        nextAttemptAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),

    prisma.smsLog.findMany({
      where: {
        tenantId,
        body: {
          contains: "refund",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        to: true,
        from: true,
        body: true,
        brand: true,
        providerMessageId: true,
        providerStatus: true,
        providerStatusDescription: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),

    prisma.sMSSendAudit.findMany({
      where: {
        tenantId,
        template: {
          contains: "REFUND",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        toPhone: true,
        template: true,
        payload: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),

    prisma.auditLog.findMany({
      where: auditWhere,
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  const events: EvidenceEvent[] = [];

  for (const payment of payments) {
    const student = payment.feePayment?.invoice.student;
    const learner =
      fullName(student?.firstName, student?.lastName) ||
      payment.feePayment?.receipt?.receiptNumber ||
      "Learner unavailable";

    events.push({
      id: `payment-${payment.id}`,
      type: "PAYMENT_RECEIVED",
      title: "Online payment received",
      description: "Paystack confirmed a successful online fee payment.",
      at: payment.providerPaidAt ?? payment.createdAt,
      actor: "Paystack",
      learner,
      amountPesewas: payment.amountPesewas,
      status: payment.status,
      reference: payment.providerReference,
      evidence: [
        `Provider transaction ID: ${payment.providerTransactionId ?? "—"}`,
        `Channel: ${payment.channel ?? "—"}`,
        `Receipt: ${payment.feePayment?.receipt?.receiptNumber ?? "—"}`,
        `Receipt status: ${payment.feePayment?.receipt?.status ?? "—"}`,
        `Term: ${payment.feePayment?.invoice.term ?? "—"} ${payment.feePayment?.invoice.academicYear ?? ""}`,
      ],
    });
  }

  for (const receipt of receipts) {
    const student = receipt.invoice.student;
    const learner =
      fullName(student?.firstName, student?.lastName) ||
      receipt.issuedToName ||
      "Learner unavailable";

    const isRefundStatus =
      receipt.status === "REFUNDED" || receipt.status === "PARTIALLY_REFUNDED";

    events.push({
      id: `receipt-${receipt.id}`,
      type: isRefundStatus ? "RECEIPT_REFUND_STATUS_CHANGED" : "RECEIPT_ISSUED",
      title: isRefundStatus ? "Receipt refund status changed" : "Receipt issued",
      description: isRefundStatus
        ? "Receipt now reflects refund truth."
        : "Payment receipt was issued and linked to invoice evidence.",
      at: receipt.reversedAt ?? receipt.issuedAt,
      actor: isRefundStatus ? actorName(receipt.reversedBy) : actorName(receipt.issuedBy),
      learner,
      amountPesewas: receipt.feePayment?.amountPesewas ?? null,
      status: receipt.status,
      reference:
        receipt.receiptNumber ||
        receipt.feePayment?.paymentTransaction?.providerReference ||
        receipt.feePayment?.reference ||
        null,
      evidence: [
        `Receipt number: ${receipt.receiptNumber}`,
        `Method: ${receipt.feePayment?.method ?? "—"}`,
        `Payment reference: ${receipt.feePayment?.reference ?? "—"}`,
        `Provider: ${receipt.feePayment?.paymentTransaction?.provider ?? "—"}`,
        `Provider reference: ${receipt.feePayment?.paymentTransaction?.providerReference ?? "—"}`,
        `Reversal reason: ${receipt.reversalReason ?? "—"}`,
      ],
    });
  }

  for (const refund of refunds) {
    const student = refund.feePayment.invoice.student;
    const learner =
      fullName(student?.firstName, student?.lastName) ||
      refund.feePayment.receipt?.receiptNumber ||
      "Learner unavailable";

    events.push({
      id: `refund-requested-${refund.id}`,
      type: "REFUND_REQUESTED",
      title: "Refund requested",
      description: "A refund request entered the school finance workflow.",
      at: refund.requestedAt,
      actor: actorName(refund.requestedBy),
      learner,
      amountPesewas: refund.amountPesewas,
      status: "REQUESTED",
      reference: refund.providerReference ?? refund.feePayment.reference,
      evidence: [
        `Reason: ${refund.reason ?? "—"}`,
        `Receipt: ${refund.feePayment.receipt?.receiptNumber ?? "—"}`,
        `Original payment: ${formatCedis(refund.feePayment.amountPesewas)}`,
        `Provider: ${refund.provider}`,
      ],
    });

    if (refund.approvedAt) {
      events.push({
        id: `refund-approved-${refund.id}`,
        type: "REFUND_APPROVED",
        title: "Refund approved",
        description: "School approved the refund for processing.",
        at: refund.approvedAt,
        actor: actorName(refund.approvedBy),
        learner,
        amountPesewas: refund.amountPesewas,
        status: "APPROVED",
        reference: refund.providerReference ?? refund.feePayment.reference,
        evidence: [
          `Refund ID: ${refund.id}`,
          `Receipt: ${refund.feePayment.receipt?.receiptNumber ?? "—"}`,
          `Requester: ${actorName(refund.requestedBy)}`,
          `Approval note: ${refund.approvalNote ?? "—"}`,
        ],
      });
    }

    if (refund.processingAt) {
      events.push({
        id: `refund-processing-${refund.id}`,
        type: "REFUND_SENT_TO_PROVIDER",
        title: "Refund sent to provider",
        description: "Refund execution was submitted to the payment provider and is awaiting final outcome.",
        at: refund.processingAt,
        actor: "EduLife OS",
        learner,
        amountPesewas: refund.amountPesewas,
        status: "PROCESSING",
        reference: refund.providerRefundReference ?? refund.providerReference ?? refund.feePayment.reference,
        evidence: [
          `Provider: ${refund.provider}`,
          `Provider refund reference: ${refund.providerRefundReference ?? "—"}`,
          `Payment reference: ${refund.providerReference ?? refund.feePayment.reference ?? "—"}`,
        ],
      });
    }

    if (refund.processedAt && refund.status === RefundStatus.SUCCEEDED) {
      events.push({
        id: `refund-succeeded-${refund.id}`,
        type: "REFUND_PROCESSED",
        title: "Refund processed",
        description: "Refund was confirmed and reflected back into EduLife OS.",
        at: refund.processedAt,
        actor: `${refund.provider} / EduLife OS`,
        learner,
        amountPesewas: refund.amountPesewas,
        status: "SUCCEEDED",
        reference: refund.providerRefundReference ?? refund.providerReference ?? refund.feePayment.reference,
        evidence: [
          `Provider refund reference: ${refund.providerRefundReference ?? "—"}`,
          `Receipt status: ${refund.feePayment.receipt?.status ?? "—"}`,
          `Reason: ${refund.reason ?? "—"}`,
        ],
      });
    }

    if (refund.failedAt) {
      events.push({
        id: `refund-failed-${refund.id}`,
        type: "REFUND_FAILED",
        title: "Refund failed",
        description: "Refund failed and requires finance review.",
        at: refund.failedAt,
        actor: `${refund.provider} / EduLife OS`,
        learner,
        amountPesewas: refund.amountPesewas,
        status: "FAILED",
        reference: refund.providerRefundReference ?? refund.providerReference ?? refund.feePayment.reference,
        evidence: [
          `Failure reason: ${refund.failureReason ?? "—"}`,
          `Payment reference: ${refund.providerReference ?? refund.feePayment.reference ?? "—"}`,
        ],
      });
    }

    if (refund.cancelledAt) {
      events.push({
        id: `refund-cancelled-${refund.id}`,
        type: "REFUND_CANCELLED",
        title: "Refund cancelled",
        description: "Refund request was cancelled before completion.",
        at: refund.cancelledAt,
        actor: "School finance",
        learner,
        amountPesewas: refund.amountPesewas,
        status: "CANCELLED",
        reference: refund.providerRefundReference ?? refund.providerReference ?? refund.feePayment.reference,
        evidence: [
          `Cancellation reason: ${refund.cancellationReason ?? "—"}`,
          `Original reason: ${refund.reason ?? "—"}`,
        ],
      });
    }
  }

  for (const entry of reversalLedgerEntries) {
    const student = entry.feeRefund?.feePayment.invoice.student;
    const learner = fullName(student?.firstName, student?.lastName) || "Learner unavailable";

    events.push({
      id: `ledger-${entry.id}`,
      type: "LEDGER_REVERSAL_CREATED",
      title: "Ledger reversal created",
      description: "A debit ledger entry was created to reverse refunded collection.",
      at: entry.createdAt,
      actor: actorName(entry.createdBy),
      learner,
      amountPesewas: entry.amountPesewas,
      status: `${entry.entryType}_${entry.direction}`,
      reference: entry.journalRef,
      evidence: [
        `Journal reference: ${entry.journalRef ?? "—"}`,
        `Receipt: ${entry.receipt?.receiptNumber ?? "—"}`,
        `Receipt status: ${entry.receipt?.status ?? "—"}`,
        `Refund ID: ${entry.feeRefundId ?? "—"}`,
        `Provider refund reference: ${entry.feeRefund?.providerRefundReference ?? "—"}`,
        `Description: ${entry.description ?? "—"}`,
      ],
    });
  }

  for (const outbox of refundOutboxEvents) {
    events.push({
      id: `outbox-${outbox.id}`,
      type: "REFUND_SMS_OUTBOX",
      title:
        outbox.status === "COMPLETED"
          ? "Refund SMS outbox completed"
          : "Refund SMS queued or retrying",
      description: "Refund notice was handled by the durable finance outbox.",
      at: outbox.processedAt ?? outbox.updatedAt ?? outbox.createdAt,
      actor: "EduLife OS outbox",
      learner: "Parent / guardian",
      amountPesewas: null,
      status: outbox.status,
      reference: outbox.aggregateId ?? outbox.idempotencyKey,
      evidence: [
        `Aggregate: ${outbox.aggregateType ?? "—"} ${outbox.aggregateId ?? "—"}`,
        `Attempts: ${outbox.attempts}/${outbox.maxAttempts}`,
        `Next attempt: ${formatDateTime(outbox.nextAttemptAt)}`,
        `Processed: ${formatDateTime(outbox.processedAt)}`,
        `Last error: ${outbox.lastError ?? "—"}`,
        `Payload: ${jsonPreview(outbox.payload)}`,
      ],
    });
  }

  for (const sms of refundSmsLogs) {
    events.push({
      id: `sms-${sms.id}`,
      type: "PARENT_SMS_SENT",
      title: "Parent refund SMS recorded",
      description: "A refund-related SMS was recorded for parent trust evidence.",
      at: sms.createdAt,
      actor: sms.from || sms.brand || "EduLife OS",
      learner: sms.to,
      amountPesewas: null,
      status: sms.providerStatusDescription || String(sms.providerStatus ?? "RECORDED"),
      reference: sms.providerMessageId,
      evidence: [
        `To: ${sms.to}`,
        `From: ${sms.from ?? "—"}`,
        `Brand: ${sms.brand ?? "—"}`,
        `Provider status: ${sms.providerStatus ?? "—"}`,
        `Message: ${sms.body}`,
      ],
    });
  }

  for (const audit of refundSmsAuditRows) {
    events.push({
      id: `sms-audit-${audit.id}`,
      type: "SMS_SEND_AUDIT",
      title: "Refund SMS audit row created",
      description: "Template-level SMS audit record exists for refund notification.",
      at: audit.createdAt,
      actor: "EduLife OS SMS audit",
      learner: audit.toPhone,
      amountPesewas: null,
      status: audit.template ?? "SMS_AUDIT",
      reference: String(audit.id),
      evidence: [
        `To: ${audit.toPhone}`,
        `Template: ${audit.template ?? "—"}`,
        `Payload: ${jsonPreview(audit.payload)}`,
      ],
    });
  }

  for (const log of auditLogs) {
    events.push({
      id: `audit-${log.id}`,
      type: "RAW_AUDIT_LOG",
      title: readableType(log.action),
      description: "Stored tenant-scoped AuditLog record.",
      at: log.createdAt,
      actor: actorName(log.user),
      learner: log.resource ?? "System resource",
      amountPesewas: null,
      status: log.action,
      reference: log.resourceId,
      evidence: [
        `Resource: ${log.resource ?? "—"}`,
        `Resource ID: ${log.resourceId ?? "—"}`,
        `IP: ${log.ip ?? "—"}`,
        `User agent: ${log.userAgent ?? "—"}`,
        `Metadata: ${jsonPreview(log.metadata)}`,
      ],
    });
  }

  const allTypes = Array.from(new Set(events.map((event) => event.type))).sort();

  const filteredEvents = events
    .filter((event) => (typeFilter ? event.type === typeFilter : true))
    .filter((event) => matchesSearch(event, q))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 220);

  const refundEventCount = filteredEvents.filter((event) => event.type.includes("REFUND")).length;
  const smsEventCount = filteredEvents.filter((event) => event.type.includes("SMS")).length;
  const ledgerEventCount = filteredEvents.filter((event) => event.type.includes("LEDGER")).length;
  const receiptEventCount = filteredEvents.filter((event) => event.type.includes("RECEIPT")).length;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            EduLife OS · Finance Governance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
            Financial Audit Evidence Chain
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            Human-readable evidence trail for payments, receipts, refund approval, provider
            processing, ledger reversals, durable SMS outbox, parent notification records, and
            raw tenant audit logs.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Search</label>
              <input
                name="q"
                defaultValue={q}
                placeholder="Learner, receipt, reference, refund ID, SMS, action..."
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Evidence type</label>
              <select
                name="type"
                defaultValue={typeFilter}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All evidence</option>
                {allTypes.map((type) => (
                  <option key={type} value={type}>
                    {readableType(type)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black"
            >
              Filter
            </button>
          </form>
        </section>

        <section className="grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Displayed evidence</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{filteredEvents.length}</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Refund evidence</p>
            <p className="mt-1 text-xl font-bold text-amber-950">{refundEventCount}</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Ledger reversals</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">{ledgerEventCount}</p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-[11px] text-blue-700">Parent SMS evidence</p>
            <p className="mt-1 text-xl font-bold text-blue-950">{smsEventCount}</p>
          </div>

          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
            <p className="text-[11px] text-purple-700">Receipt evidence</p>
            <p className="mt-1 text-xl font-bold text-purple-950">{receiptEventCount}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Evidence timeline</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Latest evidence first. Built for headteacher review, finance control, audit, and
              parent-trust investigations.
            </p>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No finance evidence found.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredEvents.map((event) => (
                <article
                  key={event.id}
                  className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]"
                >
                  <div className="space-y-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${evidenceClass(
                        event.type,
                        event.status
                      )}`}
                    >
                      {readableType(event.type)}
                    </span>

                    <div className="text-xs text-zinc-500">
                      <p>{formatDateTime(event.at)}</p>
                      <p className="mt-1">
                        Actor:{" "}
                        <span className="font-semibold text-zinc-800">{event.actor}</span>
                      </p>
                      <p className="mt-1">
                        Amount:{" "}
                        <span className="font-semibold text-zinc-800">
                          {formatCedis(event.amountPesewas)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-950">{event.title}</h3>
                      <p className="mt-1 text-xs text-zinc-600">{event.description}</p>
                    </div>

                    <div className="grid gap-2 text-xs md:grid-cols-3">
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-zinc-500">Learner / recipient</p>
                        <p className="mt-1 font-semibold text-zinc-900">{event.learner}</p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-zinc-500">Status</p>
                        <p className="mt-1 font-semibold text-zinc-900">{event.status}</p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-zinc-500">Reference</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-900">
                          {event.reference ?? "—"}
                        </p>
                      </div>
                    </div>

                    <details className="rounded-xl border border-zinc-200 bg-white p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                        Evidence notes
                      </summary>
                      <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                        {event.evidence.map((line) => (
                          <li key={line} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
          <p className="font-semibold text-zinc-900">Bank-grade audit rule</p>
          <p className="mt-1">
            A school leader must be able to trace every cedi from payment, to receipt, to refund
            approval, to provider processing, to ledger reversal, to receipt status, and finally to
            parent SMS evidence. If one stage is missing, the finance workflow is not yet
            evidence-grade.
          </p>
        </section>
      </div>
    </main>
  );
}