// src/app/api/parent/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = (url.searchParams.get("tenantId") || "").trim();
    const guardianPhone = (url.searchParams.get("guardianPhone") || "").trim();
    const term = (url.searchParams.get("term") || "").trim();
    const academicYear = (url.searchParams.get("academicYear") || "").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!guardianPhone) {
      return NextResponse.json(
        { ok: false, error: "guardianPhone is required." },
        { status: 400 }
      );
    }

    if (!term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error: "term and academicYear are required.",
        },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // 1) Find all learners under this guardian phone
    const students = await client.student.findMany({
      where: {
        tenantId,
        guardianPhone,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroom: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        firstName: "asc",
      },
    });

    if (!students || students.length === 0) {
      return NextResponse.json({
        ok: true,
        guardianPhone,
        meta: { term, academicYear },
        students: [],
      });
    }

    const studentIds = students.map((s: any) => s.id);

    // 2) Fee invoices for these learners in this term / year
    const invoices = await client.feeInvoice.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        term,
        academicYear,
      },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const invoiceIds = invoices.map((inv: any) => inv.id);

    // 3) Payments for these invoices
    let payments: any[] = [];
    if (invoiceIds.length > 0) {
      payments = await client.feePayment.findMany({
        where: {
          tenantId,
          invoiceId: { in: invoiceIds },
        },
        select: {
          invoiceId: true,
          amountPesewas: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: "asc",
        },
      });
    }

    // 4) Latest health reading per learner
    const healthRows = await client.studentHealthDaily.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
      },
      orderBy: {
        date: "desc",
      },
      // simple cap; we'll reduce to last per learner in JS
      take: studentIds.length * 5,
    });

    // --- Build maps for quick lookup ---

    // Map invoiceId -> { totalPaid, lastPayment }
    const paymentByInvoice = new Map<
      string,
      { totalPaid: number; lastPaymentAmount: number | null; lastPaidAt: Date | null }
    >();

    for (const p of payments) {
      const key = p.invoiceId as string;
      const prev = paymentByInvoice.get(key) ?? {
        totalPaid: 0,
        lastPaymentAmount: null,
        lastPaidAt: null,
      };

      const amt = p.amountPesewas ?? 0;
      const paidAt = p.paidAt ? new Date(p.paidAt) : null;

      let nextLastAmount = prev.lastPaymentAmount;
      let nextLastPaidAt = prev.lastPaidAt;

      if (paidAt && (!prev.lastPaidAt || paidAt > prev.lastPaidAt)) {
        nextLastAmount = amt;
        nextLastPaidAt = paidAt;
      }

      paymentByInvoice.set(key, {
        totalPaid: prev.totalPaid + amt,
        lastPaymentAmount: nextLastAmount,
        lastPaidAt: nextLastPaidAt,
      });
    }

    // Map studentId -> health summary (last record only)
    const healthByStudent = new Map<
      string,
      {
        lastDate: string;
        temperatureC: number | null;
        symptoms: string | null;
        notes: string | null;
      }
    >();

    for (const h of healthRows) {
      const sid = h.studentId as string;
      if (!healthByStudent.has(sid)) {
        healthByStudent.set(sid, {
          lastDate: h.date ? new Date(h.date).toISOString() : "",
          temperatureC: h.temperatureC ?? null,
          symptoms: h.symptoms ?? null,
          notes: h.notes ?? null,
        });
      }
    }

    // Map studentId -> invoice summaries
    const invoicesByStudent = new Map<
      string,
      {
        totalBilledPesewas: number;
        totalWaivedPesewas: number;
        totalPaidPesewas: number;
        lastPaymentAmountPesewas: number | null;
        lastPaymentAt: string | null;
      }
    >();

    for (const inv of invoices) {
      const sid = inv.studentId as string;
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;

      const pay = paymentByInvoice.get(inv.id) ?? {
        totalPaid: 0,
        lastPaymentAmount: null,
        lastPaidAt: null,
      };

      const prev = invoicesByStudent.get(sid) ?? {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null as number | null,
        lastPaymentAt: null as string | null,
      };

      let lastAmount = prev.lastPaymentAmountPesewas;
      let lastAt = prev.lastPaymentAt ? new Date(prev.lastPaymentAt) : null;

      if (pay.lastPaidAt) {
        if (!lastAt || pay.lastPaidAt > lastAt) {
          lastAmount = pay.lastPaymentAmount;
          lastAt = pay.lastPaidAt;
        }
      }

      invoicesByStudent.set(sid, {
        totalBilledPesewas: prev.totalBilledPesewas + billed,
        totalWaivedPesewas: prev.totalWaivedPesewas + waived,
        totalPaidPesewas: prev.totalPaidPesewas + pay.totalPaid,
        lastPaymentAmountPesewas: lastAmount,
        lastPaymentAt: lastAt ? lastAt.toISOString() : prev.lastPaymentAt,
      });
    }

    // Final shaped response per learner
    const resultStudents = students.map((s: any) => {
      const sid = s.id as string;
      const fee = invoicesByStudent.get(sid) ?? {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null as number | null,
        lastPaymentAt: null as string | null,
      };

      const balance =
        fee.totalBilledPesewas - fee.totalWaivedPesewas - fee.totalPaidPesewas;

      const health = healthByStudent.get(sid) ?? null;

      return {
        id: sid,
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        classroomName: s.classroom?.name ?? null,
        fees: {
          term,
          academicYear,
          totalBilledPesewas: fee.totalBilledPesewas,
          totalWaivedPesewas: fee.totalWaivedPesewas,
          totalPaidPesewas: fee.totalPaidPesewas,
          balancePesewas: balance,
          lastPaymentAmountPesewas: fee.lastPaymentAmountPesewas,
          lastPaymentAt: fee.lastPaymentAt,
        },
        health: health,
      };
    });

    return NextResponse.json({
      ok: true,
      guardianPhone,
      meta: { term, academicYear },
      students: resultStudents,
    });
  } catch (err) {
    console.error("[PARENT_OVERVIEW_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load parent overview. Please try again or contact the school office.",
      },
      { status: 500 }
    );
  }
}
