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

const DEFAULT_PAYMENT_INTENT_TTL_MINUTES = 30;
const IDEMPOTENCY_LOCK_STALE_MINUTES = 10;
const INVOICE_GENERATION_CHUNK_SIZE = 100;

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

type RecalculatedInvoiceResult = Awaited<
  ReturnType<typeof recalculateInvoiceTotals>
>;

type ManualPaymentResult = {
  ok: true;
  tenantName: string;
  payment: Prisma.FeePaymentGetPayload<Record<string, never>>;
  receipt: Prisma.ReceiptGetPayload<Record<string, never>>;
  invoice: RecalculatedInvoiceResult;
  studentName: string;
  guardianPhone: string | null;
  classLabel: string;
  term: string;
  academicYear: string;
  outstandingPesewas: number;
};

function cleanMethod(method: string | null | undefined): string {
  const m = String(method ?? "cash").trim().toLowerCase();
  if (!m) return "cash";

  const allowed = new Set(["cash", "momo", "bank_transfer", "paystack", "other"]);
  return allowed.has(m) ? m : "other";
}

function cleanPaymentChannel(channel: string | null | undefined): string {
  const c = String(channel ?? "checkout").trim().toLowerCase();

  const allowed = new Set([
    "checkout",
    "ussd",
    "card",
    "mobile_money",
    "bank_transfer",
    "qr",
    "other",
  ]);

  return allowed.has(c) ? c : "other";
}

function cleanPaymentSource(source: string | null | undefined, channel: string): string {
  const s = String(source ?? "").trim().toLowerCase();

  if (s) return s.replace(/[^a-z0-9:_./-]/g, "").slice(0, 80) || "parent_portal";
  if (channel === "ussd") return "paystack_ussd";

  return "parent_portal";
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

  if (
    key === "mobile_money_number" ||
    key === "phone" ||
    key === "primary_contact_phone"
  ) {
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

function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(toPrismaJson(value)))
    .digest("hex");
}

function assertPositiveIntegerPesewas(
  value: unknown,
  code: FinanceErrorCode = "PAYMENT_AMOUNT_INVALID",
  minimum = 1
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  if (!Number.isSafeInteger(n) || n < minimum) {
    throw new FinanceError(code, 400, "Amount must be a positive integer in pesewas.");
  }

  return n;
}

function formatCedisFromPesewas(pesewas: number): string {
  return (Math.max(0, Math.floor(pesewas)) / 100).toFixed(2);
}

function buildInvoicePaymentFor(input: {
  lines?: Array<{
    description: string | null;
    amountPesewas: number | null;
  }> | null;
}) {
  const descriptions =
    input.lines
      ?.map((line) => String(line.description ?? "").trim())
      .filter((description) => {
        const normalized = description.toLowerCase();
        if (!description) return false;
        if (normalized === "legacy invoice total") return false;
        if (normalized.includes("legacy invoice")) return false;
        return true;
      }) ?? [];

  const uniqueDescriptions = Array.from(new Set(descriptions));

  if (uniqueDescriptions.length === 1) return uniqueDescriptions[0];

  if (uniqueDescriptions.length > 1) {
    return uniqueDescriptions.slice(0, 3).join(", ");
  }

  return "school fees";
}

function buildReceiptSmsMessage(input: {
  amountPesewas: number;
  studentName: string;
  classLabel: string;
  term: string;
  academicYear: string;
  receiptNumber: string;
  balancePesewas: number;
  schoolName: string;
  paymentFor: string;
}) {
  return `EduLife OS: GHS ${formatCedisFromPesewas(
    input.amountPesewas
  )} received for ${input.studentName} (${input.classLabel}) as payment for ${
    input.paymentFor
  } - ${input.term} ${input.academicYear}. Receipt: ${
    input.receiptNumber
  }. Balance: GHS ${formatCedisFromPesewas(input.balancePesewas)}. School: ${
    input.schoolName
  }. Keep this SMS as proof.`;
}

