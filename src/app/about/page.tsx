export const metadata = {
  title: "About • Ayitikope M/A Basic School",
};

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-bold mb-6">About Us</h1>

      <section className="space-y-4 text-gray-700 leading-relaxed">
        <p>
          Ayitikope M/A Basic School is committed to academic excellence, good
          character, and community service. Since our establishment, we’ve focused
          on building lifelong learners and responsible citizens.
        </p>
        <p>
          We provide a safe and caring environment, qualified teachers, and a
          balanced curriculum that nurtures every child’s potential.
        </p>
      </section>

      <div className="grid sm:grid-cols-2 gap-8 mt-10">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Our Mission</h2>
          <p className="text-gray-700">
            To deliver quality basic education that develops the mind, shapes
            character, and inspires service.
          </p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Our Vision</h2>
          <p className="text-gray-700">
            To be a model basic school producing confident, compassionate, and
            competent future leaders.
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Head Teacher’s Note</h2>
        <p className="text-gray-700">
          Welcome to Ayitikope M/A Basic School. Together with parents and the
          community, we strive to build a solid foundation for every learner.
        </p>
      </section>
    </main>
  );
}
