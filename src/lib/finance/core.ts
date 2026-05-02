// src/lib/finance/core.ts
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TxClient;

type FinanceErrorCode =
  | "TENANT_NOT_FOUND"
  | "CLASSROOM_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "FORBIDDEN_STUDENT"
  | "FEE_STRUCTURE_NOT_FOUND"
  | "FEE_STRUCTURE_INACTIVE"
  | "FEE_STRUCTURE_MISSING_TERM_OR_YEAR"
  | "FEE_STRUCTURE_AMOUNT_INVALID"
  | "NO_ACTIVE_STUDENTS"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_ALREADY_CLEARED"
  | "INVOICE_BALANCE_CHANGED"
  | "PAYMENT_INTENT_NOT_FOUND"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_EXCEEDS_BALANCE"
  | "PAYMENT_ALREADY_PROCESSED"
  | "DUPLICATE_PAYMENT_REFERENCE"
  | "PAYMENT_GATEWAY_FAILED"
  | "PAYMENT_SERVICE_NOT_CONFIGURED"
  | "SETTLEMENT_ACCOUNT_REQUIRED";

const TX_LONG = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

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

async function createUniqueReceiptNumber(
  tx: TxClient,
  tenantId: string,
  schoolCode: string
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const receiptNumber = makeReceiptNumber(schoolCode);

    const existing = await tx.receipt.findFirst({
      where: { tenantId, receiptNumber },
      select: { id: true },
    });

    if (!existing) return receiptNumber;
  }

  throw new FinanceError(
    "DUPLICATE_PAYMENT_REFERENCE",
    409,
    "Unable to generate a unique receipt number."
  );
}