async function enqueueReceiptSmsOutbox(
  tx: TxClient,
  input: {
    tenantId: string;
    actorId?: string | null;
    receiptId: string;
    receiptNumber: string;
    feePaymentId: string;
    invoiceId: string;
    to: string | null;
    message: string;
  }
) {
  if (!input.to?.trim()) return null;

  return tx.financeOutboxEvent.upsert({
    where: {
      type_idempotencyKey: {
        type: "SMS_RECEIPT",
        idempotencyKey: `receipt-sms:${input.receiptId}`,
      },
    },
    create: {
      tenantId: input.tenantId,
      type: "SMS_RECEIPT",
      status: "PENDING",
      idempotencyKey: `receipt-sms:${input.receiptId}`,
      aggregateType: "Receipt",
      aggregateId: input.receiptId,
      payload: toPrismaJson({
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        to: input.to,
        message: input.message,
        template: "FEES_RECEIPT",
        receiptId: input.receiptId,
        receiptNumber: input.receiptNumber,
        feePaymentId: input.feePaymentId,
        invoiceId: input.invoiceId,
      }),
      priority: 3,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

function parseProviderDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseProviderPaidAt(value: unknown): Date | null {
  return parseProviderDate(value);
}

function cleanProviderString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

function cleanProviderNumber(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractProviderEventIdFromPayload(event: Record<string, unknown>) {
  const data = isRecord(event.data) ? event.data : {};

  return (
    cleanProviderString(event.id) ||
    cleanProviderString(data.id) ||
    cleanProviderString(data.event_id) ||
    cleanProviderString(data.eventId)
  );
}

function extractProviderEventTimeFromPayload(event: Record<string, unknown>) {
  const data = isRecord(event.data) ? event.data : {};

  return (
    parseProviderDate(data.paid_at) ||
    parseProviderDate(data.paidAt) ||
    parseProviderDate(data.created_at) ||
    parseProviderDate(data.createdAt) ||
    parseProviderDate(data.updated_at) ||
    parseProviderDate(data.updatedAt)
  );
}

async function lockFeeInvoiceForUpdate(
  tx: TxClient,
  tenantId: string,
  invoiceId: string
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id"
    from "FeeInvoice"
    where "id" = ${invoiceId}
      and "tenantId" = ${tenantId}
    for update
  `;

  if (rows.length === 0) {
    throw new FinanceError("INVOICE_NOT_FOUND", 404);
  }
}

async function lockPaymentIntentForUpdate(
  tx: TxClient,
  tenantId: string,
  paymentIntentId: string
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    select "id"
    from "PaymentIntent"
    where "id" = ${paymentIntentId}
      and "tenantId" = ${tenantId}
    for update
  `;

  if (rows.length === 0) {
    throw new FinanceError("PAYMENT_INTENT_NOT_FOUND", 404);
  }
}

async function expireStalePaymentIntents(
  tx: TxClient,
  tenantId: string,
  invoiceId?: string
) {
  await tx.paymentIntent.updateMany({
    where: {
      tenantId,
      ...(invoiceId ? { invoiceId } : {}),
      provider: "PAYSTACK",
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
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
  const amountPesewas = assertPositiveIntegerPesewas(input.amountPesewas);

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
        amountPesewas,
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

async function createInvoiceDebitLedgerEntryOnce(
  tx: TxClient,
  input: {
    tenantId: string;
    invoiceId: string;
    invoiceLineId: string;
    studentId: string;
    amountPesewas: number;
    description: string;
    createdByUserId?: string | null;
  }
) {
  const amountPesewas = assertPositiveIntegerPesewas(
    input.amountPesewas,
    "FEE_STRUCTURE_AMOUNT_INVALID"
  );

  const existing = await tx.ledgerEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      invoiceLineId: input.invoiceLineId,
      entryType: "INVOICE_DEBIT",
      direction: "DEBIT",
    },
    select: { id: true },
  });

  if (existing) return existing;

  try {
    return await tx.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        invoiceLineId: input.invoiceLineId,
        studentId: input.studentId,
        entryType: "INVOICE_DEBIT",
        direction: "DEBIT",
        amountPesewas,
        description: input.description,
        journalRef: makeJournalRef("INV"),
        createdByUserId: input.createdByUserId ?? null,
      },
      select: { id: true },
    });
  } catch (err) {
    if (!isPrismaUniqueConstraintError(err)) throw err;

    const raced = await tx.ledgerEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        invoiceLineId: input.invoiceLineId,
        entryType: "INVOICE_DEBIT",
        direction: "DEBIT",
      },
      select: { id: true },
    });

    if (raced) return raced;
    throw err;
  }
}

