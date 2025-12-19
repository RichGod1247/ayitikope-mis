// src/app/api/admin/fees/payments/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CreatePaymentBody = {
  tenantId?: string;
  invoiceId?: string;
  amountPesewas?: number;
  method?: string;
  reference?: string;
  channel?: string;
};

export async function POST(req: Request) {
  let body: CreatePaymentBody;

  try {
    body = (await req.json()) as CreatePaymentBody;
  } catch (err) {
    console.error("[ADMIN_FEE_PAYMENTS_CREATE_ERROR] Invalid JSON body", err);
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const tenantId = (body.tenantId || "").trim();
  const invoiceId = (body.invoiceId || "").trim();

  // amountPesewas should be a number (e.g. 15000 for GH₵150.00)
  const amountPesewas =
    typeof body.amountPesewas === "number" ? body.amountPesewas : NaN;

  const method = (body.method || "cash").trim();
  const reference =
    typeof body.reference === "string" && body.reference.trim().length > 0
      ? body.reference.trim()
      : null;
  const channel =
    typeof body.channel === "string" && body.channel.trim().length > 0
      ? body.channel.trim()
      : null;

  // -----------------------
  // Basic validation
  // -----------------------
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }

  if (!invoiceId) {
    return NextResponse.json(
      { ok: false, error: "invoiceId is required." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "amountPesewas must be a positive number (amount in pesewas, e.g. 15000 for GH₵150.00).",
      },
      { status: 400 }
    );
  }

  try {
    // Use "any" to be robust against Prisma type changes
    const client = prisma as any;

    // 1) Find the invoice and ensure it belongs to this tenant
    const invoice = await client.feeInvoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invoice not found for this school. Please refresh and try again.",
        },
        { status: 404 }
      );
    }

    const billed = invoice.totalBilledPesewas ?? 0;
    const waived = invoice.totalWaivedPesewas ?? 0;

    // 2) Load existing payments for this invoice to compute current balance
    const existingPayments = await client.feePayment.findMany({
      where: {
        tenantId,
        invoiceId,
      },
      select: {
        amountPesewas: true,
      },
    });

    const alreadyPaid = existingPayments.reduce(
      (sum: number, p: { amountPesewas: number | null }) =>
        sum + (p.amountPesewas ?? 0),
      0
    );

    const currentBalance = billed - waived - alreadyPaid;

    if (currentBalance <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This invoice is already fully cleared. No further payments are needed.",
        },
        { status: 400 }
      );
    }

    if (amountPesewas > currentBalance) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Payment amount is larger than the remaining balance. Please adjust the amount.",
        },
        { status: 400 }
      );
    }

    // 3) Create the payment record
    const payment = await client.feePayment.create({
      data: {
        tenantId,
        invoiceId,
        amountPesewas,
        method,
        reference,
        channel,
        // paidAt & createdAt use defaults from the Prisma model
      },
    });

    return NextResponse.json(
      {
        ok: true,
        payment,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[ADMIN_FEE_PAYMENTS_CREATE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to record payment. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
