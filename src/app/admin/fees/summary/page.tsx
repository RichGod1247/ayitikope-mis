// src/app/admin/fees/summary/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  PaymentStatus,
  RefundStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const metadata: Metadata = {
  title: "Fees Summary | EduLife OS",
  description:
    "Office view of term invoices, refund-aware payments, and outstanding balances.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{
  term?: string;
  academicYear?: string;
}>;

const REFUND_VISIBLE_STATUSES = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
  RefundStatus.SUCCEEDED,
] as const;

function formatCedis(pesewas: number): string {
  return `GH₵${(Math.max(0, pesewas) / 100).toFixed(2)}`;
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Student";
}

function classLabel(
  classroom?: {
    name: string | null;
    grade: string | null;
    arm: string | null;
  } | null
) {
  if (!classroom) return "Unassigned";

  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    "Class"
  );
}

function refundAmounts(
  refunds: Array<{
    status: RefundStatus;
    amountPesewas: number;
  }>
) {
  let refundedPesewas = 0;
  let pendingRefundPesewas = 0;

  for (const refund of refunds) {
    const amount = Math.max(0, refund.amountPesewas ?? 0);

    if (refund.status === RefundStatus.SUCCEEDED) {
      refundedPesewas += amount;
      continue;
    }

    if (
      refund.status === RefundStatus.REQUESTED ||
      refund.status === RefundStatus.APPROVED ||
      refund.status === RefundStatus.PROCESSING
    ) {
      pendingRefundPesewas += amount;
    }
  }

  return { refundedPesewas, pendingRefundPesewas };
}

function lineTruth(inv: {
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  lines: Array<{ amountPesewas: number; waivedPesewas: number }>;
  adjustments: Array<{ amountPesewas: number }>;
}) {
  const lineBilled = inv.lines.reduce(
    (sum, line) => sum + Math.max(0, line.amountPesewas ?? 0),
    0
  );

  const lineWaived = inv.lines.reduce(
    (sum, line) => sum + Math.max(0, line.waivedPesewas ?? 0),
    0
  );

  const adjustmentWaived = inv.adjustments.reduce(
    (sum, adj) => sum + Math.max(0, adj.amountPesewas ?? 0),
    0
  );

  const grossBilled =
    lineBilled > 0 ? lineBilled : Math.max(0, inv.totalBilledPesewas ?? 0);

  const waived =
    lineWaived + adjustmentWaived > 0
      ? Math.max(0, lineWaived + adjustmentWaived)
      : Math.max(0, inv.totalWaivedPesewas ?? 0);

  const netBilled = Math.max(0, grossBilled - waived);

  return { grossBilled, waived, netBilled };
}

