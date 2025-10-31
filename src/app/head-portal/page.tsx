// src/app/head-portal/page.tsx
import Image from "next/image";
import SignInForm from "@/components/SignInForm";

export const metadata = { title: "Headteacher’s Portal • Ayitikope M/A Basic School" };

export default function HeadPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-indigo-50 via-white to-indigo-50" />
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/portal.png"
              alt="Headteacher Portal"
              width={64}
              height={64}
              className="rounded-md object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-900">
              Headteacher’s Portal
            </h1>
            <p className="mt-1 text-gray-700">
              Approvals, admissions oversight, notifications, and school-wide analytics.
            </p>
          </div>
        </div>
      </header>

      {/* Two-column: info + form */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Info card */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-indigo-800">What you can do</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• Review & approve admissions</li>
            <li>• See notifications queue & delivery status</li>
            <li>• View attendance, assessments, and fee snapshots</li>
            <li>• Quick links to Admin dashboards</li>
          </ul>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a
              href="/admin/admissions"
              className="rounded-lg border px-4 py-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
            >
              Open Admissions Dashboard
            </a>
            <a
              href="/admin/notifications"
              className="rounded-lg border px-4 py-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
            >
              Open Notifications Log
            </a>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            (Demo: these dashboards are dev-only for now; we’ll add proper auth/roles later.)
          </p>
        </div>

        {/* Sign-in card (reuse teacher role for now) */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <Image
                src="/logo.png"
                alt="Ayitikope M/A Basic School"
                width={72}
                height={72}
                className="rounded-lg object-contain"
                priority
              />
              <div className="mt-2 text-sm font-semibold text-indigo-900">
                Ayitikope M/A Basic School
              </div>
            </div>
          </div>

          {/* Using teacher role temporarily (both are staff).
             We’ll introduce dedicated roles when we wire real auth. */}
          <div className="flex items-start justify-center">
            <div className="w-full max-w-md">
              <SignInForm role="teacher" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Demo sign-in. We’ll switch to real Headteacher credentials later.
          </p>
        </div>
      </section>
    </main>
  );
}
