// src/app/headteacher/reports/student-report/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { HeadteacherStudentReportClient } from "@/components/HeadteacherStudentReportClient";

export const metadata: Metadata = {
  title: "Learner Term Report | Headteacher | EduLife OS",
  description:
    "Headteacher view of an individual learner term report powered by assessment items and scores.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEAD_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN"]);

export default async function HeadteacherStudentReportPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId: string | undefined = user?.id;

  if (!userId) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        "/headteacher/reports/student-report"
      )}`
    );
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    select: {
      tenantId: true,
      role: { select: { name: true } },
      tenant: { select: { name: true, status: true } },
    },
  });

  if (!membership?.tenantId) redirect("/app");
  if (membership.tenant?.status && membership.tenant.status !== "ACTIVE")
    redirect("/pending");

  const roleName = (membership.role?.name ?? "").trim();
  if (!HEAD_ROLES.has(roleName)) redirect("/app");

  const tenantName = membership.tenant?.name ?? "Your school";
  const defaultTerm = "1st Term";
  const defaultAcademicYear = "2025/2026";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              Learner term report
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              Paste a learner ID and choose{" "}
              <span className="font-semibold">term &amp; academic year</span> to
              see a printable term report powered by your real assessment items
              and scores.
            </p>
          </div>
          <div className="text-xs text-right text-slate-500 space-y-1">
            <p>
              Signed in as{" "}
              <span className="font-semibold">
                {session?.user?.email ?? "Headteacher"}
              </span>
            </p>
            <p className="text-[11px]">
              School: <span className="font-semibold">{tenantName}</span>
            </p>
          </div>
        </header>

        <HeadteacherStudentReportClient
          defaultTerm={defaultTerm}
          defaultAcademicYear={defaultAcademicYear}
        />
      </div>
    </main>
  );
}