const CONTROL_CLASS =
  "mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default async function AdminFeesSummaryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/dashboard",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  const sp = searchParams ? await searchParams : {};
  const term = String(sp.term ?? "1st Term").trim() || "1st Term";
  const academicYear =
    String(sp.academicYear ?? "2025/2026").trim() || "2025/2026";

  const tenant = await prisma.tenant.findUnique({
    where: { id: safe.tenantId },
    select: {
      id: true,
      name: true,
      schoolCode: true,
    },
  });

  const invoiceWhere: Prisma.FeeInvoiceWhereInput = {
    tenantId: safe.tenantId,
    term,
    academicYear,
    status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
  };

  const invoices = await prisma.feeInvoice.findMany({
    where: invoiceWhere,
    select: {
      id: true,
      term: true,
      academicYear: true,
      status: true,
      issuedAt: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
      totalPaidPesewas: true,
      balancePesewas: true,
      lines: {
        select: {
          amountPesewas: true,
          waivedPesewas: true,
        },
      },
      adjustments: {
        where: { reversedAt: null },
        select: {
          amountPesewas: true,
        },
      },
      payments: {
        where: {
          status: {
            in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED],
          },
        },
        select: {
          id: true,
          amountPesewas: true,
          method: true,
          reference: true,
          status: true,
          paidAt: true,
          refunds: {
            where: {
              status: { in: [...REFUND_VISIBLE_STATUSES] },
            },
            select: {
              id: true,
              status: true,
              amountPesewas: true,
            },
          },
        },
      },
      receipts: {
        select: {
          id: true,
          status: true,
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          guardianName: true,
          guardianPhone: true,
          guardianPhoneNorm: true,
          classroom: {
            select: {
              name: true,
              grade: true,
              arm: true,
            },
          },
        },
      },
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  const rows = invoices.map((inv) => {
    const { grossBilled, waived, netBilled } = lineTruth(inv);

    let grossPaid = 0;
    let refunded = 0;
    let pendingRefund = 0;

    for (const payment of inv.payments) {
      grossPaid += Math.max(0, payment.amountPesewas ?? 0);

      const bucket = refundAmounts(payment.refunds);
      refunded += bucket.refundedPesewas;
      pendingRefund += bucket.pendingRefundPesewas;
    }

    const netPaid = Math.max(0, grossPaid - refunded);
    const balance = Math.max(0, netBilled - netPaid);

    const storedMismatch =
      (inv.totalPaidPesewas ?? 0) !== netPaid ||
      (inv.balancePesewas ?? 0) !== balance ||
      (inv.totalBilledPesewas ?? 0) !== grossBilled ||
      (inv.totalWaivedPesewas ?? 0) !== waived;

    return {
      invoiceId: inv.id,
      studentName: fullName(inv.student.firstName, inv.student.lastName),
      className: classLabel(inv.student.classroom),
      guardianName: inv.student.guardianName ?? null,
      guardianPhone:
        inv.student.guardianPhoneNorm ?? inv.student.guardianPhone ?? null,
      term: inv.term,
      academicYear: inv.academicYear,
      status: inv.status,
      issuedAt: inv.issuedAt,
      grossBilled,
      waived,
      netBilled,
      grossPaid,
      refunded,
      pendingRefund,
      netPaid,
      balance,
      paymentsCount: inv.payments.length,
      receiptCount: inv.receipts.length,
      storedMismatch,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.grossBilled += row.grossBilled;
      acc.waived += row.waived;
      acc.netBilled += row.netBilled;
      acc.grossPaid += row.grossPaid;
      acc.refunded += row.refunded;
      acc.pendingRefund += row.pendingRefund;
      acc.netPaid += row.netPaid;
      acc.balance += row.balance;
      acc.paymentCount += row.paymentsCount;
      acc.receiptCount += row.receiptCount;

      if (row.balance <= 0 && row.netBilled > 0) acc.clearedCount += 1;
      if (row.balance > 0 && row.netPaid > 0) acc.partialCount += 1;
      if (row.balance > 0 && row.netPaid <= 0) acc.unpaidCount += 1;
      if (row.netBilled <= 0) acc.noChargeCount += 1;
      if (row.storedMismatch) acc.storedMismatchCount += 1;

      return acc;
    },
    {
      grossBilled: 0,
      waived: 0,
      netBilled: 0,
      grossPaid: 0,
      refunded: 0,
      pendingRefund: 0,
      netPaid: 0,
      balance: 0,
      paymentCount: 0,
      receiptCount: 0,
      clearedCount: 0,
      partialCount: 0,
      unpaidCount: 0,
      noChargeCount: 0,
      storedMismatchCount: 0,
    }
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              EduLife OS · Finance Summary
            </p>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Fees Summary
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Refund-aware summary for{" "}
              <span className="font-medium">{tenant?.name ?? "this school"}</span>.
              Net paid subtracts succeeded refunds from successful payments.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/overview"
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              Overview
            </Link>
            <Link
              href="/admin/fees/refunds"
              className="inline-flex h-10 items-center rounded-xl border border-purple-300 bg-purple-50 px-4 text-xs font-semibold text-purple-800 hover:bg-purple-100"
            >
              Refunds
            </Link>
            <Link
              href="/admin/fees/disputes"
              className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Disputes
            </Link>
          </div>
        </div>

        <form className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700">
              Term
            </span>
            <select
  name="term"
  defaultValue={term}
  className={CONTROL_CLASS}
>
  <option>1st Term</option>
  <option>2nd Term</option>
  <option>3rd Term</option>
</select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700">
              Academic year
            </span>
            <input
  name="academicYear"
  defaultValue={academicYear}
  className={CONTROL_CLASS}
  placeholder="2025/2026"
/>
          </label>

          <button
            type="submit"
            className="h-10 self-end rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-black"
          >
            Apply
          </button>
        </form>

        <section className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Gross billed</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {formatCedis(totals.grossBilled)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Waived: {formatCedis(totals.waived)}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 shadow-sm">
            <div className="text-[11px] text-emerald-700">Net paid</div>
            <div className="mt-1 text-lg font-semibold text-emerald-900">
              {formatCedis(totals.netPaid)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-800">
              Gross: {formatCedis(totals.grossPaid)} · Refunded:{" "}
              {formatCedis(totals.refunded)}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
            <div className="text-[11px] text-amber-700">Outstanding</div>
            <div className="mt-1 text-lg font-semibold text-amber-900">
              {formatCedis(totals.balance)}
            </div>
            <div className="mt-1 text-[11px] text-amber-800">
              Pending refunds: {formatCedis(totals.pendingRefund)}
            </div>
          </div>

          <div
            className={`rounded-xl border px-3 py-3 shadow-sm ${
              totals.storedMismatchCount > 0
                ? "border-red-200 bg-red-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="text-[11px] text-slate-600">Stored truth check</div>
            <div
              className={`mt-1 text-lg font-semibold ${
                totals.storedMismatchCount > 0
                  ? "text-red-800"
                  : "text-emerald-800"
              }`}
            >
              {totals.storedMismatchCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-600">
              Invoice mismatch signal(s)
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Invoices</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {rows.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Receipts: {totals.receiptCount}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Cleared</div>
            <div className="mt-1 text-lg font-semibold text-emerald-700">
              {totals.clearedCount}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Partial</div>
            <div className="mt-1 text-lg font-semibold text-amber-700">
              {totals.partialCount}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[11px] text-slate-500">Unpaid</div>
            <div className="mt-1 text-lg font-semibold text-red-700">
              {totals.unpaidCount}
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <p className="font-semibold">Bank-grade summary rule</p>
          <p className="mt-1">
            Net paid equals gross successful payments minus succeeded refunds.
            Pending refunds are not deducted until they succeed, but they are
            shown because they affect trust and cash expectation.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
          {rows.length === 0 ? (
            <p className="text-slate-600">
              No fee invoices found for {term} / {academicYear}.
            </p>
          ) : (
            <div className="max-h-[620px] overflow-auto rounded-lg border border-slate-100">
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
                      Gross billed
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Waived
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Gross paid
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Refunded
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Net paid
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Balance
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Risk
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const zebra = idx % 2 === 1 ? "bg-slate-50/70" : "bg-white";

                    return (
                      <tr key={r.invoiceId} className={zebra}>
                        <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-900">
                          <p className="font-semibold">{r.studentName}</p>
                          <p className="text-[11px] text-slate-500">
                            {r.guardianName ?? "Guardian not set"}
                          </p>
                          {r.guardianPhone && (
                            <p className="text-[11px] text-slate-500">
                              {r.guardianPhone}
                            </p>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">
                          {r.className}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top font-medium text-slate-900">
                          {formatCedis(r.grossBilled)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-slate-700">
                          {formatCedis(r.waived)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-slate-700">
                          {formatCedis(r.grossPaid)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-purple-700">
                          {formatCedis(r.refunded)}
                          {r.pendingRefund > 0 && (
                            <div className="text-[10px] text-amber-700">
                              Pending {formatCedis(r.pendingRefund)}
                            </div>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top font-semibold text-emerald-800">
                          {formatCedis(r.netPaid)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right align-top font-bold text-amber-800">
                          {formatCedis(r.balance)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {r.storedMismatch ? (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                              Stored mismatch
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                              Clean
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}