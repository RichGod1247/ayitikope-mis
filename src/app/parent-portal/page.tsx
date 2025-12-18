// src/app/parent-portal/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ParentPortalClient } from "@/components/ParentPortalClient";

export const metadata: Metadata = {
  title: "Parent Portal | EduLife OS",
  description:
    "Parent view of learners with simple fees and attendance summary.",
};

export const dynamic = "force-dynamic";

type SafeStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

export default async function ParentPortalPage() {
  // 1) Auth – ensure user is signed in
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId: string | undefined = user?.id;

  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=/parent-portal`);
  }

  // 2) Tenant – find which school this parent belongs to
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

  // 3) Load learners for this tenant.
  // For now, this is "all learners for the school" – later,
  // we can restrict this to JUST the children linked to this parent.
  const students = await prisma.student.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
    orderBy: {
      firstName: "asc",
    },
  });

  const safeStudents: SafeStudent[] = students.map((s) => ({
    id: s.id,
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Parent Portal
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              {tenantName} – your child&apos;s progress
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              View a simple{" "}
              <span className="font-semibold">
                fees and attendance summary
              </span>{" "}
              for each learner, so you can stay in sync with the school.
            </p>
          </div>
          <div className="text-xs text-right text-slate-500 space-y-1">
            <p>
              Signed in as{" "}
              <span className="font-semibold">
                {session?.user?.email ?? "Parent"}
              </span>
            </p>
            <p className="text-[11px]">
              Learners in school:{" "}
              <span className="font-semibold">{safeStudents.length}</span>
            </p>
          </div>
        </header>

        {/* Main parent portal client */}
        <ParentPortalClient initialStudents={safeStudents} />
      </div>
    </main>
  );
}
