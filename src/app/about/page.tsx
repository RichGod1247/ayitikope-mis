// src/app/about/page.tsx
import UnifiedMissionVision from "../../components/UnifiedMissionVision";
import CoreValues from "../../components/CoreValues";

export const metadata = { title: "About • Ayitikope M/A Basic School" };

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 py-10 space-y-10">
      <header>
        <h1 className="text-3xl font-bold">About Ayitikope M/A Basic School</h1>
        <p className="mt-3 max-w-3xl text-gray-700">
          We are a community-focused basic school dedicated to nurturing young minds through
          excellence, character formation, and service. Our vision is to equip every learner
          with strong literacy, numeracy, digital skills, and values for life.
        </p>
      </header>

      {/* Unified Mission & Vision (same component used on the homepage and mission-vision route) */}
      <UnifiedMissionVision />

      {/* Core Values (shared) */}
      <CoreValues />

      {/* Facilities highlights (kept) */}
      <section className="mt-2">
        <h2 className="text-2xl font-semibold">Campus & Facilities</h2>
        <p className="mt-2 text-gray-700">
          Our campus features well-lit classrooms, a growing ICT laboratory, and play-based
          learning spaces for KG. We continuously improve facilities through community
          partnerships and stakeholder support.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { src: "/gallery/hero-campus.png", alt: "Campus" },
            { src: "/gallery/jhs-classroom.png", alt: "Smart Classroom" },
            { src: "/gallery/ict-lab.png", alt: "ICT Lab" },
          ].map((img) => (
            <div key={img.src} className="overflow-hidden rounded-xl border">
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-48 object-cover hover:scale-[1.02] transition"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
