// src/app/api/admin/fees/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceStatusLabel = "cleared" | "partial" | "unpaid" | "no_charge";

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
  return classroom.name || [classroom.grade, classroom.arm].filter(Boolean).join(" ") || "Class";
}

function statusFromAmounts(input: {
  billedPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
}): InvoiceStatusLabel {
  if (input.billedPesewas <= 0) return "no_charge";
  if (input.outstandingPesewas <= 0) return "cleared";
  if (input.paidPesewas > 0) return "partial";
  return "unpaid";
}

function nowStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  const take = Math.min(5000, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 2000));

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, schoolCode: true },
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
            totalPaidPesewas: 0,
            outstandingPesewas: 0,
            todayCollectedPesewas: 0,
            receiptCount: 0,
            clearedCount: 0,
            partialCount: 0,
            unpaidCount: 0,
            noChargeCount: 0,
            openExceptionCount: 0,
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
          where: { status: "SUCCESS" },
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            paidAt: true,
            reference: true,
          },
        },
        receipts: {
          select: { id: true },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guardianName: true,
            guardianPhone: true,
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
    let totalPaidPesewas = 0;
    let outstandingPesewas = 0;
    let todayCollectedPesewas = 0;
    let receiptCount = 0;

    let clearedCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let noChargeCount = 0;

    const learnerIds = new Set<string>();
    const classMap = new Map<
      string,
      {
        classroomId: string | null;
        classLabel: string;
        invoiceCount: number;
        learnerIds: Set<string>;
        billedPesewas: number;
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
        amountPesewas: number;
      }
    >();

    const rows = invoices.map((inv) => {
      learnerIds.add(inv.studentId);

      const lineBilled = inv.lines.reduce((sum, line) => sum + line.amountPesewas, 0);
      const lineWaived = inv.lines.reduce((sum, line) => sum + line.waivedPesewas, 0);
      const adjustmentWaived = inv.adjustments.reduce((sum, adj) => sum + adj.amountPesewas, 0);

      const billed = lineBilled > 0 ? lineBilled : inv.totalBilledPesewas ?? 0;
      const waived = Math.max(0, lineWaived + adjustmentWaived);
      const paid = inv.payments.reduce((sum, payment) => sum + payment.amountPesewas, 0);
      const balance = Math.max(0, billed - waived - paid);
      const status = statusFromAmounts({
        billedPesewas: billed,
        paidPesewas: paid,
        outstandingPesewas: balance,
      });

      totalBilledPesewas += billed;
      totalWaivedPesewas += waived;
      totalPaidPesewas += paid;
      outstandingPesewas += balance;
      receiptCount += inv.receipts.length;

      if (status === "cleared") clearedCount++;
      else if (status === "partial") partialCount++;
      else if (status === "unpaid") unpaidCount++;
      else noChargeCount++;

      for (const payment of inv.payments) {
        if (payment.paidAt >= todayStart) {
          todayCollectedPesewas += payment.amountPesewas;
        }

        const method = String(payment.method ?? "unknown").toLowerCase();
        const bucket = paymentMethodMap.get(method) ?? {
          method,
          count: 0,
          amountPesewas: 0,
        };

        bucket.count += 1;
        bucket.amountPesewas += payment.amountPesewas;
        paymentMethodMap.set(method, bucket);
      }

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
          paidPesewas: 0,
          outstandingPesewas: 0,
          clearedCount: 0,
          partialCount: 0,
          unpaidCount: 0,
        };

      classBucket.invoiceCount += 1;
      classBucket.learnerIds.add(inv.studentId);
      classBucket.billedPesewas += billed;
      classBucket.paidPesewas += paid;
      classBucket.outstandingPesewas += balance;

      if (status === "cleared") classBucket.clearedCount++;
      else if (status === "partial") classBucket.partialCount++;
      else if (status === "unpaid") classBucket.unpaidCount++;

      classMap.set(clsKey, classBucket);

      const storedMismatch =
        (inv.totalPaidPesewas ?? 0) !== paid ||
        (inv.balancePesewas ?? 0) !== balance ||
        (inv.totalBilledPesewas ?? 0) !== billed ||
        (inv.totalWaivedPesewas ?? 0) !== waived;

      return {
        invoiceId: inv.id,
        studentId: inv.studentId,
        studentName: fullName(inv.student.firstName, inv.student.lastName),
        classLabel: clsLabel,
        classroomId: cls?.id ?? null,
        guardianName: inv.student.guardianName ?? null,
        guardianPhone: inv.student.guardianPhone ?? null,
        term: inv.term,
        academicYear: inv.academicYear,
        status,
        storedInvoiceStatus: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        billedPesewas: billed,
        waivedPesewas: waived,
        paidPesewas: paid,
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
        paidPesewas: item.paidPesewas,
        outstandingPesewas: item.outstandingPesewas,
        clearedCount: item.clearedCount,
        partialCount: item.partialCount,
        unpaidCount: item.unpaidCount,
        collectionRateBps:
          item.billedPesewas > 0
            ? Math.round((item.paidPesewas / item.billedPesewas) * 10000)
            : 0,
      }))
      .sort((a, b) => b.outstandingPesewas - a.outstandingPesewas);

    const paymentMethodSummaries = Array.from(paymentMethodMap.values()).sort(
      (a, b) => b.amountPesewas - a.amountPesewas
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
        totalPaidPesewas,
        outstandingPesewas,
        todayCollectedPesewas,
        receiptCount,
        clearedCount,
        partialCount,
        unpaidCount,
        noChargeCount,
        openExceptionCount,
        collectionRateBps:
          totalBilledPesewas > 0
            ? Math.round((totalPaidPesewas / totalBilledPesewas) * 10000)
            : 0,
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