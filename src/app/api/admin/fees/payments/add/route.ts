// src/app/api/admin/fees/payments/add/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { FinanceError, recordManualPayment } from "@/lib/finance/core";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

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

function parseAmountPesewas(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : NaN;
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
  const ipLimit = await checkRateLimit({
    scope: "admin_manual_payment_ip",
    keyParts: [getClientIp(req)],
    limit: 60,
    windowSeconds: 60,
    blockSeconds: 300,
    metadata: { route: "/api/admin/fees/payments/add" },
  });

  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const userLimit = await checkRateLimit({
    scope: "admin_manual_payment_user",
    keyParts: [tenantId, auth.ctx.userId],
    limit: 25,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: {
      route: "/api/admin/fees/payments/add",
      tenantId,
      userId: auth.ctx.userId,
    },
  });

  if (!userLimit.ok) return rateLimitResponse(userLimit);

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
  const amountPesewas = parseAmountPesewas(body.amountPesewas);

  if (!invoiceId) {
    return jsonNoStore({ ok: false, error: "invoiceId is required." }, 400);
  }

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return jsonNoStore(
      { ok: false, error: "amountPesewas must be a positive integer in pesewas." },
      400
    );
  }

  const invoiceLimit = await checkRateLimit({
    scope: "admin_manual_payment_invoice",
    keyParts: [tenantId, invoiceId, auth.ctx.userId],
    limit: 8,
    windowSeconds: 60,
    blockSeconds: 900,
    metadata: {
      route: "/api/admin/fees/payments/add",
      tenantId,
      userId: auth.ctx.userId,
      invoiceId,
      amountPesewas,
    },
  });

  if (!invoiceLimit.ok) return rateLimitResponse(invoiceLimit);

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
      idempotencyKey,
    });

    let smsDispatch:
      | Awaited<ReturnType<typeof runFinanceOutboxWorker>>
      | { skipped: true; error: string };

    try {
      smsDispatch = await runFinanceOutboxWorker({
        workerId: `manual-payment:${auth.ctx.userId}`,
        limit: 5,
        types: [FinanceOutboxEventType.SMS_RECEIPT],
      });
    } catch (err) {
      smsDispatch = {
        skipped: true,
        error: err instanceof Error ? err.message : String(err),
      };
      console.error("[MANUAL_PAYMENT_SMS_OUTBOX_DRAIN_ERROR]", err);
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
        smsDispatch,
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