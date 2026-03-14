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
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:py-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                EduLife OS • Teacher Portal
              </div>

              <h1 className="mt-3 text-xl font-semibold text-[#F7F4ED] sm:text-2xl">
                Continuous Assessment &amp; Gradebook
              </h1>

              <p className="mt-1 text-sm text-[#C9CDD6]">
                Session-scoped. No tenant/user IDs in URLs. Your teacher session decides access.
              </p>
            </div>

            <div className="text-xs text-[#8F98A8] sm:text-right">
              Assessment • Lesson delivery • Scores • Class insight
            </div>
          </div>
        </header>

        <TeacherAssessmentClient />
      </div>
    </main>
  );
}