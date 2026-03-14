// src/app/headteacher/reports/release/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import HeadteacherResultsReleaseClient from "@/components/HeadteacherResultsReleaseClient";

export const metadata: Metadata = {
  title: "Parent Result Release | Headteacher | EduLife OS",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HeadteacherReleaseResultsPage() {
  const ctx = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
    redirectTo: "/headteacher/reports/release",
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
    select: { id: true, name: true, grade: true, arm: true },
  });

  const defaultTerm = settings?.currentTerm ?? "1st Term";
  const defaultAcademicYear = settings?.currentAcademicYear ?? "2025/2026";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-100">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-[#F7F4ED] sm:text-2xl">
              Parent result release
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-[#C9CDD6]">
              Use this to control parent access to results. Operationally, for
              now, treat this as your{" "}
              <span className="font-semibold text-[#F7F4ED]">end-of-term exam release page</span>,
              not a continuous-assessment publishing tool.
            </p>
          </div>

          <div className="text-right text-xs text-[#AEB6C4]">
            <div>
              School:{" "}
              <span className="font-semibold text-[#F7F4ED]">
                {tenant?.name ?? "Your school"}
              </span>
            </div>
            <div className="text-[11px]">
              Signed in as <span className="font-semibold text-[#F7F4ED]">{ctx.email}</span>
            </div>
          </div>
        </div>
      </section>

      <HeadteacherResultsReleaseClient
        classrooms={classrooms}
        defaultTerm={defaultTerm}
        defaultAcademicYear={defaultAcademicYear}
      />
    </div>
  );
}