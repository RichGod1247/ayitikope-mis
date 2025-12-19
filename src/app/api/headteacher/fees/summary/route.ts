// src/app/api/headteacher/fees/summary/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    // 1) Ensure user is signed in
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId: string | undefined = user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // 2) Find tenant via membership
    const membership = await prisma.membership.findFirst({
      where: { userId },
    });

    if (!membership?.tenantId) {
      return NextResponse.json(
        { ok: false, error: "No tenant membership found for this user" },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Load all fee invoices for this tenant
    // Based on your schema:
    // FeeInvoice:
    //   - id, tenantId, totalBilledPesewas, totalWaivedPesewas, ...
    // FeePayment:
    //   - id, tenantId, invoiceId, amountPesewas, ...
    const feeInvoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    const invoiceIds = feeInvoices.map((inv) => inv.id);

    const feePayments =
      invoiceIds.length > 0
        ? await prisma.feePayment.findMany({
            where: {
              tenantId,
              invoiceId: {
                in: invoiceIds,
              },
            },
            select: {
              amountPesewas: true,
            },
          })
        : [];

    const totalBilledPesewas = feeInvoices.reduce((sum, inv) => {
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;
      return sum + billed - waived;
    }, 0);

    const totalPaidPesewas = feePayments.reduce((sum, pay) => {
      const amt = pay.amountPesewas ?? 0;
      return sum + amt;
    }, 0);

    const totalOutstandingPesewas = Math.max(
      totalBilledPesewas - totalPaidPesewas,
      0
    );

    const totalBilled = totalBilledPesewas / 100;
    const totalPaid = totalPaidPesewas / 100;
    const totalOutstanding = totalOutstandingPesewas / 100;

    const invoiceCount = feeInvoices.length;

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        invoiceCount,
        totalBilledPesewas,
        totalPaidPesewas,
        totalOutstandingPesewas,
        totalBilled,
        totalPaid,
        totalOutstanding,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/headteacher/fees/summary", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading fees summary. Please try again.",
      },
      { status: 500 }
    );
  }
}
