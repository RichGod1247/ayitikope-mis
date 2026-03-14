// src/app/headteacher/reports/student-report/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { HeadteacherStudentReportClient } from "@/components/HeadteacherStudentReportClient";

export const metadata: Metadata = {
  title: "Learner Term Report | Headteacher | EduLife OS",
  description:
    "Headteacher view of an individual learner term report powered by assessment items and scores.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HeadteacherStudentReportPage() {
  // ✅ Bank-grade: tenant + role come from session and ACTIVE membership (DB-truth)
  const ctx = await requireServerUserContext({
    redirectTo: "/headteacher/reports/student-report",
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true, status: true },
  });

  if (!tenant) redirect("/app");
  if (tenant.status !== "ACTIVE") redirect("/pending");

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const tenantName = tenant.name ?? "Your school";
  const defaultTerm = settings?.currentTerm ?? "1st Term";
  const defaultAcademicYear = settings?.currentAcademicYear ?? "2025/2026";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-100">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-[#F7F4ED] sm:text-2xl">
              Learner term report
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-[#C9CDD6] sm:text-sm">
              Paste a learner ID and choose{" "}
              <span className="font-semibold text-[#F7F4ED]">term &amp; academic year</span> to
              see a printable term report powered by your real assessment items
              and scores.
            </p>
          </div>
          <div className="space-y-1 text-xs text-right text-[#AEB6C4]">
            <p>
              Signed in as{" "}
              <span className="font-semibold text-[#F7F4ED]">{ctx.email ?? "Headteacher"}</span>
            </p>
            <p className="text-[11px]">
              School: <span className="font-semibold text-[#F7F4ED]">{tenantName}</span>
            </p>
          </div>
        </div>
      </section>

      <HeadteacherStudentReportClient
        tenantName={tenantName}
        defaultTerm={defaultTerm}
        defaultAcademicYear={defaultAcademicYear}
      />
    </div>
  );
}