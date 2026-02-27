// src/app/api/headteacher/students/fees-summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export async function GET(req: Request) {
  let ctx: any;
  try {
    ctx = await requireServerUserContext({
      requireTenant: true,
      requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN"],
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const tenantId = ctx.tenantId;

    const feeInvoices = await prisma.feeInvoice.findMany({
      where: { tenantId },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (feeInvoices.length === 0) {
      return NextResponse.json({ ok: true, tenantId, byStudent: {} }, { status: 200 });
    }

    const invoiceById = new Map<string, { studentId: string | null }>();
    for (const inv of feeInvoices) invoiceById.set(inv.id, { studentId: inv.studentId });

    const invoiceIds = feeInvoices.map((inv) => inv.id);

    const feePayments = await prisma.feePayment.findMany({
      where: {
        tenantId,
        invoiceId: { in: invoiceIds },
      },
      select: {
        invoiceId: true,
        amountPesewas: true,
      },
    });

    type StudentAgg = {
      billedPesewas: number;
      paidPesewas: number;
      outstandingPesewas: number;
      billed: number;
      paid: number;
      outstanding: number;
      invoiceCount: number;
    };

    const byStudent: Record<string, StudentAgg> = {};

    const ensure = (id: string): StudentAgg => {
      if (!byStudent[id]) {
        byStudent[id] = {
          billedPesewas: 0,
          paidPesewas: 0,
          outstandingPesewas: 0,
          billed: 0,
          paid: 0,
          outstanding: 0,
          invoiceCount: 0,
        };
      }
      return byStudent[id];
    };

    for (const inv of feeInvoices) {
      if (!inv.studentId) continue;
      const billed = (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0);
      const agg = ensure(inv.studentId);
      agg.billedPesewas += billed;
      agg.invoiceCount += 1;
    }

    for (const pay of feePayments) {
      const inv = invoiceById.get(pay.invoiceId);
      if (!inv?.studentId) continue;
      const agg = ensure(inv.studentId);
      agg.paidPesewas += pay.amountPesewas ?? 0;
    }

    for (const agg of Object.values(byStudent)) {
      agg.outstandingPesewas = Math.max(agg.billedPesewas - agg.paidPesewas, 0);
      agg.billed = agg.billedPesewas / 100;
      agg.paid = agg.paidPesewas / 100;
      agg.outstanding = agg.outstandingPesewas / 100;
    }

    return NextResponse.json({ ok: true, tenantId, byStudent }, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/headteacher/students/fees-summary", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error while loading fees summary." },
      { status: 500 }
    );
  }
}
