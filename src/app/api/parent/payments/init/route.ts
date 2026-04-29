// src/app/api/parent/payments/init/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import {
  attachGatewayToPaymentIntent,
  createParentPaymentIntent,
  FinanceError,
  markPaymentIntentGatewayFailed,
} from "@/lib/finance/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

type Body = {
  studentId?: string;
  term?: string;
  academicYear?: string;
  amountPesewas?: number;
};

export async function POST(req: NextRequest) {
  try {
    const gate = requireParentSession(
      req as Parameters<typeof requireParentSession>[0]
    );

    if (!gate.ok) return gate.res as NextResponse;

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

    if (!paystackSecret) {
      console.error("[PARENT_PAYMENT_INIT] PAYSTACK_SECRET_KEY not set");
      return noStore(500, {
        ok: false,
        error: "PAYMENT_SERVICE_NOT_CONFIGURED",
      });
    }

    const appUrl = (
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      ""
    ).replace(/\/$/, "");

    if (!appUrl) {
      console.error("[PARENT_PAYMENT_INIT] APP URL not configured");
      return noStore(500, {
        ok: false,
        error: "APP_URL_NOT_CONFIGURED",
      });
    }

    const ct = req.headers.get("content-type") ?? "";

    if (!ct.toLowerCase().includes("application/json")) {
      return noStore(415, {
        ok: false,
        error: "CONTENT_TYPE_MUST_BE_JSON",
      });
    }

    let body: Body;

    try {
      body = (await req.json()) as Body;
    } catch {
      return noStore(400, { ok: false, error: "INVALID_JSON" });
    }

    const studentId = String(body.studentId ?? "").trim();
    const term = String(body.term ?? "").trim();
    const academicYear = String(body.academicYear ?? "").trim();

    const amountRaw = body.amountPesewas;
    const amountPesewas =
      typeof amountRaw === "number" && Number.isFinite(amountRaw)
        ? Math.floor(amountRaw)
        : NaN;

    if (!studentId) {
      return noStore(400, { ok: false, error: "STUDENT_ID_REQUIRED" });
    }

    if (!term) {
      return noStore(400, { ok: false, error: "TERM_REQUIRED" });
    }

    if (!academicYear) {
      return noStore(400, { ok: false, error: "ACADEMIC_YEAR_REQUIRED" });
    }

    const sess = gate.session;

    const intentResult = await createParentPaymentIntent({
      tenantId: sess.tenantId,
      studentId,
      term,
      academicYear,
      amountPesewas,
      guardianPhoneE164: String(sess.guardianPhoneE164 ?? ""),
      guardianSuffix9: digitsOnly(sess.guardianSuffix9 ?? ""),
    });

    const callbackUrl = `${appUrl}/parent/fees/payment-callback?ref=${encodeURIComponent(
      intentResult.intent.providerReference
    )}`;

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: intentResult.intent.amountPesewas,
        email: intentResult.email,
        reference: intentResult.intent.providerReference,
        currency: "GHS",
        callback_url: callbackUrl,
        metadata: {
          paymentIntentId: intentResult.intent.id,
          invoiceId: intentResult.intent.invoiceId,
          tenantId: intentResult.intent.tenantId,
          studentId: intentResult.intent.studentId,
          studentName: intentResult.studentName,
          term,
          academicYear,
          source: "parent_portal",
        },
      }),
    });

    if (!psRes.ok) {
      const raw = await psRes.text().catch(() => "");

      await markPaymentIntentGatewayFailed({
        tenantId: intentResult.intent.tenantId,
        providerReference: intentResult.intent.providerReference,
        reason: `PAYSTACK_HTTP_${psRes.status}`,
      });

      console.error("[PAYSTACK_INIT_HTTP_ERROR]", psRes.status, raw);

      return noStore(502, {
        ok: false,
        error: "PAYMENT_GATEWAY_FAILED",
      });
    }

    const psData = (await psRes.json()) as {
      status: boolean;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    };

    if (!psData.status || !psData.data?.authorization_url) {
      await markPaymentIntentGatewayFailed({
        tenantId: intentResult.intent.tenantId,
        providerReference: intentResult.intent.providerReference,
        reason: "PAYSTACK_BAD_RESPONSE",
      });

      console.error("[PAYSTACK_INIT_BAD_RESPONSE]", psData);

      return noStore(502, {
        ok: false,
        error: "PAYMENT_GATEWAY_FAILED",
      });
    }

    const returnedReference = String(psData.data.reference ?? "").trim();

    if (
      returnedReference &&
      returnedReference !== intentResult.intent.providerReference
    ) {
      await markPaymentIntentGatewayFailed({
        tenantId: intentResult.intent.tenantId,
        providerReference: intentResult.intent.providerReference,
        reason: "PAYSTACK_REFERENCE_MISMATCH",
      });

      console.error("[PAYSTACK_INIT_REFERENCE_MISMATCH]", {
        local: intentResult.intent.providerReference,
        paystack: returnedReference,
      });

      return noStore(502, {
        ok: false,
        error: "PAYMENT_GATEWAY_REFERENCE_MISMATCH",
      });
    }

    await attachGatewayToPaymentIntent({
      tenantId: intentResult.intent.tenantId,
      providerReference: intentResult.intent.providerReference,
      checkoutUrl: psData.data.authorization_url,
      accessCode: psData.data.access_code ?? null,
    });

    return noStore(200, {
      ok: true,
      authorization_url: psData.data.authorization_url,
      access_code: psData.data.access_code,
      reference: intentResult.intent.providerReference,
      paymentIntentId: intentResult.intent.id,
      amountPesewas: intentResult.intent.amountPesewas,
      invoiceId: intentResult.intent.invoiceId,
      invoiceOutstandingPesewas: intentResult.invoiceOutstandingPesewas,
      totalOutstandingPesewas: intentResult.totalOutstandingPesewas,
    });
  } catch (err) {
    if (err instanceof FinanceError) {
      return noStore(err.status, { ok: false, error: err.code });
    }

    console.error("[PARENT_PAYMENT_INIT_ERROR]", err);

    return noStore(500, {
      ok: false,
      error: "FAILED_TO_INITIALIZE_PAYMENT",
    });
  }
}