// src/app/headteacher/reports/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HeadteacherReportsClient } from "@/components/HeadteacherReportsClient";

export const metadata: Metadata = {
  title: "Term Reports | Headteacher | EduLife OS",
  description:
    "Headteacher view of class term reports powered by assessment items and scores.",
};

export const dynamic = "force-dynamic";

type SafeClassroom = {
  id: string;
  name: string;
};

export default async function HeadteacherReportsPage() {
  // 1) Auth – ensure headteacher is signed in
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId: string | undefined = user?.id;

  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=/headteacher/reports`);
  }

  // 2) Tenant – find which school this headteacher belongs to
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: {
      tenant: true,
    },
  });

  if (!membership?.tenantId) {
    redirect("/");
  }

  const tenantId = membership.tenantId;
  const tenantName = membership.tenant?.name ?? "Your school";

  // 3) Load classrooms for this tenant
  const classrooms = await prisma.classroom.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const safeClassrooms: SafeClassroom[] = classrooms.map((c) => ({
    id: c.id,
    name: c.name ?? "Unnamed class",
  }));

  // Simple defaults for demo – you can adjust as needed
  const defaultTerm = "1st Term";
  const defaultAcademicYear = "2025/2026";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Headteacher
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              Class term reports
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              View a{" "}
              <span className="font-semibold">
                simple term report grid
              </span>{" "}
              for each class, based on{" "}
              <span className="font-semibold">
                Assessment items & scores
              </span>{" "}
              recorded in EduLife OS.
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
              School:{" "}
              <span className="font-semibold">
                {tenantName}
              </span>
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
