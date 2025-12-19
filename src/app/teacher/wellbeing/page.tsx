// src/app/teacher/wellbeing/page.tsx

import type { Metadata } from "next";
import TeacherWellbeingClient from "@/components/TeacherWellbeingClient";

// Hard-coded for now to keep things simple (same IDs we've used elsewhere)
const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const TEACHER_USER_ID = "cmhhnguk5000ivcpgmjj3nxn4";

export const metadata: Metadata = {
  title: "Teacher Wellbeing | EduLife OS",
  description:
    "Log weekly wellbeing and workload reflections as a teacher in EduLife OS.",
};

export default function TeacherWellbeingPage() {
  const tenantId = TENANT_ID;
  const userId = TEACHER_USER_ID;

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
              Record your weekly stress level, workload and a short reflection to
              help track teacher wellbeing over time.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            EduLife OS • Teacher Portal
          </div>
        </div>

        {/* Core wellbeing UI (client-side) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <TeacherWellbeingClient tenantId={tenantId} userId={userId} />
        </div>
      </div>
    </main>
  );
}
