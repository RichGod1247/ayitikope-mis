"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Slide = {
  src: string;
  title: string;
  blurb: string;
};

const SLIDES: Slide[] = [
  {
    src: "/gallery/gateway-arch.png",
    title: "Welcome to Ayitikope M/A Basic School",
    blurb: "An inviting campus entrance that blends Ghanaian character with a modern outlook.",
  },
  {
    src: "/gallery/kg-learning.jpg",
    title: "Kindergarten • Play & Discovery",
    blurb: "Happy little learners exploring letters, shapes and teamwork through play.",
  },
  {
    src: "/gallery/jhs-classroom.jpg",
    title: "Smart JHS Classroom",
    blurb: "Future-ready teaching with smart walls, great lighting and a calm learning space.",
  },
  {
    src: "/gallery/ict-lab.jpg",
    title: "Ultra-modern ICT Lab",
    blurb: "Practical digital skills for every learner—computers for real, hands-on learning.",
  },
  {
    src: "/gallery/awards.jpg",
    title: "Award of Excellence",
    blurb: "Proud of our learners and staff for consistent character, service and achievement.",
  },
];

export default function CarouselHero() {
  const [index, setIndex] = useState(0);

  // Auto-advance every 6s
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  function go(to: number) {
    setIndex((to + SLIDES.length) % SLIDES.length);
  }

  const current = SLIDES[index];

  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-white">
      {/* Image rail */}
      <div className="relative h-[50vh] sm:h-[60vh] w-full overflow-hidden">
        <div
          className="flex h-full w-[500%] transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s, i) => (
            <div key={i} className="relative h-full w-full shrink-0">
              {/* use plain <img> for simplicity since files are in /public */}
              <img
                src={s.src}
                alt={s.title}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
              {/* gradient top/bottom for readability */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent" />
            </div>
          ))}
        </div>

        {/* Caption card (fades in each slide) */}
        <div className="absolute inset-x-0 bottom-6 mx-auto w-[92%] max-w-5xl">
          <div className="rounded-xl bg-white/85 p-4 shadow-xl backdrop-blur transition-all duration-500">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{current.title}</h2>
            <p className="mt-1 text-sm sm:text-base text-gray-700">{current.blurb}</p>
          </div>
        </div>

        {/* Controls */}
        <button
          aria-label="Previous slide"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-white hover:bg-black/60"
          onClick={() => go(index - 1)}
        >
          ‹
        </button>
        <button
          aria-label="Next slide"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-white hover:bg-black/60"
          onClick={() => go(index + 1)}
        >
          ›
        </button>

        {/* Dots */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                i === index ? "bg-white" : "bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Opposite-direction ticker (right→left) */}
      <div className="ticker mt-2 w-full overflow-hidden rounded-md border bg-white">
        <div className="ticker__move whitespace-nowrap py-2 text-sm sm:text-base">
          {SLIDES.map((s, i) => (
            <span key={i} className="mx-6 inline-block text-[--color-brand-700]">
              <strong>{s.title}:</strong> {s.blurb}
            </span>
          ))}
          {/* duplicate once for seamless loop */}
          {SLIDES.map((s, i) => (
            <span key={`dup-${i}`} className="mx-6 inline-block text-[--color-brand-700]">
              <strong>{s.title}:</strong> {s.blurb}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
