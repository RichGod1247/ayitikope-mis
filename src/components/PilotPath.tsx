//src/components/PilotPath.tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Map the school structure",
    text:
      "Define roles, classes, streams, staff access, and the operational shape of the school before rollout begins.",
  },
  {
    num: "02",
    title: "Activate the core workflows",
    text:
      "Start with the highest-trust loops first: teaching flow, leadership oversight, attendance discipline, and parent visibility.",
  },
  {
    num: "03",
    title: "Pilot, refine, and expand",
    text:
      "Deploy carefully, gather operational feedback, strengthen adoption, then expand module depth with confidence.",
  },
];

const fitItems = [
  "Best for basic schools seeking stronger execution",
  "Useful where parent trust and school discipline matter",
  "Designed for practical rollout, not software theatre",
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.16 },
    transition: {
      duration: 0.95,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}

export default function PilotPath() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-[#05070B] py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Deployment Path
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            Adoption becomes easier when the rollout path is clear.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            School leaders do not only need a beautiful platform. They need to understand
            how it enters the institution, where it starts, and how it creates practical order.
          </p>
        </motion.div>

        {/* Mobile */}
        <div className="mt-8 flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:hidden">
          {steps.map((step, idx) => (
            <motion.div
              key={step.num}
              {...fadeUp(0.05 * idx)}
              className="min-w-[85%] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-5"
            >
              <div className="text-sm font-semibold text-[#E8C96A]">{step.num}</div>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">{step.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Desktop */}
        <div className="mt-12 hidden gap-6 lg:grid lg:grid-cols-3">
          {steps.map((step, idx) => (
            <motion.div
              key={step.num}
              {...fadeUp(0.08 + idx * 0.06)}
              whileHover={reduceMotion ? {} : { y: -4 }}
              className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-6"
            >
              <div className="text-sm font-semibold text-[#E8C96A]">{step.num}</div>
              <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">{step.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...fadeUp(0.12)}
          className="mt-8 rounded-[24px] border border-[#E8C96A]/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.12),rgba(11,61,145,0.10),rgba(5,7,11,0.92))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.30)] sm:mt-10 sm:rounded-[32px] sm:p-8"
        >
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                Pilot Readiness
              </div>
              <h3 className="mt-4 text-2xl font-semibold sm:text-4xl">
                Start with a pilot. Prove value. Expand with confidence.
              </h3>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#D9DEE8] sm:text-base sm:leading-8">
                The strongest adoption path is not a noisy launch. It is a disciplined pilot
                with clear workflows, visible wins, leadership buy-in, and parent-facing trust.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/contact?intent=pilot"
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3 text-sm font-semibold text-[#071A3D]"
                >
                  Request a Pilot
                </Link>
                <Link
                  href="/contact?intent=demo"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-medium text-[#F7F4ED]"
                >
                  Book a School Demo
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              {fitItems.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-[#E5E8EF]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}