async function claimFinanceOperationIdempotency(
  tx: TxClient,
  input: {
    tenantId: string;
    operationType: string;
    idempotencyKey?: string | null;
    requestPayload: unknown;
  }
): Promise<
  | { mode: "NONE" }
  | { mode: "CLAIMED"; id: string; requestHash: string }
  | { mode: "REPLAY"; response: unknown }
> {
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) return { mode: "NONE" };

  const operationType = input.operationType.trim();
  const requestHash = stableHash(input.requestPayload);
  const now = new Date();

  try {
    const row = await tx.financeOperationIdempotency.create({
      data: {
        tenantId: input.tenantId,
        operationType,
        idempotencyKey,
        requestHash,
        lockedAt: now,
      },
      select: {
        id: true,
        requestHash: true,
      },
    });

    return {
      mode: "CLAIMED",
      id: row.id,
      requestHash: row.requestHash ?? requestHash,
    };
  } catch (err) {
    if (!isPrismaUniqueConstraintError(err)) throw err;
  }

  const existing = await tx.financeOperationIdempotency.findUnique({
    where: {
      tenantId_operationType_idempotencyKey: {
        tenantId: input.tenantId,
        operationType,
        idempotencyKey,
      },
    },
    select: {
      id: true,
      requestHash: true,
      responseSnapshot: true,
      lockedAt: true,
      completedAt: true,
    },
  });

  if (!existing) {
    throw new FinanceError("PAYMENT_ALREADY_PROCESSED", 409);
  }

  if (existing.requestHash && existing.requestHash !== requestHash) {
    throw new FinanceError(
      "PAYMENT_ALREADY_PROCESSED",
      409,
      "Idempotency key was reused with a different request payload."
    );
  }

  if (existing.completedAt && existing.responseSnapshot !== null) {
    return {
      mode: "REPLAY",
      response: existing.responseSnapshot,
    };
  }

  const lockAgeMs = existing.lockedAt
    ? Date.now() - existing.lockedAt.getTime()
    : Number.POSITIVE_INFINITY;

  if (lockAgeMs < IDEMPOTENCY_LOCK_STALE_MINUTES * 60_000) {
    throw new FinanceError(
      "PAYMENT_ALREADY_PROCESSED",
      409,
      "A matching finance operation is already in progress."
    );
  }

  const reclaimed = await tx.financeOperationIdempotency.update({
    where: { id: existing.id },
    data: {
      lockedAt: now,
      requestHash,
    },
    select: {
      id: true,
      requestHash: true,
    },
  });

  return {
    mode: "CLAIMED",
    id: reclaimed.id,
    requestHash: reclaimed.requestHash ?? requestHash,
  };
}

