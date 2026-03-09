// src/app/api/parent/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isValidSuffixForLookup(suffix: string) {
  const s = digitsOnly(suffix);
  return s.length >= 7;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, name: true, status: true },
    });

    if (!tenant || tenant.status !== "ACTIVE") {
      return noStoreJson(403, { ok: false, error: "TENANT_NOT_ACTIVE" });
    }

    const url = new URL(req.url);
    const term = String(url.searchParams.get("term") || "1st Term").trim();
    const academicYear = String(
      url.searchParams.get("academicYear") || "2025/2026"
    ).trim();

    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const OR: any[] = [];
    if (e164) OR.push({ guardianPhoneNorm: e164 });

    if (isValidSuffixForLookup(suffix9)) {
      OR.push({ guardianPhoneNorm: { endsWith: suffix9 } });
      OR.push({ guardianPhone: { endsWith: suffix9 } });
      OR.push({ guardianPhoneNorm: { endsWith: `233${suffix9}` } });
      OR.push({ guardianPhone: { endsWith: `233${suffix9}` } });
    }

    if (OR.length === 0) {
      return noStoreJson(200, {
        ok: true,
        guardianPhone: e164 || suffix9 || null,
        meta: { term, academicYear },
        students: [],
      });
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId: sess.tenantId,
        status: StudentStatus.ACTIVE,
        OR,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroom: {
          select: { name: true },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 200,
    });

    if (!students.length) {
      return noStoreJson(200, {
        ok: true,
        guardianPhone: e164 || suffix9 || null,
        meta: { term, academicYear },
        students: [],
      });
    }

    const studentIds = students.map((s) => s.id);

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId: sess.tenantId,
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
      orderBy: { createdAt: "asc" },
    });

    const invoiceIds = invoices.map((inv) => inv.id);

    let payments: {
      invoiceId: string;
      amountPesewas: number;
      paidAt: Date;
    }[] = [];

    if (invoiceIds.length) {
      payments = await prisma.feePayment.findMany({
        where: {
          tenantId: sess.tenantId,
          invoiceId: { in: invoiceIds },
        },
        select: {
          invoiceId: true,
          amountPesewas: true,
          paidAt: true,
        },
        orderBy: { paidAt: "asc" },
      });
    }

    const healthRows = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId: sess.tenantId,
        studentId: { in: studentIds },
      },
      orderBy: { date: "desc" },
      take: studentIds.length * 5,
    });

    const paymentByInvoice = new Map<
      string,
      {
        totalPaid: number;
        lastPaymentAmount: number | null;
        lastPaidAt: Date | null;
      }
    >();

    for (const p of payments) {
      const key = String(p.invoiceId);
      const prev = paymentByInvoice.get(key) ?? {
        totalPaid: 0,
        lastPaymentAmount: null,
        lastPaidAt: null,
      };

      const amt = p.amountPesewas ?? 0;
      const paidAt = p.paidAt ? new Date(p.paidAt) : null;

      let lastAmt = prev.lastPaymentAmount;
      let lastAt = prev.lastPaidAt;

      if (paidAt && (!lastAt || paidAt > lastAt)) {
        lastAmt = amt;
        lastAt = paidAt;
      }

      paymentByInvoice.set(key, {
        totalPaid: prev.totalPaid + amt,
        lastPaymentAmount: lastAmt,
        lastPaidAt: lastAt,
      });
    }

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
      const sid = String(h.studentId);
      if (!healthByStudent.has(sid)) {
        healthByStudent.set(sid, {
          lastDate: h.date ? new Date(h.date).toISOString() : "",
          temperatureC: h.temperatureC ? Number(h.temperatureC) : null,
          symptoms: h.symptoms ?? null,
          notes: h.notes ?? null,
        });
      }
    }

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
      const sid = String(inv.studentId);
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;

      const pay = paymentByInvoice.get(String(inv.id)) ?? {
        totalPaid: 0,
        lastPaymentAmount: null,
        lastPaidAt: null,
      };

      const prev = invoicesByStudent.get(sid) ?? {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null,
        lastPaymentAt: null,
      };

      let lastAmount = prev.lastPaymentAmountPesewas;
      let lastAt = prev.lastPaymentAt ? new Date(prev.lastPaymentAt) : null;

      if (pay.lastPaidAt && (!lastAt || pay.lastPaidAt > lastAt)) {
        lastAmount = pay.lastPaymentAmount;
        lastAt = pay.lastPaidAt;
      }

      invoicesByStudent.set(sid, {
        totalBilledPesewas: prev.totalBilledPesewas + billed,
        totalWaivedPesewas: prev.totalWaivedPesewas + waived,
        totalPaidPesewas: prev.totalPaidPesewas + pay.totalPaid,
        lastPaymentAmountPesewas: lastAmount,
        lastPaymentAt: lastAt ? lastAt.toISOString() : prev.lastPaymentAt,
      });
    }

    const resultStudents = students.map((s) => {
      const sid = String(s.id);
      const fee = invoicesByStudent.get(sid) ?? {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null,
        lastPaymentAt: null,
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
        health,
      };
    });

    return noStoreJson(200, {
      ok: true,
      guardianPhone: e164 || suffix9 || null,
      meta: { term, academicYear },
      students: resultStudents,
    });
  } catch (err) {
    console.error("[PARENT_OVERVIEW_ERROR]", err);
    return noStoreJson(500, {
      ok: false,
      error:
        "Failed to load parent overview. Please try again or contact the school office.",
    });
  }
}