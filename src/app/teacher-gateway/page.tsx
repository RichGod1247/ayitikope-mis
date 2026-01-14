// src/app/teacher-gateway/page.tsx
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function TeacherGatewayPage() {
  const redirectAfterAuth = "/teacher-portal";
  const signInHref = `/auth/login?redirect=${encodeURIComponent(redirectAfterAuth)}`;
  const signUpHref = `/auth/signup?redirect=${encodeURIComponent(redirectAfterAuth)}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-zinc-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-sky-800 shadow-sm">
            EduLife OS · Teacher Access
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Public gateway
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
            Welcome to EduLife OS — Teacher Gateway
          </h1>

          <p className="text-sm md:text-base text-zinc-600 max-w-2xl">
            Sign in to access your dashboard and daily flow:{" "}
            <span className="font-semibold">attendance</span>,{" "}
            <span className="font-semibold">NaCCA-aligned lesson notes</span>,{" "}
            <span className="font-semibold">continuous assessment</span>, and learner &amp; teacher wellbeing.
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)] gap-6">
          <div className="space-y-4">
            <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-sm px-4 py-4 md:px-6 md:py-5 space-y-4">
              <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                What you unlock inside EduLife OS
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] md:text-xs text-zinc-700">
                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 space-y-1">
                  <p className="font-semibold text-sky-900">Attendance &amp; learner wellbeing</p>
                  <p>Mark attendance fast and spot early health flags.</p>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 space-y-1">
                  <p className="font-semibold text-amber-900">Lesson Design Studio</p>
                  <p>Generate NaCCA lesson notes and refine with AI Co-Tutor.</p>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2.5 space-y-1">
                  <p className="font-semibold text-violet-900">Continuous assessment</p>
                  <p>Record once. Class averages stay consistent and auditable.</p>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 space-y-1">
                  <p className="font-semibold text-emerald-900">Teacher wellbeing tracker</p>
                  <p>Track workload trends so leadership can support early.</p>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                Built around <span className="font-semibold">trust, integrity, and auditability</span>.
              </p>
            </div>

            <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/80 px-4 py-3 text-[11px] md:text-xs text-zinc-600">
              Production rule: identities never travel in URLs. Session truth only.
            </div>
          </div>

          <div className="flex items-start justify-center">
            <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white/95 shadow-sm px-4 py-5 md:px-5 md:py-6 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="relative h-14 w-14 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden">
                  <Image src="/logo.png" alt="School logo" fill sizes="56px" className="object-contain p-1.5" />
                </div>

                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-zinc-900">Teacher access</p>
                  <p className="text-[11px] text-zinc-500">
                    Sign in with your Staff ID, or create your account if your school enabled onboarding.
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

                <Link
                  href={signUpHref}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs md:text-sm font-medium text-sky-900 shadow-sm hover:bg-sky-100"
                >
                  Create teacher account
                </Link>

                <p className="text-[11px] text-zinc-500 text-center">
                  If you don’t have onboarding details, contact your headteacher/admin.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="text-[11px] text-zinc-500">
          Tip: After login, teachers land at <span className="font-semibold">/teacher-portal</span>.
        </div>
      </div>
    </main>
  );
}