function digitsOnlyFinance(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function makePaystackReference(schoolCode: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-PAY-${ts}-${rand}`;
}

async function createUniquePaystackReference(
  tx: TxClient,
  tenantId: string,
  schoolCode: string
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const providerReference = makePaystackReference(schoolCode);

    const existing = await tx.paymentIntent.findFirst({
      where: {
        tenantId,
        provider: "PAYSTACK",
        providerReference,
      },
      select: { id: true },
    });

    if (!existing) return providerReference;
  }

  throw new FinanceError(
    "DUPLICATE_PAYMENT_REFERENCE",
    409,
    "Unable to generate a unique Paystack reference."
  );
}

const SENSITIVE_JSON_KEYS = new Set([
  "account_number",
  "accountNumber",
  "mobile_money_number",
  "receiver_bank_account_number",
  "primary_contact_phone",
  "phone",
]);

function redactValueForKey(key: string, value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return value;

  if (
    key === "account_number" ||
    key === "accountNumber" ||
    key === "receiver_bank_account_number"
  ) {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
  }

  if (key === "mobile_money_number" || key === "phone" || key === "primary_contact_phone") {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
  }

  return "[REDACTED]";
}

function scrubSensitiveJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSensitiveJson);

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_JSON_KEYS.has(key)
        ? redactValueForKey(key, val)
        : scrubSensitiveJson(val);
    }

    return out;
  }

  return value;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(scrubSensitiveJson(value ?? {}))) as Prisma.InputJsonValue;
}

function parseProviderPaidAt(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanProviderString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

function cleanProviderNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : NaN;
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

async function createPaymentCreditLedgerEntryOnce(
  tx: TxClient,
  input: {
    tenantId: string;
    invoiceId: string;
    studentId: string;
    feePaymentId: string;
    receiptId: string;
    amountPesewas: number;
    description: string;
    createdByUserId?: string | null;
  }
) {
  const existing = await tx.ledgerEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      feePaymentId: input.feePaymentId,
      entryType: "PAYMENT_CREDIT",
      direction: "CREDIT",
    },
    select: { id: true },
  });

  if (existing) return existing;

  try {
    return await tx.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        studentId: input.studentId,
        feePaymentId: input.feePaymentId,
        receiptId: input.receiptId,
        entryType: "PAYMENT_CREDIT",
        direction: "CREDIT",
        amountPesewas: input.amountPesewas,
        description: input.description,
        journalRef: makeJournalRef("PAY"),
        createdByUserId: input.createdByUserId ?? null,
      },
      select: { id: true },
    });
  } catch (err) {
    if (!isPrismaUniqueConstraintError(err)) throw err;

    const raced = await tx.ledgerEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        feePaymentId: input.feePaymentId,
        entryType: "PAYMENT_CREDIT",
        direction: "CREDIT",
      },
      select: { id: true },
    });

    if (raced) return raced;
    throw err;
  }
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

  if (netDue > 0 && balancePesewas === 0) {
    status = "PAID";
  } else if (totalPaidPesewas > 0) {
    status = "PARTIALLY_PAID";
  }

  return tx.feeInvoice.update({
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
  }, TX_LONG);
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
    throw new FinanceError(
      "PAYMENT_AMOUNT_INVALID",
      400,
      "amountPesewas must be positive."
    );
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

    const recalculatedBefore = await recalculateInvoiceTotals(
      tx,
      tenantId,
      invoiceId
    );

    if (recalculatedBefore.balancePesewas <= 0) {
      throw new FinanceError("INVOICE_ALREADY_CLEARED", 400);
    }

    if (amountPesewas > recalculatedBefore.balancePesewas) {
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
      [invoice.student?.firstName, invoice.student?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Student";

    const guardianPhone =
      invoice.student?.guardianPhoneNorm || invoice.student?.guardianPhone || null;

    const receiptNumber = await createUniqueReceiptNumber(
      tx,
      tenantId,
      tenant.schoolCode
    );

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

    await createPaymentCreditLedgerEntryOnce(tx, {
      tenantId,
      invoiceId,
      studentId: invoice.studentId,
      feePaymentId: payment.id,
      receiptId: receipt.id,
      amountPesewas,
      description: `Payment via ${cleanPaymentMethod}${
        cleanReference ? ` (ref: ${cleanReference})` : ""
      }`,
      createdByUserId: actorUserId,
    });

    const recalculatedAfter = await recalculateInvoiceTotals(
      tx,
      tenantId,
      invoiceId
    );

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
  }, TX_LONG);
}

export async function createParentPaymentIntent(input: {
  tenantId: string;
  studentId: string;
  term: string;
  academicYear: string;
  amountPesewas: number;
  guardianPhoneE164: string;
  guardianSuffix9: string;
}) {
  const {
    tenantId,
    studentId,
    term,
    academicYear,
    amountPesewas,
    guardianPhoneE164,
    guardianSuffix9,
  } = input;

  if (!Number.isFinite(amountPesewas) || amountPesewas < 100) {
    throw new FinanceError(
      "PAYMENT_AMOUNT_INVALID",
      400,
      "amountPesewas must be at least 100."
    );
  }

  return prisma.$transaction(async (tx) => {
    const [tenant, student, settlementAccount] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          schoolCode: true,
          contactEmail: true,
        },
      }),
      tx.student.findFirst({
        where: { id: studentId, tenantId, status: "ACTIVE" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          guardianPhone: true,
          guardianPhoneNorm: true,
          guardianName: true,
        },
      }),
      tx.tenantSettlementAccount.findFirst({
        where: {
          tenantId,
          provider: "PAYSTACK",
          status: "ACTIVE",
          isPrimary: true,
          providerSubaccountCode: { not: null },
        },
        select: {
          id: true,
          providerSubaccountCode: true,
          accountName: true,
          accountNumberLast4: true,
          bankCode: true,
          bankName: true,
          currency: true,
        },
      }),
    ]);

    if (!tenant) throw new FinanceError("TENANT_NOT_FOUND", 404);
    if (!student) throw new FinanceError("STUDENT_NOT_FOUND", 404);

    if (!settlementAccount?.providerSubaccountCode) {
      throw new FinanceError(
        "SETTLEMENT_ACCOUNT_REQUIRED",
        409,
        "This school does not have an active Paystack settlement account yet."
      );
    }

    const studentPhoneNorm = digitsOnlyFinance(
      student.guardianPhoneNorm ?? student.guardianPhone
    );
    const studentPhoneRaw = digitsOnlyFinance(student.guardianPhone);
    const parentDigits = digitsOnlyFinance(guardianPhoneE164);
    const suffix9 = digitsOnlyFinance(guardianSuffix9);
    const parentLast9 = parentDigits.slice(-9);

    const ownsStudent =
      (parentLast9.length >= 7 &&
        (studentPhoneNorm.endsWith(parentLast9) ||
          studentPhoneRaw.endsWith(parentLast9))) ||
      (suffix9.length >= 7 &&
        (studentPhoneNorm.endsWith(suffix9) || studentPhoneRaw.endsWith(suffix9)));

    if (!ownsStudent) {
      throw new FinanceError("FORBIDDEN_STUDENT", 403);
    }

    const invoices = await tx.feeInvoice.findMany({
      where: {
        tenantId,
        studentId,
        term,
        academicYear,
        status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    if (invoices.length === 0) {
      throw new FinanceError("INVOICE_NOT_FOUND", 404);
    }

    let targetInvoice:
      | Awaited<ReturnType<typeof recalculateInvoiceTotals>>
      | null = null;

    let totalOutstandingPesewas = 0;

    for (const inv of invoices) {
      const recalculated = await recalculateInvoiceTotals(tx, tenantId, inv.id);

      if (recalculated.balancePesewas > 0) {
        if (!targetInvoice) targetInvoice = recalculated;
        totalOutstandingPesewas += recalculated.balancePesewas;
      }
    }

    if (!targetInvoice || totalOutstandingPesewas <= 0) {
      throw new FinanceError("INVOICE_ALREADY_CLEARED", 400);
    }

    if (amountPesewas > targetInvoice.balancePesewas) {
      throw new FinanceError(
        "PAYMENT_EXCEEDS_BALANCE",
        400,
        "Amount exceeds the selected invoice balance."
      );
    }

    const providerReference = await createUniquePaystackReference(
      tx,
      tenantId,
      tenant.schoolCode
    );

    const studentName =
      [student.firstName, student.lastName].filter(Boolean).join(" ").trim() ||
      "Student";

    const intent = await tx.paymentIntent.create({
      data: {
        tenantId,
        studentId,
        invoiceId: targetInvoice.id,
        settlementAccountId: settlementAccount.id,
        provider: "PAYSTACK",
        providerReference,
        amountPesewas,
        currency: "GHS",
        status: "PENDING",
        metadata: {
          studentName,
          term,
          academicYear,
          source: "parent_portal",
          settlement: {
            provider: "PAYSTACK",
            settlementAccountId: settlementAccount.id,
            providerSubaccountCode: settlementAccount.providerSubaccountCode,
            accountName: settlementAccount.accountName,
            accountNumberLast4: settlementAccount.accountNumberLast4,
            bankCode: settlementAccount.bankCode,
            bankName: settlementAccount.bankName,
            currency: settlementAccount.currency,
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
        studentId: true,
        invoiceId: true,
        settlementAccountId: true,
        providerReference: true,
        amountPesewas: true,
        currency: true,
        status: true,
      },
    });

    const email =
      tenant.contactEmail?.trim() ||
      `school-${tenantId.slice(0, 8)}@edulifeos.app`;

    return {
      ok: true,
      tenant,
      student,
      studentName,
      intent,
      settlementAccount,
      invoiceId: targetInvoice.id,
      invoiceOutstandingPesewas: targetInvoice.balancePesewas,
      totalOutstandingPesewas,
      email,
    };
  }, TX_LONG);
}

export async function attachGatewayToPaymentIntent(input: {
  tenantId: string;
  providerReference: string;
  checkoutUrl: string;
  accessCode?: string | null;
}) {
  await prisma.paymentIntent.updateMany({
    where: {
      tenantId: input.tenantId,
      provider: "PAYSTACK",
      providerReference: input.providerReference,
    },
    data: {
      checkoutUrl: input.checkoutUrl,
      accessCode: input.accessCode ?? null,
    },
  });
}

export async function markPaymentIntentGatewayFailed(input: {
  tenantId: string;
  providerReference: string;
  reason?: string;
}) {
  await prisma.paymentIntent.updateMany({
    where: {
      tenantId: input.tenantId,
      provider: "PAYSTACK",
      providerReference: input.providerReference,
      status: "PENDING",
    },
    data: {
      status: "FAILED",
      metadata: {
        gatewayFailureReason: input.reason ?? "PAYSTACK_INITIALIZATION_FAILED",
      },
    },
  });
}

export async function recordProviderEventOnly(input: {
  eventType: string;
  providerReference?: string | null;
  signature?: string | null;
  rawPayload: unknown;
  processingStatus?: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";
  processingError?: string | null;
}) {
  const signature = input.signature ?? null;

  try {
    return await prisma.paymentProviderEvent.create({
      data: {
        provider: "PAYSTACK",
        eventType: input.eventType,
        providerReference: input.providerReference ?? null,
        signature,
        rawPayload: toPrismaJson(input.rawPayload),
        processingStatus: input.processingStatus ?? "IGNORED",
        processingError: input.processingError ?? null,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    if (!isPrismaUniqueConstraintError(err) || !signature) throw err;

    const existing = await prisma.paymentProviderEvent.findFirst({
      where: {
        provider: "PAYSTACK",
        signature,
      },
    });

    if (existing) return existing;
    throw err;
  }
}

export async function finalizePaystackChargeSuccess(input: {
  event: Record<string, unknown>;
  signature?: string | null;
}) {
  const data = (input.event.data ?? {}) as Record<string, unknown>;

  const reference = cleanProviderString(data.reference);
  const amountPesewas = cleanProviderNumber(data.amount);
  const currency = (cleanProviderString(data.currency) ?? "GHS").toUpperCase();
  const channel = cleanProviderString(data.channel);
  const providerTransactionId = cleanProviderString(data.id);
  const providerPaidAt = parseProviderPaidAt(data.paid_at);

  if (!reference || !Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    await recordProviderEventOnly({
      eventType: String(input.event.event ?? "charge.success"),
      providerReference: reference,
      signature: input.signature,
      rawPayload: input.event,
      processingStatus: "FAILED",
      processingError: "INVALID_REFERENCE_OR_AMOUNT",
    });

    return {
      ok: true,
      skipped: true,
      reason: "INVALID_REFERENCE_OR_AMOUNT",
    };
  }

  const intentLite = await prisma.paymentIntent.findFirst({
    where: {
      provider: "PAYSTACK",
      providerReference: reference,
    },
    select: {
      id: true,
      tenantId: true,
      invoiceId: true,
      studentId: true,
      settlementAccountId: true,
      amountPesewas: true,
      status: true,
    },
  });

  const providerEvent = await recordProviderEventOnly({
    eventType: String(input.event.event ?? "charge.success"),
    providerReference: reference,
    signature: input.signature,
    rawPayload: input.event,
    processingStatus: "RECEIVED",
  });

  if (!intentLite) {
    await prisma.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: {
        tenantId: null,
        processingStatus: "FAILED",
        processingError: "PAYMENT_INTENT_NOT_FOUND",
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      skipped: true,
      reason: "PAYMENT_INTENT_NOT_FOUND",
    };
  }

  if (providerEvent.tenantId !== intentLite.tenantId) {
    await prisma.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: { tenantId: intentLite.tenantId },
    });
  }

  return prisma.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findFirst({
      where: { id: intentLite.id },
      select: {
        id: true,
        tenantId: true,
        studentId: true,
        invoiceId: true,
        settlementAccountId: true,
        amountPesewas: true,
        status: true,
        providerReference: true,
        settlementAccount: {
          select: {
            id: true,
            providerSubaccountCode: true,
            accountName: true,
            accountNumberLast4: true,
            bankCode: true,
            bankName: true,
            status: true,
            isPrimary: true,
          },
        },
        invoice: {
          select: {
            id: true,
            studentId: true,
            term: true,
            academicYear: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
              },
            },
          },
        },
        tenant: {
          select: {
            name: true,
            schoolCode: true,
          },
        },
      },
    });

    if (!intent) {
      await tx.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingStatus: "FAILED",
          processingError: "PAYMENT_INTENT_NOT_FOUND",
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        skipped: true,
        reason: "PAYMENT_INTENT_NOT_FOUND",
      };
    }

    const existingTransaction = await tx.paymentTransaction.findFirst({
      where: {
        tenantId: intent.tenantId,
        provider: "PAYSTACK",
        providerReference: reference,
      },
      select: { id: true, feePaymentId: true },
    });

    if (existingTransaction) {
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "PAID" },
      });

      await tx.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        alreadyProcessed: true,
        paymentTransactionId: existingTransaction.id,
      };
    }

    const existingPayment = await tx.feePayment.findFirst({
      where: {
        tenantId: intent.tenantId,
        reference,
      },
      select: {
        id: true,
        amountPesewas: true,
      },
    });

    if (existingPayment) {
      const transaction = await tx.paymentTransaction.create({
        data: {
          tenantId: intent.tenantId,
          paymentIntentId: intent.id,
          feePaymentId: existingPayment.id,
          provider: "PAYSTACK",
          providerReference: reference,
          providerTransactionId,
          amountPesewas: existingPayment.amountPesewas,
          currency,
          status: "SUCCESS",
          channel,
          providerPaidAt,
          providerRaw: toPrismaJson({
            ...input.event,
            edulifeSettlementEvidence: {
              settlementAccountId: intent.settlementAccountId,
              providerSubaccountCode:
                intent.settlementAccount?.providerSubaccountCode ?? null,
            },
          }),
        },
        select: { id: true },
      });

      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "PAID" },
      });

      await tx.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        alreadyProcessed: true,
        paymentTransactionId: transaction.id,
        legacyPaymentLinked: true,
      };
    }

    if (amountPesewas !== intent.amountPesewas) {
      await tx.reconciliationException.create({
        data: {
          tenantId: intent.tenantId,
          invoiceId: intent.invoiceId,
          providerReference: reference,
          kind: "AMOUNT_MISMATCH",
          severity: "CRITICAL",
          status: "OPEN",
          expectedPesewas: intent.amountPesewas,
          actualPesewas: amountPesewas,
          deltaPesewas: amountPesewas - intent.amountPesewas,
          description:
            "Paystack webhook amount does not match local PaymentIntent amount. Payment was not credited.",
        },
      });

      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "FAILED" },
      });

      await tx.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingStatus: "FAILED",
          processingError: "PAYMENT_AMOUNT_MISMATCH",
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        skipped: true,
        reason: "PAYMENT_AMOUNT_MISMATCH",
      };
    }

    const invoiceBefore = await recalculateInvoiceTotals(
      tx,
      intent.tenantId,
      intent.invoiceId
    );

    if (invoiceBefore.balancePesewas < amountPesewas) {
      await tx.reconciliationException.create({
        data: {
          tenantId: intent.tenantId,
          invoiceId: intent.invoiceId,
          providerReference: reference,
          kind: "OVERPAYMENT",
          severity: "HIGH",
          status: "OPEN",
          expectedPesewas: invoiceBefore.balancePesewas,
          actualPesewas: amountPesewas,
          deltaPesewas: amountPesewas - invoiceBefore.balancePesewas,
          description:
            "Paystack payment is greater than the current invoice balance. Payment was not credited automatically.",
        },
      });

      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "FAILED" },
      });

      await tx.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingStatus: "FAILED",
          processingError: "PAYMENT_EXCEEDS_BALANCE",
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        skipped: true,
        reason: "PAYMENT_EXCEEDS_BALANCE",
      };
    }

    const transaction = await tx.paymentTransaction.create({
      data: {
        tenantId: intent.tenantId,
        paymentIntentId: intent.id,
        provider: "PAYSTACK",
        providerReference: reference,
        providerTransactionId,
        amountPesewas,
        currency,
        status: "SUCCESS",
        channel,
        providerPaidAt,
        providerRaw: toPrismaJson({
          ...input.event,
          edulifeSettlementEvidence: {
            settlementAccountId: intent.settlementAccountId,
            providerSubaccountCode:
              intent.settlementAccount?.providerSubaccountCode ?? null,
            settlementAccountStatus: intent.settlementAccount?.status ?? null,
            isPrimarySettlementAccount: intent.settlementAccount?.isPrimary ?? null,
          },
        }),
      },
      select: { id: true },
    });

    const payment = await tx.feePayment.create({
      data: {
        tenantId: intent.tenantId,
        invoiceId: intent.invoiceId,
        amountPesewas,
        method: "paystack",
        reference,
        channel,
        status: "SUCCESS",
      },
      select: { id: true },
    });

    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: { feePaymentId: payment.id },
    });

    await tx.paymentAllocation.create({
      data: {
        tenantId: intent.tenantId,
        studentId: intent.studentId,
        invoiceId: intent.invoiceId,
        feePaymentId: payment.id,
        amountPesewas,
        allocationType: "INVOICE_PAYMENT",
      },
    });

    const studentName =
      [intent.invoice.student?.firstName, intent.invoice.student?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Student";

    const guardianPhone =
      intent.invoice.student?.guardianPhoneNorm ||
      intent.invoice.student?.guardianPhone ||
      null;

    const receiptNumber = await createUniqueReceiptNumber(
      tx,
      intent.tenantId,
      intent.tenant.schoolCode
    );

    const receipt = await tx.receipt.create({
      data: {
        tenantId: intent.tenantId,
        invoiceId: intent.invoiceId,
        feePaymentId: payment.id,
        receiptNumber,
        issuedToName: studentName,
        issuedToPhone: guardianPhone,
        note: `Paystack payment reference: ${reference}`,
      },
      select: { id: true, receiptNumber: true },
    });

    await createPaymentCreditLedgerEntryOnce(tx, {
      tenantId: intent.tenantId,
      invoiceId: intent.invoiceId,
      studentId: intent.studentId,
      feePaymentId: payment.id,
      receiptId: receipt.id,
      amountPesewas,
      description: `Paystack online payment (ref: ${reference})`,
      createdByUserId: null,
    });

    const invoiceAfter = await recalculateInvoiceTotals(
      tx,
      intent.tenantId,
      intent.invoiceId
    );

    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "PAID" },
    });

    await tx.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      paymentId: payment.id,
      paymentTransactionId: transaction.id,
      receipt,
      invoice: invoiceAfter,
    };
  }, TX_LONG);
}