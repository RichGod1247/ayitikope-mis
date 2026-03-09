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
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              Class term reports
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              Review class-by-class learner performance across the term from
              recorded assessment scores.
            </p>
          </div>

          <div className="text-xs text-right text-slate-500 space-y-1">
            <p>
              Signed in as{" "}
              <span className="font-semibold">{ctx.email ?? "Headteacher"}</span>
            </p>
            <p className="text-[11px]">
              School: <span className="font-semibold">{tenantName}</span>
            </p>
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