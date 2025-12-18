// src/app/teacher/dashboard/page.tsx

import TeacherDashboardClient from "@/components/TeacherDashboardClient";

type PageProps = {
  searchParams: {
    teacherUserId?: string;
    teacher_id?: string; // fallback, if you still want to use this in URLs
  };
};

/**
 * Classic Teacher Dashboard
 *
 * For now, this page uses nicely shaped DEMO data so that you can
 * see the full colourful dashboard UI working end-to-end.
 *
 * Later, we’ll swap the demo data for real Prisma-powered queries
 * (assessments per day, assignments, etc.).
 */
export default function TeacherDashboardPage({ searchParams }: PageProps) {
  // Allow both ?teacherUserId=... and ?teacher_id=... for now.
  const teacherKey =
    searchParams.teacherUserId || searchParams.teacher_id || "";

  if (!teacherKey) {
    // No teacher identity in the URL → friendly message
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">
            Teacher Dashboard
          </h1>
          <p className="text-sm text-gray-700">
            This is the classic Teacher Dashboard view inside{" "}
            <span className="font-semibold">EduLife OS</span>. It shows your
            classes, assignments and today&apos;s continuous assessment entries.
          </p>

          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">How to open this dashboard in demo mode</p>
            <ol className="list-decimal ml-5 space-y-1 text-xs md:text-sm">
              <li>
                Append{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] font-mono">
                  ?teacherUserId=&lt;some-id&gt;
                </code>{" "}
                to this URL (for example, the same <code>teacherUserId</code>{" "}
                you use on the Teacher Portal).
              </li>
              <li>
                In production, this ID will come automatically from the signed-in
                teacher account, so teachers will not see this message.
              </li>
            </ol>
          </div>

          <p className="text-xs text-gray-500">
            Example:{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
              /teacher/dashboard?teacherUserId=cmhhnguk5000ivcpgmjj3nxn4
            </code>
          </p>
        </div>
      </main>
    );
  }

  // ---------- DEMO DATA (UI only) ----------
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Demo "teacher" object – later we’ll hydrate this from the real Teacher table
  const teacher = {
    teacher_id: teacherKey,
    first_name: "Demo",
    last_name: "Teacher",
  };

  // Homeroom demo (you can delete or adjust later)
  const homeroom = {
    class_code: "B4",
    class_name: "Basic 4 Red",
    level: "Primary" as const,
  };

  // Demo subject teaching assignments
  const assignments = [
    {
      assignment_id: "demo-1",
      class_code: "B4",
      subject: "Mathematics",
      academic_year: "2025/2026",
      term: "1st Term",
      todayCount: 2,
      latestISO: `${today.toISOString().slice(0, 10)}T09:15:00.000Z`,
      classSize: 32,
    },
    {
      assignment_id: "demo-2",
      class_code: "B6",
      subject: "Science",
      academic_year: "2025/2026",
      term: "1st Term",
      todayCount: 1,
      latestISO: `${today.toISOString().slice(0, 10)}T10:20:00.000Z`,
      classSize: 28,
    },
    {
      assignment_id: "demo-3",
      class_code: "JHS1",
      subject: "Computing",
      academic_year: "2025/2026",
      term: "1st Term",
      todayCount: 0,
      latestISO: null,
      classSize: 35,
    },
  ];

  const todayTotal =
    assignments.reduce(
      (sum, a) => sum + (typeof a.todayCount === "number" ? a.todayCount : 0),
      0
    ) || 0;

  const todayMeta = {
    date: todayLabel,
    total: todayTotal,
    homeroomCount: assignments[0]?.todayCount ?? 0,
  };

  // Map of class_code → class size
  const classCounts: Record<string, number> = {};
  assignments.forEach((a) => {
    if (typeof a.classSize === "number") {
      classCounts[a.class_code] = a.classSize;
    }
  });

  // Map of `${class_code}__${subject}` → latestISO
  const latestMap: Record<string, string | null> = {};
  assignments.forEach((a) => {
    const key = `${a.class_code}__${a.subject}`;
    latestMap[key] = a.latestISO ?? null;
  });

  // Demo "today" entries – this populates the bottom table
  const recentToday = [
    {
      record_id: "rec-1",
      class_code: "B4",
      subject: "Mathematics",
      created_at: `${today.toISOString().slice(0, 10)} 09:15`,
      student_id: "STU-001",
      score: 8,
      assessment_type: "Class exercise",
    },
    {
      record_id: "rec-2",
      class_code: "B4",
      subject: "Mathematics",
      created_at: `${today.toISOString().slice(0, 10)} 09:17`,
      student_id: "STU-002",
      score: 9,
      assessment_type: "Class exercise",
    },
    {
      record_id: "rec-3",
      class_code: "B6",
      subject: "Science",
      created_at: `${today.toISOString().slice(0, 10)} 10:20`,
      student_id: "STU-010",
      score: 7,
      assessment_type: "Quiz",
    },
  ];

  const alerts: string[] = [
    "Demo data only — we’ll plug this into real assessments and class lists in the next EduLife OS sprint.",
  ];

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <TeacherDashboardClient
          teacher={teacher}
          homeroom={homeroom}
          assignments={assignments}
          todayMeta={todayMeta}
          classCounts={classCounts}
          latestMap={latestMap}
          recentToday={recentToday}
          alerts={alerts}
        />
      </div>
    </main>
  );
}
