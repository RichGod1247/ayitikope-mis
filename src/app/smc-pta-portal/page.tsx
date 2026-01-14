// src/app/smc-pta-portal/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function SmcPtaPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-emerald-50 via-white to-emerald-50" />
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/portal.png"
              alt="SMC/PTA Portal"
              width={64}
              height={64}
              className="rounded-md object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-emerald-900">
              SMC / PTA Portal
            </h1>
            <p className="mt-1 text-gray-700">
              Collaborate on school development, track projects and finances, and communicate with the school administration.
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-emerald-800">What you can do</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• Review meeting agendas, minutes, and resolutions</li>
            <li>• Track ongoing projects (infrastructure, learning resources)</li>
            <li>• View finances: dues, levies, expenditures (read-only for now)</li>
            <li>• Receive notices from the Headteacher and Admin</li>
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            Sign-in wiring for SMC/PTA will be enabled after roles & permissions are finalized.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Image
                src="/logo.png"
                alt="Ayitikope M/A Basic School"
                width={72}
                height={72}
                className="rounded-lg object-contain"
                priority
              />
              <div className="text-sm font-semibold text-emerald-900">
                Ayitikope M/A Basic School
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-gray-700">
              For now, use the main sign-in page to access your permitted portal.
            </div>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Go to Sign In
            </Link>

            <p className="text-center text-xs text-gray-500">
              If your sign-in route is different, update this link.
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Need help? Contact the Headteacher or Admin.
          </p>
        </div>
      </section>
    </main>
  );
}
