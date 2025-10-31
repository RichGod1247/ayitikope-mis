// src/app/parent-portal/page.tsx
import Image from "next/image";
import SignInForm from "@/components/SignInForm";

export default function ParentsPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-emerald-50 via-white to-emerald-50" />
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/portal.png"
              alt="Parents Portal"
              width={64}
              height={64}
              className="rounded-md object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-emerald-900">
              Parents Portal
            </h1>
            <p className="mt-1 text-gray-700">
              Check your child’s admissions status, attendance, assessments, and announcements.
            </p>
          </div>
        </div>
      </header>

      {/* Two-column: info + form */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Info card */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-emerald-800">What you can do</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• Track admissions & updates</li>
            <li>• View attendance snapshots and term summaries</li>
            <li>• See results and continuous assessment (when published)</li>
            <li>• Receive official notices via WhatsApp (connected already!)</li>
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            (Demo only for now — we’ll map real parent accounts to student records next.)
          </p>
        </div>

        {/* Sign-in card with logo header */}
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
              <div className="mt-2 text-sm font-semibold text-emerald-900">
                Ayitikope M/A Basic School
              </div>
            </div>
          </div>

          <div className="flex items-start justify-center">
            <div className="w-full max-w-md">
              <SignInForm role="parent" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Need help? Contact your child’s class teacher or the office.
          </p>
        </div>
      </section>
    </main>
  );
}
