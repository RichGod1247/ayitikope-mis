// src/app/teacher/assessment/page.tsx

import type { Metadata } from "next";
import TeacherAssessmentClient from "@/components/TeacherAssessmentClient";

export const metadata: Metadata = {
  title: "Teacher Assessment | EduLife OS",
  description:
    "Record and track continuous assessment scores for your class in EduLife OS.",
};

export default function TeacherAssessmentPage() {
  // 🔹 TEMP: hard-coded context for your current KG1 test setup.
  // These are the exact IDs we already confirmed are valid
  // from your successful API calls.
  const tenantId = "cmhhnghn00008vcpgp3fl07fl";
  const teacherUserId = "cmhhnguk5000ivcpgmjj3nxn4";
  const classroomId = "c45fc9ee-8c2a-41a2-928a-c5bd49bb16d5";
  const term = "1st Term";
  const academicYear = "2025/2026";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Continuous Assessment & Gradebook
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Create assessment items (class tests, homework, projects, etc.) and
              record learner scores for your class.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            EduLife OS • Teacher Portal
          </div>
        </div>

        {/* Core assessment UI (client-side) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <TeacherAssessmentClient
            tenantId={tenantId}
            teacherUserId={teacherUserId}
            classroomId={classroomId}
            term={term}
            academicYear={academicYear}
          />
        </div>
      </div>
    </main>
  );
}
