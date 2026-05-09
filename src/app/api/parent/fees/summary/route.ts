// src/app/api/parent/fees/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, RefundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Student";
}

function toIso(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parentOwnsStudent(input: {
  parentE164: string;
  parentSuffix9: string;
  studentGuardianPhone?: string | null;
  studentGuardianPhoneNorm?: string | null;
}) {
  const parentDigits = digitsOnly(input.parentE164);
  const parentLast9 = parentDigits.slice(-9);
  const suffix9 = digitsOnly(input.parentSuffix9);

  const sNorm = digitsOnly(input.studentGuardianPhoneNorm ?? "");
  const sRaw = digitsOnly(input.studentGuardianPhone ?? "");

  return (
    (parentLast9.length >= 7 &&
      (sNorm.endsWith(parentLast9) || sRaw.endsWith(parentLast9))) ||
    (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)))
  );
}

function succeededRefundTotal(
  refunds: Array<{ status: string; amountPesewas: number }>
) {
  return refunds
    .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
    .reduce((sum, refund) => sum + refund.amountPesewas, 0);
}

function pendingRefundTotal(
  refunds: Array<{ status: string; amountPesewas: number }>
) {
  const pendingStatuses = new Set<string>([
    RefundStatus.REQUESTED,
    RefundStatus.APPROVED,
    RefundStatus.PROCESSING,
  ]);

  return refunds
    .filter((refund) => pendingStatuses.has(String(refund.status)))
    .reduce((sum, refund) => sum + refund.amountPesewas, 0);
}

