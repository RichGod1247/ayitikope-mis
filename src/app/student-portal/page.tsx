import Image from "next/image";
import SignInForm from "@/components/SignInForm";

export default function StudentsPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-sky-50 via-white to-sky-50" />
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/portal.png"
              alt="Students Portal"
              width={64}
              height={64}
              className="rounded-md object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-sky-900">
              Students Portal
            </h1>
            <p className="mt-1 text-gray-700">
              Access timetable, assignments, results, attendance, and learning resources.
            </p>
          </div>
        </div>
      </header>

      {/* Two-column: info + form */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Info card */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-sky-800">What you can do</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• See your timetable and announcements</li>
            <li>• View assignments and submit work (coming soon)</li>
            <li>• Check results and continuous assessment</li>
            <li>• Track your attendance snapshots</li>
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            (Demo for now — we’ll enable student roles and permissions next.)
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
              <div className="mt-2 text-sm font-semibold text-sky-900">
                Ayitikope M/A Basic School
              </div>
            </div>
          </div>

          <div className="flex items-start justify-center">
            <div className="w-full max-w-md">
              <SignInForm role="student" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Trouble signing in? Ask your class teacher for help.
          </p>
        </div>
      </section>
    </main>
  );
}
