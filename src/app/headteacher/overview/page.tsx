import type { Metadata } from "next";
import HeadteacherOverviewClient from "@/components/HeadteacherOverviewClient";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";

export const metadata: Metadata = {
  title: "Headteacher Overview | EduLife OS",
  description: "Daily health and learning overview for the headteacher in EduLife OS.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDateInput(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function HeadteacherOverviewPage() {
  const ctx = await requireHeadteacherContext({ redirectTo: "/headteacher/overview" });

  const initialDate = formatDateInput(new Date());

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Health &amp; Learning Overview
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Daily snapshot of learner health, assessment activity, and teacher wellbeing across the school.
            </p>
          </div>
          <div className="text-xs text-slate-500">EduLife OS • Headteacher / Leadership</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <HeadteacherOverviewClient
            tenantId={ctx.tenantId}
            initialDate={initialDate}
            defaultTerm="1st Term"
            defaultAcademicYear="2025/2026"
          />
        </div>
      </div>
    </main>
  );
}
