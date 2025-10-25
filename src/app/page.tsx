import CarouselHero from "@/components/CarouselHero";
import NewStrip from "@/components/NewStrip";
import NewsList from "@/components/NewsList";
import MissionVision from "@/components/MissionVision";
import AdmissionsCTA from "@/components/AdmissionsCTA";

export default function Home() {
  return (
    <>
      <CarouselHero />
      <NewStrip />

      <main className="container mx-auto px-6 py-10">
        {/* QUICK STATS */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Students", value: "420+" },
            { label: "Teachers", value: "28" },
            { label: "Classes", value: "16" },
            { label: "Awards", value: "12" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-blue-200 bg-white p-5 text-center shadow-sm"
            >
              <div className="text-3xl font-extrabold text-blue-700">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-gray-700">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Mission & Vision */}
        <MissionVision />

        {/* Admissions */}
        <AdmissionsCTA />

        {/* NEWS */}
        <NewsList max={3} />
      </main>
    </>
  );
}
