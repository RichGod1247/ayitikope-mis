// src/lib/finance/core.ts
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TxClient;

type FinanceErrorCode =
  | "TENANT_NOT_FOUND"
  | "CLASSROOM_NOT_FOUND"
  | "FEE_STRUCTURE_NOT_FOUND"
  | "FEE_STRUCTURE_INACTIVE"
  | "FEE_STRUCTURE_MISSING_TERM_OR_YEAR"
  | "FEE_STRUCTURE_AMOUNT_INVALID"
  | "NO_ACTIVE_STUDENTS"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_ALREADY_CLEARED"
  | "PAYMENT_EXCEEDS_BALANCE"
  | "DUPLICATE_PAYMENT_REFERENCE";

export class FinanceError extends Error {
  code: FinanceErrorCode;
  status: number;

  constructor(code: FinanceErrorCode, status = 400, message?: string) {
    super(message ?? code);
    this.name = "FinanceError";
    this.code = code;
    this.status = status;
  }
}

function cleanMethod(method: string | null | undefined): string {
  const m = String(method ?? "cash").trim().toLowerCase();
  if (!m) return "cash";

  const allowed = new Set(["cash", "momo", "bank_transfer", "paystack", "other"]);
  return allowed.has(m) ? m : "other";
}

function makeJournalRef(prefix: string): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function makeReceiptNumber(schoolCode: string): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-${yyyymmdd}-${rand}`;
}

async function createUniqueReceiptNumber(tx: TxClient, tenantId: string, schoolCode: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const receiptNumber = makeReceiptNumber(schoolCode);
    const existing = await tx.receipt.findFirst({
      where: { tenantId, receiptNumber },
      select: { id: true },
    });

    if (!existing) return receiptNumber;
  }

  throw new FinanceError("DUPLICATE_PAYMENT_REFERENCE", 409, "Unable to generate a unique receipt number.");
}

export async function recalculateInvoiceTotals(
  tx: TxClient,
  tenantId: string,
  invoiceId: string
) {
  const invoice = await tx.feeInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
    },
  });

  if (!invoice) {
    throw new FinanceError("INVOICE_NOT_FOUND", 404);
  }

  const [lineAgg, adjustmentAgg, paymentAgg] = await Promise.all([
    tx.feeInvoiceLine.aggregate({
      where: { tenantId, invoiceId },
      _sum: { amountPesewas: true, waivedPesewas: true },
    }),
    tx.feeAdjustment.aggregate({
      where: { tenantId, invoiceId, reversedAt: null },
      _sum: { amountPesewas: true },
    }),
    tx.feePayment.aggregate({
      where: { tenantId, invoiceId, status: "SUCCESS" },
      _sum: { amountPesewas: true },
    }),
  ]);

  const lineBilled = lineAgg._sum.amountPesewas ?? 0;
  const legacyBilled = invoice.totalBilledPesewas ?? 0;

  const totalBilledPesewas = lineBilled > 0 ? lineBilled : legacyBilled;
  const lineWaived = lineAgg._sum.waivedPesewas ?? 0;
  const adjustmentWaived = adjustmentAgg._sum.amountPesewas ?? 0;
  const totalWaivedPesewas = Math.max(0, lineWaived + adjustmentWaived);
  const totalPaidPesewas = paymentAgg._sum.amountPesewas ?? 0;
  const netDue = Math.max(0, totalBilledPesewas - totalWaivedPesewas);
  const balancePesewas = Math.max(0, netDue - totalPaidPesewas);

  let status: "OPEN" | "PARTIALLY_PAID" | "PAID" = "OPEN";
  if (netDue > 0 && balancePesewas === 0) status = "PAID";
  else if (totalPaidPesewas > 0) status = "PARTIALLY_PAID";

  const updated = await tx.feeInvoice.update({
    where: { id: invoiceId },
    data: {
      totalBilledPesewas,
      totalWaivedPesewas,
      totalPaidPesewas,
      balancePesewas,
      status,
      closedAt: status === "PAID" ? new Date() : null,
    },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      term: true,
      academicYear: true,
      status: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
      totalPaidPesewas: true,
      balancePesewas: true,
    },
  });

  return updated;
}

export async function getInvoiceBalance(
  db: DbClient,
  tenantId: string,
  invoiceId: string
) {
  const invoice = await db.feeInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
      totalPaidPesewas: true,
      balancePesewas: true,
      status: true,
    },
  });

  if (!invoice) {
    throw new FinanceError("INVOICE_NOT_FOUND", 404);
  }

  return invoice;
}

export async function generateInvoicesForClassroomFeeStructure(input: {
  tenantId: string;
  classroomId: string;
  feeStructureId: string;
  actorUserId?: string | null;
}) {
  const { tenantId, classroomId, feeStructureId, actorUserId = null } = input;

  return prisma.$transaction(async (tx) => {
    const [classroom, structure] = await Promise.all([
      tx.classroom.findFirst({
        where: { id: classroomId, tenantId },
        select: { id: true, name: true, grade: true },
      }),
      tx.feeStructure.findFirst({
        where: { id: feeStructureId, tenantId },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          term: true,
          academicYear: true,
          amountPesewas: true,
          isActive: true,
        },
      }),
    ]);

    if (!classroom) throw new FinanceError("CLASSROOM_NOT_FOUND", 404);
    if (!structure) throw new FinanceError("FEE_STRUCTURE_NOT_FOUND", 404);
    if (!structure.isActive) throw new FinanceError("FEE_STRUCTURE_INACTIVE", 409);

    const term = String(structure.term ?? "").trim();
    const academicYear = String(structure.academicYear ?? "").trim();
    const amountPesewas = Math.floor(Number(structure.amountPesewas ?? 0));

    if (!term || !academicYear) {
      throw new FinanceError("FEE_STRUCTURE_MISSING_TERM_OR_YEAR", 409);
    }

    if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
      throw new FinanceError("FEE_STRUCTURE_AMOUNT_INVALID", 409);
    }

    const students = await tx.student.findMany({
      where: { tenantId, classroomId, status: "ACTIVE" },
      select: { id: true },
      take: 6000,
    });

    if (students.length === 0) {
      return {
        ok: true,
        totalLearners: 0,
        createdInvoices: 0,
        existingInvoices: 0,
        createdLines: 0,
        existingLines: 0,
        message: "No active learners in this classroom.",
        structure,
      };
    }

    let createdInvoices = 0;
    let existingInvoices = 0;
    let createdLines = 0;
    let existingLines = 0;

    for (const student of students) {
      let invoice = await tx.feeInvoice.findFirst({
        where: { tenantId, studentId: student.id, term, academicYear },
        select: { id: true },
      });

      if (!invoice) {
        invoice = await tx.feeInvoice.create({
          data: {
            tenantId,
            studentId: student.id,
            term,
            academicYear,
            status: "OPEN",
            totalBilledPesewas: 0,
            totalWaivedPesewas: 0,
            totalPaidPesewas: 0,
            balancePesewas: 0,
            note: `Generated from ${structure.name}`,
          },
          select: { id: true },
        });
        createdInvoices++;
      } else {
        existingInvoices++;
      }

      const existingLine = await tx.feeInvoiceLine.findFirst({
        where: {
          tenantId,
          invoiceId: invoice.id,
          feeStructureId: structure.id,
        },
        select: { id: true },
      });

      if (existingLine) {
        existingLines++;
        await recalculateInvoiceTotals(tx, tenantId, invoice.id);
        continue;
      }

      const line = await tx.feeInvoiceLine.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          feeStructureId: structure.id,
          category: structure.category ?? "GENERAL",
          description: structure.name,
          amountPesewas,
          waivedPesewas: 0,
        },
        select: { id: true },
      });

      createdLines++;

      await tx.ledgerEntry.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          invoiceLineId: line.id,
          studentId: student.id,
          entryType: "INVOICE_DEBIT",
          direction: "DEBIT",
          amountPesewas,
          description: `Invoice charge: ${structure.name}`,
          journalRef: makeJournalRef("INV"),
          createdByUserId: actorUserId,
        },
      });

      await recalculateInvoiceTotals(tx, tenantId, invoice.id);
    }

    return {
      ok: true,
      structureId: structure.id,
      structureName: structure.name,
      term,
      academicYear,
      amountPesewas,
      totalLearners: students.length,
      createdInvoices,
      existingInvoices,
      createdLines,
      existingLines,
    };
  });
}

export async function recordManualPayment(input: {
  tenantId: string;
  invoiceId: string;
  amountPesewas: number;
  method?: string | null;
  reference?: string | null;
  channel?: string | null;
  actorUserId?: string | null;
}) {
  const {
    tenantId,
    invoiceId,
    amountPesewas,
    method,
    reference,
    channel,
    actorUserId = null,
  } = input;

  const cleanReference = reference?.trim() || null;
  const cleanChannel = channel?.trim() || null;
  const cleanPaymentMethod = cleanMethod(method);

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    throw new FinanceError("PAYMENT_EXCEEDS_BALANCE", 400, "amountPesewas must be positive.");
  }

  return prisma.$transaction(async (tx) => {
    const [tenant, invoice] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, schoolCode: true },
      }),
      tx.feeInvoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: {
          id: true,
          tenantId: true,
          studentId: true,
          term: true,
          academicYear: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianPhone: true,
              guardianPhoneNorm: true,
              classroom: { select: { name: true, grade: true } },
            },
          },
        },
      }),
    ]);

    if (!tenant) throw new FinanceError("TENANT_NOT_FOUND", 404);
    if (!invoice) throw new FinanceError("INVOICE_NOT_FOUND", 404);

    if (cleanReference) {
      const existing = await tx.feePayment.findFirst({
        where: { tenantId, reference: cleanReference },
        select: { id: true },
      });

      if (existing) {
        throw new FinanceError("DUPLICATE_PAYMENT_REFERENCE", 409);
      }
    }

    const recalculatedBefore = await recalculateInvoiceTotals(tx, tenantId, invoiceId);
    const balance = recalculatedBefore.balancePesewas;

    if (balance <= 0) {
      throw new FinanceError("INVOICE_ALREADY_CLEARED", 400);
    }

    if (amountPesewas > balance) {
      throw new FinanceError("PAYMENT_EXCEEDS_BALANCE", 400);
    }

    const payment = await tx.feePayment.create({
      data: {
        tenantId,
        invoiceId,
        amountPesewas,
        method: cleanPaymentMethod,
        reference: cleanReference,
        channel: cleanChannel,
        status: "SUCCESS",
      },
    });

    await tx.paymentAllocation.create({
      data: {
        tenantId,
        studentId: invoice.studentId,
        invoiceId,
        feePaymentId: payment.id,
        amountPesewas,
        allocationType: "INVOICE_PAYMENT",
      },
    });

    const studentName =
      [invoice.student?.firstName, invoice.student?.lastName].filter(Boolean).join(" ").trim() ||
      "Student";

    const guardianPhone =
      invoice.student?.guardianPhoneNorm || invoice.student?.guardianPhone || null;

    const receiptNumber = await createUniqueReceiptNumber(tx, tenantId, tenant.schoolCode);

    const receipt = await tx.receipt.create({
      data: {
        tenantId,
        invoiceId,
        feePaymentId: payment.id,
        receiptNumber,
        issuedToName: studentName,
        issuedToPhone: guardianPhone,
        issuedByUserId: actorUserId,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        tenantId,
        invoiceId,
        studentId: invoice.studentId,
        feePaymentId: payment.id,
        receiptId: receipt.id,
        entryType: "PAYMENT_CREDIT",
        direction: "CREDIT",
        amountPesewas,
        description: `Payment via ${cleanPaymentMethod}${cleanReference ? ` (ref: ${cleanReference})` : ""}`,
        journalRef: makeJournalRef("PAY"),
        createdByUserId: actorUserId,
      },
    });

    const recalculatedAfter = await recalculateInvoiceTotals(tx, tenantId, invoiceId);

    return {
      ok: true,
      tenantName: tenant.name,
      payment,
      receipt,
      invoice: recalculatedAfter,
      studentName,
      guardianPhone,
      classLabel:
        invoice.student?.classroom?.name || invoice.student?.classroom?.grade || "Class",
      term: invoice.term,
      academicYear: invoice.academicYear,
      outstandingPesewas: recalculatedAfter.balancePesewas,
    };
  });
}