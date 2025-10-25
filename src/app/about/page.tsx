export const metadata = { title: "About • Ayitikope M/A Basic School" };

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">About Ayitikope M/A Basic School</h1>
      <p className="mt-3 max-w-3xl text-gray-700">
        We are a community-focused basic school dedicated to nurturing young minds through
        excellence, character formation, and service. Our vision is to equip every learner
        with strong literacy, numeracy, digital skills, and values for life.
      </p>

      {/* Mission / Vision / Values */}
      <section className="mt-8 grid gap-6 sm:grid-cols-3">
        <Card title="Our Mission">
          To provide a safe, inclusive, and inspiring environment where every child can thrive
          academically, socially, and morally.
        </Card>
        <Card title="Our Vision">
          To be a beacon of basic education in our district—innovative, values-driven, and future-ready.
        </Card>
        <Card title="Our Values">
          Respect • Integrity • Hard Work • Service • Excellence
        </Card>
      </section>

      {/* Facilities highlights */}
      <section className="mt-10">
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
              {/* plain img for speed */}
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-gray-700">{children}</p>
    </div>
  );
}
