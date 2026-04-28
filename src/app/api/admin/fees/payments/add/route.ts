// src/app/api/admin/fees/payments/add/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function generateReceiptNumber(schoolCode: string): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hex = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-${yyyymmdd}-${hex}`;
}

type Body = {
  tenantId?: string;
  invoiceId?: string;
  invoice?: string;
  amountPesewas?: number;
  method?: string;
  reference?: string;
  channel?: string;
};

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
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const invoiceId = String(body.invoiceId ?? body.invoice ?? "").trim();
  if (!invoiceId) return jsonNoStore({ ok: false, error: "invoiceId is required." }, 400);

  const amountRaw = body.amountPesewas;
  const amountPesewas =
    typeof amountRaw === "number" && Number.isFinite(amountRaw) ? Math.floor(amountRaw) : NaN;

  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return jsonNoStore({ ok: false, error: "amountPesewas must be a positive integer (pesewas)." }, 400);
  }

  const method = String(body.method ?? "cash").trim() || "cash";
  const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
  const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : null;

  const [tenant, invoiceWithStudent] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, schoolCode: true },
    }),
    prisma.feeInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
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

  if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
  if (!invoiceWithStudent) return jsonNoStore({ ok: false, error: "INVOICE_NOT_FOUND" }, 404);

  const studentName = [invoiceWithStudent.student?.firstName, invoiceWithStudent.student?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Student";
  const guardianPhone = invoiceWithStudent.student?.guardianPhoneNorm || invoiceWithStudent.student?.guardianPhone || null;
  const classLabel = invoiceWithStudent.student?.classroom?.name || invoiceWithStudent.student?.classroom?.grade || "Class";
  const term = invoiceWithStudent.term;
  const academicYear = invoiceWithStudent.academicYear;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: { id: true, studentId: true, totalBilledPesewas: true, totalWaivedPesewas: true },
      });
      if (!invoice) return { ok: false as const, status: 404, error: "INVOICE_NOT_FOUND" };

      const agg = await tx.feePayment.aggregate({
        where: { tenantId, invoiceId },
        _sum: { amountPesewas: true },
      });

      const billed = invoice.totalBilledPesewas ?? 0;
      const waived = invoice.totalWaivedPesewas ?? 0;
      const alreadyPaid = agg._sum.amountPesewas ?? 0;
      const balance = billed - waived - alreadyPaid;

      if (balance <= 0) return { ok: false as const, status: 400, error: "INVOICE_ALREADY_CLEARED" };
      if (amountPesewas > balance) return { ok: false as const, status: 400, error: "PAYMENT_EXCEEDS_BALANCE" };

      const payment = await tx.feePayment.create({
        data: { tenantId, invoiceId, amountPesewas, method, reference, channel },
      });

      const receiptNumber = generateReceiptNumber(tenant.schoolCode);

      const receipt = await tx.receipt.create({
        data: {
          tenantId,
          invoiceId,
          feePaymentId: payment.id,
          receiptNumber,
          issuedToName: studentName,
          issuedToPhone: guardianPhone,
          issuedByUserId: auth.ctx.userId,
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
          amountPesewas,
          description: `Payment via ${method}${reference ? ` (ref: ${reference})` : ""}`,
          createdByUserId: auth.ctx.userId,
        },
      });

      const outstandingPesewas = Math.max(0, balance - amountPesewas);
      return { ok: true as const, status: 201, payment, receipt, outstandingPesewas };
    });

    if (!result.ok) return jsonNoStore({ ok: false, error: result.error }, result.status);

    if (guardianPhone) {
      const amountCedis = (amountPesewas / 100).toFixed(2);
      const outstandingCedis = (result.outstandingPesewas / 100).toFixed(2);
      const smsBody =
        `EduLife OS: Payment of GH₵${amountCedis} received for ${studentName} (${classLabel}) - ${term} ${academicYear}. ` +
        `Receipt: ${result.receipt.receiptNumber}. Balance: GH₵${outstandingCedis}. ` +
        `School: ${tenant.name}. Keep this SMS as proof.`;

      sendSms({
        tenantId,
        actorId: auth.ctx.userId,
        to: guardianPhone,
        message: smsBody,
        template: "payment_receipt",
        payload: {
          receiptNumber: result.receipt.receiptNumber,
          amountPesewas,
          invoiceId,
          outstandingPesewas: result.outstandingPesewas,
        },
      }).catch((err) => console.error("[PAYMENT_SMS_ERROR]", err));
    }

    return jsonNoStore(
      {
        ok: true,
        payment: result.payment,
        receipt: {
          id: result.receipt.id,
          receiptNumber: result.receipt.receiptNumber,
          issuedAt: result.receipt.issuedAt,
        },
        outstandingPesewas: result.outstandingPesewas,
      },
      201
    );
  } catch (err) {
    console.error("[ADMIN_FEES_PAYMENT_ADD_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_RECORD_PAYMENT" }, 500);
  }
}
