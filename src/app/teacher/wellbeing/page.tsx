// src/app/teacher/wellbeing/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TeacherWellbeingClient from "@/components/TeacherWellbeingClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveTenantSlug } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "Teacher Wellbeing | EduLife OS",
  description: "Log weekly wellbeing and workload reflections as a teacher in EduLife OS.",
};

export const dynamic = "force-dynamic";

export default async function TeacherWellbeingPage() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;

  if (!userId) {
    // Bank-grade: never render a “half page” for anonymous users.
    redirect("/auth/signin");
  }

  // Resolve active tenant (cookie-driven) then verify membership
  const activeSlug = await getActiveTenantSlug(userId);

  // If no active tenant, route them to dashboard to choose/org-switch
  if (!activeSlug) {
    redirect("/app/dashboard");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: activeSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    // Active slug exists but tenant missing => inconsistent state; force re-pick.
    redirect("/app/dashboard");
  }

  // Membership gate (ACTIVE only)
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) {
    // Don’t leak anything, don’t render client.
    redirect("/app/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Teacher Wellbeing & Weekly Check-In
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Record your weekly stress level, workload and a short reflection to help track teacher
              wellbeing over time.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Active school: <span className="font-medium">{tenant.name}</span>
            </p>
          </div>
          <div className="text-xs text-slate-500">EduLife OS • Teacher Portal</div>
        </div>

        {/* Core wellbeing UI (client-side) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <TeacherWellbeingClient tenantId={tenant.id} userId={userId} />
        </div>
      </div>
    </main>
  );
}
