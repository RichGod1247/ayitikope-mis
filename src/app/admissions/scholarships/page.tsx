// src/app/admissions/scholarships/page.tsx

import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-static";

export default function ScholarshipsPage() {
  const SCHOLARSHIPS = [
    {
      key: "merit",
      title: "Merit Scholarship",
      badge: "Academic Excellence",
      desc:
        "Awarded to students who demonstrate outstanding academic performance, strong character, and leadership potential.",
      benefits: ["Full/partial fees", "Books & learning packs", "Mentorship"],
      eligibility: [
        "Top 10% in class or BECE mock",
        "Strong conduct & attendance",
        "Teacher/Headteacher recommendation",
      ],
    },
    {
      key: "need",
      title: "Need-Based Scholarship",
      badge: "Financial Aid",
      desc:
        "Supports learners from low-income families with demonstrated financial need and consistent school commitment.",
      benefits: ["Full/partial fees", "Uniform support", "Feeding/transport support (limited)"],
      eligibility: [
        "Proof of financial need",
        "Good attendance & behaviour",
        "Community/SMC/PTA validation",
      ],
    },
    {
      key: "stem",
      title: "STEM Talent Scholarship",
      badge: "Science • Tech • Math",
      desc:
        "For learners excelling in Science, Technology, Engineering, or Mathematics projects, competitions, or assessments.",
      benefits: ["Project grants", "Science kits/ICT time", "Competition sponsorship"],
      eligibility: [
        "STEM project/competition evidence",
        "Teacher endorsement",
        "Portfolio or demo (where applicable)",
      ],
    },
    {
      key: "sports",
      title: "Sports & Arts Scholarship",
      badge: "Athletics • Creative Arts",
      desc:
        "For exceptional talent in sports or the arts who also maintain good academic standing and discipline.",
      benefits: ["Training support", "Kits/instruments", "Event fees (limited)"],
      eligibility: [
        "Coach/Teacher recommendation",
        "Evidence of awards/performances",
        "Good academic standing",
      ],
    },
  ];

  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-blue-50 via-white to-blue-50" />
        <div className="relative flex items-center gap-5 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/admissions.png"
              alt="Scholarships"
              width={72}
              height={72}
              className="rounded-md object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">
              Scholarships & Financial Aid
            </h1>
            <p className="mt-2 max-w-3xl text-gray-700">
              We believe great potential should never be limited by circumstance. Explore our
              scholarship pathways and apply if you qualify.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="#how-to-apply"
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-white font-semibold hover:bg-blue-800"
              >
                How to Apply
              </Link>
              <Link
                href="/admissions"
                className="rounded-lg border px-5 py-2.5 text-blue-700 font-semibold bg-white hover:bg-gray-50"
              >
                Admissions Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Cards */}
      <section className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {SCHOLARSHIPS.map((s) => (
          <article
            key={s.key}
            className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-800">{s.title}</h2>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                {s.badge}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-700">{s.desc}</p>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-800">Benefits</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {s.benefits.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-800">Eligibility</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {s.eligibility.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex justify-between">
              <Link
                href={`/admissions/scholarships#${s.key}`}
                className="text-sm font-semibold text-blue-700 hover:underline"
              >
                Learn more
              </Link>
              <Link
                href="/admissions/scholarships/apply"
                className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Apply
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* How to apply */}
      <section id="how-to-apply" className="mt-12 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-blue-800">How to Apply</h2>
        <ol className="mt-3 list-decimal pl-5 text-gray-700 space-y-1">
          <li>Choose the scholarship that best fits your profile.</li>
          <li>
            Prepare evidence (report cards, recommendation, awards, financial-need proof where
            applicable).
          </li>
          <li>
            Complete the short form on{" "}
            <Link href="/admissions/scholarships/apply" className="text-blue-700 font-semibold underline">
              the scholarship application page
            </Link>
            .
          </li>
          <li>We’ll review and contact you/your parent via WhatsApp.</li>
        </ol>
        <div className="mt-5">
          <Link
            href="/admissions/scholarships/apply"
            className="inline-flex items-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
          >
            Start Scholarship Application
          </Link>
        </div>
      </section>
    </main>
  );
}
