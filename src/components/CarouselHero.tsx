"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const slides = [
  { src: "/gallery/gateway-arch.png", caption: "Welcome to Ayitikope M/A Basic School" },
  { src: "/gallery/hero-campus.png", caption: "A vibrant campus for curious minds" },
  { src: "/gallery/kg-learning.png", caption: "Kindergarten: Play, Learn, Grow" },
  { src: "/gallery/jhs-classroom.png", caption: "Smart Classrooms for the future" },
  { src: "/gallery/ict-lab.png", caption: "Ultra-modern ICT Laboratory" },
  { src: "/gallery/awards.png", caption: "Award of Excellence — Raising the bar" },
];

export default function CarouselHero() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative z-0">
      {/* Hero area height = header (64px) + 520px visual = 584px on md+, a bit shorter on small */}
      <div className="relative w-full h-[420px] md:h-[584px]">
        {slides.map((s, idx) => (
          <div
            key={s.src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              idx === i ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={s.src}
              alt="Ayitikope M/A Basic School"
              fill
              priority={idx === 0}
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          </div>
        ))}
      </div>

      {/* Caption ticker (slower) */}
      <div className="bg-[--color-brand-900] text-white">
        <div className="container mx-auto px-6 py-2">
          <div className="overflow-hidden">
            <div
              key={i}
              className="whitespace-nowrap animate-[ticker_12s_linear_infinite]"
              style={{
                // Tailwind arbitrary keyframes — we define @keyframes in globals.css below
                animationDuration: "12s",
              }}
            >
              <span className="opacity-90"> {slides[i].caption} </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
