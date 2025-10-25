import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* HERO with background image */}
      <section className="relative h-[56vh] sm:h-[64vh]">
        {/* Background photo */}
        <Image
          src="/gateway-arch.png"
          alt="Welcome to Ayitikope M/A Basic School entrance"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        {/* Soft overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-white/0" />

        {/* Centered hero text */}
        <div className="relative z-10 h-full container mx-auto px-6 flex flex-col items-center justify-center text-center">
          <h1 className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] text-4xl sm:text-5xl font-extrabold">
            Building a Brighter Future
          </h1>
          <p className="mt-3 max-w-2xl text-white/90">
            Dedicated to nurturing young minds with excellence, discipline, and love.
          </p>
          <p className="mt-5 text-white/90 italic">“Knowledge, Character, Service.”</p>

          <div className="mt-8">
            <a
              href="/about"
              className="inline-block bg-[--color-brand-500] hover:bg-[--color-brand-600] text-white px-8 py-3 rounded-lg font-semibold shadow-md transition"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* QUICK STATS */}
      <section className="bg-white/70 py-10">
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
              <div className="text-3xl font-extrabold text-[--color-brand-600]">{stat.value}</div>
              <div className="mt-1 text-sm text-gray-700">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER (layout also has one; if you prefer only the global footer, you can remove this) */}
      <footer className="py-6 text-center text-sm text-gray-600">
        © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
      </footer>
    </main>
  );
}
