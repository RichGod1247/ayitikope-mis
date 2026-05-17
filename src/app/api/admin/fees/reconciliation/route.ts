// src/app/api/admin/fees/reconciliation/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentProvider,
  PaymentStatus,
  ReconciliationExceptionKind,
  ReconciliationSeverity,
  ReconciliationStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Issue = {
  kind: ReconciliationExceptionKind;
  severity: ReconciliationSeverity;
  invoiceId: string | null;
  studentName: string | null;
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function clampLimit(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1000;
  return Math.min(Math.max(Math.floor(n), 1), 5000);
}

function safeDateOnly(raw: unknown): Date {
  const s = clean(raw);
  const now = new Date();

  if (!s) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function studentName(student?: { firstName: string | null; lastName: string | null } | null) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function isSuccessfulOrRefundedPayment(status: PaymentStatus) {
  return status === PaymentStatus.SUCCESS || status === PaymentStatus.REFUNDED;
}

function addIssue(
  issues: Issue[],
  issue: Omit<
    Issue,
    | "invoiceId"
    | "studentName"
    | "term"
    | "academicYear"
    | "providerReference"
    | "expectedPesewas"
    | "actualPesewas"
    | "deltaPesewas"
  > &
    Partial<Issue>
) {
  issues.push({
    invoiceId: issue.invoiceId ?? null,
    studentName: issue.studentName ?? null,
    term: issue.term ?? null,
    academicYear: issue.academicYear ?? null,
    providerReference: issue.providerReference ?? null,
    expectedPesewas: issue.expectedPesewas ?? null,
    actualPesewas: issue.actualPesewas ?? null,
    deltaPesewas: issue.deltaPesewas ?? null,
    kind: issue.kind,
    severity: issue.severity,
    description: issue.description,
  });
}

function countIssuesByKind(issues: Issue[]) {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.kind] = (acc[issue.kind] ?? 0) + 1;
    return acc;
  }, {});
}

