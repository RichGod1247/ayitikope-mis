// src/app/api/admin/fees/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  PaymentStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceStatusLabel = "cleared" | "partial" | "unpaid" | "no_charge";

const REFUND_PENDING_STATUSES = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
] as const;

const REFUND_VISIBLE_STATUSES = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
  RefundStatus.SUCCEEDED,
] as const;

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function classLabel(
  classroom?: {
    id: string;
    name: string | null;
    grade: string | null;
    arm: string | null;
  } | null
) {
  if (!classroom) return "Unassigned";

  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    "Class"
  );
}

function nowStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function statusFromAmounts(input: {
  netBilledPesewas: number;
  netPaidPesewas: number;
  outstandingPesewas: number;
}): InvoiceStatusLabel {
  if (input.netBilledPesewas <= 0) return "no_charge";
  if (input.outstandingPesewas <= 0) return "cleared";
  if (input.netPaidPesewas > 0) return "partial";
  return "unpaid";
}

function collectionRateBps(input: {
  netPaidPesewas: number;
  netBilledPesewas: number;
}) {
  if (input.netBilledPesewas <= 0) return 0;

  return Math.round((input.netPaidPesewas / input.netBilledPesewas) * 10000);
}

function refundBucket(
  refunds: Array<{
    status: RefundStatus;
    amountPesewas: number;
    processedAt: Date | null;
  }>
) {
  let succeededPesewas = 0;
  let pendingPesewas = 0;

  for (const refund of refunds) {
    const amount = Math.max(0, refund.amountPesewas ?? 0);

    if (refund.status === RefundStatus.SUCCEEDED) {
      succeededPesewas += amount;
      continue;
    }

    if (
      refund.status === RefundStatus.REQUESTED ||
      refund.status === RefundStatus.APPROVED ||
      refund.status === RefundStatus.PROCESSING
    ) {
      pendingPesewas += amount;
    }
  }

  return { succeededPesewas, pendingPesewas };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const classroomId = url.searchParams.get("classroomId")?.trim() || null;
  const q = url.searchParams.get("q")?.trim() || null;

  const takeRaw = Number(url.searchParams.get("take") ?? "2000");
  const take = Math.min(
    5000,
    Math.max(1, Number.isFinite(takeRaw) ? Math.floor(takeRaw) : 2000)
  );

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        schoolCode: true,
      },
    });

    let studentIdFilter: string[] | null = null;

    if (classroomId || q) {
      const studentWhere: Prisma.StudentWhereInput = {
        tenantId,
        ...(classroomId ? { classroomId } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { guardianName: { contains: q, mode: "insensitive" } },
                { guardianPhone: { contains: q, mode: "insensitive" } },
                { guardianPhoneNorm: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const students = await prisma.student.findMany({
        where: studentWhere,
        select: { id: true },
        take: 6000,
      });

      studentIdFilter = students.map((s) => s.id);

      if (studentIdFilter.length === 0) {
        return json(200, {
          ok: true,
          tenant,
          filters: { term, academicYear, classroomId, q },
          summary: {
            invoiceCount: 0,
            learnerCount: 0,
            totalBilledPesewas: 0,
            totalWaivedPesewas: 0,
            totalNetBilledPesewas: 0,
            totalGrossPaidPesewas: 0,
            totalRefundedPesewas: 0,
            totalPendingRefundPesewas: 0,
            totalPaidPesewas: 0,
            outstandingPesewas: 0,
            todayGrossCollectedPesewas: 0,
            todayRefundedPesewas: 0,
            todayCollectedPesewas: 0,
            receiptCount: 0,
            clearedCount: 0,
            partialCount: 0,
            unpaidCount: 0,
            noChargeCount: 0,
            openExceptionCount: 0,
            storedMismatchCount: 0,
            collectionRateBps: 0,
          },
          classSummaries: [],
          paymentMethodSummaries: [],
          rows: [],
        });
      }
    }

    const invoiceWhere: Prisma.FeeInvoiceWhereInput = {
      tenantId,
      status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
      ...(term ? { term } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(studentIdFilter ? { studentId: { in: studentIdFilter } } : {}),
    };

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        studentId: true,
        term: true,
        academicYear: true,
        status: true,
        issuedAt: true,
        dueDate: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
        lines: {
          select: {
            amountPesewas: true,
            waivedPesewas: true,
          },
        },
        adjustments: {
          where: { reversedAt: null },
          select: {
            amountPesewas: true,
          },
        },
        payments: {
          where: {
            status: {
              in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED],
            },
          },
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            paidAt: true,
            reference: true,
            status: true,
            refunds: {
              where: {
                status: { in: [...REFUND_VISIBLE_STATUSES] },
              },
              select: {
                id: true,
                status: true,
                amountPesewas: true,
                processedAt: true,
              },
            },
          },
        },
        receipts: {
          select: {
            id: true,
            status: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guardianName: true,
            guardianPhone: true,
            guardianPhoneNorm: true,
            classroom: {
              select: {
                id: true,
                name: true,
                grade: true,
                arm: true,
              },
            },
          },
        },
      },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take,
    });

    const todayStart = nowStartOfDay();

    let totalBilledPesewas = 0;
    let totalWaivedPesewas = 0;
    let totalNetBilledPesewas = 0;
    let totalGrossPaidPesewas = 0;
    let totalRefundedPesewas = 0;
    let totalPendingRefundPesewas = 0;
    let totalNetPaidPesewas = 0;
    let outstandingPesewas = 0;

    let todayGrossCollectedPesewas = 0;
    let todayRefundedPesewas = 0;
    let receiptCount = 0;

    let clearedCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let noChargeCount = 0;
    let storedMismatchCount = 0;

    const learnerIds = new Set<string>();

    const classMap = new Map<
      string,
      {
        classroomId: string | null;
        classLabel: string;
        invoiceCount: number;
        learnerIds: Set<string>;
        billedPesewas: number;
        waivedPesewas: number;
        netBilledPesewas: number;
        grossPaidPesewas: number;
        refundedPesewas: number;
        pendingRefundPesewas: number;
        paidPesewas: number;
        outstandingPesewas: number;
        clearedCount: number;
        partialCount: number;
        unpaidCount: number;
      }
    >();

    const paymentMethodMap = new Map<
      string,
      {
        method: string;
        count: number;
        grossPaidPesewas: number;
        refundedPesewas: number;
        pendingRefundPesewas: number;
        amountPesewas: number;
      }
    >();

    const rows = invoices.map((inv) => {
      learnerIds.add(inv.studentId);

      const lineBilled = inv.lines.reduce(
        (sum, line) => sum + Math.max(0, line.amountPesewas ?? 0),
        0
      );

      const lineWaived = inv.lines.reduce(
        (sum, line) => sum + Math.max(0, line.waivedPesewas ?? 0),
        0
      );

      const adjustmentWaived = inv.adjustments.reduce(
        (sum, adj) => sum + Math.max(0, adj.amountPesewas ?? 0),
        0
      );

      const billed =
        lineBilled > 0 ? lineBilled : Math.max(0, inv.totalBilledPesewas ?? 0);

      const waived = Math.max(0, lineWaived + adjustmentWaived);
      const netBilled = Math.max(0, billed - waived);

      let grossPaid = 0;
      let refunded = 0;
      let pendingRefund = 0;

      for (const payment of inv.payments) {
        const paymentAmount = Math.max(0, payment.amountPesewas ?? 0);
        grossPaid += paymentAmount;

        if (payment.paidAt >= todayStart) {
          todayGrossCollectedPesewas += paymentAmount;
        }

        const bucketedRefunds = refundBucket(payment.refunds);
        refunded += bucketedRefunds.succeededPesewas;
        pendingRefund += bucketedRefunds.pendingPesewas;

        for (const refund of payment.refunds) {
          if (
            refund.status === RefundStatus.SUCCEEDED &&
            refund.processedAt &&
            refund.processedAt >= todayStart
          ) {
            todayRefundedPesewas += Math.max(0, refund.amountPesewas ?? 0);
          }
        }

        const method = String(payment.method ?? "unknown").toLowerCase();
        const methodBucket = paymentMethodMap.get(method) ?? {
          method,
          count: 0,
          grossPaidPesewas: 0,
          refundedPesewas: 0,
          pendingRefundPesewas: 0,
          amountPesewas: 0,
        };

        methodBucket.count += 1;
        methodBucket.grossPaidPesewas += paymentAmount;
        methodBucket.refundedPesewas += bucketedRefunds.succeededPesewas;
        methodBucket.pendingRefundPesewas += bucketedRefunds.pendingPesewas;
        methodBucket.amountPesewas =
          methodBucket.grossPaidPesewas - methodBucket.refundedPesewas;

        paymentMethodMap.set(method, methodBucket);
      }

      const netPaid = Math.max(0, grossPaid - refunded);
      const balance = Math.max(0, netBilled - netPaid);

      const status = statusFromAmounts({
        netBilledPesewas: netBilled,
        netPaidPesewas: netPaid,
        outstandingPesewas: balance,
      });

      totalBilledPesewas += billed;
      totalWaivedPesewas += waived;
      totalNetBilledPesewas += netBilled;
      totalGrossPaidPesewas += grossPaid;
      totalRefundedPesewas += refunded;
      totalPendingRefundPesewas += pendingRefund;
      totalNetPaidPesewas += netPaid;
      outstandingPesewas += balance;
      receiptCount += inv.receipts.length;

      if (status === "cleared") clearedCount += 1;
      else if (status === "partial") partialCount += 1;
      else if (status === "unpaid") unpaidCount += 1;
      else noChargeCount += 1;

      const cls = inv.student.classroom;
      const clsLabel = classLabel(cls);
      const clsKey = cls?.id ?? "unassigned";

      const classBucket =
        classMap.get(clsKey) ??
        {
          classroomId: cls?.id ?? null,
          classLabel: clsLabel,
          invoiceCount: 0,
          learnerIds: new Set<string>(),
          billedPesewas: 0,
          waivedPesewas: 0,
          netBilledPesewas: 0,
          grossPaidPesewas: 0,
          refundedPesewas: 0,
          pendingRefundPesewas: 0,
          paidPesewas: 0,
          outstandingPesewas: 0,
          clearedCount: 0,
          partialCount: 0,
          unpaidCount: 0,
        };

      classBucket.invoiceCount += 1;
      classBucket.learnerIds.add(inv.studentId);
      classBucket.billedPesewas += billed;
      classBucket.waivedPesewas += waived;
      classBucket.netBilledPesewas += netBilled;
      classBucket.grossPaidPesewas += grossPaid;
      classBucket.refundedPesewas += refunded;
      classBucket.pendingRefundPesewas += pendingRefund;
      classBucket.paidPesewas += netPaid;
      classBucket.outstandingPesewas += balance;

      if (status === "cleared") classBucket.clearedCount += 1;
      else if (status === "partial") classBucket.partialCount += 1;
      else if (status === "unpaid") classBucket.unpaidCount += 1;

      classMap.set(clsKey, classBucket);

      const storedMismatch =
        (inv.totalPaidPesewas ?? 0) !== netPaid ||
        (inv.balancePesewas ?? 0) !== balance ||
        (inv.totalBilledPesewas ?? 0) !== billed ||
        (inv.totalWaivedPesewas ?? 0) !== waived;

      if (storedMismatch) storedMismatchCount += 1;

      return {
        invoiceId: inv.id,
        studentId: inv.studentId,
        studentName: fullName(inv.student.firstName, inv.student.lastName),
        classLabel: clsLabel,
        classroomId: cls?.id ?? null,
        guardianName: inv.student.guardianName ?? null,
        guardianPhone:
          inv.student.guardianPhoneNorm ?? inv.student.guardianPhone ?? null,
        term: inv.term,
        academicYear: inv.academicYear,
        status,
        storedInvoiceStatus: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        billedPesewas: billed,
        waivedPesewas: waived,
        netBilledPesewas: netBilled,
        grossPaidPesewas: grossPaid,
        refundedPesewas: refunded,
        pendingRefundPesewas: pendingRefund,
        paidPesewas: netPaid,
        outstandingPesewas: balance,
        paymentCount: inv.payments.length,
        receiptCount: inv.receipts.length,
        latestPaymentAt:
          inv.payments
            .map((p) => p.paidAt)
            .sort((a, b) => b.getTime() - a.getTime())[0]
            ?.toISOString() ?? null,
        storedMismatch,
      };
    });

    rows.sort((a, b) => b.outstandingPesewas - a.outstandingPesewas);

    const invoiceIds = invoices.map((inv) => inv.id);

    const openExceptionCount =
      invoiceIds.length > 0
        ? await prisma.reconciliationException.count({
            where: {
              tenantId,
              status: { in: ["OPEN", "INVESTIGATING"] },
              invoiceId: { in: invoiceIds },
            },
          })
        : 0;

    const classSummaries = Array.from(classMap.values())
      .map((item) => ({
        classroomId: item.classroomId,
        classLabel: item.classLabel,
        invoiceCount: item.invoiceCount,
        learnerCount: item.learnerIds.size,
        billedPesewas: item.billedPesewas,
        waivedPesewas: item.waivedPesewas,
        netBilledPesewas: item.netBilledPesewas,
        grossPaidPesewas: item.grossPaidPesewas,
        refundedPesewas: item.refundedPesewas,
        pendingRefundPesewas: item.pendingRefundPesewas,
        paidPesewas: item.paidPesewas,
        outstandingPesewas: item.outstandingPesewas,
        clearedCount: item.clearedCount,
        partialCount: item.partialCount,
        unpaidCount: item.unpaidCount,
        collectionRateBps: collectionRateBps({
          netPaidPesewas: item.paidPesewas,
          netBilledPesewas: item.netBilledPesewas,
        }),
      }))
      .sort((a, b) => b.outstandingPesewas - a.outstandingPesewas);

    const paymentMethodSummaries = Array.from(paymentMethodMap.values()).sort(
      (a, b) => b.amountPesewas - a.amountPesewas
    );

    const todayNetCollectedPesewas = Math.max(
      0,
      todayGrossCollectedPesewas - todayRefundedPesewas
    );

    return json(200, {
      ok: true,
      tenant,
      filters: { term, academicYear, classroomId, q },
      summary: {
        invoiceCount: invoices.length,
        learnerCount: learnerIds.size,
        totalBilledPesewas,
        totalWaivedPesewas,
        totalNetBilledPesewas,
        totalGrossPaidPesewas,
        totalRefundedPesewas,
        totalPendingRefundPesewas,
        totalPaidPesewas: totalNetPaidPesewas,
        outstandingPesewas,
        todayGrossCollectedPesewas,
        todayRefundedPesewas,
        todayCollectedPesewas: todayNetCollectedPesewas,
        receiptCount,
        clearedCount,
        partialCount,
        unpaidCount,
        noChargeCount,
        openExceptionCount,
        storedMismatchCount,
        collectionRateBps: collectionRateBps({
          netPaidPesewas: totalNetPaidPesewas,
          netBilledPesewas: totalNetBilledPesewas,
        }),
      },
      classSummaries,
      paymentMethodSummaries,
      rows,
    });
  } catch (err) {
    console.error("[ADMIN_FEES_OVERVIEW_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_FINANCE_OVERVIEW",
    });
  }
}