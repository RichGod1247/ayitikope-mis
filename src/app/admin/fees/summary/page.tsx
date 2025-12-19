// src/app/admin/fees/summary/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Fees Summary | EduLife OS",
  description:
    "Office view of term invoices, payments, and outstanding balances.",
};

export const dynamic = "force-dynamic";

// For now we keep the same demo tenant/term/year we used elsewhere
const DEMO_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const DEMO_TERM = "1st Term";
const DEMO_ACADEMIC_YEAR = "2025/2026";

function formatCedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}

export default async function AdminFeesSummaryPage() {
  const tenantId = DEMO_TENANT_ID;
  const term = DEMO_TERM;
  const academicYear = DEMO_ACADEMIC_YEAR;

  // Load all invoices for this tenant + term + year, with student + payments
  const invoices = await prisma.feeInvoice.findMany({
    where: {
      tenantId,
      term,
      academicYear,
    },
    include: {
      student: true,
      payments: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  type Row = {
    invoiceId: string;
    studentName: string;
    className: string;
    term: string;
    academicYear: string;
    billed: number;
    waived: number;
    paid: number;
    balance: number;
    paymentsCount: number;
  };

  const rows: Row[] = invoices.map((inv) => {
    const billed = inv.totalBilledPesewas ?? 0;
    const waived = inv.totalWaivedPesewas ?? 0;
    const netBilled = billed - waived;

    const paid =
      inv.payments?.reduce(
        (sum, p) => sum + (p.amountPesewas ?? 0),
        0
      ) ?? 0;

    const balance = netBilled - paid;

    const studentFullName = [
      inv.student?.firstName ?? "",
      inv.student?.lastName ?? "",
    ]
      .join(" ")
      .trim();

    return {
      invoiceId: inv.id,
      studentName: studentFullName || "(Unnamed student)",
      className: inv.student?.classroomId
        ? inv.student.classroomId
        : "—",
      term: inv.term,
      academicYear: inv.academicYear,
      billed: netBilled,
      waived,
      paid,
      balance,
      paymentsCount: inv.payments?.length ?? 0,
    };
  });

  const totalBilledAll = rows.reduce((s, r) => s + r.billed, 0);
  const totalWaivedAll = rows.reduce((s, r) => s + r.waived, 0);
  const totalPaidAll = rows.reduce((s, r) => s + r.paid, 0);
  const totalBalanceAll = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Fees Summary (Office)
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              All invoices, payments, and outstanding balances for{" "}
              <span className="font-medium">{term}</span>,{" "}
              <span className="font-medium">{academicYear}</span>.
            </p>
          </div>
          <div className="text-xs text-slate-500 space-y-1 text-right">
            <div>
              Tenant:{" "}
              <span className="font-mono">{tenantId.slice(0, 10)}…</span>
            </div>
            <div>
              Invoices:{" "}
              <span className="font-medium">{rows.length}</span>
            </div>
          </div>
        </div>

        {/* Top aggregates */}
        <section className="mb-5 grid gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Net billed</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {formatCedis(totalBilledAll)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              After waivers ({formatCedis(totalWaivedAll)} waived)
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 shadow-sm">
            <div className="text-[11px] text-emerald-700">Total paid</div>
            <div className="mt-1 text-lg font-semibold text-emerald-900">
              {formatCedis(totalPaidAll)}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
            <div className="text-[11px] text-amber-700">
              Outstanding balance
            </div>
            <div className="mt-1 text-lg font-semibold text-amber-900">
              {formatCedis(Math.max(totalBalanceAll, 0))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">
              Fully cleared invoices
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {
                rows.filter((r) => Math.max(r.balance, 0) === 0)
                  .length
              }
            </div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-xs">
          {rows.length === 0 ? (
            <p className="text-slate-600">
              No fee invoices found yet for this term and academic year.
              Once you generate invoices, they will appear here with
              their payment status.
            </p>
          ) : (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-100">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Student
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Class
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Billed
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Paid
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Balance
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Payments
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Invoice ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const zebra =
                      idx % 2 === 1 ? "bg-slate-50/70" : "bg-white";
                    const isCleared = Math.max(r.balance, 0) === 0;
                    return (
                      <tr key={r.invoiceId} className={zebra}>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-900">
                          {r.studentName}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-700">
                          {r.className}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-right text-slate-800">
                          {formatCedis(r.billed)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-right text-emerald-800">
                          {formatCedis(r.paid)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-right">
                          <span
                            className={
                              isCleared
                                ? "rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                                : "rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                            }
                          >
                            {formatCedis(Math.max(r.balance, 0))}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top text-right text-slate-700">
                          {r.paymentsCount}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 align-top font-mono text-[11px] text-slate-500">
                          {r.invoiceId.slice(0, 10)}…
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500">
            Later we can add filters by class, search by learner name, and
            actions for printing receipts or sending SMS reminders directly
            from this page.
          </p>
        </section>
      </div>
    </main>
  );
}
