// src/app/api/parent/student/summary/route.ts

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

    // 1) Ensure user is signed in (later: proper parent <-> student link)
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

    // 3) Load the student (for this tenant) – keep it simple & safe
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        note: true,
        createdAt: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Learner not found for this school. Please check the link or contact the office.",
        },
        { status: 404 }
      );
    }

    // 4) Fees: invoices + payments for this learner
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

    let totalBilledPesewas = 0;
    const invoiceIds = invoices.map((inv) => inv.id);

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

    const invoiceSummaries = invoices.map((inv) => {
      const billedPesewas =
        (inv.totalBilledPesewas ?? 0) -
        (inv.totalWaivedPesewas ?? 0);
      const paidPesewas = paidByInvoice.get(inv.id) ?? 0;
      const outstandingPesewas = Math.max(
        billedPesewas - paidPesewas,
        0
      );

      totalBilledPesewas += billedPesewas;

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

    const totalPaidPesewas = payments.reduce(
      (sum, p) => sum + (p.amountPesewas ?? 0),
      0
    );
    const totalOutstandingPesewas = Math.max(
      totalBilledPesewas - totalPaidPesewas,
      0
    );

    const feesSummary = {
      invoiceCount: invoices.length,
      totalBilled: totalBilledPesewas / 100,
      totalPaid: totalPaidPesewas / 100,
      totalOutstanding: totalOutstandingPesewas / 100,
      invoices: invoiceSummaries,
    };

    // 5) Attendance: marks for this learner
    // NOTE: AttendanceMark currently doesn't expose tenantId,
    // so we simply filter by studentId (DB is effectively single-tenant).
    const marks = await prisma.attendanceMark.findMany({
      where: {
        studentId,
      },
      select: {
        status: true,
      },
    });

    let present = 0;
    let absent = 0;
    let late = 0;
    let other = 0;

    for (const m of marks) {
      const raw = (m.status ?? "").toString().toLowerCase();

      if (raw === "present") {
        present += 1;
      } else if (raw === "absent") {
        absent += 1;
      } else if (raw === "late") {
        late += 1;
      } else {
        other += 1;
      }
    }

    const totalMarks = marks.length;
    const denom = present + absent;
    const attendanceRate = denom > 0 ? present / denom : null;

    const attendanceSummary = {
      present,
      absent,
      late,
      other,
      totalMarks,
      attendanceRate,
    };

    // 6) Final response
    return NextResponse.json(
      {
        ok: true,
        tenantId,
        student: {
          id: student.id,
          firstName: student.firstName ?? "",
          lastName: student.lastName ?? "",
          sex: student.sex ?? "",
          guardianName: student.guardianName ?? "",
          guardianPhone: student.guardianPhone ?? "",
          guardianSmsOptIn: !!student.guardianSmsOptIn,
          note: student.note ?? "",
          createdAt: student.createdAt.toISOString(),
        },
        fees: feesSummary,
        attendance: attendanceSummary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/parent/student/summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading learner summary for parent view.",
      },
      { status: 500 }
    );
  }
}
