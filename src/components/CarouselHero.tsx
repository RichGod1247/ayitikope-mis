"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Slide = { src: string; caption: string };

const SLIDES: Slide[] = [
  { src: "/gallery/hero-campus.png", caption: "Welcome to Ayitikope M/A Basic School" },
  { src: "/gallery/gateway-arch.png", caption: "Our new gateway concept — welcoming and proud" },
  { src: "/gallery/kg-learning.png", caption: "KG learning through play" },
  { src: "/gallery/jhs-classroom.png", caption: "Smart JHS classroom — a vision of excellence" },
  { src: "/gallery/ict-lab.png", caption: "Growing ICT laboratory for digital skills" },
  { src: "/gallery/awards.png", caption: "Award of Excellence — community and hard work" },
];

export default function CarouselHero() {
  const [i, setI] = useState(0);

  // autoslide every 5.5s
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative w-full h-[62vh] md:h-[80vh] overflow-hidden">
      {/* image layer */}
      {SLIDES.map((s, idx) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.caption}
          className={[
            "absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700",
            idx === i ? "opacity-100" : "opacity-0",
          ].join(" ")}
          loading={idx === 0 ? "eager" : "lazy"}
        />
      ))}

      {/* dark gradient for readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-black/50" />

      {/* captions & CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-white text-3xl sm:text-5xl font-bold drop-shadow-md">
          {SLIDES[i].caption}
        </h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          “Knowledge, Character, Service.”
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/about"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-semibold shadow"
          >
            Learn More
          </Link>
          <Link
            href="/contact"
            className="rounded-lg bg-white/90 hover:bg-white text-blue-700 px-6 py-3 font-semibold shadow"
          >
            Contact Us
          </Link>
        </div>
      </div>

      {/* ticker (slower) */}
      <div className="absolute bottom-0 inset-x-0 bg-black/40 text-blue-100">
        <div className="w-full overflow-hidden">
          <div
            className="whitespace-nowrap py-2 will-change-transform"
            style={{
              animation: "ayiti-marquee 16s linear infinite",
            }}
          >
            {SLIDES.map((s) => s.caption).join(" • ")} • {SLIDES[0].caption}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes ayiti-marquee {
          from {
            transform: translateX(0%);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
