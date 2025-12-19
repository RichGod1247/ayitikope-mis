// src/app/api/parent/fees/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";
const DEFAULT_DEMO_TENANT_ID =
  process.env.NEXT_PUBLIC_DEMO_TENANT_ID || "cmhhnghn00008vcpgp3fl07fl";

/**
 * GET /api/parent/fees/summary
 *
 * Query params:
 * - tenantId (optional, defaults to demo tenant)
 * - guardianPhone (required)
 * - term (optional, defaults to 1st Term)
 * - academicYear (optional, defaults to 2025/2026)
 *
 * Response:
 * {
 *   ok: true,
 *   tenantId: string,
 *   guardianPhone: string,
 *   term: string,
 *   academicYear: string,
 *   count: number,
 *   students: Array<{
 *     id: string;
 *     name: string;
 *     classroomName: string | null;
 *     fees: {
 *       totalBilledPesewas: number;
 *       totalWaivedPesewas: number;
 *       totalPaidPesewas: number;
 *       outstandingPesewas: number;
 *       lastPaymentAmountPesewas: number | null;
 *       lastPaymentDate: string | null; // ISO
 *     };
 *   }>
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const tenantId =
      searchParams.get("tenantId")?.trim() || DEFAULT_DEMO_TENANT_ID;
    const guardianPhone = searchParams.get("guardianPhone")?.trim() || "";
    const term = searchParams.get("term")?.trim() || DEFAULT_TERM;
    const academicYear =
      searchParams.get("academicYear")?.trim() || DEFAULT_ACADEMIC_YEAR;

    if (!guardianPhone) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "guardianPhone is required. Use the same number registered with the school.",
        },
        { status: 400 }
      );
    }

    // 1) Find all students under this guardian for the tenant
    const students = await prisma.student.findMany({
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
    });

    if (students.length === 0) {
      return NextResponse.json({
        ok: true,
        tenantId,
        guardianPhone,
        term,
        academicYear,
        count: 0,
        students: [],
      });
    }

    const studentIds = students.map((s) => s.id);

    // 2) All invoices for these students, this term/year
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId,
        term,
        academicYear,
        studentId: {
          in: studentIds,
        },
      },
      select: {
        id: true,
        studentId: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (invoices.length === 0) {
      // Students exist, but no invoices yet for this term/year
      const payload = {
        ok: true,
        tenantId,
        guardianPhone,
        term,
        academicYear,
        count: students.length,
        students: students.map((s) => ({
          id: s.id,
          name: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || "—",
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
      };

      return NextResponse.json(payload);
    }

    const invoiceIds = invoices.map((inv) => inv.id);

    // 3) Payments for those invoices (to calculate total + "last payment")
    const payments =
      invoiceIds.length === 0
        ? []
        : await prisma.feePayment.findMany({
            where: {
              tenantId,
              invoiceId: {
                in: invoiceIds,
              },
            },
            select: {
              invoiceId: true,
              amountPesewas: true,
              paidAt: true,
            },
          });

    // Index payments by invoice: sum + last payment
    const paymentsByInvoice = new Map<
      string,
      {
        totalPaidPesewas: number;
        lastPaymentAmountPesewas: number | null;
        lastPaymentDate: Date | null;
      }
    >();

    for (const p of payments) {
      const existing = paymentsByInvoice.get(p.invoiceId);
      if (!existing) {
        paymentsByInvoice.set(p.invoiceId, {
          totalPaidPesewas: p.amountPesewas || 0,
          lastPaymentAmountPesewas: p.amountPesewas || 0,
          lastPaymentDate: p.paidAt,
        });
      } else {
        // Add to total
        existing.totalPaidPesewas += p.amountPesewas || 0;

        // Update "last payment" if this is newer
        if (!existing.lastPaymentDate || p.paidAt > existing.lastPaymentDate) {
          existing.lastPaymentDate = p.paidAt;
          existing.lastPaymentAmountPesewas = p.amountPesewas || 0;
        }

        paymentsByInvoice.set(p.invoiceId, existing);
      }
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
      const current: StudentAgg =
        aggByStudent.get(inv.studentId) || {
          totalBilledPesewas: 0,
          totalWaivedPesewas: 0,
          totalPaidPesewas: 0,
          lastPaymentAmountPesewas: null,
          lastPaymentDate: null,
        };

      current.totalBilledPesewas += inv.totalBilledPesewas || 0;
      current.totalWaivedPesewas += inv.totalWaivedPesewas || 0;

      const payAgg = paymentsByInvoice.get(inv.id);
      if (payAgg) {
        current.totalPaidPesewas += payAgg.totalPaidPesewas || 0;

        if (
          !current.lastPaymentDate ||
          (payAgg.lastPaymentDate &&
            payAgg.lastPaymentDate > current.lastPaymentDate)
        ) {
          current.lastPaymentDate = payAgg.lastPaymentDate;
          current.lastPaymentAmountPesewas =
            payAgg.lastPaymentAmountPesewas ?? null;
        }
      }

      aggByStudent.set(inv.studentId, current);
    }

    const result = {
      ok: true,
      tenantId,
      guardianPhone,
      term,
      academicYear,
      count: students.length,
      students: students.map((s) => {
        const agg = aggByStudent.get(s.id) || {
          totalBilledPesewas: 0,
          totalWaivedPesewas: 0,
          totalPaidPesewas: 0,
          lastPaymentAmountPesewas: null,
          lastPaymentDate: null,
        };

        const outstanding =
          (agg.totalBilledPesewas || 0) -
          (agg.totalWaivedPesewas || 0) -
          (agg.totalPaidPesewas || 0);

        return {
          id: s.id,
          name: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || "—",
          classroomName: s.classroom?.name ?? null,
          fees: {
            totalBilledPesewas: agg.totalBilledPesewas,
            totalWaivedPesewas: agg.totalWaivedPesewas,
            totalPaidPesewas: agg.totalPaidPesewas,
            outstandingPesewas: outstanding < 0 ? 0 : outstanding,
            lastPaymentAmountPesewas: agg.lastPaymentAmountPesewas,
            lastPaymentDate: agg.lastPaymentDate
              ? agg.lastPaymentDate.toISOString()
              : null,
          },
        };
      }),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[ParentFeesSummary] Unexpected error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while loading parent fees summary.",
      },
      { status: 500 }
    );
  }
}
