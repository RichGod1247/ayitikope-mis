// src/app/api/admin/fees/ledger/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import type { LedgerDirection, LedgerEntryType, Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_TYPES = new Set<LedgerEntryType>([
  "INVOICE_DEBIT",
  "PAYMENT_CREDIT",
  "ADJUSTMENT_CREDIT",
  "REVERSAL_DEBIT",
  "REVERSAL_CREDIT",
  "CORRECTION",
]);

const DIRECTIONS = new Set<LedgerDirection>(["DEBIT", "CREDIT"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function classLabel(
  classroom?: {
    name: string | null;
    grade: string | null;
    arm: string | null;
  } | null
) {
  if (!classroom) return null;
  return classroom.name || [classroom.grade, classroom.arm].filter(Boolean).join(" ") || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const rawEntryType = url.searchParams.get("entryType")?.trim() || null;
  const rawDirection = url.searchParams.get("direction")?.trim().toUpperCase() || null;
  const studentId = url.searchParams.get("studentId")?.trim() || null;
  const q = url.searchParams.get("q")?.trim() || null;

  const takeRaw = Number(url.searchParams.get("take") ?? "300");
  const take = Math.min(1000, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 300));

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

    if (q) {
      invoiceFilter.student = {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { guardianName: { contains: q, mode: "insensitive" } },
          { guardianPhone: { contains: q, mode: "insensitive" } },
          { guardianPhoneNorm: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const where: Prisma.LedgerEntryWhereInput = {
      tenantId,
      ...(entryType ? { entryType } : {}),
      ...(direction ? { direction } : {}),
      ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
    };

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
        receiptId: true,
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                    arm: true,
                  },
                },
              },
            },
          },
        },
        feePayment: {
          select: {
            id: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
          },
        },
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take,
    });

    let debitTotalPesewas = 0;
    let creditTotalPesewas = 0;

    const items = entries.map((e) => {
      if (e.direction === "DEBIT") {
        debitTotalPesewas += e.amountPesewas;
      } else {
        creditTotalPesewas += e.amountPesewas;
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
          e.direction === "DEBIT" ? -Math.abs(e.amountPesewas) : Math.abs(e.amountPesewas),
        description: e.description ?? null,
        journalRef: e.journalRef ?? null,
        createdAt: e.createdAt.toISOString(),

        invoiceId: e.invoiceId,
        invoiceLineId: e.invoiceLineId,
        feePaymentId: e.feePaymentId,
        feeAdjustmentId: e.feeAdjustmentId,
        receiptId: e.receiptId,

        term: e.invoice?.term ?? null,
        academicYear: e.invoice?.academicYear ?? null,

        studentId: e.invoice?.student?.id ?? null,
        studentName: fullName(e.invoice?.student?.firstName, e.invoice?.student?.lastName),
        guardianName: e.invoice?.student?.guardianName ?? null,
        guardianPhone: e.invoice?.student?.guardianPhone ?? null,
        classLabel: classLabel(e.invoice?.student?.classroom),

        paymentMethod: e.feePayment?.method ?? null,
        paymentReference: e.feePayment?.reference ?? null,
        paymentChannel: e.feePayment?.channel ?? null,
        paidAt: e.feePayment?.paidAt?.toISOString() ?? null,

        receiptNumber: e.receipt?.receiptNumber ?? null,
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
        q,
      },
      summary: {
        debitTotalPesewas,
        creditTotalPesewas,
        netCreditPesewas: creditTotalPesewas - debitTotalPesewas,
      },
      items,
    });
  } catch (err) {
    console.error("[ADMIN_LEDGER_LIST_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_LEDGER",
      items: [],
      count: 0,
    });
  }
}