function spendingFromPayments(
  payments: Array<{
    amountPesewas: number;
    refunds: Array<{ status: string; amountPesewas: number }>;
  }>
) {
  const grossPaidPesewas = payments.reduce(
    (sum, payment) => sum + (payment.amountPesewas ?? 0),
    0
  );

  const refundedPesewas = payments.reduce(
    (sum, payment) => sum + succeededRefundTotal(payment.refunds),
    0
  );

  const pendingRefundPesewas = payments.reduce(
    (sum, payment) => sum + pendingRefundTotal(payment.refunds),
    0
  );

  return {
    grossPaidPesewas,
    refundedPesewas,
    pendingRefundPesewas,
    netSpentPesewas: Math.max(0, grossPaidPesewas - refundedPesewas),
  };
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(
      req as Parameters<typeof requireParentSession>[0]
    );

    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const parentE164 = String(sess.guardianPhoneE164 ?? "").trim();
    const parentSuffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") ?? "").trim();
    const term = String(url.searchParams.get("term") ?? "1st Term").trim();
    const academicYear = String(
      url.searchParams.get("academicYear") ?? "2025/2026"
    ).trim();

    if (!studentId) return noStore(400, { ok: false, error: "STUDENT_ID_REQUIRED" });
    if (!term) return noStore(400, { ok: false, error: "TERM_REQUIRED" });
    if (!academicYear) {
      return noStore(400, { ok: false, error: "ACADEMIC_YEAR_REQUIRED" });
    }

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
          },
        },
      },
    });

    if (!student) {
      return noStore(404, { ok: false, error: "STUDENT_NOT_FOUND" });
    }

    if (
      !parentOwnsStudent({
        parentE164,
        parentSuffix9,
        studentGuardianPhone: student.guardianPhone,
        studentGuardianPhoneNorm: student.guardianPhoneNorm,
      })
    ) {
      return noStore(403, { ok: false, error: "FORBIDDEN_STUDENT" });
    }

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId,
        studentId,
        term,
        academicYear,
        status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
      },
      select: {
        id: true,
        term: true,
        academicYear: true,
        status: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
        dueDate: true,
        issuedAt: true,
        note: true,
        lines: {
          select: {
            id: true,
            category: true,
            description: true,
            amountPesewas: true,
            waivedPesewas: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        adjustments: {
          where: { reversedAt: null },
          select: {
            id: true,
            kind: true,
            amountPesewas: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          where: {
            status: { in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
          },
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            status: true,
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                issuedAt: true,
                status: true,
              },
            },
            refunds: {
              select: {
                id: true,
                status: true,
                amountPesewas: true,
                reason: true,
                requestedAt: true,
                approvedAt: true,
                processingAt: true,
                processedAt: true,
                failedAt: true,
                failureReason: true,
              },
              orderBy: { requestedAt: "desc" },
            },
          },
          orderBy: { paidAt: "asc" },
        },
      },
      orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
      take: 50,
    });

    const allStudentPayments = await prisma.feePayment.findMany({
      where: {
        tenantId,
        status: { in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
        invoice: {
          studentId,
          status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
        },
      },
      select: {
        id: true,
        amountPesewas: true,
        paidAt: true,
        invoice: {
          select: {
            term: true,
            academicYear: true,
          },
        },
        refunds: {
          select: {
            id: true,
            status: true,
            amountPesewas: true,
          },
        },
      },
      take: 1000,
    });

    const selectedTermPayments = allStudentPayments.filter(
      (payment) =>
        payment.invoice.term === term && payment.invoice.academicYear === academicYear
    );

    const academicYearPayments = allStudentPayments.filter(
      (payment) => payment.invoice.academicYear === academicYear
    );

    const studentName = fullName(student.firstName, student.lastName);

    if (invoices.length === 0) {
      return noStore(200, {
        ok: true,
        studentId,
        studentName,
        classroom: student.classroom,
        term,
        academicYear,
        summary: {
          totalBilledPesewas: 0,
          totalWaivedPesewas: 0,
          totalGrossPaidPesewas: 0,
          totalRefundedPesewas: 0,
          totalPendingRefundPesewas: 0,
          totalPaidPesewas: 0,
          balancePesewas: 0,
          invoiceCount: 0,
          paymentCount: 0,
          lastPaymentDate: null,
          lastPaymentAmountPesewas: null,
          canPayOnline: false,
          payableInvoiceId: null,
          payableInvoiceBalancePesewas: 0,
          note: "No fees have been posted for this learner in the selected term.",
        },
        spendingSummary: {
          selectedTerm: spendingFromPayments([]),
          academicYear: spendingFromPayments(academicYearPayments),
          lifetime: spendingFromPayments(allStudentPayments),
        },
        invoices: [],
        paymentHistory: [],
      });
    }

    const invoiceDetails = invoices.map((inv) => {
      const lineBilled = inv.lines.reduce(
        (sum, line) => sum + (line.amountPesewas ?? 0),
        0
      );

      const lineWaived = inv.lines.reduce(
        (sum, line) => sum + (line.waivedPesewas ?? 0),
        0
      );

      const adjustmentWaived = inv.adjustments.reduce(
        (sum, adj) => sum + (adj.amountPesewas ?? 0),
        0
      );

      const paymentDetails = inv.payments.map((payment) => {
        const refundedPesewas = succeededRefundTotal(payment.refunds);
        const pendingRefundPesewas = pendingRefundTotal(payment.refunds);
        const netAmountPesewas = Math.max(0, payment.amountPesewas - refundedPesewas);
        const refundablePesewas = Math.max(
          0,
          payment.amountPesewas - refundedPesewas - pendingRefundPesewas
        );

        return {
          id: payment.id,
          amountPesewas: payment.amountPesewas,
          netAmountPesewas,
          refundedPesewas,
          pendingRefundPesewas,
          refundablePesewas,
          method: payment.method,
          reference: payment.reference,
          channel: payment.channel,
          status: payment.status,
          paidAt: payment.paidAt.toISOString(),
          receipt: payment.receipt
            ? {
                id: payment.receipt.id,
                receiptNumber: payment.receipt.receiptNumber,
                issuedAt: payment.receipt.issuedAt.toISOString(),
                status: payment.receipt.status,
              }
            : null,
          refunds: payment.refunds.map((refund) => ({
  id: refund.id,
  status: refund.status,
  amountPesewas: refund.amountPesewas,
  reason: refund.reason,
  requestedAt: toIso(refund.requestedAt) ?? "",
  approvedAt: toIso(refund.approvedAt),
  processingAt: toIso(refund.processingAt),
  processedAt: toIso(refund.processedAt),
  failedAt: toIso(refund.failedAt),
  failureReason: refund.failureReason,
})),
        };
      });

      const grossPaid = paymentDetails.reduce(
        (sum, payment) => sum + payment.amountPesewas,
        0
      );

      const refunded = paymentDetails.reduce(
        (sum, payment) => sum + payment.refundedPesewas,
        0
      );

      const pendingRefund = paymentDetails.reduce(
        (sum, payment) => sum + payment.pendingRefundPesewas,
        0
      );

      const paid = Math.max(0, grossPaid - refunded);

      const billed =
        lineBilled > 0 ? lineBilled : Math.max(0, inv.totalBilledPesewas ?? 0);

      const waived = Math.max(0, lineWaived + adjustmentWaived);
      const netDue = Math.max(0, billed - waived);
      const balance = Math.max(0, netDue - paid);

      return {
        id: inv.id,
        term: inv.term,
        academicYear: inv.academicYear,
        status: inv.status,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        issuedAt: inv.issuedAt.toISOString(),
        note: inv.note,
        totalBilledPesewas: billed,
        totalWaivedPesewas: waived,
        totalGrossPaidPesewas: grossPaid,
        totalRefundedPesewas: refunded,
        totalPendingRefundPesewas: pendingRefund,
        totalPaidPesewas: paid,
        balancePesewas: balance,
        lines: inv.lines.map((line) => ({
          id: line.id,
          category: line.category,
          description: line.description,
          amountPesewas: line.amountPesewas,
          waivedPesewas: line.waivedPesewas,
        })),
        adjustments: inv.adjustments.map((adj) => ({
          id: adj.id,
          kind: adj.kind,
          amountPesewas: adj.amountPesewas,
          reason: adj.reason,
          createdAt: adj.createdAt.toISOString(),
        })),
        payments: paymentDetails,
      };
    });

    const totals = invoiceDetails.reduce(
      (acc, inv) => {
        acc.totalBilledPesewas += inv.totalBilledPesewas;
        acc.totalWaivedPesewas += inv.totalWaivedPesewas;
        acc.totalGrossPaidPesewas += inv.totalGrossPaidPesewas;
        acc.totalRefundedPesewas += inv.totalRefundedPesewas;
        acc.totalPendingRefundPesewas += inv.totalPendingRefundPesewas;
        acc.totalPaidPesewas += inv.totalPaidPesewas;
        acc.balancePesewas += inv.balancePesewas;
        acc.paymentCount += inv.payments.length;
        return acc;
      },
      {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalGrossPaidPesewas: 0,
        totalRefundedPesewas: 0,
        totalPendingRefundPesewas: 0,
        totalPaidPesewas: 0,
        balancePesewas: 0,
        paymentCount: 0,
      }
    );

    const paymentHistory = invoiceDetails
      .flatMap((inv) =>
        inv.payments.map((payment) => ({
          ...payment,
          invoiceId: inv.id,
          term: inv.term,
          academicYear: inv.academicYear,
        }))
      )
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

    const lastPayment = paymentHistory[0] ?? null;
    const payableInvoice = invoiceDetails.find((inv) => inv.balancePesewas > 0);
    const isSettled = totals.balancePesewas <= 0;

    return noStore(200, {
      ok: true,
      studentId,
      studentName,
      classroom: student.classroom,
      term,
      academicYear,
      summary: {
        totalBilledPesewas: totals.totalBilledPesewas,
        totalWaivedPesewas: totals.totalWaivedPesewas,
        totalGrossPaidPesewas: totals.totalGrossPaidPesewas,
        totalRefundedPesewas: totals.totalRefundedPesewas,
        totalPendingRefundPesewas: totals.totalPendingRefundPesewas,
        totalPaidPesewas: totals.totalPaidPesewas,
        balancePesewas: Math.max(0, totals.balancePesewas),
        invoiceCount: invoiceDetails.length,
        paymentCount: totals.paymentCount,
        lastPaymentDate: lastPayment?.paidAt ?? null,
        lastPaymentAmountPesewas: lastPayment?.amountPesewas ?? null,
        canPayOnline: Boolean(payableInvoice),
        payableInvoiceId: payableInvoice?.id ?? null,
        payableInvoiceBalancePesewas: payableInvoice?.balancePesewas ?? 0,
        note: isSettled
          ? "Fees for this learner are fully settled for the selected term."
          : "A balance remains. You may pay in parts or contact the school for support.",
      },
      spendingSummary: {
        selectedTerm: spendingFromPayments(selectedTermPayments),
        academicYear: spendingFromPayments(academicYearPayments),
        lifetime: spendingFromPayments(allStudentPayments),
      },
      invoices: invoiceDetails,
      paymentHistory,
    });
  } catch (err) {
    console.error("[PARENT_FEES_SUMMARY_ERROR]", err);

    return noStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_PARENT_FEES_SUMMARY",
    });
  }
}