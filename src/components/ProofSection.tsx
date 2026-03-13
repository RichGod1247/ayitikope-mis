//src/components/ProofSection.tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

const proofCards = [
  {
    eyebrow: "Operational Proof",
    title: "Built around real school workflows, not brochure templates.",
    body:
      "EduLife OS already reflects actual school operations: lesson notes, approvals, attendance, health capture, assessment flow, role-gated portals, and controlled parent visibility.",
  },
  {
    eyebrow: "Security + Discipline",
    title: "Role-scoped access and school-level control are part of the foundation.",
    body:
      "This is not a public website pretending to be a system. EduLife OS is being built with tenant boundaries, role discipline, approval control, and parent-facing release rules.",
  },
  {
    eyebrow: "Local Reality",
    title: "Designed for Ghanaian basic school conditions, not imported software fantasy.",
    body:
      "NaCCA alignment, teacher-headteacher workflow, parent simplicity, SMS-aware thinking, and practical school structure are part of the product direction.",
  },
];

const evidencePills = [
  "Teacher workflow engine",
  "Headteacher approval pipeline",
  "Attendance + health linkage",
  "Parent trust + result release",
  "Role-based access control",
  "Built for basic schools",
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

export default function ProofSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-[#05070B] py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Proof of Seriousness
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            Built for schools that value trust, clarity, and disciplined execution.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            EduLife OS is designed around the real operating needs of basic schools —
            teaching quality, leadership oversight, parent confidence, and day-to-day school discipline —
            all brought together in one structured platform built for dependable growth.
          </p>
        </motion.div>

        {/* Mobile: horizontal snap */}
        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:hidden no-scrollbar">
          {proofCards.map((card, idx) => (
            <motion.div
              key={card.title}
              {...fadeUp(0.05 * idx)}
              className="min-w-[85%] snap-start rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#E8C96A]">
                {card.eyebrow}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-[#F7F4ED]">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Desktop */}
        <div className="mt-12 hidden gap-6 lg:grid lg:grid-cols-3">
          {proofCards.map((card, idx) => (
            <motion.div
              key={card.title}
              {...fadeUp(0.08 + idx * 0.06)}
              whileHover={reduceMotion ? {} : { y: -5 }}
              className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            >
              <div className="text-xs uppercase tracking-[0.16em] text-[#E8C96A]">
                {card.eyebrow}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[#F7F4ED]">
                {card.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...fadeUp(0.12)}
          className="mt-8 rounded-[24px] border border-white/10 bg-[#07111F] p-5 sm:mt-10 sm:rounded-[30px] sm:p-6"
        >
          <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
            Core Product Signals
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 no-scrollbar sm:flex-wrap">
            {evidencePills.map((item, idx) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.04 * idx }}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#D8DDE7]"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}