// src/app/api/headteacher/students/fees-detail/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required" },
        { status: 400 }
      );
    }

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

    // 3) Load invoices for this learner & tenant
    // Based on your schema:
    // FeeInvoice:
    //   - id, tenantId, studentId, term, academicYear,
    //     totalBilledPesewas, totalWaivedPesewas, note, createdAt
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId,
        studentId,
      },
      select: {
        id: true,
        term: true,
        academicYear: true,
        note: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
          studentId,
          invoices: [],
        },
        { status: 200 }
      );
    }

    const invoiceIds = invoices.map((inv) => inv.id);

    // 4) Load payments for these invoices
    // FeePayment:
    //   - id, tenantId, invoiceId, amountPesewas, paidAt
    const payments = await prisma.feePayment.findMany({
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

    const paidByInvoice = new Map<string, number>();
    for (const p of payments) {
      const prev = paidByInvoice.get(p.invoiceId) ?? 0;
      paidByInvoice.set(
        p.invoiceId,
        prev + (p.amountPesewas ?? 0)
      );
    }

    const result = invoices.map((inv) => {
      const billedPesewas =
        (inv.totalBilledPesewas ?? 0) -
        (inv.totalWaivedPesewas ?? 0);
      const paidPesewas = paidByInvoice.get(inv.id) ?? 0;
      const outstandingPesewas = Math.max(
        billedPesewas - paidPesewas,
        0
      );

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
      {
        ok: true,
        tenantId,
        studentId,
        invoices: result,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/students/fees-detail",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading learner fee invoices.",
      },
      { status: 500 }
    );
  }
}