async function completeFinanceOperationIdempotency(
  tx: TxClient,
  claim:
    | { mode: "NONE" }
    | { mode: "CLAIMED"; id: string; requestHash: string }
    | { mode: "REPLAY"; response: unknown },
  response: unknown
) {
  if (claim.mode !== "CLAIMED") return;

  await tx.financeOperationIdempotency.update({
    where: { id: claim.id },
    data: {
      responseSnapshot: toPrismaJson(response),
      completedAt: new Date(),
    },
  });
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

  const [lineAgg, adjustmentAgg, paymentAgg, refundAgg] = await Promise.all([
    tx.feeInvoiceLine.aggregate({
      where: { tenantId, invoiceId },
      _sum: { amountPesewas: true, waivedPesewas: true },
    }),
    tx.feeAdjustment.aggregate({
      where: { tenantId, invoiceId, reversedAt: null },
      _sum: { amountPesewas: true },
    }),
    tx.feePayment.aggregate({
      where: {
        tenantId,
        invoiceId,
        status: { in: ["SUCCESS", "REFUNDED"] },
      },
      _sum: { amountPesewas: true },
    }),
    tx.feeRefund.aggregate({
      where: {
        tenantId,
        status: "SUCCEEDED",
        feePayment: { invoiceId },
      },
      _sum: { amountPesewas: true },
    }),
  ]);

  const lineBilled = lineAgg._sum.amountPesewas ?? 0;
  const legacyBilled = invoice.totalBilledPesewas ?? 0;
  const totalBilledPesewas = lineBilled > 0 ? lineBilled : legacyBilled;

  const lineWaived = lineAgg._sum.waivedPesewas ?? 0;
  const adjustmentWaived = adjustmentAgg._sum.amountPesewas ?? 0;
  const totalWaivedPesewas = Math.max(0, lineWaived + adjustmentWaived);

  const grossPaidPesewas = paymentAgg._sum.amountPesewas ?? 0;
  const refundedPesewas = refundAgg._sum.amountPesewas ?? 0;
  const totalPaidPesewas = Math.max(0, grossPaidPesewas - refundedPesewas);

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

  const [classroom, structure, students] = await prisma.$transaction(
    async (tx) => {
      const [classroomRow, structureRow, studentRows] = await Promise.all([
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
        tx.student.findMany({
          where: { tenantId, classroomId, status: "ACTIVE" },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 6000,
        }),
      ]);

      return [classroomRow, structureRow, studentRows] as const;
    },
    TX_LONG
  );

  if (!classroom) throw new FinanceError("CLASSROOM_NOT_FOUND", 404);
  if (!structure) throw new FinanceError("FEE_STRUCTURE_NOT_FOUND", 404);
  if (!structure.isActive) throw new FinanceError("FEE_STRUCTURE_INACTIVE", 409);

  const term = String(structure.term ?? "").trim();
  const academicYear = String(structure.academicYear ?? "").trim();
  const amountPesewas = assertPositiveIntegerPesewas(
    structure.amountPesewas,
    "FEE_STRUCTURE_AMOUNT_INVALID"
  );

  if (!term || !academicYear) {
    throw new FinanceError("FEE_STRUCTURE_MISSING_TERM_OR_YEAR", 409);
  }

  if (students.length === 0) {
    return {
      ok: true,
      totalLearners: 0,
      createdInvoices: 0,
      existingInvoices: 0,
      createdLines: 0,
      existingLines: 0,
      createdLedgers: 0,
      existingLedgers: 0,
      message: "No active learners in this classroom.",
      structure,
    };
  }

  let createdInvoices = 0;
  let existingInvoices = 0;
  let createdLines = 0;
  let existingLines = 0;
  let createdLedgers = 0;
  let existingLedgers = 0;

  for (let i = 0; i < students.length; i += INVOICE_GENERATION_CHUNK_SIZE) {
    const chunk = students.slice(i, i + INVOICE_GENERATION_CHUNK_SIZE);

    const result = await prisma.$transaction(async (tx) => {
      let chunkCreatedInvoices = 0;
      let chunkExistingInvoices = 0;
      let chunkCreatedLines = 0;
      let chunkExistingLines = 0;
      let chunkCreatedLedgers = 0;
      let chunkExistingLedgers = 0;

      for (const student of chunk) {
        let invoice = await tx.feeInvoice.findFirst({
          where: { tenantId, studentId: student.id, term, academicYear },
          select: { id: true },
        });

        if (!invoice) {
          try {
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

            chunkCreatedInvoices++;
          } catch (err) {
            if (!isPrismaUniqueConstraintError(err)) throw err;

            const racedInvoice = await tx.feeInvoice.findFirst({
              where: { tenantId, studentId: student.id, term, academicYear },
              select: { id: true },
            });

            if (!racedInvoice) throw err;

            invoice = racedInvoice;
            chunkExistingInvoices++;
          }
        } else {
          chunkExistingInvoices++;
        }

        await lockFeeInvoiceForUpdate(tx, tenantId, invoice.id);

        const existingLine = await tx.feeInvoiceLine.findFirst({
          where: {
            tenantId,
            invoiceId: invoice.id,
            feeStructureId: structure.id,
          },
          select: { id: true },
        });

        let invoiceLineId = existingLine?.id ?? null;

        if (existingLine) {
          chunkExistingLines++;
        } else {
          try {
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

            invoiceLineId = line.id;
            chunkCreatedLines++;
          } catch (err) {
            if (!isPrismaUniqueConstraintError(err)) throw err;

            const racedLine = await tx.feeInvoiceLine.findFirst({
              where: {
                tenantId,
                invoiceId: invoice.id,
                feeStructureId: structure.id,
              },
              select: { id: true },
            });

            if (!racedLine) throw err;

            invoiceLineId = racedLine.id;
            chunkExistingLines++;
          }
        }

        if (!invoiceLineId) {
          throw new FinanceError(
            "FEE_STRUCTURE_NOT_FOUND",
            409,
            "Unable to resolve invoice line for fee structure."
          );
        }

        const existingLedger = await tx.ledgerEntry.findFirst({
          where: {
            tenantId,
            invoiceId: invoice.id,
            invoiceLineId,
            entryType: "INVOICE_DEBIT",
            direction: "DEBIT",
          },
          select: { id: true },
        });

        if (existingLedger) {
          chunkExistingLedgers++;
        } else {
          await createInvoiceDebitLedgerEntryOnce(tx, {
            tenantId,
            invoiceId: invoice.id,
            invoiceLineId,
            studentId: student.id,
            amountPesewas,
            description: `Invoice charge: ${structure.name}`,
            createdByUserId: actorUserId,
          });

          chunkCreatedLedgers++;
        }

        await recalculateInvoiceTotals(tx, tenantId, invoice.id);
      }

      return {
        chunkCreatedInvoices,
        chunkExistingInvoices,
        chunkCreatedLines,
        chunkExistingLines,
        chunkCreatedLedgers,
        chunkExistingLedgers,
      };
    }, TX_LONG);

    createdInvoices += result.chunkCreatedInvoices;
    existingInvoices += result.chunkExistingInvoices;
    createdLines += result.chunkCreatedLines;
    existingLines += result.chunkExistingLines;
    createdLedgers += result.chunkCreatedLedgers;
    existingLedgers += result.chunkExistingLedgers;
  }

  return {
    ok: true,
    idempotent: true,
    chunked: true,
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
    createdLedgers,
    existingLedgers,
  };
}

