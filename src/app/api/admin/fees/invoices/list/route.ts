// src/app/api/admin/fees/invoices/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const term = url.searchParams.get("term");
  const academicYear = url.searchParams.get("academicYear");
  const classroomId = url.searchParams.get("classroomId");

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }

  try {
    // Use 'any' to sidestep TS complaining about new models if the client types lag
    const client = prisma as any;

    // 1) Load students for this tenant (optionally filtered by classroom)
    const studentWhere: any = { tenantId };
    if (classroomId) {
      studentWhere.classroomId = classroomId;
    }

    const students = await client.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroomId: true,
        guardianPhone: true,
      },
    });

    const studentMap = new Map<
      string,
      {
        id: string;
        firstName: string | null;
        lastName: string | null;
        classroomId: string | null;
        guardianPhone: string | null;
      }
    >();

    for (const s of students) {
      studentMap.set(s.id, {
        id: s.id,
        firstName: s.firstName ?? null,
        lastName: s.lastName ?? null,
        classroomId: s.classroomId ?? null,
        guardianPhone: s.guardianPhone ?? null,
      });
    }

    // If classroomId was specified but there are no students in that class,
    // we can return an empty list early.
    if (classroomId && students.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          items: [],
        },
        { status: 200 }
      );
    }

    // 2) Load classrooms (for pretty labels)
    const classrooms = await client.classroom.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    });

    const classroomMap = new Map<
      string,
      { id: string; name: string | null; grade: string | null; arm: string | null }
    >();

    for (const c of classrooms) {
      classroomMap.set(c.id, {
        id: c.id,
        name: c.name ?? null,
        grade: c.grade ?? null,
        arm: c.arm ?? null,
      });
    }

    // 3) Load invoices for this tenant/term/year (and optionally only those students)
    const invoiceWhere: any = { tenantId };
    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;

    if (classroomId) {
      // Limit invoices to those whose studentId is in this classroom
      const ids = students.map((s: { id: string }) => s.id);
      // If no students, we already returned above, but keep this safe:
      if (ids.length === 0) {
        return NextResponse.json(
          {
            ok: true,
            items: [],
          },
          { status: 200 }
        );
      }
      invoiceWhere.studentId = { in: ids };
    }

    const invoices = await client.feeInvoice.findMany({
      where: invoiceWhere,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        tenantId: true,
        studentId: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          items: [],
        },
        { status: 200 }
      );
    }

    // 4) Load payments for these invoices, to compute totals
    const invoiceIds = invoices.map((inv: any) => inv.id);
    const payments = await client.feePayment.findMany({
      where: {
        tenantId,
        invoiceId: { in: invoiceIds },
      },
      select: {
        invoiceId: true,
        amountPesewas: true,
        paidAt: true,
      },
    });

    const paymentsByInvoice = new Map<
      string,
      { amountPesewas: number; paidAt: Date | null }[]
    >();

    for (const p of payments) {
      const key = p.invoiceId as string;
      if (!paymentsByInvoice.has(key)) {
        paymentsByInvoice.set(key, []);
      }
      paymentsByInvoice.get(key)!.push({
        amountPesewas: p.amountPesewas ?? 0,
        paidAt: p.paidAt ?? null,
      });
    }

    // 5) Shape data for the UI – NOTE: names match AdminFeesInvoicesPage
    const items = invoices.map((inv: any) => {
      const student = inv.studentId
        ? studentMap.get(inv.studentId as string)
        : undefined;

      const classroom =
        student?.classroomId && classroomMap.get(student.classroomId);

      let classLabel: string | null = null;
      if (classroom) {
        if (classroom.name) {
          classLabel = classroom.name;
        } else {
          const parts = [classroom.grade, classroom.arm].filter(Boolean);
          classLabel = parts.join(" ");
        }
      }

      const studentName = student
        ? [student.firstName, student.lastName].filter(Boolean).join(" ")
        : "Unknown learner";

      const invoicePayments = paymentsByInvoice.get(inv.id as string) ?? [];
      const totalPaid = invoicePayments.reduce(
        (sum, p) => sum + (p.amountPesewas ?? 0),
        0
      );

      let lastPaymentAt: string | null = null;
      if (invoicePayments.length > 0) {
        const latest = invoicePayments.reduce((latest: Date | null, p) => {
          if (!p.paidAt) return latest;
          if (!latest) return p.paidAt;
          return p.paidAt > latest ? p.paidAt : latest;
        }, null as Date | null);
        if (latest) lastPaymentAt = latest.toISOString();
      }

      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;
      const balance = billed - waived - totalPaid;

      return {
        // 🔑 Field names matching your React type
        invoiceId: inv.id as string,
        studentId: inv.studentId as string,
        studentName,
        classLabel,
        term: inv.term as string,
        academicYear: inv.academicYear as string,
        amountBilledPesewas: billed,
        totalPaidPesewas: totalPaid,
        balancePesewas: balance,
        lastPaymentAt,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ADMIN_FEE_INVOICES_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load fee invoices from the database. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
