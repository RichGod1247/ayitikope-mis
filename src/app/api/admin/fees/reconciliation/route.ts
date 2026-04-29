// src/app/api/admin/fees/reconciliation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReconciliationKind =
  | "MISSING_LEDGER_ENTRY"
  | "PAYMENT_WITHOUT_RECEIPT"
  | "RECEIPT_WITHOUT_PAYMENT"
  | "DUPLICATE_PROVIDER_REFERENCE"
  | "AMOUNT_MISMATCH"
  | "UNMATCHED_PROVIDER_EVENT"
  | "OVERPAYMENT"
  | "UNKNOWN";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Issue = {
  kind: ReconciliationKind;
  severity: Severity;
  invoiceId?: string | null;
  studentName?: string | null;
  term?: string | null;
  academicYear?: string | null;
  providerReference?: string | null;
  expectedPesewas?: number | null;
  actualPesewas?: number | null;
  deltaPesewas?: number | null;
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

function safeDateOnly(raw: string | null): Date {
  if (!raw) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (!match) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  return new Date(Date.UTC(year, month, day));
}

function studentDisplayName(student: {
  firstName: string | null;
  lastName: string | null;
} | null | undefined) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function addIssue(issues: Issue[], issue: Issue) {
  issues.push({
    ...issue,
    expectedPesewas: issue.expectedPesewas ?? null,
    actualPesewas: issue.actualPesewas ?? null,
    deltaPesewas: issue.deltaPesewas ?? null,
    invoiceId: issue.invoiceId ?? null,
    studentName: issue.studentName ?? null,
    term: issue.term ?? null,
    academicYear: issue.academicYear ?? null,
    providerReference: issue.providerReference ?? null,
  });
}

async function analyzeTenantFinance(input: {
  tenantId: string;
  term?: string | null;
  academicYear?: string | null;
  limit?: number;
}) {
  const { tenantId, term = null, academicYear = null } = input;
  const limit = Math.min(Math.max(input.limit ?? 1000, 1), 5000);

  const invoiceWhere: {
    tenantId: string;
    term?: string;
    academicYear?: string;
  } = { tenantId };

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
      status: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      payments: {
        select: {
          id: true,
          amountPesewas: true,
          status: true,
          method: true,
          reference: true,
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
          receiptId: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  const issues: Issue[] = [];
  let cleanInvoiceCount = 0;

  for (const inv of invoices) {
    const invoiceIssuesBefore = issues.length;
    const name = studentDisplayName(inv.student);

    const successfulPayments = inv.payments.filter((p) => p.status === "SUCCESS");
    const paymentTotal = successfulPayments.reduce((sum, p) => sum + p.amountPesewas, 0);

    const paymentCreditTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "PAYMENT_CREDIT" && e.direction === "CREDIT")
      .reduce((sum, e) => sum + e.amountPesewas, 0);

    const invoiceDebitTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "INVOICE_DEBIT" && e.direction === "DEBIT")
      .reduce((sum, e) => sum + e.amountPesewas, 0);

    const adjustmentCreditTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "ADJUSTMENT_CREDIT" && e.direction === "CREDIT")
      .reduce((sum, e) => sum + e.amountPesewas, 0);

    const expectedPaid = paymentTotal;
    const expectedBalance = Math.max(
      0,
      (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0) - expectedPaid
    );

    if ((inv.totalPaidPesewas ?? 0) !== expectedPaid) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "HIGH",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: expectedPaid,
        actualPesewas: inv.totalPaidPesewas ?? 0,
        deltaPesewas: (inv.totalPaidPesewas ?? 0) - expectedPaid,
        description:
          "Invoice totalPaidPesewas does not match the sum of successful FeePayment records.",
      });
    }

    if ((inv.balancePesewas ?? 0) !== expectedBalance) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "HIGH",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: expectedBalance,
        actualPesewas: inv.balancePesewas ?? 0,
        deltaPesewas: (inv.balancePesewas ?? 0) - expectedBalance,
        description:
          "Invoice balancePesewas does not match billed minus waived minus successful payments.",
      });
    }

    if (paymentCreditTotal !== paymentTotal) {
      addIssue(issues, {
        kind: "MISSING_LEDGER_ENTRY",
        severity: "CRITICAL",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: paymentTotal,
        actualPesewas: paymentCreditTotal,
        deltaPesewas: paymentTotal - paymentCreditTotal,
        description:
          "Successful payment total does not match PAYMENT_CREDIT ledger total.",
      });
    }

    if (invoiceDebitTotal > 0 && invoiceDebitTotal !== (inv.totalBilledPesewas ?? 0)) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "MEDIUM",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: inv.totalBilledPesewas ?? 0,
        actualPesewas: invoiceDebitTotal,
        deltaPesewas: invoiceDebitTotal - (inv.totalBilledPesewas ?? 0),
        description:
          "INVOICE_DEBIT ledger total does not match invoice totalBilledPesewas.",
      });
    }

    if (adjustmentCreditTotal !== (inv.totalWaivedPesewas ?? 0) && adjustmentCreditTotal > 0) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "MEDIUM",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: inv.totalWaivedPesewas ?? 0,
        actualPesewas: adjustmentCreditTotal,
        deltaPesewas: adjustmentCreditTotal - (inv.totalWaivedPesewas ?? 0),
        description:
          "ADJUSTMENT_CREDIT ledger total does not match invoice totalWaivedPesewas.",
      });
    }

    const receiptByPaymentId = new Map(
      inv.receipts.map((r) => [r.feePaymentId, r])
    );

    for (const payment of successfulPayments) {
      if (!receiptByPaymentId.has(payment.id)) {
        addIssue(issues, {
          kind: "PAYMENT_WITHOUT_RECEIPT",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: payment.reference,
          expectedPesewas: payment.amountPesewas,
          actualPesewas: 0,
          deltaPesewas: payment.amountPesewas,
          description:
            "Successful payment exists without a receipt record.",
        });
      }

      const paymentLedger = inv.ledgerEntries.filter(
        (e) => e.feePaymentId === payment.id && e.entryType === "PAYMENT_CREDIT"
      );

      const paymentLedgerTotal = paymentLedger.reduce((sum, e) => sum + e.amountPesewas, 0);

      if (paymentLedgerTotal !== payment.amountPesewas) {
        addIssue(issues, {
          kind: "MISSING_LEDGER_ENTRY",
          severity: "CRITICAL",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: payment.reference,
          expectedPesewas: payment.amountPesewas,
          actualPesewas: paymentLedgerTotal,
          deltaPesewas: payment.amountPesewas - paymentLedgerTotal,
          description:
            "Successful payment does not have matching PAYMENT_CREDIT ledger entries.",
        });
      }
    }

    const paymentIdSet = new Set(inv.payments.map((p) => p.id));

    for (const receipt of inv.receipts) {
      if (!paymentIdSet.has(receipt.feePaymentId)) {
        addIssue(issues, {
          kind: "RECEIPT_WITHOUT_PAYMENT",
          severity: "CRITICAL",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          description: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
        });
      }
    }

    if (issues.length === invoiceIssuesBefore) {
      cleanInvoiceCount++;
    }
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
      method: true,
    },
    take: 10000,
  });

  const byReference = new Map<string, typeof referencedPayments>();

  for (const payment of referencedPayments) {
    const ref = String(payment.reference ?? "").trim();
    if (!ref) continue;

    const bucket = byReference.get(ref) ?? [];
    bucket.push(payment);
    byReference.set(ref, bucket);
  }

  for (const [reference, payments] of byReference.entries()) {
    if (payments.length <= 1) continue;

    const total = payments.reduce((sum, p) => sum + p.amountPesewas, 0);

    addIssue(issues, {
      kind: "DUPLICATE_PROVIDER_REFERENCE",
      severity: "CRITICAL",
      invoiceId: payments[0]?.invoiceId ?? null,
      providerReference: reference,
      expectedPesewas: payments[0]?.amountPesewas ?? null,
      actualPesewas: total,
      deltaPesewas: total - (payments[0]?.amountPesewas ?? 0),
      description:
        "More than one FeePayment uses the same reference. This may indicate duplicate crediting.",
    });
  }

  const providerEvents = await prisma.paymentProviderEvent.findMany({
    where: {
      tenantId,
      processingStatus: { in: ["RECEIVED", "FAILED"] },
    },
    select: {
      id: true,
      eventType: true,
      providerReference: true,
      processingStatus: true,
      processingError: true,
    },
    take: 1000,
  });

  for (const event of providerEvents) {
    addIssue(issues, {
      kind: "UNMATCHED_PROVIDER_EVENT",
      severity: event.processingStatus === "FAILED" ? "HIGH" : "MEDIUM",
      providerReference: event.providerReference,
      description:
        `Provider event ${event.eventType} is ${event.processingStatus}` +
        (event.processingError ? `: ${event.processingError}` : "."),
    });
  }

  const severityRank: Record<Severity, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  const highestSeverity =
    issues.length === 0
      ? null
      : issues.reduce<Severity>(
          (max, issue) =>
            severityRank[issue.severity] > severityRank[max] ? issue.severity : max,
          issues[0].severity
        );

  return {
    ok: true,
    isClean: issues.length === 0,
    issueCount: issues.length,
    cleanCount: cleanInvoiceCount,
    totalInvoices: invoices.length,
    highestSeverity,
    issues,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const limitRaw = Number(url.searchParams.get("limit") ?? 1000);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 1000;

  try {
    const result = await analyzeTenantFinance({
      tenantId,
      term,
      academicYear,
      limit,
    });

    return json(200, result);
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_RUN_RECONCILIATION",
      isClean: false,
      issueCount: null,
      cleanCount: null,
      totalInvoices: null,
      issues: [],
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const ct = req.headers.get("content-type") ?? "";
  if (ct && !ct.toLowerCase().includes("application/json")) {
    return json(415, {
      ok: false,
      error: "CONTENT_TYPE_MUST_BE_JSON",
    });
  }

  let body: {
    term?: string;
    academicYear?: string;
    batchDate?: string;
    notes?: string;
    limit?: number;
  } = {};

  if (ct) {
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, {
        ok: false,
        error: "INVALID_JSON",
      });
    }
  }

  const term = String(body.term ?? "").trim() || null;
  const academicYear = String(body.academicYear ?? "").trim() || null;
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 1000;
  const batchDate = safeDateOnly(String(body.batchDate ?? "").trim() || null);

  try {
    const result = await analyzeTenantFinance({
      tenantId,
      term,
      academicYear,
      limit,
    });

    const provider = null;
    const batchStatus =
      result.issueCount === 0 ? "CLEAN" : "HAS_EXCEPTIONS";

    const batch = await prisma.reconciliationBatch.create({
      data: {
        tenantId,
        provider,
        batchDate,
        status: batchStatus,
        expectedPesewas: 0,
        actualPesewas: 0,
        deltaPesewas: 0,
        notes:
          body.notes ??
          `Reconciliation run${term ? ` for ${term}` : ""}${
            academicYear ? ` ${academicYear}` : ""
          }`,
        createdByUserId: auth.ctx.userId,
      },
      select: {
        id: true,
        status: true,
        batchDate: true,
        createdAt: true,
      },
    });

    if (result.issues.length > 0) {
      await prisma.reconciliationException.createMany({
        data: result.issues.map((issue) => ({
          tenantId,
          batchId: batch.id,
          invoiceId: issue.invoiceId ?? null,
          providerReference: issue.providerReference ?? null,
          kind: issue.kind,
          severity: issue.severity,
          status: "OPEN",
          expectedPesewas: issue.expectedPesewas ?? null,
          actualPesewas: issue.actualPesewas ?? null,
          deltaPesewas: issue.deltaPesewas ?? null,
          description: issue.description,
        })),
      });
    }

    return json(201, {
      ...result,
      persisted: true,
      batch,
    });
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_PERSIST_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_PERSIST_RECONCILIATION",
      isClean: false,
      issueCount: null,
      cleanCount: null,
      totalInvoices: null,
      issues: [],
    });
  }
}