export async function recordManualPayment(input: {
  tenantId: string;
  invoiceId: string;
  amountPesewas: number;
  method?: string | null;
  reference?: string | null;
  channel?: string | null;
  actorUserId?: string | null;
  idempotencyKey?: string | null;
}): Promise<ManualPaymentResult> {
  const {
    tenantId,
    invoiceId,
    method,
    reference,
    channel,
    actorUserId = null,
    idempotencyKey = null,
  } = input;

  const amountPesewas = assertPositiveIntegerPesewas(input.amountPesewas);
  const cleanReference = reference?.trim() || null;
  const cleanChannel = channel?.trim() || null;
  const cleanPaymentMethod = cleanMethod(method);

  return prisma.$transaction(async (tx) => {
    const claim = await claimFinanceOperationIdempotency(tx, {
      tenantId,
      operationType: "MANUAL_PAYMENT",
      idempotencyKey,
      requestPayload: {
        tenantId,
        invoiceId,
        amountPesewas,
        method: cleanPaymentMethod,
        reference: cleanReference,
        channel: cleanChannel,
        actorUserId,
      },
    });

        if (claim.mode === "REPLAY") {
      return claim.response as ManualPaymentResult;
    }

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
          lines: {
            select: {
              description: true,
              amountPesewas: true,
            },
            orderBy: { sortOrder: "asc" },
            take: 5,
          },
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

    await lockFeeInvoiceForUpdate(tx, tenantId, invoiceId);

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

    const classLabel =
      invoice.student?.classroom?.name ||
      invoice.student?.classroom?.grade ||
      "Class";

    await enqueueReceiptSmsOutbox(tx, {
      tenantId,
      actorId: actorUserId,
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      feePaymentId: payment.id,
      invoiceId,
      to: guardianPhone,
      message: buildReceiptSmsMessage({
        amountPesewas,
        studentName,
        classLabel,
        term: invoice.term,
        academicYear: invoice.academicYear,
        receiptNumber: receipt.receiptNumber,
        balancePesewas: recalculatedAfter.balancePesewas,
        schoolName: tenant.name,
        paymentFor: buildInvoicePaymentFor({ lines: invoice.lines }),
      }),
    });

    const response: ManualPaymentResult = {
  ok: true,
  tenantName: tenant.name,
      payment,
      receipt,
      invoice: recalculatedAfter,
      studentName,
      guardianPhone,
      classLabel,
      term: invoice.term,
      academicYear: invoice.academicYear,
      outstandingPesewas: recalculatedAfter.balancePesewas,
    };

    await completeFinanceOperationIdempotency(tx, claim, response);

    return response;
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

  /**
   * Payment channel, not provider.
   * Normal parent portal payments use "checkout".
   * Paystack USSD-originated payments use "ussd".
   */
  channel?: string | null;

  /**
   * Audit/source label for metadata.
   * Examples: "parent_portal", "paystack_ussd".
   */
  source?: string | null;
}) {
  const {
    tenantId,
    studentId,
    term,
    academicYear,
    guardianPhoneE164,
    guardianSuffix9,
  } = input;

  const channel = cleanPaymentChannel(input.channel);
  const source = cleanPaymentSource(input.source, channel);

  const amountPesewas = assertPositiveIntegerPesewas(
    input.amountPesewas,
    "PAYMENT_AMOUNT_INVALID",
    100
  );

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
      (parentLast9.length >= 9 &&
        (studentPhoneNorm.endsWith(parentLast9) ||
          studentPhoneRaw.endsWith(parentLast9))) ||
      (suffix9.length >= 9 &&
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
      await lockFeeInvoiceForUpdate(tx, tenantId, inv.id);
      const recalculated = await recalculateInvoiceTotals(tx, tenantId, inv.id);

      if (recalculated.balancePesewas > 0) {
        if (!targetInvoice) targetInvoice = recalculated;
        totalOutstandingPesewas += recalculated.balancePesewas;
      }
    }

    if (!targetInvoice || totalOutstandingPesewas <= 0) {
      throw new FinanceError("INVOICE_ALREADY_CLEARED", 400);
    }

    await expireStalePaymentIntents(tx, tenantId, targetInvoice.id);

    const pendingAgg = await tx.paymentIntent.aggregate({
      where: {
        tenantId,
        invoiceId: targetInvoice.id,
        provider: "PAYSTACK",
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      _sum: { amountPesewas: true },
    });

    const pendingExposurePesewas = pendingAgg._sum.amountPesewas ?? 0;
    const effectiveAvailablePesewas =
      targetInvoice.balancePesewas - pendingExposurePesewas;

    if (amountPesewas > effectiveAvailablePesewas) {
      throw new FinanceError(
        "PAYMENT_EXCEEDS_BALANCE",
        400,
        "Amount exceeds the currently available invoice balance after pending payments."
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

    const expiresAt = new Date(
      Date.now() + DEFAULT_PAYMENT_INTENT_TTL_MINUTES * 60_000
    );

    const intent = await tx.paymentIntent.create({
      data: {
        tenantId,
        studentId,
        invoiceId: targetInvoice.id,
        settlementAccountId: settlementAccount.id,
        provider: "PAYSTACK",
channel,
providerReference,
amountPesewas,
currency: "GHS",
status: "PENDING",
expiresAt,
metadata: toPrismaJson({
  studentName,
  term,
  academicYear,
  source,
  channel,
          expiresAt: expiresAt.toISOString(),
          pendingExposurePesewas,
          effectiveAvailablePesewas,
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
        }),
      },
      select: {
  id: true,
  tenantId: true,
  studentId: true,
  invoiceId: true,
  settlementAccountId: true,
  providerReference: true,
  channel: true,
  amountPesewas: true,
        currency: true,
        status: true,
        expiresAt: true,
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
      pendingExposurePesewas,
      effectiveAvailablePesewas,
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
      status: "PENDING",
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
      metadata: toPrismaJson({
        gatewayFailureReason: input.reason ?? "PAYSTACK_INITIALIZATION_FAILED",
      }),
    },
  });
}

export async function recordProviderEventOnly(input: {
  tenantId?: string | null;
  eventType: string;
  providerReference?: string | null;
  signature?: string | null;
  rawPayload: unknown;
  processingStatus?: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";
  processingError?: string | null;
  eventTime?: Date | null;
  providerEventId?: string | null;
  isSuspicious?: boolean;
  suspiciousReason?: string | null;
}) {
  const eventType = String(input.eventType || "UNKNOWN_EVENT").trim();
  const providerReference = input.providerReference?.trim() || null;
  const signature = input.signature?.trim() || null;
  const providerEventId = input.providerEventId?.trim() || null;

  const rawPayload = toPrismaJson(input.rawPayload);
  const stablePayloadString = JSON.stringify(rawPayload);

  const payloadFingerprint = crypto
    .createHash("sha256")
    .update(stablePayloadString)
    .digest("hex");

  const eventFingerprint = crypto
    .createHash("sha256")
    .update(
      [
        "PAYSTACK",
        eventType,
        providerReference ?? "NO_REFERENCE",
        providerEventId ?? "NO_PROVIDER_EVENT_ID",
        signature ?? payloadFingerprint,
      ].join(":")
    )
    .digest("hex");

  try {
    return await prisma.paymentProviderEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        provider: "PAYSTACK",
        eventType,
        providerReference,
        eventFingerprint,
        providerEventId,
        signature,
        rawPayload,
        eventTime: input.eventTime ?? null,
        processingStatus: input.processingStatus ?? "RECEIVED",
        processingError: input.processingError ?? null,
        processedAt:
          input.processingStatus &&
          ["PROCESSED", "FAILED", "IGNORED"].includes(input.processingStatus)
            ? new Date()
            : null,
        isSuspicious: input.isSuspicious ?? false,
        suspiciousReason: input.suspiciousReason ?? null,
      },
    });
  } catch (err) {
    if (!isPrismaUniqueConstraintError(err)) throw err;

    const existing = await prisma.paymentProviderEvent.findFirst({
      where: {
        OR: [
          { eventFingerprint },
          ...(providerEventId
            ? [{ provider: "PAYSTACK" as const, eventType, providerEventId }]
            : []),
        ],
      },
      select: { id: true },
    });

    if (!existing) throw err;

    return prisma.paymentProviderEvent.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        duplicateCount: { increment: 1 },
        isReplay: true,
        ...(input.isSuspicious
          ? {
              isSuspicious: true,
              suspiciousReason:
                input.suspiciousReason ?? "DUPLICATE_PROVIDER_EVENT_REPLAY",
            }
          : {}),
      },
    });
  }
}

