// src/app/teacher-portal/page.tsx
import Image from "next/image";
import Link from "next/link";
import TeacherPortalClient from "@/components/TeacherPortalClient";

type PageProps = {
  searchParams: {
    tenantId?: string;
    teacherUserId?: string;
    demoClassroomId?: string;
  };
};

/**
 * Teacher Portal entry page.
 *
 * - If teacherUserId is present → show the calm Teacher Portal workspace
 *   (TeacherPortalClient) + a button to open the classic Teacher Dashboard.
 *
 * - If teacherUserId is missing → show a marketing-style page that explains
 *   what teachers get inside EduLife OS, with a sign-in CTA under a logo.
 */
export default function TeacherPortalPage({ searchParams }: PageProps) {
  const tenantId =
    searchParams.tenantId ?? "cmhhnghn00008vcpgp3fl07fl"; // your demo tenant fallback
  const teacherUserId = searchParams.teacherUserId || "";
  const demoClassroomId = searchParams.demoClassroomId;

  const hasTeacherIdentity = Boolean(teacherUserId);

  // 👉 update this if your auth route is different (e.g. "/login")
  const signInHref = `/auth/signin?redirect=/teacher-portal`;

  if (!hasTeacherIdentity) {
    // ---------- LOGGED-OUT / NO-ID VIEW ----------
    return (
      <main className="min-h-screen bg-gradient-to-b from-sky-50 via-zinc-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 space-y-8">
          {/* Hero */}
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-sky-800 shadow-sm">
              EduLife OS · Teacher Portal
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built for calm, honest schools
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
              A calm digital home for your school&apos;s teachers
            </h1>
            <p className="text-sm md:text-base text-zinc-600 max-w-2xl">
              Once signed in, teachers can take{" "}
              <span className="font-semibold">attendance</span>, design{" "}
              <span className="font-semibold">NaCCA-aligned lesson notes</span>,
              record <span className="font-semibold">continuous assessment</span>{" "}
              and keep a gentle eye on learner wellbeing — all in one place.
            </p>
          </header>

          {/* 2-column layout: Features + Sign-in card */}
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)] gap-6">
            {/* LEFT: What teachers can do inside EduLife OS */}
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-sm px-4 py-4 md:px-6 md:py-5 space-y-4">
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  What teachers get once they sign in
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] md:text-xs text-zinc-700">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-sky-900">
                      Attendance &amp; learner wellbeing
                    </p>
                    <p>
                      Mark daily attendance in a few taps and (later) plug in
                      the{" "}
                      <span className="font-semibold">
                        attendance + temperature
                      </span>{" "}
                      device to spot health flags early.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-amber-900">
                      Lesson Design Studio
                    </p>
                    <p>
                      Generate{" "}
                      <span className="font-semibold">
                        NaCCA-aligned lesson notes
                      </span>{" "}
                      from the official curriculum and refine them with the{" "}
                      <span className="font-semibold">AI Co-Tutor</span>.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-violet-900">
                      Continuous assessment &amp; class averages
                    </p>
                    <p>
                      Record tests, projects and homework once. EduLife OS keeps
                      an{" "}
                      <span className="font-semibold">
                        honest class average
                      </span>{" "}
                      that teachers, headteachers and parents can all see.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-emerald-900">
                      Teacher wellbeing tracker
                    </p>
                    <p>
                      Quietly record your{" "}
                      <span className="font-semibold">weekly stress level</span>{" "}
                      and workload. Headteachers see trends — not gossip — and
                      can support teachers early.
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500">
                  All of this is wrapped around{" "}
                  <span className="font-semibold">
                    trust, character and integrity
                  </span>{" "}
                  so that data supports real human teaching, not fear.
                </p>
              </div>

              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/80 px-4 py-3 text-[11px] md:text-xs text-zinc-600">
                <p>
                  Once your school is fully onboarded, teachers will come here
                  and simply{" "}
                  <span className="font-semibold">sign in with their EduLife</span>{" "}
                  account. After that, they can always jump into the{" "}
                  <span className="font-semibold">classic Teacher Dashboard</span>{" "}
                  for a deeper, data-heavy view of their assignments and
                  assessments.
                </p>
              </div>
            </div>

            {/* RIGHT: Sign-in card with logo */}
            <div className="flex items-start justify-center">
              <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white/95 shadow-sm px-4 py-5 md:px-5 md:py-6 space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-14 w-14 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden">
                    {/* Assumes public/logo.png exists */}
                    <Image
                      src="/logo.png"
                      alt="School logo"
                      fill
                      sizes="56px"
                      className="object-contain p-1.5"
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold text-zinc-900">
                      Sign in to Teacher Portal
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Use your EduLife OS account to access your classes,
                      lesson notes and assessments.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link
                    href={signInHref}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-black bg-black px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-zinc-900"
                  >
                    Sign in
                  </Link>
                  <p className="text-[11px] text-zinc-500 text-center">
                    New school? Talk to your headteacher or system
                    administrator to be added as a teacher in EduLife OS.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ---------- DEMO "SIGNED-IN" VIEW (calm workspace + classic link) ----------
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-zinc-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-4 md:space-y-6">
        {/* Calm Teacher Portal workspace */}
        <TeacherPortalClient
          tenantId={tenantId}
          teacherUserId={teacherUserId}
          defaultTerm="1st Term"
          defaultAcademicYear="2025/2026"
          demoClassroomId={demoClassroomId}
        />

        {/* Classic dashboard hint */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 shadow-sm px-4 py-3 md:px-5 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[11px] md:text-xs text-zinc-700">
          <div className="space-y-1">
            <p className="font-semibold text-zinc-900">
              Need a more detailed, data-heavy view?
            </p>
            <p>
              Open the{" "}
              <span className="font-semibold">classic Teacher Dashboard</span>{" "}
              to see all your assignments, today&apos;s assessments and class
              averages in one place.
            </p>
            <p className="text-[10px] text-zinc-500">
              In production, this link will use the signed-in teacher account
              automatically — no manual IDs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/teacher/dashboard?teacherUserId=${encodeURIComponent(
                teacherUserId
              )}`}
              className="inline-flex items-center justify-center rounded-xl border border-blue-700 bg-blue-700 px-3 py-1.5 text-[11px] md:text-xs font-medium text-white shadow-sm hover:bg-blue-800"
            >
              Go to classic Teacher Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
