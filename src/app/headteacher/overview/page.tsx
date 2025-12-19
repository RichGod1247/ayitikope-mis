// src/app/headteacher/overview/page.tsx

import type { Metadata } from "next";
import HeadteacherOverviewClient from "@/components/HeadteacherOverviewClient";

export const metadata: Metadata = {
  title: "Headteacher Overview | EduLife OS",
  description:
    "Daily health and learning overview for the headteacher in EduLife OS.",
};

function formatDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function HeadteacherOverviewPage() {
  // For now we hardcode the Ayitikope tenant.
  // Later, this should come from the logged-in headteacher's membership.
  const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

  const today = new Date();
  const initialDate = formatDateInput(today);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Health & Learning Overview
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Daily snapshot of learner health, assessment activity, and teacher
              wellbeing across the school.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            EduLife OS • Headteacher / Leadership
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <HeadteacherOverviewClient
            tenantId={TENANT_ID}
            initialDate={initialDate}
            defaultTerm="1st Term"
            defaultAcademicYear="2025/2026"
          />
        </div>
      </div>
    </main>
  );
}
