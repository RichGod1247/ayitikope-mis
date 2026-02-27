// src/app/api/admin/fees/payments/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

type CreatePaymentBody = {
  tenantId?: string; // back-compat only (must match session)
  invoiceId?: string;
  amountPesewas?: number;
  method?: string;
  reference?: string;
  channel?: string;
};

export async function POST(req: Request) {
  // ✅ API auth (never redirects)
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  let body: CreatePaymentBody;
  try {
    body = (await req.json()) as CreatePaymentBody;
  } catch (err) {
    console.error("[ADMIN_FEE_PAYMENTS_CREATE_ERROR] Invalid JSON body", err);
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  // Back-compat tenantId must match session
  const guard = assertNoTenantOverride(body?.tenantId ?? null, tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const invoiceId = String(body.invoiceId ?? "").trim();

  const amountPesewasRaw = body.amountPesewas;
  const amountPesewas =
    typeof amountPesewasRaw === "number" && Number.isFinite(amountPesewasRaw)
      ? Math.floor(amountPesewasRaw)
      : NaN;

  const method = String(body.method ?? "cash").trim() || "cash";
  const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
  const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : null;

  if (!invoiceId) return jsonNoStore({ ok: false, error: "invoiceId is required." }, 400);

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return jsonNoStore(
      { ok: false, error: "amountPesewas must be a positive integer (pesewas). Example: 15000 for GH₵150.00." },
      400
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: { id: true, totalBilledPesewas: true, totalWaivedPesewas: true },
      });

      if (!invoice) {
        return { ok: false as const, status: 404, error: "INVOICE_NOT_FOUND" };
      }

      const agg = await tx.feePayment.aggregate({
        where: { tenantId, invoiceId },
        _sum: { amountPesewas: true },
      });

      const billed = invoice.totalBilledPesewas ?? 0;
      const waived = invoice.totalWaivedPesewas ?? 0;
      const alreadyPaid = agg._sum.amountPesewas ?? 0;

      const currentBalance = billed - waived - alreadyPaid;

      if (currentBalance <= 0) {
        return { ok: false as const, status: 400, error: "INVOICE_ALREADY_CLEARED" };
      }

      if (amountPesewas > currentBalance) {
        return { ok: false as const, status: 400, error: "PAYMENT_EXCEEDS_BALANCE" };
      }

      const payment = await tx.feePayment.create({
        data: {
          tenantId,
          invoiceId,
          amountPesewas,
          method,
          reference,
          channel,
        },
      });

      return { ok: true as const, status: 201, payment };
    });

    if (!result.ok) return jsonNoStore({ ok: false, error: result.error }, result.status);
    return jsonNoStore({ ok: true, payment: result.payment }, 201);
  } catch (err) {
    console.error("[ADMIN_FEE_PAYMENTS_CREATE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_RECORD_PAYMENT" }, 500);
  }
}
