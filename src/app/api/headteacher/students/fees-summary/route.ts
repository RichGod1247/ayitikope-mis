// src/app/api/headteacher/students/fees-summary/route.ts

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
        {
          ok: false,
          error: "No tenant membership found for this user",
        },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Load fee invoices for this tenant
    // Based on your schema:
    // FeeInvoice:
    //   - id, tenantId, studentId, totalBilledPesewas, totalWaivedPesewas, ...
    const feeInvoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (feeInvoices.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
          byStudent: {},
        },
        { status: 200 }
      );
    }

    const invoiceIds = feeInvoices.map((inv) => inv.id);

    // Build a quick lookup from invoiceId -> invoice object
    const invoiceById = new Map<
      string,
      {
        id: string;
        studentId: string | null;
        totalBilledPesewas: number | null;
        totalWaivedPesewas: number | null;
      }
    >();

    for (const inv of feeInvoices) {
      invoiceById.set(inv.id, inv);
    }

    // 4) Load payments for those invoices
    // FeePayment:
    //   - id, tenantId, invoiceId, amountPesewas, ...
    const feePayments = await prisma.feePayment.findMany({
      where: {
        tenantId,
        invoiceId: {
          in: invoiceIds,
        },
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

    function ensureStudent(id: string): StudentAgg {
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
    }

    // 5) Aggregate billed (invoice side)
    for (const inv of feeInvoices) {
      const studentId = inv.studentId;
      if (!studentId) continue;

      const billed =
        (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0);

      const agg = ensureStudent(studentId);
      agg.billedPesewas += billed;
      agg.invoiceCount += 1;
    }

    // 6) Aggregate paid (payment side)
    for (const pay of feePayments) {
      const inv = invoiceById.get(pay.invoiceId);
      if (!inv || !inv.studentId) continue;

      const studentId = inv.studentId;
      const amt = pay.amountPesewas ?? 0;

      const agg = ensureStudent(studentId);
      agg.paidPesewas += amt;
    }

    // 7) Finalise outstanding + GH₵ conversions
    for (const [studentId, agg] of Object.entries(byStudent)) {
      agg.outstandingPesewas = Math.max(
        agg.billedPesewas - agg.paidPesewas,
        0
      );
      agg.billed = agg.billedPesewas / 100;
      agg.paid = agg.paidPesewas / 100;
      agg.outstanding = agg.outstandingPesewas / 100;
    }

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        byStudent,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/students/fees-summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading per-learner fees summary.",
      },
      { status: 500 }
    );
  }
}
