// src/components/CoreValues.tsx
"use client";

const VALUES = [
  { title: "Knowledge",  text: "We pursue deep understanding through curiosity, critical thinking, and lifelong learning." },
  { title: "Character",  text: "We live by honesty, discipline, integrity, and respect for all." },
  { title: "Service",    text: "We use our skills and time to improve our community and uplift others." },
  { title: "Excellence", text: "We strive for quality in all we do — from learning to leadership." },
  { title: "Resilience", text: "We face challenges with courage and determination until success is achieved." },
  { title: "Innovation", text: "We encourage creativity, problem-solving, and forward-thinking in every learner." },
  { title: "Community",  text: "We believe education is a shared mission of teachers, parents, and learners." },
];

export default function CoreValues() {
  return (
    <section className="bg-white border rounded-2xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-blue-800 text-center">Our Core Values</h2>
      <p className="mt-2 text-center text-gray-700">The pillars that shape our learning, living, and leadership.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VALUES.map(v => (
          <div key={v.title} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition">
            <div className="font-semibold text-blue-700">{v.title}</div>
            <p className="mt-1 text-gray-700 text-sm">{v.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
