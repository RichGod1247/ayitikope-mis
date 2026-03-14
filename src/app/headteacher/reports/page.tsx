// src/app/headteacher/reports/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { HeadteacherReportsClient } from "@/components/HeadteacherReportsClient";

export const metadata: Metadata = {
  title: "Term Reports | Headteacher | EduLife OS",
  description:
    "Headteacher view of class term reports powered by assessment items and scores.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SafeClassroom = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

export default async function HeadteacherReportsPage() {
  const ctx = await requireServerUserContext({
    redirectTo: "/headteacher/reports",
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

  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, arm: true },
    orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
  });

  const safeClassrooms: SafeClassroom[] = classrooms.map((c) => ({
    id: c.id,
    name: c.name ?? "Unnamed class",
    grade: c.grade ?? null,
    arm: c.arm ?? null,
  }));

  const defaultTerm = settings?.currentTerm ?? "1st Term";
  const defaultAcademicYear = settings?.currentAcademicYear ?? "2025/2026";

  return (
    <main className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#E8C96A]/20 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
                EduLife OS · Headteacher
              </div>

              <h1 className="mt-3 text-xl font-semibold text-[#F7F4ED] sm:text-2xl">
                Class term reports
              </h1>

              <p className="mt-1 max-w-2xl text-xs text-[#C9CDD6] sm:text-sm">
                Review class-by-class learner performance across the term from
                recorded assessment scores.
              </p>
            </div>

            <div className="space-y-1 text-xs text-[#AEB6C4] sm:text-right">
              <p>
                Signed in as{" "}
                <span className="font-semibold text-[#F7F4ED]">
                  {ctx.email ?? "Headteacher"}
                </span>
              </p>
              <p className="text-[11px]">
                School:{" "}
                <span className="font-semibold text-[#F7F4ED]">{tenantName}</span>
              </p>
            </div>
          </div>
        </header>

        <HeadteacherReportsClient
          classrooms={safeClassrooms}
          defaultTerm={defaultTerm}
          defaultAcademicYear={defaultAcademicYear}
        />
      </div>
    </main>
  );
}