// src/app/api/admin/fees/receipts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function classLabel(classroom?: {
  name: string | null;
  grade: string | null;
  arm?: string | null;
} | null) {
  if (!classroom) return "Unassigned";
  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    "Class"
  );
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
  const studentId = url.searchParams.get("studentId")?.trim() || null;
  const method = url.searchParams.get("method")?.trim().toLowerCase() || null;
  const q = url.searchParams.get("q")?.trim() || null;

  const takeRaw = Number(url.searchParams.get("take") ?? "300");
  const take = Math.min(1000, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 300));

  try {
    const invoiceFilter: Prisma.FeeInvoiceWhereInput = {};
    if (term) invoiceFilter.term = term;
    if (academicYear) invoiceFilter.academicYear = academicYear;
    if (studentId) invoiceFilter.studentId = studentId;

    if (q) {
      invoiceFilter.OR = [
        {
          student: {
            firstName: { contains: q, mode: "insensitive" },
          },
        },
        {
          student: {
            lastName: { contains: q, mode: "insensitive" },
          },
        },
        {
          student: {
            guardianName: { contains: q, mode: "insensitive" },
          },
        },
        {
          student: {
            guardianPhone: { contains: q, mode: "insensitive" },
          },
        },
        {
          student: {
            guardianPhoneNorm: { contains: q, mode: "insensitive" },
          },
        },
      ];
    }

    const where: Prisma.ReceiptWhereInput = {
      tenantId,
      ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
      ...(method ? { feePayment: { method } } : {}),
      ...(q
        ? {
            OR: [
              { receiptNumber: { contains: q, mode: "insensitive" } },
              { issuedToName: { contains: q, mode: "insensitive" } },
              { issuedToPhone: { contains: q, mode: "insensitive" } },
              { feePayment: { reference: { contains: q, mode: "insensitive" } } },
              { invoice: invoiceFilter },
            ],
          }
        : {}),
    };

    const receipts = await prisma.receipt.findMany({
      where,
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            paymentTransaction: {
              select: {
                provider: true,
                providerReference: true,
                providerTransactionId: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            status: true,
            balancePesewas: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                    arm: true,
                  },
                },
              },
            },
          },
        },
        issuedBy: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ issuedAt: "desc" }],
      take,
    });

    const items = receipts.map((r) => {
      const studentName =
        fullName(r.invoice?.student?.firstName, r.invoice?.student?.lastName) ||
        "Unknown";

      const issuedByName =
        fullName(r.issuedBy?.firstName, r.issuedBy?.lastName) ||
        r.issuedBy?.name ||
        "System";

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        issuedAt: r.issuedAt.toISOString(),
        issuedToName: r.issuedToName,
        issuedToPhone: r.issuedToPhone,
        note: r.note,

        amountPesewas: r.feePayment?.amountPesewas ?? 0,
        method: r.feePayment?.method ?? null,
        reference: r.feePayment?.reference ?? null,
        channel: r.feePayment?.channel ?? null,
        paidAt: r.feePayment?.paidAt?.toISOString() ?? null,

        provider: r.feePayment?.paymentTransaction?.provider ?? null,
        providerReference:
          r.feePayment?.paymentTransaction?.providerReference ?? null,
        providerTransactionId:
          r.feePayment?.paymentTransaction?.providerTransactionId ?? null,

        invoiceId: r.invoice?.id ?? null,
        invoiceStatus: r.invoice?.status ?? null,
        invoiceBalancePesewas: r.invoice?.balancePesewas ?? null,
        term: r.invoice?.term ?? null,
        academicYear: r.invoice?.academicYear ?? null,

        studentId: r.invoice?.student?.id ?? null,
        studentName,
        guardianName: r.invoice?.student?.guardianName ?? null,
        guardianPhone: r.invoice?.student?.guardianPhone ?? null,
        classLabel: classLabel(r.invoice?.student?.classroom),

        issuedByName,
      };
    });

    const totalAmountPesewas = items.reduce(
      (sum, item) => sum + item.amountPesewas,
      0
    );

    return jsonNoStore(200, {
      ok: true,
      count: items.length,
      totalAmountPesewas,
      filters: {
        term,
        academicYear,
        studentId,
        method,
        q,
      },
      items,
    });
  } catch (err) {
    console.error("[ADMIN_RECEIPTS_LIST_ERROR]", err);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPTS",
      items: [],
      count: 0,
    });
  }
}