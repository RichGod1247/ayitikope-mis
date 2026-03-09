// src/app/teacher/assessment/page.tsx
import type { Metadata } from "next";
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherAssessmentClient from "@/components/TeacherAssessmentClient";

export const metadata: Metadata = {
  title: "Teacher Assessment | EduLife OS",
  description:
    "Record and track continuous assessment scores for your class in EduLife OS.",
};

export const dynamic = "force-dynamic";

export default async function TeacherAssessmentPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/assessment",
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Continuous Assessment & Gradebook
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Session-scoped. No tenant/user IDs in URLs. Your teacher session decides access.
            </p>
          </div>
          <div className="text-xs text-slate-500">EduLife OS • Teacher Portal</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <TeacherAssessmentClient />
        </div>
      </div>
    </main>
  );
}