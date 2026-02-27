// src/app/api/parent/student/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cedis(pesewas: number) {
  return Number(((pesewas ?? 0) / 100).toFixed(2));
}

export async function GET(req: NextRequest) {
  const auth = requireParentSession(req);
  if (!auth.ok) return auth.res;

  const { tenantId, guardianPhoneE164, guardianSuffix9 } = auth.session;

  const url = new URL(req.url);
  const studentId = String(url.searchParams.get("studentId") ?? "").trim();
  if (!studentId) return noStoreJson(400, { ok: false, error: "studentId is required." });

  // 1) Student + ownership
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, status: StudentStatus.ACTIVE },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      guardianSmsOptIn: true,
      note: true,
      createdAt: true,
    },
  });

  if (!student) return noStoreJson(404, { ok: false, error: "STUDENT_NOT_FOUND" });

  const owned =
    (guardianPhoneE164 && student.guardianPhoneNorm === guardianPhoneE164) ||
    (guardianSuffix9 &&
      (student.guardianPhoneNorm?.endsWith(guardianSuffix9) ||
        student.guardianPhone?.endsWith(guardianSuffix9))) ||
    false;

  if (!owned) return noStoreJson(403, { ok: false, error: "FORBIDDEN_GUARDIAN_MISMATCH" });

  // 2) Fees (best-effort, stable for MVP)
  const client: any = prisma as any;

  let invoices: any[] = [];
  try {
    invoices = await client.feeInvoice.findMany({
      where: { tenantId, studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        term: true,
        academicYear: true,
        note: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
    });
  } catch (e) {
    console.error("[PARENT_STUDENT_SUMMARY_FEES_INVOICE_QUERY_ERROR]", e);
    invoices = [];
  }

  const invoiceIds = invoices.map((x) => x.id);

  let payments: any[] = [];
  if (invoiceIds.length) {
    try {
      payments = await client.feePayment.findMany({
        where: { tenantId, invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, amountPesewas: true },
      });
    } catch (e) {
      console.error("[PARENT_STUDENT_SUMMARY_FEES_PAYMENT_QUERY_ERROR]", e);
      payments = [];
    }
  }

  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    const k = String(p.invoiceId);
    const prev = paidByInvoice.get(k) ?? 0;
    paidByInvoice.set(k, prev + (p.amountPesewas ?? 0));
  }

  const invoicesUi = invoices.map((inv) => {
    const billed = (inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0);
    const paid = paidByInvoice.get(String(inv.id)) ?? 0;
    const outstanding = Math.max(0, billed - paid);

    return {
      id: String(inv.id),
      term: String(inv.term ?? ""),
      academicYear: String(inv.academicYear ?? ""),
      note: inv.note ?? null,
      billed: cedis(billed),
      paid: cedis(paid),
      outstanding: cedis(outstanding),
      createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt ?? ""),
    };
  });

  const totalBilledPesewas = invoices.reduce(
    (sum, inv) => sum + ((inv.totalBilledPesewas ?? 0) - (inv.totalWaivedPesewas ?? 0)),
    0
  );
  const totalPaidPesewas = payments.reduce((sum, p) => sum + (p.amountPesewas ?? 0), 0);
  const totalOutstandingPesewas = Math.max(0, totalBilledPesewas - totalPaidPesewas);

  // 3) Attendance (last 60 marks summary)
  let present = 0;
  let absent = 0;
  let late = 0;
  let other = 0;
  let totalMarks = 0;

  try {
    const marks = await client.attendanceMark.findMany({
      where: { studentId: student.id, session: { tenantId } },
      select: { status: true },
      take: 60,
    });

    totalMarks = marks.length;

    for (const m of marks) {
      const s = String(m.status);
      if (s === "PRESENT") present++;
      else if (s === "ABSENT") absent++;
      else if (s === "LATE") late++;
      else other++;
    }
  } catch (e) {
    // soft-fail: attendance models may not exist yet on some tenants
    console.error("[PARENT_STUDENT_SUMMARY_ATTENDANCE_QUERY_ERROR]", e);
  }

  const attendanceRate =
    totalMarks > 0 ? Number((present / totalMarks).toFixed(4)) : null; // 0..1 for your UI (it multiplies by 100)

  return noStoreJson(200, {
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
    fees: {
      invoiceCount: invoicesUi.length,
      totalBilled: cedis(totalBilledPesewas),
      totalPaid: cedis(totalPaidPesewas),
      totalOutstanding: cedis(totalOutstandingPesewas),
      invoices: invoicesUi,
    },
    attendance: {
      present,
      absent,
      late,
      other,
      totalMarks,
      attendanceRate,
    },
  });
}