"use client";

import { useEffect, useRef, useState } from "react";

export default function MissionVision() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="container mx-auto px-6 py-12">
      <h2 className="text-2xl font-semibold text-center">Our Mission & Vision</h2>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card
          title="Mission"
          show={seen}
          delay={0}
          text="To provide a safe, inclusive, and inspiring environment where every child thrives academically, socially, and morally—grounded in Knowledge, Character, and Service."
        />
        <Card
          title="Vision"
          show={seen}
          delay={150}
          text="To be a beacon of basic education—innovative, values-driven, and future-ready—empowering learners with literacy, numeracy, and digital skills for life."
        />
      </div>
    </section>
  );
}

function Card({
  title,
  text,
  show,
  delay,
}: {
  title: string;
  text: string;
  show: boolean;
  delay: number;
}) {
  return (
    <div
      className={[
        "rounded-xl border bg-white p-6 shadow-sm transition-all duration-700",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-blue-700 font-semibold">{title}</div>
      <p className="mt-2 text-gray-700">{text}</p>
    </div>
  );
}
