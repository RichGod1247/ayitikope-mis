// src/app/api/parent/fees/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") ?? "").trim();
    const term = String(url.searchParams.get("term") ?? "1st Term").trim();
    const academicYear = String(url.searchParams.get("academicYear") ?? "2025/2026").trim();

    if (!studentId) {
      return noStore(400, { ok: false, error: "studentId is required" });
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
      },
    });

    if (!student) {
      return noStore(404, { ok: false, error: "Student not found" });
    }

    // Verify student belongs to authenticated parent
    const sNorm = digitsOnly(student.guardianPhoneNorm ?? student.guardianPhone ?? "");
    const sRaw = digitsOnly(student.guardianPhone ?? "");
    const parentDigits = digitsOnly(e164);
    const ownsStudent =
      (parentDigits.length >= 7 &&
        (sNorm.endsWith(parentDigits.slice(-9)) || sRaw.endsWith(parentDigits.slice(-9)))) ||
      (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)));

    if (!ownsStudent) {
      return noStore(403, { ok: false, error: "Forbidden" });
    }

    const studentName =
      [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Student";

    const invoices = await prisma.feeInvoice.findMany({
      where: { tenantId, studentId, term, academicYear },
      select: { id: true, totalBilledPesewas: true, totalWaivedPesewas: true },
      orderBy: { createdAt: "asc" },
    });

    if (!invoices.length) {
      return noStore(200, {
        ok: true,
        studentId,
        studentName,
        term,
        academicYear,
        summary: {
          totalBilledPesewas: 0,
          totalWaivedPesewas: 0,
          totalPaidPesewas: 0,
          balancePesewas: 0,
          invoiceCount: 0,
          paymentCount: 0,
          lastPaymentDate: null,
          lastPaymentAmountPesewas: null,
          note: "No invoices found for this term and academic year.",
        },
      });
    }

    const invoiceIds = invoices.map((inv) => inv.id);

    const payments = await prisma.feePayment.findMany({
      where: { tenantId, invoiceId: { in: invoiceIds } },
      select: { amountPesewas: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    });

    let totalBilledPesewas = 0;
    let totalWaivedPesewas = 0;
    for (const inv of invoices) {
      totalBilledPesewas += inv.totalBilledPesewas ?? 0;
      totalWaivedPesewas += inv.totalWaivedPesewas ?? 0;
    }

    let totalPaidPesewas = 0;
    let lastPaymentDate: string | null = null;
    let lastPaymentAmountPesewas: number | null = null;
    let lastPaidAt: Date | null = null;

    for (const p of payments) {
      const amt = p.amountPesewas ?? 0;
      totalPaidPesewas += amt;
      const paidAt = p.paidAt ? new Date(p.paidAt) : null;
      if (paidAt && (!lastPaidAt || paidAt > lastPaidAt)) {
        lastPaidAt = paidAt;
        lastPaymentAmountPesewas = amt;
        lastPaymentDate = paidAt.toISOString();
      }
    }

    const balancePesewas = totalBilledPesewas - totalWaivedPesewas - totalPaidPesewas;
    const isSettled = balancePesewas <= 0;

    return noStore(200, {
      ok: true,
      studentId,
      studentName,
      term,
      academicYear,
      summary: {
        totalBilledPesewas,
        totalWaivedPesewas,
        totalPaidPesewas,
        balancePesewas: Math.max(balancePesewas, 0),
        invoiceCount: invoices.length,
        paymentCount: payments.length,
        lastPaymentDate,
        lastPaymentAmountPesewas,
        note: isSettled
          ? "Fees for this learner appear to be fully settled for this term."
          : "Some balance remains. Payments can be made at the school office or online.",
      },
    });
  } catch (err) {
    console.error("[PARENT_FEES_SUMMARY_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error loading fee summary." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
