// src/app/api/parent/fees/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function suffix9(phone: string) {
  const d = normalisePhone(phone);
  if (!d) return "";
  return d.slice(-9);
}

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalisePhone(u?.phone ?? u?.phoneNumber ?? u?.guardianPhone ?? "");

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return {
    ok: true as const,
    userId,
    tenantId,
    roleName: String(membership.role?.name ?? "").trim(),
    userPhone,
  };
}

/**
 * GET /api/parent/fees/summary?guardianPhone=...&term=...&academicYear=...&tenantId=...
 *
 * 🔒 tenantId from session (tenantId param backward-compat only)
 * 🔒 PARENT: guardianPhone forced to session phone
 * 🔒 ADMINISH: can pass guardianPhone to support-view
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSafeTenantCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status, headers: { "cache-control": "no-store" } }
      );
    }

    const isParent = ctx.roleName === "PARENT";
    const isAdminish = ADMINISH.has(ctx.roleName);

    if (!isParent && !isAdminish) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const url = new URL(req.url);
    const q = url.searchParams;

    // Backward compat only
    const tenantIdParam = String(q.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (tenant mismatch)." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const term = String(q.get("term") || DEFAULT_TERM).trim();
    const academicYear = String(q.get("academicYear") || DEFAULT_ACADEMIC_YEAR).trim();

    const guardianPhoneParam = String(q.get("guardianPhone") || "").trim();

    let guardianPhone = "";
    if (isParent) {
      if (!ctx.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }

      // If they passed guardianPhone, it must match
      if (guardianPhoneParam) {
        const p = normalisePhone(guardianPhoneParam);
        if (p && p !== ctx.userPhone && !p.endsWith(ctx.userPhone) && !ctx.userPhone.endsWith(p)) {
          return NextResponse.json(
            { ok: false, error: "Forbidden (guardianPhone mismatch)." },
            { status: 403, headers: { "cache-control": "no-store" } }
          );
        }
      }

      guardianPhone = ctx.userPhone;
    } else {
      guardianPhone = normalisePhone(guardianPhoneParam);
      if (!guardianPhone) {
        return NextResponse.json(
          { ok: false, error: "guardianPhone is required." },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
    }

    const s9 = suffix9(guardianPhone);
    if (!s9) {
      return NextResponse.json(
        { ok: false, error: "guardianPhone is invalid." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    const client = prisma as any;
    const tenantId = ctx.tenantId;

    // 1) Students under guardian
    const students = await client.student.findMany({
      where: { tenantId, guardianPhone: { endsWith: s9 } },
      select: { id: true, firstName: true, lastName: true, classroom: { select: { name: true } } },
      orderBy: { firstName: "asc" },
    });

    if (!students || students.length === 0) {
      return NextResponse.json(
        { ok: true, tenantId, guardianPhone, term, academicYear, count: 0, students: [] },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const studentIds = students.map((s: any) => s.id);

    // 2) Invoices for term/year
    const invoices = await client.feeInvoice.findMany({
      where: { tenantId, term, academicYear, studentId: { in: studentIds } },
      select: { id: true, studentId: true, totalBilledPesewas: true, totalWaivedPesewas: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
          guardianPhone,
          term,
          academicYear,
          count: students.length,
          students: students.map((s: any) => ({
            id: String(s.id),
            name: [s.lastName, s.firstName].filter(Boolean).join(" ").trim() || "—",
            classroomName: s.classroom?.name ?? null,
            fees: {
              totalBilledPesewas: 0,
              totalWaivedPesewas: 0,
              totalPaidPesewas: 0,
              outstandingPesewas: 0,
              lastPaymentAmountPesewas: null,
              lastPaymentDate: null,
            },
          })),
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const invoiceIds = invoices.map((inv: any) => inv.id);

    // 3) Payments for those invoices
    const payments =
      invoiceIds.length === 0
        ? []
        : await client.feePayment.findMany({
            where: { tenantId, invoiceId: { in: invoiceIds } },
            select: { invoiceId: true, amountPesewas: true, paidAt: true },
            orderBy: { paidAt: "asc" },
          });

    const paymentsByInvoice = new Map<
      string,
      { totalPaidPesewas: number; lastPaymentAmountPesewas: number | null; lastPaymentDate: Date | null }
    >();

    for (const p of payments) {
      const prev = paymentsByInvoice.get(p.invoiceId) ?? {
        totalPaidPesewas: 0,
        lastPaymentAmountPesewas: null,
        lastPaymentDate: null,
      };

      const amt = p.amountPesewas ?? 0;
      prev.totalPaidPesewas += amt;

      if (p.paidAt && (!prev.lastPaymentDate || p.paidAt > prev.lastPaymentDate)) {
        prev.lastPaymentDate = p.paidAt;
        prev.lastPaymentAmountPesewas = amt;
      }

      paymentsByInvoice.set(p.invoiceId, prev);
    }

    // 4) Aggregate per student
    type StudentAgg = {
      totalBilledPesewas: number;
      totalWaivedPesewas: number;
      totalPaidPesewas: number;
      lastPaymentAmountPesewas: number | null;
      lastPaymentDate: Date | null;
    };

    const aggByStudent = new Map<string, StudentAgg>();

    for (const inv of invoices) {
      const cur =
        aggByStudent.get(inv.studentId) ?? {
          totalBilledPesewas: 0,
          totalWaivedPesewas: 0,
          totalPaidPesewas: 0,
          lastPaymentAmountPesewas: null,
          lastPaymentDate: null,
        };

      cur.totalBilledPesewas += inv.totalBilledPesewas ?? 0;
      cur.totalWaivedPesewas += inv.totalWaivedPesewas ?? 0;

      const pay = paymentsByInvoice.get(inv.id);
      if (pay) {
        cur.totalPaidPesewas += pay.totalPaidPesewas ?? 0;

        if (pay.lastPaymentDate && (!cur.lastPaymentDate || pay.lastPaymentDate > cur.lastPaymentDate)) {
          cur.lastPaymentDate = pay.lastPaymentDate;
          cur.lastPaymentAmountPesewas = pay.lastPaymentAmountPesewas ?? null;
        }
      }

      aggByStudent.set(inv.studentId, cur);
    }

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        guardianPhone,
        term,
        academicYear,
        count: students.length,
        students: students.map((s: any) => {
          const agg =
            aggByStudent.get(s.id) ?? {
              totalBilledPesewas: 0,
              totalWaivedPesewas: 0,
              totalPaidPesewas: 0,
              lastPaymentAmountPesewas: null,
              lastPaymentDate: null,
            };

          const outstanding = (agg.totalBilledPesewas ?? 0) - (agg.totalWaivedPesewas ?? 0) - (agg.totalPaidPesewas ?? 0);

          return {
            id: String(s.id),
            name: [s.lastName, s.firstName].filter(Boolean).join(" ").trim() || "—",
            classroomName: s.classroom?.name ?? null,
            fees: {
              totalBilledPesewas: agg.totalBilledPesewas,
              totalWaivedPesewas: agg.totalWaivedPesewas,
              totalPaidPesewas: agg.totalPaidPesewas,
              outstandingPesewas: outstanding < 0 ? 0 : outstanding,
              lastPaymentAmountPesewas: agg.lastPaymentAmountPesewas,
              lastPaymentDate: agg.lastPaymentDate ? agg.lastPaymentDate.toISOString() : null,
            },
          };
        }),
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_FEES_SUMMARY_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error while loading parent fees summary." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