function countIssuesBySeverity(issues: Issue[]) {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Temporary case identity until we add a formal fingerprint column.
 *
 * Bank-grade rule:
 * - One unresolved/accepted control case per underlying defect.
 * - Do not create duplicate active cases on repeated Save Batch.
 * - RESOLVED is intentionally excluded: if a previously resolved issue reappears,
 *   that is a new control event and should be captured.
 */
function exceptionCaseWhere(
  tenantId: string,
  issue: Issue
): Prisma.ReconciliationExceptionWhereInput {
  const activeOrAcceptedStatus: Prisma.EnumReconciliationExceptionStatusFilter = {
    in: ["OPEN", "INVESTIGATING", "DISMISSED"],
  };

  if (
    issue.kind === ReconciliationExceptionKind.DUPLICATE_PROVIDER_REFERENCE ||
    issue.kind === ReconciliationExceptionKind.UNMATCHED_PROVIDER_EVENT ||
    issue.kind === ReconciliationExceptionKind.SUSPICIOUS_PROVIDER_EVENT
  ) {
    return {
      tenantId,
      kind: issue.kind,
      providerReference: issue.providerReference,
      description: issue.description,
      status: activeOrAcceptedStatus,
    };
  }

  return {
    tenantId,
    kind: issue.kind,
    invoiceId: issue.invoiceId,
    providerReference: issue.providerReference,
    description: issue.description,
    status: activeOrAcceptedStatus,
  };
}

async function analyzeTenantFinance(input: {
  tenantId: string;
  term?: string | null;
  academicYear?: string | null;
  limit?: number;
}) {
  const tenantId = input.tenantId;
  const term = clean(input.term) || null;
  const academicYear = clean(input.academicYear) || null;
  const limit = clampLimit(input.limit);

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
          reference: true,
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

  const issues: Issue[] = [];
  let cleanCount = 0;
  let expectedPesewas = 0;
  let actualPesewas = 0;
  let grossPaymentTotalPesewas = 0;
  let refundTotalPesewas = 0;

  for (const inv of invoices) {
    const before = issues.length;
    const name = studentName(inv.student);

    const successfulPayments = inv.payments.filter((p) =>
      isSuccessfulOrRefundedPayment(p.status)
    );

    const grossPaymentTotal = successfulPayments.reduce((s, p) => s + p.amountPesewas, 0);

    const succeededRefundTotal = successfulPayments.reduce(
      (s, p) =>
        s +
        p.refunds
          .filter((r) => r.status === RefundStatus.SUCCEEDED)
          .reduce((rs, r) => rs + r.amountPesewas, 0),
      0
    );

    const pendingRefundTotal = successfulPayments.reduce(
      (s, p) =>
        s +
        p.refunds
          .filter(
            (r) =>
              r.status === RefundStatus.REQUESTED ||
              r.status === RefundStatus.APPROVED ||
              r.status === RefundStatus.PROCESSING
          )
          .reduce((rs, r) => rs + r.amountPesewas, 0),
      0
    );

    const netPaymentTotal = Math.max(0, grossPaymentTotal - succeededRefundTotal);

    const paymentCreditTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "PAYMENT_CREDIT" && e.direction === "CREDIT")
      .reduce((s, e) => s + e.amountPesewas, 0);

    const refundLedgerTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "REVERSAL_DEBIT" && e.direction === "DEBIT")
      .reduce((s, e) => s + e.amountPesewas, 0);

    const ledgerNetTotal = Math.max(0, paymentCreditTotal - refundLedgerTotal);

    grossPaymentTotalPesewas += grossPaymentTotal;
    refundTotalPesewas += succeededRefundTotal;
    expectedPesewas += netPaymentTotal;
    actualPesewas += ledgerNetTotal;

    const netBilled = Math.max(0, inv.totalBilledPesewas - inv.totalWaivedPesewas);
    const expectedBalance = Math.max(0, netBilled - netPaymentTotal);

    if (inv.totalPaidPesewas !== netPaymentTotal) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.AMOUNT_MISMATCH,
        severity: ReconciliationSeverity.HIGH,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: netPaymentTotal,
        actualPesewas: inv.totalPaidPesewas,
        deltaPesewas: inv.totalPaidPesewas - netPaymentTotal,
        description:
          "Invoice paid total does not equal successful payments minus succeeded refunds.",
      });
    }

    if (inv.balancePesewas !== expectedBalance) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.AMOUNT_MISMATCH,
        severity: ReconciliationSeverity.HIGH,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: expectedBalance,
        actualPesewas: inv.balancePesewas,
        deltaPesewas: inv.balancePesewas - expectedBalance,
        description:
          "Invoice balance does not equal net billed minus net paid after succeeded refunds.",
      });
    }

    if (paymentCreditTotal !== grossPaymentTotal) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.MISSING_LEDGER_ENTRY,
        severity: ReconciliationSeverity.CRITICAL,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: grossPaymentTotal,
        actualPesewas: paymentCreditTotal,
        deltaPesewas: grossPaymentTotal - paymentCreditTotal,
        description: "Gross successful payments do not equal PAYMENT_CREDIT ledger entries.",
      });
    }

    if (refundLedgerTotal !== succeededRefundTotal) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.REFUND_WITHOUT_LEDGER_ENTRY,
        severity: ReconciliationSeverity.CRITICAL,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: succeededRefundTotal,
        actualPesewas: refundLedgerTotal,
        deltaPesewas: succeededRefundTotal - refundLedgerTotal,
        description: "Succeeded refunds do not equal REVERSAL_DEBIT ledger entries.",
      });
    }

    if (ledgerNetTotal !== netPaymentTotal) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.REFUND_AMOUNT_MISMATCH,
        severity: ReconciliationSeverity.CRITICAL,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: netPaymentTotal,
        actualPesewas: ledgerNetTotal,
        deltaPesewas: netPaymentTotal - ledgerNetTotal,
        description: "Ledger net does not equal gross payments minus succeeded refunds.",
      });
    }

    if (netPaymentTotal > netBilled) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.OVERPAYMENT,
        severity: ReconciliationSeverity.HIGH,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: netBilled,
        actualPesewas: netPaymentTotal,
        deltaPesewas: netPaymentTotal - netBilled,
        description: "Net payments after refunds exceed net billed amount.",
      });
    }

    if (pendingRefundTotal > 0 && netPaymentTotal - pendingRefundTotal < 0) {
      addIssue(issues, {
        kind: ReconciliationExceptionKind.REFUND_AMOUNT_MISMATCH,
        severity: ReconciliationSeverity.HIGH,
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: netPaymentTotal,
        actualPesewas: pendingRefundTotal,
        deltaPesewas: pendingRefundTotal - netPaymentTotal,
        description: "Pending refunds exceed currently retained net payment value.",
      });
    }

    const receiptByPaymentId = new Map(inv.receipts.map((r) => [r.feePaymentId, r]));
    const paymentIds = new Set(inv.payments.map((p) => p.id));

    for (const payment of successfulPayments) {
      if (!receiptByPaymentId.has(payment.id)) {
        addIssue(issues, {
          kind: ReconciliationExceptionKind.PAYMENT_WITHOUT_RECEIPT,
          severity: ReconciliationSeverity.CRITICAL,
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: payment.reference,
          expectedPesewas: payment.amountPesewas,
          actualPesewas: 0,
          deltaPesewas: payment.amountPesewas,
          description: "Successful payment exists without receipt.",
        });
      }

      const perPaymentLedgerTotal = inv.ledgerEntries
        .filter(
          (e) =>
            e.feePaymentId === payment.id &&
            e.entryType === "PAYMENT_CREDIT" &&
            e.direction === "CREDIT"
        )
        .reduce((s, e) => s + e.amountPesewas, 0);

      if (perPaymentLedgerTotal !== payment.amountPesewas) {
        addIssue(issues, {
          kind: ReconciliationExceptionKind.MISSING_LEDGER_ENTRY,
          severity: ReconciliationSeverity.CRITICAL,
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: payment.reference,
          expectedPesewas: payment.amountPesewas,
          actualPesewas: perPaymentLedgerTotal,
          deltaPesewas: payment.amountPesewas - perPaymentLedgerTotal,
          description: "Payment does not have matching PAYMENT_CREDIT ledger entry.",
        });
      }

      for (const refund of payment.refunds.filter((r) => r.status === RefundStatus.SUCCEEDED)) {
        const perRefundLedgerTotal = inv.ledgerEntries
          .filter(
            (e) =>
              e.feeRefundId === refund.id &&
              e.entryType === "REVERSAL_DEBIT" &&
              e.direction === "DEBIT"
          )
          .reduce((s, e) => s + e.amountPesewas, 0);

        if (perRefundLedgerTotal !== refund.amountPesewas) {
          addIssue(issues, {
            kind: ReconciliationExceptionKind.REFUND_WITHOUT_LEDGER_ENTRY,
            severity: ReconciliationSeverity.CRITICAL,
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: refund.amountPesewas,
            actualPesewas: perRefundLedgerTotal,
            deltaPesewas: refund.amountPesewas - perRefundLedgerTotal,
            description: "Refund does not have matching REVERSAL_DEBIT ledger entry.",
          });
        }
      }
    }

    for (const receipt of inv.receipts) {
      if (!paymentIds.has(receipt.feePaymentId)) {
        addIssue(issues, {
          kind: ReconciliationExceptionKind.RECEIPT_WITHOUT_PAYMENT,
          severity: ReconciliationSeverity.CRITICAL,
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          description: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
        });
      }
    }

    if (issues.length === before) cleanCount++;
  }

  const referencedPayments = await prisma.feePayment.findMany({
    where: {
      tenantId,
      reference: { not: null },
    },
    select: {
      id: true,
      invoiceId: true,
      reference: true,
      amountPesewas: true,
    },
    take: 10000,
  });

  const byRef = new Map<string, typeof referencedPayments>();

  for (const payment of referencedPayments) {
    const ref = clean(payment.reference);
    if (!ref) continue;

    const bucket = byRef.get(ref) ?? [];
    bucket.push(payment);
    byRef.set(ref, bucket);
  }

  for (const [reference, payments] of byRef.entries()) {
    if (payments.length <= 1) continue;

    const total = payments.reduce((s, p) => s + p.amountPesewas, 0);

    addIssue(issues, {
      kind: ReconciliationExceptionKind.DUPLICATE_PROVIDER_REFERENCE,
      severity: ReconciliationSeverity.CRITICAL,
      invoiceId: payments[0]?.invoiceId ?? null,
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
      processingStatus: { in: ["RECEIVED", "FAILED"] },
    },
    select: {
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
    addIssue(issues, {
      kind: event.isSuspicious
        ? ReconciliationExceptionKind.SUSPICIOUS_PROVIDER_EVENT
        : ReconciliationExceptionKind.UNMATCHED_PROVIDER_EVENT,
      severity:
        event.processingStatus === "FAILED" || event.isSuspicious
          ? ReconciliationSeverity.HIGH
          : ReconciliationSeverity.MEDIUM,
      providerReference: event.providerReference,
      description:
        `Provider event ${event.eventType} is ${event.processingStatus}` +
        (event.processingError ? `: ${event.processingError}` : "") +
        (event.suspiciousReason ? ` Suspicion: ${event.suspiciousReason}` : "."),
    });
  }

  const rank: Record<ReconciliationSeverity, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  const highestSeverity =
    issues.length === 0
      ? null
      : issues.reduce<ReconciliationSeverity>(
          (max, issue) => (rank[issue.severity] > rank[max] ? issue.severity : max),
          issues[0].severity
        );

  const deltaPesewas = expectedPesewas - actualPesewas;

  return {
    ok: true,
    isClean: issues.length === 0,
    issueCount: issues.length,
    cleanCount,
    totalInvoices: invoices.length,
    highestSeverity,
    grossPaymentTotalPesewas,
    refundTotalPesewas,
    expectedPesewas,
    actualPesewas,
    deltaPesewas,
    issues,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);

  try {
    const result = await analyzeTenantFinance({
      tenantId: auth.ctx.tenantId,
      term: url.searchParams.get("term"),
      academicYear: url.searchParams.get("academicYear"),
      limit: clampLimit(url.searchParams.get("limit")),
    });

    return json(200, result);
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_RUN_RECONCILIATION",
      issues: [],
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ct = req.headers.get("content-type") ?? "";
  if (ct && !ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: {
    term?: string;
    academicYear?: string;
    batchDate?: string;
    notes?: string;
    limit?: number;
    provider?: PaymentProvider;
  } = {};

  if (ct) {
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, { ok: false, error: "INVALID_JSON" });
    }
  }

  try {
    const result = await analyzeTenantFinance({
      tenantId: auth.ctx.tenantId,
      term: body.term,
      academicYear: body.academicYear,
      limit: clampLimit(body.limit),
    });

    const persisted = await prisma.$transaction(async (tx) => {
      let createdExceptionCount = 0;
      let alreadyTrackedExceptionCount = 0;
      let dismissedDuplicateCount = 0;

      const createdExceptionIds: string[] = [];
      const alreadyTrackedExceptionIds: string[] = [];
      const dismissedDuplicateExceptionIds: string[] = [];
      const issuesToCreate: Issue[] = [];

      for (const issue of result.issues) {
        const existingCase = await tx.reconciliationException.findFirst({
          where: exceptionCaseWhere(auth.ctx.tenantId, issue),
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            batchId: true,
            createdAt: true,
          },
        });

        if (existingCase) {
          if (existingCase.status === "DISMISSED") {
            dismissedDuplicateCount++;
            dismissedDuplicateExceptionIds.push(existingCase.id);
          } else {
            alreadyTrackedExceptionCount++;
            alreadyTrackedExceptionIds.push(existingCase.id);
          }

          continue;
        }

        issuesToCreate.push(issue);
      }

      const shouldCreateBatch = result.issueCount === 0 || issuesToCreate.length > 0;

      if (!shouldCreateBatch) {
        await tx.auditLog.create({
          data: {
            tenantId: auth.ctx.tenantId,
            userId: auth.ctx.userId,
            action: "FINANCE_RECONCILIATION_RECHECK_NO_NEW_EXCEPTION_CASES",
            resource: "ReconciliationException",
            resourceId: alreadyTrackedExceptionIds[0] ?? dismissedDuplicateExceptionIds[0] ?? null,
            metadata: {
              term: clean(body.term) || null,
              academicYear: clean(body.academicYear) || null,
              limit: clampLimit(body.limit),

              totalInvoices: result.totalInvoices,
              cleanCount: result.cleanCount,
              issueCount: result.issueCount,
              highestSeverity: result.highestSeverity,

              grossPaymentTotalPesewas: result.grossPaymentTotalPesewas,
              refundTotalPesewas: result.refundTotalPesewas,
              expectedPesewas: result.expectedPesewas,
              actualPesewas: result.actualPesewas,
              deltaPesewas: result.deltaPesewas,

              issueKindCounts: countIssuesByKind(result.issues),
              issueSeverityCounts: countIssuesBySeverity(result.issues),

              createdExceptionCount: 0,
              createdExceptionIds: [],

              alreadyTrackedExceptionCount,
              alreadyTrackedExceptionIds,

              dismissedDuplicateCount,
              dismissedDuplicateExceptionIds,

              duplicatePolicy:
                "Recheck did not create a new batch because every detected issue is already tracked by an existing OPEN, INVESTIGATING, or DISMISSED exception case.",
            },
          },
        });

        return {
          batch: null,
          recheckOnly: true,
          message:
            "No new exception batch was created. Existing reconciliation cases already track these detected issues.",
          createdExceptionCount: 0,
          createdExceptionIds: [],
          alreadyTrackedExceptionCount,
          alreadyTrackedExceptionIds,
          dismissedDuplicateCount,
          dismissedDuplicateExceptionIds,
        };
      }

      const createdBatch = await tx.reconciliationBatch.create({
        data: {
          tenantId: auth.ctx.tenantId,
          provider: body.provider ?? null,
          batchDate: safeDateOnly(body.batchDate),
          status:
            result.issueCount === 0
              ? ReconciliationStatus.CLEAN
              : ReconciliationStatus.HAS_EXCEPTIONS,
          expectedPesewas: result.expectedPesewas,
          actualPesewas: result.actualPesewas,
          deltaPesewas: result.deltaPesewas,
          notes:
            clean(body.notes) ||
            "Finance reconciliation batch persisted from admin dashboard.",
          createdByUserId: auth.ctx.userId,
        },
      });

      for (const issue of issuesToCreate) {
        const createdException = await tx.reconciliationException.create({
          data: {
            tenantId: auth.ctx.tenantId,
            batchId: createdBatch.id,
            invoiceId: issue.invoiceId,
            providerReference: issue.providerReference,
            kind: issue.kind,
            severity: issue.severity,
            status: "OPEN",
            expectedPesewas: issue.expectedPesewas,
            actualPesewas: issue.actualPesewas,
            deltaPesewas: issue.deltaPesewas,
            description: issue.description,
          },
          select: { id: true },
        });

        createdExceptionCount++;
        createdExceptionIds.push(createdException.id);
      }

      await tx.auditLog.create({
        data: {
          tenantId: auth.ctx.tenantId,
          userId: auth.ctx.userId,
          action: "FINANCE_RECONCILIATION_BATCH_CREATED",
          resource: "ReconciliationBatch",
          resourceId: createdBatch.id,
          metadata: {
            provider: createdBatch.provider,
            batchDate: createdBatch.batchDate.toISOString().slice(0, 10),
            status: createdBatch.status,
            term: clean(body.term) || null,
            academicYear: clean(body.academicYear) || null,
            limit: clampLimit(body.limit),
            notes: createdBatch.notes,

            totalInvoices: result.totalInvoices,
            cleanCount: result.cleanCount,
            issueCount: result.issueCount,
            highestSeverity: result.highestSeverity,

            grossPaymentTotalPesewas: result.grossPaymentTotalPesewas,
            refundTotalPesewas: result.refundTotalPesewas,
            expectedPesewas: result.expectedPesewas,
            actualPesewas: result.actualPesewas,
            deltaPesewas: result.deltaPesewas,

            issueKindCounts: countIssuesByKind(result.issues),
            issueSeverityCounts: countIssuesBySeverity(result.issues),

            createdExceptionCount,
            createdExceptionIds,

            alreadyTrackedExceptionCount,
            alreadyTrackedExceptionIds,

            dismissedDuplicateCount,
            dismissedDuplicateExceptionIds,

            duplicatePolicy:
              "Save Batch creates new exception cases only for newly detected issues. Existing OPEN, INVESTIGATING, or DISMISSED cases are not duplicated.",
          },
        },
      });

      return {
        batch: createdBatch,
        recheckOnly: false,
        message:
          createdExceptionCount > 0
            ? `${createdExceptionCount} new reconciliation exception case(s) created.`
            : "Clean reconciliation batch saved.",
        createdExceptionCount,
        createdExceptionIds,
        alreadyTrackedExceptionCount,
        alreadyTrackedExceptionIds,
        dismissedDuplicateCount,
        dismissedDuplicateExceptionIds,
      };
    });

    return json(200, {
      ...result,
      batch: persisted.batch,
      persisted: Boolean(persisted.batch),
      recheckOnly: persisted.recheckOnly,
      message: persisted.message,
      createdExceptionCount: persisted.createdExceptionCount,
      createdExceptionIds: persisted.createdExceptionIds,
      alreadyTrackedExceptionCount: persisted.alreadyTrackedExceptionCount,
      alreadyTrackedExceptionIds: persisted.alreadyTrackedExceptionIds,
      dismissedDuplicateCount: persisted.dismissedDuplicateCount,
      dismissedDuplicateExceptionIds: persisted.dismissedDuplicateExceptionIds,
    });
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_PERSIST_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_PERSIST_RECONCILIATION",
      issues: [],
    });
  }
}