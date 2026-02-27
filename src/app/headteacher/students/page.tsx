// src/app/headteacher/students/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { HeadteacherStudentsClient } from "@/components/HeadteacherStudentsClient";

export const metadata: Metadata = {
  title: "Students | Headteacher | EduLife OS",
  description:
    "Headteacher view of all students with quick guardian contact editing.",
};

// Always-fresh data
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEAD_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN"]);

function toNum(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return 0;
}

export default async function HeadteacherStudentsPage() {
  // 1) Auth
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId: string | undefined = user?.id;

  if (!userId) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        "/headteacher/students"
      )}`
    );
  }

  // 2) Tenant + role (must be ACTIVE + head role)
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    select: {
      tenantId: true,
      status: true,
      role: { select: { name: true } },
      tenant: { select: { name: true, status: true } },
    },
  });

  if (!membership?.tenantId) redirect("/app");
  if (membership.tenant?.status && membership.tenant.status !== "ACTIVE")
    redirect("/pending");

  const roleName = (membership.role?.name ?? "").trim();
  if (!HEAD_ROLES.has(roleName)) redirect("/app");

  const tenantId = membership.tenantId;

  // 3) Students
  const students = await prisma.student.findMany({
    where: { tenantId },
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
    orderBy: { firstName: "asc" },
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

  // 4) Fees summary (all invoices)
  const feeInvoices = await prisma.feeInvoice.findMany({
    where: { tenantId },
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
          where: { tenantId, invoiceId: { in: invoiceIds } },
          select: { amountPesewas: true },
        })
      : [];

  const totalBilledPesewas = feeInvoices.reduce((sum, inv) => {
    const billed = toNum(inv.totalBilledPesewas);
    const waived = toNum(inv.totalWaivedPesewas);
    return sum + billed - waived;
  }, 0);

  const totalPaidPesewas = feePayments.reduce((sum, pay) => {
    const amt = toNum(pay.amountPesewas);
    return sum + amt;
  }, 0);

  const totalOutstandingPesewas = Math.max(
    totalBilledPesewas - totalPaidPesewas,
    0
  );

  const totalBilled = totalBilledPesewas / 100;
  const totalPaid = totalPaidPesewas / 100;
  const totalOutstanding = totalOutstandingPesewas / 100;

  const invoiceCount = feeInvoices.length;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
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
              <span className="font-semibold">editable guardian contacts</span>{" "}
              so that SMS, fees and health alerts always reach the right person.
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
              {invoiceCount === 0 ? (
                <p className="text-[10px]">
                  No invoices yet. Once you generate fees for a term, the totals
                  will appear here automatically.
                </p>
              ) : (
                <p className="text-[10px]">
                  These numbers are live. Any new fee invoice or payment will
                  update this summary.
                </p>
              )}
            </div>
          </div>
        </section>

        <HeadteacherStudentsClient initialStudents={safeStudents} />
      </div>
    </main>
  );
}
