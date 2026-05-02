// src/app/api/admin/fees/reconciliation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import type {
  PaymentProvider,
  ReconciliationExceptionKind,
  ReconciliationSeverity,
  ReconciliationStatus,
} from "@prisma/client";

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
      student: { select: { firstName: true, lastName: true } },
      payments: {
        select: {
          id: true,
          amountPesewas: true,
          status: true,
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

  for (const inv of invoices) {
    const before = issues.length;
    const name = studentName(inv.student);

    const successfulPayments = inv.payments.filter((p) => p.status === "SUCCESS");
    const paymentTotal = successfulPayments.reduce((s, p) => s + p.amountPesewas, 0);

    const paymentCreditTotal = inv.ledgerEntries
      .filter((e) => e.entryType === "PAYMENT_CREDIT" && e.direction === "CREDIT")
      .reduce((s, e) => s + e.amountPesewas, 0);

    expectedPesewas += paymentTotal;
    actualPesewas += paymentCreditTotal;

    const netBilled = Math.max(0, inv.totalBilledPesewas - inv.totalWaivedPesewas);
    const expectedBalance = Math.max(0, netBilled - paymentTotal);

    if (inv.totalPaidPesewas !== paymentTotal) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "HIGH",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: paymentTotal,
        actualPesewas: inv.totalPaidPesewas,
        deltaPesewas: inv.totalPaidPesewas - paymentTotal,
        description: "Invoice paid total does not equal successful payment total.",
      });
    }

    if (inv.balancePesewas !== expectedBalance) {
      addIssue(issues, {
        kind: "AMOUNT_MISMATCH",
        severity: "HIGH",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: expectedBalance,
        actualPesewas: inv.balancePesewas,
        deltaPesewas: inv.balancePesewas - expectedBalance,
        description: "Invoice balance does not equal net billed minus successful payments.",
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
        description: "Successful payments do not equal PAYMENT_CREDIT ledger entries.",
      });
    }

    if (paymentTotal > netBilled) {
      addIssue(issues, {
        kind: "OVERPAYMENT",
        severity: "HIGH",
        invoiceId: inv.id,
        studentName: name,
        term: inv.term,
        academicYear: inv.academicYear,
        expectedPesewas: netBilled,
        actualPesewas: paymentTotal,
        deltaPesewas: paymentTotal - netBilled,
        description: "Successful payments exceed net billed amount.",
      });
    }

    const receiptByPaymentId = new Map(inv.receipts.map((r) => [r.feePaymentId, r]));
    const paymentIds = new Set(inv.payments.map((p) => p.id));

    for (const payment of successfulPayments) {
      if (!receiptByPaymentId.has(payment.id)) {
        addIssue(issues, {
          kind: "PAYMENT_WITHOUT_RECEIPT",
          severity: "CRITICAL",
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
          kind: "MISSING_LEDGER_ENTRY",
          severity: "CRITICAL",
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
    }

    for (const receipt of inv.receipts) {
      if (!paymentIds.has(receipt.feePaymentId)) {
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

    if (issues.length === before) cleanCount++;
  }

  const referencedPayments = await prisma.feePayment.findMany({
    where: { tenantId, reference: { not: null } },
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
      kind: "DUPLICATE_PROVIDER_REFERENCE",
      severity: "CRITICAL",
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
    expectedPesewas,
    actualPesewas,
    deltaPesewas,
    issues,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
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
    return json(500, { ok: false, error: "FAILED_TO_RUN_RECONCILIATION", issues: [] });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
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

    const batchStatus: ReconciliationStatus =
      result.issueCount === 0 ? "CLEAN" : "HAS_EXCEPTIONS";

    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.reconciliationBatch.create({
        data: {
          tenantId: auth.ctx.tenantId,
          provider: "PAYSTACK" as PaymentProvider,
          batchDate: safeDateOnly(body.batchDate),
          status: batchStatus,
          expectedPesewas: result.expectedPesewas,
          actualPesewas: result.actualPesewas,
          deltaPesewas: result.deltaPesewas,
          notes:
            clean(body.notes) ||
            `Reconciliation run. Invoices=${result.totalInvoices}; Issues=${result.issueCount}.`,
          createdByUserId: auth.ctx.userId,
          closedAt: result.issueCount === 0 ? new Date() : null,
        },
        select: {
          id: true,
          status: true,
          batchDate: true,
          createdAt: true,
        },
      });

      if (result.issues.length > 0) {
        await tx.reconciliationException.createMany({
          data: result.issues.map((issue) => ({
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
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: auth.ctx.tenantId,
          userId: auth.ctx.userId,
          action: "FINANCE_RECONCILIATION_BATCH_CREATED",
          resource: "ReconciliationBatch",
          resourceId: createdBatch.id,
          metadata: {
            status: batchStatus,
            issueCount: result.issueCount,
            totalInvoices: result.totalInvoices,
            expectedPesewas: result.expectedPesewas,
            actualPesewas: result.actualPesewas,
            deltaPesewas: result.deltaPesewas,
          },
        },
      });

      return createdBatch;
    });

    return json(200, {
      ...result,
      persisted: true,
      batch: {
        ...batch,
        batchDate: batch.batchDate.toISOString(),
        createdAt: batch.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_PERSIST_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_PERSIST_RECONCILIATION", issues: [] });
  }
}