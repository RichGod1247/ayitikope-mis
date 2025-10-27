// src/app/about/mission-vision/page.tsx
import CoreValues from "../../../components/CoreValues";


export default function MissionVisionValuesPage() {
  return (
    <section className="space-y-12">
      {/* Mission & Vision */}
      <div className="bg-white border rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800 text-center">
          Our Mission & Vision
        </h1>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm">
            <h2 className="text-xl font-semibold text-blue-800">Vision</h2>
            <p className="mt-2 text-gray-700 leading-relaxed">
              To be a model basic school that nurtures learners with
              <strong> knowledge, character, and creativity</strong> — empowering
              them to think critically, act responsibly, and serve humanity with
              excellence.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm">
            <h2 className="text-xl font-semibold text-blue-800">Mission</h2>
            <p className="mt-2 text-gray-700 leading-relaxed">
              To provide a dynamic learning environment where teachers, learners,
              and parents collaborate to inspire curiosity, integrity, and
              innovation — ensuring that every child discovers their potential
              and contributes meaningfully to society.
            </p>
          </div>
        </div>
      </div>

      {/* Core Values */}
      <CoreValues />
    </section>
  );
}
