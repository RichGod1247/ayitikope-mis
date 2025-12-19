// src/app/headteacher/students/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { HeadteacherStudentsClient } from "@/components/HeadteacherStudentsClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Students | Headteacher | EduLife OS",
  description:
    "Headteacher view of all students with quick guardian contact editing.",
};

// Keep dynamic for always-fresh data
export const dynamic = "force-dynamic";

export default async function HeadteacherStudentsPage() {
  // 1) Get logged-in user from NextAuth using our shared authOptions
  const session = await getServerSession(authOptions);

  // Our authOptions.session callback attaches `id` to session.user
  const user = session?.user as any;
  const userId: string | undefined = user?.id;

  if (!userId) {
    // Not logged in → send to sign-in, then bring them back here
    redirect(`/api/auth/signin?callbackUrl=/headteacher/students`);
  }

  // 2) Find this user's membership (tenant)
  const membership = await prisma.membership.findFirst({
    where: {
      userId: userId,
    },
  });

  // If they don't belong to any tenant, block access
  if (!membership?.tenantId) {
    redirect("/");
  }

  const tenantId = membership.tenantId;

  // 3) Load students for THIS tenant – ONLY the fields we know we have
  const students = await prisma.student.findMany({
    where: {
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
    orderBy: {
      firstName: "asc",
    },
  });

  const safeStudents = students.map((s) => ({
    id: s.id,
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
    sex: s.sex ?? "",
    guardianName: s.guardianName ?? "",
    guardianPhone: s.guardianPhone ?? "",
    guardianSmsOptIn: !!s.guardianSmsOptIn,
    note: s.note ?? "",
    createdAt: s.createdAt.toISOString(),
  }));

  // 4) Fees summary for this tenant (ALL invoices, all types)
  //
  // Based on your schema:
  // FeeInvoice:
  //   - id, tenantId, totalBilledPesewas, totalWaivedPesewas, ...
  // FeePayment:
  //   - id, tenantId, invoiceId, amountPesewas, ...
  //
  // We'll compute:
  //   - total billed (pesewas → GH₵)
  //   - total paid
  //   - outstanding = billed - paid
  const feeInvoices = await prisma.feeInvoice.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      totalBilledPesewas: true,
      totalWaivedPesewas: true,
    },
  });

  const invoiceIds = feeInvoices.map((inv) => inv.id);

  const feePayments =
    invoiceIds.length > 0
      ? await prisma.feePayment.findMany({
          where: {
            tenantId,
            invoiceId: {
              in: invoiceIds,
            },
          },
          select: {
            amountPesewas: true,
          },
        })
      : [];

  const totalBilledPesewas = feeInvoices.reduce((sum, inv) => {
    const billed = inv.totalBilledPesewas ?? 0;
    const waived = inv.totalWaivedPesewas ?? 0;
    return sum + billed - waived;
  }, 0);

  const totalPaidPesewas = feePayments.reduce((sum, pay) => {
    const amt = pay.amountPesewas ?? 0;
    return sum + amt;
  }, 0);

  const totalOutstandingPesewas = Math.max(
    totalBilledPesewas - totalPaidPesewas,
    0
  );

  // Convert pesewas → GH₵
  const totalBilled = totalBilledPesewas / 100;
  const totalPaid = totalPaidPesewas / 100;
  const totalOutstanding = totalOutstandingPesewas / 100;

  const invoiceCount = feeInvoices.length;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Head · Students
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              Learners & guardians
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              Quick view of all learners in your school, with{" "}
              <span className="font-semibold">
                editable guardian contacts
              </span>{" "}
              so that SMS, fees and health alerts always reach the right
              person.
            </p>
          </div>
          <div className="text-xs text-right text-slate-500 space-y-1">
            <p>
              Total learners:{" "}
              <span className="font-semibold">{students.length}</span>
            </p>
            <p className="text-[11px]">
              Tip: populate at least one full JHS class for your demo.
            </p>
          </div>
        </header>

        {/* Fees summary card (all invoices) */}
        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  School fees (all invoices)
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-900/80">
                  Summary for this tenant based on real{" "}
                  <span className="font-semibold">FeeInvoice</span> and{" "}
                  <span className="font-semibold">FeePayment</span> records.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-emerald-700/80">Total billed</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                  GH₵ {totalBilled.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-emerald-700/80">Total paid</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                  GH₵ {totalPaid.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-emerald-700/80">Outstanding</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                  GH₵ {totalOutstanding.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-900/80">
              <p>
                Invoices found:{" "}
                <span className="font-semibold">{invoiceCount}</span>
              </p>
              {invoiceCount === 0 && (
                <p className="text-[10px]">
                  No invoices yet. Once you generate fees for a term, the totals
                  will appear here automatically.
                </p>
              )}
              {invoiceCount > 0 && (
                <p className="text-[10px]">
                  These numbers are live. Any new fee invoice or payment in
                  EduLife OS will update this summary.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Client-side table/editor */}
        <HeadteacherStudentsClient initialStudents={safeStudents} />
      </div>
    </main>
  );
}
