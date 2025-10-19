export const metadata = { title: "About • Ayitikope M/A Basic School" };

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      {/* Title */}
      <h1 className="text-3xl font-bold tracking-tight">About Our School</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Ayitikope M/A Basic School is committed to nurturing young minds with
        excellence, discipline, and love — building knowledge, character, and service.
      </p>

      {/* Vision & Mission */}
      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Vision</h2>
          <p className="mt-2 text-gray-700">
            To be a model basic school in Ghana developing confident, creative,
            and compassionate learners ready for a changing world.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Mission</h2>
          <p className="mt-2 text-gray-700">
            To provide a safe, stimulating environment with excellent teaching,
            strong values, and modern tools that help every learner thrive.
          </p>
        </div>
      </section>

      {/* Core Values */}
      <section className="mt-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Core Values</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Discipline & Respect",
            "Integrity & Service",
            "Excellence in Learning",
            "Teamwork & Leadership",
            "Creativity & Innovation",
            "Care & Community",
          ].map((v) => (
            <li key={v} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[--color-brand-500]" />
              <span className="text-gray-700">{v}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Quick facts */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">At a Glance</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Students", value: "420+" },
            { label: "Teachers", value: "28" },
            { label: "Classes", value: "16" },
            { label: "Awards", value: "12" },
          ].map((f) => (
            <div
              key={f.label}
              className="rounded-xl border bg-white p-5 text-center shadow-sm"
            >
              <div className="text-2xl font-extrabold text-[--color-brand-600]">
                {f.value}
              </div>
              <div className="mt-1 text-sm text-gray-700">{f.label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
