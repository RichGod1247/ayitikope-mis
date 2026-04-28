// src/app/api/parent/payments/init/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function generateRef(schoolCode: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-PAY-${ts}-${rand}`;
}

type Body = {
  studentId?: string;
  term?: string;
  academicYear?: string;
  amountPesewas?: number;
};

export async function POST(req: NextRequest) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const ct = req.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) {
      return noStore(415, { ok: false, error: "Content-Type must be application/json" });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return noStore(400, { ok: false, error: "Invalid JSON body" });
    }

    const studentId = String(body.studentId ?? "").trim();
    const term = String(body.term ?? "").trim();
    const academicYear = String(body.academicYear ?? "").trim();
    const amountRaw = body.amountPesewas;
    const amountPesewas =
      typeof amountRaw === "number" && Number.isFinite(amountRaw) ? Math.floor(amountRaw) : NaN;

    if (!studentId) return noStore(400, { ok: false, error: "studentId is required" });
    if (!term) return noStore(400, { ok: false, error: "term is required" });
    if (!academicYear) return noStore(400, { ok: false, error: "academicYear is required" });
    if (!Number.isFinite(amountPesewas) || amountPesewas < 100) {
      return noStore(400, { ok: false, error: "amountPesewas must be at least 100 (GH₵1.00)" });
    }

    // Verify student belongs to this parent (phone match)
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        guardianName: true,
      },
    });

    if (!student) return noStore(404, { ok: false, error: "Student not found" });

    const sNorm = digitsOnly(student.guardianPhoneNorm ?? student.guardianPhone ?? "");
    const sRaw = digitsOnly(student.guardianPhone ?? "");
    const parentDigits = digitsOnly(e164);
    const ownsStudent =
      (parentDigits && (sNorm.endsWith(parentDigits.slice(-9)) || sRaw.endsWith(parentDigits.slice(-9)))) ||
      (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)));

    if (!ownsStudent) return noStore(403, { ok: false, error: "Forbidden" });

    // Find the earliest invoice with an outstanding balance for this term
    const invoices = await prisma.feeInvoice.findMany({
      where: { tenantId, studentId, term, academicYear },
      select: { id: true, totalBilledPesewas: true, totalWaivedPesewas: true },
      orderBy: { createdAt: "asc" },
    });

    if (!invoices.length) {
      return noStore(404, { ok: false, error: "No invoices found for this student and term" });
    }

    // Find the first invoice with outstanding balance
    let targetInvoiceId: string | null = null;
    let totalOutstanding = 0;

    for (const inv of invoices) {
      const paidAgg = await prisma.feePayment.aggregate({
        where: { tenantId, invoiceId: inv.id },
        _sum: { amountPesewas: true },
      });
      const paid = paidAgg._sum.amountPesewas ?? 0;
      const balance = (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0) - paid;
      if (balance > 0) {
        if (!targetInvoiceId) targetInvoiceId = inv.id;
        totalOutstanding += balance;
      }
    }

    if (!targetInvoiceId || totalOutstanding <= 0) {
      return noStore(400, { ok: false, error: "Invoice is already fully cleared" });
    }

    if (amountPesewas > totalOutstanding) {
      return noStore(400, {
        ok: false,
        error: `Amount (${amountPesewas}) exceeds outstanding balance (${totalOutstanding} pesewas)`,
      });
    }

    const [tenant] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, schoolCode: true, contactEmail: true },
      }),
    ]);

    if (!tenant) return noStore(404, { ok: false, error: "Tenant not found" });

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      console.error("[PARENT_PAYMENT_INIT] PAYSTACK_SECRET_KEY not set");
      return noStore(500, { ok: false, error: "Payment service is not configured" });
    }

    const APP_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const paystackRef = generateRef(tenant.schoolCode);
    const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Student";
    const callbackUrl = `${APP_URL}/parent/fees/payment-callback?ref=${paystackRef}`;

    // Email: Paystack requires an email; use contact email or a stable internal placeholder
    const email =
      tenant.contactEmail?.trim() ||
      `school-${tenantId.slice(0, 8)}@edulifeos.app`;

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPesewas,
        email,
        reference: paystackRef,
        currency: "GHS",
        callback_url: callbackUrl,
        metadata: {
          invoiceId: targetInvoiceId,
          tenantId,
          studentId,
          studentName,
          term,
          academicYear,
        },
      }),
    });

    if (!psRes.ok) {
      const raw = await psRes.text().catch(() => "");
      console.error("[PAYSTACK_INIT_HTTP_ERROR]", psRes.status, raw);
      return noStore(502, { ok: false, error: "Payment gateway initialization failed" });
    }

    const psData = (await psRes.json()) as {
      status: boolean;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };

    if (!psData.status || !psData.data?.authorization_url) {
      console.error("[PAYSTACK_INIT_BAD_RESPONSE]", psData);
      return noStore(502, { ok: false, error: "Unexpected response from payment gateway" });
    }

    return noStore(200, {
      ok: true,
      authorization_url: psData.data.authorization_url,
      access_code: psData.data.access_code,
      reference: paystackRef,
      amountPesewas,
      invoiceId: targetInvoiceId,
      outstandingPesewas: totalOutstanding,
    });
  } catch (err) {
    console.error("[PARENT_PAYMENT_INIT_ERROR]", err);
    return noStore(500, { ok: false, error: "Failed to initialize payment" });
  }
}
