// src/app/api/admin/fees/ledger/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  LedgerDirection,
  LedgerEntryType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_TYPES = new Set<LedgerEntryType>([
  LedgerEntryType.INVOICE_DEBIT,
  LedgerEntryType.PAYMENT_CREDIT,
  LedgerEntryType.ADJUSTMENT_CREDIT,
  LedgerEntryType.REFUND_DEBIT,
  LedgerEntryType.REVERSAL_DEBIT,
  LedgerEntryType.REVERSAL_CREDIT,
  LedgerEntryType.CORRECTION,
]);

const DIRECTIONS = new Set<LedgerDirection>([
  LedgerDirection.DEBIT,
  LedgerDirection.CREDIT,
]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function classLabel(
  classroom?: { name: string | null; grade: string | null; arm: string | null } | null
) {
  if (!classroom) return null;
  return classroom.name || [classroom.grade, classroom.arm].filter(Boolean).join(" ") || null;
}

function clampTake(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 300;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const term = clean(url.searchParams.get("term")) || null;
  const academicYear = clean(url.searchParams.get("academicYear")) || null;
  const rawEntryType = clean(url.searchParams.get("entryType")) || null;
  const rawDirection = clean(url.searchParams.get("direction")).toUpperCase() || null;
  const studentId = clean(url.searchParams.get("studentId")) || null;
  const feeRefundId = clean(url.searchParams.get("feeRefundId")) || null;
  const feePaymentId = clean(url.searchParams.get("feePaymentId")) || null;
  const receiptId = clean(url.searchParams.get("receiptId")) || null;
  const q = clean(url.searchParams.get("q")) || null;
  const take = clampTake(url.searchParams.get("take"));

  const entryType =
    rawEntryType && ENTRY_TYPES.has(rawEntryType as LedgerEntryType)
      ? (rawEntryType as LedgerEntryType)
      : null;

  const direction =
    rawDirection && DIRECTIONS.has(rawDirection as LedgerDirection)
      ? (rawDirection as LedgerDirection)
      : null;

  if (rawEntryType && !entryType) {
    return json(400, { ok: false, error: "INVALID_ENTRY_TYPE" });
  }

  if (rawDirection && !direction) {
    return json(400, { ok: false, error: "INVALID_DIRECTION" });
  }

  try {
    const invoiceFilter: Prisma.FeeInvoiceWhereInput = {};
    if (term) invoiceFilter.term = term;
    if (academicYear) invoiceFilter.academicYear = academicYear;
    if (studentId) invoiceFilter.studentId = studentId;

    const where: Prisma.LedgerEntryWhereInput = {
      tenantId,
      ...(entryType ? { entryType } : {}),
      ...(direction ? { direction } : {}),
      ...(feeRefundId ? { feeRefundId } : {}),
      ...(feePaymentId ? { feePaymentId } : {}),
      ...(receiptId ? { receiptId } : {}),
      ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
    };

    if (q) {
      where.OR = [
        { journalRef: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { feePayment: { reference: { contains: q, mode: "insensitive" } } },
        { receipt: { receiptNumber: { contains: q, mode: "insensitive" } } },
        { feeRefund: { providerReference: { contains: q, mode: "insensitive" } } },
        { feeRefund: { providerRefundReference: { contains: q, mode: "insensitive" } } },
        { invoice: { student: { firstName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { lastName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianName: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianPhone: { contains: q, mode: "insensitive" } } } },
        { invoice: { student: { guardianPhoneNorm: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const entries = await prisma.ledgerEntry.findMany({
      where,
      select: {
        id: true,
        entryType: true,
        direction: true,
        amountPesewas: true,
        description: true,
        journalRef: true,
        createdAt: true,
        invoiceId: true,
        invoiceLineId: true,
        feePaymentId: true,
        feeAdjustmentId: true,
        feeRefundId: true,
        receiptId: true,
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
            totalPaidPesewas: true,
            balancePesewas: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: { select: { name: true, grade: true, arm: true } },
              },
            },
          },
        },
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            status: true,
          },
        },
        feeRefund: {
          select: {
            id: true,
            amountPesewas: true,
            status: true,
            reason: true,
            provider: true,
            providerReference: true,
            providerRefundReference: true,
            requestedAt: true,
            approvedAt: true,
            processingAt: true,
            processedAt: true,
          },
        },
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            status: true,
          },
        },
        createdBy: {
          select: { name: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take,
    });

    let debitTotalPesewas = 0;
    let creditTotalPesewas = 0;
    let refundDebitTotalPesewas = 0;
    let paymentCreditTotalPesewas = 0;
    let invoiceDebitTotalPesewas = 0;
    let adjustmentCreditTotalPesewas = 0;

    const items = entries.map((e) => {
      if (e.direction === LedgerDirection.DEBIT) {
        debitTotalPesewas += e.amountPesewas;
      } else {
        creditTotalPesewas += e.amountPesewas;
      }

      if (
        e.entryType === LedgerEntryType.REVERSAL_DEBIT ||
        e.entryType === LedgerEntryType.REFUND_DEBIT
      ) {
        refundDebitTotalPesewas += e.amountPesewas;
      }

      if (e.entryType === LedgerEntryType.PAYMENT_CREDIT) {
        paymentCreditTotalPesewas += e.amountPesewas;
      }

      if (e.entryType === LedgerEntryType.INVOICE_DEBIT) {
        invoiceDebitTotalPesewas += e.amountPesewas;
      }

      if (e.entryType === LedgerEntryType.ADJUSTMENT_CREDIT) {
        adjustmentCreditTotalPesewas += e.amountPesewas;
      }

      const createdByName =
        fullName(e.createdBy?.firstName, e.createdBy?.lastName) ||
        e.createdBy?.name ||
        "System";

      return {
        id: e.id,
        entryType: e.entryType,
        direction: e.direction,
        amountPesewas: e.amountPesewas,
        signedAmountPesewas:
          e.direction === LedgerDirection.DEBIT
            ? -Math.abs(e.amountPesewas)
            : Math.abs(e.amountPesewas),
        description: e.description ?? null,
        journalRef: e.journalRef ?? null,
        createdAt: e.createdAt.toISOString(),

        invoiceId: e.invoiceId,
        invoiceLineId: e.invoiceLineId,
        feePaymentId: e.feePaymentId,
        feeAdjustmentId: e.feeAdjustmentId,
        feeRefundId: e.feeRefundId,
        receiptId: e.receiptId,

        term: e.invoice?.term ?? null,
        academicYear: e.invoice?.academicYear ?? null,
        invoiceTotalBilledPesewas: e.invoice?.totalBilledPesewas ?? null,
        invoiceTotalWaivedPesewas: e.invoice?.totalWaivedPesewas ?? null,
        invoiceTotalPaidPesewas: e.invoice?.totalPaidPesewas ?? null,
        invoiceBalancePesewas: e.invoice?.balancePesewas ?? null,

        studentId: e.invoice?.student?.id ?? null,
        studentName: fullName(e.invoice?.student?.firstName, e.invoice?.student?.lastName),
        guardianName: e.invoice?.student?.guardianName ?? null,
        guardianPhone:
          e.invoice?.student?.guardianPhoneNorm ??
          e.invoice?.student?.guardianPhone ??
          null,
        classLabel: classLabel(e.invoice?.student?.classroom),

        paymentAmountPesewas: e.feePayment?.amountPesewas ?? null,
        paymentMethod: e.feePayment?.method ?? null,
        paymentReference: e.feePayment?.reference ?? null,
        paymentChannel: e.feePayment?.channel ?? null,
        paymentStatus: e.feePayment?.status ?? null,
        paidAt: e.feePayment?.paidAt?.toISOString() ?? null,

        refundAmountPesewas: e.feeRefund?.amountPesewas ?? null,
        refundStatus: e.feeRefund?.status ?? null,
        refundReason: e.feeRefund?.reason ?? null,
        refundProvider: e.feeRefund?.provider ?? null,
        refundProviderReference: e.feeRefund?.providerReference ?? null,
        providerRefundReference: e.feeRefund?.providerRefundReference ?? null,
        refundRequestedAt: e.feeRefund?.requestedAt?.toISOString() ?? null,
        refundApprovedAt: e.feeRefund?.approvedAt?.toISOString() ?? null,
        refundProcessingAt: e.feeRefund?.processingAt?.toISOString() ?? null,
        refundProcessedAt: e.feeRefund?.processedAt?.toISOString() ?? null,

        receiptNumber: e.receipt?.receiptNumber ?? null,
        receiptStatus: e.receipt?.status ?? null,
        createdByName,
      };
    });

    return json(200, {
      ok: true,
      count: items.length,
      take,
      filters: {
        term,
        academicYear,
        entryType,
        direction,
        studentId,
        feeRefundId,
        feePaymentId,
        receiptId,
        q,
      },
      summary: {
        debitTotalPesewas,
        creditTotalPesewas,
        signedNetPesewas: creditTotalPesewas - debitTotalPesewas,
        invoiceDebitTotalPesewas,
        paymentCreditTotalPesewas,
        adjustmentCreditTotalPesewas,
        refundDebitTotalPesewas,
        netPaymentLedgerPesewas: Math.max(0, paymentCreditTotalPesewas - refundDebitTotalPesewas),
      },
      items,
      rows: items,
    });
  } catch (err) {
    console.error("[ADMIN_FEES_LEDGER_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_LEDGER",
      items: [],
      rows: [],
    });
  }
}