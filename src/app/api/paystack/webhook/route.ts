// src/app/api/paystack/webhook/route.ts
// Idempotent handler: uses FeePayment.reference to prevent double-credit.
// Never credit the same Paystack reference twice.
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function generateReceiptNumber(schoolCode: string): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hex = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-${yyyymmdd}-${hex}`;
}

export async function POST(req: NextRequest) {
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET) {
    console.error("[PAYSTACK_WEBHOOK] PAYSTACK_SECRET_KEY not set");
    return json(500, { error: "Server misconfiguration" });
  }

  // Must read raw body before any .json() call
  const rawBody = await req.text();
  const sig = req.headers.get("x-paystack-signature") ?? "";

  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  if (!sig || sig !== expected) {
    console.warn("[PAYSTACK_WEBHOOK] Invalid HMAC signature");
    return json(400, { error: "Invalid signature" });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  // Only handle successful charges; acknowledge everything else
  if (event.event !== "charge.success") {
    return json(200, { ok: true, message: `Event '${event.event}' acknowledged` });
  }

  const data = (event.data ?? {}) as Record<string, unknown>;
  const reference = String(data.reference ?? "").trim();
  const amountPesewas =
    typeof data.amount === "number" && Number.isFinite(data.amount) ? Math.floor(data.amount) : NaN;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const invoiceId = String(metadata.invoiceId ?? "").trim();
  const tenantId = String(metadata.tenantId ?? "").trim();
  const studentId = String(metadata.studentId ?? "").trim();

  if (!reference || !invoiceId || !tenantId || !Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    console.error("[PAYSTACK_WEBHOOK] Missing required metadata", { reference, invoiceId, tenantId, amountPesewas });
    // Return 200 so Paystack stops retrying — this was our bad data
    return json(200, { ok: true, message: "Incomplete metadata — event skipped" });
  }

  // ── IDEMPOTENCY GATE ──────────────────────────────────────────────────────
  // If a FeePayment with this reference already exists, we already processed it.
  const existing = await prisma.feePayment.findFirst({
    where: { tenantId, reference },
    select: { id: true },
  });
  if (existing) {
    console.log("[PAYSTACK_WEBHOOK] Duplicate reference — skipping:", reference);
    return json(200, { ok: true, message: "Already processed" });
  }

  // Load invoice and tenant for receipt generation
  const [invoice, tenant] = await Promise.all([
    prisma.feeInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            guardianPhone: true,
            guardianPhoneNorm: true,
          },
        },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schoolCode: true, name: true },
    }),
  ]);

  if (!invoice || !tenant) {
    console.error("[PAYSTACK_WEBHOOK] Invoice or tenant not found", { invoiceId, tenantId });
    return json(200, { ok: true, message: "Invoice not found — skipped" });
  }

  // Verify payment does not exceed the current outstanding balance
  const paidAgg = await prisma.feePayment.aggregate({
    where: { tenantId, invoiceId },
    _sum: { amountPesewas: true },
  });
  const billed = invoice.totalBilledPesewas ?? 0;
  const waived = invoice.totalWaivedPesewas ?? 0;
  const alreadyPaid = paidAgg._sum.amountPesewas ?? 0;
  const balance = billed - waived - alreadyPaid;

  if (balance <= 0) {
    console.warn("[PAYSTACK_WEBHOOK] Invoice already cleared — reference:", reference);
    return json(200, { ok: true, message: "Invoice already cleared" });
  }

  const creditAmount = Math.min(amountPesewas, balance);
  const studentName = [invoice.student?.firstName, invoice.student?.lastName]
    .filter(Boolean).join(" ").trim() || "Student";
  const guardianPhone = invoice.student?.guardianPhoneNorm || invoice.student?.guardianPhone || null;
  const receiptNumber = generateReceiptNumber(tenant.schoolCode);
  const channel = typeof data.channel === "string" ? data.channel : null;

  // ── ATOMIC WRITE ──────────────────────────────────────────────────────────
  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.create({
        data: {
          tenantId,
          invoiceId,
          amountPesewas: creditAmount,
          method: "paystack",
          reference,
          channel,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          tenantId,
          invoiceId,
          feePaymentId: payment.id,
          receiptNumber,
          issuedToName: studentName,
          issuedToPhone: guardianPhone,
          // No issuedByUserId — Paystack payments are system-issued
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
          amountPesewas: creditAmount,
          description: `Paystack online payment (ref: ${reference})`,
        },
      });
    });

    console.log("[PAYSTACK_WEBHOOK] Payment recorded:", {
      reference,
      amountPesewas: creditAmount,
      invoiceId,
      tenantId,
    });
    return json(200, { ok: true });
  } catch (err) {
    console.error("[PAYSTACK_WEBHOOK_TXN_ERROR]", err);
    // Return 500 so Paystack retries — but our idempotency gate will stop double-credit
    return json(500, { error: "Transaction failed — will retry" });
  }
}
