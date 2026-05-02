// src/app/api/admin/fees/payments/add/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { sendSms } from "@/lib/sms";
import { FinanceError, recordManualPayment } from "@/lib/finance/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type Body = {
  tenantId?: string;
  invoiceId?: string;
  invoice?: string;
  amountPesewas?: number;
  method?: string;
  reference?: string;
  channel?: string;
  idempotencyKey?: string;
};

function cleanOptional(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function normalizeIdempotencyKey(value: unknown) {
  const raw = cleanOptional(value);
  if (!raw) return null;

  const normalized = raw.replace(/[^a-zA-Z0-9:_./-]/g, "").slice(0, 120);
  return normalized || null;
}

function makeManualPaymentIdempotencyReference(input: {
  tenantId: string;
  invoiceId: string;
  amountPesewas: number;
  method?: string | null;
  idempotencyKey: string;
}) {
  const digest = crypto
    .createHash("sha256")
    .update(
      [
        "manual-payment",
        input.tenantId,
        input.invoiceId,
        String(input.amountPesewas),
        String(input.method ?? "cash").trim().toLowerCase(),
        input.idempotencyKey,
      ].join(":")
    )
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();

  return `MANUAL-IDEMP-${digest}`;
}

export async function POST(req: NextRequest) {
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const guard = assertNoTenantOverride(body?.tenantId ?? null, tenantId);
  if (!guard.ok) {
    return jsonNoStore({ ok: false, error: guard.error }, guard.status);
  }

  const invoiceId = String(body.invoiceId ?? body.invoice ?? "").trim();
  const amountRaw = body.amountPesewas;
  const amountPesewas =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? Math.floor(amountRaw)
      : NaN;

  if (!invoiceId) {
    return jsonNoStore({ ok: false, error: "invoiceId is required." }, 400);
  }

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return jsonNoStore(
      { ok: false, error: "amountPesewas must be a positive integer in pesewas." },
      400
    );
  }

  const explicitReference = cleanOptional(body.reference);
  const idempotencyKey = normalizeIdempotencyKey(
    req.headers.get("x-idempotency-key") ?? body.idempotencyKey
  );

  const reference =
    explicitReference ??
    (idempotencyKey
      ? makeManualPaymentIdempotencyReference({
          tenantId,
          invoiceId,
          amountPesewas,
          method: body.method,
          idempotencyKey,
        })
      : undefined);

  try {
    const result = await recordManualPayment({
      tenantId,
      invoiceId,
      amountPesewas,
      method: body.method,
      reference,
      channel: body.channel,
      actorUserId: auth.ctx.userId,
    });

    if (result.guardianPhone) {
      const amountCedis = (amountPesewas / 100).toFixed(2);
      const outstandingCedis = (result.outstandingPesewas / 100).toFixed(2);

      const smsBody =
        `EduLife OS: Payment of GHS ${amountCedis} received for ${result.studentName} ` +
        `(${result.classLabel}) - ${result.term} ${result.academicYear}. ` +
        `Receipt: ${result.receipt.receiptNumber}. Balance: GHS ${outstandingCedis}. ` +
        `School: ${result.tenantName}. Keep this SMS as proof.`;

      sendSms({
        tenantId,
        actorId: auth.ctx.userId,
        to: result.guardianPhone,
        message: smsBody,
        template: "payment_receipt",
        payload: {
          receiptNumber: result.receipt.receiptNumber,
          amountPesewas,
          invoiceId,
          outstandingPesewas: result.outstandingPesewas,
          idempotencyKey: idempotencyKey ?? null,
        },
      }).catch((err) => console.error("[PAYMENT_SMS_ERROR]", err));
    }

    return jsonNoStore(
      {
        ok: true,
        idempotent: Boolean(idempotencyKey),
        payment: result.payment,
        receipt: {
          id: result.receipt.id,
          receiptNumber: result.receipt.receiptNumber,
          issuedAt: result.receipt.issuedAt,
        },
        invoice: result.invoice,
        outstandingPesewas: result.outstandingPesewas,
      },
      201
    );
  } catch (err) {
    if (err instanceof FinanceError) {
      return jsonNoStore({ ok: false, error: err.code }, err.status);
    }

    console.error("[ADMIN_FEES_PAYMENT_ADD_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_RECORD_PAYMENT" }, 500);
  }
}