// src/components/UnifiedMissionVision.tsx
"use client";

export default function UnifiedMissionVision() {
  return (
    <section className="container mx-auto px-0 py-8">
      <div className="bg-white border rounded-2xl shadow-sm p-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-blue-800 text-center">
          Our Mission & Vision
        </h2>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm">
            <h3 className="text-xl font-semibold text-blue-800">Vision</h3>
            <p className="mt-2 text-gray-700 leading-relaxed">
              To be a model basic school that nurtures learners with
              <strong> knowledge, character, and creativity</strong> — empowering
              them to think critically, act responsibly, and serve humanity with
              excellence.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm">
            <h3 className="text-xl font-semibold text-blue-800">Mission</h3>
            <p className="mt-2 text-gray-700 leading-relaxed">
              To provide a dynamic learning environment where teachers, learners,
              and parents collaborate to inspire curiosity, integrity, and
              innovation — ensuring that every child discovers their potential
              and contributes meaningfully to society.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
