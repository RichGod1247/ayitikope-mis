//src/app/headteacher/health/overview/page.tsx
import type { Metadata } from "next";
import HeadteacherHealthOverviewClient from "@/components/HeadteacherHealthOverviewClient";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";

export const metadata: Metadata = {
  title: "Health Snapshot | Headteacher | EduLife OS",
  description: "Daily learner health overview (temperature & symptoms) for the Headteacher.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function todayISODate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function HeadteacherHealthOverviewPage() {
  const ctx = await requireHeadteacherContext({ redirectTo: "/headteacher/health/overview" });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Health &amp; Safety Overview</h1>
            <p className="mt-1 text-sm text-slate-600">
              View learner temperature readings and possible fever cases across all classes for a given day.
            </p>
          </div>
          <div className="text-xs text-slate-500">Headteacher • EduLife OS</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <HeadteacherHealthOverviewClient tenantId={ctx.tenantId} initialDate={todayISODate()} />
        </div>
      </div>
    </main>
  );
}
