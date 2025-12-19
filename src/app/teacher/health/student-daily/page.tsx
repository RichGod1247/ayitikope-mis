// src/app/teacher/health/student-daily/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import StudentHealthDailyClient from "@/components/StudentHealthDailyClient";

export const metadata: Metadata = {
  title: "Student Daily Health | EduLife OS",
  description:
    "Capture daily temperature and health notes for learners in your class.",
};

// For now, use your known tenant + classroom IDs
const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const CLASSROOM_ID = "c45fc9ee-8c2a-41a2-928a-c5bd49bb16d5";

export default async function StudentHealthDailyPage() {
  const tenantId = TENANT_ID;
  const classroomId = CLASSROOM_ID;

  // Load classroom + students from Prisma
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
  });

  const studentsRaw = await prisma.student.findMany({
    where: { classroomId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const students = studentsRaw.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    guardianName: s.guardianName,
    guardianPhone: s.guardianPhone,
  }));

  // Default date = today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Student Daily Health Log
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Record temperatures, symptoms and notes for each learner. This
              helps you quickly identify who may need medical attention or to be
              sent home.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            EduLife OS • Teacher Portal
          </div>
        </div>

        {/* Core UI */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <StudentHealthDailyClient
            tenantId={tenantId}
            classroomId={classroomId}
            classroomName={classroom?.name ?? "Classroom"}
            date={date}
            students={students}
          />
        </div>
      </div>
    </main>
  );
}
