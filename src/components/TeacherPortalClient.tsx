// src/components/TeacherPortalClient.tsx
"use client";

import Link from "next/link";

type TeacherPortalProps = {
  tenantId: string;
  teacherUserId: string;
  defaultTerm: string;
  defaultAcademicYear: string;
  demoClassroomId?: string;
  /**
   * Optional nice display name for the greeting.
   * If not provided, we just show "Teacher".
   */
  teacherDisplayName?: string;
};

export default function TeacherPortalClient({
  tenantId,
  teacherUserId,
  defaultTerm,
  defaultAcademicYear,
  demoClassroomId,
  teacherDisplayName,
}: TeacherPortalProps) {
  const displayName = teacherDisplayName?.trim() || "Teacher";

  // ===========================
  // URL builders (calm OS)
  // ===========================
  const hasTeacherIdentity = Boolean(teacherUserId);

  const attendanceUrl = `/teacher/attendance?tenantId=${encodeURIComponent(
    tenantId
  )}&teacherUserId=${encodeURIComponent(teacherUserId)}`;

  const lessonNotesUrl = `/teacher/lesson-notes?tenantId=${encodeURIComponent(
    tenantId
  )}&teacherUserId=${encodeURIComponent(teacherUserId)}`;

  const termDashboardUrl = `/teacher/assessment/term-dashboard?tenantId=${encodeURIComponent(
    tenantId
  )}&teacherUserId=${encodeURIComponent(teacherUserId)}${
    demoClassroomId
      ? `&classroomId=${encodeURIComponent(demoClassroomId)}`
      : ""
  }&term=${encodeURIComponent(defaultTerm)}&academicYear=${encodeURIComponent(
    defaultAcademicYear
  )}`;

  // NEW: Curriculum & Scheme routes (we’re assuming these routes exist
  // or will be completed – no extra params needed for now)
  const curriculumExplorerUrl = "/teacher/curriculum";
  const schemesUrl = "/teacher/schemes";

  // NEW: classic dashboard URL – now carries teacherUserId so you don’t see
  // the “append ?teacher_id=<uuid>” message anymore.
  const classicDashboardUrl = hasTeacherIdentity
    ? `/teacher/dashboard?teacherUserId=${encodeURIComponent(teacherUserId)}`
    : "/teacher/dashboard";

  return (
    <div className="min-h-[70vh] w-full bg-gradient-to-b from-sky-50/60 via-white to-sky-50/40 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {/* ================= HEADER ================ */}
        <section className="rounded-3xl border border-sky-100/80 bg-white/90 p-6 shadow-sm backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-sky-500">
                EduLife OS · Teacher Portal
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-sky-950 md:text-3xl">
                Good day, {displayName}.
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-700 md:text-base">
                This is your calm workspace for{" "}
                <span className="font-semibold">attendance</span>,{" "}
                <span className="font-semibold">NaCCA lesson notes</span> and{" "}
                <span className="font-semibold">continuous assessment</span> —
                all aligned with Ayitikope M/A&apos;s daily rhythm.
              </p>

              {/* Classic dashboard link (now with teacherUserId) */}
              <div className="mt-3 flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-500 md:text-xs">
                <Link
                  href={classicDashboardUrl}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white/80 px-3 py-1 hover:bg-zinc-50"
                >
                  Open classic Teacher Dashboard
                </Link>
                <span className="hidden text-zinc-400 md:inline">
                  · Dashboard ↔ Portal ↔ Lesson Notes stay in sync with the
                  same teacher &amp; tenant.
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-col items-end gap-1 text-right text-[11px] text-slate-500 md:mt-0 md:text-xs">
              <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">
                Term: {defaultTerm}
              </span>
              <span>Academic Year: {defaultAcademicYear}</span>
              <span className="font-mono text-[10px] text-slate-400">
                Tenant: {tenantId.slice(0, 8)}…
              </span>
            </div>
          </div>
        </section>

        {/* ============== MAIN ACTIONS GRID ============== */}
        <section className="rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 md:text-lg">
              Today&apos;s Flow
            </h2>
            <p className="text-[11px] text-slate-500 md:text-xs">
              Start from the left and move clockwise if you like a simple
              routine.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Attendance workspace */}
            <Link
              href={attendanceUrl}
              className="group flex flex-col justify-between rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-sky-300 hover:bg-sky-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  Step 1 · Attendance
                </div>
                <h3 className="text-sm font-semibold text-sky-950 md:text-base">
                  Open Attendance workspace
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Take register for your classes, tied directly to your tenant
                  and teacher ID in EduLife OS.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-sky-800">
                <span>Mark present / absent / late</span>
                <span className="font-medium group-hover:underline">
                  Go to Attendance →
                </span>
              </div>
            </Link>

            {/* Lesson Notes workspace */}
            <Link
              href={lessonNotesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  Step 2 · Lesson Notes
                </div>
                <h3 className="text-sm font-semibold text-emerald-950 md:text-base">
                  My NaCCA Lesson Notes studio
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Create, edit, submit and print NaCCA-aligned lesson notes,
                  auto-filled from KG–JHS curriculum.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-800">
                <span>Draft · Submit · Print</span>
                <span className="font-medium group-hover:underline">
                  Open Lesson Notes →
                </span>
              </div>
            </Link>

            {/* Term performance dashboard */}
            <Link
              href={termDashboardUrl}
              className="group flex flex-col justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                  Step 3 · Assessments
                </div>
                <h3 className="text-sm font-semibold text-indigo-950 md:text-base">
                  Term performance dashboard
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  See how your class is performing this term for the current
                  academic year, with options to drill down.
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-1 text-[11px] text-indigo-800">
                {demoClassroomId ? (
                  <span className="text-[10px] text-slate-500">
                    Classroom:{" "}
                    <span className="font-mono">{demoClassroomId}</span>
                  </span>
                ) : null}
                <div className="flex items-center justify-between">
                  <span>
                    {defaultTerm} · {defaultAcademicYear}
                  </span>
                  <span className="font-medium group-hover:underline">
                    Open Dashboard →
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* ============== CURRICULUM & PLANNING TOOLS ============== */}
        <section className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 md:text-lg">
              Planning & Curriculum tools
            </h2>
            <p className="text-[11px] text-slate-500 md:text-xs">
              This is where the official NaCCA curriculum powers schemes of
              work and lesson notes.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Curriculum Explorer */}
            <Link
              href={curriculumExplorerUrl}
              className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-white hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800">
                  Curriculum Explorer
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 md:text-base">
                  Browse NaCCA curriculum (KG–JHS)
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Explore strands, sub-strands, indicators and exemplars for any
                  phase, level and subject.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-700">
                <span>Strands → Indicators → Exemplars</span>
                <span className="font-medium group-hover:underline">
                  Open Explorer →
                </span>
              </div>
            </Link>

            {/* Schemes of Work */}
            <Link
              href={schemesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-amber-300 hover:bg-amber-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  Schemes of Work
                </div>
                <h3 className="text-sm font-semibold text-amber-950 md:text-base">
                  Build & print term schemes
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Add indicators from the curriculum into weekly schemes for
                  each class, ready for GES supervision.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-amber-900">
                <span>Week-by-week planning</span>
                <span className="font-medium group-hover:underline">
                  Open Schemes →
                </span>
              </div>
            </Link>

            {/* Lesson Notes direct link */}
            <Link
              href={lessonNotesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                  Lesson Notes
                </div>
                <h3 className="text-sm font-semibold text-emerald-950 md:text-base">
                  Generate & refine lesson notes
                </h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Start from your scheme or directly from the curriculum and
                  prepare daily lesson notes for any class.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-900">
                <span>Objectives · TLMs · Activities</span>
                <span className="font-medium group-hover:underline">
                  Open Lesson Notes →
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* ============ SMALL EXTRAS / NOTES ============ */}
        <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 text-[11px] text-slate-500 shadow-sm md:text-xs">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p>
              Tip: You can always jump into the{" "}
              <span className="font-semibold text-sky-800">
                classic Teacher Dashboard
              </span>{" "}
              for a more detailed view of assignments and daily assessments.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={classicDashboardUrl}
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 font-medium text-sky-800 hover:bg-sky-100"
              >
                Go to classic Dashboard
              </Link>
              <Link
                href={lessonNotesUrl}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Continue a lesson note
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
