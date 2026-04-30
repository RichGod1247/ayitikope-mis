// src/app/api/admin/fees/invoices/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UiInvoiceStatus = "cleared" | "partial" | "unpaid" | "no_charge";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown learner";
}

function buildClassLabel(
  cls:
    | {
        name?: string | null;
        grade?: string | null;
        arm?: string | null;
      }
    | null
    | undefined
) {
  if (!cls) return "Unassigned";
  return cls.name || [cls.grade, cls.arm].filter(Boolean).join(" ") || "Class";
}

function invoiceStatus(input: {
  billedPesewas: number;
  paidPesewas: number;
  balancePesewas: number;
}): UiInvoiceStatus {
  if (input.billedPesewas <= 0) return "no_charge";
  if (input.balancePesewas <= 0) return "cleared";
  if (input.paidPesewas > 0) return "partial";
  return "unpaid";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);

  const guard = assertNoTenantOverride(url.searchParams.get("tenantId"), tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const classroomId = url.searchParams.get("classroomId")?.trim() || null;
  const q = url.searchParams.get("q")?.trim() || null;

  const takeRaw = Number(url.searchParams.get("take") ?? "1200");
  const take = Math.min(5000, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 1200));

  try {
    const studentFilter: Prisma.StudentWhereInput = {
      tenantId,
      status: "ACTIVE",
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

    const where: Prisma.FeeInvoiceWhereInput = {
      tenantId,
      status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
      ...(term ? { term } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(classroomId || q ? { student: studentFilter } : {}),
    };

    const invoices = await prisma.feeInvoice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take,
      select: {
        id: true,
        studentId: true,
        term: true,
        academicYear: true,
        status: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
        issuedAt: true,
        dueDate: true,
        createdAt: true,
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
        payments: {
          where: { status: "SUCCESS" },
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            paidAt: true,
          },
          orderBy: [{ paidAt: "desc" }],
        },
        receipts: {
          select: { id: true, receiptNumber: true },
        },
      },
    });

    let totalBilledPesewas = 0;
    let totalWaivedPesewas = 0;
    let totalPaidPesewas = 0;
    let totalBalancePesewas = 0;

    let clearedCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let noChargeCount = 0;

    const items = invoices.map((inv) => {
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;
      const paid = inv.payments.reduce((sum, p) => sum + p.amountPesewas, 0);
      const balance = Math.max(0, billed - waived - paid);

      const status = invoiceStatus({
        billedPesewas: billed,
        paidPesewas: paid,
        balancePesewas: balance,
      });

      if (status === "cleared") clearedCount++;
      else if (status === "partial") partialCount++;
      else if (status === "unpaid") unpaidCount++;
      else noChargeCount++;

      totalBilledPesewas += billed;
      totalWaivedPesewas += waived;
      totalPaidPesewas += paid;
      totalBalancePesewas += balance;

      const latestPayment = inv.payments[0] ?? null;
      const latestReceipt = inv.receipts[0] ?? null;

      return {
        invoiceId: inv.id,
        id: inv.id,
        studentId: inv.studentId,
        studentName: fullName(inv.student?.firstName, inv.student?.lastName),
        classLabel: buildClassLabel(inv.student?.classroom),
        classroomId: inv.student?.classroom?.id ?? null,
        guardianName: inv.student?.guardianName ?? null,
        guardianPhone: inv.student?.guardianPhone ?? null,

        term: inv.term,
        academicYear: inv.academicYear,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        dueDate: inv.dueDate?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),

        amountBilledPesewas: billed,
        totalBilledPesewas: billed,
        billedPesewas: billed,

        waivedPesewas: waived,
        totalWaivedPesewas: waived,

        totalPaidPesewas: paid,
        paidPesewas: paid,

        balancePesewas: balance,
        outstandingPesewas: balance,

        status,
        storedInvoiceStatus: inv.status,
        paymentCount: inv.payments.length,
        receiptCount: inv.receipts.length,
        lastPaymentAt: latestPayment?.paidAt?.toISOString() ?? null,
        latestPaymentMethod: latestPayment?.method ?? null,
        latestPaymentReference: latestPayment?.reference ?? null,
        latestReceiptId: latestReceipt?.id ?? null,
        latestReceiptNumber: latestReceipt?.receiptNumber ?? null,

        storedMismatch:
          (inv.totalPaidPesewas ?? 0) !== paid ||
          (inv.balancePesewas ?? 0) !== balance,
      };
    });

    items.sort((a, b) => {
      if (b.outstandingPesewas !== a.outstandingPesewas) {
        return b.outstandingPesewas - a.outstandingPesewas;
      }

      return a.studentName.localeCompare(b.studentName);
    });

    return jsonNoStore(
      {
        ok: true,
        tenantId,
        filters: {
          term,
          academicYear,
          classroomId,
          q,
        },
        summary: {
          totalInvoices: items.length,
          totalBilledPesewas,
          totalWaivedPesewas,
          totalPaidPesewas,
          totalBalancePesewas,
          outstandingPesewas: totalBalancePesewas,
          clearedCount,
          partialCount,
          unpaidCount,
          noChargeCount,
        },
        items,
      },
      200
    );
  } catch (err) {
    console.error("[ADMIN_FEE_INVOICES_LIST_ERROR]", err);

    return jsonNoStore(
      {
        ok: false,
        error: "FAILED_TO_LOAD_FEE_INVOICES",
        items: [],
      },
      500
    );
  }
}