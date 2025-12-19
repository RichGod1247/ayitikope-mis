// src/app/api/admin/fees/payments/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const {
      tenantId,
      invoiceId: rawInvoiceId,
      invoice, // fallback if some old client sent `invoice` instead of `invoiceId`
      amountPesewas,
      method,
      reference,
      channel,
    } = body;

    const invoiceId = rawInvoiceId ?? invoice;

    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Invoice is required." },
        { status: 400 }
      );
    }

    const amountNumber = Number(amountPesewas);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return NextResponse.json(
        { ok: false, error: "A positive amountPesewas is required." },
        { status: 400 }
      );
    }

    // Make sure the invoice exists and belongs to this tenant
    const invoiceRecord = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, tenantId: true },
    });

    if (!invoiceRecord || invoiceRecord.tenantId !== tenantId) {
      return NextResponse.json(
        { ok: false, error: "Invoice not found for this school." },
        { status: 404 }
      );
    }

    await prisma.feePayment.create({
      data: {
        tenantId,
        invoiceId,
        amountPesewas: Math.round(amountNumber),
        method: method || "cash",
        reference: reference || null,
        channel: channel || "office",
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[ADMIN_FEES_PAYMENT_ADD_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unexpected error while recording payment. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
