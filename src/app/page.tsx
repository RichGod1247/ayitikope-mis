export default function Home() {
  return (
    <main className="min-h-screen">
      {/* HERO */}
      <section className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
          Building a Brighter Future
        </h1>
        <p className="max-w-2xl mx-auto text-gray-700">
          Dedicated to nurturing young minds with excellence, discipline, and love.
        </p>

        <p className="mt-6 text-lg italic text-gray-600">
          “Knowledge, Character, Service.”
        </p>

        <div className="mt-8 flex justify-center">
          <a
            href="/about"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md transition"
          >
            Learn More
          </a>
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
              className="rounded-xl border border-blue-200 bg-white p-5 text-center shadow-sm"
            >
              <div className="text-3xl font-extrabold text-blue-700">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-gray-700">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-6 text-center text-sm text-gray-600">
        © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
      </footer>
    </main>
  );
}
