// src/app/api/headteacher/students/fees-detail/route.ts
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
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim() || "";

    if (!studentId) {
      return NextResponse.json({ ok: false, error: "studentId is required" }, { status: 400 });
    }

    const tenantId = ctx.tenantId;

    const invoices = await prisma.feeInvoice.findMany({
      where: { tenantId, studentId },
      select: {
        id: true,
        term: true,
        academicYear: true,
        note: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { ok: true, tenantId, studentId, invoices: [] },
        { status: 200 }
      );
    }

    const invoiceIds = invoices.map((inv) => inv.id);

    const payments = await prisma.feePayment.findMany({
      where: { tenantId, invoiceId: { in: invoiceIds } },
      select: { invoiceId: true, amountPesewas: true },
    });

    const paidByInvoice = new Map<string, number>();
    for (const p of payments) {
      paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + (p.amountPesewas ?? 0));
    }

    const result = invoices.map((inv) => {
      const billedPesewas = (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0);
      const paidPesewas = paidByInvoice.get(inv.id) ?? 0;
      const outstandingPesewas = Math.max(billedPesewas - paidPesewas, 0);

      return {
        id: inv.id,
        term: inv.term,
        academicYear: inv.academicYear,
        note: inv.note,
        billed: billedPesewas / 100,
        paid: paidPesewas / 100,
        outstanding: outstandingPesewas / 100,
        createdAt: inv.createdAt.toISOString(),
      };
    });

    return NextResponse.json(
      { ok: true, tenantId, studentId, invoices: result },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/headteacher/students/fees-detail", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error while loading learner fee invoices." },
      { status: 500 }
    );
  }
}
