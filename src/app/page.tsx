import CarouselHero from "@/components/CarouselHero";

export const metadata = { title: "Ayitikope M/A Basic School" };

export default function HomePage() {
  return (
    <main className="container mx-auto px-6 py-8">
      <CarouselHero />

      {/* QUICK STATS (kept as-is, slightly spaced below the hero) */}
      <section className="bg-white/70 mt-10 py-10 rounded-2xl">
        <div className="container mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Students", value: "420+" },
            { label: "Teachers", value: "28" },
            { label: "Classes", value: "16" },
            { label: "Awards", value: "12" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[--color-brand-200] bg-white p-5 text-center shadow-sm"
            >
              <div className="text-3xl font-extrabold text-[--color-brand-600]">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-gray-700">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
