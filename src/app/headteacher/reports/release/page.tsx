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
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              Parent result release
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              Use this to control parent access to results. Operationally, for
              now, treat this as your{" "}
              <span className="font-semibold">end-of-term exam release page</span>,
              not a continuous-assessment publishing tool.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <div>
              School:{" "}
              <span className="font-semibold">
                {tenant?.name ?? "Your school"}
              </span>
            </div>
            <div className="text-[11px]">
              Signed in as <span className="font-semibold">{ctx.email}</span>
            </div>
          </div>
        </header>

        <HeadteacherResultsReleaseClient
          classrooms={classrooms}
          defaultTerm={defaultTerm}
          defaultAcademicYear={defaultAcademicYear}
        />
      </div>
    </main>
  );
}