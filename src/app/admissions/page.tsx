// src/app/admissions/page.tsx
import Link from "next/link";
import Image from "next/image";

export const metadata = { title: "Admissions • Ayitikope M/A Basic School" };

const TILES = [
  {
    title: "Prospectus",
    desc: "See the full list of items for KG, Lower Primary, Upper Primary, and JHS.",
    href: "/admissions/prospectus",
  },
  {
    title: "Entry Requirements",
    desc: "What learners need to join: KG, Lower Primary, Upper Primary, and JHS.",
    href: "/admissions/entry",
  },
  {
    title: "How to Apply",
    desc: "Step-by-step guide to complete the process smoothly.",
    href: "/admissions/how-to-apply",
  },
  {
    title: "Key Dates",
    desc: "Application windows, interviews, orientation, and term start.",
    href: "/admissions/dates",
  },
  {
    title: "Fees & Levies",
    desc: "Transparent overview of fees and payment plans.",
    href: "/admissions/fees",
  },
  {
    title: "Scholarships",
    desc: "LEAP / Local NGO support and how to qualify.",
    href: "/admissions/scholarships",
  },
  {
    title: "FAQ",
    desc: "Clear answers to common parent questions.",
    href: "/admissions/faq",
  },
  {
    title: "Apply Online",
    desc: "Submit your child’s application (KG • Primary • JHS).",
    href: "/admissions/apply",
  },
];

export default function AdmissionsLanding() {
  return (
    <main className="container mx-auto px-6 py-10 space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid sm:grid-cols-[1.1fr_1fr] items-stretch">
          <div className="p-6 sm:p-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-800">
              Admissions — KG • Primary • JHS
            </h1>
            <p className="mt-2 text-gray-700 max-w-2xl">
              Values-driven education grounded in <strong>Knowledge, Character, and Service</strong>.
              Start here to explore requirements, prospectus, key dates, fees, scholarships, and submit your application.
            </p>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Link
                href="/admissions/apply"
                className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 font-semibold shadow"
              >
                Apply Online
              </Link>
              <Link
                href="/admissions/prospectus"
                className="rounded-lg bg-white hover:bg-gray-50 text-blue-700 px-6 py-3 font-semibold shadow border"
              >
                View Prospectus
              </Link>
            </div>
          </div>

          <div className="relative min-h-[200px] sm:min-h-[260px]">
            <Image
              src="/admissions.png"
              alt="Admissions"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/0 to-black/15" />
          </div>
        </div>
      </div>

      {/* Tiles */}
      <section>
        <h2 className="text-2xl font-bold text-blue-800">Admissions Hub</h2>
        <p className="text-gray-700">Everything you need, in one place.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition block"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-blue-800 group-hover:underline">
                    {t.title}
                  </div>
                  <p className="mt-1 text-gray-700 text-sm">{t.desc}</p>
                </div>
                <span className="text-blue-700">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
