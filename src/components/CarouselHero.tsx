// src/components/CarouselHero.tsx
"use client";

import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

// ----- STATIC IMPORTS (these must exist on disk) -----
import heroCampus from "@/public/gallery/hero-campus.png";
import gatewayArch from "@/public/gallery/gateway-arch.png";
import kgLearning from "@/public/gallery/kg-learning.png";
import jhsClassroom from "@/public/gallery/jhs-classroom.png";
import ictLab from "@/public/gallery/ict-lab.png";
import awards from "@/public/gallery/awards.png";
import adminBlock from "@/public/gallery/admin-block.png";
// -----------------------------------------------------

type Slide = {
  src: StaticImageData;
  kicker: string;
  title: string;
  text: string;
  ctaText: string;
  ctaHref: string;
};

const SLIDES: Slide[] = [
  {
    src: heroCampus,
    kicker: "Welcome to",
    title: "Ayitikope M/A Basic School",
    text: "Discipline • Determination • Diligence",
    ctaText: "Explore Our School",
    ctaHref: "/about",
  },
  {
    src: gatewayArch,
    kicker: "Campus Entrance",
    title: "A Warm, Proud Community",
    text: "Rooted in Ghanaian culture, focused on global excellence.",
    ctaText: "See Gallery",
    ctaHref: "/gallery",
  },
  {
    src: kgLearning,
    kicker: "Kindergarten",
    title: "Early Years that Inspire",
    text: "Play-based learning that nurtures curiosity and confidence.",
    ctaText: "Admissions (KG)",
    ctaHref: "/admissions",
  },
  {
    src: jhsClassroom,
    kicker: "Smart Classrooms",
    title: "Future-Ready Learning",
    text: "Modern pedagogy, caring teachers, and strong values.",
    ctaText: "Our Vision",
    ctaHref: "/about",
  },
  {
    src: ictLab,
    kicker: "ICT Lab",
    title: "Technology that Empowers",
    text: "Digital skills for today’s world and tomorrow’s opportunities.",
    ctaText: "See Facilities",
    ctaHref: "/gallery",
  },
  {
    src: awards,
    kicker: "Achievement",
    title: "Excellence Recognized",
    text: "Celebrating milestones as we build brighter futures.",
    ctaText: "News & Updates",
    ctaHref: "/",
  },
  {
    src: adminBlock,
    kicker: "Leadership",
    title: "Steadfast Stewardship",
    text: "A school culture built on character and service.",
    ctaText: "Meet Us",
    ctaHref: "/about",
  },
];

export default function CarouselHero() {
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  const go = (n: number) => setIdx((n + SLIDES.length) % SLIDES.length);
  const next = () => go(idx + 1);
  const prev = () => go(idx - 1);

  const slide = SLIDES[idx];

  return (
    <section className="relative h-[64vh] md:h-[72vh] overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        {/* fallback tint so it's never just white */}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0a55c3_0%,#0a55c3_40%,#1c84ff_100%)] opacity-20" />
        <Image
          key={slide.title}
          src={slide.src}
          alt={slide.title}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/10" />
      </div>

      {/* Caption */}
      <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-6">
        <div className="w-full sm:max-w-2xl text-white">
          <div
            key={`k-${idx}-${mounted}`}
            className="mb-2 inline-block translate-x-4 animate-[fadeInSlide_.9s_ease-out_forwards] rounded bg-white/10 px-3 py-1 text-sm tracking-wide backdrop-blur"
          >
            {slide.kicker}
          </div>

          <h1
            key={`t-${idx}-${mounted}`}
            className="mb-2 translate-x-4 animate-[fadeInSlide_1.1s_ease-out_.08s_forwards] text-3xl font-extrabold sm:text-5xl"
          >
            {slide.title}
          </h1>

          <p
            key={`p-${idx}-${mounted}`}
            className="mb-6 max-w-xl translate-x-4 animate-[fadeInSlide_1.1s_ease-out_.15s_forwards] text-base text-blue-50 sm:text-lg"
          >
            {slide.text}
          </p>

          <div
            key={`c-${idx}-${mounted}`}
            className="translate-x-4 animate-[fadeInSlide_1s_ease-out_.22s_forwards]"
          >
            <Link
              href={slide.ctaHref}
              className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-700"
            >
              {slide.ctaText}
            </Link>
          </div>
        </div>
      </div>

      {/* Controls */}
      <button
        aria-label="Previous slide"
        onClick={prev}
        className="group absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur transition hover:bg-black/55"
      >
        ‹
      </button>
      <button
        aria-label="Next slide"
        onClick={next}
        className="group absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur transition hover:bg-black/55"
      >
        ›
      </button>

      {/* Dots */}
      <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={[
              "h-1.5 w-6 rounded-full border border-white/40 transition",
              i === idx ? "bg-white/90" : "bg-white/30",
            ].join(" ")}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes fadeInSlide {
          from {
            opacity: 0;
            transform: translateX(1rem);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </section>
  );
}
