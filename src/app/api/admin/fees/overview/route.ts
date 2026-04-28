// src/app/api/admin/fees/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cedis(pesewas: number) {
  return Math.round(pesewas) / 100;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { tenantId } = auth.ctx;
  const url = new URL(req.url);
  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const classroomId = url.searchParams.get("classroomId")?.trim() || null;

  const invoiceWhere = {
    tenantId,
    ...(term ? { term } : {}),
    ...(academicYear ? { academicYear } : {}),
  };

  // If classroomId filter: get student IDs in that class first
  let studentIdFilter: string[] | null = null;
  if (classroomId) {
    const ss = await prisma.student.findMany({
      where: { tenantId, classroomId },
      select: { id: true },
      take: 6000,
    });
    studentIdFilter = ss.map((s) => s.id);
    if (studentIdFilter.length === 0) {
      return json(200, { ok: true, tenantId, term, academicYear, summary: { count: 0, totalBilledPesewas: 0, totalWaivedPesewas: 0, totalPaidPesewas: 0, outstandingPesewas: 0, clearedCount: 0, partialCount: 0, unpaidCount: 0 }, rows: [] });
    }
  }

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      ...invoiceWhere,
      ...(studentIdFilter ? { studentId: { in: studentIdFilter } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      term: true,
      academicYear: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  if (invoices.length === 0) {
    return json(200, { ok: true, tenantId, term, academicYear, summary: { count: 0, totalBilledPesewas: 0, totalWaivedPesewas: 0, totalPaidPesewas: 0, outstandingPesewas: 0, clearedCount: 0, partialCount: 0, unpaidCount: 0 }, rows: [] });
  }

  const invoiceIds = invoices.map((i) => i.id);

  // Payments per invoice
  const paymentGroups = await prisma.feePayment.groupBy({
    by: ["invoiceId"],
    where: { tenantId, invoiceId: { in: invoiceIds } },
    _sum: { amountPesewas: true },
  });
  const paidByInvoice = new Map(paymentGroups.map((g) => [g.invoiceId, g._sum.amountPesewas ?? 0]));

  // Students + classrooms
  const studentIds = [...new Set(invoices.map((i) => i.studentId))];
  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true, classroomId: true },
    take: 6000,
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const classroomIds = [...new Set(students.map((s) => s.classroomId).filter(Boolean))] as string[];
  const classrooms = classroomIds.length
    ? await prisma.classroom.findMany({
        where: { tenantId, id: { in: classroomIds } },
        select: { id: true, name: true, grade: true, arm: true },
      })
    : [];
  const classroomMap = new Map(classrooms.map((c) => [c.id, c]));

  type Row = {
    invoiceId: string;
    studentId: string;
    studentName: string;
    classLabel: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    term: string;
    academicYear: string;
    billedPesewas: number;
    waivedPesewas: number;
    paidPesewas: number;
    outstandingPesewas: number;
    status: "cleared" | "partial" | "unpaid";
  };

  const rows: Row[] = [];
  let totalBilledPesewas = 0;
  let totalWaivedPesewas = 0;
  let totalPaidPesewas = 0;
  let clearedCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const inv of invoices) {
    const billed = inv.totalBilledPesewas ?? 0;
    const waived = inv.totalWaivedPesewas ?? 0;
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const outstanding = Math.max(0, billed - waived - paid);

    totalBilledPesewas += billed;
    totalWaivedPesewas += waived;
    totalPaidPesewas += paid;

    const status: "cleared" | "partial" | "unpaid" =
      outstanding <= 0 && billed > 0 ? "cleared" : paid > 0 ? "partial" : "unpaid";

    if (status === "cleared") clearedCount++;
    else if (status === "partial") partialCount++;
    else unpaidCount++;

    const s = inv.studentId ? studentMap.get(inv.studentId) : null;
    const cls = s?.classroomId ? classroomMap.get(s.classroomId) : null;
    const classLabel = cls?.name ?? (cls ? [cls.grade, cls.arm].filter(Boolean).join(" ") : null);

    rows.push({
      invoiceId: inv.id,
      studentId: inv.studentId,
      studentName: s ? [s.firstName, s.lastName].filter(Boolean).join(" ") || "—" : "—",
      classLabel,
      guardianName: s?.guardianName ?? null,
      guardianPhone: s?.guardianPhone ?? null,
      term: inv.term,
      academicYear: inv.academicYear,
      billedPesewas: billed,
      waivedPesewas: waived,
      paidPesewas: paid,
      outstandingPesewas: outstanding,
      status,
    });
  }

  rows.sort((a, b) => (b.outstandingPesewas ?? 0) - (a.outstandingPesewas ?? 0));

  return json(200, {
    ok: true,
    tenantId,
    term,
    academicYear,
    summary: {
      count: rows.length,
      totalBilledPesewas,
      totalWaivedPesewas,
      totalPaidPesewas,
      outstandingPesewas: Math.max(0, totalBilledPesewas - totalWaivedPesewas - totalPaidPesewas),
      clearedCount,
      partialCount,
      unpaidCount,
      // cedis convenience fields
      totalBilledCedis: cedis(totalBilledPesewas),
      totalWaivedCedis: cedis(totalWaivedPesewas),
      totalPaidCedis: cedis(totalPaidPesewas),
      outstandingCedis: cedis(Math.max(0, totalBilledPesewas - totalWaivedPesewas - totalPaidPesewas)),
    },
    rows,
  });
}