export async function finalizePaystackChargeSuccess(input: {
  event: Record<string, unknown>;
  signature?: string | null;
}) {
  const data = isRecord(input.event.data) ? input.event.data : {};

  const reference = cleanProviderString(data.reference);
  const amountPesewas = cleanProviderNumber(data.amount);
  const currency = (cleanProviderString(data.currency) ?? "GHS").toUpperCase();
  const providerReportedChannel = cleanProviderString(data.channel);
  const providerTransactionId = cleanProviderString(data.id);
  const providerPaidAt = parseProviderPaidAt(data.paid_at);
  const providerEventId = extractProviderEventIdFromPayload(input.event);
  const providerEventTime = extractProviderEventTimeFromPayload(input.event);
  const eventType = String(input.event.event ?? "charge.success");

  if (!reference || !Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    await recordProviderEventOnly({
      eventType,
      providerReference: reference,
      signature: input.signature,
      rawPayload: input.event,
      processingStatus: "FAILED",
      processingError: "INVALID_REFERENCE_OR_AMOUNT",
      providerEventId,
      eventTime: providerEventTime,
      isSuspicious: true,
      suspiciousReason: "INVALID_REFERENCE_OR_AMOUNT",
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
    tenantId: intentLite?.tenantId ?? null,
    eventType,
    providerReference: reference,
    signature: input.signature,
    rawPayload: input.event,
    processingStatus: "RECEIVED",
    providerEventId,
    eventTime: providerEventTime,
  });

  if (!intentLite) {
    await prisma.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: {
        tenantId: null,
        processingStatus: "FAILED",
        processingError: "PAYMENT_INTENT_NOT_FOUND",
        processedAt: new Date(),
        isSuspicious: true,
        suspiciousReason: "PAYMENT_INTENT_NOT_FOUND",
      },
    });

    return {
      ok: true,
      skipped: true,
      reason: "PAYMENT_INTENT_NOT_FOUND",
    };
  }

  return prisma.$transaction(async (tx: TxClient) => {
    await lockPaymentIntentForUpdate(tx, intentLite.tenantId, intentLite.id);
    await lockFeeInvoiceForUpdate(tx, intentLite.tenantId, intentLite.invoiceId);

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
        channel: true,
        expiresAt: true,
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
            lines: {
              select: {
                description: true,
                amountPesewas: true,
              },
              orderBy: { sortOrder: "asc" },
              take: 5,
            },
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                  },
                },
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

    const settledChannel = providerReportedChannel ?? intent.channel ?? null;
    const settledMethod = settledChannel === "ussd" ? "paystack_ussd" : "paystack";

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
          tenantId: intent.tenantId,
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
          channel: settledChannel,
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
          tenantId: intent.tenantId,
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
          tenantId: intent.tenantId,
          processingStatus: "FAILED",
          processingError: "PAYMENT_AMOUNT_MISMATCH",
          processedAt: new Date(),
          isSuspicious: true,
          suspiciousReason: "PAYMENT_AMOUNT_MISMATCH",
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
          tenantId: intent.tenantId,
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
        channel: settledChannel,
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
        method: settledMethod,
        reference,
        channel: settledChannel,
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

    const classLabel =
      intent.invoice.student?.classroom?.name ||
      intent.invoice.student?.classroom?.grade ||
      "Class";

    await enqueueReceiptSmsOutbox(tx, {
      tenantId: intent.tenantId,
      actorId: null,
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      feePaymentId: payment.id,
      invoiceId: intent.invoiceId,
      to: guardianPhone,
      message: buildReceiptSmsMessage({
        amountPesewas,
        studentName,
        classLabel,
        term: intent.invoice.term,
        academicYear: intent.invoice.academicYear,
        receiptNumber: receipt.receiptNumber,
        balancePesewas: invoiceAfter.balancePesewas,
        schoolName: intent.tenant.name,
        paymentFor: buildInvoicePaymentFor({ lines: intent.invoice.lines }),
      }),
    });

    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "PAID" },
    });

    await tx.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: {
        tenantId: intent.tenantId,
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