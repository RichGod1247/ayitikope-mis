// src/app/api/parent/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function phoneMatches(a: string, b: string) {
  const A = normalisePhone(a);
  const B = normalisePhone(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalisePhone(u?.phone ?? u?.phoneNumber ?? "");

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  const roleName = String(membership.role?.name ?? "").trim();
  return { ok: true as const, userId, tenantId, roleName, userPhone };
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status, headers: { "cache-control": "no-store" } }
      );
    }

    const url = new URL(req.url);

    // Backward compat only. Real tenantId comes from session.
    const tenantIdParam = String(url.searchParams.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (tenant mismatch)." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const term = String(url.searchParams.get("term") || "1st Term").trim();
    const academicYear = String(url.searchParams.get("academicYear") || "2025/2026").trim();

    // guardianPhone rules:
    // - PARENT: must match session phone (or omitted -> we use session phone)
    // - ADMINISH: may provide guardianPhone for support/debug
    // - TEACHER: forbidden
    const guardianPhoneParam = String(url.searchParams.get("guardianPhone") || "").trim();
    const guardianPhoneDigits = normalisePhone(guardianPhoneParam);

    let guardianPhoneForQuery = "";

    if (ctx.roleName === "PARENT") {
      if (!ctx.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }

      if (guardianPhoneParam && !phoneMatches(ctx.userPhone, guardianPhoneDigits)) {
        return NextResponse.json(
          { ok: false, error: "Forbidden (guardianPhone mismatch)." },
          { status: 403, headers: { "cache-control": "no-store" } }
        );
      }

      guardianPhoneForQuery = ctx.userPhone;
    } else if (ADMINISH.has(ctx.roleName)) {
      if (!guardianPhoneDigits) {
        return NextResponse.json(
          { ok: false, error: "guardianPhone is required for admin support view." },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
      guardianPhoneForQuery = guardianPhoneDigits;
    } else {
      // TEACHER and others blocked
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const client = prisma as any;
    const tenantId = ctx.tenantId;

    // For matching phone formats (+233 / 0...), we query by suffix (last 9 digits)
    const suffix = guardianPhoneForQuery.length >= 9 ? guardianPhoneForQuery.slice(-9) : guardianPhoneForQuery;

    const students = await client.student.findMany({
      where: {
        tenantId,
        OR: [
          { guardianPhone: { endsWith: suffix } },
          { guardianPhone: guardianPhoneForQuery },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroom: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    });

    if (!students.length) {
      return NextResponse.json(
        { ok: true, guardianPhone: guardianPhoneForQuery, meta: { term, academicYear }, students: [] },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const studentIds = students.map((s: any) => s.id);

    const invoices = await client.feeInvoice.findMany({
      where: { tenantId, studentId: { in: studentIds }, term, academicYear },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const invoiceIds = invoices.map((inv: any) => inv.id);

    let payments: any[] = [];
    if (invoiceIds.length) {
      payments = await client.feePayment.findMany({
        where: { tenantId, invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, amountPesewas: true, paidAt: true },
        orderBy: { paidAt: "asc" },
      });
    }

    const healthRows = await client.studentHealthDaily.findMany({
      where: { tenantId, studentId: { in: studentIds } },
      orderBy: { date: "desc" },
      take: studentIds.length * 5,
    });

    const paymentByInvoice = new Map<string, { totalPaid: number; lastPaymentAmount: number | null; lastPaidAt: Date | null }>();
    for (const p of payments) {
      const key = String(p.invoiceId);
      const prev = paymentByInvoice.get(key) ?? { totalPaid: 0, lastPaymentAmount: null, lastPaidAt: null };

      const amt = p.amountPesewas ?? 0;
      const paidAt = p.paidAt ? new Date(p.paidAt) : null;

      let lastAmt = prev.lastPaymentAmount;
      let lastAt = prev.lastPaidAt;

      if (paidAt && (!lastAt || paidAt > lastAt)) {
        lastAmt = amt;
        lastAt = paidAt;
      }

      paymentByInvoice.set(key, { totalPaid: prev.totalPaid + amt, lastPaymentAmount: lastAmt, lastPaidAt: lastAt });
    }

    const healthByStudent = new Map<string, { lastDate: string; temperatureC: number | null; symptoms: string | null; notes: string | null }>();
    for (const h of healthRows) {
      const sid = String(h.studentId);
      if (!healthByStudent.has(sid)) {
        healthByStudent.set(sid, {
          lastDate: h.date ? new Date(h.date).toISOString() : "",
          temperatureC: h.temperatureC ?? null,
          symptoms: h.symptoms ?? null,
          notes: h.notes ?? null,
        });
      }
    }

    const invoicesByStudent = new Map<
      string,
      { totalBilledPesewas: number; totalWaivedPesewas: number; totalPaidPesewas: number; lastPaymentAmountPesewas: number | null; lastPaymentAt: string | null }
    >();

    for (const inv of invoices) {
      const sid = String(inv.studentId);
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;

      const pay = paymentByInvoice.get(String(inv.id)) ?? { totalPaid: 0, lastPaymentAmount: null, lastPaidAt: null };

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

    const resultStudents = students.map((s: any) => {
      const sid = String(s.id);
      const fee = invoicesByStudent.get(sid) ?? {
        totalBilledPesewas: 0,
        totalWaivedPesewas: 0,
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null,
        lastPaymentAt: null,
      };

      const balance = fee.totalBilledPesewas - fee.totalWaivedPesewas - fee.totalPaidPesewas;
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

    return NextResponse.json(
      { ok: true, guardianPhone: guardianPhoneForQuery, meta: { term, academicYear }, students: resultStudents },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_OVERVIEW_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load parent overview. Please try again or contact the school office." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
